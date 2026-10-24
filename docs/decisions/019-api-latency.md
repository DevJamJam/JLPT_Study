# 인증 API 응답 지연 점검 (#41)

2026-10-24. 배포 전 API 응답의 x-vercel-id에서 cle1::iad1을 확인했고 Supabase 프로젝트는 ap-northeast-1(도쿄)이었다. 실행 지역이 DB와 달랐다. Vercel 공식 문서가 권장하는 데이터 소스 인접 지역 배포를 vercel.json의 단일 regions=[hnd1]로 설정한다. Next16.4.2 로컬 문서에서 preferredRegion이 deprecated인 것을 확인해 해당 route export를 추가하지 않는다.

## 근거와 범위

읽기 전용 pg_stat_statements의 PostgREST 호출 통계: 가입 RPC 평균21.94ms/최대46.64ms, 세션 확인 평균1.32ms/최대3.27ms, 이모지 변경 평균3.94ms/최대5.21ms, PIN 변경2.20ms, 로그아웃 평균0.44ms. 이 표본에서 초 단위 SQL 실행 지연은 확인되지 않았다. performance advisor의 미색인 FK/미사용 인덱스는 INFO이며 이번 다초 지연의 원인으로 단정해 스키마를 바꾸지 않는다.

같은 검증 환경의 변경 전 측정(요청 시작~JSON 수신, 네트워크 포함): 가입13.797초, 로그인11.206초. me 8.583/2.087/1.584초, 이모지0.360/0.354/0.762초, PIN 변경3.189초, 새 세션 me8.408초, 로그아웃7.137/0.775/0.345초. 반복 요청 편차가 커 콜드 스타트·네트워크 영향도 분리해야 한다. 지역 차이만으로 관측된 전체 시간을 설명했다고 주장하지 않는다.

## 변경

- Vercel 함수 지역을 도쿄로 고정한다. DB·데이터·비밀값은 이동하지 않는다.
- 기존 createAuthHttp 각 핸들러를 요청별 계측으로 감싼다. Server-Timing의 app은 핸들러 시작부터 응답 생성까지, db는 기존 어댑터의 fetch와 응답 JSON 읽기까지 합계, dbcalls는 요청 개수다. 지표는 숫자와 고정 이름뿐이며 입력·사용자 식별자·쿠키·PIN·해시·SQL·DB URL을 출력/로그하지 않는다. 핸들러 이전 콜드 스타트·클라이언트 왕복은 app에서 관측할 수 없다.
- 병렬 요청·다음 요청의 누계가 섞이지 않도록 카운터를 각 요청 closure에 둔다. 실패한 DB 요청도 finally에서 계측한다. 타임아웃·시도 제한·세션 권한·만료·scrypt 파라미터는 바꾸지 않는다.

## 검증

단위 검사는 기존 인증·DB 계약과 지표의 동시 요청 분리·후속 요청 초기화·DB 실패 집계·비밀 비노출·no-store 보존을 검사한다. 실제 실행 결과·원격 CI·배포 후 같은 순서의 운영 측정·임시 계정 정리는 PR에 기록한다. UI/CSS를 변경하지 않는다.

첫 로컬 빌드는 Turbopack persistence의 invalid digit found in string 오류로 중단됐다. 생성 캐시를 작업 소스 밖으로 분리한 뒤 깨끗한 운영 빌드에 성공했다. check와 단위66개도 통과했다.

참조: https://vercel.com/docs/functions/configuring-functions/region , https://vercel.com/docs/regions . 운영 배포 후 실제 hnd1 적용과 app/db 지표를 확인한 뒤 개선 범위를 판단한다.
