# Trading Journal user manual

Reviewed **25 October 2026** against committed Checkpoint 2 `3c790c2326bfd38e93698c60e80102a3787d077e`, with application baseline `5132900a03efabaeb307787531546987228220e7`. This manual is for users with basic trading knowledge. It covers the delivered application, distinguishes browser tasks from API-only operations, and links the canonical financial definitions instead of introducing another calculation engine.

Trading Journal stores and reviews trading evidence. Entering an order instruction here does not send it to a broker. Actual fills, cash, campaign attribution, notes and calculated reports remain separate so that you can trace a result to its source.

## Choose a starting point

- For access to a new installation, use [getting started](../getting-started/quick-start.md) and the [first-run paper-account walkthrough](../getting-started/first-run.md). There is no shared default password or public signup.
- For a complete worked example, follow the [fictional EUR-funded campaign](guided-example.md): conversion, partial entries, additional fill, partial/final exits, fees, journal review and financial analysis.
- For unfamiliar terms, consult the [glossary](../reference/glossary.md) and [financial concepts](../reference/financial-concepts.md).
- For verification scope and discovered discrepancies, use the [manual validation record](verification.md). Source-reviewed instructions are not automatically freshly exercised workflows.

Use a dedicated paper account for the fictional examples. A new real workspace starts empty; the optional labeled demo workspace is also empty. Examples do not assume your capital, strategy, risk limits, broker or profitability.

## Manual chapters

| Your task                                                                                                                                    | Chapter                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Navigate, select the correct workspace, sign in/out, change timezone/currency/theme, save private views and columns                          | [Navigation and settings](settings-and-navigation.md)  |
| Set up brokers/accounts/currencies, cash buckets and initial balances; select accounts or immutable portfolio versions                       | [Accounts and portfolios](accounts-and-portfolios.md)  |
| Choose an instrument capability, record orders/fills/costs/cash/conversions, handle lots/allocations and source corrections                  | [Financial recording](financial-recording.md)          |
| Create and edit playbooks, setups, rules and immutable versions; assign exact strategy versions and compare supported results                | [Strategies](strategies.md)                            |
| Create campaign journals, plans and original-risk commitments; save trade reviews, attachments and period reviews/templates                  | [Journaling and reviews](journaling-and-reviews.md)    |
| Apply dashboard/account filters, interpret metrics and return series, drill down, select supplied analysis and preserve missing-data meaning | [Analytics and dashboard](analytics-and-dashboard.md)  |
| Define risk policies, assess/simulate sizing, compare independent statements and review variances/acceptance                                 | [Risk and reconciliation](risk-and-reconciliation.md)  |
| Stage and map CSV, validate duplicates/corrections, export selected records, archive or restore a separate workspace                         | [Imports, exports and backups](imports-and-exports.md) |

Each chapter supplies when to use the feature, prerequisites and access, actual task steps, fields and validation, fictional examples/expected results, common mistakes and related references. Shared prerequisites below apply throughout; task-specific requirements remain beside their controls.

## Navigation and workspace context

The application uses the same destinations in desktop and mobile navigation. Labels are the current labels from the [application shell](../../apps/web/src/components/application-shell.tsx).

| Navigation label | Route              | What you do there                                                                                                                                                                   |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview         | `/`                | Choose a workspace, review the starting state and change owner-managed preferences.                                                                                                 |
| Record trade     | `/record`          | Guided fill recording and reference setup; **Advanced financial entry** opens `?mode=advanced`. Existing-fill attribution uses the recording mode rather than posting another fill. |
| Trade journal    | `/journal`         | Campaigns, plans, reviews, manual assessments, attachments and immutable history.                                                                                                   |
| Imports          | `/imports`         | File/mapping selection, staged dependency groups, preview, duplicates, corrections and import history.                                                                              |
| Strategies       | `/strategies`      | Playbooks, setups, version history, linked campaigns and supported comparisons.                                                                                                     |
| Dashboard        | `/dashboard`       | Applied filters, campaign statistics, distributions/breakdowns, sampled account views and drill-down.                                                                               |
| Accounts         | `/accounts`        | Explicit account/portfolio scope, interval accounting, raw/adjusted return series and typed-source reversal controls.                                                               |
| Risk & sizing    | `/risk`            | Policy versions, pinned assessments and native/manual-scenario sizing.                                                                                                              |
| Reconciliation   | `/reconciliation`  | Independent cash/quantity/optional-equity statements, variance evidence and guarded acceptance.                                                                                     |
| Data & backups   | `/portability`     | Filtered JSON/CSV exports, owner archive and new-workspace restore.                                                                                                                 |
| Period reviews   | `/reviews`         | Daily/session/weekly/monthly/custom reviews and typed reusable templates.                                                                                                           |
| Supplied values  | `/supplied-values` | Explicit position-residual or campaign-result sources, corrections and report selection.                                                                                            |

`?workspace=<workspace ID>` carries context in links. Check the selected workspace, account environment and applied report scope before posting or interpreting a result. Switching workspace changes the authorized data boundary; it does not transfer balances or combine identities. Sign-in is `/sign-in`; theme and **Sign out** are shared header controls. There is no separate general Settings, Portfolio, Instrument, Orders or API-management page merely because those concepts exist in the model.

## Access and prerequisites

| Role / condition     | Meaning for the manual                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                | Can use editor tasks, change workspace preferences and create/restore full workspace archives.                                                                                                      |
| Editor               | Can record/review permitted financial, journal, strategy, risk and reconciliation activity. Owner-only archive/restore or workspace settings remain restricted.                                     |
| Viewer               | Can inspect authorized records/reports and make supported filtered exports. Can save their own private display views/columns; that is not permission to change financial records.                   |
| Session / membership | Every operation still requires a valid session and current workspace membership. A denial is not an empty report or proof that a prior write failed.                                                |
| Reference records    | A fill needs an account, exact immutable instrument version and the appropriate currencies/buckets/conventions. A display preference such as `USD` does not create its financial currency identity. |
| Source evidence      | Use actual amounts, currency units, source timestamps/offsets, ordering and costs. Missing facts must remain missing rather than being replaced with invented zero or a stock-style formula.        |

Provisioning and membership/session administration without a browser editor are operator/integrator tasks, described in [getting started](../getting-started/installation.md) and existing authenticated contracts. The manual does not invent an invitation, public recovery, profile editor or membership administration screen.

## A reliable review sequence

1. Confirm workspace, account and paper/live environment. Set the intended display timezone before interpreting calendar dates.
2. Establish the account's real opening cash/holdings or record actual deposits. Account creation itself adds no capital.
3. Create the intended campaign/legs and save the plan and eligible original-risk commitment before trading activity when you want original-plan/R eligibility. A late plan can support review but must remain retrospective; it cannot fabricate an earlier commitment.
4. Record/import actual fills, source cash and fees once. Connect partial entries/exits explicitly to the intended campaign; a second strategy in the same instrument is a separate attribution decision. If you use guided entry to create the journal only after its first fill, do not assume that it has an original pre-trade risk commitment.
5. Review the ledger-derived quantities, cash and costs beside your notes. A manual observation or journal estimate does not silently change posted facts.
6. Apply explicit dates, currency, environment, account population and evidence policies before reading reports. Use drill-down and exact tables to inspect contributing records.
7. Compare an independent source statement when reconciling. An internally balanced accounting identity does not establish agreement with a broker statement.
8. Save review lessons/actions, preserve source evidence, and use an appropriate export or backup for its stated boundary.

For a submitted write whose response is interrupted, use the offered retry with the same frozen command while it remains available. Starting another record can duplicate activity if the first committed. Recorder retry state is held in memory; inspect persisted evidence after navigation/reload before recreating a write. Journal optimistic conflicts require reviewing the newer revision rather than overwriting it blindly. The chapters describe each workflow's confirmation, conflict and retry controls.

## Browser operations and API-only boundaries

The backend implements some operations without a corresponding browser editor. These are supported application operations for an authorized integration, not hidden buttons:

| Boundary                                                                                                      | What the browser provides                                                                                  | Where to learn the available advanced path                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign completion/cancellation/existing-leg addition                                                        | Campaign creation with legs, fill attribution and journal review; no Close/Reopen/Add-existing-leg control | [Campaign lifecycle](journaling-and-reviews.md), [worked example](guided-example.md) and financial contracts. Zero quantity alone does not admit a completed-campaign sample. |
| Portfolio creation/versioning                                                                                 | Account scope or an existing immutable **Portfolio version** in reports                                    | [Accounts and portfolios](accounts-and-portfolios.md). There is no separate portfolio builder screen.                                                                         |
| Typed income/tax/expense and delayed/holding transfers                                                        | The specifically listed advanced cash/bucket forms and typed-source reversal in Accounts                   | [Accounts](accounts-and-portfolios.md) and [financial recording](financial-recording.md) distinguish creation endpoints from browser forms.                                   |
| Catalog version changes/archive, order amendments, source execution corrections and detailed cost attribution | Reviewed initial setup/recording and the controls explicitly described in each chapter                     | [Financial recording](financial-recording.md); referenced source/API contracts retain authorization, revision and idempotency guards.                                         |
| Durable worker snapshot status/refresh                                                                        | No dedicated Accounts projection-status control                                                            | [Financial outbox](../financial-outbox.md) describes the authenticated read/authorized refresh API. A native cash/quantity snapshot is not NAV or a bulk report.              |

Do not use developer tools to bypass checks or manufacture missing economic evidence. If you need an API-only task and do not use a reviewed authorized integration, seek operator/integrator assistance. The worked example marks its one API-only closure step and the valid UI-only stopping point explicitly.

## Financial availability and supported scope

Use [financial concepts](../reference/financial-concepts.md) to distinguish native/reporting currency, gross/net, realized/unrealized, account equity, campaign P&L, raw NAV and flow-adjusted return. Reports retain source/revision policies; a changed current rate need not rewrite a pinned historical result.

- Native automatic inventory is gated to ordinary shares/ETFs and non-rebasing spot crypto under the documented conventions. Eligible security shorts have additional requirements. A family name or multiplier is not permission to use one universal formula.
- Other supported manual instrument records can retain quantities, terms and explicit actual cash; selected supplied position/campaign components have separate definition, quantity/time/revision and exclusion checks. Unsupported native economics remain unavailable.
- Deposits/withdrawals and internal transfers are not campaign trading profit. Actual conversion differs from reporting translation. Spread/slippage already in a fill is not another cash charge to deduct.
- Partial, unavailable, stale, unconfigured and infinite results have different meanings. A known subtotal is not complete equity; an unavailable ratio/R is not zero.
- A single fictional winning trade is not a strategy validation or profitability guarantee. Sample size and incomplete populations remain visible.

The following have no delivered end-user workflow: live broker/API/market-data connections, automated trade placement, native advanced derivative/fixed-income lifecycle engines, AI review, MAE/MFE/slippage calculation modules, optional Sharpe/Sortino/benchmark modules and asynchronous bulk-report processing. General entity-wide custom fields and varied seeded demo history are incomplete. No empty chapter presents those as working features. [FA-04](../final-audit.md#remediation-outcome--24-october-2026) production capacity remains open.

## Coverage and evidence

The [feature inventory](../feature-inventory.md) remains the capability index. This manual owns end-user task instructions; existing domain/financial references own definitions, and [getting started](../getting-started/installation.md) owns installation. The [validation record](verification.md) maps every implemented capability to chapters, source and available tests, records executed browser/example checks and states what was not run. Historical phase descriptions retain their original context and do not override this reviewed task baseline.
