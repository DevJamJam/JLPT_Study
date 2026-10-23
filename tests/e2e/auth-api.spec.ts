import { test, expect } from '@playwright/test';

test('실제 서버는 인증 경로를 제공하고 무효 사용자 쿠키를 거부한다', async ({ request }) => {
  for (const cookie of [
    '',
    '__Host-jlpt_admin_session=' + 'a'.repeat(43),
    '__Host-jlpt_session=bad',
  ]) {
    const response = await request.get('/api/auth/me', { headers: { cookie } });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['set-cookie']).toContain('__Host-jlpt_session=;');
  }
  expect((await request.get('/api/auth/login')).status()).toBe(405);
  expect((await request.get('/api/auth/logout')).status()).toBe(405);
});
