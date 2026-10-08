import { test, expect } from '@playwright/test';
import { authenticate, type AuthDatabase, type AuthAccount } from '../../src/server/auth/service';
import { loadAuthConfig } from '../../src/server/auth/config';
import { hashPin, hashSessionToken } from '../../src/server/auth/crypto';

const config = {
  pepper: 'test-pepper-independent-at-least-32-bytes',
  rateLimitKey: 'test-rate-independent-at-least-32-bytes',
  idempotencyKey: 'test-join-independent-at-least-32-bytes',
};
function database(account: AuthAccount | null) {
  const calls: string[] = [];
  let sessionHash = '';
  const db: AuthDatabase = {
    reserve: async (_kind, nick, source) => {
      calls.push('reserve');
      expect(nick).toMatch(/^[a-f0-9]{64}$/);
      expect(source).toMatch(/^[a-f0-9]{64}$/);
      expect(nick).not.toBe(source);
      return { allowed: true, attemptId: 'attempt-test-id' };
    },
    complete: async (_id, outcome) => {
      calls.push(outcome);
      return true;
    },
    findAccount: async () => {
      calls.push('read');
      return account;
    },
    findAccountById: async () => {
      calls.push('read-current');
      return account;
    },
    join: async () => {
      calls.push('join');
      return 'user-id';
    },
    createSession: async (_id, version, hash) => {
      calls.push('session');
      sessionHash = hash;
      expect(version).toBe(account?.credentialVersion);
      return { expiresAt: '2026-11-07T00:00:00Z', mode: 'normal' };
    },
  };
  return { db, calls, getSessionHash: () => sessionHash };
}

let account: AuthAccount;
test.beforeAll(async () => {
  account = {
    id: 'user-id',
    credentialVersion: 3,
    credential: await hashPin('0123', config.pepper),
  };
});

test('설정 없음·짧은 키·키 재사용·운영 HTTP 거부, 오류에 값 노출 없음', () => {
  const env = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    APP_ORIGIN: 'https://study.example',
    NODE_ENV: 'production',
    PIN_PEPPER: config.pepper,
    RATE_LIMIT_HMAC_KEY: config.rateLimitKey,
    IDEMPOTENCY_HMAC_KEY: config.idempotencyKey,
  };
  expect(loadAuthConfig(env).appOrigin).toBe(env.APP_ORIGIN);
  for (const invalid of [
    {},
    { ...env, PIN_PEPPER: 'short' },
    { ...env, RATE_LIMIT_HMAC_KEY: env.PIN_PEPPER },
    { ...env, APP_ORIGIN: 'http://study.example' },
  ]) {
    expect(() => loadAuthConfig(invalid)).toThrow('AUTH_NOT_CONFIGURED');
  }
});

test('예약→현재 PIN 검증→완료→버전 재확인 세션, 토큰은 내부 결과에만', async () => {
  const f = database(account);
  const result = await authenticate(
    'login',
    { nickname: '토끼', pin: '0123' },
    'trusted-source',
    f.db,
    config,
  );
  expect(f.calls).toEqual(['reserve', 'read', 'success', 'session']);
  expect(f.getSessionHash()).toBe(hashSessionToken(result.token));
  expect(result).not.toHaveProperty('credential');
  expect(result).not.toHaveProperty('pepper');
});

test('DB 예약 거부·늦은 완료에는 세션을 발급하지 않음', async () => {
  const f = database(account);
  f.db.reserve = async () => ({ allowed: false, retryAt: '2026-10-08T01:00:00Z' });
  await expect(
    authenticate('login', { nickname: '토끼', pin: '0123' }, 'trusted', f.db, config),
  ).rejects.toMatchObject({ status: 429, code: 'AUTH_RATE_LIMITED' });
  expect(f.calls).toEqual([]);
  f.db.reserve = async () => ({ allowed: true, attemptId: 'id' });
  f.db.complete = async () => false;
  await expect(
    authenticate('login', { nickname: '토끼', pin: '0123' }, 'trusted', f.db, config),
  ).rejects.toMatchObject({ code: 'AUTH_ATTEMPT_EXPIRED' });
  expect(f.calls).not.toContain('session');
});

test('없는 계정과 PIN 오답은 같은 오류·실패 완료', async () => {
  for (const current of [null, account]) {
    const f = database(current);
    await expect(
      authenticate('login', { nickname: '토끼', pin: '9999' }, 'trusted', f.db, config),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(f.calls).toEqual(['reserve', 'read', 'failure']);
  }
});

test('가입 재전송은 현재 PIN 재검증, 변경된 PIN에는 세션 없음', async () => {
  const f = database(account);
  const input = {
    nickname: '토끼',
    pin: '9999',
    pinConfirm: '9999',
    emoji: '🐰',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
  };
  await expect(authenticate('join', input, 'trusted', f.db, config)).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  expect(f.calls).toEqual(['reserve', 'join', 'read-current', 'failure']);
});

test('DB 오류 원문 차단·system_error 완료, 출처 없음은 예약 전 거부', async () => {
  const f = database(account);
  f.db.findAccount = async () => {
    throw new Error('SECRET pin=0123 source=private');
  };
  await expect(
    authenticate('login', { nickname: '토끼', pin: '0123' }, 'trusted', f.db, config),
  ).rejects.toMatchObject({ message: 'AUTH_UNAVAILABLE' });
  expect(f.calls).toEqual(['reserve', 'system_error']);
  const missing = database(account);
  await expect(
    authenticate('login', { nickname: '토끼', pin: '0123' }, '', missing.db, config),
  ).rejects.toMatchObject({ status: 503 });
  expect(missing.calls).toEqual([]);
});

test('DB 예약 자체의 오류도 원문 차단, 아직 예약되지 않은 요청은 완료 호출 없음', async () => {
  const f = database(account);
  f.db.reserve = async () => {
    throw new Error('SECRET service-role-key');
  };
  await expect(
    authenticate('login', { nickname: '토끼', pin: '0123' }, 'trusted', f.db, config),
  ).rejects.toMatchObject({ status: 503, message: 'AUTH_UNAVAILABLE' });
  expect(f.calls).toEqual([]);
});

test('성공한 가입도 현재 credential 버전으로 세션 생성', async () => {
  const f = database(account);
  const result = await authenticate(
    'join',
    {
      nickname: '토끼',
      pin: '0123',
      pinConfirm: '0123',
      emoji: '🐰',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    },
    'trusted',
    f.db,
    config,
  );
  expect(f.calls).toEqual(['reserve', 'join', 'read-current', 'success', 'session']);
  expect(result.userId).toBe(account.id);
});
