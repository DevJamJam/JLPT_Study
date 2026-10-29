import { test, expect, type Page } from '@playwright/test';
import { stubRecordReads } from './record-fixture';

test.beforeEach(async ({ page }) => stubRecordReads(page));

const profile = {
  id: '00000000-0000-4000-8000-000000000001',
  nickname: '검사계정',
  emoji: '🐰',
  mustChangePin: false,
};
const group = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'JLPT STUDY ROOM',
  maxMembers: 15,
  memberCount: 1,
};
async function setup(page: Page, current = () => profile) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { data: { profile: current(), group } } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '내 설정 열기' }).click();
}
const chosen = (page: Page, value: string) => page.getByRole('radio', { name: new RegExp(value) });
test('대표 이모지20개·실패 선택 유지·중복 제출 차단·저장 후 갱신', async ({ page }, info) => {
  let emoji = '🐰';
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/me/emoji', async (route) => {
    calls++;
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({ emoji: '🐱' });
    if (calls === 1)
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
    else {
      await gate;
      emoji = '🐱';
      await route.fulfill({ json: { data: { profile: { ...profile, emoji } } } });
    }
  });
  await setup(page, () => ({ ...profile, emoji }));
  const dialog = page.getByRole('dialog', { name: '내 설정', exact: true });
  await expect(dialog.getByRole('radio')).toHaveCount(20);
  await expect(chosen(page, '🐰')).toBeChecked();
  await expect(dialog.getByRole('button', { name: '이모티콘 저장', exact: true })).toBeDisabled();
  await chosen(page, '🐱').check();
  expect((await chosen(page, '🐱').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-profile-emoji.png`,
    fullPage: true,
  });
  await dialog.getByRole('button', { name: '이모티콘 저장', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('입력한 내용은 그대로');
  await expect(chosen(page, '🐱')).toBeChecked();
  await dialog.getByRole('button', { name: '이모티콘 저장', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '확인하고 있어요…' })).toBeDisabled();
  await dialog.getByRole('button', { name: '팝업 닫기' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(calls).toBe(2);
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내 설정 열기' })).toContainText('🐱');
  await expect(page.getByText('이모티콘을 저장했어요.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '내 설정 열기' })).toContainText('🐱');
});
test('변경을 버리기 전 확인·취소 선택 유지·PIN 전환과 로그아웃 보호', async ({ page }) => {
  let logoutCalls = 0;
  await page.route('**/api/auth/logout', (route) => {
    logoutCalls++;
    return route.fulfill({ json: { data: { loggedOut: true } } });
  });
  await setup(page);
  await chosen(page, '🐱').check();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(page.getByText('작성한 내용을 버릴까요?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(chosen(page, '🐱')).toBeChecked();
  await page.getByRole('button', { name: '간편 비밀번호 변경', exact: true }).click();
  await page.getByRole('button', { name: '버리기', exact: true }).click();
  await expect(page.getByRole('form', { name: '간편 비밀번호 변경', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '설정으로 돌아가기', exact: true }).click();
  await expect(chosen(page, '🐰')).toBeChecked();
  await chosen(page, '🐱').check();
  const dialog = page.getByRole('dialog', { name: '내 설정', exact: true });
  await dialog.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  expect(logoutCalls).toBe(0);
  await expect(chosen(page, '🐱')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '버리기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내 설정 열기' })).toBeFocused();
  expect(logoutCalls).toBe(0);
});
test('저장 중 만료는 재로그인을 안내하고 선택을 보존한다', async ({ page }) => {
  await page.route('**/api/me/emoji', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await setup(page);
  await chosen(page, '🐱').check();
  await page.getByRole('button', { name: '이모티콘 저장', exact: true }).click();
  await expect(page.getByRole('link', { name: '다시 로그인', exact: true })).toHaveAttribute(
    'href',
    '/login',
  );
  await expect(chosen(page, '🐱')).toBeChecked();
  await expect(page.getByRole('button', { name: '이모티콘 저장', exact: true })).toBeDisabled();
});
