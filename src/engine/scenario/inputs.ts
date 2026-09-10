/**
 * Scenario inputs and validation (PRD §27 validation rules).
 *
 * Validation returns a list of problems rather than throwing on the first one,
 * so a form can show every error at once instead of one per submit.
 */

import type { Paise } from '../money/paise';
import type { CashFlowBucket } from '../cashflow/allocate';
import type { InflationModel } from '../inflation/inflation';
import type { ReturnModel } from '../returns/model';

export interface ProfileInput {
  readonly currentAgeYears: number;
  readonly currentAgeMonths?: number;
  readonly anchorYear: number;
  readonly anchorMonth?: number;
  readonly targetAgeYears: number;
  /** Bounds retirement drawdown; a withdrawal rate alone cannot (PRD §5.2). */
  readonly planUntilAgeYears: number;
}

export interface IncomeInput {
  readonly monthlySalary: Paise;
  readonly annualIncrementRate: number;
  /** Month index of the first increment. Defaults to 12 (one year in). */
  readonly firstIncrementMonth?: number;
}

export interface SipInput {
  readonly monthlyAmount: Paise;
  readonly annualGrowthRate: number;
  readonly firstGrowthMonth?: number;
}

export interface ExpenseInput {
  readonly monthlyEssential: Paise;
  readonly monthlyDiscretionary: Paise;
}

export interface OpeningPositionInput {
  readonly investedCorpus: Paise;
  /** Held separately from the investment corpus (PRD §7.1, §13). */
  readonly emergencyFund: Paise;
}

export interface ScenarioInputs {
  readonly profile: ProfileInput;
  readonly opening: OpeningPositionInput;
  readonly income: IncomeInput;
  readonly sip: SipInput;
  readonly expenses: ExpenseInput;
  readonly returnModel: ReturnModel;
  readonly inflation: InflationModel;
  readonly cashFlowOrder?: readonly CashFlowBucket[];
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  readonly field: string;
  readonly severity: ValidationSeverity;
  readonly message: string;
}

export class ScenarioValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(issues: readonly ValidationIssue[]) {
    super(`Scenario is invalid: ${issues.map((i) => i.message).join(' ')}`);
    this.name = 'ScenarioValidationError';
    this.issues = issues;
  }
}

const NON_NEGATIVE_FIELDS: ReadonlyArray<[string, (inputs: ScenarioInputs) => number]> = [
  ['opening.investedCorpus', (i) => i.opening.investedCorpus],
  ['opening.emergencyFund', (i) => i.opening.emergencyFund],
  ['income.monthlySalary', (i) => i.income.monthlySalary],
  ['sip.monthlyAmount', (i) => i.sip.monthlyAmount],
  ['expenses.monthlyEssential', (i) => i.expenses.monthlyEssential],
  ['expenses.monthlyDiscretionary', (i) => i.expenses.monthlyDiscretionary],
];

export function validateScenario(inputs: ScenarioInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { profile, income, sip } = inputs;

  if (profile.targetAgeYears <= profile.currentAgeYears) {
    issues.push({
      field: 'profile.targetAgeYears',
      severity: 'error',
      message: 'Target age must be greater than the current age.',
    });
  }
  if (profile.planUntilAgeYears < profile.targetAgeYears) {
    issues.push({
      field: 'profile.planUntilAgeYears',
      severity: 'error',
      message: 'Plan-until age must not be before the target age.',
    });
  }

  for (const [field, read] of NON_NEGATIVE_FIELDS) {
    const value = read(inputs);
    if (!Number.isFinite(value) || value < 0) {
      issues.push({ field, severity: 'error', message: `${field} must be zero or more.` });
    }
  }

  // Warning, not an error: the engine throttles SIP to available cash
  // (PRD §9), so this is survivable — but the user should know.
  if (sip.annualGrowthRate > income.annualIncrementRate) {
    issues.push({
      field: 'sip.annualGrowthRate',
      severity: 'warning',
      message:
        'SIP is growing faster than income, so contributions will eventually be capped by available cash.',
    });
  }

  return issues;
}

export function assertValidScenario(inputs: ScenarioInputs): void {
  const errors = validateScenario(inputs).filter((issue) => issue.severity === 'error');
  if (errors.length > 0) throw new ScenarioValidationError(errors);
}

/** Number of annual escalations applied by month `month`. */
export function escalationsBy(month: number, firstMonth: number): number {
  if (month < firstMonth) return 0;
  return Math.floor((month - firstMonth) / 12) + 1;
}
