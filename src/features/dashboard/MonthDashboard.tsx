import { Metric } from '@/components/ui/Metric';
import { duration } from '../calendar/dates';
import type { MonthSummary } from './types';
import shared from '@/styles/notebook.module.css';
import styles from './MonthDashboard.module.css';

export function MonthDashboard({ data }: { data: MonthSummary }) {
  const recordedCategories = data.categories.filter(({ minutes }) => minutes > 0);
  return (
    <section aria-label="월간 공부 통계">
      <div className={`${shared.metrics} ${shared.threeMetrics}`}>
        <Metric label="공부 시간" value={duration(data.totalMinutes)} tone="pink" />
        <Metric label="공부한 날" value={`${data.studyDays}일`} tone="lilac" />
        <Metric label="남긴 기록" value={`${data.recordCount}개`} />
      </div>
      <dl className={styles.secondary}>
        <div>
          <dt>공부한 날의 하루 평균</dt>
          <dd>{duration(data.averageMinutes)}</dd>
        </div>
        <div>
          <dt>가장 오래 공부한 하루</dt>
          <dd>{duration(data.longestMinutes)}</dd>
        </div>
      </dl>
      <section aria-labelledby="category-times-title" className={styles.categoryTimes}>
        <h3 id="category-times-title">공부 종류별 시간</h3>
        {recordedCategories.length ? (
          <dl className={styles.times}>
            {recordedCategories.map((category) => (
              <div key={category.categoryId}>
                <dt>{category.name}</dt>
                <dd>{duration(category.minutes)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={styles.help}>이 달에 남긴 공부 기록이 없어요.</p>
        )}
      </section>
    </section>
  );
}
