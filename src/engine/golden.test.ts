import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INFLATION_RATES,
  createInflationModel,
  crashSequence,
  discreteScenarios,
  fixedReturn,
  formatCompactINR,
  scriptedSequence,
  simulate,
  type ScenarioInputs,
  type SimulationResult,
} from './index';

/*
 * Golden-master scenarios (TECHNICAL_SPEC §9.3).
 *
 * These lock the engine's numeric behaviour for realistic end-to-end cases.
 * Any change to a number shows up as a reviewable diff in the committed
 * snapshot — which is what makes engine refactors safe. Updating a snapshot
 * requires `-u` and a reviewer who can explain WHY the number moved.
 *
 * Values are formatted in compact INR so a human can actually read the diff:
 * "₹2.43Cr → ₹2.51Cr" is reviewable; a raw paise integer is not.
 */

function digest(result: SimulationResult) {
  const { summary, series } = result;
  const atYear = (year: number) => {
    const index = year * 12 - 1;
    return index < series.corpus.length
      ? formatCompactINR(series.corpus[index] as number)
      : 'beyond horizon';
  };
  return {
    returnModel: summary.returnModelLabel,
    months: summary.months,
    corpusAt: {
      year5: atYear(5),
      year10: atYear(10),
      year20: atYear(20),
      year30: atYear(30),
    },
    finalNominal: formatCompactINR(summary.finalCorpusNominal),
    finalReal: formatCompactINR(summary.finalCorpusReal),
    totalContributions: formatCompactINR(summary.totalContributions),
    totalGrowth: formatCompactINR(summary.totalGrowth),
    totalWithdrawals: formatCompactINR(summary.totalWithdrawals),
    finalEmergencyFund: formatCompactINR(summary.finalEmergencyFund),
    monthsWithShortfall: summary.monthsWithShortfall,
  };
}

/** The PRD §31 "Build My Life" profile, on the §16 defaults. */
const buildMyLife: ScenarioInputs = {
  profile: { currentAgeYears: 28, anchorYear: 2026, targetAgeYears: 60, planUntilAgeYears: 90 },
  opening: { investedCorpus: 6_00_000_00, emergencyFund: 6_50_000_00 },
  income: { monthlySalary: 1_00_000_00, annualIncrementRate: 0.08 },
  sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0.05 },
  expenses: { monthlyEssential: 45_000_00, monthlyDiscretionary: 20_000_00 },
  returnModel: fixedReturn(0.09, 'Base 9%'),
  inflation: createInflationModel(DEFAULT_INFLATION_RATES),
};

describe('golden master', () => {
  it('Build My Life — base scenario', () => {
    expect(digest(simulate(buildMyLife))).toMatchSnapshot();
  });

  it('Build My Life — bear / base / bull', () => {
    const set = discreteScenarios({ bear: 0.07, base: 0.09, bull: 0.11 });
    expect({
      bear: digest(simulate({ ...buildMyLife, returnModel: set.bear })),
      base: digest(simulate({ ...buildMyLife, returnModel: set.base })),
      bull: digest(simulate({ ...buildMyLife, returnModel: set.bull })),
    }).toMatchSnapshot();
  });

  it('a crash five years before the target age', () => {
    const model = scriptedSequence(
      crashSequence({
        normalAnnualRate: 0.09,
        monthsBeforeCrash: 27 * 12,
        drawdown: 0.4,
        crashMonths: 14,
        recoveryMonths: 30,
      }),
      { label: 'Crash at age 55' },
    );
    expect(digest(simulate({ ...buildMyLife, returnModel: model }))).toMatchSnapshot();
  });

  it('a near-retiree drawing down on a modest corpus', () => {
    expect(
      digest(
        simulate({
          profile: {
            currentAgeYears: 58,
            anchorYear: 2026,
            targetAgeYears: 85,
            planUntilAgeYears: 90,
          },
          opening: { investedCorpus: 3_00_00_000_00, emergencyFund: 20_00_000_00 },
          income: { monthlySalary: 0, annualIncrementRate: 0 },
          sip: { monthlyAmount: 0, annualGrowthRate: 0 },
          expenses: { monthlyEssential: 1_00_000_00, monthlyDiscretionary: 0 },
          returnModel: fixedReturn(0.08, 'Retirement 8%'),
          inflation: createInflationModel(DEFAULT_INFLATION_RATES),
        }),
      ),
    ).toMatchSnapshot();
  });

  it('a squeezed household where the SIP is throttled', () => {
    expect(
      digest(
        simulate({
          ...buildMyLife,
          income: { monthlySalary: 60_000_00, annualIncrementRate: 0.05 },
          expenses: { monthlyEssential: 45_000_00, monthlyDiscretionary: 10_000_00 },
        }),
      ),
    ).toMatchSnapshot();
  });
});
