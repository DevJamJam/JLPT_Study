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

test('선택 이모지 20개는 실제 컬러 폰트로 렌더링', async ({ page }, info) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: '내 설정 열기' }).click();
  const buttons = page.locator('button[aria-label$="이모지 선택"]');
  await expect(buttons).toHaveCount(20);
  await page.evaluate(() => document.fonts.ready);
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument');
  for (let index = 0; index < 20; index++) {
    const label = await buttons.nth(index).getAttribute('aria-label');
    const { nodeId } = await client.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `button[aria-label="${label}"]`,
    });
    const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(
      fonts.some(
        (font) =>
          ['Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji'].includes(font.familyName) &&
          font.glyphCount > 0,
      ),
      `${label}의 실제 컬러 폰트`,
    ).toBe(true);
  }
  await page.screenshot({ path: `test-results/${info.project.name}-color-settings.png` });
});

test('주간 기록 유무·미래 진입과 줄 높이·버튼 정렬', async ({ page }, info) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: '내 주간', exact: true }).click();
  const day = (date: string) => page.locator(`[data-week-date="${date}"]`);
  await day('2026-10-06').getByRole('button', { name: '기록 보기', exact: true }).click();
  await expect(page.locator('dialog')).toContainText('2026-10-06 공부 기록');
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await day('2026-10-07').getByRole('button', { name: '기록 추가 ＋', exact: true }).click();
  await expect(page.getByLabel('공부 날짜')).toHaveValue('2026-10-07');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(
    day('2026-10-08').getByRole('button', { name: '기록 추가 ＋', exact: true }),
  ).toBeDisabled();
  await expect(day('2026-10-08')).toContainText('아직 오지 않은 날짜예요.');
  await expect(day('2026-10-07')).toContainText('아직 기록이 없어요. 공부 기록을 남겨 보아요.');
  const rows = await page.locator('[data-week-date]').evaluateAll((cards) =>
    cards.map((card) => {
      const button = card.querySelector('button')!;
      const box = card.getBoundingClientRect();
      return { y: box.y, width: box.width, actionY: button.getBoundingClientRect().y };
    }),
  );
  for (const row of rows) {
    for (const other of rows.filter((candidate) => Math.abs(candidate.y - row.y) < 1)) {
      expect(Math.abs(row.actionY - other.actionY)).toBeLessThanOrEqual(1);
    }
  }
  if (info.project.name === 'pad') {
    const grid = (await page.getByTestId('week-grid').boundingBox())!;
    expect(Math.abs(rows[6].width - grid.width)).toBeLessThanOrEqual(1);
  }
  if (info.project.name === 'desktop') {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const menu = (await page.getByRole('navigation', { name: '하단 메뉴' }).boundingBox())!;
    for (const button of await page.locator('[data-week-date] button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(menu.y);
    }
  }
  await page.screenshot({ path: `test-results/${info.project.name}-week-aligned.png` });
  // 기존 메모를 길게 바꾸어 실제 줄바꿈과 노트 줄 높이를 검사한다. 데이터 저장은 하지 않는다.
  await day('2026-10-06')
    .locator('p')
    .first()
    .evaluate((memo) => {
      memo.textContent = '헷갈린 단어를 다시 읽고 예문을 천천히 공부했어요. '.repeat(5);
    });
  const metrics = await day('2026-10-06')
    .locator('p')
    .first()
    .evaluate((memo) => {
      const range = document.createRange();
      range.selectNodeContents(memo);
      const rects = Array.from(range.getClientRects());
      const parent = memo.closest('[data-week-date]')!.getBoundingClientRect();
      const style = getComputedStyle(memo);
      return {
        lineHeight: style.lineHeight,
        margin: style.margin,
        lineYs: [...new Set(rects.map((rect) => rect.y))],
        fits: rects.every((rect) => rect.x >= parent.x && rect.right <= parent.right),
      };
    });
  expect(metrics.lineHeight).toBe('24px');
  expect(metrics.margin).toBe('0px');
  expect(metrics.fits).toBe(true);
  expect(metrics.lineYs.length).toBeGreaterThan(1);
  for (let index = 1; index < metrics.lineYs.length; index++) {
    expect(metrics.lineYs[index] - metrics.lineYs[index - 1]).toBe(24);
  }
  await noOverflow(page);
  await page.screenshot({ path: `test-results/${info.project.name}-week-long-memo.png` });
});
