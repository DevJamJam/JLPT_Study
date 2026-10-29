import { validateRecordInput } from '../../features/study-record/validation';
import { AuthServiceError } from '../auth/service';
import { RecordRequestError } from './create';
import type { RecordDatabase } from './database';
import { isUuid } from './query';

/** A version is mandatory: a lost response never authorizes a blind overwrite. */
export async function mutateRecord(
  action: 'update' | 'delete',
  id: unknown,
  body: unknown,
  tokenHash: string,
  db: RecordDatabase,
  now = new Date(),
) {
  const session = await db.resolveSession(tokenHash);
  if (session.profile.mustChangePin) throw new RecordRequestError(403, 'PIN_CHANGE_REQUIRED');
  if (!isUuid(id) || !body || typeof body !== 'object' || Array.isArray(body))
    throw new RecordRequestError(400, 'VALIDATION_ERROR');
  const data = body as Record<string, unknown>;
  if (data.expectedUserId !== undefined && data.expectedUserId !== session.profile.id)
    throw new RecordRequestError(409, 'ACCOUNT_CHANGED');
  // PostgreSQL integer and version+1 must both remain representable.
  if (
    !Number.isInteger(data.expectedVersion) ||
    (data.expectedVersion as number) < 1 ||
    (data.expectedVersion as number) >= 2147483647
  )
    throw new RecordRequestError(400, 'VALIDATION_ERROR');
  const input = {
    id: id.toLowerCase(),
    actorId: session.profile.id,
    groupId: session.group.id,
    expectedVersion: data.expectedVersion as number,
  };
  try {
    if (action === 'delete') {
      await db.deleteRecord(input);
      return { deletedId: input.id };
    }
    // PATCH replaces the editable fields; it is not a partial merge with stale data.
    const parsed = validateRecordInput(data, now);
    if (!parsed.ok) throw new RecordRequestError(400, 'VALIDATION_ERROR', parsed.errors);
    return { record: await db.updateRecord({ ...input, record: parsed.value }) };
  } catch (error) {
    if (!(error instanceof AuthServiceError) || error.code !== 'CONFLICT') throw error;
    // Only a canonical, same-group, owned record may accompany the conflict.
    // A failed re-read is returned as its actual error, never a fabricated snapshot.
    const current = await db.getRecord(input.id, input.groupId);
    if (current.userId !== input.actorId) throw new RecordRequestError(403, 'FORBIDDEN');
    throw new RecordRequestError(409, 'CONFLICT', undefined, current);
  }
}
