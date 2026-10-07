begin;

-- 반환은 사용자 ID뿐이다. PIN·salt·해시·세션을 공개 DTO에 넣지 않는다.
create function public.complete_join(
  p_group_id uuid, p_request_id uuid, p_fingerprint text,
  p_nickname text, p_nickname_key text, p_emoji text, p_pin_hash text, p_salt text, p_hash_params jsonb
) returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  normalized_name text := normalize(btrim(p_nickname,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), NFC);
  existing public.signup_requests;
  member_limit integer;
  new_user_id uuid;
begin
  select max_members into member_limit from public.study_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_request_id is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  select * into existing from public.signup_requests where request_id = p_request_id;
  if found then
    if existing.request_fingerprint is distinct from p_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = existing.user_id) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    -- 같은 요청 재시도는 신규 credential을 덮어쓰거나 세션을 발급하지 않는다.
    return existing.user_id;
  end if;
  if normalized_name is null or char_length(normalized_name) not between 2 and 12
    or normalized_name ~ '[[:cntrl:]]'
    or p_nickname_key is null or char_length(p_nickname_key) not between 2 and 24
    or p_emoji is null or p_emoji not in (
      '🐰','🐱','🐶','🐻','🐼','🐨','🦊','🐯','🦁','🐵',
      '🐸','🐙','🐳','🐬','🐧','🐢','🐟','🐥','🌸','⭐'
    )
    or p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$'
    or p_salt is null or p_salt !~ '^[A-Za-z0-9+/]{22}==$'
    or p_hash_params is distinct from '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.users where nickname_key = p_nickname_key) then
    raise exception 'NICKNAME_TAKEN' using errcode = 'P0001';
  end if;
  if (select count(*) from public.group_members where group_id = p_group_id) >= member_limit then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;
  insert into public.users (nickname, nickname_key, emoji)
    values (normalized_name, p_nickname_key, p_emoji) returning id into new_user_id;
  insert into public.user_credentials (user_id, pin_hash, salt, hash_params)
    values (new_user_id, p_pin_hash, p_salt, p_hash_params);
  insert into public.group_members (group_id, user_id) values (p_group_id, new_user_id);
  insert into public.signup_requests (request_id, user_id, request_fingerprint)
    values (p_request_id, new_user_id, p_fingerprint);
  return new_user_id;
end;
$$;

-- 서버가 PIN을 검증한 뒤 호출한다. 이 함수 자체는 PIN을 검증하지 않는다.
create function public.create_user_session(
  p_user_id uuid, p_expected_credential_version integer, p_token_hash text
) returns public.sessions
language plpgsql security invoker
set search_path = ''
as $$
declare
  credentials public.user_credentials;
  result_row public.sessions;
  v_group_id uuid;
  session_mode text;
  issued_at timestamptz := clock_timestamp();
begin
  select m.group_id into v_group_id from public.group_members m where m.user_id = p_user_id;
  perform 1 from public.study_groups where id = v_group_id for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  perform 1 from public.group_members m where m.group_id = v_group_id and m.user_id = p_user_id for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  select * into credentials from public.user_credentials where user_id = p_user_id for update;
  if not found or credentials.credential_version is distinct from p_expected_credential_version then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  session_mode := case when credentials.must_change_pin then 'change_pin' else 'normal' end;
  -- 고정 시간 간격을 사용해 DB 시간대·일광 절약 시간에 의존하지 않는다.
  insert into public.sessions (token_hash, user_id, credential_version, mode, created_at, expires_at)
    values (p_token_hash, p_user_id, credentials.credential_version, session_mode, issued_at,
      issued_at + case when session_mode = 'normal' then interval '720 hours' else interval '15 minutes' end)
    returning * into result_row;
  return result_row;
end;
$$;

create function public.resolve_user_session(p_token_hash text, p_allow_change_pin boolean default false)
returns table (user_id uuid, group_id uuid, nickname text, emoji text, must_change_pin boolean, expires_at timestamptz)
language plpgsql security invoker
set search_path = ''
as $$
declare validated record;
begin
  select s.user_id, m.group_id, u.nickname, u.emoji, c.must_change_pin, s.expires_at, s.mode
    into validated from public.sessions s
    join public.user_credentials c on c.user_id = s.user_id
    join public.group_members m on m.user_id = s.user_id
    join public.users u on u.id = s.user_id
    where s.token_hash = p_token_hash and s.expires_at > clock_timestamp()
      and s.credential_version = c.credential_version
      and ((s.mode = 'normal' and not c.must_change_pin) or (s.mode = 'change_pin' and c.must_change_pin));
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  if validated.mode = 'change_pin' and p_allow_change_pin is distinct from true then
    raise exception 'PIN_CHANGE_REQUIRED' using errcode = 'P0001';
  end if;
  return query select validated.user_id, validated.group_id, validated.nickname,
    validated.emoji, validated.must_change_pin, validated.expires_at;
end;
$$;

create function public.revoke_user_session(p_token_hash text) returns boolean
language sql security invoker
set search_path = ''
as $$
  with deleted as (delete from public.sessions where token_hash = p_token_hash returning token_hash)
  select true;
$$;

revoke all on function public.complete_join(uuid,uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.create_user_session(uuid,integer,text) from public, anon, authenticated;
revoke all on function public.resolve_user_session(text,boolean) from public, anon, authenticated;
revoke all on function public.revoke_user_session(text) from public, anon, authenticated;
grant execute on function public.complete_join(uuid,uuid,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.create_user_session(uuid,integer,text) to service_role;
grant execute on function public.resolve_user_session(text,boolean) to service_role;
grant execute on function public.revoke_user_session(text) to service_role;

commit;
