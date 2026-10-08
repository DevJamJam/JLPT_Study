# 009. DB 인증 시도 예약·완료 제한

PR #20의 코드/DB CI 성공과 최신 head를 확인한 뒤 병합했다. Issue #21은
공개 인증 API 전에 필요한 DB 제한 함수만 구현한다. 화면은 변경하지 않는다.

reserve_auth_attempt는 출처 → 닉네임 행 순서로 잠근다. 닉네임 실패+pending 5회,
출처 30회/15분을 검사하고 허용 시에만 UUID 예약을 생성한다. 제한 응답은
allowed=false와 retryAt을 반환한다. 예외를 던지면 pending 정리까지 롤백되므로
일반 제한 결과는 JSON으로 반환한다. 여러 제한이 겹치면 가장 늦은 해제 시각을 반환한다.

complete_auth_attempt는 같은 순서로 잠그고 pending만 한 번 완료한다. 성공은
실패 window를 초기화하되 다른 pending을 보존한다. system_error는 실패를 늘리지
않고 출처 예산도 회수하지 않는다. 60초 지난 pending은 failure로 전환하고 늦은 완료는
무시한다. 타임아웃 잠금은 예약 만료 시각을 기준으로 계산해 늦은 접근이 잠금을
계속 연장하지 않게 한다. DB 시각은 잠금을 취득한 뒤 clock_timestamp로 읽는다.

외부 호출 가능한 RPC는 service_role에만 부여한다. 내부 정리 함수는 service_role에도
직접 실행 권한을 주지 않는다. 서버가 namespace를 포함한 HMAC 닉네임/출처 키를
계산해야 하며 원문이나 임의 body 키를 DB에 전달해서는 안 된다.

검증 환경: 로컬 PostgreSQL 도구가 없어 설치를 시도했으나 setgroups 권한 오류로
실패했다. 설치를 반복하지 않고 레포 밖 임시 PGlite에서 마이그레이션과 기존 기록,
가입/세션, 새 제한 SQL 계약을 실행했다. 테스트 변수/열 이름 모호성을 수정했다.
실제 두 연결 경합은 scripts/test-db.py에 추가했으며 PostgreSQL CI에서 확인해야 한다.
PGlite 단일 연결 검사를 동시 요청 검증으로 보고하지 않는다. 포맷·린트·타입 검사,
기존 단위 테스트 18개와 운영 빌드는 통과했다.

공개 API, Supabase 운영 연결, 출처의 신뢰 경계와 HMAC 서버 함수, 관리자 초기화의
잠금 해제 연결은 후속 작업이다. 운영 DB에 이번 검사를 실행하지 않는다.
