import { expect, test } from '@playwright/test';

test('rendered pages carry the hardened security policy', async ({ page }) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
  expect(headers['content-security-policy']).toContain("object-src 'none'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("form-action 'self'");
});

test('service worker cannot be pinned by intermediary caches', async ({ request }) => {
  const response = await request.get('/sw.js');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['cache-control']).toContain('no-cache');
  expect(response.headers()['service-worker-allowed']).toBe('/');
  expect(await response.text()).toContain('tsk-next-sw-v2');
});

test('web app manifest is served as a manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('application/manifest+json');
});
