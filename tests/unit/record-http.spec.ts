import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { createRecordsHttp } from '../../src/server/records/http';

const userId = '46000000-0000-4000-8000-000000000001';
const groupId = '46000000-0000-4000-8000-000000000002';
const id = '46000000-0000-4000-8000-000000000003';
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
const token = 'a'.repeat(43);
const input = { id, studyDate: '2026-09-30', categoryId: id, minutes: 30 };
const row = {
  id,
  user_id: userId,
  group_id: groupId,
  study_date: input.studyDate,
  minutes: 30,
  category_id: id,
  category: { id, name: '단어' },
  start_time: null,
  quantity: null,
  quantity_unit: null,
  memo: null,
  version: 2,
  created_at: '2026-09-30T00:00:00Z',
  updated_at: '2026-09-30T00:00:00Z',
  create_fingerprint: 'PRIVATE',
};
function req(
  query = '',
  body?: unknown,
  cookie = `__Host-jlpt_session=${token}`,
  requestOrigin = origin,
) {
  return new NextRequest(`${origin}/api/records${query}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: requestOrigin, cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function fixture(
  options: {
    limited?: boolean;
    dbError?: string;
    badRow?: boolean;
    missing?: boolean;
    fail?: boolean;
  } = {},
) {
  const calls: { url: URL; body?: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (path, init) => {
    const url = new URL(String(path));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (options.fail) throw new Error('PRIVATE connection failure');
    if (url.pathname.endsWith('resolve_user_session'))
      return Response.json([
        {
          user_id: userId,
          group_id: groupId,
          nickname: '검사',
          emoji: '🐰',
          must_change_pin: !!options.limited,
          expires_at: '2099-01-01T00:00:00Z',
        },
      ]);
    if (url.pathname.endsWith('study_groups'))
      return Response.json([{ id: groupId, name: '검사', max_members: 15 }]);
    if (url.pathname.endsWith('group_members')) return Response.json([{ user_id: userId }]);
    if (url.pathname.endsWith('save_record'))
      return options.dbError
        ? Response.json({ code: 'P0001', message: options.dbError }, { status: 400 })
        : Response.json(row);
    if (url.pathname.endsWith('study_categories'))
      return Response.json(
        [{ id, name: '단어' }].slice(Number(url.searchParams.get('offset') ?? 0)),
      );
    if (url.pathname.endsWith('study_records'))
      return Response.json(
        (options.missing ? [] : options.badRow ? [{ ...row, group_id: id }] : [row]).slice(
          Number(url.searchParams.get('offset') ?? 0),
        ),
      );
    throw new Error('Unexpected test path');
  };
  return { http: createRecordsHttp(env, transport), calls };
}

test('생성은 세션 주체를 주입하며 재시도 뒤 현재 기록을 읽고 내부 필드를 제외한다', async () => {
  const { http, calls } = fixture();
  const response = await http.create(req('', { ...input, userId: 'forged', groupId: 'forged' }));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.data.record).toMatchObject({ id, userId, groupId, version: 2, categoryName: '단어' });
  expect(JSON.stringify(data)).not.toContain('PRIVATE');
  expect(calls.find((c) => c.url.pathname.endsWith('save_record'))?.body).toMatchObject({
    p_actor_user_id: userId,
    p_group_id: groupId,
    p_id: id,
    p_expected_version: null,
  });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('server-timing')).toContain('dbcalls');
});

test('무쿠키·관리자 쿠키·잘못된 토큰·다른 출처는 저장 전에 거부한다', async () => {
  for (const cookie of ['', '__Host-jlpt_admin_session=' + token, '__Host-jlpt_session=bad']) {
    const { http, calls } = fixture();
    expect((await http.create(req('', input, cookie))).status).toBe(401);
    expect(calls).toHaveLength(0);
  }
  const { http, calls } = fixture();
  expect((await http.create(req('', input, undefined, 'https://evil.example'))).status).toBe(403);
  expect(calls).toHaveLength(0);
});

test('제한 세션은 생성과 모든 조회를 차단한다', async () => {
  const { http, calls } = fixture({ limited: true });
  for (const response of [
    await http.create(req('', input)),
    await http.list(req('?scope=mine&month=2026-09')),
    await http.get(req(), id),
  ])
    expect(response.status).toBe(403);
  expect(calls.some((c) => /save_record|study_records/.test(c.url.pathname))).toBe(false);
});

test('조회는 그룹·기간과 개인 조건을 고정하고 없는 기록은404다', async () => {
  const { http, calls } = fixture();
  expect((await http.list(req('?scope=mine&month=2026-09'))).status).toBe(200);
  const query = calls.find((call) => call.url.pathname.endsWith('study_records'))!.url.searchParams;
  expect(query.get('group_id')).toBe(`eq.${groupId}`);
  expect(query.get('user_id')).toBe(`eq.${userId}`);
  expect(query.getAll('study_date')).toEqual(['gte.2026-09-01', 'lte.2026-09-30']);
  expect(query.get('select')).not.toContain('*');
  expect((await fixture({ missing: true }).http.get(req(), id)).status).toBe(404);
});

test('입력·업무 오류는 구분하고 잘못된 응답·연결 원문은503으로 닫힌다', async () => {
  const invalid = await fixture().http.create(req('', { ...input, minutes: 0 }));
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error).toMatchObject({
    fieldErrors: { minutes: expect.any(String) },
  });
  for (const code of ['IDEMPOTENCY_CONFLICT', 'RECORD_DELETED', 'DAILY_LIMIT_EXCEEDED']) {
    const response = await fixture({ dbError: code }).http.create(req('', input));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe(code);
  }
  for (const options of [{ badRow: true }, { fail: true }, { dbError: 'PRIVATE SQL' }]) {
    const response = await fixture(options).http.create(req('', input));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('PRIVATE');
  }
});

test('공부 종류 목록은 정상 사용자 세션만 허용하고 공개 필드만 반환한다', async () => {
  const response = await fixture().http.categories(req());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { categories: [{ id, name: '단어' }] } });
  expect((await fixture({ limited: true }).http.categories(req())).status).toBe(403);
  expect((await fixture().http.categories(req('', undefined, ''))).status).toBe(401);
});
