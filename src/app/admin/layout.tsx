import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { siteMetadata } from '@/lib/site-metadata';

const title = 'JLPT STUDY ROOM · 관리자 페이지';
const description = 'JLPT STUDY ROOM 관리자 페이지입니다. 공부 종류와 스터디 회원을 관리합니다.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    ...siteMetadata.openGraph,
    title,
    description,
    url: '/admin/login',
  },
  twitter: {
    ...siteMetadata.twitter,
    title,
    description,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
