import { calendarDays, type CalendarRecord } from '../calendar/aggregate';
import { shiftDate } from '../../features/calendar/dates';
import type { StudyMember } from '../../features/calendar/types';
import type { StudyWeek } from '../../features/study/types';

export function weeklyStudy(
  week: string,
  records: CalendarRecord[],
  members: StudyMember[],
): StudyWeek {
  const dates = calendarDays(week, shiftDate(week, 6), records, members);
  const people = members.map((member) => {
    const days = dates.map((day) => ({
      date: day.date,
      minutes: day.participants.find((person) => person.userId === member.id)?.minutes ?? 0,
    }));
    return {
      ...member,
      days,
      totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0),
      studyDays: days.filter((day) => day.minutes > 0).length,
    };
  });
  return {
    weekStart: week,
    totalMinutes: people.reduce((sum, member) => sum + member.totalMinutes, 0),
    activeMembers: people.filter((member) => member.studyDays > 0).length,
    members: people,
  };
}
