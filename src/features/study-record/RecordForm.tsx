'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { StudyDialog } from '@/components/ui/StudyDialog';
import { Button } from '@/components/ui/Button';
import { confirmDiscard } from '@/lib/notifications';
import { AuthClientError } from '../auth/client';
import { validateRecordInput, type RecordInput } from './validation';
import {
  categoriesRequest,
  recordError,
  saveRecordRequest,
  updateRecordRequest,
  readOwnRecord,
  ownedRecord,
} from './client';
import type { NavigationGuard } from '../calendar/navigation';
import type { StudyRecord } from './types';
import styles from './RecordWorkspace.module.css';

type Props = {
  navigationRef?: Ref<NavigationGuard>;
  initialDate?: string;
  record?: StudyRecord;
  today: string;
  userId: string;
  groupId: string;
  onClose: () => void;
  onSaved: (record: StudyRecord) => void;
};

export function RecordForm({
  record: initialRecord,
  initialDate,
  navigationRef,
  today,
  userId,
  groupId,
  onClose,
  onSaved,
}: Props) {
  const [record, setRecord] = useState(initialRecord);
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<StudyRecord | null>(null);
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
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty.current) event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const categories = useQuery({
    queryKey: ['categories', userId, groupId],
    queryFn: ({ signal }) => categoriesRequest(signal),
    staleTime: 0,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: RecordInput & { id: string }) =>
      record
        ? updateRecordRequest(record, input, userId, groupId)
        : saveRecordRequest({ ...input, expectedUserId: userId }),
    retry: false,
    networkMode: 'always',
  });
  const options = categories.data?.categories ?? [];
  useImperativeHandle(navigationRef, () => ({
    close,
    protected: () => dirty.current || inFlight.current || closing.current,
  }));
  async function close(next?: () => void) {
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
      if (next) next();
      else onClose();
    } finally {
      closing.current = false;
    }
  }
  async function run(input: RecordInput & { id: string }) {
    if (inFlight.current || terminal || conflict) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await mutation.mutateAsync(input);
      onSaved(result.record);
    } catch (error) {
      const unknown = !(error instanceof AuthClientError) || error.status >= 500;
      if (record && error instanceof AuthClientError && error.code === 'CONFLICT') {
        setConflict(true);
        setUncertain(false);
        try {
          setLatest(ownedRecord(error.currentRecord, record.id, userId, groupId));
        } catch {
          setLatest(null);
        }
      }
      setUncertain(
        error instanceof AuthClientError && error.code === 'CONFLICT'
          ? false
          : unknown || uncertain,
      );
      setTerminal(
        error instanceof AuthClientError &&
          [
            'IDEMPOTENCY_CONFLICT',
            'RECORD_DELETED',
            'ACCOUNT_CHANGED',
            'NOT_FOUND',
            'FORBIDDEN',
          ].includes(error.code),
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
    if (inFlight.current || terminal || conflict) return;
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
    attempt.current = {
      ...value.value,
      id: record?.id ?? (same ? previous.id : crypto.randomUUID()),
    };
    void run(attempt.current);
  }
  async function checkResult() {
    if (inFlight.current || !attempt.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const current = await readOwnRecord(attempt.current.id, userId, groupId);
      if (record) {
        setLatest(current);
        setConflict(true);
        setUncertain(false);
        setError('현재 저장된 기록을 확인했어요. 내용을 확인한 뒤 최신 기록을 불러와주세요.');
      } else onSaved(current);
    } catch (error) {
      setError(
        error instanceof AuthClientError
          ? recordError(error)
          : '저장 결과가 아직 확인되지 않아요. 같은 요청으로 다시 시도해주세요.',
      );
      if (error instanceof AuthClientError) {
        setExpired(
          error.status === 401 || ['ACCOUNT_CHANGED', 'PIN_CHANGE_REQUIRED'].includes(error.code),
        );
        if (['ACCOUNT_CHANGED', 'FORBIDDEN'].includes(error.code)) setTerminal(true);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function reloadLatest() {
    if (!record || inFlight.current || closing.current) return;
    closing.current = true;
    try {
      if (dirty.current && !(await confirmDiscard('작성 중인 내용을 버리고 최신 기록을 불러와요.')))
        return;
      inFlight.current = true;
      setBusy(true);
      const current = await readOwnRecord(record.id, userId, groupId);
      setRecord(current);
      setLatest(null);
      setConflict(false);
      setUncertain(false);
      setFieldErrors({});
      setError('');
      attempt.current = null;
      dirty.current = false;
      setRevision((value) => value + 1);
    } catch (error) {
      setError(recordError(error));
      if (error instanceof AuthClientError) {
        setExpired(
          error.status === 401 || ['ACCOUNT_CHANGED', 'PIN_CHANGE_REQUIRED'].includes(error.code),
        );
        if (['NOT_FOUND', 'FORBIDDEN', 'ACCOUNT_CHANGED'].includes(error.code)) setTerminal(true);
      }
    } finally {
      inFlight.current = false;
      closing.current = false;
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
    <StudyDialog
      title={record ? '공부 기록 수정' : '공부 기록 남기기'}
      onClose={() => void close()}
    >
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
        key={revision}
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
              defaultValue={record?.studyDate ?? initialDate ?? today}
              required
              {...invalid('studyDate')}
            />
            {fieldError('studyDate')}
          </label>
          <label className={styles.field}>
            공부 종류
            <select
              name="categoryId"
              defaultValue={record?.categoryId ?? ''}
              required
              {...invalid('categoryId')}
            >
              <option value="" disabled>
                종류를 선택해주세요
              </option>
              {record && !options.some((option) => option.id === record.categoryId) && (
                <option value={record.categoryId}>{record.categoryName}</option>
              )}
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
                defaultValue={record?.minutes}
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
              <input
                defaultValue={record?.startTime ?? ''}
                name="startTime"
                type="time"
                {...invalid('startTime')}
              />
              {fieldError('startTime')}
            </label>
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              공부량 (선택)
              <input
                defaultValue={record?.quantity ?? ''}
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
              <select
                name="quantityUnit"
                defaultValue={record?.quantityUnit ?? ''}
                {...invalid('quantityUnit')}
              >
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
            <textarea
              defaultValue={record?.memo ?? ''}
              name="memo"
              rows={4}
              maxLength={1000}
              {...invalid('memo')}
            />
            {fieldError('memo')}
            <span className={styles.help}>스터디원에게 공개됩니다.</span>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {conflict && (
          <div className={styles.conflict}>
            <p>작성 중인 내용은 그대로 남아 있어요. 최신 기록을 확인한 뒤 다시 수정해주세요.</p>
            {latest && (
              <p>
                현재 기록: {latest.studyDate} · {latest.categoryName} · {latest.minutes}분
                {latest.memo ? ` · ${latest.memo}` : ''}
              </p>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => void reloadLatest()}>
              최신 기록 불러오기
            </Button>
          </div>
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
            conflict ||
            !options.length ||
            categories.isPending ||
            (categories.isError && !uncertain)
          }
        >
          {busy
            ? '저장 확인 중…'
            : uncertain
              ? '같은 요청으로 다시 시도'
              : record
                ? '수정 저장'
                : '기록 저장'}
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
        <Button
          variant="quiet"
          className={styles.fullWidth}
          disabled={busy}
          onClick={() => void close()}
        >
          취소
        </Button>
      </form>
    </StudyDialog>
  );
}
