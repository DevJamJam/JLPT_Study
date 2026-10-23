set role service_role;
select public.change_user_pin(repeat('71',32),1,repeat('e',64),'AAAAAAAAAAAAAAAAAAAAAA==',
  '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb,repeat('73',32));
