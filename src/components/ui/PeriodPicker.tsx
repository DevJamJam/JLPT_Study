import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import styles from './PeriodPicker.module.css';

export function PeriodPicker({
  label,
  unit = '달',
  onMove,
}: {
  label: string;
  unit?: '달' | '주';
  onMove: (direction: number) => void;
}) {
  return (
    <div className={styles.picker} data-testid="period-picker">
      <button type="button" aria-label={`이전 ${unit}`} onClick={() => onMove(-1)}>
        <FiChevronLeft aria-hidden="true" />
      </button>
      <span>{label}</span>
      <button type="button" aria-label={`다음 ${unit}`} onClick={() => onMove(1)}>
        <FiChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
