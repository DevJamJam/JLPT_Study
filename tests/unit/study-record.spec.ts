import { test, expect } from '@playwright/test';
import { seoulDateKey, isDateKey } from '../../src/lib/seoul-date';
import { validateRecordInput, withinDailyLimit } from '../../src/features/study-record/validation';

const now = new Date('2026-10-06T15:00:00Z');
const input = {
  studyDate: '2026-10-07',
  categoryId: '550e8400-e29b-41d4-a716-446655440000',
  minutes: 30,
};

test('서울 자정과 연도 경계는 실행 환경 시간대에 영향받지 않는다', () => {
  expect(seoulDateKey(new Date('2026-10-06T14:59:59Z'))).toBe('2026-10-06');
  expect(seoulDateKey(now)).toBe('2026-10-07');
  expect(seoulDateKey(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
});

test('윤년·존재하지 않는 날짜·형식', () => {
  expect(isDateKey('2024-02-29')).toBe(true);
  for (const date of [
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-1-07',
    '2026-10-07T00:00:00Z',
  ]) {
    expect(isDateKey(date), date).toBe(false);
  }
});

test('선택 항목을 입력하지 않아도 기록 가능하며 허용된 필드만 반환한다', () => {
  expect(validateRecordInput({ ...input, ownerId: '다른 사람' }, now)).toEqual({
    ok: true,
    value: { ...input, startTime: null, quantity: null, quantityUnit: null, memo: null },
  });
});

test('날짜 하한·오늘·미래와 한국 자정 전후', () => {
  expect(validateRecordInput({ ...input, studyDate: '2000-01-01' }, now).ok).toBe(true);
  for (const date of ['1999-12-31', '2026-10-08', '2026-02-30']) {
    expect(validateRecordInput({ ...input, studyDate: date }, now).ok).toBe(false);
  }
  expect(validateRecordInput(input, new Date('2026-10-06T14:59:59Z')).ok).toBe(false);
  expect(validateRecordInput(input, now).ok).toBe(true);
});

test('공부 시간은 정수1~1440분이며 문자열·소수·비정상 숫자 거부', () => {
  for (const minutes of [1, 1440])
    expect(validateRecordInput({ ...input, minutes }, now).ok).toBe(true);
  for (const minutes of [0, -1, 1441, 1.5, '30', NaN, Infinity]) {
    expect(validateRecordInput({ ...input, minutes }, now).ok).toBe(false);
  }
});

test('공부 종류 UUID 형식과 시작시각 선택·범위', () => {
  expect(validateRecordInput({ ...input, categoryId: '단어' }, now).ok).toBe(false);
  for (const startTime of [null, '', '00:00', '23:59']) {
    expect(validateRecordInput({ ...input, startTime }, now).ok).toBe(true);
  }
  for (const startTime of ['24:00', '23:60', '9:00', '09:00:00', 900]) {
    expect(validateRecordInput({ ...input, startTime }, now).ok).toBe(false);
  }
});

test('공부량과 단위는 둘 다 없거나 둘 다 유효해야 한다', () => {
  for (const quantityUnit of ['item', 'page', 'question']) {
    for (const quantity of [1, 99999]) {
      expect(validateRecordInput({ ...input, quantity, quantityUnit }, now).ok).toBe(true);
    }
  }
  for (const extra of [
    { quantity: 5 },
    { quantityUnit: 'page' },
    { quantity: 0, quantityUnit: 'item' },
    { quantity: 100000, quantityUnit: 'item' },
    { quantity: 1.5, quantityUnit: 'item' },
    { quantity: '5', quantityUnit: 'item' },
    { quantity: 5, quantityUnit: '개' },
  ])
    expect(validateRecordInput({ ...input, ...extra }, now).ok).toBe(false);
});

test('메모는 trim 후 Unicode 코드포인트500개·빈 값은 null', () => {
  const valid = validateRecordInput({ ...input, memo: `  ${'🐰'.repeat(500)}  ` }, now);
  expect(valid.ok).toBe(true);
  if (valid.ok) expect(valid.value.memo).toBe('🐰'.repeat(500));
  expect(validateRecordInput({ ...input, memo: '🐰'.repeat(501) }, now).ok).toBe(false);
  expect(validateRecordInput({ ...input, memo: 123 }, now).ok).toBe(false);
  const empty = validateRecordInput({ ...input, memo: '  ' }, now);
  if (!empty.ok) throw new Error('빈 메모 검증 실패');
  expect(empty.value.memo).toBeNull();
  const plain = validateRecordInput({ ...input, memo: '<b>공부</b>' }, now);
  if (!plain.ok) throw new Error('메모 검증 실패');
  expect(plain.value.memo).toBe('<b>공부</b>');
});

test('잘못된 요청 구조와 필수 항목 누락 거부', () => {
  for (const value of [null, [], '기록', {}, { ...input, minutes: undefined }]) {
    expect(validateRecordInput(value, now).ok).toBe(false);
  }
});

test('일일 상한과 같은 날짜 수정·다른 날짜 이동 계산', () => {
  expect(withinDailyLimit(1400, 40)).toBe(true);
  expect(withinDailyLimit(1400, 41)).toBe(false);
  expect(withinDailyLimit(1440, 60, 60)).toBe(true);
  expect(withinDailyLimit(1440, 61, 60)).toBe(false);
  // 다른 날짜로 이동할 때 대상 날짜 합계에서 원래 날짜 기록을 빼지 않는다.
  expect(withinDailyLimit(1400, 60, 0)).toBe(false);
  for (const args of [
    [-1, 30, 0],
    [10, 30, 11],
    [0, 0, 0],
    [0, 30.5, 0],
    [Infinity, 30, 0],
  ]) {
    expect(withinDailyLimit(...(args as [number, number, number]))).toBe(false);
  }
});
