import type { loadAuthConfig } from './auth/config';
import { AuthServiceError } from './auth/service';

const unavailable = () => new AuthServiceError(503, 'AUTH_UNAVAILABLE');
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** 서버 전용 REST 전송. 비밀키와 DB 원문은 응답에 포함하지 않는다. */
export function createDatabaseRequest(
  config: Pick<ReturnType<typeof loadAuthConfig>, 'supabaseUrl' | 'serviceRoleKey'>,
  transport: typeof fetch = fetch,
  observeRequest?: (milliseconds: number) => void,
) {
  return async function request(path: string, body?: Record<string, unknown>): Promise<unknown> {
    const started = performance.now();
    try {
      const headers: Record<string, string> = { apikey: config.serviceRoleKey };
      // 새 secret 키는 JWT가 아니다. legacy service_role JWT만 Bearer로 전달한다.
      if (!config.serviceRoleKey.startsWith('sb_secret_'))
        headers.Authorization = `Bearer ${config.serviceRoleKey}`;
      if (body) headers['Content-Type'] = 'application/json';
      const response = await transport(new URL(`/rest/v1/${path}`, config.supabaseUrl), {
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
          RESET_NOT_REQUIRED: 409,
          VALIDATION_ERROR: 400,
          FORBIDDEN: 403,
          NOT_FOUND: 404,
          CONFLICT: 409,
          RECORD_DELETED: 409,
          DAILY_LIMIT_EXCEEDED: 409,
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
    } finally {
      observeRequest?.(performance.now() - started);
    }
  };
}
