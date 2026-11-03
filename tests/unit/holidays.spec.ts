import { test, expect } from '@playwright/test';
import {
  fetchHolidayYear,
  holidayResponse,
  holidayYearQuery,
  HolidayError,
} from '../../src/server/holidays/service';
import { dateTone } from '../../src/lib/holidays';

const key = 'test-only+/key==';
const item = (locdate: number, dateName = '공휴일', isHoliday = 'Y') => ({
  locdate,
  dateName,
  isHoliday,
});
const reply = (items: unknown, totalCount = Array.isArray(items) ? items.length : 1, pageNo = 1) =>
  Response.json({
    response: {
      header: { resultCode: '00' },
      body: { items: { item: items }, totalCount, pageNo },
    },
  });

test('공식 응답의 단건·배열·동일 날짜 명칭을 보존하고 공휴일 아닌 항목은 제외', async () => {
  const data = await fetchHolidayYear('2026', key, async (input, options) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('https://apis.data.go.kr');
    expect(url.searchParams.get('serviceKey')).toBe(key);
    expect(url.searchParams.get('solYear')).toBe('2026');
    expect(url.searchParams.get('_type')).toBe('json');
    expect(options?.redirect).toBe('error');
    return reply([
      item(20260505, '어린이날'),
      item(20260505, '다른 공휴일'),
      item(20260505, '어린이날'),
      item(20260506, '기념일', 'N'),
    ]);
  });
  expect(data.holidays).toEqual({ '2026-05-05': ['어린이날', '다른 공휴일'] });
  expect(data.source).toBe('kasi');
  const single = await fetchHolidayYear('2026', key, async () =>
    reply(item(20261005, '대체공휴일')),
  );
  expect(single.holidays['2026-10-05']).toEqual(['대체공휴일']);
  expect(JSON.stringify(single)).not.toContain(key);
});

test('원천 페이지를 모두 확인하고 누락·잘못된 날짜·권한 오류를 정상 빈 목록으로 만들지 않는다', async () => {
  const pages: number[] = [];
  const data = await fetchHolidayYear('2026', key, async (input) => {
    const page = Number(new URL(String(input)).searchParams.get('pageNo'));
    pages.push(page);
    return reply(
      page === 1 ? Array.from({ length: 100 }, () => item(20260101)) : item(20261225),
      101,
      page,
    );
  });
  expect(pages).toEqual([1, 2]);
  expect(Object.keys(data.holidays)).toEqual(['2026-01-01', '2026-12-25']);
  for (const make of [
    () => reply(item(20260230)),
    () => reply(item(20270101)),
    () => reply([], 0),
    () => reply(item(20260101), 201),
    () => Response.json({ response: { header: { resultCode: '30', resultMsg: key } } }),
    () => new Response('<OpenAPI_ServiceResponse>인증 오류</OpenAPI_ServiceResponse>'),
    () => new Response(key, { status: 503 }),
  ]) {
    await expect(fetchHolidayYear('2026', key, async () => make())).rejects.toThrow(
      'HOLIDAYS_UNAVAILABLE',
    );
  }
  await expect(
    fetchHolidayYear('2026', undefined, async () => {
      throw new Error('must not call');
    }),
  ).rejects.toThrow('HOLIDAYS_UNAVAILABLE');
});

test('HTTP 입력 제한·안전한 오류·공개 공휴일 응답을 구분하고 비밀값은 노출하지 않는다', async () => {
  for (const query of [
    '',
    '?year=2026&year=2026',
    '?year=1998',
    '?year=2028',
    '?year=2026&secret=x',
  ]) {
    const response = await holidayResponse(
      new Request('https://app.example/api/holidays' + query),
      async () => {
        throw new Error('unexpected');
      },
      '2026-11-03',
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(holidayYearQuery(new URLSearchParams('year=2027'), '2026-11-03')).toBe('2027');
  const failed = await holidayResponse(
    new Request('https://app.example/api/holidays?year=2026'),
    async () => {
      throw new Error(key);
    },
    '2026-11-03',
  );
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain(key);
  const normal = await holidayResponse(
    new Request('https://app.example/api/holidays?year=2026'),
    async () => ({
      year: '2026',
      holidays: { '2026-10-05': ['대체공휴일'] },
      source: 'kasi',
      fetchedAt: '2026-11-03T00:00:00Z',
    }),
    '2026-11-03',
  );
  expect(normal.status).toBe(200);
  expect(normal.headers.get('cache-control')).toContain('max-age=300');
  expect((await normal.json()).data.holidays['2026-10-05']).toEqual(['대체공휴일']);
  expect(new HolidayError().message).toBe('HOLIDAYS_UNAVAILABLE');
});

test('공휴일은 토요일보다 우선하고 일요일 빨강·일반 토요일 파랑을 유지한다', () => {
  expect(dateTone('2026-10-03', ['개천절'])).toBe('holiday');
  expect(dateTone('2026-10-05', ['대체공휴일'])).toBe('holiday');
  expect(dateTone('2026-10-10')).toBe('saturday');
  expect(dateTone('2026-10-04')).toBe('holiday');
  expect(dateTone('2026-10-06')).toBe('');
  expect(dateTone('bad')).toBe('');
});
