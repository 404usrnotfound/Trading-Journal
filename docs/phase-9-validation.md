# Phase 9 validation

This record concerns the dashboard increment on `feat/phase-9-dashboard`. Phase 8 remains the published baseline. No Phase 9 commit, push, merge or deployment has been performed.

## Scope

New pure dashboard population/bucket logic, strict shared contracts and generated OpenAPI, tenant-scoped snapshot reader/API, authenticated responsive dashboard, shared navigation and pinned chart dependencies. Existing migrations and financial posting rules are unchanged. README and dashboard semantics document use and limits.

## Verification

The full unit/property/UI suite passed 550 tests in 37 files. The complete PostgreSQL regression run passed 418 tests in 24 files on a fresh isolated database; all prior financial/platform regressions passed. The final targeted PostgreSQL dashboard suite passed 14 tests against a newly created isolated test database, including independent equity versus funding reconciliation, portfolio scope, all trade dimensions, tenant isolation, strict query bounds, read-only behavior, missing historical account settings and microsecond sample deduplication and narrowing a workspace with more than 100 accounts. The full run preceded the last additional fixture; the targeted rerun covers the final service changes.

Initial full-suite runs encountered timing limits under concurrent cloud workloads. The runner now uses two workers and a 30-second default budget; the existing 200-model property test has a 60-second budget, and dashboard DOM polling has a local ten-second budget. Assertions, model count and eligibility rules are unchanged. The subsequent complete 549-test run passed. After navigation and presentation refinements, the final 550-test run passed. Dashboard readiness polling now waits for a lightweight text marker before role assertions, preventing repeated accessibility-tree traversal from starving pending mocked requests. A new presentation test verifies that tiny nonzero monetary profits/losses retain their sign and significance.

The first browser journey exposed an incorrect fixture response parser for a journal draft save; it was corrected to the existing journal-entry response schema. The dashboard browser journey passed all financial/filter/drill-down assertions and eight accessibility scans: distributions and breakdowns plus performance at 1440, 820 and 390 pixels in light/dark themes. Visual inspection prompted a one-column tablet chart layout. The first full browser run had eight passes and two failures: duplicate journal mobile navigation (corrected by extending its existing navigation), and a strategy accessibility-scan timeout under concurrent compiler load. The final full browser rerun executes separately from compiler/unit workloads: nine journeys passed, including the fixed journal navigation. The strategy journey still exceeded its two-minute overall budget while progressing through owner/viewer workflows. Its eighteen full accessibility scans now have a six-minute journey budget; all assertions remain enabled. A targeted strategy rerun supplies the remaining final result below.

## Environment checks

Node 24.19.0 and pnpm 10.34.6. Frozen-lockfile installation and final domain/worker/Next production build passed in a source-only copy with no `.env`, private files, prior dependencies or build output copied. The shared verified package cache was reused. Database application-role connectivity and isolated migration repeatability checks passed. Final lint and comprehensive type-checking passed on the completed source. Final OpenAPI freshness and formatting checks also passed. Browser tests run the built web application against another independently owned test database.

## Final results

| Check                                                              | Result                                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source-only frozen-lockfile install                                | Passed; 474 packages, verified shared cache reused                                                                                                          |
| Full unit/property/UI regression                                   | 550 passed in 37 files; no skipped tests                                                                                                                    |
| Full PostgreSQL regression                                         | 418 passed in 24 files on a fresh owned database                                                                                                            |
| Final dashboard PostgreSQL rerun                                   | 14 passed; includes the final oversized-workspace recovery fixture                                                                                          |
| Final built-app browser coverage                                   | All ten unique journeys validated: nine passed in the final full run; the strategy case passed separately after its journey budget increased to six minutes |
| Dashboard accessibility                                            | Eight scans passed: distributions/breakdowns and desktop/tablet/mobile performance in light/dark themes                                                     |
| Strategy accessibility                                             | Eighteen scans and owner/viewer/history/attachment assertions passed in the targeted rerun                                                                  |
| Final lint and comprehensive type-check                            | Passed                                                                                                                                                      |
| Final source-only domain/worker/Next production build              | Passed                                                                                                                                                      |
| Application-role database connectivity and migration repeatability | Passed; schema/migrations unchanged                                                                                                                         |

The final strategy rerun completed in 2.1 minutes including setup (1.6 minutes for the journey). The earlier full runs retained their failures in this record; no assertion was removed or disabled. The corrected mobile journal navigation passed the original full journal workflow. Tiny-value monetary formatting and lightweight UI readiness polling passed the final complete unit/UI run. Source changes after the final build are documentation and the strategy test's timeout/comment only.

Screenshots were inspected for desktop/tablet/mobile themes and distribution/breakdown layouts. Exact financial tables, unavailable sample gaps, signed monetary values, shared filter state, URL/reload persistence, journal drill-down and absence of horizontal overflow were verified. Local HTTP tests start the built web application in its documented test environment; this is not a production deployment. Account-return solvers, pricing integrations and background daily projections remain deferred; [dashboard semantics](dashboard.md) records synchronous limits and sampled-equity behavior.

## File inventory

No files were deleted. Generated runtime/cache/private files are ignored. No new secret or migration is needed. Changes remain uncommitted on `feat/phase-9-dashboard`; no push, merge or deployment occurred.

### Created (18)

- `apps/web/src/app/api/v1/workspaces/[workspaceId]/dashboard/[...path]/route.ts`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/components/dashboard/dashboard-calendar.tsx`
- `apps/web/src/components/dashboard/dashboard-chart.tsx`
- `apps/web/src/components/dashboard/dashboard-format.ts`
- `apps/web/src/components/dashboard/dashboard-time.ts`
- `apps/web/src/components/dashboard/dashboard-workspace.tsx`
- `apps/web/src/components/dashboard/dashboard.css`
- `docs/dashboard.md`
- `docs/phase-9-validation.md`
- `packages/contracts/src/dashboard.ts`
- `packages/domain/src/dashboard.ts`
- `packages/server/src/dashboard/api.ts`
- `packages/server/src/dashboard/service.ts`
- `tests/e2e/dashboard.spec.ts`
- `tests/integration/dashboard.test.ts`
- `tests/ui/dashboard.test.tsx`
- `tests/unit/dashboard.test.ts`

### Modified (19)

- `README.md`
- `apps/web/package.json`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/journal/page.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/strategies/page.tsx`
- `apps/web/src/components/journal/journal-workspace.tsx`
- `apps/web/src/lib/api-response.ts`
- `docs/development-plan.md`
- `packages/contracts/openapi.json`
- `packages/contracts/src/generate.ts`
- `packages/contracts/src/generated/api.d.ts`
- `packages/contracts/src/index.ts`
- `packages/domain/src/index.ts`
- `packages/server/src/index.ts`
- `pnpm-lock.yaml`
- `tests/e2e/strategies.spec.ts`
- `tests/unit/analytics-properties.test.ts`
- `vitest.config.ts`
