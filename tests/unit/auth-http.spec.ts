import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { createAuthHttp, trustedAuthSource } from '../../src/server/auth/http';
import { hashPin, hashSessionToken, type PinCredential } from '../../src/server/auth/crypto';

const id = '00000000-0000-4000-8000-000000000001';
const groupId = '00000000-0000-4000-8000-000000000002';
const origin = 'https://study.example';
const env = {
  NODE_ENV: 'production',
  VERCEL: '1',
  APP_ORIGIN: origin,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PIN_PEPPER: 'test-pepper-independent-at-least-32-bytes',
  RATE_LIMIT_HMAC_KEY: 'test-rate-independent-at-least-32-bytes',
  IDEMPOTENCY_HMAC_KEY: 'test-join-independent-at-least-32-bytes',
};
const token = 'a'.repeat(43);
const expires = '2099-11-01T00:00:00Z';
let credential: PinCredential;
test.beforeAll(async () => {
  credential = await hashPin('0123', env.PIN_PEPPER);
});
function request(action: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/auth/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '192.0.2.1',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function fixture(
  options: {
    limited?: boolean;
    missing?: boolean;
    rateLimited?: boolean;
    failure?: string;
    created?: boolean;
    joinError?: string;
    resetError?: string;
    emojiError?: string;
    badEmojiResult?: boolean;
    attemptExpired?: boolean;
  } = {},
) {
  const calls: {
    path: string;
    body: Record<string, unknown> | undefined;
    query: URLSearchParams;
  }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/rest/v1/', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body, query: url.searchParams });
    if (options.failure)
      return Response.json({ code: 'XX000', message: options.failure }, { status: 500 });
    if (path === 'rpc/reserve_auth_attempt')
      return Response.json(
        options.rateLimited
          ? { allowed: false, retryAt: expires }
          : { allowed: true, attemptId: id },
      );
    if (path === 'rpc/complete_join_result')
      return options.joinError
        ? Response.json({ code: 'P0001', message: options.joinError }, { status: 400 })
        : Response.json({ userId: id, created: options.created ?? true });
    if (path === 'users')
      return Response.json(
        options.missing
          ? []
          : [
              {
                id,
                credential: {
                  user_id: id,
                  pin_hash: credential.hash,
                  salt: credential.salt,
                  hash_params: credential.params,
                  credential_version: 1,
                },
              },
            ],
      );
    if (path === 'user_credentials')
      return Response.json([
        {
          user_id: id,
          pin_hash: credential.hash,
          salt: credential.salt,
          hash_params: credential.params,
          credential_version: 1,
        },
      ]);
    if (path === 'rpc/complete_auth_attempt') return Response.json(!options.attemptExpired);
    if (path === 'rpc/revoke_user_session') return Response.json(true);
    if ((path === 'rpc/complete_pin_reset' || path === 'rpc/change_user_pin') && options.resetError)
      return Response.json({ code: 'P0001', message: options.resetError }, { status: 400 });
    if (path === 'rpc/complete_pin_reset' || path === 'rpc/change_user_pin')
      return Response.json({ mode: 'normal', expires_at: expires, token_hash: 'PRIVATE' });
    if (path === 'rpc/update_profile_emoji') {
      if (options.emojiError)
        return Response.json({ code: 'P0001', message: options.emojiError }, { status: 400 });
      return Response.json(
        options.badEmojiResult
          ? [{ user_id: id, emoji: '🦄' }]
          : [
              {
                user_id: id,
                nickname: '유리',
                emoji: body?.p_emoji,
                must_change_pin: false,
                pin_hash: 'PRIVATE',
              },
            ],
      );
    }
    if (path === 'rpc/create_user_session')
      return Response.json({
        expires_at: expires,
        mode: options.limited ? 'change_pin' : 'normal',
      });
    if (path === 'rpc/resolve_user_session')
      return Response.json([
        {
          user_id: id,
          group_id: groupId,
          nickname: '유리',
          emoji: '🐰',
          must_change_pin: !!options.limited,
          expires_at: expires,
          pin_hash: 'DO_NOT_EXPOSE',
        },
      ]);
    if (path === 'study_groups')
      return Response.json([{ id: groupId, name: 'JLPT STUDY ROOM', max_members: 15 }]);
    if (path === 'group_members') return Response.json([{ user_id: id }]);
    throw new Error(`Unexpected path: ${path}`);
  };
  return { calls, http: createAuthHttp(env, transport) };
}
const loginBody = { nickname: '유리', pin: '0123' };
const expectedData = (limited = false) => ({
  profile: { id, nickname: '유리', emoji: '🐰', mustChangePin: limited },
  group: { id: groupId, name: 'JLPT STUDY ROOM', maxMembers: 15, memberCount: 1 },
});

test('로그인은 공개 DTO와 보안 쿠키만 전달하며 세션 원문은 DB에 보내지 않는다', async () => {
  const { http, calls } = fixture();
  const response = await http.login(request('login', loginBody));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: expectedData() });
  const cookie = response.cookies.get('__Host-jlpt_session')!;
  expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  expect(new Date(cookie.expires!).toISOString()).toBe(new Date(expires).toISOString());
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(calls.find((c) => c.path === 'rpc/create_user_session')?.body?.p_token_hash).toBe(
    hashSessionToken(cookie.value),
  );
  expect(calls.find((c) => c.path === 'study_groups')?.query.get('id')).toBe(`eq.${groupId}`);
});

test('강제 PIN 변경 세션도 me에서 상태를 확인하고 쿠키 만료는 연장하지 않는다', async () => {
  const { http, calls } = fixture({ limited: true });
  const login = await http.login(request('login', loginBody));
  expect(await login.json()).toEqual({ data: expectedData(true) });
  const me = await http.me(request('me', undefined, { cookie: `__Host-jlpt_session=${token}` }));
  expect(me.status).toBe(200);
  expect(await me.json()).toEqual({ data: expectedData(true) });
  expect(me.headers.has('set-cookie')).toBe(false);
  expect(
    calls
      .filter((c) => c.path === 'rpc/resolve_user_session')
      .every((c) => c.body?.p_allow_change_pin === true),
  ).toBe(true);
});

test('없는 계정과 잘못된 PIN은 같은 401이며 쿠키를 발급하지 않는다', async () => {
  for (const [options, pin] of [
    [{ missing: true }, '0123'],
    [{}, '9999'],
  ] as const) {
    const { http, calls } = fixture(options);
    const response = await http.login(request('login', { ...loginBody, pin }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('INVALID_CREDENTIALS');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(calls.some((c) => c.path === 'rpc/create_user_session')).toBe(false);
  }
});

test('Origin·JSON·입력 검증 실패는 DB 호출 전에 차단한다', async () => {
  for (const [body, headers, status] of [
    [loginBody, { origin: 'https://attacker.example' }, 403],
    [loginBody, { 'content-type': 'text/plain' }, 415],
    [{ ...loginBody, pin: 'bad' }, {}, 400],
    [{ ...loginBody, extra: 'a'.repeat(4096) }, {}, 413],
  ] as const) {
    const { http, calls } = fixture();
    const response = await http.login(request('login', body, headers));
    expect(response.status).toBe(status);
    expect(calls).toHaveLength(0);
  }
});

test('제한은 429·재시도 시각을 반환하고 시스템 오류 원문은 숨긴다', async () => {
  const limited = fixture({ rateLimited: true });
  const response = await limited.http.login(request('login', loginBody));
  expect(response.status).toBe(429);
  expect((await response.json()).error.retryAt).toBe(expires);
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(limited.calls).toHaveLength(1);
  const failed = fixture({ failure: 'PRIVATE_SQL_AND_KEY' });
  const unavailable = await failed.http.login(request('login', loginBody));
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain('PRIVATE_SQL_AND_KEY');
});

test('관리자 쿠키·잘못된 사용자 토큰·무쿠키는 사용자 세션으로 인정하지 않는다', async () => {
  for (const cookie of ['', '__Host-jlpt_admin_session=' + token, '__Host-jlpt_session=bad']) {
    const { http, calls } = fixture();
    const response = await http.me(request('me', undefined, { cookie }));
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(response.cookies.get('__Host-jlpt_session')?.maxAge).toBe(0);
    expect(response.cookies.has('__Host-jlpt_admin_session')).toBe(false);
  }
});

test('로그아웃은 현재 해시만 폐기하고 쿠키를 지우며 반복 호출도 성공한다', async () => {
  const { http, calls } = fixture();
  for (const cookie of [`__Host-jlpt_session=${token}`, '', '__Host-jlpt_session=bad']) {
    const response = await http.logout(request('logout', {}, { cookie }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { loggedOut: true } });
    expect(response.cookies.get('__Host-jlpt_session')?.maxAge).toBe(0);
  }
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    path: 'rpc/revoke_user_session',
    body: { p_token_hash: hashSessionToken(token) },
  });
  const failed = fixture({ failure: 'PRIVATE' });
  const response = await failed.http.logout(
    request('logout', {}, { cookie: `__Host-jlpt_session=${token}` }),
  );
  expect(response.status).toBe(503);
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('DB가 만료·삭제 세션을 거부하면 me는 401과 쿠키 제거를 반환한다', async () => {
  const transport: typeof fetch = async () =>
    Response.json({ code: 'P0001', message: 'UNAUTHORIZED' }, { status: 400 });
  const response = await createAuthHttp(env, transport).me(
    request('me', undefined, { cookie: `__Host-jlpt_session=${token}` }),
  );
  expect(response.status).toBe(401);
  expect(response.cookies.get('__Host-jlpt_session')?.maxAge).toBe(0);
});

test('운영 출처는 Vercel 전용 단일 IP만 허용하며 임의 헤더로 대체하지 않는다', () => {
  expect(trustedAuthSource(request('me'), env)).toBe('192.0.2.1');
  for (const headers of [
    { 'x-vercel-forwarded-for': '', 'x-forwarded-for': '192.0.2.1' },
    { 'x-vercel-forwarded-for': '192.0.2.1, 192.0.2.2' },
    { 'x-vercel-forwarded-for': 'unknown' },
  ] as Record<string, string>[])
    expect(() => trustedAuthSource(request('me', undefined, headers), env)).toThrow(
      'AUTH_UNAVAILABLE',
    );
  expect(() => trustedAuthSource(request('me'), { NODE_ENV: 'production' })).toThrow(
    'AUTH_UNAVAILABLE',
  );
  expect(trustedAuthSource(request('me'), { NODE_ENV: 'development' })).toBe('local-development');
  expect(
    trustedAuthSource(
      request('me', undefined, { 'x-vercel-forwarded-for': '2001:0db8:0:0:0:0:0:1' }),
      env,
    ),
  ).toBe('2001:db8::1');
});

test('비밀 설정 누락은 입력이나 비밀을 드러내지 않고 503으로 닫힌다', async () => {
  const response = await createAuthHttp({ NODE_ENV: 'production' }).login(
    request('login', loginBody),
  );
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('AUTH_NOT_CONFIGURED');
});

const joinBody = { ...loginBody, pinConfirm: '0123', emoji: '🐰', requestId: id };
test('가입 신규201·재시도200, 같은 공개 DTO·새 쿠키·서버 그룹을 사용한다', async () => {
  for (const created of [true, false]) {
    const { http, calls } = fixture({ created });
    const response = await http.join(request('join', { ...joinBody, groupId: 'client-group' }));
    expect(response.status).toBe(created ? 201 : 200);
    expect(await response.json()).toEqual({ data: expectedData() });
    expect(response.cookies.get('__Host-jlpt_session')?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(calls.find((c) => c.path === 'rpc/complete_join_result')?.body).toMatchObject({
      p_group_id: groupId,
      p_request_id: id,
    });
    expect(calls[0].body?.p_kind).toBe('join');
  }
});
test('가입 업무 오류409를 구분하고 세션을 만들지 않는다', async () => {
  for (const joinError of ['GROUP_FULL', 'NICKNAME_TAKEN', 'IDEMPOTENCY_CONFLICT']) {
    const { http, calls } = fixture({ joinError });
    const response = await http.join(request('join', joinBody));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe(joinError);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(calls.some((c) => c.path === 'rpc/create_user_session')).toBe(false);
  }
});
test('가입 PIN 확인·이모지·요청 ID 검증 실패는 DB 예약 전 차단한다', async () => {
  for (const body of [
    { ...joinBody, pinConfirm: '9999' },
    { ...joinBody, emoji: 'INVALID' },
    { ...joinBody, requestId: 'bad' },
  ]) {
    const { http, calls } = fixture();
    expect((await http.join(request('join', body))).status).toBe(400);
    expect(calls).toHaveLength(0);
  }
});
test('가입 재시도도 현재 PIN이 달라졌으면401이며 세션을 발급하지 않는다', async () => {
  const { http, calls } = fixture({ created: false });
  const response = await http.join(
    request('join', { ...joinBody, pin: '9999', pinConfirm: '9999' }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.has('set-cookie')).toBe(false);
  expect(calls.some((c) => c.path === 'rpc/create_user_session')).toBe(false);
});

const resetBody = { newPin: '5678', newPinConfirm: '5678' };
const resetCookie = { cookie: `__Host-jlpt_session=${token}` };
test('제한 세션 PIN 변경은 현재 버전을 넘기고 새 보안 쿠키·공개 프로필만 반환한다', async () => {
  const { http, calls } = fixture({ limited: true });
  const response = await http.completeReset(request('complete-reset', resetBody, resetCookie));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { profile: expectedData().profile } });
  const cookie = response.cookies.get('__Host-jlpt_session')!;
  expect(cookie.value).not.toBe(token);
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, path: '/', sameSite: 'lax' });
  const call = calls.find((c) => c.path === 'rpc/complete_pin_reset')!;
  expect(call.body).toMatchObject({
    p_token_hash: hashSessionToken(token),
    p_expected_credential_version: 1,
    p_new_token_hash: hashSessionToken(cookie.value),
  });
  expect(call.body).not.toHaveProperty('newPin');
  expect(calls.find((c) => c.path === 'rpc/reserve_auth_attempt')?.body?.p_kind).toBe('change_pin');
});
test('PIN 변경 무세션·일반 세션·현재와 같은 PIN·확인 불일치는 변경하지 않는다', async () => {
  for (const [options, body, headers, status, code] of [
    [{ limited: true }, resetBody, {}, 401, 'UNAUTHORIZED'],
    [{}, resetBody, resetCookie, 409, 'RESET_NOT_REQUIRED'],
    [
      { limited: true },
      { newPin: '0123', newPinConfirm: '0123' },
      resetCookie,
      400,
      'PIN_UNCHANGED',
    ],
    [
      { limited: true },
      { ...resetBody, newPinConfirm: '9999' },
      resetCookie,
      400,
      'VALIDATION_ERROR',
    ],
    [
      { limited: true },
      resetBody,
      { ...resetCookie, origin: 'https://attacker.example' },
      403,
      'ORIGIN_NOT_ALLOWED',
    ],
  ] as const) {
    const { http, calls } = fixture(options);
    const response = await http.completeReset(request('complete-reset', body, headers));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(calls.some((c) => c.path === 'rpc/complete_pin_reset')).toBe(false);
  }
});
test('PIN 변경 제한429는 해시·변경 전에 반환하며 기존 쿠키를 지우지 않는다', async () => {
  const { http, calls } = fixture({ limited: true, rateLimited: true });
  const response = await http.completeReset(request('complete-reset', resetBody, resetCookie));
  expect(response.status).toBe(429);
  expect(
    calls.some((c) => c.path === 'user_credentials' || c.path === 'rpc/complete_pin_reset'),
  ).toBe(false);
  expect(response.headers.has('set-cookie')).toBe(false);
});

test('PIN 변경 도중 세션/예약이 만료되면401, DB 실패는503이며 성공 쿠키가 없다', async () => {
  for (const [options, status] of [
    [{ limited: true, resetError: 'UNAUTHORIZED' }, 401],
    [{ limited: true, resetError: 'PRIVATE_SQL' }, 503],
    [{ limited: true, attemptExpired: true }, 401],
  ] as const) {
    const { http, calls } = fixture(options);
    const response = await http.completeReset(request('complete-reset', resetBody, resetCookie));
    expect(response.status).toBe(status);
    if (status === 401) expect(response.cookies.get('__Host-jlpt_session')?.maxAge).toBe(0);
    else expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.text()).not.toContain('PRIVATE_SQL');
    if ('attemptExpired' in options)
      expect(calls.some((c) => c.path === 'rpc/complete_pin_reset')).toBe(false);
  }
});

test('일반 PIN 변경은 현재 PIN 확인 후 같은 예산·원자 RPC·새 보안 쿠키를 사용한다', async () => {
  const { http, calls } = fixture();
  const response = await http.changePin(
    request('change-pin', { currentPin: '0123', ...resetBody }, resetCookie),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { profile: expectedData().profile } });
  const cookie = response.cookies.get('__Host-jlpt_session')!;
  expect(cookie.value).not.toBe(token);
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  const call = calls.find((c) => c.path === 'rpc/change_user_pin')!;
  expect(call.body).toMatchObject({
    p_token_hash: hashSessionToken(token),
    p_expected_credential_version: 1,
    p_new_token_hash: hashSessionToken(cookie.value),
  });
  expect(call.body).not.toHaveProperty('currentPin');
  expect(call.body).not.toHaveProperty('newPin');
  expect(calls.find((c) => c.path === 'rpc/reserve_auth_attempt')?.body?.p_kind).toBe('change_pin');
  expect(calls.find((c) => c.path === 'rpc/complete_auth_attempt')?.body?.p_outcome).toBe(
    'success',
  );
});
test('잘못된 현재 PIN·동일한 새 PIN·입력 오류·제한 세션은 일반 변경을 거부한다', async () => {
  for (const [options, body, status, code] of [
    [{}, { currentPin: '9999', ...resetBody }, 400, 'CURRENT_PIN_INVALID'],
    [{}, { currentPin: '0123', newPin: '0123', newPinConfirm: '0123' }, 400, 'PIN_UNCHANGED'],
    [{}, { ...resetBody }, 400, 'VALIDATION_ERROR'],
    [{}, { currentPin: '0123', ...resetBody, newPinConfirm: '9999' }, 400, 'VALIDATION_ERROR'],
    [{ limited: true }, { currentPin: '0123', ...resetBody }, 403, 'PIN_CHANGE_REQUIRED'],
  ] as const) {
    const { http, calls } = fixture(options);
    const response = await http.changePin(request('change-pin', body, resetCookie));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(calls.some((c) => c.path === 'rpc/change_user_pin')).toBe(false);
    if (code === 'CURRENT_PIN_INVALID')
      expect(calls.find((c) => c.path === 'rpc/complete_auth_attempt')?.body?.p_outcome).toBe(
        'failure',
      );
  }
});
test('일반 PIN 변경의 제한·만료·DB 실패·무세션·출처 오류에서 성공 쿠키와 변경은 없다', async () => {
  for (const [options, headers, status, code] of [
    [{ rateLimited: true }, resetCookie, 429, 'AUTH_RATE_LIMITED'],
    [{ attemptExpired: true }, resetCookie, 401, 'AUTH_ATTEMPT_EXPIRED'],
    [{ resetError: 'UNAUTHORIZED' }, resetCookie, 401, 'UNAUTHORIZED'],
    [{ resetError: 'PIN_CHANGE_REQUIRED' }, resetCookie, 403, 'PIN_CHANGE_REQUIRED'],
    [{ resetError: 'SECRET_SQL' }, resetCookie, 503, 'AUTH_UNAVAILABLE'],
    [{}, {}, 401, 'UNAUTHORIZED'],
    [{}, { ...resetCookie, origin: 'https://attacker.example' }, 403, 'ORIGIN_NOT_ALLOWED'],
  ] as const) {
    const { http, calls } = fixture(options);
    const response = await http.changePin(
      request('change-pin', { currentPin: '0123', ...resetBody }, headers),
    );
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    if (status === 401) expect(response.cookies.get('__Host-jlpt_session')?.maxAge).toBe(0);
    else expect(response.headers.has('set-cookie')).toBe(false);
    if (status === 429)
      expect(
        calls.some((c) => c.path === 'user_credentials' || c.path === 'rpc/change_user_pin'),
      ).toBe(false);
  }
});

function emojiRequest(body: unknown, headers: Record<string, string> = resetCookie) {
  return new NextRequest(`${origin}/api/me/emoji`, {
    method: 'PATCH',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
test('이모지 변경은 쿠키 해시와 고정 선택지만 RPC에 보내며 공개 프로필만 반환한다', async () => {
  const { http, calls } = fixture();
  const response = await http.updateEmoji(
    emojiRequest({ emoji: '🐱', userId: groupId, nickname: '다른이름' }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { profile: { ...expectedData().profile, emoji: '🐱' } },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    path: 'rpc/update_profile_emoji',
    body: { p_token_hash: hashSessionToken(token), p_emoji: '🐱' },
  });
  expect(response.headers.has('set-cookie')).toBe(false);
  expect(response.headers.get('cache-control')).toContain('no-store');
});
test('이모지 변경의 무세션·관리자 쿠키·무효 값·출처 오류는 DB에 전달하지 않는다', async () => {
  for (const [body, headers, status] of [
    [{ emoji: '🐱' }, {}, 401],
    [{ emoji: '🐱' }, { cookie: `__Host-jlpt_admin_session=${token}` }, 401],
    [{ emoji: '🦄' }, resetCookie, 400],
    [{ emoji: null }, resetCookie, 400],
    [{ emoji: '🐱' }, { ...resetCookie, origin: 'https://attacker.example' }, 403],
  ] as const) {
    const { http, calls } = fixture();
    const response = await http.updateEmoji(emojiRequest(body, headers));
    expect(response.status).toBe(status);
    expect(calls).toHaveLength(0);
  }
});
test('이모지 RPC의 제한·만료·무효 입력·실패·잘못된 응답은 성공으로 처리하지 않는다', async () => {
  for (const [options, status, code] of [
    [{ emojiError: 'PIN_CHANGE_REQUIRED' }, 403, 'PIN_CHANGE_REQUIRED'],
    [{ emojiError: 'UNAUTHORIZED' }, 401, 'UNAUTHORIZED'],
    [{ emojiError: 'VALIDATION_ERROR' }, 400, 'VALIDATION_ERROR'],
    [{ emojiError: 'PRIVATE_SQL' }, 503, 'AUTH_UNAVAILABLE'],
    [{ badEmojiResult: true }, 503, 'AUTH_UNAVAILABLE'],
  ] as const) {
    const { http } = fixture(options);
    const response = await http.updateEmoji(emojiRequest({ emoji: '🐱' }));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    if (status === 401) expect(response.cookies.get('__Host-jlpt_session')?.maxAge).toBe(0);
    else expect(response.headers.has('set-cookie')).toBe(false);
  }
});

test('서버 시간 지표는 요청별 숫자만 포함하고 동시 요청 사이에서 누적되지 않는다', async () => {
  const { http } = fixture();
  const [saved, missing] = await Promise.all([
    http.updateEmoji(emojiRequest({ emoji: '🐱' })),
    http.me(request('me')),
  ]);
  expect(saved.headers.get('server-timing')).toMatch(
    /^app;dur=\d+\.\d, db;dur=\d+\.\d, dbcalls;desc="1"$/,
  );
  expect(missing.headers.get('server-timing')).toMatch(
    /^app;dur=\d+\.\d, db;dur=0\.0, dbcalls;desc="0"$/,
  );
  const next = await http.me(request('me'));
  expect(next.headers.get('server-timing')).toContain('dbcalls;desc="0"');
  for (const response of [saved, missing, next]) {
    const timing = response.headers.get('server-timing')!;
    for (const secret of [token, env.PIN_PEPPER, env.SUPABASE_SECRET_KEY, id])
      expect(timing).not.toContain(secret);
    expect(response.headers.get('cache-control')).toContain('no-store');
  }
});
test('실패한 DB 요청도 시간 지표에 포함하되 오류 원문은 노출하지 않는다', async () => {
  const { http } = fixture({ emojiError: 'PRIVATE_DATABASE_ERROR' });
  const response = await http.updateEmoji(emojiRequest({ emoji: '🐱' }));
  expect(response.status).toBe(503);
  expect(response.headers.get('server-timing')).toContain('dbcalls;desc="1"');
  expect(response.headers.get('server-timing')).not.toContain('PRIVATE_DATABASE_ERROR');
  expect(await response.text()).not.toContain('PRIVATE_DATABASE_ERROR');
});
