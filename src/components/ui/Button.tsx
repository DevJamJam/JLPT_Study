import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
};

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: Props) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]} ${className}`} {...props} />
  );
}
