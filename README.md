# JLPT Study Room

JLPT를 준비하는 소규모 스터디를 위한 공부 기록 웹앱입니다. 공부 기록을 달력으로 공유하고, 주간·월간 통계로 돌아봅니다.

## 현재 진행 상태

현재는 **공통 디자인·기록·가입/세션 서버 기반 구현 단계**입니다. /preview에서 가상 데이터로 홈·달력·스터디·내 기록·로그인·입력·설정을 검토할 수 있습니다. 실제 인증·저장·DB는 아직 연결하지 않았습니다.

| 항목                         | 상태                                                 |
| ---------------------------- | ---------------------------------------------------- |
| 기능·권한·화면 설계          | 작성 완료                                            |
| 모바일·패드·컴퓨터 HTML 시안 | 작성 완료, 실제 브라우저 검증 미실행                 |
| 컬러 토큰                    | 작성 완료                                            |
| 협업 규칙·이슈/PR 템플릿     | 작성 완료                                            |
| Next.js 초기 앱              | 구성 완료                                            |
| API·DB·기능 화면             | PostgreSQL 스키마·기록 RPC 작성, API·실제 DB 연결 전 |
| 포맷·린트·타입·빌드 CI       | 구성 완료, 원격 실행 결과는 PR에서 확인              |
| 기록 입력·서울 날짜 검증     | 공통 함수와 단위 테스트 구현, 화면·API 연결 전       |
| 기능 테스트·배포             | Chromium E2E 구성, 실제 DB·배포 구현 전              |

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

기록 검증 단위 검사: `npm run test:unit`. 기존 Playwright 러너에서 브라우저 없이 날짜·입력·일일 합산 및 인증 기반 규칙 15개 테스트를 실행합니다. 화면과 API에 검증 함수를 연결하는 작업은 다음 단계입니다.

브라우저 검사: `npx playwright install chromium` 후 `npm run test:e2e`. 검사 명령은 운영 빌드 서버를 자동으로 시작합니다. SE3·패드·PC는 Chromium 화면 크기 검사이며 실제 Safari 기기 검사가 아닙니다.

DB 검사: PostgreSQL 16의 빈 `jlpt_test` DB와 `psql`·Python 3이 필요합니다. `JLPT_TEST_DATABASE_URL`을 로컬 테스트 DB에 설정한 뒤 `python3 scripts/test-db.py`를 실행합니다. 기존 테이블이 있으면 중단합니다. CI는 별도 PostgreSQL 컨테이너에서 스키마·권한·기록 계약·동시 저장을 검사합니다. 가입·세션 RPC와 PIN 해시 기반은 구현했습니다. 실제 Supabase 적용·시도 제한·인증 API·PIN 변경/관리자 RPC는 다음 단계입니다.

Supabase와 배포 비밀값은 채팅이나 Git에 저장하지 않습니다. 앱 구현 때 `.env.example`에는 이름만 제공하고 실제 값은 로컬·배포 환경변수로 설정합니다.

## 작업 흐름

1. 목적과 범위를 이슈에 작성합니다.
2. 최신 main에서 `feature/번호-기능`, `fix/번호-기능`, `chore/번호-작업` 브랜치를 만듭니다.
3. 의미 있는 변경을 검증하고 커밋합니다.
4. 변경 근거·검증은 커밋/PR과 `docs/decisions/`에 기록합니다. 작업마다 블로그 HTML을 만들지 않습니다. 화면 문제는 실제 캡처로 보여주고 검증하며, 블로그는 나중에 요청할 때 별도로 작성합니다. 기존 docs/blog 세 글은 유지합니다.
5. 작업 브랜치에서 main으로 PR을 열고 검증 결과를 전달한 뒤 최신 커밋을 재검토합니다.
6. 필수 검사 통과와 특이사항 없음이 확인되면 병합합니다. 특이사항은 병합 전에 사용자에게 알립니다.

커밋 형식은 `type: 한국어 요약 (#이슈번호)`입니다. develop은 사용하지 않습니다. HTML·CSS·JavaScript는 읽을 수 있도록 줄바꿈과 두 칸 들여쓰기를 사용합니다. 포맷터 설정만 추가했다고 자동 실행까지 구성됐다고 보고하지 않습니다.

## 현재 검증 범위

포맷·린트·타입·운영 빌드와 Chromium 화면 검사를 수행합니다. 375×667, 820×1180, 1280×900에서 간격·중앙 정렬·공휴일 예시·팝업·입력 유지·설정 동선을 검증합니다. PostgreSQL 테스트 DB에서 스키마·권한·기록 저장·가입/세션 계약과 동시 가입 정원을 검사합니다. 실제 iPhone Safari·Supabase 연결·인증·기기 동기화는 미검증입니다. 공휴일 세 날짜는 디자인 예시이며 공식 API 데이터가 아닙니다.
