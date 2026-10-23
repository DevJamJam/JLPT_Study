set application_name = 'jlpt_lock_test';
begin;
set local role service_role;
do $$
begin
  if not (public.complete_join_result('52000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000002',repeat('a',64),'동시재시도','동시재시도','🐰',
    repeat('d',64),'AAAAAAAAAAAAAAAAAAAAAA==',
    '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb)->>'created')::boolean then
    raise exception 'FIRST_MUST_CREATE';
  end if;
end;
$$;
select pg_sleep(3);
commit;
