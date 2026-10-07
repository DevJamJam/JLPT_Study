create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
end;
$$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected in sqlerrm) > 0 or sqlstate = expected then return; end if;
    raise;
  end;
  raise exception 'Expected error: %', expected;
end;
$$;

insert into public.study_groups (id, name) values ('00000000-0000-0000-0000-000000000001', '테스트');
insert into public.users (id, nickname, nickname_key, emoji) values
  ('00000000-0000-0000-0000-000000000002', '토끼', '토끼', '🐰'),
  ('00000000-0000-0000-0000-000000000003', '고양이', '고양이', '🐱'),
  ('00000000-0000-0000-0000-000000000004', '삭제대상', '삭제대상', '🐶');
insert into public.group_members (group_id, user_id)
  select '00000000-0000-0000-0000-000000000001', id from public.users;
insert into public.user_credentials (user_id, pin_hash, salt, hash_params)
  select id, 'TEST_HASH_ONLY', 'TEST_SALT_ONLY', '{}'::jsonb from public.users;
insert into public.sessions (token_hash, user_id, expires_at, credential_version)
  select id::text, id, now() + interval '1 hour', 1 from public.users;
insert into public.signup_requests (request_id, user_id, request_fingerprint)
  select id, id, repeat('a', 64) from public.users;

select pg_temp.assert_true((select count(*) = 7 from public.study_categories), '7 seed categories');
select pg_temp.assert_true((select count(*) = 15 and bool_and(relrowsecurity)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'), 'all tables RLS');
select pg_temp.assert_true(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and (
    has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  )), 'browser table privileges revoked');
select pg_temp.assert_true(not has_function_privilege('anon',
  'public.delete_record(uuid,uuid,uuid,integer)', 'EXECUTE'), 'anon RPC revoked');
select pg_temp.assert_true(not has_function_privilege('authenticated',
  'public.save_record(uuid,uuid,uuid,date,integer,uuid,time,integer,text,text,text,integer)', 'EXECUTE'), 'authenticated RPC revoked');
select pg_temp.assert_true(has_function_privilege('service_role',
  'public.delete_record(uuid,uuid,uuid,integer)', 'EXECUTE'), 'server RPC allowed');

set role anon;
select pg_temp.expect_error('select * from public.users', '42501');
select pg_temp.expect_error($q$select public.delete_record(null,null,null,null)$q$, '42501');
reset role;

-- 짧은 테스트 호출 도우미. 운영 마이그레이션에는 포함되지 않는다.
create function pg_temp.save(
  record_id uuid, minutes integer, version integer default null,
  fingerprint text default repeat('a', 64), actor uuid default '00000000-0000-0000-0000-000000000002',
  day date default (statement_timestamp() at time zone 'Asia/Seoul')::date,
  start_at time default null, amount integer default null, unit text default null,
  note text default null, category uuid default null
) returns public.study_records language sql as $$
  select public.save_record(actor, '00000000-0000-0000-0000-000000000001', record_id,
    day, minutes, coalesce(category, (select id from public.study_categories where seed_key = 'vocabulary')),
    start_at, amount, unit, note, fingerprint, version);
$$;

-- 실제 서버 역할로 실행하여 SECURITY INVOKER·RLS 우회 권한도 검사한다.
set role service_role;
select pg_temp.assert_true((pg_temp.save('10000000-0000-0000-0000-000000000001', 60)).version = 1, 'create');
select pg_temp.assert_true((select start_time is null from public.study_records limit 1), 'optional start time');
select pg_temp.assert_true((pg_temp.save('10000000-0000-0000-0000-000000000001', 90, 1)).version = 2, 'edit CAS');
select pg_temp.assert_true((pg_temp.save('10000000-0000-0000-0000-000000000001', 60)).minutes = 90, 'original retry returns edited value');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000001', 60, null, repeat('b',64))$q$, 'IDEMPOTENCY_CONFLICT');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000001', 120, 1)$q$, 'CONFLICT');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000001', 60, 2, repeat('a',64), '00000000-0000-0000-0000-000000000003')$q$, 'FORBIDDEN');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 0)$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1441)$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, day => (statement_timestamp() at time zone 'Asia/Seoul')::date + 1)$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, day => '1999-12-31')$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, start_at => '24:00')$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, start_at => '09:00:00.1')$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, amount => 5)$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, amount => 100000, unit => 'page')$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, note => repeat('🐰',501))$q$, 'VALIDATION_ERROR');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000002', 1, category => '99999999-0000-0000-0000-000000000000')$q$, 'VALIDATION_ERROR');
select pg_temp.assert_true((pg_temp.save('10000000-0000-0000-0000-000000000002', 1350, note => U&'\00A0\FEFF메모\000A')).memo = '메모', 'trim and exact daily limit');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000003', 1)$q$, 'DAILY_LIMIT_EXCEEDED');
select pg_temp.assert_true((pg_temp.save('10000000-0000-0000-0000-000000000001', 90, 2)).version = 3, 'same date excludes old minutes');
select pg_temp.save('10000000-0000-0000-0000-000000000003', 1440, day => '2024-02-29');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000001', 90, 3, day => '2024-02-29')$q$, 'DAILY_LIMIT_EXCEEDED');
select pg_temp.expect_error($q$select public.delete_record('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3)$q$, 'FORBIDDEN');
select pg_temp.expect_error($q$select public.delete_record('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',2)$q$, 'CONFLICT');
select public.delete_record('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3);
select pg_temp.assert_true((select record_id is null and deleted_at is not null from public.record_requests where id = '10000000-0000-0000-0000-000000000001'), 'deletion tombstone');
select pg_temp.expect_error($q$select pg_temp.save('10000000-0000-0000-0000-000000000001', 60)$q$, 'RECORD_DELETED');
select pg_temp.assert_true(public.delete_record('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3), 'delete retry succeeds');
select pg_temp.expect_error($q$select public.delete_record('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3)$q$, 'FORBIDDEN');

select pg_temp.save('20000000-0000-0000-0000-000000000001', 1420, actor => '00000000-0000-0000-0000-000000000003');
select pg_temp.save('30000000-0000-0000-0000-000000000001', 30, actor => '00000000-0000-0000-0000-000000000004');
delete from public.users where id = '00000000-0000-0000-0000-000000000004';
select pg_temp.assert_true(not exists (select 1 from public.study_records where user_id = '00000000-0000-0000-0000-000000000004')
  and not exists (select 1 from public.record_requests where user_id = '00000000-0000-0000-0000-000000000004')
  and not exists (select 1 from public.sessions where user_id = '00000000-0000-0000-0000-000000000004')
  and not exists (select 1 from public.user_credentials where user_id = '00000000-0000-0000-0000-000000000004')
  and not exists (select 1 from public.signup_requests where user_id = '00000000-0000-0000-0000-000000000004'), 'account cascade');
reset role;

insert into public.admin_accounts (login_id,password_hash,salt,hash_params) values ('test','TEST_HASH','TEST_SALT','{}');
select pg_temp.expect_error($q$insert into public.admin_accounts (login_id,password_hash,salt,hash_params) values ('second','TEST_HASH','TEST_SALT','{}')$q$, '23505');
select pg_temp.expect_error($q$delete from public.study_categories where seed_key = 'vocabulary'$q$, '23001');
select pg_temp.expect_error($q$insert into public.users (nickname,nickname_key,emoji) values ('토끼','토끼','🐰')$q$, '23505');
select pg_temp.expect_error($q$update public.study_records set quantity = 1, quantity_unit = null$q$, '23514');
select pg_temp.expect_error($q$update public.study_records set minutes = 0$q$, '23514');
select pg_temp.expect_error($q$update public.study_records set start_time = '24:00'$q$, '23514');
select pg_temp.expect_error($q$update public.study_records set memo = repeat('🐰',501)$q$, '23514');
select 'PASS: schema, roles, constraints, ownership, retries, version, deletion';
