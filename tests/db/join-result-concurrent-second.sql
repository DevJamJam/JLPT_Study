set role service_role;
do $$
begin
  if (public.complete_join_result('52000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000002',repeat('a',64),'동시재시도','동시재시도','🐰',
    repeat('d',64),'AAAAAAAAAAAAAAAAAAAAAA==',
    '{"algorithm":"scrypt","N":32768,"r":8,"p":3,"dkLen":32}'::jsonb)->>'created')::boolean then
    raise exception 'SECOND_MUST_NOT_CREATE';
  end if;
  -- 기존 동시 요청 검사 도우미에 정상 재시도 판정을 전달한다.
  raise exception 'JOIN_RETRY_EXPECTED';
end;
$$;
