import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from './theme';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });
  afterEach(() => localStorage.clear());

  it('starts from the stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('data-preference', 'dark');
  });

  it('cycles and persists the preference', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');

    expect(button).toHaveAttribute('data-preference', 'system');
    await user.click(button);
    expect(button).toHaveAttribute('data-preference', 'light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await user.click(button);
    expect(button).toHaveAttribute('data-preference', 'dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('applies the resolved theme to the document root', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByTestId('theme-toggle')); // → light
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await user.click(screen.getByTestId('theme-toggle')); // → dark
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('exposes state in the accessible name, not only the icon', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /theme: system/i })).toBeInTheDocument();
  });
});
