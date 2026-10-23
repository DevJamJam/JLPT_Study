import { test, expect } from '@playwright/test';

const session = {
  profile: {
    id: '00000000-0000-4000-8000-000000000001',
    nickname: '검사계정',
    emoji: '🐰',
    mustChangePin: true,
  },
  group: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'JLPT STUDY ROOM',
    maxMembers: 15,
    memberCount: 1,
  },
};
test('초기 PIN 변경 화면·불일치·실패 입력 유지·성공 후 정상 홈', async ({ page }, info) => {
  let changed = false;
  let calls = 0;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { data: { ...session, profile: { ...session.profile, mustChangePin: !changed } } },
    }),
  );
  await page.route('**/api/auth/complete-reset', async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ newPin: '0123', newPinConfirm: '0123' });
    if (calls === 1)
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
    else {
      changed = true;
      await route.fulfill({
        json: { data: { profile: { ...session.profile, mustChangePin: false } } },
      });
    }
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '간편 비밀번호 변경이 필요해요' })).toBeVisible();
  const form = page.getByRole('form', { name: '초기 비밀번호 변경' });
  const pin = page.getByLabel('새 간편 비밀번호 (숫자 4자리)', { exact: true });
  await expect(pin).toHaveAttribute('type', 'password');
  expect((await pin.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-complete-reset.png`,
    fullPage: true,
  });
  await pin.fill('0123');
  await page.getByLabel('새 간편 비밀번호 확인', { exact: true }).fill('9999');
  await page.getByRole('button', { name: '비밀번호 변경하고 시작하기' }).click();
  await expect(form.getByRole('alert')).toContainText('일치하지');
  expect(calls).toBe(0);
  await page.getByLabel('새 간편 비밀번호 확인', { exact: true }).fill('0123');
  await page.getByRole('button', { name: '비밀번호 변경하고 시작하기' }).click();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeDisabled();
  await expect(form.getByRole('alert')).toContainText('입력한 내용은 그대로');
  await expect(pin).toHaveValue('0123');
  await page.getByRole('button', { name: '비밀번호 변경하고 시작하기' }).click();
  await expect(page.getByRole('heading', { name: '검사계정님, 반가워요' })).toBeVisible();
  await expect(form).toHaveCount(0);
});
test('변경 중 세션 만료는 재로그인으로 안내하고 추가 제출을 막는다', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { data: session } }));
  await page.route('**/api/auth/complete-reset', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await page.goto('/');
  await page.getByLabel('새 간편 비밀번호 (숫자 4자리)', { exact: true }).fill('0123');
  await page.getByLabel('새 간편 비밀번호 확인', { exact: true }).fill('0123');
  await page.getByRole('button', { name: '비밀번호 변경하고 시작하기' }).click();
  await expect(page.getByRole('link', { name: '다시 로그인', exact: true })).toHaveAttribute(
    'href',
    '/login',
  );
  await expect(page.getByRole('button', { name: '비밀번호 변경하고 시작하기' })).toBeDisabled();
});
