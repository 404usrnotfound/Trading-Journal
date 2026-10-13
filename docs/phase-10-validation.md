# Phase 10 validation

**Verification complete for this increment.** This record concerns the broker-agnostic import increment on `feat/phase-10-imports`, based on the published Phase 9 commit `c6356f80a2f8b1171c0a11d8379307d8c6c6dc50`. Completed results are recorded below. The final eleven-journey browser suite passed against the final clean build. Rebuilt screenshots were inspected and the final source/inventory manifest matched the checkout. No Phase 10 commit, push, merge or deployment has been performed.

## Implemented scope

- Trusted versioned adapter registry, strict canonical import model and universal/canonical CSV independent of broker APIs.
- Bounded UTF-8 CSV parsing, exact decimal/date normalization, explicit catalog identities, immutable mapping versions and preserved source/hash/raw rows.
- Account/namespace/kind-scoped stable IDs and normalized fingerprints; duplicate/ambiguous/correction decisions and financial no-op retries.
- Actual-command dry runs in rollback savepoints with deferred-constraint evaluation, reviewed source/batch revisions and atomic complete-group commits.
- Explicit partial batches, reviewed cash/fill corrections, exact execution-cash evidence reconciliation, append-only independent-cash reversal and history.
- Tenant-scoped API, private authorized source download, responsive Imports UI, saved mappings, paginated history, shared navigation and read-only viewer mode.
- Additive migration `0008_broker_agnostic_imports.sql`, schema readiness version 9, shared generated API contracts and import documentation/examples. Applied migrations 0000–0007 remain frozen.

[Import semantics](imports.md) and [ADR 0011](decisions/0011-broker-agnostic-imports.md) define the delivered boundaries. No named broker compatibility, automatic campaign/strategy attribution, owned account/holding transfer import, settlement/reclassification import, large background jobs, full statement variance engine, export or backup/restore is claimed. Sources are private bounded PostgreSQL text; media storage and future bulk-source objects retain their separate private-file lifecycle.

## Correctness and security evidence

The full unit/property/UI regression passed **580 tests in 40 files**. The complete PostgreSQL regression passed **454 tests in 26 files** on a fresh independently owned database. Both import integration files also passed separately on a fresh database: **35 tests**, comprising 18 import workflows and 17 concurrency/privacy/safety cases. The final minor UI changes passed all **five import UI tests**. These checks retain the existing ledger, accounting, strategy, journal, analytics and dashboard regressions.

| Area                       | Evidence covered by the import tests                                                                                                                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source parsing             | Quoted delimiters, escaped quotes, multiline records, BOM/CRLF preservation, physical line numbers, unsafe headers, malformed records and enforced byte/row/column/field bounds.                                                                                                                                              |
| Exact normalization        | Decimal-comma/grouping conventions, fractional precision, canonical zeroes, equivalent order prices/ratios and instrument increments, exponent/expression rejection, impossible dates, explicit offsets, microseconds, DST gaps and repeated local times.                                                                     |
| Adapter independence       | A documented independent parser uses the registered canonical contract without changing any financial-domain handler; uninstalled versions are safe validation failures.                                                                                                                                                      |
| Unknown economics          | Omitted fill/opening-lot cost completeness remains false; omitted and explicit unknowns have identical identities. Unknown opening basis is preserved.                                                                                                                                                                        |
| Dependencies               | Unique local keys, explicit references and stable IDs for dependent facts; ambiguous keys fail; renamed/reordered declarations retain identity; fixed-size memoized hashes bound repeated dependency graphs.                                                                                                                  |
| Dry-run conservation       | Staging/preview creates no financial activity; simulated financial writes and result/source effects roll back, including deferred checks. Exact valid cash commits afterward.                                                                                                                                                 |
| Partial groups             | Invalid complete groups cannot commit; separately reviewed valid selections persist atomically while excluded rows remain visible.                                                                                                                                                                                            |
| Duplicates and concurrency | Identical command replay and cross-file reimport do not change financial facts; overlapping commits serialize, stale previews refresh and only one effect is booked. Account/namespace identity scopes remain distinct.                                                                                                       |
| Existing activity          | Equivalent manually/API-booked stable cash/fill IDs are adopted without a second command or cash posting, including legacy unknown fee completeness.                                                                                                                                                                          |
| Corrections                | Changed stable cash/fill IDs require a reviewed reason; reversals/replacements preserve the original facts and provenance rather than appending a duplicate event.                                                                                                                                                            |
| Multi-currency effects     | Fractional fills, charged fees, actual FX conversions and distinct fee currencies use existing ledger rules.                                                                                                                                                                                                                  |
| Cash reconciliation        | Exact principal/fee/net execution-linked evidence reconciles without another posting; a variance rolls back the whole selected group.                                                                                                                                                                                         |
| Reversal                   | Independent cash reverses with inverse balanced postings; retries are safe; reversed IDs cannot resurrect. Fills are blocked. Outside financial activity, interleaved partial commits and no-op recommits cannot bypass the first-effect ownership boundary.                                                                  |
| Privacy and permissions    | Viewer/editor boundaries, trusted origin, session CSRF and UUID command keys precede writes; foreign workspace reads/downloads fail; RLS and runtime deletion denial protect source records.                                                                                                                                  |
| Immutable evidence         | SQL mutation attempts cannot rewrite original source, mapping snapshots, row intent, command attribution, scoped source identities or append-only operation/source history.                                                                                                                                                   |
| Browser journey            | The new built-app journey covers saved mapping, upload/stage, dry-run review, warning acknowledgement, exact cash, private source download, reload/history, duplicate reimport, cash reversal and read-only viewer behavior. The targeted journey and final full-suite run passed, including four responsive/theme axe scans. |

The [CSV examples](examples/imports/README.md) were run through the actual adapters and normalizer. Both yield two valid rows, the documented UTC instants and exact net cash `900`, with matching normalized identities across adapters. Placeholder catalog IDs must be replaced before users stage those files in a real workspace.

## Clean-environment method

Node **24.19.0** and pnpm **10.34.6** were used. The source-only verifier copied tracked and untracked non-ignored source into `/tmp/trading-journal-phase10-clean-ke4dgiek/source` and recorded SHA-256 per file. Its initial snapshot contained 339 nonsecret source files. It excluded `.env`, `.git`, private storage/cache, prior dependencies and build output, and rejected source symlinks. Frozen-lockfile installation passed in **8.8 seconds** using the shared verified package cache; no private configuration was copied. Root and source-only production builds passed. The final root and source-only builds include the panel/account-label refinements and journal save/publication fix; both passed. The refreshed source manifest matched all 339 source files.

Database checks used generated uniquely named `_test` databases on the dedicated test PostgreSQL instance. The controller read private bindings into the child environment, rewrote only its owned test database names, applied the reviewed migration chain through the normal test setup and dropped only its own database in `finally`. Existing development/test data and volumes were retained. Development migration, repeated migration and application-role `db:check` passed at schema version 9. The cold owned-database `db:migrate:check` also passed. Runtime services used least-privilege bindings, not operator credentials.

Built-app browser tests use isolated generated owner/viewer identities and a separately owned test database. The targeted Imports journey passed in **38.2 seconds**, covering exact cash, preserved source, review/history, duplicate reimport, reversal and viewer behavior. It runs four axe scans at desktop 1440 pixels/light, tablet 820 pixels/dark and mobile 390 pixels/light and dark, checks horizontal overflow and captures screenshots. Initial visual inspection found flush panel padding and an account label needing clearer presentation; scoped CSS and the label were corrected. Final rebuilt desktop, tablet and mobile screenshots were inspected; all four theme/viewport axe scans and horizontal-overflow checks passed.

The first full browser run passed ten journeys and failed one when its shared owner reached the actual ten-login-per-email limit. The import journey now creates its own generated owner, preserving the limiter and all workflow assertions. The final full run passed all eleven journeys in 2.5 minutes, including the unchanged journal and strategy scenarios.

Runtime coverage starts built web assets with HTTP `next start`, exercises health/schema readiness and authenticated import/source/history reads, and verifies browser reload persistence. It does **not** certify standalone HTTPS deployment or process-restart persistence. The built root web process also passed a local liveness 200, unauthenticated readiness 401 and null-session smoke check, then was stopped. No production deployment or restore drill was performed.

Build, compiler and full-suite workloads were kept separate where they share `.next` or compete for bounded cloud CPU. Temporary receipts/controllers remain outside the repository; public logs and summaries exclude private connection strings, source contents, passwords and session material. A verified cache was reused, so the install result is not a cold network-download benchmark.

## Verification results

| Check                                          | Command / method                                                                               | Result                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Source-only frozen install                     | `corepack pnpm install --frozen-lockfile` in the source-only copy                              | Passed in 8.8 seconds; verified shared cache reused, no private environment copied.                                                        |
| Full unit/property/UI regression               | `corepack pnpm test:unit`                                                                      | 580 passed in 40 files.                                                                                                                    |
| Final import UI checks                         | Vitest UI project on `tests/ui/imports.test.tsx`                                               | Five passed after the minor UI refinements.                                                                                                |
| Targeted import PostgreSQL checks              | Owned-database controller running both import integration files                                | 35 passed: 18 workflow plus 17 safety cases.                                                                                               |
| Full PostgreSQL regression                     | Existing integration configuration through the owned-database controller                       | 454 passed in 26 files on a fresh owned database.                                                                                          |
| API drift                                      | `corepack pnpm api:check`                                                                      | Passed.                                                                                                                                    |
| Formatting                                     | `corepack pnpm format:check`                                                                   | Passed.                                                                                                                                    |
| Lint                                           | `corepack pnpm lint`                                                                           | Passed.                                                                                                                                    |
| Comprehensive types                            | `corepack pnpm typecheck`                                                                      | Passed.                                                                                                                                    |
| Production build                               | `corepack pnpm build` in root and clean source-only copy                                       | Both final builds passed, including the journal regression fix.                                                                            |
| Targeted built-app import/browser/axe coverage | Imports journey against the owned test database                                                | Initial targeted run passed in 38.2 seconds; final suite import case passed in 17.4 seconds with four axe scans and inspected screenshots. |
| Full built-app browser regression              | `corepack pnpm test:e2e` against the owned test database                                       | Final run: all eleven passed in 2.5 minutes; earlier failures and fixes documented below.                                                  |
| Database readiness and migrations              | Development migration/repeat plus `db:check`; cold owned-database `db:migrate:check`           | Passed; schema version 9 and migration repeatability/integrity verified.                                                                   |
| Runtime/startup persistence                    | Built HTTP `next start`, health/schema readiness and authenticated browser/API/reload workflow | Passed within that scope; no standalone HTTPS or process-restart claim.                                                                    |
| Final source and inventory integrity           | Refreshed clean-copy manifest, migration hashes and final git status/diff                      | Passed: 339 source hashes matched; old migrations and dependencies unchanged; 30 created, 21 modified, no deleted files.                   |

## Failures, fixes and final limitations

The first clean build inherited development-mode `NODE_ENV` and failed prerendering; rebuilding with the correct production build environment passed. The initial browser selector matched Next.js route-announcer content; it was corrected to target the intended interface. Lint failures from unused variables and a one-file formatting failure were fixed, and both checks passed. None of those corrections removed financial assertions, authorization checks or test cases.

The first full browser run exposed shared-owner login saturation, as described above. The next run passed ten journeys and exposed an existing journal save/publication race: the UI reported a saved draft before its detail refresh completed, and a publication click in that interval returned without issuing a POST. The save now waits for refresh before reporting saved, preserves edits made during refresh and disables publication while saving. Two deferred-refresh regression cases passed, and the existing journal browser assertions remain unchanged. A dedicated generated import-test owner isolates the journey without increasing or bypassing the persisted ten-login limit. The targeted journey passed and the final full run passed all eleven journeys. Visual review prompted scoped panel padding and clearer account labeling; the final UI tests passed, and final rebuilt screenshots were inspected and accepted.

The delivered 2 MiB / 1,000-row source and 100-row selection limits do not establish the roadmap's 50,000-row benchmark. Unknown costs/basis remain unknown; account transfer/holding-transfer and settlement/reclassification imports, full statement variance reports, bulk jobs, exports and backup/restore remain outside this increment. Passing these local checks does not imply production deployment, measured bulk performance, standalone HTTPS/restart coverage or restore guarantees.

## File inventory

The current `git status --short --untracked-files=all` shows **30 created, 21 modified and 0 deleted files**. The final source manifest and file inventory matched the checkout after documentation was finalized. Runtime/cache/private files remain ignored. No local environment file or credential is included. Changes remain uncommitted on `feat/phase-10-imports`; no push, merge or deployment occurred.

### Created (30)

- `apps/web/src/app/api/v1/workspaces/[workspaceId]/imports/[...path]/route.ts`
- `apps/web/src/app/imports/page.tsx`
- `apps/web/src/components/imports/import-workspace.tsx`
- `apps/web/src/components/imports/imports.css`
- `docs/decisions/0011-broker-agnostic-imports.md`
- `docs/examples/imports/README.md`
- `docs/examples/imports/canonical-cash.csv`
- `docs/examples/imports/canonical-cash.mapping.json`
- `docs/examples/imports/generic-cash.csv`
- `docs/examples/imports/generic-cash.mapping.json`
- `docs/imports.md`
- `docs/phase-10-validation.md`
- `packages/contracts/src/imports.ts`
- `packages/database/migrations/0008_broker_agnostic_imports.sql`
- `packages/database/src/import-schema.ts`
- `packages/server/src/financial/cash-reversal.ts`
- `packages/server/src/imports/adapters/registry.ts`
- `packages/server/src/imports/api.ts`
- `packages/server/src/imports/csv.ts`
- `packages/server/src/imports/ledger-port.ts`
- `packages/server/src/imports/legacy-source.ts`
- `packages/server/src/imports/normalize.ts`
- `packages/server/src/imports/service.ts`
- `packages/server/src/imports/templates.ts`
- `tests/e2e/imports.spec.ts`
- `tests/integration/imports-safety.test.ts`
- `tests/integration/imports.test.ts`
- `tests/ui/imports.test.tsx`
- `tests/unit/imports-safety.test.ts`
- `tests/unit/imports.test.ts`

### Modified (21)

- `README.md`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/journal/page.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/strategies/page.tsx`
- `apps/web/src/components/journal/journal-editor.tsx`
- `apps/web/src/components/journal/journal-workspace.tsx`
- `apps/web/src/lib/api-response.ts`
- `docs/decisions/README.md`
- `docs/development-plan.md`
- `packages/contracts/openapi.json`
- `packages/contracts/src/generate.ts`
- `packages/contracts/src/generated/api.d.ts`
- `packages/contracts/src/index.ts`
- `packages/database/migrations/meta/_journal.json`
- `packages/database/src/readiness.ts`
- `packages/database/src/schema.ts`
- `packages/server/src/index.ts`
- `tests/integration/accounting-fixture.ts`
- `tests/ui/journal.test.tsx`
