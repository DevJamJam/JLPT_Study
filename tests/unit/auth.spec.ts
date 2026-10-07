import { test, expect } from '@playwright/test';
import { isPin, normalizeNickname, validateJoinInput } from '../../src/features/auth/validation';
import {
  hashPin,
  verifyPin,
  verifyMissingAccount,
  createSessionToken,
  hashSessionToken,
  joinFingerprint,
  SCRYPT_PARAMS,
} from '../../src/server/auth/crypto';
import { sessionCookie, SESSION_SECONDS } from '../../src/server/auth/session-cookie';

const pepper = 'test-only-pepper-at-least-32-bytes';
const requestId = '550e8400-e29b-41d4-a716-446655440000';

test('닉네임 NFC·trim·소문자키와 글자수·제어문자', () => {
  expect(normalizeNickname('  CaT  ')).toEqual({ nickname: 'CaT', nicknameKey: 'cat' });
  expect(normalizeNickname('토끼')?.nickname).toBe('토끼');
  expect(normalizeNickname('🐰'.repeat(12))).not.toBeNull();
  expect(normalizeNickname('İX')?.nicknameKey).toBe('i\u0307x');
  for (const value of ['a', '🐰'.repeat(13), '토\n끼', '토\u0000끼', '토\u200b끼', null]) {
    expect(normalizeNickname(value)).toBeNull();
  }
});

test('PIN은 정확히 ASCII 네 자리 문자열, 확인·이모지·요청 UUID 검사', () => {
  expect(isPin('0123')).toBe(true);
  for (const pin of [1234, '123', '12345', '１２３４', '1234\n', ' 1234', null])
    expect(isPin(pin)).toBe(false);
  const input = { nickname: '토끼', pin: '0123', pinConfirm: '0123', emoji: '🐰', requestId };
  expect(validateJoinInput(input)?.pin).toBe('0123');
  for (const extra of [
    { pinConfirm: '1234' },
    { emoji: '🚀' },
    { requestId: requestId + '\n' },
    { requestId: '1' },
  ]) {
    expect(validateJoinInput({ ...input, ...extra })).toBeNull();
  }
});

test('scrypt salt는 계정별 무작위이며 PIN·pepper·비용 메타데이터 검증', async () => {
  const first = await hashPin('0123', pepper);
  const second = await hashPin('0123', pepper);
  expect(first.params).toEqual(SCRYPT_PARAMS);
  expect(first.salt).not.toBe(second.salt);
  expect(first.hash).not.toBe(second.hash);
  expect(await verifyPin('0123', first, pepper)).toBe(true);
  expect(await verifyPin('1234', first, pepper)).toBe(false);
  expect(await verifyPin('0123', first, pepper + 'changed')).toBe(false);
  expect(await verifyPin('0123', { ...first, hash: first.hash + '\n' }, pepper)).toBe(false);
  expect(
    await verifyPin('0123', { ...first, params: { ...first.params, N: 2 ** 20 } }, pepper),
  ).toBe(false);
  expect(await verifyMissingAccount('0123', pepper)).toBe(false);
  await expect(hashPin('1234', 'short')).rejects.toThrow('32바이트');
  await expect(hashPin('1234\n', pepper)).rejects.toThrow('네 자리');
});

test('세션 토큰 32바이트·해시만 DB 저장·고정 쿠키 설정', () => {
  const a = createSessionToken(),
    b = createSessionToken();
  expect(Buffer.from(a.token, 'base64url')).toHaveLength(32);
  expect(a.token).not.toBe(b.token);
  expect(a.tokenHash).toBe(hashSessionToken(a.token));
  expect(a.tokenHash).not.toBe(a.token);
  expect(() => hashSessionToken(a.token + '\n')).toThrow();
  const expiresAt = new Date('2026-11-06T00:00:00Z');
  const cookie = sessionCookie(expiresAt);
  expect(cookie.name).toBe('__Host-jlpt_session');
  expect(cookie.options).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  expect(cookie.options).not.toHaveProperty('domain');
  expect(SESSION_SECONDS.change_pin).toBe(900);
  expect(sessionCookie(expiresAt).options).not.toHaveProperty('maxAge');
  expect(SESSION_SECONDS.normal).toBe(2592000);
  expect(sessionCookie(expiresAt, false).name).toBe('jlpt_dev_session');
});

test('가입 HMAC은 선행 0·입력 변경·서로 다른 키를 구분', () => {
  const input = { nickname: '토끼', emoji: '🐰', pin: '0123' };
  const key = 'test-idempotency-key-separate-32-bytes';
  const hash = joinFingerprint(input, key);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(joinFingerprint(input, key)).toBe(hash);
  expect(joinFingerprint({ ...input, pin: '1234' }, key)).not.toBe(hash);
  expect(joinFingerprint(input, key + '2')).not.toBe(hash);
  expect(hash).not.toContain('0123');
});
