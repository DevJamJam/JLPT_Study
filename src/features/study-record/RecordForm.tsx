'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { StudyDialog } from '@/components/ui/StudyDialog';
import { Button } from '@/components/ui/Button';
import { confirmDiscard } from '@/lib/notifications';
import { AuthClientError, jsonRequest } from '../auth/client';
import { validateRecordInput, type RecordInput } from './validation';
import { categoriesRequest, recordError, saveRecordRequest } from './client';
import type { StudyRecord } from './types';
import styles from './RecordWorkspace.module.css';

type Props = {
  today: string;
  userId: string;
  groupId: string;
  onClose: () => void;
  onSaved: (record: StudyRecord) => void;
};

export function RecordForm({ today, userId, groupId, onClose, onSaved }: Props) {
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uncertain, setUncertain] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const closing = useRef(false);
  const attempt = useRef<(RecordInput & { id: string }) | null>(null);
  const categories = useQuery({
    queryKey: ['categories', userId, groupId],
    queryFn: ({ signal }) => categoriesRequest(signal),
    staleTime: 0,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: RecordInput & { id: string }) =>
      saveRecordRequest({ ...input, expectedUserId: userId }),
    retry: false,
    networkMode: 'always',
  });
  const options = categories.data?.categories ?? [];
  async function close() {
    if (inFlight.current || closing.current) return;
    closing.current = true;
    try {
      if (
        dirty.current &&
        !(await confirmDiscard(
          uncertain
            ? '저장 요청이 이미 처리되었을 수 있어요. 닫기 전에 저장 결과를 확인해주세요.'
            : undefined,
        ))
      )
        return;
      onClose();
    } finally {
      closing.current = false;
    }
  }
  async function run(input: RecordInput & { id: string }) {
    if (inFlight.current || terminal) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await mutation.mutateAsync(input);
      onSaved(result.record);
    } catch (error) {
      const unknown = !(error instanceof AuthClientError) || error.status >= 500;
      setUncertain(unknown || uncertain);
      setTerminal(
        error instanceof AuthClientError &&
          ['IDEMPOTENCY_CONFLICT', 'RECORD_DELETED', 'ACCOUNT_CHANGED'].includes(error.code),
      );
      setExpired(
        error instanceof AuthClientError &&
          (error.status === 401 ||
            error.code === 'PIN_CHANGE_REQUIRED' ||
            error.code === 'ACCOUNT_CHANGED'),
      );
      setError(
        unknown
          ? '저장 결과를 확인하지 못했어요. 입력을 유지하고 같은 요청으로 다시 시도해주세요.'
          : recordError(error),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || terminal) return;
    if (uncertain && attempt.current) {
      void run(attempt.current);
      return;
    }
    const form = new FormData(event.currentTarget);
    const value = validateRecordInput({
      studyDate: form.get('studyDate'),
      categoryId: form.get('categoryId'),
      minutes: Number(form.get('minutes')),
      startTime: form.get('startTime'),
      quantity: form.get('quantity') ? Number(form.get('quantity')) : null,
      quantityUnit: form.get('quantityUnit') || null,
      memo: form.get('memo'),
    });
    if (!value.ok) {
      setFieldErrors(value.errors as Record<string, string>);
      setError('입력한 내용을 확인해주세요.');
      return;
    }
    if (!options.some((category) => category.id === value.value.categoryId)) {
      setError('공부 종류를 다시 확인해주세요.');
      return;
    }
    setFieldErrors({});
    const previous = attempt.current;
    const same =
      previous && JSON.stringify({ ...previous, id: undefined }) === JSON.stringify(value.value);
    attempt.current = { ...value.value, id: same ? previous.id : crypto.randomUUID() };
    void run(attempt.current);
  }
  async function checkResult() {
    if (inFlight.current || !attempt.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const data = await jsonRequest<{ record: StudyRecord }>(`/api/records/${attempt.current.id}`);
      if (data.record.userId !== userId) throw new Error('Unexpected owner');
      onSaved(data.record);
    } catch {
      setError('저장 결과가 아직 확인되지 않아요. 같은 요청으로 다시 시도해주세요.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function fieldError(name: string) {
    return fieldErrors[name] ? (
      <span id={`record-${name}-error`} className={styles.fieldError}>
        {fieldErrors[name]}
      </span>
    ) : null;
  }
  function invalid(name: string) {
    return {
      'aria-invalid': !!fieldErrors[name],
      'aria-describedby': fieldErrors[name] ? `record-${name}-error` : undefined,
    };
  }
  return (
    <StudyDialog title="공부 기록 남기기" onClose={() => void close()}>
      <p className={styles.help}>공부한 날짜와 종류, 시간을 남겨주세요.</p>
      {categories.isPending && <p role="status">공부 종류를 불러오고 있어요…</p>}
      {categories.isError && (
        <div>
          <p role="alert" className={styles.error}>
            공부 종류를 불러오지 못했어요.
          </p>
          <Button variant="quiet" onClick={() => void categories.refetch()}>
            공부 종류 다시 불러오기
          </Button>
        </div>
      )}
      {categories.isSuccess && !options.length && (
        <p role="status">등록된 공부 종류가 없어요. 관리자에게 문의해주세요.</p>
      )}
      <form
        onSubmit={submit}
        onChange={() => {
          dirty.current = true;
        }}
        aria-label="공부 기록 입력"
        aria-busy={busy}
      >
        <fieldset className={styles.fields} disabled={busy || uncertain || terminal}>
          <label className={styles.field}>
            공부 날짜
            <input
              name="studyDate"
              type="date"
              min="2000-01-01"
              max={today}
              defaultValue={today}
              required
              {...invalid('studyDate')}
            />
            {fieldError('studyDate')}
          </label>
          <label className={styles.field}>
            공부 종류
            <select name="categoryId" defaultValue="" required {...invalid('categoryId')}>
              <option value="" disabled>
                종류를 선택해주세요
              </option>
              {options.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {fieldError('categoryId')}
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              공부 시간 (분)
              <input
                name="minutes"
                type="number"
                min="1"
                max="1440"
                step="1"
                inputMode="numeric"
                required
                {...invalid('minutes')}
              />
              {fieldError('minutes')}
            </label>
            <label className={styles.field}>
              시작 시각 (선택)
              <input name="startTime" type="time" {...invalid('startTime')} />
              {fieldError('startTime')}
            </label>
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              공부량 (선택)
              <input
                name="quantity"
                type="number"
                min="1"
                max="99999"
                step="1"
                inputMode="numeric"
                {...invalid('quantity')}
              />
              {fieldError('quantity')}
            </label>
            <label className={styles.field}>
              단위
              <select name="quantityUnit" defaultValue="" {...invalid('quantityUnit')}>
                <option value="">선택 안 함</option>
                <option value="item">개</option>
                <option value="page">쪽</option>
                <option value="question">문제</option>
              </select>
              {fieldError('quantityUnit')}
            </label>
          </div>
          <label className={styles.field}>
            메모 (선택)
            <textarea name="memo" rows={4} maxLength={1000} {...invalid('memo')} />
            {fieldError('memo')}
          </label>
        </fieldset>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {expired && (
          <a className={styles.link} href="/login" target="_blank" rel="noopener noreferrer">
            새 창에서 다시 로그인
          </a>
        )}
        <Button
          type="submit"
          className={styles.fullWidth}
          disabled={
            busy ||
            terminal ||
            !options.length ||
            categories.isPending ||
            (categories.isError && !uncertain)
          }
        >
          {busy ? '저장 확인 중…' : uncertain ? '같은 요청으로 다시 시도' : '기록 저장'}
        </Button>
        {uncertain && (
          <Button
            variant="quiet"
            className={styles.fullWidth}
            disabled={busy}
            onClick={() => void checkResult()}
          >
            저장 결과 확인
          </Button>
        )}
      </form>
    </StudyDialog>
  );
}
