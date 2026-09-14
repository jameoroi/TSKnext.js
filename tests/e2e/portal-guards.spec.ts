import { expect, test } from '@playwright/test';

for (const route of [
  '/admin',
  '/admin/suppliers',
  '/admin/settlements',
  '/admin/crm',
  '/agent',
  '/supplier',
  '/owner',
  '/account',
]) {
  test(`${route} rejects an anonymous browser session`, async ({ page }) => {
    await page.goto(route);
    // Guard redirects for heavy pages (/account renders session + orders +
    // addresses shells first) can exceed the default 5s assertion budget on a
    // cold CI server; the assertion itself is unchanged.
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });
}
