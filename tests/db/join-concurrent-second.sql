set role service_role;
select public.complete_join('40000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000002',repeat('c',64),'동시가입2','동시가입2','🐱',
  repeat('d',64),'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
