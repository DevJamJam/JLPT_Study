import { createCalendarDatabase, type CalendarDatabase } from '../calendar/database';
import type { loadAuthConfig } from '../auth/config';
import { AuthServiceError } from '../auth/service';
import { createSupabaseAuthDatabase } from '../auth/supabase-database';
import { createDatabaseRequest } from '../database';
import { validateRecordInput } from '../../features/study-record/validation';
import type { StudyRecord, RecordPage } from '../../features/study-record/types';
import type { CreateRecordDatabase } from './create';
import type { RecordInput } from '../../features/study-record/validation';
import { cursorFilter, encodeRecordCursor, isTimestamp, isUuid, type RecordQuery } from './query';

const unavailable = () => new AuthServiceError(503, 'AUTH_UNAVAILABLE');
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const fields =
  'id,group_id,user_id,study_date,minutes,category_id,start_time,quantity,quantity_unit,memo,version,created_at,updated_at,category:study_categories!inner(id,name)';
const order = 'study_date.desc,start_time.asc.nullslast,created_at.asc,id.asc';

/** Strict DTO whitelist: internal fingerprints and credentials never leave the server. */
export function recordFromRow(row: unknown, groupId: string, actorId?: string): StudyRecord {
  if (
    !object(row) ||
    !isUuid(row.id) ||
    !isUuid(row.user_id) ||
    row.group_id !== groupId ||
    (actorId !== undefined && row.user_id !== actorId) ||
    !object(row.category) ||
    row.category.id !== row.category_id ||
    typeof row.category.name !== 'string' ||
    !row.category.name.trim() ||
    [...row.category.name].length > 20 ||
    !Number.isSafeInteger(row.version) ||
    (row.version as number) < 1 ||
    !isTimestamp(row.created_at) ||
    !isTimestamp(row.updated_at) ||
    (row.start_time !== null &&
      (typeof row.start_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d:00$/.test(row.start_time)))
  )
    throw unavailable();
  const result = validateRecordInput({
    studyDate: row.study_date,
    categoryId: row.category_id,
    minutes: row.minutes,
    startTime: row.start_time === null ? null : (row.start_time as string).slice(0, 5),
    quantity: row.quantity,
    quantityUnit: row.quantity_unit,
    memo: row.memo,
  });
  // Missing nullable fields are malformed DB responses, not defaults supplied by the user.
  if (!result.ok || ['quantity', 'quantity_unit', 'memo'].some((key) => row[key] === undefined))
    throw unavailable();
  return {
    ...result.value,
    id: row.id,
    userId: row.user_id,
    groupId,
    categoryName: row.category.name,
    version: row.version as number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type RecordDatabase = CreateRecordDatabase<StudyRecord> &
  CalendarDatabase & {
    updateRecord(input: {
      actorId: string;
      groupId: string;
      id: string;
      record: RecordInput;
      expectedVersion: number;
    }): Promise<StudyRecord>;
    deleteRecord(input: {
      actorId: string;
      groupId: string;
      id: string;
      expectedVersion: number;
    }): Promise<void>;
    getRecord(id: string, groupId: string): Promise<StudyRecord>;
    listCategories(): Promise<{ id: string; name: string }[]>;
    listRecords(query: RecordQuery, actorId: string, groupId: string): Promise<RecordPage>;
  };

export function createRecordDatabase(
  config: ReturnType<typeof loadAuthConfig>,
  transport: typeof fetch = fetch,
  observeRequest?: (milliseconds: number) => void,
): RecordDatabase {
  const auth = createSupabaseAuthDatabase(config, undefined, transport, observeRequest);
  const request = createDatabaseRequest(config, transport, observeRequest);
  async function getRecord(id: string, groupId: string): Promise<StudyRecord> {
    if (!isUuid(id) || !isUuid(groupId)) throw unavailable();
    const query = new URLSearchParams({
      select: fields,
      id: `eq.${id}`,
      group_id: `eq.${groupId}`,
      limit: '1',
    });
    const rows = await request(`study_records?${query}`);
    if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
    if (!rows.length) throw new AuthServiceError(404, 'NOT_FOUND');
    const record = recordFromRow(rows[0], groupId);
    if (record.id !== id) throw unavailable();
    return record;
  }
  return {
    ...createCalendarDatabase(config, transport, observeRequest),
    resolveSession: auth.resolveSession,
    getRecord,
    async updateRecord(input) {
      const record = input.record;
      const result = await request('rpc/save_record', {
        p_actor_user_id: input.actorId,
        p_group_id: input.groupId,
        p_id: input.id,
        p_study_date: record.studyDate,
        p_minutes: record.minutes,
        p_category_id: record.categoryId,
        p_start_time: record.startTime,
        p_quantity: record.quantity,
        p_quantity_unit: record.quantityUnit,
        p_memo: record.memo,
        p_create_fingerprint: null,
        p_expected_version: input.expectedVersion,
      });
      const row: unknown = Array.isArray(result) && result.length === 1 ? result[0] : result;
      if (
        !object(row) ||
        row.id !== input.id ||
        row.user_id !== input.actorId ||
        row.group_id !== input.groupId ||
        row.version !== input.expectedVersion + 1
      )
        throw unavailable();
      const saved = await getRecord(input.id, input.groupId);
      if (saved.userId !== input.actorId) throw unavailable();
      return saved;
    },
    async deleteRecord(input) {
      const result = await request('rpc/delete_record', {
        p_actor_user_id: input.actorId,
        p_group_id: input.groupId,
        p_id: input.id,
        p_expected_version: input.expectedVersion,
      });
      if (result !== true) throw unavailable();
    },
    async listCategories() {
      const result: { id: string; name: string }[] = [];
      const seen = new Set<string>();
      for (let offset = 0; ;) {
        const rows = await request(
          `study_categories?select=id,name&order=sort_order.asc&limit=100&offset=${offset}`,
        );
        if (
          !Array.isArray(rows) ||
          rows.length > 100 ||
          rows.some(
            (row) =>
              !object(row) ||
              !isUuid(row.id) ||
              typeof row.name !== 'string' ||
              !row.name.trim() ||
              [...row.name].length > 20,
          )
        )
          throw unavailable();
        for (const row of rows) {
          if (seen.has(row.id as string)) throw unavailable();
          seen.add(row.id as string);
          result.push({ id: row.id as string, name: row.name as string });
        }
        if (!rows.length) return result;
        offset += rows.length;
      }
    },
    async saveRecord(input) {
      const record = input.record;
      const result = await request('rpc/save_record', {
        p_actor_user_id: input.actorId,
        p_group_id: input.groupId,
        p_id: input.id,
        p_study_date: record.studyDate,
        p_minutes: record.minutes,
        p_category_id: record.categoryId,
        p_start_time: record.startTime,
        p_quantity: record.quantity,
        p_quantity_unit: record.quantityUnit,
        p_memo: record.memo,
        p_create_fingerprint: input.fingerprint,
        p_expected_version: null,
      });
      const row: unknown = Array.isArray(result) && result.length === 1 ? result[0] : result;
      if (
        !object(row) ||
        row.id !== input.id ||
        row.user_id !== input.actorId ||
        row.group_id !== input.groupId
      )
        throw unavailable();
      // Read the current canonical record: retries must not restore an older version.
      const saved = await getRecord(input.id, input.groupId);
      if (saved.userId !== input.actorId) throw unavailable();
      return saved;
    },
    async listRecords(input, actorId, groupId) {
      if (!isUuid(actorId) || !isUuid(groupId)) throw unavailable();
      const query = new URLSearchParams({ select: fields, group_id: `eq.${groupId}`, order });
      query.append('study_date', `gte.${input.from}`);
      query.append('study_date', `lte.${input.to}`);
      if (input.scope === 'mine') query.set('user_id', `eq.${actorId}`);
      if (input.kind === 'month' && input.cursor) query.set('or', cursorFilter(input.cursor));
      const pageSize = input.kind === 'month' ? input.limit + 1 : 500;
      const records: StudyRecord[] = [];
      // The API's default row cap must never silently truncate a 42-day period.
      const seen = new Set<string>();
      for (let offset = 0; ;) {
        const requested = input.kind === 'month' ? pageSize - records.length : pageSize;
        query.set('limit', String(requested));
        query.set('offset', String(offset));
        const rows = await request(`study_records?${query}`);
        if (!Array.isArray(rows) || rows.length > requested) throw unavailable();
        const page = rows.map((row) =>
          recordFromRow(row, groupId, input.scope === 'mine' ? actorId : undefined),
        );
        if (page.some((record) => record.studyDate < input.from || record.studyDate > input.to))
          throw unavailable();
        for (const record of page) {
          if (seen.has(record.id)) throw unavailable();
          seen.add(record.id);
        }
        records.push(...page);
        if (!rows.length || (input.kind === 'month' && records.length >= pageSize)) break;
        offset += rows.length;
      }
      if (input.kind === 'period') return { records, nextCursor: null };
      const hasMore = records.length > input.limit;
      const selected = records.slice(0, input.limit);
      return {
        records: selected,
        nextCursor: hasMore
          ? encodeRecordCursor(selected.at(-1)!, actorId, groupId, input.month)
          : null,
      };
    },
  };
}
