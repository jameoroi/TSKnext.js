import { expect, test } from '@playwright/test';

test('equipment set builder is reachable from the storefront', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /จัดเซ็ตอุปกรณ์/i }).first()).toBeVisible();
  await page.goto('/kits');
  await expect(page.getByRole('heading', { name: /จัดเซ็ตอุปกรณ์ให้พอดีกับงานและงบ/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /ให้ AI เลือกให้/i })).toBeVisible();
  await expect(page.locator('#main-content').getByRole('button', { name: /เลือกเอง/i })).toBeVisible();
});

test('anonymous desktop header exposes an explicit login action', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ / สมัครสมาชิก' })).toBeVisible();
});

test('mobile navigation preserves storefront shortcuts and explicit login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'เมนู' }).click();
  // Scope to the opened drawer: the top bar carries its own login button with
  // the same name, so an unscoped locator strict-violates once the menu opens.
  const drawer = page.getByRole('navigation', { name: 'เมนูนำทางมือถือ' });
  await expect(drawer.getByRole('button', { name: /เข้าสู่ระบบ \/ สมัครสมาชิก/i })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /จัดเซ็ตอุปกรณ์/i })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /รายการโปรด/i })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /เปรียบเทียบ/i })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /ตะกร้าสินค้า/i })).toBeVisible();
});

test('desktop storefront restores category navigation and trust strip', async ({ page }, testInfo) => {
  await page.goto('/');
  if (testInfo.project.name === 'mobile') {
    // The mega-menu trigger is desktop-only (xl breakpoint); on phones the
    // equivalent entry is the drawer link, so assert that path instead of a
    // label that never renders on small screens.
    await page.getByRole('button', { name: 'เมนู' }).click();
    await expect(page.getByRole('link', { name: /หมวดหมู่ \/ สินค้าทั้งหมด/i })).toBeVisible();
  } else {
    await expect(page.getByText('หมวดหมู่สินค้า').first()).toBeVisible();
  }
  await expect(page.getByRole('region', { name: 'บริการของเรา' })).toBeVisible();
});
