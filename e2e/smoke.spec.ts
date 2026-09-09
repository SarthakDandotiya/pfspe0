import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// baseURL ends with the Pages base path, so navigate relatively.
const APP = './';

test('loads and renders the app shell without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(APP);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Wealth & Life Planning Simulator/i,
  );
  await expect(page.getByTestId('money-sample')).toHaveText('₹1.5Cr');
  expect(errors).toEqual([]);
});

test('has no detectable accessibility violations', async ({ page }) => {
  await page.goto(APP);
  // Runs in a real browser, so colour-contrast is checked for real here.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('does not scroll horizontally', async ({ page }) => {
  await page.goto(APP);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});

test('serves the CSP and applies it without blocking the app', async ({ page }) => {
  await page.goto(APP);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  // frame-ancestors is ignored in a meta CSP and must not be re-added: it
  // only produces a console error. See vite.config.ts.
  expect(csp).not.toContain('frame-ancestors');
  // If the inline theme script were not hashed correctly, the CSP would block
  // it and this attribute would be missing.
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
});
