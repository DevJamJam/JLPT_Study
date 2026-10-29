import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { calendarDays } from '../../src/server/calendar/aggregate';
import { createRecordsHttp } from '../../src/server/records/http';

const user = '56000000-0000-4000-8000-000000000001';
const peer = '56000000-0000-4000-8000-000000000002';
const group = '56000000-0000-4000-8000-000000000003';
const other = '56000000-0000-4000-8000-000000000004';
const id = (n: number) => '56000000-0000-4000-8000-' + String(n).padStart(12, '0');
const members = [peer, user].map((id, index) => ({
  id,
  nickname: '멤버' + index,
  emoji: '🐰',
  joinedAt: '2026-10-01T00:00:00.000001Z',
}));
const origin = 'https://study.example';
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PIN_PEPPER: 'p'.repeat(32),
  RATE_LIMIT_HMAC_KEY: 'r'.repeat(32),
  IDEMPOTENCY_HMAC_KEY: 'i'.repeat(32),
};
function req(query = '', cookie = '__Host-jlpt_session=' + 'a'.repeat(43)) {
  return new NextRequest(origin + '/api/calendar' + query, { headers: { cookie } });
}
const period = '?scope=group&from=2026-10-01&to=2026-10-03';
function fixture(
  options: {
    empty?: boolean;
    limited?: boolean;
    cap?: number;
    badMember?: boolean;
    badRecord?: boolean;
    repeat?: boolean;
    fail?: boolean;
  } = {},
) {
  const calls: URL[] = [];
  const rows = Array.from({ length: options.empty ? 0 : 101 }, (_, n) => ({
    id: id(100 + n),
    group_id: group,
    user_id: n === 0 ? user : peer,
    study_date: '2026-10-02',
    minutes: 1,
    memo: 'PRIVATE',
  }));
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (options.fail) throw new Error('PRIVATE CONNECTION');
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
      const offset = Number(url.searchParams.get('offset'));
      return Response.json(
        members
          .map((member) => ({
            group_id: options.badMember ? other : group,
            user_id: member.id,
            joined_at: member.joinedAt,
            profile: { ...member, credential_version: 'PRIVATE' },
          }))
          .slice(offset, offset + (options.cap ?? 16)),
      );
    }
    if (url.pathname.endsWith('study_records')) {
      const after = url.searchParams.get('id')?.slice(3) ?? '';
      const selected = options.repeat
        ? rows.slice(0, 1)
        : rows
            .filter(
              (row) => row.id > after && (!url.searchParams.has('user_id') || row.user_id === user),
            )
            .slice(0, options.cap ?? 100);
      return Response.json(
        selected.map((row) => (options.badRecord ? { ...row, group_id: other } : row)),
      );
    }
    throw new Error('Unexpected path');
  };
  return { http: createRecordsHttp(env, transport), calls };
}

test('빈 날짜·윤일·연말을 포함하고 합계·참여자 중복 제거·가입순을 유지한다', () => {
  const records = [
    { id: id(1), userId: user, studyDate: '2024-02-29', minutes: 30 },
    { id: id(2), userId: user, studyDate: '2024-02-29', minutes: 50 },
    { id: id(3), userId: peer, studyDate: '2024-02-29', minutes: 20 },
  ];
  const days = calendarDays('2024-02-28', '2024-03-01', records, members);
  expect(days).toHaveLength(3);
  expect(days[0]).toEqual({ date: '2024-02-28', totalMinutes: 0, participants: [] });
  expect(days[1]).toEqual({
    date: '2024-02-29',
    totalMinutes: 100,
    participants: [
      { userId: peer, minutes: 20 },
      { userId: user, minutes: 80 },
    ],
  });
  expect(calendarDays('2026-12-31', '2027-01-01', [], members).map((day) => day.date)).toEqual([
    '2026-12-31',
    '2027-01-01',
  ]);
  expect(calendarDays('9999-12-31', '9999-12-31', [], members)).toHaveLength(1);
});

test('멤버는 세션 그룹·가입순 공개 필드만 반환하고 작은 row cap에서도 모두 읽는다', async () => {
  const { http, calls } = fixture({ cap: 1 });
  const response = await http.members(req());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { members } });
  const query = calls.find((url) =>
    url.searchParams.get('select')?.includes('profile:'),
  )!.searchParams;
  expect(query.get('group_id')).toBe('eq.' + group);
  expect(query.get('order')).toBe('joined_at.asc,user_id.asc');
  expect(query.get('select')).not.toMatch(/\*|credential|session/);
});

test('달력은 최소 필드·그룹 필터로101건을 합산하며 개인 scope는 본인만 반환한다', async () => {
  const { http, calls } = fixture({ cap: 2 });
  const response = await http.calendar(req(period));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.data.days[1]).toEqual({
    date: '2026-10-02',
    totalMinutes: 101,
    participants: [
      { userId: peer, minutes: 100 },
      { userId: user, minutes: 1 },
    ],
  });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  const queries = calls.filter((url) => url.pathname.endsWith('study_records'));
  expect(queries.length).toBeGreaterThan(2);
  expect(
    queries.every(
      (url) => url.searchParams.get('select') === 'id,group_id,user_id,study_date,minutes',
    ),
  ).toBe(true);
  expect(queries.every((url) => url.searchParams.get('group_id') === 'eq.' + group)).toBe(true);
  const mine = await http.calendar(req(period.replace('scope=group', 'scope=mine')));
  expect((await mine.json()).data.days[1]).toEqual({
    date: '2026-10-02',
    totalMinutes: 1,
    participants: [{ userId: user, minutes: 1 }],
  });
  expect(response.headers.get('cache-control')).toContain('no-store');
});

test('42일 상한·잘못된 날짜·중복/혼용/권한 파라미터를 기록 조회 전에 거부한다', async () => {
  const invalid = [
    '?scope=group&from=2026-02-30&to=2026-03-01',
    '?scope=group&from=2026-01-01&to=2026-02-12',
    '?scope=group&from=2026-10-03&to=2026-10-01',
    '?scope=group&scope=mine&from=2026-10-01&to=2026-10-03',
    '?scope=mine&month=2026-10',
    period + '&userId=' + peer,
    period + '&groupId=' + other,
  ];
  for (const query of invalid) {
    const { http, calls } = fixture();
    expect((await http.calendar(req(query))).status).toBe(400);
    expect(calls.some((url) => url.pathname.endsWith('study_records'))).toBe(false);
  }
  expect(
    (
      await fixture({ empty: true }).http.calendar(
        req('?scope=group&from=2026-01-01&to=2026-02-11'),
      )
    ).status,
  ).toBe(200);
  expect((await fixture().http.members(req('?groupId=' + other))).status).toBe(400);
});

test('무세션·관리자 쿠키·제한 세션은 멤버와 달력을 읽을 수 없다', async () => {
  for (const action of ['members', 'calendar'] as const) {
    for (const cookie of ['', '__Host-jlpt_admin_session=' + 'a'.repeat(43)]) {
      const { http, calls } = fixture();
      expect((await http[action](req(period, cookie))).status).toBe(401);
      expect(calls).toHaveLength(0);
    }
    const { http, calls } = fixture({ limited: true });
    expect((await http[action](req(period))).status).toBe(403);
    expect(
      calls.some(
        (url) =>
          url.searchParams.get('select')?.includes('profile:') ||
          url.pathname.endsWith('study_records'),
      ),
    ).toBe(false);
  }
});

test('다른 그룹·잘못된 DTO·진행 없는 페이지·연결 실패는503으로 원문을 숨긴다', async () => {
  for (const options of [
    { badMember: true },
    { badRecord: true },
    { repeat: true },
    { fail: true },
  ]) {
    const response = await fixture(options).http.calendar(req(period));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('PRIVATE');
  }
});
