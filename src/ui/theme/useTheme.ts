import { useCallback, useEffect, useState } from 'react';
import {
  type ResolvedTheme,
  type ThemePreference,
  nextPreference,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from './theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export interface UseThemeResult {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  cycle: () => void;
}

export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(safeStorage()),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  // Track OS changes so "system" stays live rather than only applying at load.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStoredPreference(safeStorage(), next);
  }, []);

  const cycle = useCallback(() => {
    setPreferenceState((current) => {
      const next = nextPreference(current);
      writeStoredPreference(safeStorage(), next);
      return next;
    });
  }, []);

  return { preference, resolved, setPreference, cycle };
}
