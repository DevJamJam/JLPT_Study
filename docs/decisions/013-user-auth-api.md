# 사용자 로그인·세션 확인·로그아웃 API (#29)

2026-10-23. PR #28의 서버 코어를 실제 Node.js Route Handler에 연결한다.

- POST /api/auth/login: Origin·JSON·4096바이트 검증 후 신뢰 출처 HMAC 제한, 현재 PIN 검증, 자격증명 버전 재확인 세션을 생성한다. 원문 토큰은 __Host-jlpt_session 쿠키에만 전달한다. Secure·HttpOnly·SameSite=Lax·Path=/, Domain 없음. 로컬 개발은 별도 jlpt_dev_session을 쓴다.
- GET /api/auth/me: 사용자 전용 쿠키를 해시하고 기존 resolve_user_session RPC로 만료·현재 자격증명·그룹 소속을 확인한다. 제한 세션은 mustChangePin=true를 반환하며 이는 공부 API 접근 허용을 의미하지 않는다. 관리자 쿠키는 사용하지 않는다. 조회로 쿠키·DB 만료를 연장하지 않는다.
- POST /api/auth/logout: 같은 Origin·JSON 검증 후 현재 사용자 세션 해시만 폐기한다. 쿠키가 없거나 형식이 잘못돼도 성공한다. DB 폐기 실패는 503이며 성공한 것처럼 쿠키를 지우지 않는다. 관리자 세션에는 영향을 주지 않는다.
- 응답은 명세의 공개 Profile·Group DTO만 명시적으로 조립한다. 서비스 키·PIN·salt·해시·세션 원문은 JSON이나 로그에 넣지 않는다. 모든 성공·실패 응답은 private, no-store이다.
- VERCEL=1인 서버에서만 x-vercel-forwarded-for 단일 IP를 신뢰한다. IPv6 표기를 정규화하고 임의 x-forwarded-for/body 값으로 대체하지 않는다. 개발/테스트는 고정 로컬 제한 버킷, 다른 운영 호스팅은 503이다. 근거: https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for (2026-10-23 확인).
- DB는 기존 study_groups·group_members와 기존 RPC를 사용한다. 스키마·권한 변경 없음. 새 환경변수나 하드코딩한 그룹 UUID는 필요하지 않다. 그룹은 인증된 세션에서 도출한다. 회원 수는 관리자 계정을 제외한 실제 group_members 수이다.

## 검증

HTTP 테스트는 실제 authenticate/scrypt와 Request/Response·Supabase REST 어댑터를 사용하고 DB 전송만 대체한다. 공개 DTO·쿠키·고정 만료·제한 세션·인증 실패·Origin/본문 차단·429·오류 원문 차단·관리자 쿠키 분리·폐기·잘못된 토큰·만료 세션·운영 출처를 검사한다.

초기 DB 조회에서 groups라는 잘못된 테이블명을 사용해 42P01이 발생했다. 기존 마이그레이션과 실제 DB를 대조해 study_groups로 수정했다. 데이터 변경은 없었다. 초기 타입 검사에서 테스트의 Date/number 유니온 및 헤더 타입 오류 두 건을 수정했다.

운영 사용자 로그인 성공은 실제 사용자 자격증명으로 검증하지 않았다. 가입의 신규201/재전송200 구분, 가입 UI, PIN 변경, 관리자 인증·계정 생성은 후속 작업이다. 이번 변경은 화면 변경이 없어 새 UI 캡처 대상이 없다.

실행 결과: npm run check, npm run build, 단위 검사 49개(Playwright 45 + 관리자 초기화 4), 실제 Next 서버 API 검사 1개 통과. Supabase에서 study_groups 1개·max_members=15 및 세션 RPC service_role 허용/anon 차단을 읽기 전용으로 확인했다. 전체 화면 E2E·DB 계약은 PR CI에서 확인한다.
