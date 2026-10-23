'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { PROFILE_EMOJIS, isPin, normalizeNickname } from './validation';
import { authErrorMessage, authRequest } from './client';
import styles from './Auth.module.css';

export function AuthForm({ mode }: { mode: 'login' | 'join' }) {
  const router = useRouter();
  const joining = mode === 'join';
  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [emoji, setEmoji] = useState<(typeof PROFILE_EMOJIS)[number]>('🐰');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const attempt = useRef<{ key: string; requestId: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const normalized = normalizeNickname(nickname);
    if (!normalized) {
      setError('닉네임은 2~12자로 입력해주세요.');
      return;
    }
    if (!isPin(pin)) {
      setError('간편 비밀번호는 숫자 4자리로 입력해주세요.');
      return;
    }
    if (joining && pin !== pinConfirm) {
      setError('간편 비밀번호가 일치하지 않아요.');
      return;
    }
    if (joining && !consent) {
      setError('공개 안내를 확인해주세요.');
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const body = { nickname: normalized.nickname, pin };
      let requestBody: unknown = body;
      if (joining) {
        const key = JSON.stringify([normalized.nickname, pin, emoji]);
        if (attempt.current?.key !== key) attempt.current = { key, requestId: crypto.randomUUID() };
        requestBody = { ...body, pinConfirm, emoji, requestId: attempt.current.requestId };
      }
      await authRequest(mode, requestBody);
      // 정상·제한 세션 모두 홈에서 현재 세션을 다시 확인한다.
      router.replace('/');
      router.refresh();
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <main className={styles.main}>
      <Link className={styles.brand} href="/login">
        JLPT STUDY ROOM
      </Link>
      <section className={styles.card} aria-labelledby="auth-title">
        <div className={styles.hello}>
          <span aria-hidden="true">🌸</span>
          <h1 id="auth-title">
            {joining ? '우리의 공부를 함께 기록해요' : '공부방에 오신 걸 환영해요'}
          </h1>
        </div>
        <p className={styles.intro}>
          {joining ? '닉네임과 간편 비밀번호로 시작해요.' : '오늘의 공부도 차곡차곡 쌓아봐요.'}
        </p>
        <form onSubmit={submit} aria-busy={pending}>
          <fieldset className={styles.fields} disabled={pending}>
            <label className={styles.field}>
              닉네임
              <input
                name="nickname"
                autoComplete="username"
                minLength={2}
                maxLength={24}
                required
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                aria-describedby="nickname-help"
              />
            </label>
            <p id="nickname-help" className={styles.help}>
              2~12자로 입력해주세요.
            </p>
            <label className={styles.field}>
              간편 비밀번호 (숫자 4자리)
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete={joining ? 'new-password' : 'current-password'}
                pattern="[0-9]{4}"
                maxLength={4}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                aria-describedby={joining ? 'pin-help' : undefined}
              />
            </label>
            {joining && (
              <>
                <p id="pin-help" className={styles.help}>
                  생일이나 전화번호 끝자리는 피해주세요.
                </p>
                <label className={styles.field}>
                  간편 비밀번호 확인
                  <input
                    name="pinConfirm"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value)}
                  />
                </label>
                <fieldset className={styles.emojiField}>
                  <legend>나를 나타낼 이모티콘</legend>
                  <div className={styles.emojiGrid}>
                    {PROFILE_EMOJIS.map((value, index) => (
                      <label className={styles.emojiOption} key={value}>
                        <input
                          type="radio"
                          name="emoji"
                          value={value}
                          checked={emoji === value}
                          onChange={() => setEmoji(value)}
                          aria-label={`대표 이모티콘 ${index + 1}: ${value}`}
                        />
                        <span aria-hidden="true">{value}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    닉네임·이모티콘과 공부 기록(날짜·시작 시각·시간·종류·공부량·메모)이 스터디원에게
                    공개되는 것을 확인했어요.
                  </span>
                </label>
              </>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <Button className={styles.fullWidth} type="submit" disabled={pending}>
              {pending ? '확인하고 있어요…' : joining ? '공부방 시작하기' : '로그인'}
            </Button>
          </fieldset>
        </form>
        <p className={styles.switchLink}>
          {joining ? '이미 함께하고 있나요?' : '처음 오셨나요?'}{' '}
          <Link href={joining ? '/login' : '/join'}>{joining ? '로그인' : '가입하기'}</Link>
        </p>
      </section>
    </main>
  );
}
