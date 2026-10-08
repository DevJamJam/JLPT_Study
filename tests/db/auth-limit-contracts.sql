set role service_role;
do $$
declare r jsonb; ids uuid[] := '{}'; i integer; n text:=repeat('8',64); s text:=repeat('9',64);
begin
  for i in 1..5 loop
    r:=public.reserve_auth_attempt('login',n,s);
    if not (r->>'allowed')::boolean then raise exception 'reservation % rejected',i; end if;
    ids:=array_append(ids,(r->>'attemptId')::uuid);
  end loop;
  r:=public.reserve_auth_attempt('join',n,repeat('a',64));
  if (r->>'allowed')::boolean or r->>'retryAt' is null then raise exception 'pending budget bypass'; end if;
  if not public.complete_auth_attempt(ids[1],'success') then raise exception 'success failed'; end if;
  if public.complete_auth_attempt(ids[1],'failure') then raise exception 'duplicate completion'; end if;
  r:=public.reserve_auth_attempt('change_pin',n,s);
  if not (r->>'allowed')::boolean then raise exception 'success did not clear budget'; end if;
  ids[1]:=(r->>'attemptId')::uuid;
  for i in 1..5 loop perform public.complete_auth_attempt(ids[i],'failure'); end loop;
  if (public.reserve_auth_attempt('login',n,s)->>'allowed')::boolean then raise exception 'five failures not blocked'; end if;
  if (select blocked_until from public.auth_limits where key=n) < clock_timestamp()+interval '14 minutes' then
    raise exception 'block duration';
  end if;
end $$;

-- system_error는 닉네임 실패를 늘리지 않고 출처 사용량을 회수하지 않는다.
do $$
declare r jsonb; i integer; s text:=repeat('b',64); n text:=repeat('c',64);
begin
  for i in 1..30 loop
    r:=public.reserve_auth_attempt('join',n,s);
    if not (r->>'allowed')::boolean then raise exception 'source early reject %',i; end if;
    perform public.complete_auth_attempt((r->>'attemptId')::uuid,'system_error');
  end loop;
  if (public.reserve_auth_attempt('login',repeat('d',64),s)->>'allowed')::boolean then
    raise exception 'source 31 accepted';
  end if;
  if (select failures from public.auth_limits where key=n)<>0 then raise exception 'system failure counted'; end if;
end $$;
reset role;

-- 테스트 시각은 DB 행만 조정한다. RPC에서 호출자가 현재 시각을 지정할 수 없다.
do $$
declare r jsonb; attempt_uuid uuid; n text:=repeat('e',64); s text:=repeat('f',64);
begin
  r:=public.reserve_auth_attempt('login',n,s); attempt_uuid:=(r->>'attemptId')::uuid;
  update public.auth_limits set window_started_at=clock_timestamp()-interval '2 minutes' where key=n;
  update public.auth_attempts set reserved_at=clock_timestamp()-interval '61 seconds' where auth_attempts.id=attempt_uuid;
  if public.complete_auth_attempt(attempt_uuid,'success') then raise exception 'late success accepted'; end if;
  if (select outcome from public.auth_attempts where auth_attempts.id=attempt_uuid)<>'failure' then raise exception 'timeout not failure'; end if;
  perform public.complete_auth_attempt(attempt_uuid,'failure');
  if (select failures from public.auth_limits where key=n)<>1 then raise exception 'timeout counted twice'; end if;
  update public.auth_limits set failures=5,blocked_until=clock_timestamp()-interval '1 second' where key=n;
  update public.source_limits set reserved_count=30,window_started_at=clock_timestamp()-interval '16 minutes' where key=s;
  if not (public.reserve_auth_attempt('login',n,s)->>'allowed')::boolean then raise exception 'expired limits not reset'; end if;
  if (select reserved_count from public.source_limits where key=s)<>1 then raise exception 'source reset'; end if;
end $$;

do $$
begin
  if has_function_privilege('anon','public.reserve_auth_attempt(text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.complete_auth_attempt(uuid,text)','EXECUTE')
    or has_function_privilege('service_role','public.settle_auth_attempts(text,timestamptz)','EXECUTE') then
    raise exception 'auth limit function privilege leak';
  end if;
end $$;

do $$
declare n text:=repeat('4',64); s text:=repeat('5',64); retry_at timestamptz; i integer;
begin
  for i in 1..5 loop perform public.reserve_auth_attempt('login',n,s); end loop;
  update public.auth_limits set window_started_at=clock_timestamp()-interval '2 minutes' where key=n;
  update public.auth_attempts set reserved_at=clock_timestamp()-interval '61 seconds' where nickname_hmac=n;
  retry_at:=(public.reserve_auth_attempt('login',n,s)->>'retryAt')::timestamptz;
  if retry_at<clock_timestamp()+interval '14 minutes' then raise exception 'timeout lock missing'; end if;
  if (select failures from public.auth_limits where key=n)<>5 then raise exception 'timeout five failures'; end if;
  update public.source_limits set reserved_count=30,window_started_at=clock_timestamp() where key=s;
  retry_at:=(public.reserve_auth_attempt('login',n,s)->>'retryAt')::timestamptz;
  if retry_at<>(select window_started_at+interval '15 minutes' from public.source_limits where key=s) then
    raise exception 'retryAt did not use later limit';
  end if;
  if (select count(*) from public.auth_attempts where nickname_hmac=n)<>5 then raise exception 'denied attempt inserted'; end if;
  begin
    perform public.reserve_auth_attempt('login','raw-nickname','raw-ip');
    raise exception 'raw keys accepted';
  exception when raise_exception then
    if sqlerrm<>'INVALID_AUTH_ATTEMPT' then raise; end if;
  end;
end $$;
