export type SessionMode = 'normal' | 'change_pin';
export const SESSION_SECONDS = { normal: 30 * 24 * 60 * 60, change_pin: 15 * 60 } as const;

/** DB expires_at과 같은 시각을 전달한다. 조회·활동으로 만료를 연장하지 않는다. */
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
