import type { loadAuthConfig } from '../auth/config';
import { AuthServiceError } from '../auth/service';
import { createDatabaseRequest } from '../database';
import { isProfileEmoji, normalizeNickname } from '../../features/auth/validation';
import { isDateKey } from '../../lib/seoul-date';
import { isUuid, isTimestamp, type RecordQuery } from '../records/query';
import type { CalendarDay, StudyMember } from '../../features/calendar/types';
import { calendarDays, type CalendarRecord } from './aggregate';

const unavailable = () => new AuthServiceError(503, 'AUTH_UNAVAILABLE');
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export type CalendarDatabase = {
  listMembers(groupId: string): Promise<StudyMember[]>;
  getCalendar(
    query: Extract<RecordQuery, { kind: 'period' }>,
    actorId: string,
    groupId: string,
  ): Promise<CalendarDay[]>;
};

export function createCalendarDatabase(
  config: ReturnType<typeof loadAuthConfig>,
  transport: typeof fetch = fetch,
  observeRequest?: (milliseconds: number) => void,
): CalendarDatabase {
  const request = createDatabaseRequest(config, transport, observeRequest);
  async function listMembers(groupId: string): Promise<StudyMember[]> {
    if (!isUuid(groupId)) throw unavailable();
    const members: StudyMember[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ;) {
      const query = new URLSearchParams({
        select: 'group_id,user_id,joined_at,profile:users!inner(id,nickname,emoji)',
        group_id: `eq.${groupId}`,
        order: 'joined_at.asc,user_id.asc',
        limit: '16',
        offset: String(offset),
      });
      const rows = await request(`group_members?${query}`);
      if (!Array.isArray(rows) || rows.length > 16) throw unavailable();
      for (const row of rows) {
        if (
          !object(row) ||
          row.group_id !== groupId ||
          !isUuid(row.user_id) ||
          !isTimestamp(row.joined_at) ||
          !object(row.profile) ||
          row.profile.id !== row.user_id ||
          !normalizeNickname(row.profile.nickname) ||
          !isProfileEmoji(row.profile.emoji) ||
          seen.has(row.user_id)
        )
          throw unavailable();
        seen.add(row.user_id);
        members.push({
          id: row.user_id,
          nickname: row.profile.nickname as string,
          emoji: row.profile.emoji,
          joinedAt: row.joined_at,
        });
      }
      if (members.length > 15) throw unavailable();
      if (!rows.length) return members;
      offset += rows.length;
    }
  }
  return {
    listMembers,
    async getCalendar(input, actorId, groupId) {
      if (!isUuid(actorId) || !isUuid(groupId)) throw unavailable();
      const members = await listMembers(groupId);
      const memberIds = new Set(members.map((member) => member.id));
      if (!memberIds.has(actorId)) throw new AuthServiceError(401, 'UNAUTHORIZED');
      const query = new URLSearchParams({
        select: 'id,group_id,user_id,study_date,minutes',
        group_id: `eq.${groupId}`,
        order: 'id.asc',
        limit: '100',
      });
      query.append('study_date', `gte.${input.from}`);
      query.append('study_date', `lte.${input.to}`);
      if (input.scope === 'mine') query.set('user_id', `eq.${actorId}`);
      const records: CalendarRecord[] = [];
      let after = '';
      for (;;) {
        if (after) query.set('id', `gt.${after}`);
        const rows = await request(`study_records?${query}`);
        if (!Array.isArray(rows) || rows.length > 100) throw unavailable();
        for (const row of rows) {
          if (
            !object(row) ||
            !isUuid(row.id) ||
            row.id <= after ||
            row.group_id !== groupId ||
            !isUuid(row.user_id) ||
            !memberIds.has(row.user_id) ||
            (input.scope === 'mine' && row.user_id !== actorId) ||
            !isDateKey(row.study_date) ||
            row.study_date < input.from ||
            row.study_date > input.to ||
            !Number.isInteger(row.minutes) ||
            (row.minutes as number) < 1 ||
            (row.minutes as number) > 1440
          )
            throw unavailable();
          records.push({
            id: row.id,
            userId: row.user_id,
            studyDate: row.study_date,
            minutes: row.minutes as number,
          });
          after = row.id;
        }
        if (!rows.length) break;
      }
      return calendarDays(input.from, input.to, records, members);
    },
  };
}
