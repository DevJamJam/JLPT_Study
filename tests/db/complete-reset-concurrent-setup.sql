insert into public.study_groups(id,name) values ('62000000-0000-4000-8000-000000000001','동시 PIN 변경 검사');
insert into public.users(id,nickname,nickname_key,emoji) values ('62000000-0000-4000-8000-000000000002','동시변경','동시변경','🐰');
insert into public.user_credentials(user_id,pin_hash,salt,hash_params,must_change_pin)
  values ('62000000-0000-4000-8000-000000000002',repeat('a',64),'AAAAAAAAAAAAAAAAAAAAAA==',
    '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb,true);
insert into public.group_members(group_id,user_id) values ('62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002');
select public.create_user_session('62000000-0000-4000-8000-000000000002',1,repeat('61',32));
