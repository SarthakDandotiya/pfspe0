# Technical Specification — Personal Wealth & Life Planning Simulator

**Companion to:** [`PRD.md`](./PRD.md) (v2.0, adversarial-review rebuild)
**Spec version:** 1.0
**Last updated:** 2026-09-06
**Deployment target:** GitHub Pages (static), auto-deploy on merge to `main`
**Repository:** `SarthakDandotiya/pfspe0` → site base path `/pfspe0/`

---

## 0. Purpose and relationship to the PRD

The PRD defines *what* the product models and *what it must not claim*. This document defines *how it is built* under one hard constraint: **a fully static web application, served by GitHub Pages, with no backend of any kind.**

That constraint is not a detail. It invalidates two things the PRD currently assumes (server-side Monte Carlo, and authenticated per-user storage). Rather than leave the two documents inconsistent, **[§14 PRD deltas](#14-prd-deltas--changes-this-constraint-forces)** lists every conflict and the required PRD amendment. Read that section before building.

---

## 1. Hard constraints and what they imply

| # | Constraint (from you) | Direct implication |
|---|---|---|
| C1 | Static site on GitHub Pages | No server, no DB, no API, no server-side rendering, no secrets. **All computation is client-side.** |
| C2 | Auto-deploy on merge to `main` | GitHub Actions → Pages. Per-PR pipeline gates mergeability, so every merge is pre-validated and safe to publish (§10.3). |
| C3 | React | React 19 + TypeScript (strict). |
| C4 | Values always persist to localStorage; full reset available | Debounced autosave, versioned schema, migrations, quota-safe writes, explicit destructive-reset flow. |
| C5 | Shareable link that reproduces the same model | Self-contained encoded state in the URL — **no shortener service, because that would be a backend and would leak financial data to a third party.** |
| C6 | Comprehensive tests; every change safe | Layered suite + coverage gates + mutation testing on the engine + cross-browser E2E, all blocking on PR. |
| C7 | Light/dark, modern, easy on the eye | Token-driven theming, `light`/`dark`/`system`, no flash-of-wrong-theme. |
| C8 | Chrome, Safari, Edge, Firefox | Browserslist-enforced; E2E on Chromium + Firefox + WebKit; **no APIs newer than the support floor** (see §11). |
| C9 | Responsive, mobile-first (most users on phones) | Mobile is the primary layout, not a fallback. Slider-heavy UX is explicitly re-designed for touch. |

**Consequences worth stating plainly:**

- **No accounts, no login, no server storage.** The user's financial data never leaves their device unless they choose to generate a share link or export a file. This is a genuine privacy win and materially reduces the PRD's DPDP-compliance surface (see §13, §14 D2).
- **No analytics by default.** Product metrics in PRD §29 cannot be measured without adding a third-party tracker, which conflicts with the privacy posture. This is an open decision — see §16 O4.
- **Market data ships in the bundle.** With no API, the NIFTY 50 TRI history is a committed, versioned static asset. This makes the PRD's data-licensing risk (R1) more acute, not less: the data would be redistributed in a public repository (§14 D3).

---

## 2. Architecture overview

A single-page React app. Everything below the UI layer is framework-free TypeScript, which is what makes the engine exhaustively testable.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (the only runtime — there is no server)             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  UI layer — React 19 + TS                              │  │
│  │  routes · forms · charts · theming · a11y              │  │
│  └───────────────┬────────────────────────────────────────┘  │
│                  │ reads/writes (sync, typed)                │
│  ┌───────────────▼────────────────────────────────────────┐  │
│  │  State layer — Zustand store                           │  │
│  │  scenario inputs · UI prefs · derived selectors        │  │
│  └───┬──────────────┬──────────────────┬──────────────────┘  │
│      │ debounced    │ encode/decode    │ postMessage        │
│  ┌───▼──────────┐ ┌─▼──────────────┐ ┌─▼──────────────────┐  │
│  │ Persistence  │ │  Share codec   │ │  Worker pool       │  │
│  │ localStorage │ │  URL fragment  │ │  (N = cores−1)     │  │
│  │ + migrations │ │  + file export │ │                    │  │
│  └──────────────┘ └────────────────┘ └─┬──────────────────┘  │
│                                        │                     │
│                     ┌──────────────────▼──────────────────┐  │
│                     │  Simulation engine (pure TS)        │  │
│                     │  zero React · zero DOM · seeded RNG │  │
│                     │  returns · inflation · cashflow ·   │  │
│                     │  tax · goals · MonteCarlo           │  │
│                     └──────────────────┬──────────────────┘  │
│                                        │ reads                │
│                     ┌──────────────────▼──────────────────┐  │
│                     │  Static data assets                 │  │
│                     │  NIFTY 50 TRI series (versioned)    │  │
│                     └─────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**The load-bearing rule:** `src/engine/**` must never import from React, the DOM, the store, or any browser API other than those explicitly allowed (none, in practice). It is a pure function library: `simulate(inputs, seed) → results`. This is enforced by lint rule and by a CI check (§9.10). It is what lets us hit very high coverage and run mutation testing where it actually matters.

---

## 3. Technology choices

| Concern | Choice | Why (and what was rejected) |
|---|---|---|
| Framework | **React 19 + TypeScript (strict)** | Your requirement. `strict` + `noUncheckedIndexedAccess` — financial code should not have implicit `any` or unchecked indexing. |
| Build | **Vite 6** | Fast, first-class GitHub Pages `base` support, native TS. *Rejected:* Next.js — its value is SSR/routing we cannot use on a static host; `next export` adds weight for no gain. CRA is unmaintained. |
| State | **Zustand + Immer** | Tiny, testable **outside React** (a plain store you can assert on in unit tests), clean persistence middleware. *Rejected:* Redux Toolkit (ceremony for a single-user app), raw Context (re-render storms with slider-driven updates). |
| Validation | **Zod** | One schema drives: form validation, localStorage rehydration, **and share-link decoding** — all three are untrusted input and must be validated identically. |
| Styling | **CSS custom properties (tokens) + Tailwind CSS v4** | Theming is a single `data-theme` attribute swap; no runtime CSS-in-JS (avoids per-render style cost on slider drags). *Rejected:* styled-components/Emotion (runtime cost), plain CSS Modules (loses utility velocity — though tokens remain the source of truth). |
| Charts | **Recharts** (MVP) with a **uPlot** escape hatch | Recharts is idiomatic React and fine for ≤ a few thousand points. Monte Carlo bands at 480 months × many series will need downsampling or uPlot; the chart layer is behind an adapter interface so swapping is local. *Rejected:* D3-direct (hand-rolling accessibility and responsiveness), Chart.js (canvas-only hurts a11y/testability). |
| Workers | **Comlink** | Ergonomic typed RPC to workers; avoids hand-rolled `postMessage` protocols. |
| Compression | **fflate** | Share-link payloads. *Rejected:* native `CompressionStream` — Safari only gained it in 16.4, and it is async, which complicates a pure/testable codec. fflate is synchronous, deterministic, ~8 KB, and works everywhere in our matrix. |
| Unit/component tests | **Vitest + React Testing Library** | Shares Vite's transform pipeline; fast watch mode. |
| Property tests | **fast-check** | Financial invariants are far better expressed as properties than examples (§9.2). |
| Mutation tests | **Stryker** | Coverage says lines *ran*; mutation says assertions *matter*. Applied to `src/engine` only. |
| E2E | **Playwright** (Chromium, Firefox, WebKit) | Covers all four target browsers' engines in CI (§11 caveat on WebKit ≠ Safari). |
| a11y | **axe-core** via `@axe-core/playwright` + `vitest-axe` | Automated WCAG checks at both component and page level. |
| CI/CD | **GitHub Actions** → `actions/deploy-pages` | Native to the constraint. |

**Money representation:** integer **paise** stored in a plain `number`. `Number.MAX_SAFE_INTEGER` ≈ 9.007 × 10¹⁵ paise ≈ ₹90,000 crore — far beyond any plausible plan, so `BigInt`/`decimal.js` are unnecessary overhead. Rates are stored as basis points (integer) where they feed the codec, and as floats inside the engine. All money enters and leaves the engine as paise; formatting to ₹/k/L/Cr is a display-only concern in one shared module.

---

## 4. Repository structure

```
pfspe0/
├── .github/workflows/
│   ├── ci.yml                  # PR gate: lint, types, unit, e2e, a11y, budgets
│   ├── deploy.yml              # main → build → GitHub Pages
│   └── mutation.yml            # nightly + label-triggered Stryker run
├── public/
│   ├── .nojekyll               # stop Pages ignoring _-prefixed assets
│   └── 404.html                # SPA fallback (see §10.2)
│                               # NOTE: no data/ directory — the app ships
│                               # no market data at all (§14 D3)
├── src/
│   ├── engine/                 # PURE. no react/dom imports. ~100% covered.
│   │   ├── time/               # month-index clock, age↔calendar (PRD §4)
│   │   ├── money/              # paise arithmetic, rounding, formatting inputs
│   │   ├── returns/            # Fixed | Discrete | Bucket | ScriptedSequence | MonteCarlo
│   │   ├── inflation/
│   │   ├── cashflow/           # the single hierarchy (PRD §24)
│   │   ├── tax/                # versioned by assessment year (PRD §19)
│   │   ├── goals/
│   │   ├── insurance/
│   │   ├── random/             # seeded PRNG (PRD §26)
│   │   ├── simulate.ts         # orchestrator: (inputs, seed) => results
│   │   └── __tests__/
│   ├── workers/
│   │   └── simulation.worker.ts
│   ├── state/
│   │   ├── store.ts
│   │   ├── persist.ts          # localStorage + migrations + quota handling
│   │   └── migrations/
│   ├── share/
│   │   ├── codec.ts            # encode/decode + version + checksum
│   │   └── schema/             # per-version field ordering
│   ├── schema/                 # zod models shared by form/persist/share
│   ├── ui/
│   │   ├── tokens.css          # design tokens, light + dark
│   │   ├── components/
│   │   ├── charts/             # adapter over Recharts
│   │   └── pages/
│   └── main.tsx
├── e2e/
├── PRD.md
├── TECHNICAL_SPEC.md
└── vite.config.ts
```

---

## 5. Simulation engine

### 5.1 Purity and isolation
`simulate(inputs: ScenarioInputs, seed: number): SimulationResult` — deterministic, side-effect-free, no I/O. Historical data is **passed in** as an argument, never imported by the engine, so tests can inject fixtures and the engine stays decoupled from the data asset.

### 5.2 Deterministic RNG (PRD §26 requirement)
`Math.random()` is unseedable and therefore unusable — PRD §26 requires reproducible Monte Carlo. Use **PCG32** or **xoshiro128\*\***: small, fast, well-distributed, seedable, and trivially testable (a fixed seed must produce a fixed, snapshot-tested sequence). The seed is stored in the scenario, displayed in the audit view, and travels in the share link — so a shared link reproduces *the exact same* Monte Carlo run, not merely a statistically similar one. That property is worth protecting with a dedicated test.

### 5.3 Worker execution model
- A pool of `min(navigator.hardwareConcurrency - 1, 4)` workers; fall back to 1 when unavailable.
- Monte Carlo runs are **sharded by run index** across workers, then percentiles are merged on the main thread. Sharding by run keeps each worker's arithmetic independent — no shared mutable state, no locks.
- Each worker gets `seed_worker = hash(masterSeed, shardIndex)` so results stay deterministic **regardless of core count**. This is subtle and important: without it, the same seed would produce different results on a 4-core phone and an 8-core laptop, breaking share-link reproducibility. There is a test for exactly this.
- Progress is reported incrementally; every run is **cancellable** (the user changes a slider mid-run and expects it to abort).
- Results transfer as `Float64Array` via transferables to avoid structured-clone copying costs.

### 5.4 Performance budgets (client-side — see §14 D1)
5,000 runs × 480 months ≈ 2.4M month-steps. With typed arrays, preallocated buffers, and **zero allocation in the inner loop**, this is comfortably achievable in-browser. That discipline is the whole ballgame: a naive implementation that allocates an object per simulated month is 10–50× slower purely from GC pressure, and that — not raw CPU — is what would push this over budget.

**Run count is a scenario parameter, not a device default.** It is stored in the scenario, travels in the share link, and is identical on every device. A slower phone takes *longer* to produce **the same numbers**; it never produces *fewer runs* and therefore different percentiles. Tiering the run count by device would mean two people opening the same share link see different p10/p90 values, silently breaking the share-link reproducibility invariant — a subtle, high-consequence bug in a product whose entire premise is numerical honesty.

Budgets are therefore expressed as *time to the same answer*, and mobile is slower by design rather than less accurate:

| Operation (identical work on all devices) | Desktop | Mid-range mobile |
|---|---|---|
| Deterministic recompute (E0/E1) — drives live slider feedback | ≤ 16 ms | ≤ 50 ms |
| Historical / scripted sequence, single path (E2) | ≤ 100 ms | ≤ 300 ms |
| Monte Carlo 1,000 runs | ≤ 700 ms | ≤ 2.5 s |
| Monte Carlo 5,000 runs (default) | ≤ 3 s | ≤ 8 s |
| Monte Carlo 10,000 runs | ≤ 6 s | ≤ 16 s |

**Default is 5,000 runs everywhere.** Deterministic modes update live on slider drag; stochastic modes require the explicit **"Run simulation"** action (PRD §27), always with progress and cancel. If a device is slow, the honest response is a progress bar and an accurate ETA — not a quietly degraded answer.

A CI test asserts run-count equality across simulated device profiles, so this cannot regress into a device-derived default later.

### 5.5 Return sequences — no bundled data
**The app ships no market data (§14 D3).** Sequence-of-returns risk is delivered via **scripted stress sequences**: editable presets defined by depth, duration and recovery shape, stored as ordinary scenario data. A user may optionally load their own CSV, which is parsed in-browser, stays on the device, and is never bundled or transmitted. The engine takes a return series as an argument either way, so both paths use one interface.

`data/nifty50-tri.<version>.json` is committed and versioned. `MANIFEST.json` carries the snapshot id, covered date range, source attribution, and retrieval date. The engine reads only what it is given; the UI shows the true covered range (PRD §26 — do **not** claim "TRI 1995–present"; state the actual range in the manifest). A scenario pins its `dataSnapshotVersion`; opening an old scenario against a newer bundled snapshot prompts a re-run rather than silently changing results.

---

## 6. State, persistence, and reset

### 6.1 Storage contract

| Key | Contents |
|---|---|
| `pwlps:v1:scenarios` | All scenario inputs (the financial data) |
| `pwlps:v1:prefs` | Theme, units, chart preferences, last active scenario |
| `pwlps:v1:meta` | Schema version, last-saved timestamp, app build id |

Namespaced and version-prefixed so a future breaking change can coexist with old data during migration instead of destroying it.

### 6.2 Write policy
- **Debounced at 400 ms**, plus a flush on `visibilitychange → hidden` and on `pagehide`. Do **not** use `beforeunload` for the flush — it is unreliable on mobile Safari, which frequently backgrounds a tab without firing it.
- Writes go through a `safeWrite` wrapper that catches `QuotaExceededError` and Safari Private Browsing failures, degrades to in-memory-only, and surfaces a non-blocking banner: *"Changes aren't being saved in this browser — export your data to keep it."* Silent data loss is the failure mode to design against.
- Expected payload is a few KB; quota (~5 MB) is not a practical concern, but the guard is cheap and covers pathological scenario counts.

### 6.3 Schema versioning and migrations
Every persisted blob carries `schemaVersion`. On load: validate with Zod → if version is older, run ordered migrations `v1→v2→v3…` → re-validate. If validation still fails, **do not silently discard**: quarantine the raw blob under `pwlps:quarantine:<timestamp>`, load defaults, and offer a download of the quarantined data. A user's plan is hours of input; it should never vanish because of a bad deploy.

Every migration ships with a test that feeds a real captured payload of the older version and asserts the migrated output.

### 6.4 Safari's 7-day eviction — accepted limitation
Safari's ITP caps script-writable storage: for a site the user has not interacted with in **7 days of browser use**, localStorage is deleted. On iOS this is the dominant engine, and most users are expected on phones. **localStorage is therefore not a durable-storage guarantee, and no amount of engineering on a static host can make it one** — the platform decides, not us.

**Decision: accepted.** We do not chase workarounds (IndexedDB is subject to the same ITP policy; a backend would solve it but is ruled out by C1). We handle it honestly and identically on every browser — no Safari-specific degraded path, no scary Safari-only warning. The mitigations below are simply how the app always behaves:

1. The UI says **"saved on this device"** — never "saved" or "synced". True everywhere, alarming nowhere.
2. Prominent, one-click **Export to JSON**, always available.
3. A gentle, dismissible nudge to export or bookmark a share link after a substantial scenario is completed — shown to everyone, not just Safari users.
4. Share links double as durable backups: the state is entirely in the URL, so a bookmark or a message to yourself survives any storage eviction.
5. If a returning user's storage is found empty, the app opens in clean first-run state rather than showing a data-loss error — there is no way to distinguish eviction from a first visit, so we do not pretend to.

The net effect: a Safari user who returns after three weeks may need to re-open their bookmark or re-import their export. That is the residual cost, and it is accepted.

### 6.5 Reset semantics
Three distinct, separately-tested operations — "reset everything" is destructive and deserves precision:

| Action | Effect | Confirmation |
|---|---|---|
| **Reset section** | Restores one module (e.g. Insurance) to defaults | Inline undo toast (10 s) |
| **Reset scenario** | Current scenario → defaults; other scenarios untouched | Confirm dialog + undo toast |
| **Reset everything** | Purges all `pwlps:*` keys, clears the URL fragment, reloads to first-run state | Typed confirmation, **and offers an export first** |

"Reset everything" must also clear the URL fragment — otherwise a reload re-imports the shared state from the address bar and the reset appears not to have worked. That bug is the single most likely defect in this area, so it gets an explicit E2E test.

### 6.6 Export / import
`.json` download (schema-versioned, human-readable) and drag-or-pick import with the same Zod validation path as persistence and share links. No size limit, unlike share links.

---

## 7. Share links

### 7.1 Requirements
Recipient opens a URL and sees **the identical model** — same inputs, same assumptions, same seed, same numbers. No backend. No third-party service.

### 7.2 Chosen design: URL **fragment** + compact versioned codec

```
https://sarthakdandotiya.github.io/pfspe0/#s=1.<base64url payload>.<crc>
```

**Fragment (`#`), not query string (`?`) — this is a deliberate privacy decision.** The fragment is never sent to the server in an HTTP request, never appears in GitHub Pages access logs, and is not transmitted in the `Referer` header when the user follows an outbound link. A query string would put someone's salary, net worth, and medical-event assumptions into GitHub's server logs and into the referrer of any link they click. For financial data that is unacceptable, and it costs nothing to avoid.

You suggested query parameters and were open to alternatives — this is the same idea (self-contained state in the URL, no backend) with the leak closed.

### 7.3 Encoding pipeline

```
state  → prune to essentials (drop defaults + UI prefs)
       → canonical ordered tuple (field order fixed per schema version)
       → quantize (money → nearest ₹; rates → basis points)
       → CBOR-style compact binary
       → fflate raw deflate
       → base64url (URL-safe, unpadded)
       → prefix version + append CRC32
```

Key properties:
- **Order-defined, not key-named.** Serializing `{startingCorpus: 600000}` wastes bytes on the key. A fixed field order per version means the payload is values only — typically a 5–10× size reduction.
- **Defaults are omitted.** Only fields differing from the version's defaults are encoded, with a bitmask marking presence. Most users change a handful of inputs, so most links stay very short.
- **Quantization** is lossy by design and bounded: money to the nearest rupee, rates to 0.01%. A round-trip test asserts the decoded model produces **numerically identical simulation results** — that is the real invariant, stronger than field equality.
- **CRC32** detects truncation, which is the common real-world failure (chat apps and email clients break long URLs). A truncated link produces a clear *"This share link looks incomplete"* message rather than a corrupt or silently-wrong plan. Given the whole product is about not misleading people, a share link that silently decodes to the wrong numbers would be the worst possible bug.

### 7.4 Size budget and overflow
Target **≤ 1,500 characters**; hard warn at **2,000**. Modern browsers permit far more, but ~2,000 is the practical ceiling for surviving messaging apps, email clients, and QR codes intact.

Overflow strategy, in order:
1. Drop non-essential precision and optional modules from the encoded set.
2. If still oversized, the share dialog explains the plan is too detailed for a link and offers **Export file** instead.
3. Never emit a link that is likely to be truncated in transit.

A test asserts that a "maximally complex realistic scenario" either fits the budget or triggers the fallback — it must never silently produce a broken link.

### 7.5 Versioning and forward compatibility
The leading `1.` is the codec version. Decoders handle all past versions. An **unknown future version** yields an explicit *"This link was created by a newer version of the app"* message — never a partial or misinterpreted decode. Each codec version's field ordering is frozen in `src/share/schema/` and covered by golden fixtures, so a future refactor cannot silently break links already in circulation.

### 7.6 Import UX — never clobber
Opening a share link while local data exists must not overwrite the user's own plan. The app presents:

- **View shared plan** (read-only, session-only, local data untouched) ← default
- **Save as a new scenario** (keeps both)
- **Replace my current scenario** (explicit, confirmable, undoable)

### 7.7 Privacy warning
The share dialog states plainly: *"This link contains your financial inputs. Anyone with the link can see them."* No PII (name, email, PAN) is ever collected, so a leaked link exposes assumptions, not identity — but the user should still know what they are sending.

### 7.8 Alternatives considered

| Option | Verdict |
|---|---|
| Query params, uncompressed JSON | ❌ Leaks to server logs/referrer; blows the length budget almost immediately |
| Query params, compressed | ❌ Same logging/referrer leak; fragment is strictly better at equal cost |
| URL shortener (bit.ly etc.) | ❌ Sends financial data to a third party; adds a runtime dependency and a backend in all but name |
| GitHub Gist via API | ❌ Requires auth/token — impossible to do safely with no server |
| File export only | ✅ Kept as a complement for oversized plans, but too clunky as the primary share path |
| **Fragment + compact codec** | ✅ **Chosen** — no backend, no third party, no logging, reproducible |

---

## 8. UI architecture

### 8.1 Routing — and a conflict worth flagging early
The share payload lives in the fragment, so **hash-based routing cannot also own the fragment.** Resolution:

- **View state → query param:** `?view=dashboard`
- **Share payload → fragment:** `#s=…`

This keeps both deep-linkable without collision. It also means we need the GitHub Pages SPA fallback only for path-based routes, which we avoid entirely (§10.2). If a router is introduced later, it must be configured to ignore the fragment — worth a comment in the code, because the failure mode (share links breaking when routing changes) is non-obvious.

### 8.2 Theming — light / dark / system
- Tokens as CSS custom properties in `:root`, overridden under `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, so an explicit choice always wins over the system setting in both directions.
- Preference persists in `prefs`; default is **system**.
- **No flash of wrong theme:** a tiny inline script in `index.html` sets `data-theme` from localStorage *before first paint*. This must be inline and synchronous — a deferred module runs too late and the user sees a white flash on a dark device. Covered by a visual regression test.
- `color-scheme` is set so native controls (scrollbars, date pickers, form fields) match the theme.

### 8.3 Visual direction — "modern, light, easy on the eye"
- **Light theme:** off-white ground (not pure `#fff` — pure white on an OLED phone at night is fatiguing), near-black text at ~85% opacity rather than `#000`, generous whitespace, one restrained accent colour.
- **Dark theme:** elevated dark greys (~`#14161a`), never pure black (pure black + OLED smearing hurts scroll readability), with reduced-saturation accents — saturated colours vibrate against dark backgrounds.
- Type scale on a modular ratio; system font stack for zero webfont latency and native feel on each OS.
- **All colour pairs meet WCAG AA (4.5:1 body, 3:1 large/UI).** Enforced by an automated contrast test over the token set in both themes — this catches the classic regression where a token tweak quietly breaks contrast.
- Status colours (🟢🟡🔴 from PRD §6) are **never colour-only**: each carries an icon and a text label, for colour-blind users and for the ~8% of men with CVD in a finance audience.

### 8.4 Inputs on mobile — the slider problem
PRD §27 flags slider-heavy UIs as hostile on phones, and you expect mostly phone users. Every "what-if" control is therefore a **composite input**:

```
[ −auto-step ]  [  ₹25,000  ]  [ +auto-step ]     ← always present, thumb-reachable
[ ─────●──────────────── ]                        ← slider: pointer-fine devices, or opt-in
```

- Direct numeric entry is always available (fastest for a user who knows their salary).
- Touch targets ≥ 44 × 44 px.
- `inputMode="numeric"` so phones show the number pad.
- Steps are magnitude-aware (₹1k below ₹1L, ₹5k above) rather than a fixed step across four orders of magnitude.
- No hover-only affordances anywhere — hover does not exist on touch.

### 8.5 Layout and responsive strategy
Mobile-first, breakpoints at 480 / 768 / 1024 / 1440.

- **Phone:** single column; bottom tab bar; charts full-bleed; inputs in collapsible sections; sticky summary bar with the headline number.
- **Tablet:** two columns (inputs / results).
- **Desktop:** three-pane — inputs, chart, insights — with results live-updating on deterministic changes.
- Charts get an `overflow-x: auto` container; **the page body never scrolls horizontally.**
- Wide PRD tables (goal status, debt, expenses) become **stacked cards** below 768 px rather than pinch-to-zoom tables.
- Respect `prefers-reduced-motion` for chart animations and transitions.

### 8.6 Accessibility (WCAG 2.1 AA)
Keyboard-operable throughout; visible focus rings; labelled form controls with `aria-describedby` for help text and errors; charts carry a text summary and a **"view as table"** toggle (a chart alone is not accessible, and the table also serves the PRD's explainability goal); live regions announce simulation completion; landmarks and heading order verified by axe.

### 8.7 Charts
Behind an adapter (`src/ui/charts/`) so the underlying library can change without touching feature code. Requirements: responsive container, theme-aware colours drawn from tokens, downsampling above ~1,000 points, touch-friendly tooltips (tap, not hover), and per PRD §3 **percentile bands render only when a stochastic run produced them** — the chart component takes a discriminated union on engine tier so it is a *type error* to pass deterministic results to the percentile chart. That is the honesty constraint enforced by the compiler rather than by reviewer diligence.

---

## 9. Testing strategy

Your requirement — *"covered on all fronts so every change is safe always"* — needs more than a coverage number. Coverage proves code **ran**; it does not prove a wrong answer would be **caught**. In a simulator whose entire value proposition is numerical honesty, a silently wrong number is worse than a crash: a crash is visible, a wrong ₹5.3 Cr is not. The suite below is designed around that.

### 9.1 Layers and ownership

| Layer | Tool | Owns | Gate |
|---|---|---|---|
| Static | TS strict, ESLint, `knip` | Types, dead code, import boundaries | PR |
| Unit | Vitest | Engine module correctness | PR |
| Property | fast-check | Invariants across generated inputs | PR |
| Golden master | Vitest snapshots | Whole-scenario numeric stability | PR |
| Mutation | Stryker | *Assertion quality* in the engine | Nightly + on-label |
| Component | RTL + vitest-axe | Rendering, interaction, a11y | PR |
| Integration | Vitest (jsdom) | Store ↔ persistence ↔ codec round-trips | PR |
| E2E | Playwright (3 engines) | Real user journeys, cross-browser | PR |
| Visual | Playwright screenshots | Light/dark, responsive breakpoints | PR |
| Performance | Playwright + budgets | Simulation timing, bundle size | PR |

### 9.2 Property-based tests (highest value per line of test code)
Financial invariants generalise far better as properties than examples:

- **Conservation:** for any inputs, `final corpus == starting + contributions + growth − withdrawals − fees − taxes` (in paise, exactly).
- **Monotonicity:** increasing SIP, holding all else equal, never decreases the final corpus.
- **Ordering:** Bear ≤ Base ≤ Bull final corpus, for all valid inputs.
- **Percentile ordering:** p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90, for all seeds and run counts.
- **Determinism:** same inputs + same seed ⇒ byte-identical results, **independently of worker/core count** (§5.3).
- **Rate conversion:** `(1 + r_monthly)^12 == 1 + r_annual` within tolerance, for all valid `r`.
- **Real/nominal:** deflating by zero inflation is the identity.
- **Codec:** `decode(encode(x))` produces a state whose **simulation results equal** those of `x` (§7.3).
- **Cash-flow hierarchy:** no bucket ever goes negative; total outflow never exceeds total available.

### 9.3 Golden-master scenarios
A fixed set of realistic end-to-end scenarios (the PRD's "Build My Life" 28-year-old, a near-retiree drawing down, a high-DTI house buyer, a job-loss case) with committed expected outputs. Any change to a number surfaces as a reviewable diff. This is the safety net that makes engine refactors safe: an unintended behavioural change cannot pass unnoticed. Updating a golden file requires an explicit `--update` and a reviewer explaining *why* the number moved.

### 9.4 Mutation testing on the engine
Stryker mutates engine source (flips `>` to `>=`, alters constants, removes statements) and asserts the tests fail. Off-by-one and sign errors are exactly the bugs that survive high line coverage in financial code. **Target ≥ 85% mutation score on `src/engine`.** Nightly, because it is slow — plus on demand via a PR label for engine-heavy changes.

### 9.5 E2E journeys (Playwright, all three engines)
1. First visit → defaults render → no console errors.
2. Fill inputs → reload → **values persisted** (your C4 requirement).
3. Change theme → reload → **theme persisted, no flash** (visual assertion).
4. Generate share link → open in a **fresh browser context with empty storage** → identical inputs *and* identical simulation output. This is the requirement that matters most; it is asserted on the numbers, not just the form fields.
5. Open share link with existing local data → import dialog appears → "View shared" leaves local data intact.
6. Reset everything → storage cleared, **fragment cleared**, reload stays reset (§6.5).
7. Truncated/corrupt share link → clear error, no crash, no partial state.
8. Mobile viewport (Pixel 7, iPhone 14 profiles) → no horizontal scroll, tab bar reachable, numeric inputs usable.
9. Run Monte Carlo → progress shown → cancel mid-run → UI recovers cleanly.
10. Offline reload (static asset caching) → app still loads.

### 9.6 Visual regression
Screenshots per breakpoint × theme (2 themes × 4 breakpoints) on key screens. Catches token/contrast/layout regressions that functional tests miss entirely.

### 9.7 Coverage gates (CI-enforced, failing the build)

| Scope | Statements | Branches | Mutation |
|---|---|---|---|
| `src/engine/**` | **100%** | **100%** | ≥ 85% |
| `src/state`, `src/share` | ≥ 95% | ≥ 90% | — |
| `src/ui/**` | ≥ 85% | ≥ 75% | — |
| Overall | ≥ 90% | ≥ 85% | — |

100% on the engine is realistic *because* it is pure, dependency-free, and deterministic. It would be an unreasonable target for UI code, so it is not applied there — an honest gate people won't route around beats an aspirational one they will.

### 9.8 Guardrails that make "every change is safe" structural
- **Import-boundary lint:** `src/engine` may not import React/DOM/store; CI fails otherwise. Prevents the slow erosion that eventually makes the engine untestable.
- **Type-level honesty:** engine results are a discriminated union by tier; percentile UI accepts only stochastic results (§8.7). A regression that would show a fabricated probability is a **compile error**, enforcing PRD §2's release blocker mechanically.
- **Zod at every trust boundary:** localStorage, share links, and file imports are all untrusted input through one validation path.
- **No `any` / no non-null `!`** in engine code (lint-enforced).
- **Codec golden fixtures:** committed payloads from every past codec version must still decode — old share links cannot break.
- **Renovate/Dependabot + full suite on dependency PRs**, so upgrades are gated by the same evidence as feature work.

---

## 10. CI/CD and deployment

### 10.1 Pipelines

**`ci.yml` — on every PR (required to merge):**
```
lint · typecheck · unit + property · golden master · component + a11y
· integration · build · bundle-size budget
· e2e (chromium, firefox, webkit) · visual regression · perf budgets
```

**`deploy.yml` — on push to `main`:**
```
checkout → npm ci → test (full suite) → build (base=/pfspe0/)
→ upload-pages-artifact → deploy-pages
```

The full suite runs **again** before deploy. Since `main` is live the moment it merges, a green PR that went stale behind another merge must not be able to publish a broken site.

**`mutation.yml`** — nightly + on-label Stryker.

### 10.2 GitHub Pages specifics
- `vite.config.ts` sets `base: '/pfspe0/'` — the single most common cause of a blank Pages deploy is a wrong base path producing 404s on every asset. There is a smoke test asserting the built `index.html` references `/pfspe0/` assets.
- `public/.nojekyll` — without it, Pages' Jekyll pipeline drops `_`-prefixed files, which Vite emits.
- **No path-based routing**, so the usual SPA-404 hack is unnecessary; `404.html` is a simple redirect to the app root as a safety net.
- Repo settings: Pages source = **GitHub Actions**; environment `github-pages` with the standard `pages: write` / `id-token: write` permissions.
- Deploy is idempotent; rollback = revert the commit on `main` (redeploys automatically).

### 10.3 Branch protection — the mechanism that makes deploy-on-merge safe

Your model is exactly right: **each PR runs the full safety pipeline; a PR is only mergeable once those checks are green; therefore any merge to `main` is already-validated and safe to publish automatically.** Deploy-on-merge is not a risk in that model — it is a consequence of the gate being upstream of the merge, which is where a gate belongs.

Two GitHub settings do the actual work, and both are needed:

1. **Require status checks to pass before merging** — lists `ci.yml`'s jobs as required. This is the gate itself: the merge button stays disabled until they are green.
2. **Require branches to be up to date before merging** — this is the one people skip, and it closes the gap the first setting leaves open. Without it, two PRs can each be green in isolation and still break `main` when combined: PR A renames an engine function, PR B adds a caller of the old name, both pass against the base they branched from, and `main` breaks on the second merge. Requiring up-to-date branches forces the PR to absorb `main` and re-run CI against the merged result, so **what CI validated is exactly what gets deployed.**

Plus: no direct pushes to `main`, no force-push, and linear history (squash or rebase merges) so a revert is a clean single-commit operation.

**Rollback** is `git revert` on `main`, which redeploys automatically — typically live again in a couple of minutes. Worth rehearsing once before real users exist.

With both settings on, the "full suite re-runs before deploy" step in `deploy.yml` becomes belt-and-braces rather than load-bearing. **Keep it anyway** — it is a few CI minutes and it catches non-determinism, a flaky-test-that-only-fails-sometimes, and any drift between the PR environment and the deploy environment. Cheap insurance for a branch that is always live.

**During planning (now):** none of this applies yet — committing docs directly to `main` is fine and is what we are doing. Turn on branch protection at **P0**, when the first executable code lands and `main` starts being a deployable artifact rather than a folder of markdown.

---

## 11. Browser support

| Browser | Floor | Notes |
|---|---|---|
| Chrome | 111+ | Also covers Chromium Edge |
| Edge | 111+ | Chromium |
| Firefox | 113+ | |
| Safari (macOS) | 16.4+ | |
| Safari (iOS) | 16.4+ | Primary mobile target |

Encoded in `browserslist`; Vite targets accordingly. Notes:

- **Safari 16.4 is the binding constraint.** Anything newer than that floor is off-limits without a fallback. Avoided accordingly: `CompressionStream` (Safari 16.4 — using fflate anyway for sync determinism), `Array.prototype.at` chains, and CSS `:has()` in load-bearing layout.
- **WebKit in Playwright ≠ Safari.** It is the closest CI proxy, but it is not the shipping browser: iOS Safari differs in storage eviction (§6.4), input/keyboard behaviour, and viewport quirks (`100vh` under the dynamic toolbar — use `100dvh`). **Budget for manual testing on a real iPhone before each release**; CI cannot fully cover it, and pretending otherwise is how mobile bugs ship.
- Test the mobile-specific paths deliberately: numeric keypad entry, momentum scroll under sticky bars, safe-area insets on notched devices.

---

## 12. Performance budgets (CI-enforced)

| Metric | Budget |
|---|---|
| Initial JS (gzipped) | ≤ 180 KB |
| Total initial transfer | ≤ 300 KB |
| LCP (mid-tier mobile, 4G) | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| Time to interactive (mobile) | ≤ 3.5 s |

Levers: route/chart code-splitting, worker chunks loaded on demand, historical data fetched lazily (only when a historical mode is selected — it should not tax the first paint), system fonts, tree-shaken chart imports.

---

## 13. Security and privacy under static hosting

The architecture is the privacy story: **no server means no data collection.** Financial inputs live only in the user's browser.

- **HTTPS** enforced by GitHub Pages.
- **CSP** via `<meta http-equiv>` (no server headers available on Pages): `default-src 'self'`, no `unsafe-eval`. Note the theme-flash script (§8.2) is inline — it needs a hash-based CSP allowance rather than `unsafe-inline`.
- **No third-party requests at runtime** — no CDN fonts, no trackers, no external APIs. Everything is same-origin, which also makes the CSP tight and the offline story easy.
- **No secrets** in the client (there is nowhere to hide one in a static bundle, so there must be none to hide).
- **No PII collected** — no name, email, phone, or PAN. Data is figures without identity.
- **DPDP Act 2023:** with no server-side processing, our obligations shrink dramatically — but a privacy policy stating "all data stays on your device; share links embed your inputs" is still required (§14 D2).
- **SEBI framing** (PRD R2) is a content requirement, not a technical one: disclaimers ship as static content and are covered by a test asserting they render on the results view (a disclaimer that silently disappears in a refactor is a compliance incident).

---

## 14. PRD conflicts — what breaks, why, and what it costs

PRD v2.0 was written before the static-hosting constraint existed, so parts of it assume infrastructure that cannot exist here. This section explains each conflict properly: **what the PRD assumes · why static hosting breaks it · what it actually costs · the options · the decision.**

**All six are now settled.** D3 and D5 were closed by *removing the underlying dependency* rather than by analysis — the cleanest kind of resolution, since a dependency that does not exist cannot go wrong.

---

### D1 — Server-side Monte Carlo → client-side workers · **SETTLED**

**What the PRD assumes.** §27: *"V2 Monte Carlo runs server-side (or in a Web Worker/WASM) with a target of ≤3s for a 5,000-run scenario."* That hedge existed because 10,000 runs × 480 months = 4.8M month-steps looked like more than a browser should be asked to do.

**Why static hosting breaks it.** There is no server. Not "a server we'd rather avoid" — there is nowhere to run server code at all. GitHub Pages serves bytes and nothing else.

**What it actually costs — less than the PRD feared.** Working the arithmetic properly: each simulated month is roughly 30–80 arithmetic operations plus one RNG draw. 5,000 runs × 480 months ≈ 2.4M steps ≈ 120M operations. A tight, monomorphic JS loop over typed arrays sustains hundreds of millions of simple operations per second, so this is well under a second single-threaded on a desktop, and faster still sharded across workers. 10,000 runs stays in low single-digit seconds.

So the honest conclusion is that **the PRD's concern was overstated for a well-written engine**, and the mitigation is engineering discipline rather than architecture:

- No object allocation inside the month loop — preallocated `Float64Array` buffers, reused across runs. This is the single decision that matters; an implementation allocating one object per simulated month runs 10–50× slower purely from garbage collection, and that is what would actually blow the budget.
- Shard by run index across workers; merge percentiles on the main thread.
- Per-worker seeds derived as `hash(masterSeed, shardIndex)` so results are identical regardless of core count (§5.3).

**What is genuinely lost:** nothing the PRD needs. Server-side would cap out far higher (100,000+ runs), but the PRD specifies 1,000–10,000. We also *gain* from the constraint: no network round-trip, no per-run hosting cost, and financial inputs never leave the device.

**Decision.** Client-side workers only. Delete the "server-side" clause from PRD §27. Add the no-allocation-in-hot-loop rule as an engine requirement with a performance regression test.

---

### D2 — Authenticated per-user storage → local-only · **SETTLED**

**What the PRD assumes.** §27: *"stored per authenticated user; local-only mode is offered for privacy-sensitive users."* Two modes, with accounts as the default.

**Why static hosting breaks it.** Accounts need a server to hold credentials and data. No server, no accounts. Local-only is not a mode — it is the only possibility.

**What it actually costs.** Three real losses, and they are worth naming rather than glossing over:

1. **No cross-device sync.** Start a plan on your phone, it is not on your laptop.
2. **No recovery.** Device lost or storage cleared, and the plan is gone unless the user exported or bookmarked a share link.
3. **No server-side anything** — no support tooling, no per-user diagnostics.

**What it buys, which is substantial.** The privacy posture stops being a policy promise and becomes an architectural fact: there is no server to breach, no database to leak, no credentials to steal, no auth code to get wrong (account takeover is the most common serious web vulnerability and we simply do not have the surface). DPDP obligations shrink dramatically because we never receive personal data at all — the app processes data entirely on the user's own device. And hosting is free and indefinitely maintainable, which for a project like this is not a small thing.

**How the losses are substituted.** Share links (§7) *are* a cross-device transfer: send yourself the link and continue on the other device. File export/import covers backup and recovery. Together these cover most of the sync use case with zero infrastructure — clunkier than real sync, but adequate, and the honest trade for never holding anyone's financial data.

**Decision.** Local-only, permanently. PRD §27's "authenticated user" clause is deleted; the privacy policy states plainly that all data stays on the device and that share links embed the user's inputs.

---

### D3 — Market data · **CLOSED by removing the dependency**

**Decision: the app ships no third-party market data at all.** Not a reduced amount, not derived statistics — none.

This closes the question by construction rather than by review: there is no dataset in the repository, so there is nothing to redistribute and no terms to satisfy. It also matches the client-only architecture, which has nowhere to fetch data from anyway.

**One correction worth making explicit**, because it is a natural assumption: *manually* extracting data does not change the redistribution question. The issue is not how the data was obtained — it is that committing it to a public repository republishes it to every visitor. Manual extraction for your own private use on your own machine is a different activity from shipping that file in a public app. Since you want none of this to be a question at all, the clean answer is simply not to ship data.

**What replaces it:**

| Capability | Replacement |
|---|---|
| Historical return mode | User enters a reference CAGR; the app adjusts it. Labelled as *their* input |
| Crash replay | **Scripted stress sequences** — editable presets (depth, duration, recovery shape). Labelled illustrative shock shapes, not real events |
| Sequence-of-returns risk | Scripted sequences — hold the mean at 9%, reorder the years. Isolates the concept better than a real path anyway |
| Monte Carlo calibration | Parametric Student-t with user-set mean, volatility, tail weight |
| Volatility / correlation defaults | Generic unsourced placeholders (18% / 4% / 0.2), labelled as such, fully editable |
| True historical replay | **User-supplied CSV**, stays on device, never redistributed |

**What is genuinely lost:** the app cannot say *"here is what the market actually did."* It makes no historical claims — which means it cannot make a false one, and the PRD §23 requirement to separate *historical fact* from *user assumption* becomes trivially satisfiable, because the app holds no historical facts.

**Also settled:** positioning is index-agnostic. Index names survive only as **user-selectable category labels** (a bucket you call "NIFTY 50"), never as a claim that the app holds that index's data.

---

### D4 — Latency budget → same answer everywhere, slower on slow devices · **SETTLED by your instruction**

**What the PRD assumes.** §27: an unqualified *"≤3s for a 5,000-run scenario."*

**Why it breaks.** On a static host that budget must be met by whatever device the user brings. A mid-range Android is roughly 3–5× slower than a laptop, so one number cannot describe both.

**My first draft got this wrong, and your "experience should be the same" instruction is what caught it.** I originally specified device-tiered *run counts* — 1,000 on mobile, 5,000 on desktop. That is a real bug, not a preference: run count changes the percentile estimates, so **the same share link would produce different p10/p90 numbers on a phone than on a laptop.** It would have silently broken the share-link reproducibility invariant, which is the one property the sharing feature exists to provide. Worse, it fails quietly — everything looks fine, the numbers are just wrong.

**Decision.** Run count is a **scenario parameter**, stored and shared, identical everywhere; default 5,000 on all devices. Slow devices take longer and show progress with an accurate ETA and a cancel button — they never get a different answer. Budgets are restated as time-to-the-same-result in §5.4, and a CI test asserts run-count equality across simulated device profiles so this cannot creep back in.

---

### D5 — Product metrics · **CLOSED: dropped**

**Decision: no analytics, no tracker, no telemetry.** PRD §29's behavioural metrics (activation, engagement, model-trust) are deleted.

As noted when I raised this, that requirement was mine, not yours — added in the adversarial review because the original PRD had no measurable success criteria. Satisfying it would mean adding a third-party script, which would contradict the property that has become the product's defining characteristic: **nothing leaves the device.** That is a bad trade for a funnel number.

**What remains measurable without any telemetry:**
- The ten user-capability criteria — verified by watching real people use it, which is more informative at this stage than a funnel.
- Internal correctness — golden-master pass rate 100%, engine mutation score ≥ 85%.

**Bonus effect:** with zero collection there is no cookie banner, no consent flow, and no disclosure obligation beyond one honest sentence — *everything stays in your browser; share links contain the inputs you put in them.*

---

### D6 — Data snapshot versioning → build-time asset · **SETTLED (mechanical)**

**What the PRD assumes.** §26: scenarios pin a data snapshot version; when data updates, the user is prompted to re-run rather than having old results silently change.

**Why it "breaks".** Barely. There is no API to version against, so a data update *is* a new deployment.

**What it costs.** Nothing. User-visible behaviour is identical: the scenario records the snapshot id it was computed against; if the loaded build ships a newer id, the user is prompted to re-run. Only the mechanism changes — a build-time asset rather than a fetched resource. If D3 resolves toward (a)/(b), this shrinks further for MVP.

**Decision.** Mechanical amendment to PRD §26. No impact.

---

### Summary

| # | Conflict | Status | Needs you? |
|---|---|---|---|
| D1 | Server-side Monte Carlo | Client workers; feasible with no-allocation discipline | No |
| D2 | Authenticated storage | Local-only, permanently | No |
| D3 | Market data | **Closed** — ships none; scripted sequences + optional user CSV | No |
| D4 | Latency budget | Same run count everywhere; slower ≠ different | No — settled by your instruction |
| D5 | Product metrics | **Closed** — dropped; no analytics | No |
| D6 | Data versioning | Build-time asset | No |

All six amendments are applied in `PRD.md` v2.1. The two documents now agree.

---

## 15. Build order

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **P0 — Skeleton** | Vite + React + TS, CI, Pages deploy, tokens, theming, a11y baseline | A themed "hello" page auto-deploys on merge; CI blocks a failing PR |
| **P1 — Engine core** | Time model, paise money, fixed/discrete returns, inflation, cash-flow hierarchy, monthly mechanics | 100% coverage + property tests; **no UI yet** |
| **P2 — Shell** | Store, localStorage + migrations, reset flows, responsive layout, input components | E2E persistence and reset journeys pass |
| **P3 — Share** | Codec, fragment routing, import UX, size guards | Round-trip E2E across a fresh browser context passes |
| **P4 — Visualisation** | Wealth chart (Bear/Base/Bull), cash-flow chart, goal status, table view | Visual regression baselines committed |
| **P5 — Sequences (E2)** | **Scripted synthetic sequences + sequence-risk surfacing** (no licensed data needed). User-supplied-CSV replay is an optional extra here | Golden-master scenarios locked; sequence risk demonstrable without bundled data |
| **P6 — MVP hardening** | Validation, failure detection, audit view, disclaimers, real-device testing | PRD §32 MVP scope complete; honesty matrix enforced by types |
| **P7 — V2** | Monte Carlo in workers, percentiles, probability outputs, tax engine, life modules | Determinism-across-core-count test passes |

The engine lands **before** any UI. It is the part that must be correct, it is the part tests can fully cover, and building it first stops UI convenience from leaking into the model.

---

## 16. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **O1** | Custom domain? | `github.io` subdomain vs custom domain | `github.io` for MVP — a custom domain adds DNS/cert steps for no functional gain. Note the base path changes if you move later |
| **O2** | Multiple saved scenarios in MVP? | Single scenario vs named list | **Single** in MVP (PRD scenario comparison is a V1.5/V2 feature); the storage schema already accommodates a list |
| **O3** | Market data | See **§14 D3** | ✅ **Closed.** Ships none; scripted sequences + optional user-supplied CSV |
| **O4** | Analytics vs privacy | See **§14 D5** | ✅ **Closed.** None, permanently |
| **O5** | PWA / offline install | Skip · full service worker | **Skip in MVP** — a service worker adds a cache-invalidation failure mode that interacts badly with auto-deploy-on-merge. Revisit post-MVP |
| **O6** | Error reporting with no backend | None · Sentry free tier | **None for MVP** — a reporter would transmit data off-device, contradicting §13. Rely on the test suite and a local error boundary with a copyable report |

---

## Appendix — quick reference

```bash
npm run dev            # local dev server
npm run test           # unit + property + golden (watch)
npm run test:coverage  # with gates enforced
npm run test:e2e       # Playwright, 3 engines
npm run test:mutation  # Stryker (slow)
npm run build          # production build (base=/pfspe0/)
npm run preview        # verify the built bundle locally
```

**Invariants that must never regress** (each has a dedicated test):
1. Same inputs + same seed ⇒ identical results, on any core count.
2. A share link reproduces the sender's numbers exactly.
3. Reset everything clears storage **and** the URL fragment.
4. Probability/percentile UI cannot render deterministic results (compile-time).
5. Old share links and old localStorage payloads still decode.
6. Every colour token pair meets WCAG AA in both themes.
