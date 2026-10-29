import { test, expect } from '@playwright/test';
import { stubRecordReads } from './record-fixture';

test.beforeEach(async ({ page }) => stubRecordReads(page));

const session = {
  profile: {
    id: '00000000-0000-4000-8000-000000000001',
    nickname: '검사계정',
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
async function openSettings(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { data: session } }));
  await page.goto('/');
  await page.getByRole('button', { name: '내 설정 열기' }).click();
  await page.getByRole('button', { name: '간편 비밀번호 변경', exact: true }).click();
}
test('설정 팝업 PIN 변경·오류 입력 유지·중복 요청 차단·성공', async ({ page }, info) => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/change-pin', async (route) => {
    calls++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      currentPin: '1234',
      newPin: '0123',
      newPinConfirm: '0123',
    });
    if (calls === 1)
      await route.fulfill({ status: 400, json: { error: { code: 'CURRENT_PIN_INVALID' } } });
    else {
      await gate;
      await route.fulfill({ json: { data: { profile: session.profile } } });
    }
  });
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: '간편 비밀번호 변경', exact: true });
  const current = dialog.getByLabel('현재 간편 비밀번호 (숫자 4자리)', { exact: true });
  const pin = dialog.getByLabel('새 간편 비밀번호 (숫자 4자리)', { exact: true });
  const confirm = dialog.getByLabel('새 간편 비밀번호 확인', { exact: true });
  await expect(current).toHaveAttribute('autocomplete', 'current-password');
  await expect(pin).toHaveAttribute('type', 'password');
  expect((await pin.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-change-pin.png`,
    fullPage: true,
  });
  await current.fill('1234');
  await pin.fill('0123');
  await confirm.fill('9999');
  await dialog.getByRole('button', { name: '비밀번호 변경하기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('일치하지');
  expect(calls).toBe(0);
  await confirm.fill('0123');
  await dialog.getByRole('button', { name: '비밀번호 변경하기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('현재 간편 비밀번호가 올바르지');
  await expect(current).toHaveValue('1234');
  await expect(pin).toHaveValue('0123');
  await dialog.getByRole('button', { name: '비밀번호 변경하기', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '변경하고 있어요…' })).toBeDisabled();
  await dialog.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(calls).toBe(2);
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '검사계정님, 반가워요' })).toBeVisible();
  await expect(page.getByText('간편 비밀번호를 변경했어요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '내 설정 열기' }).click();
  await page.getByRole('button', { name: '간편 비밀번호 변경', exact: true }).click();
  await expect(page.getByLabel('현재 간편 비밀번호 (숫자 4자리)', { exact: true })).toHaveValue('');
});
test('만료·처리 불확실 응답은 재로그인으로 안내한다', async ({ page }) => {
  await page.route('**/api/auth/change-pin', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await openSettings(page);
  await page.getByLabel('현재 간편 비밀번호 (숫자 4자리)', { exact: true }).fill('1234');
  await page.getByLabel('새 간편 비밀번호 (숫자 4자리)', { exact: true }).fill('0123');
  await page.getByLabel('새 간편 비밀번호 확인', { exact: true }).fill('0123');
  await page.getByRole('button', { name: '비밀번호 변경하기', exact: true }).click();
  await expect(page.getByRole('link', { name: '다시 로그인', exact: true })).toHaveAttribute(
    'href',
    '/login',
  );
  await expect(page.getByRole('button', { name: '비밀번호 변경하기', exact: true })).toBeDisabled();
});
test('설정 취소·포커스 복귀와 제한 세션의 설정 진입 차단', async ({ page }) => {
  await openSettings(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내 설정 열기' })).toBeFocused();
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { data: { ...session, profile: { ...session.profile, mustChangePin: true } } },
    }),
  );
  await page.reload();
  await expect(page.getByRole('form', { name: '초기 비밀번호 변경' })).toBeVisible();
  await expect(page.getByRole('button', { name: '내 설정 열기' })).toHaveCount(0);
});
