import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  webServer: {
    // Production build, not `next dev`: the dev server never hydrates in this
    // repo's configuration (verified locally: zero React fibers, zero
    // DevTools renderers, zero page errors on every page — while SSR serves
    // fine), so every interaction test fails there regardless of app code.
    // Testing the production artifact is also what shoppers actually get.
    command: 'pnpm build && pnpm start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 420000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
