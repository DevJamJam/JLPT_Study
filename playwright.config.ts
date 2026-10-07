import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: process.env.JLPT_BROWSER_PATH
      ? {
          executablePath: process.env.JLPT_BROWSER_PATH,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--in-process-gpu',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--disable-features=Vulkan',
            '--enable-unsafe-swiftshader',
          ],
        }
      : undefined,
  },
  projects: [
    { name: 'SE3', use: { viewport: { width: 375, height: 667 } } },
    { name: 'pad', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/preview',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
