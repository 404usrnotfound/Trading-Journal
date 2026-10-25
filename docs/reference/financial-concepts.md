# Understand financial results

Reviewed on **25 October 2026** for Phase 19, Checkpoint 3, against Checkpoint 2 documentation commit `3c790c2326bfd38e93698c60e80102a3787d077e` and application commit `5132900a03efabaeb307787531546987228220e7`. This guide explains the implemented accounting in trader-facing language. Use the [glossary](glossary.md) for individual terms, the [guided paper example](../user-guide/guided-example.md) for a worked journey, or the [user guide index](../user-guide/README.md) for other tasks.

The canonical definitions remain in [financial metrics](../financial-metrics.md), [portfolio accounting](../portfolio-accounting.md), [analytics definitions](../analytics-definitions.md) and [account returns](../account-performance-and-corrections.md). The broader [calculation design contracts](../financial-calculations.md) describe intended rules; the [feature inventory](../feature-inventory.md) and source establish which operations are delivered.

## Separate instructions, actual activity and your trading idea

An **order** records an instruction. An **execution**, also called a fill, records what actually happened. A **campaign**, called a trade in the Journal, collects the activity and decisions for one idea. A partially filled order can have real inventory even after cancellation; an unfilled order has none.

For example, one idea may buy four shares, add two shares, sell two, then sell the remaining four. That is one campaign with four executions. Select the existing campaign and matching leg when adding its later fills. If every fill creates a new campaign, the Journal cannot infer that they belonged to one idea.

The account's position is actual inventory. A lot retains an opening slice's quantity, principal, costs and acquisition history. When an exit consumes only part of a lot, the rest keeps its remaining basis and costs. Account matching may use FIFO, average cost or specific lots; campaign attribution has its own FIFO sequence. Those two views can realize different amounts at a particular time while preserving the same underlying cash and holdings. See [the account-to-campaign bridge](../financial-metrics.md#campaign-attribution-and-account-bridge).

A flat position means no remaining quantity. Completed-campaign statistics also need accepted closure evidence and satisfied supported obligations. A sell fill, a saved review or a flat position alone does not complete a campaign. Journal actuals can show a known monetary outcome before that campaign enters the Dashboard's completed sample.

## Cash movements tell you what money is owned

A cash bucket holds one currency in one account. Settled, unsettled, restricted and collateral cash remain distinct, but owned cash is counted once across the selected buckets. Settlement moves an existing obligation between buckets; it does not create a second purchase or sale.

Deposits and withdrawals change capital. An account funded with EUR 1,000 has EUR 1,000 more cash, but no EUR 1,000 trading profit. Reviewed opening balances establish starting economics without inventing past returns. Dividends, interest, taxes and fees have their own classifications rather than becoming execution profit.

An owned-account transfer changes where money is held. With both accounts selected, its legs cancel; if the money is travelling, evidenced transit preserves ownership once until actual receipt. With only one endpoint selected, the crossing is a capital movement for that report. The same principle applies to holding transfers, which retain acquisition lineage instead of pretending there was a market sale and repurchase.

The [accounting classifications](../portfolio-accounting.md#events-and-classifications) and [transfer rules](../portfolio-accounting.md#transfers-and-money-in-transit) govern these treatments. A source description saying “transaction” does not determine whether to record an order, execution, cash movement, conversion or charge.

## Actual currency exchange and reporting translation do different jobs

An **actual conversion** spends one currency and receives another. Record the actual gross source amount, actual gross destination amount and each separate fee in its original currency. The actual amounts establish the cash result. A quoted rate does not replace them.

A **reporting translation** expresses existing money in a common unit. Choosing USD reporting for a EUR balance does not exchange the EUR. It requires an eligible dated FX observation and source/freshness policy. Account base currency and the workspace's reporting preference do not manufacture that observation.

An EUR-to-USD rate of `1.25` means USD 1.25 per EUR 1. A conversion of EUR 800 into USD 1,000 has that same gross exchange relationship, but the conversion is still not automatically a reporting-rate observation. In the guided example, a separate synthetic EUR-to-USD observation supports translation. A USD 2 conversion fee reduces destination cash to USD 998.

Historical purchases, exits, charges, cash movements and valuation boundaries use their required rate contexts. Changing a current mark or rate does not silently rewrite pinned historical inputs. Missing or stale FX can leave native quantities and money available while reporting totals remain incomplete. See [reporting currency and FX](../financial-metrics.md#reporting-currency-and-fx).

## Read gross, net, realized and unrealized together

**Gross** trading P&L compares actual exit or marked value with compatible principal basis, before charges. **Net** P&L subtracts actual attributed entry, exit and carrying charges once. For ordinary delivered shares, average entry price weights the remaining lots' compatible original quoted prices, from fills or reviewed opening-lot inputs, and excludes charges. Missing original quoted prices leave that measure unavailable even when principal basis is known. Gross basis uses retained booked principal from fills or reviewed openings; net basis also includes the remaining assigned charges. These economic measures do not certify tax treatment. The Journal’s **Actual entry** and **Actual exit** instead weight all effective allocated entry/exit fills; those historical fill averages remain available after closure. They are not the remaining inventory’s average entry or net basis per unit.

**Realized** P&L belongs to the portion matched to an actual exit. **Unrealized** P&L belongs to the remaining marked holding. A current price can establish holding value even if historical basis is unknown; it cannot establish an unknown profit.

Fees are already cash expenses when charged. Lot and campaign partitions explain which part of an original charge belongs to a closed or open slice. They do not create new expenses. Do not subtract the fee again from a net result or from NAV. A positive fee is a charge and a negative fee is a rebate.

In the [guided example](../user-guide/guided-example.md), selling two shares from the initial four-share lot consumes half its USD 1 entry fee. Its USD 40 gross realization becomes USD 38.50 net after that USD 0.50 share of the entry fee and the USD 1 exit fee. The final exit consumes the remaining costs. All four fills together produce USD 80 gross and USD 76 net campaign P&L. The separate USD 2 conversion fee also affects account performance.

The formulas and cost partitions are defined in [inventory and native results](../financial-metrics.md#inventory-and-native-results). Costs in another currency need their own eligible translations before a scalar net result can be available. An incomplete fee history is not evidence of zero fees.

## Equity measures ownership; performance removes capital flows

In the implemented account report, **equity**, **NAV** and **net liquidation value** use translated owned cash, signed supported marked holdings and evidenced owned monetary transit. Net liquidation value does not estimate unrecorded future sale commissions. Margin, buying power and broker account-value observations retain their separate definitions; they do not automatically replace or add to calculated equity.

The account report explains the change between its opening and closing equity after removing net capital flows. Its bridge separates gross trading, holding/cash/transit FX, actual conversion effects, income, fees, expenses and taxes. The canonical [reconciliation equation](../portfolio-accounting.md#reconciliation-equation) defines these components and their signs.

A complete equity total does not guarantee a complete explanation of profit. For example, known current holdings and cash can support NAV while missing acquisition basis blocks the trading-versus-holding-FX decomposition. A known subtotal must retain its partial label. An unexplained difference remains reconciliation variance; the application does not rename it trading profit or FX.

Campaign P&L answers a different question from account performance. A campaign describes conserved activity assigned to an idea; an account report also includes its funding, income, account costs and currency effects. In the guided example, USD 76 net campaign P&L and USD 74 account performance agree after the separate USD 2 conversion fee. Their difference is explained, not another charge to deduct twice.

## R measures the result relative to original risk

Historical R compares a complete campaign net outcome with the positive original risk amount in the same original risk currency. The original plan must have been genuinely committed before the earliest effective fill. A stop or risk budget describes the plan; it does not guarantee the maximum eventual loss.

Missing risk, a late plan, zero risk, unresolved costs or incompatible FX leave R unavailable. Editing a draft after the trade, publishing another plan or adding supplemental risk cannot replace the original denominator. A campaign can therefore have available money P&L and unavailable R. The guided example deliberately has no pre-trade risk commitment and does not infer an R value.

The Journal shows the original commitment and reason when R is unavailable. [Analytics definitions](../analytics-definitions.md#monetary-definitions-and-costs) own `original-risk-r/1` and the R sample. Average R, expectancy in R and cumulative R use that eligible sample; cumulative R is not portfolio return.

## Expectancy and profit factor describe a selected completed sample

Monetary **expectancy** is average net P&L per eligible completed campaign. An empty completed sample has no mean. Expectancy in R uses the separate campaigns with eligible original risk, so always inspect its sample and exclusions.

**Profit factor** compares total positive completed net outcomes with the magnitude of total negative completed outcomes. All winners produce an explicitly infinite result; all losers produce zero; all breakevens leave the ratio undefined. These cases must not be displayed as the same state. Breakevens remain in the denominator for win and loss rates, which can therefore add to less than 100%.

Open and partially closed campaigns can contribute supported marked money results without entering completed win/loss, expectancy or R samples. The selected account/date scope and complete multi-leg campaign coverage matter. [Analytics populations](../analytics-definitions.md#context-and-populations) and [monetary definitions](../analytics-definitions.md#monetary-definitions-and-costs) specify the exact membership rules. These statistics describe recorded observations, not promised future profits.

## Compare the right drawdown and return series

The Dashboard's campaign drawdown is a monetary decline from a prior peak of cumulative completed net campaign P&L. Its curve starts at zero and excludes capital flows. It is not a percentage decline in account equity. Missing outcomes or chronology prevent a complete curve rather than connecting across unknown results.

Accounts provides separate **raw NAV** and **flow-adjusted** series. Raw NAV shows actual equity, so a deposit raises it. The adjusted series removes capital-flow effects using supported valuations at required boundaries and starts its unit index at 100. A deposit cannot create adjusted performance or recover a loss.

Time-weighted return (**TWR**) chains subperiod growth after separating flows. Money-weighted return (**MWR**) uses dated investor cash flows and is annualized under ACT/365. These returns are conditional on sufficient evidence and defined mathematics; for example, TWR needs positive capital and unambiguous flow timing, while MWR needs a supported unique solution. One missing intermediate valuation may block TWR while MWR remains independently available.

Account drawdown and recovery use observed points in the unit index. They do not claim to detect an unobserved intraperiod low. Recovery duration remains absent while an episode is unrecovered or unavailable. See [campaign drawdown](../analytics-definitions.md#drawdown-recovery-ordering-and-duration) and [account series and return definitions](../account-performance-and-corrections.md#account-series-and-return-definitions) before comparing these charts. Do not add campaign percentages or R multiples to obtain an account return.

## Treat unavailable results as useful information

Read the reason beside an incomplete metric. Correct the missing source evidence or narrow the report scope; do not replace it with zero.

| Situation                                 | What can still be known                               | What remains incomplete                                     |
| ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Known quantity, missing acquisition basis | Quantity and a compatible current marked value        | Affected realized/unrealized profit and basis               |
| Missing or stale price observation        | Native cash and supported quantities                  | Affected holding value, full equity and dependent metrics   |
| Missing reporting FX                      | Native balances and supported native gross results    | Affected reporting components and totals                    |
| Costs not confirmed complete              | Supported gross result                                | Complete net outcome and dependent R/statistics             |
| No original pre-trade risk                | Complete monetary outcome when its other inputs exist | Original-risk R and its sample contribution                 |
| Flat campaign without accepted closure    | Supported realized monetary outcome                   | Completed-campaign sample membership                        |
| Unsupported instrument economics          | Recorded actual source cash/quantity as applicable    | Automatic basis, settlement or valuation for that operation |

Availability codes vary by report contract. The Journal, for example, explains `missing_original_commitment`, `original_plan_missing`, `missing_fx` and `closure_review_required`; inventory can explain `unknown_basis`, `incomplete_costs` and `closed_position`. These codes describe different conditions. A closed position's average entry can be unavailable even when its proven remaining quantity and marked holding value are zero. [Financial metrics](../financial-metrics.md#result-context-and-availability) owns the precise availability contracts.

For advanced assets, consult the [asset-class audit](../asset-class-audit.md) before assuming automatic support. Native ordinary delivered shares/ETFs and eligible non-rebasing spot crypto have specific metadata gates. Native securities shorts need additional conventions. Manual actual recording and explicitly selected [supplied components](../supplied-values.md) do not turn unsupported derivatives into native pricing or settlement modules.

## Source review and evidence

This explanation was source-reviewed against `processFill` and `recomputeMatch` in the [inventory kernel](../../packages/domain/src/inventory.ts), `calculateAccounting` in the [accounting kernel](../../packages/domain/src/accounting.ts), `calculateAnalytics` in the [analytics kernel](../../packages/domain/src/analytics.ts), the [account return kernel](../../packages/domain/src/account-performance.ts), and the [Journal financial display](../../apps/web/src/components/journal/journal-financial.tsx). The [financial contract](../../packages/contracts/src/financial.ts) distinguishes conversions, observations, allocations and explicit campaign closure.

Independent calculation fixtures and retained execution scope are linked from [financial fixtures](../financial-fixtures.md), [financial metrics](../financial-metrics.md), [analytics definitions](../analytics-definitions.md) and the [feature inventory](../feature-inventory.md). The [guided example](../user-guide/guided-example.md) records this checkpoint's practical verification and its limits; source review alone is not fresh execution evidence.
