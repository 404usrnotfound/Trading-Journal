# Phase 8 validation

This increment implements the analytics engine against the approved financial domain, ledger, immutable strategy versions, journal plans and account accounting. [Analytics definitions](analytics-definitions.md) supplies every formula, sample, unit, eligibility gate and source rule. This document records executed checks on this increment; earlier phase validation remains historical.

## Delivered changes

- Pure Decimal campaign statistics with versioned definitions, complete values, eligible/excluded IDs, known subtotals and explained unavailable/infinite states.
- Gross/net/realized/unrealized P&L, once-counted attributed fees, closed outcome rates/means/ratios, immutable original-risk R aggregates, holding duration, streaks and monetary drawdown/recovery.
- Separate combined, completed-only and open-only populations; campaign attribution remains separate from account/portfolio period performance.
- All 14 requested breakdown dimensions, including exact strategy versions, explicit mixed/unknown membership and overlapping non-additive tags.
- Authenticated viewer-accessible read-only REST/OpenAPI contract, with tenant isolation, coherent financial/economic cutoffs, independent recorded-metadata cutoff and immutable source identities/hashes.
- Independent arithmetic, persisted financial, temporal, provenance and API fixtures; no dashboard or new financial commands.

The analytics feature requires no new database schema, migration, dependency, secret or deployment configuration. Schema readiness remains version 8. Existing development instructions and storage/worker setup apply.

## Independent evidence

The pure suites include 400 seeded BigInt models independent of Decimal.js: 200 monetary outcome/rate/mean/ratio/drawdown/streak models, 100 completed/open and additive-group conservation models, and 100 signed-fee/original-risk eligibility models. Example fixtures cover all-win/all-loss/breakeven/empty populations, infinite versus undefined ratios, missing inputs, overflow, exact microsecond durations, known/ambiguous chronology gaps, deterministic ties and recovered/ongoing drawdown episodes. An additional independent local drawdown/recovery oracle passed 10,000 seeded sequences. Seven indexed-FX equivalence tests compare against the canonical selector over dense 10,000-observation histories, direct/inverse routes, all 64 configured sources, lexical ties, exact freshness boundaries and future/stale evidence.

Real PostgreSQL campaigns independently reconcile gross outcomes `[110, -40, 10, 160, -15]`, actual fees `10` each, net outcomes `[100, -50, 0, 150, -25]` and original-risk outcomes `[1, -1, 0, 3, -0.5]`. Expected totals are gross `225`, fees `50`, net `175`, win/loss rates `0.4`, monetary expectancy `35`, average R `0.5`, cumulative R `2.5`, maximum drawdown `50` and current drawdown `25`. Strategy v1/v2 attribution survives v3 publication and later draft risk edits. Mixed multi-account long/short campaigns conserve whole-campaign money/R rather than duplicating outcomes across legs. Fractional scaling retains marked open gross `37.5`, net `34.5`, realized `8.5` and unrealized `26`, with no completed win/R sample.

Contract/API checks reject binary numeric money/revisions, invalid intervals/timezones, duplicated selections, unsupported fields, oversized bodies, malformed JSON, inappropriate media types, future financial/metadata generations and mixed live/paper scope. Sessions, current viewer permissions, wrong-tenant isolation and private no-store responses remain enforced. Reports leave financial revisions, commands, audit and outbox counts unchanged. Funding is excluded from campaign P&L.

The 22 source-service PostgreSQL fixtures additionally cover financial corrections, removed opening attribution after accepted closure, original metadata generations, later empty legs, historical and policy-selected FX, missing fee coverage, rebates, signed fractional shorts, execution-linked late fees, standalone carrying-cost lineage and active windows, zero fees, compatible instrument versions, pre-acquisition/stale marks, and the Madrid DST change with an exact two-microsecond duration. Query budgets include nested principal/cost allocation weights before decoding oversized payloads; indexed FX avoids scanning the entire observation history per fill.

## Executed checks

| Check                                                                | Result                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Cold frozen-lockfile installation                                    | Passed in a source-only copy with an empty dedicated store: 436 packages added, 433 downloaded, zero reused            |
| Full unit/property/React regression suite                            | Passed: 537 tests in 35 files, including all 400 generated analytics models                                            |
| Full PostgreSQL regression suite on fresh owned database             | Passed: 405 tests in 23 files, zero unhandled errors; all prior ledger/accounting/strategy/journal/platform checks     |
| API/OpenAPI/generated-client drift                                   | Passed in the clean source copy                                                                                        |
| Formatting                                                           | Passed in the clean source copy; final handoff documents checked separately                                            |
| ESLint                                                               | Passed with zero warnings in the clean copy and final checkout                                                         |
| Root and all workspace TypeScript checks                             | Passed in the clean copy and final checkout                                                                            |
| Domain/worker/Next production build                                  | Passed in the clean source copy, including the new Next analytics route                                                |
| Fresh migrations, repeat migration and configured database readiness | Passed: fresh schema/queue setup, repeat migration, original upgrade preservation and local runtime-role readiness     |
| Development web/worker and standalone production restart             | Passed: persisted exact analytics and immutable provenance through both restarts, schema 8 readiness                   |
| Existing browser/axe regressions                                     | Passed: 9 journeys, including ledger, strategy/version history, original journal risk, private media and accessibility |
| Git/whitespace/source-scope inspection                               | 17 created, 11 modified, 0 deleted; no staged files or tracked secret/configuration changes                            |

Validation uses Node `24.19.0`, pnpm `10.34.6`, PostgreSQL 17 and the unchanged lockfile. The clean source copy excludes `.env`, `.git`, private media/configuration, dependency directories and previous builds. Integration/runtime controllers create uniquely named owned `_test` databases on the dedicated test instance; normal development data and files are retained. No credential or credential URL is added to tracked source.

External logs, exit receipts, source hash manifests and runtime controllers are retained under `/tmp/trading-journal-phase8-checks/` and `/tmp/trading-journal-phase8-clean-kyf0nq2w/`. They are local validation evidence, not committed application files. Local HTTP restart checks do not claim TLS termination or deployment.

The clean runtime proof exercises actual Next handlers as a separate current viewer without mutation CSRF. A persisted closed campaign independently expects gross `40`, fees `5`, net `35` and original-risk `1.75R`; later draft risk/regime changes preserve the original plan and strategy pin. Financial values, metadata/plan hashes, effective execution/fee identities, sessions and private PNG bytes/hash survive development and standalone production web/worker restarts. Reports add no financial revision, command, audit or outbox event. Existing portfolio/transit reporting remains revision-pinned across the same restarts.

Validation exposed and corrected initial source typing/SQL fixture issues, a safe-error assertion matching the English verb “select”, and the exhaustive property's five-second default timeout under concurrent checks. The 200-case property now has an explicit 30-second budget; all generated cases and assertions remain enabled. A pre-existing migration-test cleanup race passed every assertion but caused an asynchronous connection-termination error: the helper now waits for this generated database's connections to disconnect, uses normal DROP instead of FORCE, and verifies removal. Its targeted 24-test rerun passed without unhandled errors.

A PostgreSQL exception dump exposed a local operator credential in tool output during diagnosis. The saved log was redacted, and the credential was rotated and verified in both local development/test PostgreSQL instances. Only ignored private bindings changed; data and application/auth/job credentials were retained. The final outcome table records successful validation, not the earlier failing runs.

## Scope and handoff

Reports calculate revision-pinned campaign attribution; they do not archive report bytes. Stable catalog labels describe the selected read snapshot, while journal/plan/strategy content identities and hashes are retained. Open campaign money is lifetime attribution as of the valuation instant, not an interval account return. Missing monetary results cannot be displayed as complete; eligible outcome/R samples disclose exclusions. R uses the unchanged original risk currency and commitment. Display FX translation cannot supply missing original-risk source pins.

Maximum/current drawdown are monetary measures on a zero-anchored completed-campaign net curve. Percentage NAV/flow-adjusted drawdown, TWR/MWR, account return solvers, dashboards, imports, exports/restore and asynchronous projections remain future capabilities. Unsupported asset-native inventory or missing basis/cost/FX returns explicit unavailable results. Completing this engine does not claim the complete product acceptance journeys.

This validation records the pre-publication handoff on `feat/phase-8-analytics`, when the changes were uncommitted for user review. The user subsequently approved committing, pushing and merging Phase 8 into `main`. Publication Git evidence is reported separately; no deployment is included.

## Final change inventory

Created (17):

```text
apps/web/src/app/api/v1/workspaces/[workspaceId]/analytics/[...path]/route.ts
docs/analytics-definitions.md
docs/phase-8-validation.md
packages/contracts/src/analytics.ts
packages/domain/src/analytics-types.ts
packages/domain/src/analytics.ts
packages/server/src/analytics/api.ts
packages/server/src/analytics/fx.ts
packages/server/src/analytics/service.ts
packages/server/src/analytics/sources.ts
tests/integration/analytics-api.test.ts
tests/integration/analytics-independent-fixtures.test.ts
tests/integration/analytics-services.test.ts
tests/unit/analytics-contracts.test.ts
tests/unit/analytics-properties.test.ts
tests/unit/analytics-sources-fx.test.ts
tests/unit/analytics.test.ts
```

Modified (11):

```text
README.md
apps/web/src/lib/api-response.ts
docs/development-plan.md
docs/financial-metrics.md
packages/contracts/openapi.json
packages/contracts/src/generate.ts
packages/contracts/src/generated/api.d.ts
packages/contracts/src/index.ts
packages/domain/src/index.ts
packages/server/src/index.ts
tests/integration/database.test.ts
```

Deleted: none. This inventory was captured at the uncommitted review handoff, with no staged changes. Published migrations/snapshots, the lockfile, `.env.example`, deployment/CI configuration and authoritative product/architecture/domain specifications remain unchanged. Final publication Git status is reported separately.
