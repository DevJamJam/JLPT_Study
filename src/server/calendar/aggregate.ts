import type { CalendarDay, StudyMember } from '../../features/calendar/types';

export type CalendarRecord = { id: string; userId: string; studyDate: string; minutes: number };

/** Inputs have already passed DB DTO validation; order comes from membership, not record count. */
export function calendarDays(
  from: string,
  to: string,
  records: CalendarRecord[],
  members: StudyMember[],
): CalendarDay[] {
  const sums = new Map<string, Map<string, number>>();
  for (const record of records) {
    let day = sums.get(record.studyDate);
    if (!day) {
      day = new Map();
      sums.set(record.studyDate, day);
    }
    day.set(record.userId, (day.get(record.userId) ?? 0) + record.minutes);
  }
  const days: CalendarDay[] = [];
  const date = new Date(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (date.getTime() <= end) {
    const key = date.toISOString().slice(0, 10);
    const sum = sums.get(key);
    const participants = members.flatMap((member) =>
      sum?.has(member.id) ? [{ userId: member.id, minutes: sum.get(member.id)! }] : [],
    );
    days.push({
      date: key,
      totalMinutes: participants.reduce((total, person) => total + person.minutes, 0),
      participants,
    });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}
