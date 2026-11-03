import { test, expect, type Page } from '@playwright/test';

const admin = {
  id: '68000000-0000-4000-8000-000000000001',
  loginId: 'ADMIN',
  expiresAt: '2099-01-01T00:00:00Z',
};
async function setup(page: Page) {
  const state = {
    failDelete: false,
    failReset: false,
    resetCalls: [] as unknown[],
    removeCalls: 0,
  };
  const categories = ['단어', '문법', '독해', '청해', '한자', '문제풀이', '기타'].map(
    (name, n) => ({ id: `68000000-0000-4000-8000-${String(n + 10).padStart(12, '0')}`, name }),
  );
  const members = Array.from({ length: 15 }, (_, n) => ({
    id: `68000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`,
    nickname: n === 0 ? '화면검증토끼' : `스터디원${n}`,
    emoji: ['🐰', '🐱', '🐻'][n % 3],
    joinedAt: '2026-10-26T03:00:00Z',
    credentialVersion: 1,
  }));
  await page.route('**/api/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body = method === 'GET' ? null : route.request().postDataJSON();
    if (path.endsWith('/auth/me') || path.endsWith('/auth/login'))
      return route.fulfill({ json: { data: { admin } } });
    if (path.endsWith('/auth/logout'))
      return route.fulfill({ json: { data: { loggedOut: true } } });
    if (path.endsWith('/categories') && method === 'GET')
      return route.fulfill({ json: { data: { categories } } });
    if (path.endsWith('/categories') && method === 'POST') {
      categories.push({ id: body.id, name: body.name });
      return route.fulfill({ json: { data: { category: categories.at(-1) } } });
    }
    if (path.includes('/categories/')) {
      const index = categories.findIndex((c) => c.id === path.split('/').at(-1));
      if (method === 'PATCH') {
        categories[index].name = body.name;
        return route.fulfill({ json: { data: { category: categories[index] } } });
      }
      if (state.failDelete)
        return route.fulfill({ status: 409, json: { error: { code: 'CATEGORY_IN_USE' } } });
      categories.splice(index, 1);
      return route.fulfill({ json: { data: { deleted: true } } });
    }
    if (path.endsWith('/members')) return route.fulfill({ json: { data: { members } } });
    if (path.endsWith('/reset-pin')) {
      state.resetCalls.push(body);
      if (state.failReset)
        return route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
      members.find((m) => m.id === path.split('/').at(-2))!.credentialVersion++;
      return route.fulfill({ json: { data: { reset: true } } });
    }
    if (path.includes('/members/') && method === 'DELETE') {
      state.removeCalls++;
      members.splice(
        members.findIndex((m) => m.id === path.split('/').at(-1)),
        1,
      );
      return route.fulfill({ json: { data: { deleted: true } } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  return state;
}
async function width(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('관리자 로그인 화면과 공부 종류 관리의 추가·수정·삭제를 확인한다', async ({ page }, info) => {
  await setup(page);
  await page.goto('/admin/login');
  await expect(page.getByRole('textbox', { name: '관리자 아이디' })).toHaveValue('ADMIN');
  await width(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-admin-login.png`,
    animations: 'disabled',
  });
  await page.getByLabel('관리자 비밀번호', { exact: true }).fill('ci-only-password');
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/categories/);
  await expect(page.getByRole('heading', { name: '등록된 공부 종류' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(7);
  await width(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-admin-categories.png`,
    animations: 'disabled',
  });
  await page.getByRole('textbox', { name: '종류 이름' }).fill('작문');
  await page.getByRole('button', { name: '종류 추가', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(8);
  await page.getByRole('button', { name: '작문 수정', exact: true }).click();
  await page.getByRole('textbox', { name: '종류 이름' }).fill('일본어 작문');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '일본어 작문', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '일본어 작문 삭제', exact: true }).click();
  await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '종류 삭제', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(7);
});
test('사용 중인 종류 삭제 실패는 행을 유지하고 오류를 보여준다', async ({ page }, info) => {
  const state = await setup(page);
  state.failDelete = true;
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: '단어 삭제', exact: true }).click();
  await page.getByRole('button', { name: '종류 삭제', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('사용 중인 종류');
  await expect(page.locator('article')).toHaveCount(7);
  await width(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-admin-category-error.png`,
    animations: 'disabled',
  });
});
test('회원15명·PIN 초기화·영구 삭제 확인과 취소를 검증한다', async ({ page }, info) => {
  const state = await setup(page);
  await page.goto('/admin/users');
  await expect(page.locator('article')).toHaveCount(15);
  await width(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-admin-users.png`,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '화면검증토끼 내보내기', exact: true }).click();
  await expect(
    page.getByText('계정과 모든 공부 기록이 함께 삭제됩니다. 삭제 후에는 복구할 수 없습니다.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.screenshot({
    path: `test-results/${info.project.name}-admin-remove-confirm.png`,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect(state.removeCalls).toBe(0);
  await page.getByRole('button', { name: '화면검증토끼 PIN 초기화', exact: true }).click();
  await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  const warning = page.locator('.study-alert');
  await expect
    .poll(() =>
      warning.evaluate((el) =>
        el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'),
      ),
    )
    .toBe(true);
  await expect(warning.locator('.swal2-title')).toHaveCSS('word-break', 'keep-all');
  await expect(warning.locator('.swal2-title')).toHaveCSS('font-size', '22px');
  for (const name of ['초기화', '취소']) {
    const box = await warning.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const wordLines = await warning.locator('.swal2-title').evaluate((element) => {
    const node = element.firstChild!;
    const text = node.textContent!;
    const word = '초기화할까요?';
    const start = text.indexOf(word);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + word.length);
    return range.getClientRects().length;
  });
  expect(wordLines).toBe(1);
  await page.screenshot({
    path: `test-results/${info.project.name}-admin-reset-confirm.png`,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect.poll(() => state.resetCalls.length).toBe(1);
  await expect(page.locator('article')).toHaveCount(15);
  await page.getByRole('button', { name: '화면검증토끼 내보내기', exact: true }).click();
  await page.getByRole('button', { name: '계정·기록 영구 삭제', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(14);
  const last = page.locator('article').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('button', { name: /내보내기/ })).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-admin-users-bottom.png`,
    animations: 'disabled',
  });
});
test('초기화 응답 실패 후 재시도는 같은 요청 ID를 사용하고 회원 행을 유지한다', async ({
  page,
}) => {
  const state = await setup(page);
  state.failReset = true;
  await page.goto('/admin/users');
  for (let n = 0; n < 2; n++) {
    await page.getByRole('button', { name: '화면검증토끼 PIN 초기화', exact: true }).click();
    await page.getByRole('button', { name: '초기화', exact: true }).click();
    await expect.poll(() => state.resetCalls.length).toBe(n + 1);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('연결을 확인');
  }
  expect(state.resetCalls[0]).toEqual(state.resetCalls[1]);
  await expect(page.locator('article')).toHaveCount(15);
});
test('관리자 세션 만료는 로그인으로 이동하고 일반 ADMIN 가입은 전송 전에 막는다', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/admin/auth/me', (r) =>
    r.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/join');
  await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('Admin');
  await page.getByLabel('간편 비밀번호 (숫자 4자리)', { exact: true }).fill('1234');
  await page.getByLabel('간편 비밀번호 확인', { exact: true }).fill('1234');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '공부방 시작하기' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('관리자 전용');
});

test('관리자 로그인·종류 빈 입력도 한국어로 안내하고 변경 요청을 보내지 않는다', async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route('**/api/admin/auth/login', (route) => {
    writes++;
    return route.fulfill({ status: 400, json: { error: { code: 'VALIDATION_ERROR' } } });
  });
  await page.goto('/admin/login');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(
    page.getByText('관리자 아이디와 12자 이상의 비밀번호를 입력해주세요.', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: '종류 추가', exact: true }).click();
  await expect(
    page.getByText('공부 종류 이름은 1~20자로 입력해주세요.', { exact: true }),
  ).toBeVisible();
  expect(await page.locator('article').count()).toBe(7);
});
