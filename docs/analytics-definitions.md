# Analytics definitions

Phase 8 implements deterministic campaign analytics on the approved ledger, journal and accounting foundations. Every returned metric has a versioned definition, unit, sample size, eligible/excluded campaign IDs, availability and source dependencies. A consumer may display a calculated value only when its state is `available`; `infinite` is an explicit mathematical state, and `partial`/`unavailable` have no complete numeric value. Tests must establish the definition before a metric is exposed.

## Context and populations

This endpoint analyzes **campaign attribution**, the decision/review unit called a Trade. It does not substitute campaign totals for account-lot realization, account NAV, portfolio return or broker statements. Use the [portfolio/accounting API](portfolio-accounting.md) for actual account cash, marked ownership, external flows and its reconciliation bridge.

An explicit request selects account IDs, reporting currency, economic interval `(from,to]`, financial source revision, observation source/freshness policies and an IANA timezone. `to` is also the valuation instant. Source revision defaults to the coherent current revision; a future revision is invalid. Journal/strategy metadata has a separate recorded-time cutoff, `metadataAsOf`, defaulting to the transaction's recorded time. The receipt captures immutable journal revision/plan/strategy version IDs and hashes. Financial revision alone does not version review tags or notes. Labels on stable catalog IDs describe the read snapshot; this API does not archive historical report bytes.

Facts, both kinds of history and policies are read in one tenant-scoped read-only repeatable-read transaction. Effective allocations, costs and source corrections honor the requested revision and economic cutoff. A later recorded correction can restate an earlier economic event in a new financial generation; a pinned earlier revision retains its prior facts. Price and FX observations honor revision, source priority, freshness and their actual observed times. Future observations never value an earlier instant. Existing compatible historical source pins remain historical inputs; another reporting currency is an explicitly selected view. Conversion principal is not a universal reference FX observation.

The report contains three separate summaries:

| Summary         | Money population                                                                         | Outcome/risk population                      |
| --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `summary`       | Selected completed campaigns plus actual open/in-progress campaign economics as of `to`  | Eligible explicitly completed campaigns only |
| `completedOnly` | Selected completed campaigns, retaining excluded candidates as missing-evidence blockers | Same eligible completed population           |
| `openOnly`      | Actual open/in-progress campaigns at `to`                                                | No completed outcomes                        |

A completed campaign needs accepted closure evidence, actual effective assigned activity, flat campaign quantity and compatible settled obligations at the cutoff. Its final effective allocated execution economic time selects the `(from,to]` cohort. Human review/closure confirmation does not become its exit price or economic holding duration. Archived historical completions remain eligible. No-fill/canceled campaigns have no effective allocated activity and do not enter the report. Stale closure, partial scope and unsupported/incomplete inventory retain explicit explanations and cannot establish a completed outcome.

Actual open exposure at `to` can originate before `from`; its monetary metrics describe lifetime attributed economics at that valuation instant. A flat campaign awaiting explicit completion can retain its known monetary result when its final activity belongs to the interval, while remaining outside completed statistics. Therefore the combined monetary summary is **not period account performance**. Closed campaigns outside the close cohort are omitted. A multi-account campaign requires its complete leg-account scope for whole-campaign statistics; a selected subset cannot inherit the full campaign's risk/outcome.

Money metrics preserve independently known gross/net inputs. Missing monetary inputs make the aggregate partial/unavailable and retain a known subtotal. Ratios and means use their explicitly named eligible sample, disclose exclusions and never pretend an excluded result was zero. Unknown completed outcomes prevent a complete drawdown/recovery or streak claim; removing them must not join formerly nonadjacent results. Excluded candidates also remain in `completedOnly` as blockers rather than turning an excluded-only scope into complete zero. An excluded candidate with an unknown close conservatively blocks complete chronology, even if a partial account scope might ultimately prove it open. A fully known empty money population is zero, but empty rates, means, R samples and drawdown are unavailable. An entirely excluded population is not evidence for complete zero.

## Monetary definitions and costs

All authoritative source quantities, prices, money, FX and ratios are decimal strings. Calculations use the isolated 160-digit Decimal.js context and scale-36 HALF_EVEN output boundaries. Source scalars retain the 42-integral/36-significant-fractional-digit envelope. Output overflow yields an explained unavailable value, never clipping or a binary floating-point fallback. JavaScript numbers are used only for bounded counts/calendar fields, not financial arithmetic.

For campaign `i`, write `G_real,i` and `G_open,i` for compatible gross realized/unrealized results, `C_real,i` and `C_open,i` for the independently partitioned original actual costs, and `U_i` for any explicitly unassigned attributed cost remainder. Reporting gross includes the transaction-anchored holding FX component; trading-price-only and accounting cash FX remain separately defined in the [financial dictionary](financial-metrics.md).

`G_i = G_real,i + G_open,i`

`N_i = (G_real,i − C_real,i) + (G_open,i − C_open,i)`, using compatible reporting units and each cost's actual translation context. This equals `net_realized_i + net_unrealized_i`. A nonzero/unresolved `U_i` prevents a complete net result; every included actual cost must be classified and counted once.

Matched/remaining partitions conserve their original charge. Fees are not subtracted again from an already fee-net result. A commission is a positive expense; a rebate is a negative expense. Required cost/FX coverage must be complete for a net outcome. Relevant standalone carrying costs that lack compatible campaign attribution prevent a complete campaign net/R claim; no financing cost is inferred from price movement.

Income, taxes, deposits, withdrawals, actual FX exchanges and owned-account transfers are account-ledger economics, not campaign executions. Unassigned account fees are not silently allocated to strategies, instruments or original risk. Campaign and account accounting are distinct cost/population views; the account bridge charges actual dated expenses once regardless of lot consumption.

Every scalar below uses `definitionId: campaign-analytics/<key>/1`. The reporting currency applies to money metrics; ratios, R, counts and durations are not currency amounts.

| Key                      | Mathematical definition                                                                                | Required sample / unavailable cases                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `grossPnl`               | Sum of `G_i` over the selected monetary population, including eligible marked open results             | Gross basis, actual principal and compatible dated/mark FX; independently available when fees are unknown     |
| `netPnl`                 | Sum of `N_i` over the selected monetary population                                                     | Complete actual attributed costs and compatible FX; no external funding/income/tax added                      |
| `realizedPnl`            | Sum of fee-net matched realized outcomes over the selected monetary population                         | Campaign FIFO attribution, not account FIFO; closed and partially realized open campaigns may contribute      |
| `unrealizedPnl`          | Sum of fee-net remaining marked outcomes at `to`                                                       | Eligible marks, remaining basis/costs and compatible FX; proven-flat inventory is zero without an open mark   |
| `fees`                   | Sum of included original campaign-attributed actual charges translated at their actual charge contexts | Positive charges/negative rebates; count once, retaining fee identities and missing coverage                  |
| `winRate`                | `number(N_i > 0) / n`                                                                                  | `n` complete eligible closed net outcomes, including breakevens; empty sample unavailable                     |
| `lossRate`               | `number(N_i < 0) / n`                                                                                  | Same denominator as win rate; exact zero is a breakeven                                                       |
| `averageWinner`          | `sum(N_i > 0) / number(N_i > 0)`                                                                       | Positive mean monetary winner; no winners unavailable                                                         |
| `averageLoser`           | `abs(sum(N_i < 0)) / number(N_i < 0)`                                                                  | Positive loss magnitude, not a signed profit; no losers unavailable                                           |
| `payoffRatio`            | `averageWinner / averageLoser`                                                                         | Both nonempty win/loss populations with positive loss magnitude                                               |
| `profitFactor`           | `sum(positive N_i) / abs(sum(negative N_i))`                                                           | Gains with no losses: infinite; no gains and no losses: unavailable; entirely losing sample: available zero   |
| `expectancy`             | `sum(N_i) / n`                                                                                         | Arithmetic mean net monetary outcome; empty sample unavailable; not a percentage return                       |
| `expectancyR`            | `sum(R_i) / n_R`                                                                                       | Eligible original-risk R sample only, independently disclosed                                                 |
| `averageR`               | Same arithmetic mean as `expectancyR`                                                                  | Same `n_R`, not a differently weighted measure                                                                |
| `cumulativeR`            | `sum(R_i)`                                                                                             | Nonempty eligible original-risk R sample; not portfolio return and not a sum of percentages                   |
| `averageHoldingDuration` | `sum(exit_microseconds_i − entry_microseconds_i) / (n_D × 1000000)` seconds                            | Explicit effective economic entry and final close, complete chronology and eligible completed duration sample |
| `maximumDrawdown`        | `max_k(P_k − X_k)` on the declared closed-campaign net-P&L curve                                       | Complete ordered closed outcome sequence; monetary depth only                                                 |
| `currentDrawdown`        | `P_last − X_last` on the same curve                                                                    | Ending monetary distance below its historical peak                                                            |
| `longestWinStreak`       | Largest contiguous count of strictly positive completed net outcomes                                   | Breakevens break runs; missing/ambiguous outcomes prevent a complete streak claim                             |
| `longestLossStreak`      | Largest contiguous count of strictly negative completed net outcomes                                   | Same adjacency/coverage rules                                                                                 |
| `currentWinStreak`       | Strictly positive run ending at the last selected closed outcome                                       | Zero if the last known outcome is negative/breakeven; no complete sample unavailable                          |
| `currentLossStreak`      | Strictly negative run ending at the last selected closed outcome                                       | Zero if the last known outcome is positive/breakeven; no complete sample unavailable                          |

Rates are fractions in `[0,1]`; presentation may format them as percentages after receiving the tested ratio. Win rate plus loss rate can be less than 1 because breakevens stay in the denominator. Classification uses the exact net sign, not a rounded display or arbitrary materiality threshold. Open, partially closed and canceled campaigns cannot become wins merely because a fill sold at a gain.

R uses the existing tested `original-risk-r/1` contract. `R_i` is the complete campaign net numerator in the original risk currency divided by the strictly positive original committed risk amount in that same currency. The commitment must precede the earliest actual fill and be explicitly pre-trade. Missing/zero/retrospective risk, later draft/supplemental risk, incomplete costs/FX, stale closure or incompatible units cannot supply a denominator. Another report currency does not rewrite original R. A missing R excludes that campaign from `n_R` while its complete monetary outcome can remain in `n`. If no R is eligible, `cumulativeR` has neither a value nor an invented zero subtotal.

## Drawdown, recovery, ordering and duration

The curve definition is `campaign-cumulative-net-pnl/1`. Set `X_0 = 0` at the report baseline `from`. Order selected completed outcomes by final effective allocated execution time, then lexical campaign ID for exact timestamp ties. This is a documented deterministic attribution ordering, not evidence of intraday broker execution order. Define:

`X_k = sum_{j=1..k}(N_j)`

`P_k = max(0, X_1, ..., X_k)`

`D_k = P_k − X_k`.

Every point retains its campaign ID, economic time, cumulative amount, peak and drawdown. Missing completed outcomes/close times block a complete curve; no zero replacement or stitching across exclusions is permitted. Streaks reset at a known-time missing outcome and may expose a safe known run-length subtotal. Missing/invalid close times also remove that subtotal because adjacency cannot be established. Contributions and transfers never enter this curve. It is not account equity, a unitized return curve, TWR or NAV drawdown.

Recovery describes the **maximum-drawdown episode**. Earliest equal maximum depth selects the episode; the latest equal peak before its first decline establishes its peak instant. The earliest tied trough is retained. Recovery is the first subsequent closed point with `X_k >= episode_peak`. Fields include peak/trough/recovery campaign and time references, exact peak-to-recovery seconds and number of intervening completed outcomes. An unrecovered episode has no recovery timestamp/duration; elapsed seconds are measured from peak to requested `to`. No-drawdown and unavailable states retain null recovery fields. Ending drawdown remains separate: a recovered maximum episode does not imply the current curve is at its peak.

Percentage drawdown is not exposed for this zero-anchored monetary P&L series. Zero/negative peaks do not define an ordinary percentage denominator. Separate account NAV and unitized performance series now provide conditional TWR, ACT/365 MWR and sampled unitized drawdown/recovery through the Accounts screen and accounting performance endpoint. Their input sufficiency, capital-flow timing, unique-root solver bounds and unavailable rules are defined in [Account returns and historical corrections](account-performance-and-corrections.md). Deposits cannot masquerade as recovery. MAE/MFE and optional risk-adjusted annualized ratios remain outside this increment.

Holding duration spans the first effective entry to the final effective close across the campaign's legs. Human review delay, a canceled order's duration or a partially filled order's lifetime is not holding duration. PostgreSQL microseconds are preserved; date-only or ambiguous chronology cannot invent exact seconds. A multi-leg campaign gets one campaign duration rather than a quantity-weighted average of unrelated contracts.

## Grouping definitions

Every requested grouping reruns the same tested summarizer and availability rules on its declared whole-campaign subset. Keys represent stable identities/classifications; labels are presentation. Non-tag groups are mutually exclusive and additive within one dimension: one unique value selects its bucket, no value selects `unknown`, and several values select an explicit `mixed` bucket with its member identities. A multi-leg campaign is never copied wholesale into each account/asset bucket. Mixed and unknown rows are retained in conservation checks.

| Dimension         | Source and key                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strategy`        | Stable strategy identity from the trade's explicit immutable historical version link                                                               |
| `strategyVersion` | Exact version used by the trade, with immutable definition/hash; publishing v2/v3 never reclassifies a v1 trade                                    |
| `asset`           | Stable instrument identity from actual campaign leg/execution versions                                                                             |
| `assetClass`      | Recorded instrument family/capability metadata; never inferred from a symbol                                                                       |
| `broker`          | Selected leg account's broker identity; unset broker remains explicitly unknown                                                                    |
| `account`         | Actual leg account identities; analytical campaign attribution is not cash/NAV accounting                                                          |
| `currency`        | Native settlement monetary-unit identities across the campaign legs; all reported P&L remains in the requested reporting unit                      |
| `direction`       | Actual campaign leg long/short classifications; several directions remain mixed                                                                    |
| `weekday`         | ISO weekday of earliest effective entry in the selected IANA timezone, Monday 1 through Sunday 7                                                   |
| `hour`            | Local hour 0 through 23 of the same entry under that timezone; DST uses the actual UTC instant                                                     |
| `timeframe`       | Recorded original committed/published plan timeframe, without borrowing a later strategy or draft default                                          |
| `setup`           | Composite pinned strategy-version ID and exact setup ID; version-local setup identities cannot merge different historical rules                    |
| `tag`             | Distinct custom tags from the selected immutable journal revision; exact membership, no duplicate campaign within one tag                          |
| `marketCondition` | SHA-256 identity of trimmed, exact recorded manual market-condition text; bounded display label and plan/review provenance; no inferred NLP regime |

Original committed plan metadata takes precedence for planned setup/timeframe/market conditions. If a supported fallback is used, its selected immutable source is disclosed in provenance. Blank/unrecorded metadata stays unknown. Current draft edits cannot rewrite the committed original risk or historical strategy rules. Review metadata can intentionally create a new generation under another `metadataAsOf`, without altering financial facts.

Tag membership overlaps. Tag groups are explicitly `additive: false`; each campaign may belong to several distinct tag groups. Never sum tag P&L, counts or R to claim a portfolio total. Untagged campaigns have an explicit unknown bucket. Non-tag groups expose `additive: true`, and their campaign membership and compatible metric subtotals conserve their parent population. Group-level sample sizes and exclusions remain visible.

## Independent worked example

Five complete campaigns have gross outcomes `[110, -40, 10, 160, -15]` and actual fees `10` each, giving net outcomes `[100, -50, 0, 150, -25]`. Frozen original risk amounts `[100, 50, 100, 50, 50]` give R outcomes `[1, -1, 0, 3, -0.5]`.

| Metric                           | Exact expectation                                  |
| -------------------------------- | -------------------------------------------------- |
| Eligible completed campaigns     | 5; 2 winners, 2 losers, 1 breakeven                |
| Gross / fees / net P&L           | 225 / 50 / 175                                     |
| Win / loss rate                  | 0.4 / 0.4                                          |
| Average winner / loser magnitude | 125 / 37.5                                         |
| Payoff / profit factor           | `10 / 3`, scale-36 output                          |
| Monetary expectancy              | 35                                                 |
| Average R / expectancy in R      | 0.5 / 0.5                                          |
| Cumulative R                     | 2.5                                                |
| Cumulative closed net curve      | `[0, 100, 50, 50, 200, 175]`                       |
| Maximum / ending drawdown        | 50 / 25                                            |
| Maximum episode recovery         | Fourth completed outcome recovers the earlier peak |

All winners produce infinite profit factor and unavailable payoff because no average loser exists. All losers produce profit factor zero, while average winner/payoff remain unavailable. All breakevens produce zero win/loss rates and expectancy but undefined profit factor. No completed sample produces unavailable rates/means/R/drawdown, rather than invented zero. A marked open campaign can contribute independently complete monetary results while adding no completed outcome/R observation.

## API, verification and display contract

`POST /api/v1/workspaces/{workspaceId}/analytics/reports` is a bounded read-only query available to current viewers, editors and owners. It requires a verified session and tenant membership, but no financial mutation, CSRF command or idempotency identity. It writes no financial revision, audit command or outbox intent. Wrong tenants and unsupported scopes cannot access source data. Strict Zod/OpenAPI DTOs reject numeric money/revision shortcuts, duplicate account/dimension selections, invalid timezone/interval and unrecognized formula fields.

Requests and responses are bounded. A query accepts at most 100 distinct accounts and 14 distinct dimensions, with a 256 KiB JSON body. Source selection allows at most 1,000 campaigns and 20,000 legs, plus a combined budget of 50,000 fills, principal/cost allocation weights, fees, unresolved charges, obligations and price/FX observations. Grouping allows at most 500 buckets and 100 distinct values per campaign/dimension. Responses are limited to 4 MiB. Excessive scopes fail explicitly instead of silently omitting records. The [generated OpenAPI contract](../packages/contracts/openapi.json) supplies the exact request/response schemas and source/reference fields.

Only finite `available` values may enter an ordinary metric display. Infinity requires an explicit infinity presentation; null/partial/unavailable values must retain their explanations and sample coverage. Known subtotals must not be labeled complete P&L. Units and sample populations cannot be hidden, and charts cannot convert presentation numbers back into authoritative accounting amounts.

Independent unit/property and real-PostgreSQL fixtures exercise every exposed definition and group, empty/all-win/all-loss/breakeven cases, open/partial exclusions, missing risk/basis/FX/fees, precision/overflow, exact timestamps and DST, cost conservation, fixed strategy versions, original plans, metadata revisions, corrections, tenant isolation and read-only HTTP behavior. Execution evidence and scope limits are recorded in [Phase 8 validation](phase-8-validation.md). No analytics dashboard is introduced by this engine phase.
