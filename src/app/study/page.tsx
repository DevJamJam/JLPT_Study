import { Suspense } from 'react';
import { SessionHome } from '@/features/auth/SessionHome';

export default function Page() {
  return (
    <Suspense fallback={<p role="status">공부방을 확인하고 있어요…</p>}>
      <SessionHome initialView="study" />
    </Suspense>
  );
}
