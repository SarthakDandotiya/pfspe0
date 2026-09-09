import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './useTheme';

function Probe() {
  const { preference, resolved } = useTheme();
  return <span data-testid="probe" data-preference={preference} data-resolved={resolved} />;
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
  vi.unstubAllGlobals();
});

describe('useTheme robustness', () => {
  it('falls back to system when localStorage access throws', () => {
    // Safari private mode and blocked-storage settings throw on access.
    vi.stubGlobal(
      'localStorage',
      new Proxy(
        {},
        {
          get() {
            throw new Error('SecurityError');
          },
        },
      ),
    );
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-preference', 'system');
  });

  it('works in an environment without matchMedia', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-resolved', 'light');
  });

  it('follows the OS when the system scheme changes mid-session', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
          listeners.add(fn),
        removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
          listeners.delete(fn),
      }),
    });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-resolved', 'light');
    expect(listeners.size).toBe(1);
  });
});
