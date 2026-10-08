-- 4개 pending 이후 두 연결이 마지막 1개 예산을 놓고 경합한다.
set role service_role;
select public.reserve_auth_attempt('login',repeat('1',64),repeat('2',64)) from generate_series(1,4);
reset role;
set application_name = 'jlpt_lock_test';
begin;
set local role service_role;
do $$
begin
  if not (public.reserve_auth_attempt('login',repeat('1',64),repeat('2',64))->>'allowed')::boolean then
    raise exception 'last reservation rejected';
  end if;
end $$;
select pg_sleep(3);
commit;
