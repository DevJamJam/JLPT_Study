import { duration } from '../calendar/dates';
import type { MonthSummary } from './types';
import styles from './MonthDashboard.module.css';

export function MonthDashboard({ data }: { data: MonthSummary }) {
  const recordedCategories = data.categories.filter(({ minutes }) => minutes > 0);
  return (
    <section aria-label="월간 공부 통계" className={styles.dashboard}>
      <div className={styles.panels}>
        <section aria-labelledby="month-summary-title" className={styles.panel}>
          <h3 id="month-summary-title">월간 요약</h3>
          <dl className={styles.rows}>
            <div className={styles.total}>
              <dt>총 공부 시간</dt>
              <dd>{duration(data.totalMinutes)}</dd>
            </div>
            <div>
              <dt>공부한 날</dt>
              <dd>{data.studyDays}일</dd>
            </div>
            <div>
              <dt>남긴 기록</dt>
              <dd>{data.recordCount}개</dd>
            </div>
            <div>
              <dt>하루 평균 공부시간</dt>
              <dd>{duration(data.averageMinutes)}</dd>
            </div>
            <div>
              <dt>오래 공부한 하루</dt>
              <dd>{duration(data.longestMinutes)}</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="category-times-title" className={styles.panel}>
          <h3 id="category-times-title">공부 종류별 시간</h3>
          {recordedCategories.length ? (
            <dl className={styles.rows}>
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
      </div>
    </section>
  );
}
