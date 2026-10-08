import { createHmac } from 'node:crypto';
import { isPin, normalizeNickname, validateJoinInput } from '../../features/auth/validation';
import {
  createSessionToken,
  hashPin,
  joinFingerprint,
  verifyMissingAccount,
  verifyPin,
  type PinCredential,
} from './crypto';

export class AuthServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryAt?: string,
  ) {
    super(code);
  }
}
export type AuthAccount = {
  id: string;
  credentialVersion: number;
  credential: PinCredential;
};
export type AuthDatabase = {
  reserve(
    kind: 'login' | 'join',
    nicknameHmac: string,
    sourceHmac: string,
  ): Promise<{ allowed: true; attemptId: string } | { allowed: false; retryAt: string }>;
  complete(attemptId: string, outcome: 'success' | 'failure' | 'system_error'): Promise<boolean>;
  findAccount(nicknameKey: string): Promise<AuthAccount | null>;
  findAccountById(id: string): Promise<AuthAccount | null>;
  join(
    input: NonNullable<ReturnType<typeof validateJoinInput>>,
    fingerprint: string,
    credential: PinCredential,
  ): Promise<string>;
  createSession(
    id: string,
    expectedVersion: number,
    tokenHash: string,
  ): Promise<{ expiresAt: string; mode: 'normal' | 'change_pin' }>;
};

/** 공개 응답이 아니다. token은 Route Handler가 HttpOnly 쿠키로만 전달해야 한다. */
export async function authenticate(
  kind: 'login' | 'join',
  input: unknown,
  trustedSource: string,
  db: AuthDatabase,
  config: { pepper: string; rateLimitKey: string; idempotencyKey: string },
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AuthServiceError(400, 'VALIDATION_ERROR');
  const data = input as Record<string, unknown> | null;
  const normalized = normalizeNickname(data?.nickname);
  const joined = kind === 'join' ? validateJoinInput(input) : null;
  if (!data || !normalized || !isPin(data.pin) || (kind === 'join' && !joined))
    throw new AuthServiceError(400, 'VALIDATION_ERROR');
  // 출처는 배포 환경이 검증한 서버 값만 전달한다. 요청 body의 IP나 임의 forwarded 헤더를 받지 않는다.
  if (!trustedSource || trustedSource.length > 256)
    throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
  if (
    [config.pepper, config.rateLimitKey, config.idempotencyKey].some(
      (key) => Buffer.byteLength(key) < 32,
    ) ||
    new Set([config.pepper, config.rateLimitKey, config.idempotencyKey]).size !== 3
  )
    throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
  const hmac = (namespace: string, value: string) =>
    createHmac('sha256', config.rateLimitKey)
      .update(JSON.stringify([namespace, value]))
      .digest('hex');
  let reservation: Awaited<ReturnType<AuthDatabase['reserve']>>;
  try {
    reservation = await db.reserve(
      kind,
      hmac('jlpt-user-nickname:v1', normalized.nicknameKey),
      hmac('jlpt-source:v1', trustedSource),
    );
  } catch {
    throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
  }
  if (!reservation.allowed)
    throw new AuthServiceError(429, 'AUTH_RATE_LIMITED', reservation.retryAt);
  let completed = false;
  const finish = async (outcome: 'success' | 'failure' | 'system_error') => {
    const accepted = await db.complete(reservation.attemptId, outcome);
    completed = true;
    return accepted;
  };
  try {
    let account: AuthAccount | null;
    if (joined) {
      const credential = await hashPin(joined.pin, config.pepper);
      const id = await db.join(joined, joinFingerprint(joined, config.idempotencyKey), credential);
      // 재전송도 현재 자격증명을 다시 읽고 PIN을 검증한다.
      account = await db.findAccountById(id);
    } else {
      account = await db.findAccount(normalized.nicknameKey);
    }
    const valid = account
      ? await verifyPin(data.pin, account.credential, config.pepper)
      : await verifyMissingAccount(data.pin, config.pepper);
    if (!valid || !account) {
      await finish('failure');
      throw new AuthServiceError(401, 'INVALID_CREDENTIALS');
    }
    if (!(await finish('success'))) throw new AuthServiceError(401, 'AUTH_ATTEMPT_EXPIRED');
    const { token, tokenHash } = createSessionToken();
    const session = await db.createSession(account.id, account.credentialVersion, tokenHash);
    return {
      token,
      expiresAt: session.expiresAt,
      mustChangePin: session.mode === 'change_pin',
      userId: account.id,
    };
  } catch (error) {
    if (!completed) {
      try {
        await finish('system_error');
      } catch {
        /* 예약은 DB에서 만료된다. 사용량을 회수하지 않는다. */
      }
    }
    if (error instanceof AuthServiceError) throw error;
    // DB 오류 원문이나 사용자 입력을 호출자에게 전파하지 않는다.
    throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
  }
}
