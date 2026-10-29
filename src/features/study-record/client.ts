import { jsonRequest, AuthClientError } from '../auth/client';
import type { RecordPage, StudyRecord } from './types';
import type { RecordInput } from './validation';

export type Category = { id: string; name: string };
export const categoriesRequest = (signal?: AbortSignal) =>
  jsonRequest<{ categories: Category[] }>(
    '/api/categories',
    undefined,
    signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : undefined,
  );
export async function recordsRequest(
  month: string,
  cursor: string | null,
  userId: string,
  groupId: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ scope: 'mine', month, limit: '30' });
  if (cursor) query.set('cursor', cursor);
  const result = await jsonRequest<RecordPage>(
    `/api/records?${query}`,
    undefined,
    signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : undefined,
  );
  if (result.records.some((record) => record.userId !== userId || record.groupId !== groupId))
    throw new AuthClientError(409, 'ACCOUNT_CHANGED');
  return result;
}
export const saveRecordRequest = (input: RecordInput & { id: string; expectedUserId: string }) =>
  jsonRequest<{ record: StudyRecord }>('/api/records', input);
export function recordError(error: unknown) {
  if (error instanceof AuthClientError) {
    if (error.code === 'ACCOUNT_CHANGED')
      return '다른 창에서 로그인 계정이 바뀌었어요. 현재 계정을 확인해주세요.';
    if (error.status === 401) return '세션이 만료되었어요. 입력을 유지한 채 다시 로그인해주세요.';
    if (error.code === 'PIN_CHANGE_REQUIRED')
      return '비밀번호가 초기화되었어요. 다시 로그인해 새 비밀번호를 정해주세요.';
    if (error.code === 'DAILY_LIMIT_EXCEEDED') return '하루 공부 시간은 1440분을 넘을 수 없어요.';
    if (error.code === 'IDEMPOTENCY_CONFLICT')
      return '같은 저장 요청의 내용이 달라졌어요. 저장된 기록을 먼저 확인해주세요.';
    if (error.code === 'RECORD_DELETED')
      return '이미 삭제된 기록이에요. 저장된 기록을 다시 확인해주세요.';
  }
  return '연결을 확인하고 다시 시도해주세요. 입력한 내용은 그대로 남아 있어요.';
}
