import { PROFILE_EMOJIS } from './validation';
import styles from './Auth.module.css';

export function EmojiPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: (typeof PROFILE_EMOJIS)[number]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className={styles.emojiField} disabled={disabled}>
      <legend>나를 나타낼 이모티콘</legend>
      <div className={styles.emojiGrid}>
        {PROFILE_EMOJIS.map((emoji, index) => (
          <label className={styles.emojiOption} key={emoji}>
            <input
              type="radio"
              name="emoji"
              value={emoji}
              checked={value === emoji}
              onChange={() => onChange(emoji)}
              aria-label={`대표 이모티콘 ${index + 1}: ${emoji}`}
            />
            <span aria-hidden="true">{emoji}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
