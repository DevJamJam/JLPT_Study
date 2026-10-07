/** HTTP 계약만 검사한다. 세션 인증·DB 시도 예약은 호출자가 별도로 수행한다. */
export class RequestGuardError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

const AUTH_BODY_BYTES = 4096;

export async function readMutationJson(
  request: Request,
  appOrigin: string,
): Promise<Record<string, unknown>> {
  const configured = new URL(appOrigin);
  if (!['http:', 'https:'].includes(configured.protocol) || configured.origin !== appOrigin) {
    throw new Error('APP_ORIGIN must be an HTTP origin');
  }
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    throw new RequestGuardError(405, 'METHOD_NOT_ALLOWED');
  }
  if (request.headers.get('origin') !== appOrigin) {
    throw new RequestGuardError(403, 'ORIGIN_NOT_ALLOWED');
  }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new RequestGuardError(415, 'JSON_REQUIRED');
  }
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new RequestGuardError(400, 'INVALID_CONTENT_LENGTH');
  }
  if (length !== null && Number(length) > AUTH_BODY_BYTES) {
    throw new RequestGuardError(413, 'BODY_TOO_LARGE');
  }
  if (!request.body) throw new RequestGuardError(400, 'INVALID_JSON');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > AUTH_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestGuardError(413, 'BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestGuardError) throw error;
    throw new RequestGuardError(400, 'INVALID_JSON');
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error();
    }
    return value as Record<string, unknown>;
  } catch {
    throw new RequestGuardError(400, 'INVALID_JSON');
  }
}
