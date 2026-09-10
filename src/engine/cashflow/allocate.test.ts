import { describe, expect, it } from 'vitest';
import {
  CashFlowError,
  DEFAULT_HIERARCHY,
  type Demand,
  allocate,
  fundedFor,
  orderDemands,
  shortfallFor,
} from './allocate';

const demands: Demand[] = [
  { bucket: 'essentials', amount: 60_000_00 },
  { bucket: 'sip', amount: 25_000_00 },
  { bucket: 'discretionary', amount: 15_000_00 },
];

describe('allocate', () => {
  it('funds everything when income is sufficient', () => {
    const result = allocate(1_00_000_00, demands);
    expect(result.totalShortfall).toBe(0);
    expect(result.remaining).toBe(0);
    expect(fundedFor(result, 'sip')).toBe(25_000_00);
  });

  it('leaves a surplus when income exceeds every demand', () => {
    const result = allocate(1_50_000_00, demands);
    expect(result.remaining).toBe(50_000_00);
    expect(result.totalFunded).toBe(1_00_000_00);
  });

  it('funds strictly in order, starving later buckets first', () => {
    // ₹70k covers essentials in full and only ₹10k of the SIP.
    const result = allocate(70_000_00, demands);
    expect(fundedFor(result, 'essentials')).toBe(60_000_00);
    expect(fundedFor(result, 'sip')).toBe(10_000_00);
    expect(fundedFor(result, 'discretionary')).toBe(0);
    expect(shortfallFor(result, 'discretionary')).toBe(15_000_00);
  });

  it('records a shortfall rather than absorbing it', () => {
    const result = allocate(50_000_00, demands);
    expect(shortfallFor(result, 'essentials')).toBe(10_000_00);
    expect(result.totalShortfall).toBe(10_000_00 + 25_000_00 + 15_000_00);
  });

  it('never allocates a negative amount', () => {
    const result = allocate(0, demands);
    for (const allocation of result.allocations) {
      expect(allocation.funded).toBe(0);
      expect(allocation.shortfall).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles an empty demand list', () => {
    const result = allocate(1000, []);
    expect(result.remaining).toBe(1000);
    expect(result.totalFunded).toBe(0);
  });

  it.each([-1, Number.NaN])('rejects invalid available income (%s)', (available) => {
    expect(() => allocate(available, demands)).toThrow(CashFlowError);
  });

  it('rejects a negative or non-finite demand', () => {
    expect(() => allocate(1000, [{ bucket: 'sip', amount: -5 }])).toThrow(CashFlowError);
    expect(() => allocate(1000, [{ bucket: 'sip', amount: Number.NaN }])).toThrow(CashFlowError);
  });

  it('returns zero for a bucket that was never demanded', () => {
    const result = allocate(1000, []);
    expect(fundedFor(result, 'sip')).toBe(0);
    expect(shortfallFor(result, 'sip')).toBe(0);
  });
});

describe('orderDemands', () => {
  it('reorders to a user-defined hierarchy (PRD §24)', () => {
    const reordered = orderDemands(demands, ['sip', 'essentials', 'discretionary']);
    expect(reordered.map((d) => d.bucket)).toEqual(['sip', 'essentials', 'discretionary']);
  });

  it('changes who gets starved when money is tight', () => {
    const sipFirst = allocate(70_000_00, orderDemands(demands, ['sip', 'essentials']));
    expect(fundedFor(sipFirst, 'sip')).toBe(25_000_00);
    expect(fundedFor(sipFirst, 'essentials')).toBe(45_000_00);
  });

  it('drops buckets that have no demand this month', () => {
    const ordered = orderDemands(demands, [...DEFAULT_HIERARCHY]);
    expect(ordered.map((d) => d.bucket)).toEqual(['essentials', 'sip', 'discretionary']);
  });

  it('rejects a duplicated bucket in the order', () => {
    expect(() => orderDemands(demands, ['sip', 'sip'])).toThrow(/Duplicate/);
  });
});
