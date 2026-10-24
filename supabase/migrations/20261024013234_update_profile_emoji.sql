begin;

create function public.update_profile_emoji(p_token_hash text, p_emoji text)
returns table (user_id uuid, nickname text, emoji text, must_change_pin boolean)
language plpgsql security invoker set search_path = ''
as $$
declare target_user uuid; target_group uuid; validated record;
begin
  select s.user_id,m.group_id into target_user,target_group
    from public.sessions s join public.group_members m on m.user_id=s.user_id
    where s.token_hash=p_token_hash;
  if not found then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  perform 1 from public.study_groups where id=target_group for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  perform 1 from public.group_members m where m.group_id=target_group and m.user_id=target_user for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  perform 1 from public.user_credentials c where c.user_id=target_user for update;
  perform 1 from public.sessions s where s.token_hash=p_token_hash for update;
  select * into validated from public.resolve_user_session(p_token_hash,false);
  -- 선택지의 최종 제약은 기존 users.emoji CHECK를 공유한다.
  if p_emoji is null then raise exception 'VALIDATION_ERROR' using errcode='P0001'; end if;
  begin
    return query update public.users u set emoji=p_emoji where u.id=validated.user_id
      returning u.id,u.nickname,u.emoji,false;
  exception when check_violation then
    raise exception 'VALIDATION_ERROR' using errcode='P0001';
  end;
end;
$$;
revoke all on function public.update_profile_emoji(text,text) from public, anon, authenticated;
grant execute on function public.update_profile_emoji(text,text) to service_role;

commit;
