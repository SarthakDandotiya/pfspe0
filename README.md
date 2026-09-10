# Personal Wealth & Life Planning Simulator

A client-only planning simulator for modelling long-term wealth, major life
events and financial independence. Everything runs in your browser: **no
accounts, no servers, no analytics, and no data leaves your device.**

- **[PRD.md](./PRD.md)** — what the product models, and what it must never claim
- **[TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md)** — architecture, testing and deployment

## Status

**P1 complete** — the simulation engine core. It is pure TypeScript with no
UI yet, by design: the engine is the part that must be numerically correct, so
it is built and locked down before any interface exists to bend it.

| Phase | Deliverable | Status |
|---|---|---|
| P0 | Skeleton, theming, CI, Pages deploy | ✅ Done |
| P1 | Engine core — time, money, returns, cash flow | ✅ Done |
| P2 | Shell — store, persistence, reset, layout | Next |
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
| `PLAYWRIGHT_BASE_URL=<url> npm run test:e2e` | Run the same suite against a deployed site instead of a local build |
| `npm run verify:build` | Asserts the Pages base path and CSP hashes in `dist/` |
| `npm run check:budget` | Enforces the gzipped bundle budget |

## The engine

`src/engine` is pure, framework-free TypeScript — no React, no DOM, no I/O, no
`Math.random`. It carries a **100% coverage gate**.

| Module | What it owns |
|---|---|
| `time/` | Canonical month-index clock; ages and calendar dates are both derived from it, so they cannot drift |
| `money/` | Integer-paise arithmetic — floats would accumulate drift over ~480 monthly steps |
| `rates/` | Annual ↔ monthly conversion by compounding, never division by 12 |
| `returns/` | Fixed, discrete Bear/Base/Bull, weighted buckets, scripted sequences and crash shapes |
| `inflation/` | Per-category expense growth; the general rate is the deflator for real values |
| `cashflow/` | The single allocation hierarchy — one ordering governs every funding decision |
| `scenario/` | Input types and validation that collects every problem, not just the first |
| `simulate.ts` | The monthly orchestrator |

Three kinds of test guard it:

- **Unit tests** for each module's behaviour and error handling.
- **Property-based tests** (fast-check) for invariants that must hold across
  *all* inputs: money is conserved exactly in paise, no balance goes negative,
  raising the SIP never lowers the final corpus, bear ≤ base ≤ bull, the same
  inputs give byte-identical output, and an earlier cash-flow bucket is never
  starved for a later one.
- **Golden-master snapshots** of realistic end-to-end scenarios, formatted in
  compact INR so a diff reads as `₹2.43Cr → ₹2.51Cr` and a reviewer can
  actually judge it. Updating one requires `-u` and an explanation.

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

## Deployment

Live at **https://sarthakdandotiya.github.io/pfspe0/**, published by
`deploy.yml` on every push to `main`.

To smoke-test the deployed site with the real suite:

```bash
PLAYWRIGHT_BASE_URL=https://sarthakdandotiya.github.io/pfspe0/ npm run test:e2e
```

## Browser support

Chrome/Edge 111+, Firefox 113+, Safari 16.4+ (macOS and iOS). Mobile is the
primary target and is a first-class CI project, not an occasional manual check.
WebKit in CI approximates Safari but is not identical — real-device checks are
still worth doing before a release.
