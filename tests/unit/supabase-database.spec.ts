import { expect, test } from '@playwright/test';
import { createSupabaseAuthDatabase } from '../../src/server/auth/supabase-database';
import { SCRYPT_PARAMS } from '../../src/server/auth/crypto';

const id = '00000000-0000-4000-8000-000000000001';
const config = { supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'sb_secret_test' };
function fake(responses: unknown[], status = 200) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url: new URL(String(url)), init: init! });
    return Response.json(responses.shift(), { status });
  };
  return { calls, db: createSupabaseAuthDatabase(config, id, transport) };
}

test('RPC 예약·완료는 서버 키와 제한된 전송 설정을 사용한다', async () => {
  const { db, calls } = fake([{ allowed: true, attemptId: id }, false]);
  expect(await db.reserve('login', 'a'.repeat(64), 'b'.repeat(64))).toEqual({
    allowed: true,
    attemptId: id,
  });
  expect(await db.complete(id, 'success')).toBe(false);
  expect(calls[0].url.pathname).toBe('/rest/v1/rpc/reserve_auth_attempt');
  expect(calls[0].init).toMatchObject({ cache: 'no-store', redirect: 'error', method: 'POST' });
  expect(calls[0].init.headers).toEqual({
    apikey: config.serviceRoleKey,
    'Content-Type': 'application/json',
  });
  expect(JSON.parse(calls[1].init.body as string)).toEqual({ p_id: id, p_outcome: 'success' });
});

test('계정 조회는 현재 버전을 읽고 DB 행의 추가 필드를 제거한다', async () => {
  const { db, calls } = fake([
    [{ id }],
    [
      {
        user_id: id,
        pin_hash: 'a'.repeat(64),
        salt: Buffer.alloc(16).toString('base64'),
        hash_params: SCRYPT_PARAMS,
        credential_version: 2,
        private_field: 'secret',
      },
    ],
  ]);
  expect(await db.findAccount('닉,네임')).toEqual({
    id,
    credentialVersion: 2,
    credential: {
      hash: 'a'.repeat(64),
      salt: Buffer.alloc(16).toString('base64'),
      params: SCRYPT_PARAMS,
    },
  });
  expect(calls[0].url.searchParams.get('nickname_key')).toBe('eq.닉,네임');
  expect(calls[1].url.searchParams.get('user_id')).toBe(`eq.${id}`);
});

test('세션은 버전 검증 RPC를 사용하며 토큰 해시를 반환하지 않는다', async () => {
  const { db, calls } = fake([
    [{ mode: 'change_pin', expires_at: '2026-10-08T12:00:00Z', token_hash: 'secret', user_id: id }],
  ]);
  expect(await db.createSession(id, 3, 'a'.repeat(64))).toEqual({
    mode: 'change_pin',
    expiresAt: '2026-10-08T12:00:00Z',
  });
  expect(JSON.parse(calls[0].init.body as string).p_expected_credential_version).toBe(3);
});

test('DB 업무 오류만 허용하고 원문·네트워크 오류는 차단한다', async () => {
  await expect(
    fake([{ code: 'P0001', message: 'GROUP_FULL', details: 'secret' }], 400).db.complete(
      id,
      'success',
    ),
  ).rejects.toMatchObject({ status: 409, message: 'GROUP_FULL' });
  await expect(
    fake([{ code: 'XX000', message: 'private SQL and key' }], 500).db.complete(id, 'success'),
  ).rejects.toMatchObject({ status: 503, message: 'AUTH_UNAVAILABLE' });
  const transport: typeof fetch = async () => {
    throw new Error('secret network detail');
  };
  await expect(
    createSupabaseAuthDatabase(config, id, transport).complete(id, 'failure'),
  ).rejects.toMatchObject({ message: 'AUTH_UNAVAILABLE' });
});

test('잘못된 응답은 성공으로 처리하지 않으며 자동 재시도하지 않는다', async () => {
  const { db, calls } = fake([{ allowed: true, attemptId: 'bad-id' }]);
  await expect(db.reserve('join', 'a'.repeat(64), 'b'.repeat(64))).rejects.toMatchObject({
    status: 503,
  });
  expect(calls).toHaveLength(1);
  await expect(
    fake([{ mode: 'normal', expires_at: 'invalid' }]).db.createSession(id, 1, 'a'.repeat(64)),
  ).rejects.toMatchObject({ status: 503 });
});

test('legacy 서버 키는 Bearer를 사용하고 잘못된 연결 설정은 거부한다', async () => {
  let headers: unknown;
  const transport: typeof fetch = async (_url, init) => {
    headers = init?.headers;
    return Response.json(true);
  };
  await createSupabaseAuthDatabase(
    { ...config, serviceRoleKey: 'legacy-jwt' },
    id,
    transport,
  ).complete(id, 'success');
  expect(headers).toMatchObject({ Authorization: 'Bearer legacy-jwt', apikey: 'legacy-jwt' });
  expect(() =>
    createSupabaseAuthDatabase({ ...config, supabaseUrl: 'http://example.com' }, id),
  ).toThrow('AUTH_UNAVAILABLE');
});

test('가입은 서버 그룹과 기존 RPC 매개변수를 사용한다', async () => {
  const { db, calls } = fake([id]);
  const input = {
    nickname: '유리',
    nicknameKey: '유리',
    pin: '0123',
    emoji: '🐰' as const,
    requestId: id,
  };
  const credential = {
    hash: 'a'.repeat(64),
    salt: Buffer.alloc(16).toString('base64'),
    params: SCRYPT_PARAMS,
  };
  expect(await db.join(input, 'b'.repeat(64), credential)).toBe(id);
  const body = JSON.parse(calls[0].init.body as string);
  expect(body).toMatchObject({
    p_group_id: id,
    p_request_id: id,
    p_fingerprint: 'b'.repeat(64),
    p_pin_hash: credential.hash,
    p_hash_params: SCRYPT_PARAMS,
  });
  expect(body).not.toHaveProperty('pin');
});
