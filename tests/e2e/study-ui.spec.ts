import { test, expect, type Page } from '@playwright/test';
import { separatedShell } from './layout-assertions';

test.use({ actionTimeout: 6000 });
const user = '60000000-0000-4000-8000-000000000001';
const group = '60000000-0000-4000-8000-000000000002';
const category = '60000000-0000-4000-8000-000000000003';
const today = '2026-10-30';
async function setup(page: Page, url = '/study') {
  const members = Array.from({ length: 15 }, (_, n) => ({
    id: n === 0 ? user : `60000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`,
    nickname: n === 0 ? '공부하는 토끼' : `스터디원${n}`,
    emoji: ['🐰', '🐱', '🐶', '🐼', '🐻'][n % 5],
    joinedAt: '2026-10-01T00:00:00Z',
  }));
  const records = [{ userId: user, studyDate: '2026-10-29', minutes: 30 }];
  const state = { status: 200, gate: null as Promise<void> | null };
  await page.clock.setFixedTime(new Date('2026-10-30T03:00:00Z'));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          profile: { id: user, nickname: members[0].nickname, emoji: '🐰', mustChangePin: false },
          group: { id: group, name: '공부방', maxMembers: 15, memberCount: 15 },
        },
      },
    }),
  );
  await page.route('**/api/categories', (route) =>
    route.fulfill({ json: { data: { categories: [{ id: category, name: '단어' }] } } }),
  );
  await page.route('**/api/records?**', (route) =>
    route.fulfill({ json: { data: { records: [], nextCursor: null } } }),
  );
  await page.route('**/api/records', async (route) => {
    if (state.gate) await state.gate;
    const input = route.request().postDataJSON();
    records.push({ userId: user, studyDate: input.studyDate, minutes: input.minutes });
    await route.fulfill({
      json: {
        data: {
          record: {
            ...input,
            userId: user,
            groupId: group,
            categoryName: '단어',
            version: 1,
            createdAt: '2026-10-30T03:00:00Z',
            updatedAt: '2026-10-30T03:00:00Z',
          },
        },
      },
    });
  });
  await page.route('**/api/study?**', (route) => {
    if (state.status !== 200)
      return route.fulfill({
        status: state.status,
        json: { error: { code: state.status === 401 ? 'UNAUTHORIZED' : 'AUTH_UNAVAILABLE' } },
      });
    const week = new URL(route.request().url()).searchParams.get('week')!;
    const people = members.map((member) => {
      const days = Array.from({ length: 7 }, (_, n) => {
        const day = new Date(`${week}T00:00:00Z`);
        day.setUTCDate(day.getUTCDate() + n);
        const date = day.toISOString().slice(0, 10);
        return {
          date,
          minutes: records
            .filter((row) => row.userId === member.id && row.studyDate === date)
            .reduce((sum, row) => sum + row.minutes, 0),
        };
      });
      return {
        ...member,
        days,
        totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0),
        studyDays: days.filter((day) => day.minutes > 0).length,
      };
    });
    return route.fulfill({
      json: {
        data: {
          weekStart: week,
          members: people,
          totalMinutes: people.reduce((sum, member) => sum + member.totalMinutes, 0),
          activeMembers: people.filter((member) => member.studyDays > 0).length,
        },
      },
    });
  });
  await page.goto(url);
  await expect(page.locator('[data-member-id]')).toHaveCount(15);
  return state;
}
const own = (page: Page) => page.locator(`[data-member-id="${user}"]`);

test('가입순15명·0일 멤버·7칸 막대와 공통 메뉴를 연결한다', async ({ page }, info) => {
  await setup(page);
  await expect(page.getByRole('heading', { name: '우리의 스터디' })).toBeVisible();
  await expect(own(page).getByText('1일 공부', { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-member-id]').last().getByText('0일 공부', { exact: true }),
  ).toBeVisible();
  await expect(own(page).locator('[data-active]')).toHaveCount(7);
  await expect(own(page).locator('[data-active="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '다음 주' })).toBeDisabled();
  await page.screenshot({
    path: `test-results/${info.project.name}-study-live.png`,
    fullPage: false,
  });
  await page.getByRole('button', { name: '내 설정 열기' }).click();
  await expect(page.getByRole('dialog', { name: '내 설정', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await page
    .getByRole('navigation', { name: '하단 메뉴' })
    .getByRole('button', { name: '홈', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: '하단 메뉴' })
    .getByRole('button', { name: '스터디', exact: true })
    .click();
  await expect(page).toHaveURL(/\/study/);
  await expect(page.locator('[data-member-id]')).toHaveCount(15);
});

test('본문 처음·중간·끝에서 메뉴와 겹치지 않고 마지막 카드·팝업 복귀를 확인한다', async ({
  page,
}, info) => {
  await setup(page);
  const main = await separatedShell(page);
  for (const [name, fraction] of [
    ['top', 0],
    ['middle', 0.5],
    ['bottom', 1],
  ] as const) {
    await main.evaluate((element, fraction) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction;
    }, fraction);
    await separatedShell(page);
    await page.screenshot({
      path: `test-results/${info.project.name}-study-layout-${name}.png`,
      fullPage: false,
    });
  }
  const last = page.locator('[data-member-id]').last();
  const visible = await last.evaluate((element) => {
    const card = element.getBoundingClientRect();
    const main = element.closest('main')!.getBoundingClientRect();
    const hit = document.elementFromPoint(card.x + card.width / 2, card.y + card.height / 2);
    return {
      top: card.top,
      bottom: card.bottom,
      mainTop: main.top,
      mainBottom: main.bottom,
      reachable: !!hit && element.contains(hit),
    };
  });
  expect(visible.top).toBeGreaterThanOrEqual(visible.mainTop);
  expect(visible.bottom).toBeLessThanOrEqual(visible.mainBottom);
  expect(visible.reachable).toBe(true);
  const position = await main.evaluate((element) => element.scrollTop);
  expect(position).toBeGreaterThan(0);
  await page.getByRole('button', { name: '새 공부 기록', exact: true }).click();
  await expect(page.getByRole('form', { name: '공부 기록 입력' })).toBeVisible();
  expect(await main.evaluate((element) => getComputedStyle(element).overflowY)).toBe('hidden');
  await page.getByRole('button', { name: '팝업 닫기' }).click();
  await expect(page.getByRole('form', { name: '공부 기록 입력' })).toHaveCount(0);
  expect(await main.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
  await separatedShell(page);
});

test('주간 이동·잘못된 주소 정리·조회 실패와 세션 만료를 구분한다', async ({ page }) => {
  const state = await setup(page, '/study?week=wrong');
  await expect(page).toHaveURL(/week=2026-10-26/);
  await page.getByRole('button', { name: '이전 주' }).click();
  await expect(page).toHaveURL(/week=2026-10-19/);
  await expect(own(page).getByText('0일 공부', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다음 주' }).click();
  await expect(own(page).getByText('1일 공부', { exact: true })).toBeVisible();
  state.status = 503;
  await page.getByRole('button', { name: '스터디 새로고침' }).click();
  const region = page.getByRole('region', { name: '스터디 주간 통계' });
  await expect(region.getByRole('alert')).toContainText('불러오지 못했어요');
  await expect(page.locator('[data-member-id]')).toHaveCount(15);
  state.status = 401;
  await page.getByRole('button', { name: '스터디 다시 불러오기' }).click();
  await expect(region.getByRole('alert')).toContainText('세션을 다시 확인');
  await expect(page.locator('[data-member-id]')).toHaveCount(0);
});

test('하단 추가는 서울 오늘을 저장하고 스터디 막대를 갱신한다', async ({ page }, info) => {
  await setup(page);
  await page.getByRole('button', { name: '새 공부 기록', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await expect(form.locator('input[name=studyDate]')).toHaveValue(today);
  await form.getByRole('combobox', { name: '공부 종류', exact: true }).selectOption(category);
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('45');
  await page.screenshot({ path: `test-results/${info.project.name}-study-record-form.png` });
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page).not.toHaveURL(/compose=/);
  await expect(own(page).getByText('2일 공부', { exact: true })).toBeVisible();
  await expect(own(page).locator('[data-active="true"]')).toHaveCount(2);
  await expect(page.getByText('공부 기록을 저장했어요.', { exact: true })).toBeVisible();
});

test('뒤로가기 초안 유지·폐기와 제출 중 이탈 방지를 공유한다', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '새 공부 기록', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await form.getByRole('textbox', { name: '메모 (선택)', exact: true }).fill('유지할 초안');
  await page.goBack();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    '유지할 초안',
  );
  await form.getByRole('combobox', { name: '공부 종류', exact: true }).selectOption(category);
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('30');
  let release: () => void = () => {};
  state.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form.getByRole('button', { name: '저장 확인 중…' })).toBeDisabled();
  await page.goBack();
  await expect(form).toBeVisible();
  release();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: '새 공부 기록', exact: true }).click();
  await form.getByRole('textbox', { name: '메모 (선택)', exact: true }).fill('폐기할 초안');
  await page.goBack();
  await page.getByRole('button', { name: '버리기', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page).not.toHaveURL(/compose=/);
});
