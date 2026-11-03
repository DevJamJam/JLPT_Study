import type { StudyRecord } from '../../features/study-record/types';
import type { MonthSummary } from '../../features/dashboard/types';
import { AuthServiceError } from '../auth/service';

export function monthSummary(
  month: string,
  userId: string,
  groupId: string,
  records: StudyRecord[],
  categories: { id: string; name: string }[],
): MonthSummary {
  const days = new Map<string, number>();
  const totals = new Map(categories.map((category) => [category.id, 0]));
  for (const record of records) {
    if (
      record.userId !== userId ||
      record.groupId !== groupId ||
      record.studyDate.slice(0, 7) !== month ||
      !totals.has(record.categoryId)
    )
      throw new AuthServiceError(503, 'AUTH_UNAVAILABLE');
    days.set(record.studyDate, (days.get(record.studyDate) ?? 0) + record.minutes);
    totals.set(record.categoryId, totals.get(record.categoryId)! + record.minutes);
  }
  const totalMinutes = [...days.values()].reduce((sum, minutes) => sum + minutes, 0);
  return {
    userId,
    groupId,
    month,
    totalMinutes,
    studyDays: days.size,
    recordCount: records.length,
    averageMinutes: days.size ? Math.round(totalMinutes / days.size) : 0,
    longestMinutes: Math.max(0, ...days.values()),
    categories: categories.map(({ id, name }) => ({
      categoryId: id,
      name,
      minutes: totals.get(id)!,
    })),
  };
}
