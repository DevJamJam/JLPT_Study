# JLPT Study Room — MVP 실행 명세 v2.1

2026-10-07 · 개인 개발 · 일반 사용자 최대 15명 + 별도 관리자 1명 사용 예정 · Claude/Codex 전달용

## 0. 근거와 문서 상태

확정한 사용자 요구와 반응형 디자인을 기준으로 작성했다. 구현 완료 보고서가 아니라 개발 실행 명세다.

**최신 사용자 지시 우선:** 링크 기반 자율 가입, 사전 명단·승인 없음, 7일 MVP, 휴대폰/iPad/PC 동기화, 실제 사용과 피드백 기반 포트폴리오, 대상 기종 iPhone SE3, 이메일 대신 닉네임+숫자 4자리 PIN 선호.

**원본 유지:** 대표 이모티콘, 하단 5개 메뉴, 공동 월간/내 월간/내 주간, 공부 기록 추가·수정, 개인·그룹 합산, 모바일 우선, 날짜 셀 DOM 구현.

**최신 가입 정책:** 링크를 받은 사용자가 직접 닉네임과 PIN을 정해 자율 가입하며 최대 15명까지 가입한다. 사전 명단·지정 닉네임·운영자 승인은 사용하지 않는다.

**확정된 정책과 구현 기본값:** 1개 스터디, 본인 기록 삭제 가능, 월요일 주 시작, 이모티콘 중복 허용, 작은 화면 축약, 조회 시 동기화. 원본에서 확정됐던 사항으로 소급하지 않는다. 변경하면 정책·DB·테스트를 함께 바꾼다.

**배포 전 확인 사항:** 실제 SE3의 iOS/Safari 버전, 운영자 연락 경로, 독자적인 CSS 장식. 이 외의 구현 기본값은 아래 명세를 따른다. 사용자 화면 결정은 이번 대화의 최종 합의를 따른다. 기술적 세부값은 아래 구현 계약으로 고정한다.

## 1. 목적과 범위

소규모 JLPT 스터디 참여자가 공부시간·내용을 기록하고, 개인 및 공동 달력으로 공부 흔적을 확인하는 웹앱. 로그인은 여러 기기에서 같은 사용자 기록을 찾기 위한 수단이다. 이메일·실명·전화번호를 수집하지 않는다.

### v1 필수

- 닉네임+4자리 PIN 가입/로그인, 세션 유지, 로그아웃, PIN 변경.
- 운영자가 미리 생성한 스터디 1개, 일반 사용자 가입 최대 15명. 관리자 1명은 group_members에 등록하지 않는다.
- 본인 공부 기록 생성·조회·수정·삭제.
- 홈의 오늘/이번 주, 오늘 공부한 멤버, 최근 내 기록. 월별 요약은 내 기록 화면에서 제공.
- 공동 월간/내 월간/내 주간 및 날짜 상세.
- 스터디 주간 현황, 개인 월별 대시보드·공부일·기록 목록.
- 모바일/iPad/PC 대응, HTTPS 배포, 실제 기기 간 데이터 확인.
- 서버 권한·동시 수정·중복 전송 검증, 사용자 피드백 기록.

### v1 제외

다중 스터디 생성 UI, 이메일 인증, 소셜 로그인, 채팅, 랭킹, 목표·달성률, 스트릭, 푸시, 오프라인 기록, 서비스워커·설치형 PWA, 이미지 업로드, 목표 달성 차트, WebSocket 실시간 push. 월별 공부 종류 막대와 스터디 회원별 7칸 막대, 별도 관리자 웹의 종류 추가·사용자 삭제·PIN 초기화는 포함한다.

피드백은 외부 설문/기존 스터디 연락 채널을 사용하고 앱에 링크만 제공한다.

## 2. 저장소와 기술 구조

| 항목 | 선정 | 이유 |
|---|---|---|
| GitHub 소유 | 개인 계정 `jlpt-study-room` 레포 | 혼자 개발·운영. 이용자 15명은 코드 협업자가 아님 |
| 앱/서버 | Next.js App Router + TypeScript | 같은 프로젝트에서 화면과 PIN 인증 API를 구현. 별도 서버 프로젝트 불필요 |
| 백엔드 데이터 | Supabase Postgres | 여러 기기의 공용 DB. 이번 버전은 Supabase Auth를 사용하지 않음 |
| 인증 | 서버에서 PIN 검증 + DB 세션 + HttpOnly 쿠키 | PIN이나 세션을 JS 저장소에 보관하지 않음 |
| 서버 데이터 상태 | TanStack Query | 저장 후 화면 갱신, 재접속/포커스 시 재조회 |
| 알림 | SweetAlert2 확인창 + Toast | 삭제·초기화 확인과 간단한 완료 안내를 같은 라이브러리로 처리 |
| UI 상태 | React 로컬 상태/Context | 서버 데이터를 Zustand에 복제하지 않음 |
| 스타일 | CSS Modules + 공통 CSS 변수 | 인라인 스타일·Tailwind 없이 분리 |
| 호스팅 | Vercel Hobby | 개인 비상업용 서비스 전제. 기본 HTTPS 주소 사용 |

**구조:** 브라우저 → 동일 출처 Next.js API → 세션/멤버/소유자 검증 → Supabase DB.

브라우저가 Supabase DB에 직접 요청하지 않는다. 별도 Express/Nest, SMTP, 메일 발송 서비스는 도입하지 않는다. 로그인 방식이 바뀌었으므로 이메일 OTP 설계는 폐기한다.

현재 Next.js의 기본 지원 하한은 Safari 16.4. SE3는 최신 iOS로 업데이트할 수 있는 기종이므로 **최소 iOS/Safari 16.4 이상을 지원 기준 기본안으로 선정**한다. 실제 참여자의 OS 확인 후 적용한다. SE3라고 모든 OS에서 자동 호환되는 것은 아니다. iOS 15 지원은 현재 범위에 포함하지 않는다.

## 3. 닉네임+4자리 PIN 인증 계약

### 사용자에게 보이는 흐름

첫 사용: 링크 접속 → 직접 닉네임 입력 → 4자리 PIN/확인 → 대표 이모티콘 선택 → 공동 공개 안내 확인 → 가입 → 홈.

재사용/다른 기기: 같은 닉네임+같은 PIN → 같은 사용자 ID → 동일 기록 조회.

브라우저 데이터가 지워져도 DB 기록은 유지되며 다시 로그인하면 복구된다. 닉네임을 입력하는 것만으로 타인 계정에 입장할 수 없다.

### 계정 운영

- 링크 접속 후 원하는 닉네임과 PIN을 설정해 자율 가입한다. 가입 허용 명단·미리 지정한 닉네임·운영자의 승인은 없다.
- 중복 닉네임은 409 NICKNAME_TAKEN과 함께 다른 닉네임 입력을 안내한다.
- 정원에 도달하면 신규 가입에만 409 GROUP_FULL을 반환하고 기존 회원 로그인·기록은 유지한다.
- 링크를 전달받은 외부인도 정원 내에서는 가입 가능하다. 별도 초대 토큰이나 코드로 제한하지 않는다. 이 동작은 링크 기반 자율 가입의 결과다.
- 동일 가입 요청 재전송은 같은 requestId로 처리한다. 같은 요청이 이미 완료됐으면 새 계정을 만들지 않는다. 신규 세션 발급이 필요하면 같은 닉네임+PIN을 검증한다.
- 닉네임은 로그인 ID이므로 v1에서 변경하지 않는다. 표시 이름을 별도로 추가하지 않는다.
- 닉네임: trim+NFC, 2~12 Unicode code point, 줄바꿈·제어문자 금지. 정규화 후 소문자 키로 그룹 내 UNIQUE.
- PIN: 정확히 ASCII 숫자 4자리 문자열. `0123`처럼 선행 0 유지. 숫자 타입으로 변환하지 않는다. UI에서는 “간편 비밀번호(숫자 4자리)”로 안내.
- 생일/전화번호 끝자리 등 개인 정보 사용을 권하지 않는 짧은 도움말 제공. 동일 숫자/연속 숫자도 금지하지는 않음.
- 대표 이모티콘은 선정한 20개 고정 목록(실기기 표시 테스트는 구현 후 수행), 중복 허용. 최신 복합 이모지 자유 입력 제외. 내 기록에서 이모티콘 변경 가능, 과거 달력에도 현재 이모티콘 사용.

### 서버 구현

4자리 PIN은 10,000가지뿐이다. 일반 계정 비밀번호와 같은 강도를 갖지 않는다. 이 설계는 제한된 스터디의 낮은 민감도 기록을 대상으로 하고, 다음 처리를 필수로 한다.

1. PIN은 서버에서 계정별 random salt와 **scrypt**로 해시한다. 서버 환경변수 pepper를 함께 사용한다. 최소 초기 파라미터 N=2^15,r=8,p=3, dkLen=32; Node의 maxmem을 명시하고 배포 런타임에서 부하를 확인한다. 비동기 API를 사용한다. PIN 평문, 단순 SHA256(PIN), PIN 로그 저장 금지.
2. 로그인 시도 제한은 DB에 영속화한다. 서버리스 메모리 Map이나 프론트 타이머만으로 구현하지 않는다.
3. 닉네임 키별 15분 내 실패 5회이면 15분 잠금. 성공 시 해당 실패 카운터 초기화. 없는 닉네임도 동일 키 단위로 시도 제한한다.
4. 출처별 15분 내 인증 시도 30회 상한. 로그인/가입 합산. IP는 호스팅에서 제공하는 신뢰 가능한 값만 사용하고 HMAC 처리해 DB 키로 저장, 원문 보관 금지. 공유 네트워크에서 차단되면 남은 시간과 운영자 문의 안내.
5. 각 요청은 DB의 원자적 시도 예약을 통과한 후 해시 연산을 한다. 병렬 요청으로 실패 횟수 제한을 넘기지 않도록 pending 시도도 예산에 포함한다. 해시 실패/네트워크 오류도 예약 사용량을 회수하지 않는다.
6. 없는 계정도 dummy hash 검증 경로를 사용한다. 닉네임 없음/PIN 틀림을 “닉네임 또는 비밀번호를 확인해 주세요” 하나로 응답.
7. 로그인 성공 시 random 32-byte 세션 토큰 발급, DB에는 SHA256(token)만 저장. 원문은 쿠키로만 전달.
8. 쿠키: `__Host-jlpt_session`, HttpOnly, Secure, SameSite=Lax, Path=/, Domain 없음. 정상 세션 유효기간 로그인 시점부터 고정30일(활동 시 연장 없음), DB expires_at도 동일. 제한 세션은15분, 만료하면0000으로 재로그인. 서버에서 매 요청 credential_version 일치를 검사. 로컬 HTTP 개발은 별도 개발 쿠키 설정. 세션 토큰은 URL/응답 JSON/localStorage에 넣지 않는다.
9. 모든 데이터 API는 쿠키의 세션·만료·그룹 멤버십을 검사한다. 페이지 guard만으로 권한을 처리하지 않는다.
10. 모든 상태 변경 API는 허용된 Origin 일치 검사, JSON Content-Type, POST/PATCH/DELETE만 허용. GET으로 기록·로그아웃·PIN 변경을 수행하지 않는다. 인증 응답과 개인 데이터는 Cache-Control: no-store.
11. 로그인/가입 요청 body·쿠키·PIN·hash를 로그에 남기지 않는다. 사용자 입력 메모는 plain text로 출력.

### 세션·복구

- 새 기기에서 로그인해도 기존 기기는 로그아웃시키지 않는다.
- 로그아웃은 현재 세션만 DB에서 삭제하고 쿠키·Query 캐시를 비운다.
- PIN 변경은 현재 PIN 재확인+새 PIN 두 번. 같은 시도 제한 적용. 변경 후 모든 세션 폐기하고 현재 기기 새 세션 발급.
- PIN 분실: 관리자 웹 /admin/users에서 초기화한다. SweetAlert2 “ ‘닉네임’님의 비밀번호를 0000으로 초기화할까요?” → 취소/초기화. 성공하면 0000 해시 저장, must_change_pin=true, credential_version 증가, 기존 세션 전부 폐기, 로그인 잠금 해제, 완료 Toast. 사용자 본인 인증 화면이나 이메일 절차는 추가하지 않는다.
- 0000 로그인은 제한 세션만 발급한다. 새 네 자리 PIN을 두 번 입력해 변경하기 전에는 공부 데이터 API를 사용할 수 없다. 새 PIN은 0000 금지. 변경 성공 후 제한 세션을 폐기하고 정상 세션 발급. 재접속 시에도 변경 요구 유지.
- 관리자 계정은 일반 가입과 별개로 서버 초기화 명령에서 1개 생성한다. ADMIN_LOGIN_ID와 ADMIN_INITIAL_PASSWORD(12자 이상)는 서버 환경변수로만 전달하고 비밀번호는 salt+scrypt 해시로 저장한다. 관리자 로그인에는 일반 사용자 네 자리 PIN을 사용하지 않는다. 초기화 명령 재실행은 기존 관리자 비밀번호를 덮어쓰지 않는다. 관리자 분실은 서버 전용 복구 명령으로 비밀번호를 변경하고 전 세션을 폐기한다.
- 탈퇴 요청은 운영자 처리: 사용자 기록/멤버/세션/계정을 함께 삭제한다. 계정 삭제로 정원이 1명 비워진다. 로그아웃은 탈퇴 아님.

## 4. 화면과 팝업 흐름

하단 메뉴는 홈 / 달력 / +기록 / 스터디 / 내 기록. +기록은 메뉴 이동이 아니라 공통 입력 팝업을 연다.

| Route | 내용과 동작 |
|---|---|
| /login, /join | 닉네임+PIN 로그인·자율 가입. 공개 범위 안내, 20개 이모지 선택 |
| /change-pin | 초기화 후 강제 변경. 정상 화면으로 우회 불가 |
| / | 오늘·이번 주 공부 시간 카드, 최근 내 기록 5개, 오늘 참여자 |
| /calendar?view=group&month=YYYY-MM | 그룹 월간. mine=내 월간, week=내 주간(week=월요일 날짜) |
| /study?week=YYYY-MM-DD | 이번 주 총 시간·참여 인원, 가입순 회원별 이모지·닉네임·7칸 막대·공부일·시간 |
| /me?month=YYYY-MM | 이번 달 시간·공부일·기록 수 카드, 종류별 시간 막대, 해당 월 날짜별 기록 목록(30건씩 더 보기). 설정은 공통 상단 이모지 버튼 |

날짜 칸 전체를 누르면 날짜 상세 팝업. 모바일 767px 이하 하단 시트, 768px 이상 중앙 dialog. 그룹은 가입순 회원별 기록, 내 보기에서는 본인 기록만. 날짜 상세 기록은 시작 시각 ASC(NULL 마지막), created_at ASC, id ASC. 월별 목록은 날짜 DESC, 각 날짜 안에서는 같은 시각 정렬. 월별 페이지 커서는 date DESC/startTime ASC NULLS LAST/createdAt ASC/id ASC 튜플로 통일한다. 시각을 안 적으면 시각 줄을 생략한다. 본인 기록만 수정·삭제 버튼.

- 날짜 상세 → 추가/수정: 같은 팝업의 내용을 폼으로 전환. 중첩 입력 팝업 금지.
- 추가는 선택 날짜, 하단 +는 서울 오늘을 기본값으로 사용한다. 미래 날짜 상세는 열리지만 추가 버튼은 비활성화한다.
- 상세에서 저장 성공: 상세로 복귀(날짜 변경 시 새 날짜 상세), 달력·목록·통계 갱신 후 Toast. 하단 + 또는 내 기록 목록에서 직접 편집한 경우 성공 시 팝업 닫고 출발 화면 갱신.
- 취소: 상세에서 출발했으면 상세로 복귀, 직접 폼이면 닫기. 입력 변경이 있으면 SweetAlert2 “작성 중인 내용을 버릴까요?” 취소/버리기. 제출 중 닫기·취소·반복 제출 차단.
- 저장 실패: 같은 폼과 입력 유지, 버튼 근처 안내·재시도. 새로고침·브라우저 종료 후 초안 복원은 없음.
- 삭제: 확인 후 성공 시 현재 상세 유지·재조회. 마지막 기록 삭제 시 빈 상태 표시.
- popup query: 날짜 상세는 date=YYYY-MM-DD&scope=group/mine, 입력은 panel=new/edit&recordId=UUID. 최초 팝업 열기는 push, 내부 화면 전환은 replace. 닫기는 출발 URL로 복귀. 직접 URL 접속이면 popup query만 제거해 부모 화면 유지.
- 뒤로가기·Escape·배경 클릭·닫기 모두 같은 취소 규칙. history 변경 전 입력 폐기 확인을 공통 처리. 강제 새로고침은 브라우저 기본 이탈 안내만 사용하고 복원 보장 안 함.
- 월·탭·스크롤은 팝업 전후 유지. 팝업 focus trap, 배경 inert, 닫힌 후 날짜/출발 버튼에 포커스 복귀. SweetAlert2가 떠 있는 동안 원래 팝업 포커스 트랩 일시 중단.
- 로그인 후 returnTo는 같은 서비스 내부 경로만 허용. 잘못된 기간 query는 현재 기간으로 replace. 유효하지 않은 popup 날짜·UUID는 안내 후 popup query 제거.
- 공동 공개: 닉네임·이모지·날짜·시작 시각·공부 시간·종류·공부량·메모. PIN·해시·세션은 공개하지 않음. 메모 아래 “스터디원에게 공개됩니다.” 표시.

### 알림과 빈 상태

완료 Toast는 SweetAlert2 toast=true, position=top, timer=2500, 확인 버튼 없음. 키보드와 안전 영역을 고려한다. 삭제·초기화·작성 내용 버리기는 SweetAlert2 확인창. 잘못된 입력은 필드 아래, 저장 실패는 저장 버튼 근처, 조회 실패는 해당 영역에 재시도 버튼. 조회 실패를 0으로 표시하지 않는다.

기록 없음: **“아직 기록이 없어요. 공부 기록을 남겨 보아요.”**와 기록 추가 버튼. 로딩은 skeleton, 오류는 재시도. 기존 조회 데이터가 있으면 남겨두고 갱신 실패 안내.

## 5. 공부 기록 정책

| 필드 | 타입·제약 | 표시 |
|---|---|---|
| study_date | date, 필수, 2000-01-01~서울 오늘 | 과거 가능·미래 금지 |
| start_time | nullable time, HH:mm, 00:00~23:59 | 선택. 시각 미입력 시 표시 생략 |
| minutes | integer 1~1440, 필수 | 시간/분 입력을 분으로 변환. 24시간일 때 분=0 |
| categoryId | UUID, 필수 | study_categories에 등록된 공부 종류 ID |
| quantity | nullable integer 1~99999 | 선택. 입력하면 단위도 필수 |
| quantity_unit | nullable enum item/page/question | 개 / 쪽 / 문제. quantity와 함께 NULL이거나 함께 값 존재 |
| memo | trim 후 최대 500 Unicode code point, nullable | plain text, HTML 실행 금지 |

- 시작 시각은 실제 공부한 시각이고 저장 시각과 다르다. 종료 시각은 추정해 표시하지 않는다. 자정을 넘기는 공부는 선택한 study_date에 시간 전체를 합산하며 자동 분할하지 않는다. 시작 시각이 겹쳐도 막지 않는다.
- 하루 여러 건 가능. 본인 하루 합계 1440분 이하. 수정은 기존 시간을 빼고 새 날짜/시간 적용.
- DB 함수는 해당 멤버 행 lock 후 생성/수정/삭제를 처리, 같은 사용자의 동시 요청을 직렬화해 일일 상한 준수.
- 최초 저장 전에 만든 record UUID를 응답 유실·재시도까지 유지. 기존 ID/같은 원본 생성 요청 재전송은 현재 결과 반환, 다른 내용은 CONFLICT. 중복 2건 생성 금지.
- record에는 원본 생성 내용의 fingerprint를 저장해 생성 재전송을 검증한다. 이미 편집된 기록도 동일 원본 생성 재전송으로 되돌리지 않는다.
- 편집/삭제는 version 정수 compare-and-swap. 다른 기기가 먼저 편집하면 409 CONFLICT, 자동 덮어쓰기 금지. 새 값 확인 후 재시도.
- 저장 성공 확인 후만 닫기·성공 표시. 실패하면 입력 유지. 네트워크 오류 후 재시도에서 ID 유지.
- 삭제는 확인 후 영구삭제. 통계·공부일·달력 반영. 마지막 기록을 지우면 그날 본인 아이콘 제거.
- 본인만 수정/삭제. 요청 body의 user_id를 신뢰하지 않고 세션에서 결정.

## 6. 날짜·달력·통계

- 날짜는 Asia/Seoul 기준, 주는 월~일. study_date는 YYYY-MM-DD date, 생성/수정 시각은 UTC timestamptz.
- 합산은 created_at이 아니라 study_date 기준. 주 범위는 월요일~다음 월요일 미만, 월은 1일~다음 달 1일 미만.
- 월간 7열/42칸 고정, 이전·다음 달 날짜는 흐리게 표시하고 상세 진입 가능. 표시 그리드 전체 기간 조회.
- 달력 날짜는 실제 연월과 월요일 시작 기준으로 계산한다.
- 공동 아이콘은 날짜별 기록 있는 user_id DISTINCT, 가입순. 여러 기록도 같은 사람 아이콘은 1개.

| 화면 폭 | 직접 표시 상한 | 15명 기록 시 | 셀 최소 높이 |
|---|---:|---|---:|
| 320~374px | 3명 | 3개 +12 | 88px |
| 375~767px | 3명 | 3개 +12 | 108px |
| 768px 이상 | 11명 | 11개 +4 | 140px |

+N은 전체 고유 참여자 수-직접 표시 수. 날짜 셀 버튼 내부 표식으로 표시, 중첩 버튼 금지. 날짜 전체 클릭 시 전원 상세. 사용자와 확정한 모바일 3명 축약 규칙을 적용한다.

SE3는 375px 세로 화면 기준을 우선 검증하고 320px는 확대·좁은 화면에 대한 추가 레이아웃 검증이다. SE1/Safari15 지원 완료를 의미하지 않는다.

- 내 월간은 기록 있는 날 이모티콘 1개+하루 합계. 좁은 칸은 80분처럼 표기, 상세는 1시간 20분.
- 개인 오늘/주/월/전체=sum(minutes), 공부일=COUNT(DISTINCT study_date).
- 공동 날짜/주 합계=그룹 내 전원 합. 기록 없는 멤버도 주간에 0으로 표시.
- 오늘은 테두리·레이블, 선택 날짜는 별도 배경. 본인 누적 컬럼을 수동 증감하지 않고 기록 DB에서 집계.

## 7. DB 모델과 접근 제어

단일 그룹이지만 study_records에 group_id를 유지해 소속과 권한을 명확히 한다. 목표·통계 집계 테이블은 만들지 않는다. 재시도 처리용 요청 이력은 별도 유지한다.

| 테이블 | 주요 필드·제약 |
|---|---|
| study_groups | id UUID PK, name, max_members=15, created_at |
| users | id UUID PK, nickname, nickname_key UNIQUE, emoji 고정 선택지, created_at |
| user_credentials | user_id PK FK users CASCADE, pin_hash, salt, hash_params, credential_version, must_change_pin boolean default false |
| group_members | group_id FK, user_id FK users CASCADE, joined_at, PK(group_id,user_id), UNIQUE(user_id) |
| signup_requests | request_id UUID PK, user_id FK users CASCADE, request_fingerprint; 가입 성공만 같은 transaction에서 저장, PIN/요청 body 저장 금지 |
| sessions | token_hash PK, user_id FK CASCADE, expires_at, mode normal/change_pin, credential_version, created_at |
| auth_attempts | id UUID, kind, nickname_hmac, source_hmac, reserved_at, outcome; 원자적 제한용 |
| study_records | id UUID PK, group_id/user_id 복합 FK group_members CASCADE, study_date, minutes, category_id FK study_categories RESTRICT, start_time nullable, quantity nullable, quantity_unit nullable, memo nullable, version default1, create_fingerprint, created_at, updated_at |
| auth_limits | key text PK, window_started_at timestamptz NOT NULL, failures int NOT NULL default0, blocked_until timestamptz NULL |
| source_limits | key text PK, window_started_at timestamptz NOT NULL, reserved_count int NOT NULL default0 |
| record_requests | id UUID PK, user_id UUID NOT NULL FK users CASCADE, fingerprint text NOT NULL, record_id UUID NULL FK study_records SET NULL, deleted_at timestamptz NULL, created_at default now() |
| admin_reset_requests | request_id UUID PK, actor_admin_id UUID NOT NULL FK admin_accounts CASCADE, target_user_id UUID NOT NULL FK users CASCADE, fingerprint text NOT NULL, completed_at timestamptz NOT NULL default now() |

| admin_accounts | id UUID PK, singleton boolean NOT NULL default true UNIQUE CHECK(singleton=true), login_id UNIQUE, password_hash, salt, hash_params, credential_version, created_at |
| admin_sessions | token_hash text PK, admin_id FK admin_accounts CASCADE, credential_version, expires_at, created_at |
| study_categories | id UUID PK, name, name_key UNIQUE, seed_key nullable UNIQUE, sort_order UNIQUE, created_at |

계정 삭제는 운영자 작업이며 로그인한 스터디원은 타인 계정을 삭제할 수 없다. 데이터 정리 후 가입 인원은 현재 group_members 수로 계산한다.

인덱스: study_records(group_id,study_date,user_id), study_records(user_id,study_date DESC,start_time ASC NULLS LAST,created_at ASC,id ASC), sessions(expires_at), auth_attempts(nickname_hmac,reserved_at), auth_attempts(source_hmac,reserved_at).

**이번 버전의 권한 경계는 Next.js 서버다.** Supabase Auth JWT를 쓰는 브라우저 RLS 구조로 설명하지 않는다.

- 모든 테이블 RLS 활성화, anon/authenticated의 테이블·함수 접근권한 제거. 브라우저 DB 직접 읽기·쓰기 모두 차단.
- 서버 전용 DB 자격증명/service_role은 RLS를 우회하므로 서버에서 세션·멤버십·본인 소유를 반드시 검증. 'RLS 켰으니 서비스키도 보호된다'고 가정하지 않음.
- server-only 모듈에 DB client를 두고 NEXT_PUBLIC_*에 비밀키 저장 금지. 반환 DTO에 credential/session 정보 포함 금지.
- 서버 전용 RPC도 service_role만 실행 허용. 일반 공부 RPC의 actor_user_id는 서버가 일반 세션 검증 후 주입하고 RPC에서도 그룹 소속·소유권 검사. 관리자 RPC에는 별도 관리자 세션에서 얻은 actor_admin_id를 전달하고 관리자 존재·권한을 검사한다.
- 비회원은 공동 기록도 읽지 못함. 관리자 여부를 클라이언트에서 전달받지 않음.

### 트랜잭션 함수 계약

- `reserve_auth_attempt`: 닉네임/출처 lock을 고정 순서로 취득, 시간 범위 내 예약·실패·pending 수로 제한, 예약 ID 반환. login/join/PIN변경 공통 적용.
- `complete_join`: 가입 requestId 확인→group 행 lock→정원·닉네임 중복 확인→user/credential/member 생성을 단일 transaction. 14명에서 2명 동시 가입이면 1명만 성공.
- `save_record`: group 행→actor 멤버 행 lock→필드·소유자·version·일합계 검증→저장된 행 반환.
- `delete_record`: group 행→actor 멤버 행 lock→소유/version 검사→삭제. 재시도 시 이미 삭제된 기록은 성공 처리 가능.
- `change_pin`: 현재 credential_version 재검사→새 해시 저장→모든 세션 폐기→현재 새 세션 생성. 기존 로그인 해시 검증 후 세션 생성 transaction에서 credential_version을 재검사해 변경 전 PIN으로 늦은 세션 생성 방지.
- 만료 sessions와 auth_attempts 24시간 이전 데이터는 운영 정리 명령으로 삭제. 접속 시 만료 여부는 정리 실행과 무관하게 검사. 삭제된 세션은 재생성하지 않는다.

## 8. API 계약

응답은 성공 `{data}` / 실패 `{error:{code,message}}`. 개인정보는 no-store. 날짜 범위는 시작 inclusive/끝 exclusive.

| API | 계약 |
|---|---|
| POST /api/auth/join | requestId,nickname,pin,pinConfirm,emoji → 계정 생성+쿠키. 닉네임중복409/정원초과409를 명확히 구분 |
| POST /api/auth/login | nickname,pin → 쿠키+공개 프로필. 실패401, 제한429 |
| GET /api/auth/me | 공개 프로필·그룹, 세션 없으면401 |
| POST /api/auth/logout | 현재 세션 폐기+쿠키 제거 |
| PATCH /api/auth/pin | currentPin,newPin,newPinConfirm → 전 세션 폐기+새 쿠키 |
| PATCH /api/me/emoji | 고정 선택지의 값만, 본인 변경; 이모지 색상은 서버 상수에서 파생 |
| GET /api/members | 공개 멤버 정보, 가입순 |
| GET /api/records | 기간 상세: scope=mine/group와 from/to 필수, 최대42일·해당 범위 전체. 개인 월 목록: scope=mine&month=YYYY-MM&limit=30&cursor. 두 방식 동시 사용 금지. cursor는 study_date DESC/start_time ASC NULLS LAST/created_at ASC/id ASC 튜플. 월 경계를 넘지 않음 |
| GET /api/records/:id | 같은 그룹 조회, 수정은 본인만 |
| POST /api/records | id,studyDate,minutes,categoryId,quantity,quantityUnit,startTime,memo → 저장한 record |
| PATCH /api/records/:id | 필드+expectedVersion → 변경한 record |
| DELETE /api/records/:id | expectedVersion → 삭제 결과 |
| GET /api/summary | 홈의 오늘/이번 주, 오늘 그룹 합계·참여자, 최근 내 기록5개. 정확한 응답 타입은 17절 |
| GET /api/calendar | scope=mine/group, from/to 최대42일. Day 배열 |
| GET /api/study | week=월요일 날짜. WeekMember 배열·그룹 합계 |
| GET /api/me/dashboard | month=YYYY-MM. MonthSummary |
| POST /api/auth/complete-reset | 제한 세션, newPin/newPinConfirm. 성공 후 정상세션 |
| GET /api/admin/members | 관리자 세션만; 일반 사용자 목록·credentialVersion 조회, 공부 기록 제외 |
| DELETE /api/admin/members/:id | 관리자 세션만; 계정·기록 영구 삭제, 24절 트랜잭션 계약 |
| GET /api/categories | 정상 사용자 또는 관리자 세션 → Category[] |
| POST /api/admin/categories | 관리자만; name → Category, 중복409 |
| POST /api/admin/auth/login | loginId,password → 관리자 쿠키 |
| GET /api/admin/auth/me | 관리자 세션 확인 |
| POST /api/admin/auth/logout | 관리자 세션 폐기 |
| POST /api/admin/members/:id/reset-pin | requestId,expectedCredentialVersion. 관리자 전용 세션만 가능 |

주요 오류: UNAUTHENTICATED(401), FORBIDDEN(403), NOT_FOUND(404), VALIDATION_ERROR(400), CONFLICT(409), DAILY_LIMIT(409), RATE_LIMITED(429). DB raw error 노출 금지.

공동 월간은 필요한 date/user/minutes만, 날짜 상세는 categoryId/categoryName/quantity/memo 포함. 무제한 공동 전체 기록·select * 금지. 모든 period query는 실제 날짜 파싱/길이 확인.

## 9. 갱신·동기화

Query key에는 user/group/화면 모드/기간 포함. sessions/PIN을 Query에 저장하지 않음.

- staleTime=0, 화면 mount/포커스/네트워크 재연결에서 재조회, 수동 새로고침 제공.
- 기록 저장/삭제 후 month/day/week/summary/records 관련 key 무효화하고 active query 재조회.
- 이모티콘 변경은 members 포함 갱신. 로그아웃은 전체 캐시 제거.
- 앱이 열린 채 서울 자정을 지나면 visibility 복귀/갱신 시 오늘·주·월 재계산.
- 저장한 기기는 즉시 갱신. 다른 기기는 화면 복귀/갱신 시 최신 DB를 봄.
- 무조작 상태의 다른 기기에 즉시 push하는 동기화는 v1 범위 밖. 기기마다 로컬 기록을 따로 저장하는 방식은 금지.

## 10. 디자인·반응형·접근성

월간은 핑크·격자·둥근 테두리, 주간은 라벤더·노트 스타일을 적용한다. CSS와 DOM으로 구현한다.

CSS 토큰 기본값: bg #FFF7FB, surface #FFFFFF, primary #C56C91, lavender #AE91C4, text #352B3F, muted #6F6178, border #E7D6ED, card-radius 16px, spacing 4px 배수. 흰 글자 버튼 배경은 #8C3A60처럼 충분히 어두운 색으로 별도 선정하고 대비 측정.

- 본문·입력 16px 시스템 폰트. 제목 장식 폰트는 선택, 본문 가독성 우선.
- 320~767px: 하단 5탭, 본문 좌우8px, 버튼44px 이상. 월간 가로스크롤 없음.
- 768~1023px 패드: 여백24px. 1024px 이상 컴퓨터: 본문 max-width1280px, 여백32px. 상세는 768px 이상 중앙 dialog. 시안의 고정 크기 프레임을 실제 앱에 적용하지 않고 화면 너비에 맞춘다.
- 내 주간: 모바일 월~일 세로 카드7개, 패드2열(일요일은 마지막 줄 전체), 컴퓨터7열. 같은 줄노트 컴포넌트·컬러·장식을 사용하며 기록 없는 날도 유지.
- 스터디 주간: 모바일과 PC 모두 멤버별 카드와 7칸 막대. 넓은 화면은 카드 2열, 데이터 생략 없음.
- 날짜 셀 전체 버튼, 내부 중첩 버튼 금지. aria-label에 날짜/참여수/시간.
- 장식 alt 빈 값, 키보드 포커스 표시, dialog 열림/닫힘 포커스 복귀, Escape/닫기.
- 모바일 키보드가 떠도 입력과 저장을 스크롤로 접근 가능. 하단 메뉴가 마지막 필드를 가리지 않음.
- 375px SE3 실기기 우선, 320/430/768/1440px도 확인. 320px viewport 테스트가 구형 SE1 지원 증거는 아님.

## 11. 폴더 구조·작업 순서

```text
src/app/             화면 route, layout, api/**/route.ts
src/features/        auth, records, calendar, statistics, profile, admin, categories
src/components/      Button, Field, BottomNav, CalendarGrid, RecordCard, MemberCard
src/server/          session, pin, rateLimit, authorization, db, dto
src/lib/             queryClient, apiClient, dates, validation
src/styles/          tokens.css, global.css
supabase/migrations/ tables, indexes, grants, transaction functions
scripts/             운영자 계정 복구, 백업·정리 명령
tests/              unit, server integration, e2e
docs/               execution-spec, decisions, feedback, releases, blog
```

버전은 착수 시 공식 지원 정보를 확인하고 lockfile로 고정. API를 Node runtime에서 실행해 scrypt 호환을 확보. 핸들러마다 권한 코드를 복붙하지 않고 공통 인증·DTO 계층 사용.

| 일차 | 완료 기준 |
|---|---|
| 1 | SE3 OS 확인, 프로젝트·DB·cookie 로그인→기록1건→다른 기기 조회 최소 경로 |
| 2 | PIN해시·시도제한·가입정원·세션, CRUD/권한/중복/경합 검증 |
| 3 | 홈·내 기록·날짜 상세·합산·Query 갱신 |
| 4 | 공동/개인 월간·42칸·+N·월 이동 |
| 5 | 내 주간·공동 주간·이모티콘/PIN 변경·기기 간 갱신 |
| 6 | SE3/iPad/PC, 모바일 키보드·모달, 날짜·15인 혼잡·네트워크 실패 |
| 7 | 운영 DB 적용/백업, HTTPS, 3명 선행 확인→15명 안내, v1.0 tag/release |

7일은 목표 일정이며 인증·실기기 결함이 남으면 배포 완료로 선언하지 않음. 늦어지면 장식 디테일·이모티콘 편집을 다음 버전으로 미룸. 영속화·본인 식별·시도 제한·권한·기본 반응형은 유지.

## 12. 수용 기준과 테스트

| ID | 검증 | 합격 조건 |
|---|---|---|
| AC01 | 2기기 동일 닉네임+PIN | 동일 user UUID·기록, 계정 중복 없음 |
| AC02 | 닉네임만/틀린 PIN | 입장 불가, PIN·hash 응답 없음 |
| AC03 | 같은 닉네임 병렬 오입력 | DB 제한 적용·429, 서버 인스턴스 바뀌어도 유지 |
| AC04 | 14명 상태 2인 동시 가입 | 1명만 성공, 정원15명 유지 |
| AC05 | 30분+50분 동일날 기록 | 전 화면80분, 본인 아이콘1개 |
| AC06 | 응답 유실 후 POST 재전송 | 같은UUID 1건, 중복합산 없음 |
| AC07 | 두 기기 같은기록 수정 | 오래된version은409, 먼저 저장한 값 보존 |
| AC08 | 하루1430분 후 동시20분 추가 | DB가1440 초과 거부 |
| AC09 | 타인 record ID 변경/삭제 | 403/404, DB 불변 |
| AC10 | 마지막 기록 삭제 | 합계·공부일·달력 아이콘 모두 반영 |
| AC11 | 월말·연말·윤일·다른 기기TZ | 서울 날짜/월~일 기준 일치 |
| AC12 | 동일날15명 | 모바일3+12/태블릿·PC11+4, 상세 전원 표시 |
| AC13 | SE3 실제 Safari | 전탭·입력·CRUD·키보드·새로고침 정상 |
| AC14 | 로그아웃→다른계정 | 이전캐시 없음, 폐기session 사용불가 |
| AC15 | PIN변경/운영자 재설정 | 기존기기 세션 무효, 새PIN으로만 입장 |
| AC16 | 비회원 API/DB 직접 호출 | 기록·credential 접근불가 |
| AC17 | 네트워크 실패 | 입력 유지·재시도·무한로딩 없음 |
| AC18 | 인증없는 변경/외부Origin | 요청 거부, 데이터 불변 |

Vitest: 날짜/합산/validation/+N. 서버·DB integration: 시도제한·정원·권한·중복·version·일합계. Playwright: 로그인·기록·주요반응형. 실기기: SE3/iPad. lint/typecheck/production build 별도 수행. 최신 WebKit 에뮬레이션을 실제 사용자 OS 검증으로 적지 않음.

## 13. GitHub·배포·비용

- **개인 레포로 결정.** 혼자 만든 실사용 프로젝트라는 책임·기여가 명확하다. Organization은 공동 소유·개발자별 권한이 필요한 시점에 검토. 이용자 수 때문에 만들 필요는 없음. 나중에 이동 가능.
- main+짧은 feature branch+PR. 복잡한 develop/Git Flow 제외. 혼자여도 PR에 문제/수정/검증 남김.
- Issue: 인증, CRUD, 달력, 주간, 반응형, 배포 정도로 구분. v1.0과 피드백 개선 v1.3은 별도 release.
- 개발중 private 가능. 공개전 비밀값·실사용자 정보·권리 미확인 이미지를 제거. 공개 데모는 가상15명 사용, 실제그룹 접근권한 제공 금지.
- 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER, RATE_LIMIT_HMAC_KEY, IDEMPOTENCY_HMAC_KEY, ADMIN_LOGIN_ID, ADMIN_INITIAL_PASSWORD, APP_ORIGIN. 서버 전용, NEXT_PUBLIC로 노출하지 않음. .env.example은 이름만.
- Preview는 별도개발DB/가상데이터, 운영DB에 연결하지 않음. 개인데이터·인증 응답 public cache 금지.
- Supabase Free DB500MB, egress5GB, 비활동1주 후pause, Free자동backup 없음(확인일 기준). 텍스트 중심15명은 무료범위 예상이지만 이용량으로 확인.
- Vercel Hobby는 개인 비상업용 조건 확인. 기본도메인으로 도메인구매 불필요. 이번 PIN방식은 SMTP 비용 없음. 무료운영은 한도·계정조건에 따른 예상이며 무조건 영구0원 보장 아님.
- 운영자가 주1회+스키마변경 전 DB 백업. 실제데이터는 비공개보관, git에 올리지 않음. pause로 조회실패하면 오류안내·운영자복구.
- 선택 이모지와 독자적인 CSS 문구류 장식만 사용한다.

## 14. 포트폴리오 기록

개발7일과 사용후 개선기간을 구분: v1.0배포→1~2주사용→피드백→v1.3.

피드백 표: 날짜, 익명사용자ID, 기기/OS, 원문·관찰, 재현, 우선순위, Issue, Before/After, 재확인.

- 모집15명/가입수/실사용수 구분. 주1건 이상 기록한 고유사용자 수로 주간사용을 확인.
- “실사용15명”은 실제사용 확인 뒤 작성. 성능·입력시간 개선율은 실측 없으면 쓰지 않음.
- 대표 문제1~3개만 선정: SE3 입력, 공동아이콘 혼잡, 날짜상세 접근 등. 사용자 피드백→문제정의→설계→PR→재확인 연결.
- 메모/닉네임을 포트폴리오에 노출하지 않음. 스크린샷은 가상데이터.
- 나의 책임: 요구분석, PIN·세션·동기화 설계, 서버권한, 반응형, 검증, 사용자개선. AI가 초안을 만들었다면 실제 도구 사용과 본인의 판단·수정·검증을 구분해 설명.
- 4자리 PIN의 한계를 숨기지 않음. 소규모제한서비스에 맞춘 간편입장과 로그인시도제한을 선택했고, 불특정 다수 서비스/민감정보/다중그룹 확장시 강한인증으로 전환한다는 설계판단을 기록.

## 15. Claude/Codex 작업 지시문

```text
이 문서 전체를 읽고 JLPT Study Room 7일 MVP를 단계별 구현하세요.
최신 요구는 SE3와 닉네임+숫자4자리 PIN입니다. 이메일/소셜로그인을 추가하지 마세요.

1. 지정된 단계만 구현하고 새기능을 추가하지 마세요.
2. Next.js+TypeScript, CSS Modules+CSS변수, TanStack Query를 사용하세요.
3. 브라우저는 같은출처 API만 호출. Supabase service키는 서버전용입니다.
4. PIN은 salt+scrypt+server pepper, 시도제한은 DB원자처리. 평문보관 금지.
5. 세션은 DB검증+HttpOnly쿠키. localStorage에 PIN/세션/공부DB를 저장하지 마세요.
6. 모든 API에 인증·그룹·소유자 확인, 상태변경 Origin검사를 적용하세요.
7. 정원lock, 일합계lock, UUID재전송, version충돌을 생략하지 마세요.
8. 그림은 참고이며 날짜·문자·클릭영역은 DOM. 375px SE3와 좁은화면 정책을 지키세요.
9. UTF-8을 유지하고 기존 한글문자열을 일괄치환/인코딩변환하지 마세요.
10. 원본요구·설계기본값·실제로 확정된 변경을 구분하세요.
11. 테스트는 AC별 실행결과/미실행을 구분. build성공만으로 실기기지원 완료라 하지 마세요.
12. 완료보고는 변경내용, 검증, 남은조건, 다음작업으로 작성하세요.
13. 명세변경이 필요하면 영향과 이유를 decision log에 제시하고 임의대체하지 마세요.
```

## 16. 공식 참고자료 (2026-10-06 확인)

- GitHub 개인레포 권한: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository
- Next.js 브라우저 기준: https://nextjs.org/docs/architecture/supported-browsers
- Next.js 인증 가이드: https://nextjs.org/docs/app/guides/authentication
- SE3 사양: https://support.apple.com/en-us/111866
- 인증/시도제한: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- 해시/scrypt/pepper: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Free: https://supabase.com/pricing
- Vercel Hobby: https://vercel.com/docs/plans/hobby

이 문서의 수치형 정책(5회/15분,30일 등)은 제품설계 기본값이며 공식서비스의 고정제한이라는 의미가 아니다. 버전·가격·플랫폼제한은 착수시 다시 확인해 고정한다.

## 17. 구현 계약 보완 — 개발자가 임의로 채우지 않는 값

### 기본 종류·단위·이모지 색상

아래 종류의 저장 값은 초기 시드의 고유 키다. 실제 기록은 UUID categoryId를 저장하며 목록은 API에서 조회한다. 추가 종류에는 서버가 UUID를 발급한다.

| 표시 | 저장 값 |
|---|---|
| 단어 | vocabulary |
| 한자 | kanji |
| 문법 | grammar |
| 독해 | reading |
| 청해 | listening |
| 회화 | conversation |
| 기타 | other |
| 개 / 쪽 / 문제 | item / page / question |

| 이모지 | 막대 색상 HEX | 이모지 | 막대 색상 HEX |
|---|---|---|---|
| 🐰 | #F2BED2 | 🐱 | #F5CFAC |
| 🐶 | #DFC5AF | 🐻 | #DCC6AE |
| 🐼 | #CBD2DE | 🐨 | #C8CEDC |
| 🦊 | #F1C19F | 🐯 | #F2C89E |
| 🦁 | #EED298 | 🐵 | #DFC0A5 |
| 🐸 | #BFDBAE | 🐙 | #E7B6CF |
| 🐳 | #B7D8ED | 🐬 | #B4DDE1 |
| 🐧 | #C6CDDF | 🐢 | #BBD8BD |
| 🐟 | #BBD8E6 | 🐥 | #F0DEA0 |
| 🌸 | #F2C4D7 | ⭐ | #F1DFA1 |

스터디 막대는 7칸 월~일, 각 날짜 기록 한 건 이상이면 사용자 색상으로 채움. 미기록 #EEEAF0. 오늘 표시를 별도 테두리로 표시. 미래 칸도 비어 있고 아직 오지 않은 날이라는 접근성 설명. 목표 달성률/랭킹 아님. 각 칸 aria-label “10월 6일 화요일, 공부함/기록 없음”. 이모지 중복 허용, 변경하면 과거 표시와 막대 색 모두 최신값 적용.

내 기록 종류별 막대 폭 = 종류 minutes / 선택 월 totalMinutes ×100. 0이면 모든 막대 0%, 나눗셈 금지. 관리자가 등록한 모든 종류 표시, 수치 텍스트를 함께 제공. 막대에는 사용자의 이모지 색을 공통 적용하고 종류 이름으로 구분. 요약·목록 모두 같은 선택 월로 조회. CSS/SVG로 구현하며 별도 차트 라이브러리 불필요.

### API 공통 타입

JSON 필드는 camelCase. UUID는 string, 날짜 YYYY-MM-DD, 월 YYYY-MM, 시작 시각 HH:mm 또는 null, timestamps UTC ISO8601, 분/개수/version은 integer. 모든 nullable 필드는 생략하지 않고 null 반환.

```typescript
type Category = {id:string; name:string; sortOrder:number};
type QuantityUnit = 'item'|'page'|'question';
type Profile = {id:string; nickname:string; emoji:string; mustChangePin:boolean};
type Group = {id:string; name:string; maxMembers:15; memberCount:number};
type Member = {id:string; nickname:string; emoji:string; joinedAt:string};
type RecordInput = {studyDate:string; startTime:string|null; minutes:number; categoryId:string; quantity:number|null; quantityUnit:QuantityUnit|null; memo:string|null};
type StudyRecord = RecordInput & {categoryName:string; id:string; userId:string; groupId:string; version:number; createdAt:string; updatedAt:string};
type Day = {date:string; totalMinutes:number; participants:{userId:string; minutes:number}[]};
type WeekMember = Member & {days:{date:string; minutes:number}[]; totalMinutes:number; studyDays:number};
type MonthSummary = {month:string; totalMinutes:number; studyDays:number; recordCount:number; categories:{categoryId:string; name:string; minutes:number}[]};
type Failure = {error:{code:string; message:string; fieldErrors?:Record<string,string>; retryAt?:string; currentRecord?:StudyRecord}};
```

| API | 성공 data 전체 형태 |
|---|---|
| join / login / auth/me | {profile:Profile, group:Group}. 세션은 Cookie만 사용, 강제변경은 profile.mustChangePin으로 판정 |
| logout | {loggedOut:true} |
| auth/pin / auth/complete-reset | {profile:Profile} |
| me/emoji | {profile:Profile} |
| members | {members:Member[]} |
| records 기간·개인 월 목록 | {records:StudyRecord[], nextCursor:string|null}. 기간조회는 전체 반환·nextCursor=null, 개인 월 목록은 month 필수·limit 최대30 |
| records/:id / POST / PATCH | {record:StudyRecord} |
| DELETE records/:id | {deletedId:string} |
| calendar?scope&from&to | {days:Day[]}. 최대42일, 기록 없는 날짜도0 반환 |
| study?week | {weekStart:string, totalMinutes:number, activeMembers:number, members:WeekMember[]}. days는 항상7개 |
| me/dashboard?month | MonthSummary |
| summary | {today:string, todayMinutes:number, weekStart:string, weekMinutes:number, month:string, monthMinutes:number, groupTodayMinutes:number, todayParticipants:Member[], recentRecords:StudyRecord[]} |
| POST admin/members/:id/reset-pin | {userId:string, mustChangePin:true}. body={requestId:string, expectedCredentialVersion:number}, 운영자 전용 |
| GET admin/members | {members:(Member & {credentialVersion:number; mustChangePin:boolean})[]}. 운영자 전용 |

위 API 경로 앞에 /api/를 붙인다. 초기화 제한 세션은 auth/me, logout, complete-reset만 허용하고 나머지는403 PIN_CHANGE_REQUIRED. complete-reset body={newPin,newPinConfirm}; 현재 PIN 불필요. 일반 PIN 변경은 currentPin 필수.

### 동시 요청과 재시도

- 가입 requestId는 폼에서 한 번 생성. 정규화 nickname+emoji+PIN의 서버 HMAC fingerprint 저장(PIN 평문 저장 안 함). 같은 ID 같은 내용은 기존 결과, 다른 내용은409 IDEMPOTENCY_CONFLICT. 가입 응답을 잃으면 같은 입력으로 재시도. 입력 변경 시 새 requestId.
- 기록 생성 id는 제출 때 생성. 응답 유실로 저장 여부가 불확실하면 입력을 유지하고 같은 내용·ID 재시도 또는 GET id로 결과 확인. 실패 확정 후 내용을 바꾸면 새 ID. 검증 실패는 DB에 결과를 저장하지 않음. create_fingerprint에는 모든 입력 필드 포함.
- 생성 재시도 후 이미 삭제된 ID로 기록이 되살아나지 않게 record_requests(id,user_id,fingerprint,record_id nullable,deleted_at nullable)를 보존. FK record 삭제는 SET NULL. 삭제 재시도도 이 소유자 정보로 확인하며 타인의 삭제 ID는 성공으로 응답하지 않음.
- 수정 충돌409은 currentRecord를 반환. 입력 초안 유지, “다른 기기에서 변경됐어요. 최신 기록을 확인해 주세요.” 안내. 최신값 불러오기는 초안 폐기 확인 후 수행. 자동 덮어쓰기 없음.
- 권한·version 검사는 초기화 transaction에서도 수행. 같은 version 초기화 재전송은 상태를 다시 덮어쓰지 않도록 requestId UUID를 추가하고 admin_reset_requests에 저장. 사용자가 새 PIN으로 바꾼 뒤 늦은 재전송이 와도 다시0000으로 만들지 않음.

### 로그인 제한 상태

nickname 키는 HMAC 정규화 닉네임. auth_limits(key text PK, window_started_at timestamptz NOT NULL, failures int default0, blocked_until timestamptz NULL). source_limits(key text PK, window_started_at timestamptz NOT NULL, reserved_count int default0). auth_attempts outcome=pending/success/failure/system_error. system_error는 PIN 오답 카운터에서 제외하되 source 사용량은 유지. 완료되지 않은 예약은60초 후 failure로 한 번만 전환, 늦은 완료는 무시. pending 때문에 제한된 경우 retryAt은 가장 오래된 pending 만료 시각과 window 종료 시각 중 더 이른 시각으로 계산한다.

닉네임 15분 window는 최초 검증 예약부터 고정(완료 전 pending도 같은 window). 잠금없고 window 지났으면 failures=0으로 시작. 실패+pending 예약>=5면 새 해시검증 예약 불허; 5번째 실패 완료 시 blocked_until=완료시각+15분. pending은 60초 후 실패로 정리해 영구 대기 방지. 잠금 만료 시 failures와window 초기화. 성공은 실패window 초기화하되 다른 pending 예약은 유지. source 30회/15분은 첫 예약부터 고정window, 성공해도 회수하지 않음. PIN 변경 및 제한세션 변경도 포함. 예약과 결과 완료는 row lock으로 원자 처리. 응답429 retryAt은 모든 적용 제한 중 가장 늦게 풀리는 시각. 운영자 초기화는 대상 닉네임 잠금 해제, source 제한은 유지.

### 스키마 타입·기본값

UUID PK/FK는 기본 NOT NULL이며 아래 명시된 nullable FK는 예외다. sessions.token_hash 및 제한 테이블 key는 text PK다. created_at/updated_at은 timestamptz NOT NULL default now(). nickname/nickname_key/emoji/name/hash/fingerprint는 text NOT NULL. hash_params는 jsonb NOT NULL, salt는 base64 text NOT NULL. credential_version과record version은 int NOT NULL default1. minutes는 int NOT NULL CHECK1..1440. study_date date NOT NULL. start_time time(0) NULL(초=0 CHECK). quantity int NULL CHECK1..99999, quantity_unit text NULL CHECK enum 및 quantity와 동시NULL, memo text NULL CHECK char_length<=500. sessions token_hash text PK, expires_at timestamptz NOT NULL, mode text NOT NULL default normal. max_members int NOT NULL default15 CHECK=15. joined_at timestamptz NOT NULL default now(). 일반 users에는 관리자 role을 두지 않는다. admin_accounts는 singleton CHECK와 UNIQUE로 1개로 제한한다. signup/reset/record request 테이블의 fingerprint는 서버 HMAC hex text. DB transaction 내부와 API에서 모두 필드 검증. DB 날짜 오늘 상한은 Asia/Seoul current timestamp로 함수에서 검증.

### 검증 범위와 착수 판단

문서 기준 누락 7건(API 반환값·enum·시도제한·가입재시도·스키마·복귀동작·화면구성)을 보완했다. 최종 화면 흐름, 저장 필드, 조회 API, 권한, 테스트가 연결되도록 명세를 대조했다. 앱은 아직 구현하지 않았으며 실제 SE3/DB/API 테스트 합격을 의미하지 않는다. 구현 착수 가능한 명세이며 완료 판정은 아래 추가 수용 기준까지 실제 실행 후 한다.

| ID | 추가 합격 조건 |
|---|---|
| AC19 | 시작 시각 비워 저장·조회·수정 정상, 입력 시 순서 반영 |
| AC20 | quantity와단위 동시 입력/동시NULL, 월별 카드·막대·목록 합계 일치 |
| AC21 | 일반회원 초기화API403, 관리자 확인창 취소는DB불변,0000로그인은 변경 전 기록API차단 |
| AC22 | 초기화 중 기존로그인 경합, 초기화 재전송 후 PIN변경 보존, 기존세션 무효 |
| AC23 | 날짜팝업→폼→실패 유지→성공 복귀, 입력폐기 확인, 뒤로가기·포커스 정상 |
| AC24 | 이모지20개 색상 매핑·7일막대,0분월 막대NaN없음,375px에3개+N |
| AC25 | 생성→삭제→늦은 생성 재시도 시 부활없음; 동일가입ID 내용변경409 |

최종 배포 전 확인은 실제SE3 OS, 관리자 초기 계정 환경변수·연락경로, 실행한 테스트 결과다. 일차3에 월별대시보드, 일차5에 회원막대·운영자초기화·강제PIN변경을 함께 구현한다.

SweetAlert2 공식 문서: https://sweetalert2.github.io/

## 18. 최종 인계 점검과 컬러 토큰

2026-10-06 재검토 결과, v1.2의 앞뒤 API 차이·홈 범위 차이·추가 테이블 누락·PK 타입 일괄표현·미실행 이모지 테스트 표현을 바로잡았다. v2.1을 단일 구현 기준으로 사용한다. UI는 제공한 디자인 시안과 아래 토큰을 사용하며 문서 예전 버전은 함께 인계하지 않는다.

**착수 판정:** 이 문서만으로 기본 프로젝트·화면·API·마이그레이션·검증 코드를 작성할 수 있다. 운영 환경을 연결하려면 GitHub 레포 접근, Supabase 개발DB 값, Vercel 계정, 관리자 초기 계정 환경변수가 추가로 필요하다. 비밀값은 채팅·문서·git에 넣지 않고 로컬/배포 환경변수에 설정한다. 자격증명이 없는 동안 개발DB 대체나 가상데이터로 UI 작업은 가능하나 운영 동기화 완료로 보고하지 않는다.

**개발도구 선택:** Codex를 주 구현 도구로 사용한다. Claude는 필수 의존성이 아니다. 별도 리뷰가 필요할 때 선택 사용하며 두 도구가 같은 파일을 동시에 수정하지 않는다. 문서로 모든 결함을 미리 증명할 수 없으므로 단계별 서버·DB·화면 테스트가 완료 기준이다. 이용량/완료기간은 보장하지 않는다.

| CSS 변수 | HEX | 용도 |
|---|---|---|
| --bg | #FFF7FB | 전체 배경 |
| --surface | #FFFFFF | 카드·입력·팝업 |
| --surface-soft | #F7F1FA | 보조 영역 |
| --primary | #C56C91 | 포인트·장식·선택 표시 |
| --primary-strong | #8C3A60 | 흰 글자 주 버튼·활성 메뉴 글자 |
| --primary-soft | #F9E5EF | 선택 배경 |
| --lavender | #AE91C4 | 보조 장식 |
| --lavender-soft | #EEE5F5 | 탭·주간 카드 배경 |
| --text | #352B3F | 본문·제목 |
| --muted | #6F6178 | 보조 설명 |
| --border | #E7D6ED | 카드·구분선 |
| --input-border | #97849F | 입력칸 외곽선 |
| --track | #EEEAF0 | 미기록 막대 |
| --focus | #68428A | 키보드 포커스 |
| --success | #38674D | 완료 글자·아이콘 |
| --success-soft | #E8F3EC | 완료 알림 배경 |
| --danger | #A3364E | 오류·삭제 글자 |
| --danger-soft | #FCEBF0 | 오류 배경 |
| --warning | #795516 | 주의 글자 |
| --warning-soft | #FFF3D6 | 주의 배경 |
| --overlay | #352B3F66 | 팝업 뒤 배경40% 불투명 |

본문/흰색 대비13.39:1, 보조설명/흰색5.74:1, 주버튼 흰글자7.27:1, 입력경계/흰색3.43:1을 수식으로 확인했다. 화면 실제 렌더·키보드·모바일 테스트는 구현 후 수행한다.

파스텔 색은 막대·배경에 사용하고 본문 글자로 사용하지 않는다. primary 위에 흰 글자를 사용하지 말고 primary-strong을 사용한다. 오류는 색+문구, 공부일은 색+날짜·공부일 수로 표현. 이모지별 막대20색은17절과 제공 CSS에 동일하게 유지한다. 현재 MVP는 밝은 테마, 다크테마는 추후 별도 토큰을 설계한다.

미래 날짜를 선택해도 기록은 만들 수 없다. 월별 탐색에 다음달 이동은 허용하고 빈 요약을 표시한다. 내 주간은 이전/다음/이번주와 일별 합계·기록을 제공한다. 로그인·가입·강제PIN변경·프로필설정은 본문16px, 입력44px 이상, PIN input type=password inputmode=numeric maxlength=4, 붙여넣기 허용. 등록은 PIN 확인 필요; 강제변경과 일반변경 모두 새PIN확인 필요. 내 설정은 로그인한 화면의 공통 상단에 있는 선택한 이모지 동그라미 버튼을 눌러 팝업으로 연다. /me/settings 별도 화면이나 남긴 기록 옆 설정 버튼을 만들지 않는다. 팝업에서 이모지 변경·PIN 변경·로그아웃을 제공한다. PIN 변경 입력도 같은 팝업 안에서 전환하며 중첩 팝업을 만들지 않는다.

API 성공은 조회·수정200, 신규가입·기록생성201, 같은생성 재시도200. 서버오류500 INTERNAL_ERROR. 삭제된 생성ID 재전송은409 RECORD_DELETED, 삭제 재시도는 같은소유자일 때200. 기본JSON 최대16KB, credentials와private 테이블 DTO 금지. 요청 HMAC은 IDEMPOTENCY_HMAC_KEY와 구분된 canonical JSON(namespace,actor,input) 사용. pending제한/시각 커서/이모지 출력은 구현 후 경계 테스트한다.

구현 첫 작업 지시: v2.1을 읽고 계획과 issue 목록을 작성한 후, 프로젝트·개발DB 마이그레이션·로그인→기록1건→다른기기조회부터 구현. 그다음 달력·팝업·대시보드·운영자 초기화. 단계 완료마다 실행한 테스트·미실행 항목과 변경 파일을 보고하고 docs/decisions에 구현상 확정 세부사항을 기록한다. 이번 문서는 코드를 생성할 수 있는 설계 인계이며 운영 자격증명·실기기 테스트의 대체물이 아니다.


## 19. 확정 디자인과 화면 동작 — 2026-10-06

**디자인 확정:** 사용자 최종 승인 시안을 구현 기준으로 삼는다. 모바일·패드·컴퓨터에서 색과 배경을 새로 만들지 않고 동일한 CSS 변수를 공유한다. 화면 크기에 따라 열 수·여백·메뉴 배치만 변경한다.

| 화면 | 공통 디자인 | 크기에 따른 배치 |
| --- | --- | --- |
| 그룹 월간·내 월간 | 분홍 #F8D0E3 격자 배경, 23px 격자, 보라 #AE91C4 달력 테두리, 같은 월 제목·링 장식 | 모든 기기 7열 날짜, 모바일 가로 스크롤 없음 |
| 내 주간 | 라벤더 #F3EDF8 격자 배경, #FFFCFE 줄노트 종이, #DCEEF5 테이프, 같은 제목·링 장식 | 모바일1열, 패드2열, 컴퓨터7열 |
| 스터디 | 연한 배경과 흰 카드, 선택 이모지별 파스텔7칸 막대 | 모바일1열·넓은 화면2열 멤버 카드 |
| 내 기록 | 밝은 배경과 흰 카드, 분홍·보라 통계 카드·그래프 | 같은 통계·목록을 화면 폭에 맞춰 배치 |
| 홈·로그인·기록 입력 | 기존 시안의 밝은 분홍·보라 톤, 흰 입력 영역, 공통 버튼·글자색 | 폼과 카드 폭만 조정, 달력 격자를 모든 화면에 강제하지 않음 |

- 선택 이모지와 독자적인 CSS 문구류 장식만 사용한다.
- 월간 하단의 “이번 달 🐰 4일 공부 · 4시간 30분”, “날짜를 누르면 내 공부 기록을 볼 수 있어요”, 그룹 달력의 유사 안내·이모지 예시 문구를 표시하지 않는다. 월간 통계가 필요하면 내 기록에서 확인한다.
- 스터디는 주 단위만 제공한다. 월간 전환을 넣지 않는다. 이전 주·다음 주 이동으로 지난 현황을 확인한다. 막대 한 칸은 공부한 하루이며 시간 비율·목표 달성률이 아니다.
- 스터디 아래 “우리의 작은 공부방”, “최대 15명이 함께 기록해요”, “이번 주 8명이 공부했어요 🌸”, “막대 한 칸은 하루를 뜻해요” 설명 카드와 별도 막대 안내 문구를 표시하지 않는다. 15명 가입 제한과 상단 참여 인원 집계는 유지한다.
- 내 기록의 남긴 기록은 선택한 달의 본인 기록 전체를 조회한다. 30건씩 더 보기는 조회 단위이며 총30건 제한이 아니다. 날짜별로 묶고 시작 시각은 입력한 기록에서만 표시한다.
- 남긴 기록 옆 내 설정 버튼은 없다. 로그인한 화면 상단의 내가 고른 이모지 동그라미는 접근 가능한 버튼이며 누르면 내 설정 팝업을 연다. 로그인·가입 화면에서는 개인 설정 진입을 표시하지 않는다.
- 내 설정 팝업에는 닉네임(읽기 전용), 이모지20개 선택·저장, 비밀번호 변경, 로그아웃을 둔다. 이모지 변경은 현재 선택 표시와 저장 후 전체 화면 갱신을 제공한다. PIN 변경은 현재PIN·새PIN·새PIN확인으로 서버 검증한다.
- 설정 팝업도 닫기·Escape·키보드 이동·닫힌 후 원래 이모지 버튼으로 포커스 복귀를 지원한다. 저장 전 변경을 버리는 경우 기존 공통 SweetAlert2 정책을 적용한다.

**컬러 기준 파일:** JLPT_Study_Room_Color_Tokens.css의 역할 색상·20개 이모지 색상·배경·장식 변수를 사용한다. Design Preview의 컬러 코드 페이지와 이 파일을 함께 갱신한다. 장식 색상을 본문·버튼 색으로 임의 대체하지 않는다.

**시안과 실제 기능 구분:** JLPT_Study_Room_Design_Preview.html은 디자인과 팝업 동선을 검토하는 가상 데이터 시안이다. 날짜·기간 이동, 저장, 인증, 비밀번호 변경, 로그아웃, 기기 간 동기화는 실제 구현과 서버 테스트가 필요하다. 시안의 일부 Toast나 기본 확인창을 운영 기능으로 그대로 옮기지 않는다. 운영 확인창은 SweetAlert2, 간략 알림은 Toast를 사용한다.

**이번 문서 점검:** 최신 설정 진입 위치·주간 전용 스터디·월별 전체 기록 조회·하단 문구 제거·기기별 공통 배경과 탭 위치를 반영했다. HTML 구조·스크립트 문법·색상 변수 정의·문서 목차 연결은 정적 점검 대상이다. 실제 브라우저 렌더링·SE3 실기기·DB·API·운영 빌드는 아직 미실행이며 구현 후 수용 기준으로 검증한다.


## 20. 한국 주말·공휴일 날짜 색상

| 날짜 조건 | 날짜 글자 색상 | 우선순위 |
| --- | --- | --- |
| 한국 공휴일·대체공휴일 또는 일요일 | --date-holiday #B63C55 | 1 |
| 공휴일이 아닌 토요일 | --date-saturday #3563A6 | 2 |
| 그 밖의 평일 | 기존 본문 날짜 색상 | 3 |

- 그룹 월간·내 월간·내 주간에 공통 적용한다. 모바일·패드·컴퓨터 모두 동일하다. 월간 요일 제목도 토요일 파랑·일요일 빨강. 날짜 색상만 바꾸고 이모지·공부시간·막대 색은 바꾸지 않는다.
- 토요일과 공휴일이 겹치면 빨강이 우선이다. 오늘 표시 원형은 유지하며 오늘이 공휴일이면 원형도 빨강. 이전·다음 달 날짜도 실제 요일과 공휴일로 판정하고 흐린 배경으로 현재 월 밖임을 구분한다.
- 공휴일 명칭은 날짜 버튼 aria-label 및 PC title, 날짜 상세 제목 옆에서 확인할 수 있다. 작은 날짜 칸 안에 긴 공휴일 이름을 추가하지 않는다.
- 기준 시간대는 Asia/Seoul, 날짜 키는 YYYY-MM-DD. 일본 공휴일을 사용하지 않는다. 대체공휴일을 단순 주말 이동으로 직접 계산하지 않고 공식 데이터에 포함된 날짜를 사용한다.
- 공식 데이터: 공공데이터포털 한국천문연구원_특일 정보 https://www.data.go.kr/data/15012690/openapi.do 의 공휴일 조회 getRestDeInfo. 서버에서 solYear·solMonth 기준으로 조회하고 공휴일 여부 isHoliday=Y인 항목만 사용한다. locdate를 날짜 키로 변환하고 같은 날 여러 명칭은 중복 날짜 없이 배열로 합친다. 발표·반영된 임시공휴일도 같은 데이터에 따라 적용한다.
- API 인증키 HOLIDAY_API_SERVICE_KEY는 서버 환경변수에만 둔다. 브라우저와 공개 git에 노출하지 않는다. 운영 연결 전 활용 신청과 키 발급이 필요하다.
- 서버 캐시 holiday_month_cache: month text PK(YYYY-MM), dates jsonb({YYYY-MM-DD: string[]}), fetched_at timestamptz. 서버 전용 접근. 성공한 월 전체 응답만 원자적으로 교체하며 24시간 이후 요청에서 갱신한다. 페이지네이션의 totalCount를 확인해 모든 페이지를 받는다. 타임아웃·오류·불완전 응답을 빈 공휴일 목록으로 저장하지 않는다.
- 최초 배포 때 당해 연도 월별 공식 데이터를 캐시에 채운다. 월간42칸에 걸친 인접 월도 조회한다. GET /api/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD(로그인 필요, 최대42일)는 {dates:[{date,names:string[]}],status:ready|stale|unavailable}를 반환한다. 연말 인접 날짜는 다음 연도 데이터도 필요하다.
- 공식 조회 실패 시 기존 캐시를 유지하고 status=stale. 캐시가 전혀 없는 월은 status=unavailable로 표시하여 공휴일을 확인한 것으로 취급하지 않는다. 날짜 탐색·기록 기능은 유지하고 간략 Toast로 공휴일 정보를 불러오지 못했음을 알린다. 이전 데이터에 없는 새 임시공휴일은 갱신 전까지 누락될 수 있다.
- 시안은 고정 예시인 2026-10-03 개천절, 10-05 대체공휴일, 10-09 한글날에 적용했다. 시안의 세 날짜 배열을 실제 앱의 공휴일 데이터 전체로 사용하지 않는다.
- 추가 수용 점검: 일반 토요일 파랑, 일요일 빨강, 평일 공휴일 빨강, 토요일 공휴일 빨강 우선, 대체공휴일 빨강, 오늘 테두리 유지, 인접 월·연도 날짜, 조회 실패 시 캐시 유지 및 상태 구분. 실제 API 연결·실기기 검증은 미실행.


## 21. 최종 상단 간격·공통 메뉴·기록 입력 진입

- 모바일 월간과 주간의 시작 위치를 통일한다. 화면 상단부터 흰 공통 헤더64px → 링 장식30px → 제목 영역176px → 동일 간격의 월간/주간 탭 → 기간 이동 → 본문 순서다. 주간 화면에만 남아 있던 상단24px 여백을 제거한다.
- JLPT STUDY ROOM과 선택 이모지 설정 버튼은 격자 위에 직접 놓지 않고 흰 헤더에 둔다. 월간·주간에서 설정 버튼은 동일 위치와 크기를 유지한다. 설정 진입을 제거하지 않는다.
- 패드·컴퓨터도 같은 흰 브랜드/프로필 헤더와 하단5개 메뉴(홈·달력·가운데＋기록·스터디·내 기록)를 사용한다. 상단의 별도 가로 메뉴·기록 버튼·중복 부제는 제거한다. 실제 앱에서는 하단 메뉴가 보이도록 배치하고 본문 끝에 충분한 여백을 둔다. 컴퓨터에서 메뉴 최대 폭은 본문과 맞춘다.
- 기록 입력은 독립 기본 메뉴 화면이 아니라 팝업이다. 하단 가운데＋기록과 홈의＋공부 기록 남기기에서 열면 서울 오늘 날짜가 기본값이다. 달력 날짜 상세의 추가 버튼으로 열면 선택 날짜가 기본값이다. 기존 수정 버튼으로 열면 해당 기록을 채운 같은 입력 폼이다.
- 입력 시안은 검토를 위해 별도로 펼쳐 보이는 것이므로 시안 바깥 제목 아래에 진입 경로를 안내한다. 실제 입력 폼 안에 개발용 설명을 넣지 않는다.
- 선택 이모지와 독자적인 CSS 문구류 장식만 사용한다.


## 22. 패드·컴퓨터 전체 화면 시안과 오늘 기록 진입

- 큰 화면 시안에는 그룹 월간·내 월간·내 주간·스터디·내 기록·홈·로그인·기록 입력 팝업·오늘 내 기록 상세 팝업의9개 보기와 컴퓨터1280px/패드820px 선택을 제공한다. 시안의 보기 선택 버튼은 개발 검토용이며 실제 앱 메뉴에 추가하지 않는다.
- 홈은 인사·오늘/이번주 시간·기록 추가·오늘 참여자·최근 본인 기록을 배치한다. 큰 화면에서는 읽기 폭을 제한하고 통계 카드는 나란히 둔다. 홈의 오늘 내 기록 보기를 누르면 오늘 날짜의 본인 상세 팝업으로 진입한다.
- 로그인은 패드·컴퓨터 모두 중앙 입력 카드(max-width420px). 로그인 전에는 개인 이모지 설정 버튼과 로그인 후 하단 메뉴를 표시하지 않는다. 인증 성공하면 홈으로 이동한다.
- 스터디와 내 기록은 기존 데이터·선택 기간을 공유하며 크기에 맞춰 카드와 통계 배치만 조정한다. 별도 큰 화면용 통계를 만들지 않는다.
- 기록 입력은 별도 페이지가 아닌 팝업이다. 큰 화면은 중앙 dialog(max-width560px), 모바일은 기존 하단 시트. 시안은 배경 위에 입력 폼 전체를 펼쳐 보여 필드·저장 버튼을 확인할 수 있게 한다. 스크롤로 마지막 필드와 저장 버튼에 접근 가능해야 한다.
- 기존 “오늘의 공부 기록” 제목의 보조 시안은 입력 진입 예시였으므로 “공부 기록 입력”으로 정정했다. 실제 기록을 조회하는 오늘 내 기록 상세와 구분한다.
- 오늘 내 기록 상세 진입: 홈의 오늘 내 기록 보기 또는 내 월간의 오늘 날짜 선택. 서울 오늘 날짜의 본인 개별 기록·합계·입력한 시작 시각·공부량·메모와 수정/추가를 제공한다. 그룹 월간의 오늘 날짜 선택은 같은 상세 구조에 스터디 전원 기록을 표시한다.
- 추가·수정은 날짜 상세 팝업 안에서 같은 내용 영역을 입력 폼으로 전환한다. 중첩 팝업은 만들지 않는다. 저장 성공 시 상세 출발이면 해당 날짜 상세로 복귀하고 홈의 직접 추가 출발이면 닫고 홈을 갱신한다.
- 큰 화면의 가상 입력 폼과 로그인 전환은 디자인 확인용이며 실제 인증·저장이 아니다. 시안9개 보기의 DOM 구분·스크립트 문법을 점검하며 실제 표시/서버 동작은 구현 검증에 포함한다.


## 23. 팝업 모서리와 스크롤 구현 기준

- 둥근 팝업의 바깥 틀은 border-radius24px와 overflow:hidden. 바깥 틀 전체에 스크롤을 걸어 사각 스크롤 영역이 모서리 밖으로 나오게 하지 않는다.
- 팝업은 세로 flex 구조로 제목/닫기 영역은 flex-shrink:0, 본문은 min-height:0와 overflow-y:auto. 제목은 고정되고 입력 본문만 스크롤한다. 스크롤바도 본문 안쪽에서 시작하며 둥근 모서리를 침범하지 않는다.
- 화면 전체 어두운 배경은 한 겹. 팝업의 흰 배경·스크롤바·폼 필드가 라운드 밖으로 돌출되지 않아야 한다. 모바일·패드·컴퓨터와 짧은 높이 화면에서 마지막 입력 및 저장 버튼 접근을 검증한다.
- 착수 권고: 별도 Figma 복제 작업 없이 확정 HTML·실행 명세·컬러 CSS를 기준으로 구현할 수 있다. 실제 브라우저에서 시안의 모든 화면·팝업·스크롤을 먼저 확인하고, 구현 단계에서도 동일한 시각 검증을 반복한다. 현재 정적 점검을 실제 브라우저 검증 완료로 간주하지 않는다.


## 24. 관리자 상세 계약 — 관리자 웹·동적 공부 종류·영구 삭제 (2026-10-07)

### 계정과 화면

일반 사용자는 링크를 받아 자유롭게 가입한다. 최대 15명이며 별도 관리자 1명은 정원에 포함하지 않는다. 관리자는 공부 기록을 쓰거나 스터디원 기록·달력·통계를 조회할 수 없다. 관리자 웹은 같은 레포·배포의 별도 /admin 경로로 구현한다. 일반 화면에 관리자 메뉴를 넣지 않는다.

| 경로 | 화면과 권한 |
|---|---|
| /admin/login | 관리자 아이디 + 관리자 비밀번호 |
| /admin/categories | 공부 종류 목록 + 종류 추가 |
| /admin/users | 일반 사용자 닉네임·이모지·가입일 + 삭제/비밀번호 초기화 |

관리자 웹은 휴대폰 1열, 패드·컴퓨터 넓은 카드 형태로 표시한다. 기존 핑크·라벤더 토큰을 공유한다. 관리자 메뉴는 공부 종류 / 사용자 관리 / 로그아웃만 제공한다. 공부 기록 작성 버튼은 없다.

### 공부 종류

기본 7종류는 DB 시드로 생성한다. 관리자만 새 종류를 추가한다. 이름은 앞뒤 공백 제거·NFC 정규화 후 1~20글자, 비교용 키는 소문자로 통일하며 UNIQUE로 중복을 막는다. 추가 순서로 정렬한다. 이번 범위에는 종류 수정·삭제가 없다. 기록 입력은 최신 목록에서 하나를 선택하며 목록 조회 실패는 재시도 안내, 빈 목록이면 저장을 막는다. 추가 성공 후 목록·입력 선택지·내 기록 통계를 갱신한다. 기존 기록의 종류는 유지한다.

### 사용자 영구 삭제

사용자 관리의 삭제 버튼 → SweetAlert2 warning 확인창 → 확인한 경우에만 DELETE 요청. 닉네임은 HTML 삽입 없이 text로 표시한다.

| 항목 | 확정 내용 |
|---|---|
| 제목 | ‘닉네임’ 사용자를 영구 삭제할까요? |
| 본문 | 계정과 모든 공부 기록이 함께 삭제됩니다. 삭제 후에는 복구할 수 없습니다. |
| 취소 버튼 | 취소 — 최초 포커스 |
| 확인 버튼 | 계정·기록 영구 삭제 — 빨간색 |
| 옵션 | icon: warning, showCancelButton: true, focusCancel: true, allowOutsideClick: false |

요청 중 버튼 중복 클릭을 막는다. 취소·Escape는 삭제하지 않는다. 실패 시 사용자 행을 유지하고 오류를 표시한다. 서버 확인 전 성공 Toast를 띄우지 않는다. 성공 후 회원 목록과 집계를 다시 조회한다.

DB 트랜잭션은 그룹 행 → 대상 멤버 행을 잠그고 계정·기록·회원 소속·자격증명·세션·사용자 요청 이력을 함께 삭제한다. 일반 사용자의 가입·기록 저장도 같은 잠금 순서를 사용해 삭제와 경합할 때 고아 데이터가 생기지 않도록 한다. 이미 삭제된 UUID에 대한 재시도는 성공으로 처리한다. 정원은 실제 멤버 수로 다시 계산한다. 삭제된 사용자의 기존 쿠키는 모든 API에서 거부한다. 같은 닉네임으로 재가입해도 새 UUID를 발급하며 이전 기록은 복구하지 않는다. 여기서 영구 삭제는 서비스 DB에서 계정과 기록을 제거하는 뜻이며 운영 백업 보존·만료 정책은 배포 시 문서화한다.

### 관리자 인증과 DB/API 추가

관리자·종류 테이블의 최종 목록은 7절을 따른다. admin_accounts.singleton은 NOT NULL default true UNIQUE CHECK(singleton=true)로 최대 1개를 보장한다. 초기화 명령으로 정확히 1개를 생성한다. 관리자 세션은 별도 HttpOnly/Secure/SameSite=Lax 쿠키이며 고정 8시간 만료, 기존 인증의 시도 제한·Origin 검사·server-only 원칙을 동일하게 적용한다. 관리자 요청의 주체는 admin_id이며 일반 users FK를 사용하지 않는다.

| API | 계약 |
|---|---|
| POST /api/admin/auth/login | loginId,password → 관리자 쿠키; 제한 적용 |
| GET /api/admin/auth/me | 관리자 세션 확인 |
| POST /api/admin/auth/logout | 관리자 세션 폐기·쿠키 제거 |
| GET /api/categories | 정상 사용자 세션 또는 관리자 세션 → Category[] |
| POST /api/admin/categories | name → Category; 중복409, 관리자만 |
| GET /api/admin/members | 관리자만; 일반 사용자 목록·credentialVersion, 공부 기록 제외 |
| DELETE /api/admin/members/:id | 관리자만; 계정과 기록을 원자적으로 삭제 |
| POST /api/admin/members/:id/reset-pin | 기존 requestId·expectedCredentialVersion 계약 유지, 관리자만; 0000 초기화 |

일반 사용자 세션으로 모든 관리자 API는403, 관리자 세션으로 공부 데이터 API는403이다. UI 숨김만으로 권한을 처리하지 않는다. 관리자 대상 삭제·PIN 초기화는 제공하지 않는다. 관리자는 초기화 확인창에서 확인하면 사용자 PIN을 항상0000으로 바꾸며 다음 로그인에서 변경을 강제한다.

### 추가 수용 기준

- 15명 가입 + 관리자1명에서 일반 가입은 정원초과; 사용자 삭제 후 한 명 가입 가능.
- 일반 사용자의 관리자 API 호출 및 관리자의 공부 API 호출은 거부.
- 종류 추가·중복·목록 갱신·새 종류 기록 저장·통계 노출 검증.
- 삭제 취소는 DB 불변; 확인하면 모든 관련 행 삭제·기존 세션 거부·집계 갱신.
- 삭제와 가입·저장 동시 요청에도 정원초과·고아 기록 없음.
- 화면 장식은 CSS로 구현하고 사용자 식별 자료를 공개 파일에 포함하지 않는다.
- 시안은 프런트 동작 예시다. 실제 DB·인증·SweetAlert2 연결·브라우저/SE3 검증은 구현 후 수행한다.


## 25. 커밋과 기술 블로그 작성 기준

이번 개인 프로젝트는 develop 없이 최신 main에서 작업 브랜치를 만든 뒤 PR로 main에 병합한다. 브랜치는 feature/fix/chore와 이슈 번호를 사용한다. 커밋은 type: 한국어 요약 (#이슈번호) 형식이다. CONTRIBUTING.md와 AGENTS.md를 먼저 확인한다.

의미 있는 작업 단위로 커밋하며, 커밋 하나당 기술 블로그 HTML 하나를 작성한다. 글에는 해당 커밋에서 실제 변경하고 확인한 내용만 넣는다. 구성은 문제/목적 → 선택한 방법과 이유 → 핵심 코드와 쉬운 설명 → 실행한 검증과 결과 → 남은 한계다. 기초 개념은 짧은 예시로 설명한다. 실행하지 않은 검증을 성공으로 적지 않는다.

파일은 docs/blog/001-주제.html처럼 순번으로 관리한다. 글과 구현 변경을 같은 커밋에 포함하고, 해당 글이 어느 커밋에 속하는지는 Git 이력으로 확인한다. 커밋 자체 해시를 같은 커밋의 파일에 넣으면 해시가 다시 바뀌므로, 실제 해시는 커밋 후 전달하는 작업 보고에 연결한다. 단순 형식만 맞추려고 커밋을 잘게 쪼개지 않는다.

## 26. 중앙 정렬과 화면 검증

| 대상 | 구현 기준 | 검증 |
|---|---|---|
| 이전/다음 화살표 | 동일한 정사각형 버튼, padding 0, grid place-items:center, line-height:1. 실제 앱은 동일 SVG 아이콘 사용 | 두 화살표의 가로·세로 중심과 크기 일치 |
| 월 제목 | 좌우 동일 폭 버튼 사이에 남은 중앙 영역 사용 | 월 이름 길이가 바뀌어도 중앙 유지 |
| 프로필 이모지 | 원형 버튼 grid place-items:center, padding 0, 이모지 span display:block/line-height:1 | 선택 가능한 모든 이모지가 원의 시각적 중앙에 위치 |
| 팝업 모서리 | 바깥 컨테이너 border-radius+overflow:hidden, 내부만 스크롤 | 스크롤바·배경이 둥근 모서리 밖으로 튀어나오지 않음 |
| 주간/월간 | 공통 헤더·탭·기간 이동 영역 높이와 간격 공유 | 모드 변경 시 상단 요소가 불필요하게 움직이지 않음 |

375px iPhone SE3, 820px 패드, 1280px 컴퓨터에서 화면을 확인한다. 이모지는 OS별 그림 자체 여백이 달라 CSS 중앙 정렬만으로 완벽히 같은 시각적 위치가 보장되지는 않는다. 실제 iOS Safari에서도 확인하고 필요한 최소 보정을 적용한다. 시안의 CSS 수정 여부와 실제 렌더링 검증 완료 여부는 구분해 보고한다.

## 27. 현재 검증 상태와 구현 전 순서

현재 문서는 화면·권한·DB 구조·API 계약을 정의한 설계다. 실제 SQL 마이그레이션 작성·DB 적용·서버 인증·동시 요청·브라우저 렌더링 테스트는 아직 수행하지 않았다.

레포 확인 → 협업 규칙 적용 → DB 마이그레이션 작성 및 제약 테스트 → 인증과 기록 저장 → 관리자 기능 → 화면과 API 연결 → 반응형·정렬 검증 → 빌드·배포 확인 순서로 진행한다. 관리자 비밀번호 길이/8시간 만료 등 기술 기본값은 사용자가 별도로 선택한 UX가 아니라 구현을 위한 제안 기본값이다. 구현 중 변경이 필요하면 이유와 영향을 먼저 설명한다.
