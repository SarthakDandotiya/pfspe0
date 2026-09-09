import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ThemePreference, resolveTheme } from './theme';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function inlineScripts(): string[] {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? '',
  );
}

/** Executes the pre-paint script against a controlled environment. */
function runPrePaintScript(options: {
  stored: string | null;
  prefersDark: boolean;
  storageThrows?: boolean;
  matchMediaMissing?: boolean;
}): string | null {
  const script = inlineScripts()[0];
  if (!script) throw new Error('No inline pre-paint script found in index.html');

  let applied: string | null = null;
  const documentStub = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        if (name === 'data-theme') applied = value;
      },
    },
  };
  const localStorageStub = {
    getItem: () => {
      if (options.storageThrows) throw new Error('SecurityError');
      return options.stored;
    },
  };
  const windowStub = options.matchMediaMissing
    ? {}
    : { matchMedia: () => ({ matches: options.prefersDark }) };

  new Function('window', 'document', 'localStorage', script)(
    windowStub,
    documentStub,
    localStorageStub,
  );
  return applied;
}

describe('pre-paint theme script', () => {
  it('is inline and synchronous, so it runs before first paint', () => {
    // A deferred or external script runs too late and dark-mode users see a
    // white flash. This asserts the property that prevents that.
    expect(inlineScripts().length).toBeGreaterThan(0);
    const tag = html.match(/<script(?![^>]*\ssrc=)[^>]*>/)?.[0] ?? '';
    expect(tag).not.toContain('defer');
    expect(tag).not.toContain('async');
    expect(tag).not.toContain('type="module"');
    // It must appear in <head>, before the body renders.
    expect(html.indexOf('<script')).toBeLessThan(html.indexOf('<body'));
  });

  // The whole point: the script must agree with the app's own logic, or the
  // theme visibly changes on hydration.
  it.each([
    ['light', false],
    ['light', true],
    ['dark', false],
    ['dark', true],
    ['system', false],
    ['system', true],
  ] as const)('matches resolveTheme(%s, prefersDark=%s)', (stored, prefersDark) => {
    const applied = runPrePaintScript({ stored, prefersDark });
    expect(applied).toBe(resolveTheme(stored as ThemePreference, prefersDark));
  });

  it('treats an absent or corrupt preference as system', () => {
    expect(runPrePaintScript({ stored: null, prefersDark: true })).toBe('dark');
    expect(runPrePaintScript({ stored: 'nonsense', prefersDark: false })).toBe('light');
  });

  it('falls back to light when storage access throws', () => {
    expect(runPrePaintScript({ stored: null, prefersDark: false, storageThrows: true })).toBe(
      'light',
    );
  });

  it('survives an environment without matchMedia', () => {
    expect(
      runPrePaintScript({ stored: 'system', prefersDark: true, matchMediaMissing: true }),
    ).toBe('light');
  });
});
