import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';
import '@/styles/globals.css';
import 'sweetalert2/dist/sweetalert2.min.css';
import '@/styles/notifications.css';

export const metadata: Metadata = {
  title: 'JLPT Study Room',
  description: '함께 남기는 JLPT 공부 기록',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
