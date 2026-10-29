import { test, expect } from '@playwright/test';
import { parseRecordQuery, encodeRecordCursor, cursorFilter } from '../../src/server/records/query';
import { recordFromRow } from '../../src/server/records/database';
import type { StudyRecord } from '../../src/features/study-record/types';

const userId = '46000000-0000-4000-8000-000000000001';
const groupId = '46000000-0000-4000-8000-000000000002';
const id = '46000000-0000-4000-8000-000000000003';
const parse = (query: string) => parseRecordQuery(new URLSearchParams(query), userId, groupId);
const record: StudyRecord = {
  id,
  userId,
  groupId,
  categoryId: id,
  categoryName: '단어',
  studyDate: '2026-09-30',
  startTime: null,
  minutes: 30,
  quantity: null,
  quantityUnit: null,
  memo: null,
  version: 1,
  createdAt: '2026-09-30T00:00:00.123456+00:00',
  updatedAt: '2026-09-30T00:00:00Z',
};

test('기간은 실제 날짜와 최대42일을 검증하고 조회 형식 혼용·중복을 거부한다', () => {
  expect(parse('scope=group&from=2026-09-01&to=2026-10-12')).toMatchObject({
    kind: 'period',
    scope: 'group',
  });
  for (const query of [
    'scope=group&from=2026-09-01&to=2026-10-13',
    'scope=mine&from=2026-02-30&to=2026-03-01',
    'scope=mine&from=2026-10-02&to=2026-10-01',
    'scope=mine&month=2026-09&from=2026-09-01',
    'scope=group&month=2026-09',
    'scope=mine&month=2026-13',
    'scope=mine&month=2026-09&limit=31',
    'scope=mine&month=2026-09&limit=0',
    'scope=mine&month=2026-09&limit=01',
    'scope=mine&scope=group&month=2026-09',
    'scope=mine&from=2026-09-01&to=2026-09-02&cursor=x',
    'scope=mine&month=2026-09&userId=forged',
  ])
    expect(() => parse(query), query).toThrow();
  expect(parse('scope=mine&month=2024-02')).toMatchObject({
    from: '2024-02-01',
    to: '2024-02-29',
    limit: 30,
  });
});

test('월 커서는 사용자·그룹·월에 묶이며 시간 null·마이크로초를 유지한다', () => {
  const cursor = encodeRecordCursor(record, userId, groupId, '2026-09');
  expect(parse(`scope=mine&month=2026-09&cursor=${cursor}`)).toMatchObject({
    cursor: { id, startTime: null, createdAt: record.createdAt },
  });
  for (const encoded of [
    cursor + '=',
    'not-json',
    encodeRecordCursor(record, id, groupId, '2026-09'),
    encodeRecordCursor(record, userId, id, '2026-09'),
    encodeRecordCursor(record, userId, groupId, '2026-10'),
  ]) {
    expect(() => parse(`scope=mine&month=2026-09&cursor=${encoded}`)).toThrow();
  }
  expect(cursorFilter(record)).not.toContain('start_time.gt.');
  expect(cursorFilter({ ...record, startTime: '09:00' })).toContain('start_time.is.null');
});

test('DB 결과는 모든 입력·소유권·타임스탬프를 검증하고 내부값을 제외한다', () => {
  const row = {
    id,
    user_id: userId,
    group_id: groupId,
    category_id: id,
    category: { id, name: '단어' },
    study_date: record.studyDate,
    start_time: null,
    minutes: 30,
    quantity: null,
    quantity_unit: null,
    memo: null,
    version: 1,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    create_fingerprint: 'PRIVATE',
  };
  expect(recordFromRow(row, groupId, userId)).toEqual(record);
  for (const invalid of [
    { ...row, group_id: id },
    { ...row, user_id: id },
    { ...row, minutes: '30' },
    { ...row, start_time: '24:00:00' },
    { ...row, quantity: undefined },
    { ...row, category: null },
    { ...row, created_at: '2026-09-30T29:00:00Z' },
    { ...row, version: 0 },
  ]) {
    expect(() => recordFromRow(invalid, groupId, userId)).toThrow();
  }
});
