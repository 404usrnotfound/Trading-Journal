# Development plan

## Authority and current status

The [product specification](../Trading_Journal_Codex_Prompt.md) is authoritative. [Requirements analysis](requirements-analysis.md) supplies requirement identifiers, the 16 acceptance scenarios (`AC-01`–`AC-16`), and missing decisions (`D-01`–`D-20`). This plan sequences that full scope; it does not replace or reduce it.

**The current task authorizes Phase 3 application foundations only.** Phases 0–2 are approved and merged. The earlier scaffold was reverted; this implementation is rebuilt against the accepted financial-domain design. Current verification is recorded in [scaffold-validation.md](scaffold-validation.md). Phase 4 financial features and dashboards have not started.

| Phase          | Result                                                                                                 | Current status                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 0              | Requirements extraction and ambiguity/decision inventory                                               | Complete: requirements-analysis document exists                                        |
| 1              | Approved architecture, ADRs, boundaries, and gated plan                                                | Approved; platform selections used by Phase 3                                          |
| 2              | Complete financial-domain model, calculation conventions, capabilities and independent fixture designs | Approved and merged; financial implementation deferred                                 |
| 3              | Runnable platform scaffolding and security foundations                                                 | New foundation implemented; current clean-environment verification recorded separately |
| 4              | Financial schema, kernel, ledger, ordinary linear assets, holdings, and FX                             | Not started; the attempted early Phase 4 was withdrawn without retained implementation |
| 5              | Strategies, frozen plans, trade workflows, and reviewable allocations                                  | Not started                                                                            |
| 6              | Universal imports, corrections, and reconciliation                                                     | Not started                                                                            |
| 7              | Recording/review and settlement workflows for every asset family                                       | Not started                                                                            |
| 8              | Risk monitoring, portfolio performance, and drill-down analytics                                       | Not started                                                                            |
| 9              | Journal workflows, attachments, saved views, exports, and restore                                      | Not started                                                                            |
| 10             | Complete security/accessibility/performance verification and delivery                                  | Not started                                                                            |
| Optional track | Chosen broker/provider integrations and optional metrics                                               | Unscheduled; not a prerequisite for the manual core                                    |

Implementation statuses and acceptance evidence must be updated after actual work. Documentation completion does not imply a runnable application or any passing application check.

The old scaffold rollback remains part of history. Its previous checks do not certify the new implementation; preserved runtime archives and old database volumes are not reused as evidence.

### Phase 2 documentation index

| Artifact                                                 | Purpose                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [domain-model.md](domain-model.md)                       | Complete logical entities, ownership, relationships, lifecycle/state, financial invariants and command boundaries.    |
| [financial-calculations.md](financial-calculations.md)   | Decimal/rounding, lots/basis, cash, charges, realized/unrealized results and multi-currency calculation conventions.  |
| [instrument-capabilities.md](instrument-capabilities.md) | Asset identities, units, per-operation support, all-family manual paths and native-module validation gates.           |
| [financial-fixtures.md](financial-fixtures.md)           | Independent worked examples, expected outcomes and required future unit/integration/property coverage.                |
| [phase-2-validation.md](phase-2-validation.md)           | Verification of Phase 0, Phase 1 and Phase 2 documents, reported changes, and explicit application-check limitations. |

## Approved architecture baseline and future compatibility checks

The following selections remain the approved Phase 1 baseline. Phase 3 rechecks official engines/peers, pins foundation dependencies and the toolchain, and supplies a lockfile. Unused financial/table/charting packages remain deferred. Historical reverted-scaffold checks are separate from current evidence.

| Concern                 | Approved architectural baseline                                                                                                                                                     | Decision reference                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Application/runtime     | Modular monolith; Next.js 16 App Router, React 19, TypeScript 5.9 compatibility baseline; Node.js 24 LTS and pnpm 10                                                                | [ADR 0001](decisions/0001-monolith-and-stack.md)                 |
| Contracts and UI        | Typed REST through Next.js Route Handlers, shared Zod 4 DTOs/OpenAPI 3.1; TanStack Query 5/Table 9, React Hook Form, Radix UI, Tailwind CSS, Recharts 3                             | [ADR 0002](decisions/0002-contracts-and-ui.md)                   |
| Authentication          | Better Auth 1 email/password and database sessions; controlled initial-user bootstrap with public signup disabled                                                                   | [ADR 0003](decisions/0003-authentication-and-tenancy.md)         |
| Financial kernel        | Decimal.js; currency/unit-aware deterministic calculations, balanced cash ledger, explicit provenance and unavailable results                                                       | [ADR 0004](decisions/0004-financial-kernel-and-ledger.md)        |
| Financial history       | Separate intent/execution/holdings/cash/valuations; effective-dated metadata and strategy rules; frozen plans/risk; historical FX                                                   | [ADR 0005](decisions/0005-versioned-domain-and-multicurrency.md) |
| Database                | PostgreSQL 17, Drizzle ORM stable 0.45.x/Drizzle Kit 0.31.x compatibility families, node-postgres, reviewed versioned migrations                                                    | [ADR 0006](decisions/0006-postgres-drizzle-and-migrations.md)    |
| Files and durable work  | Private filesystem storage for local/single-host operation, optional private S3-compatible storage across hosts; pg-boss 12 on PostgreSQL for heavy durable jobs; no required Redis | [ADR 0007](decisions/0007-private-storage-and-durable-jobs.md)   |
| Verification/operations | Vitest 5, fast-check, real-PostgreSQL integration tests, Playwright and axe; ESLint, TypeScript checks, Prettier; Pino redacted structured logs                                     | [ADR 0008](decisions/0008-testing-and-operations.md)             |

The application and optional worker share domain services and calculation versions. Small atomic financial commands finish synchronously. Large imports, rebuilds, backups, and other durable work may use the worker; queued execution must not split a required atomic write or expose partially valid financial state. External providers never become prerequisites for manual entry, CSV, manual prices/FX, deterministic summaries, or record review.

The Phase 3 pnpm workspace has `apps/web` and `apps/worker`, with shared `packages/domain` (pure financial rules), `contracts` (public Zod contracts), `database` (schema/repositories/migrations), `server` (application services, ports and infrastructure composition), and `ui` (React components). These directories now contain platform foundations; future financial modules remain unimplemented. The Next.js server exposes `/api/v1` through Route Handlers and calls the same application services as the worker; no separate backend API, microservice tier, tRPC or Turbo dependency is proposed. Financial DTOs use decimal strings; Zod-to-OpenAPI 9 and openapi-typescript 7 generate the documented OpenAPI 3.1 contract/typed client. TypeScript 5.9 is a compatibility selection, not a claim that every latest registry major can be combined safely.

## Gates and dependency order

Each gate has a reviewable artifact and a verification obligation. Engineering can resolve reversible choices within a later authorized scope; missing credentials, incompatible business requirements, or scope reductions remain explicit blockers for the affected work. No trade capital, broker, strategy, or risk limit is assumed.

| Gate                                           | Required before proceeding                                                                                                                                                                                                                                                                                                    | Decisions covered                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| G-01: architecture documentation               | Approved ADRs and boundaries remain consistent with the specification; all acceptance scenarios and categories remain scheduled; links/statuses are checked. Phase 1 is approved documentation and its consistency is rechecked with Phase 2.                                                                                 | D-01–D-20, at architecture level  |
| G-02: implementation authorization and tooling | A new user instruction permits the next implementation scope. Official compatibility checks, exact versions, local run topology, private configuration, authentication bootstrap, and test harness are documented.                                                                                                            | D-01, D-02, D-17, D-20            |
| G-03: schema and financial semantics           | Logical/physical schema, relationship/state model, ownership constraints, posting examples, decimal/rounding/time conventions, allocation and lot rules, FX decomposition, and correction/recompute policy are reviewed. Migration checks protect these invariants.                                                           | D-03–D-09, D-13                   |
| G-04: metric and fixture foundation            | A versioned metric dictionary defines populations, formulas, units, costs, time basis, currency handling, availability and edge cases. Independent hand-calculated fixtures and official instrument references define expected ledger/holdings/FX results. Required financial invariants have meaningful unit/property tests. | D-04, D-05, D-07–D-09, D-12, D-20 |
| G-05: strategy and risk semantics              | Frozen/retrospective plans, rule versions and typed fields, lifecycle/reopening, policy precedence, original-R denominator, risk additions, calendars and unknown assessments are defined.                                                                                                                                    | D-06, D-10, D-11                  |
| G-06: safe ingestion and storage               | Identity/fingerprint scopes, symbol review, row/batch commit units, corrections, source-file access, reconciliation tolerances and dependency-safe reversal are defined and tested. Private-file and restore contracts cover limits, ownership and calculation/schema versions.                                               | D-14, D-15                        |
| G-07: delivery evidence                        | All mandatory scenario workflows pass at declared capability levels; security, restore, accessibility/responsiveness and representative performance are actually checked; remaining limitations are visible.                                                                                                                  | D-16–D-20 and all AC scenarios    |

**G-03 and G-04 must pass before the first application financial-write workflow.** Database/authentication setup in Phase 3 may establish platform persistence; it must not post fills, cash events, lots, or financial results before those gates. Schema and metric work is a prerequisite, not retrospective documentation added after calculation code.

Phase 2 produces and reviews the design artifacts for G-03/G-04 and the foundational strategy/risk semantics in G-05. It does not satisfy their later executable migration, unit/property, concurrency or workflow-test obligations. Phase 4 implements and verifies those financial gates against the accepted design before exposing its financial writes. Advanced-subtype and individual analytic-method gates remain operation-specific and explicit.

Dependency order is requirements → approved architecture → financial-domain design and independent fixture definitions → platform identity/access → financial schema and executable fixtures → ledger/fills/lots/FX → strategy plans and recording → safe imports/corrections → full asset recording/settlement → risk/performance projections → complete review/export/restore workflows → final evidence. Basic security, responsive controls and observability begin with the platform and remain acceptance conditions throughout; Phase 10 completes their verification rather than introducing them for the first time.

## Incremental implementation and acceptance checklist

Checked items have the evidence recorded for their phase; unchecked items remain future work. Each implemented increment must remain runnable, preserve previous acceptance fixtures, and present only capabilities it actually provides. Maintain a progress file, assumptions, a metric dictionary, and a scenario-to-feature/test/fallback capability matrix during implementation.

### Phase 0: requirements

- [x] Read the complete specification and extract functional/non-functional requirements into the 20 requested groups.
- [x] Record ambiguities, architectural/data-model implications, missing decisions, and all 16 acceptance scenarios in [requirements-analysis.md](requirements-analysis.md).

### Phase 1: approved architecture documentation

- [x] Complete the proposed architecture, ADR set, boundaries, deployment shape, versioned-financial design, and development plan.
- [x] Review consistency against all requirement groups, distinguish proposal from implemented evidence, and verify document links.
- [x] Confirm that financial/schema/metric/fixture decisions have explicit gates and that no mandatory asset recording or core strategy workflow is silently deferred.
- [x] Record the final documentation-review result; then mark this phase complete as documentation only.
- [x] Stop at the architecture-documentation boundary without feature implementation. The corrected sequence places Phase 2 financial-domain documentation before Phase 3 scaffolding.

Historical Phase 1 validation: independent financial/security/coverage reviews completed. Corrected the auth response contract to keep session tokens out of JSON DTOs and aligned benchmark/startup definitions. Documentation checks passed for the eight Phase 1 ADRs, all local links/tables/fences/whitespace, D-01–D-20 coverage, and AC-01–AC-16 traceability. Git inspection at that phase's completion confirmed only its requested new documentation, with tracked source inputs unchanged and no staged files. Library engines/peers and key behavior were checked read-only through official package metadata and documentation. No application lint, type-check, build, financial tests or deployment was executed as part of Phase 1. Phase 2 rechecks the documentation; historical scaffold results are separate and do not imply an application exists now.

### Phase 2: approved financial-domain model

Design the financial foundation before rebuilding the scaffold or implementing a UI/ledger feature. Use the specification and approved architecture, retain every required asset family, and separate source facts from intent, derived inventory and observations.

- [x] Write the complete logical [domain model](domain-model.md), distinguishing Account, Broker, Instrument, Currency, Cash Movement, FX Conversion, Order, Execution, Trade/Campaign, Position, Lot and Strategy.
- [x] Define ownership-aware relationships, source provenance, immutable metadata/policy versions, lifecycle/completeness/reconciliation, lot-versus-campaign attribution and atomic correction/recompute boundaries.
- [x] Write [financial calculation conventions](financial-calculations.md) for cash, quantities, average entry, basis, realized/unrealized P&L, fees, FX and compatible account valuation; retain unavailable states and prevent double deductions.
- [x] Write the [instrument capability contract and matrix](instrument-capabilities.md) for every required family, narrow native candidates, unsupported automatic operations and functional manual settlement paths.
- [x] Define [independent financial fixtures](financial-fixtures.md), including partial fills, scaling, fractions, shorts, multiple accounts, fees, transfers, corrections and multi-currency effects, with planned executable test obligations.
- [x] Correct the phase numbering and record that the old Phase 3 scaffold was reverted and Phase 4 is not implemented.
- [x] Complete independent financial/model/coverage review and resolve material internal inconsistencies; leave advanced module-specific validation gates explicit.
- [x] Verify all completed Phase 0/1/2 documentation against the authoritative specification, local links, tables/fences, arithmetic examples and change scope; record actual outcomes and unavailable application commands in [phase-2-validation.md](phase-2-validation.md).

Evidence for this phase is reviewed documentation and independently checked worked examples. It is not passing application tests, a live database, an implemented ledger or a tested capability claim. Do not recreate the scaffold, create a lockfile or claim clean-environment application checks during this phase.

### Phase 3: runnable platform scaffolding — current implementation

After the Phase 2 design review and G-02 authorization, establish the smallest working authenticated application and documented local services. The previous scaffold was reverted; every gate must be verified anew against this implementation. This phase produces an application shell and infrastructure contracts, not a purportedly complete trading journal.

- [x] Verify the proposed package/toolchain combination against official documentation; pin exact supported versions, lock dependencies, and record consequential deviations in ADRs.
- [x] Establish Next.js, TypeScript, PostgreSQL/Drizzle migrations, runtime contracts, lint/format/type checks, Vitest and real-database test infrastructure.
- [x] Implement controlled email/password bootstrap, disabled public signup, database sessions, workspace ownership, and centralized server authorization. Use the route-specific auth response gateway to preserve cookies while returning safe DTOs without session tokens; test login/logout/revocation and denial at server boundaries, not only hidden UI links.
- [x] Add responsive light/dark shell, keyboard/focus/contrast foundations, English localization-ready labels, locale-aware formatting, configurable IANA timezone and currency preferences, honest empty/loading/error states.
- [x] Document local startup/configuration and preferably a container option; configure health checks and Pino redaction with secrets absent from source/logs.
- [x] Demonstrate login/logout and persisted workspace preferences across reload/restart. Disable not-yet-implemented primary actions with clear explanations.
- [x] From a clean supported environment, verify frozen installation, application startup, database connection, reviewed migrations, tests, lint, type-check and production build. Record exact commands/results; do not proceed to financial features if any gate fails.

Evidence: migration/bootstrap/session integration tests and a shell end-to-end journey. Begin **AC-14** and **AC-16** coverage; these scenarios remain incomplete until financial records, exports, attachments and the other core journeys exist.

Current evidence: [scaffold validation](scaffold-validation.md) records all eight clean-environment gates, 86 unit/UI tests, 45 PostgreSQL integration tests, five browser/axe journeys, real development/standalone startup and process-restart persistence. Phase 4 remains unstarted.

### Phase 4: financial schema and foundations

Resolve G-03/G-04 before financial writes. Establish and exercise a complete ordinary-linear-asset slice from manual input to persisted cash/holdings and reviewable native/reporting totals.

- [ ] Define the minimum entity inventory from requirements §4, ownership-aware relationships, decimal column precision, source-time provenance, trade/settlement/valuation times, calculation versions and migration invariants. Canonical domain identity is `(workspace_id, id)` with UUIDv4 domain IDs and composite tenant references; authentication identities are separate.
- [ ] Define currency-aware balancing and explicit posting rules for opening balances, deposits/withdrawals, fills, fees/carrying costs, transfers and actual FX conversions. Atomic writes link postings to their originating events and retain audit history.
- [ ] Implement account/broker setup for cash/margin/paper/historical accounts; historical opening lots support known/unknown basis; separate settled/unsettled funds and broker-reported margin freshness.
- [ ] Implement ordinary linear long/short and fractional fills, partial exits, FIFO/eligible average/explicit lot handling, fee currency preservation, allocation conservation, remaining lots and correction/rebuild primitives.
- [ ] Preserve transfer lineage; keep campaign attribution distinct from lot realization; support unallocated/unclassified activity without inventing intent or prior profit.
- [ ] Record actual conversions independently of historical reporting rates. Test native trading P&L, translated P&L, cash/holding FX effects and total account change reconciliation; current rates/reporting-currency changes do not rewrite original history.
- [ ] Persist manual prices/FX/account valuations with provenance and data-status flags. Show missing values as unavailable; expose cash/positions/equity/realized-unrealized views and supporting source records.

Evidence: hand-calculated/unit/property tests for decimals, balanced postings, quantity/cost conservation, lot allocation, immutable FX and reversals; real-PostgreSQL atomicity/concurrency tests; manual account-to-fill-to-portfolio journey. Initial **AC-01**, **AC-02**, **AC-04**, **AC-09**, **AC-10**, **AC-13**, **AC-14**, **AC-16** coverage; later phases complete their cross-workflow cases.

### Phase 5: strategies, plans, and trading ideas

Resolve G-05 and build the core playbook and guided/advanced entry as functioning journeys using Phase 4 financial services.

- [ ] Provide strategy list/detail/editor/history/linked-trade/comparison workflows. Capture all specified descriptive, eligibility, regime, entry/invalidation, management/exit, sizing/limit, checklist/example/reference and schedule fields.
- [ ] Separate named setups from strategies; version rules/effective dates, typed parameters and custom fields without source edits. Keep unclassified trades visible.
- [ ] Freeze original plans and original risk; label retrospective imported/late plans and log changes. Separate manual/automatic rule assessments; missing required input never becomes a pass.
- [ ] Implement campaign/leg/order/fill separation, concurrent ideas in one instrument, conserved fill cost/quantity splits, explicit completion/reopening, and separate lifecycle/completeness/reconciliation dimensions.
- [ ] Support open/partial/closed/canceled-no-execution/imported-incomplete/reconciled presentations; canceled orders create no holdings/P&L and hypotheticals remain separate.
- [ ] Provide guided relevant-field entry and advanced editing with duplicate protection and keyboard operation. Each idea has plan-versus-actual, execution/cash timeline, leg/lot allocations, financial breakdown, audit history, rule outcomes and review fields.
- [ ] Link mistakes/emotions/lessons/tags, notes and draft autosave; show strategy/version/setup comparison sample sizes and completeness. Complete advanced performance in Phase 8 and media storage in Phase 9.

Evidence: frozen-plan/version/risk fixtures, shared-fill conservation integration tests, and guided recording/version-change/review end-to-end journeys. Complete principal **AC-02**, **AC-03**, **AC-12** recording cases and extend **AC-14**, **AC-16**.

### Phase 6: imports, corrections, and reconciliation

Pass G-06 for import identity/commit/reversal and source storage before accepting financial uploads. Universal CSV is a core feature independent of named broker adapters.

- [ ] Implement delimiter/decimal/date/timezone mapping, saved templates, field/source previews, row validation and an explicit dry run before commit.
- [ ] Import instruments, fills, cash events, opening balances/holdings, valuations and position observations with original files/rows and broker identifiers retained privately. Enforce proposed configurable defaults of 100 MiB per source file and 100,000 rows; the 50,000-row benchmark is within these limits.
- [ ] Require review of ambiguous symbols, inconsistent signs, fee currencies, unsupported metadata, incomplete rows and duplicates. Stable broker IDs or documented scoped fingerprints make identical reimports no-ops; changed rows become offered corrections.
- [ ] Reconcile execution-linked cash rows instead of duplicate posting; define reviewed position snapshots/opening lots so imported observations do not silently override derived holdings.
- [ ] Provide batch summaries/errors, safe partial imports, atomic dependency groups, auditable correction/restatement and downstream-aware batch reversals. Large work uses durable jobs with progress, retry safety and a truthful final status.
- [ ] Compare quantity/cash/equity with reconciliation dates and variance reports; preserve audit/lot history after corrections and transfers.

Evidence: independent CSV examples, sign/date/DST/mapping cases, duplicate/correction/import-reversal fixtures, real-database failure/retry tests and preview-to-reconciliation end-to-end journeys. Complete **AC-11** and the correction branch of **AC-09**; repeat **AC-01**, **AC-02**, **AC-10**, **AC-14**, **AC-16** through imports.

### Phase 7: every asset family and capability-aware settlement

This phase cannot finish by recording stocks alone. Every family below must support identification, metadata validation, categorization, manual/import recording, notes and review; event-specific settlement must work at its declared support level.

- [ ] Cover stocks/ETFs/exchange-traded products/mutual and other funds; crypto spot/token transfers and configurable staking/rewards; spot FX/multiple currency balances; commodities/custom units.
- [ ] Cover exchange-traded futures expiry/rolls/tick/multiplier/variation margin; linear and inverse crypto futures/perpetuals funding/collateral; options on supported underlying families with premiums/multipliers/multi-leg exercise/assignment or explicit settlement.
- [ ] Cover bonds/bills/fixed income with quantity/price/accrued-interest conventions or explicit broker-valued fallback; CFDs/leveraged OTC; warrants/turbo-knockout/factor certificates/structured products.
- [ ] Record dividend/corporate-action flows and resulting cash/holding/lot changes with provenance. No full-notional futures debit, generic inverse-contract P&L, or fabricated advanced valuation.
- [ ] Register subtype metadata, validators, valuation/cash-event handling and fixtures through a supported extension contract. Only vetted server modules or constrained expressions may implement formulas.
- [ ] Document and display per-operation capabilities: tested native calculations; analysis using explicit compatible broker values/settlements; unsupported automatic calculations with reason and safe manual fallback. Never silently mix incompatible definitions.
- [ ] Extend each native module only after independent fixtures and authoritative convention checks pass. Advanced native formulas may remain unimplemented if their explicit broker/manual recording, review and settlement workflows are complete and limitations are prominent.

Evidence: module/metadata/event tests, example records across every family and supported derivative/fixed-income settlement journeys. Complete **AC-05**, **AC-06**, **AC-07**, **AC-08**, and the dividend/corporate-action branch of **AC-09**. Verify every-family recording beyond these four highlighted asset scenarios.

### Phase 8: risk, accounting performance, and analytics

Use the gated metric dictionary and risk semantics, with no separate UI formula engine. Complete input sufficiency and source/provenance handling before showing derived cards/charts.

- [ ] Implement account/strategy policy precedence and per-trade, daily/weekly loss, concurrent-position, concentration, leverage/exposure, overnight and prohibited-instrument assessments. Show actionable breaches and unknowns; no invented default limit or exact generic broker buying power.
- [ ] Supply pre-trade sizing for validated instruments with currencies/multiplier/cost/stop/lot increments. Complex/nonlinear structures use documented scenarios/max-loss or explicit manual initial risk; explain stop risk limitations.
- [ ] Preserve original R denominator with a documented scale-in/multi-leg/risk-addition treatment; missing original risk gives unavailable R.
- [ ] Complete specified P&L/cost, completed-trade/win/breakeven/payoff/profit-factor/expectancy/R/distribution/streak/duration/turnover metrics and breakdowns by all required dimensions. Partial ideas stay out of completed populations; open gains have explicit portfolio populations.
- [ ] Show raw equity/NAV separately from cash-flow-adjusted performance, conditional TWR/MWR, source-defined drawdown/recovery and strategy/version attribution. Flows cannot imitate profit/recovery; percentages/R are never summed into portfolio return.
- [ ] Implement conditional MAE/MFE with observation resolution and slippage against recorded references; no price path inferred from fills and no double deduction of spread/slippage. Sharpe/Sortino/benchmark metrics remain optional.
- [ ] Provide matching date/account/currency filters, visible active filters, cross-filtering, chart/card/source drill-down, labels/units/legends/tooltips, accessible tables and useful empty/error states. Missing data, tiny samples, infinite/undefined ratios, stale/manual prices and approximation limits are explicit.

Evidence: independent metric and risk fixtures, solver/undefined/missing-data cases, cross-filter/source-drill-down end-to-end journeys and bounded-query checks. Complete **AC-01**, **AC-04**, **AC-10**, **AC-12**, **AC-13** analytics aspects; preserve **AC-02**, **AC-03** population/allocation correctness.

### Phase 9: journal, media, exports, backups, and user workflow completion

Complete G-06 storage/restore contracts before file and backup workflows. Ordinary notes and security prerequisites may be introduced earlier; this increment completes the specified journeys.

- [ ] Provide daily notes, session preparation/end-of-session, weekly/monthly reviews, goals, recurring mistakes/improvement actions, templates and configurable emotions/process quality. Link reviews to ideas/strategies/periods; deterministic summaries work without AI.
- [ ] Add private before/during/after screenshots, strategy examples and reference documents with size/type checks, safe rendering/sanitization, server authorization and controlled delivery. The proposed configurable attachment limit is 20 MiB. Extend authorization tests to stored import source files.
- [ ] Complete persistent preferences, searchable/filterable/sortable/paginated tables, column selection, saved views, sensible defaults/inline validation and working quick actions. Review draft autosave/conflict behavior.
- [ ] Export filtered trades, fills, cash, strategies, reviews and analytics with consistent filters/currencies/populations and spreadsheet-formula protection.
- [ ] Provide lossless versioned workspace JSON backup plus the documented private-file package/manifest; preserve IDs/relationships/source broker/import/audit provenance and calculation versions. Initially restore only into a new/empty workspace: remap the workspace namespace, retain domain IDs/relationships, and map owner identity deliberately. Merge into a populated workspace is outside this initial restore capability.
- [ ] Test backup/restore and derived rebuild fidelity, atomic/restart-safe jobs and truthful progress. Enforce a proposed configurable 1 GiB expanded-restore limit and safe archive handling. Document operational database/file backups independently of application workspace export; exclude authentication/users/sessions/secrets from portable workspace backups.
- [ ] Supply isolated labeled demo data spanning currencies/accounts/assets/strategies/partial fills/gains/losses/missing data; real workspaces begin empty and have no fabricated live numbers.

Evidence: journal/autosave and attachment journeys, malicious-file/export tests, cross-workspace file/export denial, independent backup round trip and restart/retry integration tests. Complete **AC-14**, **AC-15**; extend **AC-16** across all core journeys.

### Phase 10: whole-product verification and delivery

Pass G-07. Completion is based on functioning workflows and evidence, including manual advanced-asset fallbacks, not build success or decorative screens.

- [ ] Run all mandatory scenario journeys under the declared capability matrix; retain independent financial unit/property/integration fixtures and explain limitations rather than overstating support.
- [ ] Exercise main actions at desktop/tablet/mobile sizes; inspect actual UI, keyboard focus/operation, contrast, non-color status, charts/tables, filters, localization formatting and empty/loading/error states. Target WCAG 2.2 AA for core flows; disclose automated/manual verification limits.
- [ ] Complete workspace authorization, auth/session, CSRF/rate-limit, request validation, private files, input limits, malicious import, spreadsheet export and secret/log-redaction checks; absence of an external provider must not break primary workflows.
- [ ] Verify representative-history performance, bounded pagination, indexes/query plans, cache invalidation and absence of N+1/unbounded loads; execute representative import/rebuild/restore and restart/retry checks.
- [ ] Run and document local setup from a clean supported environment, reviewed migrations/bootstrap, safe demo/import examples, backup/restore and vendor-independent deployment instructions.
- [ ] Deliver source/migrations/tests/configuration template and concise setup/architecture/domain/calculation/metric/support/import/extension/operations documentation. Maintain progress/capability evidence and report actual commands/results, material limitations and any optional credentials still needed.

No phase authorizes live trade placement, live brokerage credential connection or public deployment. Do not describe the result as production-ready merely because it compiles. All 16 acceptance scenarios must have evidence at the delivered capability level before claiming the mandatory scope complete.

## Acceptance scenario traceability

All application acceptance statuses below are **planned, not executed in the current checkout**. Phase 2 supplies independent fixture designs in [financial-fixtures.md](financial-fixtures.md), not executable financial tests. The eventual capability matrix must add concrete feature names, test identifiers, implemented support level, manual fallback and limitations. Phase 10 reruns the complete product-level matrix.

| Scenario | Required observable outcome                                                                                                       | First implementation stages; final verification                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| AC-01    | EUR account, two EUR/USD conversions/fees, USD stock partial closes, later FX valuation; history unchanged and balances reconcile | 4 financial/FX slice; 6 import route; 8 analytics; 10 end-to-end                       |
| AC-02    | Multiple fills/partial exits conserve remaining quantity, cost, fees and completion status                                        | 4 lots/costs; 5 lifecycle/editor; 6 imports; 10                                        |
| AC-03    | Concurrent same-instrument strategies split a fill without duplicated quantity/cost                                               | 4 allocation invariants; 5 strategy/campaign journey; 8 populations; 10                |
| AC-04    | Short position incorporates fees and borrow costs                                                                                 | 4 shorts/carry; 8 financial breakdown; 10                                              |
| AC-05    | Option premium/multiplier/multi-leg recording and supported exercise/assignment or explicit settlement                            | 5 multi-leg campaign model; 7 capability-specific option journey; 10                   |
| AC-06    | Futures tick/multiplier/settlement and supported perpetual funding; no full-notional default debit                                | 4 posting extension boundary; 7 derivative event journeys; 10                          |
| AC-07    | Fixed-income quantity/price/accrued interest or explicit broker-valued fallback                                                   | 7 recording/settlement/support labels; 10                                              |
| AC-08    | Structured/custom unsupported automatic pricing still supports recording/manual settlement and honest unavailable metrics         | 7 capability/manual journey; 8 unavailable analytics; 10                               |
| AC-09    | Dividend/corporate action, internal transfer, unknown opening basis, post-import correction retain coherent records               | 4 opening/transfer; 6 correction; 7 corporate-action event; 10                         |
| AC-10    | External flows are not trade profit; internal transfers are not consolidated external flows                                       | 4 ledger classification; 6 reconciliation; 8 performance curves; 10                    |
| AC-11    | Identical reimport changes no counts/balances; invalid rows cannot corrupt valid records                                          | 6 dry run/idempotency/errors/reversal; 10                                              |
| AC-12    | Strategy version updates preserve old plans; absent original risk means unavailable R                                             | 5 versions/plan/risk snapshot; 8 R metrics; 10                                         |
| AC-13    | Missing prices/FX, no trades/no losing trades, tiny samples and undefined ratios are transparent                                  | 3 empty-state foundation; 4 missing observations; 8 metric edge cases; 10              |
| AC-14    | Another user cannot access records, exports or attachments                                                                        | 3 authentication/ownership; 4–8 record boundaries; 6 source files; 9 files/exports; 10 |
| AC-15    | Backup/restore reproduces records and derived totals under the same calculation version                                           | 4 deterministic rebuild/version foundation; 9 actual round trip; 10                    |
| AC-16    | Core workflows need no integration and survive reload/server restart                                                              | 3 persistent shell; 4–9 each runnable slice; 10 complete journeys                      |

## Proposed performance budget and benchmark contract

These are initial engineering targets, not thresholds supplied by the specification or measured results. Validate and tune them before performance acceptance; retain recorded measurements and explain any agreed adjustment. Proposed reference deployment is **4 vCPU / 8 GiB RAM** for the application, PostgreSQL and one worker, with local SSD-backed storage and no market/AI API calls on measured paths. Record exact software patches, database configuration, hardware/storage, seed, browser/network setup, concurrent readers, job activity and warm/cold cache state for reproducibility.

The representative large dataset contains **1,000,000 fills, at least 2,000,000 ledger postings, 100,000 campaigns and 100,000 observations**, plus relevant accounts, currencies, instruments, strategy versions and allocation/import/audit history. It includes fractional/short/partial/multi-currency cases, realistic dates/filters, fees, missing data and uneven account sizes. Record actual event-dependent posting counts; never force two postings per fill where financial semantics require more. Include at least two workspaces for isolation checks. Demo data remains separate from this deterministic benchmark seed.

| Operation                           | Provisional target | Measurement boundary                                                                                                                                                 |
| ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded indexed list/filter page    | p95 ≤ 500 ms       | Authenticated server request including authorization, SQL and serialization for a 50-row page; no unbounded total-history fetch                                      |
| Bounded account/portfolio summary   | p95 ≤ 1 s          | Server response for a documented account/date/currency query; returns provenance and unavailable status, not a fresh unrestricted full-history rebuild               |
| Browser first meaningful data       | p95 ≤ 2 s          | Authenticated navigation to a documented core data view on a controlled desktop browser/network baseline; include server and browser work                            |
| 50,000-row CSV import               | ≤ 120 s            | Worker validation/commit runtime after upload and completed mapping/review; report dry-run and commit separately, include durable job/database work and final result |
| Full 1,000,000-fill derived rebuild | ≤ 10 min           | Worker time to reconstruct and validate dependent projections at the same calculation version; preserve ledger/source truth and disclose progress                    |

Use ten concurrent authenticated read sessions for warm list/summary runs; record p50/p95, errors, query counts/plans, resource peaks and actual dataset sizes. Repeat representative reads while one heavy worker job runs and report contention. Report cold navigation and per-asset/import complexity separately instead of treating one favorable case as universal evidence. Limits and worker concurrency must keep the reference machine usable; batching must preserve financial invariants. Failed budgets require a diagnosed index/query/projection/batching correction or an explicit recorded target revision, not hidden smaller seeds.

## Check commands and future workflow checks

Phase 3 supplies install/dev/migration/format/lint/type/unit/integration/browser/build commands, documented in [README](../README.md). `test:a11y` is integrated into `test:e2e` with axe rather than a separate script. Performance and restore commands below remain future workflow obligations, not currently available checks.

| Command / future obligation      | Purpose and first relevant stage                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Reproduce verified locked dependencies; 3 onward                                                           |
| `pnpm dev` / `pnpm dev:worker`   | `dev` starts web and worker together; `dev:worker` starts the worker independently for debugging; 3 onward |
| `pnpm db:migrate`                | Apply reviewed migrations to the explicitly configured development/test database; 3 onward                 |
| `pnpm format:check`              | Documentation/source formatting; 3 onward                                                                  |
| `pnpm lint`                      | ESLint checks; 3 onward                                                                                    |
| `pnpm typecheck`                 | TypeScript checks; 3 onward                                                                                |
| `pnpm test:unit`                 | Vitest and meaningful fast-check properties; harness in 3, financial cases from 4                          |
| `pnpm test:integration`          | Isolated real-PostgreSQL migrations/transactions/authorization/import/restore; 3 onward                    |
| `pnpm test:e2e`                  | Playwright main journeys; 3 onward as each journey exists                                                  |
| `pnpm test:a11y`                 | axe plus documented manual keyboard/contrast/reader checks; 3 onward, complete at 10                       |
| `pnpm test:performance`          | Representative seed/query/import/rebuild benchmark; 4 foundation, complete at 10                           |
| `pnpm db:migrate:check`          | Reviewed migrations on clean and upgrade-path test databases; 3 onward                                     |
| `pnpm test:restore`              | Workspace/files restore and same-version derived totals; 9 onward                                          |
| `pnpm build`                     | Production build validation; 3 onward; does not establish accounting correctness                           |

Local development, worker and database-start commands must be documented after scaffolding. Integration/restore tests use isolated test databases and private test storage; they must not overwrite user workspaces. Run checks appropriate to the change, fix failures, and attach actual evidence to the increment. Broaden/repeat checks when new work or a failure warrants it.

## Optional integrations and retained scope

Manual entry, universal CSV, explicit broker-valued advanced records, manual price/FX, deterministic reviews and all mandatory acceptance scenarios are independent of external integrations. No unavailable API credential may block that core.

Named broker adapters require real or documented source samples and tests against the common contract. External prices/FX preserve timestamp/source/status and historical observations. Optional AI is disabled until configured, provider-neutral, uses only selected journal context and calculated aggregates, previews outgoing data, cites supporting trades, distinguishes interpretation/facts and sample limits, and cannot change posted records without an explicit reviewed action. Optional Sharpe/Sortino/benchmark and jurisdiction-specific tax modules require their own validated inputs/conventions; tax compliance is never implied by ordinary record exports.

If an integration is later pursued but unavailable, provide its interface, working manual fallback, configuration documentation and truthful status. The progress/capability records must retain advanced native-calculation limitations without disguising them as automatic support. Completion still requires the complete record/import/review/settlement journeys for **every** listed asset family, the core strategy workspace, financial foundations, risk/analytics, journals, files, exports and tested restore.

The current authorized action is Phase 3 foundation implementation and verification. Phase 4 ledger features remain gated by scaffold validation and executable financial invariants. Deployment, commits and pushes require their corresponding user instructions.
