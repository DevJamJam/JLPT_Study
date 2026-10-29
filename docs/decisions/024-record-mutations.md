# 024 — 본인 기록 수정·삭제 API

## 문제와 결정

기록 생성·조회만 연결되어 수정·삭제를 사용할 서버 경로가 없었다. 기존 PostgreSQL의
`save_record`/`delete_record`를 그대로 호출하고 새 스키마나 브라우저 DB 접근은 추가하지 않는다.

- PATCH `/api/records/:id`: 편집 필드 전체와 `expectedVersion`을 받는다. 부분 병합이 아니다.
- DELETE 같은 경로: `expectedVersion`을 받고 `{data:{deletedId}}`를 반환한다.
- 두 경로 모두 정상 사용자 세션, Origin·JSON·본문 크기 검사, UUID와 양의 PostgreSQL
  integer 버전 검사를 통과해야 한다. 버전 증가의 overflow를 막기 위해 2147483647은 거부한다.
- actor/group은 세션에서만 결정한다. 선택 `expectedUserId`는 다른 탭에서 계정이 바뀐 경우
  쓰기를 막는 전제 조건이며 권한을 부여하지 않는다.
- RPC의 소유자·그룹 검사와 멤버 잠금·버전 비교를 재사용한다. 본인 하루1440분 상한도
  RPC가 기존 시간을 제외해 원자적으로 검사한다.
- 충돌은409 CONFLICT와 공개 DTO `currentRecord`를 반환한다. 최신값 재조회도 그룹·본인
  검증을 통과해야 한다. 재조회 실패/삭제는 실제503/404로 반환하고 오래된 스냅샷을 만들지 않는다.
- 응답 유실 후 PATCH 같은 버전 재시도는409와 최신값을 받는다. 서버가 버전을 자동으로
  올려 재전송하지 않는다. 삭제 재시도는 기존 RPC tombstone으로 같은 소유자만 성공한다.
- 생성 fingerprint는 수정하지 않는다. 삭제 후 동일 생성ID 재전송은 RECORD_DELETED다.
- 서버 secret 키, 내부 fingerprint와 SQL 원문은 응답에 포함하지 않는다. no-store 유지.

## 검증

로컬 단위87개(Playwright83 + Node4), format/lint/typecheck, 운영 빌드 통과.
CI에서 기존 SQL 계약·브라우저78개 및 실제 PostgreSQL16/PostgREST14.18 통합5개 실행 예정.
신규 통합 검사는 같은 버전 동시 수정 중 하나만 성공, 최신값 충돌 응답, 일일 상한,
같은/다른 그룹의 타인 기록 수정·삭제 차단, 제한 세션 차단, 삭제 재시도·재생성 방지를 확인한다.

## 한계와 후속

이번 PR은 서버 API만 추가한다. UI 변화가 없어 새 화면 캡처는 없다. 입력창 편집 모드,
삭제 확인·충돌 안내 및 목록 갱신은 후속 PR이다. 운영 사용자 기록은 테스트로 변경하지 않는다.
실제 Safari 기기 검증과 운영 기기 간 동기화는 별도다.
