# UX review and workflow guide

This guide began with the Phase 12 review and now distinguishes its historical findings from current workflows. Status review: 2026-10-24. It preserves the financial contracts in the [domain model](domain-model.md), [calculation definitions](financial-calculations.md), [analytics dictionary](analytics-definitions.md), [accounting guide](portfolio-accounting.md) and [asset-class audit](asset-class-audit.md). [ADR 0012](decisions/0012-workflow-ux.md) records the Phase 12 interaction decisions. [Phase 12 validation](phase-12-validation.md) retains that checkpoint's executed checks; current release results belong in [audit remediation](audit-remediation.md).

The current application also exposes **Add instrument leg** in the journal and [advanced financial entry](advanced-financial-entry.md), [risk assessment](risk.md), [independent statement reconciliation](statement-reconciliation.md), period reviews and [workspace portability](workspace-portability.md). These source-backed workflows preserve unsupported/unavailable states. Their presence is not a claim that every specialized asset lifecycle or full acceptance scenario has passed.

## Historical Phase 12 review findings

The Phase 11 baseline already has persisted strategy versions, journal autosave and conflict recovery, exact-value financial detail, reviewed imports, dashboard filters, accessible chart tables and both themes. The main problem is the distance between these modules and the user's task:

- Financial entry and initial account/instrument setup are API-only. Creating a journal idea can look like recording a financial trade even though no fill or cash is booked.
- Navigation and mobile page links differ across features. Common follow-up actions require returning to Overview or knowing the target route.
- Daily and weekly journal review require manually finding trades; historical search lacks visible period shortcuts.
- The strategy editor presents advanced configuration alongside identity and core rules. Version-specific performance is not a direct next action from the playbook.
- Imports expose correct staging/preview/commit semantics but make their progress, consequences and correction recovery harder to scan.
- Dashboard cards show sample and unavailable states, but common date presets and concise contextual definitions are missing. Account-level accounting remains an API even though a campaign dashboard is available.
- Existing validation and save feedback is uneven across forms. Consequential actions and replacement of unsaved work need a consistent confirmation interaction.

The review covers Overview and navigation; sign-in/sign-out; workspace preferences; manual financial recording; journal selection/detail/editor/history/evidence; strategy creation/history/comparison/attachments; imports/mapping/preview/history; dashboard filters/charts/drill-down; and account reporting. Authentication and preference semantics remain unchanged. No interface success message replaces a persisted server acknowledgement.

## Ten workflow acceptance paths

The table identifies the current path each user task needs and the evidence to check. Historical Phase 12 validation and current audit remediation record their own executed checks; this table is not a claim of a passing test.

| Workflow                       | Starting point and intended path                                                                                                                                                                 | Acceptance and important boundary                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Record a manual trade       | **Record trade** → select or set up account and instrument → enter actual fill and optional fee → review → confirm → open linked journal.                                                        | Uses separate idempotent journal/bucket/fill/allocation operations. Same-page recovery resumes acknowledged steps without rebooking. After reload/navigation, inspect the recorded execution and use the existing-fill path; in-memory recovery is not durable.  |
| 2. Import trades               | **Imports** → select account/source/mapping → stage → inspect groups and row issues → validate selection → acknowledge warnings → confirm posting.                                               | Preview changes no financial balances. Posting uses the exact valid reviewed selection; duplicate/no-op and partial results are explained. Imported fills do not automatically become completed campaigns.                                                       |
| 3. Review today's trades       | **Trade journal** → **Today** → select trade → compare financial facts and plan → save review.                                                                                                   | Matches current effective allocated fills during the workspace-local day; ideas with no current effective allocated fills use creation time. Financial results and manual observations remain separate; drafts show save acknowledgement or recoverable failure. |
| 4. Create a strategy           | **Strategies** → **New strategy** → identity and core rules → optional advanced playbook fields → create.                                                                                        | Required identity is validated in place. Summary links open/focus the invalid field. Optional configuration remains available, filled sections open when editing, exact decimal parameters are retained and creation publishes an immutable numbered version.    |
| 5. Assign a strategy           | Create/record a trade with an explicit strategy version, select a version in an unclassified journal before publication, or open the trade's assignment link in Strategies.                      | Choosing a strategy does not silently choose its newest version. Retrospective assignment requires a reason and final confirmation. An existing pin remains historical and cannot be reassigned by this shortcut.                                                |
| 6. Review strategy performance | Open strategy detail or a historical version → selected-version or all-version performance link → scoped dashboard → drill into supporting trades.                                               | The selected historical version remains addressable even beyond the first history page. Scope, eligible/excluded samples and unavailable metrics remain visible; no automatic claim that the newest version is better.                                           |
| 7. Find historical trades      | **Trade journal** → title/status/account/date filters and period shortcuts → paginated results → persistent trade detail.                                                                        | Server-side filters cover the complete paginated population, rather than only loaded cards. Active filters and empty-filter recovery are visible; filtering does not alter financial timestamps.                                                                 |
| 8. Review account performance  | **Accounts** → account scope and reporting currency → interval → apply → inspect equity/accounting components and **Account NAV and flow-adjusted returns**; use Dashboard for campaign charts.  | The view distinguishes trading, income, fees, taxes, FX and external/boundary flows. Deposits and owned-account transfers are not profit. Unsupported or missing inputs remain partial/unavailable.                                                              |
| 9. Correct imported data       | **Imports** → previous batch/source/history → prepare corrected source with the same stable identity → preview correction → provide reason → confirm.                                            | The original source and append-only correction remain auditable. Cash and execution corrections use existing guards; other kinds and dependent reversals remain restricted.                                                                                      |
| 10. Perform a weekly review    | **Period reviews** → weekly period → notes/goals/actions and optional template → save draft or finalize; use **Trade journal → This week** and matching-period Dashboard for supporting records. | Standalone reviews preserve versioned period content, linked evidence and process summaries. The journal shortcut is Monday through today in the workspace timezone; each financial report retains its own population.                                           |

## Interaction decisions

### Navigation, terminology and hierarchy

Use consistent workspace navigation across desktop and mobile, with direct quick actions from Overview and contextual links from empty states. Retain workspace identity in each link. **Record trade** means entering an actual execution; **New trade idea** creates the decision/review record. **Trade journal** brings manual plans, review and source-backed financial detail together without treating them as the same data.

Use **Dashboard** for campaign statistics/charts and **Accounts** for account-level equity and interval accounting. A strategy is a playbook identity; a strategy version is an immutable historical rules snapshot. Imports are staged sources and reviewed financial operations, not a broker-specific portfolio engine.

Keep primary actions visually prominent, secondary navigation compact and advanced sections disclosed. Preserve existing professional surfaces, typography, muted help, signs/text statuses and light/dark tokens. Charts retain exact-value tables rather than relying on pointer tooltips or color.

### Recording and setup

The guided recording path reuses the existing ledger, strategy and journal APIs. Select an account and current instrument version, enter exact quantity/price, an ISO execution timestamp with offset, source ordering and the explicit principal cash bucket/category. One optional signed fee retains its currency and bucket. Cost completeness is an explicit checkbox, not inferred from an empty fee list. Choose a new journal or a matching existing leg, an optional explicit strategy version and an attribution reason.

Reference setup requires source-verified currency identity/namespace/scale/increment/effective time, explicit account environment/type/lot policy/holding mode, and actual instrument conventions. An existing broker is optional; [Advanced financial entry](advanced-financial-entry.md) provides **Broker setup** through the existing authorized command. Native ordinary shares/ETFs/non-rebasing spot crypto require confirmation of the known gates and increments. Manual instruments retain versioned JSON terms and nullable unknown conventions. Setup does not create example capital, a deposit or invented opening holdings.

After review and confirmation, the workflow creates a new journal if needed, ensures selected cash buckets, records the fill and allocates its quantity. These are separate server operations, with frozen payloads, retained retry identities and confirmed identifiers in memory. Progress states which operations succeeded. A lost response is not proof of failure; same-page recovery retries/resumes without booking another fill. Recorded fills are never removed automatically because later attribution fails.

The existing-fill mode reads current effective executions in account-scoped, 100-item pages and loads the selected fill's effective allocation version through a read-only endpoint. Corrected original executions are excluded. It attributes a fully unassigned whole fill without posting an execution, and the command checks the allocation version again before writing. Historical fills load their pinned immutable instrument version independently of the current catalog, so publishing compatible metadata does not require rebooking a fill. Partial/replacement allocations and explicit specific-lot selection are available through [advanced financial entry](advanced-financial-entry.md). Closing a campaign remains a separate governed action; one submitted fill is not automatically a completed trade.

Reloading or navigating away loses the recorder's in-memory retry state. A page-unload warning protects ongoing work, but this is not durable recovery storage. After a restart, inspect the recorded execution/journal first and use the existing-fill path where compatible instead of starting another fill.

Ordinary native stock/ETF/non-rebasing spot instruments retain the validated capability gates. Manual advanced instruments retain explicit actual-cash and unavailable-result rules. The guided entry screen is not an exercise/assignment, variation-margin, bond-accrual or inverse-contract accounting implementation.

### Strategy and journal editing

Strategy identity and core trading rules lead the form; advanced eligibility, risk, setups, checklist, typed parameters and attachments remain available through disclosure. Filled optional sections open when editing. A linked validation summary opens the relevant section and focuses its control. Saving an edit creates a new immutable version and never edits historical rules on a trade.

The selected historical version is retained in the strategy URL and can be loaded independently of the first paginated history page. Version-specific and all-version dashboard links provide direct performance review. Retrospective trade assignment is placed before long playbook content, requires an audit reason and confirms the immutable association. Archival also explains its retained history before confirmation.

Use **Record manual trade** for source executions and **New trade idea** for planning a journal without booking an execution. **Add instrument leg** adds an explicit account/instrument leg to an existing campaign; it does not book a fill or invent native multi-leg pricing. Journal drafts retain autosave, explicit **Save now**, Ctrl/⌘+S, input-preserving validation and conflict recovery. Show whether a change is unsaved, saving, saved, failed or conflicted. Ordinary page links, workspace/trade selection and page unload protect dirty input, including pending uploads and saves; private evidence/source downloads remain usable. Browser Back/Forward navigation is not intercepted by a custom history guard. Starting an idea focuses its title, and discarding unsaved creation fields requires confirmation. Replacing local edits also requires confirmation; users can inspect the latest persisted revision first.

Publication creates an immutable plan snapshot. Explain the original-risk commitment and missing-risk consequence before confirmation. Later risk additions stay separate. Reported manual prices or stops never replace authoritative ledger actuals. Review section links reduce scrolling without introducing new financial state.

### Periods and scope

Common period shortcuts use the workspace's configured IANA timezone and daylight-saving-aware calendar boundaries. The journal offers **All history**, **Today**, **This week** and a custom range, plus account/title/status/archive filters. **This week** means Monday through today. Filters match current effective allocated execution timestamps; only ideas with no current effective allocated fills anywhere fall back to creation time. Account filtering selects campaigns with a leg in that account; activity filtering checks any effective fill in the campaign. A multi-account campaign can therefore match when another leg was active during the period. These filters are applied server-side before pagination, with strict paired timestamp boundaries; neither filter rewrites allocation or execution history.

Keep that journal activity basis distinct from completed-campaign close dates in outcome analytics and `(from, to]` interval effects in account reporting. The weekly guide links the same calendar dates to Dashboard, but does not claim that the two screens count the same population.

Dashboard filters apply as one generation, retain active scope in the URL and expose reset/retry paths. A preset changes the date inputs and applies them consistently across views. Strategy/version links preselect those dimensions but do not infer account-capital allocation. Source age and reporting currency remain explicit advanced controls.

The Accounts screen selects either explicit accounts or an immutable portfolio version and separates live from paper accounts. Applying settings changes the complete report together; unapplied edits do not relabel displayed totals. Read-only viewers can request reports. The report displays closing cash/equity/net liquidation value, signed interval components, monetary flow-adjusted performance, reconciliation and evidence without recalculating them in React. A known subtotal of an incomplete result is labeled as incomplete, including a zero reconciliation subtotal.

The Accounts-to-Dashboard link carries applied dates, account or portfolio scope, currency, environment and maximum observation age. Dashboard still uses its own observation-source priority and campaign population; a customized account source policy is not carried into that screen. Follow-up charts can therefore have different coverage. Use each report's applied evidence and unavailable reasons when comparing them.

Account source priorities use one source name per line and preserve ordered names in the URL. Commas in a source name remain part of its identity rather than splitting it into invented sources. Multiple account IDs remain separate IDs when moving between Accounts and Dashboard; a portfolio narrowed by account/broker filters becomes an explicit account scope rather than silently expanding to the whole portfolio.

### Import review and correction

Present source/mapping, review and posting as numbered steps. Use human-readable field/status labels, catalog-backed currency/instrument-version choices, and disclosed format controls. Selecting a new file retains the selected mapping. One-action group selection still respects the 100-row complete-group limit; no row is silently dropped to fit it.

Show selected complete-group counts, row validation, duplicate/correction summaries and warning acknowledgement. Disable posting when the preview is invalid, stale or exceeds the bounded selection. Editing a correction reason preserves the row context but requires fresh validation before posting. Confirmation states that posting changes financial records; cancellation preserves the preview and posts nothing. Saved-mapping archive and eligible cash reversal also require confirmation.

For a changed stable source ID, preserve the account, namespace and record kind, enter an audit reason and review the correction. Do not advise a new namespace as a way around conflicts. An incorrect mapping or unposted file can be restaged without mutating existing financial records. Downloadable original source and batch history remain available.

Automatic batch reversal still applies only to eligible independent cash movements and may be refused by later activity or dependencies. It appends monetary reversals; it does not delete the source. Fills, fees, FX, lots, observations and catalogs need their existing domain correction paths.

### Availability and advanced help

Empty states explain what is missing and offer the next supported action: initial setup, recording, importing, creating a strategy or clearing filters. Loading and command progress use textual status. Errors preserve form input and offer retry or narrower scope where possible. Viewer access remains visibly read-only.

Metric help uses the [tested definitions](analytics-definitions.md), including population, fees, units, original-risk requirements and sample exclusions. **Unavailable**, **Partial** and **Infinite** are meaningful states, not zeros. Account NAV, completed-campaign cumulative P&L and flow-adjusted monetary account change remain separate measures. The account performance series exposes conditional return calculations only with the required dated valuations and external-flow coverage; missing dependencies remain explained unavailable results.

## Accessibility and responsive behavior

- Keep explicit input labels, validation associations, visible focus and native keyboard semantics.
- Confirmation dialogs provide a named modal, initial focus, focus containment, cancellation and return focus. Busy actions prevent duplicate submissions while retaining readable progress.
- Preserve errors and save notices as live status/alert regions without moving focus on every autosave.
- Keep responsive navigation and multi-column forms usable at desktop, tablet and mobile sizes; long financial tables scroll within their own region.
- Retain textual statuses and signed values so gains, losses, availability and action importance do not depend only on color.
- Respect reduced-motion preferences and retain accessible exact-value chart tables.

Automated component, browser and axe evidence does not establish complete WCAG 2.2 AA conformance. Manual screen-reader coverage, all operating systems/browser combinations and every extreme zoom/content case remain separate verification work; the Phase 12 record must state actual viewport/theme checks.

## Remaining limits

- Guided financial entry records one fill and at most one fee per submission. **Add instrument leg** supports multi-leg campaign structure; [advanced financial entry](advanced-financial-entry.md) covers funding, brokers, actual FX, multiple charges, explicit source lots and split allocations. These workflows do not implement every specialized asset lifecycle or native formula. Same-page retry state is not persisted across navigation/reload.
- Imported fills require explicit campaign allocation before they contribute to campaign-based strategy metrics. A file with many rows is not a set of automatically completed trades.
- The weekly journal guide records notes on individual trades and links existing reports. Dedicated period reviews/templates and portable workspace backup/restore now have separate workflows; they do not change the journal activity or campaign-completion population. Current saved-view work and its verification are tracked in [audit remediation](audit-remediation.md).
- Account reporting depends on compatible price/FX observations, source freshness and supported holdings. Manual account-value observations do not silently replace calculated equity or cure unavailable advanced accounting.
- API page and command caps remain real boundaries. Recorder/journal reference choices and retrospective unclassified-trade assignment offer bounded search and page navigation, retaining explicitly selected values across pages. Financial reference pages have a 200-row maximum; strategy/version pages use 100. Existing executions are independently paginated in 100-item pages. Dashboard and Accounts load bounded reference pages rather than rejecting the whole catalog at 501 records; account selection must be explicit when the loaded account catalog is incomplete. Account reports accept at most 100 accounts. Imports retain 2 MiB/1,000-row sources, at most 100 saved mapping templates and 100-row complete-group selections. No unbounded browser catalog load or bulk/background reconciliation benchmark is claimed.
- Historical analytics retain their documented population and metadata cutoffs. Overlapping tag groups, mixed campaign membership and missing original risk remain explicit; improved links do not change attribution.
- No broker credentials, AI provider, market-data provider, new secret, schema migration or dependency is required by UX refinement. Authentication, tenancy, CSRF and server authorization remain the write/read boundaries.

## Phase 12 verification map and current implementation anchors

### Implementation anchors

| Workflows                                              | UI and application boundary                                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual recording and existing-fill attribution         | [`manual-record-workspace.tsx`](../apps/web/src/components/record/manual-record-workspace.tsx), [`catalog-setup.tsx`](../apps/web/src/components/record/catalog-setup.tsx) and the existing commands/read endpoints in [`financial/api.ts`](../packages/server/src/financial/api.ts). |
| Daily, historical and weekly journal review            | [`journal-workspace.tsx`](../apps/web/src/components/journal/journal-workspace.tsx), [`journal-editor.tsx`](../apps/web/src/components/journal/journal-editor.tsx) and filtered, read-only listing in [`journal/service.ts`](../packages/server/src/journal/service.ts).              |
| Strategy creation, explicit assignment and performance | [`strategy-editor.tsx`](../apps/web/src/components/strategies/strategy-editor.tsx) and [`strategy-workspace.tsx`](../apps/web/src/components/strategies/strategy-workspace.tsx); links reuse the existing strategy/version dashboard scope.                                           |
| Importing and correction review                        | [`import-workspace.tsx`](../apps/web/src/components/imports/import-workspace.tsx); staging, preview, commit, corrections and reversal retain the boundaries in [import semantics](imports.md).                                                                                        |
| Account performance and advanced metric help           | [`account-workspace.tsx`](../apps/web/src/components/accounts/account-workspace.tsx) renders the existing accounting report; [`dashboard-workspace.tsx`](../apps/web/src/components/dashboard/dashboard-workspace.tsx) renders the existing dashboard results.                        |
| Navigation, consequential actions and draft protection | [`application-shell.tsx`](../apps/web/src/components/application-shell.tsx), [`confirm-dialog.tsx`](../apps/web/src/components/ux/confirm-dialog.tsx) and [`navigation-request.ts`](../apps/web/src/components/ux/navigation-request.ts).                                             |

### Acceptance evidence

| Area                                                       | Evidence to inspect                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording/setup and account review                         | Persisted browser workflow plus focused UI validation/retry tests; existing ledger/accounting integration fixtures remain unchanged in meaning. |
| Daily/weekly/historical journal review                     | Timezone/period-filter tests, draft/save/conflict/confirmation UI checks and journal browser persistence.                                       |
| Strategy creation, explicit versions and performance links | Strategy editor/history UI checks and persisted strategy browser journey.                                                                       |
| Imports and corrections                                    | Mapping/row-error/stale-preview/confirmation UI checks, existing correction/reversal PostgreSQL fixtures and browser staging/posting/history.   |
| Dashboard help, presets and scope                          | Definition/help and applied-filter UI checks, existing finance snapshots and responsive themed dashboard journey.                               |
| Shared interaction/accessibility                           | Dialog focus/cancel tests, navigation/loading/error states and browser/axe checks at the declared viewports/themes.                             |

See [Phase 12 validation](phase-12-validation.md) for executed commands, outcomes, changed files and remaining verification limits.
