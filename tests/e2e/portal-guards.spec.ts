import { expect, test } from '@playwright/test';

for (const route of ['/admin', '/admin/suppliers', '/admin/settlements', '/admin/crm', '/agent', '/supplier', '/owner', '/account']) {
  test(`${route} rejects an anonymous browser session`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  });
}
