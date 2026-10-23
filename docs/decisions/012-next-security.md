# 012. Next.js 보안 수정 버전

2026-10-23 관리자 초기 생성 변경의 운영 빌드가 Next.js 16.4.0 보안 경고로 중단됐다.
공식 Next.js 보안 공지와 npm audit을 확인하고 next와 eslint-config-next를 16.4.2로
고정했다. package-lock.json을 함께 갱신했다. React 등 다른 직접 의존성은 변경하지 않는다.

npm audit --omit=dev는 취약점 0개다. 전체 audit은 critical 0개, high 5개이며
braces의 미수정 취약점 하나가 micromatch → fast-glob → Next ESLint plugin/config로
전파된 개발 의존성 경고다. 이름 5개가 독립 취약점 5종을 뜻하지 않는다.
공식 공지에는 braces 수정 버전이 없다. 자동 권고의 eslint-config-next 14.2.35 하향은
Next 16과 버전이 맞지 않아 실행하지 않았다. lint는 저장소 파일만 대상으로 하며 외부
사용자의 glob 패턴을 받지 않지만, 이 제한을 취약점 수정 완료로 간주하지 않는다.

검증: 포맷·린트·타입 검사, 단위 테스트 18개, 운영 빌드가 종료 코드 0으로 통과했다.
Chromium 다운로드는 0 MiB/손상 ZIP 오류로 실패해 실제 브라우저 E2E는 미실행이다.
화면 코드는 변경하지 않았다. 원격 CI의 E2E와 DB 검사 확인 전 병합을 보류한다.
현재 운영 배포는 기존 버전이며 이 브랜치만으로 운영 사이트가 업데이트되지는 않는다.

공식 근거:
- https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r
- https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
