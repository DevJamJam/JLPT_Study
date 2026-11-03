'use client';

import { useQueries } from '@tanstack/react-query';
import { AuthClientError, jsonRequest } from '../auth/client';
import { isDateKey } from '@/lib/seoul-date';
import { dateTone, type HolidayYear } from '@/lib/holidays';

async function holidayRequest(year: string, signal: AbortSignal) {
  const data = await jsonRequest<HolidayYear>(
    `/api/holidays?year=${year}`,
    undefined,
    AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  );
  if (
    !data ||
    data.year !== year ||
    data.source !== 'kasi' ||
    !Number.isFinite(Date.parse(data.fetchedAt)) ||
    !data.holidays ||
    typeof data.holidays !== 'object' ||
    Array.isArray(data.holidays) ||
    Object.entries(data.holidays).some(
      ([date, names]) =>
        !isDateKey(date) ||
        !date.startsWith(year + '-') ||
        !Array.isArray(names) ||
        !names.length ||
        names.length > 10 ||
        names.some((name) => typeof name !== 'string' || !name.trim() || name.length > 100),
    )
  )
    throw new AuthClientError(503, 'HOLIDAYS_UNAVAILABLE');
  return data;
}
export function useHolidays(from: string, to: string) {
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
  const queries = useQueries({
    queries: years.map((year) => ({
      queryKey: ['holidays', year],
      queryFn: ({ signal }: { signal: AbortSignal }) => holidayRequest(year, signal),
      staleTime: 3600000,
      refetchInterval: 3600000,
      retry: false,
    })),
  });
  const names = (date: string) =>
    queries[years.indexOf(date.slice(0, 4))]?.data?.holidays[date] ?? [];
  return {
    names,
    tone: (date: string) => dateTone(date, names(date)),
    failed: queries.some((query) => query.isError),
    stale: queries.some(
      (query) => query.data && query.dataUpdatedAt - Date.parse(query.data.fetchedAt) > 90000000,
    ),
    pending: queries.some((query) => query.isPending),
    fetching: queries.some((query) => query.isFetching),
    refresh: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
