import { isDateKey } from '../../lib/seoul-date';
import { RecordRequestError } from './create';
import type { StudyRecord } from '../../features/study-record/types';

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export type RecordCursor = Pick<StudyRecord, 'studyDate' | 'startTime' | 'createdAt' | 'id'>;
export type RecordQuery =
  | { kind: 'period'; scope: 'mine' | 'group'; from: string; to: string }
  | {
      kind: 'month';
      scope: 'mine';
      month: string;
      from: string;
      to: string;
      limit: number;
      cursor: RecordCursor | null;
    };

const invalid = () => new RecordRequestError(400, 'VALIDATION_ERROR');
// Preserve Postgres fractional seconds for a stable tuple; never interpolate arbitrary cursor text.
export const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value) &&
  isDateKey(value.slice(0, 10)) &&
  Number.isFinite(Date.parse(value)) &&
  Number(value.slice(11, 13)) < 24 &&
  Number(value.slice(14, 16)) < 60 &&
  Number(value.slice(17, 19)) < 60;

export function parseRecordQuery(
  params: URLSearchParams,
  actorId: string,
  groupId: string,
): RecordQuery {
  const allowed = new Set(['scope', 'from', 'to', 'month', 'limit', 'cursor']);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw invalid();
  }
  const scope = params.get('scope');
  if (scope !== 'mine' && scope !== 'group') throw invalid();
  if (!params.has('month')) {
    if (params.has('limit') || params.has('cursor')) throw invalid();
    const from = params.get('from');
    const to = params.get('to');
    if (
      !isDateKey(from) ||
      !isDateKey(to) ||
      from < '2000-01-01' ||
      to < from ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 41
    )
      throw invalid();
    return { kind: 'period', scope, from, to };
  }
  if (scope !== 'mine' || params.has('from') || params.has('to')) throw invalid();
  const month = params.get('month')!;
  if (!/^\d{4}-\d{2}$/.test(month) || !isDateKey(`${month}-01`) || month < '2000-01')
    throw invalid();
  const limitValue = params.get('limit') ?? '30';
  if (!/^(?:[1-9]|[12]\d|30)$/.test(limitValue)) throw invalid();
  const lastDay = new Date(`${month}-01T00:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  let cursor: RecordCursor | null = null;
  if (params.has('cursor')) {
    const encoded = params.get('cursor')!;
    if (!/^[A-Za-z0-9_-]{1,1200}$/.test(encoded)) throw invalid();
    try {
      const decoded = Buffer.from(encoded, 'base64url');
      if (decoded.toString('base64url') !== encoded) throw invalid();
      const value: unknown = JSON.parse(decoded.toString('utf8'));
      if (
        !Array.isArray(value) ||
        value.length !== 8 ||
        value[0] !== 1 ||
        value[1] !== actorId ||
        value[2] !== groupId ||
        value[3] !== month ||
        !isDateKey(value[4]) ||
        value[4].slice(0, 7) !== month ||
        (value[5] !== null &&
          (typeof value[5] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value[5]))) ||
        !isTimestamp(value[6]) ||
        !isUuid(value[7])
      )
        throw invalid();
      cursor = {
        studyDate: value[4],
        startTime: value[5],
        createdAt: value[6],
        id: value[7].toLowerCase(),
      };
    } catch {
      throw invalid();
    }
  }
  return {
    kind: 'month',
    scope,
    month,
    from: `${month}-01`,
    to: lastDay.toISOString().slice(0, 10),
    limit: Number(limitValue),
    cursor,
  };
}

export function encodeRecordCursor(
  record: StudyRecord,
  actorId: string,
  groupId: string,
  month: string,
) {
  return Buffer.from(
    JSON.stringify([
      1,
      actorId,
      groupId,
      month,
      record.studyDate,
      record.startTime,
      record.createdAt,
      record.id,
    ]),
  ).toString('base64url');
}

/** SQL order: date DESC, time ASC NULLS LAST, created ASC, id ASC. */
export function cursorFilter(cursor: RecordCursor): string {
  const date = `study_date.eq.${cursor.studyDate}`;
  const time =
    cursor.startTime === null ? 'start_time.is.null' : `start_time.eq.${cursor.startTime}`;
  const branches = [`study_date.lt.${cursor.studyDate}`];
  if (cursor.startTime !== null) {
    branches.push(
      `and(${date},start_time.gt.${cursor.startTime})`,
      `and(${date},start_time.is.null)`,
    );
  }
  branches.push(`and(${date},${time},created_at.gt.${cursor.createdAt})`);
  branches.push(`and(${date},${time},created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`);
  return `(${branches.join(',')})`;
}
