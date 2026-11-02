begin;

-- Custom server sessions: only service_role can execute these invoker functions.
create function public.require_admin(p_token_hash text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare actor uuid;
begin
  select a.id into actor from public.admin_accounts a
    join public.admin_sessions s on s.admin_id = a.id
    where s.token_hash = p_token_hash and s.expires_at > clock_timestamp()
      and s.credential_version = a.credential_version
    for share of a, s;
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  return actor;
end $$;

create function public.create_admin_session(p_admin_id uuid, p_version integer, p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.admin_accounts; expiry timestamptz := clock_timestamp() + interval '8 hours';
begin
  select * into a from public.admin_accounts where id = p_admin_id for update;
  if not found or a.credential_version is distinct from p_version then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  insert into public.admin_sessions(token_hash,admin_id,credential_version,expires_at)
    values(p_token_hash,a.id,a.credential_version,expiry);
  return jsonb_build_object('id',a.id,'loginId',a.login_id,'expiresAt',expiry);
end $$;

create function public.resolve_admin_session(p_token_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare actor uuid; result jsonb;
begin
  actor := public.require_admin(p_token_hash);
  select jsonb_build_object('id',a.id,'loginId',a.login_id,'expiresAt',s.expires_at)
    into result from public.admin_accounts a join public.admin_sessions s on s.admin_id=a.id
    where a.id=actor and s.token_hash=p_token_hash;
  return result;
end $$;

create function public.revoke_admin_session(p_token_hash text) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.admin_sessions where token_hash=p_token_hash;
  return true;
end $$;

create function public.manage_category(p_token_hash text, p_action text, p_id uuid, p_name text, p_expected_name text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.study_categories; result public.study_categories;
begin
  perform public.require_admin(p_token_hash);
  if p_action is null or p_action not in ('create','update','delete') or p_id is null then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  -- Serialize sort_order allocation and category renames/deletes. No client-provided ordering.
  lock table public.study_categories in share row exclusive mode;
  select * into existing from public.study_categories where id=p_id for update;
  if p_action='delete' and not found then return jsonb_build_object('deleted',true); end if;
  if p_action in ('update','delete') then
    if existing.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    if existing.name is distinct from p_expected_name then
      raise exception 'CONFLICT' using errcode = 'P0001';
    end if;
  end if;
  if p_action='delete' then
    delete from public.study_categories where id=p_id;
    return jsonb_build_object('deleted',true);
  end if;
  if p_name is null or char_length(p_name) not between 1 and 20 or p_name ~ '[[:cntrl:]]'
    or p_name is distinct from normalize(btrim(p_name), NFC) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if p_action='create' and existing.id is not null then
    if existing.name is distinct from p_name then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    result := existing;
  elsif p_action='create' then
    insert into public.study_categories(id,name,name_key,sort_order)
      values(p_id,p_name,lower(p_name),(select coalesce(max(sort_order),-1)+1 from public.study_categories))
      returning * into result;
  else
    update public.study_categories set name=p_name,name_key=lower(p_name) where id=p_id returning * into result;
  end if;
  return jsonb_build_object('id',result.id,'name',result.name);
exception
  when unique_violation then raise exception 'CATEGORY_EXISTS' using errcode = 'P0001';
  when foreign_key_violation then raise exception 'CATEGORY_IN_USE' using errcode = 'P0001';
end $$;

create function public.list_admin_members(p_token_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_admin(p_token_hash);
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'nickname',u.nickname,'emoji',u.emoji,
    'joinedAt',m.joined_at,'credentialVersion',c.credential_version) order by m.joined_at,u.id),'[]'::jsonb)
    into result from public.group_members m join public.users u on u.id=m.user_id
    join public.user_credentials c on c.user_id=u.id;
  return result;
end $$;

create function public.remove_admin_member(p_token_hash text,p_user_id uuid,p_expected_version integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare target_group uuid; v integer;
begin
  perform public.require_admin(p_token_hash);
  select group_id into target_group from public.group_members where user_id=p_user_id;
  if not found then
    if exists(select 1 from public.users where id=p_user_id) then
      raise exception 'CONFLICT' using errcode='P0001';
    end if;
    return true;
  end if;
  perform 1 from public.study_groups where id=target_group for update;
  perform 1 from public.group_members where user_id=p_user_id and group_id=target_group for update;
  if not found then return true; end if;
  select credential_version into v from public.user_credentials where user_id=p_user_id for update;
  if v is distinct from p_expected_version then raise exception 'CONFLICT' using errcode='P0001'; end if;
  delete from public.users where id=p_user_id;
  return true;
end $$;

create function public.reset_admin_member_pin(
  p_token_hash text,p_user_id uuid,p_expected_version integer,p_request_id uuid,
  p_fingerprint text,p_pin_hash text,p_salt text,p_hash_params jsonb,p_nickname_hmac text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare actor uuid; target_group uuid; c public.user_credentials; old public.admin_reset_requests;
begin
  actor := public.require_admin(p_token_hash);
  if p_request_id is null or p_expected_version is null or p_fingerprint is null
    or p_fingerprint !~ '^[0-9a-f]{64}$' or p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$'
    or p_salt is null or p_salt !~ '^[A-Za-z0-9+/]{22}==$' or p_nickname_hmac is null
    or p_nickname_hmac !~ '^[0-9a-f]{64}$'
    or p_hash_params is distinct from '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb then
    raise exception 'VALIDATION_ERROR' using errcode='P0001';
  end if;
  -- Keep auth-limit lock before group/credentials, matching normal PIN changes.
  perform 1 from public.auth_limits where key=p_nickname_hmac for update;
  select group_id into target_group from public.group_members where user_id=p_user_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  perform 1 from public.study_groups where id=target_group for update;
  perform 1 from public.group_members where user_id=p_user_id and group_id=target_group for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  select * into c from public.user_credentials where user_id=p_user_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  select * into old from public.admin_reset_requests where request_id=p_request_id;
  if found then
    if old.actor_admin_id is distinct from actor or old.target_user_id is distinct from p_user_id
      or old.fingerprint is distinct from p_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode='P0001';
    end if;
    return true;
  end if;
  if c.credential_version is distinct from p_expected_version then
    raise exception 'CONFLICT' using errcode='P0001';
  end if;
  update public.user_credentials set pin_hash=p_pin_hash,salt=p_salt,hash_params=p_hash_params,
    credential_version=credential_version+1,must_change_pin=true where user_id=p_user_id;
  delete from public.sessions where user_id=p_user_id;
  -- In-flight authentication reservations must not immediately relock the reset account.
  update public.auth_attempts set outcome='system_error' where nickname_hmac=p_nickname_hmac and outcome='pending';
  update public.auth_limits set failures=0,blocked_until=null,window_started_at=clock_timestamp() where key=p_nickname_hmac;
  insert into public.admin_reset_requests(request_id,actor_admin_id,target_user_id,fingerprint)
    values(p_request_id,actor,p_user_id,p_fingerprint);
  return true;
end $$;

-- ADMIN is reserved for administrator identity, including direct service-role inserts.
alter table public.users add constraint users_admin_name_reserved
  check (lower(normalize(btrim(nickname), NFC)) <> 'admin' and lower(nickname_key) <> 'admin') not valid;

do $$
declare signature text;
begin
  foreach signature in array array[
    'require_admin(text)','create_admin_session(uuid,integer,text)','resolve_admin_session(text)',
    'revoke_admin_session(text)','manage_category(text,text,uuid,text,text)','list_admin_members(text)',
    'remove_admin_member(text,uuid,integer)',
    'reset_admin_member_pin(text,uuid,integer,uuid,text,text,text,jsonb,text)'
  ] loop
    execute 'revoke all on function public.' || signature || ' from public,anon,authenticated';
    execute 'grant execute on function public.' || signature || ' to service_role';
  end loop;
end $$;

commit;
