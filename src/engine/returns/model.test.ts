import { describe, expect, it } from 'vitest';
import { annualToMonthlyRate } from '../rates/convert';
import {
  ReturnModelError,
  annualisedReturn,
  bucketReturnModels,
  buildBuckets,
  crashSequence,
  cumulativeFactor,
  discreteScenarios,
  fixedReturn,
  scriptedSequence,
} from './model';

describe('fixedReturn', () => {
  it('returns the same monthly rate every month', () => {
    const model = fixedReturn(0.09);
    expect(model.monthlyReturnAt(0)).toBeCloseTo(annualToMonthlyRate(0.09), 15);
    expect(model.monthlyReturnAt(500)).toBe(model.monthlyReturnAt(0));
  });

  it('compounds to the annual rate over a year', () => {
    expect(cumulativeFactor(fixedReturn(0.09), 12)).toBeCloseTo(1.09, 12);
  });

  it('labels itself readably', () => {
    expect(fixedReturn(0.09).label).toBe('Fixed 9.0%');
    expect(fixedReturn(0.09, 'Base').label).toBe('Base');
  });
});

describe('discreteScenarios', () => {
  it('builds the PRD §10.3 default set', () => {
    const set = discreteScenarios({ bear: 0.07, base: 0.09, bull: 0.11 });
    expect(set.bear.label).toBe('Bear');
    expect(cumulativeFactor(set.bear, 120)).toBeLessThan(cumulativeFactor(set.base, 120));
    expect(cumulativeFactor(set.base, 120)).toBeLessThan(cumulativeFactor(set.bull, 120));
  });

  it('rejects a set that is not ordered bear ≤ base ≤ bull', () => {
    expect(() => discreteScenarios({ bear: 0.11, base: 0.09, bull: 0.07 })).toThrow(
      ReturnModelError,
    );
  });

  it('allows equal rates', () => {
    expect(() => discreteScenarios({ bear: 0.09, base: 0.09, bull: 0.09 })).not.toThrow();
  });
});

describe('buildBuckets', () => {
  // The worked examples from PRD §10.1.
  it('produces 7/9/11 for base 9%, count 3, step 2%', () => {
    const rates = buildBuckets({ baseRate: 0.09, count: 3, step: 0.02 }).map((b) =>
      Number((b.annualRate * 100).toFixed(6)),
    );
    expect(rates).toEqual([7, 9, 11]);
  });

  it('produces 5/7/9/11/13 for base 9%, count 5, step 2%', () => {
    const rates = buildBuckets({ baseRate: 0.09, count: 5, step: 0.02 }).map((b) =>
      Number((b.annualRate * 100).toFixed(6)),
    );
    expect(rates).toEqual([5, 7, 9, 11, 13]);
  });

  it('assigns weights that sum to 1', () => {
    for (const count of [1, 3, 5, 7, 9, 11]) {
      const total = buildBuckets({ baseRate: 0.09, count, step: 0.02 }).reduce(
        (sum, b) => sum + b.weight,
        0,
      );
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it('weights symmetrically around the base, with the centre heaviest', () => {
    const buckets = buildBuckets({ baseRate: 0.09, count: 5, step: 0.02 });
    expect(buckets[0]?.weight).toBeCloseTo(buckets[4]?.weight as number, 12);
    expect(buckets[1]?.weight).toBeCloseTo(buckets[3]?.weight as number, 12);
    expect(buckets[2]?.weight).toBeGreaterThan(buckets[1]?.weight as number);
  });

  it('enforces an odd count so the base stays centred', () => {
    expect(() => buildBuckets({ baseRate: 0.09, count: 4, step: 0.02 })).toThrow(/odd/);
  });

  it.each([0, -1, 2.5])('rejects an invalid count (%s)', (count) => {
    expect(() => buildBuckets({ baseRate: 0.09, count, step: 0.02 })).toThrow(ReturnModelError);
  });

  it.each([-0.01, Number.NaN])('rejects an invalid step (%s)', (step) => {
    expect(() => buildBuckets({ baseRate: 0.09, count: 3, step })).toThrow(ReturnModelError);
  });

  it('collapses to the base rate for a single bucket', () => {
    const buckets = buildBuckets({ baseRate: 0.09, count: 1, step: 0.02 });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.annualRate).toBeCloseTo(0.09, 12);
    expect(buckets[0]?.weight).toBeCloseTo(1, 12);
  });

  it('exposes buckets as return models', () => {
    const models = bucketReturnModels({ baseRate: 0.09, count: 3, step: 0.02 });
    expect(models.map((m) => m.label)).toEqual(['7.0%', '9.0%', '11.0%']);
  });
});

describe('scriptedSequence', () => {
  it('applies each segment for its stated number of months', () => {
    const model = scriptedSequence([
      { months: 2, annualRate: 0.2 },
      { months: 2, annualRate: -0.1 },
    ]);
    expect(model.monthlyReturnAt(0)).toBeCloseTo(annualToMonthlyRate(0.2), 15);
    expect(model.monthlyReturnAt(1)).toBeCloseTo(annualToMonthlyRate(0.2), 15);
    expect(model.monthlyReturnAt(2)).toBeCloseTo(annualToMonthlyRate(-0.1), 15);
  });

  it('carries the last rate forward rather than dropping to zero growth', () => {
    const model = scriptedSequence([{ months: 1, annualRate: 0.08 }]);
    expect(model.monthlyReturnAt(99)).toBeCloseTo(annualToMonthlyRate(0.08), 15);
  });

  it('accepts an explicit trailing rate', () => {
    const model = scriptedSequence([{ months: 1, annualRate: 0.2 }], {
      trailingAnnualRate: 0.05,
      label: 'Custom',
    });
    expect(model.monthlyReturnAt(50)).toBeCloseTo(annualToMonthlyRate(0.05), 15);
    expect(model.label).toBe('Custom');
  });

  it('rejects an empty or malformed sequence', () => {
    expect(() => scriptedSequence([])).toThrow(/at least one segment/);
    expect(() => scriptedSequence([{ months: 0, annualRate: 0.1 }])).toThrow(ReturnModelError);
    expect(() => scriptedSequence([{ months: 1.5, annualRate: 0.1 }])).toThrow(ReturnModelError);
  });
});

describe('crashSequence', () => {
  const spec = {
    normalAnnualRate: 0.09,
    monthsBeforeCrash: 24,
    drawdown: 0.35,
    crashMonths: 14,
    recoveryMonths: 26,
  };

  it('falls by exactly the stated drawdown at the trough', () => {
    const model = scriptedSequence(crashSequence(spec));
    const beforeCrash = cumulativeFactor(model, 24);
    const atTrough = cumulativeFactor(model, 24 + 14);
    expect(atTrough / beforeCrash).toBeCloseTo(0.65, 10);
  });

  it('returns to the pre-crash level at the end of recovery', () => {
    const model = scriptedSequence(crashSequence(spec));
    const beforeCrash = cumulativeFactor(model, 24);
    const afterRecovery = cumulativeFactor(model, 24 + 14 + 26);
    expect(afterRecovery / beforeCrash).toBeCloseTo(1, 10);
  });

  it('is not an instantaneous multiply followed by normal returns (PRD §11.1)', () => {
    const model = scriptedSequence(crashSequence(spec));
    // The fall is spread across the crash window, so month 25 is already down
    // but not yet at the trough.
    const oneMonthIn = cumulativeFactor(model, 25) / cumulativeFactor(model, 24);
    expect(oneMonthIn).toBeLessThan(1);
    expect(oneMonthIn).toBeGreaterThan(0.65);
  });

  it('supports a crash with no lead-in and no recovery', () => {
    const segments = crashSequence({ ...spec, monthsBeforeCrash: 0, recoveryMonths: 0 });
    const model = scriptedSequence(segments);
    expect(cumulativeFactor(model, 14)).toBeCloseTo(0.65, 10);
  });

  it.each([0, 1, 1.5, -0.1])('rejects an out-of-range drawdown (%s)', (drawdown) => {
    expect(() => crashSequence({ ...spec, drawdown })).toThrow(ReturnModelError);
  });
});

describe('annualisedReturn', () => {
  it('recovers the input rate for a fixed model', () => {
    expect(annualisedReturn(fixedReturn(0.09), 120)).toBeCloseTo(0.09, 12);
  });

  it('rejects a zero-month window', () => {
    expect(() => annualisedReturn(fixedReturn(0.09), 0)).toThrow(ReturnModelError);
  });
});
