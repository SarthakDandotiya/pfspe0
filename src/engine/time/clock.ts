/**
 * Canonical time model (PRD §4).
 *
 * The simulation clock is a month index m = 0, 1, 2, …, where m = 0 is the
 * first simulated month. Calendar dates and ages are both *derived* from that
 * index, so the two can never drift apart — the original PRD mixed years and
 * ages freely, which is finding A-28.
 *
 * Pure module: no Date.now(), no timezone, no I/O. The anchor is supplied by
 * the caller, which also makes every test deterministic.
 */

export const MONTHS_PER_YEAR = 12;

export interface ClockInput {
  /** Whole years at m = 0. */
  readonly currentAgeYears: number;
  /** Additional months past the whole year, 0–11. Defaults to 0. */
  readonly currentAgeMonths?: number;
  /** Calendar year of m = 0. */
  readonly anchorYear: number;
  /** Calendar month of m = 0, 1–12. Defaults to January (PRD §4). */
  readonly anchorMonth?: number;
}

export interface Clock {
  readonly ageAtStartMonths: number;
  readonly anchorYear: number;
  readonly anchorMonth: number;
}

export interface CalendarMonth {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
}

export class TimeModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeModelError';
  }
}

function requireInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) throw new TimeModelError(`${name} must be a whole number.`);
}

export function createClock(input: ClockInput): Clock {
  const { currentAgeYears, currentAgeMonths = 0, anchorYear, anchorMonth = 1 } = input;

  requireInteger(currentAgeYears, 'currentAgeYears');
  requireInteger(currentAgeMonths, 'currentAgeMonths');
  requireInteger(anchorYear, 'anchorYear');
  requireInteger(anchorMonth, 'anchorMonth');

  if (currentAgeYears < 0) throw new TimeModelError('currentAgeYears must not be negative.');
  if (currentAgeMonths < 0 || currentAgeMonths > 11) {
    throw new TimeModelError('currentAgeMonths must be between 0 and 11.');
  }
  if (anchorMonth < 1 || anchorMonth > MONTHS_PER_YEAR) {
    throw new TimeModelError('anchorMonth must be between 1 and 12.');
  }

  return {
    ageAtStartMonths: currentAgeYears * MONTHS_PER_YEAR + currentAgeMonths,
    anchorYear,
    anchorMonth,
  };
}

export function ageInMonthsAt(clock: Clock, month: number): number {
  return clock.ageAtStartMonths + month;
}

/** Whole years, floored — the age a person would state. */
export function ageInYearsAt(clock: Clock, month: number): number {
  return Math.floor(ageInMonthsAt(clock, month) / MONTHS_PER_YEAR);
}

export function calendarAt(clock: Clock, month: number): CalendarMonth {
  const zeroBased = clock.anchorMonth - 1 + month;
  return {
    year: clock.anchorYear + Math.floor(zeroBased / MONTHS_PER_YEAR),
    month: (((zeroBased % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR) + 1,
  };
}

/** First month index at which the person has reached `ageYears`. */
export function monthIndexForAge(clock: Clock, ageYears: number): number {
  return ageYears * MONTHS_PER_YEAR - clock.ageAtStartMonths;
}

/** Number of months simulated to run from the start age until `targetAgeYears`. */
export function horizonMonths(clock: Clock, targetAgeYears: number): number {
  const months = monthIndexForAge(clock, targetAgeYears);
  if (months <= 0) {
    throw new TimeModelError('Target age must be greater than the current age.');
  }
  return months;
}

/** True on the month the person's age in months is a whole number of years. */
export function isBirthdayMonth(clock: Clock, month: number): boolean {
  return ageInMonthsAt(clock, month) % MONTHS_PER_YEAR === 0;
}
