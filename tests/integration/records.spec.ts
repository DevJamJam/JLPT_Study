import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { hashSessionToken } from '../../src/server/auth/crypto';
import { createRecordsHttp } from '../../src/server/records/http';

const databaseUrl = process.env.JLPT_TEST_DATABASE_URL;
const restUrl = process.env.JLPT_TEST_POSTGREST_URL;
const group = '46000000-0000-4000-8000-000000000010';
const otherGroup = '46000000-0000-4000-8000-000000000011';
const user = '46000000-0000-4000-8000-000000000020';
const peer = '46000000-0000-4000-8000-000000000021';
const outsider = '46000000-0000-4000-8000-000000000022';
const category = '46000000-0000-4000-8000-000000000030';
const token = 'a'.repeat(43);
const limitedToken = 'b'.repeat(43);
const origin = 'https://integration.example';
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  SUPABASE_URL: 'https://integration.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_ci_only',
  PIN_PEPPER: 'p'.repeat(32),
  RATE_LIMIT_HMAC_KEY: 'r'.repeat(32),
  IDEMPOTENCY_HMAC_KEY: 'i'.repeat(32),
};

// This suite must fail closed without the CI's explicitly isolated services.
test.beforeAll(() => {
  if (!databaseUrl || !restUrl)
    throw new Error('Isolated database and PostgREST URLs are required');
  const db = new URL(databaseUrl);
  const rest = new URL(restUrl);
  if (
    !['localhost', '127.0.0.1'].includes(db.hostname) ||
    db.pathname !== '/jlpt_test' ||
    rest.hostname !== '127.0.0.1' ||
    rest.protocol !== 'http:'
  )
    throw new Error('Only isolated localhost services are allowed');
  sql(`
    insert into public.study_groups(id,name) values ('${group}','기록 통합검사'),('${otherGroup}','다른 검사 그룹');
    insert into public.users(id,nickname,nickname_key,emoji) values
      ('${user}','통합검사46','통합검사46','🐰'),('${peer}','제한검사46','제한검사46','🐱'),('${outsider}','외부검사46','외부검사46','🐶');
    insert into public.group_members(group_id,user_id) values ('${group}','${user}'),('${group}','${peer}'),('${otherGroup}','${outsider}');
    insert into public.user_credentials(user_id,pin_hash,salt,hash_params,must_change_pin) values
      ('${user}','TEST_ONLY','TEST_ONLY','{}',false),('${peer}','TEST_ONLY','TEST_ONLY','{}',true);
    insert into public.sessions(token_hash,user_id,credential_version,expires_at,mode) values
      ('${hashSessionToken(token)}','${user}',1,now()+interval '1 hour','normal'),
      ('${hashSessionToken(limitedToken)}','${peer}',1,now()+interval '1 hour','change_pin');
    insert into public.study_categories(id,name,name_key,sort_order) values ('${category}','통합검사 종류46','통합검사 종류46',4600);
    insert into public.study_records(id,group_id,user_id,study_date,minutes,category_id,start_time,created_at,create_fingerprint)
      select ('46000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${group}','${user}',
        case when n=106 then date '2026-08-31' else date '2026-09-30' end,
        1,'${category}',case when n in (101,102) then time '09:00' when n=103 then time '10:00' else null end,
        case when n=105 then timestamptz '2026-09-30T00:00:00.123457Z' else timestamptz '2026-09-30T00:00:00.123456Z' end,repeat('a',64)
      from generate_series(101,106) n;
    insert into public.study_records(id,group_id,user_id,study_date,minutes,category_id,create_fingerprint)
      select ('46000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${group}','${peer}','2026-09-10',1,'${category}',repeat('a',64)
      from generate_series(1000,1500) n;
    insert into public.study_records(id,group_id,user_id,study_date,minutes,category_id,create_fingerprint)
      values ('46000000-0000-4000-8000-000000000900','${otherGroup}','${outsider}','2026-09-30',1,'${category}',repeat('a',64));
  `);
});

function sql(statement: string) {
  return execFileSync('psql', [databaseUrl!, '-X', '-v', 'ON_ERROR_STOP=1', '-At'], {
    input: statement,
    encoding: 'utf8',
    timeout: 15000,
  });
}
const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const target = new URL(url.pathname.replace(/^\/rest\/v1\//, '/'), restUrl);
  target.search = url.search;
  return fetch(target, init);
};
const http = createRecordsHttp(env, transport);
function req(
  query = '',
  body?: unknown,
  cookieToken = token,
  method = body === undefined ? 'GET' : 'POST',
) {
  return new NextRequest(`${origin}/api/records${query}`, {
    method,
    headers: {
      origin,
      'content-type': 'application/json',
      cookie: `__Host-jlpt_session=${cookieToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('실제 REST/DB의 생성·재시도·현재값·삭제된 요청과 일일 상한', async () => {
  const id = '46000000-0000-4000-8000-000000000700';
  const input = {
    id,
    studyDate: '2026-09-15',
    minutes: 30,
    categoryId: category,
    memo: '  기록  ',
    userId: outsider,
    groupId: otherGroup,
  };
  const categories = await http.categories(req());
  expect(categories.status).toBe(200);
  expect((await categories.json()).data.categories).toContainEqual({
    id: category,
    name: '통합검사 종류46',
  });
  const changed = await http.create(req('', { ...input, expectedUserId: outsider }));
  expect(changed.status).toBe(409);
  expect((await changed.json()).error.code).toBe('ACCOUNT_CHANGED');
  const created = await http.create(req('', input));
  expect(created.status).toBe(200);
  expect((await created.json()).data.record).toMatchObject({
    id,
    userId: user,
    groupId: group,
    memo: '기록',
    minutes: 30,
    version: 1,
  });
  sql(`update public.study_records set minutes=40,version=2 where id='${id}';`);
  const retry = await http.create(req('', input));
  expect(retry.status).toBe(200);
  expect((await retry.json()).data.record).toMatchObject({ minutes: 40, version: 2 });
  const conflict = await http.create(req('', { ...input, minutes: 31 }));
  expect(conflict.status).toBe(409);
  expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  const over = await http.create(
    req('', { ...input, id: '46000000-0000-4000-8000-000000000701', minutes: 1440 }),
  );
  expect(over.status).toBe(409);
  expect((await over.json()).error.code).toBe('DAILY_LIMIT_EXCEEDED');
  sql(`select public.delete_record('${user}','${group}','${id}',2);`);
  const deleted = await http.create(req('', input));
  expect(deleted.status).toBe(409);
  expect((await deleted.json()).error.code).toBe('RECORD_DELETED');
});

test('실제 DB의 월 커서는 시각·null·생성 마이크로초·ID 동률을 누락 없이 처리한다', async () => {
  let cursor: string | null = null;
  const ids: string[] = [];
  for (let page = 0; page < 4; page++) {
    const response = await http.list(
      req('?scope=mine&month=2026-09&limit=2' + (cursor ? '&cursor=' + cursor : '')),
    );
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    ids.push(...data.records.map((record: { id: string }) => record.id));
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  expect(cursor).toBeNull();
  expect(ids).toEqual(
    [101, 102, 103, 104, 105].map((n) => '46000000-0000-4000-8000-' + String(n).padStart(12, '0')),
  );
});

test('실제 DB의 기간501건을 잘라내지 않고 그룹을 제한한다', async () => {
  const response = await http.list(req('?scope=group&from=2026-09-10&to=2026-09-10'));
  expect(response.status).toBe(200);
  const data = (await response.json()).data;
  expect(data.records).toHaveLength(501);
  expect(data.nextCursor).toBeNull();
  expect(data.records.every((record: { groupId: string }) => record.groupId === group)).toBe(true);
});

test('수정·삭제 API의 실제 DB 권한·동시 버전·재시도·일일 상한', async () => {
  const id = '46000000-0000-4000-8000-000000000750';
  const input = { id, studyDate: '2026-09-20', minutes: 30, categoryId: category };
  expect((await http.create(req('', input))).status).toBe(200);
  const update = (expectedVersion: number, minutes: number) =>
    http.update(
      req(
        '',
        { ...input, expectedVersion, minutes, userId: outsider, groupId: otherGroup },
        token,
        'PATCH',
      ),
      id,
    );
  const competing = await Promise.all([update(1, 40), update(1, 50)]);
  expect(competing.map((r) => r.status).sort()).toEqual([200, 409]);
  const conflict = await competing.find((r) => r.status === 409)!.json();
  expect(conflict.error).toMatchObject({
    code: 'CONFLICT',
    currentRecord: { id, userId: user, version: 2 },
  });
  const over = await http.create(
    req('', { ...input, id: '46000000-0000-4000-8000-000000000751', minutes: 1390 }),
  );
  expect(over.status).toBe(200);
  const exceeded = await update(2, 1440);
  expect(exceeded.status).toBe(409);
  expect((await exceeded.json()).error.code).toBe('DAILY_LIMIT_EXCEEDED');
  const latest = (await (await http.get(req(), id)).json()).data.record;
  const staleDelete = await http.delete(req('', { expectedVersion: 1 }, token, 'DELETE'), id);
  expect(staleDelete.status).toBe(409);
  expect((await staleDelete.json()).error.currentRecord.version).toBe(latest.version);
  for (const target of [
    '46000000-0000-4000-8000-000000001000',
    '46000000-0000-4000-8000-000000000900',
  ]) {
    expect(
      (await http.update(req('', { ...input, expectedVersion: 1 }, token, 'PATCH'), target)).status,
    ).toBe(403);
    expect(
      (await http.delete(req('', { expectedVersion: 1 }, token, 'DELETE'), target)).status,
    ).toBe(403);
  }
  expect(
    (await http.update(req('', { ...input, expectedVersion: 1 }, limitedToken, 'PATCH'), id))
      .status,
  ).toBe(403);
  expect(
    (await http.delete(req('', { expectedVersion: latest.version }, token, 'DELETE'), id)).status,
  ).toBe(200);
  expect(
    (await http.delete(req('', { expectedVersion: latest.version }, token, 'DELETE'), id)).status,
  ).toBe(200);
  expect((await http.get(req(), id)).status).toBe(404);
  expect((await update(latest.version, 30)).status).toBe(404);
  const recreated = await http.create(req('', input));
  expect((await recreated.json()).error.code).toBe('RECORD_DELETED');
});

test('다른 그룹은404, 같은 그룹 기록은 조회 가능, 제한·폐기 세션은 차단한다', async () => {
  expect((await http.get(req(), '46000000-0000-4000-8000-000000000900')).status).toBe(404);
  expect((await http.get(req(), '46000000-0000-4000-8000-000000001000')).status).toBe(200);
  const restricted = await http.list(req('?scope=mine&month=2026-09', undefined, limitedToken));
  expect(restricted.status).toBe(403);
  expect((await restricted.json()).error.code).toBe('PIN_CHANGE_REQUIRED');
  sql(`delete from public.sessions where token_hash='${hashSessionToken(token)}';`);
  const revoked = await http.list(req('?scope=mine&month=2026-09'));
  expect(revoked.status).toBe(401);
  expect(revoked.headers.get('set-cookie')).toContain('__Host-jlpt_session=;');
});
