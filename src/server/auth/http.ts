import { isProfileEmoji } from '../../features/auth/validation';
import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { AuthConfigError, loadAuthConfig } from './config';
import { changePin } from './change-pin';
import { hashSessionToken } from './crypto';
import { RequestGuardError, readMutationJson } from './request-guard';
import { authenticate, AuthServiceError } from './service';
import { sessionCookie } from './session-cookie';
import { createSupabaseAuthDatabase } from './supabase-database';

type Environment = Record<string, string | undefined>;
const messages: Record<string, string> = {
  VALIDATION_ERROR: '닉네임과 네 자리 PIN을 확인해주세요.',
  GROUP_FULL: '스터디 정원이 가득 찼어요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요.',
  IDEMPOTENCY_CONFLICT: '가입 요청 내용이 바뀌었어요. 새 요청으로 다시 시도해주세요.',
  INVALID_CREDENTIALS: '닉네임 또는 PIN이 올바르지 않아요.',
  UNAUTHORIZED: '다시 로그인해주세요.',
  RESET_NOT_REQUIRED: '비밀번호 초기화 상태가 아니에요.',
  PIN_UNCHANGED: '현재 비밀번호와 다른 새 비밀번호를 입력해주세요.',
  CURRENT_PIN_INVALID: '현재 간편 비밀번호를 확인해주세요.',
  PIN_CHANGE_REQUIRED: '초기화된 비밀번호를 먼저 변경해주세요.',
  AUTH_ATTEMPT_EXPIRED: '로그인 요청이 만료되었어요. 다시 시도해주세요.',
  AUTH_RATE_LIMITED: '인증 시도가 많아요. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.',
  ORIGIN_NOT_ALLOWED: '허용되지 않은 요청이에요.',
  JSON_REQUIRED: 'JSON 형식으로 요청해주세요.',
  INVALID_JSON: '요청 내용을 확인해주세요.',
  INVALID_CONTENT_LENGTH: '요청 크기가 올바르지 않아요.',
  BODY_TOO_LARGE: '요청 내용이 너무 커요.',
  AUTH_NOT_CONFIGURED: '인증 설정을 확인 중이에요.',
  AUTH_UNAVAILABLE: '인증 서비스를 잠시 이용할 수 없어요.',
  FORBIDDEN: '허용되지 않은 요청이에요.',
  NOT_FOUND: '기록을 찾을 수 없어요.',
  CONFLICT: '기록이 변경되었어요. 다시 확인해주세요.',
  RECORD_DELETED: '이미 삭제된 기록이에요.',
  DAILY_LIMIT_EXCEEDED: '하루 공부 시간은 1440분을 넘을 수 없어요.',
};

/** Vercel에서 덮어쓰는 출처만 신뢰한다. 다른 호스팅은 별도 어댑터가 필요하다. */
export function trustedAuthSource(request: Request, env: Environment) {
  if (env.VERCEL === '1') {
    const ip = request.headers.get('x-vercel-forwarded-for')?.trim();
    if (ip && isIP(ip)) {
      return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
    }
  } else if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    // 로컬 개발은 입력 헤더와 무관하게 하나의 제한 버킷을 사용한다.
    return 'local-development';
  }
  throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function failure(error: unknown) {
  const known = error instanceof AuthServiceError || error instanceof RequestGuardError;
  const code =
    error instanceof AuthConfigError
      ? 'AUTH_NOT_CONFIGURED'
      : known && Object.hasOwn(messages, error.code)
        ? error.code
        : 'AUTH_UNAVAILABLE';
  const response = json(
    {
      error: {
        code,
        message: messages[code],
        ...(error instanceof AuthServiceError && error.retryAt ? { retryAt: error.retryAt } : {}),
      },
    },
    code === 'AUTH_NOT_CONFIGURED' || code === 'AUTH_UNAVAILABLE'
      ? 503
      : known
        ? error.status
        : 503,
  );
  if (error instanceof AuthServiceError && error.status === 429 && error.retryAt) {
    response.headers.set(
      'Retry-After',
      String(Math.max(1, Math.ceil((Date.parse(error.retryAt) - Date.now()) / 1000))),
    );
  }
  return response;
}
export function tokenHash(request: NextRequest, production: boolean) {
  const { name } = sessionCookie(new Date(0), production);
  const value = request.cookies.get(name)?.value;
  if (!value) return null;
  try {
    return hashSessionToken(value);
  } catch {
    return null;
  }
}
export function clearCookie(response: NextResponse, production: boolean) {
  const { name, options } = sessionCookie(new Date(0), production);
  response.cookies.set(name, '', { ...options, maxAge: 0 });
}

/** env·전송 함수 주입은 검사용이다. 라우트는 서버 process.env만 전달한다. */
function createAuthHandlers(
  env: Environment,
  transport: typeof fetch,
  observeRequest: (milliseconds: number) => void,
) {
  const production = env.NODE_ENV === 'production';
  async function auth(kind: 'login' | 'join', request: NextRequest) {
    try {
      const config = loadAuthConfig(env);
      const body = await readMutationJson(request, config.appOrigin);
      const source = trustedAuthSource(request, env);
      const db = createSupabaseAuthDatabase(config, undefined, transport, observeRequest);
      const session = await authenticate(kind, body, source, db, config);
      const hash = hashSessionToken(session.token)!;
      const data = await db.resolveSession(hash);
      const response = json({ data }, kind === 'join' && session.created ? 201 : 200);
      const { name, options } = sessionCookie(new Date(session.expiresAt), production);
      response.cookies.set(name, session.token, options);
      return response;
    } catch (error) {
      return failure(error);
    }
  }
  async function updatePin(mode: 'reset' | 'normal', request: NextRequest) {
    try {
      const config = loadAuthConfig(env);
      const body = await readMutationJson(request, config.appOrigin);
      const hash = tokenHash(request, production);
      if (!hash) throw new AuthServiceError(401, 'UNAUTHORIZED');
      const db = createSupabaseAuthDatabase(config, undefined, transport, observeRequest);
      const result = await changePin(mode, body, hash, trustedAuthSource(request, env), db, config);
      const response = json({ data: { profile: result.profile } });
      const { name, options } = sessionCookie(new Date(result.expiresAt), production);
      response.cookies.set(name, result.token, options);
      return response;
    } catch (error) {
      const response = failure(error);
      if (response.status === 401) clearCookie(response, production);
      return response;
    }
  }
  return {
    login: (request: NextRequest) => auth('login', request),
    join: (request: NextRequest) => auth('join', request),
    completeReset: (request: NextRequest) => updatePin('reset', request),
    changePin: (request: NextRequest) => updatePin('normal', request),
    async updateEmoji(request: NextRequest) {
      try {
        const config = loadAuthConfig(env);
        const body = await readMutationJson(request, config.appOrigin);
        const hash = tokenHash(request, production);
        if (!hash) throw new AuthServiceError(401, 'UNAUTHORIZED');
        if (!isProfileEmoji(body.emoji)) throw new AuthServiceError(400, 'VALIDATION_ERROR');
        const db = createSupabaseAuthDatabase(config, undefined, transport, observeRequest);
        return json({ data: { profile: await db.updateEmoji(hash, body.emoji) } });
      } catch (error) {
        const response = failure(error);
        if (response.status === 401) clearCookie(response, production);
        return response;
      }
    },
    async me(request: NextRequest) {
      try {
        const hash = tokenHash(request, production);
        if (!hash) throw new AuthServiceError(401, 'UNAUTHORIZED');
        const db = createSupabaseAuthDatabase(
          loadAuthConfig(env),
          undefined,
          transport,
          observeRequest,
        );
        return json({ data: await db.resolveSession(hash) });
      } catch (error) {
        const response = failure(error);
        if (response.status === 401) clearCookie(response, production);
        return response;
      }
    },
    async logout(request: NextRequest) {
      try {
        const config = loadAuthConfig(env);
        await readMutationJson(request, config.appOrigin);
        const hash = tokenHash(request, production);
        if (hash)
          await createSupabaseAuthDatabase(
            config,
            undefined,
            transport,
            observeRequest,
          ).revokeSession(hash);
        const response = json({ data: { loggedOut: true } });
        clearCookie(response, production);
        return response;
      } catch (error) {
        return failure(error);
      }
    },
  };
}

/** 요청별 숫자 합계만 노출한다. 경로·입력·PIN·쿠키·SQL은 기록하지 않는다. */
export function createAuthHttp(env: Environment, transport: typeof fetch = fetch) {
  type Handlers = ReturnType<typeof createAuthHandlers>;
  const handlers = {} as Handlers;
  const names = Object.keys(createAuthHandlers(env, transport, () => {})) as (keyof Handlers)[];
  for (const name of names) {
    handlers[name] = async (request: NextRequest) => {
      const started = performance.now();
      let dbMilliseconds = 0;
      let dbCalls = 0;
      const response = await createAuthHandlers(env, transport, (milliseconds) => {
        dbMilliseconds += milliseconds;
        dbCalls++;
      })[name](request);
      response.headers.set(
        'Server-Timing',
        `app;dur=${(performance.now() - started).toFixed(1)}, db;dur=${dbMilliseconds.toFixed(1)}, dbcalls;desc="${dbCalls}"`,
      );
      return response;
    };
  }
  return handlers;
}
