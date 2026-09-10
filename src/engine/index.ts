/**
 * Public engine API.
 *
 * Everything here is pure, framework-free TypeScript: no React, no DOM, no
 * I/O, no Math.random. That boundary is enforced by ESLint and
 * scripts/check-engine-purity.mjs, and is what lets the engine carry a 100%
 * coverage gate (TECHNICAL_SPEC §9.8).
 */

export { MoneyRangeError, PAISE_PER_RUPEE } from './money/paise';
export type { Paise } from './money/paise';
export {
  addPaise,
  formatCompactINR,
  isSafePaise,
  paiseToRupees,
  rupeesToPaise,
  scalePaise,
} from './money/paise';

export { TimeModelError, MONTHS_PER_YEAR } from './time/clock';
export type { Clock, ClockInput, CalendarMonth } from './time/clock';
export {
  ageInMonthsAt,
  ageInYearsAt,
  calendarAt,
  createClock,
  horizonMonths,
  isBirthdayMonth,
  monthIndexForAge,
} from './time/clock';

export { RateError } from './rates/convert';
export {
  annualToMonthlyRate,
  compoundFactor,
  monthlyToAnnualRate,
  rateForTotalFactor,
} from './rates/convert';

export { ReturnModelError } from './returns/model';
export type {
  Bucket,
  BucketConfig,
  CrashSpec,
  DiscreteScenarioRates,
  DiscreteScenarioSet,
  ReturnModel,
  ScriptedSequenceOptions,
  SequenceSegment,
} from './returns/model';
export {
  annualisedReturn,
  bucketReturnModels,
  buildBuckets,
  crashSequence,
  cumulativeFactor,
  discreteScenarios,
  fixedReturn,
  scriptedSequence,
} from './returns/model';

export { InflationError, DEFAULT_INFLATION_RATES, INFLATION_CATEGORIES } from './inflation/inflation';
export type { InflationCategory, InflationModel, InflationRates } from './inflation/inflation';
export { createInflationModel } from './inflation/inflation';

export { CashFlowError, DEFAULT_HIERARCHY } from './cashflow/allocate';
export type { Allocation, AllocationResult, CashFlowBucket, Demand } from './cashflow/allocate';
export { allocate, fundedFor, orderDemands, shortfallFor } from './cashflow/allocate';

export { ScenarioValidationError } from './scenario/inputs';
export type {
  ExpenseInput,
  IncomeInput,
  OpeningPositionInput,
  ProfileInput,
  ScenarioInputs,
  SipInput,
  ValidationIssue,
  ValidationSeverity,
} from './scenario/inputs';
export { assertValidScenario, escalationsBy, validateScenario } from './scenario/inputs';

export type { SimulationResult, SimulationSeries, SimulationSummary } from './simulate';
export { simulate } from './simulate';
