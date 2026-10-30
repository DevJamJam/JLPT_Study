'use client';

import { useEffect, useRef } from 'react';
import type { NavigationGuard } from '../calendar/navigation';

/** Keep a draft mounted until its close guardRef accepts browser traversal. */
export function usePopupHistory(onTraverse: (search: string) => void) {
  const guardRef = useRef<NavigationGuard | null>(null);
  const openedHereRef = useRef(false);
  const bypassPopRef = useRef(false);
  const currentUrlRef = useRef('');
  useEffect(() => {
    const protect = (event: PopStateEvent) => {
      if (bypassPopRef.current) {
        bypassPopRef.current = false;
        onTraverse(location.search);
        return;
      }
      const active = guardRef.current;
      if (!active?.protected()) {
        onTraverse(location.search);
        return;
      }
      event.stopImmediatePropagation();
      history.pushState(null, '', currentUrlRef.current);
      void active.close(() => {
        bypassPopRef.current = true;
        history.back();
      });
    };
    window.addEventListener('popstate', protect, true);
    return () => window.removeEventListener('popstate', protect, true);
  }, [onTraverse]);
  return { guardRef, openedHereRef, bypassPopRef, currentUrlRef };
}
