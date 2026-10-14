# ADR-0012: Guided financial workflows and explicit review boundaries

- **Status:** Proposed in the authorized Phase 12 implementation; pending user review
- **Date:** 2026-10-14
- **Requirements:** Specification §4, §6–§12 and §14; Phase 12's ten recording, import, strategy, review and account workflows.

## Context

The application has a tested ledger, immutable strategy and journal history, bounded imports and read-only analytics. Its first screens expose those modules independently. Recording a fill still requires API calls, empty states often explain missing records without providing the next action, and common review periods require entering dates. A journal idea can also be mistaken for an execution because both are called a trade.

UX refinement must preserve the difference between source financial facts, campaign attribution, manual observations and calculated results. Simplifying a screen must not silently choose a strategy version, turn missing costs into zero, publish a retrospective plan as original, infer advanced-asset cash from notional or label account capital as trading profit.

## Decision

### Organize navigation around user work

Provide consistent workspace navigation and explicit routes for **Record trade**, **Trade journal**, **Strategies**, **Accounts**, **Dashboard** and **Imports**, alongside Overview. Overview and empty states link to the next supported action. Keep workspace scope in links. Existing display preferences remain workspace preferences; new navigation does not introduce another settings store.

Use `idea` or `journal` for decision/review records, `fill` or `execution` for actual transactions, and `account performance` for the accounting report. Financial data and manual journal observations remain visibly distinct. A deposit, an owned-account transfer, a position and a completed campaign are not interchangeable.

### Guide common inputs; retain advanced controls

Put required recording and strategy identity fields first. Use progressive disclosure for advanced playbook configuration, detailed mapping and source policies. Preserve the complete shared validation contracts and exact decimal strings; hiding optional controls must not change their saved values.

Manual recording invokes the existing authenticated financial and journal commands. It records an actual fill, then attributes its quantity to a compatible journal leg. Show progress and retain the identifiers needed to recover if a later step fails. Do not claim that this sequence is one atomic server command. Reuse command identities on ambiguous retries so recovering a lost response does not book another fill.

Expose read-only current execution/allocation data for the recovery path, excluding corrected originals and paginating executions. The guided path attributes only a fully unassigned whole fill to a matching current-version leg; it does not overwrite another campaign's attribution. Keep partial allocations, older-version attribution and explicit lot selection in their existing advanced workflows.

Selecting a strategy requires an explicit immutable version. A performance link retains the selected strategy or historical version in the dashboard URL. No UX default reassigns an existing historical trade when a strategy changes.

### Make period review and financial scope visible

Provide common day/week/date-range shortcuts using the workspace's IANA timezone. The trade list's date basis must be visible and distinct from dashboard outcome dates and the accounting report's interval. Do not reuse one generic `date` label for incompatible populations.

Dashboard presets apply one consistent filter generation. Account reporting retains explicit account/environment, reporting-currency, interval and source-freshness inputs. Trade filters must not produce fabricated strategy-attributed account equity. Links between journal, strategies, analytics and accounts preserve the relevant scope without inventing a new metric.

Apply journal account/activity filters on the server before pagination. Account scope is campaign-leg membership; activity is any current effective allocated fill in the campaign. Creation time applies only when no effective allocated fills exist anywhere in that campaign. This is a read selection, not a restatement of execution dates or financial attribution.

The account report selects explicit accounts or an immutable portfolio version, separates live and paper, and renders existing server availability/reconciliation results. Its Dashboard link carries dates, account/portfolio scope, currency, environment and observation age. Dashboard's source-priority policy remains its own, so coverage and eligible populations can differ even for the same calendar dates; these are separate reports, not identical totals.

A weekly review is a practical path through the period's trades, individual reviews, strategy versions and tested analytics. A separate period-note/review-template entity is not added by this increment.

### Confirm irreversible or financially consequential actions

Use a shared keyboard-accessible confirmation dialog for actions with durable effects, including financial recording, import posting/reversal, strategy archival, original-plan publication and replacing an unsaved draft. The dialog explains the effect and uses a specific action label. Ordinary browsing, applying filters and reversible draft edits do not need confirmation.

Import staging and preview remain separate from ledger commit. Show validation, complete-group selection, warnings and the reviewed selection before asking to post. A changed stable source ID is a reviewed correction, not an invitation to upload under another namespace to bypass duplicate checks. Keep conservative reversal restrictions visible.

### Explain states at the point of work

Provide actionable empty states, initial loading and in-flight progress, retryable errors, save acknowledgements and conflict recovery. Associate relevant validation errors with controls; retain input after failure. Protect dirty journal and strategy drafts during in-application navigation and page unload. Do not clear a draft merely because a fetch failed.

Metric help explains population, units, fee treatment and missing-data conditions. Display unavailable and infinite results as those states, with reasons and sample sizes. Keep exact-value chart tables and financial source/provenance details available through disclosure rather than decorative extra cards.

### Use existing visual and accessibility primitives

Keep restrained typography, compact panels, predictable button emphasis and existing light/dark tokens. Controls have labels, visible focus, keyboard operation and textual status. Dialogs trap focus while open, support cancellation and restore focus on close. Responsive layouts keep actions and form content usable on small screens; long financial tables retain an accessible horizontal-scroll region.

## Alternatives considered

- **One very large editor for every entity:** exposes unrelated fields and obscures the distinction between a fill and an idea. Guided common workflows retain separate domain commands and advanced controls.
- **Automatic latest-strategy assignment:** saves a selection but weakens explicit historical intent. The user selects the immutable version.
- **A new financial calculation layer in React:** could fill gaps with convenient numbers but would diverge from the tested engine. Screens render server results and shared availability states.
- **Confirm every action:** adds clicks to browsing and drafting. Confirm only consequences that warrant an explicit review.
- **Treat all dates as a single period filter:** hides that list chronology, completed-campaign statistics and interval account effects have different definitions. Each flow states its time basis.
- **Add period-review storage during visual refinement:** expands the data model beyond the authorized UX pass. Existing per-trade reviews and period analytics form the weekly review path; dedicated notes/templates remain explicit future work.

## Consequences

Common workflows become discoverable without requiring users to know API paths. Financial controls remain explicit, and initial setup/recording is intentionally narrower than the full ledger API. Bounded catalogs, supported price conventions, multi-step recovery and unavailable accounting remain visible limitations. Shared navigation, dialogs and date helpers reduce inconsistent behavior across feature screens.

The increment does not change financial formulas, ledger classification, costing, historical strategy pins, original-risk semantics, import atomicity or asset capabilities. No new dependency, secret, migration or external provider is needed.

## Validation

Check all ten workflows against their routes and documented limitations. Component tests should cover field validation, explicit version selection, save/conflict preservation, date shortcuts, confirmation cancellation and unsupported-result presentation. Browser journeys should exercise actual persisted recording/import/review/strategy/account paths, keyboard operation, desktop/tablet/mobile layouts and both themes. Regression checks must retain the existing ledger, accounting, analytics and import expectations.

Executed results and verification limits belong in [Phase 12 validation](../phase-12-validation.md). This ADR does not claim that a screen reader, every browser/device, full WCAG conformance, advanced-asset accounting or the complete product roadmap has been verified.

## References

- [UX review and workflow guide](../ux-review.md)
- [Architecture](../architecture.md)
- [Financial domain model](../domain-model.md)
- [Analytics definitions](../analytics-definitions.md)
- [Import semantics](../imports.md)
- [Current asset-class audit](../asset-class-audit.md)
- [Product specification](../../Trading_Journal_Codex_Prompt.md)
