import { test, expect, type Page } from '@playwright/test';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('월간·주간 간격, 달력 42칸, 화살표와 프로필 중앙 정렬', async ({ page }, info) => {
  await page.goto('/preview');
  await expect(page.locator('[data-date]')).toHaveCount(42);
  const picker = page.getByTestId('period-picker');
  const monthlyY = (await picker.boundingBox())!.y;
  for (const selector of [
    '[aria-label="이전 달"]',
    '[aria-label="다음 달"]',
    '[aria-label="내 설정 열기"]',
  ]) {
    const delta = await page.locator(selector).evaluate((button) => {
      const outer = button.getBoundingClientRect();
      const inner = button.firstElementChild!.getBoundingClientRect();
      return {
        x: Math.abs(outer.x + outer.width / 2 - inner.x - inner.width / 2),
        y: Math.abs(outer.y + outer.height / 2 - inner.y - inner.height / 2),
      };
    });
    expect(delta.x).toBeLessThanOrEqual(1);
    expect(delta.y).toBeLessThanOrEqual(1);
  }
  await noOverflow(page);
  await page.screenshot({ path: `test-results/${info.project.name}-month.png`, fullPage: false });
  await page.getByRole('button', { name: '내 주간', exact: true }).click();
  expect(Math.abs((await picker.boundingBox())!.y - monthlyY)).toBeLessThanOrEqual(1);
  const columns = await page
    .getByTestId('week-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(info.project.name === 'SE3' ? 1 : info.project.name === 'pad' ? 2 : 7);
  await noOverflow(page);
  await page.screenshot({ path: `test-results/${info.project.name}-week.png`, fullPage: false });
});

test('공휴일 빨강이 토요일 파랑보다 우선하고 월 이동', async ({ page }) => {
  await page.goto('/preview');
  const color = (date: string) =>
    page
      .locator(`[data-date="${date}"] > span`)
      .first()
      .evaluate((span) => getComputedStyle(span).color);
  expect(await color('2026-10-03')).toBe('rgb(182, 60, 85)');
  expect(await color('2026-10-10')).toBe('rgb(53, 99, 166)');
  expect(await color('2026-10-05')).toBe('rgb(182, 60, 85)');
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(page.getByTestId('period-picker')).toContainText('2026년 11월');
  await expect(page.locator('[data-date]')).toHaveCount(42);
});

test('날짜 상세→입력은 단일 팝업, 저장 실패 입력 유지, 닫기 확인', async ({ page }, info) => {
  await page.goto('/preview');
  await page.locator('[data-date="2026-10-06"]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByRole('button', { name: '＋ 공부 기록 남기기', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.getByLabel('공부 날짜')).toHaveValue('2026-10-06');
  await page.getByLabel('공부 시간 (분)').fill('45');
  await page.getByLabel('메모 (선택)').fill('입력 유지 확인');
  await page.getByLabel('저장 실패 상태 확인').check();
  await page.getByRole('button', { name: '저장 상태 확인', exact: true }).click();
  await expect(page.locator('dialog').getByRole('alert')).toContainText('입력한 내용은 그대로');
  await expect(page.getByLabel('공부 시간 (분)')).toHaveValue('45');
  await expect(page.getByLabel('메모 (선택)')).toHaveValue('입력 유지 확인');
  expect(
    await page
      .getByLabel('시작 시각 (선택)')
      .evaluate((input) => (input as HTMLInputElement).required),
  ).toBe(false);
  await page.screenshot({ path: `test-results/${info.project.name}-input.png`, fullPage: false });
  const overflow = await page.locator('dialog').evaluate((dialog) => ({
    overflow: getComputedStyle(dialog).overflow,
    body: getComputedStyle(dialog.lastElementChild!).overflowY,
  }));
  expect(overflow).toEqual({ overflow: 'hidden', body: 'auto' });
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '작성한 내용을 버릴까요?' })).toHaveCount(1);
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.getByLabel('메모 (선택)')).toHaveValue('입력 유지 확인');
  await page.getByRole('button', { name: '날짜 기록으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '버리기', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('dialog')).toContainText('2026-10-06 공부 기록');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('[data-date="2026-10-06"]')).toBeFocused();
});

test('스터디·내 기록·홈·로그인 가로 넘침과 설정 진입', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/preview');
  for (const name of ['스터디', '내 기록', '홈']) {
    await page
      .getByRole('navigation', { name: '하단 메뉴' })
      .getByRole('button', { name, exact: true })
      .click();
    await noOverflow(page);
    await page.screenshot({
      path: `test-results/${info.project.name}-${name === '홈' ? 'home' : name === '스터디' ? 'study' : 'dashboard'}.png`,
      fullPage: false,
    });
  }
  await page.getByRole('button', { name: '내 설정 열기' }).click();
  await expect(page.locator('dialog')).toContainText('내 설정');
  await page.getByRole('button', { name: '🐳 이모지 선택' }).click();
  await page.getByRole('button', { name: '이모지 저장', exact: true }).click();
  await expect(page.getByTestId('profile-emoji')).toHaveText('🐳');
  await expect(page.getByText('시안의 이모지를 변경했어요')).toBeVisible();
  await page.getByRole('button', { name: '로그인 시안 보기', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '하단 메뉴' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내 설정 열기' })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: `test-results/${info.project.name}-login.png`, fullPage: false });
  expect(errors).toEqual([]);
});
