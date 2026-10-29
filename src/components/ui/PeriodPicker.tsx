import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import styles from './PeriodPicker.module.css';

export function PeriodPicker({
  label,
  unit = '달',
  onMove,
  previousDisabled = false,
  nextDisabled = false,
}: {
  label: string;
  unit?: '달' | '주';
  onMove: (direction: number) => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div className={styles.picker} data-testid="period-picker">
      <button
        type="button"
        aria-label={`이전 ${unit}`}
        disabled={previousDisabled}
        onClick={() => onMove(-1)}
      >
        <FiChevronLeft aria-hidden="true" />
      </button>
      <span>{label}</span>
      <button
        type="button"
        aria-label={`다음 ${unit}`}
        disabled={nextDisabled}
        onClick={() => onMove(1)}
      >
        <FiChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
