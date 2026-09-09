import { describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  isThemePreference,
  nextPreference,
  parseThemePreference,
  readStoredPreference,
  resolveTheme,
  themeLabel,
  writeStoredPreference,
} from './theme';

describe('isThemePreference', () => {
  it.each(['light', 'dark', 'system'])('accepts %s', (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each([null, undefined, 42, 'blue', {}])('rejects %s', (value) => {
    expect(isThemePreference(value)).toBe(false);
  });
});

describe('parseThemePreference', () => {
  it('falls back to system for anything unrecognised', () => {
    expect(parseThemePreference('nonsense')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('dark')).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('returns the explicit choice regardless of the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system setting only for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('nextPreference', () => {
  it('cycles light → dark → system → light', () => {
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
    expect(nextPreference('system')).toBe('light');
  });
});

describe('themeLabel', () => {
  it.each([
    ['light', 'Light'],
    ['dark', 'Dark'],
    ['system', 'System'],
  ] as const)('labels %s as %s', (preference, expected) => {
    expect(themeLabel(preference)).toBe(expected);
  });
});

describe('storage access never throws', () => {
  it('reads a stored preference', () => {
    const storage = { getItem: vi.fn().mockReturnValue('dark') };
    expect(readStoredPreference(storage)).toBe('dark');
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });

  it('falls back to system when storage is absent', () => {
    expect(readStoredPreference(null)).toBe('system');
    expect(writeStoredPreference(null, 'dark')).toBe(false);
  });

  // Safari private mode and blocked-storage settings throw on access.
  it('falls back to system when reading throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readStoredPreference(storage)).toBe('system');
  });

  it('reports failure rather than throwing when writing throws', () => {
    const storage = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(writeStoredPreference(storage, 'dark')).toBe(false);
  });

  it('reports success on a working write', () => {
    const storage = { setItem: vi.fn() };
    expect(writeStoredPreference(storage, 'light')).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
  });
});
