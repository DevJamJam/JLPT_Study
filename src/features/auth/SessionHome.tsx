'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/notifications';
import { ProfileSettings } from './ProfileSettings';
import { Button } from '@/components/ui/Button';
import { authRequest, AuthClientError } from './client';
import { ResetPinForm } from './ResetPinForm';
import type { PublicAuthData } from './types';
import styles from './Auth.module.css';

export function SessionHome() {
  const router = useRouter();
  const [session, setSession] = useState<PublicAuthData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState({ count: 0, message: '' });
  useEffect(() => {
    if (notice.count) void toast(notice.message);
  }, [notice]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    authRequest('me', undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      .then((data) => {
        setSession(data);
        setError('');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof AuthClientError && error.status === 401) router.replace('/login');
        else setError('공부방에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
      });
    return () => controller.abort();
  }, [router, retry]);
  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await authRequest('logout', {});
      router.replace('/login');
      router.refresh();
    } catch {
      setError('로그아웃하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <main className={styles.main}>
      <header className={styles.sessionHeader}>
        <span className={styles.brand}>JLPT STUDY ROOM</span>
        {session && !session.profile.mustChangePin && (
          <button
            type="button"
            className={styles.avatar}
            aria-label="내 설정 열기"
            onClick={() => {
              setSettingsOpen(true);
            }}
          >
            <span aria-hidden="true">{session.profile.emoji}</span>
          </button>
        )}
      </header>
      <section className={styles.card} aria-labelledby="welcome-title">
        {session ? (
          <>
            <span className={styles.profileEmoji} aria-hidden="true">
              {session.profile.emoji}
            </span>
            <h1 id="welcome-title">
              {session.profile.mustChangePin
                ? '간편 비밀번호 변경이 필요해요'
                : `${session.profile.nickname}님, 반가워요`}
            </h1>
            <p className={styles.intro}>
              {session.profile.mustChangePin
                ? '새 비밀번호를 정하면 공부방을 다시 이용할 수 있어요.'
                : session.group.name}
            </p>
            {session.profile.mustChangePin && (
              <ResetPinForm
                onBusyChange={setResetBusy}
                onComplete={() => {
                  setSession(null);
                  setRetry((value) => value + 1);
                }}
              />
            )}
            {!session.profile.mustChangePin && <p>함께 공부하고, 차곡차곡 기록해요.</p>}
            <Button variant="secondary" onClick={logout} disabled={pending || resetBusy}>
              {pending ? '로그아웃 중…' : '로그아웃'}
            </Button>
          </>
        ) : (
          <p id="welcome-title" role="status">
            {error ? '연결을 다시 확인해주세요.' : '공부방을 확인하고 있어요…'}
          </p>
        )}
        {error && (
          <>
            <p role="alert" className={styles.error}>
              {error}
            </p>
            {!session && <Button onClick={() => setRetry((value) => value + 1)}>다시 시도</Button>}
          </>
        )}
      </section>
      {settingsOpen && session && !session.profile.mustChangePin && (
        <ProfileSettings
          profile={session.profile}
          onClose={() => setSettingsOpen(false)}
          onSaved={(profile) => {
            setSession((current) => (current ? { ...current, profile } : null));
            setSettingsOpen(false);
            setNotice((current) => ({
              count: current.count + 1,
              message: '이모티콘을 저장했어요.',
            }));
          }}
          onPinComplete={() => {
            setSettingsOpen(false);
            setRetry((value) => value + 1);
            setNotice((current) => ({
              count: current.count + 1,
              message: '간편 비밀번호를 변경했어요.',
            }));
          }}
          onLogout={logout}
          onBusyChange={setResetBusy}
          logoutPending={pending}
          logoutError={error}
        />
      )}
    </main>
  );
}
