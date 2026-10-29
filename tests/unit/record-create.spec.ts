import { expect, test } from '@playwright/test';
import {
  createRecord,
  recordFingerprint,
  RecordRequestError,
} from '../../src/server/records/create';
import type { PublicAuthData } from '../../src/features/auth/types';

const session: PublicAuthData = {
  profile: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    nickname: '테스트',
    emoji: '🐰',
    mustChangePin: false,
  },
  group: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: '스터디',
    maxMembers: 15,
    memberCount: 1,
  },
};
const body = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  studyDate: '2026-10-01',
  categoryId: '550e8400-e29b-41d4-a716-446655440003',
  minutes: 30,
  actorId: 'attacker',
  groupId: 'attacker',
};
const key = 'k'.repeat(32);

test('세션의 사용자와 그룹을 사용하고 같은 입력의 재시도 지문을 유지한다', async () => {
  const saved: unknown[] = [];
  const database = {
    resolveSession: async () => session,
    saveRecord: async (input: unknown) => {
      saved.push(input);
      return input;
    },
  };
  await createRecord(body, 'hash', database, key);
  await createRecord({ ...body, memo: '  ' }, 'hash', database, key);
  expect(saved[0]).toEqual(saved[1]);
  expect(saved[0]).toMatchObject({ actorId: session.profile.id, groupId: session.group.id });
});

test('초기화된 PIN과 잘못된 입력은 기록을 저장하지 않는다', async () => {
  let writes = 0;
  const db = {
    resolveSession: async () => ({
      ...session,
      profile: { ...session.profile, mustChangePin: true },
    }),
    saveRecord: async () => {
      writes++;
    },
  };
  await expect(createRecord(body, 'hash', db, key)).rejects.toMatchObject({
    code: 'PIN_CHANGE_REQUIRED',
  });
  const normalDb = { ...db, resolveSession: async () => session };
  await expect(createRecord({ ...body, minutes: 0 }, 'hash', normalDb, key)).rejects.toBeInstanceOf(
    RecordRequestError,
  );
  expect(writes).toBe(0);
});

test('생성 내용의 각 변경은 다른 지문을 만든다', () => {
  const record = {
    studyDate: '2026-10-01',
    startTime: null,
    minutes: 30,
    categoryId: body.categoryId,
    quantity: null,
    quantityUnit: null,
    memo: null,
  };
  expect(recordFingerprint(record, key)).not.toBe(
    recordFingerprint({ ...record, minutes: 31 }, key),
  );
  expect(recordFingerprint(record, key)).not.toBe(
    recordFingerprint({ ...record, memo: '메모' }, key),
  );
});
