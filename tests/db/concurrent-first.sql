set application_name = 'jlpt_lock_test';
begin;
set local role service_role;
select public.save_record(
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002', (statement_timestamp() at time zone 'Asia/Seoul')::date,
  20, (select id from public.study_categories where seed_key = 'vocabulary'),
  null, null, null, null, repeat('b', 64), null
);
select pg_sleep(3);
commit;
