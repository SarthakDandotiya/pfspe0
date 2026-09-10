/**
 * The cash-flow hierarchy (PRD §24).
 *
 * ONE ordering governs every allocation and drawdown decision. The original
 * PRD had two competing priority lists — a medical-event funding order and a
 * cash-flow hierarchy — with no stated relationship between them
 * (finding A-10). Everything now flows through this allocator.
 *
 * Default order:
 *   Income → Taxes → Essential expenses → Insurance → Debt service
 *   → Emergency-fund target → Priority goals → SIP → Discretionary
 */

import { type Paise, addPaise } from '../money/paise';

export const DEFAULT_HIERARCHY = [
  'taxes',
  'essentials',
  'insurance',
  'debt',
  'emergencyFund',
  'goals',
  'sip',
  'discretionary',
] as const;

export type CashFlowBucket = (typeof DEFAULT_HIERARCHY)[number];

export interface Demand {
  readonly bucket: CashFlowBucket;
  /** What this bucket wants this month, in paise. Must be ≥ 0. */
  readonly amount: Paise;
}

export interface Allocation {
  readonly bucket: CashFlowBucket;
  readonly requested: Paise;
  readonly funded: Paise;
  /** requested − funded. Zero when fully funded. */
  readonly shortfall: Paise;
}

export interface AllocationResult {
  readonly allocations: readonly Allocation[];
  /** Left over after every demand was served in order. */
  readonly remaining: Paise;
  readonly totalFunded: Paise;
  readonly totalShortfall: Paise;
}

export class CashFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CashFlowError';
  }
}

/**
 * Allocates `available` across `demands` strictly in the given order.
 *
 * A bucket that cannot be fully funded takes whatever remains and records the
 * shortfall; later buckets then get nothing. Nothing ever goes negative — the
 * simulator must never silently overspend (PRD §22 failure detection depends
 * on shortfalls being recorded rather than absorbed).
 */
export function allocate(available: Paise, demands: readonly Demand[]): AllocationResult {
  if (!Number.isFinite(available)) {
    throw new CashFlowError('Available amount must be a finite number.');
  }
  if (available < 0) {
    throw new CashFlowError('Available amount must not be negative.');
  }

  let remaining = available;
  const allocations: Allocation[] = [];

  for (const demand of demands) {
    if (!Number.isFinite(demand.amount) || demand.amount < 0) {
      throw new CashFlowError(`Demand for "${demand.bucket}" must be a non-negative number.`);
    }
    const funded = Math.min(demand.amount, remaining);
    remaining -= funded;
    allocations.push({
      bucket: demand.bucket,
      requested: demand.amount,
      funded,
      shortfall: demand.amount - funded,
    });
  }

  return {
    allocations,
    remaining,
    totalFunded: addPaise(...allocations.map((a) => a.funded)),
    totalShortfall: addPaise(...allocations.map((a) => a.shortfall)),
  };
}

export function fundedFor(result: AllocationResult, bucket: CashFlowBucket): Paise {
  return result.allocations.find((a) => a.bucket === bucket)?.funded ?? 0;
}

export function shortfallFor(result: AllocationResult, bucket: CashFlowBucket): Paise {
  return result.allocations.find((a) => a.bucket === bucket)?.shortfall ?? 0;
}

/** Reorders the hierarchy; the order is user-configurable (PRD §24). */
export function orderDemands(
  demands: readonly Demand[],
  order: readonly CashFlowBucket[],
): Demand[] {
  const seen = new Set<CashFlowBucket>();
  for (const bucket of order) {
    if (seen.has(bucket)) throw new CashFlowError(`Duplicate bucket in order: ${bucket}`);
    seen.add(bucket);
  }
  const byBucket = new Map(demands.map((demand) => [demand.bucket, demand]));
  const ordered: Demand[] = [];
  for (const bucket of order) {
    const demand = byBucket.get(bucket);
    if (demand) ordered.push(demand);
  }
  return ordered;
}
