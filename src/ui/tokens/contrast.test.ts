import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, extractTokens } from '../../test/contrast';

// Read the file that actually ships, so a token edit cannot bypass this test.
const css = readFileSync(resolve(process.cwd(), 'src/ui/tokens.css'), 'utf8');

const THEMES = {
  light: extractTokens(css, ":root,\n:root[data-theme='light']"),
  dark: extractTokens(css, ":root[data-theme='dark']"),
};

/** [foreground, background, minimum ratio, why] */
const PAIRS: ReadonlyArray<[string, string, number, string]> = [
  ['c-ink', 'c-canvas', 4.5, 'body text on the page background'],
  ['c-ink', 'c-surface', 4.5, 'body text on cards'],
  ['c-ink', 'c-sunken', 4.5, 'body text on inset panels'],
  ['c-ink-muted', 'c-canvas', 4.5, 'secondary text on the page background'],
  ['c-ink-muted', 'c-surface', 4.5, 'secondary text on cards'],
  ['c-ink-muted', 'c-sunken', 4.5, 'secondary text on inset panels'],
  ['c-accent', 'c-canvas', 4.5, 'links on the page background'],
  ['c-accent', 'c-surface', 4.5, 'links on cards'],
  ['c-accent-ink', 'c-accent', 4.5, 'text on an accent-filled button'],
  ['c-ok', 'c-canvas', 4.5, 'funded status text'],
  ['c-ok', 'c-surface', 4.5, 'funded status text on cards'],
  ['c-warn', 'c-canvas', 4.5, 'partially-funded status text'],
  ['c-warn', 'c-surface', 4.5, 'partially-funded status text on cards'],
  ['c-bad', 'c-canvas', 4.5, 'underfunded status text'],
  ['c-bad', 'c-surface', 4.5, 'underfunded status text on cards'],
  // Non-text UI needs 3:1, not 4.5:1.
  ['c-focus', 'c-canvas', 3, 'focus ring against the page background'],
  ['c-focus', 'c-surface', 3, 'focus ring against cards'],
];

describe('design tokens meet WCAG AA in both themes', () => {
  for (const [themeName, tokens] of Object.entries(THEMES)) {
    describe(themeName, () => {
      it('defines every token the pairs reference', () => {
        const referenced = new Set(PAIRS.flatMap(([fg, bg]) => [fg, bg]));
        for (const name of referenced) {
          expect(tokens[name], `${themeName} is missing --${name}`).toBeDefined();
        }
      });

      it.each(PAIRS)('%s on %s ≥ %s:1 (%s)', (fg, bg, minimum) => {
        const foreground = tokens[fg];
        const background = tokens[bg];
        expect(foreground).toBeDefined();
        expect(background).toBeDefined();
        const ratio = contrastRatio(foreground as string, background as string);
        expect(
          Number(ratio.toFixed(2)),
          `--${fg} on --${bg} in ${themeName} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(minimum);
      });
    });
  }

  it('light and dark declare exactly the same token names', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort());
  });
});
