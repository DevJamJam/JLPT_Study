import { randomBytes, randomInt, randomUUID } from 'node:crypto';

if (!process.argv.includes('--allow-production-fixture')) {
  throw new Error('Explicit production fixture flag required');
}
const origin = 'https://jlpt-study-gamma.vercel.app';
const fixture = { requestId: randomUUID(), nickname: `측정${randomBytes(4).toString('hex')}` };
const pin = String(randomInt(10000)).padStart(4, '0');
let newPin;
do {
  newPin = String(randomInt(10000)).padStart(4, '0');
} while (newPin === pin);
const cookies = new Set();
const measurements = [];
console.log(JSON.stringify({ fixture }));
function assert(value, code) {
  if (!value) throw new Error(code);
}
async function request(path, method, body, cookie) {
  const start = performance.now();
  const response = await fetch(`${origin}/api/${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  const nextCookie = response.headers.get('set-cookie')?.split(';')[0];
  if (nextCookie && !nextCookie.endsWith('=')) cookies.add(nextCookie);
  const row = {
    path,
    status: response.status,
    totalMs: Math.round(performance.now() - start),
    timing: response.headers.get('server-timing'),
    region: response.headers.get('x-vercel-id')?.split('::').slice(0, -1).join('::'),
  };
  measurements.push(row);
  console.log(JSON.stringify(row));
  return { status: response.status, data: json.data, cookie: nextCookie };
}
let success = false;
try {
  const joined = await request('auth/join', 'POST', {
    ...fixture,
    pin,
    pinConfirm: pin,
    emoji: '🐰',
  });
  if (joined.data?.profile?.id) {
    fixture.userId = joined.data.profile.id;
    console.log(JSON.stringify({ fixture }));
  }
  assert(joined.status === 201 && joined.cookie, 'JOIN_FAILED');
  for (let i = 0; i < 3; i++) {
    const login = await request('auth/login', 'POST', { nickname: fixture.nickname, pin });
    assert(
      login.status === 200 && login.data?.profile?.id === fixture.userId && login.cookie,
      'LOGIN_FAILED',
    );
  }
  for (let i = 0; i < 3; i++) {
    const me = await request('auth/me', 'GET', undefined, joined.cookie);
    assert(me.status === 200 && me.data?.profile?.id === fixture.userId, 'ME_FAILED');
  }
  for (const emoji of ['🐱', '🐰', '🐱']) {
    const update = await request('me/emoji', 'PATCH', { emoji }, joined.cookie);
    assert(update.status === 200 && update.data?.profile?.emoji === emoji, 'EMOJI_FAILED');
  }
  const changed = await request(
    'auth/change-pin',
    'POST',
    { currentPin: pin, newPin, newPinConfirm: newPin },
    joined.cookie,
  );
  assert(changed.status === 200 && changed.cookie, 'PIN_CHANGE_FAILED');
  assert(
    (await request('auth/me', 'GET', undefined, joined.cookie)).status === 401,
    'OLD_SESSION_ACCEPTED',
  );
  assert(
    (await request('auth/me', 'GET', undefined, changed.cookie)).status === 200,
    'NEW_SESSION_REJECTED',
  );
  success = true;
} catch (error) {
  console.log(
    JSON.stringify({ failure: error?.name === 'TimeoutError' ? 'TIMEOUT' : 'AUTH_FLOW_FAILED' }),
  );
} finally {
  for (const cookie of cookies) {
    try {
      assert((await request('auth/logout', 'POST', {}, cookie)).status === 200, 'LOGOUT_FAILED');
    } catch {
      success = false;
      console.log(JSON.stringify({ failure: 'LOGOUT_FAILED' }));
    }
  }
  console.log(JSON.stringify({ success, cleanupRequired: true, fixture }));
}
if (!success) process.exitCode = 1;
