'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';
import styles from './StudyDialog.module.css';

type Props = { title: string; children: ReactNode; onClose: () => void };

export function StudyDialog({ title, children, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const scrollPosition = window.scrollY;
    const scroller = dialog?.closest('main');
    const mainScrollTop = scroller?.scrollTop ?? 0;
    const mainScrollLeft = scroller?.scrollLeft ?? 0;
    const oldMainOverflow = scroller?.style.overflowY ?? '';
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (scroller) scroller.style.overflowY = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = oldOverflow;
      if (scroller) {
        scroller.style.overflowY = oldMainOverflow;
        scroller.scrollTo(mainScrollLeft, mainScrollTop);
      }
      previous?.focus({ preventScroll: true });
      window.scrollTo(0, scrollPosition);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId}>{title}</h2>
        <button
          className={styles.close}
          type="button"
          aria-label="팝업 닫기"
          onClick={onClose}
          autoFocus
        >
          <FiX aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
