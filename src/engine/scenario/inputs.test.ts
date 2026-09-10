import { describe, expect, it } from 'vitest';
import { createInflationModel } from '../inflation/inflation';
import { fixedReturn } from '../returns/model';
import {
  ScenarioValidationError,
  type ScenarioInputs,
  assertValidScenario,
  escalationsBy,
  validateScenario,
} from './inputs';

const base: ScenarioInputs = {
  profile: { currentAgeYears: 28, anchorYear: 2026, targetAgeYears: 60, planUntilAgeYears: 90 },
  opening: { investedCorpus: 6_00_000_00, emergencyFund: 6_50_000_00 },
  income: { monthlySalary: 1_00_000_00, annualIncrementRate: 0.08 },
  sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0.05 },
  expenses: { monthlyEssential: 40_000_00, monthlyDiscretionary: 15_000_00 },
  returnModel: fixedReturn(0.09),
  inflation: createInflationModel(),
};

describe('validateScenario', () => {
  it('accepts a well-formed scenario', () => {
    expect(validateScenario(base)).toEqual([]);
  });

  it('rejects a target age at or below the current age', () => {
    const issues = validateScenario({
      ...base,
      profile: { ...base.profile, targetAgeYears: 28 },
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: 'profile.targetAgeYears', severity: 'error' }),
    );
  });

  it('rejects a plan-until age before the target age', () => {
    const issues = validateScenario({
      ...base,
      profile: { ...base.profile, planUntilAgeYears: 50 },
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: 'profile.planUntilAgeYears', severity: 'error' }),
    );
  });

  it.each([
    ['opening.investedCorpus', { opening: { investedCorpus: -1, emergencyFund: 0 } }],
    ['income.monthlySalary', { income: { monthlySalary: -1, annualIncrementRate: 0.08 } }],
    ['sip.monthlyAmount', { sip: { monthlyAmount: Number.NaN, annualGrowthRate: 0.05 } }],
    [
      'expenses.monthlyEssential',
      { expenses: { monthlyEssential: -5, monthlyDiscretionary: 0 } },
    ],
  ])('rejects a negative or non-finite %s', (field, patch) => {
    const issues = validateScenario({ ...base, ...patch } as ScenarioInputs);
    expect(issues).toContainEqual(expect.objectContaining({ field, severity: 'error' }));
  });

  it('collects every problem rather than stopping at the first', () => {
    const issues = validateScenario({
      ...base,
      profile: { ...base.profile, targetAgeYears: 20, planUntilAgeYears: 10 },
      opening: { investedCorpus: -1, emergencyFund: -1 },
    });
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });

  it('warns, but does not fail, when SIP outgrows income (PRD §9)', () => {
    const issues = validateScenario({
      ...base,
      sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0.3 },
    });
    expect(issues).toEqual([
      expect.objectContaining({ field: 'sip.annualGrowthRate', severity: 'warning' }),
    ]);
    expect(() =>
      assertValidScenario({ ...base, sip: { monthlyAmount: 25_000_00, annualGrowthRate: 0.3 } }),
    ).not.toThrow();
  });
});

describe('assertValidScenario', () => {
  it('throws with the collected issues attached', () => {
    try {
      assertValidScenario({ ...base, profile: { ...base.profile, targetAgeYears: 10 } });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioValidationError);
      expect((error as ScenarioValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe('escalationsBy', () => {
  it('applies no escalation before the first anniversary', () => {
    expect(escalationsBy(0, 12)).toBe(0);
    expect(escalationsBy(11, 12)).toBe(0);
  });

  it('applies one escalation per completed year thereafter', () => {
    expect(escalationsBy(12, 12)).toBe(1);
    expect(escalationsBy(23, 12)).toBe(1);
    expect(escalationsBy(24, 12)).toBe(2);
  });

  it('respects a non-default anniversary month', () => {
    expect(escalationsBy(5, 6)).toBe(0);
    expect(escalationsBy(6, 6)).toBe(1);
  });
});
