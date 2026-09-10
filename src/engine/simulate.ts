/**
 * The simulation orchestrator: (inputs) → results.
 *
 * Deterministic and side-effect free. Series are Float64Arrays rather than
 * arrays of objects: paise are integers below 2^53, so a Float64Array holds
 * them exactly, and preallocating avoids per-month allocation in the hot loop
 * — the discipline that makes client-side Monte Carlo viable later
 * (TECHNICAL_SPEC §5.4).
 *
 * Month mechanics, stated explicitly so the audit view can show them:
 *   1. Salary for the month arrives (escalated on each anniversary).
 *   2. Expenses are inflated to the month.
 *   3. Income is allocated down the cash-flow hierarchy (PRD §24).
 *   4. Growth is applied to the OPENING corpus, so this month's contribution
 *      does not earn a return in the month it is made (deliberately
 *      conservative).
 *   5. The funded SIP is added; any essentials shortfall is withdrawn from
 *      the corpus, then from the emergency fund.
 */

import { type Paise, scalePaise } from './money/paise';
import {
  DEFAULT_HIERARCHY,
  type CashFlowBucket,
  type Demand,
  allocate,
  fundedFor,
  orderDemands,
  shortfallFor,
} from './cashflow/allocate';
import { createClock, horizonMonths } from './time/clock';
import { type ScenarioInputs, assertValidScenario, escalationsBy } from './scenario/inputs';

export interface SimulationSeries {
  readonly income: Float64Array;
  readonly essentials: Float64Array;
  readonly discretionary: Float64Array;
  readonly contributions: Float64Array;
  readonly growth: Float64Array;
  readonly withdrawals: Float64Array;
  readonly corpus: Float64Array;
  readonly emergencyFund: Float64Array;
  readonly shortfall: Float64Array;
}

export interface SimulationSummary {
  readonly months: number;
  readonly openingCorpus: Paise;
  readonly openingEmergencyFund: Paise;
  readonly totalContributions: Paise;
  readonly totalGrowth: Paise;
  readonly totalWithdrawals: Paise;
  readonly finalCorpusNominal: Paise;
  /** Deflated by the general inflation rate (PRD §14). */
  readonly finalCorpusReal: Paise;
  readonly finalEmergencyFund: Paise;
  /** Months in which the hierarchy could not fund everything requested. */
  readonly monthsWithShortfall: number;
  readonly returnModelLabel: string;
}

export interface SimulationResult {
  readonly series: SimulationSeries;
  readonly summary: SimulationSummary;
}

function emptySeries(length: number): SimulationSeries {
  return {
    income: new Float64Array(length),
    essentials: new Float64Array(length),
    discretionary: new Float64Array(length),
    contributions: new Float64Array(length),
    growth: new Float64Array(length),
    withdrawals: new Float64Array(length),
    corpus: new Float64Array(length),
    emergencyFund: new Float64Array(length),
    shortfall: new Float64Array(length),
  };
}

export function simulate(inputs: ScenarioInputs): SimulationResult {
  assertValidScenario(inputs);

  const { profile, opening, income, sip, expenses, returnModel, inflation } = inputs;
  const clock = createClock({
    currentAgeYears: profile.currentAgeYears,
    ...(profile.currentAgeMonths !== undefined
      ? { currentAgeMonths: profile.currentAgeMonths }
      : {}),
    anchorYear: profile.anchorYear,
    ...(profile.anchorMonth !== undefined ? { anchorMonth: profile.anchorMonth } : {}),
  });
  const months = horizonMonths(clock, profile.targetAgeYears);
  const series = emptySeries(months);

  const order: readonly CashFlowBucket[] = inputs.cashFlowOrder ?? DEFAULT_HIERARCHY;
  const salaryFirstIncrement = income.firstIncrementMonth ?? 12;
  const sipFirstGrowth = sip.firstGrowthMonth ?? 12;

  let corpus: Paise = opening.investedCorpus;
  let emergencyFund: Paise = opening.emergencyFund;
  let totalContributions = 0;
  let totalGrowth = 0;
  let totalWithdrawals = 0;
  let monthsWithShortfall = 0;

  // Reused across iterations so the loop allocates nothing per month.
  const demands: Demand[] = [
    { bucket: 'essentials', amount: 0 },
    { bucket: 'sip', amount: 0 },
    { bucket: 'discretionary', amount: 0 },
  ];

  for (let m = 0; m < months; m += 1) {
    const salary = scalePaise(
      income.monthlySalary,
      Math.pow(1 + income.annualIncrementRate, escalationsBy(m, salaryFirstIncrement)),
    );
    const essentials = scalePaise(
      expenses.monthlyEssential,
      inflation.factorAt('general', m),
    );
    const discretionary = scalePaise(
      expenses.monthlyDiscretionary,
      inflation.factorAt('lifestyle', m),
    );
    const sipTarget = scalePaise(
      sip.monthlyAmount,
      Math.pow(1 + sip.annualGrowthRate, escalationsBy(m, sipFirstGrowth)),
    );

    demands[0] = { bucket: 'essentials', amount: essentials };
    demands[1] = { bucket: 'sip', amount: sipTarget };
    demands[2] = { bucket: 'discretionary', amount: discretionary };

    const result = allocate(salary, orderDemands(demands, order));
    const sipFunded = fundedFor(result, 'sip');
    const essentialsShortfall = shortfallFor(result, 'essentials');

    // Growth applies to the opening balance, before this month's contribution.
    const growth = scalePaise(corpus, returnModel.monthlyReturnAt(m));

    // Essentials that income could not cover are drawn from the corpus first,
    // then the emergency fund. Nothing is ever silently left unpaid.
    let withdrawal = 0;
    let remainingNeed = essentialsShortfall;
    // Cannot be negative: corpus is never negative and the monthly rate is
    // always > -100%, so growth is never a larger loss than the balance
    // itself. No clamp is needed, and adding one would be untestable code.
    const availableCorpus = corpus + growth;
    if (remainingNeed > 0) {
      withdrawal = Math.min(remainingNeed, availableCorpus);
      remainingNeed -= withdrawal;
    }
    let emergencyDraw = 0;
    if (remainingNeed > 0) {
      emergencyDraw = Math.min(remainingNeed, emergencyFund);
      remainingNeed -= emergencyDraw;
    }

    corpus = availableCorpus + sipFunded - withdrawal;
    emergencyFund -= emergencyDraw;

    totalContributions += sipFunded;
    totalGrowth += growth;
    totalWithdrawals += withdrawal + emergencyDraw;
    // `remainingNeed` is what nothing could cover — a genuine funding failure.
    if (result.totalShortfall > 0) monthsWithShortfall += 1;

    series.income[m] = salary;
    series.essentials[m] = essentials;
    series.discretionary[m] = discretionary;
    series.contributions[m] = sipFunded;
    series.growth[m] = growth;
    series.withdrawals[m] = withdrawal + emergencyDraw;
    series.corpus[m] = corpus;
    series.emergencyFund[m] = emergencyFund;
    series.shortfall[m] = result.totalShortfall;
  }

  return {
    series,
    summary: {
      months,
      openingCorpus: opening.investedCorpus,
      openingEmergencyFund: opening.emergencyFund,
      totalContributions,
      totalGrowth,
      totalWithdrawals,
      finalCorpusNominal: corpus,
      finalCorpusReal: Math.round(inflation.toRealValue(corpus, months)),
      finalEmergencyFund: emergencyFund,
      monthsWithShortfall,
      returnModelLabel: returnModel.label,
    },
  };
}
