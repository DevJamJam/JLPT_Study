'use client';

import type { Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StudyDialog } from '@/components/ui/StudyDialog';
import { Button } from '@/components/ui/Button';
import { expiredQuery } from '../calendar/client';
import type { NavigationGuard } from '../calendar/navigation';
import { RecordForm } from './RecordForm';
import { RecordDelete } from './RecordDelete';
import { readOwnRecord, recordError } from './client';
import type { StudyRecord } from './types';

export function RecordAction({
  action,
  id,
  today,
  userId,
  groupId,
  navigationRef,
  onClose,
  onSaved,
  onDeleted,
}: {
  action: 'edit' | 'delete';
  id: string;
  today: string;
  userId: string;
  groupId: string;
  navigationRef: Ref<NavigationGuard>;
  onClose: () => void;
  onSaved: (record: StudyRecord) => void;
  onDeleted: () => void;
}) {
  const query = useQuery({
    queryKey: ['records', userId, groupId, 'edit', id],
    queryFn: () => readOwnRecord(id, userId, groupId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!query.data)
    return (
      <StudyDialog title="공부 기록 확인" onClose={onClose}>
        {query.isPending ? (
          <p role="status">기록을 불러오고 있어요…</p>
        ) : (
          <>
            <p role="alert">{recordError(query.error)}</p>
            {expiredQuery(query.error) && <a href="/login">다시 로그인</a>}
            <Button onClick={() => void query.refetch()}>기록 다시 불러오기</Button>
          </>
        )}
      </StudyDialog>
    );
  return action === 'edit' ? (
    <RecordForm
      record={query.data}
      today={today}
      userId={userId}
      groupId={groupId}
      navigationRef={navigationRef}
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : (
    <RecordDelete
      record={query.data}
      userId={userId}
      groupId={groupId}
      navigationRef={navigationRef}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}
