import type { ReactNode } from 'react';
import { FiHome, FiCalendar, FiPlus, FiUsers, FiBarChart2 } from 'react-icons/fi';
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
}: Props) {
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
      <main className={styles.content}>{children}</main>
      {loggedIn && (
        <nav className={styles.nav} aria-label="하단 메뉴">
          {links.map(({ view, label, Icon }) => (
            <button
              key={view}
              type="button"
              className={`${styles.navButton} ${view === 'add' ? styles.add : ''}`}
              aria-current={view === active ? 'page' : undefined}
              aria-label={view === 'add' ? '공부 기록 남기기' : label}
              onClick={() => (view === 'add' ? onAdd() : onNavigate(view))}
            >
              <span className={styles.icon}>
                <Icon aria-hidden="true" />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
