# 006. PostgreSQL 스키마와 기록 트랜잭션

## 구현 범위와 이유

확정 명세의 15개 테이블을 마이그레이션으로 작성한다. 일반 사용자와 관리자 계정·세션을 분리하고, 기록은 그룹 멤버에 연결한다. 기록 삭제 시 요청 이력은 남기되 계정 삭제 시에는 기록·세션·자격증명·요청 이력까지 함께 제거한다. 기본 공부 종류 7개를 시드로 생성한다. 관리자의 종류 추가, 가입 15명 제한, PIN 초기화는 해당 RPC 구현 단계에서 이어간다.

모든 테이블에 RLS를 활성화하고 PUBLIC·anon·authenticated 권한을 제거한다. service_role만 테이블과 기록 RPC에 접근한다. 기록 함수는 SECURITY INVOKER와 빈 search_path를 사용한다. service_role은 RLS를 우회하므로 서버의 세션 검증을 대신하지 않는다. 서버는 요청 body의 actor를 받지 않고 검증한 일반 사용자 세션에서 actor_user_id를 주입해야 한다.

## 저장과 삭제

그룹 행 → 멤버 행 순서로 잠금을 잡아 같은 그룹의 기록 작업을 직렬화한다. 15명 규모에서 정확성과 삭제·가입의 잠금 순서 일치를 우선한다. 다른 그룹은 별도 행을 사용한다. 공부 날짜의 오늘 상한은 한국 시각으로 계산한다. 일일 합계는 수정 대상 ID를 제외한 뒤 새 시간을 더해 같은 날짜 수정과 다른 날짜 이동을 모두 처리한다.

생성에는 서버 HMAC fingerprint를 전달한다. 같은 UUID·원본 fingerprint 재시도는 수정 후의 현재 기록을 반환하며 값을 되돌리지 않는다. 다른 내용은 IDEMPOTENCY_CONFLICT, 삭제된 요청은 RECORD_DELETED를 반환한다. fingerprint가 실제 입력에서 만들어졌는지 검증하는 책임은 이후 서버 계층에 있다. 수정·삭제는 version 충돌을 거부한다. CONFLICT일 때 최신 기록을 조회해 API의 currentRecord로 제공하는 작업은 API 구현 단계다.

## 검증 방식

격리된 PostgreSQL 16 컨테이너를 CI에 추가한다. scripts/test-db.py는 로컬 호스트의 jlpt_test라는 빈 테스트 DB에서만 실행한다. 기존 테이블이 있으면 중단하며 스키마를 자동 삭제하지 않는다. Supabase의 역할 3개는 테스트 bootstrap에서만 생성한다. 운영 마이그레이션은 기존 역할을 사용한다.

스키마 적용·RLS·브라우저 권한·service_role 호출·FK/유일성/입력 제약·선택 시작시각·수정 충돌·소유권·삭제 재시도·계정 CASCADE를 검사한다. 동시에 두 연결이 같은 사용자에게 20분씩 저장할 때 기존 1420분에서 한 요청만 성공하고 총 1440분인지 확인한다. 잠금 보유 연결의 PgSleep 상태를 확인한 후 두 번째 연결을 시작한다.

현재 작업 환경에서 네이티브 PostgreSQL 서버 실행이 제한되어 로컬 SQL 점검은 임시 PostgreSQL WASM(PGlite)로 수행한다. 프로젝트 의존성에 추가하지 않는다. 이 점검은 다중 연결·PostgreSQL 16 결과를 대신하지 않으며 실제 동시성 합격 여부는 CI의 PostgreSQL 컨테이너 결과로 판단한다.

## 다음 단계와 미완료

실제 Supabase 프로젝트에 적용하지 않았다. 로그인·API·UI 저장 연결과 가입/인증 제한/관리자 RPC는 아직 구현 전이다. 환경변수나 관리자 비밀값을 Git에 넣지 않는다. 운영 DB 적용 전 해당 프로젝트의 PostgreSQL 버전·역할·마이그레이션 상태를 확인해야 한다. 화면 변경이나 블로그 HTML 생성은 없다.

참고: PostgreSQL CREATE FUNCTION 공식 문서의 SECURITY INVOKER 및 search_path 설명:
https://www.postgresql.org/docs/current/sql-createfunction.html
