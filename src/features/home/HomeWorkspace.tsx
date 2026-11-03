'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Metric } from '@/components/ui/Metric';
import { seoulDateKey } from '@/lib/seoul-date';
import { toast } from '@/lib/notifications';
import { CalendarDetail } from '../calendar/CalendarDetail';
import { calendarRoute, duration } from '../calendar/dates';
import { expiredQuery } from '../calendar/client';
import type { AddRecordHandle } from '../calendar/navigation';
import { RecordForm } from '../study-record/RecordForm';
import { RecordAction } from '../study-record/RecordAction';
import { usePopupHistory } from '../study-record/usePopupHistory';
import type { StudyRecord } from '../study-record/types';
import { summaryRequest } from './client';
import shared from '@/styles/notebook.module.css';
import styles from './HomeWorkspace.module.css';

type Props = {
  userId: string;
  groupId: string;
  emoji: string;
  nickname: string;
  ref?: Ref<AddRecordHandle>;
};

export function HomeWorkspace(props: Props) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <Home {...props} />
    </QueryClientProvider>
  );
}

function Home({ userId, groupId, emoji, nickname, ref }: Props) {
  const params = useSearchParams();
  const [search, setSearch] = useState(() => params.toString());
  const [today, setToday] = useState(seoulDateKey);
  const parsed = calendarRoute(search, today);
  const date = parsed.date && parsed.date <= today ? parsed.date : null;
  const panel = date ? parsed.panel : null;
  const { guardRef, openedHereRef, bypassPopRef, currentUrlRef } = usePopupHistory(setSearch);
  const client = useQueryClient();
  const [notice, setNotice] = useState({ id: 0, message: '' });
  const lastNotice = useRef(0);
  const query = useQuery({
    queryKey: ['summary', userId, groupId, today],
    queryFn: ({ signal }) => summaryRequest(userId, groupId, signal),
    staleTime: 0,
    retry: false,
  });
  const blocked = expiredQuery(query.error);
  // Never show a previous account's data or yesterday's statistics as today's values.
  const data = !blocked && query.data?.today === today ? query.data : undefined;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') setToday(seoulDateKey());
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const canonical = new URLSearchParams();
  if (date) {
    canonical.set('date', date);
    if (panel) canonical.set('panel', panel);
    if (panel && parsed.recordId) canonical.set('recordId', parsed.recordId);
    if (panel === 'new' && parsed.direct) canonical.set('direct', '1');
  }
  const canonicalSearch = canonical.toString();
  useEffect(() => {
    const url = canonicalSearch ? `/?${canonicalSearch}` : '/';
    if (location.pathname + location.search !== url) history.replaceState(null, '', url);
    currentUrlRef.current = url;
  }, [canonicalSearch, currentUrlRef]);
  useEffect(() => {
    if (notice.id > lastNotice.current && !panel) {
      lastNotice.current = notice.id;
      void toast(notice.message);
    }
  }, [notice, panel]);
  function update(values: Record<string, string | null>, push = false) {
    const next = new URLSearchParams(canonicalSearch);
    for (const [key, value] of Object.entries(values))
      if (value === null) next.delete(key);
      else next.set(key, value);
    const url = next.size ? `/?${next}` : '/';
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    currentUrlRef.current = url;
    setSearch(next.toString());
  }
  function addToday() {
    openedHereRef.current = true;
    update({ date: today, panel: 'new', recordId: null, direct: '1' }, true);
  }
  useImperativeHandle(ref, () => ({ addToday }));
  function openDate(value: string) {
    openedHereRef.current = true;
    update({ date: value, panel: null, recordId: null, direct: null }, true);
  }
  function close() {
    if (openedHereRef.current) {
      openedHereRef.current = false;
      bypassPopRef.current = true;
      history.back();
    } else update({ date: null, panel: null, recordId: null, direct: null });
  }
  function returnDetail() {
    if (parsed.direct) close();
    else update({ panel: null, recordId: null, direct: null });
  }
  async function refreshData() {
    for (const key of ['summary', 'records']) {
      await client.cancelQueries({ queryKey: [key, userId, groupId] });
      await client.invalidateQueries({ queryKey: [key, userId, groupId] });
    }
  }
  function saved(record: StudyRecord) {
    if (parsed.direct) close();
    else update({ date: record.studyDate, panel: null, recordId: null, direct: null });
    void refreshData();
    setNotice((n) => ({ id: n.id + 1, message: '공부 기록을 저장했어요.' }));
  }
  const ownMember = { id: userId, nickname, emoji };
  return (
    <section className={styles.home} aria-label="공부방 홈">
      <div className={shared.hello}>
        <span aria-hidden="true">{emoji}</span>
        <h1>{nickname}님, 반가워요</h1>
        <p>
          오늘도 한 걸음씩
          <br />
          공부 기록을 남겨 보아요.
        </p>
      </div>
      <div className={shared.metrics} aria-label="내 공부 시간">
        <Metric label="오늘 내 공부" value={data ? duration(data.todayMinutes) : '—'} tone="pink" />
        <Metric
          label="이번 주 내 공부"
          value={data ? duration(data.weekMinutes) : '—'}
          tone="lilac"
        />
      </div>
      <Button className={shared.fullWidth} onClick={addToday}>
        ＋ 공부 기록 남기기
      </Button>
      <Button variant="quiet" className={shared.fullWidth} onClick={() => openDate(today)}>
        오늘 내 기록 보기
      </Button>
      <div className={styles.sectionHeading}>
        <h2>오늘 함께 공부했어요</h2>
        <Button variant="quiet" disabled={query.isFetching} onClick={() => void query.refetch()}>
          홈 새로고침
        </Button>
      </div>
      {query.isFetching && (
        <p role="status" className={styles.status}>
          홈 기록을 확인하고 있어요…
        </p>
      )}
      {query.isError && (
        <div className={styles.error}>
          <p role="alert">
            {blocked
              ? '세션을 다시 확인해주세요. 로그인 후 홈 기록을 불러올 수 있어요.'
              : '홈 기록을 불러오지 못했어요. 다시 시도해주세요.'}
          </p>
          {blocked && <a href="/login">다시 로그인</a>}
          <Button variant="quiet" onClick={() => void query.refetch()}>
            홈 다시 불러오기
          </Button>
        </div>
      )}
      <div className={shared.card}>
        {data ? (
          <>
            {data.todayParticipants.length ? (
              <>
                <ul className={styles.participants} aria-label="오늘 공부한 멤버">
                  {data.todayParticipants.map((member) => (
                    <li className={styles.participant} key={member.id}>
                      <span aria-hidden="true">{member.id === userId ? emoji : member.emoji}</span>
                      <span>{member.id === userId ? nickname : member.nickname}</span>
                    </li>
                  ))}
                </ul>
                <p className={shared.muted}>
                  함께 공부한 시간 · {duration(data.groupTodayMinutes)}
                </p>
              </>
            ) : (
              <p className={shared.empty}>아직 오늘 공부한 멤버가 없어요. 첫 기록을 남겨 보아요.</p>
            )}
          </>
        ) : (
          <p className={shared.empty}>오늘의 참여 기록을 확인해주세요.</p>
        )}
      </div>
      <h2 className={shared.heading}>최근 내 기록</h2>
      <div className={shared.card}>
        {data ? (
          data.recentRecords.length ? (
            data.recentRecords.map((record) => (
              <button
                type="button"
                className={styles.recordButton}
                key={record.id}
                onClick={() => openDate(record.studyDate)}
                aria-label={`${record.studyDate} ${record.categoryName} ${duration(record.minutes)} 기록 보기`}
              >
                <span className={styles.recordCopy}>
                  <strong>
                    {record.categoryName} · {duration(record.minutes)}
                  </strong>
                  {record.startTime && (
                    <span className={shared.muted}>시작 {record.startTime}</span>
                  )}
                  {record.quantity && (
                    <span className={shared.muted}>
                      {record.quantity}
                      {
                        ({ item: '개', page: '쪽', question: '문제' } as const)[
                          record.quantityUnit!
                        ]
                      }
                    </span>
                  )}
                  {record.memo && <span className={styles.memo}>{record.memo}</span>}
                </span>
                <time dateTime={record.studyDate}>{record.studyDate.replaceAll('-', '. ')}</time>
              </button>
            ))
          ) : (
            <p className={shared.empty}>아직 남긴 기록이 없어요. 첫 공부를 기록해 보아요.</p>
          )
        ) : (
          <p className={shared.empty}>최근 기록을 확인해주세요.</p>
        )}
      </div>
      {date && !panel && !blocked && (
        <CalendarDetail
          date={date}
          scope="mine"
          today={today}
          userId={userId}
          groupId={groupId}
          members={[ownMember]}
          onClose={close}
          onNew={() => update({ panel: 'new', recordId: null })}
          onEdit={(r) => update({ panel: 'edit', recordId: r.id })}
          onDelete={(r) => update({ panel: 'delete', recordId: r.id })}
        />
      )}
      {date && panel === 'new' && (
        <RecordForm
          key={`new:${date}`}
          initialDate={date}
          today={today}
          userId={userId}
          groupId={groupId}
          navigationRef={guardRef}
          onClose={returnDetail}
          onSaved={saved}
        />
      )}
      {date && (panel === 'edit' || panel === 'delete') && parsed.recordId && (
        <RecordAction
          key={`${panel}:${parsed.recordId}`}
          action={panel}
          id={parsed.recordId}
          today={today}
          userId={userId}
          groupId={groupId}
          navigationRef={guardRef}
          onClose={returnDetail}
          onSaved={saved}
          onDeleted={() => {
            update({ panel: null, recordId: null });
            void refreshData();
            setNotice((n) => ({ id: n.id + 1, message: '공부 기록을 삭제했어요.' }));
          }}
        />
      )}
    </section>
  );
}
