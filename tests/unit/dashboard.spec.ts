import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { monthSummary } from '../../src/server/dashboard/aggregate';
import { createRecordsHttp } from '../../src/server/records/http';
import type { StudyRecord } from '../../src/features/study-record/types';

const id = (n: number) => `84000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = id(1),
  group = id(2),
  category = id(3),
  empty = id(4);
const categories = [
  { id: category, name: '수정된 종류' },
  { id: empty, name: '기록 없는 종류' },
];
const record = (n: number, date: string, minutes: number): StudyRecord => ({
  id: id(100 + n),
  userId: user,
  groupId: group,
  categoryId: category,
  categoryName: '예전 이름',
  studyDate: date,
  minutes,
  startTime: null,
  quantity: null,
  quantityUnit: null,
  memo: null,
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
});
test('월 통계는 저장 시각 대신 공부 날짜·하루 합계를 쓰고 0분 종류·현재 이름을 유지한다', () => {
  const result = monthSummary(
    '2024-02',
    user,
    group,
    [record(1, '2024-02-29', 30), record(2, '2024-02-29', 50), record(3, '2024-02-01', 1)],
    categories,
  );
  expect(result).toMatchObject({
    totalMinutes: 81,
    studyDays: 2,
    recordCount: 3,
    averageMinutes: 41,
    longestMinutes: 80,
  });
  expect(result.categories).toEqual([
    { categoryId: category, name: '수정된 종류', minutes: 81 },
    { categoryId: empty, name: '기록 없는 종류', minutes: 0 },
  ]);
  expect(monthSummary('2024-02', user, group, [], categories)).toMatchObject({
    totalMinutes: 0,
    studyDays: 0,
    recordCount: 0,
    averageMinutes: 0,
    longestMinutes: 0,
  });
  expect(() =>
    monthSummary('2024-03', user, group, [record(1, '2024-02-29', 30)], categories),
  ).toThrow();
});
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://dashboard.example',
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PIN_PEPPER: 'p'.repeat(32),
  RATE_LIMIT_HMAC_KEY: 'r'.repeat(32),
  IDEMPOTENCY_HMAC_KEY: 'i'.repeat(32),
};
function fixture(options: { limited?: boolean; wrongOwner?: boolean; fail?: boolean } = {}) {
  const calls: URL[] = [];
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (options.fail) throw Error('PRIVATE');
    if (url.pathname.endsWith('resolve_user_session'))
      return Response.json([
        {
          user_id: user,
          group_id: group,
          nickname: '검사',
          emoji: '🐰',
          must_change_pin: !!options.limited,
          expires_at: '2099-01-01T00:00:00Z',
        },
      ]);
    if (url.pathname.endsWith('study_groups'))
      return Response.json([{ id: group, name: '검사', max_members: 15 }]);
    if (url.pathname.endsWith('group_members')) return Response.json([{ user_id: user }]);
    if (url.pathname.endsWith('study_categories'))
      return Response.json(
        Number(url.searchParams.get('offset'))
          ? []
          : categories.map((c) => ({ id: c.id, name: c.name })),
      );
    if (url.pathname.endsWith('study_records')) {
      expect(url.searchParams.get('user_id')).toBe(`eq.${user}`);
      expect(url.searchParams.get('group_id')).toBe(`eq.${group}`);
      expect(url.searchParams.getAll('study_date')).toEqual(['gte.2024-02-01', 'lte.2024-02-29']);
      const offset = Number(url.searchParams.get('offset'));
      return Response.json(
        Array.from({ length: 107 }, (_, n) => ({
          ...record(n, '2024-02-29', 1),
          id: id(100 + n),
          user_id: options.wrongOwner ? id(9) : user,
          group_id: group,
          study_date: '2024-02-29',
          category_id: category,
          category: { id: category, name: '수정된 종류' },
          start_time: null,
          quantity_unit: null,
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-01T00:00:00Z',
          create_fingerprint: 'PRIVATE',
        })).slice(offset, offset + 7),
      );
    }
    throw Error('unexpected request');
  };
  return { http: createRecordsHttp(env, transport), calls };
}
const req = (query = '?month=2024-02', cookie = '__Host-jlpt_session=' + 'a'.repeat(43)) =>
  new NextRequest('https://dashboard.example/api/me/dashboard' + query, { headers: { cookie } });
test('월 API는 DB 반환 상한7건을 넘어107건 모두 합산하고 민감 필드를 반환하지 않는다', async () => {
  const f = fixture();
  const response = await f.http.dashboard(req());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const data = await response.json();
  expect(data.data).toMatchObject({
    totalMinutes: 107,
    studyDays: 1,
    recordCount: 107,
    averageMinutes: 107,
    longestMinutes: 107,
  });
  expect(JSON.stringify(data)).not.toContain('PRIVATE');
  expect(data.data.records).toBeUndefined();
});
test('월 API는 인증·제한세션·조회조건·소유자와 장애를 구분하고 0분으로 가장하지 않는다', async () => {
  expect((await fixture().http.dashboard(req('', ''))).status).toBe(401);
  expect(
    (
      await fixture().http.dashboard(
        req('?month=2024-02', '__Host-jlpt_admin_session=' + 'a'.repeat(43)),
      )
    ).status,
  ).toBe(403);
  expect((await fixture({ limited: true }).http.dashboard(req())).status).toBe(403);
  for (const query of [
    '',
    '?month=2024-13',
    '?month=1999-12',
    '?month=2024-02&month=2024-03',
    '?month=2024-02&userId=' + user,
  ])
    expect((await fixture().http.dashboard(req(query))).status).toBe(400);
  expect((await fixture({ wrongOwner: true }).http.dashboard(req())).status).toBe(503);
  expect((await fixture({ fail: true }).http.dashboard(req())).status).toBe(503);
});
