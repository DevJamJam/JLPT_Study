import { AuthClientError, jsonRequest } from '../auth/client';
import type { CalendarDay, StudyMember } from './types';
import type { StudyRecord, RecordPage } from '../study-record/types';
import { isDateKey } from '@/lib/seoul-date';

const signalFor = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : undefined;
export const expiredQuery = (error: unknown) =>
  error instanceof AuthClientError &&
  (error.status === 401 ||
    ['ACCOUNT_CHANGED', 'PIN_CHANGE_REQUIRED', 'FORBIDDEN'].includes(error.code));
export async function membersRequest(signal?: AbortSignal) {
  return jsonRequest<{ members: StudyMember[] }>('/api/members', undefined, signalFor(signal));
}
export async function calendarRequest(
  scope: 'mine' | 'group',
  from: string,
  to: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ scope, from, to });
  const data = await jsonRequest<{ days: CalendarDay[] }>(
    `/api/calendar?${query}`,
    undefined,
    signalFor(signal),
  );
  if (
    !Array.isArray(data.days) ||
    data.days.some(
      (day) =>
        !isDateKey(day.date) ||
        day.date < from ||
        day.date > to ||
        !Number.isInteger(day.totalMinutes) ||
        day.totalMinutes < 0 ||
        !Array.isArray(day.participants),
    )
  )
    throw new AuthClientError(503, 'AUTH_UNAVAILABLE');
  return data;
}
export async function periodRecordsRequest(
  scope: 'mine' | 'group',
  from: string,
  to: string,
  userId: string,
  groupId: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ scope, from, to });
  const data = await jsonRequest<RecordPage>(`/api/records?${query}`, undefined, signalFor(signal));
  if (
    data.records.some(
      (record) => record.groupId !== groupId || (scope === 'mine' && record.userId !== userId),
    )
  )
    throw new AuthClientError(409, 'ACCOUNT_CHANGED');
  if (
    data.records.some(
      (record) => !isDateKey(record.studyDate) || record.studyDate < from || record.studyDate > to,
    )
  )
    throw new AuthClientError(503, 'AUTH_UNAVAILABLE');
  return data.records;
}
const preciseTime = (value: string) => {
  const [whole, fraction = ''] = value.replace(/(?:Z|\+00:00)$/, '').split('.');
  return `${whole}.${fraction.padEnd(6, '0')}`;
};
export function dayRecords(records: StudyRecord[]) {
  return [...records].sort(
    (a, b) =>
      (a.startTime ?? '24:00').localeCompare(b.startTime ?? '24:00') ||
      preciseTime(a.createdAt).localeCompare(preciseTime(b.createdAt)) ||
      a.id.localeCompare(b.id),
  );
}
