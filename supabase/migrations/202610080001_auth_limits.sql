-- 호출자는 서버에서 namespace를 포함한 HMAC 키를 계산한다. 원문 IP/닉네임 저장 금지.
-- 잠금 순서는 항상 source_limits → auth_limits → auth_attempts.
create function public.settle_auth_attempts(p_key text, p_now timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare a record; l public.auth_limits%rowtype;
begin
  select * into l from public.auth_limits where key=p_key for update;
  if l.blocked_until is not null and l.blocked_until <= p_now then
    update public.auth_limits set failures=0, blocked_until=null, window_started_at=p_now where key=p_key;
  elsif l.blocked_until is null and l.window_started_at + interval '15 minutes' <= p_now then
    update public.auth_limits set failures=0, window_started_at=p_now where key=p_key;
  end if;
  for a in select * from public.auth_attempts
    where nickname_hmac=p_key and outcome='pending' and reserved_at + interval '60 seconds' <= p_now
    order by reserved_at, id for update
  loop
    update public.auth_attempts set outcome='failure' where id=a.id;
    select * into l from public.auth_limits where key=p_key;
    if a.reserved_at + interval '60 seconds' >= l.window_started_at then
      update public.auth_limits set failures=failures+1,
        blocked_until=case when failures+1>=5 then
          coalesce(blocked_until,a.reserved_at + interval '16 minutes') else blocked_until end
        where key=p_key;
    end if;
  end loop;
end $$;

create function public.reserve_auth_attempt(p_kind text, p_nickname_hmac text, p_source_hmac text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t timestamptz; l public.auth_limits%rowtype; s public.source_limits%rowtype;
  pending_count integer; earliest timestamptz; retry_at timestamptz; attempt_id uuid;
begin
  if p_kind is null or p_kind not in ('login','join','change_pin','admin_login')
    or p_nickname_hmac is null or p_nickname_hmac !~ '^[0-9a-f]{64}$'
    or p_source_hmac is null or p_source_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_AUTH_ATTEMPT';
  end if;
  insert into public.source_limits(key,window_started_at) values(p_source_hmac,clock_timestamp()) on conflict do nothing;
  select * into s from public.source_limits where key=p_source_hmac for update;
  insert into public.auth_limits(key,window_started_at) values(p_nickname_hmac,clock_timestamp()) on conflict do nothing;
  perform 1 from public.auth_limits where key=p_nickname_hmac for update;
  t:=clock_timestamp();
  if s.window_started_at + interval '15 minutes' <= t then
    update public.source_limits set window_started_at=t,reserved_count=0 where key=p_source_hmac returning * into s;
  end if;
  perform public.settle_auth_attempts(p_nickname_hmac,t);
  select * into l from public.auth_limits where key=p_nickname_hmac;
  select count(*),min(reserved_at + interval '60 seconds') into pending_count,earliest
    from public.auth_attempts where nickname_hmac=p_nickname_hmac and outcome='pending';
  if s.reserved_count>=30 then retry_at:=s.window_started_at+interval '15 minutes'; end if;
  if l.blocked_until>t then retry_at:=greatest(retry_at,l.blocked_until);
  elsif l.failures+pending_count>=5 then
    retry_at:=greatest(retry_at,least(l.window_started_at+interval '15 minutes',earliest));
  end if;
  if retry_at is not null then
    return jsonb_build_object('allowed',false,'retryAt',retry_at);
  end if;
  insert into public.auth_attempts(kind,nickname_hmac,source_hmac,reserved_at)
    values(p_kind,p_nickname_hmac,p_source_hmac,t) returning id into attempt_id;
  update public.source_limits set reserved_count=reserved_count+1 where key=p_source_hmac;
  return jsonb_build_object('allowed',true,'attemptId',attempt_id);
end $$;

create function public.complete_auth_attempt(p_id uuid, p_outcome text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.auth_attempts%rowtype; t timestamptz;
begin
  if p_outcome is null or p_outcome not in ('success','failure','system_error') then
    raise exception 'INVALID_AUTH_OUTCOME';
  end if;
  select * into a from public.auth_attempts where id=p_id;
  if not found then return false; end if;
  perform 1 from public.source_limits where key=a.source_hmac for update;
  perform 1 from public.auth_limits where key=a.nickname_hmac for update;
  t:=clock_timestamp();
  perform public.settle_auth_attempts(a.nickname_hmac,t);
  select * into a from public.auth_attempts where id=p_id for update;
  if not found or a.outcome<>'pending' then return false; end if;
  update public.auth_attempts set outcome=p_outcome where id=p_id;
  if p_outcome='success' then
    update public.auth_limits set failures=0,blocked_until=null,window_started_at=t where key=a.nickname_hmac;
  elsif p_outcome='failure' then
    update public.auth_limits set failures=failures+1,
      blocked_until=case when failures+1>=5 then coalesce(blocked_until,t+interval '15 minutes') else blocked_until end
      where key=a.nickname_hmac;
  end if;
  return true;
end $$;

revoke all on function public.settle_auth_attempts(text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.reserve_auth_attempt(text,text,text) from public,anon,authenticated;
revoke all on function public.complete_auth_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_auth_attempt(text,text,text) to service_role;
grant execute on function public.complete_auth_attempt(uuid,text) to service_role;
