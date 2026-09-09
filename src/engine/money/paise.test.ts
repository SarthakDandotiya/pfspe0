import { describe, expect, it } from 'vitest';
import {
  MoneyRangeError,
  PAISE_PER_RUPEE,
  addPaise,
  formatCompactINR,
  isSafePaise,
  paiseToRupees,
  rupeesToPaise,
  scalePaise,
} from './paise';

describe('rupeesToPaise', () => {
  it('converts whole rupees', () => {
    expect(rupeesToPaise(1)).toBe(100);
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(-250)).toBe(-25_000);
  });

  it('rounds to the nearest paise', () => {
    expect(rupeesToPaise(1.005)).toBe(101);
    expect(rupeesToPaise(1.004)).toBe(100);
  });

  it('rejects non-finite input', () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(MoneyRangeError);
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(MoneyRangeError);
  });

  it('rejects magnitudes beyond safe integer paise', () => {
    expect(() => rupeesToPaise(Number.MAX_SAFE_INTEGER)).toThrow(MoneyRangeError);
  });

  it('exposes a named error type', () => {
    expect(new MoneyRangeError(1).name).toBe('MoneyRangeError');
  });
});

describe('paiseToRupees', () => {
  it('is the inverse of rupeesToPaise for exact paise values', () => {
    for (const rupees of [0, 1, 25_000, 6_00_000, -1234.56]) {
      expect(paiseToRupees(rupeesToPaise(rupees))).toBeCloseTo(rupees, 2);
    }
  });

  it('uses the documented scale factor', () => {
    expect(PAISE_PER_RUPEE).toBe(100);
  });
});

describe('isSafePaise', () => {
  it('accepts safe integers only', () => {
    expect(isSafePaise(10)).toBe(true);
    expect(isSafePaise(1.5)).toBe(false);
    expect(isSafePaise(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
  });
});

describe('addPaise', () => {
  it('sums exactly, with no floating-point drift', () => {
    // 0.1 + 0.2 !== 0.3 in floats; in paise it is exact.
    expect(addPaise(rupeesToPaise(0.1), rupeesToPaise(0.2))).toBe(rupeesToPaise(0.3));
  });

  it('returns zero for no arguments', () => {
    expect(addPaise()).toBe(0);
  });

  it('throws when the total leaves the safe range', () => {
    expect(() => addPaise(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow(
      MoneyRangeError,
    );
  });
});

describe('scalePaise', () => {
  it('applies a rate and rounds to whole paise', () => {
    expect(scalePaise(10_000, 1.07)).toBe(10_700);
    expect(scalePaise(101, 0.5)).toBe(51);
  });

  it('does not drift across repeated application', () => {
    let value = rupeesToPaise(100_000);
    for (let i = 0; i < 120; i += 1) value = scalePaise(value, 1.0075);
    expect(Number.isSafeInteger(value)).toBe(true);
  });

  it('rejects non-finite factors and unsafe results', () => {
    expect(() => scalePaise(100, Number.NaN)).toThrow(MoneyRangeError);
    expect(() => scalePaise(Number.MAX_SAFE_INTEGER, 10)).toThrow(MoneyRangeError);
  });
});

describe('formatCompactINR', () => {
  it.each([
    [0, '₹0'],
    [500, '₹5'],
    [25_000_00, '₹25k'],
    [6_00_000_00, '₹6L'],
    [1_50_00_000_00, '₹1.5Cr'],
    [2_43_00_000_00, '₹2.43Cr'],
  ])('formats %i paise as %s', (paise, expected) => {
    expect(formatCompactINR(paise)).toBe(expected);
  });

  it('keeps the sign for negative amounts', () => {
    expect(formatCompactINR(-20_00_000_00)).toBe('-₹20L');
  });

  it('honours a custom fraction-digit count', () => {
    expect(formatCompactINR(1_23_45_678_00, 1)).toBe('₹1.2Cr');
  });

  it('trims trailing zeros rather than showing ₹6.00L', () => {
    expect(formatCompactINR(6_00_000_00)).not.toContain('.00');
  });

  it('handles zero fraction digits, where there is no decimal point to trim', () => {
    expect(formatCompactINR(1_23_45_678_00, 0)).toBe('₹1Cr');
    expect(formatCompactINR(6_00_000_00, 0)).toBe('₹6L');
    expect(formatCompactINR(25_000_00, 0)).toBe('₹25k');
    expect(formatCompactINR(500, 0)).toBe('₹5');
  });
});
