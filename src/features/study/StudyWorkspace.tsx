'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { Button } from '@/components/ui/Button';
import { seoulDateKey } from '@/lib/seoul-date';
import { toast } from '@/lib/notifications';
import { PROFILE_EMOJIS } from '../auth/validation';
import { AuthClientError, jsonRequest } from '../auth/client';
import { expiredQuery } from '../calendar/client';
import { calendarRoute, duration, monday, shiftDate } from '../calendar/dates';
import type { AddRecordHandle } from '../calendar/navigation';
import { RecordForm } from '../study-record/RecordForm';
import { usePopupHistory } from '../study-record/usePopupHistory';
import type { StudyWeek } from './types';
import styles from '@/styles/notebook.module.css';

type Props = {
  userId: string;
  groupId: string;
  emoji: string;
  nickname: string;
  ref?: Ref<AddRecordHandle>;
};
const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
export function StudyWorkspace(props: Props) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <Study {...props} />
    </QueryClientProvider>
  );
}
function Study({ userId, groupId, emoji, nickname, ref }: Props) {
  const initialSearch = useSearchParams();
  const [search, setSearch] = useState(() => initialSearch.toString());
  const [today, setToday] = useState(seoulDateKey);
  const params = new URLSearchParams(search);
  const week = calendarRoute(
    new URLSearchParams({ view: 'week', week: params.get('week') ?? monday(today) }).toString(),
    today,
  ).week;
  const composing = params.get('compose') === '1';
  const canonical = new URLSearchParams({ week });
  if (composing) canonical.set('compose', '1');
  const url = `/study?${canonical}`;
  const { guardRef, openedHereRef, bypassPopRef, currentUrlRef } = usePopupHistory(setSearch);
  const [notice, setNotice] = useState(0);
  const lastNotice = useRef(0);
  const client = useQueryClient();
  useEffect(() => {
    if (location.pathname + location.search !== url) history.replaceState(null, '', url);
    currentUrlRef.current = url;
  }, [url, currentUrlRef]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      const next = seoulDateKey();
      if (next !== today) {
        if (week === monday(today)) {
          setSearch((value) => {
            const nextParams = new URLSearchParams(value);
            nextParams.set('week', monday(next));
            return nextParams.toString();
          });
        }
        setToday(next);
      }
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
  }, [today, week]);
  const query = useQuery({
    queryKey: ['study', userId, groupId, week],
    queryFn: async ({ signal }) => {
      const data = await jsonRequest<StudyWeek>(
        `/api/study?${new URLSearchParams({ week })}`,
        undefined,
        AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      );
      if (data.weekStart !== week || !data.members.some((member) => member.id === userId))
        throw new AuthClientError(409, 'ACCOUNT_CHANGED');
      return data;
    },
    staleTime: 0,
    retry: false,
  });
  const blocked = expiredQuery(query.error);
  const data = blocked ? undefined : query.data;
  function addToday() {
    openedHereRef.current = true;
    const next = `/study?${new URLSearchParams({ week, compose: '1' })}`;
    history.pushState(null, '', next);
    currentUrlRef.current = next;
    setSearch(new URL(next, location.origin).search);
  }
  useImperativeHandle(ref, () => ({ addToday }));
  function close() {
    if (openedHereRef.current) {
      openedHereRef.current = false;
      bypassPopRef.current = true;
      history.back();
    } else {
      const next = `/study?${new URLSearchParams({ week })}`;
      history.replaceState(null, '', next);
      currentUrlRef.current = next;
      setSearch(new URL(next, location.origin).search);
    }
  }
  useEffect(() => {
    if (notice > lastNotice.current && !composing) {
      lastNotice.current = notice;
      void toast('공부 기록을 저장했어요.');
    }
  }, [notice, composing]);
  return (
    <section className={styles.standard} aria-label="스터디 주간 통계">
      <div className={styles.sectionHeading}>
        <h1>우리의 스터디</h1>
        {data && <span>{data.members.length}명</span>}
      </div>
      <PeriodPicker
        label={`${week.replaceAll('-', '/')} – ${shiftDate(week, 6).slice(5).replace('-', '/')}`}
        unit="주"
        previousDisabled={week <= '1999-12-27'}
        nextDisabled={week >= monday(today)}
        onMove={(direction) => {
          const next = shiftDate(week, direction * 7);
          if (next < '1999-12-27' || next > monday(today)) return;
          history.replaceState(null, '', `/study?${new URLSearchParams({ week: next })}`);
          setSearch(new URLSearchParams({ week: next }).toString());
        }}
      />
      <Button variant="quiet" disabled={query.isFetching} onClick={() => void query.refetch()}>
        스터디 새로고침
      </Button>
      {query.isPending && <p role="status">주간 공부 기록을 불러오고 있어요…</p>}
      {query.isError && (
        <div>
          <p role="alert">
            {blocked
              ? '세션을 다시 확인해주세요. 로그인 후 기록을 불러올 수 있어요.'
              : '주간 공부 기록을 불러오지 못했어요. 다시 시도해주세요.'}
          </p>
          {blocked && <a href="/login">다시 로그인</a>}
          <Button variant="quiet" onClick={() => void query.refetch()}>
            스터디 다시 불러오기
          </Button>
        </div>
      )}
      {data && (
        <div className={styles.memberGrid}>
          {data.members.map((member) => {
            const own = member.id === userId;
            const face = own ? emoji : member.emoji;
            const name = own ? nickname : member.nickname;
            return (
              <article className={styles.card} key={member.id} data-member-id={member.id}>
                <header className={styles.memberHeader}>
                  <span className={styles.memberAvatar}>{face}</span>
                  <div>
                    <h2>{name}</h2>
                    <p>{member.studyDays}일 공부</p>
                  </div>
                </header>
                <div
                  className={`${styles.segments} ${styles[`emoji${PROFILE_EMOJIS.indexOf(face as (typeof PROFILE_EMOJIS)[number]) + 1}`]}`}
                  role="img"
                  aria-label={`${name}, ${week}부터 ${member.studyDays}일 공부`}
                >
                  {member.days.map((day) => (
                    <span
                      key={day.date}
                      data-active={day.minutes > 0}
                      className={day.minutes > 0 ? styles.filled : ''}
                      title={`${day.date} ${day.minutes > 0 ? duration(day.minutes) : '기록 없음'}`}
                    />
                  ))}
                </div>
                <div className={styles.segmentLabels}>
                  {weekdays.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {composing && (
        <RecordForm
          today={today}
          userId={userId}
          groupId={groupId}
          navigationRef={guardRef}
          onClose={close}
          onSaved={() => {
            close();
            void client.invalidateQueries({ queryKey: ['study', userId, groupId] });
            setNotice((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
