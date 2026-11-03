import { unstable_cache } from 'next/cache';
import { fetchHolidayYear, holidayResponse } from '@/server/holidays/service';
import { seoulDateKey } from '@/lib/seoul-date';

export const runtime = 'nodejs';
// 개인 정보가 없는 공휴일 데이터만 연도별로 공유한다. 검증 실패는 캐시에 저장하지 않는다.
const loadYear = unstable_cache(
  (year: string) => fetchHolidayYear(year, process.env.DATA_GO_KR_SERVICE_KEY),
  ['kasi-public-holidays-v1'],
  { revalidate: 86400 },
);
export async function GET(request: Request) {
  return holidayResponse(request, loadYear, seoulDateKey());
}
