# Follow a EUR-funded paper campaign

Reviewed on **25 October 2026** for Phase 19, Checkpoint 3, against Checkpoint 2 documentation commit `3c790c2326bfd38e93698c60e80102a3787d077e` and application commit `5132900a03efabaeb307787531546987228220e7`. The inputs below are invented and the expected results are independently calculated. Fresh execution scope is recorded in this guide's [verification section](#verification-and-limits); a source-reviewed instruction alone is not proof of a passing browser run.

This example funds a paper account with EUR, converts part to USD, scales into one ordinary-share campaign and exits in two fills. It shows why campaign P&L, actual cash and account performance can differ. Read [financial concepts](../reference/financial-concepts.md) and the [glossary](../reference/glossary.md) alongside it.

> **Warning:** Use a fresh synthetic workspace or a dedicated empty paper account. Confirm the workspace and account before posting. These actions persist financial history; rerunning the example in the same account adds more activity.

## Prepare the workspace and reference data

Complete [installation and first run](../getting-started/first-run.md) first. An owner sets the initial workspace preferences: use **Workspace** to select the intended workspace, then on Overview set **Timezone** to `UTC` and **Reporting currency** to `USD` and select **Save preferences**. These preferences do not create currency records or exchange cash. An editor may perform the remaining recording steps when the owner has already set those preferences. Viewers may inspect permitted reports but cannot create these records.

Use the reference-setup controls described in [first run](../getting-started/first-run.md#create-reference-records) to create these synthetic records. Every convention is effective at `2026-01-01T00:00:00Z`, before the example activity.

| Record                                                  | Fields                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EUR currency                                            | Name `Example euro`; namespace `docs:cp3`; code `EUR`; kind `fiat`; unit identity `docs:cp3:EUR`; display decimal places `2`; cash settlement increment `0.01`                                                |
| USD currency                                            | Name `Example dollar`; namespace `docs:cp3`; code `USD`; kind `fiat`; unit identity `docs:cp3:USD`; display decimal places `2`; cash settlement increment `0.01`                                              |
| Broker, through Advanced financial entry → Broker setup | Broker name `Fictional example broker`; source namespace `docs:cp3`                                                                                                                                           |
| Account                                                 | Name `Example EUR-funded paper account`; base currency EUR; broker `Fictional example broker`; environment Paper; type `cash`; inventory policy FIFO; holding mode Netted; allow supported short inventory No |
| Instrument                                              | Name `Example ordinary share`; accounting `Ordinary share · native delivered unit-price`; economic identity `docs:cp3:share`; quote currency USD; quantity increment `1`; price increment `0.01`              |

For the instrument, check the confirmation beginning **I verified delivered settlement, unit-price quotation, multiplier 1**. Use it only because those are the declared synthetic conventions. This example exercises native ordinary shares; it establishes no automatic derivative pricing, borrowing or advanced settlement support.

In **Advanced financial entry**, choose **Cash bucket setup** and create one EUR and one USD bucket in the example account. Select **settled** in **Cash category** and leave **Custody reference** empty. Creating the account or buckets adds no starting cash.

For each advanced record below, select **Review record**, inspect **Review financial record**, then select **Confirm and record**. Wait for **Recorded successfully. Financial history and source references are retained.** Reference fields offer matching records as suggestions; select the intended source identity rather than entering an unrelated label.

## Record funding, the actual conversion and reporting FX

All activity uses **20 October 2026**, UTC. The source ordering sequences below establish the intended sequence. These dates and observations are assumptions for this exercise, not downloaded market evidence.

Choose **Deposit, withdrawal or opening cash** and enter:

| Field                                | Synthetic input                  |
| ------------------------------------ | -------------------------------- |
| Account                              | Example EUR-funded paper account |
| Cash bucket / Currency               | Its settled EUR bucket / EUR     |
| Movement type                        | `deposit`                        |
| Actual amount                        | `1000`                           |
| Economic time (ISO 8601 with offset) | `2026-10-20T09:00:00Z`           |
| Source ordering sequence             | `1`                              |

Confirm the record. The account now owns EUR 1,000. That deposit is capital, not trading profit.

Choose **Actual currency conversion**:

| Field                                | Synthetic input                                               |
| ------------------------------------ | ------------------------------------------------------------- |
| Source cash bucket                   | The example account's settled EUR bucket                      |
| Destination cash bucket              | The example account's settled USD bucket                      |
| Actual source amount                 | `800`                                                         |
| Actual destination amount            | `1000`                                                        |
| Source quoted rate (optional)        | `1.25`; actual amounts still establish the gross relationship |
| Economic time (ISO 8601 with offset) | `2026-10-20T09:10:00Z`                                        |
| Source ordering sequence             | `2`                                                           |

Select **Add charge** and enter one fee row: **Currency** USD, **Cash bucket** the settled USD bucket, **Actual amount** `2`, **Charge kind** `conversion`. Review principal and fee separately, then confirm. The gross destination amount is USD 1,000; entering USD 998 as principal and another USD 2 fee would count that fee twice.

Expected cash is now **EUR 200 and USD 998**. The actual exchange and the separate reference observation happen to use the same gross EUR/USD relationship in this example. They remain distinct records.

Now choose **Historical reporting FX observation** in **Record type**:

| Field                                | Synthetic input        |
| ------------------------------------ | ---------------------- |
| Base currency                        | EUR                    |
| Quote currency                       | USD                    |
| Quote units per one base unit        | `1.25`                 |
| Observed time (ISO 8601 with offset) | `2026-10-20T08:00:00Z` |
| Rate source                          | `docs:cp3`             |

This means USD 1.25 per EUR 1. It supplies reference FX for reports, without changing cash. Its observed time precedes the funding and conversion even though you record it afterward. The example assumes this same selected observation is eligible for all required contexts under a 24-hour freshness policy.

## Record the four fills into one campaign

Return through **Guided trade entry**. For every row in the table below, select the example account, the USD ordinary-share instrument and its settled USD **Principal cash bucket**. Enter the exact **Execution side**, **Quantity (share)**, **Execution price**, **Executed at (ISO time with offset)** and **Source ordering key**.

Expand **Commission or fee (optional)**. Enter **Fee amount** `1`, **Fee currency** USD, **Fee cash bucket** the settled USD bucket and **Fee category** `commission`. Check the confirmation beginning **I checked the source and confirm all execution costs are recorded**. The example assumes all costs really are included.

| Fill            | Side | Quantity | Price, USD/share | Executed at            | Ordering key | Journal destination        |
| --------------- | ---- | -------- | ---------------- | ---------------------- | ------------ | -------------------------- |
| Initial entry   | Buy  | `4`      | `100`            | `2026-10-20T10:00:00Z` | `3`          | Create a new trade journal |
| Add to the idea | Buy  | `2`      | `110`            | `2026-10-20T11:00:00Z` | `4`          | The same existing campaign |
| Partial exit    | Sell | `2`      | `120`            | `2026-10-20T12:00:00Z` | `5`          | The same existing campaign |
| Final exit      | Sell | `4`      | `115`            | `2026-10-20T13:00:00Z` | `6`          | The same existing campaign |

For the initial entry, enter **Trade title** `EUR-funded scale-in example` and **Campaign direction** Long. No strategy is required; leave it unassigned for this exercise. Enter an **Attribution reason** such as `Synthetic fill belongs to the EUR-funded scale-in example`.

Select **Preview record**, inspect **Record this execution?**, then select **Record execution and attribute**. Wait for the success and **Review this trade** link. The workflow retains the actual execution and its allocation as separate steps; if interrupted, follow its retry/resume controls rather than starting another fill.

For each subsequent fill, select `EUR-funded scale-in example` in **Journal destination** and its long share leg in **Matching trade leg**. Keep both sell fills assigned to that long leg: they close existing long inventory. Review and confirm each fill once.

The expected checkpoints are:

| After                    | EUR cash | USD cash | Remaining shares | Cumulative gross realization, USD | Cumulative net realization, USD |
| ------------------------ | -------- | -------- | ---------------- | --------------------------------- | ------------------------------- |
| Conversion and fee       | `200`    | `998`    | `0`              | `0`                               | `0`                             |
| Initial entry and fee    | `200`    | `597`    | `4`              | `0`                               | `0`                             |
| Additional entry and fee | `200`    | `376`    | `6`              | `0`                               | `0`                             |
| Partial exit and fee     | `200`    | `615`    | `4`              | `40`                              | `38.5`                          |
| Final exit and fee       | `200`    | `1074`   | `0`              | `80`                              | `76`                            |

FIFO makes the partial exit consume two shares from the first four-share lot: USD 240 proceeds less USD 200 principal gives USD 40 gross. Half the first USD 1 entry fee and the USD 1 exit fee give USD 38.50 net. The final exit has USD 40 gross and USD 37.50 net after the remaining USD 1.50 entry costs and USD 1 exit fee. These partitions total the four original USD 1 fill fees exactly. The USD 2 conversion charge stays outside this campaign's fill costs.

## Inspect the open holding before the final exit

This is an optional stop after the partial exit, before recording the final row. An execution price does not automatically become a price observation. Without an eligible mark, Accounts can show known cash and quantity while full equity remains incomplete.

To value the remaining four shares, choose **Manual instrument mark** in advanced entry and record the example **Instrument version**, **Currency** USD, **Observed source price** `115`, **Observed time (ISO 8601 with offset)** `2026-10-20T12:30:00Z`, and **Price source** `docs:cp3`. Use the account report policy below. This is a synthetic manual mark, not an automatic price feed.

At that stop, the remaining gross basis is USD 420 and remaining assigned entry fees are USD 1.50. The USD 460 marked holding therefore has USD 40 gross and USD 38.50 net unrealized P&L. Combined realized and unrealized campaign net is USD 77. Cash plus the marked holding plus translated EUR cash gives USD 1,325 equity and USD 75 account performance after the separate conversion fee. These are independently calculated optional expectations; their fresh execution status is listed below.

Now record the final exit if you paused. Proven-flat holdings no longer require an open price mark to establish zero holding value.

## Review Journal actuals and account performance

Open **Review this trade** or select the campaign in **Journal**. Under **Ledger actuals**, inspect execution rows, fee amounts and the displayed lot/match counts. Expected final campaign results are **USD 80 gross**, **USD 76 net**, zero remaining quantity and zero remaining basis. The Journal's **Cost basis** is remaining net basis: at the partial-exit checkpoint it is USD `421.5`, comprising USD `420` principal and USD `1.5` retained entry costs. Preserve the currency and gross/net labels when comparing these fields.

This campaign has no original pre-trade plan commitment. Its **R multiple remains unavailable**. Saving a risk amount now would be retrospective and cannot create a valid original denominator.

Add a review using **Post-trade review**: `Four source fills reconcile to USD80 gross and USD76 after commissions. Conversion fee belongs to account economics.` For the synthetic reflection, enter **Mistakes** `None assumed in this fictional arithmetic exercise`, **Emotions** `calm`, **Lessons learned** `Keep conversions, fills, costs and campaign attribution separate.`, and **Custom tags** `docs-cp3, scale-in`. Select **Save now** and wait for the saved state. These notes do not change the financial actuals or close the campaign. The [journaling guide](journaling-and-reviews.md) explains draft/history behavior and review fields.

Open **Accounts** and choose:

| Report control                                       | Example selection                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Environment                                          | Paper                                                                           |
| Reporting currency                                   | The example USD currency                                                        |
| Scope                                                | Accounts radio, then only Example EUR-funded paper account in the Accounts list |
| From / Through                                       | `2026-10-20` / `2026-10-20`                                                     |
| Price and FX evidence policy → Price source priority | `docs:cp3`                                                                      |
| Price and FX evidence policy → FX source priority    | `docs:cp3`                                                                      |
| Maximum observation age (milliseconds)               | `86400000`                                                                      |

Select **Apply report settings** and wait for the report and applied URL settings before reloading. The period starts with no recorded assets and ends after all example activity. Under the stated complete-cost and constant-reference-rate assumptions:

| Result                                             | Independent expectation                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Native ending cash                                 | EUR `200` and USD `1074`                                                                |
| Closing holdings                                   | USD `0`                                                                                 |
| Closing equity / net liquidation value             | USD `1324`: USD 1,074 plus EUR 200 translated to USD 250                                |
| External funding / net capital flows               | USD `1250`: EUR 1,000 at the deposit's eligible 1.25 reference rate                     |
| Gross period trading                               | USD `80`                                                                                |
| Actual fees                                        | USD `6`: four fill commissions plus the conversion fee                                  |
| Holding FX / cash FX / conversion execution effect | USD `0` under the constant, compatible 1.25 reference contexts                          |
| Account monetary performance                       | USD `74`: closing equity less capital, also gross trading less all six dollars of costs |
| Unexplained reconciliation variance                | USD `0` when every component is available                                               |

Reload and confirm the same selected scope and results. A fresh report at a newer financial revision may legitimately change after more records or corrections. A missing total must retain its explanation and known subtotal; do not read it as zero.

This full-day period opens with zero capital. Under the [account return contract](../account-performance-and-corrections.md#account-series-and-return-definitions), that prevents a valid TWR or MWR denominator (`nonpositive_opening_capital`). The available USD 74 monetary performance does not establish a percentage return. This availability expectation is source-reviewed; its fresh execution status is separate from the account-report check.

USD 76 campaign net and USD 74 account performance answer different questions. The account owns the additional USD 2 conversion charge. Deposited capital is excluded from both performance figures, and the recorded fill fees must not be subtracted again from the already net campaign result.

## Optional API-only campaign completion

The implemented recording and Journal screens do not expose campaign closure. After the final fill the campaign is flat, but the UI journey alone does not establish completed-sample eligibility. Saving notes or marking a review final does not substitute for financial closure. The Dashboard can therefore have no completed outcome for this campaign while Accounts shows the realized result.

An owner/editor with API access can complete the supported lifecycle after reviewing that all four fills are allocated, quantity is flat, principal and commissions use the settled bucket, and no supported obligation remains. This is a separate financial write, not a hidden UI button. A reader following only the screens may stop here with the account results above.

For this synthetic record, an authenticated API client can read `GET /api/v1/workspaces/{workspaceId}/financial/trades/{tradeId}` to obtain the current trade revision, then call `POST /api/v1/workspaces/{workspaceId}/financial/trades/{tradeId}/closures` with:

```json
{
  "expectedRevision": 1,
  "reason": "All four synthetic fills are allocated and flat",
  "obligationEvidence": "Principal and commissions are posted to the settled USD bucket; no orders or other obligations remain"
}
```

Replace the illustrative `1` with the returned current **integer** trade revision; a financial source revision is a different field. Use the actual workspace/trade IDs from the Journal URL, the existing authenticated session, same-origin/CSRF proof and a fresh UUIDv4 `Idempotency-Key`. Retain the exact body and key for an uncertain-response retry. Do not create a new key merely because a response was lost. An explicit stale-revision or obligation conflict requires review; it does not authorize bypassing the guard. The [financial contract](../../packages/contracts/src/financial.ts), `tradeClosureCreateSchema`, and [ledger guide](../core-ledger.md) define the request.

After accepted closure, apply the same paper-account, USD and date scope in the Dashboard. If the sole complete selected campaign is this example, the completed population contains one winner with USD 76 net, monetary expectancy USD 76 and an explicit infinite profit factor because there is no loss. Original-risk R remains unavailable; there is no eligible R sample. These describe a single invented observation and establish no expected future profit. Dashboard labels may explain the infinite/unavailable states instead of displaying a finite number.

## Verification and limits

**Source-reviewed:** the workflow, current control labels and required request fields were reviewed at the pinned application commit. The cash/P&L figures above were independently derived from the stated inputs and checked against the cost-partition rules in [financial metrics](../financial-metrics.md#inventory-and-native-results), the [accounting bridge](../portfolio-accounting.md#reconciliation-equation), and [analytics eligibility](../analytics-definitions.md#context-and-populations).

**Freshly passed, pure calculation only:** on 25 October 2026, a scratch runner imported the existing `replayInventory`, `valueInventory` and `sumDecimals` domain exports at the pinned source. From the repository root on Linux x86_64, with Node 24.19.0 and installed `tsx` 4.23.15, `node --import tsx work/phase-19-cp3/reference-arithmetic.mjs` exited 0. It confirmed the partial realization `38.5`, optional marked unrealized result `38.5`, final gross/net `80`/`76`, final-exit net `37.5`, fully consumed basis/costs, missing-mark unavailability and closed-position average-entry unavailability. Independent integer-cent arithmetic also confirmed EUR `200`, USD `1074`, NAV `1324`, capital `1250` and performance `74`. The only output file was the ignored scratch `work/phase-19-cp3/reference-arithmetic-result.json`; no database, application record or service was changed. A failed assertion would have made the command fail. The runner and raw result remain under ignored `work/`; the inputs and durable expected/observed results are preserved above.

**Freshly passed, real application journey:** on 25 October 2026, `node work/phase-19-cp3/example-browser.mjs` ran from the repository root, exited 0 in 19.16 seconds, and retained its sanitized result at ignored `work/phase-19-cp3/example-result.json`. Preconditions were the pinned application in a separate source checkout, its migrated disposable PostgreSQL database, a privately provisioned synthetic owner and the built application at `http://localhost:4500`. The harness used installed Playwright with system Chromium, a 1440×1000 viewport and UTC. It signed in and created all reference records, the EUR deposit, actual conversion, separate reporting FX observation, four fills and their fees through the actual UI. It saved the post-trade review through the Journal UI. Only campaign closure used an authenticated API mutation with current trade revision, same-origin CSRF and an idempotency key; API reads independently checked persisted results. The actions created synthetic records in the isolated fixture and the ignored result file; they did not change application source or an existing user database. A request/status/value mismatch would have failed the run.

| Browser-observed result                                        | Outcome                                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deposit, conversion, both entries, partial exit and final cash | Every native-cash checkpoint in the table above matched                                                                                                                          |
| Partial Journal financial detail                               | Remaining quantity `4`, realized gross/net `40`/`38.5`, remaining net cost basis `421.5`                                                                                         |
| Final Journal financial detail                                 | Remaining quantity/basis `0`/`0`, realized gross/net `80`/`76`; R unavailable                                                                                                    |
| Accounts report applied through UI                             | Equity and net liquidation value `1324`, holdings `0`, capital `1250`, performance `74`, explained change `74`, variance `0`                                                     |
| Accounts cost/FX bridge                                        | Fees `6`, gross trading `80`, cash/holding/transit FX and conversion effect all `0`                                                                                              |
| Dashboard report after accepted API closure                    | One eligible completed winner, net P&L and monetary expectancy `76`, profit factor state `infinite` with `zero_loss_denominator`, eligible R count `0` and average R unavailable |

The existing browser regression command, `corepack pnpm test:e2e`, also freshly passed all **18 tests** in 182.92 seconds from the isolated source checkout. It used the fixture test database, `E2E_PORT=4502` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; it created synthetic test records and browser artifacts. Its retained scratch command ledger and log are `work/phase-19-cp3/commands.jsonl` and `10-browser-regression.log`. This is separate from the 19.16-second custom journey, and does not certify every feature or browser.

**Not run in this custom journey:** the optional intermediate manual-mark UI stop, same-example reload persistence and the TWR/MWR performance query. The optional marked calculations passed the pure domain check, while zero-opening-capital return unavailability remains source-reviewed. The older [Checkpoint 2 first-run rehearsal](../getting-started/verification.md) covers a different one-share example and its own persistence checks.

The reviewed source paths are the [guided recorder](../../apps/web/src/components/record/manual-record-workspace.tsx), [advanced field definitions](../../apps/web/src/components/record/advanced-record-model.ts), [Journal actuals](../../apps/web/src/components/journal/journal-financial.tsx), [inventory kernel](../../packages/domain/src/inventory.ts) and [accounting kernel](../../packages/domain/src/accounting.ts). The historical [financial-correctness browser fixture](../../tests/e2e/financial-correctness-campaign.spec.ts) exercises a related, more complex API-backed campaign; its different inputs and results are not execution evidence for this walkthrough.

This example does not certify tax treatment, all asset classes, every reporting boundary, unobserved intraperiod drawdown, live broker integration or the open FA-04 capacity gate. Return to [financial concepts](../reference/financial-concepts.md) for availability, returns and drawdown distinctions, or the [user guide index](README.md) for other tasks.
