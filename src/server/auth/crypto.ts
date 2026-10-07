// Node 서버 전용. UI에서 import하지 않으며 pepper·해시를 DTO로 반환하지 않는다.
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { isPin } from '../../features/auth/validation';

export const SCRYPT_PARAMS = Object.freeze({
  algorithm: 'scrypt',
  N: 32768,
  r: 8,
  p: 3,
  dkLen: 32,
});
const MAX_MEMORY = 64 * 1024 * 1024;
export type PinCredential = { hash: string; salt: string; params: typeof SCRYPT_PARAMS };

function requireSecret(secret: string) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('서버 인증 비밀값은 32바이트 이상이어야 합니다.');
  }
}

async function derive(pin: string, salt: Buffer, pepper: string): Promise<Buffer> {
  requireSecret(pepper);
  const password = createHmac('sha256', pepper)
    .update(JSON.stringify(['jlpt-pin:v1', pin]))
    .digest();
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_PARAMS.dkLen,
      {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        maxmem: MAX_MEMORY,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPin(pin: string, pepper: string): Promise<PinCredential> {
  if (!isPin(pin)) throw new Error('PIN은 ASCII 숫자 네 자리여야 합니다.');
  const salt = randomBytes(16);
  const key = await derive(pin, salt, pepper);
  return { hash: key.toString('hex'), salt: salt.toString('base64'), params: SCRYPT_PARAMS };
}

export async function verifyPin(pin: string, stored: unknown, pepper: string) {
  if (!isPin(pin) || !stored || typeof stored !== 'object') return false;
  const credential = stored as Partial<PinCredential>;
  // DB 값으로 연산 비용을 임의로 늘리거나 약한 파라미터를 선택하지 않는다.
  if (
    Object.entries(SCRYPT_PARAMS).some(
      ([key, value]) => credential.params?.[key as keyof typeof SCRYPT_PARAMS] !== value,
    )
  )
    return false;
  if (
    typeof credential.hash !== 'string' ||
    credential.hash.length !== 64 ||
    !/^[0-9a-f]{64}$/.test(credential.hash) ||
    typeof credential.salt !== 'string'
  )
    return false;
  const salt = Buffer.from(credential.salt, 'base64');
  if (salt.length !== 16 || salt.toString('base64') !== credential.salt) return false;
  return timingSafeEqual(await derive(pin, salt, pepper), Buffer.from(credential.hash, 'hex'));
}

/** 없는 계정도 같은 scrypt 비용을 지불한다. 반드시 DB 시도 예약 이후에 호출한다. */
export async function verifyMissingAccount(pin: string, pepper: string) {
  if (!isPin(pin)) return false;
  timingSafeEqual(await derive(pin, Buffer.alloc(16), pepper), Buffer.alloc(32));
  return false;
}

export function createSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string) {
  if (typeof token !== 'string' || token.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error('잘못된 세션 토큰 형식입니다.');
  return createHash('sha256').update(token).digest('hex');
}

/** PIN 평문은 HMAC 입력으로만 사용하고 저장·로그에 남기지 않는다. */
export function joinFingerprint(
  input: { nickname: string; emoji: string; pin: string },
  key: string,
) {
  requireSecret(key);
  return createHmac('sha256', key)
    .update(JSON.stringify(['jlpt-join:v1', input.nickname, input.emoji, input.pin]))
    .digest('hex');
}
