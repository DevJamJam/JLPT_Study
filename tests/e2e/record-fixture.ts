import type { Page } from '@playwright/test';
import { seoulDateKey } from '../../src/lib/seoul-date';
import { monday } from '../../src/features/calendar/dates';

/** Existing profile/PIN tests do not depend on records; isolate their new reads. */
export async function stubRecordReads(page: Page) {
  await page.route('**/api/summary', (route) => {
    const today = seoulDateKey();
    return route.fulfill({
      json: {
        data: {
          userId: '00000000-0000-4000-8000-000000000001',
          groupId: '00000000-0000-4000-8000-000000000002',
          today,
          weekStart: monday(today),
          month: today.slice(0, 7),
          todayMinutes: 0,
          weekMinutes: 0,
          monthMinutes: 0,
          groupTodayMinutes: 0,
          todayParticipants: [],
          recentRecords: [],
        },
      },
    });
  });
  await page.route(/\/api\/records\?/, (route) =>
    route.fulfill({ json: { data: { records: [], nextCursor: null } } }),
  );
  await page.route('**/api/me/dashboard?**', (route) =>
    route.fulfill({
      json: {
        data: {
          userId: '00000000-0000-4000-8000-000000000001',
          groupId: '00000000-0000-4000-8000-000000000002',
          month: new URL(route.request().url()).searchParams.get('month'),
          totalMinutes: 0,
          studyDays: 0,
          recordCount: 0,
          averageMinutes: 0,
          longestMinutes: 0,
          categories: [],
        },
      },
    }),
  );
  await page.route('**/api/categories', (route) =>
    route.fulfill({ json: { data: { categories: [] } } }),
  );
}
