/**
 * Annual ↔ monthly rate conversion (PRD §21, review finding on §51).
 *
 * Dividing an annual rate by 12 is wrong for compounding: 12% annual is not
 * 1% monthly, because (1.01)^12 = 1.1268, not 1.12. Over a 40-year horizon
 * that error compounds into a materially overstated corpus.
 */

import { MONTHS_PER_YEAR } from '../time/clock';

export class RateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateError';
  }
}

function requireValidRate(rate: number, name: string): void {
  if (!Number.isFinite(rate)) throw new RateError(`${name} must be a finite number.`);
  // -100% wipes out the position; below that is meaningless and would make
  // (1 + r)^(1/12) return NaN for a negative base under a fractional power.
  if (rate <= -1) throw new RateError(`${name} must be greater than -100%.`);
}

export function annualToMonthlyRate(annualRate: number): number {
  requireValidRate(annualRate, 'annualRate');
  return Math.pow(1 + annualRate, 1 / MONTHS_PER_YEAR) - 1;
}

export function monthlyToAnnualRate(monthlyRate: number): number {
  requireValidRate(monthlyRate, 'monthlyRate');
  return Math.pow(1 + monthlyRate, MONTHS_PER_YEAR) - 1;
}

/** Compound growth factor for `months` at a constant monthly rate. */
export function compoundFactor(monthlyRate: number, months: number): number {
  requireValidRate(monthlyRate, 'monthlyRate');
  if (!Number.isInteger(months) || months < 0) {
    throw new RateError('months must be a non-negative whole number.');
  }
  return Math.pow(1 + monthlyRate, months);
}

/**
 * The constant monthly rate that produces `totalFactor` over `months`.
 * Used to spread a crash or recovery smoothly across its duration.
 */
export function rateForTotalFactor(totalFactor: number, months: number): number {
  if (!Number.isFinite(totalFactor) || totalFactor <= 0) {
    throw new RateError('totalFactor must be a positive finite number.');
  }
  if (!Number.isInteger(months) || months < 1) {
    throw new RateError('months must be a whole number of at least 1.');
  }
  return Math.pow(totalFactor, 1 / months) - 1;
}
