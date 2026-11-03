import { test, expect, type Page } from '@playwright/test';
import { captureShellScroll, separatedShell } from './layout-assertions';
import type { StudyRecord } from '../../src/features/study-record/types';

const today = '2026-11-03';
const userId = '72000000-0000-4000-8000-000000000001';
const groupId = '72000000-0000-4000-8000-000000000002';
const categoryId = '72000000-0000-4000-8000-000000000003';
const session = {
  profile: { id: userId, nickname: '화면검증토끼', emoji: '🐰', mustChangePin: false },
  group: { id: groupId, name: 'JLPT STUDY ROOM', maxMembers: 15, memberCount: 1 },
};
async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-03T03:00:00Z'));
  const state: { records: StudyRecord[]; error: number; summaryCalls: number } = {
    records: [],
    error: 0,
    summaryCalls: 0,
  };
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { data: session } }));
  await page.route('**/api/categories', (r) =>
    r.fulfill({ json: { data: { categories: [{ id: categoryId, name: '단어' }] } } }),
  );
  await page.route('**/api/summary', (r) => {
    state.summaryCalls++;
    if (state.error)
      return r.fulfill({
        status: state.error,
        json: { error: { code: state.error === 401 ? 'UNAUTHORIZED' : 'AUTH_UNAVAILABLE' } },
      });
    const minutes = state.records.reduce((s, r) => s + r.minutes, 0);
    return r.fulfill({
      json: {
        data: {
          userId,
          groupId,
          today,
          weekStart: '2026-11-02',
          month: '2026-11',
          todayMinutes: minutes,
          weekMinutes: minutes,
          monthMinutes: minutes,
          groupTodayMinutes: minutes,
          todayParticipants: minutes
            ? [
                {
                  id: userId,
                  nickname: session.profile.nickname,
                  emoji: '🐰',
                  joinedAt: '2026-11-03T00:00:00Z',
                },
              ]
            : [],
          recentRecords: state.records.slice(0, 5),
        },
      },
    });
  });
  await page.route('**/api/records**', (r) => {
    const request = r.request(),
      method = request.method(),
      path = new URL(request.url()).pathname;
    if (method === 'POST') {
      const body = request.postDataJSON();
      const record = {
        ...body,
        userId,
        groupId,
        categoryName: '단어',
        version: 1,
        createdAt: '2026-11-03T03:00:00Z',
        updatedAt: '2026-11-03T03:00:00Z',
      };
      state.records.unshift(record);
      return r.fulfill({ json: { data: { record } } });
    }
    const record = state.records.find((x) => path.endsWith(x.id));
    if (method === 'PATCH' && record) {
      Object.assign(record, request.postDataJSON(), { version: record.version + 1 });
      return r.fulfill({ json: { data: { record } } });
    }
    if (method === 'DELETE' && record) {
      state.records = state.records.filter((x) => x.id !== record.id);
      return r.fulfill({ json: { data: { deletedId: record.id } } });
    }
    if (record) return r.fulfill({ json: { data: { record } } });
    return r.fulfill({ json: { data: { records: state.records, nextCursor: null } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '화면검증토끼님, 반가워요' })).toBeVisible();
  await expect(page.getByLabel('내 공부 시간')).toContainText('0분');
  return state;
}
const metrics = (page: Page) => page.getByLabel('내 공부 시간');

test('홈 빈 상태·기록 저장·상세·수정·새로고침이 같은 실제 데이터 흐름을 사용한다', async ({
  page,
}, info) => {
  const state = await setup(page);
  await expect(page.getByText('아직 남긴 기록이 없어요. 첫 공부를 기록해 보아요.')).toBeVisible();
  await captureShellScroll(page, info.project.name, 'home-empty');
  await expect(page.getByRole('heading', { name: '내 기록', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 공부 기록 남기기', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await expect(form.locator('input[name="studyDate"]')).toHaveValue(today);
  await form.getByRole('combobox', { name: '공부 종류', exact: true }).selectOption(categoryId);
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('45');
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(metrics(page)).toContainText('45분');
  await expect(page.getByLabel('오늘 공부한 멤버')).toContainText('화면검증토끼');
  await captureShellScroll(page, info.project.name, 'home-saved');
  await page.getByRole('button', { name: '오늘 내 기록 보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: `${today} 공부 기록`, exact: true });
  await expect(detail).toContainText('내 공부 시간 · 45분');
  await detail.getByRole('button', { name: '수정', exact: true }).click();
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('60');
  await form.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('내 공부 시간 · 1시간');
  await detail.getByRole('button', { name: '팝업 닫기', exact: true }).click();
  await expect(metrics(page)).toContainText('1시간');
  await page.reload();
  await expect(metrics(page)).toContainText('1시간');
  await expect(
    page.getByRole('button', { name: `${today} 단어 1시간 기록 보기`, exact: true }),
  ).toBeVisible();
  await separatedShell(page);
  expect(state.summaryCalls).toBeGreaterThan(2);
});

test('홈 조회 실패는 0분으로 가장하지 않고 재시도·세션 만료 시 이전 기록 숨김을 제공한다', async ({
  page,
}, info) => {
  const state = await setup(page);
  state.error = 503;
  await page.reload();
  await expect(page.getByText('홈 기록을 불러오지 못했어요. 다시 시도해주세요.')).toBeVisible();
  await expect(metrics(page)).toContainText('—');
  await expect(metrics(page)).not.toContainText('0분');
  await page.screenshot({
    path: `test-results/${info.project.name}-home-error.png`,
    animations: 'disabled',
  });
  state.error = 0;
  await page.getByRole('button', { name: '홈 다시 불러오기', exact: true }).click();
  await expect(metrics(page)).toContainText('0분');
  state.error = 401;
  await page.getByRole('button', { name: '홈 새로고침', exact: true }).click();
  await expect(page.getByRole('link', { name: '다시 로그인', exact: true })).toBeVisible();
  await expect(metrics(page)).toContainText('—');
});

test('홈 하단＋입력은 뒤로가기에서 초안을 보호하고 상세의 추가 성공은 같은 상세로 복귀한다', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '새 공부 기록', exact: true }).click();
  const form = page.getByRole('form', { name: '공부 기록 입력' });
  await form.getByRole('textbox', { name: '메모 (선택)', exact: true }).fill('지우면 안 되는 초안');
  await page.goBack();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(form.getByRole('textbox', { name: '메모 (선택)', exact: true })).toHaveValue(
    '지우면 안 되는 초안',
  );
  await page.getByRole('button', { name: '팝업 닫기', exact: true }).click();
  await page.getByRole('button', { name: '버리기', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: '오늘 내 기록 보기', exact: true }).click();
  const detail = page.getByRole('dialog', { name: `${today} 공부 기록`, exact: true });
  await expect(detail).toContainText('아직 기록이 없어요.');
  await detail.getByRole('button', { name: '＋ 공부 기록 남기기', exact: true }).click();
  await form.getByRole('combobox', { name: '공부 종류', exact: true }).selectOption(categoryId);
  await form.getByRole('spinbutton', { name: '공부 시간 (분)', exact: true }).fill('15');
  await form.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('내 공부 시간 · 15분');
});

test('홈의 긴 종류명·참여 멤버15명·최근5개도 가로 넘침이나 메뉴 겹침 없이 표시한다', async ({
  page,
}, info) => {
  await setup(page);
  const participants = Array.from({ length: 15 }, (_, n) => ({
    id: n === 0 ? userId : `72000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`,
    nickname: n === 0 ? '화면검증토끼' : `아주긴닉네임멤버${n}`,
    emoji: n % 2 ? '🐳' : '🐰',
    joinedAt: '2026-11-03T00:00:00Z',
  }));
  const records = Array.from({ length: 5 }, (_, n) => ({
    id: `72000000-0000-4000-8000-${String(n + 200).padStart(12, '0')}`,
    userId,
    groupId,
    studyDate: today,
    categoryId,
    categoryName: '긴공부종류이름을등록한상태',
    minutes: 90,
    startTime: null,
    quantity: null,
    quantityUnit: null,
    memo: null,
    version: 1,
    createdAt: '2026-11-03T03:00:00Z',
    updatedAt: '2026-11-03T03:00:00Z',
  }));
  await page.route('**/api/summary', (r) =>
    r.fulfill({
      json: {
        data: {
          userId,
          groupId,
          today,
          weekStart: '2026-11-02',
          month: '2026-11',
          todayMinutes: 450,
          weekMinutes: 450,
          monthMinutes: 450,
          groupTodayMinutes: 900,
          todayParticipants: participants,
          recentRecords: records,
        },
      },
    }),
  );
  await page.getByRole('button', { name: '홈 새로고침', exact: true }).click();
  await expect(page.getByLabel('오늘 공부한 멤버').getByRole('listitem')).toHaveCount(15);
  await expect(
    page.getByRole('button', { name: /긴공부종류이름을등록한상태.*기록 보기/ }),
  ).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureShellScroll(page, info.project.name, 'home-members');
});
