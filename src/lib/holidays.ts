import { isDateKey } from './seoul-date';

export type HolidayYear = {
  year: string;
  holidays: Record<string, string[]>;
  fetchedAt: string;
  source: 'kasi';
};
export function dateTone(date: string, names: readonly string[] = []) {
  if (!isDateKey(date)) return '';
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return names.length || weekday === 0 ? 'holiday' : weekday === 6 ? 'saturday' : '';
}
