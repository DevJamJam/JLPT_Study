import { isPin, normalizeNickname } from '../../features/auth/validation';
import { createSessionToken, hashPin, verifyPin } from './crypto';
import { AuthServiceError, reserveUserAttempt } from './service';
import type { UserSessionDatabase } from './supabase-database';

export async function changePin(
  mode: 'reset' | 'normal',
  input: Record<string, unknown>,
  tokenHash: string,
  source: string,
  db: UserSessionDatabase,
  config: { pepper: string; rateLimitKey: string; idempotencyKey: string },
) {
  if (
    !isPin(input.newPin) ||
    input.newPin !== input.newPinConfirm ||
    (mode === 'normal' && !isPin(input.currentPin))
  )
    throw new AuthServiceError(400, 'VALIDATION_ERROR');
  const current = await db.resolveSession(tokenHash);
  if (mode === 'reset' && !current.profile.mustChangePin)
    throw new AuthServiceError(409, 'RESET_NOT_REQUIRED');
  if (mode === 'normal' && current.profile.mustChangePin)
    throw new AuthServiceError(403, 'PIN_CHANGE_REQUIRED');
  const normalized = normalizeNickname(current.profile.nickname);
  if (!normalized) throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
  const reservation = await reserveUserAttempt(
    'change_pin',
    normalized.nicknameKey,
    source,
    db,
    config,
  );
  let completed = false;
  async function finish(outcome: 'success' | 'failure' | 'system_error') {
    const accepted = await db.complete(reservation.attemptId, outcome);
    completed = true;
    return accepted;
  }
  try {
    const account = await db.findAccountById(current.profile.id);
    if (!account) throw new AuthServiceError(401, 'UNAUTHORIZED');
    if (
      mode === 'normal' &&
      !(await verifyPin(input.currentPin as string, account.credential, config.pepper))
    ) {
      await finish('failure');
      throw new AuthServiceError(400, 'CURRENT_PIN_INVALID');
    }
    if (await verifyPin(input.newPin, account.credential, config.pepper)) {
      await finish('failure');
      throw new AuthServiceError(400, 'PIN_UNCHANGED');
    }
    const credential = await hashPin(input.newPin, config.pepper);
    if (!(await finish('success'))) throw new AuthServiceError(401, 'AUTH_ATTEMPT_EXPIRED');
    const { token, tokenHash: newTokenHash } = createSessionToken();
    const session = await db.replacePin(
      mode,
      tokenHash,
      account.credentialVersion,
      credential,
      newTokenHash,
    );
    return {
      token,
      expiresAt: session.expiresAt,
      profile: { ...current.profile, mustChangePin: false },
    };
  } catch (error) {
    if (!completed) {
      try {
        await finish('system_error');
      } catch {
        /* DB 예약 만료로 정리한다. */
      }
    }
    if (error instanceof AuthServiceError) throw error;
    throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
  }
}
