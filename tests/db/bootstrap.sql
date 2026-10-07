-- 테스트 컨테이너 전용. Supabase에서는 이미 존재하는 역할이다.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
