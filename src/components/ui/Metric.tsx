import styles from '@/styles/notebook.module.css';

export function Metric({
  label,
  value,
  tone = '',
}: {
  label: string;
  value: string;
  tone?: '' | 'pink' | 'lilac';
}) {
  return (
    <div className={`${styles.metric} ${tone ? styles[tone] : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
