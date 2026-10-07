create function pg_temp.auth_assert(value boolean, label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
end;
$$;
create function pg_temp.auth_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected in sqlerrm) > 0 or sqlstate = expected then return; end if;
    raise;
  end;
  raise exception 'Expected: %', expected;
end;
$$;

insert into public.study_groups (id,name) values ('40000000-0000-0000-0000-000000000001','가입 테스트');
create function pg_temp.join_user(
  request_id uuid, nickname text, name_key text, fingerprint text default repeat('a',64)
) returns uuid language sql as $$
  select public.complete_join('40000000-0000-0000-0000-000000000001', request_id,
    fingerprint, nickname, name_key, '🐰', repeat('d',64), 'AAAAAAAAAAAAAAAAAAAAAA==',
    '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
$$;

select pg_temp.auth_assert(not has_function_privilege('anon',
  'public.complete_join(uuid,uuid,text,text,text,text,text,text,jsonb)', 'EXECUTE'), 'anon join denied');
select pg_temp.auth_assert(not has_function_privilege('authenticated',
  'public.create_user_session(uuid,integer,text)', 'EXECUTE'), 'browser session creation denied');
set role service_role;
select pg_temp.join_user('41000000-0000-0000-0000-000000000001','  CaT  ','cat');
select pg_temp.auth_assert((select nickname = 'CaT' and nickname_key = 'cat' from public.users where nickname_key = 'cat'), 'normalized nickname and server canonical key');
select pg_temp.auth_assert((select user_id from public.signup_requests where request_id = '41000000-0000-0000-0000-000000000001') =
  pg_temp.join_user('41000000-0000-0000-0000-000000000001','CaT','cat'), 'join retry same user');
select pg_temp.auth_error($q$select pg_temp.join_user('41000000-0000-0000-0000-000000000001','CaT','cat',repeat('b',64))$q$, 'IDEMPOTENCY_CONFLICT');
select pg_temp.auth_error($q$select pg_temp.join_user('41000000-0000-0000-0000-000000000002','CAT','cat')$q$, 'NICKNAME_TAKEN');
select pg_temp.auth_assert((select count(*) = 1 from public.group_members where group_id = '40000000-0000-0000-0000-000000000001'), 'no partial duplicate join');

select public.create_user_session((select id from public.users where nickname_key = 'cat'), 1, repeat('1',64));
select pg_temp.auth_assert((select expires_at - created_at = interval '720 hours' and mode = 'normal' from public.sessions where token_hash = repeat('1',64)), 'fixed 30 day normal session');
select pg_temp.auth_assert((select nickname = 'CaT' from public.resolve_user_session(repeat('1',64))), 'normal session resolves');
update public.user_credentials set credential_version = 2 where user_id = (select id from public.users where nickname_key = 'cat');
select pg_temp.auth_error($q$select public.create_user_session((select id from public.users where nickname_key = 'cat'),1,repeat('2',64))$q$, 'UNAUTHORIZED');
select pg_temp.auth_error($q$select * from public.resolve_user_session(repeat('1',64))$q$, 'UNAUTHORIZED');
select public.create_user_session((select id from public.users where nickname_key = 'cat'),2,repeat('2',64));
update public.user_credentials set must_change_pin = true, credential_version = 3 where user_id = (select id from public.users where nickname_key = 'cat');
select pg_temp.auth_error($q$select * from public.resolve_user_session(repeat('2',64))$q$, 'UNAUTHORIZED');
select public.create_user_session((select id from public.users where nickname_key = 'cat'),3,repeat('3',64));
select pg_temp.auth_assert((select expires_at - created_at = interval '15 minutes' and mode = 'change_pin' from public.sessions where token_hash = repeat('3',64)), 'fixed limited session');
select pg_temp.auth_error($q$select * from public.resolve_user_session(repeat('3',64))$q$, 'PIN_CHANGE_REQUIRED');
select pg_temp.auth_assert((select must_change_pin from public.resolve_user_session(repeat('3',64),true)), 'limited auth/me path allowed');
-- 가입 재시도가 자격증명 변경 후 도착해도 자격증명을 되돌리지 않는다.
select pg_temp.join_user('41000000-0000-0000-0000-000000000001','CaT','cat');
select pg_temp.auth_assert((select credential_version = 3 and must_change_pin from public.user_credentials where user_id = (select id from public.users where nickname_key = 'cat')), 'join retry preserves changed credential');
select public.create_user_session((select id from public.users where nickname_key = 'cat'),3,repeat('4',64));
select public.revoke_user_session(repeat('3',64));
select pg_temp.auth_assert(not exists (select 1 from public.sessions where token_hash = repeat('3',64)) and exists (select 1 from public.sessions where token_hash = repeat('4',64)), 'logout removes current session only');
select public.revoke_user_session(repeat('3',64));
update public.sessions set expires_at = now() - interval '1 second' where token_hash = repeat('4',64);
select pg_temp.auth_error($q$select * from public.resolve_user_session(repeat('4',64),true)$q$, 'UNAUTHORIZED');
update public.sessions set expires_at = now() + interval '1 hour' where token_hash = repeat('4',64);
delete from public.group_members where user_id = (select id from public.users where nickname_key = 'cat');
select pg_temp.auth_error($q$select * from public.resolve_user_session(repeat('4',64),true)$q$, 'UNAUTHORIZED');
delete from public.users where nickname_key = 'cat';
select pg_temp.auth_assert(not exists(select 1 from public.sessions where token_hash in (repeat('1',64),repeat('2',64),repeat('4',64))), 'deleted account sessions removed');
select pg_temp.auth_error($q$select * from public.resolve_user_session(repeat('4',64),true)$q$, 'UNAUTHORIZED');

-- DB와 JS의 대소문자 처리 차이를 피하고 서버 정규화 키를 그대로 저장한다.
select pg_temp.join_user('41000000-0000-0000-0000-000000000003','İX',U&'i\0307x');
select pg_temp.auth_assert(exists(select 1 from public.users where nickname_key = U&'i\0307x'), 'Unicode server canonical key preserved');
delete from public.users where nickname_key = U&'i\0307x';

do $$
begin
  for i in 1..14 loop
    perform pg_temp.join_user(('42000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid, '회원' || i, '회원' || i);
  end loop;
end;
$$;
reset role;
select 'PASS: join retries, credential version, expiry, limited sessions, logout, deletion';
