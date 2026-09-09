/**
 * Pure theme logic. No React, no side effects — so it can be unit tested
 * directly and reused by the pre-paint script's contract tests.
 */

export const THEME_STORAGE_KEY = 'pwlps:v1:theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

/** Unknown/absent values fall back to "system" rather than throwing. */
export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/** Cycles light → dark → system → light, for a single-button toggle. */
export function nextPreference(current: ThemePreference): ThemePreference {
  const index = PREFERENCES.indexOf(current);
  return PREFERENCES[(index + 1) % PREFERENCES.length] ?? 'system';
}

export function themeLabel(preference: ThemePreference): string {
  switch (preference) {
    case 'light':
      return 'Light';
    case 'dark':
      return 'Dark';
    case 'system':
      return 'System';
  }
}

/**
 * Storage access that never throws. Safari private mode and blocked-storage
 * settings throw on both read and write; the app must keep working, just
 * without persistence (TECHNICAL_SPEC §6.2, §6.4).
 */
export function readStoredPreference(storage: Pick<Storage, 'getItem'> | null): ThemePreference {
  if (!storage) return 'system';
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function writeStoredPreference(
  storage: Pick<Storage, 'setItem'> | null,
  preference: ThemePreference,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}
