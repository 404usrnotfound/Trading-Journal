# Investigate financial discrepancies

**Source-reviewed, 26 October 2026:** reviewed against Checkpoint 3 commit `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2` and unchanged application baseline `5132900a03efabaeb307787531546987228220e7`. Existing [Phase 18 remediation](../audit-remediation.md) and [Checkpoint 3 example/browser results](../user-guide/verification.md) are **Historically passed** evidence for this checkpoint. See [troubleshooting verification](verification.md) for any newly executed cases; source inspection alone does not reproduce an incident.

Use this guide when actual cash, holdings, basis or financial results differ from an independently reviewed source. [Financial concepts](../reference/financial-concepts.md), [financial metrics](../financial-metrics.md) and [portfolio accounting](../portfolio-accounting.md) own the definitions; this guide owns the investigation sequence. Analytics sample/return/performance limits are in [analytics troubleshooting](analytics-and-performance.md).

## Preserve evidence before correcting a source

Begin with read-only UI views, report dependencies and permitted exports. A viewer can inspect authorized reports; source writes require editor/owner membership. Record the workspace, paper/live environment, account IDs, exact instrument/currency versions, economic timestamps with offsets, source ordering, applied scope and financial revision before comparing values. A symbol, rounded display price or screenshot alone cannot identify the economics.

> **Warning:** Do not edit ledger tables, delete postings, alter migration records or insert a balancing transaction to make a report agree. Financial commands conserve source cash/quantity/costs and retain immutable history; direct changes can destroy that evidence. Potentially destructive database/media recovery requires a verified backup and the reviewed [backup and recovery procedure](../backup-and-recovery.md), not a report fix.

The **Diagnosis** steps below are read-only unless explicitly identified otherwise. The **Resolution** steps identify source writes where relevant. Follow the linked task's review/confirmation and current revision/idempotency requirements. Catalog changes, execution corrections, detailed cost attribution and some typed accounting operations are API-only; an API endpoint does not imply a browser control exists. See [diagnostics](diagnostics.md) for safe service/configuration checks and sanitized evidence collection.

## Cash is missing or differs from the statement

**Problem:** An account's reported cash differs from its expected native-currency balance.

**Symptoms:** **Accounts → Cash by native currency** omits an expected amount, shows a different total, or translated equity differs even though one currency appears correct.

**Possible causes:** Wrong workspace, paper/live environment, account selection or boundary dates; draft report settings were not applied; funding was not recorded; a fill is already booked but not attributed to a journal; fees/rebates or actual conversion legs were omitted/doubled; settled/unsettled/restricted/collateral buckets were compared with different statement definitions. Account creation and cash-bucket creation add no capital. Broker/manual account-value observations do not overwrite calculated cash.

**Diagnosis:**

1. Open **Accounts** and read **Applied scope and evidence**. Confirm **Environment**, **Reporting currency**, **From**, **Through**, and explicit accounts or immutable portfolio version. The dates use the workspace timezone; **Through** is included.
2. Compare each **native** currency separately before comparing a translated total. Inspect **Closing balances** and **Cash by native currency**, including the statement's settlement and ownership definition.
3. Use the authorized [cash record export](../user-guide/imports-and-exports.md#export-an-exact-supported-record-population) to inspect relevant ledger-event postings. The export's cash IDs are ledger-event IDs, not source-record IDs; do not treat each posting as another transaction.
4. Trace the expected deposit/opening, principal, fees, transfers and conversion by their source identities and economic timestamps. For a recorded fill, inspect its source before deciding it is absent merely because the journal has no allocation.

**Resolution:**

1. Correct only the report scope and select **Apply report settings**; this recalculates a read-only report.
2. If actual funding or a source event is genuinely absent, record the evidenced event once through [financial recording](../user-guide/financial-recording.md). This **modifies financial history**; first distinguish opening cash, deposit, withdrawal, fee, conversion and owned-account transfer.
3. For an existing incorrect source, use its supported reviewed correction/reversal path, retaining its original identity and evidence. Do not add a fictitious deposit or generic income to plug the difference. If its correction has no delivered UI, use authorized integrator assistance.

**Verification:** Reapply the same scope at the new revision and compare all affected native currencies. Then compare translated equity with the same price/FX policy. A known cash subtotal can be correct while full equity is unavailable. Recompare the independent statement after a source change; old acceptance is historical.

**Escalation:** Collect sanitized scope/revision, source event type and pseudonymized IDs, native amounts/currencies, exact timestamps, relevant availability reasons and the independently expected balance. Do not include full bank/broker identifiers or an unredacted financial export in a general support report.

Evidence: [ledger command implementation](../../packages/server/src/financial/ledger.ts), [account report](../../packages/server/src/accounting/report.ts), [persisted financial campaign tests](../../tests/integration/financial-correctness-campaign.test.ts) and [account selection instructions](../user-guide/accounts-and-portfolios.md#select-account-or-portfolio-scope-in-accounts).

## Cash is counted twice or an owned transfer appears to lose money

**Problem:** Cash or equity is duplicated, or disappears between transfer departure and receipt.

**Symptoms:** A purchase is debited twice, a sale/fee is repeated, settlement looks like new income, or consolidated equity changes when money moves between selected owned accounts.

**Possible causes:** The same economic event was entered through both import and manual recording with different identities; native principal was also entered as separate cash; gross conversion proceeds already include a fee that was entered again; settlement was entered as a second economic purchase/sale; a transfer endpoint is outside the selected report scope; arrival evidence is missing. Two different source identities are not automatically known to be duplicates.

**Diagnosis:**

1. Group the relevant authorized cash postings by their actual source event and compare source documents, currencies and times. A balanced debit/credit pair or multiple bucket postings can represent one event.
2. Inspect whether the fill's native booking already created principal and execution fees. For manual instruments inspect explicitly supplied cash effects; do not assume the application derived native-style consideration.
3. Check whether both transfer accounts are in the same report scope/environment. Within a consolidated owned scope the internal legs cancel; across its boundary a transfer can be a capital flow. For a delayed owned transfer, inspect its departure, receipt and reversal evidence at the report revision.

**Resolution:**

1. Correct scope if the intended question was consolidated ownership.
2. Resolve an actual duplicate through the source-specific guarded correction/reversal workflow, which **modifies financial history**. Follow [duplicate/import troubleshooting](imports-and-duplicates.md); do not delete one side of a posting pair.
3. Record a real supported transfer receipt or settlement only when its source evidence exists. Some delayed/holding-transfer creation paths are API-only. Do not post another deposit to represent already-owned money in transit.

**Verification:** Compare both native endpoints and consolidated equity at a common instant/revision. Evidenced pending owned transit is counted once; after receipt it moves to destination cash rather than remaining another asset. A reversal must restate the current view without changing an earlier pinned report.

**Escalation:** Collect the source-type/identity relationship, selected account population, departure/receipt/reversal timestamps and the observed current versus pinned revision. Preserve a sanitized posting comparison rather than editing history to remove the symptom.

Evidence: [transfer and transit rules](../portfolio-accounting.md#transfers-and-money-in-transit), [observation/NAV implementation](../../packages/server/src/financial/observations.ts), [pending-transfer/reversal regressions](../../tests/integration/financial-observations.test.ts) and [historical corrections](../account-performance-and-corrections.md).

## An execution or its journal entry is missing

**Problem:** An expected fill cannot be found where the user expects it.

**Symptoms:** An order exists but no holding changes; cash changed but the journal has no fill; guided recording shows only some completed progress; an imported execution is absent from a campaign.

**Possible causes:** An order was entered without an execution; guided journal creation, execution booking and attribution did not all complete; advanced/imported fills remain unassigned; date/account/archived filters hide the campaign; the expected record is on a later source page; the selected historical convention was invalid at the fill's economic instant. Orders alone neither execute externally nor book holdings.

**Diagnosis:**

1. Confirm whether the source proves a fill or only an instruction. Check account, side, exact quantity, actual price, timestamp and source identity.
2. If the guided page is still open, read **Recording progress**: **Journal ready**, **Execution recorded** and **Execution attributed to the trade journal** are separate confirmations.
3. Open **Record trade → Recording method → Link an imported / existing execution**. Select the account, inspect **Recorded execution**, and use **Load more executions** if needed. This inspection does not book another fill.
4. Check **Trade journal** filters, **Load more trades**, and each leg's **Fills, fees & lot attribution**. Journal activity dates differ from Dashboard completed-campaign cohort dates.

**Resolution:**

1. While the original guided command is retained, use **Retry remaining steps** with its frozen inputs. This can **complete a pending write**; do not recreate its already confirmed execution.
2. After navigation/reload, inspect persisted source and cash first. If an existing execution is entirely unassigned, use [Link an existing or imported execution](../user-guide/financial-recording.md#link-an-existing-or-imported-execution). Attribution **modifies campaign allocation**, not source cash or fill count.
3. For partial attribution use **Split or reassign an existing fill** rather than the whole-fill guided linker. If the actual fill is absent, record it once with the effective historical instrument version and source evidence.

**Verification:** The original execution remains one source fill. Expected campaign allocations appear; source quantity, principal and cash are unchanged by attribution alone. A retry after a lost response must not add a second cash effect.

**Escalation:** Collect the last confirmed progress stage, source execution ID if returned, account/instrument version, exact rejection code, timestamp and current allocation version. Keep session cookies, CSRF tokens and private payloads out of the report.

Evidence: [guided recorder](../../apps/web/src/components/record/manual-record-workspace.tsx), [ledger allocation implementation](../../packages/server/src/financial/ledger.ts), [lost attribution response browser regression](../../tests/e2e/manual-record.spec.ts) and [journal allocation tests](../../tests/integration/journal-financial.test.ts).

## A duplicate or allocation conflict prevents correction

**Problem:** A source or allocation write is rejected, or a repeated submission is suspected of duplicating economics.

**Symptoms:** Actual conflict codes include `SOURCE_ALREADY_RECORDED`, `STALE_ALLOCATION`, `ALLOCATION_EXCESS`, `SUPERSEDED_EXECUTION`, `CLOSED_CAMPAIGN_REVIEW_REQUIRED` or `INACTIVE_CAMPAIGN`.

**Possible causes:** Reusing a stable source identity with different economics; editing a command after it committed; allocating against an old version; assigning more than the actual quantity; targeting a superseded source or closed/canceled/archived campaign. These checks preserve identity and conservation rather than authorizing a bypass with new IDs.

**Diagnosis:**

1. Read the exact conflict code and the retained source/campaign state. `STALE_ALLOCATION` accompanies `Reload the effective allocation version.`; `ALLOCATION_EXCESS` accompanies `Assigned quantity exceeds the actual fill.`
2. Compare the persisted effective execution and all currently assigned slices. Include unassigned quantity; do not infer availability from a single campaign.
3. For `SOURCE_ALREADY_RECORDED`, compare its source identity and economics with the previous record. Import namespaces/IDs and idempotency keys have different jobs; see [imports and duplicates](imports-and-duplicates.md).

**Resolution:**

1. For an interrupted unchanged command retained by the UI, retry that same command. For a genuinely stale version, reread and review effective data before preparing a changed command.
2. Use [split/reassign](../user-guide/financial-recording.md#split-or-reassign-an-existing-fill) with the full intended allocation set and current version. This **changes attribution**; retain the actual account and compatible instrument unit, and keep assigned quantity within the fill.
3. Use the current effective execution version. New activity after campaign closure requires a new campaign; do not falsify status or alter a closed campaign through database edits. Corrections to existing source facts require their reviewed correction path.

**Verification:** Assigned plus unassigned quantity equals the source fill, with conserved principal/fees. Cash and source fill count do not change after attribution alone. Repeating the retained successful command returns its original outcome rather than another posting.

**Escalation:** Collect conflict code, source/campaign pseudonyms, expected/current allocation versions, exact source quantity and allocation totals. Include whether the operation was a retry, changed command, source correction or new attribution.

Evidence: `recordCashMovement` and `allocateExecution` in [ledger implementation](../../packages/server/src/financial/ledger.ts), [API command boundary](../core-ledger.md#persistence-and-command-boundary), [shared-fill conservation tests](../../tests/integration/journal-financial.test.ts) and [financial replay tests](../../tests/integration/financial-correctness-campaign.test.ts).

## Position quantity or partial closure looks wrong

**Problem:** Remaining holdings differ from the expected quantity, or a sold-out position remains an open campaign.

**Symptoms:** A partial exit leaves unexpected inventory; an oversized exit rejects; a flat account position still lacks completed-campaign analytics; one campaign's leg differs from the total account position.

**Possible causes:** Wrong account/instrument identity/unit, partial fills recorded as a full order, opening holdings plus duplicate purchases, missing or wrong campaign allocations, FIFO/average/specific-lot policy differences, opposing activity, ambiguous economic ordering, or unresolved settlement. Account inventory combines account activity; a campaign contains only its allocated slices.

**Diagnosis:**

1. Trace actual effective fills, reviewed opening lots and holding transfers at the required boundary. Compare compatible quantities, not currency values or contract notionals.
2. In Journal inspect each leg's **Ledger actuals**, **Fills, fees & lot attribution** and **Financial timeline**. Review entered/exited/open quantities by leg; do not collapse unlike units into one campaign quantity.
3. Check the account's effective inventory policy and any source lot selections. In advanced recording **Available source lots** shows eligible source evidence; an old disposal must use lots eligible at that event, not today's remaining lots.
4. If campaign completion is the symptom, distinguish exact remaining allocated quantity from rounded displayed zero and inspect actual unsettled obligations.

**Resolution:**

1. Correct scope or allocation if source quantity is already truthful. Allocation changes **modify campaign attribution** without liquidating account inventory.
2. Correct missing/erroneous execution or opening evidence through its supported source workflow. Do not disable **Close only** merely to force an intended disposal through: confirm whether the actual source crossed into opposite inventory. Specific-lot choices require a specific-lot policy and a complete eligible selected quantity.
3. After all assigned exposure and supported obligations are genuinely resolved, use the [API-only campaign closure workflow](../user-guide/journaling-and-reviews.md#complete-cancel-archive-or-add-legs-to-a-campaign). Closure **changes campaign lifecycle**; it does not record an exit. No campaign reopen/reclose browser control is delivered.

**Verification:** Recomputed exact quantities match source evidence per account and per allocated leg. A partial exit retains the remaining quantity/basis/costs. Closure errors `CAMPAIGN_HAS_OPEN_EXPOSURE`, `CAMPAIGN_HAS_UNSETTLED_OBLIGATIONS` or `CAMPAIGN_HAS_NO_ACTIVITY` must be resolved by their actual cause, not by changing status directly.

**Escalation:** Collect account inventory policy, compatible unit/version, exact chronological fill/opening/transfer sequence, selected lots, campaign allocation totals and closure code. Preserve microsecond source ordering where present.

Evidence: [inventory replay](../../packages/domain/src/inventory.ts), [ledger guards](../../packages/server/src/financial/ledger.ts), [partial-fill/close-only rollback tests](../../tests/integration/financial-correctness-campaign.test.ts) and [campaign/account independence tests](../../tests/integration/journal-financial.test.ts).

## Cost basis differs from entry price or becomes unavailable

**Problem:** The reported remaining basis differs from an expected average entry, or basis/P&L is unavailable despite known quantity.

**Symptoms:** Journal **Cost basis** includes more than remaining principal; **Actual entry** stays visible after an exit while remaining inventory average entry is unavailable; `unknown_basis`, `incomplete_costs`, `closed_position` or `unsupported_inventory_module` explains a metric.

**Possible causes:** Confusing historical allocated-fill averages with remaining lots, excluding entry/carry costs from net basis, comparing account matching with campaign FIFO attribution, unknown historical opening principal/quote, incomplete actual costs, missing historical FX or unsupported native economics. A mark proves current value, not unknown acquisition cost.

**Diagnosis:**

1. Identify the measure and unit. Journal **Actual entry/exit** weight effective allocated fills. Journal **Cost basis** is remaining **net** basis; inventory average entry weights compatible quoted prices of remaining lots and excludes fees. These are not interchangeable.
2. Inspect remaining lot evidence and allocated costs, including currencies. Review whether an opening supplied quantity alone or also retained booked principal, original price, complete costs and required historical FX.
3. Check native/manual capability and effective conventions. A multiplier or family label alone does not establish a supported formula. Read the availability reason rather than replacing it with zero.

**Resolution:**

1. Use the correct measure and canonical [inventory/cost definitions](../financial-metrics.md#inventory-and-native-results).
2. If source acquisition data genuinely exists, have an authorized editor/integrator record the supported reviewed source correction; this **modifies source history**. Never guess a historical purchase price from today's mark or check cost completeness without evidence.
3. For advanced manual economics, retain actual quantities/cash and use only the explicitly supported reviewed supplied components where appropriate. Supplied values do not create native basis or reconstruct unknown acquisition history.

**Verification:** Remaining basis and fees follow the documented lot policy. In the [fictional guided example](../user-guide/guided-example.md), the partial exit leaves principal `420 USD` plus retained entry fees `1.5 USD`, giving Journal **Cost basis** `421.5 USD`. A known holding value with unknown basis remains valid partial information; a flat position's remaining average may be unavailable while its realized result is known.

**Escalation:** Collect metric name/state/reasons, inventory policy, opening lot source fields, exact remaining quantity, principal/cost currencies and calculation manifest/source revision. Do not send entire real journals or tax records as a public reproduction.

Evidence: [Journal financial adapter](../../packages/server/src/journal/financial.ts), [inventory kernel](../../packages/domain/src/inventory.ts), [unknown-basis/valuation tests](../../tests/integration/financial-observations.test.ts) and [lifetime actuals versus remaining basis tests](../../tests/integration/journal-financial.test.ts).

## Realized P&L differs from cash change or another report

**Problem:** A campaign's realized result disagrees with an expected cash change, account performance or manually reported price.

**Symptoms:** Gross P&L is available while net is unavailable; a partial exit realizes less than the whole-position change; account performance differs from campaign P&L; adding a manually reported exit to the review does not change the result.

**Possible causes:** Gross versus net, partial matching versus whole inventory, omitted/duplicated fees, unmatched/unassigned carrying costs, different account/campaign lot policies, currency translation, funding/income/expense outside the campaign, or manual review fields being mistaken for source facts. A zero fee in another currency is not a missing-rate charge, but a nonzero fee needs its applicable FX evidence.

**Diagnosis:**

1. Align account/campaign population, date boundaries, reporting currency, pinned source revision and evidence policy. Read eligible/excluded coverage, not just headline numbers.
2. Trace realized matches and entry/exit/carry charges in their original currencies. A charged fee already reduced cash; its lot/match allocation explains the existing expense rather than charging cash again.
3. Compare gross and net availability separately. Inspect original source completeness and pinned historical rate evidence; `missing_fee_fx` is an actual analytics availability reason for nonzero untranslated fees.
4. Keep deposits, withdrawals, actual conversions, income, taxes and account costs in the account bridge instead of assuming every cash movement belongs in campaign profit. Manual **Manually reported entry/exit** and narrative estimates do not replace posted executions.

**Resolution:**

1. Correct the comparison definition and read the canonical [campaign/account bridge](../financial-metrics.md#campaign-attribution-and-account-bridge).
2. If an actual fee or attribution is missing/wrong, use its supported reviewed recording/correction path; this **modifies financial evidence or attribution**. Detailed cost-attribution version operations are API-only and require current versions; totals alone are not a list of attribution identities.
3. Preserve incomplete net output until genuine costs/FX are available. Do not subtract an estimated spread twice or add missing net P&L as cash.

**Verification:** Compare gross/net with the same complete evidence. The guided example's campaign gross `80 USD`, commission-net `76 USD` and account performance `74 USD` agree after its separate `2 USD` conversion fee. That explained difference is not another correction to post. Partial exits realize only their matched slice.

**Escalation:** Collect exact result definition, gross/net states/reasons, account/campaign scope, fee types/currencies/attribution versions, original-risk currency if relevant and the expected independent calculation. R eligibility and completed-population questions belong in [analytics troubleshooting](analytics-and-performance.md).

Evidence: [analytics service](../../packages/server/src/analytics/service.ts), [inventory cost partitioning](../../packages/domain/src/inventory.ts), [financing/zero-fee FX regressions](../../tests/integration/analytics-services.test.ts) and [complete financial bridge fixture](../../tests/integration/financial-correctness-campaign.test.ts).

## Actual FX conversion amounts or quoted rate are rejected

**Problem:** A conversion is rejected or native balances differ from the expected exchange receipt.

**Symptoms:** Exact source errors include `FX conversion needs two different monetary units.`, `A conversion is within one account; record cross-account transfer separately.`, or `A supplied rate that differs from the actual amounts at its source precision requires reviewed source evidence.` A fee reduces the gross destination receipt.

**Possible causes:** Same monetary unit selected twice, different-account buckets, nonpositive principal, quote direction reversed, indicative quote inconsistent with actual amounts at its supplied precision, or fees mixed into gross source/destination amounts and then separately charged again.

**Diagnosis:**

1. Verify both buckets' account and exact currency identities. Compare actual gross source spend, gross destination receipt and each separate charge in its own currency with the source statement.
2. Interpret the optional quote as destination units per one source unit. Check its precision and whether it describes the actual exchange or only an indicative rate.
3. Inspect both native balances before reviewing translated performance. A reporting FX observation is separate evidence and does not create either cash leg.

**Resolution:**

1. Correct unposted form references/direction using [actual conversion instructions](../user-guide/financial-recording.md#record-an-actual-currency-conversion).
2. Record actual evidenced principal and separate fees once. This **posts financial history**. Do not change actual amounts to fit an indicative quote.
3. If a discrepant source quote must be retained, use the strict API's reviewed `rateReview` evidence through an authorized integration; that field is absent from the advanced form. If the optional quote is unsupported, omit it rather than falsify it. Cross-account ownership transfer is a separate operation.

**Verification:** Source cash falls by actual source principal plus fees in that unit; destination cash rises by actual destination principal less fees in that unit. No reporting observation should change cash. Reapply the account report with the appropriate reporting FX policy to explain, rather than invent, conversion effects.

**Escalation:** Collect sanitized bucket/account relationships, currency pair direction, exact principal/charge amounts, source quote precision and exact error text. Do not include unredacted bank conversion receipts.

Evidence: `recordFxConversion` in [ledger implementation](../../packages/server/src/financial/ledger.ts), [conversion contract](../../packages/contracts/src/financial.ts), [advanced browser fixture](../../tests/e2e/advanced-record.spec.ts) and [actual conversion versus market FX regression](../../tests/integration/financial-correctness-campaign.test.ts).

## FX translation or portfolio valuation is incomplete or inconsistent

**Problem:** Native cash/quantity is known but reporting equity, net P&L or valuation differs or remains incomplete.

**Symptoms:** A known subtotal appears instead of full equity; missing/stale mark or FX reasons are shown; a broker account-value observation disagrees with internal equity; changing a current rate does not alter a pinned historical result.

**Possible causes:** Missing historical FX or compatible price, wrong pair direction/currency identity, future observation, stale observation/source priority, incorrect exact instrument version/economic compatibility, different source revisions, whole-account values used as holding marks, overlapping account selections, or misunderstood owned transit. Actual conversion history does not automatically supply a market FX observation. Unsupported native assets need the explicitly supported manual/supplied analysis boundary.

**Diagnosis:**

1. In **Accounts → Applied scope and evidence**, compare account population or immutable portfolio version, paper/live environment, dates, currency, source revision and **Price and FX evidence policy**. A portfolio is a selection, not another asset to add to its accounts.
2. Inspect native cash and supported quantities first, then each missing translated component. A known subtotal must retain its partial label. Missing basis may block profit while a compatible current mark still establishes holding value.
3. Inspect selected observation IDs, instants, sources, age limits and pair direction in report dependencies. Source priority is applied before recency; only eligible observations at the required boundary are usable. A future quote cannot establish an earlier value.
4. Compare the broker/manual observation's declared definition with calculated equity: buying power, margin, cash and net liquidation value are different measures. A whole-account observation is comparison evidence, not a replacement for each position mark.

**Resolution:**

1. Correct read-only scope/policy and select **Apply report settings**. Do not increase freshness limits solely to hide a genuinely stale market source.
2. If genuine missing source evidence exists, record a [Market price observation or Historical reporting FX observation](../user-guide/financial-recording.md#record-observations-without-moving-money); this **adds observation history**, not cash. Confirm units, effective version, quote direction and observed instant.
3. Correct an erroneous observation through its supported API-only supersession fields; retain the original source and reason. Price/FX have no dedicated history-list browser, so retain creation IDs and report dependency evidence. Later corrections do not silently rewrite already pinned historical fill FX.
4. If scope contains unsupported economics, use only explicitly documented supplied components with their definition/exclusion checks, or retain unavailable output. Do not treat a source account total as an automatic position residual.

**Verification:** Reapply the intended report and inspect selected dependencies at the new revision. Native cash/quantity remain unchanged by observations. Full equity becomes available only when all required components have compatible evidence; original pinned reports retain their original revision/policy meaning. Compare selected account population once, without adding overlapping portfolio totals.

**Escalation:** Collect missing-reference/reason codes, source policy, observation IDs/versions/instants, account population, calculation definition and known subtotal. A sanitized synthetic case should preserve pair direction and timing, not real customer prices or account IDs.

Evidence: [observation selection/NAV](../../packages/server/src/financial/observations.ts), [FX loader](../../packages/server/src/analytics/fx.ts), [valuation kernel](../../packages/domain/src/valuation.ts), [compatible-version/inverse/source-priority/pinned-revision tests](../../tests/integration/financial-observations.test.ts), [unrelated FX scope regression](../../tests/integration/report-fx-scope.test.ts), and [supplied-value boundaries](../supplied-values.md).

## An independent statement still reports a variance

**Problem:** Internal cash/quantity/equity does not match the saved independent statement.

**Symptoms:** Reconciliation comparison is `variance` or `unavailable`; **Accept matching statement** is disabled; a historically accepted comparison is stale after a correction.

**Possible causes:** Different instant, account/currency/unit/definition, incomplete source activity, missing mark/FX, an actual statement difference outside tolerance or a newer financial revision. Internal accounting identity is not independent broker agreement. A matched listed-only scope can omit unlisted items without certifying account-wide completeness.

**Diagnosis:**

1. Open **Reconciliation** and inspect the saved statement's account, as-of instant, listed cash/holding rows, optional equity definition, exact tolerances and declared completeness.
2. Read each variance and availability reason, compared financial revision and **Comparison history**. **Refresh comparison status** checks currentness; accepted history does not renew itself after newer source commands.
3. Trace each mismatch to native source cash/quantity before interpreting equity-only differences. Keep an independent statement outside the application; changing both sides to the same invented value defeats the check.

**Resolution:**

1. Correct a mistaken statement selection/definition through the supported [statement workflow](../user-guide/risk-and-reconciliation.md#record-an-independent-statement), preserving its actual source evidence. Saving a statement **adds reconciliation evidence**, not a ledger correction.
2. Correct a proven ledger-source error only through its guarded source workflow; this **modifies financial history**. Do not widen tolerance or mark completeness false merely to hide a variance.
3. Select **Compare with ledger** again after review; this **appends a comparison** at the new revision. Accept only a genuinely matching current comparison for its stated scope. Known variance or required unavailable evidence must remain unresolved.

**Verification:** Compared native rows and optional equity agree within the justified exact tolerances, comparison state is `matched`, and the compared revision is current. **Matching statement accepted at the recorded financial revision.** confirms acceptance, not external source authenticity or unlisted completeness.

**Escalation:** Collect comparison state/reasons, compared/current revision, declared completeness, tolerances and pseudonymized rows that differ. Redact the original statement before sharing; no account numbers, personal details or full broker files are required for the initial report.

Evidence: [reconciliation service](../../packages/server/src/reconciliation/service.ts), [statement definitions](../statement-reconciliation.md), [variance/tolerance/stale integration tests](../../tests/integration/reconciliation.test.ts) and [representative authenticated browser workflow](../../tests/e2e/release-workflows.spec.ts).

## Escalate without changing the evidence

Use the [sanitized diagnostic report](diagnostics.md) format. Include exact versions, source/revision boundaries, steps already tried, expected versus observed definitions and a minimal fictional reproduction where possible. Ask an authorized maintainer to inspect source-specific correction support when the delivered UI stops short; do not substitute direct SQL or disable authentication, row-level security, integrity constraints or reporting caps. The [verification record](verification.md) identifies which cases were reproduced during this checkpoint and which remain source-reviewed/historical.
