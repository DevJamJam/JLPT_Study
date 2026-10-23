# 011. 관리자 초기 생성과 관리 범위

2026-10-23 사용자 요청으로 관리자 1개를 일반 가입 전에 미리 생성한다.
관리자는 일반 사용자 15명과 분리되며 group_members에 등록하지 않는다.
운영 DB 조회에서 관리자와 스터디 그룹은 각각 0개였다. 이번 변경에서 운영 계정을
임의의 아이디·비밀번호로 만들지 않았다.

서버 전용 수동 명령 `npm run admin:init`을 추가한다. 서버 URL·서버 키와
ADMIN_LOGIN_ID·ADMIN_INITIAL_PASSWORD를 환경변수에서 읽는다. 공개 Route Handler,
일반 가입, 자동 빌드·앱 시작에서 실행하지 않는다. Vercel 환경변수 저장과 명령 실행은
별개이며 현재 Vercel의 비밀값을 이 작업 환경에서 읽거나 실행할 수 없다.

기존 admin_accounts의 id만 확인한다. 기존 계정이 있으면 초기 비밀번호 없이 종료하며
계정·비밀번호·버전·세션을 변경하지 않는다. 최초 생성은 salt 16바이트와 scrypt
N=32768/r=8/p=3/dkLen=32/maxmem=64MiB를 사용한다. 일반 네 자리 PIN의 pepper
방식과 달리 관리자 비밀번호는 별도 긴 비밀번호를 사용하는 기존 명세를 따른다.

생성 요청은 singleton UNIQUE를 대상으로 ignore-duplicates를 사용한다. 동시에 두
명령이 실행돼도 DB가 하나만 삽입하고 다른 명령은 기존 계정을 확인한다. PATCH나
merge-duplicates로 기존 비밀번호를 갱신하지 않는다. 재시도·타임아웃 후 다시 실행해도
같은 원칙을 따른다. HTTP redirect를 거부하고 timeout 10초와 no-store를 설정한다.
오류 원문·키·평문 비밀번호·해시를 CLI 결과나 오류 로그로 출력하지 않는다.

관리 범위는 공부 종류 추가·수정·삭제와 팀원 내보내기, 기존 PIN 초기화를 포함한다.
이전 명세의 '종류 추가만'을 최신 요청으로 수정했다. 종류 수정은 기존 ID를 유지한다.
기록이 참조하는 종류 삭제는 기존 DB의 RESTRICT를 유지해 CATEGORY_IN_USE 409로
거부한다. 기록을 연쇄 삭제하지 않는다. 팀원 내보내기는 기존 합의대로 계정과 기록을
함께 영구 삭제하며 확인창 취소를 기본 포커스로 둔다. 이 관리 API·화면은 아직 미구현이다.

공식 문서 확인: Supabase changelog(2026-10-23 확인)의 TLS cipher 중단 및 PostgreSQL
17.11 변경을 확인했다. Node 24 fetch의 기본 TLS와 일반 테이블 INSERT만 사용하며
legacy 암호·확장 타입을 추가하지 않는다. Supabase upsert 문서의 ignoreDuplicates와
기존 DB의 singleton UNIQUE를 사용해 계정 덮어쓰기를 막는다.

- https://supabase.com/docs/reference/javascript/upsert
- https://supabase.com/changelog/cbc-tls-ciphers-deprecated

검증은 실제 scrypt 생성·검증, salt 무작위성, 기존 계정 불변, 동시 요청의 충돌 처리,
오류 비노출을 포함한다. 대체 HTTP 전송 검사이며 운영 관리자 생성이나 실제 PostgreSQL
동시 연결 검사를 대신하지 않는다. 화면 변경이 없어 새 캡처는 없다.

검증 결과: 포맷·린트·타입 검사와 기존 단위 검사 18개 + 관리자 명령 검사 4개 통과.
운영 DB에서는 트랜잭션 안에서 singleton 충돌 시 기존 로그인·해시·salt·버전 불변을
검사한 후 ROLLBACK했고, 실제 관리자 계정 수는 0개로 유지됐다.
운영 빌드는 컴파일·타입·정적 페이지 생성 후 Next.js 16.4.0의 알려진 취약점을 알리는
SecurityFatalError로 종료 코드 1을 반환했다. 빌드 통과나 배포 가능으로 보고하지 않는다.
의존성 보안 조치와 운영 관리자 자격증명 설정·수동 실행이 남았다.

npm audit 추가 확인에서는 총 6개(critical 1, high 5)가 보고됐다.
Next.js의 수정 가능 버전은 16.4.2로 보고됐지만 이번 관리자 변경에서 자동 변경하지 않았다.
ESLint 하위 의존성 문제도 별도 호환성 검토가 필요하다.

2026-10-23 후속: 보안 PR #27 병합 후 최신 main의 Next.js 16.4.2를 반영해 재검증했다.
운영 빌드도 종료 코드 0으로 통과해 이전 SecurityFatalError 차단은 해소됐다.
개발 도구의 미수정 high 경고 및 운영 관리자 미생성 상태는 여전히 유지한다.
