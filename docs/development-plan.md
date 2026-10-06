# Development plan

## Authority and current status

The [product specification](../Trading_Journal_Codex_Prompt.md) is authoritative. [Requirements analysis](requirements-analysis.md) supplies requirement identifiers, the 16 acceptance scenarios (`AC-01`–`AC-16`), and missing decisions (`D-01`–`D-20`). This plan sequences that full scope; it does not replace or reduce it.

**The user approved the architecture and authorized platform scaffolding.** The user's current **Phase 3 scaffold** corresponds to this original roadmap's **Phase 2 platform increment**. Phase 0 and Phase 1 documentation/review are complete, and the ADRs are accepted architecture decisions. Platform foundations are implemented and all eight required clean-environment checks have passed. This authorization does not include the subsequent financial schema/ledger, product features, imports, strategies or analytics. The original roadmap numbering below is retained so the financial Phase 3 is not confused with the user's scaffold Phase 3.

| Phase          | Result                                                                     | Current status                                                         |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 0              | Requirements extraction and ambiguity/decision inventory                   | Complete: requirements-analysis document exists                        |
| 1              | Architecture proposal, ADRs, boundaries, and this gated plan               | Documentation/review complete; architecture approved and ADRs accepted |
| 2              | Runnable platform scaffolding and security foundations                     | User Phase 3: foundations implemented; clean verification passed       |
| 3              | Schema, financial kernel, ledger, ordinary linear assets, holdings, and FX | Not started                                                            |
| 4              | Strategies, frozen plans, trade workflows, and reviewable allocations      | Not started                                                            |
| 5              | Universal imports, corrections, and reconciliation                         | Not started                                                            |
| 6              | Recording/review and settlement workflows for every asset family           | Not started                                                            |
| 7              | Risk monitoring, portfolio performance, and drill-down analytics           | Not started                                                            |
| 8              | Journal workflows, attachments, saved views, exports, and restore          | Not started                                                            |
| 9              | Complete security/accessibility/performance verification and delivery      | Not started                                                            |
| Optional track | Chosen broker/provider integrations and optional metrics                   | Unscheduled; not a prerequisite for the manual core                    |

Implementation statuses and acceptance evidence must be updated after actual work. [Scaffold validation](scaffold-validation.md) records platform evidence; [README](../README.md) gives current commands. Passing platform tests does not establish any financial product capability or completion of AC-01–AC-16.

## Approved technical baseline

The following selections are approved architecture decisions. Scaffolding has verified and pinned its required toolchain/packages in manifests and the frozen lockfile; README and the validation record describe actual versions/checks. Tools for future table/chart/rule/instrument workflows are introduced when their scope is authorized. Accepted architecture does not mean financial formulas, detailed posting policies or the entire product are implemented or validated.

| Concern                 | Proposed baseline                                                                                                                                                                   | Decision reference                                               |
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

The approved pnpm workspace now establishes `apps/web` and `apps/worker`, with shared `packages/domain` (pure types/decimal foundations; financial rules remain gated), `contracts` (public Zod contracts), `database` (platform schema/repositories/migrations), `server` (application services, ports and infrastructure composition), and `ui` (React components). The scaffold introduces those boundaries without implementing the full business domain. The Next.js server exposes `/api/v1` through Route Handlers and calls the same application-service boundary as the worker; no separate backend API, microservice tier, tRPC or Turbo dependency is introduced. Future financial DTOs retain decimal-string contracts. Zod-to-OpenAPI 9 and openapi-typescript 7 generate the OpenAPI 3.1 contract/typed client. TypeScript 5.9 remains the verified compatibility baseline.

## Gates and dependency order

Each gate has a reviewable artifact and a verification obligation. Engineering can resolve reversible choices within a later authorized scope; missing credentials, incompatible business requirements, or scope reductions remain explicit blockers for the affected work. No trade capital, broker, strategy, or risk limit is assumed.

| Gate                                           | Required before proceeding                                                                                                                                                                                                                                                                                                    | Decisions covered                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| G-01: architecture documentation               | Proposed ADRs and boundaries are consistent with the specification; all acceptance scenarios and categories remain scheduled; links/statuses are checked. Mark Phase 1 documentation complete only after this review.                                                                                                         | D-01–D-20, at proposal level      |
| G-02: implementation authorization and tooling | A new user instruction permits the next implementation scope. Official compatibility checks, exact versions, local run topology, private configuration, authentication bootstrap, and test harness are documented.                                                                                                            | D-01, D-02, D-17, D-20            |
| G-03: schema and financial semantics           | Logical/physical schema, relationship/state model, ownership constraints, posting examples, decimal/rounding/time conventions, allocation and lot rules, FX decomposition, and correction/recompute policy are reviewed. Migration checks protect these invariants.                                                           | D-03–D-09, D-13                   |
| G-04: metric and fixture foundation            | A versioned metric dictionary defines populations, formulas, units, costs, time basis, currency handling, availability and edge cases. Independent hand-calculated fixtures and official instrument references define expected ledger/holdings/FX results. Required financial invariants have meaningful unit/property tests. | D-04, D-05, D-07–D-09, D-12, D-20 |
| G-05: strategy and risk semantics              | Frozen/retrospective plans, rule versions and typed fields, lifecycle/reopening, policy precedence, original-R denominator, risk additions, calendars and unknown assessments are defined.                                                                                                                                    | D-06, D-10, D-11                  |
| G-06: safe ingestion and storage               | Identity/fingerprint scopes, symbol review, row/batch commit units, corrections, source-file access, reconciliation tolerances and dependency-safe reversal are defined and tested. Private-file and restore contracts cover limits, ownership and calculation/schema versions.                                               | D-14, D-15                        |
| G-07: delivery evidence                        | All mandatory scenario workflows pass at declared capability levels; security, restore, accessibility/responsiveness and representative performance are actually checked; remaining limitations are visible.                                                                                                                  | D-16–D-20 and all AC scenarios    |

**G-03 and G-04 must pass before the first application financial-write workflow.** Database/authentication setup in Phase 2 may establish platform persistence; it must not post fills, cash events, lots, or financial results before those gates. Schema and metric work is a prerequisite, not retrospective documentation added after calculation code.

Dependency order is platform identity/access → financial schema and independent fixtures → ledger/fills/lots/FX → strategy plans and recording → safe imports/corrections → full asset recording/settlement → risk/performance projections → complete review/export/restore workflows → final evidence. Basic security, responsive controls and observability begin with the platform and remain acceptance conditions throughout; Phase 9 completes their verification rather than introducing them for the first time.

## Incremental implementation and acceptance checklist

The checklist is prospective. Checked items indicate documentation that exists; unchecked items are future work. Each implemented increment must remain runnable, preserve previous acceptance fixtures, and present only capabilities it actually provides. Maintain a progress file, assumptions, a metric dictionary, and a scenario-to-feature/test/fallback capability matrix during implementation.

### Phase 0: requirements

- [x] Read the complete specification and extract functional/non-functional requirements into the 20 requested groups.
- [x] Record ambiguities, architectural/data-model implications, missing decisions, and all 16 acceptance scenarios in [requirements-analysis.md](requirements-analysis.md).

### Phase 1: architecture documentation — complete and approved

- [x] Complete the proposed architecture, ADR set, boundaries, deployment shape, versioned-financial design, and development plan.
- [x] Review consistency against all requirement groups, distinguish proposal from implemented evidence, and verify document links.
- [x] Confirm that financial/schema/metric/fixture decisions have explicit gates and that no mandatory asset recording or core strategy workflow is silently deferred.
- [x] Record the final documentation-review result; then mark this phase complete as documentation only.
- [x] Stop at the documentation boundary. Identify Phase 2 as next without creating scaffold files or installing dependencies.

Phase 1 validation: independent financial/security/coverage reviews completed. Corrected the auth response contract to keep session tokens out of JSON DTOs and aligned benchmark/startup definitions. Documentation checks passed for the eight ADRs, all local links/tables/fences/whitespace, D-01–D-20 coverage, and AC-01–AC-16 traceability. Git inspection at that stage confirmed only the requested documentation, with tracked source inputs unchanged and no staged files. Library engines/peers and key behavior were checked read-only through official package metadata and documentation. No application lint, type-check, build, financial test or deployment was executed during Phase 1 itself. The architecture was subsequently approved, and platform implementation now has its own evidence below.

### Phase 2: runnable platform scaffolding — current user Phase 3

G-02 authorization/toolchain work is satisfied for the scaffold. The implementation supplies an authenticated shell and real database/auth/storage/worker foundations, not a complete trading journal. All eight clean-environment gates passed; see the scaffold record for commands, evidence and limitations.

- [x] Verify/pin the scaffold's compatible toolchain and exact required dependencies; keep a frozen lockfile and documented workspace boundaries.
- [x] Establish Next.js, strict TypeScript, PostgreSQL/Drizzle platform migrations, Zod/REST/OpenAPI contracts, check scripts, Vitest and real-database test infrastructure.
- [x] Implement controlled email/password bootstrap, disabled public signup, database sessions, workspace ownership and server authorization. The allowlisted gateway preserves cookies and returns safe DTOs without session tokens; the final verification record tracks login/logout/revocation and authorization evidence.
- [x] Add responsive light/dark shell, keyboard/focus/contrast foundations, English copy and honest empty/error/unavailable states. Browser theme selection is persisted locally; full server preference controls and date/currency product presentations remain future work.
- [x] Document startup/configuration and pinned PostgreSQL Compose services; provide web/worker liveness and protected web schema/database readiness, private filesystem foundations and Pino redaction.
- [x] Exercise actual sign-in, membership-scoped overview, reload and sign-out in three passing scaffold E2E tests. Keep trading actions disabled with explanations, without synthetic financial values.
- [x] Complete and record the coordinated clean verification, development/built startup and shutdown, persisted workspace reads, desktop/mobile visual inspection and local launcher observations. Production TLS rollout remains future operational work.

Evidence: the final clean run passed 24 unit tests, 24 real-PostgreSQL integration tests and three scaffold end-to-end tests, along with install, development/built startup, database connection, migrations, formatting, lint, strict type-check and production build. Both launchers released their ports on shutdown. Screenshots were inspected at desktop/mobile sizes; automated axe checks passed for the scaffold flows. [Scaffold validation](scaffold-validation.md) holds the final clean-run results and browser/environment limitations. This is partial foundation coverage for **AC-14** and **AC-16**; those scenarios remain incomplete until financial records, exports, attachments and complete core journeys exist. No financial feature is authorized or reported as implemented here.

### Phase 3: financial schema and foundations

Resolve G-03/G-04 before financial writes. Establish and exercise a complete ordinary-linear-asset slice from manual input to persisted cash/holdings and reviewable native/reporting totals.

- [ ] Define the minimum entity inventory from requirements §4, ownership-aware relationships, decimal column precision, source-time provenance, trade/settlement/valuation times, calculation versions and migration invariants. Canonical domain identity is `(workspace_id, id)` with UUIDv4 domain IDs and composite tenant references; authentication identities are separate.
- [ ] Define currency-aware balancing and explicit posting rules for opening balances, deposits/withdrawals, fills, fees/carrying costs, transfers and actual FX conversions. Atomic writes link postings to their originating events and retain audit history.
- [ ] Implement account/broker setup for cash/margin/paper/historical accounts; historical opening lots support known/unknown basis; separate settled/unsettled funds and broker-reported margin freshness.
- [ ] Implement ordinary linear long/short and fractional fills, partial exits, FIFO/eligible average/explicit lot handling, fee currency preservation, allocation conservation, remaining lots and correction/rebuild primitives.
- [ ] Preserve transfer lineage; keep campaign attribution distinct from lot realization; support unallocated/unclassified activity without inventing intent or prior profit.
- [ ] Record actual conversions independently of historical reporting rates. Test native trading P&L, translated P&L, cash/holding FX effects and total account change reconciliation; current rates/reporting-currency changes do not rewrite original history.
- [ ] Persist manual prices/FX/account valuations with provenance and data-status flags. Show missing values as unavailable; expose cash/positions/equity/realized-unrealized views and supporting source records.

Evidence: hand-calculated/unit/property tests for decimals, balanced postings, quantity/cost conservation, lot allocation, immutable FX and reversals; real-PostgreSQL atomicity/concurrency tests; manual account-to-fill-to-portfolio journey. Initial **AC-01**, **AC-02**, **AC-04**, **AC-09**, **AC-10**, **AC-13**, **AC-14**, **AC-16** coverage; later phases complete their cross-workflow cases.

### Phase 4: strategies, plans, and trading ideas

Resolve G-05 and build the core playbook and guided/advanced entry as functioning journeys using Phase 3 financial services.

- [ ] Provide strategy list/detail/editor/history/linked-trade/comparison workflows. Capture all specified descriptive, eligibility, regime, entry/invalidation, management/exit, sizing/limit, checklist/example/reference and schedule fields.
- [ ] Separate named setups from strategies; version rules/effective dates, typed parameters and custom fields without source edits. Keep unclassified trades visible.
- [ ] Freeze original plans and original risk; label retrospective imported/late plans and log changes. Separate manual/automatic rule assessments; missing required input never becomes a pass.
- [ ] Implement campaign/leg/order/fill separation, concurrent ideas in one instrument, conserved fill cost/quantity splits, explicit completion/reopening, and separate lifecycle/completeness/reconciliation dimensions.
- [ ] Support open/partial/closed/canceled-no-execution/imported-incomplete/reconciled presentations; canceled orders create no holdings/P&L and hypotheticals remain separate.
- [ ] Provide guided relevant-field entry and advanced editing with duplicate protection and keyboard operation. Each idea has plan-versus-actual, execution/cash timeline, leg/lot allocations, financial breakdown, audit history, rule outcomes and review fields.
- [ ] Link mistakes/emotions/lessons/tags, notes and draft autosave; show strategy/version/setup comparison sample sizes and completeness. Complete advanced performance in Phase 7 and media storage in Phase 8.

Evidence: frozen-plan/version/risk fixtures, shared-fill conservation integration tests, and guided recording/version-change/review end-to-end journeys. Complete principal **AC-02**, **AC-03**, **AC-12** recording cases and extend **AC-14**, **AC-16**.

### Phase 5: imports, corrections, and reconciliation

Pass G-06 for import identity/commit/reversal and source storage before accepting financial uploads. Universal CSV is a core feature independent of named broker adapters.

- [ ] Implement delimiter/decimal/date/timezone mapping, saved templates, field/source previews, row validation and an explicit dry run before commit.
- [ ] Import instruments, fills, cash events, opening balances/holdings, valuations and position observations with original files/rows and broker identifiers retained privately. Enforce proposed configurable defaults of 100 MiB per source file and 100,000 rows; the 50,000-row benchmark is within these limits.
- [ ] Require review of ambiguous symbols, inconsistent signs, fee currencies, unsupported metadata, incomplete rows and duplicates. Stable broker IDs or documented scoped fingerprints make identical reimports no-ops; changed rows become offered corrections.
- [ ] Reconcile execution-linked cash rows instead of duplicate posting; define reviewed position snapshots/opening lots so imported observations do not silently override derived holdings.
- [ ] Provide batch summaries/errors, safe partial imports, atomic dependency groups, auditable correction/restatement and downstream-aware batch reversals. Large work uses durable jobs with progress, retry safety and a truthful final status.
- [ ] Compare quantity/cash/equity with reconciliation dates and variance reports; preserve audit/lot history after corrections and transfers.

Evidence: independent CSV examples, sign/date/DST/mapping cases, duplicate/correction/import-reversal fixtures, real-database failure/retry tests and preview-to-reconciliation end-to-end journeys. Complete **AC-11** and the correction branch of **AC-09**; repeat **AC-01**, **AC-02**, **AC-10**, **AC-14**, **AC-16** through imports.

### Phase 6: every asset family and capability-aware settlement

This phase cannot finish by recording stocks alone. Every family below must support identification, metadata validation, categorization, manual/import recording, notes and review; event-specific settlement must work at its declared support level.

- [ ] Cover stocks/ETFs/exchange-traded products/mutual and other funds; crypto spot/token transfers and configurable staking/rewards; spot FX/multiple currency balances; commodities/custom units.
- [ ] Cover exchange-traded futures expiry/rolls/tick/multiplier/variation margin; linear and inverse crypto futures/perpetuals funding/collateral; options on supported underlying families with premiums/multipliers/multi-leg exercise/assignment or explicit settlement.
- [ ] Cover bonds/bills/fixed income with quantity/price/accrued-interest conventions or explicit broker-valued fallback; CFDs/leveraged OTC; warrants/turbo-knockout/factor certificates/structured products.
- [ ] Record dividend/corporate-action flows and resulting cash/holding/lot changes with provenance. No full-notional futures debit, generic inverse-contract P&L, or fabricated advanced valuation.
- [ ] Register subtype metadata, validators, valuation/cash-event handling and fixtures through a supported extension contract. Only vetted server modules or constrained expressions may implement formulas.
- [ ] Document and display per-operation capabilities: tested native calculations; analysis using explicit compatible broker values/settlements; unsupported automatic calculations with reason and safe manual fallback. Never silently mix incompatible definitions.
- [ ] Extend each native module only after independent fixtures and authoritative convention checks pass. Advanced native formulas may remain unimplemented if their explicit broker/manual recording, review and settlement workflows are complete and limitations are prominent.

Evidence: module/metadata/event tests, example records across every family and supported derivative/fixed-income settlement journeys. Complete **AC-05**, **AC-06**, **AC-07**, **AC-08**, and the dividend/corporate-action branch of **AC-09**. Verify every-family recording beyond these four highlighted asset scenarios.

### Phase 7: risk, accounting performance, and analytics

Use the gated metric dictionary and risk semantics, with no separate UI formula engine. Complete input sufficiency and source/provenance handling before showing derived cards/charts.

- [ ] Implement account/strategy policy precedence and per-trade, daily/weekly loss, concurrent-position, concentration, leverage/exposure, overnight and prohibited-instrument assessments. Show actionable breaches and unknowns; no invented default limit or exact generic broker buying power.
- [ ] Supply pre-trade sizing for validated instruments with currencies/multiplier/cost/stop/lot increments. Complex/nonlinear structures use documented scenarios/max-loss or explicit manual initial risk; explain stop risk limitations.
- [ ] Preserve original R denominator with a documented scale-in/multi-leg/risk-addition treatment; missing original risk gives unavailable R.
- [ ] Complete specified P&L/cost, completed-trade/win/breakeven/payoff/profit-factor/expectancy/R/distribution/streak/duration/turnover metrics and breakdowns by all required dimensions. Partial ideas stay out of completed populations; open gains have explicit portfolio populations.
- [ ] Show raw equity/NAV separately from cash-flow-adjusted performance, conditional TWR/MWR, source-defined drawdown/recovery and strategy/version attribution. Flows cannot imitate profit/recovery; percentages/R are never summed into portfolio return.
- [ ] Implement conditional MAE/MFE with observation resolution and slippage against recorded references; no price path inferred from fills and no double deduction of spread/slippage. Sharpe/Sortino/benchmark metrics remain optional.
- [ ] Provide matching date/account/currency filters, visible active filters, cross-filtering, chart/card/source drill-down, labels/units/legends/tooltips, accessible tables and useful empty/error states. Missing data, tiny samples, infinite/undefined ratios, stale/manual prices and approximation limits are explicit.

Evidence: independent metric and risk fixtures, solver/undefined/missing-data cases, cross-filter/source-drill-down end-to-end journeys and bounded-query checks. Complete **AC-01**, **AC-04**, **AC-10**, **AC-12**, **AC-13** analytics aspects; preserve **AC-02**, **AC-03** population/allocation correctness.

### Phase 8: journal, media, exports, backups, and user workflow completion

Complete G-06 storage/restore contracts before file and backup workflows. Ordinary notes and security prerequisites may be introduced earlier; this increment completes the specified journeys.

- [ ] Provide daily notes, session preparation/end-of-session, weekly/monthly reviews, goals, recurring mistakes/improvement actions, templates and configurable emotions/process quality. Link reviews to ideas/strategies/periods; deterministic summaries work without AI.
- [ ] Add private before/during/after screenshots, strategy examples and reference documents with size/type checks, safe rendering/sanitization, server authorization and controlled delivery. The proposed configurable attachment limit is 20 MiB. Extend authorization tests to stored import source files.
- [ ] Complete persistent preferences, searchable/filterable/sortable/paginated tables, column selection, saved views, sensible defaults/inline validation and working quick actions. Review draft autosave/conflict behavior.
- [ ] Export filtered trades, fills, cash, strategies, reviews and analytics with consistent filters/currencies/populations and spreadsheet-formula protection.
- [ ] Provide lossless versioned workspace JSON backup plus the documented private-file package/manifest; preserve IDs/relationships/source broker/import/audit provenance and calculation versions. Initially restore only into a new/empty workspace: remap the workspace namespace, retain domain IDs/relationships, and map owner identity deliberately. Merge into a populated workspace is outside this initial restore capability.
- [ ] Test backup/restore and derived rebuild fidelity, atomic/restart-safe jobs and truthful progress. Enforce a proposed configurable 1 GiB expanded-restore limit and safe archive handling. Document operational database/file backups independently of application workspace export; exclude authentication/users/sessions/secrets from portable workspace backups.
- [ ] Supply isolated labeled demo data spanning currencies/accounts/assets/strategies/partial fills/gains/losses/missing data; real workspaces begin empty and have no fabricated live numbers.

Evidence: journal/autosave and attachment journeys, malicious-file/export tests, cross-workspace file/export denial, independent backup round trip and restart/retry integration tests. Complete **AC-14**, **AC-15**; extend **AC-16** across all core journeys.

### Phase 9: whole-product verification and delivery

Pass G-07. Completion is based on functioning workflows and evidence, including manual advanced-asset fallbacks, not build success or decorative screens.

- [ ] Run all mandatory scenario journeys under the declared capability matrix; retain independent financial unit/property/integration fixtures and explain limitations rather than overstating support.
- [ ] Exercise main actions at desktop/tablet/mobile sizes; inspect actual UI, keyboard focus/operation, contrast, non-color status, charts/tables, filters, localization formatting and empty/loading/error states. Target WCAG 2.2 AA for core flows; disclose automated/manual verification limits.
- [ ] Complete workspace authorization, auth/session, CSRF/rate-limit, request validation, private files, input limits, malicious import, spreadsheet export and secret/log-redaction checks; absence of an external provider must not break primary workflows.
- [ ] Verify representative-history performance, bounded pagination, indexes/query plans, cache invalidation and absence of N+1/unbounded loads; execute representative import/rebuild/restore and restart/retry checks.
- [ ] Run and document local setup from a clean supported environment, reviewed migrations/bootstrap, safe demo/import examples, backup/restore and vendor-independent deployment instructions.
- [ ] Deliver source/migrations/tests/configuration template and concise setup/architecture/domain/calculation/metric/support/import/extension/operations documentation. Maintain progress/capability evidence and report actual commands/results, material limitations and any optional credentials still needed.

No phase authorizes live trade placement, live brokerage credential connection or public deployment. Do not describe the result as production-ready merely because it compiles. All 16 acceptance scenarios must have evidence at the delivered capability level before claiming the mandatory scope complete.

## Acceptance scenario traceability

All statuses below are **planned, not executed**. The eventual capability matrix must add concrete feature names, independent fixtures, test identifiers, implemented support level, manual fallback and limitations. Phase 9 reruns the complete product-level matrix.

| Scenario | Required observable outcome                                                                                                       | First implementation stages; final verification                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| AC-01    | EUR account, two EUR/USD conversions/fees, USD stock partial closes, later FX valuation; history unchanged and balances reconcile | 3 financial/FX slice; 5 import route; 7 analytics; 9 end-to-end                       |
| AC-02    | Multiple fills/partial exits conserve remaining quantity, cost, fees and completion status                                        | 3 lots/costs; 4 lifecycle/editor; 5 imports; 9                                        |
| AC-03    | Concurrent same-instrument strategies split a fill without duplicated quantity/cost                                               | 3 allocation invariants; 4 strategy/campaign journey; 7 populations; 9                |
| AC-04    | Short position incorporates fees and borrow costs                                                                                 | 3 shorts/carry; 7 financial breakdown; 9                                              |
| AC-05    | Option premium/multiplier/multi-leg recording and supported exercise/assignment or explicit settlement                            | 4 multi-leg campaign model; 6 capability-specific option journey; 9                   |
| AC-06    | Futures tick/multiplier/settlement and supported perpetual funding; no full-notional default debit                                | 3 posting extension boundary; 6 derivative event journeys; 9                          |
| AC-07    | Fixed-income quantity/price/accrued interest or explicit broker-valued fallback                                                   | 6 recording/settlement/support labels; 9                                              |
| AC-08    | Structured/custom unsupported automatic pricing still supports recording/manual settlement and honest unavailable metrics         | 6 capability/manual journey; 7 unavailable analytics; 9                               |
| AC-09    | Dividend/corporate action, internal transfer, unknown opening basis, post-import correction retain coherent records               | 3 opening/transfer; 5 correction; 6 corporate-action event; 9                         |
| AC-10    | External flows are not trade profit; internal transfers are not consolidated external flows                                       | 3 ledger classification; 5 reconciliation; 7 performance curves; 9                    |
| AC-11    | Identical reimport changes no counts/balances; invalid rows cannot corrupt valid records                                          | 5 dry run/idempotency/errors/reversal; 9                                              |
| AC-12    | Strategy version updates preserve old plans; absent original risk means unavailable R                                             | 4 versions/plan/risk snapshot; 7 R metrics; 9                                         |
| AC-13    | Missing prices/FX, no trades/no losing trades, tiny samples and undefined ratios are transparent                                  | 2 empty-state foundation; 3 missing observations; 7 metric edge cases; 9              |
| AC-14    | Another user cannot access records, exports or attachments                                                                        | 2 authentication/ownership; 3–7 record boundaries; 5 source files; 8 files/exports; 9 |
| AC-15    | Backup/restore reproduces records and derived totals under the same calculation version                                           | 3 deterministic rebuild/version foundation; 8 actual round trip; 9                    |
| AC-16    | Core workflows need no integration and survive reload/server restart                                                              | 2 persistent shell; 3–8 each runnable slice; 9 complete journeys                      |

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

## Intended future check commands

This is the original future-check matrix. The scaffold now implements the installed command subset documented in README, invoked with `corepack pnpm` to honor the repository pin. Financial tests, `test:a11y`, `test:performance` and `test:restore` in the table remain future capability/script requirements; automated scaffold axe checks currently run inside `test:e2e`. Unit/integration checks currently validate platform foundations, not the future accounting engine. The frozen lockfile exists for reproducible installs.

| Future command                   | Purpose and first relevant stage                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Reproduce verified locked dependencies; 2 onward                                                           |
| `pnpm dev` / `pnpm dev:worker`   | `dev` starts web and worker together; `dev:worker` starts the worker independently for debugging; 2 onward |
| `pnpm db:migrate`                | Apply reviewed migrations to the explicitly configured development/test database; 2 onward                 |
| `pnpm format:check`              | Documentation/source formatting; 2 onward                                                                  |
| `pnpm lint`                      | ESLint checks; 2 onward                                                                                    |
| `pnpm typecheck`                 | TypeScript checks; 2 onward                                                                                |
| `pnpm test:unit`                 | Vitest and meaningful fast-check properties; harness in 2, financial cases from 3                          |
| `pnpm test:integration`          | Isolated real-PostgreSQL migrations/transactions/authorization/import/restore; 2 onward                    |
| `pnpm test:e2e`                  | Playwright main journeys; 2 onward as each journey exists                                                  |
| `pnpm test:a11y`                 | axe plus documented manual keyboard/contrast/reader checks; 2 onward, complete at 9                        |
| `pnpm test:performance`          | Representative seed/query/import/rebuild benchmark; 3 foundation, complete at 9                            |
| `pnpm db:migrate:check`          | Reviewed migrations on clean and upgrade-path test databases; 2 onward                                     |
| `pnpm test:restore`              | Workspace/files restore and same-version derived totals; 8 onward                                          |
| `pnpm build`                     | Production build validation; 2 onward; does not establish accounting correctness                           |

Local development, worker and database-start commands must be documented after scaffolding. Integration/restore tests use isolated test databases and private test storage; they must not overwrite user workspaces. Run checks appropriate to the change, fix failures, and attach actual evidence to the increment. Broaden/repeat checks when new work or a failure warrants it.

## Optional integrations and retained scope

Manual entry, universal CSV, explicit broker-valued advanced records, manual price/FX, deterministic reviews and all mandatory acceptance scenarios are independent of external integrations. No unavailable API credential may block that core.

Named broker adapters require real or documented source samples and tests against the common contract. External prices/FX preserve timestamp/source/status and historical observations. Optional AI is disabled until configured, provider-neutral, uses only selected journal context and calculated aggregates, previews outgoing data, cites supporting trades, distinguishes interpretation/facts and sample limits, and cannot change posted records without an explicit reviewed action. Optional Sharpe/Sortino/benchmark and jurisdiction-specific tax modules require their own validated inputs/conventions; tax compliance is never implied by ordinary record exports.

If an integration is later pursued but unavailable, provide its interface, working manual fallback, configuration documentation and truthful status. The progress/capability records must retain advanced native-calculation limitations without disguising them as automatic support. Completion still requires the complete record/import/review/settlement journeys for **every** listed asset family, the core strategy workspace, financial foundations, risk/analytics, journals, files, exports and tested restore.

The current authorized action is completing platform scaffold verification (user Phase 3 / original roadmap Phase 2). The subsequent financial work must first resolve G-03/G-04 definitions/schema/independent-fixture gates within a newly authorized scope. Product features are not begun merely by marking the platform foundation complete.
