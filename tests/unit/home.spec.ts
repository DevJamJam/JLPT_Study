import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { homeTotals } from '../../src/server/home/aggregate';
import { createRecordsHttp } from '../../src/server/records/http';
import { seoulDateKey } from '../../src/lib/seoul-date';
import { monday, shiftDate } from '../../src/features/calendar/dates';

const id = (n: number) => `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = id(1),
  peer = id(2),
  group = id(3),
  other = id(4);
const members = [peer, user].map((id, n) => ({
  id,
  nickname: `멤버${n}`,
  emoji: '🐰',
  joinedAt: '2026-10-01T00:00:00Z',
}));
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://home.example',
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PIN_PEPPER: 'p'.repeat(32),
  RATE_LIMIT_HMAC_KEY: 'r'.repeat(32),
  IDEMPOTENCY_HMAC_KEY: 'i'.repeat(32),
};

test('홈은 월·연도 경계를 넘는 주간 합계, 본인 합계와 오늘 참여자의 중복·가입순을 구분한다', () => {
  const row = (n: number, userId: string, studyDate: string, minutes: number) => ({
    id: id(n),
    userId,
    studyDate,
    minutes,
  });
  const result = homeTotals(
    '2026-01-01',
    user,
    [
      row(10, user, '2025-12-29', 60),
      row(11, user, '2026-01-01', 20),
      row(12, user, '2026-01-01', 10),
      row(13, peer, '2026-01-01', 40),
      row(14, peer, '2025-12-31', 100),
      row(15, user, '2026-01-02', 999),
    ],
    members,
  );
  expect(result).toMatchObject({
    todayMinutes: 30,
    weekStart: '2025-12-29',
    weekMinutes: 90,
    monthMinutes: 30,
    groupTodayMinutes: 40,
  });
  expect(result.todayParticipants.map((m) => m.id)).toEqual([peer]);
  expect(homeTotals('2024-03-01', user, [row(20, user, '2024-02-29', 30)], members)).toMatchObject({
    todayMinutes: 0,
    weekMinutes: 30,
    monthMinutes: 0,
    todayParticipants: [],
  });
  expect(homeTotals('2026-01-01', user, [], members)).toMatchObject({
    todayMinutes: 0,
    weekMinutes: 0,
    monthMinutes: 0,
    todayParticipants: [],
  });
});

function fixture(
  options: {
    limited?: boolean;
    badGroup?: boolean;
    badOtherDay?: boolean;
    badRecent?: boolean;
    fail?: boolean;
  } = {},
) {
  const today = seoulDateKey();
  const calls: URL[] = [];
  const rows = Array.from({ length: 107 }, (_, n) => ({
    id: id(100 + n),
    group_id: group,
    user_id: n === 0 ? peer : user,
    study_date: today,
    minutes: 1,
    category_id: id(50),
    category: { id: id(50), name: '단어' },
    start_time: null,
    quantity: null,
    quantity_unit: null,
    memo: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    create_fingerprint: 'PRIVATE',
  }));
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
    if (url.pathname.endsWith('group_members')) {
      if (!url.searchParams.get('select')?.includes('profile:'))
        return Response.json([{ user_id: user }]);
      return Response.json(
        members
          .slice(Number(url.searchParams.get('offset')), Number(url.searchParams.get('offset')) + 2)
          .map((m) => ({
            group_id: group,
            user_id: m.id,
            joined_at: m.joinedAt,
            profile: { ...m, secret: 'PRIVATE' },
          })),
      );
    }
    if (url.pathname.endsWith('study_records')) {
      if (url.searchParams.get('select') === 'id,group_id,user_id,study_date,minutes') {
        const after = url.searchParams.get('id')?.slice(3) ?? '';
        return Response.json(
          rows
            .filter((r) => r.id > after)
            .slice(0, 2)
            .map((r) => ({
              ...r,
              group_id: options.badGroup ? other : group,
              study_date: options.badOtherDay && r.user_id === peer ? shiftDate(today, -1) : today,
            })),
        );
      }
      const offset = Number(url.searchParams.get('offset'));
      return Response.json(
        rows
          .filter((r) => r.user_id === user)
          .slice(offset, offset + Math.min(2, Number(url.searchParams.get('limit'))))
          .map((r) => ({ ...r, user_id: options.badRecent ? peer : user })),
      );
    }
    throw Error('unexpected request');
  };
  return { http: createRecordsHttp(env, transport), calls, today };
}
const req = (query = '', cookie = '__Host-jlpt_session=' + 'a'.repeat(43)) =>
  new NextRequest('https://home.example/api/summary' + query, { headers: { cookie } });

test('홈 API는 작은 DB 반환 상한도 모두 합산하고 최근5개·공개 프로필만 반환한다', async () => {
  const f = fixture();
  const response = await f.http.summary(req());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const { data } = await response.json();
  expect(data).toMatchObject({
    userId: user,
    groupId: group,
    today: f.today,
    todayMinutes: 106,
    weekMinutes: 106,
    monthMinutes: 106,
    groupTodayMinutes: 1,
  });
  expect(data.recentRecords).toHaveLength(5);
  expect(data.todayParticipants.map((m: { id: string }) => m.id)).toEqual([peer]);
  expect(JSON.stringify(data)).not.toContain('PRIVATE');
  const aggregate = f.calls.find((u) => u.searchParams.has('or'))!;
  expect(aggregate.searchParams.get('group_id')).toBe(`eq.${group}`);
  expect(aggregate.searchParams.get('or')).toBe(`(user_id.eq.${user},study_date.eq.${f.today})`);
  expect(aggregate.searchParams.getAll('study_date')).toContain(`lte.${f.today}`);
  expect(data.weekStart).toBe(monday(f.today));
});

test('홈 API는 임의 조회 조건·무인증·관리자·제한 세션과 잘못된 DB 응답을 차단한다', async () => {
  expect((await fixture().http.summary(req('?userId=' + peer))).status).toBe(400);
  expect((await fixture().http.summary(req('', ''))).status).toBe(401);
  expect(
    (await fixture().http.summary(req('', '__Host-jlpt_admin_session=' + 'a'.repeat(43)))).status,
  ).toBe(403);
  const limited = fixture({ limited: true });
  expect((await limited.http.summary(req())).status).toBe(403);
  expect(limited.calls.some((u) => u.pathname.endsWith('study_records'))).toBe(false);
  for (const options of [
    { badGroup: true },
    { badOtherDay: true },
    { badRecent: true },
    { fail: true },
  ]) {
    const response = await fixture(options).http.summary(req());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('PRIVATE');
  }
});

test('오늘 본인만 공부했으면 동료 목록과 합계는 비어 있고 내 합계는 유지한다', () => {
  expect(
    homeTotals(
      '2026-11-03',
      user,
      [{ id: id(99), userId: user, studyDate: '2026-11-03', minutes: 40 }],
      members,
    ),
  ).toMatchObject({
    todayMinutes: 40,
    weekMinutes: 40,
    groupTodayMinutes: 0,
    todayParticipants: [],
  });
  expect(
    homeTotals(
      '2026-11-03',
      user,
      [{ id: id(98), userId: peer, studyDate: '2026-11-03', minutes: 25 }],
      members,
    ),
  ).toMatchObject({ todayMinutes: 0, groupTodayMinutes: 25, todayParticipants: [members[0]] });
});
