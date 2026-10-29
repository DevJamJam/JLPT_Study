import { createHmac } from 'node:crypto';
import { validateRecordInput, type RecordInput } from '../../features/study-record/validation';
import type { StudyRecord } from '../../features/study-record/types';
import type { PublicAuthData } from '../../features/auth/types';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export class RecordRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string>,
    public readonly currentRecord?: StudyRecord,
  ) {
    super(code);
  }
}

export type CreateRecordDatabase<T> = {
  resolveSession(tokenHash: string): Promise<PublicAuthData>;
  saveRecord(input: {
    actorId: string;
    groupId: string;
    id: string;
    record: RecordInput;
    fingerprint: string;
  }): Promise<T>;
};

/** 생성 요청의 정규화된 모든 필드로 재시도 지문을 만든다. */
export function recordFingerprint(record: RecordInput, key: string): string {
  if (Buffer.byteLength(key) < 32) throw new Error('Invalid idempotency key');
  return createHmac('sha256', key)
    .update(
      JSON.stringify([
        'jlpt-record:v1',
        record.studyDate,
        record.startTime,
        record.minutes,
        record.categoryId,
        record.quantity,
        record.quantityUnit,
        record.memo,
      ]),
    )
    .digest('hex');
}

/** 주체와 그룹은 검증된 세션에서만 가져오며 클라이언트 입력을 신뢰하지 않는다. */
export async function createRecord<T>(
  body: unknown,
  tokenHash: string,
  database: CreateRecordDatabase<T>,
  idempotencyKey: string,
  now = new Date(),
): Promise<T> {
  const session = await database.resolveSession(tokenHash);
  if (session.profile.mustChangePin) throw new RecordRequestError(403, 'PIN_CHANGE_REQUIRED');
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RecordRequestError(400, 'VALIDATION_ERROR');
  }
  const requested = body as Record<string, unknown>;
  if (requested.expectedUserId !== undefined && requested.expectedUserId !== session.profile.id) {
    throw new RecordRequestError(409, 'ACCOUNT_CHANGED');
  }
  const id = requested.id;
  const result = validateRecordInput(body, now);
  if (typeof id !== 'string' || !uuid.test(id) || !result.ok) {
    throw new RecordRequestError(400, 'VALIDATION_ERROR', result.ok ? undefined : result.errors);
  }
  return database.saveRecord({
    actorId: session.profile.id,
    groupId: session.group.id,
    id: id.toLowerCase(),
    record: result.value,
    fingerprint: recordFingerprint(result.value, idempotencyKey),
  });
}
