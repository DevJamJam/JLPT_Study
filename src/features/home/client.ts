import { AuthClientError, jsonRequest } from '../auth/client';
import { isDateKey } from '@/lib/seoul-date';
import { monday } from '../calendar/dates';
import type { HomeSummary } from './types';

export async function summaryRequest(userId: string, groupId: string, signal?: AbortSignal) {
  const data = await jsonRequest<HomeSummary>(
    '/api/summary',
    undefined,
    signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  );
  if (
    data.userId !== userId ||
    data.groupId !== groupId ||
    !Array.isArray(data.recentRecords) ||
    data.recentRecords.some((record) => record.userId !== userId || record.groupId !== groupId)
  )
    throw new AuthClientError(409, 'ACCOUNT_CHANGED');
  if (
    !isDateKey(data.today) ||
    data.weekStart !== monday(data.today) ||
    data.month !== data.today.slice(0, 7) ||
    [data.todayMinutes, data.weekMinutes, data.monthMinutes, data.groupTodayMinutes].some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    ) ||
    !Array.isArray(data.todayParticipants) ||
    data.recentRecords.length > 5 ||
    data.recentRecords.some(
      (record) => !isDateKey(record.studyDate) || record.studyDate > data.today,
    )
  )
    throw new AuthClientError(503, 'AUTH_UNAVAILABLE');
  return data;
}
