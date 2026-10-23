begin;
create function pg_temp.result_assert(value boolean, label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
end;
$$;
create function pg_temp.result_join(fingerprint text default repeat('a',64)) returns jsonb language sql as $$
  select public.complete_join_result('51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000002', fingerprint, '결과검증', '결과검증', '🐰',
    repeat('d',64), 'AAAAAAAAAAAAAAAAAAAAAA==',
    '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
$$;
insert into public.study_groups(id,name) values ('51000000-0000-4000-8000-000000000001','가입 결과 검사');
select pg_temp.result_assert(not has_function_privilege('anon',
  'public.complete_join_result(uuid,uuid,text,text,text,text,text,text,jsonb)','execute'), 'anon denied');
select pg_temp.result_assert(not has_function_privilege('authenticated',
  'public.complete_join_result(uuid,uuid,text,text,text,text,text,text,jsonb)','execute'), 'authenticated denied');
set local role service_role;
select pg_temp.result_assert((pg_temp.result_join()->>'created')::boolean, 'first created');
select pg_temp.result_assert(not (pg_temp.result_join()->>'created')::boolean, 'retry not created');
select pg_temp.result_assert((pg_temp.result_join()->>'userId')::uuid =
  (select user_id from public.signup_requests where request_id='51000000-0000-4000-8000-000000000002'), 'same user');
do $$
begin
  begin
    perform pg_temp.result_join(repeat('b',64));
  exception when raise_exception then
    if sqlerrm = 'IDEMPOTENCY_CONFLICT' then return; end if;
    raise;
  end;
  raise exception 'expected conflict';
end;
$$;
select pg_temp.result_assert((select count(*)=1 from public.group_members where group_id='51000000-0000-4000-8000-000000000001'), 'one member');
rollback;
