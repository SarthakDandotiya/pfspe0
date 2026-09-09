/**
 * Money is stored as integer paise (TECHNICAL_SPEC §3, PRD §21).
 *
 * Number.MAX_SAFE_INTEGER is ~9.007e15 paise ≈ ₹90,000 crore, far beyond any
 * plausible plan, so a plain number is safe and BigInt/decimal.js would be
 * pure overhead. Floating-point rupees would accumulate rounding drift across
 * ~480 monthly steps, which is exactly the silent-wrong-number failure this
 * project cannot tolerate.
 *
 * Pure module: no React, no DOM, no I/O.
 */

export type Paise = number;

export const PAISE_PER_RUPEE = 100;
const LAKH = 100_000;
const CRORE = 10_000_000;

export class MoneyRangeError extends Error {
  constructor(value: number) {
    super(`Amount ${value} is outside the safe integer range for paise.`);
    this.name = 'MoneyRangeError';
  }
}

export function isSafePaise(value: number): boolean {
  return Number.isSafeInteger(value);
}

/** Rounds to the nearest paise; rejects NaN/Infinity and unsafe magnitudes. */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new MoneyRangeError(rupees);
  // Correct the binary representation error before rounding. 1.005 * 100 is
  // 100.49999999999999, so a bare Math.round yields 100 while 1.015 * 100 is
  // 101.49999999999999 and yields 102 — inconsistent half-up behaviour that
  // depends on the bit pattern. Normalising first makes rounding predictable.
  const paise = Math.round(Number((rupees * PAISE_PER_RUPEE).toFixed(6)));
  if (!isSafePaise(paise)) throw new MoneyRangeError(rupees);
  return paise;
}

export function paiseToRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

export function addPaise(...amounts: readonly Paise[]): Paise {
  let total = 0;
  for (const amount of amounts) total += amount;
  if (!isSafePaise(total)) throw new MoneyRangeError(total);
  return total;
}

/**
 * Applies a rate and rounds to whole paise, so repeated application cannot
 * accumulate sub-paise drift.
 */
export function scalePaise(paise: Paise, factor: number): Paise {
  if (!Number.isFinite(factor)) throw new MoneyRangeError(factor);
  const scaled = Math.round(paise * factor);
  if (!isSafePaise(scaled)) throw new MoneyRangeError(scaled);
  return scaled;
}

function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

/**
 * Indian compact notation: ₹25k, ₹6L, ₹1.5Cr. Display-only.
 * `maximumFractionDigits` controls the compact unit, not the rupee value.
 */
export function formatCompactINR(paise: Paise, fractionDigits = 2): string {
  const rupees = paiseToRupees(paise);
  const sign = rupees < 0 ? '-' : '';
  const magnitude = Math.abs(rupees);

  if (magnitude >= CRORE) {
    return `${sign}₹${trimZeros((magnitude / CRORE).toFixed(fractionDigits))}Cr`;
  }
  if (magnitude >= LAKH) {
    return `${sign}₹${trimZeros((magnitude / LAKH).toFixed(fractionDigits))}L`;
  }
  if (magnitude >= 1_000) {
    return `${sign}₹${trimZeros((magnitude / 1_000).toFixed(fractionDigits))}k`;
  }
  return `${sign}₹${trimZeros(magnitude.toFixed(fractionDigits))}`;
}
