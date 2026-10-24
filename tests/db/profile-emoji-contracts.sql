begin;
create function pg_temp.emoji_assert(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end;
$$;
create function pg_temp.emoji_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm=expected then return; end if; raise; end;
  raise exception 'Expected: %',expected;
end;
$$;
insert into public.study_groups(id,name) values ('66000000-0000-4000-8000-000000000001','이모지 검사');
select public.complete_join('66000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000002',repeat('a',64),'이모지검사','이모지검사','🐰',repeat('a',64),
  'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
select public.complete_join('66000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000003',repeat('b',64),'다른이모지','다른이모지','🐻',repeat('b',64),
  'AAAAAAAAAAAAAAAAAAAAAA==','{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb);
select pg_temp.emoji_assert(not has_function_privilege('anon','public.update_profile_emoji(text,text)','execute'),'anon denied');
select pg_temp.emoji_assert(not has_function_privilege('authenticated','public.update_profile_emoji(text,text)','execute'),'authenticated denied');
set local role service_role;
select public.create_user_session((select id from public.users where nickname_key='이모지검사'),1,repeat('a',64));
select public.create_user_session((select id from public.users where nickname_key='이모지검사'),1,repeat('b',64));
select public.create_user_session((select id from public.users where nickname_key='이모지검사'),1,repeat('c',64));
update public.sessions set expires_at=now()-interval '1 second' where token_hash=repeat('b',64);
update public.sessions set credential_version=99 where token_hash=repeat('c',64);
select pg_temp.emoji_error($q$select public.update_profile_emoji(repeat('0',64),'🐱')$q$,'UNAUTHORIZED');
select pg_temp.emoji_error($q$select public.update_profile_emoji(repeat('b',64),'🐱')$q$,'UNAUTHORIZED');
select pg_temp.emoji_error($q$select public.update_profile_emoji(repeat('c',64),'🐱')$q$,'UNAUTHORIZED');
select pg_temp.emoji_error($q$select public.update_profile_emoji(repeat('a',64),'🦄')$q$,'VALIDATION_ERROR');
select pg_temp.emoji_error($q$select public.update_profile_emoji(repeat('a',64),null)$q$,'VALIDATION_ERROR');
select pg_temp.emoji_assert((select emoji='🐰' from public.users where nickname_key='이모지검사'),'failed request unchanged');
select pg_temp.emoji_assert((select user_id=(select id from public.users where nickname_key='이모지검사') and nickname='이모지검사' and emoji='🐱' and not must_change_pin from public.update_profile_emoji(repeat('a',64),'🐱')),'public profile');
select public.update_profile_emoji(repeat('a',64),'🐱');
select pg_temp.emoji_assert((select emoji='🐱' from public.resolve_user_session(repeat('a',64))),'session reads latest emoji');
select pg_temp.emoji_assert((select credential_version=1 and not must_change_pin from public.user_credentials where user_id=(select id from public.users where nickname_key='이모지검사')),'credential unchanged');
select pg_temp.emoji_assert((select expires_at-created_at=interval '720 hours' from public.sessions where token_hash=repeat('a',64)),'expiry unchanged');
select pg_temp.emoji_assert((select emoji='🐻' from public.users where nickname_key='다른이모지'),'other user unchanged');
update public.user_credentials set must_change_pin=true where user_id=(select id from public.users where nickname_key='다른이모지');
select public.create_user_session((select id from public.users where nickname_key='다른이모지'),1,repeat('d',64));
select pg_temp.emoji_error($q$select public.update_profile_emoji(repeat('d',64),'🐱')$q$,'PIN_CHANGE_REQUIRED');
delete from public.group_members where user_id=(select id from public.users where nickname_key='이모지검사');
select pg_temp.emoji_error($q$select public.update_profile_emoji(repeat('a',64),'🐶')$q$,'UNAUTHORIZED');
rollback;
