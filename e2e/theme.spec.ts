import { expect, test } from '@playwright/test';

const APP = './';
const KEY = 'pwlps:v1:theme';

test('defaults to the system colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(APP);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('an explicit choice overrides the system setting, in both directions', async ({ page }) => {
  // Note: set storage via evaluate + reload, not addInitScript — an init
  // script re-runs on every navigation and would overwrite the second case.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(APP);
  await page.evaluate((key) => window.localStorage.setItem(key, 'light'), KEY);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate((key) => window.localStorage.setItem(key, 'dark'), KEY);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the toggle persists across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(APP);

  const toggle = page.getByTestId('theme-toggle');
  await expect(toggle).toHaveAttribute('data-preference', 'system');
  await toggle.click(); // → light
  await toggle.click(); // → dark
  await expect(toggle).toHaveAttribute('data-preference', 'dark');

  await page.reload();
  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-preference', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the theme is applied before paint, not after hydration', async ({ page }) => {
  await page.addInitScript(([key]) => window.localStorage.setItem(key as string, 'dark'), [KEY]);
  // Stop at the raw HTML: React has not run yet at this point.
  await page.goto(APP, { waitUntil: 'commit' });
  // The pre-paint script has already set the attribute — no flash of light.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the page background actually changes with the theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(APP);
  const background = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const light = await background();
  await page.getByTestId('theme-toggle').click(); // → light (explicit)
  await page.getByTestId('theme-toggle').click(); // → dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await background()).not.toBe(light);
});

test('keeps working when storage is unavailable', async ({ page }) => {
  // Mirrors Safari private mode and blocked-storage settings.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError: localStorage is not available');
      },
    });
  });
  await page.goto(APP);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
  // The toggle must still work in-session, just without persistence.
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-preference', 'light');
});
