import { isDateKey, seoulDateKey } from '../../lib/seoul-date';

export const DAILY_MINUTES_LIMIT = 1440;
export type QuantityUnit = 'item' | 'page' | 'question';
export type RecordInput = {
  studyDate: string;
  startTime: string | null;
  minutes: number;
  categoryId: string;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  memo: string | null;
};
type Field = keyof RecordInput | 'form';
export type RecordValidation =
  { ok: true; value: RecordInput } | { ok: false; errors: Partial<Record<Field, string>> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const units = new Set<unknown>(['item', 'page', 'question']);

/** UI·API가 함께 쓸 순수 검증. 종류의 DB 존재 여부·소유권은 서버에서 별도로 확인한다. */
export function validateRecordInput(input: unknown, now: Date = new Date()): RecordValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { form: '공부 기록의 입력 형식을 확인해 주세요.' } };
  }
  const data = input as Record<string, unknown>;
  const errors: Partial<Record<Field, string>> = {};
  const today = seoulDateKey(now);
  if (!isDateKey(data.studyDate) || data.studyDate < '2000-01-01' || data.studyDate > today) {
    errors.studyDate = '2000년 1월 1일부터 오늘까지의 날짜를 선택해 주세요.';
  }
  if (typeof data.categoryId !== 'string' || !uuid.test(data.categoryId)) {
    errors.categoryId = '공부 종류를 선택해 주세요.';
  }
  if (
    typeof data.minutes !== 'number' ||
    !Number.isInteger(data.minutes) ||
    data.minutes < 1 ||
    data.minutes > DAILY_MINUTES_LIMIT
  ) {
    errors.minutes = '공부 시간은 1분부터 1440분까지 정수로 입력해 주세요.';
  }
  const startTime = data.startTime === '' || data.startTime == null ? null : data.startTime;
  if (
    startTime !== null &&
    (typeof startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))
  ) {
    errors.startTime = '시작 시각은 00:00부터 23:59까지 입력해 주세요.';
  }
  const quantity = data.quantity ?? null;
  const quantityUnit = data.quantityUnit ?? null;
  if (
    quantity !== null &&
    (typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99999)
  ) {
    errors.quantity = '공부량은 1부터 99999까지 정수로 입력해 주세요.';
  }
  if (quantityUnit !== null && !units.has(quantityUnit)) {
    errors.quantityUnit = '공부량 단위는 개, 쪽, 문제 중 선택해 주세요.';
  }
  if ((quantity === null) !== (quantityUnit === null)) {
    errors.quantity = '공부량과 단위를 함께 입력해 주세요.';
    errors.quantityUnit = '공부량과 단위를 함께 입력해 주세요.';
  }
  let memo: string | null = null;
  if (data.memo != null) {
    if (typeof data.memo !== 'string') {
      errors.memo = '메모는 글자로 입력해 주세요.';
    } else {
      memo = data.memo.trim() || null;
      if (memo && [...memo].length > 500) errors.memo = '메모는 500자까지 입력해 주세요.';
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      studyDate: data.studyDate as string,
      categoryId: (data.categoryId as string).toLowerCase(),
      minutes: data.minutes as number,
      startTime: startTime as string | null,
      quantity: quantity as number | null,
      quantityUnit: quantityUnit as QuantityUnit | null,
      memo,
    },
  };
}

/** 서버 트랜잭션에서 읽은 대상 날짜 합계와 기존 기록 시간을 전달해야 한다. */
export function withinDailyLimit(
  targetDateTotal: number,
  newMinutes: number,
  previousMinutesOnTargetDate = 0,
): boolean {
  return (
    [targetDateTotal, newMinutes, previousMinutesOnTargetDate].every(Number.isSafeInteger) &&
    targetDateTotal >= 0 &&
    newMinutes >= 1 &&
    newMinutes <= DAILY_MINUTES_LIMIT &&
    previousMinutesOnTargetDate >= 0 &&
    previousMinutesOnTargetDate <= targetDateTotal &&
    targetDateTotal - previousMinutesOnTargetDate + newMinutes <= DAILY_MINUTES_LIMIT
  );
}
