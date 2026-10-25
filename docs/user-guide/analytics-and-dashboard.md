# Analytics and Dashboard

Use **Dashboard** to review campaign outcomes and find the decisions behind them. Use **Accounts** for actual account wealth, capital flows and conditional account returns. Use **Supplied values** when reviewed source evidence must replace a supported manual analysis component.

Reviewed **25 October 2026** against application commit `5132900a03efabaeb307787531546987228220e7` and Checkpoint 2 documentation commit `3c790c2326bfd38e93698c60e80102a3787d077e`. The workflows below are **Source-reviewed**; retained Phase 18 execution evidence is historical. Current checkpoint verification belongs in [manual verification](verification.md). See the [manual index](README.md), [feature inventory F08 and F13–F15](../feature-inventory.md), [glossary](../reference/glossary.md) and [financial concepts](../reference/financial-concepts.md).

## Before reviewing a report

An owner, editor or viewer with current workspace access can read reports. Recording or correcting a supplied observation requires editor or owner access. These screens query recorded evidence; refreshing them does not obtain live prices, connect a broker or place trades.

Complete [first run](../getting-started/first-run.md), then record the relevant accounts, instrument conventions, actual activity and dated observations. [Financial recording](financial-recording.md) explains source entry; [journaling and reviews](journaling-and-reviews.md) explains completion and original plans. A fill is not automatically a completed campaign. Original committed risk, complete costs, compatible price/FX evidence and accepted closure determine which metrics can be available.

The [financial metric dictionary](../financial-metrics.md) owns metric definitions; [analytics definitions](../analytics-definitions.md) owns campaign populations, grouping and availability. This guide explains how to use those results without maintaining alternative formulas.

## Apply a Dashboard scope

Open **Dashboard** (`/dashboard`) and confirm the workspace. This task answers a scoped question such as “What happened in my paper account last week?”

1. Choose **From**, **Through**, **Reporting currency** and **Environment**. Environment offers **Live accounts** and **Paper accounts**; they remain separate populations.
2. Expand **Portfolio, trade and pricing filters** and select any relevant fields below. If a choice is missing, expand **Search and browse all filter choices**, search that reference collection and browse another bounded page. Selected choices remain available while browsing.
3. Expand **Price and FX coverage policy**. Check the displayed **Source priority** and choose **Maximum price / FX age**: **1 hour**, **24 hours** or **7 days**. This UI displays the source order; it does not provide an editable provider-priority field. Use Accounts when you need its explicit source-priority controls.
4. Select **Apply filters**. Check **Active filters** and wait until all metrics and charts finish updating. Draft field changes alone do not change the displayed report.
5. To remove one applied dimension, select its active filter chip. **Reset filters** restores the initial last-30-days/live scope and clears selections. **Refresh data** re-reads the active scope.

| Field or shortcut                                         | Meaning and validation                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **From**, **Through**                                     | Inclusive calendar dates in the workspace timezone; From must not be later than Through. The UI rejects a period beyond its one-year bound; the contract permits at most 367 elapsed days. DST affects elapsed duration. |
| **Today**, **This week**, **Last week**, **Last 30 days** | Apply a workspace-local period immediately, carrying the other draft selections with it. Weeks begin Monday.                                                                                                             |
| **Reporting currency**                                    | Reporting translation, not an actual cash exchange. Choose an existing currency identity. Missing compatible historical FX remains unavailable.                                                                          |
| **Portfolio version**                                     | One immutable account-membership version, rather than the portfolio's latest name alone.                                                                                                                                 |
| **Account**, **Broker**                                   | Intersect the selected account, broker, portfolio and environment populations. The ordinary selector chooses one account; a multi-account report link can retain its existing selected account set.                      |
| **Strategy**, **Strategy version**                        | Match historical campaign members. Changing Strategy clears the selected version. Select the version actually used when comparing rules over time.                                                                       |
| **Asset**, **Asset class**, **Tag**                       | Match historical campaign membership or recorded review tags. A match retains the whole campaign; it does not allocate part of its result to the matching leg.                                                           |
| **Maximum price / FX age**                                | Historical coverage threshold at each valuation instant. Future observations are excluded; missing/stale evidence does not become zero.                                                                                  |

Different dimensions intersect. Where an existing report contains several choices within one dimension, those choices combine with OR. A mixed campaign may match one asset yet retain all its economics and original risk. An empty account intersection reports **No accounts match these filters**. No accounts or reporting currencies produces **Your performance starts with financial records**, with setup/import links.

The URL retains applied fields and selected view. It does not freeze every future financial or journal change. Open **Definitions and coverage** to inspect **Financial generation**, metadata cutoff and definition version for the returned report. Financial source revision and journal metadata cutoff are distinct. The API supports explicit historical pins; the Dashboard form does not expose a revision-entry field.

**Fictional example:** choose a paper account named `Practice shares`, USD and `2026-10-01` through `2026-10-07`. Assume two fully evidenced completed campaigns close in that period at net `20 USD` and `−10 USD`, both with original committed risk `10 USD`, and no other completed candidates. Expected cards are closed net `10 USD`, win rate `50%`, profit factor `2` and average `0.5 R`. These values follow the [canonical definitions](../analytics-definitions.md); each card should disclose its two eligible campaigns. An unrelated open campaign belongs in **Open net P&L**, not the completed win-rate denominator.

Common mistakes are reading unapplied drafts, combining live and paper expectations, treating a deposit as a winning campaign, and interpreting an entirely excluded population as zero. After a rejected date change, the UI explicitly states that the previous active filters remain displayed. A loading or failed new query must not be interpreted as a new successful report; use **Try again** after correcting the scope or session.

## Read cards, populations and coverage

The four main cards are **Closed net P&L**, **Win rate**, **Profit factor** and **Average R**. Open each **About …** disclosure before interpreting its eligible/excluded counts. Select a card to show its eligible supporting campaigns.

| Display                            | Read it as                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Closed net P&L**                 | Fee-net completed-campaign outcomes in the close-date cohort. Actual attributed fees are charged once.                                       |
| **Win rate**                       | Eligible completed net outcomes; exact breakevens remain in the denominator. Open activity is excluded.                                      |
| **Profit factor**                  | A ratio of completed gains to loss magnitude. Gains without losses display `∞`; no gains and no losses is unavailable.                       |
| **Average R**                      | The eligible original-risk sample. Missing, retrospective or incompatible original risk excludes R even when monetary P&L is known.          |
| Completed / open / excluded counts | Different lifecycle/coverage populations. A flat campaign awaiting completion is not automatically an eligible completed outcome.            |
| **Open net P&L**                   | Lifetime attributed economics at the ending date, possibly from positions opened before From. It is not period account return.               |
| **Attributed fees**                | Charges belonging to the selected campaign population; account income, taxes or unassigned expenses are not silently assigned to a strategy. |

**Unavailable** means the calculation lacks sufficient compatible evidence or a defined sample. It does not mean a loss or numeric zero. `partial` results retain a known subtotal without claiming a complete total; an infinite ratio has its own mathematical meaning. Read **Coverage** in Supporting trades and open the linked journal to resolve missing chronology, costs, closure or original risk. Full metric availability rules, including gross/net, realized/unrealized, expectancy, streaks and holding duration, remain in [analytics definitions](../analytics-definitions.md) and [financial metrics](../financial-metrics.md). The browser does not expose every analytics API metric as a separate card.

## Explore every Dashboard view

All three views use the applied scope. Select **Performance**, **Distributions** or **Breakdowns**. Keyboard users can focus a tab and use Left/Right arrows, Home or End. Chart axes state their units; open **View data · … observations** to inspect exact decimal values rather than rounded plot coordinates. Where a row supports campaigns, select **Review … trades** in its table.

### Performance

1. Select **Account equity** for **Equity curve**, or **Capital-adjusted performance** for **Capital-adjusted monetary performance**. Inspect the data table's economic instants and price/FX observation counts. The current UI requests seven uniformly spaced samples; gaps remain gaps.
2. Review **Cumulative closed P&L** and **Drawdown**. These follow completed campaign outcomes in economic close order and show monetary campaign drawdown, not account NAV drawdown or percentage return.
3. In **Calendar performance**, use **Previous month** and **Next month** within the applied period. Select a populated day to inspect its completed campaigns, including excluded members. Blank dates mean no closed activity. An unavailable day or unknown close chronology means incomplete coverage.
4. Review **Performance over time** for monthly completed net outcomes. Select a bar or its data-table action to inspect supporting campaigns. A partial bucket is not plotted as a complete total.

Account equity includes funding; capital-adjusted monetary performance removes net capital flows from the account change. Neither this adjusted money chart nor cumulative campaign P&L is TWR/MWR. Strategy/version, asset/class or tag filters make account equity and allocation unavailable because the model has no valid account-capital attribution for those dimensions. Clear those trade filters to restore account accounting. More than ten accounts also makes synchronous Dashboard account history unavailable; narrow the account scope. Campaign analytics can remain usable.

**Fictional example:** the two completed outcomes above produce cumulative campaign P&L `20`, then `10`, with monetary drawdown `10` after the second outcome. A `1000 USD` deposit is absent from that curve but increases raw account equity. Do not diagnose a mismatch until populations, costs and account cash effects have been compared.

### Distributions

1. Open **Distributions** and inspect **P&L distribution**, **R distribution** and **Win/loss distribution**.
2. Expand each data table to see exact bin boundaries/counts. Select a bar or **Review … trades** to investigate a sample.
3. Read exclusions separately for P&L and R. A campaign may contribute to P&L while lacking original risk for R.

P&L/R distributions use eligible completed campaigns. The engine builds up to six equal-width decimal bins, collapses duplicate boundaries and uses one bin for identical values. Bins include their lower boundary and exclude their upper boundary, except the final bin includes its upper boundary. Win/loss/breakeven uses exact net sign. The fictional `20` and `−10` outcomes produce one winner and one loser; if the second campaign lacks committed original risk, the R distribution contains only the first. Do not infer risk from size or force an excluded R to zero.

### Breakdowns

1. Open **Breakdowns** and inspect **Strategy performance**, **Asset performance** and **Account allocation**.
2. Select an ordinary strategy/asset bar, or its table action, to apply that shared cross-filter. Choosing a strategy also clears the previous strategy-version filter. Use the active chip to remove it.
3. Select a mixed/unknown group to drill into supporting trades instead. A multi-asset or multi-strategy campaign is counted once in its mixed group; it is not split into invented fractional results.
4. Review **Account allocation** only with account-level filters. Signed cash plus holdings appears per account; **Owned transfers in transit** appears separately. These money values are not allocation percentages.

Strategy and asset groups include completed plus open lifetime campaign P&L, so their totals must not be compared with a closed-only card as if their populations were identical. For example, a fictional open campaign at `5 USD` can make a group `15 USD` while the closed net card remains `10 USD`. Grouping semantics and additional API dimensions are defined in [analytics definitions](../analytics-definitions.md).

### Find and review supporting trades

After selecting a card, populated calendar day or chart table action, the page scrolls to **Supporting trades**. Enter a title in **Search supporting trades**, use **Previous**/**Next** for 25 rows per page, then select the trade title to open its persistent journal detail. Search and pagination change the visible list without recalculating the report. **Show all filtered trades** removes a drill selection while retaining the active report filters. Column and private saved-view controls are explained in [settings and navigation](settings-and-navigation.md).

If no rows match, clear the title search or drill selection before widening financial filters. **Review trade notes** opens the journal, while **Review account performance** opens Accounts with the account/date/currency/environment scope. Trade-specific strategy, asset and tag filters do not become account-capital attribution in that report.

## Calculate raw NAV and flow-adjusted account returns

Use this task for “How did the selected account capital perform after funding?” All current workspace roles may calculate this read-only series. First apply the required Accounts scope, currency, dates and price/FX policy as described in [accounts and portfolios](accounts-and-portfolios.md). Complete opening/closing valuations and dated capital flows are prerequisites; optional timestamps add samples, not supplied balances.

1. Open **Accounts** directly or select **Review account performance** on Dashboard. Verify the account/portfolio selection and select **Apply report settings**.
2. Find **Account NAV and flow-adjusted returns**. Optionally enter **Additional valuation timestamps, one ISO timestamp per line** using explicit-offset ISO instants strictly inside the applied period. Leave empty to use automatically required boundaries.
3. Select **Calculate account series**. Inspect the returned **Source revision**, each availability reason and the exact data tables for **Raw account NAV** and **Flow-adjusted account performance**.
4. Read **Time-weighted return (period)**, **Money-weighted return (annualized ACT/365)**, **Maximum unitized drawdown (sampled boundaries)** and **Observed recovery duration** with their stated units.

| Result/input          | Interpretation and validation                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Additional timestamps | At most 24; the server automatically includes every capital-flow boundary and permits at most 32 total required/sample instants. If the period has too many boundaries, choose a shorter period. |
| Raw NAV               | Account net asset value including contributions. A rising balance alone does not establish positive return.                                                                                      |
| Flow-adjusted series  | Unit index begins at 100; contributions and transfers crossing the selected scope do not create investment gains or recovery. Transfers inside a consolidated owned scope cancel.                |
| TWR                   | A period decimal ratio, conditional on complete positive capital and valuation/flow evidence at every subperiod boundary.                                                                        |
| MWR                   | An annualized ACT/365 decimal ratio requiring complete opening/ending NAV and dated flows plus a proven unique supported solution. Intermediate valuation gaps alone need not block MWR.         |
| Drawdown/recovery     | Based on observed unit-index checkpoints. Recovery duration is milliseconds when available, otherwise **Unavailable or still unrecovered**. No continuous intraperiod maximum is claimed.        |

The [account returns and corrections reference](../account-performance-and-corrections.md) owns formulas, solver bounds and timing rules. Same-instant capital flow and income/cost/trade activity can cause `ambiguous_flow_ordering`. Nonpositive capital, missing FX/marks, ambiguous roots or overflow produce explained unavailability. Available raw NAV can remain visible when the adjusted series breaks. A decimal ratio `0.1` means 10%; it is not `0.1 USD` or `10 R`.

**Fictional example with independent fixture:** complete no-flow valuations of `100 USD` at `2025-01-01T00:00:00.000001Z` and `110 USD` one year later yield TWR and MWR `0.1`, unit index `100 → 110` and sampled maximum drawdown `0`. [Return unit tests](../../tests/unit/account-performance.test.ts) retain this exact case. In the separate fixture `100 → 80 → 180` with a `100` contribution at the last boundary, the unit index remains `100 → 80 → 80`; sampled drawdown is `−0.2`, with no observed recovery. Supply matching valuations and flow evidence before expecting those results; the UI accepts timestamps, not these example balances.

Historical reversals of income, tax, expense or owned transfers restate reports at a newer financial revision while earlier pinned reports retain their earlier facts. See the correction workflow in [accounts and portfolios](accounts-and-portfolios.md) and its [canonical correction semantics](../account-performance-and-corrections.md). A genuine later refund is a new dated source, not a historical reversal. Campaign corrections and supplied-source supersession have their own scopes; an account correction does not directly edit a strategy outcome or historical risk denominator.

## Record a reviewed supplied position value

Use **Supplied values** (`/supplied-values`) when an instrument has a **manual** convention and a source provides its remaining value. This records evidence for explicit selection; it posts no cash or fill and enables no automatic derivative pricing. Owners/editors can record; viewers can inspect retained observations and select compatible evidence in read-only reports.

Before starting, have the exact source, currency, observation instant, instrument version and signed holding quantity at that boundary. Record actual cash settlements separately first. A flat quantity cannot have a nonzero residual; record outstanding cash/claims explicitly instead.

1. Open **Supplied values** and wait for the current **Source revision**.
2. In **Component kind**, choose **Position residual equity**. Select **Account** and **Manual instrument version** using their search and Previous/Next reference controls. For retained historical metadata, enter the exact **Instrument version ID** and wait for **Selected convention** to verify it. Native conventions are disabled for this source-valued path.
3. Enter **Signed holding quantity**, positive for long and negative for short. It must equal the recorded source quantity at the observation boundary.
4. Choose **Position value definition**: **Residual contract equity** or **Delivered market value**, then **Accrual treatment**: **No applicable accruals** or **Accruals included only in residual value**.
5. Review the source definition and check every required exclusion: **Ledger cash excluded**, **Collateral balances excluded**, **Settled P&L excluded** and **Unsettled cash claims excluded**.
6. Complete the common source fields below. Select **Review supplied observation**, inspect **Review source and definition** and its exact request, then select **Confirm supplied observation**.
7. Wait for **Supplied observation recorded. Selection ID: …**. Find it in **Retained supplied observations**; recording alone does not select it for analysis.

| Common field                      | Required content                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Value currency**                | The source amount's actual monetary unit, selected from the workspace catalog.                                                            |
| **Supplied amount**               | Exact signed decimal; no invented rounding or notional substitution.                                                                      |
| **Observation timestamp**         | ISO timestamp with `Z` or explicit UTC offset, at most six fractional-second digits. The instrument convention must already be effective. |
| **Source name**                   | Nonempty source name, at most 160 characters.                                                                                             |
| **Source reference and evidence** | Nonempty reviewable reference/definition, at most 4000 characters.                                                                        |
| **Evidence quality**              | **Broker reported** or **Manually verified**; this retained label does not authenticate the source.                                       |

**Fictional example:** after `5 USD` actual settled variation margin, previously `100 USD` cash is `105 USD`. A separately evidenced residual of `7 USD`, excluding that settled cash and matching the actual contract quantity, can establish equity `112 USD` when selected. Do not enter `12` as the residual or post the `7` as a second cash settlement. [Supplied boundary tests](../../tests/integration/supplied-financial-boundaries.test.ts) and the [supplied browser scenario](../../tests/e2e/supplied-values.spec.ts) retain independent coverage. The [supplied-values reference](../supplied-values.md) owns the component definitions.

Missing attestations block review. An invalid/manual convention, quantity mismatch, stale source revision or incompatible correction is rejected. If confirmation is interrupted, keep the reviewed fields frozen and select **Confirm supplied observation** again on the same page; its retained command prevents a second identical observation. **Return to source fields** is unavailable while outcome is unknown. After reload/navigation, inspect history before starting another command.

## Record a reviewed supplied campaign result

Use this task only for a campaign containing a manual-instrument leg, with reviewed net source economics including all relevant costs. It replaces a compatible campaign result, rather than adding a second P&L or cash effect.

1. In **Supplied values**, choose **Campaign net result** under **Component kind**.
2. Search/select **Campaign**. Choose **Campaign result definition**: **Lifetime total net result** or **Completed realized net result**. The latter requires a current confirmed closed campaign. The observation cannot precede its execution activity.
3. Check **All relevant campaign costs are included** only after verifying the source. Fill **Value currency**, **Supplied amount**, **Observation timestamp**, **Source name**, **Source reference and evidence** and **Evidence quality** as above.
4. Select **Review supplied observation**, review the exact definition and scope, then **Confirm supplied observation**. Inspect the retained source and selection ID.

**Fictional example:** a source reports a closed manual campaign's complete net result as `−25 USD`, including its fees. Enter `−25` with **Completed realized net result** and the source evidence. Selecting it can provide that compatible net component; it must not cause another `25 USD` ledger withdrawal. Completion, chronology and original-risk sufficiency still control completed-outcome/R eligibility. A supplied result cannot close a campaign or create committed original risk. See [journaling and reviews](journaling-and-reviews.md) for those prerequisites.

## Select, inspect and correct supplied evidence

1. In **Retained supplied observations**, inspect **Component**, **Scope**, **Value**, **Evidence** and **Revision and selection**. The row retains basis revision, recorded revision, selection ID and any superseded source. Use **Previous observations**/**Next observations** for 25-row pages; **Retry observations** retries a failed history read.
2. Select **Review report with this source selected**, then verify the report's period, account and pricing policy; the link does not choose a compatible date for you. Alternatively, in Accounts expand **Price and FX evidence policy → Reviewed supplied position values**, or on Dashboard expand **Portfolio, trade and pricing filters → Price and FX coverage policy → Reviewed supplied campaign results**.
3. Check the intended source, use **Load more supplied sources** when necessary, and apply the report settings/filters. A selected source not in the loaded pages is retained as **Selected source … (load more or clear)**. Clear its checkbox to stop using it. **Retry supplied sources** retries lookup errors.
4. If a source was wrong, return to its history row and select **Correct this observation**. Review the prefilled replacement, amend its value/evidence and reconfirm all exclusions or cost completeness. Review and confirm again. The new source supersedes the original; it does not edit it. **Create independently instead** removes the correction relationship and must only be used for an independent observation.

Selections persist in the report URL. Reports verify tenant, kind, scope, observation boundary/age, financial revision, quantity, supersession and FX. Only one compatible position value may be used for its boundary. A second competing replacement conflicts; reload and correct the current observation. The original remains retained for compatible historical reporting through the API's earlier revision pins. A superseded source is not automatically substituted in an existing report selection.

Later workspace financial changes conservatively invalidate a source basis. New price/FX/account-value observations, other supplied observations and projection refresh requests alone do not invalidate the reviewed economics. On `STALE_SUPPLIED_COMPONENT`, review the current facts and record a newly reviewed observation; on `SUPERSEDED_SUPPLIED_COMPONENT`, select the current source. Do not increase the age allowance to bypass a quantity or revision rejection. Compatible FX is still required for nonzero cross-currency translation. A supplied closing equity value does not establish opening value, native trading/FX decomposition or period return by itself.

## Limits and related tasks

Reports are bounded synchronous queries. Dashboard limits include a 256 KiB request, 4 MiB response, 100 selections per list, 1000 campaign candidates and 500 groups; its catalog browser pages large choice collections. Account histories and return boundaries have the narrower limits above. A scope rejection requires fewer accounts, groups or records, or a shorter interval; it is not evidence of zero performance. Background bulk reporting is unavailable and [FA-04 remains open](../final-audit.md).

Continue with [risk and reconciliation](risk-and-reconciliation.md) for policy monitoring and independent statements, [imports and exports](imports-and-exports.md) for filtered extracts, or the [guided example](guided-example.md) for a synthetic connected workflow.

## Implementation and evidence references

| Subject                                               | Reviewed source and retained acceptance coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard filters, tabs, charts and supporting trades | [Dashboard UI](../../apps/web/src/components/dashboard/dashboard-workspace.tsx), [chart/table UI](../../apps/web/src/components/dashboard/dashboard-chart.tsx), [calendar](../../apps/web/src/components/dashboard/dashboard-calendar.tsx), [catalog browser](../../apps/web/src/components/dashboard/dashboard-catalog-browser.tsx), [service](../../packages/server/src/dashboard/service.ts), [contracts](../../packages/contracts/src/dashboard.ts), [UI tests](../../tests/ui/dashboard.test.tsx), [integration](../../tests/integration/dashboard.test.ts), [browser](../../tests/e2e/dashboard.spec.ts). |
| Campaign populations and calculations                 | [Analytics service](../../packages/server/src/analytics/service.ts), [cohort selection](../../packages/server/src/analytics/cohort.ts), [kernel](../../packages/domain/src/analytics.ts), [contracts](../../packages/contracts/src/analytics.ts), [independent fixtures](../../tests/integration/analytics-independent-fixtures.test.ts).                                                                                                                                                                                                                                                                       |
| Account series and correction scope                   | [Return UI](../../apps/web/src/components/accounts/account-return-series.tsx), [series service](../../packages/server/src/accounting/performance.ts), [performance kernel](../../packages/domain/src/account-performance.ts), [correction UI](../../apps/web/src/components/accounts/account-corrections.tsx), [unit fixtures](../../tests/unit/account-performance.test.ts), [remediation UI tests](../../tests/ui/account-remediation.test.tsx).                                                                                                                                                              |
| Reviewed sources, correction and selection            | [Supplied UI](../../apps/web/src/components/supplied/supplied-values-workspace.tsx), [picker](../../apps/web/src/components/supplied/supplied-value-picker.tsx), [contracts](../../packages/contracts/src/supplied.ts), [service](../../packages/server/src/supplied/service.ts), [selection checks](../../packages/server/src/supplied/selection.ts), [source UI tests](../../tests/ui/supplied-values.test.tsx), [independent boundaries](../../tests/integration/supplied-financial-boundaries.test.ts).                                                                                                     |

These references establish inspected behavior and retained historical test coverage. They do not claim a freshly executed browser journey or certify production capacity; see [manual verification](verification.md).
