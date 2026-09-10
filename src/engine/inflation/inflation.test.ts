import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INFLATION_RATES,
  InflationError,
  createInflationModel,
} from './inflation';

const model = createInflationModel();

describe('createInflationModel', () => {
  it('uses the PRD §16 defaults', () => {
    expect(DEFAULT_INFLATION_RATES.general).toBe(0.06);
    expect(DEFAULT_INFLATION_RATES.healthcare).toBe(0.08);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-finite rate (%s)', (rate) => {
    expect(() => createInflationModel({ ...DEFAULT_INFLATION_RATES, general: rate })).toThrow(
      InflationError,
    );
  });

  it('rejects a rate at or below -100%', () => {
    expect(() => createInflationModel({ ...DEFAULT_INFLATION_RATES, housing: -1 })).toThrow(
      /greater than -100%/,
    );
  });
});

describe('factorAt', () => {
  it('is 1 at month zero', () => {
    expect(model.factorAt('general', 0)).toBe(1);
  });

  it('compounds to the annual rate after twelve months', () => {
    expect(model.factorAt('general', 12)).toBeCloseTo(1.06, 12);
    expect(model.factorAt('healthcare', 12)).toBeCloseTo(1.08, 12);
  });

  it('grows healthcare faster than general, as the defaults intend', () => {
    expect(model.factorAt('healthcare', 240)).toBeGreaterThan(model.factorAt('general', 240));
  });

  it.each([-1, 1.5])('rejects an invalid month (%s)', (month) => {
    expect(() => model.factorAt('general', month)).toThrow(InflationError);
  });
});

describe('toRealValue', () => {
  it('deflates using the general rate, not a category rate (PRD §14)', () => {
    const nominal = 1_00_00_000_00;
    expect(model.toRealValue(nominal, 12)).toBeCloseTo(nominal / 1.06, 4);
  });

  it('is the identity at month zero', () => {
    expect(model.toRealValue(500, 0)).toBe(500);
  });

  it('is the identity when general inflation is zero', () => {
    const flat = createInflationModel({ ...DEFAULT_INFLATION_RATES, general: 0 });
    expect(flat.toRealValue(1234, 360)).toBe(1234);
  });
});
