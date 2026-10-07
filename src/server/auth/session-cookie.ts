export type SessionMode = 'normal' | 'change_pin';
export const SESSION_SECONDS = { normal: 30 * 24 * 60 * 60, change_pin: 15 * 60 } as const;

/** DB expires_atと同じ時刻を渡す。読み取りや活動で有効期限を延長しない。 */
export function sessionCookie(expiresAt: Date, production = true) {
  return {
    name: production ? '__Host-jlpt_session' : 'jlpt_dev_session',
    options: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax' as const,
      path: '/',
      expires: expiresAt,
    },
  };
}
