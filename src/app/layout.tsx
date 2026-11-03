import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { siteMetadata } from '@/lib/site-metadata';
import '@/styles/tokens.css';
import '@/styles/globals.css';
import 'sweetalert2/dist/sweetalert2.min.css';
import '@/styles/notifications.css';

export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
