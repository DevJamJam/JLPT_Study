set application_name = 'jlpt_lock_test';
begin;
set local role service_role;
select public.change_user_pin(repeat('71',32),1,repeat('f',64),'AAAAAAAAAAAAAAAAAAAAAA==',
  '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb,repeat('72',32));
select pg_sleep(3);
commit;
