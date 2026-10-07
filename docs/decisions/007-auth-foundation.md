# 007. 가입·PIN 해시·세션 기반

## 이번 구현과 다음 연결

가입·로그인 API를 연결하기 전에 입력 정규화·해시·가입 트랜잭션·세션 검증을 구현한다. 이번 PR은 공개 API나 화면을 추가하지 않는다. DB 시도 제한 예약/완료, 요청 Origin·Content-Type·크기 검사, 실제 Supabase 연결 및 가입/로그인 화면은 다음 PR이다. 이 단계만으로 실사용 로그인이 가능하다고 보고하지 않는다.

## 입력과 해시

닉네임은 trim+NFC 후 2~12 Unicode 코드포인트이며 제어·숨김 문자와 줄 구분자를 거부한다. 비교 키는 JavaScript toLowerCase 결과를 서버에서 계산해 RPC에 전달한다. DB locale의 lower와 차이가 생기는 문자(예: İ)가 있어 DB에서 비교 키를 다시 계산하지 않는다. API는 nickname_key를 요청 body에서 받지 않아야 한다. 종류·PIN·사용자 ID와 마찬가지로 service_role 호출의 신뢰 경계는 서버다.

PIN은 정확히 ASCII 숫자 네 자리 문자열이다. 선행 0을 유지하고 마지막 줄바꿈을 허용하지 않는다. 계정마다 16바이트 무작위 salt, 서버 pepper로 HMAC 처리한 입력, 비동기 scrypt(N=32768,r=8,p=3,dkLen=32,maxmem=64MiB)를 사용한다. 저장 파라미터가 예상과 다르면 임의 비용으로 검증하지 않고 거부한다. 없는 계정도 같은 scrypt 비용의 dummy 경로를 호출하도록 제공한다. 이 경로는 DB 시도 예약이 구현된 뒤 연결해야 한다.

가입 재시도용 fingerprint는 별도 HMAC 키와 namespace로 생성하며 PIN은 저장하거나 로그에 남기지 않는다. 실제 환경변수 값은 제공하지 않고 .env.example에 확정 명세의 이름만 작성한다. 서버 진입점은 server-only로 표시하고 코어 함수는 Node 내장 crypto를 사용한다. 앱 서버는 진입점을 통해 import하고 단위 검사만 코어 모듈을 직접 사용한다.

## 가입·세션 DB 계약

complete_join은 그룹 행을 잠근 뒤 requestId/fingerprint → 중복 닉네임 → 정원을 검사하고 사용자·자격증명·멤버·요청 이력을 같은 트랜잭션에서 생성한다. 정원에 도달한 뒤에도 기존 성공 요청 재시도는 같은 사용자 ID를 반환한다. 재시도는 변경된 credential을 덮어쓰거나 세션을 자동 발급하지 않는다. 이후 API는 동일 요청 재시도에도 현재 PIN을 검증한 후 필요한 세션을 생성해야 한다.

create_user_session은 서버의 PIN 검증을 대신하지 않는다. 서버가 검증한 credential_version을 받아 그룹→멤버→credential 순으로 잠근 뒤 현재 버전을 다시 확인한다. PIN 변경·초기화 뒤 오래된 검증 결과로 세션을 만들 수 없다. 정상 세션은 고정720시간, 초기화 제한 세션은15분이다. DB에는32바이트 무작위 토큰의 SHA256만 보관한다.

resolve_user_session은 만료·credential_version·그룹 멤버십·must_change_pin/세션 mode 일치를 한 조회에서 검증한다. 제한 세션은 기본 거부하고 auth/me·logout·complete-reset에서만 서버가 허용 옵션을 사용할 예정이다. 반환에는 프로필과 만료 정보만 포함한다. revoke_user_session은 현재 토큰만 삭제하며 재시도해도 성공한다. PIN 변경/관리자 초기화 RPC와 데이터 쓰기의 인증 경합 처리는 해당 API 단계에서 추가한다.

쿠키 설정은 HttpOnly/Secure/SameSite=Lax/Path=/이고 Domain을 지정하지 않는다. 정상 이름은 __Host-jlpt_session, 로컬 HTTP는 별도 jlpt_dev_session이다. DB expires_at을 그대로 expires로 사용한다. Max-Age가 expires를 덮어써 만료가 뒤로 밀리지 않게 설정에서 제외한다. 활동에 따라 만료를 연장하지 않는다.

## 검증

추가 단위 검사5개로 닉네임·PIN·가입 입력, 실제 scrypt 비교와 salt/pepper 변화, 잘못된 파라미터, 토큰·쿠키·HMAC을 검사한다. 기존10개와 함께15개를 실행한다. 로컬 PostgreSQL WASM에서 가입 재시도·credential 버전·정상/제한 세션 만료·로그아웃·계정 삭제·Unicode 비교 키 SQL을 점검한다. 실제 동시 가입은 PostgreSQL16 CI의 별도 연결로14명 상태에서 두 요청 중 한 요청만 성공해15명이 되는지 검사한다. 기존 기록 동시 저장 검사도 유지한다.

실제 배포 런타임의 scrypt 부하와 iPhone Safari 검사는 아직 수행하지 않았다. 화면 변경이 없어 새 캡처나 블로그 HTML을 만들지 않는다.

참고: https://nodejs.org/api/crypto.html 및 설치된 Next.js data-security/cookies 가이드.
