begin;

-- actor는 요청 body가 아닌 서버에서 검증한 일반 사용자 세션에서 주입한다.
-- service_role만 호출하며 SECURITY INVOKER로 불필요한 권한 승격을 피한다.
create function public.save_record(
  p_actor_user_id uuid,
  p_group_id uuid,
  p_id uuid,
  p_study_date date,
  p_minutes integer,
  p_category_id uuid,
  p_start_time time,
  p_quantity integer,
  p_quantity_unit text,
  p_memo text,
  p_create_fingerprint text,
  p_expected_version integer
) returns public.study_records
language plpgsql security invoker
set search_path = ''
as $$
declare
  existing public.study_records;
  request_row public.record_requests;
  result_row public.study_records;
  daily_total bigint;
  normalized_memo text := nullif(btrim(p_memo, E' \t\n\r\f\v'), '');
begin
  -- 삭제·가입·저장 모두 동일한 그룹→멤버 잠금 순서를 사용한다.
  perform 1 from public.study_groups where id = p_group_id for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform 1 from public.group_members
    where group_id = p_group_id and user_id = p_actor_user_id for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_id is null then raise exception 'VALIDATION_ERROR' using errcode = 'P0001'; end if;

  select * into existing from public.study_records where id = p_id;
  select * into request_row from public.record_requests where id = p_id;

  if p_expected_version is null then
    -- 생성 재시도는 현재 수정된 값을 반환하며 원래 입력으로 되돌리지 않는다.
    if request_row.id is not null then
      if request_row.user_id <> p_actor_user_id then
        raise exception 'FORBIDDEN' using errcode = 'P0001';
      end if;
      if request_row.fingerprint is distinct from p_create_fingerprint then
        raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
      end if;
      if request_row.record_id is null or request_row.deleted_at is not null then
        raise exception 'RECORD_DELETED' using errcode = 'P0001';
      end if;
      if existing.id is null or existing.group_id <> p_group_id then
        raise exception 'FORBIDDEN' using errcode = 'P0001';
      end if;
      return existing;
    end if;
    if existing.id is not null then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
  else
    if existing.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    if existing.user_id <> p_actor_user_id or existing.group_id <> p_group_id then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    if existing.version <> p_expected_version then
      -- API 계층이 currentRecord를 다시 조회해 초안과 함께 충돌 안내에 사용한다.
      raise exception 'CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  if p_study_date is null or p_study_date < date '2000-01-01'
    or p_study_date > (statement_timestamp() at time zone 'Asia/Seoul')::date
    or p_minutes is null or p_minutes not between 1 and 1440
    or p_category_id is null
    or p_start_time >= time '24:00' or extract(second from p_start_time) <> 0
    or (p_quantity is null) <> (p_quantity_unit is null)
    or p_quantity not between 1 and 99999
    or p_quantity_unit not in ('item', 'page', 'question')
    or char_length(normalized_memo) > 500
    or (p_expected_version is null and (
      p_create_fingerprint is null or p_create_fingerprint !~ '^[0-9a-f]{64}$'
    )) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.study_categories where id = p_category_id) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  select coalesce(sum(minutes), 0) into daily_total from public.study_records
    where user_id = p_actor_user_id and study_date = p_study_date and id <> p_id;
  if daily_total + p_minutes > 1440 then
    raise exception 'DAILY_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  if p_expected_version is null then
    insert into public.study_records (
      id, group_id, user_id, study_date, minutes, category_id, start_time,
      quantity, quantity_unit, memo, create_fingerprint
    ) values (
      p_id, p_group_id, p_actor_user_id, p_study_date, p_minutes, p_category_id,
      p_start_time, p_quantity, p_quantity_unit, normalized_memo, p_create_fingerprint
    ) returning * into result_row;
    insert into public.record_requests (id, user_id, fingerprint, record_id)
      values (p_id, p_actor_user_id, p_create_fingerprint, p_id);
  else
    update public.study_records set
      study_date = p_study_date, minutes = p_minutes, category_id = p_category_id,
      start_time = p_start_time, quantity = p_quantity, quantity_unit = p_quantity_unit,
      memo = normalized_memo, version = version + 1, updated_at = clock_timestamp()
      where id = p_id returning * into result_row;
  end if;
  return result_row;
end;
$$;

create function public.delete_record(
  p_actor_user_id uuid, p_group_id uuid, p_id uuid, p_expected_version integer
) returns boolean
language plpgsql security invoker
set search_path = ''
as $$
declare
  existing public.study_records;
  request_row public.record_requests;
begin
  perform 1 from public.study_groups where id = p_group_id for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform 1 from public.group_members
    where group_id = p_group_id and user_id = p_actor_user_id for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into existing from public.study_records where id = p_id;
  if existing.id is null then
    select * into request_row from public.record_requests where id = p_id;
    if request_row.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    if request_row.user_id <> p_actor_user_id then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    return true;
  end if;
  if existing.user_id <> p_actor_user_id or existing.group_id <> p_group_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_expected_version is null or existing.version <> p_expected_version then
    raise exception 'CONFLICT' using errcode = 'P0001';
  end if;
  update public.record_requests set deleted_at = clock_timestamp() where id = p_id;
  delete from public.study_records where id = p_id;
  return true;
end;
$$;

revoke all on function public.save_record(uuid, uuid, uuid, date, integer, uuid, time, integer, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.delete_record(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.save_record(uuid, uuid, uuid, date, integer, uuid, time, integer, text, text, text, integer)
  to service_role;
grant execute on function public.delete_record(uuid, uuid, uuid, integer) to service_role;

insert into public.study_categories (name, name_key, seed_key, sort_order) values
  ('단어', '단어', 'vocabulary', 1),
  ('한자', '한자', 'kanji', 2),
  ('문법', '문법', 'grammar', 3),
  ('독해', '독해', 'reading', 4),
  ('청해', '청해', 'listening', 5),
  ('회화', '회화', 'conversation', 6),
  ('기타', '기타', 'other', 7);

commit;
