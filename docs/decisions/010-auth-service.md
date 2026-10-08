# 010. 서버 가입·로그인 흐름과 설정 검증

가장 중요한 인증 연결 단계에서 먼저 현재 환경을 확인했다. Supabase URL/service-role,
PIN pepper, rate-limit/idempotency HMAC 키, APP_ORIGIN이 모두 설정되어 있지 않았다.
비밀값은 출력하지 않았으며 없는 설정을 임의로 만들거나 운영 연결 성공으로 보고하지 않는다.

이번 Issue #23은 DB 인터페이스를 주입받는 서버 인증 흐름을 구현한다. 공개 Route Handler,
실제 로그인/가입 페이지는 아직 추가하지 않는다. Supabase 서버 어댑터는 후속 연결 작업에서 추가했다. 신뢰 가능한 출처를
결정하는 배포 환경 검증도 후속이다. 임의 forwarded 헤더나 body의 IP를 사용하지 않는다.

loadAuthConfig는 누락·짧은 키·세 비밀값 재사용, 잘못된 URL, 운영 HTTP Origin을 거부한다.
오류는 고정 AUTH_NOT_CONFIGURED이며 비밀값을 포함하지 않는다. 앱 서버는 server-only
인증 진입점으로만 import한다. 환경 설정은 서버 .env.local 또는 배포 환경변수에서 하고
키를 공개 git이나 채팅에 넣지 않는다. .env.example의 이름을 그대로 사용한다.

authenticate는 입력 정규화 → namespace HMAC → DB 시도 예약 → scrypt 검증 →
예약 성공 완료 → 현재 credential_version 재확인 세션 생성 순서다. DB 예약 거부는 해시
연산 전 종료한다. 없는 계정도 dummy scrypt를 사용하며 PIN 오답과 같은 오류로 응답한다.

가입은 해시와 HMAC fingerprint로 DB join 계약을 호출한 뒤 현재 credential을 다시 읽고
PIN을 검증한다. 가입 재시도에서 옛 PIN으로 세션을 만들 수 없다. PIN 변경 경합은
createSession의 expectedVersion으로 기존 DB 계약을 사용한다. 늦은 예약 완료가 false면
세션 발급을 거부한다. DB 오류 원문은 AUTH_UNAVAILABLE로 차단하며 미완료 예약은
system_error를 시도한다. 완료 통신 실패 시 DB의 만료 처리가 예산을 보존한다.

반환 token은 서버 내부 전달값이다. 실제 Route Handler는 HttpOnly 쿠키에만 넣고
응답 JSON에는 포함하지 않아야 한다. 고정 만료 쿠키·세션 조회/폐기와 Profile/Group DTO는
실제 API 연결 단계에서 구성한다. 내부 결과를 공개 응답으로 그대로 반환하지 않는다.

검증은 테스트용 DB 인터페이스와 실제 scrypt로 흐름을 검사한다. 기존 DB SQL 계약과
다른 검증이므로 실제 Supabase 통합 테스트를 대신하지 않는다. 설정 검증, 오답/없는 계정,
가입 재전송 PIN 재검증, 성공 흐름, 제한·늦은 완료 시 세션 차단, DB 오류 원문 차단을 검사한다.
최종 포맷·린트·타입 검사와 단위 테스트 26개 및 운영 빌드가 통과했다.
화면 변경이 없어 새 캡처는 없다. API/UI를 연결하면 실제 화면 캡처를 전달한다.

## Supabase 서버 어댑터 연결

2026-10-08: 기존 4개 migration은 JLPT_STUDY 프로젝트에 적용됐으며 SQL 계약과
15개 테이블의 RLS·공개 역할 차단을 검증했다. 앱 서버 비밀값은 아직 설정되지 않았다.
플러그인의 관리 연결을 앱의 런타임 연결 완료로 간주하지 않는다.

Supabase 공식 API Keys 문서를 확인해 신규 `SUPABASE_SECRET_KEY`를 우선 지원하며
legacy `SUPABASE_SERVICE_ROLE_KEY`도 유지한다. 새 secret 키는 apikey 헤더로,
legacy JWT는 apikey와 Authorization으로 전송한다. 모든 호출은 no-store, redirect
거부, 10초 timeout을 사용한다. RPC 자동 재시도는 하지 않는다.

예약·완료·가입·버전 검증 세션 RPC와 현재 자격증명 조회를 AuthDatabase에 연결했다.
스터디 groupId는 서버 설정에서만 주입하며 body에서 받지 않는다. 허용한 DB 업무 오류만
고정 코드로 전달하고 기타 오류는 AUTH_UNAVAILABLE로 차단한다. 응답 구조를 검사하며
세션의 token_hash 등 추가 DB 필드를 제거한다. 클라이언트는 server-only 진입점을
사용할 수 없다. 공개 API, 출처 검증, HttpOnly 쿠키 응답은 아직 구현 전이다.

공식 참고: https://supabase.com/docs/guides/getting-started/api-keys
어댑터 검증은 대체 fetch를 사용한다. 실제 서버 비밀키로 연결한 통합 검증은 아직 하지 않았다.

이번 연결 변경은 포맷·린트·타입·운영 빌드와 단위 테스트 34개를 통과했다. 화면 변경은 없다.
