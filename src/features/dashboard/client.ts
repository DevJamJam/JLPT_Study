import { AuthClientError, jsonRequest } from '../auth/client';
import type { MonthSummary } from './types';

export async function dashboardRequest(
  month: string,
  userId: string,
  groupId: string,
  signal?: AbortSignal,
) {
  const data = await jsonRequest<MonthSummary>(
    `/api/me/dashboard?${new URLSearchParams({ month })}`,
    undefined,
    signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  );
  if (!data || data.userId !== userId || data.groupId !== groupId)
    throw new AuthClientError(409, 'ACCOUNT_CHANGED');
  const nonnegative = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (
    data.month !== month ||
    ![
      data.totalMinutes,
      data.studyDays,
      data.recordCount,
      data.averageMinutes,
      data.longestMinutes,
    ].every(nonnegative) ||
    data.studyDays > 31 ||
    !Array.isArray(data.categories) ||
    data.categories.some(
      (c) => !c.categoryId || typeof c.name !== 'string' || !nonnegative(c.minutes),
    ) ||
    new Set(data.categories.map((c) => c.categoryId)).size !== data.categories.length ||
    data.categories.reduce((sum, c) => sum + c.minutes, 0) !== data.totalMinutes ||
    data.averageMinutes !== (data.studyDays ? Math.round(data.totalMinutes / data.studyDays) : 0) ||
    data.longestMinutes > data.totalMinutes ||
    data.studyDays > data.recordCount ||
    (data.studyDays === 0 &&
      (data.totalMinutes !== 0 || data.recordCount !== 0 || data.longestMinutes !== 0))
  )
    throw new AuthClientError(503, 'AUTH_UNAVAILABLE');
  return data;
}
