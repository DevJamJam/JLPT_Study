import type { StudyMember } from '../calendar/types';
import type { StudyRecord } from '../study-record/types';

export type HomeSummary = {
  userId: string;
  groupId: string;
  today: string;
  todayMinutes: number;
  weekStart: string;
  weekMinutes: number;
  month: string;
  monthMinutes: number;
  groupTodayMinutes: number;
  todayParticipants: StudyMember[];
  recentRecords: StudyRecord[];
};
