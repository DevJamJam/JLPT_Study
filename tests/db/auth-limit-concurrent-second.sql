set role service_role;
do $$
begin
  if not (public.reserve_auth_attempt('login',repeat('1',64),repeat('3',64))->>'allowed')::boolean then
    raise exception 'AUTH_LIMIT_EXPECTED';
  end if;
end $$;
