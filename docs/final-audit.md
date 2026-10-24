# Final production-release audit

Date: 22 October 2026

Reviewed commit: 00960cf8d8a340bf4f6a64289c94cb0e3bfea5d8

Recommendation: **Do not release against the complete product specification yet.**

## Remediation outcome — 24 October 2026

**26 findings resolved with regression evidence; FA-04 remains open and partially mitigated.** No P0 was established. Remediation was verified on the uncommitted working tree of branch `work`. The original reviewed-commit evidence below remains historical; the [remediation record](audit-remediation.md) supplies each root cause, correction, regression and behavior guide.

| Final check                                 | Executed result                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Lint                                        | Passed, zero warnings                                                                                           |
| Type checking                               | Root and every workspace package passed                                                                         |
| Unit/property/UI tests                      | 913 passed in 81 files; no skips                                                                                |
| Real PostgreSQL integration                 | 576 passed in 41 files; no skips;166.41 seconds                                                                 |
| End-to-end/browser tests                    | 18 passed; 2.0 minutes; desktop/mobile themes, accessibility, CSP, financial and new workflow journeys included |
| Production build                            | Domain, worker and web passed                                                                                   |
| Generated OpenAPI/client drift              | Passed                                                                                                          |
| Formatting                                  | Passed                                                                                                          |
| Fresh creation and original-release upgrade | Included in the passing database suite; new defaults and original records/permissions verified                  |

PostgreSQL 17 verification used disposable databases, regular migrations and restricted roles. Published migrations0000–0008 are unchanged; additive migrations0009–0016 bring the schema to 17. Interrupted intermediate runs, obsolete negative-futures assertions, historical-fixture schema coupling and browser selector/fixture failures were corrected and rerun; they are not counted as passing evidence. The full suites above are the final successful runs.

| ID    | Severity | Disposition and evidence                                                                                                                                                                                                                                                     |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FA-01 | P1       | **Resolved.** Cross-version NAV 120, compatible quotes without new fills and historical/corrected pins: `financial-observations.test.ts`.                                                                                                                                    |
| FA-02 | P1       | **Resolved.** Typed financing/interest block incomplete net/R; reversal and prior revisions remain correct: `analytics-services.test.ts`.                                                                                                                                    |
| FA-03 | P1       | **Resolved.** Unrelated valid login remains available across gateways after identity abuse; bounded credential admission remains enforced: `auth.test.ts`, auth admission/security unit tests.                                                                               |
| FA-04 | P1       | **Open, partially mitigated.** [Tracked measurements](reporting-remediation-evidence.json) show major improvements, but the summary case still takes 4.69 seconds and 3118 statements. Million-fill, ten-reader, worker-contention and bulk-processing budgets are unproven. |
| FA-05 | P1       | **Resolved.** Risk unit/UI/PostgreSQL regressions and actual policy/assessment browser workflow. [Behavior](risk.md).                                                                                                                                                        |
| FA-06 | P1       | **Resolved.** Source/media and populated review/component archive round trips, malformed/foreign rollback, exact retry and browser restore with exact cash. [Behavior](workspace-portability.md).                                                                            |
| FA-07 | P1       | **Resolved.** Independent variance, tolerance/coverage, acceptance/staleness, tenant checks and browser cash mismatch with acceptance blocked. [Behavior](statement-reconciliation.md).                                                                                      |
| FA-08 | P1       | **Resolved.** Browser funding, conversion, selected lots, multiple fee currencies, lost-response retry and split allocation; advanced/guided regressions. [Behavior](advanced-financial-entry.md).                                                                           |
| FA-09 | P2       | **Resolved.** Transit counted once through receipt and historical reversal; current NAV 100 and pinned transit 100 remain correct. `financial-observations.test.ts`.                                                                                                         |
| FA-10 | P2       | **Resolved.** 500 books returned,501 explicitly rejected; campaign filtering before the limit reaches the last book. Explicit capacity limits remain documented.                                                                                                             |
| FA-11 | P2       | **Resolved.** Fill/opening/mark commands and direct SQL reject a future-effective convention at the adjacent microsecond and accept the boundary.                                                                                                                            |
| FA-12 | P2       | **Resolved.** Manual−37.63 quotes retained for execution/opening/mark; native negative attempts still reject and unsupported automatic results stay unavailable. Asset-class, observation and import tests.                                                                  |
| FA-13 | P2       | **Resolved.** Blocked source replay retains unavailable reporting P&L/FX; known marked value and proven empty zero are preserved. `inventory-blocked-valuation.test.ts`.                                                                                                     |
| FA-14 | P2       | **Resolved.** Typed historical income/withholding/tax/expense/transfer reversals, pinned reports, retries, duplicates and UI confirmation. [Behavior](account-performance-and-corrections.md).                                                                               |
| FA-15 | P2       | **Resolved.** 10,001 unrelated FX observations no longer change/block the tiny identity-currency accounting/analytics report. `report-fx-scope.test.ts`.                                                                                                                     |
| FA-16 | P2       | **Resolved.** 201 accounts and 501 assets/versions page correctly while a selected account still reports equity 100. Catalog/dashboard PostgreSQL and UI tests.                                                                                                              |
| FA-17 | P2       | **Resolved.** Bounded reference search/paging reaches late records and retains selections in setup, recording and analysis selectors. Catalog/manual/advanced UI tests.                                                                                                      |
| FA-18 | P2       | **Resolved.** Historical v1 fill attribution and pinned-leg exit survive v2 publication without new duplicate source cash. Historical-version API tenancy and UI tests.                                                                                                      |
| FA-19 | P2       | **Resolved.** History SQL/DTO omit raw source, mapping and preview; detail is fetched on selection. Import history unit/UI, PostgreSQL and browser suites.                                                                                                                   |
| FA-20 | P2       | **Resolved.** Durable outbox dispatch, generation-safe native projection, retries/restart, actual worker process and restored pending events pass. [Behavior](financial-outbox.md). FA-04 capacity remains open.                                                             |
| FA-21 | P2       | **Resolved.** Standalone period kinds, typed template history, linked-source summaries, exact retries, tenant checks and populated archive restore pass. [Behavior](period-reviews.md).                                                                                      |
| FA-22 | P2       | **Resolved.** Exact flow boundaries, conditional TWR/MWR, unitized drawdown, ambiguous/missing evidence and pinned series regressions pass. [Definitions](account-performance-and-corrections.md).                                                                           |
| FA-23 | P2       | **Resolved.** Explicit residual/campaign sources, source-state/time/FX/overflow/zero boundaries, populated restore and browser cash 105+residual 7=NAV 112 pass. [Behavior](supplied-values.md).                                                                             |
| FA-24 | P2       | **Resolved.** Strategy display follows workspace timezone across different dates and DST; unit/UI regressions pass.                                                                                                                                                          |
| FA-25 | P3       | **Resolved.** Private saved filters/columns across three screens, RLS/concurrency/retry tests and actual browser save/reload/apply pass. [Behavior](display-views.md).                                                                                                       |
| FA-26 | P3       | **Resolved.** Zero foreign execution fee remains known zero without FX; a nonzero charge still requires FX. `analytics-services.test.ts`.                                                                                                                                    |
| FA-27 | P3       | **Resolved.** Current capability entry points are reconciled; historical checkpoints/counts remain labelled; changed documentation links and formatting verified.                                                                                                            |

Full-spec production release remains blocked by FA-04. The native worker projection is durable business processing, not a completed asynchronous bulk-report facility. No deployment or production-capacity certification is claimed.

## Scope and method

Read Trading_Journal_Codex_Prompt.md, docs/requirements-analysis.md, docs/architecture.md, docs/domain-model.md, docs/analytics-definitions.md and docs/security.md. Independently inspected the domain, database/migrations, contracts, financial/accounting/analytics services, imports, authentication, private files, worker, web workflows, tests and operational evidence.

The original product specification remains authoritative. Several omissions are candidly documented as deferred increments; that transparency does not fulfill the corresponding full-product release requirements. Optional AI, external broker integrations, Sharpe/Sortino and jurisdiction-specific tax modules are not counted as missing mandatory features. Deferring unvalidated advanced automatic formulas is allowed; supplied-value/manual workflows still need to work.

Evidence below distinguishes executed PostgreSQL reproductions, executed isolated service/kernel reproductions with mocked database results, static control-flow evidence, and historical measurements already retained in the repository. File references and line numbers refer to the reviewed commit. This audit adds documentation only: no implementation, schema, dependency, or versioned test fixes.

Severity:

| Level       | Meaning                                                                              | Findings |
| ----------- | ------------------------------------------------------------------------------------ | -------: |
| P0 Critical | Immediate catastrophic integrity/confidentiality risk demonstrated                   |        0 |
| P1 High     | Material wrong results, broad availability failure, or missing core release workflow |        8 |
| P2 Medium   | Bounded correctness, validation, scale, architecture or substantial workflow defect  |       16 |
| P3 Low      | Smaller usability, presentation or documentation discrepancy                         |        3 |

No P0 was established. A passing suite is not proof of financial correctness: independent cases below pass through behavior that the existing suite does not assert.

## Verification performed for this audit

| Check                             | Fresh result                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen dependency installation    | Passed with the existing lockfile; no manifest changes                                                                                       |
| Unit/property/UI suite            | 817 tests in 59 files passed                                                                                                                 |
| Real PostgreSQL integration suite | 512 tests in 31 files passed; 65.68 seconds                                                                                                  |
| TypeScript checks                 | Root and all workspace packages passed                                                                                                       |
| Generated OpenAPI/client drift    | Passed                                                                                                                                       |
| Dependency advisory check         | pnpm security:audit passed: no known vulnerabilities reported                                                                                |
| Focused live financial checks     | Metadata/mark selection, effective dates, negative manual prices, typed financing and unrelated-FX report denial reproduced on PostgreSQL 17 |
| Focused service/kernel checks     | Global login lockout, blocked-replay reporting zeros, transit NAV disagreement and zero-fee FX inconsistency reproduced                      |
| Historical performance evidence   | Inspected committed benchmark code, measurements and scope limits; large benchmarks were not rerun                                           |

PostgreSQL checks used a newly created, uniquely named, disposable local instance, regular migrations and restricted application/authentication roles. The unrelated-FX threshold reproduction additionally seeds valid observations through the fixture's administrator connection without disabling constraints. No existing database or volume was used. The initial unit attempt hit sandbox child-process EPERM errors; rerunning with the necessary execution permissions passed all 817 tests. Those initial environment failures are not product findings.

Production build, fresh browser/end-to-end runs, manual accessibility testing, production TLS/proxy/failover, and production recovery/capacity checks were not performed in this audit. Earlier repository reports remain historical evidence, not fresh results. Scratch harnesses/logs are under ignored work/; the relevant fixture inputs, observed outcomes and source paths are recorded below so the conclusions do not depend on undisclosed logs.

## Finding index

| ID    | Severity  | Finding                                                                           |
| ----- | --------- | --------------------------------------------------------------------------------- |
| FA-01 | P1 High   | Compatible metadata updates select an obsolete mark and materially misstate NAV   |
| FA-02 | P1 High   | Typed financing bypasses campaign cost-completeness checks                        |
| FA-03 | P1 High   | Unauthenticated requests can lock every user out of sign-in                       |
| FA-04 | P1 High   | Synchronous reporting exceeds practical history, latency and memory budgets       |
| FA-05 | P1 High   | Required risk policies, assessments and sizing are absent                         |
| FA-06 | P1 High   | Portable workspace backup/restore and filtered exports are absent                 |
| FA-07 | P1 High   | Independent statement reconciliation is absent                                    |
| FA-08 | P1 High   | Required advanced manual financial workflows lack a working editor                |
| FA-09 | P2 Medium | The retained valuation endpoint excludes owned cash in transit from available NAV |
| FA-10 | P2 Medium | Position/campaign reads silently stop at 500 books                                |
| FA-11 | P2 Medium | Fills, openings and marks accept future-effective instrument conventions          |
| FA-12 | P2 Medium | Universal nonnegative price validation rejects valid manual futures records       |
| FA-13 | P2 Medium | Blocked inventory replay becomes available zero reporting P&L                     |
| FA-14 | P2 Medium | Typed account facts lack historical correction commands                           |
| FA-15 | P2 Medium | Unrelated FX history blocks otherwise tiny reports                                |
| FA-16 | P2 Medium | A 501st catalog record disables Dashboard and Accounts                            |
| FA-17 | P2 Medium | Recording selectors cannot reach records beyond their first page                  |
| FA-18 | P2 Medium | Metadata updates break historical execution linking in the UI                     |
| FA-19 | P2 Medium | Import history unnecessarily materializes large raw source payloads               |
| FA-20 | P2 Medium | Financial outbox intents have no dispatcher or business worker                    |
| FA-21 | P2 Medium | Standalone period reviews and reusable templates are absent                       |
| FA-22 | P2 Medium | Account performance series and conditional return calculations are absent         |
| FA-23 | P2 Medium | Advanced supplied-value analysis has no working component path                    |
| FA-24 | P2 Medium | Strategy dates ignore the configured workspace timezone                           |
| FA-25 | P3 Low    | Saved views and selectable columns are unimplemented                              |
| FA-26 | P3 Low    | A zero foreign-currency execution fee incorrectly requires FX                     |
| FA-27 | P3 Low    | Current documentation contains stale implementation statements                    |

## P1 High findings

### FA-01 — Compatible metadata updates select an obsolete mark and materially misstate NAV

**Requirement:** Specification lines 30–31, 51 and 89 require truthful observations, historical metadata and recomputation. Domain model lines 119 and 200 bind calculations to compatible versioned conventions and observation evidence.

**Evidence:** packages/server/src/financial/ledger.ts:347–350 initializes holding_books.instrument_version_id once. The rebuild at :563–564 updates state and source_revision, leaving that column unchanged. Compatible newer versions are permitted by packages/server/src/financial/catalog.ts:843–860. packages/server/src/financial/observations.ts:457–478 loads the old column and restricts mark selection to that version. The JSON inventory can consequently say v2 while the valuation still queries v1.

**Executed PostgreSQL reproduction:** Fund an account with 100; buy one share at 10 under v1; append a compatible v2 with a finer price increment; buy one share at 20 under v2. Record v1 mark 10 and newer v2 mark 25, both eligible under the requested freshness policy. Persisted book column remained v1 while its inventory scope was v2. Holding value was **20 instead of 50**; cash was 70, giving **available NAV 90 instead of 120**. With only a v2 mark, coverage is incorrectly missing instead.

**Missing test:** tests/integration/financial-ledger.test.ts:388–422 exercises compatible versions and checks quantity/cash, but never checks the resulting book reference or current mark selection. Add a cross-version valuation assertion, including old/current source-revision behavior.

### FA-02 — Typed financing bypasses campaign cost-completeness checks

**Requirement:** docs/analytics-definitions.md:35–39 says relevant standalone carrying costs without compatible campaign attribution must prevent complete campaign net/R. Specification line 101 requires actual financing and borrowing charges in results.

**Evidence:** packages/server/src/accounting/api.ts:99–104 exposes recordExpense; kind financing is accepted by accounting/service.ts:501–519 and stored in account_cash_events at :247–262. Analytics only searches app.fees for standalone carrying costs (analytics/sources.ts:528–555), and only those rows can add standalone_costs_require_campaign_attribution at :691–716. It never queries account_cash_events.

**Executed PostgreSQL reproduction:** One completed campaign buys at 100, sells at 110, and has original risk 10. Charge 20 financing while it is open. Through the typed accounting endpoint, campaign net remains **available 10** and R **available 1**, while the account correctly reports performance **−10** and expense 20. Enter the equivalent charge through ledger.recordFee with kind carrying: account performance is again −10, but campaign net/R correctly become unavailable pending attribution.

This is a completeness discrepancy between supported entry paths, not permission to distribute every account expense arbitrarily across campaigns. An unresolved relevant charge must remain visible before an outcome is labeled complete.

**Missing test:** tests/integration/analytics-services.test.ts:722–784 covers the ledger fee path only. The same economics need a cross-entry-path assertion. Both real service paths were exercised in the audit.

### FA-03 — Unauthenticated requests can lock every user out of sign-in

**Requirement:** Specification §13 requires appropriate rate limiting. docs/decisions/0003-authentication-and-tenancy.md:73 explicitly requires tuning so a shared source cannot lock every user out.

**Evidence:** packages/server/src/auth-gateway.ts:104–127 increments the persisted global journal:login:ingress bucket, maximum 100 per 15 minutes, before checking the ten-attempt account bucket. Attempts already rejected by the account limit still consume global capacity. :214–227 returns 429 before credential verification. All identities and replicas share this key. A non-browser caller can supply the configured Origin without authenticating.

**Executed isolated gateway reproduction:** Real unchanged gateway, emulated SQL counters and deterministic credential verification: valid baseline login 200; 100 requests for one nonexistent email produce ten 401 and ninety 429, with only ten credential checks. A different user's correct credentials on a second gateway sharing the counters then receive **429, Retry-After 900**, without reaching verification. Repetition at window resets sustains the sign-in outage. Existing sessions are unaffected.

**Missing test:** tests/integration/auth.test.ts:849–880 preloads the shared bucket and verifies denial; it does not assert availability for an unrelated valid user. docs/security.md:29 acknowledges the tradeoff but does not resolve the availability defect.

### FA-04 — Synchronous reporting exceeds practical history, latency and memory budgets

**Requirement:** Specification line 236 and N-IN-01 require realistic history, bounded loading and avoidance of N+1 queries. docs/architecture.md:230 proposes million-fill capacity and bounded summaries at one second.

**Evidence:** packages/server/src/accounting/report.ts:387–401 sequentially reloads/replays each book in the web request transaction. It has no total response-byte guard. Analytics builds all selected campaign results, serializes them, then checks its 4 MiB limit (analytics/service.ts:62–127). Its source loader caps campaigns before the final date cohort (analytics/sources.ts:439–440). Dashboard applies strategy/asset/tag selection after requesting that report (dashboard/service.ts:249–250).

**Retained measured evidence:** docs/performance.md:408–416 records a 10,000-trade accounting request taking **151,679 ms**, **4,613 SQL statements**, **55,973,279 JSON bytes**, approximately **418 MB heap / 594 MB RSS**. The 1,000-trade request still takes 17,679 ms. :355–376 records whole analytics/dashboard rejection at 1,000 campaigns, a bounded 100-campaign report at 12,715 ms, and a recent-ten-campaign filter still at 12,268 ms because broad history is loaded first.

These are repository measurements, not newly rerun benchmarks. Safe rejection avoids fabricated totals, but there is no functional bulk-report alternative. Repeated authorized requests also occupy web resources. FA-15/16 describe additional failures that cannot be recovered by narrowing the requested population.

**Missing test/gate:** Existing benchmarks openly preserve the failure; one-reader measurements do not establish the proposed ten-reader capacity. Release needs measured scoped/bulk behavior and bounded response/resource usage, not merely longer timeouts.

### FA-05 — Required risk policies, assessments and sizing are absent

**Requirement:** Specification lines 148–152; F-RM-01 through F-RM-03 require account/strategy precedence, configurable limits, breach/unknown assessment and validated pre-trade sizing.

**Evidence:** packages/contracts/src/strategies.ts:128–129 stores narrative riskRules and positionSizingRules. apps/web/src/components/strategies/strategy-workspace.tsx:123–126 explicitly says automatic evaluation is not performed. No risk-policy persistence, precedence evaluator, limit assessment or sizing calculator exists across domain/contracts/database/server/web. docs/development-plan.md:212–213 leaves these requirements unchecked.

**Impact:** Users cannot evaluate daily/weekly losses, concentration, leverage, concurrent positions, prohibited instruments or size under account and strategy policies. Narrative rules and correct historical R do not implement these workflows. Configuring no policy must remain possible, but configuring a real policy also needs a working path.

**Missing test:** No runnable functional acceptance path exists for policy precedence, breach/unknown assessments or sizing. This is documented unfinished core scope, rather than an allegation that current R arithmetic is wrong.

### FA-06 — Portable workspace backup/restore and filtered exports are absent

**Requirement:** Specification lines 186, 194 and 255; F-IM-08 requires lossless application JSON, filtered record exports and same-version restore fidelity.

**Evidence:** packages/contracts/src/generate.ts:24–32 and the workspace API route inventory expose no portable backup/restore or filtered export operation. docs/development-plan.md:229–231 remains unchecked; docs/ux-review.md:115 acknowledges the omission. Required canonical sources, relationships, provenance, calculation manifests and private media cannot be round-tripped through an application workspace format.

**Impact:** Users cannot export required filtered trades, executions, cash, strategies, reviews or analytics, or restore a workspace into a new namespace. Operator database/media recovery documented for Phase 16 is valuable but serves a different boundary: it does not satisfy portable workspace export/restore or its ownership/session-exclusion rules.

**Missing test:** AC-15's application-format round trip has no implemented path. Tests must eventually verify source/media hashes, relationships, ownership rebinding, compatible calculation versions and reproduced totals. No absent CSV export is asserted vulnerable to formula injection; there is no exporter to test yet.

### FA-07 — Independent statement reconciliation is absent

**Requirement:** Specification lines 72, 144 and 192; F-PA-03/F-IM-07 and docs/domain-model.md:206,272,336 require statement quantity/cash/equity comparison, dates, pinned revision, variance/tolerance evidence and stale status after corrections.

**Evidence:** packages/domain/src/accounting.ts:838–864 computes performance and its explanation from the same ledger inputs. Its reconciliation output at :989–995, also contracts/accounting.ts:363–370, is an internal identity bridge. It has no statement quantity/cash/equity snapshot or accepted reconciliation state. Account valuation observations are stored/listed by financial/observations.ts:251–338 but are not read by accounting/report.ts. No persisted reconciliation entity/date is implemented. docs/development-plan.md:186,190,320 acknowledges the gap.

**Impact:** An omitted statement transaction can leave the internal bridge at zero variance while actual statement cash/holdings/equity disagree. Users cannot retain a reviewed statement variance, tolerance, reconciliation date or correction-staled assessment.

**Existing narrower capability:** imports/ledger-port.ts:161–205 correctly matches identified fill cash and rejects FILL_CASH_VARIANCE, preventing duplicate postings. That is not full statement reconciliation.

**Missing test:** A deliberately incomplete ledger compared with an independently supplied statement, followed by correction and stale-reconciliation behavior. Internal accounting identity tests cannot establish independent source agreement.

### FA-08 — Required advanced manual financial workflows lack a working editor

**Requirement:** Specification lines 95, 128, 134, 138 and 144 require an advanced editor, actual FX, account funding/openings, multiple charges and allocation/lot workflows. AC-03 requires one fill split across ideas.

**Evidence:** apps/web/src/components/record/catalog-setup.tsx:195–203 offers currency/account/instrument creation, with only a pre-existing broker dropdown at :242–246. manual-record-workspace.tsx:435–446 constructs zero or one fee; :276–279 rejects specific-lot accounts; :303–306 and :495–505 refuse existing attribution and create only a whole-fill allocation to one leg. :1053–1057 directs advanced work to the API. Backend handlers exist for brokers, cash, conversions and openings (packages/server/src/financial/api.ts:69–78,96–109,121–124), but corresponding manual forms are absent. docs/ux-review.md:113 acknowledges these limitations.

**Impact:** A trader using a supported specific-lot policy cannot enter a source fill through the recorder; multi-currency actual charges and a fill shared between strategies require API scripting or import workarounds. Account funding and actual conversions also lack the requested manual interface.

**Scope:** Multi-leg idea creation **does work** at journal-workspace.tsx:829–847, and separate fills can target matching legs. The missing functionality is the advanced financial editor and event/allocation forms, not all multi-leg recording.

**Missing test:** Backend command tests do not demonstrate these absent UI journeys. Acceptance needs manual funding/conversion, explicit lots, multiple fees and split execution allocation.

## P2 Medium findings

### FA-09 — The retained valuation endpoint excludes owned cash in transit from available NAV

**Requirement:** docs/domain-model.md:153–154,261 and INV-11 require internal transit assets counted once in complete ownership scope.

**Evidence:** packages/server/src/financial/api.ts:234–239 still publishes valuation. financial/observations.ts:407–449,566–594 builds components only from cash and holdings, without reading cash transfers/transit. The newer accounting engine includes owned transit at packages/domain/src/accounting.ts:607–650,816–817.

**Executed service/kernel reproduction with mocked read results:** A has 100, B has zero; depart 100 from A to B without receipt; select both accounts after departure. Financial valuation returns **available NAV 0**; accounting returns **equity 100, transit 100**. The financial query spy recorded no transfer read.

**Limit/impact:** docs/financial-metrics.md:62–70 documents the older cash-plus-holdings contract, and current Accounts/Dashboard use the correct accounting report. This is therefore graded P2: the retained public NAV is incomplete for newer supported transfer facts and provides no missing-transit warning, not a claim that current dashboard equity is wrong.

**Missing test:** The same pending-transfer snapshot against both published interfaces, with explicit completeness semantics.

### FA-10 — Position/campaign reads silently stop at 500 books

**Evidence:** packages/server/src/financial/ledger.ts:697–704 applies LIMIT 500 before campaign filtering; :878 returns no overflow/cursor state. positions at :2253–2269 returns a bare array with the same cap. Public APIs expose these collections; their contracts offer scope filters but no pagination.

**Scenario:** Account/workspace contains 501 books. The last book silently disappears. A trade-only campaign-inventory request can return no population if its book sorts after 500, because trade selection happens later. This violates complete population/conservation and server-pagination requirements (specification line 236; domain model line 192).

**Validation:** Static query/control-flow proof. journal/financial.ts:293–312 explicitly scopes each book to avoid this known class of omission; that protects journal details, not the public collection APIs.

**Missing test:** 500/501 boundary, late-sorting trade-only selection and complete cursor/overflow behavior.

### FA-11 — Fills, openings and marks accept future-effective instrument conventions

**Evidence:** packages/server/src/financial/reference-data.ts:185–236 returns effectiveAt but takes no economic time. Execution insertion at ledger.ts:897–902, opening lots at :1750–1758 and marks at observations.ts:204–216 do not compare it with the source instant. By contrast, catalog.ts:906–912 performs that check for orders. Migration 0002_core_financial_ledger.sql:1517–1549 checks price/increments but not this date.

**Executed PostgreSQL reproduction:** A v2 effective 1 March with price increment 0.001 accepted a **15 February fill at 10.001**, a **14 February opening lot**, and a **14 February mark**. Import delegates to the same commands. Immutable records are preserved, but they can be bound to a convention not yet effective, contrary to specification lines 51/87/89.

**Missing test:** Before/exactly-at effective boundary for fills, openings and observations, including import preview/commit; verify whether any intentional historical restatement requires explicit evidence rather than ordinary insertion.

### FA-12 — Universal nonnegative price validation rejects valid manual futures records

**Requirement:** Specification lines 43, 49, 51 and 61 require faithful multi-asset recording and subtype-specific conventions, including safe manual fallback.

**Evidence:** packages/contracts/src/financial.ts:225–233 requires every execution price nonnegative; price observations do likewise at :396. packages/server/src/financial/ledger.ts:903–904 and financial/observations.ts:49–67 independently reject negatives, including manual-capability futures. This is a stock-style sign assumption applied before product conventions.

**Executed PostgreSQL/service reproduction:** A manual futures instrument with supplied price **−37.63** was rejected for both execution and mark. Negative commodity futures prices are valid source facts; storing null instead discards known evidence. Allowing signed source prices need not enable unvalidated automatic futures arithmetic.

**Missing test:** A negative-price manual future fill and observation preserving their original signed values while unsupported calculations remain unavailable.

### FA-13 — Blocked inventory replay becomes available zero reporting P&L

**Evidence:** packages/domain/src/inventory.ts:342–374 returns empty lots/matches for a blocked replay; missing operands select it at :973–1000. valueInventory's hasReplay at :1439–1442 permits unavailable gross basis unless unsupported/ambiguous. The reporting loops at :1499–1577 aggregate those empty arrays; aggregate at :160–171 returns available zero.

**Executed pure-kernel reproduction:** Buy ten at 100 with missing booked principal; sell five at 120 with principal 600; mark 120. Replay and native realized/unrealized P&L are unavailable for missing_booked_principal, but all realized/unrealized reporting gross/net/FX results are **available zero**. Missing evidence cannot establish zero (docs/financial-calculations.md:23; specification §9).

**Reachability limit:** Current native execution services derive/require principal. Ordinary HTTP reachability of this exact blocked state was not demonstrated. This is a confirmed exported calculation-contract defect, not a demonstrated P1 native workflow failure.

**Missing test:** valueInventory on every blocked replay reason, asserting unavailable reporting outcomes rather than zero.

### FA-14 — Typed account facts lack historical correction commands

**Requirement:** Specification line 89 and docs/domain-model.md:330–332 distinguish audited historical reversal/replacement from a genuine later refund.

**Evidence:** packages/server/src/accounting/api.ts:85–127 and service.ts:748–760 expose creation of income/tax/expense/transfers and receipt, but no correction/reversal. Their ledger links use account_cash_event_id/cash_transfer_id/receipt_id at service.ts:203–212. Generic financial/cash-reversal.ts:17–40 locates only cash_movement_id, so cannot reverse those sources. Income is strictly positive (contracts/accounting.ts:51–59).

**Scenario:** A dividend of 100 should have been 10, or a transfer targeted the wrong destination. No supported command restates the original fact and its dependent views. An expense/refund/opposite transfer can alter current cash while leaving wrong historical classifications, dates or transit lineage.

**Validation/test gap:** Static API/service/reversal enumeration. Existing genuine-refund and execution-correction cases do not exercise typed-source reversal/replacement. Direct database edits are not a supported correction workflow.

### FA-15 — Unrelated FX history blocks otherwise tiny reports

**Evidence:** packages/server/src/accounting/report.ts:264–284 and analytics/sources.ts:608–626 fetch all non-superseded workspace FX observations before the report end/revision, then reject at 10,000. Neither query filters needed pair, configured source, freshness or monetary dependencies. Reducing selected accounts or the interval start does not change that history read.

**Executed PostgreSQL reproduction:** A one-account, one-campaign, one-fill USD report initially succeeds in both engines. Add **10,001 unrelated EUR/GBP observations** before the end date and repeat: both restricted-role services fail with PostgreSQL **57014 at the ordinary ten-second statement timeout**, before their collection guards finish. No timeout, index or constraint was altered. Separately, the query/control-flow evidence establishes that even if the reads finish, more than 10,000 rows trigger ACCOUNTING_SCOPE_TOO_LARGE / ANALYTICS_SCOPE_TOO_LARGE despite requiring no EUR/GBP translation. The observed live outcome is timeout, not a claimed observed domain scope error.

**Impact:** Unrelated data disables reports permanently at ordinary current scopes; “select fewer accounts/a shorter period” is ineffective. This is separate from rejecting a truly large required dependency set.

**Missing test:** Large irrelevant observation history with a tiny same-currency report. Existing performance fixtures have only 365 FX observations (docs/performance.md:174–175).

### FA-16 — A 501st catalog record disables Dashboard and Accounts

**Evidence:** packages/server/src/dashboard/service.ts:33–39 throws over 500. Its catalog always loads whole-workspace instruments and all historical strategy versions at :82–105, with no scope or pagination. Dashboard requires this catalog before report execution (apps/web/src/components/dashboard/dashboard-workspace.tsx:375–427); Accounts uses it too (accounts/account-workspace.tsx:280–305).

**Scenario:** Add a 501st instrument or accumulated published strategy version; both screens fail even for one account and a short period. Archiving does not help because these reads include history/archived identities. The displayed narrower-scope advice cannot change this endpoint's population.

**Validation/test gap:** Static query/UI dependency proof; no 501-item browser fixture was run. Test that historical catalog growth cannot disable an intrinsically small report and that users can page/search references.

### FA-17 — Recording selectors cannot reach records beyond their first page

**Evidence:** apps/web/src/components/record/manual-record-workspace.tsx:124–135 fetches only 200 accounts/instruments/currencies/trades; :155–166 fetches 100 strategies/versions. Journal creation does the same at journal-workspace.tsx:170–191. The retrospective strategy picker fetches the oldest 200 trades before filtering (strategy-workspace.tsx:349–370). Catalog contracts/financial.ts:571–579 permits only limit/includeArchived; catalog.ts:1185–1196,1287–1329 has LIMIT with no cursor.

**Scenario:** Create 201 instruments/accounts: newer entries cannot be selected after reload. If the first 200 trades are closed, a newer open trade disappears from the strategy picker. An API workaround message at recorder :737–745 acknowledges the limit but does not provide a complete UI or pageable catalog.

**Requirement/test gap:** Specification lines 215/236 require usable filtered/paginated lists. Boundary cases at 201 records and 101 versions are absent from the small selector fixtures.

### FA-18 — Metadata updates break historical execution linking in the UI

**Evidence:** packages/server/src/financial/catalog.ts:279–286 returns only each instrument's current version. Existing-fill mode resolves the fill's immutable version only against that catalog (apps/web/src/components/record/manual-record-workspace.tsx:168–175), then blocks at :254–258 when it cannot match. Existing-leg matching at :309–318 also requires the exact version while the instrument selector offers current versions at :818–824.

**Scenario:** Record/import an unassigned v1 fill, append compatible v2, then choose that old fill for campaign linking. The old version appears as a UUID and preview cannot continue. This is separate from FA-01: backend history remains intact, but ordinary metadata publication makes a primary review/allocation workflow API-only.

**Missing test:** Existing tests/ui/manual-record.test.tsx:71,150 uses matching current IDs. Add older-version fill linking and an exit on a historically pinned campaign after metadata publication.

### FA-19 — Import history unnecessarily materializes large raw source payloads

**Evidence:** packages/server/src/imports/service.ts:37–38 includes entire source_text, mapping and preview in shared batchColumns. history at :833–839 fetches 51 rows with those columns and strips sourceText only after driver/Node allocation.

**Resource scenario:** 51 allowed 2 MiB sources mean **102 MiB of UTF-8 source payload** read/materialized for one metadata-history request, before preview/mapping/object overhead. Concurrent routine history reads multiply this. Output filtering protects the response shape but not database I/O or server memory.

**Requirement/validation and test gap:** Specification line 236 requires bounded efficient history. This is a calculable source-derived risk, not an observed OOM or data disclosure. No maximum-source-size history benchmark/regression exists.

### FA-20 — Financial outbox intents have no dispatcher or business worker

**Requirement:** docs/architecture.md:194–198 requires draining the transactional outbox, durable jobs, idempotent retries and revision-safe publication.

**Evidence:** packages/server/src/financial/repository.ts:129–133 writes outbox_events on accepted commands. packages/database/src/financial-schema.ts:1917–1953 defines them, but application source has no dispatcher/checkpoint/consumer. apps/worker/src/index.ts:80–83 registers only HEALTH_PROBE_QUEUE; migrate.ts:24–31 and queue.ts:33–59 support that probe. scripts/processes.ts:51–57 supplies only queue credentials. docs/production-readiness-checklist.md:75–76 acknowledges absent business handlers.

**Impact:** These financial intents are inert infrastructure; worker health does not demonstrate report/rebuild/import/cleanup processing, progress or recovery. Current critical writes are synchronous, so this does **not** establish stale committed balances. It does leave the designed architecture and the bulk escape path for FA-04 unimplemented.

**Missing test:** tests/integration/worker.test.ts:79–104 proves only health-probe persistence. Outbox insertion/rollback tests never test delivery, duplicate handling or stale-generation publication.

### FA-21 — Standalone period reviews and reusable templates are absent

**Requirement:** Specification lines 178–182; F-JR-01/02/05 require daily/session/weekly/monthly records, reusable templates, goals/actions and deterministic summaries.

**Evidence:** packages/database/src/journal-schema.ts:76–81 requires a trade ID; journal/api.ts:38–113 exposes trade journals/plans/revisions/risk additions only. apps/web/src/components/journal/journal-workspace.tsx:446–459 explicitly says its weekly checklist creates no weekly record. docs/ux-review.md:115 and development-plan.md:226,320 acknowledge the omission.

**Impact/test gap:** A user cannot retain a preparation/end-session or weekly/monthly review independent of an invented trade, or apply a reusable period template. Trade notes plus filters are useful but do not satisfy this workflow. No standalone period/template persistence journey can run.

### FA-22 — Account performance series and conditional return calculations are absent

**Requirement:** Specification lines 162–164 requests distinct raw NAV and flow-adjusted performance curves, and TWR/MWR when sufficient data and a valid solution exist. These return metrics are conditional mandatory features; optional Sharpe/Sortino is different.

**Evidence:** docs/analytics-definitions.md:86 explicitly excludes TWR/MWR and account equity series from the increment. Strict metric contracts at packages/contracts/src/analytics.ts:220–248 and domain/analytics.ts:503–552 expose campaign monetary/outcome/R statistics. Accounting returns a monetary interval bridge (domain/accounting-types.ts:164–190; accounting.ts:838–840,989–995); dashboard/service.ts:315–367 does not unitize or solve returns. docs/development-plan.md:216,320 acknowledges the deferral.

**Scenario:** Complete valuations show 100 becoming 110 over exactly one year with no intervening external flow. TWR and one-year MWR are unambiguously 10%, but no implemented result field/path can return either. Likewise there is no account unitized series whose drawdown/recovery excludes deposit-driven apparent recovery.

**Missing test:** Complete-input return/series acceptance, flow-time valuation sufficiency and ambiguous-root handling. Current campaign money curves are correctly labeled; this finding does not relabel them as incorrectly computed TWR.

### FA-23 — Advanced supplied-value analysis has no working component path

**Requirement:** Specification lines 55–61/270 permits staged native formulas but requires explicit broker/manual analysis and functional fallback workflows.

**Evidence:** packages/domain/src/inventory.ts:933–935 restricts native inventory to three subtypes; :995–996 returns unsupported_inventory_module for manual modules. valueInventory at :1439–1446 cannot value unsupported replay from a supplied mark. financial/observations.ts:83–93 accepts only whole-account supplied amounts, and :251 deliberately keeps them outside calculated NAV. No supplied position/campaign basis/result component exists. docs/instrument-capabilities.md:195 explicitly says supplied account totals, advanced holding basis/P&L and package values are not selected as replacement components.

**Impact:** An option, future, bond or custom position can retain quantity/cash and truthful unavailable outputs, yet reviewed compatible broker holding value or realized result cannot supply its portfolio/campaign analysis even when the trader has the evidence. Correctly declining unvalidated native pricing is credited; the missing sourced-analysis route is the gap.

**Missing test:** Level-2 position/campaign supplied-value selection with definitions, compatibility, provenance and no double counting. Do not solve this by silently overriding internal NAV with an incompatible broker total.

### FA-24 — Strategy dates ignore the configured workspace timezone

**Requirement:** Specification lines 87/217; N-CP-05/F-UX-06 require configured IANA display.

**Evidence:** apps/web/src/components/strategies/strategy-workspace.tsx:37–38 calls Date.toLocaleString without timeZone for timestamps displayed at :759–765. strategy-editor.tsx:77–80,139,215,230 parses browser-local inputs; it labels that editor choice at :875–876, but the read-only display is unlabelled. Journal uses the configured zone at journal-time.ts:1–14.

**Executed formatting reproduction:** For instant 2026-10-22T00:30:00Z, an America/New_York browser shows 21 October 20:30 while a Europe/Madrid workspace requires 22 October 02:30. Strategy and trade views can therefore show different calendar dates for the same instant.

**Missing test:** Browser/workspace timezone disagreement and DST boundaries. The labelled browser-local editor reduces ambiguity but does not satisfy configured-zone display.

## P3 Low findings

### FA-25 — Saved views and selectable columns are unimplemented

**Requirement:** Specification line 215 and F-UX-03 require persistent saved views and column selection.

**Evidence:** docs/development-plan.md:228 leaves these unchecked; docs/ux-review.md:115 explicitly defers saved searches/views. Current dashboard/journal/strategy tables have fixed column markup and URL/state filtering, without saved-view or column-definition persistence/commands.

**Impact/test gap:** Repeated review configurations cannot be saved/reused, and dense tables cannot be tailored as specified. Persistent workspace timezone/theme preferences and URL filters exist; they do not provide saved table views. No save/reload/view-isolation or column-preference test exists.

### FA-26 — A zero foreign-currency execution fee incorrectly requires FX

**Evidence:** packages/server/src/analytics/sources.ts:321–325 resolves a reporting rate for every fee before considering whether its amount is zero. Missing rate produces missing_fee_fx. The inventory cost kernel correctly skips translation for zero at packages/domain/src/inventory.ts:205–209.

**Executed source-adapter reproduction:** A completed USD campaign with a recorded zero EUR execution fee and no EUR/USD rate returns **net P&L available 10**, but **fees unavailable, missing_fee_fx**. Known zero costs should be available zero in reporting currency without an exchange observation.

**Impact/test gap:** Contradictory coverage and unnecessary manual-FX/provider work. tests/integration/analytics-services.test.ts:928 covers a standalone same-unit zero, not an execution-linked zero foreign fee.

### FA-27 — Current documentation contains stale implementation statements

**Evidence:** docs/ux-review.md:113 groups multi-leg campaigns among features requiring advanced APIs/later screens, although journal-workspace.tsx:829–847 implements Add instrument leg. docs/security.md:106 still describes uncommitted fix/phase-13-security work and a Phase 12 HEAD, whereas this checkout is the later merged commit recorded above. docs/architecture.md:5 and docs/domain-model.md:7 retain “financial features deferred/unimplemented” status statements despite the implemented financial packages.

**Impact:** Readers must reconstruct which statements are historical evidence, current capability or future design. Historical phase reports should remain historical; the defect is the lack of an unambiguous current implementation status at documents used as current review entry points. Fresh 817/512 test results do not invalidate earlier historical counts.

**Missing verification:** A current capability/status reconciliation against implemented routes and the full acceptance matrix. Do not erase prior review history or treat a past successful run as current release certification.

## Coverage and release implications

The audit found concrete specification omissions, wrong valuation/coverage behavior, accounting disagreements, temporal and asset-class validation assumptions, scale failures, an authentication availability vulnerability, inert outbox infrastructure and stale documentation. The missing regressions are attached to their corresponding findings rather than presented as a generic request for more tests.

No broker-specific accounting coupling was confirmed in the inspected paths: import adapters produce canonical drafts and core commands select economics. No active XSS, SQL injection, SSRF, path traversal, token disclosure or cross-workspace authorization bypass was demonstrated. Existing decimal arithmetic, balanced postings, immutable corrections where implemented, authorization/RLS, CSRF and private-storage controls have substantial coverage; this is limited positive evidence, not a security guarantee.

Do not enable unvalidated advanced formulas or weaken safe report caps to close these findings. Before full-spec release, resolve the P1 defects and missing core workflows, make P2 limitations explicit and reviewable, and verify corrected behavior with the independent cases above. Reconcile all 16 acceptance scenarios with working paths; particularly AC-03, AC-05–09, AC-14–16 cannot be considered fully delivered merely because narrower backend or historical phase checks pass.
