import type { loadAuthConfig } from './config';
import { SCRYPT_PARAMS } from './crypto';
import { AuthServiceError, type AuthAccount, type AuthDatabase } from './service';

const unavailable = () => new AuthServiceError(503, 'AUTH_UNAVAILABLE');
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

/** 서버 전용 진입점을 통해 사용한다. groupId는 서버 설정이며 요청 body에서 받지 않는다. */
export function createSupabaseAuthDatabase(
  config: Pick<ReturnType<typeof loadAuthConfig>, 'supabaseUrl' | 'serviceRoleKey'>,
  groupId: string,
  transport: typeof fetch = fetch,
): AuthDatabase {
  const base = new URL(config.supabaseUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !config.serviceRoleKey ||
    !uuid(groupId)
  )
    throw unavailable();

  async function request(path: string, body?: Record<string, unknown>): Promise<unknown> {
    try {
      const headers: Record<string, string> = { apikey: config.serviceRoleKey };
      // 새 secret 키는 JWT가 아니다. legacy service_role JWT만 Bearer로 전달한다.
      if (!config.serviceRoleKey.startsWith('sb_secret_'))
        headers.Authorization = `Bearer ${config.serviceRoleKey}`;
      if (body) headers['Content-Type'] = 'application/json';
      const response = await transport(new URL(`/rest/v1/${path}`, base), {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        // 허용된 DB 업무 오류만 전달하고 SQL·입력·연결 오류의 원문은 차단한다.
        const status: Record<string, number> = {
          GROUP_FULL: 409,
          NICKNAME_TAKEN: 409,
          IDEMPOTENCY_CONFLICT: 409,
          UNAUTHORIZED: 401,
        };
        if (
          object(data) &&
          data.code === 'P0001' &&
          typeof data.message === 'string' &&
          Object.hasOwn(status, data.message)
        )
          throw new AuthServiceError(status[data.message], data.message);
        throw unavailable();
      }
      return data;
    } catch (error) {
      if (error instanceof AuthServiceError) throw error;
      throw unavailable();
    }
  }
  const rpc = (name: string, body: Record<string, unknown>) => request(`rpc/${name}`, body);
  async function findAccountById(id: string): Promise<AuthAccount | null> {
    if (!uuid(id)) throw unavailable();
    const query = new URLSearchParams({
      select: 'user_id,pin_hash,salt,hash_params,credential_version',
      user_id: `eq.${id}`,
      limit: '1',
    });
    const rows = await request(`user_credentials?${query}`);
    if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
    if (!rows.length) return null;
    const row: unknown = rows[0];
    if (
      !object(row) ||
      row.user_id !== id ||
      typeof row.pin_hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(row.pin_hash) ||
      typeof row.salt !== 'string' ||
      !/^[A-Za-z0-9+/]{22}==$/.test(row.salt) ||
      !object(row.hash_params) ||
      Object.entries(SCRYPT_PARAMS).some(
        ([key, value]) =>
          row.hash_params && (row.hash_params as Record<string, unknown>)[key] !== value,
      ) ||
      !Number.isSafeInteger(row.credential_version) ||
      (row.credential_version as number) < 1
    )
      throw unavailable();
    return {
      id,
      credentialVersion: row.credential_version as number,
      credential: { hash: row.pin_hash, salt: row.salt, params: SCRYPT_PARAMS },
    };
  }
  return {
    async reserve(kind, nicknameHmac, sourceHmac) {
      const value = await rpc('reserve_auth_attempt', {
        p_kind: kind,
        p_nickname_hmac: nicknameHmac,
        p_source_hmac: sourceHmac,
      });
      if (!object(value)) throw unavailable();
      if (value.allowed === true && uuid(value.attemptId))
        return { allowed: true, attemptId: value.attemptId };
      if (value.allowed === false && timestamp(value.retryAt))
        return { allowed: false, retryAt: value.retryAt };
      throw unavailable();
    },
    async complete(attemptId, outcome) {
      const value = await rpc('complete_auth_attempt', { p_id: attemptId, p_outcome: outcome });
      if (typeof value !== 'boolean') throw unavailable();
      return value;
    },
    async findAccount(nicknameKey) {
      const query = new URLSearchParams({
        select: 'id',
        nickname_key: `eq.${nicknameKey}`,
        limit: '1',
      });
      const rows = await request(`users?${query}`);
      if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
      if (!rows.length) return null;
      if (!object(rows[0]) || !uuid(rows[0].id)) throw unavailable();
      return findAccountById(rows[0].id);
    },
    findAccountById,
    async join(input, fingerprint, credential) {
      const value = await rpc('complete_join', {
        p_group_id: groupId,
        p_request_id: input.requestId,
        p_fingerprint: fingerprint,
        p_nickname: input.nickname,
        p_nickname_key: input.nicknameKey,
        p_emoji: input.emoji,
        p_pin_hash: credential.hash,
        p_salt: credential.salt,
        p_hash_params: credential.params,
      });
      if (!uuid(value)) throw unavailable();
      return value;
    },
    async createSession(id, expectedVersion, tokenHash) {
      const value = await rpc('create_user_session', {
        p_user_id: id,
        p_expected_credential_version: expectedVersion,
        p_token_hash: tokenHash,
      });
      // composite RPC의 단일 객체 또는 한 행 배열만 허용한다.
      const row: unknown = Array.isArray(value) && value.length === 1 ? value[0] : value;
      if (
        !object(row) ||
        !timestamp(row.expires_at) ||
        (row.mode !== 'normal' && row.mode !== 'change_pin')
      )
        throw unavailable();
      return { expiresAt: row.expires_at, mode: row.mode };
    },
  };
}
