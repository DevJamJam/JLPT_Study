export type StudyMember = {
  id: string;
  nickname: string;
  emoji: string;
  joinedAt: string;
};
export type CalendarDay = {
  date: string;
  totalMinutes: number;
  participants: { userId: string; minutes: number }[];
};
