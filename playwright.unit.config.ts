import { defineConfig } from '@playwright/test';

// 순수 함수 테스트만 실행한다. 브라우저·앱 서버를 시작하지 않는다.
export default defineConfig({
  testDir: './tests/unit',
  reporter: 'list',
  fullyParallel: true,
});
