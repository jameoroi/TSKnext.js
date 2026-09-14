import { expect, test } from '@playwright/test';

test('legacy same-origin html links are rewritten to Next routes', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.id = 'legacy-agent-store-link';
    link.href = '/agent-store.html?ref=abc';
    link.textContent = 'legacy';
    document.body.appendChild(link);
  });
  await expect
    .poll(() => page.locator('#legacy-agent-store-link').getAttribute('href'))
    .toBe('/store?ref=abc');
});

test('storefront keeps referral attribution in the shopper browser', async ({ page }) => {
  await page.route('**/api*', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    const body = request.postDataJSON() as { action?: string; code?: string } | null;
    if (body?.action !== 'partner.resolve') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, attribution: { agent_code: String(body.code || '').toUpperCase() } }),
    });
  });
  await page.goto('/?ref=abc123');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tsk_agent_ref'))).toBe('ABC123');
});
