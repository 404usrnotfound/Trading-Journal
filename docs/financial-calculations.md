# Financial calculation contracts

This document completes the financial calculation definitions in [ADR 0004](decisions/0004-financial-kernel-and-ledger.md) and [ADR 0005](decisions/0005-versioned-domain-and-multicurrency.md). It accompanies the [domain model](domain-model.md). These are design contracts for later implementation, not claims that a calculation engine, database schema, or executable financial tests exist.

The authoritative requirements are in [the product specification](../Trading_Journal_Codex_Prompt.md), particularly sections 3–9 and 14. No formula in this document grants automatic support to a product whose settlement, units, or valuation convention has not passed independent fixtures.

## 1. Calculation identity and result contract

Every financial result declares its quantity/amount and unit, native or reporting currency, gross/net basis, realized/unrealized basis where applicable, inventory or campaign population, economic interval/as-of instant, source revision, and calculation manifest. The manifest identifies kernel, instrument module, lot policy, allocation policy, FX-selection policy, precision/rounding policy, and applicable metric versions. Results retain exact source, metadata, observation, and policy references.

The same immutable inputs and manifest produce the same output. The kernel does not read mutable defaults, provider APIs, the wall clock, browser state, or an LLM. A corrected fact creates another source revision and explicitly restated generation. Historical recorded generations remain distinguishable from restated results.

Availability is operation-specific:

| State | Meaning |
| --- | --- |
| Available | Required inputs, compatible conventions, and validated operation are present. Quality still distinguishes sourced, manual, estimated, stale-but-explicitly-requested, and reconciled data. |
| Partial | Explicitly named available components with omitted quantity/value coverage; never presented as a complete total. |
| Unavailable | Supported operation lacks a required operand or a mathematically defined result. Carries reasons and missing references. |
| Unsupported | No validated automatic module exists for this subtype/operation; recording and explicit compatible manual/broker facts remain possible. |
| Pending/stale/failed | Projection-generation status; separate from mathematical availability and data quality. |

Reasons include unknown opening basis, missing charged-currency FX, absent/stale mark, incomplete fees, ambiguous chronology, incompatible source definition, missing original risk, insufficient path/valuation history, undefined ratio, numeric overflow, and unsupported settlement. A valid zero requires sufficient data to establish zero. Manual/broker results have their own definition/provenance and do not silently replace internally calculated results.

An unbounded mathematical ratio uses an explicit typed `unbounded` condition with explanation and no non-finite decimal value. It is distinct from a missing-input/undefined result; neither `Infinity` nor `NaN` is a monetary API/database scalar.

## 2. Decimal, units, and rounding

Use decimal strings across import, API, database, worker, and backup boundaries. Accepted scalars fit PostgreSQL `NUMERIC(78,36)`: at most 42 integral digits and 36 fractional digits. Preserve original source text and parsing conventions. Reject non-finite values and excess nonzero precision before a database cast; trailing fractional zeros can be removed without changing the value. Never pass authoritative amounts through a JavaScript binary floating-point number.

Use an isolated Decimal.js context with 160 significant decimal digits and HALF_EVEN at documented derived boundaries. Exact integer/fixed-unit arithmetic is also appropriate for conservation. Currency booking increments, instrument quantity increments, ticks, and display precision are separate from the storage envelope. Accepted source values are not rounded merely to match a screen. An explicitly reviewed normalization retains the original and reason.

Each module defines:

1. Source units: instrument units/contracts, price units, multiplier, and quote/settlement/collateral currency roles.
2. Theoretical arithmetic: sufficient working precision with no intermediate display rounding.
3. Booking rules: verified currency/instrument/broker settlement increment and rounding convention.
4. Attribution rules: exact distribution of already booked amounts; attribution pieces need not be independently spendable amounts.
5. Derived persistence: named quantization boundary, normally scale 36 within the storage envelope, inputs/version, and recorded rounding policy.
6. Display: formatting only, with exact original/booked values available in exports.

Overflow or unrepresentable derived values return a failure reason rather than clipping or silently reducing precision. Division is an explicitly bounded numerical approximation; the 160-digit context is not an arbitrary-exactness claim. Aggregate unrounded working results before their named output quantization. Components must reconcile exactly at persisted precision through a separately named rounding residual; no residual can be disguised as market profit or FX.

### Exact proportional distribution

An allocation distributes a source amount `A` among nonnegative weights `w_i`, including an explicit unassigned weight, with `sum(w_i) > 0`. Zero source quantity can only allocate zero quantity; fee-only events use an explicitly selected cost-allocation policy instead of dividing by zero.

Use attribution quantum `u = 10^-36` for scale-36 internal amount/quantity partitioning unless a module declares a coarser validated quantum. Express `abs(A)` and the weights in exact integers/fixed units. Floor each ideal absolute piece `abs(A) * w_i / sum(w_i)` to `u`; distribute remaining units to the largest exact fractional remainders, breaking ties by immutable allocation ID in ascending order. Reapply the source sign. The algorithm version and stable IDs are inputs. Allocation must be bounded and must not expand a large residual by iterating once per currency unit.

This preserves `sum(A_i) = A`, including refunds/negative adjustments, and prevents a charge from appearing twice. These are analytical partitions, not new independently rounded cash postings. The same rule partitions principal basis, matched quantities where necessary, acquisition costs, close/open parts of a zero-crossing fill, and each original cost identity/currency independently. An explicit reviewed allocation can replace proportional weights, but must conserve the same originals and retain a new version.

## 3. Native cash balances and settlement

For account `a`, currency `c`, and cash bucket `k`, native balance at an economic boundary is:

`C[a,c,k,t] = sum(posting.amount for all posted cash postings visible in the chosen recorded/economic view in that scope through t)`.

Opening cash is an explicit posted event, not a hidden starting number. Cash includes the original postings **and** their exact negating reversal postings **and** replacement postings visible at the requested source revision/recorded-as-of boundary. Do not remove a superseded original from cash while retaining its reversal. Source-version resolution for inventory is a separate operation: replay the effective actual execution once, excluding bookkeeping reversal events from market quantity matching. No control posting is independently included in cash/NAV.

Within each event and currency, signed postings sum exactly to zero. Different currencies cannot be combined to establish balance. Actual positive cash receipts increase cash; payments decrease it. Cash classifications distinguish external flows, trade principal settlement, fees/carrying costs, income/withholding, actual currency exchange, internal transfer, and unresolved source classification.

For a validated ordinary cash-paid linear instrument, a purchase creates a known negative unsettled cash obligation and a sale a positive unsettled receivable; actual settlement moves the same amount between unsettled and settled buckets. Total monetary cash includes both once, while settled cash remains separately visible. Expected settlement dates do not prove actual settlement. Collateral/restricted cash is identified and counted once according to economic ownership; locking cash does not itself destroy account equity. External liabilities require explicit supported facts/modules, not guessed buying power.

An execution source may report actual booked principal. Otherwise a validated handler derives principal under its declared booking rule. Compare theoretical notional, booked principal, source settlement, and fee identities. An unexplained difference is a reconciliation variance requiring review; it is not automatically a fee. A verified rounding adjustment is explicit.

Imported cash rows matching an execution-generated economic effect are reconciliation evidence or correction proposals, not another receipt/payment. Broker order IDs, execution IDs, cash references, event/effect identities, and scoped import fingerprints support this distinction. Similar dates/amounts alone are insufficient to silently suppress or duplicate a row.

## 4. Ordinary linear inventory: eligibility and signs

These automatic formulas apply only to a validated cash-paid ordinary linear subtype whose quantity, price, multiplier, gross principal, and settlement currency are compatible. They are the starting native contract for ordinary equities/ETFs and eligible crypto spot holdings. They are not generic formulas for derivatives, inverse contracts, accrued-interest securities, or structured products.

For an inventory tranche:

| Symbol | Definition |
| --- | --- |
| `d` | Inventory direction: `+1` long, `-1` short. |
| `q` | Positive remaining or matched quantity magnitude in declared units. |
| `M` | Validated positive multiplier, normally `1` for ordinary shares/tokens. |
| `p_e`, `p_x`, `p_m` | Entry, exit, and mark price in compatible quote units; positive for this baseline. |
| `N_e`, `N_x` | Positive actual booked entry/exit principal assigned to the tranche, excluding separately charged costs. |
| `B = d * N_e` | Signed gross principal basis: asset basis positive; short-opening proceeds basis negative. |
| `V = d * N_x` or `d * q * M * p_m` | Signed realization principal or current marked holding value. |

The first ordinary inventory pool nets compatible long/short activity within account + instrument + unit/convention identity. A broker mode holding simultaneous independent long and short books requires an explicit book discriminator and a validated hedge-mode capability; it is not inferred from two campaign names. Campaign attribution does not multiply account inventory.

An opposite-direction execution first consumes eligible existing inventory. Any residual opens inventory on the other side. Thus selling 15 against 10 long closes 10 and opens 5 short; buying 15 against 10 short closes 10 and opens 5 long. Partition booked principal and every charge between close/open parts exactly before matching. No canceled order or unfilled order creates inventory, principal cash, or P&L.

### Quantity and average entry price

Signed open quantity is `Q = sum(d_i * q_i)` for compatible tranches. Report both signed quantity and nonnegative long/short magnitudes where required; never add quantities of distinct instruments as if they were one unit.

For one direction and compatible price/multiplier conventions, average remaining entry price is:

`p_average = sum(q_i * M_i * p_e_i) / sum(q_i * M_i)`.

If `M` is constant this reduces to quantity weighting. This is an execution-price measure, excluding fees. Remaining matched tranches determine the weights. Closed inventory has no average entry price. Unknown opening entry price produces unavailable average price for the affected population; it is not replaced by today's mark.

Execution-weighted price/theoretical notional and booked principal basis are distinct. For example, `10.3 * 100.123 = 1031.2669`, while verified cent booking may be `1031.27`. Average entry remains `100.123`; booked gross basis is `1031.27`. Display or settlement rounding must not silently change the source fill price. The module retains the explicit settlement-rounding adjustment.

### Principal, fees, and basis

Gross principal basis is `B`, with acquisition and carrying charges stored separately by original charge identity/currency. For same-native-currency acquisition costs `F_entry`, signed economic net entry basis is `B + F_entry`: long acquisition cost increases, while short-opening proceeds net of cost decrease in magnitude. It must be labeled net entry basis and is not a universal tax basis.

For fees in other currencies, retain the currency vector. A single native net basis requires eligible pinned charged-date translations and a defined native calculation currency. Missing rates can leave gross basis available and net basis unavailable. Do not silently change a fee's currency to the account base currency.

Known gross principal basis does not prove that entry price, acquisition date, or charges are known. Opening inventory separately records those statuses. Unknown basis leaves quantity and compatible marked value available, but affected realized/unrealized profit unavailable. Average-cost pools containing unknown basis cannot pretend to have a complete average basis.

## 5. Lot matching and policy transitions

Inventory matching is independent of campaign/strategy assignment. Consume actual account inventory once and keep the matching evidence. A later campaign allocation edit cannot make an account sale consume another copy of the lot.

| Policy | Deterministic contract |
| --- | --- |
| FIFO | Consume eligible tranches by acquisition economic order, then explicit source order/tie-break identity. Imported date-only ambiguity requires reviewed ordering or unavailable affected P&L. Unknown-basis tranches remain in the ordering. |
| Specific lot | User/import explicitly chooses eligible source tranches and quantities. Validate direction, compatible units, available quantity, and exact conservation while holding canonical inventory locks. |
| Average cost | Enabled only for a validated eligible pool. Opposite directions are not averaged together. Before disposal, proportionally consume remaining principal, quote-price basis, historical basis-FX vector, and acquisition-cost vector from the direction's pool. Preserve source contribution lineage rather than replacing historical FX with a single rounded mean. |

FIFO is the initial default. Average cost and specific allocation are analytical policies, not tax-jurisdiction compliance claims. Broker-required special rules need separate validated modules.

Each new entry adds a source tranche. Partial consumption retains exact source/remaining quantities, principal, and cost partitions. The final consumption takes the exact remaining amounts, preventing residual basis or fees on zero inventory. Shared execution allocation and lot matching have separate conservation assertions.

Policy versions apply prospectively. Changing FIFO to average cost requires an explicit pool-conversion event/snapshot that conserves remaining quantities, principal, costs, original acquisition lineage, and reporting-FX basis. Switching an averaged pool back to FIFO cannot invent previously absent individually assignable basis; require a reviewed valid migration/restatement or continue the existing policy. Historical policy changes require a separately reviewed replay, never a display preference toggle.

Internal holding transfers carry acquisition lineage, signed basis, charge partitions, metadata/unit versions, and known/unknown status to destination inventory. Neither a synthetic sell/buy nor a new current-price basis is created. Cross-account transfers have one stable transfer identity and exact source/destination conservation. Both accounts remain separate for balances; consolidation counts transferred holdings once. A destination policy can change future matching only through a compatible preserving pool conversion.

Corporate actions require their own validated handler: a split changes units/prices while conserving eligible total principal basis; a dividend is an income event, not a reduction of entry price by default; a return of capital, spinoff, merger, reward, exercise, or other action requires its declared basis/settlement convention or an explicit compatible manual result. Unsupported treatment cannot be inferred from a generic ticker edit.

## 6. Realized and unrealized results

For each matched ordinary linear tranche, native gross realization in its settlement/calculation currency is:

`G_realized = V_exit - B_consumed = d * (N_x - N_e)`.

When booked principal is exactly theoretical notional, this is `d * q * M * (p_x - p_e)`. Otherwise show quote-price contribution and the verified principal/settlement-rounding adjustment separately; their sum is gross realization. Independently observed broker P&L with a different definition remains a comparison, not an unexplained replacement.

Native gross unrealized result is `G_unrealized = V_mark - B_remaining`. For a validated linear mark, `V_mark = d * q * M * p_m`. It includes the difference between actual principal basis and theoretical marked value; no future unbooked liquidation charge is silently treated as an actual fee. Optional estimated liquidation costs produce a separately labeled scenario.

Net realization subtracts acquisition costs assigned to consumed inventory, actual disposal costs assigned to the closing part, and explicitly attributed actual carrying costs. Net unrealized subtracts acquisition costs still assigned to open inventory and carrying costs explicitly assigned to still-open inventory under the same attribution policy. The allocation/recognition policy is versioned, and all realized/open/unassigned cost pieces must equal the actual source charges. This analytical assignment does not delay the account cash expense recognition.

For account P&L bridges, use gross price/basis components and actual period charges rather than deducting both booked expenses and net lot costs. Net lot P&L is an attribution presentation: cash costs are already present in cash/NAV. Financing, borrow costs, funding, and conversion charges can have account/campaign/lot attribution without becoming an additional cash debit.

Native gross can be available when net is not. A fee currency vector is an exact useful result. A scalar native net result requires all charged-date fee conversions into the declared native calculation currency. A reporting net result translates each cost independently at its charged-date reporting rate, so it is not generally equal to native net multiplied by the exit/current rate.

### Short example

Sell short 10 units at USD 100, with USD 2 opening commission. Cover 4 at USD 90 with USD 1 commission; USD 3 actual borrowing charge is explicitly attributed to the closed portion.

- Gross opening proceeds are USD 1,000; signed basis is USD `-1000`; economic net entry basis is USD `-998`.
- Gross realization is `-1 * (360 - 400) = 40`.
- Assigned opening commission is USD `0.8`; net realization is `40 - 0.8 - 1 - 3 = 35.2`.
- Remaining short quantity is 6; gross signed basis is USD `-600`; remaining opening commission is USD `1.2`.
- At USD 95, signed mark is USD `-570`; gross unrealized is `30`, net unrealized after remaining opening commission is `28.8`.
- Cash receipts/debits, the short liability mark, and actual charges jointly determine NAV. Short gross proceeds are not portfolio profit.

This is a hand-calculated design fixture, not evidence of implemented short capability. Borrow availability and broker buying power remain observations.

## 7. Campaign financial attribution

Account lot realization answers what actual inventory was consumed. Campaign attribution answers which decision-making idea received activity/results. Keep both ledgers of evidence and label their populations.

For the initial campaign convention, maintain a separate analytical FIFO sequence of conserved campaign-leg execution allocations, without posting cash or consuming account inventory again. A leg is account + instrument + compatible units and direction; each allocation has magnitude, source execution/effect reference, and exact principal/cost partitions. Campaign close allocations match eligible opening allocations in that leg, with explicit reviewed matching available as a later version. Unassigned activity remains its own visible residual population.

A campaign with an imported exit but missing opening allocations has unavailable attributed basis/P&L; it does not borrow another strategy's plan/basis to create profit. Zero-crossing allocations record close/open roles explicitly. Cross-direction activity that does not correspond to the leg's declared purpose requires review/new leg. Multi-account/multi-instrument campaign totals require compatible translated components; quantities and native-currency amounts cannot be indiscriminately summed.

Campaign realization may differ from account FIFO realization for a period because the campaign and account select different opening attribution. Preserve a reconciliation bridge to account results, with the difference explicitly named inventory-versus-campaign basis attribution, source memberships, and remaining counterpart. Total conserved campaign plus unassigned attributed exposure/cost must agree with source activity; a claim that their realized totals alone always equal account realization is invalid. Closed/open basis-timing differences must also be included in the bridge.

Campaign completion needs explicit confirmation, all assigned exposure closed, no outstanding supported obligations, and the completion policy's order/settlement checks. A sell/cover/partial fill alone is not a completed trade. Financial completeness, lifecycle, and reconciliation are separate: closed quantity can coexist with incomplete fees or unknown risk.

## 8. FX selection and actual conversions

An observation `r[A→R]` means reporting/quote units `R` per one base unit `A`. Positive finite rates are required. Same-currency translation is an explicit identity with rate 1; different currencies never default to 1.

For each context, persist rate-selection policy/version, requested economic/valuation instant, eligible source priority/freshness, selected observation IDs, route direction, calculation version, and any reviewed override. Selection is deterministic:

1. An explicit reviewed context-bound rate/observation, with provenance and quality, if valid for that context.
2. Eligible direct observations no later than the requested instant, within the policy's freshness window, by declared source priority then latest eligible time and stable source identity.
3. Eligible inverse observation under the same freshness/source rules, deriving `1 / r` at the named rate boundary.
4. Only if explicitly configured and fixture-validated, an acyclic route through a named pivot with a bounded number of hops, coherent observation times/freshness, and deterministic route priority. Multiply directed component rates at working precision and quantize once at the declared output boundary.

Direct/inverse route precedence is part of the policy, not an accidental provider-return order. No future lookup or implicit interpolation is allowed. Freshness windows and provider source priorities must be configured for a context; the model does not invent a universal market calendar or source preference. Missing/stale observations yield unavailable unless an explicitly labeled manual observation is supplied. A rate provider does not determine these accounting rules.

Historical basis, cash movements, actual charges, realization, and valuation bind their own rate selections. Newly downloaded prices/rates do not mutate pinned history. An added missing/corrected historical rate enables a new explicitly restated generation. A new reporting currency builds another view; it does not rewrite original monetary facts.

### Actual exchange amounts

An actual conversion has source principal `S` in currency `A`, destination principal `D` in currency `B`, actual direction/rate, dated account/economic context, source reference, and fee identities/currencies. `S > 0` and `D > 0`; principal excludes fees, which have separate ledger legs. If a broker supplies only net amounts, reviewed normalization explicitly separates principal and fees or retains an incomplete classification rather than deducting fees twice.

The implied actual gross rate is `D / S` units B per A. Source/destination booked amounts are authoritative; a supplied rounded rate does not alter them. Retain supplied precision and comparison/tolerance. Reverse conversions have their own identities/amounts/rates. Reporting translation rates and actual exchange rates remain different concepts. An actual exchange rate is not automatically reused as a historical market translation rate.

At the exchange instant, the gross reporting conversion execution difference is:

`X_conversion = D * r[B→R,t] - S * r[A→R,t]`.

It represents the actual exchanged principal relative to the chosen reporting valuation context, including embedded exchange-rate execution effects. It is separate from holding FX, cash FX, and explicit conversion fees. It may be zero if the explicitly chosen valuation context uses the actual exchange relationship. Its definition/rates must be disclosed. Do not subtract a measured spread/slippage again: actual amounts already contain it.

Optional campaign attribution of conversion fees partitions the original charge only. It changes attribution, not account net P&L/cash, and never turns a pure exchange into an instrument execution. Currency changing an account balance is not an FX leveraged-trade formula. Leveraged FX contracts require their own instrument module.

## 9. Transaction-anchored holding and cash FX

Let `B_i` be a signed gross principal basis tranche in native currency, `r_basis_i` its historical reporting rate, `V_i` its signed native realization/mark value, and `r_end_i` its realization/valuation rate. Then:

`native gross trading_i = V_i - B_i`

`reporting trading_i = (V_i - B_i) * r_end_i`

`holding FX_i = B_i * (r_end_i - r_basis_i)`

`reporting trading_i + holding FX_i = V_i * r_end_i - B_i * r_basis_i`.

This transaction-anchored method assigns the price/FX cross term to the trading component. Signed short basis makes currency effects on short liabilities reverse appropriately. Multi-lot matching retains each historical basis/rate contribution, even inside average pools. Carrying/entry/exit/conversion fees are independently translated at their actual charge dates, not absorbed into gross basis FX a second time.

For a marked position, sum its compatible signed tranche values in the native view. For a reporting view, translate each currency component at the pinned mark-time context. A multi-leg trade sums eligible reporting monetary components, not unrelated prices/contracts. Broker manual values must have compatible asset/liability and gross/net definitions before use in a consolidated calculated view.

### Cash FX identity

For each currency, aggregate all eligible economically owned cash buckets once. Let `C_a`, `C_b` be signed native monetary cash balances at interval boundaries; `r_a`, `r_b` are boundary reporting rates; and `delta C_j` are all actual native cash movements inside `(a,b]`, each with event reporting rate `r_j`. Then:

`cash FX[a,b] = C_b * r_b - C_a * r_a - sum(delta C_j * r_j)`.

This is analytical mark-to-market attribution, not a tax realization method for currency lots. It accommodates positive cash, negative margin cash, unsettled monetary receivables/payables, and partial cash usage without inventing an acquisition price. Currency-tax realized/unrealized lot accounting would be a separate future jurisdiction module.

Every movement participates: deposits, withdrawals, principal trades, charges, income, conversions, and account transfers. Settlement/bucket moves cancel when the total cash population is unchanged and the paired movement uses one economic rate context. Translation itself does not post money. Cash FX is distinct from holding FX because trade principal debits/credits remove/add cash at their own historical rates.

A cash identity only produces a valid complete FX result when opening/ending balances, all intervening movements, compatible ownership/bucket definitions, and required rates are present. A reconciliation residual is unexplained variance, not a substitute cash-FX input.

Internal transfers preserve consolidated ownership. A synchronous same-currency transfer has cancelling source/destination movements at one economic/rate context. A delayed transfer needs explicitly supported in-transit monetary ownership/receivable handling so value is counted exactly once between dispatch/receipt; otherwise consolidated NAV for that interval is incomplete. Named ledger control balances are not an in-transit asset by default. Currency-changing transfers include an actual conversion. Account-level flow classifications differ from the consolidated external-flow classification.

For evidenced monetary assets in transit, calculate a separate `transit monetary FX` component with the same signed identity: `T_b*r_b - T_a*r_a - sum(delta T_j*r_j)`. Departure establishes the claim (`+T`) and removes cash (`-C`) at one pinned rate; receipt extinguishes the claim and adds cash at its actual later rate. The combined cash plus transit movement values cancel at each transition. Cash FX alone can omit currency exposure during transit; total monetary FX is cash FX plus this explicit transit component. Controls remain excluded. Display these components separately or disclose the combined population. Other noncash monetary claims need their own supported ownership/movement definition before joining it.

## 10. NAV and the accounting bridge

For a compatible complete snapshot in reporting currency R:

`NAV_R = translated owned cash + signed marked holdings + other supported assets - explicit supported liabilities`.

Unsettled/restricted/in-transit money and derivative marks must use the module's economic ownership rule once. A derivative's full notional is not an asset cost/cash debit by default. Short liabilities are negative marked holdings when this representation is chosen, and must not also be subtracted as another liability. Broker equity, buying power, and margin observations retain their source definitions and freshness; they do not authorize inventing missing calculated balances.

For `(a,b]`, let `E_R` be net external contributions into the requested consolidation scope translated at their dated rates. A complete supported bridge is:

`NAV_b - NAV_a - E_R`

`= trading price/principal change_R + holding FX_R + cash FX_R`

`+ conversion execution difference_R + income_R - actual costs_R`

`+ other explicit supported economic effects_R`.

Other supported effects include the separately calculated transit monetary FX above. It must be included when a transfer spans rates/boundaries; an omitted transit component is missing coverage, not an unexplained trading residual.

Trading change includes realizations and the change in open gross marked profit for the interval under pinned boundary contexts. Holding FX is likewise the interval change plus realizations, not the lifetime FX of every remaining lot indiscriminately added to an arbitrary period. Beginning holdings retain compatible basis/price/FX references; opening holdings without historical basis can still support period performance from compatible opening/ending valuations, but not invented lifetime lot profit. Return-of-capital and other special events require explicit compatible treatment.

Costs include actual commissions, exchange/regulatory fees, borrowing/financing/funding expenses, withholding where the metric defines income gross, and actual conversion charges. Income signs and withholding presentation are explicit. An actual refund is a dated negative expense/positive cash effect linked to its original charge; an accounting correction is a reversal/replacement restatement. Planned costs, inferred spread, hypothetical slippage, and control balances are not extra actual deductions.

The bridge reports any nonzero unmatched difference as a separately named reconciliation variance with missing/contradictory inputs. It cannot claim complete account change when coverage is partial. Preserve valuation/source differences and rounding residuals separately from economic FX/performance. No dashboard is implemented by defining this identity.

### Hand-calculated multi-currency bridge

All amounts/rates below are deliberately simple independent design fixtures. R is EUR; each USD rate is EUR per USD. Both actual conversion principals and explicit charges are booked. Assume immediate settlement and no other activity.

| Event | EUR cash movement | USD cash movement | Event USD→EUR rate |
| --- | --- | --- | --- |
| External EUR funding | `+2000` | — | Not needed |
| Exchange EUR 1,000 for USD 1,100 | `-1000` | `+1100` | `0.90` |
| First conversion fee | `-2` | — | Not needed |
| Exchange EUR 500 for USD 600 | `-500` | `+600` | `0.85` |
| Second conversion fee | `-1` | — | Not needed |
| Buy 10 shares at USD 100 | — | `-1000` | `0.90` |
| Entry commission | — | `-2` | `0.90` |
| Sell 4 shares at USD 120 | — | `+480` | `0.92` |
| Exit commission | — | `-1` | `0.92` |

At end, remaining 6 shares are marked at USD 110 and USD→EUR is `0.95`:

- Native cash: EUR `497`, USD `1177`; remaining gross basis USD `600`; average entry USD `100`.
- Reporting cash: `497 + 1177 * 0.95 = 1615.15`; signed holding value: `660 * 0.95 = 627`; NAV: EUR `2242.15`.
- Gross realized native profit: USD `80`; gross unrealized: USD `60`.
- Realized reporting trading component: `80 * 0.92 = 73.60`; realized holding FX: `400 * (0.92 - 0.90) = 8`.
- Unrealized reporting trading component: `60 * 0.95 = 57`; remaining holding FX: `600 * (0.95 - 0.90) = 30`.
- USD movement value: `1100*0.90 + 600*0.85 - 1000*0.90 - 2*0.90 + 480*0.92 - 1*0.92 = 1038.88`; cash FX: `1177*0.95 - 1038.88 = 79.27`.
- Gross conversion differences: `1100*0.90 - 1000 = -10` and `600*0.85 - 500 = 10`; net `0`.
- Actual reporting costs: conversion fees `3`, entry commission `1.80`, exit commission `0.92`; total `5.72`.
- Bridge: `73.60 + 8 + 57 + 30 + 79.27 + 0 - 5.72 = 242.15 = 2242.15 - 2000`.

For a matched-lot net presentation, USD entry commission `0.8` belongs to the closed 4 shares and `1.2` to the remaining 6. Reporting closed net result including holding FX is `73.60 + 8 - 0.8*0.90 - 1*0.92 = 79.96`; remaining net result including holding FX is `57 + 30 - 1.2*0.90 = 85.92`. Their sum `165.88`, plus cash FX `79.27`, less conversion charges `3`, equals `242.15`. Do not subtract the entry/exit commissions again from that net presentation.

Changing the current USD rate changes a new current mark/cash-FX context, not the recorded entry/exit rates or closed realized result. This fixture must be converted into independent executable tests before these capabilities are enabled.

## 11. Risk and R contracts needed by the financial model

Risk is a plan/scenario, distinct from actual cost/P&L. The original frozen pre-trade risk records amount/currency, method, input/version references, commitment instant, and whether genuinely pre-trade or retrospective. Zero/negative or missing initial risk is not a valid historical R denominator. Scale-ins/additional legs append risk additions instead of overwriting the original.

For a validated ordinary linear stop scenario, adverse stop distance is `d * (p_entry - p_stop)`. It must be positive for a nonzero stop-risk calculation; a stop on the wrong side requires a distinct documented scenario rather than silently clamping to zero. Planned gross loss is `q * M * adverse_distance`; add separately specified estimated entry/exit/carrying costs and translate under the pinned planning-rate context. Stop loss is planned risk, not a guarantee of execution or maximum realized loss.

Sizing selects the greatest valid quantity increment whose verified risk/cost scenario fits the explicitly configured risk budget, respecting eligible inventory/exposure constraints. Fixed and variable estimated fees are explicit inputs; nonlinear/unsupported cost or loss functions require a vetted scenario module/manual initial risk. No hardcoded account capital, risk percentage, leverage, or minimum trade size is introduced.

Historical original-risk R is compatible campaign net result divided by the frozen original-risk amount in the same declared risk currency. Translate each dated numerator component using its reporting context; freeze the denominator's original context. Another display currency may create a separately pinned historical view, not mutate the original risk. Missing required FX/fees yields unavailable R. Supplemental-risk results are separately labeled and never silently replace original-risk R. Completed-campaign R is distinct from provisional open-campaign R; summing R values does not establish a portfolio return.

Account and strategy policies both apply. A strategy cannot relax account restrictions. Period risk/loss evaluations declare timezone/calendar, realized versus realized-plus-unrealized definition, gross/net costs, flow exclusions, data freshness, and version. Only comparable restrictions can be conservatively combined. Missing/stale inputs or unsupported scenarios yield unknown assessments, not pass. Actual activity is still recordable if it breached a policy.

The [domain risk-policy contract](domain-model.md#risk-policy-and-predicate-data-contract) defines all required limit kinds, typed operands/thresholds, denominators, populations, calendars and vetted predicate operators. Daily/weekly policies explicitly select period realized-activity result (gross matched realizations, realized holding FX in reporting views, selected period income, less actual period-charged costs once) or complete marked account change excluding external flows. The first measure is not fee-net campaign/lot realization: expenses follow charge dates rather than lot consumption. The nonnegative loss operand is `max(0, -net_result)`. A period drawdown cap or gross-loss cap is a separate definition. No implicit loss basis or numeric threshold is assumed.

## 12. Performance populations and availability gates

This dictionary defines future consumers of the financial model; it does not authorize dashboard implementation. Every metric selects an explicit account/portfolio/campaign/lot/fill population and eligible complete input set, interval, currency, cost definition, and manifest. Exclusions/sample sizes remain visible. Open/partial/canceled campaigns do not enter completed-campaign outcome metrics.

| Metric | Contract / unavailable cases |
| --- | --- |
| Completed count | Explicitly completed eligible campaigns, not orders/fills/sales. Financially incomplete completed campaigns remain visibly excluded from result metrics. |
| Win/loss/breakeven | Sign of complete net campaign monetary outcome in the requested consistent currency; exact zero is breakeven. A configurable materiality threshold must be a separate versioned definition, never inferred from rounded display. |
| Win rate | Wins / all eligible completed campaigns, including breakevens in the denominator. Empty denominator unavailable. |
| Average win/loss | Arithmetic mean over positive/negative eligible net monetary outcomes, with loss magnitude labeled. Empty component population unavailable. |
| Payoff ratio | Average win / absolute average loss. Missing win/loss populations unavailable. |
| Profit factor | Sum positive outcomes / absolute sum negative outcomes. Positive numerator and zero loss denominator is explicitly unbounded/infinite; no gains and no losses is undefined/unavailable. |
| Monetary expectancy | Arithmetic mean of eligible complete net outcomes; disclose currency and population. It is not account percentage return. |
| R expectancy | Arithmetic mean over the completed campaigns with valid original-risk R; disclose exclusions. |
| Duration/streaks | Explicit campaign lifecycle boundaries; deterministic economic close ordering and ties. Date-only/ambiguous time cannot imply exact seconds. Breakevens break directional win/loss streaks under this version. |
| Turnover | Declared gross traded principal/exposure divided by declared average capital/asset denominator; not a universal fill-count ratio. Requires compatible instrument notional definitions and sufficient denominator observations. |
| Raw NAV change | End NAV minus start NAV, showing external flows separately; not equivalent to performance. |
| TWR | Exact subperiod valuations immediately before/after each external flow, or an explicitly labeled approximation. Compound eligible subperiod returns; never add percentages. |
| MWR | Dated investor-perspective external flows and terminal NAV with explicitly declared day count; valid-root policy required. No solution/multiple admissible solutions produces unavailable/ambiguous, not a conveniently selected value. |
| Drawdown | Peak-to-trough of the declared raw-NAV or flow-adjusted series, with series/currency/frequency. Zero/negative peaks cannot support an ordinary percentage drawdown formula. Deposit growth cannot masquerade as performance recovery. |
| MAE/MFE | Declared signed position/campaign excursion method, sufficient price paths or explicit observations, interval/resolution/coverage. Fill prices alone are insufficient. |
| Slippage | Side-aware executed minus recorded reference price with matching unit/time/source, optionally translated via a validated module. It is diagnostic and not another actual P&L expense. |
| Sharpe/Sortino/benchmark | Optional only with suitable periodic returns, consistent calendar, risk-free/target assumptions, benchmark source, sample-size and annualization definition. |

For TWR, define subperiods `(t_{k-1}^+,t_k^-)` containing no external flow, with positive eligible capital: `return_k = NAV(t_k^-)/NAV(t_{k-1}^+) - 1`; `TWR = product(1 + return_k) - 1`. A flow establishes `NAV(t_k^+) = NAV(t_k^-) + external_flow_k`. Internal transfers vanish only in their complete consolidation scope. Beginning/ending observations lacking flow-time valuations cannot claim exact TWR. A future Modified Dietz/other approximation must have its own version and sufficiency constraints.

For dated MWR, investor contributions are negative and withdrawals/final liquidation value positive. Under a declared ACT/365-fixed convention solve `sum(CF_i / (1+r)^((date_i-date_0)/365)) = 0` over `r > -1`. Distinct same-date flows can aggregate without changing meaning. The numerical method needs bounded convergence/residual tolerances and an admissible-root search contract before activation; near-singular results and multiple roots remain unavailable/ambiguous. No arbitrary root or fixed fallback zero is allowed.

A flow-adjusted unitized performance series uses positive eligible opening capital, adjusts units for external flow at the event unit value, and leaves unit price unchanged by that flow. Its initial reference index is explicitly dimensionless. Drawdown/recovery on that series describes performance; raw NAV drawdown is a separate money/wealth analysis. Strategy drawdown can use a declared cumulative attributed realized-P&L series; it must not be advertised as account NAV/TWR without complete strategy capital allocations/valuations.

## 13. Instrument modules and irreversible gates

Every named family remains recordable, but each operation declares validated native, explicit broker/manual-valued, or unsupported automatic capability. The instrument registry and support matrix own subtype metadata and capability eligibility; this document does not enable a formula from an asset-family name alone.

- Futures variation margin, option premiums/exercise/assignment, linear/inverse perpetual settlement/funding, clean/dirty bond prices and accrued interest, leveraged OTC collateral, reward basis, and structured-product redemption need separately verified conventions and official/independent fixtures. Their notional is not universally cash principal.
- Broker/manual signed values can support compatible NAV/settlement observations without inventing automatic entry basis or P&L. An unsupported pricing module can still record quantity, source principal/manual settlements, documents, and honest unavailable outputs.
- A historical unit/multiplier change requires immutable metadata and a valid conversion/corporate-action event or reviewed restatement. Old/new units must not silently merge.
- Tax-lot, statutory currency realization, wash-sale, and jurisdictional classifications are outside this analytical contract unless separately validated.
- FX source priorities/freshness/calendars, unsupported automatic subtype conventions, a reopened-campaign statistical policy, and optional exact/approximate return solver activation require their feature-specific decisions/fixtures. They do not justify guesses or block the recording/manual fallback model.

## 14. Required financial verification before implementation acceptance

The [financial acceptance fixtures](financial-fixtures.md) define independent expected values and their acceptance mappings. At minimum, the future harness must prove:

1. Decimal lexical/storage boundaries, HALF_EVEN ties, round trips, overflow rejection, and chart-number isolation.
2. Every currency/event balances; cash/fee/effect identities are conserved; settlement changes buckets without changing owned total.
3. Partial fills, scaling in/out, fractional quantities, multiple accounts, FIFO/eligible average/specific matching, both zero-crossing directions, and unknown opening basis.
4. Long/short gross/net results, third-currency fees, borrowing/funding charges, costs attached once, and exact final remainder consumption.
5. Shared fills across ideas, unassigned residuals, distinct campaign/account attribution, and concurrent allocation/lot-consumption protection.
6. The complete EUR/USD bridge above; cash FX with negative balances, conversion execution difference, transfers, fees, missing rates, historical immutability, and changing reporting views.
7. Corporate-action/holding-transfer lineage and settlement handling per declared capabilities; unsupported products cannot accidentally use the linear module.
8. Corrections resolve effective source facts before inventory replay: a bookkeeping reversal is not a new economic sale/cover; stale projection publication cannot override a newer revision.
9. Complete/incomplete metric populations, genuine zero versus missing data, unavailable/infinite ratios, valid original R, cash-flow neutrality, and performance data sufficiency.
10. Rebuild/backup restore reproduces values under identical source/calculation versions; unsupported manifests block recomputation honestly.

Unit fixtures must use independent hand/official expectations, not expected values generated by the implementation being tested. Property tests check conservation/ordering/replay invariants. Real PostgreSQL integration tests check constraints, atomic rollback, concurrent mutation, precision before coercion, tenant isolation, idempotency, and source/projection revision handling. Documentation review is the only validation executable in this phase; no test/build pass is claimed for nonexistent application code.
