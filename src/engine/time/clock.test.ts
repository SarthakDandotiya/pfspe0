import { describe, expect, it } from 'vitest';
import {
  TimeModelError,
  ageInMonthsAt,
  ageInYearsAt,
  calendarAt,
  createClock,
  horizonMonths,
  isBirthdayMonth,
  monthIndexForAge,
} from './clock';

const clock = createClock({ currentAgeYears: 28, anchorYear: 2026 });

describe('createClock', () => {
  it('anchors to January when no month is given (PRD §4)', () => {
    expect(clock.anchorMonth).toBe(1);
    expect(clock.anchorYear).toBe(2026);
    expect(clock.ageAtStartMonths).toBe(28 * 12);
  });

  it('accepts a part-year age', () => {
    const c = createClock({ currentAgeYears: 28, currentAgeMonths: 7, anchorYear: 2026 });
    expect(c.ageAtStartMonths).toBe(28 * 12 + 7);
  });

  it.each([
    [{ currentAgeYears: 28.5, anchorYear: 2026 }, 'whole number'],
    [{ currentAgeYears: -1, anchorYear: 2026 }, 'negative'],
    [{ currentAgeYears: 28, currentAgeMonths: 12, anchorYear: 2026 }, '0 and 11'],
    [{ currentAgeYears: 28, currentAgeMonths: -1, anchorYear: 2026 }, '0 and 11'],
    [{ currentAgeYears: 28, anchorYear: 2026, anchorMonth: 13 }, '1 and 12'],
    [{ currentAgeYears: 28, anchorYear: 2026, anchorMonth: 0 }, '1 and 12'],
    [{ currentAgeYears: 28, anchorYear: 2026.5 }, 'whole number'],
    [{ currentAgeYears: 28, currentAgeMonths: 1.5, anchorYear: 2026 }, 'whole number'],
    [{ currentAgeYears: 28, anchorYear: 2026, anchorMonth: 1.5 }, 'whole number'],
  ])('rejects invalid input (%#)', (input, fragment) => {
    expect(() => createClock(input)).toThrow(TimeModelError);
    expect(() => createClock(input)).toThrow(new RegExp(fragment));
  });
});

describe('age derivation', () => {
  it('advances one month at a time', () => {
    expect(ageInMonthsAt(clock, 0)).toBe(336);
    expect(ageInMonthsAt(clock, 12)).toBe(348);
  });

  it('floors to whole years, as a person would state their age', () => {
    expect(ageInYearsAt(clock, 0)).toBe(28);
    expect(ageInYearsAt(clock, 11)).toBe(28);
    expect(ageInYearsAt(clock, 12)).toBe(29);
  });

  it('finds the first month at a given age', () => {
    expect(monthIndexForAge(clock, 28)).toBe(0);
    expect(monthIndexForAge(clock, 65)).toBe((65 - 28) * 12);
  });

  it('identifies birthday months', () => {
    expect(isBirthdayMonth(clock, 0)).toBe(true);
    expect(isBirthdayMonth(clock, 1)).toBe(false);
    expect(isBirthdayMonth(clock, 12)).toBe(true);
  });
});

describe('calendarAt', () => {
  it('rolls the year over correctly', () => {
    expect(calendarAt(clock, 0)).toEqual({ year: 2026, month: 1 });
    expect(calendarAt(clock, 11)).toEqual({ year: 2026, month: 12 });
    expect(calendarAt(clock, 12)).toEqual({ year: 2027, month: 1 });
  });

  it('respects a non-January anchor', () => {
    const june = createClock({ currentAgeYears: 30, anchorYear: 2026, anchorMonth: 6 });
    expect(calendarAt(june, 0)).toEqual({ year: 2026, month: 6 });
    expect(calendarAt(june, 7)).toEqual({ year: 2027, month: 1 });
  });

  it('handles month indices before the anchor', () => {
    expect(calendarAt(clock, -1)).toEqual({ year: 2025, month: 12 });
    expect(calendarAt(clock, -13)).toEqual({ year: 2024, month: 12 });
  });
});

describe('horizonMonths', () => {
  it('counts months from the current age to the target age', () => {
    expect(horizonMonths(clock, 65)).toBe(444);
  });

  it('rejects a target age at or before the current age', () => {
    expect(() => horizonMonths(clock, 28)).toThrow(TimeModelError);
    expect(() => horizonMonths(clock, 20)).toThrow(/greater than the current age/);
  });
});
