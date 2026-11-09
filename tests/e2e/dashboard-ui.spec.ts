import { test, expect, type Page } from '@playwright/test';
import { monthSummary } from '../../src/server/dashboard/aggregate';
import type { StudyRecord } from '../../src/features/study-record/types';
import { separatedShell } from './layout-assertions';
const id = (n: number) => `84000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userId = id(1),
  groupId = id(2),
  categoryId = id(3);
const categories = [
  { id: categoryId, name: '단어' },
  { id: id(4), name: '관리자가 추가한 아주 긴 공부종류' },
  { id: id(5), name: '청해' },
];
const base: StudyRecord = {
  id: id(100),
  userId,
  groupId,
  categoryId,
  categoryName: '단어',
  studyDate: '2026-10-29',
  minutes: 30,
  startTime: null,
  quantity: null,
  quantityUnit: null,
  memo: '월간 통계 검증 기록',
  version: 1,
  createdAt: '2026-10-29T03:00:00Z',
  updatedAt: '2026-10-29T03:00:00Z',
};
async function setup(page: Page, initial: StudyRecord[]) {
  const state = { records: initial, status: 200, wrongOwner: false };
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          profile: { id: userId, nickname: '대시보드토끼', emoji: '🐰', mustChangePin: false },
          group: { id: groupId, name: 'JLPT STUDY ROOM', maxMembers: 15, memberCount: 1 },
        },
      },
    }),
  );
  await page.route('**/api/categories', (route) =>
    route.fulfill({ json: { data: { categories } } }),
  );
  await page.route('**/api/me/dashboard?**', (route) => {
    if (state.status !== 200)
      return route.fulfill({
        status: state.status,
        json: { error: { code: state.status === 401 ? 'UNAUTHORIZED' : 'AUTH_UNAVAILABLE' } },
      });
    const month = new URL(route.request().url()).searchParams.get('month')!;
    return route.fulfill({
      json: {
        data: {
          ...monthSummary(
            month,
            userId,
            groupId,
            state.records.filter((r) => r.studyDate.startsWith(month)),
            categories,
          ),
          userId: state.wrongOwner ? id(9) : userId,
        },
      },
    });
  });
  await page.route('**/api/records**', (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const record = { ...base, ...body, userId, groupId };
      state.records.push(record);
      return route.fulfill({ json: { data: { record } } });
    }
    if (method === 'PATCH') {
      const index = state.records.findIndex((r) => r.id === url.pathname.split('/').at(-1));
      state.records[index] = {
        ...state.records[index],
        ...route.request().postDataJSON(),
        version: state.records[index].version + 1,
      };
      return route.fulfill({ json: { data: { record: state.records[index] } } });
    }
    if (method === 'DELETE') {
      const deletedId = url.pathname.split('/').at(-1);
      state.records = state.records.filter((r) => r.id !== deletedId);
      return route.fulfill({ json: { data: { deletedId } } });
    }
    const records = state.records.filter((r) =>
      r.studyDate.startsWith(url.searchParams.get('month')!),
    );
    const offset = url.searchParams.has('cursor') ? 30 : 0;
    return route.fulfill({
      json: {
        data: {
          records: records.slice(offset, offset + 30),
          nextCursor: offset === 0 && records.length > 30 ? 'page2' : null,
        },
      },
    });
  });
  await page.goto('/me?month=2026-10');
  await expect(page.getByRole('region', { name: '월간 공부 통계' })).toBeVisible();
  return state;
}
const stats = (page: Page) => page.getByRole('region', { name: '월간 공부 통계' });
async function captureTop(page: Page, path: string) {
  await page.locator('main').evaluate((el) => (el.scrollTop = 0));
  await separatedShell(page);
  await page.screenshot({ path });
}

test('월 전체33건 통계·0분 종류·페이지 추가·월 이동·빈 월과 반응형 화면', async ({
  page,
}, info) => {
  const rows = Array.from({ length: 33 }, (_, n) => ({
    ...base,
    id: id(100 + n),
    studyDate: n < 31 ? '2026-10-29' : '2026-10-28',
    minutes: n < 31 ? 30 : 45,
    categoryId: n < 31 ? categoryId : id(4),
    categoryName: n < 31 ? '단어' : categories[1].name,
  }));
  await setup(page, rows);
  await expect(stats(page)).toContainText('17시간');
  await expect(stats(page)).toContainText('33개');
  await expect(stats(page).getByRole('progressbar')).toHaveCount(2);
  await expect(stats(page).getByText('청해', { exact: true })).toHaveCount(0);
  await expect(stats(page)).toContainText('2일');
  await expect(stats(page)).toContainText('8시간 30분');
  await expect(stats(page)).toContainText('15시간 30분');
  await expect(page.locator('article')).toHaveCount(30);
  await captureTop(page, `test-results/${info.project.name}-dashboard-populated.png`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await stats(page)
    .getByRole('progressbar', { name: categories[1].name + ' 공부 시간', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/${info.project.name}-dashboard-categories.png` });
  await page.getByRole('button', { name: '기록 더 보기', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(33);
  await expect(stats(page)).toContainText('33개');
  await page.getByRole('button', { name: '이전 달', exact: true }).click();
  await expect(page).toHaveURL(/month=2026-09/);
  await expect(stats(page)).toContainText('0개');
  await expect(stats(page).getByRole('progressbar')).toHaveCount(0);
  await expect(stats(page).getByText('이 달에 남긴 공부 기록이 없어요.')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await captureTop(page, `test-results/${info.project.name}-dashboard-empty.png`);
  await page.reload();
  await expect(page.getByText('2026년 9월', { exact: true })).toBeVisible();
});

test('추가·수정·마지막 삭제는 카드·하루 합계·종류 막대를 즉시 갱신한다', async ({ page }) => {
  await setup(page, [{ ...base }]);
  await page.getByRole('button', { name: '공부 기록 남기기', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await form.getByRole('combobox', { name: '공부 종류', exact: true }).selectOption(categoryId);
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('30');
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(stats(page)).toContainText('2개');
  await expect(stats(page)).toContainText('1시간');
  await page.getByRole('button', { name: '수정', exact: true }).first().click();
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('60');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    stats(page).getByRole('progressbar', { name: '단어 공부 시간', exact: true }),
  ).toHaveAttribute('value', '90');
  for (const count of [1, 0]) {
    await page.getByRole('button', { name: '삭제', exact: true }).first().click();
    await page
      .getByRole('dialog', { name: '공부 기록 삭제', exact: true })
      .getByRole('button', { name: '기록 삭제', exact: true })
      .click();
    await page.locator('.swal2-confirm').click();
    await expect(stats(page)).toContainText(`${count}개`);
  }
  await expect(stats(page)).toContainText('0일');
  await expect(stats(page).getByRole('progressbar')).toHaveCount(0);
  await expect(stats(page).getByText('이 달에 남긴 공부 기록이 없어요.')).toBeVisible();
});

test('통계 갱신 실패는 이전 값 유지, 월 이동은 이전 값 숨김, 만료·계정 변경은 모든 이전 정보 숨김', async ({
  page,
}) => {
  const state = await setup(page, [{ ...base }]);
  state.status = 503;
  await page.getByRole('button', { name: '기록 새로고침', exact: true }).click();
  await expect(
    page.getByRole('region', { name: '내 기록', exact: true }).getByRole('alert'),
  ).toContainText('불러오지 못했어요');
  await expect(stats(page)).toContainText('1개');
  await page.getByRole('button', { name: '이전 달', exact: true }).click();
  await expect(stats(page)).toHaveCount(0);
  state.status = 200;
  await page.getByRole('button', { name: '기록 다시 불러오기', exact: true }).click();
  await expect(stats(page)).toContainText('0개');
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(stats(page)).toContainText('1개');
  state.status = 401;
  await page.getByRole('button', { name: '기록 새로고침', exact: true }).click();
  await expect(page.getByRole('link', { name: '다시 로그인', exact: true })).toBeVisible();
  await expect(stats(page)).toHaveCount(0);
  await expect(page.locator('article')).toHaveCount(0);
  state.status = 200;
  state.wrongOwner = true;
  await page.getByRole('button', { name: '기록 다시 불러오기', exact: true }).click();
  await expect(stats(page)).toHaveCount(0);
});
