/**
 * Inflation (PRD §14).
 *
 * Category rates grow the corresponding *expenses*; the general rate deflates
 * *results* to today's purchasing power. The original PRD defined five
 * category rates without saying which one converted nominal to real
 * (finding A-13), which made every real-value comparison ambiguous.
 */

import { annualToMonthlyRate, compoundFactor } from '../rates/convert';

export const INFLATION_CATEGORIES = [
  'general',
  'healthcare',
  'education',
  'housing',
  'lifestyle',
] as const;

export type InflationCategory = (typeof INFLATION_CATEGORIES)[number];

export type InflationRates = Readonly<Record<InflationCategory, number>>;

export interface InflationModel {
  readonly rates: InflationRates;
  /** Cumulative multiplier applied to a category's costs by month `m`. */
  factorAt(category: InflationCategory, month: number): number;
  /** Converts a nominal amount at month `m` to today's purchasing power. */
  toRealValue(nominalAmount: number, month: number): number;
}

export class InflationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InflationError';
  }
}

export const DEFAULT_INFLATION_RATES: InflationRates = {
  general: 0.06,
  healthcare: 0.08,
  education: 0.08,
  housing: 0.06,
  lifestyle: 0.06,
};

export function createInflationModel(rates: InflationRates = DEFAULT_INFLATION_RATES): InflationModel {
  const monthlyRates = {} as Record<InflationCategory, number>;
  for (const category of INFLATION_CATEGORIES) {
    const rate = rates[category];
    if (!Number.isFinite(rate)) {
      throw new InflationError(`Inflation rate for "${category}" must be a finite number.`);
    }
    if (rate <= -1) {
      throw new InflationError(`Inflation rate for "${category}" must be greater than -100%.`);
    }
    monthlyRates[category] = annualToMonthlyRate(rate);
  }

  return {
    rates,
    factorAt(category, month) {
      if (!Number.isInteger(month) || month < 0) {
        throw new InflationError('month must be a non-negative whole number.');
      }
      return compoundFactor(monthlyRates[category], month);
    },
    toRealValue(nominalAmount, month) {
      // The general rate is the deflator (PRD §14).
      return nominalAmount / compoundFactor(monthlyRates.general, month);
    },
  };
}
