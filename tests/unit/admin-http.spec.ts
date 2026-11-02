import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { scryptSync } from 'node:crypto';
import { createAdminHttp } from '../../src/server/admin/http';
import { createRecordsHttp } from '../../src/server/records/http';
import { createAuthHttp } from '../../src/server/auth/http';
import { hashSessionToken, SCRYPT_PARAMS, verifyPin } from '../../src/server/auth/crypto';

const adminId = '68000000-0000-4000-8000-000000000001';
const memberId = '68000000-0000-4000-8000-000000000002';
const categoryId = '68000000-0000-4000-8000-000000000003';
const attemptId = '68000000-0000-4000-8000-000000000004';
const origin = 'https://admin.example';
const token = 'a'.repeat(43);
const password = 'test-only-admin-password';
const env = {
  NODE_ENV: 'production',
  VERCEL: '1',
  APP_ORIGIN: origin,
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PIN_PEPPER: 'p'.repeat(32),
  RATE_LIMIT_HMAC_KEY: 'r'.repeat(32),
  IDEMPOTENCY_HMAC_KEY: 'i'.repeat(32),
};
const admin = { id: adminId, loginId: 'ADMIN', expiresAt: '2099-01-01T00:00:00Z' };
const salt = Buffer.alloc(16).toString('base64');
const stored = {
  id: adminId,
  login_id: 'ADMIN',
  credential_version: 1,
  salt,
  hash_params: SCRYPT_PARAMS,
  password_hash: scryptSync(password, Buffer.alloc(16), 32, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex'),
};
function request(body?: unknown, cookie = 'admin', method?: string, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/admin`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      origin: requestOrigin,
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '192.0.2.1',
      ...(cookie === 'admin'
        ? { cookie: `__Host-jlpt_admin_session=${token}` }
        : cookie === 'user'
          ? { cookie: `__Host-jlpt_session=${token}` }
          : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function fixture(
  options: { missing?: boolean; limited?: boolean; expired?: boolean; failure?: string } = {},
) {
  const calls: { path: string; body: Record<string, unknown> | undefined }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.split('/').at(-1)!;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (path === 'reserve_auth_attempt')
      return Response.json(
        options.limited
          ? { allowed: false, retryAt: '2099-01-01T00:00:00Z' }
          : { allowed: true, attemptId },
      );
    if (path === 'admin_accounts') return Response.json(options.missing ? [] : [stored]);
    if (path === 'complete_auth_attempt') return Response.json(!options.expired);
    if (path === 'create_admin_session' || path === 'resolve_admin_session')
      return Response.json(admin);
    if (options.failure)
      return Response.json({ code: 'P0001', message: options.failure }, { status: 400 });
    if (path === 'manage_category')
      return Response.json(
        body.p_action === 'delete' ? { deleted: true } : { id: body.p_id, name: body.p_name },
      );
    if (path === 'list_admin_members')
      return Response.json([
        {
          id: memberId,
          nickname: '검사토끼',
          emoji: '🐰',
          joinedAt: '2026-10-01T00:00:00Z',
          credentialVersion: 1,
          secret: 'must-not-leak',
        },
      ]);
    if (path === 'study_categories') return Response.json([]);
    return Response.json(true);
  };
  return { calls, transport, http: createAdminHttp(env, transport) };
}

test('관리자 로그인은 예약 후 비밀번호를 검증하고 별도 보안 쿠키만 발급한다', async () => {
  const f = fixture();
  const response = await f.http.login(request({ loginId: 'ADMIN', password }, ''));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { admin } });
  const cookie = response.cookies.get('__Host-jlpt_admin_session')!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe('lax');
  expect(cookie.path).toBe('/');
  expect(response.cookies.get('__Host-jlpt_session')).toBeUndefined();
  expect(f.calls.map((c) => c.path)).toEqual([
    'reserve_auth_attempt',
    'admin_accounts',
    'complete_auth_attempt',
    'create_admin_session',
  ]);
  expect(f.calls.at(-1)!.body!.p_token_hash).toBe(hashSessionToken(cookie.value));
  expect(JSON.stringify(f.calls)).not.toContain(password);
});
test('없는 계정과 틀린 비밀번호는 같은 오류이며 제한·만료 시 쿠키를 발급하지 않는다', async () => {
  for (const missing of [false, true]) {
    const f = fixture({ missing });
    const response = await f.http.login(
      request({ loginId: 'ADMIN', password: 'wrong-password-long' }, ''),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('INVALID_CREDENTIALS');
    expect(f.calls.at(-1)!.body!.p_outcome).toBe('failure');
    expect(response.cookies.getAll()).toHaveLength(0);
  }
  const limited = fixture({ limited: true });
  expect((await limited.http.login(request({ loginId: 'ADMIN', password }, ''))).status).toBe(429);
  expect(limited.calls).toHaveLength(1);
  const expired = fixture({ expired: true });
  expect((await expired.http.login(request({ loginId: 'ADMIN', password }, ''))).status).toBe(401);
  expect(expired.calls.some((c) => c.path === 'create_admin_session')).toBe(false);
});
test('일반 세션·무세션·교차 출처는 관리자 DB 변경에 도달하지 않는다', async () => {
  const f = fixture();
  expect((await f.http.members(request(undefined, 'user'))).status).toBe(403);
  expect((await f.http.members(request(undefined, ''))).status).toBe(401);
  expect(
    (
      await f.http.createCategory(
        request({ id: categoryId, name: '단어' }, 'admin', 'POST', 'https://other.example'),
      )
    ).status,
  ).toBe(403);
  expect(f.calls).toHaveLength(0);
});
test('관리자 세션 DTO·로그아웃과 일반 공부 API의 권한을 분리한다', async () => {
  const f = fixture();
  expect(await (await f.http.me(request())).json()).toEqual({ data: { admin } });
  const members = await (await f.http.members(request())).json();
  expect(members.data.members[0].secret).toBeUndefined();
  const normal = createRecordsHttp(env, f.transport);
  expect((await normal.list(request())).status).toBe(403);
  expect((await normal.categories(request())).status).toBe(200);
  const response = await f.http.logout(request({}));
  expect(response.cookies.get('__Host-jlpt_admin_session')?.value).toBe('');
  expect(f.calls.find((c) => c.path === 'revoke_admin_session')?.body?.p_token_hash).toBe(
    hashSessionToken(token),
  );
});
test('공부 종류 이름 정규화·기존 이름 경합 조건과 사용 중 삭제 오류를 보존한다', async () => {
  const f = fixture();
  expect((await f.http.createCategory(request({ id: categoryId, name: ' 작문 ' }))).status).toBe(
    200,
  );
  expect(f.calls.at(-1)!.body).toMatchObject({
    p_action: 'create',
    p_name: '작문',
    p_id: categoryId,
    p_expected_name: null,
  });
  expect(
    (
      await f.http.updateCategory(
        request({ name: '독해', expectedName: '작문' }, 'admin', 'PATCH'),
        categoryId,
      )
    ).status,
  ).toBe(200);
  expect(f.calls.at(-1)!.body).toMatchObject({ p_expected_name: '작문', p_action: 'update' });
  expect(
    (await f.http.createCategory(request({ id: categoryId, name: 'a'.repeat(21) }))).status,
  ).toBe(400);
  const used = fixture({ failure: 'CATEGORY_IN_USE' });
  const response = await used.http.deleteCategory(
    request({ expectedName: '단어' }, 'admin', 'DELETE'),
    categoryId,
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe('CATEGORY_IN_USE');
});
test('PIN 초기화는 서버의 대상 닉네임과 실제 0000 해시·재전송 식별자를 사용한다', async () => {
  const f = fixture();
  const response = await f.http.resetPin(
    request({ requestId: attemptId, expectedCredentialVersion: 1, nickname: '위조' }),
    memberId,
  );
  expect(response.status).toBe(200);
  const reset = f.calls.at(-1)!.body!;
  expect(reset).toMatchObject({
    p_user_id: memberId,
    p_expected_version: 1,
    p_request_id: attemptId,
  });
  expect(
    await verifyPin(
      '0000',
      { hash: reset.p_pin_hash, salt: reset.p_salt, params: reset.p_hash_params },
      env.PIN_PEPPER,
    ),
  ).toBe(true);
  expect(JSON.stringify(reset)).not.toContain('위조');
  expect(
    (
      await f.http.removeMember(
        request({ expectedCredentialVersion: 1 }, 'admin', 'DELETE'),
        memberId,
      )
    ).status,
  ).toBe(200);
});
test('일반 ADMIN 가입은 대소문자와 앞뒤 공백에 관계없이 DB 예약 전에 거부한다', async () => {
  const f = fixture();
  const http = createAuthHttp(env, f.transport);
  for (const nickname of ['ADMIN', 'admin', ' Admin ']) {
    const response = await http.join(
      request({ nickname, pin: '1234', pinConfirm: '1234', emoji: '🐰', requestId: attemptId }, ''),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('NICKNAME_RESERVED');
  }
  expect(f.calls).toHaveLength(0);
});
