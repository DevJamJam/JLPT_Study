import type { RecordInput } from './validation';

export type StudyRecord = RecordInput & {
  id: string;
  userId: string;
  groupId: string;
  categoryName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RecordPage = { records: StudyRecord[]; nextCursor: string | null };
