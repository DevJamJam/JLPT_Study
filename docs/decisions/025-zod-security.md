# 025 — 개발 도구 Zod 보안 패치

## 문제

기록 API PR #51의 npm ci에서 zod4.6.5의 high 경고가 확인됐다.
`npm audit --json`은 GHSA-mrhx-c7xc-m3w5를 보고했다.
공식 Advisory의 패치 버전은4.6.6이다.

`npm explain zod`의 경로는 eslint-config-next → eslint-plugin-react-hooks → zod이며
lockfile에 dev:true로 표시된다. 앱 소스에서 직접 사용하지 않는다.
기록 API의 권한 문제나 운영 사용자 정보 유출이 발견됐다는 의미는 아니다.

## 결정

관련 없는 패키지를 일괄 갱신하는 audit fix 대신 `overrides.zod=4.6.6`을 고정한다.
직접 의존성을 추가하지 않고 기존 허용 범위 내 패치만 갱신한다.
package-lock의 변경은 해당 패키지 version/resolved/integrity뿐인지 확인한다.

## 검증

깨끗한 npm ci, npm audit, format/lint/typecheck, 운영 빌드 및 기존 CI를 실행한다.
실제 결과는 관련 PR에 기록한다. UI 변경이나 신규 DB migration은 없다.

근거: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
