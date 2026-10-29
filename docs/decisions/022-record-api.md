# 022. 학습 기록 생성·조회 API

## 범위

Issue #46 / PR #47에서 POST `/api/records`, GET `/api/records/:id`, GET `/api/records`를 연결한다. 기록 수정·삭제 API, 공부 종류 목록 API, 화면과 통계 연결은 별도 후속이다. 기존 `save_record`와 스키마를 사용하며 운영 DB 마이그레이션은 없다.

## 구현 결정

- 서버 전용 records 진입점에서만 라우트를 연결한다. 기존 인증의 보안 쿠키·Origin/JSON/크기 검사·오류 응답을 재사용한다. Supabase REST 전송도 공용으로 분리해 secret/legacy 키 처리와 10초 제한, 요청별 숫자 시간 계측을 유지한다.
- 사용자·그룹은 일반 사용자 세션에서 도출한다. 관리자 쿠키는 인정하지 않으며 초기화된 PIN의 제한 세션은 생성·조회 모두403이다. 작성자·그룹을 body/query로 변경할 수 없다. 단건 조회는 같은 그룹만 가능하다.
- 생성은 정규화된 입력 전체의 서버 HMAC을 DB에 전달한다. 같은 ID/입력의 재시도는 기존 트랜잭션 계약을 따른다. 저장 후 현재 기록을 다시 읽어 DTO를 반환한다. 이미 편집된 기록을 생성 당시 값으로 되돌리지 않는다. 저장 후 조회가 실패하면 성공으로 응답하지 않으므로 같은 ID/입력으로 재시도해야 한다.
- 기간 조회는 실제 날짜·순서·최대42일을 검사한다. DB 응답 개수 제한이 앱의 요청 개수보다 작아도 실제 반환 개수만큼 이어서 읽어 빈 페이지를 확인한다. 조회 중 별도 트랜잭션의 변경은 시점 차이가 있을 수 있으며 고정 스냅샷을 보장하지 않는다.
- 개인 월 목록은 최대30개, 날짜 DESC → 시작시각 ASC NULLS LAST → 생성시각 ASC → ID ASC 순서다. 다음 페이지 확인용1개를 더 읽는다. 커서는 사용자·그룹·월에 묶이고 모든 정렬 필드를 포함한다. 생성시각의 마이크로초를 그대로 보존한다. 커서는 권한 근거가 아니며 서버의 그룹·사용자·기간 필터를 항상 적용한다.
- 응답은 명시한 필드만 조회하고 공개 DTO로 변환한다. DB 결과의 필드·형식·그룹·개인 소유권을 검사한다. 내부 fingerprint·자격증명·SQL/연결 오류 원문을 반환하지 않는다.

## 검증과 한계

조회 조건·커서·DB 응답 검증, 요청 주체 위조·제한 세션·업무 오류·연결 실패를 단위 검사한다. 격리된 PostgreSQL16 및 PostgREST14.18에서 실제 HTTP/DB 통합 검사를 추가했다. PostgREST의 테스트 익명 역할은 이 격리 컨테이너에서만 service_role로 설정하며 운영 설정을 바꾸지 않는다. 테스트용 세션·계정·키만 사용한다.

운영 Supabase는 읽기 전용으로 기존 테이블 RLS와 함수 권한을 확인했다. 운영 API에 새 코드를 반영한 실제 사용자 저장이나 기기 간 화면 동기화는 별도 검증이다. 실행 완료 여부와 최신 결과는 PR 본문에 갱신한다.

## 참고

- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/reference/javascript/using-modifiers-range
- https://docs.postgrest.org/en/v14/references/api/tables_views.html
- https://github.com/PostgREST/postgrest/releases/tag/v14.18
