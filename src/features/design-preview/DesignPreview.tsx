'use client';

import { useState, useRef, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { StudyDialog } from '@/components/ui/StudyDialog';
import { StudyShell, type MainView } from '@/components/layout/StudyShell';
import { confirmDiscard, toast } from '@/lib/notifications';
import {
  TODAY,
  EMOJIS,
  CATEGORIES,
  MEMBERS,
  RECORDS,
  HOLIDAYS,
  EMPTY,
  monthDays,
  shiftedDate,
  duration,
  type PreviewRecord,
} from './fixtures';
import styles from './DesignPreview.module.css';

type CalendarView = 'group' | 'mine' | 'week';
type Modal =
  | { kind: 'detail'; date: string }
  | { kind: 'form'; date: string; record?: PreviewRecord; returnDate?: string }
  | { kind: 'settings' };
const weekDays = ['월', '화', '수', '목', '금', '토', '일'];

export function DesignPreview() {
  const [view, setView] = useState<MainView>('calendar');
  const [calendarView, setCalendarView] = useState<CalendarView>('group');
  const [loggedIn, setLoggedIn] = useState(true);
  const [emoji, setEmoji] = useState('🐰');
  const [monthOffset, setMonthOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const dirty = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const current = new Date(Date.UTC(2026, 9 + monthOffset, 1));
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const weekStart = shiftedDate('2026-10-05', weekOffset * 7);
  const recordsFor = (date: string) => RECORDS.filter((record) => record.date === date);
  const totalFor = (date: string) =>
    recordsFor(date).reduce((sum, record) => sum + record.minutes, 0);
  const monthRecords = RECORDS.filter((record) => record.date.startsWith(monthKey));
  const monthTotal = monthRecords.reduce((sum, record) => sum + record.minutes, 0);

  function open(next: Modal) {
    dirty.current = false;
    setModal(next);
  }
  async function changeModal(next: Modal | null) {
    if (!modal || confirming) return;
    if (dirty.current) {
      // Native dialog를 닫은 뒤 Swal 확인창으로 교체하여 배경을 겹치지 않는다.
      setConfirming(true);
      const currentDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      currentDialog?.close();
      const discard = await confirmDiscard();
      setConfirming(false);
      if (!discard) {
        currentDialog?.showModal();
        return;
      }
    }
    dirty.current = false;
    if (next) document.querySelector<HTMLDialogElement>('dialog')?.showModal();
    setModal(next);
  }

  function detail(date: string) {
    open({ kind: 'detail', date });
  }
  function add(date = TODAY, returnDate?: string) {
    open({ kind: 'form', date, returnDate });
  }
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftedDate(weekStart, i));
  const weekLabel = `${weekStart.slice(5).replace('-', '/')} – ${shiftedDate(weekStart, 6).slice(5).replace('-', '/')}`;
  const selectedWeekTotal = weekDates.reduce((sum, date) => sum + totalFor(date), 0);

  function dateClass(date: string) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return HOLIDAYS[date] || day === 0 ? styles.holiday : day === 6 ? styles.saturday : '';
  }

  function list(records: PreviewRecord[], editable = false) {
    return records.length ? (
      records.map((record) => (
        <article className={styles.record} key={record.id}>
          <div>
            <strong>
              {record.category} · {duration(record.minutes)}
            </strong>
            {record.start && <span className={styles.muted}>시작 {record.start}</span>}
            {record.quantity && <span className={styles.muted}>{record.quantity}</span>}
            {record.memo && <p>{record.memo}</p>}
          </div>
          {editable && (
            <Button
              variant="quiet"
              onClick={() =>
                open({ kind: 'form', date: record.date, record, returnDate: record.date })
              }
            >
              수정
            </Button>
          )}
        </article>
      ))
    ) : (
      <p className={styles.empty}>{EMPTY}</p>
    );
  }

  return (
    <>
      <aside className={styles.previewBar} aria-label="디자인 검토 도구">
        <span>디자인 검토 · 가상 데이터 · 저장·인증 미연결</span>
        <Button
          variant="quiet"
          onClick={() => {
            setLoggedIn(!loggedIn);
            setModal(null);
          }}
        >
          {' '}
          {loggedIn ? '로그인 시안 보기' : '앱 시안 보기'}{' '}
        </Button>
      </aside>
      <StudyShell
        active={view}
        emoji={emoji}
        loggedIn={loggedIn}
        theme={
          loggedIn && view === 'calendar' ? (calendarView === 'week' ? 'week' : 'month') : 'plain'
        }
        onSettings={() => open({ kind: 'settings' })}
        onNavigate={setView}
        onAdd={() => add()}
      >
        {!loggedIn ? (
          <LoginPreview
            onEnter={() => {
              setLoggedIn(true);
              setView('home');
            }}
          />
        ) : (
          <>
            {view === 'calendar' && (
              <section aria-label="공부 달력">
                <div className={styles.rings} aria-hidden="true">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} />
                  ))}
                </div>
                <header className={styles.notebookHead}>
                  {calendarView === 'week' ? (
                    <h1 className={styles.weeklyTitle}>
                      Weekly
                      <br />
                      List ✧
                    </h1>
                  ) : (
                    <>
                      <p className={styles.monthName}>
                        {year}
                        <br />
                        <strong>
                          {current
                            .toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
                            .toUpperCase()}
                        </strong>
                      </p>
                      <h1 className={styles.monthNumber}>
                        {month + 1}
                        <span className={styles.srOnly}>월 공부 달력</span>
                      </h1>
                      <p className={styles.caption}>
                        {calendarView === 'group'
                          ? '함께 남긴 공부 흔적'
                          : '내가 차곡차곡 쌓은 시간'}
                      </p>
                    </>
                  )}
                </header>
                <div className={styles.tabs} aria-label="달력 보기">
                  {(
                    [
                      ['group', '그룹 월간'],
                      ['mine', '내 월간'],
                      ['week', '내 주간'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={calendarView === value}
                      onClick={() => setCalendarView(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <PeriodPicker
                  label={calendarView === 'week' ? weekLabel : `${year}년 ${month + 1}월`}
                  unit={calendarView === 'week' ? '주' : '달'}
                  onMove={(direction) =>
                    calendarView === 'week'
                      ? setWeekOffset(weekOffset + direction)
                      : setMonthOffset(monthOffset + direction)
                  }
                />
                {calendarView === 'week' ? (
                  <section className={styles.paper} aria-label="내 주간 공부 기록">
                    <span className={styles.tape} aria-hidden="true" />
                    <div className={styles.weekSummary}>
                      <span>{emoji} 하루의 이번 주</span>
                      <strong>{duration(selectedWeekTotal)}</strong>
                    </div>
                    <div className={styles.weekGrid} data-testid="week-grid">
                      {weekDates.map((date, index) => (
                        <article key={date} className={styles.weekDay}>
                          <header>
                            <strong className={dateClass(date)}>
                              {weekDays[index]} · {date.slice(5).replace('-', '/')}
                            </strong>
                            <span>{duration(totalFor(date))}</span>
                          </header>
                          {list(recordsFor(date))}
                          <Button variant="quiet" onClick={() => detail(date)}>
                            기록 보기{date <= TODAY ? ' / 추가 ＋' : ''}
                          </Button>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className={styles.calendar}>
                    <div className={styles.weekdayLabels}>
                      {weekDays.map((name, i) => (
                        <span
                          key={name}
                          className={i === 5 ? styles.saturday : i === 6 ? styles.holiday : ''}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                    <div className={styles.monthGrid}>
                      {monthDays(year, month).map((date) => {
                        const ownTotal = totalFor(date);
                        const groupMembers = ownTotal ? MEMBERS : [];
                        return (
                          <button
                            type="button"
                            key={date}
                            data-date={date}
                            className={`${styles.day} ${!date.startsWith(monthKey) ? styles.faded : ''}`}
                            onClick={() => detail(date)}
                            title={HOLIDAYS[date]}
                            aria-label={`${date}${HOLIDAYS[date] ? ` ${HOLIDAYS[date]}` : ''} 공부 기록 보기`}
                          >
                            <span
                              className={`${styles.dayNumber} ${dateClass(date)} ${date === TODAY ? styles.today : ''}`}
                            >
                              {Number(date.slice(-2))}
                            </span>
                            {calendarView === 'group' ? (
                              <div className={styles.faces}>
                                {groupMembers.map((member, i) => (
                                  <span
                                    key={member.name}
                                    className={`${styles.face} ${i >= 3 ? styles.wideFace : ''} ${i >= 11 ? styles.overflowFace : ''}`}
                                    title={member.name}
                                  >
                                    {member.name === '하루' ? emoji : member.emoji}
                                    <span className={styles.tooltip}>{member.name}</span>
                                  </span>
                                ))}
                                {groupMembers.length > 3 && (
                                  <span className={styles.extra}>+{groupMembers.length - 3}</span>
                                )}
                                {groupMembers.length > 11 && (
                                  <span className={styles.wideExtra}>
                                    +{groupMembers.length - 11}
                                  </span>
                                )}
                              </div>
                            ) : (
                              ownTotal > 0 && (
                                <>
                                  <span className={styles.mineEmoji}>{emoji}</span>
                                  <span className={styles.mineTotal}>{duration(ownTotal)}</span>
                                </>
                              )
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}
            {view === 'home' && (
              <section
                className={`${styles.standard} ${styles[`emoji${EMOJIS.indexOf(emoji) + 1}`]}`}
              >
                <div className={styles.hello}>
                  <span>{emoji}</span>
                  <h1>하루님, 반가워요</h1>
                  <p>
                    오늘도 한 걸음씩
                    <br />
                    공부 기록을 남겨 보아요.
                  </p>
                </div>
                <div className={styles.metrics}>
                  <Metric label="오늘 내 공부" value={duration(totalFor(TODAY))} tone="pink" />
                  <Metric
                    label="이번 주 내 공부"
                    value={duration(totalFor('2026-10-05') + totalFor(TODAY))}
                  />
                </div>
                <Button className={styles.fullWidth} onClick={() => add()}>
                  ＋ 공부 기록 남기기
                </Button>
                <Button variant="quiet" className={styles.fullWidth} onClick={() => detail(TODAY)}>
                  오늘 내 기록 보기
                </Button>
                <h2 className={styles.heading}>오늘 함께 공부했어요</h2>
                <div className={styles.card}>
                  <span className={styles.memberFaces}>
                    {MEMBERS.map((member) => (member.name === '하루' ? emoji : member.emoji)).join(
                      ' ',
                    )}
                  </span>
                </div>
                <h2 className={styles.heading}>최근 내 기록</h2>
                <div className={styles.card}>{list(RECORDS)}</div>
              </section>
            )}
            {view === 'study' && (
              <section
                className={`${styles.standard} ${styles[`emoji${EMOJIS.indexOf(emoji) + 1}`]}`}
              >
                <div className={styles.sectionHeading}>
                  <h1>우리의 스터디</h1>
                  <span>{MEMBERS.length}명</span>
                </div>
                <PeriodPicker
                  label={weekLabel}
                  unit="주"
                  onMove={(direction) => setWeekOffset(weekOffset + direction)}
                />
                <div className={styles.memberGrid}>
                  {MEMBERS.map((member) => (
                    <article className={styles.card} key={member.name}>
                      <header className={styles.memberHeader}>
                        <span className={styles.memberAvatar}>
                          {member.name === '하루' ? emoji : member.emoji}
                        </span>
                        <div>
                          <h2>{member.name}</h2>
                          <p>{weekOffset === 0 ? member.days.filter(Boolean).length : 0}일 공부</p>
                        </div>
                      </header>
                      <div
                        className={`${styles.segments} ${styles[`emoji${member.name === '하루' ? EMOJIS.indexOf(emoji) + 1 : member.color}`]}`}
                        role="img"
                        aria-label={`${member.name}, ${weekLabel} 공부 현황`}
                      >
                        {member.days.map((active, i) => (
                          <span
                            key={i}
                            className={active && weekOffset === 0 ? styles.filled : ''}
                            title={`${weekDays[i]}요일 ${active && weekOffset === 0 ? '공부함' : '기록 없음'}`}
                          />
                        ))}
                      </div>
                      <div className={styles.segmentLabels}>
                        {weekDays.map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {view === 'me' && (
              <section
                className={`${styles.standard} ${styles[`emoji${EMOJIS.indexOf(emoji) + 1}`]}`}
              >
                <h1>내 공부 기록</h1>
                <PeriodPicker
                  label={`${year}년 ${month + 1}월`}
                  onMove={(direction) => setMonthOffset(monthOffset + direction)}
                />
                <div className={`${styles.metrics} ${styles.threeMetrics}`}>
                  <Metric label="공부 시간" value={duration(monthTotal)} tone="pink" />
                  <Metric
                    label="공부한 날"
                    value={`${new Set(monthRecords.map((record) => record.date)).size}일`}
                    tone="lilac"
                  />
                  <Metric label="남긴 기록" value={`${monthRecords.length}개`} />
                </div>
                <div className={styles.card}>
                  <h2>공부 종류별 시간</h2>
                  {CATEGORIES.map((category) => {
                    const minutes = monthRecords
                      .filter((record) => record.category === category)
                      .reduce((sum, record) => sum + record.minutes, 0);
                    return (
                      <div className={styles.chartRow} key={category}>
                        <div>
                          <span>{category}</span>
                          <span>{duration(minutes)}</span>
                        </div>
                        <progress
                          aria-label={`${category} 공부 시간`}
                          value={minutes}
                          max={monthTotal || 1}
                        />
                      </div>
                    );
                  })}
                </div>
                <h2 className={styles.heading}>남긴 기록</h2>
                <div className={styles.card}>
                  {monthRecords.length ? (
                    [...new Set(monthRecords.map((record) => record.date))].map((date) => (
                      <section key={date}>
                        <h3>{date}</h3>
                        {list(recordsFor(date), true)}
                      </section>
                    ))
                  ) : (
                    <p className={styles.empty}>{EMPTY}</p>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </StudyShell>
      {modal && (
        <StudyDialog
          title={
            modal.kind === 'settings'
              ? '내 설정'
              : modal.kind === 'form'
                ? modal.record
                  ? '공부 기록 수정'
                  : '공부 기록 입력'
                : `${modal.date} 공부 기록`
          }
          onClose={() => void changeModal(null)}
        >
          {modal.kind === 'detail' && (
            <>
              <div className={styles.detailHeading}>
                <strong>{HOLIDAYS[modal.date]}</strong>
                <span>하루 · {duration(totalFor(modal.date))}</span>
              </div>
              {list(recordsFor(modal.date), true)}
              {calendarView === 'group' && view === 'calendar' && (
                <section>
                  <h3>함께 공부한 사람</h3>
                  {totalFor(modal.date) > 0 ? (
                    MEMBERS.slice(1).map((member) => (
                      <p key={member.name}>
                        {member.name === '하루' ? emoji : member.emoji} {member.name} · 단어 30분
                      </p>
                    ))
                  ) : (
                    <p className={styles.empty}>{EMPTY}</p>
                  )}
                </section>
              )}
              {modal.date <= TODAY && (
                <Button className={styles.fullWidth} onClick={() => add(modal.date, modal.date)}>
                  ＋ 공부 기록 남기기
                </Button>
              )}
            </>
          )}
          {modal.kind === 'form' && (
            <RecordForm
              key={modal.record?.id ?? modal.date}
              date={modal.date}
              record={modal.record}
              onDirty={() => {
                dirty.current = true;
              }}
              onBack={
                modal.returnDate
                  ? () => {
                      void changeModal({ kind: 'detail', date: modal.returnDate! });
                    }
                  : undefined
              }
            />
          )}
          {modal.kind === 'settings' && (
            <SettingsPreview
              emoji={emoji}
              onApply={(value) => {
                setEmoji(value);
                dirty.current = false;
                document.querySelector<HTMLDialogElement>('dialog[open]')?.close();
                setModal(null);
                void toast('시안의 이모지를 변경했어요');
              }}
              onDirty={() => {
                dirty.current = true;
              }}
            />
          )}
        </StudyDialog>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  tone = '',
}: {
  label: string;
  value: string;
  tone?: '' | 'pink' | 'lilac';
}) {
  return (
    <div className={`${styles.metric} ${tone ? styles[tone] : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LoginPreview({ onEnter }: { onEnter: () => void }) {
  return (
    <section className={styles.loginCard}>
      <div className={styles.hello}>
        <span>🌸</span>
        <h1>공부방에 오신 걸 환영해요</h1>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onEnter();
        }}
      >
        <label className={styles.field}>
          닉네임
          <input name="nickname" autoComplete="username" minLength={2} maxLength={12} required />
        </label>
        <label className={styles.field}>
          간편 비밀번호
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={4}
            pattern="[0-9]{4}"
            required
          />
        </label>
        <Button type="submit" className={styles.fullWidth}>
          로그인 시안 확인
        </Button>
      </form>
    </section>
  );
}

function RecordForm({
  date,
  record,
  onDirty,
  onBack,
}: {
  date: string;
  record?: PreviewRecord;
  onDirty: () => void;
  onBack?: () => void;
}) {
  const [error, setError] = useState('');
  const [fail, setFail] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(
      fail
        ? '저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.'
        : '디자인 검토 화면에서는 실제 기록을 저장하지 않아요.',
    );
  }
  return (
    <form onSubmit={submit} onChange={onDirty}>
      <label className={styles.field}>
        공부 날짜
        <input name="date" type="date" defaultValue={date} min="2000-01-01" max={TODAY} required />
      </label>
      <label className={styles.field}>
        공부 종류
        <select name="category" defaultValue={record?.category ?? '단어'}>
          {CATEGORIES.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>
      <div className={styles.formRow}>
        <label className={styles.field}>
          공부 시간 (분)
          <input
            name="minutes"
            type="number"
            min={1}
            max={1440}
            step={1}
            defaultValue={record?.minutes ?? ''}
            required
          />
        </label>
        <label className={styles.field}>
          시작 시각 (선택)
          <input name="start" type="time" defaultValue={record?.start ?? ''} />
        </label>
      </div>
      <div className={styles.formRow}>
        <label className={styles.field}>
          공부량 (선택)
          <input name="quantity" type="number" min={1} max={99999} step={1} />
        </label>
        <label className={styles.field}>
          단위
          <select name="unit" defaultValue="">
            <option value="">선택 안 함</option>
            <option>개</option>
            <option>쪽</option>
            <option>문제</option>
          </select>
        </label>
      </div>
      <label className={styles.field}>
        메모 (선택)
        <textarea name="memo" rows={4} maxLength={500} defaultValue={record?.memo ?? ''} />
      </label>
      <label className={styles.testOption}>
        <input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />{' '}
        저장 실패 상태 확인
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <Button type="submit" className={styles.fullWidth}>
        저장 상태 확인
      </Button>
      {onBack && (
        <Button variant="quiet" className={styles.fullWidth} onClick={onBack}>
          날짜 기록으로 돌아가기
        </Button>
      )}
    </form>
  );
}

function SettingsPreview({
  emoji,
  onApply,
  onDirty,
}: {
  emoji: string;
  onApply: (value: string) => void;
  onDirty: () => void;
}) {
  const [selected, setSelected] = useState(emoji);
  const [pinMode, setPinMode] = useState(false);
  return (
    <>
      <p>
        닉네임 <strong>하루</strong>
      </p>
      {pinMode ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void toast('비밀번호 변경은 인증 연결 후 사용할 수 있어요');
          }}
        >
          <label className={styles.field}>
            현재 비밀번호
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              autoComplete="current-password"
              required
            />
          </label>
          <label className={styles.field}>
            새 비밀번호
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              autoComplete="new-password"
              required
            />
          </label>
          <label className={styles.field}>
            새 비밀번호 확인
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              autoComplete="new-password"
              required
            />
          </label>
          <Button type="submit">변경 시안 확인</Button>
          <Button variant="quiet" onClick={() => setPinMode(false)}>
            이모지 설정으로
          </Button>
        </form>
      ) : (
        <>
          <p>나를 나타낼 이모지</p>
          <div className={styles.emojiGrid}>
            {EMOJIS.map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} 이모지 선택`}
                aria-pressed={selected === value}
                onClick={() => {
                  setSelected(value);
                  onDirty();
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <Button className={styles.fullWidth} onClick={() => onApply(selected)}>
            이모지 저장
          </Button>
          <Button variant="quiet" onClick={() => setPinMode(true)}>
            비밀번호 변경
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              void toast('로그아웃은 인증 연결 후 사용할 수 있어요');
            }}
          >
            로그아웃
          </Button>
        </>
      )}
    </>
  );
}
