import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';
import '@/styles/globals.css';
import 'sweetalert2/dist/sweetalert2.min.css';
import '@/styles/notifications.css';

export const metadata: Metadata = {
  title: 'JLPT Study Room',
  description: '함께 공부하고, 하루하루 기록해요. JLPT 공부 시간과 우리 스터디의 성장을 한곳에서.',
  metadataBase: new URL('https://jlpt-study-gamma.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: '/',
    siteName: 'JLPT STUDY ROOM',
    title: 'JLPT STUDY ROOM · 함께 쌓는 공부 기록',
    description:
      '함께 공부하고, 하루하루 기록해요. JLPT 공부 시간과 우리 스터디의 성장을 한곳에서.',
    images: [
      {
        url: '/share-card.png',
        width: 1200,
        height: 630,
        alt: 'JLPT STUDY ROOM — 함께 쌓는 공부 기록',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JLPT STUDY ROOM · 함께 쌓는 공부 기록',
    description: '함께 공부하고, 하루하루 기록해요.',
    images: ['/share-card.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
