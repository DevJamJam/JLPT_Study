import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FiHome,
  FiCalendar,
  FiPlus,
  FiUsers,
  FiBarChart2,
  FiArrowUp,
  FiArrowDown,
} from 'react-icons/fi';
import styles from './StudyShell.module.css';

export type MainView = 'home' | 'calendar' | 'study' | 'me';
type Props = {
  children: ReactNode;
  active: MainView;
  emoji: string;
  loggedIn: boolean;
  theme?: 'plain' | 'month' | 'week';
  onSettings: () => void;
  onNavigate: (view: MainView) => void;
  onAdd: () => void;
  addLabel?: string;
  disabledViews?: MainView[];
};
const links = [
  { view: 'home', label: '홈', Icon: FiHome },
  { view: 'calendar', label: '달력', Icon: FiCalendar },
  { view: 'add', label: '기록', Icon: FiPlus },
  { view: 'study', label: '스터디', Icon: FiUsers },
  { view: 'me', label: '내 기록', Icon: FiBarChart2 },
] as const;

export function StudyShell({
  children,
  active,
  emoji,
  loggedIn,
  theme = 'plain',
  onSettings,
  onNavigate,
  onAdd,
  addLabel = '공부 기록 남기기',
  disabledViews = [],
}: Props) {
  const contentRef = useRef<HTMLElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, top: true, bottom: false, position: 0 });

  useEffect(() => {
    const main = contentRef.current;
    if (!main) return;
    let frame = 0;
    const update = () => {
      const range = main.scrollHeight - main.clientHeight;
      const next = {
        overflow: range > 1,
        top: main.scrollTop <= 1,
        bottom: main.scrollTop >= range - 1,
        position: range > 1 ? Math.round((main.scrollTop / range) * 100) : 0,
      };
      setScroll((previous) =>
        Object.keys(next).every(
          (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    const observeContent = () => {
      resize.disconnect();
      resize.observe(main);
      for (const child of main.children) resize.observe(child);
      schedule();
    };
    const mutation = new MutationObserver(observeContent);
    mutation.observe(main, { childList: true, subtree: true });
    main.addEventListener('scroll', schedule, { passive: true });
    observeContent();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      main.removeEventListener('scroll', schedule);
    };
  }, []);

  const moveContent = (direction: number) => {
    const main = contentRef.current;
    if (main) main.scrollBy({ top: direction * main.clientHeight * 0.8, behavior: 'instant' });
  };

  return (
    <div className={`${styles.shell} ${styles[theme]}`} data-testid="study-shell">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>JLPT STUDY ROOM</span>
          {loggedIn && (
            <button
              type="button"
              className={styles.avatar}
              aria-label="내 설정 열기"
              onClick={onSettings}
            >
              <span data-testid="profile-emoji">{emoji}</span>
            </button>
          )}
        </div>
      </header>
      <main ref={contentRef} className={styles.content}>
        {children}
      </main>
      {loggedIn && (
        <footer className={styles.footer}>
          {scroll.overflow && (
            <div className={styles.scrollGuide} aria-label="본문 스크롤 안내">
              <button
                type="button"
                aria-label="본문 위로 스크롤"
                disabled={scroll.top}
                onClick={() => moveContent(-1)}
              >
                <FiArrowUp aria-hidden="true" />
              </button>
              <div className={styles.scrollStatus}>
                <span>{scroll.bottom ? '마지막 내용이에요' : '아래에 내용이 더 있어요'}</span>
                <progress aria-label="본문 스크롤 위치" max={100} value={scroll.position} />
              </div>
              <button
                type="button"
                aria-label="본문 아래로 스크롤"
                disabled={scroll.bottom}
                onClick={() => moveContent(1)}
              >
                <FiArrowDown aria-hidden="true" />
              </button>
            </div>
          )}
          <nav className={styles.nav} aria-label="하단 메뉴">
            {links.map(({ view, label, Icon }) => (
              <button
                key={view}
                type="button"
                className={`${styles.navButton} ${view === 'add' ? styles.add : ''}`}
                aria-current={view === active ? 'page' : undefined}
                aria-label={view === 'add' ? addLabel : label}
                disabled={view !== 'add' && disabledViews.includes(view)}
                onClick={() => (view === 'add' ? onAdd() : onNavigate(view))}
              >
                <span className={styles.icon}>
                  <Icon aria-hidden="true" />
                </span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </footer>
      )}
    </div>
  );
}
