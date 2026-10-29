# JLPT Study Room

JLPT를 준비하는 소규모 스터디를 위한 공부 기록 웹앱입니다. 공부 기록을 달력으로 공유하고, 주간·월간 통계로 돌아봅니다.

## 현재 진행 상태

현재는 **인증·기록 CRUD 화면 완료, 달력 화면 연결 단계**입니다. 가입·로그인·로그아웃, PIN 변경·대표 이모티콘 변경은 실제 API에 연결했습니다. 학습 기록 생성·조회·수정·삭제 API와 입력 팝업·월별 내 기록을 연결했습니다. 달력 화면을 실제 조회에 연결했고 홈·스터디·개인 통계는 후속입니다. `/preview`는 가상 데이터 디자인 검토 화면입니다.

| 항목                               | 상태                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| 기능·권한·화면 설계                | 작성 완료                                                 |
| 모바일·패드·컴퓨터 시안            | Chromium의 세 화면 크기로 검증, 실제 iPhone Safari 미검증 |
| 컬러 토큰·프로젝트·협업 규칙       | 구성 완료                                                 |
| 인증·프로필 API와 화면             | 연결 완료, 운영 배포                                      |
| 학습 기록 생성·조회 API            | 구현, 검증 결과는 PR #47에서 확인                         |
| 기록 입력·서울 날짜 검증           | 생성 API와 입력·월별 목록 화면 연결                       |
| 기록 수정·삭제 API                 | 구현, 검증 결과는 PR #51에서 확인                         |
| 기록 편집·삭제 UI                  | 월별 내 기록에 연결, PR #55 검증 결과 확인                |
| 멤버·달력 조회 API                 | 구현, PR #57 검증 결과 확인                               |
| 달력·공통 메뉴·날짜 상세 화면      | 실제 조회/기록 팝업 연결, PR #59 검증 결과 확인           |
| 통계·관리자 API/화면               | 후속                                                      |
| 포맷·린트·타입·빌드·브라우저·DB CI | 구성 완료, 각 PR의 실제 결과 확인                         |

서버 가입·로그인 흐름과 인증 설정 검증도 추가했습니다. 테스트용 DB 인터페이스로 검증했으며 Supabase 서버 어댑터까지 추가했습니다. POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout을 연결했습니다. 로그인은 공개 프로필·그룹 DTO와 HttpOnly 쿠키를 반환하고, me는 만료를 연장하지 않으며 로그아웃은 현재 세션만 폐기합니다. Vercel 서버 환경변수와 신뢰 출처 헤더를 사용합니다. POST /api/auth/join은 신규201·같은 요청 재시도200을 구분합니다. 가입·로그인 화면도 실제 API에 연결했습니다. 초기화된 PIN의 강제 변경 화면과 API도 연결했습니다. 일반 PIN 변경도 내 설정 팝업과 POST /api/auth/change-pin으로 연결했습니다. 대표 이모티콘 변경은 PATCH /api/me/emoji로 저장합니다. 기록 생성·단건/기간/개인 월 조회 API를 연결했습니다. 기록 입력·월별 내 기록 화면을 연결했고 관리자 인증·달력·통계는 후속입니다.

## MVP 중간점검 — 2026-10-29

| 범위                     | 실제 상태               | 남은 작업                                                      |
| ------------------------ | ----------------------- | -------------------------------------------------------------- |
| 인증·설정                | 배포 완료               | 실제 기기 간 최종 확인                                         |
| 기록 생성·조회·수정·삭제 | 화면/API 배포 완료      | 달력·통계 연결 시 갱신 확인                                    |
| 달력·날짜 상세·공통 메뉴 | 조회 API·화면 연결      | 실제 기기·공식 공휴일 확인                                     |
| 홈·스터디·개인 통계      | 시안 있음               | 집계 API·실제 화면 연결                                        |
| 관리자                   | 초기 생성 명령 있음     | 관리자 생성 실행·인증·종류 CRUD·회원 삭제·PIN 초기화           |
| 운영 마무리              | HTTPS·CI 배포 구성 있음 | 실제 공휴일·연락 경로·백업/정리·실기기·동기화·선행 사용자 확인 |

달력 조회 API와 화면 연결을 마쳤다. 통계·관리자·공휴일/운영 검증으로 이어간다. 시안·자동 검사·실기기 완료를 구분한다.

## 확정 기능

- 일반 사용자 최대 15명 + 별도 관리자 1명
- 링크 기반 자율 가입, 닉네임 + 숫자 네 자리 PIN 로그인
- 날짜·공부 종류·공부 시간 기록, 시작 시각은 선택
- 공동 월간 / 내 월간 / 내 주간 달력
- 주간 스터디 막대와 개인 월간 대시보드
- 관리자 웹의 공부 종류 추가 / 사용자 계정·기록 영구 삭제 / PIN 초기화
- 삭제 전 SweetAlert2 경고 확인창, 간략 안내는 Toast
- 토요일 파란 날짜, 일요일·한국 공휴일 및 대체공휴일 빨간 날짜
- 모바일·패드·컴퓨터에서 동일한 색상과 화면 규칙 적용

관리자는 사용자 정원과 통계에 포함되지 않으며 공부 기록을 작성하거나 조회하지 않습니다. 세부 입력 조건·보안·오류 처리는 실행 명세를 따릅니다.

## 설계 문서

| 문서                                                            | 용도                             |
| --------------------------------------------------------------- | -------------------------------- |
| [실행 명세](docs/JLPT_Study_Room_Execution_Spec_v1.md)          | 기능·DB·API·검증 계약            |
| [읽기용 설계 HTML](docs/JLPT_Study_Room_Requirements_v1_1.html) | 브라우저에서 확인하는 전체 설계  |
| [디자인 시안](docs/design/JLPT_Study_Room_Design_Preview.html)  | 화면과 팝업을 살펴보는 정적 시안 |
| [컬러 토큰](docs/design/JLPT_Study_Room_Color_Tokens.css)       | 공통 색상 기준                   |
| [협업 규칙](CONTRIBUTING.md)                                    | 브랜치·커밋·PR·결정 기록 기준    |

HTML 파일은 내려받아 브라우저에서 열 수 있습니다. 시안의 버튼 동작은 예시이며 실제 로그인과 DB 저장은 연결되지 않았습니다.

## 기술 구성

| 영역             | 선택                                |
| ---------------- | ----------------------------------- |
| 앱·서버 API      | Next.js App Router + TypeScript     |
| 스타일           | CSS Modules + 공통 CSS 변수         |
| 서버 데이터 조회 | TanStack Query                      |
| 데이터베이스     | Supabase PostgreSQL                 |
| 로그인           | 자체 서버 인증 + HttpOnly 세션 쿠키 |
| 확인창·Toast     | SweetAlert2                         |
| 테스트           | Playwright / Node test / PostgreSQL |
| 배포             | Vercel                              |

실제 패키지 버전은 프로젝트 생성 때 호환성을 확인하고 lockfile로 고정합니다. Next.js·React·TypeScript·ESLint·Prettier·React Icons·SweetAlert2·Playwright·server-only를 설치했습니다. TanStack Query5.105.0을 기록 화면에 추가했습니다. Supabase SDK·Vitest는 미설치이며 서버 REST·Playwright 검사 구성을 사용합니다.

## 폴더 구조

기존 협업에서 사용한 **app / features / components / lib** 원칙을 유지합니다. 이번 앱의 자체 인증·DB 처리를 분리하기 위해 server를, 공통 색상을 관리하기 위해 styles를 추가합니다.

### 현재 존재하는 경로

```text
.github/
  ISSUE_TEMPLATE/
    task.yml
  pull_request_template.md
docs/
  decisions/
  blog/
  design/
  JLPT_Study_Room_Execution_Spec_v1.md
  JLPT_Study_Room_Requirements_v1_1.html
src/
  app/
    api/                  auth, me/emoji, records, categories, members, calendar
    login/
    join/
    preview/              디자인 검토 전용
    page.tsx
    layout.tsx
  components/
    ui/
    layout/
  features/
    design-preview/
    study-record/
    calendar/             조회 DTO 타입, 화면은 다음 단계
    auth/
  lib/
    notifications.ts
    seoul-date.ts
  server/
    auth/
    records/
    calendar/
    database.ts
  styles/
    tokens.css
    globals.css
    notifications.css
supabase/
  migrations/
scripts/
  test-db.py
tests/
  db/
  e2e/
  unit/
playwright.unit.config.ts
playwright.config.ts
package.json
package-lock.json
AGENTS.md
CONTRIBUTING.md
README.md
```

### 앱 구현 시 사용할 경로

```text
src/
  app/                    페이지·레이아웃·API 경로
  features/               기능별 UI·hooks·타입·조회 코드
    auth/
    study-record/
    calendar/
    study/
    dashboard/
    profile/
    admin/
    categories/
  components/
    ui/                   여러 기능이 쓰는 버튼·입력·팝업
    layout/               공통 헤더·하단 메뉴
  lib/                    공통 날짜·입력 검사·API 클라이언트
  server/                 서버 전용 DB·인증·권한·시도 제한
  styles/                 tokens.css·globals.css
supabase/
  migrations/             테이블·제약·권한·트랜잭션 SQL
scripts/                  초기 관리자 생성·복구·백업
tests/                   단위·서버 통합·E2E 테스트
```

기능 하나에서만 쓰는 컴포넌트·hook·타입은 해당 features 폴더에 둡니다. 여러 기능이 사용하는 것만 공통 폴더로 옮깁니다. 세부 하위 폴더는 실제 코드가 생길 때 추가합니다. 서버 전용 모듈을 클라이언트에서 import하지 않습니다. 컴포넌트 스타일은 같은 위치의 `.module.css`로 분리합니다.

## 실행 준비

Node.js 24 LTS를 기준으로 개발합니다. 초기 페이지는 환경변수 없이 실행할 수 있습니다.

레포를 내려받으려면:

```bash
git clone https://github.com/DevJamJam/JLPT_Study.git
cd JLPT_Study
```

병합된 구현은 main에서 실행합니다.

```bash
git switch main
npm ci
npm run dev
```

브라우저에서 http://localhost:3000/preview 를 엽니다. 디자인 검토용 가상 데이터이며 입력 내용을 실제로 저장하지 않습니다. `npm run check`는 포맷·린트·타입 검사, `npm run build`는 운영 빌드, `npm run format`은 소스 포맷 정리입니다. 기존 docs 문서는 포맷 자동 변경에서 제외합니다.

기록 검증 단위 검사: `npm run test:unit`. Playwright 러너의 순수 코어·HTTP 검사와 Node 관리자 초기화 검사 총 97개를 브라우저 없이 실행합니다. 기록 생성·조회 API에 검증 함수를 연결했습니다. 기록 수정·삭제 API와 월별 목록의 편집·삭제 화면을 연결했습니다.

브라우저 검사: `npx playwright install chromium` 후 `npm run test:e2e`. 검사 명령은 운영 빌드 서버를 자동으로 시작합니다. SE3·패드·PC는 Chromium 화면 크기 검사이며 실제 Safari 기기 검사가 아닙니다.

DB 검사: PostgreSQL 16의 빈 `jlpt_test` DB와 `psql`·Python 3이 필요합니다. `JLPT_TEST_DATABASE_URL`을 로컬 테스트 DB에 설정한 뒤 `python3 scripts/test-db.py`를 실행합니다. 기존 테이블이 있으면 중단합니다. CI는 별도 PostgreSQL 컨테이너에서 스키마·권한·기록 계약·동시 저장을 검사합니다. 가입·세션 RPC와 PIN 해시 기반은 구현했습니다. Supabase 스키마 적용·시도 제한 SQL 검증은 완료했습니다. 로그인·세션 확인·로그아웃 서버 연결을 추가했습니다. 강제 PIN 변경 RPC를 추가했습니다. 일반 PIN 변경 RPC도 추가했습니다. 멤버·달력 조회 API를 추가했고 달력·통계·관리자 화면 연결은 다음 단계입니다.

Supabase와 배포 비밀값은 채팅이나 Git에 저장하지 않습니다. `.env.example`에는 이름만 제공하며 실제 값은 로컬·배포 환경변수로 설정합니다.

## 작업 흐름

1. 목적과 범위를 이슈에 작성합니다.
2. 최신 main에서 `feature/번호-기능`, `fix/번호-기능`, `chore/번호-작업` 브랜치를 만듭니다.
3. 의미 있는 변경을 검증하고 커밋합니다.
4. 변경 근거·검증은 커밋/PR과 `docs/decisions/`에 기록합니다. 작업마다 블로그 HTML을 만들지 않습니다. 화면 문제는 실제 캡처로 보여주고 검증하며, 블로그는 나중에 요청할 때 별도로 작성합니다. 기존 docs/blog 세 글은 유지합니다.
5. 작업 브랜치에서 main으로 PR을 열고 검증 결과를 전달한 뒤 최신 커밋을 재검토합니다.
6. 필수 검사 통과와 특이사항 없음이 확인되면 병합합니다. 특이사항은 병합 전에 사용자에게 알립니다.

커밋 형식은 `type: 한국어 요약 (#이슈번호)`입니다. develop은 사용하지 않습니다. HTML·CSS·JavaScript는 읽을 수 있도록 줄바꿈과 두 칸 들여쓰기를 사용합니다. 포맷터 설정만 추가했다고 자동 실행까지 구성됐다고 보고하지 않습니다.

## 현재 검증 범위

포맷·린트·타입·운영 빌드와 Chromium 화면 검사를 수행합니다. 375×667, 820×1180, 1280×900에서 간격·중앙 정렬·공휴일 예시·팝업·입력 유지·설정 동선을 검증합니다. PostgreSQL 테스트 DB에서 스키마·권한·기록 저장·가입/세션 계약과 동시 가입 정원을 검사합니다. Supabase의 스키마·권한·SQL 계약 검증은 완료했습니다. 운영 API는 임시 계정의 가입·재시도·로그인·로그아웃을 검증하고 계정을 정리했습니다. 실제 iPhone Safari·운영 UI 통합·기기 동기화는 미검증입니다. 공휴일 세 날짜는 디자인 예시이며 공식 API 데이터가 아닙니다.

## 초기 관리자 생성

관리자는 일반 사용자와 분리된 1개 계정이다. `ADMIN_LOGIN_ID`와
`ADMIN_INITIAL_PASSWORD`를 서버 환경변수로 설정한 운영 환경에서 `npm run admin:init`을
수동으로 실행한다. 로컬에서는 `.env.local`도 읽는다. 관리자 ID는 영문·숫자로 시작하는
3~64자의 영문·숫자·점·밑줄·하이픈, 비밀번호는 제어문자 없는 12~128자다.

`SUPABASE_URL`과 `SUPABASE_SECRET_KEY`(또는 legacy 서버 키)도 필요하다.
비밀값을 명령 인수·채팅·Git에 넣지 않는다. 명령은 비밀번호 평문을 저장하거나 출력하지
않고 무작위 salt+scrypt 해시만 저장한다. 기존 관리자는 변경하지 않으며 동시 실행은
DB singleton 제약으로 한 계정만 만든다. 결과를 확인한 후 초기 비밀번호 환경변수는
제거할 수 있다. 제거·재배포는 관리자 DB 해시를 변경하지 않는다.

이 명령은 공개 API·일반 가입·앱 시작·빌드에서 자동 실행하지 않는다.
Vercel에 환경변수를 저장하는 것만으로 명령이 실행되지는 않는다. 현재 운영 관리자
생성은 미실행이며 관리자 로그인·관리 API·화면은 후속 구현이다.
관리자 명령 검사는 `npm run test:admin-bootstrap`으로 실행한다.

### 인증 화면

/login·/join은 실제 인증 API에 연결합니다. /는 세션을 확인하고 공개 프로필·그룹과 로그아웃을 표시하며, 무세션은 로그인으로 이동합니다. 기록 입력·월별 내 기록을 표시하며 달력·통계 홈은 후속입니다. 제한 세션은 새 PIN·확인을 입력해 변경한 뒤 정상 세션으로 돌아갑니다. 정상 세션은 상단 이모지 → 내 설정 → 간편 비밀번호 변경에서 현재 PIN·새 PIN·확인을 입력합니다. 성공 시 모든 이전 세션을 폐기하고 현재 기기에 새 쿠키를 발급합니다. 설정의 대표 이모티콘20개 선택·저장도 PATCH /api/me/emoji에 연결했습니다. 저장 후 현재 프로필을 갱신하고, 다른 기기는 세션 재조회 시 최신 이모티콘을 읽습니다. /preview는 가상 데이터 디자인 검토 전용입니다.

### 인증 API 응답 시간 점검

Vercel Functions는 `vercel.json`의 `hnd1`(도쿄)에서 실행하도록 설정해 도쿄 Supabase와 지역을 맞춥니다. 인증·프로필 API의 `Server-Timing`은 요청별 `app`(핸들러), `db`(DB HTTP 요청·JSON 읽기 합계), `dbcalls`(요청 수)를 제공합니다. DB 시간은 SQL 실행 시간과 다릅니다. 콜드 스타트·클라이언트 네트워크 등 핸들러 시작 전후 시간은 app에 포함되지 않습니다. PIN·해시·토큰·경로·SQL·사용자 식별자는 지표에 넣지 않습니다. 클라이언트15초/DB 요청10초 제한과 scrypt 비용은 유지합니다. 배포 후 실제 지역과 응답 시간을 다시 확인합니다.

인증 흐름 독립 측정은 `.github/workflows/auth-latency-diagnostic.yml`에서 실행합니다. 일반 공개 GET 진단과 달리 임시 계정1개를 생성하므로 명시적인 실행 플래그가 필요합니다. PIN·쿠키는 실행 메모리에만 두고 세션은 종료 시 폐기합니다. 계정 삭제는 DB 권한이 있는 담당자가 로그의 가상 계정 UUID·닉네임·requestId를 함께 대조해 수행해야 합니다. 측정 결과만으로 자동 정리 완료라고 간주하지 않습니다.

신규 가입은 가입 RPC가 실제 생성한 경우에만 방금 만든 해시를 재사용하고 최초 버전1로 최종 세션 검사를 요청합니다. 기존 가입 재시도는 현재 PIN·버전을 다시 확인합니다. 로그인 계정·자격증명은 기존 FK를 통해 한 요청으로 읽으며, 세션 확인 뒤 그룹·멤버의 독립 조회는 병렬 실행합니다. `db` 지표는 병렬 요청 시간의 합계라 `app`보다 클 수 있습니다.

### 학습 기록 API

`POST /api/records`는 정상 일반 사용자 세션에서 본인 기록을 저장합니다. `GET /api/records/:id`는 같은 그룹의 기록만 조회합니다. 목록은 `scope=mine|group&from=YYYY-MM-DD&to=YYYY-MM-DD`(최대42일) 또는 `scope=mine&month=YYYY-MM&limit=30&cursor=...`로 조회합니다. 두 형식을 혼용할 수 없습니다. 생성 시 같은 ID·입력을 유지해 재시도합니다. `PATCH /api/records/:id`는 편집 필드 전체와 expectedVersion, `DELETE`는 expectedVersion을 받습니다. 본인만 변경할 수 있고 버전 충돌은409와 currentRecord를 반환합니다. 월별 내 기록에서 수정·삭제를 연결했습니다. 충돌 시 초안을 유지하고 최신값을 확인하며 자동으로 덮어쓰지 않습니다. 달력·통계 화면은 후속입니다.

CI의 database 작업은 기존 SQL 계약 검사 후 격리된 PostgREST14.18을 실행하고 `npx playwright test --config playwright.integration.config.ts`로 실제 HTTP/DB 통합6개를 검사합니다. 이 검사는 localhost의 전용 `jlpt_test` DB와 테스트 PostgREST URL을 모두 요구하며 운영 DB에서 실행할 수 없습니다. 자세한 계약과 검증 한계는 [결정 기록022](docs/decisions/022-record-api.md)에 남깁니다.

### 기록 입력·월별 내 기록 화면

로그인 후 프로필 아래의 내 기록에서 월을 이동하거나 기록을 더 읽을 수 있습니다. 공부 기록 남기기는 기존 팝업을 사용하고 `/api/categories`의 최신 종류를 불러옵니다. 입력 검증·중복 제출 차단·실패 후 입력 유지와 같은 ID 재시도를 처리합니다. 저장 성공 후 해당 월의 목록을 새로 조회합니다. 기록용 TanStack Query 캐시는 메모리에서만 사용합니다. 결정 기록은 [023](docs/decisions/023-record-ui.md)을 참고합니다.

### 멤버·달력 조회

`GET /api/members`는 같은 그룹의 공개 프로필을 가입순으로 반환합니다.
`GET /api/calendar?scope=mine|group&from=YYYY-MM-DD&to=YYYY-MM-DD`는 양 끝 포함
최대42일의 날짜별 합계·고유 참여자 시간을 반환하며 빈 날짜도 포함합니다. 메모와 자격증명은
읽지 않습니다. 정상 사용자 세션만 허용합니다. 화면 연결은 다음 단계이며
[결정 기록027](docs/decisions/027-calendar-api-and-checkpoint.md)을 참고합니다.

### 실제 달력·공통 메뉴

`/calendar`에서 그룹 월간·내 월간·내 주간과 날짜 상세를 실제 API로 조회합니다.
같은 날짜의 여러 기록을 회원별로 표시하고 본인 기록만 수정·삭제합니다. 상세의 추가는
선택 날짜, 하단+는 서울 오늘입니다. 저장/삭제 후 관련 조회를 갱신합니다. `/me`는 기존
월별 목록이며 통계는 후속입니다. 헤더 설정과 하단 메뉴를 공통으로 사용합니다.
공식 공휴일은 아직 미확인 안내 상태이며 주말 색상만 적용합니다. 자세한 사항은
[결정 기록028](docs/decisions/028-calendar-ui.md)과 PR #59를 참고합니다.
