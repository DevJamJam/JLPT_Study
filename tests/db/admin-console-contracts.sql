-- Isolated CI database only; fixtures and credential changes roll back.
begin;
create function pg_temp.admin_assert(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.admin_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end;
  raise exception 'Expected: %',expected;
end $$;
select pg_temp.admin_assert(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='study_categories' and column_name='seed_key'),'no legacy English identity');
select pg_temp.admin_assert(not has_function_privilege('anon','public.require_admin(text)','execute'),'anon denied');
select pg_temp.admin_assert(not has_function_privilege('authenticated','public.manage_category(text,text,uuid,text,text)','execute'),'browser role denied');
set local role service_role;
select public.create_admin_session((select id from public.admin_accounts),1,'68'||repeat('a',62));
select pg_temp.admin_assert((select expires_at > clock_timestamp()+interval '7 hours 59 minutes'
  and expires_at <= clock_timestamp()+interval '8 hours' from public.admin_sessions where token_hash='68'||repeat('a',62)),'eight hour expiry');
select pg_temp.admin_error($q$select public.require_admin(repeat('0',64))$q$,'UNAUTHORIZED');
select public.manage_category('68'||repeat('a',62),'create','68000000-0000-4000-8000-000000000001','관리검사',null);
select public.manage_category('68'||repeat('a',62),'create','68000000-0000-4000-8000-000000000001','관리검사',null);
select pg_temp.admin_assert((select count(*)=1 from public.study_categories where id='68000000-0000-4000-8000-000000000001'),'category retry');
select pg_temp.admin_error($q$select public.manage_category('68'||repeat('a',62),'create','68000000-0000-4000-8000-000000000002','관리검사',null)$q$,'CATEGORY_EXISTS');
select public.manage_category('68'||repeat('a',62),'update','68000000-0000-4000-8000-000000000001','작문','관리검사');
select pg_temp.admin_error($q$select public.manage_category('68'||repeat('a',62),'update','68000000-0000-4000-8000-000000000001','덮어쓰기','관리검사')$q$,'CONFLICT');
insert into public.study_groups(id,name) values('68000000-0000-4000-8000-000000000010','관리 검사');
insert into public.users(id,nickname,nickname_key,emoji) values('68000000-0000-4000-8000-000000000020','관리검사토끼','관리검사토끼','🐰');
insert into public.group_members(group_id,user_id) values('68000000-0000-4000-8000-000000000010','68000000-0000-4000-8000-000000000020');
insert into public.user_credentials(user_id,pin_hash,salt,hash_params) values('68000000-0000-4000-8000-000000000020',repeat('a',64),'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}');
select public.create_user_session('68000000-0000-4000-8000-000000000020',1,'68'||repeat('b',62));
insert into public.study_records(id,group_id,user_id,study_date,minutes,category_id,create_fingerprint)
  values('68000000-0000-4000-8000-000000000030','68000000-0000-4000-8000-000000000010','68000000-0000-4000-8000-000000000020','2026-10-01',5,'68000000-0000-4000-8000-000000000001',repeat('1',64));
select pg_temp.admin_error($q$select public.manage_category('68'||repeat('a',62),'delete','68000000-0000-4000-8000-000000000001',null,'작문')$q$,'CATEGORY_IN_USE');
-- Added categories retain their ID and record references after renaming.
select public.manage_category('68'||repeat('a',62),'update','68000000-0000-4000-8000-000000000001','작문연습','작문');
select pg_temp.admin_assert(exists(select 1 from public.study_records r join public.study_categories c on c.id=r.category_id where r.id='68000000-0000-4000-8000-000000000030' and c.id='68000000-0000-4000-8000-000000000001' and c.name='작문연습'),'added rename keeps record identity');
select public.manage_category('68'||repeat('a',62),'update','68000000-0000-4000-8000-000000000001','작문','작문연습');
-- Seeded categories use the same rename contract; existing referenced records remain attached.
create temporary table initial_category_identity as select id from public.study_categories where name='단어';
select public.manage_category('68'||repeat('a',62),'update',(select id from initial_category_identity),'어휘연습','단어');
select pg_temp.admin_assert(exists(select 1 from public.study_records r join public.study_categories c on c.id=r.category_id where c.id=(select id from initial_category_identity) and c.name='어휘연습'),'seeded rename keeps record identity');
select public.manage_category('68'||repeat('a',62),'update',(select id from initial_category_identity),'단어','어휘연습');
select pg_temp.admin_assert((public.list_admin_members('68'||repeat('a',62)))::text not like '%pin_hash%','member DTO excludes secret');
select public.reset_admin_member_pin('68'||repeat('a',62),'68000000-0000-4000-8000-000000000020',1,'68000000-0000-4000-8000-000000000040',repeat('2',64),repeat('3',64),'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}',repeat('4',64));
select public.reset_admin_member_pin('68'||repeat('a',62),'68000000-0000-4000-8000-000000000020',1,'68000000-0000-4000-8000-000000000040',repeat('2',64),repeat('5',64),'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}',repeat('4',64));
select pg_temp.admin_assert((select must_change_pin and credential_version=2 and pin_hash=repeat('3',64) from public.user_credentials where user_id='68000000-0000-4000-8000-000000000020'),'reset retry does not overwrite');
select pg_temp.admin_assert(not exists(select 1 from public.sessions where user_id='68000000-0000-4000-8000-000000000020'),'reset revokes sessions');
select public.create_user_session('68000000-0000-4000-8000-000000000020',2,'68'||repeat('c',62));
select pg_temp.admin_assert((select mode='change_pin' from public.sessions where token_hash='68'||repeat('c',62)),'reset enforces limited session');
select pg_temp.admin_error($q$select public.remove_admin_member('68'||repeat('a',62),'68000000-0000-4000-8000-000000000020',1)$q$,'CONFLICT');
select public.remove_admin_member('68'||repeat('a',62),'68000000-0000-4000-8000-000000000020',2);
select public.remove_admin_member('68'||repeat('a',62),'68000000-0000-4000-8000-000000000020',2);
select pg_temp.admin_assert(not exists(select 1 from public.users where id='68000000-0000-4000-8000-000000000020')
  and not exists(select 1 from public.study_records where user_id='68000000-0000-4000-8000-000000000020')
  and not exists(select 1 from public.sessions where user_id='68000000-0000-4000-8000-000000000020')
  and not exists(select 1 from public.admin_reset_requests where target_user_id='68000000-0000-4000-8000-000000000020'),'member cascade and retry');
select public.manage_category('68'||repeat('a',62),'delete','68000000-0000-4000-8000-000000000001',null,'작문');
select pg_temp.admin_error($q$insert into public.users(nickname,nickname_key,emoji) values('AdMiN','admin','🐰')$q$,'users_admin_name_reserved');
update public.admin_accounts set credential_version=2;
select pg_temp.admin_error($q$select public.require_admin('68'||repeat('a',62))$q$,'UNAUTHORIZED');
select public.revoke_admin_session('68'||repeat('a',62));
select 'PASS: admin sessions, roles, categories, reset replay, deletion, reserved name';
rollback;
