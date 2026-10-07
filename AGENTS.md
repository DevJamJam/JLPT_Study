# JLPT Study Room

CONTRIBUTING.md와 docs/JLPT_Study_Room_Execution_Spec_v1.md를 먼저 읽는다.
사용자가 승인한 디자인과 동작을 따른다. 작업마다 블로그 HTML을 생성·전달하지 않는다. 변경 근거·문제·검증은 커밋/PR과 docs/decisions/에 기록한다. 간격·정렬 등 화면 문제가 있을 때 수정 캡처를 보여주고 검증한다. 기술 블로그는 나중에 사용자가 요청할 때 이 기록을 근거로 별도 작성한다. 기존 docs/blog 세 글은 유지한다.
코드 CSS는 분리하고 확정 색상 토큰을 사용한다. 사용자/관리자 세션과 권한을 분리한다.
실행하지 않은 DB·브라우저·빌드 검사를 통과했다고 보고하지 않는다.

HTML·CSS·JavaScript를 한 줄로 압축해서 저장하지 않는다. 두 칸 들여쓰기와 읽기 쉬운 줄바꿈을 유지한다. README의 현재 상태·현재 폴더·계획 구조를 구분해 갱신한다. 기존 app/features/components/lib 원칙을 유지하고 server/styles를 추가한다.

PR과 검증 결과를 전달하고 화면 문제는 캡처를 보여준 뒤 최신 head를 재검토한다. 필수 검사 통과와 특이사항 없음이 확인되면 병합한다. 특이사항이 있으면 병합을 보류하고 사용자에게 문제·영향·수정 방향을 설명한다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
