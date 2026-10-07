set application_name = 'jlpt_lock_test';
begin;
set local role service_role;
select public.complete_join('40000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000001',repeat('b',64),'동시가입1','동시가입1','🐱',
  repeat('d',64),'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
select pg_sleep(3);
commit;
