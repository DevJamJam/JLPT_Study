export class AuthConfigError extends Error {
  constructor() {
    super('AUTH_NOT_CONFIGURED');
  }
}

export function loadAuthConfig(env: Record<string, string | undefined>) {
  const names = ['PIN_PEPPER', 'RATE_LIMIT_HMAC_KEY', 'IDEMPOTENCY_HMAC_KEY'] as const;
  const secrets = names.map((name) => env[name]);
  if (secrets.some((value) => !value || Buffer.byteLength(value) < 32)) throw new AuthConfigError();
  if (new Set(secrets).size !== secrets.length) throw new AuthConfigError();
  const supabaseUrl = env.SUPABASE_URL;
  const appOrigin = env.APP_ORIGIN;
  const serviceRoleKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !appOrigin || !serviceRoleKey) throw new AuthConfigError();
  try {
    const db = new URL(supabaseUrl);
    const app = new URL(appOrigin);
    if (
      db.protocol !== 'https:' ||
      db.username ||
      db.password ||
      db.search ||
      db.hash ||
      db.pathname !== '/'
    )
      throw new AuthConfigError();
    if (!['http:', 'https:'].includes(app.protocol) || app.origin !== appOrigin)
      throw new AuthConfigError();
    if (env.NODE_ENV === 'production' && app.protocol !== 'https:') throw new AuthConfigError();
  } catch {
    throw new AuthConfigError();
  }
  return {
    supabaseUrl,
    serviceRoleKey,
    appOrigin,
    pepper: secrets[0]!,
    rateLimitKey: secrets[1]!,
    idempotencyKey: secrets[2]!,
  };
}
