import { isDateKey } from '../../lib/seoul-date';
import type { HolidayYear } from '../../lib/holidays';

export class HolidayError extends Error {
  constructor(public readonly status = 503) {
    super(status === 400 ? 'VALIDATION_ERROR' : 'HOLIDAYS_UNAVAILABLE');
  }
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HolidayError();
  return value as Record<string, unknown>;
};
export function holidayYearQuery(params: URLSearchParams, today: string) {
  const year = params.get('year');
  if (
    params.size !== 1 ||
    !year ||
    !/^\d{4}$/.test(year) ||
    Number(year) < 1999 ||
    Number(year) > Number(today.slice(0, 4)) + 1
  )
    throw new HolidayError(400);
  return year;
}
export async function fetchHolidayYear(
  year: string,
  key: string | undefined,
  transport: typeof fetch = fetch,
): Promise<HolidayYear> {
  try {
    const serviceKey = key?.trim();
    if (!/^\d{4}$/.test(year) || !serviceKey || serviceKey.length > 2048 || /\s/.test(serviceKey))
      throw new HolidayError();
    const holidays: Record<string, string[]> = {};
    let total: number | undefined;
    let received = 0;
    for (let page = 1; page <= 2; page++) {
      const url = new URL(
        'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo',
      );
      url.search = new URLSearchParams({
        serviceKey,
        solYear: year,
        _type: 'json',
        numOfRows: '100',
        pageNo: String(page),
      }).toString();
      const response = await transport(url, {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 262144)
        throw new HolidayError();
      const text = await response.text();
      if (text.length > 262144) throw new HolidayError();
      const root = object(object(JSON.parse(text)).response);
      const header = object(root.header);
      if (header.resultCode !== '00') throw new HolidayError();
      const body = object(root.body);
      if (
        !Number.isInteger(body.totalCount) ||
        Number(body.totalCount) < 1 ||
        Number(body.totalCount) > 200 ||
        body.pageNo !== page
      )
        throw new HolidayError();
      if (total !== undefined && total !== body.totalCount) throw new HolidayError();
      total = Number(body.totalCount);
      const raw = object(body.items).item;
      const items = Array.isArray(raw) ? raw : [raw];
      if (!items.length || items.length > 100 || received + items.length > total)
        throw new HolidayError();
      for (const item of items) {
        const row = object(item);
        const value = String(row.locdate);
        const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
        if (
          !/^\d{8}$/.test(value) ||
          !value.startsWith(year) ||
          !isDateKey(date) ||
          !['Y', 'N'].includes(String(row.isHoliday)) ||
          typeof row.dateName !== 'string' ||
          !row.dateName.trim() ||
          row.dateName.length > 100 ||
          /[\u0000-\u001f]/.test(row.dateName)
        )
          throw new HolidayError();
        if (row.isHoliday !== 'Y') continue;
        const names = holidays[date] ?? [];
        if (!names.includes(row.dateName.trim())) names.push(row.dateName.trim());
        holidays[date] = names;
      }
      received += items.length;
      if (received === total) {
        if (!Object.keys(holidays).length) throw new HolidayError();
        return { year, holidays, source: 'kasi', fetchedAt: new Date().toISOString() };
      }
    }
    throw new HolidayError();
  } catch {
    // 원천 URL과 응답에는 인증키가 포함될 수 있으므로 오류 원문을 전달·기록하지 않는다.
    throw new HolidayError();
  }
}
export async function holidayResponse(
  request: Request,
  loadYear: (year: string) => Promise<HolidayYear>,
  today: string,
) {
  try {
    const year = holidayYearQuery(new URL(request.url).searchParams, today);
    const data = await loadYear(year);
    return Response.json({ data }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    const known = error instanceof HolidayError ? error : new HolidayError();
    return Response.json(
      { error: { code: known.message } },
      { status: known.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
