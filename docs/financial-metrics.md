# Implemented financial metrics

This dictionary describes the original Phase 4 kernel/API outputs and the implemented extensions linked below. The approved [financial calculation contracts](financial-calculations.md) remain the full semantic authority; [core ledger](core-ledger.md) documents recording, constraints and API usage. [Phase 4 validation](phase-4-validation.md) retains historical checkpoint evidence; [the final audit](final-audit.md) records current remediation and release gates.

## Result context and availability

Inventory results identify `population` (`account-inventory` or `campaign-attribution`), tenant/account/instrument/unit scope, source revision, matching policy/version and calculation manifest. Valuation adds the requested `asOf`, reporting currency, explicit source/freshness policies and selected price/FX dependencies. Available monetary and quantity values are decimal strings computed using Decimal.js 160-digit HALF_EVEN working precision and persisted/output precision `NUMERIC(78,36)`.

Inventory metrics use `{ status, value, reasons, currencyId? }`. `status` is `available`, `unavailable` or `unsupported`; unavailable/unsupported values are `null`. An established zero is `"0"`. Reasons include unknown basis/entry price, incomplete costs, missing charged-currency FX, absent marks, missing historical FX, ambiguous chronology and unsupported conventions. Different results can have different availability: known quantity and current marked value do not establish known lifetime basis or profit. Manual unsupported records can retain available source quantity while automatic basis/P&L is unsupported. A closed position's average entry is unavailable with `closed_position`, while its known remaining quantity/marked value can be zero.

FX selections use `state: "available"|"unavailable"` with explicit reasons/missing references. NAV uses `state: "available"|"partial"|"unavailable"`; a partial result exposes `availableSubtotal`, `availableComponents`, reasons and missing references. The subtotal is never labeled total equity. Non-finite monetary values never enter JSON.

## Inventory and native results

Let `d = +1` for a long lot and `-1` for a short, `q` be positive quantity, `M` the pinned multiplier, `p` actual quote price, and `P` actual booked principal. Native support currently requires ordinary delivered shares/ETFs or non-rebasing spot crypto, multiplier 1 and equal quote/settlement units. Automatic securities shorts additionally require the explicit borrow/carry conventions in the [core ledger guide](core-ledger.md); crypto short/lending wrappers remain unsupported. All formulas use the selected account inventory policy or separately labeled campaign FIFO population.

| Output                             | Definition and required inputs                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openQuantity`                     | Signed net remaining quantity; positive long and negative short. Source quantities and unambiguous ordering are required.                                                                                                   |
| `longQuantity`, `shortQuantity`    | Positive remaining quantity magnitudes in the replayed population. Actual netted account inventory and analytical campaign exposure are different populations.                                                              |
| `averageEntryPrice`                | Remaining theoretical quote notional divided by remaining `q × M`; uses actual quote prices and excludes charges. Unknown entry prices or no open lot make it unavailable. This is not principal basis divided by quantity. |
| `grossBasis`                       | Sum of signed remaining booked principal `d × P`; retained quote notional is separately inspectable on lots. Unknown principal propagates unavailable basis.                                                                |
| `netBasis`                         | Gross basis plus the remaining entry/carrying charges translated into the native unit under their pinned cost context. Incomplete costs or required cost FX make it unavailable.                                            |
| Match `grossPnl` / `realizedGross` | For each matched slice, `d × (exitPrincipal − consumedPrincipal)`; aggregate compatible matches.                                                                                                                            |
| Match `quotePricePnl`              | `d × (exitQuoteNotional − consumedQuoteNotional)`. This isolates price movement from actual settlement principal.                                                                                                           |
| Match `settlementRoundingPnl`      | Booked-principal gross result minus quote-price result. It remains a named difference, not an extra cash event.                                                                                                             |
| Match `netPnl` / `realizedNet`     | Gross matched result less consumed entry, exit and attributed carrying costs, counted once in original charged units or translated with pinned native FX.                                                                   |
| `markedValue`                      | Signed open quantity × compatible mark × multiplier; a short is a negative holding value. A known flat position is zero without needing an open-position mark.                                                              |
| `unrealizedGross`                  | Marked value minus signed remaining gross booked basis. A mark alone cannot resolve unknown basis.                                                                                                                          |
| `unrealizedNet`                    | Unrealized gross less remaining charges once, requiring cost completeness and compatible native cost FX.                                                                                                                    |

Proportional source principal/cost partitions use scale-36 largest remainder with stable IDs and exact final consumption. FIFO consumes eligible chronological lots; average pools compatible economics while retaining lineage; specific matching consumes explicitly named available slices. Zero-crossing fills split between closure and a new opposite lot. Opening observations never invent historical profit. Transferred slices preserve quantity, basis, original costs and acquisition context rather than realizing a sale.

`GET fees` returns signed actual charge totals grouped by original currency. A rebate is a negative expense. These totals are another presentation of the same source costs: do not add campaign and inventory partitions together or subtract fees again from fee-net P&L. Income, deposits and withdrawals have their own ledger classifications and are not fill trading profit.

## Campaign attribution and account bridge

Campaign inventory is FIFO within each campaign leg/account/instrument attribution pool, independently of account FIFO/average/specific matching. An execution's assigned portions plus explicit unassigned residual conserve its quantity and every source fee. Account realization may close an earlier lot that belongs to another idea; campaign realization follows that campaign's attributed entry. The two realized results can therefore differ without changing cash or broker holdings.

The bridge is labeled `population: "account-versus-campaign-attribution"`, `ownership: "attribution-only"`. It exposes quantity, gross-basis and realized-gross differences, basis-attribution difference, remaining counterpart and reconciliation residual, source IDs and opposing-claim flags. A `tradeId` filter limits returned campaign populations; the bridge still compares the account with its complete attribution population. Campaign-only realized totals must not substitute for account realization or portfolio return. Opposing claims represent analytical exposure, not separate simultaneous broker lots in a netted account.

## Reporting currency and FX

For a native-to-reporting rate `r`, direction means one native unit equals `r` reporting units. Historical rates come from pinned observation references on acquisition, realization and costs. Current mark rates come from explicit direct/inverse selection at the requested as-of instant. Same-currency identity is rate 1. Changing a reporting-currency preference does not create observations or rewrite accepted economics.

| Output                            | Definition                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `reportingMarkedValue`            | Signed current holding value × selected mark-context FX.                                         |
| `realizedReportingTradingGross`   | Sum of native matched gross results × each match's pinned realization FX.                        |
| `realizedHoldingFx`               | Sum of `d × consumedPrincipal × (realizationFX − acquisitionFX)`.                                |
| `realizedReportingTradingNet`     | Reporting trading gross less consumed entry/exit/carrying costs at their pinned charge contexts. |
| `realizedReportingNet`            | Reporting trading gross plus realized holding FX, less those costs once.                         |
| `unrealizedReportingTradingGross` | Sum of `d × (remaining marked principal − remaining booked principal) × markFX`.                 |
| `unrealizedHoldingFx`             | Sum of `d × remainingPrincipal × (markFX − acquisitionFX)`.                                      |
| `unrealizedReportingTradingNet`   | Unrealized reporting trading gross less remaining costs at their pinned charge contexts.         |
| `unrealizedReportingNet`          | Unrealized reporting trading gross plus unrealized holding FX, less remaining costs once.        |

Missing acquisition, realization, mark or charged-currency references makes the affected reporting component unavailable; it never implies a zero FX effect. Accepted historical rate values remain pinned even if an observation is later superseded. The result's observation IDs and manifests explain its dependencies.

Actual FX conversion records authoritative source/destination amounts and separate fees. `actualRate = destinationAmount / sourceAmount`; a supplied rounded rate retains source precision and cannot replace those amounts. A supplied inconsistent rate requires reviewed evidence. Reference FX is a valuation input, not another cash conversion.

The pure kernel also provides `cashFx` and `conversionDifference`. For `(a,b]`, cash FX is `endingBalance × endingFX − openingBalance × openingFX − Σ(dated signed movement × movementFX)`, requiring complete native cash reconciliation and compatible boundary/movement rates. Conversion execution difference is `destinationAmount × destinationReferenceFX − sourceAmount × sourceReferenceFX`, excluding separately booked fees. Independent fixtures exercise the full cash/trading/holding-FX bridge and separate cash/transit populations. The Phase 7 [accounting report](portfolio-accounting.md) now exposes the interval cash/holding/transit-FX and performance bridge with immutable portfolio scope and pinned source revision. The older valuation endpoint retains its original as-of restatement contract.

## Cash and NAV

`cash-balances` sums actual cash-target postings by account/currency/bucket, including original, reversal and replacement postings through the requested economic instant and optional source-revision filter. Control balances are excluded. Known empty buckets can report zero. Same-currency synchronous transfers conserve the complete internal scope; settlement reclassifies one existing obligation.

The persisted `valuation` endpoint calculates scoped cash, owned monetary transit and signed supported holdings, translated into one requested reporting unit at one as-of context. It includes settled, unsettled, restricted and collateral cash once. Pending same-currency transfers count once as transit when both their source and destination accounts belong to the selected scope; the transit component ends at the receipt's economic instant and source revision, when destination cash takes its place. Fees already affected cash; they are not deducted again from marked holdings/NAV. Negative short value already represents the holding liability. Broker/manual account-value observations remain separately queryable facts with their source definition, not automatically additive or overriding NAV components.

Valuation and accounting marks may come from another metadata version of the same instrument when quantity units, quote/settlement currencies, multiplier, capability and declared price/settlement/borrowing/rebasing conventions agree. A changed tick or quantity increment alone does not invalidate an otherwise compatible quote, and publishing a convention does not require another fill before its quotes can value existing holdings. Selection still honors the requested instant, freshness, source priority and financial source revision; corrections do not replace observations in an earlier pinned revision. Dependencies retain the selected observation's original identity/version. Historical replay selects its instrument convention from source facts effective in that context rather than a later mutable book projection.

Executions, opening lots and price observations cannot predate the instrument version's effective instant. Manual recording capability accepts signed source quotes, including negative futures prices, without enabling unsupported automatic P&L or NAV formulas. Native linear fills retain their positive-price requirement and native marks reject negative prices. A replay blocked by missing source operands cannot report available zero realized or unrealized results; a proven empty book can still report zero.

When every selected component is available, `nav.value` is the aggregate reporting amount and `roundingResidual` reconciles quantized components to the quantized aggregate. Missing/stale marks, FX or unsupported holdings produce a partial subtotal with component references and reasons. Numeric overflow yields explained unavailable output. No automatic buying power, broker margin, accrued advanced-instrument value or performance return is inferred from this NAV.

Valuation is a read-only repeatable-read, current-source-revision restatement through `asOf`, with `priceDependencies`, `fxDependencies`, inventory source IDs and manifests returned in the receipt. It is not an archived historical report snapshot: rerunning a past instant after accepted corrections can produce a new result. Current `positions` instead expose the per-book source revision of canonical inventory. Retaining calculation versions establishes replay provenance, not a completed export/restore workflow.

Position and campaign-inventory reads reject scopes above 500 holding books with `INVENTORY_SCOPE_TOO_LARGE`; callers must select an account or instrument instead of consuming a silently truncated total. Campaign selection filters the relevant holding books before applying this limit.

## Deferred metrics and evidence

Phase 6 implements frozen original risk and historical R in the [trade journal](trade-journal.md); those are available only with their declared complete campaign/risk inputs.

Implemented extensions include [account/strategy risk assessments and sizing](risk.md), [conditional account returns and sampled drawdown/recovery](account-performance-and-corrections.md), [Dashboard analytics](analytics-definitions.md), [independent statement reconciliation](statement-reconciliation.md), [explicit supplied values](supplied-values.md) and [durable native worker projections](financial-outbox.md). Each retains its documented scope and sufficiency gates. MAE/MFE, slippage analytics, optional ratios/benchmarks and asynchronous bulk-performance reports remain outside these implemented paths. Production capacity remains open under FA-04; a native worker snapshot does not establish bulk-report throughput.

The independent executable fixture suite is in [financial-independent-fixtures.test.ts](../tests/unit/financial-independent-fixtures.test.ts), alongside decimal, inventory, transfer, campaign and valuation unit suites and real-PostgreSQL financial integration suites. Run `corepack pnpm test:unit`, `corepack pnpm test:integration`, `corepack pnpm api:check`, `corepack pnpm lint`, `corepack pnpm typecheck` and `corepack pnpm build` from the repository root using the pinned Node 24/pnpm 10.34.6 toolchain. Consult [Phase 4 validation](phase-4-validation.md) for exact executed counts and outcomes; documentation does not certify unrun workflows.

## Portfolio accounting extension

The [portfolio accounting dictionary and examples](portfolio-accounting.md) define account/portfolio cash, signed holdings, evidenced transit, equity/NLV, gross period trading, income, actual fees/expenses, taxes/refunds, external flows, scope-boundary transfers, opening capital, monetary/holding FX, conversion effects and reconciliation variance. Period costs use their actual charge dates once. Available, partial and unavailable results retain known subtotals and dependency provenance. See [Phase 7 validation](phase-7-validation.md) for executed evidence.

## Campaign analytics extension

[Analytics definitions](analytics-definitions.md) specifies every Phase 8 scalar, group, curve, recovery and eligibility rule. Gross reporting campaign results include holding FX; net results deduct actual attributed costs once. Completed outcomes, open marked economics and account accounting have distinct populations. Missing inputs retain explained availability and samples, and original-risk R never borrows a later draft denominator. See [Phase 8 validation](phase-8-validation.md) for executed evidence.

An evidenced zero execution fee contributes zero in every reporting currency without an FX observation. Nonzero foreign fees still require the corresponding charge-context FX before their reporting amount is available.
