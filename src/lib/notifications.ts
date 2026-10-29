import Swal from 'sweetalert2';

export function toast(message: string) {
  return Swal.fire({
    toast: true,
    target: document.querySelector<HTMLDialogElement>('dialog[open]') ?? document.body,
    position: 'top',
    timer: 2500,
    showConfirmButton: false,
    titleText: message,
    customClass: { popup: 'study-toast' },
  });
}

export async function confirmDiscard(message = '입력한 내용은 저장되지 않아요.') {
  return confirmAction('작성한 내용을 버릴까요?', message, '버리기', '계속 작성');
}

export function confirmRecordDelete(description: string) {
  return confirmAction(
    '공부 기록을 삭제할까요?',
    `${description}\n삭제한 기록은 복구할 수 없어요.`,
    '삭제',
    '취소',
  );
}

async function confirmAction(title: string, message: string, confirm: string, cancel: string) {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  const previous = document.activeElement as HTMLElement | null;
  dialog?.close();
  try {
    const result = await Swal.fire({
      titleText: title,
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: confirm,
      cancelButtonText: cancel,
      focusCancel: true,
      allowOutsideClick: false,
      customClass: { popup: 'study-alert', confirmButton: 'study-alert-confirm' },
    });
    return result.isConfirmed;
  } finally {
    if (dialog?.isConnected && !dialog.open) {
      dialog.showModal();
      previous?.focus({ preventScroll: true });
    }
  }
}
