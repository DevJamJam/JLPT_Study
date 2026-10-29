import type { Page } from '@playwright/test';

/** Existing profile/PIN tests do not depend on records; isolate their new reads. */
export async function stubRecordReads(page: Page) {
  await page.route(/\/api\/records\?/, (route) =>
    route.fulfill({ json: { data: { records: [], nextCursor: null } } }),
  );
  await page.route('**/api/categories', (route) =>
    route.fulfill({ json: { data: { categories: [] } } }),
  );
}
