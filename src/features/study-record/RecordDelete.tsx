'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StudyDialog } from '@/components/ui/StudyDialog';
import { confirmRecordDelete } from '@/lib/notifications';
import { AuthClientError } from '../auth/client';
import { deleteRecordRequest, readOwnRecord, recordError } from './client';
import type { StudyRecord } from './types';
import styles from './RecordWorkspace.module.css';

export function RecordDelete({
  record: initialRecord,
  userId,
  groupId,
  onClose,
  onDeleted,
}: {
  record: StudyRecord;
  userId: string;
  groupId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [expired, setExpired] = useState(false);
  const inFlight = useRef(false);
  async function remove() {
    if (inFlight.current || conflict || terminal) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (
        !(await confirmRecordDelete(
          `${record.studyDate} · ${record.categoryName} · ${record.minutes}분`,
        ))
      )
        return;
      setError('');
      await deleteRecordRequest(record, userId);
      onDeleted();
    } catch (error) {
      const unknown = !(error instanceof AuthClientError) || error.status >= 500;
      setError(
        unknown
          ? '삭제 결과를 확인하지 못했어요. 같은 기록으로 다시 시도해주세요.'
          : recordError(error),
      );
      if (error instanceof AuthClientError) {
        setConflict(error.code === 'CONFLICT');
        setTerminal(['NOT_FOUND', 'FORBIDDEN', 'ACCOUNT_CHANGED'].includes(error.code));
        setExpired(
          error.status === 401 || ['PIN_CHANGE_REQUIRED', 'ACCOUNT_CHANGED'].includes(error.code),
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const current = await readOwnRecord(record.id, userId, groupId);
      setRecord(current);
      setConflict(false);
      setError('최신 기록을 불러왔어요. 내용을 확인하고 삭제 여부를 다시 선택해주세요.');
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
      setBusy(false);
    }
  }
  return (
    <StudyDialog
      title="공부 기록 삭제"
      onClose={() => {
        if (!inFlight.current) onClose();
      }}
    >
      <p className={styles.help}>선택한 공부 기록을 확인해주세요.</p>
      <div className={styles.conflict}>
        <strong>
          {record.categoryName} · {record.minutes}분
        </strong>
        <p>
          {record.studyDate}
          {record.startTime ? ` · 시작 ${record.startTime}` : ''}
        </p>
        {record.memo && <p>{record.memo}</p>}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {expired && (
        <a className={styles.link} href="/login" target="_blank" rel="noopener noreferrer">
          새 창에서 다시 로그인
        </a>
      )}
      {conflict && (
        <Button
          variant="secondary"
          className={styles.fullWidth}
          disabled={busy}
          onClick={() => void refresh()}
        >
          최신 기록 확인
        </Button>
      )}
      <Button
        className={styles.fullWidth}
        disabled={busy || conflict || terminal}
        onClick={() => void remove()}
      >
        {busy ? '삭제 확인 중…' : '기록 삭제'}
      </Button>
      <Button variant="quiet" className={styles.fullWidth} disabled={busy} onClick={onClose}>
        닫기
      </Button>
    </StudyDialog>
  );
}
