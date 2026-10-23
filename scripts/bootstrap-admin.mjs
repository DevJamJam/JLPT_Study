// 서버/운영자 전용 명령. 브라우저나 공개 HTTP 경로에서 실행하지 않는다.
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const scrypt = promisify(scryptCallback);
export const ADMIN_SCRYPT_PARAMS = Object.freeze({
  algorithm: 'scrypt',
  N: 32768,
  r: 8,
  p: 3,
  dkLen: 32,
});
const fail = () => new Error('ADMIN_BOOTSTRAP_FAILED');

export async function bootstrapAdmin(env, transport = fetch) {
  try {
    const base = new URL(env.SUPABASE_URL);
    const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.pathname !== '/' ||
      base.search ||
      base.hash ||
      !key
    )
      throw fail();
    const headers = { apikey: key };
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    async function request(path, options = {}) {
      const response = await transport(new URL(`/rest/v1/${path}`, base), {
        ...options,
        headers: { ...headers, ...options.headers },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw fail();
      return response.json();
    }
    // 기존 비밀정보를 읽지 않는다. 초기 비밀번호 설정을 제거한 뒤에도 재실행할 수 있다.
    const query = 'admin_accounts?select=id&singleton=eq.true&limit=1';
    const existing = await request(query);
    if (!Array.isArray(existing) || existing.length > 1) throw fail();
    const validId = (row) =>
      row &&
      typeof row.id === 'string' &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.id);
    if (existing.length) {
      if (!validId(existing[0])) throw fail();
      return { status: 'already_exists' };
    }
    const loginId = env.ADMIN_LOGIN_ID;
    const password = env.ADMIN_INITIAL_PASSWORD;
    if (
      typeof loginId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(loginId) ||
      typeof password !== 'string' ||
      [...password].length < 12 ||
      [...password].length > 128 ||
      /[\p{Cc}\p{Cf}]/u.test(password)
    )
      throw fail();
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, ADMIN_SCRYPT_PARAMS.dkLen, {
      N: ADMIN_SCRYPT_PARAMS.N,
      r: ADMIN_SCRYPT_PARAMS.r,
      p: ADMIN_SCRYPT_PARAMS.p,
      maxmem: 64 * 1024 * 1024,
    });
    // singleton UNIQUE로 동시 실행도 한 계정만 생성한다. 기존 행은 갱신하지 않는다.
    const inserted = await request('admin_accounts?on_conflict=singleton&select=id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify({
        singleton: true,
        login_id: loginId,
        password_hash: derived.toString('hex'),
        salt: salt.toString('base64'),
        hash_params: ADMIN_SCRYPT_PARAMS,
      }),
    });
    if (!Array.isArray(inserted) || inserted.length > 1) throw fail();
    if (inserted.length) {
      if (!validId(inserted[0])) throw fail();
      return { status: 'created' };
    }
    const winner = await request(query);
    if (!Array.isArray(winner) || winner.length !== 1 || !validId(winner[0])) throw fail();
    return { status: 'already_exists' };
  } catch {
    // 키·비밀번호·DB 오류 원문을 로그나 호출자에 전달하지 않는다.
    throw fail();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await bootstrapAdmin(process.env);
    console.log(
      result.status === 'created'
        ? '관리자 계정을 생성했습니다.'
        : '관리자 계정이 이미 있습니다. 변경하지 않았습니다.',
    );
  } catch {
    console.error('ADMIN_BOOTSTRAP_FAILED: 서버 연결·관리자 환경변수를 확인하세요.');
    process.exitCode = 1;
  }
}
