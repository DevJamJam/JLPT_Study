import type { PublicAuthData } from './types';

export class AuthClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryAt?: string,
    public readonly currentRecord?: unknown,
  ) {
    super(code);
  }
}
type AuthResponses = {
  login: PublicAuthData;
  join: PublicAuthData;
  me: PublicAuthData;
  logout: { loggedOut: true };
  'change-pin': Pick<PublicAuthData, 'profile'>;
  'complete-reset': Pick<PublicAuthData, 'profile'>;
};
export async function authRequest<Path extends keyof AuthResponses>(
  path: Path,
  body?: unknown,
  signal?: AbortSignal,
) {
  return jsonRequest<AuthResponses[Path]>(`/api/auth/${path}`, body, signal);
}
export function updateProfileEmoji(emoji: string) {
  return jsonRequest<Pick<PublicAuthData, 'profile'>>(
    '/api/me/emoji',
    { emoji },
    undefined,
    'PATCH',
  );
}
export async function jsonRequest<Data>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method?: 'PATCH' | 'DELETE',
) {
  const response = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(15000),
  });
  const json = await response.json();
  if (!response.ok)
    throw new AuthClientError(
      response.status,
      typeof json.error?.code === 'string' ? json.error.code : 'AUTH_UNAVAILABLE',
      json.error?.retryAt,
      json.error?.currentRecord,
    );
  return json.data as Data;
}
export function authErrorMessage(error: unknown) {
  const messages: Record<string, string> = {
    NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.',
    GROUP_FULL: '스터디 정원이 가득 찼어요. 관리자에게 문의해주세요.',
    IDEMPOTENCY_CONFLICT: '가입 요청 내용이 달라졌어요. 입력을 확인해주세요.',
    INVALID_CREDENTIALS: '닉네임 또는 간편 비밀번호를 확인해주세요.',
    VALIDATION_ERROR: '입력한 내용을 확인해주세요.',
    PIN_UNCHANGED: '현재 비밀번호와 다른 새 비밀번호를 입력해주세요.',
    CURRENT_PIN_INVALID: '현재 간편 비밀번호가 올바르지 않아요.',
    PIN_CHANGE_REQUIRED: '초기화된 비밀번호를 먼저 변경해주세요.',
    RESET_NOT_REQUIRED: '이미 비밀번호 변경을 마쳤어요. 다시 로그인해주세요.',
    AUTH_ATTEMPT_EXPIRED: '요청 시간이 지났어요. 다시 시도해주세요.',
  };
  if (error instanceof AuthClientError) {
    if (error.code === 'AUTH_RATE_LIMITED') {
      const date = error.retryAt ? new Date(error.retryAt) : null;
      const time =
        date && Number.isFinite(date.getTime())
          ? ` ${date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 이후 다시 시도하거나`
          : ' 잠시 후 다시 시도하거나';
      return `인증 시도가 많아요.${time} 관리자에게 문의해주세요.`;
    }
    if (Object.hasOwn(messages, error.code)) return messages[error.code];
  }
  return '연결을 확인하고 다시 시도해주세요. 입력한 내용은 그대로 남아 있어요.';
}
