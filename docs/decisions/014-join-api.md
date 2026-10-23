# 가입 API와 생성·재시도 구분 (#31)

2026-10-23. POST /api/auth/join을 기존 로그인과 같은 HTTP·보안 쿠키 처리에 연결한다. 화면 변경은 없다.

- 신규 계정은201, 같은 requestId·내용 재전송은200이다. 둘 다 공개 Profile·Group DTO만 반환하며 세션 원문은 HttpOnly 쿠키로만 전달한다.
- complete_join_result는 study_groups 행을 먼저 잠근 뒤 signup_requests 존재 여부와 기존 complete_join 결과를 함께 판정한다. 그룹 잠금 밖에서 존재 여부를 조회해 동시 요청 두 개가 모두201이 되는 문제를 피한다. 기존 complete_join의 반환형과 정원·중복·내용 충돌 처리는 유지한다.
- 새 RPC는 SECURITY INVOKER, 빈 search_path, PUBLIC/anon/authenticated EXECUTE 철회, service_role만 허용한다. CLI migration new로 파일을 생성했다. 운영에는 jlpt_join_result 이름으로 동일 SQL을 적용했다. 기존 마이그레이션 이력을 재적용하지 않는다.
- 서버가 단일 study_groups를 조회한다. 0개 또는 여러 개이면503으로 차단하며 클라이언트 groupId는 사용하지 않는다. 새 환경변수와 하드코딩한 그룹 ID는 필요하지 않다.
- 가입도 입력 검증→인증 시도 예약→PIN 해시→DB 가입→현재 자격증명 재조회·PIN 검증→버전 검증 세션 순서이다. 재시도로 기존 PIN·salt·자격증명 버전을 덮어쓰지 않는다.
- 정원·닉네임·같은 요청 ID의 내용 충돌은 각각409 GROUP_FULL/NICKNAME_TAKEN/IDEMPOTENCY_CONFLICT이다. 잘못된 PIN 확인·이모지·UUID는 예약 전에400이다.

## 검증

npm run check, npm run build, 단위 검사54개(Playwright50+관리자 초기화4)가 통과했다. HTTP 테스트는 신규201/재시도200·공개 DTO·서버 그룹·쿠키·업무 오류·PIN 재검증을 검사한다. DB 계약은 신규/재시도/같은 사용자/내용 충돌/한 명 생성/공개 역할 차단을 검사하고 롤백한다. 같은 요청의 실제 동시 실행은 격리된 PostgreSQL CI에서 첫 생성true·대기한 재시도false·한 명 생성으로 검사한다.

Supabase에 RPC를 추가하고 DB 계약을 실행해 통과했다. 테스트 그룹·사용자·가입 요청은 롤백했다. 보안 advisor는 기존 서버 전용 RLS의 정책 없음 INFO15건이며 WARN/ERROR는 없었다. 근거: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

운영 API의 실제 사용자 가입 성공과 로그인·가입 화면 연결, PIN 변경·관리자 인증·관리자 생성은 후속이다. 실제 Next 서버 API 검사 2개도 통과했다. 전체 화면 E2E·동시 요청을 포함한 원격 CI 결과는 PR에 기록한다.
