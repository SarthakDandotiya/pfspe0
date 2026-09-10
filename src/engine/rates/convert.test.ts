import { describe, expect, it } from 'vitest';
import {
  RateError,
  annualToMonthlyRate,
  compoundFactor,
  monthlyToAnnualRate,
  rateForTotalFactor,
} from './convert';

describe('annualToMonthlyRate', () => {
  it('compounds rather than dividing by 12', () => {
    const monthly = annualToMonthlyRate(0.12);
    // 12% annual is NOT 1% monthly — that is the bug PRD §21 warns about.
    expect(monthly).not.toBeCloseTo(0.01, 6);
    expect(monthly).toBeCloseTo(0.009489, 6);
  });

  it('maps zero to zero', () => {
    expect(annualToMonthlyRate(0)).toBe(0);
  });

  it('handles negative returns', () => {
    expect(annualToMonthlyRate(-0.2)).toBeLessThan(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, -1.5])('rejects %s', (rate) => {
    expect(() => annualToMonthlyRate(rate)).toThrow(RateError);
  });
});

describe('monthlyToAnnualRate', () => {
  it('is the inverse of annualToMonthlyRate', () => {
    for (const annual of [-0.35, -0.05, 0, 0.07, 0.09, 0.11, 0.25]) {
      expect(monthlyToAnnualRate(annualToMonthlyRate(annual))).toBeCloseTo(annual, 12);
    }
  });

  it.each([Number.NaN, -1])('rejects %s', (rate) => {
    expect(() => monthlyToAnnualRate(rate)).toThrow(RateError);
  });
});

describe('compoundFactor', () => {
  it('returns 1 for zero months', () => {
    expect(compoundFactor(0.01, 0)).toBe(1);
  });

  it('compounds over twelve months back to the annual rate', () => {
    expect(compoundFactor(annualToMonthlyRate(0.09), 12)).toBeCloseTo(1.09, 12);
  });

  it.each([[-1], [1.5]])('rejects invalid month counts (%s)', (months) => {
    expect(() => compoundFactor(0.01, months)).toThrow(RateError);
  });

  it('rejects an invalid rate', () => {
    expect(() => compoundFactor(-1, 12)).toThrow(RateError);
  });
});

describe('rateForTotalFactor', () => {
  it('spreads a total factor evenly across months', () => {
    const monthly = rateForTotalFactor(0.65, 14); // a −35% fall over 14 months
    expect(Math.pow(1 + monthly, 14)).toBeCloseTo(0.65, 12);
    expect(monthly).toBeLessThan(0);
  });

  it.each([0, -1, Number.NaN])('rejects a non-positive total factor (%s)', (factor) => {
    expect(() => rateForTotalFactor(factor, 12)).toThrow(RateError);
  });

  it.each([0, 1.5])('rejects invalid month counts (%s)', (months) => {
    expect(() => rateForTotalFactor(0.65, months)).toThrow(RateError);
  });
});
