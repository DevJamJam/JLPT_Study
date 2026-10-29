import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ actionTimeout: 5000 });

const userId = '00000000-0000-4000-8000-000000000001';
const groupId = '00000000-0000-4000-8000-000000000002';
const categoryId = '00000000-0000-4000-8000-000000000003';
const base = {
  id: '00000000-0000-4000-8000-000000000004',
  userId,
  groupId,
  studyDate: '2026-10-29',
  categoryId,
  categoryName: '단어',
  minutes: 30,
  startTime: '09:00',
  quantity: null,
  quantityUnit: null,
  memo: '오늘 배운 단어를 복습했어요.',
  version: 1,
  createdAt: '2026-10-29T03:00:00Z',
  updatedAt: '2026-10-29T03:00:00Z',
};
async function setup(
  page: Page,
  handlers: {
    records?: (route: Route) => Promise<void>;
    categories?: (route: Route) => Promise<void>;
  } = {},
) {
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          profile: { id: userId, nickname: '공부하는 토끼', emoji: '🐰', mustChangePin: false },
          group: { id: groupId, name: 'JLPT STUDY ROOM', maxMembers: 15, memberCount: 1 },
        },
      },
    }),
  );
  await page.route(
    '**/api/categories',
    handlers.categories ??
      ((route) =>
        route.fulfill({ json: { data: { categories: [{ id: categoryId, name: '단어' }] } } })),
  );
  await page.route(
    '**/api/records**',
    handlers.records ??
      ((route) => route.fulfill({ json: { data: { records: [base], nextCursor: null } } })),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '내 기록', exact: true })).toBeVisible();
}
async function fill(page: Page) {
  await page.getByRole('button', { name: '공부 기록 남기기', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await form.getByRole('combobox', { name: '공부 종류', exact: true }).selectOption(categoryId);
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('30');
  await form.getByRole('textbox', { name: '시작 시각 (선택)', exact: true }).fill('09:00');
  await form.getByRole('textbox', { name: '메모 (선택)', exact: true }).fill(base.memo);
  return form;
}

test('저장 실패 입력 유지·동일ID 재시도·중복 차단·저장/새로고침 반영', async ({ page }, info) => {
  const saved: (typeof base)[] = [];
  const requests: Record<string, unknown>[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await setup(page, {
    records: async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (requests.length === 1) {
          await route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
          return;
        }
        await gate;
        const record = { ...base, ...body, userId, groupId };
        saved.push(record);
        await route.fulfill({ json: { data: { record } } });
      } else await route.fulfill({ json: { data: { records: saved, nextCursor: null } } });
    },
  });
  await expect(page.getByText('아직 이달에 남긴 기록이 없어요.')).toBeVisible();
  const form = await fill(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-record-form.png`,
    fullPage: true,
  });
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('같은 요청으로 다시 시도');
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    base.memo,
  );
  await expect(
    form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: '같은 요청으로 다시 시도' }).click();
  await expect(form.getByRole('button', { name: '저장 확인 중…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(form).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0].expectedUserId).toBe(userId);
  release();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('단어 · 30분', { exact: true })).toBeVisible();
  await expect(page.getByText('공부 기록을 저장했어요.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(base.memo, { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-record-list.png`,
    fullPage: true,
  });
});

test('종류 조회 실패 재시도·빈 목록 저장 차단·공부량 검증', async ({ page }) => {
  let calls = 0;
  await setup(page, {
    categories: async (route) => {
      calls++;
      if (calls === 1)
        await route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
      else
        await route.fulfill({
          json: { data: { categories: calls === 2 ? [] : [{ id: categoryId, name: '단어' }] } },
        });
    },
  });
  await page.getByRole('button', { name: '공부 기록 남기기', exact: true }).click();
  await expect(page.getByText('공부 종류를 불러오지 못했어요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '기록 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '공부 종류 다시 불러오기' }).click();
  await expect(page.getByText('등록된 공부 종류가 없어요. 관리자에게 문의해주세요.')).toBeVisible();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  const form = await fill(page);
  await form.getByRole('spinbutton', { name: '공부량 (선택)', exact: true }).fill('5');
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form.getByText('공부량과 단위를 함께 입력해 주세요.').first()).toBeVisible();
  await expect(form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true })).toHaveValue(
    '30',
  );
});

test('다음 페이지 실패는 기존 목록 유지·재시도 후 추가·월 변경은 이전 데이터 숨김', async ({
  page,
}) => {
  let nextCalls = 0;
  await setup(page, {
    records: async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('month') === '2026-09') {
        await route.fulfill({
          json: {
            data: {
              records: [{ ...base, id: 'other', studyDate: '2026-09-29', memo: '이전 달 기록' }],
              nextCursor: null,
            },
          },
        });
        return;
      }
      if (url.searchParams.has('cursor')) {
        nextCalls++;
        if (nextCalls === 1) {
          await route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
          return;
        }
        await route.fulfill({
          json: {
            data: { records: [{ ...base, id: 'second', memo: '두 번째 기록' }], nextCursor: null },
          },
        });
        return;
      }
      await route.fulfill({ json: { data: { records: [base], nextCursor: 'test-next' } } });
    },
  });
  await expect(page.getByText(base.memo, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '기록 더 보기' }).click();
  await expect(page.getByText('기록을 불러오지 못했어요. 다시 시도해주세요.')).toBeVisible();
  await expect(page.getByText(base.memo, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '기록 다시 불러오기' }).click();
  await expect(page.getByText('두 번째 기록', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이전 달' }).click();
  await expect(page.getByText('이전 달 기록', { exact: true })).toBeVisible();
  await expect(page.getByText(base.memo, { exact: true })).toHaveCount(0);
});

test('세션 만료 입력 유지·재로그인 안내, 시스템 다크 설정에서도 밝은 테마 유지', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await setup(page, {
    records: async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } });
      else await route.fulfill({ json: { data: { records: [base], nextCursor: null } } });
    },
  });
  await expect(page.getByText(base.memo, { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-record-dark.png`,
    fullPage: true,
  });
  const form = await fill(page);
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('세션이 만료');
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    base.memo,
  );
  await expect(form.getByRole('link', { name: '새 창에서 다시 로그인' })).toHaveAttribute(
    'target',
    '_blank',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('수정 기존값·저장 중 잠금·다른 달 이동과 성공 알림', async ({ page }, info) => {
  let record = { ...base };
  let payload: Record<string, unknown> | undefined;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await setup(page, {
    records: async (route) => {
      if (route.request().method() === 'PATCH') {
        payload = route.request().postDataJSON();
        await gate;
        record = { ...record, ...payload, version: 2 };
        await route.fulfill({ json: { data: { record } } });
      } else await route.fulfill({ json: { data: { records: [record], nextCursor: null } } });
    },
  });
  await page.getByRole('button', { name: '수정', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await expect(form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true })).toHaveValue(
    '30',
  );
  await expect(form.getByRole('combobox', { name: '공부 종류', exact: true })).toHaveValue(
    categoryId,
  );
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    base.memo,
  );
  await page.screenshot({ path: `test-results/${info.project.name}-record-edit.png` });
  await form.locator('input[name=studyDate]').fill('2026-09-20');
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('45');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(form.getByRole('button', { name: '저장 확인 중…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(form).toBeVisible();
  await expect
    .poll(() => payload)
    .toMatchObject({ expectedVersion: 1, expectedUserId: userId, minutes: 45 });
  release();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('단어 · 45분', { exact: true })).toBeVisible();
  await expect(page.getByText('2026년 9월', { exact: true })).toBeVisible();
  await expect(page.getByText('공부 기록을 저장했어요.', { exact: true })).toBeVisible();
});

test('수정 충돌 초안 유지·폐기 취소·최신값 확인 후 새 버전 저장', async ({ page }, info) => {
  let record = { ...base, minutes: 50, memo: '다른 기기에서 바꾼 최신 메모', version: 2 };
  const requests: Record<string, unknown>[] = [];
  await setup(page, {
    records: async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (body.expectedVersion === 1)
          await route.fulfill({
            status: 409,
            json: { error: { code: 'CONFLICT', currentRecord: record } },
          });
        else {
          record = { ...record, ...body, version: 3 };
          await route.fulfill({ json: { data: { record } } });
        }
      } else if (path.endsWith(base.id)) await route.fulfill({ json: { data: { record } } });
      else
        await route.fulfill({
          json: { data: { records: [requests.length ? record : base], nextCursor: null } },
        });
    },
  });
  await page.getByRole('button', { name: '수정', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  const memo = form.getByRole('textbox', { name: '메모 (선택)', exact: true });
  await memo.fill('내가 작성 중인 초안');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('다른 기기에서 변경');
  await expect(memo).toHaveValue('내가 작성 중인 초안');
  await expect(form.getByRole('button', { name: '수정 저장', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: '최신 기록 불러오기' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/${info.project.name}-record-conflict.png` });
  await form.getByRole('button', { name: '최신 기록 불러오기' }).click();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(memo).toHaveValue('내가 작성 중인 초안');
  expect(requests).toHaveLength(1);
  await form.getByRole('button', { name: '최신 기록 불러오기' }).click();
  await page.getByRole('button', { name: '버리기', exact: true }).click();
  await expect(memo).toHaveValue('다른 기기에서 바꾼 최신 메모');
  await memo.fill('최신 기록을 확인하고 다시 수정');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(requests.map((request) => request.expectedVersion)).toEqual([1, 2]);
  await expect(page.getByText('최신 기록을 확인하고 다시 수정', { exact: true })).toBeVisible();
});

test('수정 응답 유실은 같은 버전으로 재시도하고 충돌을 자동 덮어쓰지 않는다', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await setup(page, {
    records: async (route) => {
      if (route.request().method() === 'PATCH') {
        requests.push(route.request().postDataJSON());
        await route.fulfill({
          status: requests.length === 1 ? 503 : 409,
          json: {
            error: {
              code: requests.length === 1 ? 'AUTH_UNAVAILABLE' : 'CONFLICT',
              currentRecord: { ...base, version: 2 },
            },
          },
        });
      } else await route.fulfill({ json: { data: { records: [base], nextCursor: null } } });
    },
  });
  await page.getByRole('button', { name: '수정', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('40');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }),
  ).toBeDisabled();
  await form.getByRole('button', { name: '같은 요청으로 다시 시도' }).click();
  await expect(form.getByRole('button', { name: '최신 기록 불러오기' })).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);
  await expect(form.getByRole('button', { name: '수정 저장', exact: true })).toBeDisabled();
});

test('삭제 취소·실패 재시도·중복 차단·마지막 기록 빈 상태', async ({ page }, info) => {
  let deleted = false;
  const requests: Record<string, unknown>[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await setup(page, {
    records: async (route) => {
      if (route.request().method() === 'DELETE') {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1)
          await route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
        else {
          await gate;
          deleted = true;
          await route.fulfill({ json: { data: { deletedId: base.id } } });
        }
      } else
        await route.fulfill({
          json: { data: { records: deleted ? [] : [base], nextCursor: null } },
        });
    },
  });
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '공부 기록 삭제', exact: true });
  await dialog.getByRole('button', { name: '기록 삭제', exact: true }).click();
  await expect(page.getByText('삭제한 기록은 복구할 수 없어요.', { exact: false })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.swal2-popup')
        .evaluate((element) =>
          element.getAnimations().every((animation) => animation.playState !== 'running'),
        ),
    )
    .toBe(true);
  const heading = page.getByRole('heading', { name: '기록을 삭제할까요?', exact: true });
  expect(
    await heading.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    }),
  ).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-record-delete-confirm.png`,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect(requests).toHaveLength(0);
  await dialog.getByRole('button', { name: '기록 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('삭제 결과를 확인하지 못했어요');
  await dialog.getByRole('button', { name: '기록 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '삭제 확인 중…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('아직 이달에 남긴 기록이 없어요.')).toBeVisible();
  await expect(page.getByText('공부 기록을 삭제했어요.', { exact: true })).toBeVisible();
});

test('삭제 충돌은 최신 기록 확인 후 다시 확인한 버전만 삭제한다', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  const latest = { ...base, minutes: 60, memo: '보호해야 하는 최신 기록', version: 2 };
  await setup(page, {
    records: async (route) => {
      if (route.request().method() === 'DELETE') {
        const body = route.request().postDataJSON();
        requests.push(body);
        await route.fulfill(
          body.expectedVersion === 1
            ? { status: 409, json: { error: { code: 'CONFLICT', currentRecord: latest } } }
            : { json: { data: { deletedId: base.id } } },
        );
      } else if (new URL(route.request().url()).pathname.endsWith(base.id))
        await route.fulfill({ json: { data: { record: latest } } });
      else await route.fulfill({ json: { data: { records: [base], nextCursor: null } } });
    },
  });
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '공부 기록 삭제', exact: true });
  await dialog.getByRole('button', { name: '기록 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '기록 삭제', exact: true })).toBeDisabled();
  expect(requests).toHaveLength(1);
  await dialog.getByRole('button', { name: '최신 기록 확인' }).click();
  await expect(dialog.getByText('보호해야 하는 최신 기록', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '기록 삭제', exact: true }).click();
  await expect(page.getByText('2026-10-29 · 단어 · 60분', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests.map((request) => request.expectedVersion)).toEqual([1, 2]);
});

test('수정 세션 만료는 초안을 유지하고 다른 계정은 재전송을 차단한다', async ({ page }) => {
  let calls = 0;
  await setup(page, {
    records: async (route) => {
      if (route.request().method() === 'PATCH') {
        calls++;
        await route.fulfill({
          status: calls === 1 ? 401 : 409,
          json: { error: { code: calls === 1 ? 'UNAUTHORIZED' : 'ACCOUNT_CHANGED' } },
        });
      } else await route.fulfill({ json: { data: { records: [base], nextCursor: null } } });
    },
  });
  await page.getByRole('button', { name: '수정', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await form
    .getByRole('textbox', { name: '메모 (선택)', exact: true })
    .fill('세션이 만료돼도 남아 있는 초안');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(form.getByRole('link', { name: '새 창에서 다시 로그인' })).toBeVisible();
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    '세션이 만료돼도 남아 있는 초안',
  );
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(form.getByRole('button', { name: '수정 저장', exact: true })).toBeDisabled();
  expect(calls).toBe(2);
});
