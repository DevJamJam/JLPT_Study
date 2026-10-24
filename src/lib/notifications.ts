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

export async function confirmDiscard() {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  const previous = document.activeElement as HTMLElement | null;
  dialog?.close();
  try {
    const result = await Swal.fire({
      titleText: '작성한 내용을 버릴까요?',
      text: '입력한 내용은 저장되지 않아요.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '버리기',
      cancelButtonText: '계속 작성',
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
