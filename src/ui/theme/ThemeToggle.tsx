import { themeLabel } from './theme';
import { useTheme } from './useTheme';

const ICON: Record<string, string> = { light: '☀', dark: '☾', system: '◐' };

export function ThemeToggle() {
  const { preference, resolved, cycle } = useTheme();

  return (
    <button
      type="button"
      onClick={cycle}
      // The label carries the state in text, not only the icon — screen
      // readers and colour-blind users get the same information.
      aria-label={`Theme: ${themeLabel(preference)}. Activate to change.`}
      data-testid="theme-toggle"
      data-preference={preference}
      data-resolved={resolved}
      className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink"
    >
      <span aria-hidden="true">{ICON[preference]}</span>
      <span>{themeLabel(preference)}</span>
    </button>
  );
}
