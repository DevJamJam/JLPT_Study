'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FiRefreshCw } from 'react-icons/fi';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { seoulDateKey } from '@/lib/seoul-date';
import { toast } from '@/lib/notifications';
import { RecordForm } from '../study-record/RecordForm';
import { RecordAction } from '../study-record/RecordAction';
import type { StudyRecord } from '../study-record/types';
import { CalendarDetail } from './CalendarDetail';
import { CalendarParticipants } from './CalendarParticipants';
import { useHolidays } from './useHolidays';
import { calendarRoute, duration, monday, shiftDate } from './dates';
import {
  calendarRequest,
  dayRecords,
  expiredQuery,
  membersRequest,
  periodRecordsRequest,
} from './client';
import type { AddRecordHandle } from './navigation';
import { usePopupHistory } from '../study-record/usePopupHistory';
import styles from '@/styles/notebook.module.css';
import extra from './CalendarWorkspace.module.css';

const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
type Props = {
  userId: string;
  groupId: string;
  emoji: string;
  nickname: string;
  ref?: Ref<AddRecordHandle>;
};
export function CalendarWorkspace(props: Props) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <Calendar {...props} />
    </QueryClientProvider>
  );
}
function Calendar({ userId, groupId, emoji, nickname, ref }: Props) {
  const initialSearch = useSearchParams();
  // Commit traversals only after the active form has accepted navigation.
  // Router search updates must not unmount a draft before its guardRef runs.
  const [search, setSearch] = useState(() => initialSearch.toString());
  const [today, setToday] = useState(seoulDateKey);
  const route = calendarRoute(search, today);
  const { guardRef, openedHereRef, bypassPopRef, currentUrlRef } = usePopupHistory(setSearch);
  const lastNotice = useRef(0);
  const [notice, setNotice] = useState({ id: 0, message: '' });
  const client = useQueryClient();
  const scope = route.view === 'group' ? 'group' : 'mine';
  const holidays = useHolidays(route.dates[0], route.dates[route.dates.length - 1]);
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
  useEffect(() => {
    const canonical = `/calendar?${route.canonical}`;
    if (location.pathname + location.search !== canonical) {
      history.replaceState(null, '', canonical);
      if (route.invalidPopup) void toast('날짜나 기록 주소를 확인해주세요. 달력으로 돌아왔어요.');
    }
    currentUrlRef.current = canonical;
  }, [route.canonical, route.invalidPopup, currentUrlRef]);
  useEffect(() => {
    if (notice.id > lastNotice.current && !route.panel) {
      lastNotice.current = notice.id;
      void toast(notice.message);
    }
  }, [notice, route.panel]);
  const members = useQuery({
    queryKey: ['members', userId, groupId],
    queryFn: ({ signal }) => membersRequest(signal),
    staleTime: 0,
    retry: false,
  });
  const calendar = useQuery({
    queryKey: ['calendar', userId, groupId, scope, route.from, route.to],
    queryFn: ({ signal }) => calendarRequest(scope, route.from, route.to, signal),
    enabled: route.view !== 'week',
    staleTime: 0,
    retry: false,
  });
  const weekly = useQuery({
    queryKey: ['records', userId, groupId, 'week', route.from, route.to],
    queryFn: ({ signal }) =>
      periodRecordsRequest('mine', route.from, route.to, userId, groupId, signal),
    enabled: route.view === 'week',
    staleTime: 0,
    retry: false,
  });
  const active = route.view === 'week' ? weekly : calendar;
  const blocked = expiredQuery(active.error) || expiredQuery(members.error);
  const ready = !!members.data && !!active.data && !blocked;
  function update(values: Record<string, string | null>, push = false) {
    const params = new URLSearchParams(route.canonical);
    for (const [key, value] of Object.entries(values)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const url = `/calendar?${params}`;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    setSearch(params.toString());
    currentUrlRef.current = url;
  }
  function openDate(date: string) {
    openedHereRef.current = true;
    update({ date, scope, panel: null, recordId: null, direct: null }, true);
  }
  function closePopup() {
    if (openedHereRef.current) {
      openedHereRef.current = false;
      bypassPopRef.current = true;
      history.back();
    } else update({ date: null, scope: null, panel: null, recordId: null, direct: null });
  }
  function addToday() {
    openedHereRef.current = true;
    update({ date: today, scope: 'mine', panel: 'new', direct: '1', recordId: null }, true);
  }
  useImperativeHandle(ref, () => ({ addToday }));
  function returnDetail() {
    if (route.direct) closePopup();
    else update({ panel: null, recordId: null, direct: null });
  }
  async function refreshData() {
    await Promise.all(
      ['records', 'calendar', 'members'].map((key) =>
        client.cancelQueries({ queryKey: [key, userId, groupId] }),
      ),
    );
    await Promise.all(
      ['records', 'calendar', 'members'].map((key) =>
        client.invalidateQueries({ queryKey: [key, userId, groupId] }),
      ),
    );
  }
  function saved(record: StudyRecord) {
    if (route.direct) closePopup();
    else update({ date: record.studyDate, panel: null, recordId: null, direct: null });
    void refreshData();
    setNotice((value) => ({ id: value.id + 1, message: '공부 기록을 저장했어요.' }));
  }
  function deleted() {
    update({ panel: null, recordId: null });
    void refreshData();
    setNotice((value) => ({ id: value.id + 1, message: '공부 기록을 삭제했어요.' }));
  }
  function move(direction: number) {
    if (route.view === 'week') {
      const next = shiftDate(route.week, direction * 7);
      if (next >= '1999-12-27' && next <= monday(today)) update({ week: next });
    } else {
      const date = new Date(`${route.month}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + direction);
      const next = date.toISOString().slice(0, 7);
      if (next >= '2000-01' && next <= today.slice(0, 7)) update({ month: next });
    }
  }
  const dates = route.dates;
  const period =
    route.view === 'week'
      ? `${route.week.slice(5).replace('-', '/')} – ${route.dates[6].slice(5).replace('-', '/')}`
      : `${route.month.slice(0, 4)}년 ${Number(route.month.slice(5))}월`;
  const dateClass = (date: string) => styles[holidays.tone(date)] ?? '';
  const memberList = (members.data?.members ?? []).map((member) =>
    member.id === userId ? { ...member, emoji, nickname } : member,
  );
  return (
    <section
      className={`${extra.workspace} ${route.view !== 'week' ? extra.monthly : extra.weekly}`}
      aria-label="공부 달력"
    >
      <div className={styles.rings} aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <header className={styles.notebookHead}>
        {route.view === 'week' ? (
          <h1 className={styles.weeklyTitle}>
            Weekly
            <br />
            List ✧
          </h1>
        ) : (
          <>
            <p className={styles.monthName}>
              {route.month.slice(0, 4)}
              <br />
              <strong>
                {new Date(`${route.month}-01T00:00:00Z`)
                  .toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
                  .toUpperCase()}
              </strong>
            </p>
            <h1 className={styles.monthNumber}>
              {Number(route.month.slice(5))}
              <span className={styles.srOnly}>월 공부 달력</span>
            </h1>
            <p className={styles.caption}>
              {route.view === 'group' ? '함께 남긴 공부 흔적' : '내가 차곡차곡 쌓은 시간'}
            </p>
          </>
        )}
      </header>
      <div className={extra.controls}>
        <div className={styles.tabs} aria-label="달력 보기">
          {(
            [
              ['group', '그룹 월간'],
              ['mine', '내 월간'],
              ['week', '내 주간'],
            ] as const
          ).map(([view, label]) => (
            <button
              type="button"
              aria-pressed={route.view === view}
              key={view}
              onClick={() => update({ view, month: route.month, week: route.week })}
            >
              {label}
            </button>
          ))}
        </div>
        <PeriodPicker
          label={period}
          unit={route.view === 'week' ? '주' : '달'}
          onMove={move}
          previousDisabled={
            route.view === 'week' ? route.week <= '1999-12-27' : route.month <= '2000-01'
          }
          nextDisabled={
            route.view === 'week' ? route.week >= monday(today) : route.month >= today.slice(0, 7)
          }
        />
      </div>
      <div className={extra.statusBar}>
        <div className={extra.holidayStatus} aria-live="polite">
          {holidays.pending && <span>공휴일 확인 중…</span>}
          {(holidays.failed || holidays.stale) && (
            <span>
              {holidays.failed
                ? '공휴일을 다시 확인해주세요.'
                : '최근 확인한 공휴일을 표시하고 있어요.'}
            </span>
          )}
        </div>
        <div className={extra.refresh}>
          <Button
            variant="icon"
            aria-label="달력 새로고침"
            title="달력 새로고침"
            aria-busy={active.isFetching || members.isFetching || holidays.fetching}
            disabled={active.isFetching || members.isFetching || holidays.fetching}
            onClick={() => {
              void active.refetch();
              void members.refetch();
              void holidays.refresh();
            }}
          >
            <FiRefreshCw aria-hidden="true" />
          </Button>
          {(active.isFetching || members.isFetching) && (
            <span className={styles.srOnly} role="status">
              기록을 확인하고 있어요…
            </span>
          )}
        </div>
      </div>
      {(active.isError || members.isError) && (
        <div className={extra.notice}>
          <p role="alert">
            {blocked
              ? '세션을 다시 확인해주세요. 로그인 후 달력을 불러올 수 있어요.'
              : '달력을 불러오지 못했어요. 다시 시도해주세요.'}
          </p>
          {blocked && <a href="/login">다시 로그인</a>}
          <Button
            variant="quiet"
            onClick={() => {
              void active.refetch();
              void members.refetch();
            }}
          >
            달력 다시 불러오기
          </Button>
        </div>
      )}
      {route.view === 'week' ? (
        <section className={`${styles.paper} ${extra.weekPaper}`} aria-label="내 주간 공부 기록">
          <span className={styles.tape} aria-hidden="true" />
          <div className={styles.weekSummary}>
            <span>
              {emoji} {nickname}님의 이번 주
            </span>
            {ready && (
              <strong>
                {duration((weekly.data ?? []).reduce((sum, record) => sum + record.minutes, 0))}
              </strong>
            )}
          </div>
          <div className={`${styles.weekGrid} ${extra.weekGrid}`} data-testid="week-grid">
            {dates.map((date, index) => {
              const records = ready
                ? dayRecords((weekly.data ?? []).filter((record) => record.studyDate === date))
                : [];
              return (
                <article
                  className={`${styles.weekDay} ${extra.weekDay}`}
                  data-week-date={date}
                  key={date}
                >
                  <header>
                    <strong className={dateClass(date)}>
                      {weekdays[index]} · {date.slice(5).replace('-', '/')}
                    </strong>
                    <small
                      className={extra.holidayName}
                      aria-hidden={holidays.names(date).length === 0}
                    >
                      {holidays.names(date).join(' · ')}
                    </small>
                    <span data-week-total>
                      {ready
                        ? duration(records.reduce((sum, record) => sum + record.minutes, 0))
                        : ''}
                    </span>
                  </header>
                  <div className={styles.weekRecords} data-week-records>
                    {ready ? (
                      records.length ? (
                        records.map((record) => (
                          <article className={styles.record} key={record.id}>
                            <strong>
                              {record.categoryName} · {duration(record.minutes)}
                            </strong>
                            {record.startTime && (
                              <span className={styles.muted}>시작 {record.startTime}</span>
                            )}
                            {record.memo && <p>{record.memo}</p>}
                          </article>
                        ))
                      ) : (
                        <p className={styles.empty}>
                          {date > today ? '아직 오지 않은 날짜예요.' : '아직 기록이 없어요.'}
                        </p>
                      )
                    ) : (
                      <p className={styles.empty}>기록을 확인해주세요.</p>
                    )}
                  </div>
                  <div className={styles.weekActions}>
                    <Button
                      variant="quiet"
                      className={styles.weekAction}
                      disabled={!ready || date < '2000-01-01' || date > today}
                      onClick={() =>
                        records.length
                          ? openDate(date)
                          : ((openedHereRef.current = true),
                            update({ date, scope: 'mine', panel: 'new', direct: null }, true))
                      }
                    >
                      {records.length ? '기록 보기' : '기록 추가 ＋'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <div className={`${styles.calendar} ${extra.monthCalendar}`}>
          <div className={styles.weekdayLabels}>
            {weekdays.map((day, index) => (
              <span
                className={index === 5 ? styles.saturday : index === 6 ? styles.holiday : ''}
                key={day}
              >
                {day}
              </span>
            ))}
          </div>
          <div className={`${styles.monthGrid} ${extra.monthGrid}`} data-testid="live-month-grid">
            {dates.map((date) => {
              const day = ready ? calendar.data?.days.find((day) => day.date === date) : undefined;
              const people = day?.participants ?? [];
              const holidayNames = holidays.names(date);
              const holidayLabel = holidayNames.join(' · ');
              const compactHolidayLabel =
                holidayNames.length === 1 && Array.from(holidayLabel).length <= 3
                  ? holidayLabel
                  : holidayNames.every((name) => name.startsWith('대체공휴일'))
                    ? '대체'
                    : '공휴일';
              return (
                <button
                  type="button"
                  key={date}
                  data-date={date}
                  disabled={!ready || date < '2000-01-01'}
                  aria-label={`${date}${holidayLabel ? ` ${holidayLabel}` : ''} 공부 기록 보기`}
                  title={holidayLabel || undefined}
                  aria-current={date === today ? 'date' : undefined}
                  className={`${styles.day} ${!date.startsWith(route.month) ? styles.faded : ''} ${date === route.date ? extra.selected : ''}`}
                  onClick={() => openDate(date)}
                >
                  <span
                    className={`${styles.dayNumber} ${dateClass(date)} ${date === today ? styles.today : ''}`}
                  >
                    {Number(date.slice(-2))}
                  </span>
                  {holidayLabel && (
                    <span className={extra.holidayName} aria-hidden="true">
                      <span className={extra.holidayFull}>{holidayLabel}</span>
                      <span className={extra.holidayCompact}>{compactHolidayLabel}</span>
                    </span>
                  )}
                  {route.view === 'group' ? (
                    <CalendarParticipants
                      members={people.map((person) => {
                        const member = memberList.find((row) => row.id === person.userId);
                        return {
                          id: person.userId,
                          nickname: member?.nickname ?? '스터디원',
                          emoji: member?.emoji ?? '👤',
                        };
                      })}
                    />
                  ) : (
                    !!day?.totalMinutes && (
                      <>
                        <span className={styles.mineEmoji}>{emoji}</span>
                        <span className={styles.mineTotal}>{day.totalMinutes}분</span>
                      </>
                    )
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {route.date && !route.panel && !!members.data && !blocked && (
        <CalendarDetail
          date={route.date}
          scope={route.scope ?? scope}
          today={today}
          userId={userId}
          groupId={groupId}
          members={memberList}
          onClose={closePopup}
          onNew={() => update({ panel: 'new', recordId: null })}
          onEdit={(record) => update({ panel: 'edit', recordId: record.id })}
          onDelete={(record) => update({ panel: 'delete', recordId: record.id })}
        />
      )}
      {route.date && route.panel === 'new' && (
        <RecordForm
          key={`new:${route.date}`}
          initialDate={route.date}
          today={today}
          userId={userId}
          groupId={groupId}
          navigationRef={guardRef}
          onClose={returnDetail}
          onSaved={saved}
        />
      )}
      {route.date && (route.panel === 'edit' || route.panel === 'delete') && route.recordId && (
        <RecordAction
          key={`${route.panel}:${route.recordId}`}
          action={route.panel}
          id={route.recordId}
          today={today}
          userId={userId}
          groupId={groupId}
          navigationRef={guardRef}
          onClose={returnDetail}
          onSaved={saved}
          onDeleted={deleted}
        />
      )}
    </section>
  );
}
