import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { loadAuthConfig } from '../auth/config';
import { createSessionToken, hashPin, hashSessionToken, SCRYPT_PARAMS } from '../auth/crypto';
import { failure, json, tokenHash, trustedAuthSource } from '../auth/http';
import { readMutationJson } from '../auth/request-guard';
import { AuthServiceError } from '../auth/service';
import { createDatabaseRequest } from '../database';
import { createRecordDatabase } from '../records/database';
import { isTimestamp, isUuid } from '../records/query';
import { normalizeNickname, isProfileEmoji } from '../../features/auth/validation';

const invalid = () => new AuthServiceError(400, 'VALIDATION_ERROR');
const unavailable = () => new AuthServiceError(503, 'AUTH_UNAVAILABLE');
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function adminCookieName(production: boolean) {
  return production ? '__Host-jlpt_admin_session' : 'jlpt_dev_admin_session';
}

export function adminTokenHash(request: NextRequest, production: boolean) {
  const value = request.cookies.get(adminCookieName(production))?.value;
  if (!value) return null;
  try {
    return hashSessionToken(value);
  } catch {
    return null;
  }
}

export function adminFromRow(row: unknown) {
  if (
    !object(row) ||
    !isUuid(row.id) ||
    typeof row.loginId !== 'string' ||
    !/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]{1,63}$/u.test(row.loginId) ||
    !isTimestamp(row.expiresAt)
  )
    throw unavailable();
  return { id: row.id, loginId: row.loginId, expiresAt: row.expiresAt };
}

/** Bounded, asynchronous scrypt compatible with the existing bootstrap command. */
export async function verifyAdminPassword(password: string, row: unknown) {
  const valid =
    object(row) &&
    typeof row.password_hash === 'string' &&
    /^[0-9a-f]{64}$/.test(row.password_hash) &&
    typeof row.salt === 'string' &&
    /^[A-Za-z0-9+/]{22}==$/.test(row.salt) &&
    object(row.hash_params) &&
    Object.entries(SCRYPT_PARAMS).every(
      ([key, value]) => (row.hash_params as Record<string, unknown>)[key] === value,
    );
  const salt = valid ? Buffer.from(row.salt as string, 'base64') : Buffer.alloc(16);
  const derived = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
  return (
    timingSafeEqual(
      derived,
      valid ? Buffer.from(row.password_hash as string, 'hex') : Buffer.alloc(32),
    ) && valid
  );
}

type Action =
  | 'login'
  | 'me'
  | 'logout'
  | 'categories'
  | 'createCategory'
  | 'updateCategory'
  | 'deleteCategory'
  | 'members'
  | 'removeMember'
  | 'resetPin';

export function createAdminHttp(
  env: Record<string, string | undefined>,
  transport: typeof fetch = fetch,
) {
  const production = env.NODE_ENV === 'production';
  const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/' };
  async function handle(action: Action, request: NextRequest, id?: string) {
    try {
      const hash = adminTokenHash(request, production);
      if (action !== 'login' && !hash) {
        if (tokenHash(request, production)) throw new AuthServiceError(403, 'FORBIDDEN');
        throw new AuthServiceError(401, 'UNAUTHORIZED');
      }
      const config = loadAuthConfig(env);
      const body = !['me', 'categories', 'members'].includes(action)
        ? await readMutationJson(request, config.appOrigin)
        : {};
      const db = createDatabaseRequest(config, transport);
      const mac = (namespace: string, value: unknown, key = config.rateLimitKey) =>
        createHmac('sha256', key)
          .update(JSON.stringify([namespace, value]))
          .digest('hex');
      if (action === 'login') {
        if (
          typeof body.loginId !== 'string' ||
          !/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]{1,63}$/u.test(body.loginId) ||
          typeof body.password !== 'string' ||
          [...body.password].length < 12 ||
          [...body.password].length > 128 ||
          /[\p{Cc}\p{Cf}]/u.test(body.password)
        )
          throw invalid();
        const reserved = await db('rpc/reserve_auth_attempt', {
          p_kind: 'admin_login',
          p_nickname_hmac: mac('jlpt-admin-login:v1', body.loginId),
          p_source_hmac: mac('jlpt-source:v1', trustedAuthSource(request, env)),
        });
        if (!object(reserved)) throw unavailable();
        if (reserved.allowed === false && isTimestamp(reserved.retryAt))
          throw new AuthServiceError(429, 'AUTH_RATE_LIMITED', reserved.retryAt);
        if (reserved.allowed !== true || !isUuid(reserved.attemptId)) throw unavailable();
        let completed = false;
        try {
          const rows = await db(
            `admin_accounts?${new URLSearchParams({
              select: 'id,login_id,password_hash,salt,hash_params,credential_version',
              login_id: `eq.${body.loginId}`,
              limit: '1',
            })}`,
          );
          if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
          const account: unknown = rows[0];
          const verified = await verifyAdminPassword(body.password, account);
          const accepted = await db('rpc/complete_auth_attempt', {
            p_id: reserved.attemptId,
            p_outcome: verified ? 'success' : 'failure',
          });
          completed = true;
          if (
            !verified ||
            !object(account) ||
            !isUuid(account.id) ||
            !Number.isSafeInteger(account.credential_version) ||
            account.login_id !== body.loginId
          )
            throw new AuthServiceError(401, 'INVALID_CREDENTIALS');
          if (accepted !== true) throw new AuthServiceError(401, 'AUTH_ATTEMPT_EXPIRED');
          const session = createSessionToken();
          const admin = adminFromRow(
            await db('rpc/create_admin_session', {
              p_admin_id: account.id,
              p_version: account.credential_version,
              p_token_hash: session.tokenHash,
            }),
          );
          const response = json({ data: { admin } });
          response.cookies.set(adminCookieName(production), session.token, {
            ...cookieOptions,
            expires: new Date(admin.expiresAt),
          });
          return response;
        } catch (error) {
          if (!completed)
            await db('rpc/complete_auth_attempt', {
              p_id: reserved.attemptId,
              p_outcome: 'system_error',
            }).catch(() => {});
          throw error;
        }
      }
      if (action === 'logout') {
        if ((await db('rpc/revoke_admin_session', { p_token_hash: hash })) !== true)
          throw unavailable();
        const response = json({ data: { loggedOut: true } });
        response.cookies.set(adminCookieName(production), '', {
          ...cookieOptions,
          expires: new Date(0),
        });
        return response;
      }
      const admin = adminFromRow(await db('rpc/resolve_admin_session', { p_token_hash: hash }));
      if (action === 'me') return json({ data: { admin } });
      if (action === 'categories')
        return json({
          data: { categories: await createRecordDatabase(config, transport).listCategories() },
        });
      if (['createCategory', 'updateCategory', 'deleteCategory'].includes(action)) {
        const categoryId = action === 'createCategory' ? body.id : id;
        if (!isUuid(categoryId)) throw invalid();
        const name = typeof body.name === 'string' ? body.name.trim().normalize('NFC') : null;
        if (
          action !== 'deleteCategory' &&
          (!name || [...name].length > 20 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name))
        )
          throw invalid();
        if (action !== 'createCategory' && typeof body.expectedName !== 'string') throw invalid();
        const result = await db('rpc/manage_category', {
          p_token_hash: hash,
          p_action:
            action === 'createCategory'
              ? 'create'
              : action === 'updateCategory'
                ? 'update'
                : 'delete',
          p_id: categoryId,
          p_name: name,
          p_expected_name: body.expectedName ?? null,
        });
        if (!object(result)) throw unavailable();
        if (action === 'deleteCategory') {
          if (result.deleted !== true) throw unavailable();
          return json({ data: { deleted: true } });
        }
        if (result.id !== categoryId || result.name !== name) throw unavailable();
        return json({ data: { category: { id: categoryId, name } } });
      }
      if (action === 'members') {
        const members = await db('rpc/list_admin_members', { p_token_hash: hash });
        if (
          !Array.isArray(members) ||
          members.length > 15 ||
          members.some(
            (m) =>
              !object(m) ||
              !isUuid(m.id) ||
              !normalizeNickname(m.nickname) ||
              !isProfileEmoji(m.emoji) ||
              !isTimestamp(m.joinedAt) ||
              !Number.isSafeInteger(m.credentialVersion) ||
              (m.credentialVersion as number) < 1,
          )
        )
          throw unavailable();
        return json({
          data: {
            members: members.map((m) => ({
              id: m.id,
              nickname: m.nickname,
              emoji: m.emoji,
              joinedAt: m.joinedAt,
              credentialVersion: m.credentialVersion,
            })),
          },
        });
      }
      if (
        !isUuid(id) ||
        !Number.isSafeInteger(body.expectedCredentialVersion) ||
        (body.expectedCredentialVersion as number) < 1
      )
        throw invalid();
      if (action === 'removeMember') {
        const deleted = await db('rpc/remove_admin_member', {
          p_token_hash: hash,
          p_user_id: id,
          p_expected_version: body.expectedCredentialVersion,
        });
        if (deleted !== true) throw unavailable();
        return json({ data: { deleted: true } });
      }
      if (!isUuid(body.requestId)) throw invalid();
      const members = await db('rpc/list_admin_members', { p_token_hash: hash });
      if (!Array.isArray(members)) throw unavailable();
      const member = members.find((m) => object(m) && m.id === id);
      const nickname = normalizeNickname(member?.nickname);
      if (!nickname) throw new AuthServiceError(404, 'NOT_FOUND');
      const credential = await hashPin('0000', config.pepper);
      const reset = await db('rpc/reset_admin_member_pin', {
        p_token_hash: hash,
        p_user_id: id,
        p_expected_version: body.expectedCredentialVersion,
        p_request_id: body.requestId,
        p_fingerprint: mac(
          'jlpt-admin-reset:v1',
          [admin.id, id, body.expectedCredentialVersion, body.requestId],
          config.idempotencyKey,
        ),
        p_pin_hash: credential.hash,
        p_salt: credential.salt,
        p_hash_params: credential.params,
        p_nickname_hmac: mac('jlpt-user-nickname:v1', nickname.nicknameKey),
      });
      if (reset !== true) throw unavailable();
      return json({ data: { reset: true } });
    } catch (error) {
      const response = failure(error);
      if (response.status === 401 && action !== 'login')
        response.cookies.set(adminCookieName(production), '', {
          ...cookieOptions,
          expires: new Date(0),
        });
      return response;
    }
  }
  return {
    login: (r: NextRequest) => handle('login', r),
    me: (r: NextRequest) => handle('me', r),
    logout: (r: NextRequest) => handle('logout', r),
    categories: (r: NextRequest) => handle('categories', r),
    createCategory: (r: NextRequest) => handle('createCategory', r),
    updateCategory: (r: NextRequest, id: string) => handle('updateCategory', r, id),
    deleteCategory: (r: NextRequest, id: string) => handle('deleteCategory', r, id),
    members: (r: NextRequest) => handle('members', r),
    removeMember: (r: NextRequest, id: string) => handle('removeMember', r, id),
    resetPin: (r: NextRequest, id: string) => handle('resetPin', r, id),
  };
}
