import { Metric } from '@/components/ui/Metric';
import { duration } from '../calendar/dates';
import { PROFILE_EMOJIS } from '../auth/validation';
import type { MonthSummary } from './types';
import shared from '@/styles/notebook.module.css';
import styles from './MonthDashboard.module.css';

export function MonthDashboard({ data, emoji }: { data: MonthSummary; emoji: string }) {
  return (
    <section
      aria-label="월간 공부 통계"
      className={shared[`emoji${PROFILE_EMOJIS.findIndex((value) => value === emoji) + 1}`]}
    >
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
      <p className={styles.help}>하루 평균은 공부한 날 기준으로 계산하고, 분 단위로 반올림해요.</p>
      <section aria-labelledby="category-chart-title" className={styles.chart}>
        <h3 id="category-chart-title">공부 종류별 시간</h3>
        {data.categories.length ? (
          data.categories.map((category) => (
            <div className={`${shared.chartRow} ${styles.chartRow}`} key={category.categoryId}>
              <div>
                <span>{category.name}</span>
                <span>{duration(category.minutes)}</span>
              </div>
              <progress
                aria-label={`${category.name} 공부 시간`}
                aria-valuetext={duration(category.minutes)}
                value={category.minutes}
                max={data.totalMinutes || 1}
              />
            </div>
          ))
        ) : (
          <p className={styles.help}>등록된 공부 종류가 없어요.</p>
        )}
      </section>
    </section>
  );
}
