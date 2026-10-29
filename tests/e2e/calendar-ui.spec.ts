import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ actionTimeout: 6000 });
const userId = '58000000-0000-4000-8000-000000000001';
const groupId = '58000000-0000-4000-8000-000000000002';
const categoryId = '58000000-0000-4000-8000-000000000003';
const recordId = '58000000-0000-4000-8000-000000000004';
const today = '2026-10-29';
const base = {
  id: recordId,
  userId,
  groupId,
  categoryId,
  categoryName: '단어',
  studyDate: today,
  minutes: 30,
  startTime: '09:00',
  quantity: null,
  quantityUnit: null,
  memo: '오늘 배운 단어를 복습했어요.',
  version: 1,
  createdAt: '2026-10-29T03:00:00Z',
  updatedAt: '2026-10-29T03:00:00Z',
};
async function setup(page: Page, url = '/calendar', crowded = false) {
  const members = Array.from({ length: crowded ? 15 : 2 }, (_, index) => ({
    id: index === 0 ? userId : '58000000-0000-4000-8000-' + String(100 + index).padStart(12, '0'),
    nickname: index === 0 ? '공부하는 토끼' : '스터디원' + index,
    emoji: ['🐰', '🐱', '🐶', '🐼', '🐻'][index % 5],
    joinedAt: '2026-10-01T00:00:00Z',
  }));
  const records = members.map((member, index) => ({
    ...base,
    userId: member.id,
    id: index === 0 ? recordId : '58000000-0000-4000-8000-' + String(200 + index).padStart(12, '0'),
    memo: index === 0 ? base.memo : '<script>실행하지 않는 공동 메모</script>',
  }));
  const state = {
    calendarStatus: 200,
    writeStatus: 200,
    lostCreate: false,
    release: null as null | Promise<void>,
    requests: [] as { method: string; body: Record<string, unknown> }[],
  };
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          profile: { id: userId, nickname: '공부하는 토끼', emoji: '🐰', mustChangePin: false },
          group: {
            id: groupId,
            name: 'JLPT STUDY ROOM',
            maxMembers: 15,
            memberCount: members.length,
          },
        },
      },
    }),
  );
  await page.route('**/api/members', (route) => route.fulfill({ json: { data: { members } } }));
  await page.route('**/api/categories', (route) =>
    route.fulfill({ json: { data: { categories: [{ id: categoryId, name: '단어' }] } } }),
  );
  await page.route('**/api/calendar?**', async (route) => {
    if (state.calendarStatus !== 200) {
      await route.fulfill({
        status: state.calendarStatus,
        json: {
          error: { code: state.calendarStatus === 401 ? 'UNAUTHORIZED' : 'AUTH_UNAVAILABLE' },
        },
      });
      return;
    }
    const params = new URL(route.request().url()).searchParams;
    const date = new Date(params.get('from')! + 'T00:00:00Z');
    const days = [];
    while (date.toISOString().slice(0, 10) <= params.get('to')!) {
      const key = date.toISOString().slice(0, 10);
      const participants = members.flatMap((member) => {
        const selected = records.filter(
          (record) =>
            record.studyDate === key &&
            record.userId === member.id &&
            (params.get('scope') === 'group' || member.id === userId),
        );
        return selected.length
          ? [{ userId: member.id, minutes: selected.reduce((sum, row) => sum + row.minutes, 0) }]
          : [];
      });
      days.push({
        date: key,
        totalMinutes: participants.reduce((sum, person) => sum + person.minutes, 0),
        participants,
      });
      date.setUTCDate(date.getUTCDate() + 1);
    }
    await route.fulfill({ json: { data: { days } } });
  });
  await page.route('**/api/records**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url());
    const method = request.method();
    if (method === 'GET') {
      if (path.pathname.endsWith('/records')) {
        const p = path.searchParams;
        const selected = records.filter(
          (record) =>
            (p.get('scope') !== 'mine' || record.userId === userId) &&
            (p.has('month')
              ? record.studyDate.startsWith(p.get('month')!)
              : record.studyDate >= p.get('from')! && record.studyDate <= p.get('to')!),
        );
        await route.fulfill({ json: { data: { records: selected, nextCursor: null } } });
      } else {
        const record = records.find((record) => path.pathname.endsWith(record.id));
        await route.fulfill(
          record
            ? { json: { data: { record } } }
            : { status: 404, json: { error: { code: 'NOT_FOUND' } } },
        );
      }
      return;
    }
    const body = request.postDataJSON();
    state.requests.push({ method, body });
    if (state.release) await state.release;
    if (state.writeStatus !== 200) {
      await route.fulfill({
        status: state.writeStatus,
        json: { error: { code: 'AUTH_UNAVAILABLE' } },
      });
      return;
    }
    if (method === 'POST') {
      const record = { ...base, ...body };
      if (!records.some((row) => row.id === record.id)) records.push(record);
      if (state.lostCreate) {
        state.lostCreate = false;
        await route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE' } } });
      } else await route.fulfill({ json: { data: { record } } });
    } else {
      const index = records.findIndex((record) => path.pathname.endsWith(record.id));
      if (method === 'PATCH') {
        records[index] = { ...records[index], ...body, version: records[index].version + 1 };
        await route.fulfill({ json: { data: { record: records[index] } } });
      } else {
        const [record] = records.splice(index, 1);
        await route.fulfill({ json: { data: { deletedId: record.id } } });
      }
    }
  });
  await page.goto(url);
  await expect(page.getByRole('button', { name: '달력 새로고침' })).toBeVisible();
  await expect(page.locator(`[data-date="${today}"]`)).toBeEnabled();
  return { state, records, members };
}
const day = (page: Page, date = today) => page.locator(`[data-date="${date}"]`);
async function openDay(page: Page, date = today) {
  await day(page, date).click();
  return page.getByRole('dialog', { name: `${date} 공부 기록`, exact: true });
}
async function newForm(page: Page, date = '2026-10-28') {
  const dialog = await openDay(page, date);
  await dialog.getByRole('button', { name: '＋ 공부 기록 남기기', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await form.getByRole('combobox', { name: '공부 종류', exact: true }).selectOption(categoryId);
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('45');
  return form;
}

test('월간42칸·15명 축약·개인 보기·공통 메뉴를 실제 데이터로 연결한다', async ({ page }, info) => {
  await setup(page, '/calendar', true);
  await expect(page.getByTestId('live-month-grid').locator('button')).toHaveCount(42);
  const wide = info.project.name !== 'SE3';
  await expect(day(page).getByText(wide ? '+4' : '+12', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-calendar-group.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: '내 월간', exact: true }).click();
  await expect(day(page).getByText('30분', { exact: true })).toBeVisible();
  await expect(day(page).getByText('+12', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-calendar-mine.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: '내 설정 열기' }).click();
  await expect(page.getByRole('dialog', { name: '내 설정', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await page
    .getByRole('navigation', { name: '하단 메뉴' })
    .getByRole('button', { name: '내 기록', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '내 기록', exact: true })).toBeVisible();
});

test('그룹 상세는 전원 공개 기록을 가입순으로 보여주고 본인만 수정/삭제한다', async ({
  page,
}, info) => {
  await setup(page, '/calendar', true);
  const dialog = await openDay(page);
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveCount(15);
  await expect(dialog.getByRole('button', { name: '수정', exact: true })).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: '삭제', exact: true })).toHaveCount(1);
  await expect(
    dialog.getByText('<script>실행하지 않는 공동 메모</script>', { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-calendar-detail.png` });
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(day(page)).toBeFocused();
});

test('선택 날짜 추가·응답 유실 재시도·상세 복귀·마지막 삭제가 달력에 반영된다', async ({
  page,
}) => {
  const { state, records } = await setup(page);
  state.lostCreate = true;
  const form = await newForm(page);
  await expect(form.locator('input[name=studyDate]')).toHaveValue('2026-10-28');
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form.getByRole('button', { name: '같은 요청으로 다시 시도' })).toBeVisible();
  await form.getByRole('button', { name: '같은 요청으로 다시 시도' }).click();
  const detail = page.getByRole('dialog', { name: '2026-10-28 공부 기록', exact: true });
  await expect(detail.getByText('단어 · 45분', { exact: true })).toBeVisible();
  await expect(page.getByText('공부 기록을 저장했어요.', { exact: true })).toBeVisible();
  expect(records.filter((record) => record.studyDate === '2026-10-28')).toHaveLength(1);
  expect(state.requests[1].body.id).toBe(state.requests[0].body.id);
  await detail.getByRole('button', { name: '삭제', exact: true }).click();
  await page
    .getByRole('dialog', { name: '공부 기록 삭제', exact: true })
    .getByRole('button', { name: '기록 삭제', exact: true })
    .click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(detail.getByText('아직 기록이 없어요. 공부 기록을 남겨 보아요.')).toBeVisible();
  await expect(page.getByText('공부 기록을 삭제했어요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(day(page, '2026-10-28').locator('[title="공부하는 토끼"]')).toHaveCount(0);
});

test('상세 수정은 새 날짜로 돌아가고 중첩 팝업을 만들지 않는다', async ({ page }) => {
  const { state } = await setup(page);
  const detail = await openDay(page);
  await detail.getByRole('button', { name: '수정', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    base.memo,
  );
  await form.locator('input[name=studyDate]').fill('2026-10-27');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '2026-10-27 공부 기록', exact: true }),
  ).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  expect(state.requests[0].body.expectedVersion).toBe(1);
});

test('뒤로가기 취소는 초안을 유지하고 제출 중에는 팝업을 유지한다', async ({ page }) => {
  page.on('console', (message) => console.log('calendar history diagnostic:', message.text()));
  const { state } = await setup(page);
  const form = await newForm(page);
  await form
    .getByRole('textbox', { name: '메모 (선택)', exact: true })
    .fill('뒤로가도 남아 있는 초안');
  await page.goBack();
  await expect(page.getByRole('button', { name: '계속 작성', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    '뒤로가도 남아 있는 초안',
  );
  let release: () => void = () => {};
  state.release = new Promise<void>((resolve) => {
    release = resolve;
  });
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form.getByRole('button', { name: '저장 확인 중…' })).toBeDisabled();
  await page.goBack();
  await expect(form).toBeVisible();
  release();
  await expect(
    page.getByRole('dialog', { name: '2026-10-28 공부 기록', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  const next = await newForm(page, '2026-10-27');
  await next.getByRole('textbox', { name: '메모 (선택)', exact: true }).fill('폐기할 초안');
  await page.goBack();
  await page.getByRole('button', { name: '버리기', exact: true }).click();
  await expect(next).toHaveCount(0);
  await expect(page).not.toHaveURL(/date=/);
});

test('주간 날짜·빈 날 추가·기간 이동과 하단 오늘 추가를 연결한다', async ({ page }, info) => {
  await setup(page);
  await page.getByRole('button', { name: '내 주간', exact: true }).click();
  await expect(page.getByTestId('week-grid').locator('[data-week-date]')).toHaveCount(7);
  const empty = page.locator('[data-week-date="2026-10-28"]');
  await empty.getByRole('button', { name: '기록 추가 ＋', exact: true }).click();
  await expect(
    page.getByRole('form', { name: '공부 기록 입력' }).locator('input[name=studyDate]'),
  ).toHaveValue('2026-10-28');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await page.screenshot({
    path: `test-results/${info.project.name}-calendar-week.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: '이전 주' }).click();
  await expect(page.locator('[data-week-date="2026-10-19"]')).toBeVisible();
  await page.getByRole('button', { name: '새 공부 기록', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await expect(form.locator('input[name=studyDate]')).toHaveValue(today);
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(form).toHaveCount(0);
});

test('갱신 실패는 이전 기록 유지, 세션 만료는 이전 기록 숨김', async ({ page }) => {
  const { state } = await setup(page);
  await expect(day(page).locator('[title="공부하는 토끼"]')).toBeVisible();
  state.calendarStatus = 503;
  await page.getByRole('button', { name: '달력 새로고침' }).click();
  await expect(page.getByRole('region', { name: '공부 달력' }).getByRole('alert')).toContainText(
    '달력을 불러오지 못했어요',
  );
  await expect(day(page).locator('[title="공부하는 토끼"]')).toBeVisible();
  state.calendarStatus = 401;
  await page.getByRole('button', { name: '달력 다시 불러오기' }).click();
  await expect(page.getByRole('region', { name: '공부 달력' }).getByRole('alert')).toContainText(
    '세션을 다시 확인',
  );
  await expect(day(page)).toBeDisabled();
  await expect(day(page).locator('[title="공부하는 토끼"]')).toHaveCount(0);
});

test('직접 날짜 주소·미래 추가 차단·잘못된 팝업 주소 정리', async ({ page }) => {
  await setup(page, '/calendar?view=mine&month=2026-10&date=2026-10-30&scope=mine');
  const detail = page.getByRole('dialog', { name: '2026-10-30 공부 기록', exact: true });
  await expect(
    detail.getByRole('button', { name: '＋ 공부 기록 남기기', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(page).not.toHaveURL(/date=/);
  await page.goto('/calendar?month=wrong&date=bad&panel=edit&recordId=wrong');
  await expect(page).not.toHaveURL(/date=|recordId=|wrong/);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
