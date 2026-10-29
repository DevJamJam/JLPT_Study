'use client';

import { useEffect, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { seoulDateKey } from '@/lib/seoul-date';
import { toast } from '@/lib/notifications';
import { AuthClientError } from '../auth/client';
import { RecordDelete } from './RecordDelete';
import { RecordForm } from './RecordForm';
import { recordsRequest } from './client';
import type { StudyRecord } from './types';
import styles from './RecordWorkspace.module.css';

export function RecordWorkspace(props: { userId: string; groupId: string }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <Records {...props} />
    </QueryClientProvider>
  );
}
function Records({ userId, groupId }: { userId: string; groupId: string }) {
  const [today, setToday] = useState(seoulDateKey);
  const [month, setMonth] = useState(() => seoulDateKey().slice(0, 7));
  const [panel, setPanel] = useState<
    { kind: 'new' } | { kind: 'edit' | 'delete'; record: StudyRecord } | null
  >(null);
  const [savedNotice, setSavedNotice] = useState<{ id: number; message: string }>({
    id: 0,
    message: '',
  });
  useEffect(() => {
    if (savedNotice.id) void toast(savedNotice.message);
  }, [savedNotice]);
  const client = useQueryClient();
  useEffect(() => {
    function refreshDay() {
      if (document.visibilityState === 'hidden') return;
      const next = seoulDateKey();
      setMonth((value) => (value === today.slice(0, 7) ? next.slice(0, 7) : value));
      setToday(next);
    }
    const timer = window.setInterval(refreshDay, 60_000);
    window.addEventListener('focus', refreshDay);
    window.addEventListener('online', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshDay);
      window.removeEventListener('online', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
    };
  }, [today]);
  const query = useInfiniteQuery({
    queryKey: ['records', userId, groupId, 'mine', month],
    queryFn: ({ pageParam, signal }) => recordsRequest(month, pageParam, userId, groupId, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 0,
    retry: false,
  });
  const records = query.data?.pages.flatMap((page) => page.records) ?? [];
  const expired =
    query.error instanceof AuthClientError &&
    (query.error.status === 401 ||
      query.error.code === 'PIN_CHANGE_REQUIRED' ||
      query.error.code === 'ACCOUNT_CHANGED');
  function move(direction: number) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    const next = date.toISOString().slice(0, 7);
    if (next >= '2000-01' && next <= today.slice(0, 7)) setMonth(next);
  }
  function saved(record: StudyRecord) {
    setMonth(record.studyDate.slice(0, 7));
    setPanel(null);
    void client
      .cancelQueries({ queryKey: ['records', userId, groupId] })
      .then(() => client.invalidateQueries({ queryKey: ['records', userId, groupId] }));
    setSavedNotice((value) => ({ id: value.id + 1, message: '공부 기록을 저장했어요.' }));
  }
  function deleted() {
    setPanel(null);
    void client
      .cancelQueries({ queryKey: ['records', userId, groupId] })
      .then(() => client.invalidateQueries({ queryKey: ['records', userId, groupId] }));
    setSavedNotice((value) => ({ id: value.id + 1, message: '공부 기록을 삭제했어요.' }));
  }
  return (
    <section className={styles.workspace} aria-labelledby="records-title">
      <div className={styles.heading}>
        <h2 id="records-title">내 기록</h2>
        <Button onClick={() => setPanel({ kind: 'new' })}>공부 기록 남기기</Button>
      </div>
      <p className={styles.help}>하루하루 쌓아가는 나의 공부 기록</p>
      <PeriodPicker
        label={`${month.slice(0, 4)}년 ${Number(month.slice(5))}월`}
        onMove={move}
        previousDisabled={month === '2000-01'}
        nextDisabled={month >= today.slice(0, 7)}
      />
      <div className={styles.actions}>
        <Button variant="quiet" disabled={query.isFetching} onClick={() => void query.refetch()}>
          기록 새로고침
        </Button>
        {query.isFetching && (
          <span role="status" className={styles.help}>
            기록을 확인하고 있어요…
          </span>
        )}
      </div>
      {query.isError && (
        <div>
          <p role="alert" className={styles.error}>
            {expired
              ? '세션을 다시 확인해주세요. 로그인 후 기록을 다시 불러올 수 있어요.'
              : '기록을 불러오지 못했어요. 다시 시도해주세요.'}
          </p>
          {expired && (
            <a className={styles.link} href="/login">
              다시 로그인
            </a>
          )}
          <Button
            variant="quiet"
            disabled={query.isFetching}
            onClick={() =>
              void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
            }
          >
            기록 다시 불러오기
          </Button>
        </div>
      )}
      {!expired && (
        <div className={styles.list}>
          {query.isSuccess && !records.length && (
            <p className={styles.empty}>아직 이달에 남긴 기록이 없어요.</p>
          )}
          {records.map((record) => (
            <article className={styles.record} key={record.id}>
              <div className={styles.recordHeading}>
                <strong>
                  {record.categoryName} · {record.minutes}분
                </strong>
                <time dateTime={record.studyDate}>{record.studyDate.replaceAll('-', '. ')}</time>
              </div>
              {record.startTime && <p className={styles.help}>시작 {record.startTime}</p>}
              {record.quantity && (
                <p className={styles.help}>
                  {record.quantity}
                  {({ item: '개', page: '쪽', question: '문제' } as const)[record.quantityUnit!]}
                </p>
              )}
              {record.memo && <p>{record.memo}</p>}
              {record.userId === userId && (
                <div className={styles.recordActions}>
                  <Button variant="quiet" onClick={() => setPanel({ kind: 'edit', record })}>
                    수정
                  </Button>
                  <Button variant="quiet" onClick={() => setPanel({ kind: 'delete', record })}>
                    삭제
                  </Button>
                </div>
              )}
            </article>
          ))}
          {query.hasNextPage && (
            <Button
              variant="secondary"
              className={styles.fullWidth}
              disabled={query.isFetching}
              onClick={() => void query.fetchNextPage()}
            >
              기록 더 보기
            </Button>
          )}
        </div>
      )}
      {panel && panel.kind !== 'delete' && (
        <RecordForm
          key={panel.kind === 'edit' ? panel.record.id : 'new'}
          record={panel.kind === 'edit' ? panel.record : undefined}
          today={today}
          userId={userId}
          groupId={groupId}
          onClose={() => setPanel(null)}
          onSaved={saved}
        />
      )}
      {panel?.kind === 'delete' && (
        <RecordDelete
          record={panel.record}
          userId={userId}
          groupId={groupId}
          onClose={() => setPanel(null)}
          onDeleted={deleted}
        />
      )}
    </section>
  );
}
