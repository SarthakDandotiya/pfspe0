import { ThemeToggle } from './ui/theme/ThemeToggle';
import { formatCompactINR, rupeesToPaise } from './engine/money/paise';

const MILESTONES: ReadonlyArray<{ phase: string; title: string; done: boolean }> = [
  { phase: 'P0', title: 'Skeleton, theming, CI and Pages deploy', done: true },
  { phase: 'P1', title: 'Engine core — time, money, returns, cash flow', done: false },
  { phase: 'P2', title: 'Shell — store, persistence, reset, layout', done: false },
  { phase: 'P3', title: 'Share links', done: false },
  { phase: 'P4', title: 'Visualisation', done: false },
];

export default function App() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-base font-semibold sm:text-lg">Wealth &amp; Life Planning Simulator</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-ink-muted">
          A client-only planning simulator. Everything runs in your browser — no accounts, no
          servers, and nothing leaves this device.
        </p>

        <section aria-labelledby="status-heading" className="mt-8">
          <h2 id="status-heading" className="text-sm font-semibold tracking-wide uppercase text-ink-muted">
            Build progress
          </h2>
          <ul className="mt-3 space-y-2">
            {MILESTONES.map((milestone) => (
              <li
                key={milestone.phase}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <span
                  aria-hidden="true"
                  className={milestone.done ? 'text-ok' : 'text-ink-muted'}
                >
                  {milestone.done ? '●' : '○'}
                </span>
                <span className="font-mono text-sm text-ink-muted">{milestone.phase}</span>
                <span className="flex-1 text-sm">{milestone.title}</span>
                {/* Status is never colour-only: it carries text too. */}
                <span className="text-xs text-ink-muted">{milestone.done ? 'Done' : 'Planned'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="engine-heading" className="mt-8">
          <h2 id="engine-heading" className="text-sm font-semibold tracking-wide uppercase text-ink-muted">
            Engine smoke check
          </h2>
          <p className="mt-3 rounded-lg border border-line bg-sunken px-4 py-3 text-sm">
            Integer-paise money formatting:{' '}
            <output data-testid="money-sample" className="font-semibold">
              {formatCompactINR(rupeesToPaise(15_000_000))}
            </output>
          </p>
        </section>
      </main>
    </div>
  );
}
