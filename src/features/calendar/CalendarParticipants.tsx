import styles from '@/styles/notebook.module.css';

type Member = { id: string; nickname: string; emoji: string };
const visibleLimit = 5;

export function CalendarParticipants({ members }: { members: readonly Member[] }) {
  const remaining = Math.max(0, members.length - visibleLimit);
  return (
    <div className={styles.faces} data-testid="calendar-participants">
      {members.length > 0 && <span className={styles.memberCount}>{members.length}명</span>}
      {members.slice(0, visibleLimit).map((member) => (
        <span
          className={styles.face}
          key={member.id}
          data-member-id={member.id}
          title={member.nickname}
        >
          {member.emoji}
          <span className={styles.tooltip}>{member.nickname}</span>
        </span>
      ))}
      {remaining > 0 && (
        <span className={styles.extra} aria-label={`${remaining}명 더`}>
          +{remaining}
        </span>
      )}
    </div>
  );
}
