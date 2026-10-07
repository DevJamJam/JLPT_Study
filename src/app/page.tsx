import styles from './page.module.css';

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="room-title">
        <p className={styles.label}>JLPT STUDY ROOM</p>
        <h1 id="room-title">우리의 공부 기록</h1>
        <p>함께 공부하고, 차곡차곡 기록해요.</p>
      </section>
    </main>
  );
}
