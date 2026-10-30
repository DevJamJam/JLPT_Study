import { isDateKey, seoulDateKey } from '../../lib/seoul-date';
import { monday } from '../../features/calendar/dates';
import { RecordRequestError } from '../records/create';

export function parseStudyWeek(params: URLSearchParams, today = seoulDateKey()) {
  const week = params.get('week');
  if (
    params.size !== 1 ||
    !isDateKey(week) ||
    week < '1999-12-27' ||
    week > monday(today) ||
    monday(week) !== week
  )
    throw new RecordRequestError(400, 'VALIDATION_ERROR');
  return week;
}
