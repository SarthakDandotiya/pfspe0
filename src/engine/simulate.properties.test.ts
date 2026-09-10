import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate, type CashFlowBucket, type Demand } from './cashflow/allocate';
import { createInflationModel } from './inflation/inflation';
import { annualToMonthlyRate, monthlyToAnnualRate } from './rates/convert';
import { discreteScenarios, fixedReturn } from './returns/model';
import type { ScenarioInputs } from './scenario/inputs';
import { simulate } from './simulate';

/*
 * Property-based tests (TECHNICAL_SPEC §9.2).
 *
 * These express the invariants a financial simulator must never violate, for
 * ALL valid inputs rather than a handful of examples. In a tool whose value is
 * numerical honesty, a silently wrong number is worse than a crash — a crash
 * is visible; a wrong ₹5.3 Cr is not. Example tests cannot cover that space.
 */

const rupees = (max: number) => fc.integer({ min: 0, max }).map((r) => r * 100);

const scenarioArb = fc.record({
  openingCorpus: rupees(2_00_00_000),
  emergencyFund: rupees(50_00_000),
  monthlySalary: rupees(10_00_000),
  incrementRate: fc.double({ min: 0, max: 0.2, noNaN: true }),
  sipAmount: rupees(3_00_000),
  sipGrowth: fc.double({ min: 0, max: 0.2, noNaN: true }),
  essential: rupees(3_00_000),
  discretionary: rupees(1_00_000),
  annualReturn: fc.double({ min: -0.5, max: 0.3, noNaN: true }),
  inflationRate: fc.double({ min: 0, max: 0.15, noNaN: true }),
  years: fc.integer({ min: 1, max: 40 }),
});

type ScenarioSpec = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;

function build(spec: ScenarioSpec, overrides: Partial<ScenarioInputs> = {}): ScenarioInputs {
  const rate = spec.inflationRate;
  return {
    profile: {
      currentAgeYears: 30,
      anchorYear: 2026,
      targetAgeYears: 30 + spec.years,
      planUntilAgeYears: 95,
    },
    opening: { investedCorpus: spec.openingCorpus, emergencyFund: spec.emergencyFund },
    income: { monthlySalary: spec.monthlySalary, annualIncrementRate: spec.incrementRate },
    sip: { monthlyAmount: spec.sipAmount, annualGrowthRate: spec.sipGrowth },
    expenses: { monthlyEssential: spec.essential, monthlyDiscretionary: spec.discretionary },
    returnModel: fixedReturn(spec.annualReturn),
    inflation: createInflationModel({
      general: rate,
      healthcare: rate,
      education: rate,
      housing: rate,
      lifestyle: rate,
    }),
    ...overrides,
  };
}

describe('conservation of money', () => {
  it('total wealth equals opening + contributions + growth − withdrawals, exactly', () => {
    fc.assert(
      fc.property(scenarioArb, (spec) => {
        const { summary } = simulate(build(spec));
        const closing = summary.finalCorpusNominal + summary.finalEmergencyFund;
        const opening = summary.openingCorpus + summary.openingEmergencyFund;
        const expected =
          opening + summary.totalContributions + summary.totalGrowth - summary.totalWithdrawals;
        // Exact, not approximate: every step is integer paise arithmetic.
        expect(closing).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });
});

describe('non-negativity', () => {
  it('no balance ever goes negative', () => {
    fc.assert(
      fc.property(scenarioArb, (spec) => {
        const { series } = simulate(build(spec));
        for (let m = 0; m < series.corpus.length; m += 1) {
          expect(series.corpus[m]).toBeGreaterThanOrEqual(0);
          expect(series.emergencyFund[m]).toBeGreaterThanOrEqual(0);
          expect(series.contributions[m]).toBeGreaterThanOrEqual(0);
          expect(series.withdrawals[m]).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('contributions never exceed income', () => {
    fc.assert(
      fc.property(scenarioArb, (spec) => {
        const { series } = simulate(build(spec));
        for (let m = 0; m < series.corpus.length; m += 1) {
          expect(series.contributions[m] as number).toBeLessThanOrEqual(series.income[m] as number);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('monotonicity', () => {
  it('raising the SIP never reduces the final corpus', () => {
    fc.assert(
      fc.property(scenarioArb, rupees(2_00_000), (spec, extra) => {
        const lower = simulate(build(spec)).summary;
        const higher = simulate(
          build({ ...spec, sipAmount: spec.sipAmount + extra }),
        ).summary;
        expect(higher.finalCorpusNominal).toBeGreaterThanOrEqual(lower.finalCorpusNominal);
      }),
      { numRuns: 200 },
    );
  });

  it('raising the return never reduces the final corpus', () => {
    fc.assert(
      fc.property(scenarioArb, fc.double({ min: 0, max: 0.1, noNaN: true }), (spec, bump) => {
        const lower = simulate(build(spec)).summary;
        const higher = simulate(
          build({ ...spec, annualReturn: spec.annualReturn + bump }),
        ).summary;
        expect(higher.finalCorpusNominal).toBeGreaterThanOrEqual(lower.finalCorpusNominal);
      }),
      { numRuns: 200 },
    );
  });
});

describe('scenario ordering', () => {
  it('bear ≤ base ≤ bull for every scenario', () => {
    fc.assert(
      fc.property(scenarioArb, (spec) => {
        const set = discreteScenarios({ bear: 0.07, base: 0.09, bull: 0.11 });
        const run = (model: ScenarioInputs['returnModel']) =>
          simulate(build(spec, { returnModel: model })).summary.finalCorpusNominal;
        const bear = run(set.bear);
        const base = run(set.base);
        expect(bear).toBeLessThanOrEqual(base);
        expect(base).toBeLessThanOrEqual(run(set.bull));
      }),
      { numRuns: 150 },
    );
  });
});

describe('determinism', () => {
  it('the same inputs produce byte-identical series', () => {
    fc.assert(
      fc.property(scenarioArb, (spec) => {
        const first = simulate(build(spec));
        const second = simulate(build(spec));
        expect(Array.from(second.series.corpus)).toEqual(Array.from(first.series.corpus));
        expect(second.summary).toEqual(first.summary);
      }),
      { numRuns: 100 },
    );
  });
});

describe('real versus nominal', () => {
  it('real value never exceeds nominal when inflation is non-negative', () => {
    fc.assert(
      fc.property(scenarioArb, (spec) => {
        const { summary } = simulate(build(spec));
        expect(summary.finalCorpusReal).toBeLessThanOrEqual(summary.finalCorpusNominal + 1);
      }),
      { numRuns: 200 },
    );
  });
});

describe('rate conversion', () => {
  it('annual → monthly → annual is the identity', () => {
    fc.assert(
      fc.property(fc.double({ min: -0.9, max: 1, noNaN: true }), (annual) => {
        expect(monthlyToAnnualRate(annualToMonthlyRate(annual))).toBeCloseTo(annual, 10);
      }),
      { numRuns: 500 },
    );
  });
});

describe('cash-flow allocation', () => {
  const bucketArb = fc.constantFrom<CashFlowBucket>('essentials', 'sip', 'discretionary', 'debt');

  it('conserves money: funded + remaining always equals available', () => {
    fc.assert(
      fc.property(
        rupees(10_00_000),
        fc.array(fc.record({ bucket: bucketArb, amount: rupees(5_00_000) }), { maxLength: 6 }),
        (available, demands) => {
          const result = allocate(available, demands as Demand[]);
          expect(result.totalFunded + result.remaining).toBe(available);
          for (const allocation of result.allocations) {
            expect(allocation.funded).toBeGreaterThanOrEqual(0);
            expect(allocation.funded).toBeLessThanOrEqual(allocation.requested);
            expect(allocation.shortfall).toBe(allocation.requested - allocation.funded);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('respects priority: an earlier bucket is never starved for a later one', () => {
    fc.assert(
      fc.property(
        rupees(10_00_000),
        fc.array(fc.record({ bucket: bucketArb, amount: rupees(5_00_000) }), {
          minLength: 2,
          maxLength: 6,
        }),
        (available, demands) => {
          const result = allocate(available, demands as Demand[]);
          for (let i = 0; i < result.allocations.length - 1; i += 1) {
            const earlier = result.allocations[i];
            const later = result.allocations[i + 1];
            // If a later bucket got anything, every earlier one was fully funded.
            if ((later?.funded ?? 0) > 0) expect(earlier?.shortfall).toBe(0);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
