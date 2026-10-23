begin;

-- 서버에서 새 PIN을 검증·해시한 뒤 호출한다. 요청 body의 사용자 ID는 받지 않는다.
create function public.complete_pin_reset(
  p_token_hash text, p_expected_credential_version integer,
  p_pin_hash text, p_salt text, p_hash_params jsonb, p_new_token_hash text
) returns public.sessions
language plpgsql security invoker
set search_path = ''
as $$
declare
  target_user uuid;
  target_group uuid;
  credentials public.user_credentials;
  current_session public.sessions;
  result_row public.sessions;
begin
  select s.user_id, m.group_id into target_user, target_group
    from public.sessions s join public.group_members m on m.user_id = s.user_id
    where s.token_hash = p_token_hash;
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  perform 1 from public.study_groups where id = target_group for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  perform 1 from public.group_members where group_id = target_group and user_id = target_user for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  select * into credentials from public.user_credentials where user_id = target_user for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode = 'P0001'; end if;
  select * into current_session from public.sessions where token_hash = p_token_hash and user_id = target_user for update;
  if not found or current_session.expires_at <= clock_timestamp()
    or current_session.credential_version is distinct from credentials.credential_version
    or credentials.credential_version is distinct from p_expected_credential_version then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;
  if current_session.mode <> 'change_pin' or not credentials.must_change_pin then
    raise exception 'RESET_NOT_REQUIRED' using errcode = 'P0001';
  end if;
  if p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$'
    or p_salt is null or p_salt !~ '^[A-Za-z0-9+/]{22}==$'
    or p_hash_params is distinct from '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb
    or p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$'
    or p_new_token_hash = p_token_hash then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  update public.user_credentials set pin_hash = p_pin_hash, salt = p_salt, hash_params = p_hash_params,
    must_change_pin = false, credential_version = credential_version + 1 where user_id = target_user;
  delete from public.sessions where user_id = target_user;
  select * into result_row from public.create_user_session(target_user, credentials.credential_version + 1, p_new_token_hash);
  return result_row;
end;
$$;
revoke all on function public.complete_pin_reset(text,integer,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.complete_pin_reset(text,integer,text,text,jsonb,text) to service_role;

commit;
