import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe against a container. Uses axe-core directly rather than a wrapper
 * dependency so the rule set stays explicit.
 *
 * colour-contrast is disabled here because jsdom has no layout or computed
 * colours and would report false results. Contrast is covered properly in two
 * other places: the token unit test (src/ui/tokens/contrast.test.ts) and the
 * Playwright a11y scan, which runs in a real browser.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  const summary = results.violations.map((v) => `${v.id}: ${v.help}`);
  expect(summary).toEqual([]);
}
