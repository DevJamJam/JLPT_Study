begin;

-- 기존 가입 함수의 반환형을 유지하면서 생성/재시도 결과를 같은 그룹 잠금 아래 판정한다.
create function public.complete_join_result(
  p_group_id uuid, p_request_id uuid, p_fingerprint text,
  p_nickname text, p_nickname_key text, p_emoji text, p_pin_hash text, p_salt text, p_hash_params jsonb
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  was_created boolean;
  joined_user_id uuid;
begin
  perform 1 from public.study_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND' using errcode = 'P0001'; end if;
  was_created := not exists (select 1 from public.signup_requests where request_id = p_request_id);
  joined_user_id := public.complete_join(p_group_id, p_request_id, p_fingerprint,
    p_nickname, p_nickname_key, p_emoji, p_pin_hash, p_salt, p_hash_params);
  return jsonb_build_object('userId', joined_user_id, 'created', was_created);
end;
$$;
revoke all on function public.complete_join_result(uuid,uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.complete_join_result(uuid,uuid,text,text,text,text,text,text,jsonb) to service_role;

commit;
