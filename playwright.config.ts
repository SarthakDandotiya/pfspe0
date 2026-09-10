import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Must include the GitHub Pages base path, or every navigation 404s.
const LOCAL_URL = `http://localhost:${PORT}/pfspe0/`;
// Point at the deployed site to smoke-test production after a release:
//   PLAYWRIGHT_BASE_URL=https://sarthakdandotiya.github.io/pfspe0/ npm run test:e2e
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? LOCAL_URL;
const IS_REMOTE = BASE_URL !== LOCAL_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Mobile is the primary target (TECHNICAL_SPEC §8.5), so it is a
    // first-class CI project rather than an occasional manual check.
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  // No local server needed when testing an already-deployed site.
  ...(IS_REMOTE
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm run preview',
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
});
