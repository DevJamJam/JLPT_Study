import { isDateKey } from '../../lib/seoul-date';

export const shiftDate = (date: string, offset: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
export function monday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}
export const monthDates = (month: string) =>
  Array.from({ length: 42 }, (_, index) => shiftDate(monday(`${month}-01`), index));
export const duration = (minutes: number) =>
  minutes < 60
    ? `${minutes}분`
    : `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}`;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export type CalendarRoute = ReturnType<typeof calendarRoute>;
export function calendarRoute(search: string, today: string) {
  const raw = new URLSearchParams(search);
  const params = new URLSearchParams();
  const view = ['group', 'mine', 'week'].includes(raw.get('view') ?? '')
    ? (raw.get('view') as 'group' | 'mine' | 'week')
    : 'group';
  const requestedMonth = raw.get('month') ?? today.slice(0, 7);
  const month =
    /^\d{4}-\d{2}$/.test(requestedMonth) &&
    isDateKey(`${requestedMonth}-01`) &&
    requestedMonth >= '2000-01' &&
    requestedMonth <= today.slice(0, 7)
      ? requestedMonth
      : today.slice(0, 7);
  const requestedWeek = raw.get('week') ?? monday(today);
  const week =
    isDateKey(requestedWeek) &&
    requestedWeek >= '1999-12-27' &&
    requestedWeek <= monday(today) &&
    monday(requestedWeek) === requestedWeek
      ? requestedWeek
      : monday(today);
  params.set('view', view);
  params.set('month', month);
  params.set('week', week);
  const date = raw.get('date');
  const scope = raw.get('scope') === 'mine' ? 'mine' : 'group';
  const panel = raw.get('panel');
  const recordId = raw.get('recordId');
  let invalidPopup = raw.has('scope') && !['mine', 'group'].includes(raw.get('scope')!);
  if (date && isDateKey(date) && date >= '2000-01-01') {
    params.set('date', date);
    params.set('scope', scope);
    if (panel === 'new' && date <= today) {
      params.set('panel', panel);
      if (raw.get('direct') === '1') params.set('direct', '1');
    } else if ((panel === 'edit' || panel === 'delete') && recordId && uuid.test(recordId)) {
      params.set('panel', panel);
      params.set('recordId', recordId.toLowerCase());
    } else if (panel) invalidPopup = true;
  } else if (date || panel || recordId || raw.has('scope')) invalidPopup = true;
  if (invalidPopup)
    for (const key of ['date', 'scope', 'panel', 'recordId', 'direct']) params.delete(key);
  const dates =
    view === 'week'
      ? Array.from({ length: 7 }, (_, index) => shiftDate(week, index))
      : monthDates(month);
  return {
    view,
    month,
    week,
    dates,
    from: dates[0] < '2000-01-01' ? '2000-01-01' : dates[0],
    to: dates.at(-1)!,
    date: params.get('date'),
    scope: params.get('scope') as 'mine' | 'group' | null,
    panel: params.get('panel') as 'new' | 'edit' | 'delete' | null,
    recordId: params.get('recordId'),
    direct: params.has('direct'),
    canonical: params.toString(),
    invalidPopup,
  };
}
