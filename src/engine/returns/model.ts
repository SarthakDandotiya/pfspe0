/**
 * Return engine (PRD §10). Every mode implements one interface so the
 * simulator never branches on model type, and each mode is independently
 * testable in isolation.
 *
 * Engine tiers (PRD §3): E0 fixed, E1 discrete/bucket, E2 scripted sequence.
 * Monte Carlo (E3) arrives in a later phase and will implement this same
 * interface.
 */

import { annualToMonthlyRate, rateForTotalFactor } from '../rates/convert';

export interface ReturnModel {
  readonly label: string;
  /** Monthly return as a decimal (0.0072 = 0.72%) for month index m. */
  monthlyReturnAt(month: number): number;
}

export class ReturnModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReturnModelError';
  }
}

/* ------------------------------------------------------------------ E0 --- */

export function fixedReturn(annualRate: number, label = `Fixed ${(annualRate * 100).toFixed(1)}%`): ReturnModel {
  const monthly = annualToMonthlyRate(annualRate);
  return { label, monthlyReturnAt: () => monthly };
}

/* ------------------------------------------------------------------ E1 --- */

export interface DiscreteScenarioRates {
  readonly bear: number;
  readonly base: number;
  readonly bull: number;
}

export interface DiscreteScenarioSet {
  readonly bear: ReturnModel;
  readonly base: ReturnModel;
  readonly bull: ReturnModel;
}

/** MVP default: Bear/Base/Bull as labelled discrete paths (PRD §10.3). */
export function discreteScenarios(rates: DiscreteScenarioRates): DiscreteScenarioSet {
  if (!(rates.bear <= rates.base && rates.base <= rates.bull)) {
    throw new ReturnModelError('Discrete scenarios must satisfy bear ≤ base ≤ bull.');
  }
  return {
    bear: fixedReturn(rates.bear, 'Bear'),
    base: fixedReturn(rates.base, 'Base'),
    bull: fixedReturn(rates.bull, 'Bull'),
  };
}

/* --------------------------------------------------------- Bucket model --- */

export interface BucketConfig {
  /** Centre of the distribution, e.g. 0.09. */
  readonly baseRate: number;
  /** Must be odd, so the base stays centred (PRD §10.1). */
  readonly count: number;
  /** Spacing between adjacent buckets ("spread per step"). */
  readonly step: number;
}

export interface Bucket {
  readonly annualRate: number;
  /** Probability weight; the set sums to 1. */
  readonly weight: number;
}

/**
 * The original PRD called `step` "bias" without saying whether it meant the
 * spacing or the total spread, and assigned no probabilities at all
 * (finding A-29). Both are pinned down here.
 */
export function buildBuckets(config: BucketConfig): Bucket[] {
  const { baseRate, count, step } = config;
  if (!Number.isInteger(count) || count < 1) {
    throw new ReturnModelError('Bucket count must be a whole number of at least 1.');
  }
  if (count % 2 === 0) {
    throw new ReturnModelError('Bucket count must be odd so the base rate stays centred.');
  }
  if (!Number.isFinite(step) || step < 0) {
    throw new ReturnModelError('Bucket step must be a non-negative finite number.');
  }

  const half = (count - 1) / 2;
  // Discretised normal centred on the base rate. Sigma is chosen so the
  // outermost buckets sit ~2 SD out, giving them meaningful but small weight.
  const sigma = half === 0 ? 1 : half / 2;
  const offsets: number[] = [];
  const rawWeights: number[] = [];
  for (let k = -half; k <= half; k += 1) {
    offsets.push(k);
    rawWeights.push(Math.exp(-0.5 * (k / sigma) ** 2));
  }
  const total = rawWeights.reduce((sum, weight) => sum + weight, 0);

  return offsets.map((k, index) => ({
    annualRate: baseRate + k * step,
    weight: (rawWeights[index] as number) / total,
  }));
}

export function bucketReturnModels(config: BucketConfig): ReturnModel[] {
  return buildBuckets(config).map((bucket) =>
    fixedReturn(bucket.annualRate, `${(bucket.annualRate * 100).toFixed(1)}%`),
  );
}

/* ------------------------------------------------------------------ E2 --- */

export interface SequenceSegment {
  readonly months: number;
  readonly annualRate: number;
}

export interface ScriptedSequenceOptions {
  readonly label?: string;
  /**
   * Rate applied after the scripted segments run out. Defaults to the last
   * segment's rate, so a sequence never silently becomes 0% growth.
   */
  readonly trailingAnnualRate?: number;
}

/**
 * A varying return path, defined by the user (PRD §11.3).
 *
 * This is what delivers sequence-of-returns risk in the MVP: the app ships no
 * market data (PRD §26), and a single fixed rate cannot express sequence risk
 * at all, because every ordering is identical.
 */
export function scriptedSequence(
  segments: readonly SequenceSegment[],
  options: ScriptedSequenceOptions = {},
): ReturnModel {
  if (segments.length === 0) {
    throw new ReturnModelError('A scripted sequence needs at least one segment.');
  }
  for (const segment of segments) {
    if (!Number.isInteger(segment.months) || segment.months < 1) {
      throw new ReturnModelError('Each segment needs a whole number of months, at least 1.');
    }
  }

  // Precompute a flat lookup: the simulator calls this once per month, and
  // scanning segments each time would be needless work in the hot loop.
  const monthlyRates: number[] = [];
  for (const segment of segments) {
    const monthly = annualToMonthlyRate(segment.annualRate);
    for (let i = 0; i < segment.months; i += 1) monthlyRates.push(monthly);
  }
  const lastSegment = segments[segments.length - 1] as SequenceSegment;
  const trailing = annualToMonthlyRate(options.trailingAnnualRate ?? lastSegment.annualRate);

  return {
    label: options.label ?? 'Scripted sequence',
    monthlyReturnAt: (month) => monthlyRates[month] ?? trailing,
  };
}

export interface CrashSpec {
  /** Rate outside the crash and recovery windows. */
  readonly normalAnnualRate: number;
  /** Months of normal growth before the crash begins. */
  readonly monthsBeforeCrash: number;
  /** Peak-to-trough fall as a positive fraction: 0.35 = −35%. */
  readonly drawdown: number;
  /** Months over which the fall is spread. */
  readonly crashMonths: number;
  /** Months taken to climb back to the pre-crash level. */
  readonly recoveryMonths: number;
}

/**
 * Builds a crash-and-recovery shape (PRD §11.1): a crash is not
 * `portfolio × 0.70` followed instantly by normal returns. It has a duration,
 * a trough, and a recovery ramp.
 */
export function crashSequence(spec: CrashSpec): SequenceSegment[] {
  const { normalAnnualRate, monthsBeforeCrash, drawdown, crashMonths, recoveryMonths } = spec;
  if (!(drawdown > 0 && drawdown < 1)) {
    throw new ReturnModelError('Drawdown must be between 0 and 1 (exclusive).');
  }

  const segments: SequenceSegment[] = [];
  if (monthsBeforeCrash > 0) {
    segments.push({ months: monthsBeforeCrash, annualRate: normalAnnualRate });
  }
  // Spread the total fall evenly across the crash window.
  segments.push({
    months: crashMonths,
    annualRate: annualisedFromTotal(1 - drawdown, crashMonths),
  });
  if (recoveryMonths > 0) {
    // Climb back exactly to the pre-crash level over the recovery window.
    segments.push({
      months: recoveryMonths,
      annualRate: annualisedFromTotal(1 / (1 - drawdown), recoveryMonths),
    });
  }
  segments.push({ months: 1, annualRate: normalAnnualRate });
  return segments;
}

function annualisedFromTotal(totalFactor: number, months: number): number {
  const monthly = rateForTotalFactor(totalFactor, months);
  return Math.pow(1 + monthly, 12) - 1;
}

/** Cumulative growth factor a model produces over `months` months. */
export function cumulativeFactor(model: ReturnModel, months: number): number {
  let factor = 1;
  for (let m = 0; m < months; m += 1) factor *= 1 + model.monthlyReturnAt(m);
  return factor;
}

/** Annualised (CAGR) equivalent of a model over `months` months. */
export function annualisedReturn(model: ReturnModel, months: number): number {
  if (months < 1) throw new ReturnModelError('months must be at least 1.');
  return Math.pow(cumulativeFactor(model, months), 12 / months) - 1;
}
