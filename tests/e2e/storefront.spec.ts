import { expect, test } from '@playwright/test';

test('storefront routes render', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/THAISERKIT/i);
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: /สินค้า/i }).first()).toBeVisible();
});
test('security-sensitive pages are not anonymous data leaks', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});
