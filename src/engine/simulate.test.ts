import { describe, expect, it } from 'vitest';
import { DEFAULT_INFLATION_RATES, createInflationModel } from './inflation/inflation';
import { discreteScenarios, fixedReturn, scriptedSequence } from './returns/model';
import { type ScenarioInputs, ScenarioValidationError } from './scenario/inputs';
import { simulate } from './simulate';

const noInflation = createInflationModel({
  general: 0,
  healthcare: 0,
  education: 0,
  housing: 0,
  lifestyle: 0,
});

function scenario(overrides: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return {
    profile: { currentAgeYears: 30, anchorYear: 2026, targetAgeYears: 31, planUntilAgeYears: 90 },
    opening: { investedCorpus: 6_00_000_00, emergencyFund: 6_50_000_00 },
    income: { monthlySalary: 1_00_000_00, annualIncrementRate: 0 },
    sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0 },
    expenses: { monthlyEssential: 40_000_00, monthlyDiscretionary: 15_000_00 },
    returnModel: fixedReturn(0),
    inflation: noInflation,
    ...overrides,
  };
}

describe('simulate', () => {
  it('runs one month per month of the horizon', () => {
    const result = simulate(scenario());
    expect(result.summary.months).toBe(12);
    expect(result.series.corpus).toHaveLength(12);
  });

  it('rejects an invalid scenario before doing any work', () => {
    expect(() =>
      simulate(
        scenario({
          profile: {
            currentAgeYears: 30,
            anchorYear: 2026,
            targetAgeYears: 20,
            planUntilAgeYears: 90,
          },
        }),
      ),
    ).toThrow(ScenarioValidationError);
  });

  it('accumulates contributions with no growth at a 0% return', () => {
    const result = simulate(scenario());
    expect(result.summary.totalContributions).toBe(25_000_00 * 12);
    expect(result.summary.totalGrowth).toBe(0);
    expect(result.summary.finalCorpusNominal).toBe(6_00_000_00 + 25_000_00 * 12);
  });

  it('applies growth to the opening balance, not to the new contribution', () => {
    const result = simulate(
      scenario({
        sip: { monthlyAmount: 0, annualGrowthRate: 0 },
        returnModel: fixedReturn(0.12),
      }),
    );
    // A pure lump sum: ₹6L compounding for 12 months at 12% annual.
    expect(result.summary.finalCorpusNominal).toBeCloseTo(6_00_000_00 * 1.12, -2);
  });

  it('escalates salary and SIP on their anniversaries', () => {
    const result = simulate(
      scenario({
        profile: {
          currentAgeYears: 30,
          anchorYear: 2026,
          targetAgeYears: 33,
          planUntilAgeYears: 90,
        },
        income: { monthlySalary: 1_00_000_00, annualIncrementRate: 0.1 },
        sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0.2 },
      }),
    );
    expect(result.series.income[0]).toBe(1_00_000_00);
    expect(result.series.income[11]).toBe(1_00_000_00);
    expect(result.series.income[12]).toBe(1_10_000_00);
    expect(result.series.contributions[12]).toBe(30_000_00);
  });

  it('inflates essential and discretionary expenses over time', () => {
    const result = simulate(
      scenario({
        profile: {
          currentAgeYears: 30,
          anchorYear: 2026,
          targetAgeYears: 32,
          planUntilAgeYears: 90,
        },
        inflation: createInflationModel(DEFAULT_INFLATION_RATES),
      }),
    );
    expect(result.series.essentials[12]).toBeCloseTo(40_000_00 * 1.06, -2);
    expect(result.series.essentials[0]).toBe(40_000_00);
  });

  it('throttles SIP to available cash rather than going negative (PRD §9)', () => {
    const result = simulate(
      scenario({
        income: { monthlySalary: 50_000_00, annualIncrementRate: 0 },
        sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0 },
        expenses: { monthlyEssential: 40_000_00, monthlyDiscretionary: 0 },
      }),
    );
    // ₹50k income − ₹40k essentials leaves ₹10k, so the ₹25k SIP is capped.
    expect(result.series.contributions[0]).toBe(10_000_00);
    expect(result.summary.monthsWithShortfall).toBe(12);
  });

  it('draws from the corpus when income cannot cover essentials', () => {
    const result = simulate(
      scenario({
        income: { monthlySalary: 10_000_00, annualIncrementRate: 0 },
        sip: { monthlyAmount: 0, annualGrowthRate: 0 },
        expenses: { monthlyEssential: 40_000_00, monthlyDiscretionary: 0 },
      }),
    );
    expect(result.series.withdrawals[0]).toBe(30_000_00);
    expect(result.summary.totalWithdrawals).toBe(30_000_00 * 12);
    expect(result.summary.finalCorpusNominal).toBe(6_00_000_00 - 30_000_00 * 12);
  });

  it('falls back to the emergency fund once the corpus is exhausted', () => {
    const result = simulate(
      scenario({
        opening: { investedCorpus: 50_000_00, emergencyFund: 6_50_000_00 },
        income: { monthlySalary: 10_000_00, annualIncrementRate: 0 },
        sip: { monthlyAmount: 0, annualGrowthRate: 0 },
        expenses: { monthlyEssential: 40_000_00, monthlyDiscretionary: 0 },
      }),
    );
    expect(result.summary.finalCorpusNominal).toBe(0);
    expect(result.summary.finalEmergencyFund).toBeLessThan(6_50_000_00);
    // Never negative: the emergency fund is a separate bucket (PRD §7.1).
    expect(result.summary.finalEmergencyFund).toBeGreaterThanOrEqual(0);
  });

  it('reports real value below nominal when inflation is positive', () => {
    const result = simulate(scenario({ inflation: createInflationModel(DEFAULT_INFLATION_RATES) }));
    expect(result.summary.finalCorpusReal).toBeLessThan(result.summary.finalCorpusNominal);
  });

  it('reports real equal to nominal when general inflation is zero', () => {
    const result = simulate(scenario());
    expect(result.summary.finalCorpusReal).toBe(result.summary.finalCorpusNominal);
  });

  it('honours a user-reordered cash-flow hierarchy (PRD §24)', () => {
    const tight = {
      income: { monthlySalary: 50_000_00, annualIncrementRate: 0 },
      expenses: { monthlyEssential: 40_000_00, monthlyDiscretionary: 0 },
    };
    const defaultOrder = simulate(scenario(tight));
    const sipFirst = simulate(scenario({ ...tight, cashFlowOrder: ['sip', 'essentials'] }));
    expect(sipFirst.series.contributions[0]).toBe(25_000_00);
    expect(sipFirst.series.contributions[0]).toBeGreaterThan(
      defaultOrder.series.contributions[0] as number,
    );
  });

  it('accepts an explicit part-year age and a non-January anchor', () => {
    const result = simulate(
      scenario({
        profile: {
          currentAgeYears: 30,
          currentAgeMonths: 6,
          anchorYear: 2026,
          anchorMonth: 4,
          targetAgeYears: 31,
          planUntilAgeYears: 90,
        },
      }),
    );
    // 30y6m to age 31 is six months, not twelve.
    expect(result.summary.months).toBe(6);
  });

  it('accepts custom escalation months for salary and SIP', () => {
    const result = simulate(
      scenario({
        profile: {
          currentAgeYears: 30,
          anchorYear: 2026,
          targetAgeYears: 32,
          planUntilAgeYears: 90,
        },
        income: { monthlySalary: 1_00_000_00, annualIncrementRate: 0.1, firstIncrementMonth: 6 },
        sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0.2, firstGrowthMonth: 3 },
      }),
    );
    expect(result.series.income[5]).toBe(1_00_000_00);
    expect(result.series.income[6]).toBe(1_10_000_00);
    expect(result.series.contributions[2]).toBe(25_000_00);
    expect(result.series.contributions[3]).toBe(30_000_00);
  });

  it('carries the return model label into the summary for the audit view', () => {
    const result = simulate(scenario({ returnModel: fixedReturn(0.09, 'Base') }));
    expect(result.summary.returnModelLabel).toBe('Base');
  });

  it('shows sequence-of-returns risk: same average, different order, different result', () => {
    // The whole reason scripted sequences exist (PRD §11.4, finding A-6):
    // a single fixed rate cannot express this at all.
    const segments = [
      { months: 60, annualRate: -0.05 },
      { months: 60, annualRate: 0.25 },
    ];
    const drawdown = {
      profile: {
        currentAgeYears: 30,
        anchorYear: 2026,
        targetAgeYears: 40,
        planUntilAgeYears: 90,
      },
      income: { monthlySalary: 30_000_00, annualIncrementRate: 0 },
      sip: { monthlyAmount: 0, annualGrowthRate: 0 },
      expenses: { monthlyEssential: 60_000_00, monthlyDiscretionary: 0 },
      opening: { investedCorpus: 1_00_00_000_00, emergencyFund: 0 },
    };

    const badYearsFirst = simulate(
      scenario({ ...drawdown, returnModel: scriptedSequence(segments) }),
    );
    const goodYearsFirst = simulate(
      scenario({ ...drawdown, returnModel: scriptedSequence([...segments].reverse()) }),
    );

    expect(goodYearsFirst.summary.finalCorpusNominal).not.toBe(
      badYearsFirst.summary.finalCorpusNominal,
    );
    // Poor returns while withdrawing does lasting damage.
    expect(goodYearsFirst.summary.finalCorpusNominal).toBeGreaterThan(
      badYearsFirst.summary.finalCorpusNominal,
    );
  });

  it('orders discrete scenarios bear ≤ base ≤ bull', () => {
    const set = discreteScenarios({ bear: 0.07, base: 0.09, bull: 0.11 });
    const run = (model: ScenarioInputs['returnModel']) =>
      simulate(
        scenario({
          profile: {
            currentAgeYears: 30,
            anchorYear: 2026,
            targetAgeYears: 60,
            planUntilAgeYears: 90,
          },
          returnModel: model,
        }),
      ).summary.finalCorpusNominal;

    expect(run(set.bear)).toBeLessThan(run(set.base));
    expect(run(set.base)).toBeLessThan(run(set.bull));
  });
});
