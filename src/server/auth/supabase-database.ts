import type { loadAuthConfig } from './config';
import { SCRYPT_PARAMS } from './crypto';
import { PROFILE_EMOJIS, normalizeNickname } from '../../features/auth/validation';
import { AuthServiceError, type AuthAccount, type AuthDatabase } from './service';

const unavailable = () => new AuthServiceError(503, 'AUTH_UNAVAILABLE');
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export type PublicAuthData = {
  profile: { id: string; nickname: string; emoji: string; mustChangePin: boolean };
  group: { id: string; name: string; maxMembers: 15; memberCount: number };
};
export type UserSessionDatabase = AuthDatabase & {
  resolveSession(tokenHash: string): Promise<PublicAuthData>;
  revokeSession(tokenHash: string): Promise<void>;
};

/** 서버 전용 진입점을 통해 사용한다. groupId는 서버 설정이며 요청 body에서 받지 않는다. */
export function createSupabaseAuthDatabase(
  config: Pick<ReturnType<typeof loadAuthConfig>, 'supabaseUrl' | 'serviceRoleKey'>,
  groupId?: string,
  transport: typeof fetch = fetch,
): UserSessionDatabase {
  const base = new URL(config.supabaseUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !config.serviceRoleKey ||
    (groupId !== undefined && !uuid(groupId))
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
          PIN_CHANGE_REQUIRED: 403,
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
      let targetGroupId = groupId;
      if (!targetGroupId) {
        // 미리 생성된 단일 스터디만 허용한다. 요청 body의 그룹은 사용하지 않는다.
        const groups = await request('study_groups?select=id&limit=2');
        if (
          !Array.isArray(groups) ||
          groups.length !== 1 ||
          !object(groups[0]) ||
          !uuid(groups[0].id)
        )
          throw unavailable();
        targetGroupId = groups[0].id;
      }
      const value = await rpc('complete_join_result', {
        p_group_id: targetGroupId,
        p_request_id: input.requestId,
        p_fingerprint: fingerprint,
        p_nickname: input.nickname,
        p_nickname_key: input.nicknameKey,
        p_emoji: input.emoji,
        p_pin_hash: credential.hash,
        p_salt: credential.salt,
        p_hash_params: credential.params,
      });
      if (!object(value) || !uuid(value.userId) || typeof value.created !== 'boolean')
        throw unavailable();
      return { userId: value.userId, created: value.created };
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
    async resolveSession(tokenHash) {
      const rows = await rpc('resolve_user_session', {
        p_token_hash: tokenHash,
        p_allow_change_pin: true,
      });
      if (!Array.isArray(rows) || rows.length !== 1) throw unavailable();
      const row: unknown = rows[0];
      if (
        !object(row) ||
        !uuid(row.user_id) ||
        !uuid(row.group_id) ||
        !normalizeNickname(row.nickname) ||
        typeof row.emoji !== 'string' ||
        !PROFILE_EMOJIS.some((emoji) => emoji === row.emoji) ||
        typeof row.must_change_pin !== 'boolean' ||
        !timestamp(row.expires_at)
      )
        throw unavailable();
      const groupQuery = new URLSearchParams({
        select: 'id,name,max_members',
        id: `eq.${row.group_id}`,
        limit: '1',
      });
      const groups = await request(`study_groups?${groupQuery}`);
      if (!Array.isArray(groups) || groups.length !== 1) throw unavailable();
      const group: unknown = groups[0];
      if (
        !object(group) ||
        group.id !== row.group_id ||
        typeof group.name !== 'string' ||
        !group.name.trim() ||
        group.max_members !== 15
      )
        throw unavailable();
      const memberQuery = new URLSearchParams({
        select: 'user_id',
        group_id: `eq.${row.group_id}`,
        limit: '16',
      });
      const members = await request(`group_members?${memberQuery}`);
      if (
        !Array.isArray(members) ||
        members.length < 1 ||
        members.length > 15 ||
        members.some((member) => !object(member) || !uuid(member.user_id))
      )
        throw unavailable();
      if (!members.some((member) => member.user_id === row.user_id))
        throw new AuthServiceError(401, 'UNAUTHORIZED');
      return {
        profile: {
          id: row.user_id,
          nickname: row.nickname as string,
          emoji: row.emoji,
          mustChangePin: row.must_change_pin,
        },
        group: { id: row.group_id, name: group.name, maxMembers: 15, memberCount: members.length },
      };
    },
    async revokeSession(tokenHash) {
      if ((await rpc('revoke_user_session', { p_token_hash: tokenHash })) !== true)
        throw unavailable();
    },
  };
}
