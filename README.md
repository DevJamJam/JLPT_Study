# JLPT Study Room

JLPT를 준비하는 소규모 스터디를 위한 공부 기록 웹앱입니다. 공부 기록을 달력으로 공유하고, 주간·월간 통계로 돌아봅니다.

## 현재 진행 상태

현재는 **공통 디자인·기록·가입/세션 서버 기반 구현 단계**입니다. /preview에서 가상 데이터로 홈·달력·스터디·내 기록·로그인·입력·설정을 검토할 수 있습니다. Supabase 스키마는 적용·검증했으며 로그인·세션 확인·로그아웃 API를 연결했으며 가입 API도 연결했으며 /login·/join과 실제 세션 확인·로그아웃 화면을 연결했으며 공부 기록·통계 연결은 후속입니다.

| 항목                         | 상태                                                |
| ---------------------------- | --------------------------------------------------- |
| 기능·권한·화면 설계          | 작성 완료                                           |
| 모바일·패드·컴퓨터 HTML 시안 | 작성 완료, 실제 브라우저 검증 미실행                |
| 컬러 토큰                    | 작성 완료                                           |
| 협업 규칙·이슈/PR 템플릿     | 작성 완료                                           |
| Next.js 초기 앱              | 구성 완료                                           |
| API·DB·기능 화면             | Supabase 스키마 적용, 로그인·세션·로그아웃 API 연결 |
| 포맷·린트·타입·빌드 CI       | 구성 완료, 원격 실행 결과는 PR에서 확인             |
| 기록 입력·서울 날짜 검증     | 공통 함수와 단위 테스트 구현, 화면·API 연결 전      |
| 기능 테스트·배포             | Chromium E2E 구성, 실제 DB·배포 구현 전             |

가입·세션 서버 기반은 PIN 해시·가입/세션 함수와 검사를 구현한 상태입니다. 인증 요청의 Origin·JSON·4096바이트 제한 검사 기반도 추가했습니다. DB 인증 시도 예약·완료 함수와 계약 검사도 추가했습니다. 실제 PostgreSQL 동시 예약 검사는 PR #22 CI에서 통과했으며 로그인·세션 확인·로그아웃 API를 연결했으며 화면 연결은 후속입니다.

서버 가입·로그인 흐름과 인증 설정 검증도 추가했습니다. 테스트용 DB 인터페이스로 검증했으며 Supabase 서버 어댑터까지 추가했습니다. POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout을 연결했습니다. 로그인은 공개 프로필·그룹 DTO와 HttpOnly 쿠키를 반환하고, me는 만료를 연장하지 않으며 로그아웃은 현재 세션만 폐기합니다. Vercel 서버 환경변수와 신뢰 출처 헤더를 사용합니다. POST /api/auth/join은 신규201·같은 요청 재시도200을 구분합니다. 가입·로그인 화면도 실제 API에 연결했습니다. 초기화된 PIN의 강제 변경 화면과 API도 연결했습니다. 일반 PIN 변경도 내 설정 팝업과 POST /api/auth/change-pin으로 연결했습니다. 대표 이모티콘 변경은 PATCH /api/me/emoji로 저장합니다. 관리자 인증과 기록·통계 화면 연결은 후속입니다.

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
| 테스트           | Vitest / Playwright                 |
| 배포             | Vercel                              |

실제 패키지 버전은 프로젝트 생성 때 호환성을 확인하고 lockfile로 고정합니다. Next.js·React·TypeScript·ESLint·Prettier·React Icons·SweetAlert2·Playwright·server-only를 설치했습니다. TanStack Query·Supabase·Vitest는 해당 기능 단계에서 추가합니다.

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
    layout.tsx
    page.tsx
    page.module.css
  components/
    ui/
    layout/
  features/
    design-preview/
    study-record/
      validation.ts
    auth/
      validation.ts
  lib/
    notifications.ts
    seoul-date.ts
  server/
    auth/
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

기록 검증 단위 검사: `npm run test:unit`. Playwright 러너의 순수 코어·HTTP 검사와 Node 관리자 초기화 검사 총 66개를 브라우저 없이 실행합니다. 화면과 API에 검증 함수를 연결하는 작업은 다음 단계입니다.

브라우저 검사: `npx playwright install chromium` 후 `npm run test:e2e`. 검사 명령은 운영 빌드 서버를 자동으로 시작합니다. SE3·패드·PC는 Chromium 화면 크기 검사이며 실제 Safari 기기 검사가 아닙니다.

DB 검사: PostgreSQL 16의 빈 `jlpt_test` DB와 `psql`·Python 3이 필요합니다. `JLPT_TEST_DATABASE_URL`을 로컬 테스트 DB에 설정한 뒤 `python3 scripts/test-db.py`를 실행합니다. 기존 테이블이 있으면 중단합니다. CI는 별도 PostgreSQL 컨테이너에서 스키마·권한·기록 계약·동시 저장을 검사합니다. 가입·세션 RPC와 PIN 해시 기반은 구현했습니다. Supabase 스키마 적용·시도 제한 SQL 검증은 완료했습니다. 로그인·세션 확인·로그아웃 서버 연결을 추가했습니다. 강제 PIN 변경 RPC를 추가했습니다. 일반 PIN 변경 RPC도 추가했습니다. 관리자 RPC와 공부 기록·통계 화면 연결은 다음 단계입니다.

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

/login·/join은 실제 인증 API에 연결합니다. /는 세션을 확인하고 공개 프로필·그룹과 로그아웃을 표시하며, 무세션은 로그인으로 이동합니다. 기록·통계 홈은 후속이고 제한 세션은 새 PIN·확인을 입력해 변경한 뒤 정상 세션으로 돌아갑니다. 정상 세션은 상단 이모지 → 내 설정 → 간편 비밀번호 변경에서 현재 PIN·새 PIN·확인을 입력합니다. 성공 시 모든 이전 세션을 폐기하고 현재 기기에 새 쿠키를 발급합니다. 설정의 대표 이모티콘20개 선택·저장도 PATCH /api/me/emoji에 연결했습니다. 저장 후 현재 프로필을 갱신하고, 다른 기기는 세션 재조회 시 최신 이모티콘을 읽습니다. /preview는 가상 데이터 디자인 검토 전용입니다.

### 인증 API 응답 시간 점검

Vercel Functions는 `vercel.json`의 `hnd1`(도쿄)에서 실행하도록 설정해 도쿄 Supabase와 지역을 맞춥니다. 인증·프로필 API의 `Server-Timing`은 요청별 `app`(핸들러), `db`(DB HTTP 요청·JSON 읽기 합계), `dbcalls`(요청 수)를 제공합니다. DB 시간은 SQL 실행 시간과 다릅니다. 콜드 스타트·클라이언트 네트워크 등 핸들러 시작 전후 시간은 app에 포함되지 않습니다. PIN·해시·토큰·경로·SQL·사용자 식별자는 지표에 넣지 않습니다. 클라이언트15초/DB 요청10초 제한과 scrypt 비용은 유지합니다. 배포 후 실제 지역과 응답 시간을 다시 확인합니다.
