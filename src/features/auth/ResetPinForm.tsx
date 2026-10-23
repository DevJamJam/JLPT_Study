'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { authErrorMessage, authRequest, AuthClientError } from './client';
import { isPin } from './validation';
import styles from './Auth.module.css';

export function ResetPinForm({
  onComplete,
  onBusyChange,
}: {
  onComplete: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [newPin, setNewPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!isPin(newPin)) {
      setError('새 간편 비밀번호는 숫자 4자리로 입력해주세요.');
      return;
    }
    if (newPin !== confirmation) {
      setError('새 간편 비밀번호가 일치하지 않아요.');
      return;
    }
    inFlight.current = true;
    setPending(true);
    onBusyChange(true);
    setError('');
    try {
      await authRequest('complete-reset', { newPin, newPinConfirm: confirmation });
      onComplete();
    } catch (error) {
      if (
        error instanceof AuthClientError &&
        (error.status === 401 || error.code === 'RESET_NOT_REQUIRED')
      ) {
        setExpired(true);
        setError(
          '세션이 만료되었거나 비밀번호가 이미 변경되었어요. 새 비밀번호로 다시 로그인해주세요.',
        );
      } else setError(authErrorMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
      onBusyChange(false);
    }
  }
  return (
    <form
      className={styles.resetForm}
      onSubmit={submit}
      aria-busy={pending}
      aria-label="초기 비밀번호 변경"
    >
      <fieldset className={styles.fields} disabled={pending || expired}>
        <label className={styles.field}>
          새 간편 비밀번호 (숫자 4자리)
          <input
            name="newPin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            pattern="[0-9]{4}"
            required
            value={newPin}
            onChange={(event) => setNewPin(event.target.value)}
            aria-describedby="reset-pin-help"
          />
        </label>
        <p className={styles.help} id="reset-pin-help">
          초기 비밀번호와 다른 값을 정해주세요. 생일이나 전화번호 끝자리는 피해주세요.
        </p>
        <label className={styles.field}>
          새 간편 비밀번호 확인
          <input
            name="newPinConfirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            pattern="[0-9]{4}"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <Button className={styles.fullWidth} type="submit" disabled={pending || expired}>
          {pending ? '변경하고 있어요…' : '비밀번호 변경하고 시작하기'}
        </Button>
      </fieldset>
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
    </form>
  );
}
