'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { StudyDialog } from '@/components/ui/StudyDialog';
import { Button } from '@/components/ui/Button';
import { confirmDiscard } from '@/lib/notifications';
import { EmojiPicker } from './EmojiPicker';
import { PinChangeForm } from './PinChangeForm';
import { AuthClientError, authErrorMessage, updateProfileEmoji } from './client';
import type { PublicAuthData } from './types';
import styles from './Auth.module.css';

type Profile = PublicAuthData['profile'];
type Props = {
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  onPinComplete: () => void;
  onLogout: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  logoutPending: boolean;
  logoutError: string;
};

export function ProfileSettings({
  profile,
  onClose,
  onSaved,
  onPinComplete,
  onLogout,
  onBusyChange,
  logoutPending,
  logoutError,
}: Props) {
  const [selected, setSelected] = useState(profile.emoji);
  const [pinMode, setPinMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const inFlight = useRef(false);
  function setWorking(value: boolean) {
    inFlight.current = value;
    setBusy(value);
    onBusyChange(value);
  }
  async function leave(action: () => void | Promise<void>) {
    if (inFlight.current || logoutPending) return;
    setWorking(true);
    try {
      if (selected !== profile.emoji && !(await confirmDiscard())) return;
      setSelected(profile.emoji);
      setError('');
      await action();
    } finally {
      setWorking(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || logoutPending || expired || selected === profile.emoji) return;
    setWorking(true);
    setError('');
    try {
      const data = await updateProfileEmoji(selected);
      onSaved(data.profile);
    } catch (error) {
      if (
        error instanceof AuthClientError &&
        (error.status === 401 || error.code === 'PIN_CHANGE_REQUIRED')
      ) {
        setExpired(true);
        setError(
          error.code === 'PIN_CHANGE_REQUIRED'
            ? '비밀번호가 초기화되었어요. 다시 로그인해 새 비밀번호를 정해주세요.'
            : '세션이 만료되었어요. 다시 로그인해주세요.',
        );
      } else setError(authErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }
  const disabled = busy || logoutPending;
  return (
    <StudyDialog
      title={pinMode ? '간편 비밀번호 변경' : '내 설정'}
      onClose={() => {
        void leave(onClose);
      }}
    >
      <p className={styles.settingsNickname}>
        닉네임 <strong>{profile.nickname}</strong>
      </p>
      {pinMode ? (
        <>
          <p className={styles.help}>
            변경하면 다른 기기에서는 새 비밀번호로 다시 로그인해야 해요.
          </p>
          <PinChangeForm mode="normal" onBusyChange={setWorking} onComplete={onPinComplete} />
          <Button variant="quiet" disabled={disabled} onClick={() => setPinMode(false)}>
            설정으로 돌아가기
          </Button>
        </>
      ) : (
        <>
          <form onSubmit={save} aria-label="대표 이모티콘 변경" aria-busy={busy}>
            <EmojiPicker value={selected} onChange={setSelected} disabled={disabled || expired} />
            <Button
              type="submit"
              className={styles.saveEmoji}
              disabled={disabled || expired || selected === profile.emoji}
            >
              {busy ? '확인하고 있어요…' : '이모티콘 저장'}
            </Button>
          </form>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {expired && (
            <p className={styles.switchLink}>
              <Link href="/login">다시 로그인</Link>
            </p>
          )}
          <div className={styles.settingsActions}>
            <Button
              variant="secondary"
              disabled={disabled || expired}
              onClick={() => {
                void leave(() => setPinMode(true));
              }}
            >
              간편 비밀번호 변경
            </Button>
            <Button
              variant="quiet"
              disabled={disabled}
              onClick={() => {
                void leave(onLogout);
              }}
            >
              {logoutPending ? '로그아웃 중…' : '로그아웃'}
            </Button>
          </div>
        </>
      )}
      {logoutError && (
        <p role="alert" className={styles.error}>
          {logoutError}
        </p>
      )}
    </StudyDialog>
  );
}
