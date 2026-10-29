import { test, expect } from '@playwright/test';
import { stubRecordReads } from './record-fixture';

test.beforeEach(async ({ page }) => stubRecordReads(page));

const data = {
  profile: {
    id: '00000000-0000-4000-8000-000000000001',
    nickname: '화면검증',
    emoji: '🐰',
    mustChangePin: false,
  },
  group: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'JLPT STUDY ROOM',
    maxMembers: 15,
    memberCount: 1,
  },
};

test('로그인·가입 화면 크기·입력·이모지와 캡처', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '공부방에 오신 걸 환영해요' })).toBeVisible();
  const pin = page.getByLabel('간편 비밀번호 (숫자 4자리)', { exact: true });
  await expect(pin).toHaveAttribute('type', 'password');
  await expect(pin).toHaveAttribute('inputmode', 'numeric');
  expect((await pin.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/${info.project.name}-login.png`, fullPage: true });
  await page.getByRole('link', { name: '가입하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '우리의 공부를 함께 기록해요' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const input of await page.locator('input[type="password"]').all()) {
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  }
  await page.screenshot({ path: `test-results/${info.project.name}-join.png`, fullPage: true });
});

test('로그인 오류 입력 유지·중복 제출 차단·세션 확인·로그아웃', async ({ page }) => {
  let calls = 0;
  let loggedIn = false;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: loggedIn ? 200 : 401,
      json: loggedIn ? { data } : { error: { code: 'UNAUTHORIZED' } },
    }),
  );
  await page.route('**/api/auth/login', async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (calls === 1)
      await route.fulfill({ status: 401, json: { error: { code: 'INVALID_CREDENTIALS' } } });
    else {
      loggedIn = true;
      await route.fulfill({ json: { data } });
    }
  });
  await page.route('**/api/auth/logout', (route) => {
    loggedIn = false;
    return route.fulfill({ json: { data: { loggedOut: true } } });
  });
  await page.goto('/login');
  await page.getByLabel('닉네임', { exact: true }).fill('화면검증');
  const pin = page.getByLabel('간편 비밀번호 (숫자 4자리)', { exact: true });
  await pin.fill('0123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('button', { name: '확인하고 있어요…' })).toBeDisabled();
  await expect(page.locator('form [role="alert"]')).toContainText('닉네임 또는');
  await expect(pin).toHaveValue('0123');
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '화면검증님, 반가워요' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('가입 실패 후 요청 ID 유지, 입력 변경 시 새 ID, 동의·PIN 확인', async ({ page }) => {
  const requests: Record<string, string>[] = [];
  await page.route('**/api/auth/join', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(
      requests.length < 4
        ? { status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } }
        : { status: 201, json: { data } },
    );
  });
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { data } }));
  await page.goto('/join');
  await page.getByLabel('닉네임', { exact: true }).fill('화면검증');
  await page.getByLabel('간편 비밀번호 (숫자 4자리)', { exact: true }).fill('0123');
  await page.getByLabel('간편 비밀번호 확인', { exact: true }).fill('9999');
  await page.getByRole('button', { name: '공부방 시작하기' }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '공부방 시작하기' }).click();
  await expect(page.locator('form [role="alert"]')).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByLabel('간편 비밀번호 확인', { exact: true }).fill('0123');
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: '공부방 시작하기' }).click();
    await expect(page.locator('form [role="alert"]')).toContainText('입력한 내용은 그대로');
  }
  expect(requests[0].requestId).toBe(requests[1].requestId);
  expect(requests[1].requestId).toBe(requests[2].requestId);
  await page.getByRole('radio', { name: '대표 이모티콘 2: 🐱', exact: true }).check();
  await page.getByRole('button', { name: '공부방 시작하기' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(requests[3].requestId).not.toBe(requests[2].requestId);
  expect(requests[3].pin).toBe('0123');
  expect(requests[3].emoji).toBe('🐱');
});

test('무세션은 로그인으로, 제한 세션은 일반 홈으로 사용하지 않는다', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { data: { ...data, profile: { ...data.profile, mustChangePin: true } } },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '간편 비밀번호 변경이 필요해요' })).toBeVisible();
  await expect(page.getByText('함께 공부하고, 차곡차곡 기록해요.')).toHaveCount(0);
});

test('인증 제한은 재시도 안내를 표시하고 입력을 보관한다', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: { code: 'AUTH_RATE_LIMITED', retryAt: new Date(Date.now() + 60000).toISOString() },
      },
    }),
  );
  await page.goto('/login');
  await page.getByLabel('닉네임', { exact: true }).fill('화면검증');
  const pin = page.getByLabel('간편 비밀번호 (숫자 4자리)', { exact: true });
  await pin.fill('0123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('form [role="alert"]')).toContainText('이후 다시 시도하거나');
  await expect(pin).toHaveValue('0123');
});
