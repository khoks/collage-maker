import { defineConfig } from '@playwright/test';

// PW_CHANNEL=msedge or chrome runs the Chromium tests in an installed browser instead of
// Playwright's bundled Chromium (handy locally: no browser download needed).
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', ...(channel ? { channel } : {}) } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
