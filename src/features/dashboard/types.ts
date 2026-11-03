export type MonthSummary = {
  userId: string;
  groupId: string;
  month: string;
  totalMinutes: number;
  studyDays: number;
  recordCount: number;
  averageMinutes: number;
  longestMinutes: number;
  categories: { categoryId: string; name: string; minutes: number }[];
};
