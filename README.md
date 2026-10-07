# JLPT Study Room

JLPT를 준비하는 소규모 스터디를 위한 공부 기록 웹앱입니다. 공부 기록을 달력으로 공유하고, 주간·월간 통계로 돌아봅니다.

## 현재 진행 상태

현재는 **앱 초기화 단계**입니다. Next.js 초기 페이지와 개발 검사 명령을 구성했습니다. 기능 화면·인증·DB는 다음 단계에서 구현합니다. 초기화 작업은 이슈 #3에서 관리합니다.

| 항목                         | 상태                                    |
| ---------------------------- | --------------------------------------- |
| 기능·권한·화면 설계          | 작성 완료                               |
| 모바일·패드·컴퓨터 HTML 시안 | 작성 완료, 실제 브라우저 검증 미실행    |
| 컬러 토큰                    | 작성 완료                               |
| 협업 규칙·이슈/PR 템플릿     | 작성 완료                               |
| Next.js 초기 앱              | 구성 완료                               |
| API·DB·기능 화면             | 구현 전                                 |
| 포맷·린트·타입·빌드 CI       | 구성 완료, 원격 실행 결과는 PR에서 확인 |
| 기능 테스트·배포             | 구성 전                                 |

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
| [협업 규칙](CONTRIBUTING.md)                                    | 브랜치·커밋·PR·블로그 기준       |

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

실제 패키지 버전은 프로젝트 생성 때 호환성을 확인하고 lockfile로 고정합니다. Next.js·React·TypeScript·ESLint·Prettier만 설치했습니다. TanStack Query·Supabase·SweetAlert2·Vitest·Playwright는 기능 구현 때 추가합니다.

## 폴더 구조

기존 협업에서 사용한 **app / features / components / lib** 원칙을 유지합니다. 이번 앱의 자체 인증·DB 처리를 분리하기 위해 server를, 공통 색상을 관리하기 위해 styles를 추가합니다.

### 현재 존재하는 경로

```text
.github/
  ISSUE_TEMPLATE/
    task.yml
  pull_request_template.md
docs/
  blog/
  design/
  JLPT_Study_Room_Execution_Spec_v1.md
  JLPT_Study_Room_Requirements_v1_1.html
src/
  app/
    layout.tsx
    page.tsx
    page.module.css
  styles/
    tokens.css
    globals.css
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
    records/
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

앱 초기화 PR 병합 전에는 작업 브랜치를 선택합니다.

```bash
git switch chore/3-app-initialization
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. `npm run check`는 포맷·린트·타입 검사, `npm run build`는 운영 빌드, `npm run format`은 소스 포맷 정리입니다. 기존 docs 문서는 포맷 자동 변경에서 제외합니다.

Supabase와 배포 비밀값은 채팅이나 Git에 저장하지 않습니다. 앱 구현 때 `.env.example`에는 이름만 제공하고 실제 값은 로컬·배포 환경변수로 설정합니다.

## 작업 흐름

1. 목적과 범위를 이슈에 작성합니다.
2. 최신 main에서 `feature/번호-기능`, `fix/번호-기능`, `chore/번호-작업` 브랜치를 만듭니다.
3. 의미 있는 변경을 검증하고 커밋합니다.
4. **커밋 하나당 기술 블로그 HTML 하나**를 레포 밖에서 별도로 전달하고 커밋·PR 링크를 연결합니다. 기존 docs/blog 세 글은 초기 기록으로 유지합니다.
5. 작업 브랜치에서 main으로 PR을 열고 변경 내용과 검증 결과를 확인합니다.

커밋 형식은 `type: 한국어 요약 (#이슈번호)`입니다. develop은 사용하지 않습니다. HTML·CSS·JavaScript는 읽을 수 있도록 줄바꿈과 두 칸 들여쓰기를 사용합니다. 포맷터 설정만 추가했다고 자동 실행까지 구성됐다고 보고하지 않습니다.

## 현재 검증 범위

문서 정적 검사에 이어 npm run check(포맷·린트·타입)와 npm run build를 실행했습니다. 초기 페이지 서버 응답도 확인합니다. 실제 브라우저·iPhone SE3·DB·인증·기능 테스트는 아직 수행하지 않았습니다.
