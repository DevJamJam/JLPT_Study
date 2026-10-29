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

test('실제 서버는 가입 경로의 GET을405로 차단한다', async ({ request }) => {
  expect((await request.get('/api/auth/join')).status()).toBe(405);
  expect((await request.get('/api/me/emoji')).status()).toBe(405);
  expect((await request.post('/api/me/emoji', { data: { emoji: '🐱' } })).status()).toBe(405);
});

test('기록 API의 실제 라우트는 무인증 조회와 지원하지 않는 메서드를 거부한다', async ({
  request,
}) => {
  for (const path of [
    '/api/records?scope=mine&month=2026-09',
    '/api/records/46000000-0000-4000-8000-000000000003',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    expect(response.headers()['cache-control']).toContain('no-store');
  }
  expect((await request.patch('/api/records', { data: {} })).status()).toBe(405);
});
