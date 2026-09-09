# Personal Wealth & Life Planning Simulator

A client-only planning simulator for modelling long-term wealth, major life
events and financial independence. Everything runs in your browser: **no
accounts, no servers, no analytics, and no data leaves your device.**

- **[PRD.md](./PRD.md)** — what the product models, and what it must never claim
- **[TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md)** — architecture, testing and deployment

## Status

**P0 complete** — skeleton, theming, test infrastructure and the deploy
pipeline. The simulation engine itself starts at P1.

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Skeleton, theming, CI, Pages deploy | ✅ Done |
| P1 | Engine core — time, money, returns, cash flow | Next |
| P2 | Shell — store, persistence, reset, layout | Planned |
| P3 | Share links | Planned |
| P4 | Visualisation | Planned |

## Getting started

```bash
npm ci
npm run dev          # http://localhost:5173/pfspe0/
```

## Commands

| Command | What it does |
|---|---|
| `npm run validate` | **Everything CI runs, except E2E.** Use before pushing |
| `npm run dev` | Dev server |
| `npm run build` | Production build (base path `/pfspe0/`) |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run check:purity` | Asserts `src/engine` stays free of DOM and framework code |
| `npm test` / `test:coverage` | Unit, component and a11y tests (coverage gates enforced) |
| `npm run test:e2e` | Playwright across Chromium, Firefox, WebKit + two mobile profiles |
| `npm run verify:build` | Asserts the Pages base path and CSP hashes in `dist/` |
| `npm run check:budget` | Enforces the gzipped bundle budget |

## How the safety rails work

Merging to `main` publishes to GitHub Pages immediately, so the gate is
upstream of the merge: every PR must pass `ci.yml` before it is mergeable.

- **Engine purity.** `src/engine/**` may not import React/DOM/store code
  (ESLint) or touch browser globals and `Math.random` (`check:purity`). That is
  what keeps the engine testable to **100% coverage**, enforced as a hard gate.
- **Coverage tiers.** Engine 100%; `src/ui` 85%; overall 90%. Realistic per
  layer, so nobody is tempted to route around them.
- **Contrast.** `src/ui/tokens/contrast.test.ts` parses the shipped
  `tokens.css` and checks every colour pair against WCAG AA **in both themes**.
- **Pre-paint theme.** The inline script in `index.html` is executed in a unit
  test and asserted to agree with the app's own `resolveTheme` for every
  input — if the two drift, the theme flashes on load, so the test locks them
  together.
- **Build verification.** A wrong Vite base path is the classic cause of a
  blank Pages deploy (every asset 404s while the build "succeeds").
  `verify:build` catches it, plus any inline script missing from the CSP hash.

## Theming

Light / dark / system, persisted in `localStorage`. The preference is resolved
to a concrete `data-theme` attribute **before first paint**, so there is no
flash of the wrong theme and the dark palette is declared exactly once.

## Privacy

No backend exists. Data is held in your browser's local storage and never
transmitted. Note that browser storage is not permanent — it can be cleared by
you or evicted by the browser (Safari drops it after 7 days without a visit),
which is why the app says "saved on this device" rather than "saved". Export
and share links will provide portable backups from P2/P3.

## Browser support

Chrome/Edge 111+, Firefox 113+, Safari 16.4+ (macOS and iOS). Mobile is the
primary target and is a first-class CI project, not an occasional manual check.
WebKit in CI approximates Safari but is not identical — real-device checks are
still worth doing before a release.
