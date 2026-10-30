import { NextRequest } from 'next/server';
import { loadAuthConfig } from '../auth/config';
import { AuthServiceError } from '../auth/service';
import { clearCookie, failure, json, tokenHash } from '../auth/http';
import { readMutationJson } from '../auth/request-guard';
import { createRecord, RecordRequestError } from './create';
import { createRecordDatabase } from './database';
import { mutateRecord } from './mutate';
import { isUuid, parseRecordQuery } from './query';
import { parseStudyWeek } from '../study/query';

const messages: Record<string, string> = {
  VALIDATION_ERROR: '공부 기록의 입력과 조회 조건을 확인해주세요.',
  IDEMPOTENCY_CONFLICT: '저장 요청 내용이 바뀌었어요. 새 요청으로 다시 시도해주세요.',
  CONFLICT: '다른 기기에서 변경됐어요. 최신 기록을 확인해 주세요.',
  AUTH_UNAVAILABLE: '공부 기록 서비스를 잠시 이용할 수 없어요.',
};

export function createRecordsHttp(
  env: Record<string, string | undefined>,
  transport: typeof fetch = fetch,
) {
  async function handle(
    action:
      | 'create'
      | 'update'
      | 'delete'
      | 'get'
      | 'list'
      | 'categories'
      | 'members'
      | 'calendar'
      | 'study',
    request: NextRequest,
    id?: string,
  ) {
    const production = env.NODE_ENV === 'production';
    const started = performance.now();
    let dbTime = 0;
    let dbCalls = 0;
    const response = await (async () => {
      try {
        const hash = tokenHash(request, production);
        if (!hash) throw new AuthServiceError(401, 'UNAUTHORIZED');
        const config = loadAuthConfig(env);
        const body = ['create', 'update', 'delete'].includes(action)
          ? await readMutationJson(request, config.appOrigin)
          : undefined;
        const db = createRecordDatabase(config, transport, (milliseconds) => {
          dbTime += milliseconds;
          dbCalls++;
        });
        if (action === 'create')
          return json({
            data: { record: await createRecord(body, hash, db, config.idempotencyKey) },
          });
        if (action === 'update' || action === 'delete')
          return json({ data: await mutateRecord(action, id, body, hash, db) });
        const session = await db.resolveSession(hash);
        if (session.profile.mustChangePin) throw new RecordRequestError(403, 'PIN_CHANGE_REQUIRED');
        if (action === 'study') {
          const week = parseStudyWeek(request.nextUrl.searchParams);
          return json({ data: await db.getStudy(week, session.profile.id, session.group.id) });
        }
        if (action === 'members') {
          if (request.nextUrl.searchParams.size)
            throw new RecordRequestError(400, 'VALIDATION_ERROR');
          return json({ data: { members: await db.listMembers(session.group.id) } });
        }
        if (action === 'categories')
          return json({ data: { categories: await db.listCategories() } });
        if (action === 'get') {
          if (!isUuid(id)) throw new RecordRequestError(400, 'VALIDATION_ERROR');
          return json({ data: { record: await db.getRecord(id.toLowerCase(), session.group.id) } });
        }
        const query = parseRecordQuery(
          request.nextUrl.searchParams,
          session.profile.id,
          session.group.id,
        );
        if (action === 'calendar') {
          if (query.kind !== 'period') throw new RecordRequestError(400, 'VALIDATION_ERROR');
          return json({
            data: { days: await db.getCalendar(query, session.profile.id, session.group.id) },
          });
        }
        return json({ data: await db.listRecords(query, session.profile.id, session.group.id) });
      } catch (error) {
        const known = error instanceof RecordRequestError || error instanceof AuthServiceError;
        const normalized =
          error instanceof RecordRequestError
            ? new AuthServiceError(error.status, error.code)
            : error;
        const result = failure(normalized);
        if (known && (Object.hasOwn(messages, error.code) || error instanceof RecordRequestError)) {
          const data = await result.json();
          if (Object.hasOwn(messages, error.code)) data.error.message = messages[error.code];
          if (error instanceof RecordRequestError && error.fieldErrors)
            data.error.fieldErrors = error.fieldErrors;
          if (error instanceof RecordRequestError && error.currentRecord)
            data.error.currentRecord = error.currentRecord;
          const response = json(data, result.status);
          if (response.status === 401) clearCookie(response, production);
          return response;
        }
        if (result.status === 401) clearCookie(result, production);
        return result;
      }
    })();
    response.headers.set(
      'Server-Timing',
      `app;dur=${(performance.now() - started).toFixed(1)}, db;dur=${dbTime.toFixed(1)}, dbcalls;desc="${dbCalls}"`,
    );
    return response;
  }
  return {
    create: (request: NextRequest) => handle('create', request),
    update: (request: NextRequest, id: string) => handle('update', request, id),
    delete: (request: NextRequest, id: string) => handle('delete', request, id),
    get: (request: NextRequest, id: string) => handle('get', request, id),
    list: (request: NextRequest) => handle('list', request),
    members: (request: NextRequest) => handle('members', request),
    study: (request: NextRequest) => handle('study', request),
    calendar: (request: NextRequest) => handle('calendar', request),
    categories: (request: NextRequest) => handle('categories', request),
  };
}
