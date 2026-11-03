import type { CalendarRecord } from '../calendar/aggregate';
import type { StudyMember } from '../../features/calendar/types';
import { monday } from '../../features/calendar/dates';

export function homeTotals(
  today: string,
  actorId: string,
  records: CalendarRecord[],
  members: StudyMember[],
) {
  const weekStart = monday(today);
  const month = today.slice(0, 7);
  const mine = records.filter((record) => record.userId === actorId && record.studyDate <= today);
  const todayRecords = records.filter((record) => record.studyDate === today);
  const participants = new Set(todayRecords.map((record) => record.userId));
  const sum = (rows: CalendarRecord[]) => rows.reduce((total, record) => total + record.minutes, 0);
  return {
    today,
    todayMinutes: sum(mine.filter((record) => record.studyDate === today)),
    weekStart,
    weekMinutes: sum(mine.filter((record) => record.studyDate >= weekStart)),
    month,
    monthMinutes: sum(mine.filter((record) => record.studyDate.startsWith(month))),
    groupTodayMinutes: sum(todayRecords),
    todayParticipants: members.filter((member) => participants.has(member.id)),
  };
}
