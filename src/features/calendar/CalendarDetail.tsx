'use client';

import { useQuery } from '@tanstack/react-query';
import { StudyDialog } from '@/components/ui/StudyDialog';
import { Button } from '@/components/ui/Button';
import type { StudyMember } from './types';
import type { StudyRecord } from '../study-record/types';
import { dayRecords, expiredQuery, periodRecordsRequest } from './client';
import { duration } from './dates';
import styles from '@/styles/notebook.module.css';
import extra from './CalendarWorkspace.module.css';

export function CalendarDetail({
  date,
  scope,
  today,
  userId,
  groupId,
  members,
  onClose,
  onNew,
  onEdit,
  onDelete,
}: {
  date: string;
  scope: 'mine' | 'group';
  today: string;
  userId: string;
  groupId: string;
  members: StudyMember[];
  onClose: () => void;
  onNew: () => void;
  onEdit: (record: StudyRecord) => void;
  onDelete: (record: StudyRecord) => void;
}) {
  const query = useQuery({
    queryKey: ['records', userId, groupId, 'day', scope, date],
    queryFn: ({ signal }) => periodRecordsRequest(scope, date, date, userId, groupId, signal),
    staleTime: 0,
    retry: false,
  });
  const blocked = expiredQuery(query.error);
  const records = query.data ?? [];
  const groups = scope === 'mine' ? members.filter((member) => member.id === userId) : members;
  return (
    <StudyDialog title={`${date} 공부 기록`} onClose={onClose}>
      {query.isPending && <p role="status">날짜 기록을 불러오고 있어요…</p>}
      {query.isError && (
        <div>
          <p role="alert" className={styles.error}>
            {blocked
              ? '세션을 다시 확인해주세요. 로그인 후 기록을 불러올 수 있어요.'
              : '날짜 기록을 불러오지 못했어요. 다시 시도해주세요.'}
          </p>
          {blocked && <a href="/login">다시 로그인</a>}
          <Button variant="quiet" onClick={() => void query.refetch()}>
            날짜 기록 다시 불러오기
          </Button>
        </div>
      )}
      {!blocked && query.data && (
        <>
          <p className={styles.detailHeading}>
            {scope === 'group' ? '함께 공부한 시간' : '내 공부 시간'} ·{' '}
            {duration(records.reduce((sum, record) => sum + record.minutes, 0))}
          </p>
          {!records.length && (
            <p className={styles.empty}>아직 기록이 없어요. 공부 기록을 남겨 보아요.</p>
          )}
          {groups.map((member) => {
            const own = dayRecords(records.filter((record) => record.userId === member.id));
            if (!own.length) return null;
            return (
              <section className={extra.memberSection} key={member.id}>
                <h3>
                  {member.emoji} {member.nickname} ·{' '}
                  {duration(own.reduce((sum, record) => sum + record.minutes, 0))}
                </h3>
                {own.map((record) => (
                  <article className={styles.record} key={record.id}>
                    <div>
                      <strong>
                        {record.categoryName} · {duration(record.minutes)}
                      </strong>
                      {record.startTime && (
                        <span className={styles.muted}>시작 {record.startTime}</span>
                      )}
                      {record.quantity && (
                        <span className={styles.muted}>
                          {record.quantity}
                          {
                            ({ item: '개', page: '쪽', question: '문제' } as const)[
                              record.quantityUnit!
                            ]
                          }
                        </span>
                      )}
                      {record.memo && <p>{record.memo}</p>}
                    </div>
                    {record.userId === userId && (
                      <div className={extra.recordButtons}>
                        <Button variant="quiet" onClick={() => onEdit(record)}>
                          수정
                        </Button>
                        <Button variant="quiet" onClick={() => onDelete(record)}>
                          삭제
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </>
      )}
      <Button
        className={styles.fullWidth}
        disabled={date > today || blocked || query.isPending}
        onClick={onNew}
      >
        ＋ 공부 기록 남기기
      </Button>
      {date > today && <p className={styles.muted}>미래 날짜에는 기록을 추가할 수 없어요.</p>}
    </StudyDialog>
  );
}
