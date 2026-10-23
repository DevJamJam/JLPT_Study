import { PinChangeForm } from './PinChangeForm';

export function ResetPinForm(props: {
  onComplete: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  return <PinChangeForm {...props} />;
}
