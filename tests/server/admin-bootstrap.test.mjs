import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { bootstrapAdmin, ADMIN_SCRYPT_PARAMS } from '../../scripts/bootstrap-admin.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  ADMIN_LOGIN_ID: 'jlpt-admin',
  ADMIN_INITIAL_PASSWORD: 'example-only-password',
};

test('생성은 무작위 salt와 실제 scrypt를 사용하고 평문을 전송하지 않는다', async () => {
  const salts = [];
  for (let i = 0; i < 2; i++) {
    const calls = [];
    const result = await bootstrapAdmin(env, async (url, options) => {
      calls.push({ url: String(url), options });
      return Response.json(options.method === 'POST' ? [{ id }] : []);
    });
    assert.deepEqual(result, { status: 'created' });
    const { options, url } = calls[1];
    const body = JSON.parse(options.body);
    assert.equal(body.singleton, true);
    assert.equal(body.login_id, env.ADMIN_LOGIN_ID);
    assert.equal(options.body.includes(env.ADMIN_INITIAL_PASSWORD), false);
    assert.equal(new URL(url).searchParams.get('on_conflict'), 'singleton');
    assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(body.hash_params, ADMIN_SCRYPT_PARAMS);
    const hash = scryptSync(env.ADMIN_INITIAL_PASSWORD, Buffer.from(body.salt, 'base64'), 32, {
      N: 32768,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    });
    assert.equal(body.password_hash, hash.toString('hex'));
    salts.push(body.salt);
  }
  assert.notEqual(salts[0], salts[1]);
});

test('기존 계정은 초기 비밀번호 없이 확인만 하고 변경하지 않는다', async () => {
  let count = 0;
  assert.deepEqual(
    await bootstrapAdmin({ ...env, ADMIN_INITIAL_PASSWORD: undefined }, async (url, options) => {
      count++;
      assert.equal(options.method, undefined);
      assert.equal(new URL(url).searchParams.get('select'), 'id');
      return Response.json([{ id }]);
    }),
    { status: 'already_exists' },
  );
  assert.equal(count, 1);
});

test('동시 실행도 충돌 시 기존 계정을 갱신하지 않는다', async () => {
  let stored;
  let inserts = 0;
  let reads = 0;
  const transport = async (_url, options) => {
    if (options.method !== 'POST') {
      reads++;
      return Response.json(reads <= 2 ? [] : [{ id }]);
    }
    inserts++;
    if (stored) return Response.json([]);
    stored = JSON.parse(options.body);
    return Response.json([{ id }]);
  };
  const results = await Promise.all([
    bootstrapAdmin(env, transport),
    bootstrapAdmin({ ...env, ADMIN_INITIAL_PASSWORD: 'a-different-password' }, transport),
  ]);
  assert.equal(inserts, 2);
  assert.deepEqual(results.map((x) => x.status).sort(), ['already_exists', 'created']);
  assert.equal(stored.login_id, env.ADMIN_LOGIN_ID);
});

test('잘못된 설정·응답·연결 오류에는 비밀값을 포함하지 않는다', async () => {
  for (const override of [
    { ADMIN_INITIAL_PASSWORD: 'short' },
    { ADMIN_LOGIN_ID: ' bad ' },
    { SUPABASE_URL: 'http://example.com' },
  ]) {
    await assert.rejects(
      bootstrapAdmin({ ...env, ...override }, async () => Response.json([])),
      { message: 'ADMIN_BOOTSTRAP_FAILED' },
    );
  }
  for (const transport of [
    async () => {
      throw new Error(env.SUPABASE_SECRET_KEY);
    },
    async () => Response.json({ detail: env.ADMIN_INITIAL_PASSWORD }, { status: 500 }),
    async () => Response.json({ unexpected: true }),
  ]) {
    await assert.rejects(bootstrapAdmin(env, transport), { message: 'ADMIN_BOOTSTRAP_FAILED' });
  }
});
