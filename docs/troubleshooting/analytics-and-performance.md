# Analytics, valuation and performance problems

Reviewed **26 October 2026** for Phase 19 Checkpoint 4 against Checkpoint 3 commit `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2`; application source remains `5132900a03efabaeb307787531546987228220e7`. The checks and resolutions below are **Source-reviewed**. The [verification record](verification.md) distinguishes freshly reproduced failures from historical tests and unexecuted resolution procedures.

Start with [diagnostics](diagnostics.md) to preserve report context and collect sanitized evidence. All report inspection and filter changes below are read-only: an owner, editor or viewer must still have current membership in the selected workspace. Actions marked **State-changing** require the indicated authorized recording workflow. Keep authoritative source history intact. The [analytics manual](../user-guide/analytics-and-dashboard.md) owns normal browser procedures; [analytics definitions](../analytics-definitions.md), [financial metrics](../financial-metrics.md) and [account performance](../account-performance-and-corrections.md) own calculations.

## Dashboard is empty or differs from a journal or another report

**Problem:** A campaign or expected total is absent from the applied report.

**Symptoms:** The page can show **No accounts match these filters**, **Your performance starts with financial records**, fewer supporting trades, or a different group total from **Closed net P&L**. These are distinct from a failed request. A title search or chart drill selection can also hide visible supporting rows without changing report totals.

**Possible causes:** Account, broker and immutable portfolio membership intersect; environment separates paper/live populations. Unapplied draft filters differ from the displayed report. Completed cards use eligible close-date outcomes while open money uses lifetime attributed economics as of the ending boundary. Strategy/asset breakdowns include open plus completed campaign money. A multi-leg campaign requires complete selected account coverage and is not split into invented fractional outcomes. Journal date filters concern activity dates, not the Dashboard's completed cohort. Display timezone, financial generation, journal metadata cutoff, costs and explicit supplied selections can differ.

**Diagnosis:**

1. In **Dashboard**, inspect applied date, environment, reporting currency and active filter chips. Open **Definitions and coverage** and record the **Financial generation**, metadata cutoff and definition version.
2. Open the relevant card's **About …** disclosure. Compare eligible/excluded counts and **Coverage** in **Supporting trades**. Clear **Search supporting trades** and use **Show all filtered trades** to distinguish hidden rows from excluded economics.
3. Open the campaign and inspect all legs, effective allocated fills and lifecycle state in **Trade journal**. Compare exact decimal table values rather than rounded chart coordinates.
4. Compare report meaning using [financial concepts](../reference/financial-concepts.md), not just its displayed currency. Account performance includes funding/income/account costs and is not a strategy outcome.

**Resolution:**

1. Correct only the mistaken filter and select **Apply filters**. Check that a completed request, rather than an old result or loading state, is displayed. The UI retains previous active filters after a rejected date edit.
2. Select the actual historical strategy/portfolio version, correct environment and complete intended account population. Do not broaden scope merely to force an expected number.
3. If source facts or allocations are genuinely missing, follow [financial discrepancies](financial-discrepancies.md) and the guarded [recording workflow](../user-guide/financial-recording.md). **State-changing:** recording/attributing evidence changes history and must be justified by the source. An order or journal note does not substitute for a fill.
4. If no source fact is wrong, retain the different reports with their stated populations. Use the linked supporting campaigns to explain the difference.

**Verification:** Reapply identical scope and inspect returned context, supporting campaign IDs and exact totals. Confirm that every expected candidate is either included or explicitly excluded for a reason. A scope rejection or entirely unavailable population is not a successful zero result.

**Escalation:** Collect the sanitized route/filter set, financial/metadata revisions, definition version, affected campaign IDs, eligibility reasons and a small fictional reproduction. Avoid exporting full private journal text or unrelated account histories. Evidence: [Dashboard service](../../packages/server/src/dashboard/service.ts), [analytics cohort](../../packages/server/src/analytics/cohort.ts), [independent population tests](../../tests/integration/analytics-independent-fixtures.test.ts) and [Dashboard tests](../../tests/integration/dashboard.test.ts).

## P&L, R or a ratio appears wrong or unavailable

**Problem:** A valid monetary result is confused with another metric, or a metric lacks its required evidence/sample.

**Symptoms:** Gross and net differ; **Average R** is unavailable despite known money P&L; **Profit factor** displays `∞`; a partially exited or flat campaign does not enter win-rate statistics. Journal availability reasons can include `missing_original_commitment`, while unresolved costs can yield `incomplete_costs`. These are availability classifications, not generic application failures.

**Possible causes:** Actual attributed fees distinguish gross/net. Unrealized and realized outcomes describe different slices. A partial exit leaves an open campaign; zero remaining quantity alone does not create accepted campaign closure. Original-risk R requires a genuinely pre-trade original positive risk commitment and compatible complete results/FX. A later plan cannot repair a missing original commitment. Ratios distinguish zero, undefined, infinite and empty samples; breakeven campaigns also affect rate denominators.

**Diagnosis:**

1. Open **About …**, then the contributing trade's **Ledger actuals** and fee currencies. Compare actual fills and costs with source evidence using [financial discrepancies](financial-discrepancies.md).
2. Inspect campaign status, closure-review warnings, original committed plan and initial risk. Distinguish the saved draft from the immutable commitment and its server timing.
3. Compare the eligible money sample with the eligible R sample. Read the exact reasons; never infer R from a later stop, current scenario size or an unavailable denominator.

**Resolution:**

1. Correct an interpretation by using the appropriate gross/net, realized/unrealized or completed/open result. Do not deduct fees a second time from net P&L or NAV.
2. **State-changing, only for actual source errors:** record the missing charge or reviewed correction through the supported [financial recording](../user-guide/financial-recording.md) path. Recalculate at its new financial generation.
3. If the campaign truly ended, use the authorized [API-only lifecycle procedure](../user-guide/journaling-and-reviews.md#complete-cancel-archive-or-add-legs-to-a-campaign) with its actual closure evidence. The browser has no Close/Reopen control. Do not close a partially open campaign simply to enter statistics.
4. Keep unavailable original R when the original commitment is missing/late. Keep `∞` for eligible gains with a zero loss denominator; do not replace it with zero or a made-up finite value.

**Verification:** Confirm correct source amounts and eligibility after the new query. A campaign may legitimately retain available money P&L with unavailable R. The [guided example](../user-guide/guided-example.md) independently explains USD 80 gross, USD 76 net and unavailable R; its different account-level USD 74 performance includes a separate conversion fee.

**Escalation:** Collect metric name/unit, sample counts, definition version, financial/metadata context, affected campaign status and exact availability reasons. Share commitment timestamps and redacted IDs rather than private strategy prose. Evidence: [analytics definitions](../analytics-definitions.md), [journal financial tests](../../tests/integration/journal-financial.test.ts) and [partial-close population test](../../tests/integration/analytics-independent-fixtures.test.ts).

## Market value is missing, stale or changes unexpectedly

**Problem:** Native quantity is known, but marked value, unrealized P&L or full equity is unavailable or differs between historical queries.

**Symptoms:** Inventory metrics can report `missing_mark`, `stale_price`, `missing_mark_fx`, `unknown_basis` or unsupported economics. Accounts can retain native cash/quantity and a known subtotal while withholding complete equity or P&L. A later observation does not repair an earlier valuation boundary automatically.

**Possible causes:** There is no live market-data feed. An observation may be absent, after the valuation instant, beyond the chosen maximum age, outside selected source priority, or incompatible with the required immutable instrument convention/revision. Account reports need evidence at both boundaries, not only today's close. Known current price does not prove unknown historical basis. A manual convention is not eligible for automatic native pricing merely because it has a symbol or multiplier.

**Diagnosis:**

1. In **Accounts**, inspect the applied interval and **Price and FX evidence policy**. Inspect opening and closing missing references separately. In Dashboard use **Definitions and coverage** and the exact data tables.
2. Compare the observation's instrument version/convention, currency, source, observed instant and recorded revision with the report's requirements. Look at each historical sample that is unavailable; a valid closing observation may be too late for the opening or an intermediate sample.
3. Inspect known acquisition basis separately from current mark. Use [financial recording](../user-guide/financial-recording.md) for the correct source-evidence fields; no price-history browser/list control is promised.

**Resolution:**

1. Correct a mistaken report date/source policy using **Apply report settings** or **Apply filters**. Increase age only when that is the genuinely intended reporting policy, and retain its implications; it cannot make future or incompatible evidence valid.
2. **State-changing:** an owner/editor with actual evidence can use **Record trade → Advanced financial entry → Manual instrument mark**. Enter the supported instrument version, currency, **Observed source price**, **Observed time (ISO 8601 with offset)** and **Price source**. Do not invent zero, duplicate a fill as a mark, or use today's observation timestamp for a historical quote.
3. For supported manual economics, use an explicitly reviewed [supplied position component](../user-guide/analytics-and-dashboard.md#record-a-reviewed-supplied-position-value), observing the separate exclusions and revision checks below. Do not replace a validated native calculation with a supplied residual.
4. Leave unsupported or genuinely unknown economics unavailable and escalate the missing evidence rather than fabricating basis or price.

**Verification:** Requery with documented scope and policy. The returned observation references must support each required boundary, and dependent totals must retain partial/unavailable states where other evidence is still missing. A new mark must not create cash or a fill.

**Escalation:** Collect redacted instrument/version IDs, valuation boundaries, expected/actual source selection, maximum ages, source revision, metric/reasons and whether native or manual economics apply. Do not share licensed price files or private account statements indiscriminately. Evidence: [mark selection](../../packages/server/src/accounting/report.ts), [price convention checks](../../packages/server/src/financial/price-conventions.ts), [inventory valuation](../../packages/domain/src/inventory.ts), [historical observation tests](../../tests/integration/portfolio-accounting-reports.test.ts).

## Native results are available but reporting-currency results are missing

**Problem:** A currency translation component lacks compatible evidence even though native activity is known.

**Symptoms:** Native cash/P&L may be shown alongside missing reporting amounts, partial equity or codes such as `missing_basis_fx`, `missing_exit_fx`, `missing_mark_fx` or `missing_fee_fx`. Changing workspace reporting preference alone does not resolve it.

**Possible causes:** Actual currency conversion is a cash event, not automatically an FX observation. Historical principal, exits, fees and valuation boundaries need their appropriate dates/rates. A rate can be too late/stale, from an unselected source, or in a different currency identity. An unrelated later fee/rate must not silently reprice pinned historical economics.

**Diagnosis:**

1. Identify the specific missing component and its currency pair, economic instant and source reference. Compare the report's selected reporting currency identity, rate-source policy and maximum FX age.
2. Compare actual conversion source/destination cash and its separate charges with reporting translation using [financial discrepancies](financial-discrepancies.md). Do not diagnose a conversion cash error from a translated chart alone.
3. Check source-revision pins. A later-recorded historical observation is unavailable to a report deliberately pinned before it was recorded.

**Resolution:**

1. Fix mistaken scope/currency/policy first and reapply the report.
2. **State-changing:** an owner/editor can record a genuine historical observation through **Advanced financial entry → Historical reporting FX observation**, with **Base currency**, **Quote currency**, **Quote units per one base unit**, **Observed time (ISO 8601 with offset)** and **Rate source**. This records evidence, not another exchange.
3. Preserve any explicitly pinned historical rate contexts. If source cash or its historical attribution is incorrect, use its reviewed correction path; do not edit postings or insert a fabricated exchange to make a report balance.
4. If the required evidence is unavailable, retain the explained incomplete result. A zero-valued component may have valid zero behavior without FX; do not infer that every nonzero component can use that exception.

**Verification:** Query the intended revision and policy; confirm the missing-reference list and component amount, with native balances unchanged by the observation. Compare like-for-like reporting components rather than adding native currencies directly.

**Escalation:** Collect component/reason, redacted currency identities, economic and observed instants, source priorities, revision pins and a fictional conversion example. Evidence: [financial metrics](../financial-metrics.md), [accounting reports](../../packages/server/src/accounting/report.ts), [analytics sources](../../packages/server/src/analytics/sources.ts), [independent FX/accounting tests](../../tests/integration/portfolio-accounting-reports.test.ts).

## Reviewed supplied values are rejected or seem to double-count money

**Problem:** A selected manual component is incompatible, stale/superseded, or interpreted as new ledger cash.

**Symptoms:** Actual conflicts include `STALE_SUPPLIED_COMPONENT`, `SUPERSEDED_SUPPLIED_COMPONENT` and `SUPPLIED_QUANTITY_MISMATCH`. Exact service details include **Source financial facts changed after this supplied component was reviewed. Record a new reviewed observation.**, **Select the current supplied observation or pin an earlier source revision.**, and **The supplied observation quantity differs from source inventory at this boundary.** An old selected ID is not automatically replaced by its correction.

**Possible causes:** Financial facts changed after review, another source superseded it, the observation is older than report freshness policy, signed quantity disagrees at that boundary, or kind/time/account/manual convention does not match. A position residual must exclude ledger cash, collateral, settled P&L and unsettled claims. A campaign source must include relevant costs and have a compatible result definition. Supplied analysis is an explicit alternative, not another cash movement or a universal native fallback.

**Diagnosis:**

1. In **Supplied values**, inspect **Retained supplied observations**, including **Revision and selection**, scope, quantity, definition, observed instant and supersedes relationship.
2. Inspect selected IDs in Accounts/Dashboard and compare financial basis revision with the current report generation. Read the exact conflict detail: the same stale code also covers age policy, requiring a different remedy from changed facts.
3. Compare the source's component definition with cash already posted. For example, USD 105 cash plus a separately evidenced USD 7 residual is USD 112 equity; a residual that repeats settled USD 5 is not USD 12.

**Resolution:**

1. Clear unintended selections and apply the read-only report. Select the correct current compatible source when a correction superseded the old one.
2. **State-changing:** if the source is actually wrong, use **Correct this observation**, review replacement fields/exclusions and reconfirm. If financial facts changed, review those facts and record a newly reviewed observation. Keep the original retained.
3. Reconcile a quantity mismatch against actual fills/openings/transfers before recording a replacement. Do not increase allowed age to bypass revision or quantity checks.
4. Use an earlier source-revision pin only for an intentional historical query through the supported API, not to hide an invalid current report. The browser has no general revision-entry field.

**Verification:** Reapply the selected compatible source and inspect its exact reference and effect. It must not create cash/fills, replace validated native economics, duplicate a residual or invent original-risk R. Historical originals remain available only in their compatible pinned context.

**Escalation:** Collect source selection ID, kind/definition, basis and report revisions, supersedes ID, exact conflict, boundary/quantity and exclusion attestations with sensitive references removed. Evidence: [selection checks](../../packages/server/src/supplied/selection.ts), [supplied manual](../user-guide/analytics-and-dashboard.md#select-inspect-and-correct-supplied-evidence), [supplied boundary tests](../../tests/integration/supplied-financial-boundaries.test.ts).

## Account equity charts are unavailable while campaign statistics work

**Problem:** Account history cannot be calculated for the selected Dashboard scope.

**Symptoms:** The service reports **Account equity cannot be attributed to strategy, asset or tag filters. Clear trade filters to view account equity.** or **Select at most 10 accounts for synchronous equity history.** Individual sampled points can carry `account_configuration_not_available_at_sample`.

**Possible causes:** Strategy/version, asset/class and tag filters describe campaigns, not allocated account capital. Dashboard's synchronous equity history supports at most ten selected accounts. A sample may precede the account's effective convention, or lack historical prices/FX. Dashboard samples seven points; it is not a continuous wealth history.

**Diagnosis:** Inspect applied trade filters, selected account count and exact unavailable point reasons. Compare account convention effective time with the sample instant, then inspect mark/FX coverage at that instant.

**Resolution:**

1. Clear trade filters when the intended question is account wealth. Keep account/broker/portfolio/environment scope explicit.
2. Narrow history to at most ten intended accounts; do not sum overlapping portfolio reports as a substitute for one correctly consolidated scope.
3. Use **Accounts** for the appropriate explicit account report and **Calculate account series** task. If a genuinely required sample lacks source evidence, follow the mark/FX issues above; do not borrow a future account configuration or manufacture a value.

**Verification:** The correct account view becomes available only where its population and evidence suffice. The campaign report must retain its own distinct population and totals. Confirm any remaining gaps in the exact data table.

**Escalation:** Collect applied account/trade filters, sample boundaries, redacted account/version IDs and point reasons. Evidence: [Dashboard service](../../packages/server/src/dashboard/service.ts), [historical sample tests](../../tests/integration/dashboard.test.ts), [analytics manual](../user-guide/analytics-and-dashboard.md#explore-every-dashboard-view).

## TWR, MWR or drawdown differs from a rising cash balance

**Problem:** A return or recovery calculation lacks sufficient evidence or is being compared with a different series.

**Symptoms:** Raw NAV rises after a deposit but adjusted performance does not; **Time-weighted return (period)** or **Money-weighted return (annualized ACT/365)** is unavailable. Reasons include `incomplete_valuation_or_capital_flow`, `nonpositive_opening_capital`, `nonpositive_subperiod_capital`, `ambiguous_flow_ordering`, `mwr_root_uniqueness_not_established`, `mwr_no_valid_solution`, `mwr_solution_outside_supported_range` and `numeric_overflow`. Recovery can remain unavailable or unrecovered.

**Possible causes:** Capital contributions are not gains. Account return computation needs required opening/closing and flow-boundary valuations; same-instant flows and other economics may lack unambiguous ordering. Nonpositive denominators block meaningful return calculation. MWR requires a supported unique solution. Missing intermediate marks can block TWR while MWR remains independently available. Dashboard monetary campaign drawdown is not sampled unitized account drawdown.

**Diagnosis:** In **Accounts → Account NAV and flow-adjusted returns**, inspect the returned **Source revision**, raw/adjusted exact tables and all availability reasons. Compare each flow boundary with source timestamps and its required valuation. Read the stated units: period TWR, annualized ACT/365 MWR and sampled unit-index drawdown are different results.

**Resolution:**

1. Apply the intended account interval and evidence policy, then select **Calculate account series**. Correct wrong timestamps/scope, not the expected result.
2. **State-changing only where genuine evidence exists:** record missing marks/FX or correct actual source ordering through guarded workflows. Preserve real same-instant ambiguity; do not shift timestamps solely to force a ratio.
3. For `ACCOUNT_PERFORMANCE_SCOPE_TOO_LARGE`, shorten the period. The exact service detail is **Select a shorter period: exact performance requires a valuation at every capital-flow boundary (at most 32 per request).** Removing optional display samples does not remove mandatory flow boundaries.
4. Retain unavailable mathematics when the denominator, unique root or output bound is not satisfied. An outside-range annualized MWR does not invalidate an independently available TWR. Do not add percentages or R multiples into a portfolio return.

**Verification:** Check available metrics against their own required evidence. Deposits must not produce gains or drawdown recovery in the adjusted series. Recovery describes observed checkpoints, not an unobserved intraperiod high/low. A surviving gap is not zero return.

**Escalation:** Collect scope, exact boundary instants, flow classifications, source revision, metric/reasons and a sanitized minimal set of values. Evidence: [return definitions](../account-performance-and-corrections.md), [performance service](../../packages/server/src/accounting/performance.ts), [unit fixtures](../../tests/unit/account-performance.test.ts), [persisted report cases](../../tests/integration/portfolio-accounting-reports.test.ts).

## Reports are slow, rejected as too large or fail before returning

**Problem:** A bounded synchronous report exceeds its supported selection, source-fact, group or response scope, or an infrastructure request fails.

**Symptoms:** Actual scope codes include `DASHBOARD_SCOPE_TOO_LARGE`, `ANALYTICS_SCOPE_TOO_LARGE`, `ACCOUNTING_SCOPE_TOO_LARGE` and `ACCOUNT_PERFORMANCE_SCOPE_TOO_LARGE`. Details include **Choose a narrower scope for this dashboard.**, **Select fewer accounts or group dimensions before calculating this analytics report.**, and **Select fewer accounts or a shorter period before calculating this accounting report.** A network/request error is distinct from a valid report with unavailable economics. Do not assume an HTTP failure has the scope code unless the response actually does.

**Possible causes:** The delivered engines are bounded synchronous queries. Dashboard caps include a 256 KiB request, 4 MiB response and 100 selected values per filter list; analytics supports at most 1,000 candidate campaigns and 500 groups with additional source-fact/response bounds. Account and return-series operations have their own limits. Network/proxy/database availability can separately fail. Native background snapshots do not provide asynchronous bulk reporting. [FA-04 remains open](../final-audit.md): million-fill, ten-reader and bulk-processing capacity has not been demonstrated.

**Diagnosis:**

1. Preserve the failed response's actual status/code, request ID if available, approximate elapsed time and applied scope. Do not repeatedly refresh an expensive request.
2. Compare a smaller read-only account/date scope using the same policy. A shorter interval may still include lifetime source history required for open campaigns; it is not a guaranteed cure for every analytics source bound.
3. If even a small query fails, use [diagnostics](diagnostics.md) to check service readiness, database connectivity and sanitized logs. Distinguish scope rejection from a process, network or permission failure.

**Resolution:**

1. Reduce the specific rejected dimension: account population, group dimensions, optional samples or interval. Keep the business question explicit; a smaller report is not proof that the omitted population is zero.
2. Use supported account summary/dependency-page APIs where an authorized integration needs detailed evidence, preserving the report's source revision. Do not silently combine independently timed pages or advertise an absent bulk-job UI.
3. Retry **Try again** only after scope/service/session correction. For infrastructure failure, use the matching startup/database guide; do not disable deadlines, security controls or response bounds to hide it.
4. Escalate a reproducible supported-size slow query with measured evidence. Do not claim production capacity from one fast small report or the historical remediation benchmark.

**Verification:** The request must complete successfully, disclose its actual scope/revision and return complete or explicitly partial/unavailable economics. Compare the narrowed result to its selected sources. Functional success does not close FA-04.

**Escalation:** Collect commit/runtime/schema versions, timestamps, status/code/request ID, query duration, account/campaign/group counts, interval/policy, response byte count if safely measured and whether a small scope succeeds. Remove sensitive request bodies, financial identifiers and source documents before sharing. Evidence: [Dashboard bounds](../../packages/server/src/dashboard/service.ts), [analytics service](../../packages/server/src/analytics/service.ts), [accounting bounds](../../packages/server/src/accounting/report.ts), [performance evidence](../performance.md).

## Worker is healthy but a native snapshot is stale or unavailable

**Problem:** Worker liveness or an older native projection is mistaken for current financial/reporting readiness.

**Symptoms:** The authenticated native-snapshot API can return `current`, `stale`, `pending`, `empty` or `unavailable`; these are not interchangeable. A retained snapshot may lag its latest financial source revision. Worker heartbeat alone does not establish successful business processing.

**Possible causes:** A newer committed financial command is pending, the lease/revision changed during delivery, retries exhausted, the workspace lacks a current owner, or the bounded candidate is too large. The projection supports at most 2,000 cash buckets and 2,000 holding books with a one MiB candidate. It includes all recorded events, even future-dated activity. It is not NAV, an as-of historical report or a bulk-report worker.

**Diagnosis:**

1. An authorized reader/integration can inspect `GET /api/v1/workspaces/{workspaceId}/accounting/native-snapshot`; compare latest source revision, processed revision, delivery status, attempts and safe failure classification. There is no dedicated browser snapshot-status panel. Use existing authenticated access; do not share cookies/tokens in a diagnostic command.
2. Use [diagnostics](diagnostics.md) for worker service/log inspection. Separate delivery status from web readiness and from independently calculated Accounts/Dashboard results.

**Resolution:**

1. For genuinely pending work, allow normal dispatch/retry and re-read status; do not recreate source transactions. The current implementation uses a sixty-second lease and five failed attempts before newer activity or authorized refresh is needed.
2. Resolve the classified infrastructure/membership/scope failure through its existing authorized process. Never grant the queue raw financial-table access or bypass current-owner authorization.
3. **State-changing, operator/integrator path:** an owner/editor can request the documented CSRF/idempotency-protected refresh with a reason after the underlying failure is resolved. This appends an audited generation request, not a balance correction. Follow [outbox reference](../financial-outbox.md); there is no invented browser Refresh projection button.

**Verification:** Re-read until the processed/current financial generation agrees and status is honestly current, or retain the reported failure. Independently compare native bucket quantities only within its stated economic scope. A current snapshot still does not prove prices, NAV, historical returns or capacity.

**Escalation:** Collect redacted workspace/generation identifiers, status, attempts, safe failure classification, worker lifecycle event times and aggregate bucket/book counts. Do not share snapshot money, job credentials or full source documents. Evidence: [native snapshot reference](../financial-outbox.md), [snapshot service](../../packages/server/src/accounting/native-snapshot.ts), [outbox integration tests](../../tests/integration/financial-outbox.test.ts).

## Evidence and related guides

The [manual verification record](../user-guide/verification.md) records the earlier complete 18-test browser run and the EUR-funded worked example; these are **Historically passed** for this checkpoint. Retained [Phase 18 remediation](../audit-remediation.md) covers independent financial/observation, supplied, reporting and worker regressions, with unresolved production capacity explicitly preserved. The current [troubleshooting verification](verification.md) records fresh reproduction, command results and procedures not executed. No successful end-user correction is implied merely because a test file or this diagnostic sequence exists.

Continue with [financial discrepancies](financial-discrepancies.md) for source cash/inventory investigations, [imports and duplicates](imports-and-duplicates.md) for repeated source records, and [diagnostics](diagnostics.md) for sanitized support evidence.
