import type { StudyMember } from '../calendar/types';

export type WeekMember = StudyMember & {
  days: { date: string; minutes: number }[];
  totalMinutes: number;
  studyDays: number;
};
export type StudyWeek = {
  weekStart: string;
  totalMinutes: number;
  activeMembers: number;
  members: WeekMember[];
};
