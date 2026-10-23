begin;
create function pg_temp.reset_assert(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end;
$$;
create function pg_temp.reset_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm = expected then return; end if; raise; end;
  raise exception 'Expected: %',expected;
end;
$$;
insert into public.study_groups(id,name) values ('61000000-0000-4000-8000-000000000001','PIN 변경 검사');
select public.complete_join('61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',repeat('a',64),'변경검사','변경검사','🐰',repeat('a',64),
  'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
select public.complete_join('61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000003',repeat('b',64),'다른검사','다른검사','🐱',repeat('b',64),
  'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
update public.user_credentials set must_change_pin=true where user_id=(select id from public.users where nickname_key='변경검사');
select pg_temp.reset_assert(not has_function_privilege('anon', 'public.complete_pin_reset(text,integer,text,text,jsonb,text)','execute'), 'anon denied');
select pg_temp.reset_assert(not has_function_privilege('authenticated', 'public.complete_pin_reset(text,integer,text,text,jsonb,text)','execute'), 'authenticated denied');
create function pg_temp.reset_call(token text, version integer default 1, new_token text default repeat('d',64)) returns public.sessions language sql as $$
  select public.complete_pin_reset(token,version,repeat('f',64),'AAAAAAAAAAAAAAAAAAAAAA==',
    '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb,new_token);
$$;
set local role service_role;
select public.create_user_session((select id from public.users where nickname_key='변경검사'),1,repeat('a',64));
select public.create_user_session((select id from public.users where nickname_key='변경검사'),1,repeat('b',64));
select public.create_user_session((select id from public.users where nickname_key='다른검사'),1,repeat('c',64));
select pg_temp.reset_error($q$select pg_temp.reset_call(repeat('c',64))$q$,'RESET_NOT_REQUIRED');
select pg_temp.reset_error($q$select pg_temp.reset_call(repeat('a',64),99)$q$,'UNAUTHORIZED');
-- 새 세션 충돌도 PIN·기존 세션 변경 전체를 되돌린다.
select pg_temp.reset_error($q$select pg_temp.reset_call(repeat('a',64),1,repeat('c',64))$q$,
  'duplicate key value violates unique constraint "sessions_pkey"');
select pg_temp.reset_assert((select credential_version=1 and must_change_pin from public.user_credentials where user_id=(select id from public.users where nickname_key='변경검사')), 'failed transaction preserves credential');
update public.sessions set expires_at=now()-interval '1 second' where token_hash=repeat('b',64);
select pg_temp.reset_error($q$select pg_temp.reset_call(repeat('b',64))$q$,'UNAUTHORIZED');
select pg_temp.reset_call(repeat('a',64));
select pg_temp.reset_assert((select credential_version=2 and not must_change_pin and pin_hash=repeat('f',64) from public.user_credentials where user_id=(select id from public.users where nickname_key='변경검사')), 'new credential and version');
select pg_temp.reset_assert(not exists(select 1 from public.sessions where token_hash in (repeat('a',64),repeat('b',64))), 'all previous sessions revoked');
select pg_temp.reset_assert((select mode='normal' and credential_version=2 and expires_at-created_at=interval '720 hours' from public.sessions where token_hash=repeat('d',64)), 'one normal fixed session');
select pg_temp.reset_assert((select not must_change_pin from public.resolve_user_session(repeat('d',64))), 'normal API access');
select pg_temp.reset_assert(exists(select 1 from public.sessions where token_hash=repeat('c',64)), 'other user unchanged');
select pg_temp.reset_error($q$select pg_temp.reset_call(repeat('a',64))$q$,'UNAUTHORIZED');
select pg_temp.reset_error($q$select pg_temp.reset_call(repeat('d',64),2)$q$,'RESET_NOT_REQUIRED');
rollback;
