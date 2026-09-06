# PRD — Personal Wealth & Life Planning Simulator

**Product type:** Web application
**Primary market:** India
**Primary currency:** INR
**Primary investment model:** Equity / NIFTY 50 TRI-based modelling
**Target user:** Individuals planning long-term wealth, major life events, and financial independence
**Core philosophy:** Model *life + markets + cash flows* rather than simply calculating SIP returns.
**Document status:** Revised after adversarial review — see [Appendix A](#appendix-a--adversarial-review-findings) for the findings and how each was resolved.
**Version:** 2.0 (adversarial-review rebuild)
**Last updated:** 2026-09-06

---

## 0. How to read this document

This PRD is deliberately explicit about what is *modelled*, what is *assumed*, and what is *out of scope*. Three conventions:

- **MUST / SHOULD / MAY** are used in the RFC-2119 sense. "MUST" is a release blocker for the milestone it appears under.
- Every headline user-facing claim (a probability, an FI age, a "plan survives" verdict) is tagged with the **minimum engine capability** required to produce it honestly. If that capability is not in a milestone, the claim MUST NOT appear in that milestone's UI.
- Numbers in examples (₹6L, 9%, etc.) are **illustrative defaults**, not recommendations. See [§16 Recommended defaults](#16-recommended-defaults-for-the-initial-model).

A short **[Glossary](#glossary)** defines every load-bearing term (corpus, net worth, savings rate, real vs nominal, TRI, sequence risk). Terms are used consistently with those definitions throughout.

---

## 1. Product vision

The application answers:

> *Given my current money, income, investments, expenses, goals and risks, what could my financial future look like?*

Instead of one deterministic projection, it generates a **range** of possible futures and helps the user reason about resilience and trade-offs.

Representative questions the product helps answer:

- When might I reach ₹1 crore?
- What happens if NIFTY 50 TRI returns only 7%? 11%?
- What if I increase my SIP by 10%?
- What if I lose my job for a year?
- What if I buy a ₹1.5 Cr house?
- What if I have two children?
- What if the market crashes just before I buy my house?
- How much can I safely withdraw in retirement, and for how long?
- How much emergency cash should I maintain?
- How much will insurance cost over my lifetime?
- What happens if inflation is 6%? If healthcare/education inflation is higher?
- How much income is required to support the plan?

The single most important output is **not** "You will have ₹X crore." It is:

> **"Given these assumptions, how resilient is my plan, what can break it, and which decisions most improve it?"**

---

## 2. Core product principles

1. **Avoid false precision.** Prefer ranges and probabilities over single guaranteed outcomes.
2. **Model life events explicitly.** Marriage, house, children, illness, job loss, etc.
3. **Separate short-term money from long-term investments.**
4. **Use NIFTY 50 TRI, not the price index,** for equity-return modelling.
5. **Every meaningful assumption is user-changeable.**
6. **Monthly simulation granularity.**
7. **Show both nominal and inflation-adjusted (real) values.**
8. **Assumptions are transparent, auditable, and reproducible** (see §14, §26).
9. **Distinguish controllable from uncontrollable variables** (see §37).
10. **Never present simulated outcomes as predictions or guarantees** (see §35 and Non-goals §39).

> **Honesty constraint (release blocker):** No screen may display a **probability**, a **percentile band**, or a **"probability of success"** unless a stochastic engine (Monte Carlo or historical-replay ensemble) actually produced it for that scenario. Deterministic modes MUST instead show labelled discrete scenarios (Bear / Base / Bull). This constraint resolves the largest single inconsistency found in review — see Appendix A, findings A-1 and A-2.

---

## 3. Milestones, capabilities, and the honesty matrix

The original PRD promised probability-based outputs (FI probability, confidence bands, "78% chance") in the MVP while placing Monte Carlo in V2. That is not deliverable. This section is the authoritative scope contract; §17–§19 restate the per-milestone feature lists in the same terms.

**Engine capability tiers**

| Tier | Name | Produces | Introduced |
|---|---|---|---|
| E0 | Deterministic single-path | One projection per return assumption | MVP |
| E1 | Discrete scenario set | Bear / Base / Bull (≥3 fixed paths) | MVP |
| E2 | Historical replay | Path(s) driven by the real NIFTY 50 TRI monthly series | MVP (single replay), V2 (ensemble) |
| E3 | Stochastic ensemble (Monte Carlo) | Percentile bands, probability-of-success | V2 |

**Honesty matrix — which outputs are legitimate per tier**

| Output | Requires | MVP (E0–E2 single) | V2 (E3) |
|---|---|---|---|
| Point projection ("corpus at 60") | E0 | ✅ (labelled *Base scenario*) | ✅ |
| Bear / Base / Bull range | E1 | ✅ | ✅ |
| Historical stress replay result | E2 | ✅ (single replay) | ✅ (ensemble) |
| Percentile bands (10th/50th/90th) | E3 | ❌ **hidden** | ✅ |
| "Probability of success = X%" | E3 | ❌ **hidden** | ✅ |
| Estimated **FI age** | E1 (deterministic) | ✅ shown as *"FI age ≈ 52 (Base scenario)"* | ✅ shown with a range |

The dashboard, the "Build My Life" verdict (§36), and the retirement module (§11) MUST respect this matrix. In MVP, "Does the plan survive?" is answered per discrete scenario ("Survives in Base and Bull; fails in Bear at ~age 51"), **not** as a percentage.

---

## 4. Time model (canonical)

The original document mixed calendar years and ages freely. A single canonical time model removes the ambiguity.

- The user provides **current age** and (optionally) **date of birth**. If only age is given, the app anchors it to **1 January of the current calendar year** and states this.
- Internally the simulation clock is a **month index** `m = 0, 1, 2, …`, where `m = 0` is the first simulated month.
- `calendar_month(m)` and `age(m)` are both derived from the anchor. Every UI surface may display either, but they refer to the same underlying `m`.
- **Increment timing, premium debits, EMI starts, and inflation steps** are all applied on explicit month indices (see §21 Monthly mechanics), not "annually" in the abstract.

---

## 5. Global simulation settings

### 5.1 Current age
Slider **18–80**. Default configurable. Validation: see §27.

### 5.2 Simulation horizon
Primary UX is **target age**; equivalent duration is shown. Presets: 5/10/15/20/25/30/40 years or **Custom**.

> Example: Current age 28 → Target age 65 (37-year horizon).

**Plan-end age (life expectancy) — required for retirement math.** A separate input, **plan-until age** (default **90**, range 70–105), bounds the retirement drawdown. Withdrawal rate alone cannot bound a drawdown; the simulator MUST run the horizon at least to `plan_until_age` whenever a retirement/FI goal exists. (Review finding A-8.)

### 5.3 Simulation frequency
**Monthly** (fixed for MVP). Required to reconcile monthly salary/SIP/EMI, quarterly premiums, annual increments, one-time expenses, and market events on one clock.

---

## 6. Dashboard (initial screen)

Displays the current position and a scenario-aware projection. Every projected figure is labelled with its scenario/tier per §3.

**Current financial position**
- **Net worth** = financial assets + property (market value) − liabilities. Broken into: Cash · FD/RD · Equity · Debt · Other assets · Liabilities. (Formula per Glossary.)
- **Investment corpus** = market-linked long-term assets only (excludes emergency fund and cash). See Glossary.
- **Monthly income** (net of tax if a tax mode is on; the label states which).
- **Monthly investment** (SIP + scheduled contributions).
- **Current savings rate** = (monthly income − monthly essential + discretionary spend) ÷ monthly income, expressed as %. The exact formula is shown on hover to avoid ambiguity.

**Projected corpus** at ages 30 / 40 / 50 / 60 — each shown as **Base** with a **Bear–Bull** range (E1). No percentile until V2.

**Financial independence indicator** — `FI age ≈ 52 (Base scenario)` in MVP; a range in V2.

**Risk indicator** — Low / Moderate / High / Very High, computed from a defined rubric (equity share, cash-flow cushion, DTI, goal funding). The rubric MUST be documented in-product ("Why this rating?"). No undefined labels.

**Goal status** — colour thresholds are defined, not vibes:

| Status | Meaning | Funded ratio (funded ÷ required, Base scenario) |
|---|---|---|
| 🟢 Funded | On track | ≥ 100% |
| 🟡 Partially funded | At risk | 70–99% |
| 🔴 Underfunded | Off track | < 70% |

| Goal | Target | Year | Status |
|---|---:|---:|---|
| Marriage | ₹20L | 2032 | 🟢 |
| House | ₹30L down payment | 2035 | 🟡 |
| Child education | ₹50L | 2048 | 🟢 |
| Retirement | ₹5Cr | 2060 | 🔴 |

---

## 7. Current financial position (inputs)

### 7.1 Money outside the market (short-term / emergency)
Fields: Amount · Asset type · Expected annual return · Tax treatment · Liquidity · Purpose.
Asset types: Savings · FD · RD · Liquid fund · Debt fund · Gold · Other.
The **emergency fund is tracked as a distinct bucket** and never commingled with the long-term investment corpus (§13, Glossary).

### 7.2 Existing investments
Dynamic table. Each investment supports: current value · asset category · expected return · **volatility (σ)** · tax treatment · contribution · contribution growth · start date · end date.

> **Volatility is not optional for stochastic modes.** Each asset class MUST carry a default σ (see §16) because Monte Carlo (§12) and any confidence band are undefined without it. A **correlation matrix** across asset classes is also required for E3 (see §12.3).

| Asset | Current value | Return model | Future contributions |
|---|---:|---|---|
| NIFTY 500 | ₹4L | Historical-adjusted | No |
| NIFTY 50 | ₹2L | Historical-adjusted | Yes |

Future-compatible asset classes: NIFTY 50 · NIFTY 500 · Midcap · Smallcap · Gold · Debt · International equity · Individual stocks · FD · EPF · PPF · NPS · Real estate.

> **MVP simplification (explicit):** MVP models a **single equity sleeve (NIFTY 50 TRI) + a debt/cash sleeve**. Multi-asset allocation, glide paths, and rebalancing are V3 (§30–§31 originals). Because MVP is effectively equity-heavy, the risk indicator and stress tests MUST NOT understate concentration risk — they explicitly flag single-asset concentration. (Review finding A-9.)

---

## 8. Income model

### 8.1 Monthly salary — input/slider.
### 8.2 Yearly increment — fixed %, custom yearly schedule, or randomised growth (E3). Applied on the user's **increment anniversary month** (default: month 12, configurable).

| Year | Salary growth |
|---:|---:|
| 1 | 8% |
| 2 | 10% |
| 3 | 8% |
| 4 | 5% |

### 8.3 Other income — Bonus · Freelance · Rental · Dividends · Business · Other. Each has amount · frequency · growth · start year · end year.

### 8.4 Salary shocks
| Event | Year | Duration | Income reduction |
|---|---:|---:|---:|
| Career break | 2034 | 12 months | 100% |
| Job switch | 2040 | 3 months | 30% |

Types: Job loss · Career break · Sabbatical · Startup · Education · Maternity/paternity · Salary reduction · Unpaid leave. The user configures whether SIP/contributions continue during the event, and which bucket funds essential expenses during it (defaults to the cash-flow hierarchy, §24).

---

## 9. SIP model

- **Initial SIP amount** (e.g. ₹25,000/month).
- **SIP growth** slider **0–30%** annually.
- **Frequency** Monthly (default) / Quarterly / Annual.
- **Schedule changes** table — now carries an explicit **action + amount**, resolving the "increase/reduce by how much?" gap:

| Start | End | Action | Amount/Δ | Reason |
|---|---|---|---|---|
| 2032-01 | 2033-01 | Pause | — | House down payment |
| 2036-06 | — | Increase | +₹10k | Post-raise |

**Sustainability guard:** if SIP + fixed outflows exceed available cash flow in any month, the engine does **not** silently go negative. It applies the cash-flow hierarchy (§24): SIP is throttled to available funds and a **Warning** is raised ("SIP exceeds sustainable savings capacity in 2039–2041"). The user chooses throttle vs. hard-fail behaviour. (Review finding A-11.)

---

## 10. Return engine (core feature)

Never rely on a bare `NIFTY return = 10%`. Multiple modes, all built on one testable `ReturnModel` interface:

```
ReturnModel
 ├── FixedReturn            (E0)
 ├── DiscreteScenarioSet    (E1: Bear/Base/Bull)
 ├── HistoricalReturn       (E2: real TRI series)
 ├── HistoricalHaircut      (E2 with forward adjustment)
 ├── BucketReturn           (E1/E3 — see §10.1)
 ├── HistoricalReplay       (E2 ensemble in V2)
 └── MonteCarloReturn       (E3)
```

The return engine MUST be independently unit-testable in isolation (deterministic given inputs + seed).

### 10.1 Return-bucket model (semantics made precise)
The original left "bias" ambiguous (step size vs. total spread) and assigned no probabilities. Defined here:

- **Base return** `b` (e.g. 9%).
- **Bucket count** `n` — odd (3/5/7/9/11), enforced so the base stays centred.
- **Step** `s` = the spacing between adjacent buckets (renamed from "bias" for clarity; UI label: **"Spread per step"**).
- Buckets = `{ b + k·s : k = −(n−1)/2 … +(n−1)/2 }`.
- **Probability weights** default to a discretised normal centred on `b` (user may override to uniform or custom). Weights MUST sum to 1 and are shown to the user.

Worked examples (match the original intent):

| Base | n | Step | Buckets |
|---|---|---|---|
| 9% | 3 | 2% | 7% · 9% · 11% |
| 9% | 5 | 2% | 5% · 7% · 9% · 11% · 13% |

> In E1 the buckets are shown as labelled discrete scenarios. In E3 they act as a sampling distribution. The two uses share one definition.

### 10.2 Historical return haircut
Adjust historical returns for forward-looking conservatism.

```
Historical CAGR (NIFTY 50 TRI): 12.7%
Forward adjustment:             −3.0%
Modelled return:                 9.7%
```

Setting name: **Historical Return Adjustment** (range **−5% … +5%**). Renamed from "haircut" because the control is bi-directional; "haircut" implied a reduction only. The UI states this is a **user/model assumption, not an economic forecast.** (Review finding A-4.)

### 10.3 Default return assumptions

| Scenario | Return |
|---|---:|
| Conservative (Bear) | 7% |
| Base | 9% |
| Optimistic (Bull) | 11% |

The historical NIFTY 50 TRI CAGR is displayed **separately** for context. The app never implies 9% is guaranteed. **Note:** the single "default return model" is now unambiguous — MVP default is **DiscreteScenarioSet (7/9/11)**; historical modes are opt-in. (Resolves the §13-vs-§70 contradiction, finding A-5.)

---

## 11. Market events, crashes, and recovery

### 11.1 Manual crash events
| Event | Year | Drawdown | Recovery |
|---|---:|---:|---:|
| Major crash | 2030 | −35% | 24 months |
| Major crash | 2037 | −40% | 30 months |

Fields: year · drawdown % · optional recovery period · optional label. A crash is **not** `Portfolio × 0.70` followed instantly by normal returns; it has magnitude, duration, a recovery path, and a recovery-return distribution.

```
Normal → Crash (−30%) → Recovery ramp → Normal
```

### 11.2 Automatic crash generation
Off · Historical · Periodic · Random · Historical-distribution.

### 11.3 Historical stress replay (E2)
Maintain NIFTY 50 TRI drawdown history and classify: Correction 10–20% · Bear 20–30% · Severe bear 30–50% · Extreme >50% (thresholds configurable). The engine identifies drawdowns (peak → trough → recovery), records peak/trough dates, max drawdown, days-to-trough, days-to-recovery, and can **replay or reposition** an event in the future. Labelled **"Historical stress replay,"** never a prediction.

### 11.4 Sequence-of-returns risk
Identical average returns produce different outcomes depending on order, especially around retirement and large withdrawals. **Accumulation and withdrawal phases are modelled differently.** Because sequence risk only *manifests* under a varying return path, the product surfaces it via **E2 (historical replay)** and **E3 (Monte Carlo)** — not under a single fixed return. MVP therefore delivers sequence-risk insight through **historical replay** even before Monte Carlo lands. (Resolves finding A-6: a core principle must have at least one MVP-available engine that expresses it.)

---

## 12. Monte Carlo engine (V2)

Optional advanced mode. **1,000–10,000** simulations. Explicitly specified so results are honest and reproducible:

### 12.1 Distribution
Monthly equity returns are drawn from a **fat-tailed, negatively-skewed distribution** (Student-t or block-bootstrap of the historical TRI series), **not** a plain normal. Equity returns are fat-tailed; a normal understates exactly the crash risk this tool exists to expose. The chosen distribution is stated in the audit trail. (Review finding A-3.)

### 12.2 Randomised variables
Returns · crash timing · crash magnitude · inflation · salary growth · medical events · job loss · expense variation.

### 12.3 Correlation (required)
These variables are **not sampled independently.** A recession tends to couple market crashes with job loss and weaker salary growth. The engine uses a **correlation/scenario structure** (at minimum: a "bad-times" regime that jointly stresses returns, employment, and salary growth) so joint tail risk is not understated. The correlation assumptions are user-visible and editable. (Review finding A-7.)

### 12.4 Reporting
Percentiles **10 / 25 / 50 (median) / 75 / 90**, reported in **both nominal and real** terms (the UI toggles; the default headline is **real**). See §26 for reproducibility (seed capture).

---

## 13. Emergency fund engine

**Target** = X months of **essential** expenses; slider **3–24 months** (default 6–9).

> Essential = ₹60k/month · Target 9 months → **₹5.4L**.

**Replenishment.** If an event draws the fund down (₹7L → ₹4L), the engine can prioritise rebuilding it before increasing discretionary investment. This is configurable and is expressed **through the single cash-flow hierarchy in §24** — there are no longer two competing priority systems. (Review finding A-10: the medical-event funding order in §20-original and the cash-flow hierarchy in §50-original are unified under §24.)

---

## 14. Inflation model

Inflation is mandatory. Global default **6%**, with per-category overrides:

| Category | Default |
|---|---:|
| General | 6% |
| Healthcare | 8% |
| Education | 8% |
| Housing | 6% |
| Lifestyle | 6% |

Modes: Fixed · Historical · Custom schedule · Randomised (E3).

**Which inflation deflates "today's money"?** The **General** rate is the deflator for converting nominal corpus to real purchasing power, *unless* the user selects a custom deflator. Category rates grow the corresponding **expenses**; the general rate deflates **results**. This split is stated in the audit trail so real-value comparisons are unambiguous. (Review finding A-13.)

---

## 15. Nominal vs real values

Every major result supports **Future/nominal** and **Today's purchasing power**.

> Future corpus: ₹8Cr · Today's money: ₹2Cr

The **real (inflation-adjusted) figure is the prominent default.** In V2, percentiles are reported in both bases (§12.4).

---

## 16. Recommended defaults for the initial model

| Variable | Default |
|---|---:|
| Starting invested corpus | ₹6L |
| Emergency fund | ₹6.5L |
| Starting SIP | ₹25k/month |
| SIP increase | 5%/year |
| Base return | 9% |
| Return range | 7% / 9% / 11% (Bear/Base/Bull) |
| **Equity volatility σ (annual)** | **~18%** (NIFTY 50 TRI, historical order of magnitude) |
| **Debt/cash volatility σ (annual)** | **~4%** |
| **Equity–debt correlation** | **~0.2** |
| General inflation | 6% |
| Healthcare inflation | 8% |
| Historical dataset | NIFTY 50 TRI |
| Default return model | Discrete scenarios (7/9/11) |
| Market-crash model | Historical drawdowns |
| Simulation frequency | Monthly |
| Plan-until age | 90 |
| Health & term insurance | Quarterly premium |
| Output | Real (default) + nominal |
| Advanced output | Monte Carlo probability (V2) |

> The 9% base is a **conservative planning assumption**, not a claim about future NIFTY 50 returns. Volatility/correlation defaults are order-of-magnitude planning values, editable, and the exact source period is shown in the audit.

---

## 17. Insurance, medical events, and dependency

### 17.1 Health insurance
Fields: coverage · premium · frequency (Monthly/Quarterly/Half-yearly/Annual) · start year · end year · premium inflation · **deductible · out-of-pocket maximum** · members covered.

> ₹7,500 quarterly → ₹30,000/year deducted from cash flow.

Premium inflation: fixed % or custom schedule.

### 17.2 Term insurance
Fields: cover · premium · frequency · start age · end age · escalation · policy duration.
> ₹20,000 quarterly → ₹80,000/year. Term policies have **no maturity value**; the death payout is modelled only in §17.4.

### 17.3 Medical events (separate from premiums)
| Event | Year | Gross cost | Coverage |
|---|---:|---:|---:|
| Surgery | 2035 | ₹10L | 80% |
| Major illness | 2047 | ₹20L | 70% |

Out-of-pocket = gross − reimbursement. **The reimbursement calculation MUST honour the policy's deductible and out-of-pocket maximum from §17.1** — the earlier version defined those fields but never used them. Funding follows the unified hierarchy (§24). (Review finding A-14.)

### 17.4 Life-cover / dependency estimate (advanced)
`Income replacement + outstanding debt + future goal obligations − liquid assets`. Shown as **"Planning estimate, not insurance advice."** Links to the death/dependency scenario (§32-original) for family runway.

### 17.5 Insurance burden
Annual health premium · annual term premium · total annual insurance · insurance as % of income · projected lifetime premiums (nominal + real).

---

## 18. Goals, expenses, and life modules

Unchanged in intent from the source; consolidated here. Each references the unified cash-flow hierarchy (§24), the defined goal-status thresholds (§6), and taxes on any equity liquidation (§23).

- **One-time expenses** table: label · amount · year · inflation-adjusted? · funding source (Cash · FD/RD · Debt · Equity · Pro-rata · Cheapest-available · User-defined). **"Cheapest available" is defined as cheapest _after tax and penalties_** (e.g. equity liquidation includes LTCG), not lowest headline cost. (Review finding A-12.)
- **Recurring expenses** table — now includes an **Essential / Discretionary flag** (previously implied but not captured), because runway and failure detection depend on the essential subset (§6, §22, §25).
- **Marriage / Children / House / Debt / Asset allocation / Glide path** modules retain the source fields. **House affordability:** an EMI that pushes **DTI above 40%** (configurable) raises a Warning and can be configured to count as a failure (§25).
- **Retirement / FI:** the module reconciles the two withdrawal paradigms explicitly — the user picks **either** a fixed **withdrawal rate** **or** a **need-based** draw (desired monthly lifestyle in today's money, inflated). They are not applied simultaneously; the chosen one governs, the other is shown for comparison. Drawdown runs to **plan-until age** (§5.2). (Review finding A-15.)

---

## 19. Tax model

Modes: **Ignore tax · Simple estimate · Indian tax model.**

The Indian tax model MUST be **versioned by assessment year** with an **effective-date** field, because Indian tax rules change annually (regime choice, equity LTCG/STCG rates and exemption, post-2023 debt-fund slab taxation, 80C, etc.). Each scenario records **which tax-year ruleset it used** so results are reproducible and auditable. Covered areas: salary · equity capital gains (LTCG/STCG) · debt taxation · FD interest · other income. Rebalancing and goal-driven equity sales are taxable events and flow through this model. (Review findings A-12, A-16.)

> This is not a substitute for professional tax advice; the tax engine is a planning approximation and says so.

---

## 20. Visualisations

- **Wealth over time** (primary): X = age/year, Y = net worth/portfolio. Shows **Bear/Base/Bull** in MVP; **percentile bands (10/50/90) only when E3 has run** (§3). The percentile-band chart is a V2 surface — MVP shows the discrete-scenario version of the same chart. (Review finding A-1.)
- **Cash-flow** (annual/monthly): income · essential · discretionary · insurance · debt · investments · goal funding — flags financially stressed years.
- **Portfolio composition** (stacked): equity sleeves · debt · cash · other.
- **Net worth**: `financial assets + property − liabilities`, so a house purchase is not mis-read as pure wealth loss.
- **Goal timeline** with defined statuses (§6).

---

## 21. Monthly mechanics

- Annual→monthly return conversion: `r_monthly = (1 + r_annual)^(1/12) − 1`. Do **not** divide by 12 unless intentionally modelling a nominal monthly rate.
- Inflation, increments, premium debits, EMI starts, and contribution changes are each applied on **explicit month indices** per the §4 time model (e.g. increment on the anniversary month, not silently on January).
- **Money is stored in integer paise** (minor units), never floating-point rupees, to avoid rounding drift; display rounding rules (₹, ₹k, ₹L, ₹Cr) are formatting-only and defined in a shared utility. (Review finding A-17.)

---

## 22. Failure detection, runway, stress testing

- **Critical:** negative cash flow · emergency fund depleted · required goal unfunded · DTI above the configured limit · portfolio reaches zero · retirement corpus insufficient before plan-until age.
- **Warning:** emergency fund below target · insurance unaffordable · SIP above sustainable capacity · high DTI · large near-term goal funded by volatile equity.
- **Financial runway:** "You can survive X months without income," from cash + FD + emergency fund vs. essential expenses + insurance + debt obligations.

**"Stress Test My Plan"** applies configurable shocks (−40% crash · 1–2 yr salary interruption · major medical · higher inflation · marriage +25% · house +20% · child +20%). Output: **Survives / Stressed / Fails.**

> **Attribution honesty:** with simultaneous shocks, failure is usually **multi-causal.** The tool reports **contribution to failure via one-at-a-time and leave-one-out analysis** ("the salary interruption alone breaks the plan; the crash alone does not"), rather than claiming a single definitive cause. This replaces the original "show exactly which assumption caused failure," which over-promised. (Review finding A-18.)

---

## 23. Explainability, audit, and trust

Every major output has a **"Why?"** breakdown:

```
Starting corpus     ₹6.0L
Contributions       ₹98.4L
Investment growth   ₹1.39Cr
Withdrawals         −₹20L
Insurance           −₹X
Taxes               −₹X
= Portfolio         ₹2.43Cr
```

**Simulation audit** displays every assumption *and* everything needed to reproduce the run:

```
Return model:     Discrete scenarios (7/9/11)   |  or Historical + −3.0% adjustment
Distribution:     Student-t (Monte Carlo runs)
Inflation:        General 6%, Healthcare 8%
Salary growth:    8%   |  SIP growth: 5%
Crash model:      Historical
Tax ruleset:      AY 2026-27
Data version:     NIFTY 50 TRI snapshot 2026-08-31
RNG seed:         0x8F3A… (Monte Carlo)
Runs:             5,000   |  Horizon: 37y (to plan-until 90)   |  Frequency: Monthly
```

The app clearly distinguishes **historical facts · user assumptions · model assumptions · simulated outcomes · forecasts** and never writes "You will have ₹X." It writes "Median modelled outcome (real): ₹5.3Cr" with the 10th/90th alongside — **only in tiers that computed them.**

---

## 24. Cash-flow hierarchy (single source of truth)

One configurable ordering governs **all** allocation and drawdown decisions (emergency replenishment, medical funding, goal funding, SIP throttling). There are no separate, potentially-conflicting priority lists.

```
Income → Taxes → Essential expenses → Insurance → Debt service
→ Emergency-fund target → Priority goals → SIP → Discretionary
```

Every goal carries a priority (**Essential / Important / Optional**). When cash flow is constrained, the engine funds strictly in this order and records what it skipped. The order is fully user-editable. (Unifies the two original hierarchies — finding A-10.)

---

## 25. Reverse calculators & FI

- **"How much do I need to invest?"** — given target corpus + target age, solve for combinations of starting SIP · SIP growth · current corpus · retirement age.
- **"What salary do I need?"** — given SIP · goals · insurance · debt · living expenses · target corpus, solve minimum required income.
- **FI calculator** — given a retirement age, determine required corpus · annual spend · healthcare reserve · inflation · withdrawal rate · (V2) probability of success. Drawdown bounded by plan-until age.

Reverse solvers show a **frontier of combinations**, not a single answer, consistent with the anti-false-precision principle.

---

## 26. Reproducibility & data provenance

A tool that claims to be "auditable" must be **reproducible.** Two requirements the original omitted:

1. **Scenario pins its data version.** Each saved scenario records the **market-data snapshot** it used (e.g. `NIFTY 50 TRI snapshot 2026-08-31`). Updating the historical dataset does **not** silently change old scenarios; the user is prompted to re-run against new data. (Review finding A-19.)
2. **Monte Carlo pins its RNG seed.** Percentiles are otherwise irreproducible run-to-run, contradicting auditability. The seed is stored and shown (§23). (Review finding A-20.)

**Data source & licensing.** Historical NIFTY 50 price index and TRI come from an authoritative NSE/index source. The exact TRI start date is displayed and is **not overstated** — the NIFTY 50 price index base is Nov-1995, but the **published TRI series begins later (≈1999)**; the UI shows the true available range rather than claiming "TRI 1995–present." **Redistribution/licensing terms for NSE index data MUST be cleared before shipping** (legal dependency, tracked in §33). (Review finding A-21.)

---

## 27. Non-functional requirements

- **Performance / architecture.** Monte Carlo at 10,000 runs × monthly × 40 years ≈ millions of iterations. The compute path MUST be specified per milestone: MVP deterministic/replay math runs **client-side**; **V2 Monte Carlo runs server-side (or in a Web Worker/WASM)** with a target of **≤ 3 s** for a 5,000-run scenario and a progress indicator. "Immediate" slider feedback applies only to E0/E1 recomputation; stochastic runs use an explicit **"Run simulation"** action. (Review finding A-22.)
- **Persistence & accounts.** Data model (§28) is stored per authenticated user; **local-only mode** is offered for privacy-sensitive users (no server storage). Auth method specified at build time; MVP MAY ship local-only to reduce PII.
- **Security & privacy (India-specific).** Encryption in transit and at rest · user-controlled deletion · data export · minimal PII · no bank credentials · no bank integration required for MVP · no selling of data · clear privacy policy. **Compliance with India's DPDP Act 2023** (consent, purpose limitation, data-principal rights, breach notification) MUST be assessed; if any processing occurs, a Consent notice and grievance contact are required. (Review finding A-23.)
- **Regulatory.** The product provides **generic planning simulation, not personalised investment advice under SEBI (Investment Advisers) Regulations, 2013.** Legal review MUST confirm that disclaimers, the "not advice" framing, and the absence of specific security recommendations keep the product outside RIA scope. This is a **launch gate**, not a footnote. (Review finding A-24.)
- **Accessibility & platform.** WCAG 2.1 AA target · responsive layout with a **mobile-viable alternative to sliders** (steppers/number entry) since slider-heavy UIs are hostile on phones · documented browser support matrix. (Review finding A-25.)
- **Validation.** Reject/flag: target age ≤ current age · plan-until age ≤ retirement age · negative amounts · SIP growth ≫ salary growth (warn) · retirement age > plan-until age · empty required fields. Every input has a defined default, range, and error message.
- **Testing.** The return engine, tax engine, and cash-flow engine ship with unit tests; golden-master scenarios lock known outputs; Monte Carlo is tested for statistical stability at a fixed seed.

---

## 28. Data model

```
User
 ├── Profile (dob/currentAge, anchorYear, planUntilAge)
 ├── IncomeStreams[]
 ├── Assets[]            (with volatility σ)
 ├── Liabilities[]
 ├── Investments[]       (with σ, correlation group)
 ├── SIPs[]
 ├── InsurancePolicies[] (deductible, oopMax)
 ├── Goals[]             (priority, statusThresholds)
 ├── OneTimeExpenses[]
 ├── RecurringExpenses[] (essential/discretionary flag)
 ├── MarketEvents[]
 ├── Children[]
 ├── Properties[]
 └── Scenarios[]
```

```
Scenario
 ├── name
 ├── simulationStart / simulationEnd / planUntilAge
 ├── dataSnapshotVersion            (reproducibility)
 ├── rngSeed                        (Monte Carlo reproducibility)
 ├── taxRuleset                     (assessment year)
 ├── returnModel / inflationModel / salaryModel
 ├── marketCrashModel / expenseModel / insuranceModel
 ├── investmentModel / goalModel / taxModel
 └── cashFlowHierarchy              (user-ordered)
```

Scenarios are clonable and comparable (corpus · net worth · FI age · goal success · cash-flow stress · probability [V2]).

---

## 29. Success criteria

**User-capability acceptance (must all pass in usability testing):** a user can, within the times noted —
1. Enter their current position in **under 5 minutes**.
2. Model major life events. 3. Adjust any major assumption. 4. Understand how a change moves the outcome. 5. See optimistic **and** pessimistic outcomes. 6. Understand when/why the plan fails. 7. Identify the highest-impact decisions. 8. Compare strategies. 9. Understand nominal vs real. 10. Stress-test against shocks.

**Product metrics (the original had none; added):**
- **Activation:** % of new users who complete a first scenario (target defined pre-launch).
- **Engagement:** % who create ≥ 2 scenarios or run a stress test.
- **Model trust:** % who open a "Why?"/audit view.
- **Correctness (internal):** engine golden-master tests pass rate = 100% at release.

(Review finding A-26.)

---

## 30. Non-goals

The product does **not**: guarantee returns · give regulated personalised investment advice · recommend specific stocks · execute trades · require bank credentials · pretend one return assumption predicts the future · treat historical performance as guaranteed future return · hide assumptions behind a single "wealth number."

---

## 31. Signature experience — "Build My Life"

Central workflow. The user narrates their life; the app builds a timeline and answers **"Does the plan survive?"** — **honestly per tier (§3)**:

- **MVP:** "Survives in **Base** and **Bull**; in **Bear** retirement becomes underfunded around **age 51**." (Discrete scenarios — no fabricated percentage.)
- **V2:** "**78% modelled probability** of meeting the selected goals," once Monte Carlo exists.

```
AGE 28 → ₹6L invested · ₹7L emergency · SIP ₹25k
AGE 33 → Marriage (₹X)
AGE 36 → House (down payment ₹X · EMI ₹X)
AGE 38 → Child 1
AGE 41 → Child 2
AGE 55 → Retirement   (drawdown to plan-until 90)
```

**Improve plan** proposes changes with their modelled effect: "Increasing SIP ₹25k → ₹31k improves modelled goal success from 61% → 82% (V2)" — or, in MVP, "…moves retirement from *fails in Bear* to *survives in Bear*."

---

## 32. Milestone scope

**MVP (E0–E2 single-path).** Inputs: age · horizon · plan-until age · cash/FD · existing investments (+σ) · salary · salary growth · SIP · SIP growth · inflation · return mode (fixed/discrete/historical) · historical adjustment · one-time withdrawals · recurring expenses (+essential flag) · manual crashes · health & term insurance. Engine: monthly sim · fixed/discrete/historical returns · crashes with recovery · inflation · SIP escalation · premiums · withdrawals · cash-flow hierarchy · **sequence-risk via historical replay**. Outputs: net worth · portfolio · contributions · withdrawals · real vs nominal · goal funding (defined thresholds) · scenario comparison · wealth chart (Bear/Base/Bull) · cash-flow chart. **No percentiles, no probability language.**

**V2 (adds E3 + life modules).** Marriage · children · house · loans · **tax engine (versioned)** · job loss · medical events · emergency-fund engine · **Monte Carlo (with distribution + correlation + seed)** · FI calculator · reverse SIP calculator · probability outputs + percentile bands.

**V3.** Historical crash replay ensemble · multi-asset allocation · glide paths · retirement withdrawal simulation · death/dependency simulation · more asset classes (EPF/PPF/NPS with their rules) · international investments · goal optimisation · AI plan explanations.

---

## 33. Open questions & risk register

Tracked, owner-assigned before build:

| # | Risk / open question | Type | Gate |
|---|---|---|---|
| R1 | NSE/index-data redistribution licensing for TRI | Legal | Before MVP ship |
| R2 | SEBI RIA scope — do disclaimers keep us out of "investment advice"? | Legal | Before MVP ship |
| R3 | DPDP Act 2023 obligations if any PII is stored server-side | Legal/Privacy | Before any server storage |
| R4 | Monte Carlo distribution & correlation calibration (t vs bootstrap) | Modelling | Before V2 |
| R5 | Client vs server compute budget for 10k-run Monte Carlo | Technical | Before V2 |
| R6 | Auth model & local-only mode decision | Technical/Privacy | Before MVP ship |
| R7 | Tax-ruleset update cadence and who maintains it | Ops | Before V2 tax engine |

---

## 34. Final product philosophy

This is not primarily an SIP calculator. It is a **personal financial simulation engine** that models the interaction of income + savings + investments + market returns + inflation + insurance + debt + marriage + children + housing + healthcare + career changes + unexpected expenses → a *range* of financial futures.

The most important output remains:

> **"Given these assumptions, how resilient is my plan, what can break it, and which decisions have the greatest ability to improve it?"**

---

## Glossary

- **Corpus / Investment corpus** — market-linked long-term assets only. **Excludes** emergency fund and everyday cash.
- **Net worth** — `financial assets + property (market value) − liabilities`. Broader than corpus.
- **Portfolio** — the invested asset holdings whose returns are simulated; a component of net worth.
- **Savings rate** — `(monthly income − monthly spend) ÷ monthly income`, where spend = essential + discretionary. Shown on hover in-product.
- **Nominal value** — future rupees, not inflation-adjusted.
- **Real value / today's money** — nominal deflated by the General inflation rate (§14).
- **TRI (Total Return Index)** — index level assuming dividends reinvested; higher than the price index. Default for equity simulation.
- **Sequence-of-returns risk** — the effect of the *order* of returns (not just the average) on outcomes, acute during withdrawals.
- **DTI (debt-to-income)** — total debt service ÷ income; default failure/warning threshold 40%.
- **σ (volatility)** — annualised standard deviation of returns; required for stochastic modes.
- **Engine tiers E0–E3** — deterministic → discrete → historical → stochastic (§3).

---

## Appendix A — Adversarial review findings

The following issues were identified in the source PRD and resolved in this rebuild. Severity: 🔴 blocker · 🟠 major · 🟡 minor.

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A-1 | 🔴 | **MVP promised percentile/Monte-Carlo confidence bands** (main wealth chart) while Monte Carlo was placed in V2 — the flagship chart couldn't be built in MVP. | Honesty matrix (§3); MVP shows Bear/Base/Bull, percentile bands are V2 (§20). |
| A-2 | 🔴 | **"Probability of success" / "78% modelled probability"** appeared in the dashboard, retirement module, and the signature "Build My Life" flow, but no probability engine exists until V2. | Probabilities gated to E3 (§2 honesty constraint, §3, §31); MVP answers survive/fail per discrete scenario. |
| A-3 | 🟠 | **Monte Carlo distribution unspecified** — a normal assumption would understate the crash/tail risk the tool exists to expose. | Fat-tailed (Student-t / bootstrap) specified (§12.1). |
| A-4 | 🟡 | **"Haircut" allowed +5%** (an increase), contradicting the name; purpose muddled. | Renamed **Historical Return Adjustment**, bi-directional −5…+5% (§10.2). |
| A-5 | 🟠 | **Contradictory default return model** — "Historical + adjusted" (defaults table) vs fixed 7/9/11 (defaults section). | Single unambiguous default: Discrete scenarios 7/9/11; historical is opt-in (§10.3, §16). |
| A-6 | 🔴 | **Sequence-of-returns risk** declared core, but every MVP-available mode (fixed/simple bucket) produces no sequence risk; Monte Carlo (which would) is V2. | Sequence risk delivered in MVP via **historical replay (E2)** (§11.4). |
| A-7 | 🟠 | **No correlation among randomised Monte Carlo variables** — independent sampling understates joint recession risk (crash + job loss + weak raises together). | Correlation/"bad-times" regime required and user-editable (§12.3). |
| A-8 | 🔴 | **No life-expectancy / plan-end age** — retirement drawdown is unbounded; withdrawal rate alone can't bound it. | **Plan-until age** input added, default 90 (§5.2), threaded through retirement math (§18, §25). |
| A-9 | 🟠 | **"New investments go to NIFTY 50"** (single asset) coexisted with glide paths, rebalancing, multi-asset allocation — undercutting risk features and creating scope confusion. | MVP = single equity sleeve + debt/cash, explicitly flagged for concentration risk; allocation/glide/rebalance are V3 (§7.2, §32). |
| A-10 | 🟠 | **Two competing priority systems** — medical-event funding order vs cash-flow hierarchy — with undefined interaction. | Unified into one editable cash-flow hierarchy (§24), referenced everywhere (§13, §17.3). |
| A-11 | 🟠 | **SIP could exceed income** (growth slider to 30%) with no defined engine behaviour; pause table lacked an amount for "increase/reduce." | Sustainability guard + throttle/fail choice (§9); schedule table gains action+amount. |
| A-12 | 🟠 | **"Cheapest available" funding & equity sales ignored tax/penalties**; LTCG on liquidation not modelled in funding choices. | Cheapest = cheapest **after tax/penalties**; equity sales flow through tax engine (§18, §19). |
| A-13 | 🟡 | **Ambiguous deflator** — with 5 category inflations, which one converts nominal→real was undefined. | General rate deflates results; category rates grow expenses (§14). |
| A-14 | 🟡 | **Deductible / out-of-pocket-max fields defined but unused** — medical events used a flat coverage %. | Reimbursement now honours deductible & OOP-max (§17.3). |
| A-15 | 🟠 | **Retirement mixed two withdrawal paradigms** (fixed withdrawal rate vs need-based lifestyle) with no rule for which governs. | User picks one; the other is shown for comparison (§18). |
| A-16 | 🟠 | **Tax model not versioned** — Indian rules change yearly; no effective-date/assessment-year mechanism, harming reproducibility. | Tax ruleset versioned by assessment year and pinned per scenario (§19, §28). |
| A-17 | 🟡 | **Money precision unspecified** — floating-point rupees risk rounding drift in a financial app. | Store in integer paise; formatting-only rounding (§21). |
| A-18 | 🟠 | **"Show exactly which assumption caused failure"** over-promises — combined shocks are multi-causal. | One-at-a-time + leave-one-out attribution instead of a single "cause" (§22). |
| A-19 | 🟠 | **No data-version pinning** — updating historical data silently changes saved scenarios, breaking auditability. | Scenarios pin a data snapshot version (§26, §28). |
| A-20 | 🟠 | **Monte Carlo not reproducible** — no RNG seed, contradicting the "auditable" claim. | Seed stored and displayed (§23, §26, §28). |
| A-21 | 🟠 | **"TRI 1995–present" likely overstated** (published TRI series starts ≈1999); NSE data redistribution licensing unaddressed. | UI shows true available range; licensing tracked as launch gate R1 (§26, §33). |
| A-22 | 🔴 | **No performance/architecture spec** — 10k-run monthly Monte Carlo in a browser with "immediate" slider updates is infeasible as stated. | Compute path, latency budget, and explicit "Run simulation" for stochastic modes (§27). |
| A-23 | 🟠 | **Privacy section generic** — no reference to India's DPDP Act 2023 despite sensitive financial PII. | DPDP assessment + consent/rights required for any server storage (§27, R3). |
| A-24 | 🔴 | **No SEBI regulatory analysis** — the app models investments; "not advice" was asserted but never assessed against SEBI (Investment Advisers) Regulations, 2013. | Legal launch gate R2; framing/disclaimers reviewed (§27, §33). |
| A-25 | 🟡 | **No accessibility / mobile / browser requirements**; slider-heavy UI is hostile on phones. | WCAG 2.1 AA, responsive with stepper fallback, browser matrix (§27). |
| A-26 | 🟡 | **Success criteria had no product metrics** — only a user-capability checklist. | Activation/engagement/trust/correctness metrics added (§29). |
| A-27 | 🟡 | **Undefined goal-status thresholds** and risk-indicator rubric (colours with no numeric basis). | Numeric thresholds and a documented rubric (§6). |
| A-28 | 🟡 | **Calendar-year vs age used interchangeably** with no anchoring rule. | Canonical month-index time model with a stated anchor (§4). |
| A-29 | 🟡 | **Bucket "bias" ambiguous** (step vs spread) and **no probability weights** for buckets. | "Spread per step" defined; default normal weights that sum to 1 (§10.1). |

