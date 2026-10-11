# Implemented financial metrics

This dictionary describes Phase 4 kernel and API outputs. The approved [financial calculation contracts](financial-calculations.md) remain the full semantic authority; [core ledger](core-ledger.md) documents recording, constraints and API usage. [Phase 4 validation](phase-4-validation.md) distinguishes executed evidence from future acceptance work. No financial dashboard or complete analytics workflow is implemented by this dictionary.

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

The pure kernel also provides `cashFx` and `conversionDifference`. For `(a,b]`, cash FX is `endingBalance × endingFX − openingBalance × openingFX − Σ(dated signed movement × movementFX)`, requiring complete native cash reconciliation and compatible boundary/movement rates. Conversion execution difference is `destinationAmount × destinationReferenceFX − sourceAmount × sourceReferenceFX`, excluding separately booked fees. Independent fixtures exercise the full cash/trading/holding-FX bridge and separate cash/transit populations. The persisted valuation API does not expose a complete interval cash-FX/performance bridge or a delayed-transfer workflow; those pure helpers are not a claim of persisted report support.

## Cash and NAV

`cash-balances` sums actual cash-target postings by account/currency/bucket, including original, reversal and replacement postings through the requested economic instant and optional source-revision filter. Control balances are excluded. Known empty buckets can report zero. Same-currency synchronous transfers conserve the complete internal scope; settlement reclassifies one existing obligation.

The persisted `valuation` endpoint calculates scoped cash plus signed supported holdings, translated into one requested reporting unit at one as-of context. It includes settled, unsettled, restricted and collateral cash once. Fees already affected cash; they are not deducted again from marked holdings/NAV. Negative short value already represents the holding liability. Broker/manual account-value observations remain separately queryable facts with their source definition, not automatically additive or overriding NAV components.

When every selected component is available, `nav.value` is the aggregate reporting amount and `roundingResidual` reconciles quantized components to the quantized aggregate. Missing/stale marks, FX or unsupported holdings produce a partial subtotal with component references and reasons. Numeric overflow yields explained unavailable output. No automatic buying power, broker margin, accrued advanced-instrument value or performance return is inferred from this NAV.

Valuation is a read-only repeatable-read, current-source-revision restatement through `asOf`, with `priceDependencies`, `fxDependencies`, inventory source IDs and manifests returned in the receipt. It is not an archived historical report snapshot: rerunning a past instant after accepted corrections can produce a new result. Current `positions` instead expose the per-book source revision of canonical inventory. Retaining calculation versions establishes replay provenance, not a completed export/restore workflow.

## Deferred metrics and evidence

Frozen original risk/R, account/strategy risk assessments, sizing, completed-trade statistics, TWR/MWR, drawdown/recovery, MAE/MFE, slippage analytics, optional ratios/benchmarks, dashboards and background performance projections remain later-phase capabilities. Their definitions and sufficiency gates remain in [financial-calculations.md](financial-calculations.md); a NAV endpoint or basic campaign closure does not complete them.

The independent executable fixture suite is in [financial-independent-fixtures.test.ts](../tests/unit/financial-independent-fixtures.test.ts), alongside decimal, inventory, transfer, campaign and valuation unit suites and real-PostgreSQL financial integration suites. Run `corepack pnpm test:unit`, `corepack pnpm test:integration`, `corepack pnpm api:check`, `corepack pnpm lint`, `corepack pnpm typecheck` and `corepack pnpm build` from the repository root using the pinned Node 24/pnpm 10.34.6 toolchain. Consult [Phase 4 validation](phase-4-validation.md) for exact executed counts and outcomes; documentation does not certify unrun workflows.
