# Phase 12 validation

This record covers the UX refinement on `feat/phase-12-ux-refinement`, based on merged Phase 11 commit `5ea1eb09773cef9da6e6db7fb7ed56c4c131c1dc`. The [UX review](ux-review.md) maps the ten requested workflows to implementation and limitations; [ADR 0012](decisions/0012-workflow-ux.md) records the interaction decisions pending user review.

## Financial boundaries

The financial domain, accounting, analytics and import engines retain their existing formulas and classification. Existing ledger write implementations and migrations are unchanged. The backend additions are a read-only current-allocation endpoint and server-side journal activity/account filters before pagination. Activity filters use effective allocated fills, exact timestamp boundaries and creation-time fallback only for ideas without effective allocated fills. They do not change the completed-campaign analytics population.

The manual recorder calls existing governed commands with decimal strings, explicit source facts and retained command identities. It does not infer starting capital, close campaigns automatically or delete a recorded fill after an attribution failure. Existing-fill attribution posts no second execution or cash movement. Account review renders existing accounting results and preserves incomplete, unavailable and known-subtotal distinctions. Account source names containing commas retain their identities; multi-account links preserve each selected account.

## Verification method

Node 24.19.0, pnpm 10.34.6, PostgreSQL 17 and system Chromium were used. A source-only snapshot under `/tmp/trading-journal-phase12-clean-4g4zl94g/source` excludes private configuration, Git metadata, previous dependencies and build output, rejects source symlinks and records SHA-256 source hashes. Frozen-lockfile installation uses the existing verified package cache; it is a fresh installation of this source snapshot, not a cold network-download benchmark. Existing private bindings are passed to child processes without copying `.env` into the snapshot or documentation.

Database suites use uniquely named owned `_test` databases, regular migrations and runtime roles, and drop only those databases in `finally`. Existing development/test data and volumes are retained. Full compiler, unit, build and browser workloads run separately.

The production build explicitly uses `NODE_ENV=production`. Browser verification runs the built web application over local HTTP with generated test identities and an owned database. It establishes local startup, authenticated schema readiness and the tested persisted workflows; it does not establish HTTPS deployment, restore readiness, restart durability or advanced-asset accounting.

## Executed checks

Every final check below passed; no test was disabled or skipped to obtain these results.

| Check                                  | Command / method                                                                                                 | Result                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source-only install                    | `corepack pnpm install --frozen-lockfile`                                                                        | Passed in 8.6 seconds; dependency declarations and lockfile remain unchanged.                                                                                                                                   |
| Read-contract unit tests               | Targeted Vitest contracts                                                                                        | 6 passed.                                                                                                                                                                                                       |
| Read-workflow PostgreSQL tests         | Fresh database, targeted integration suite                                                                       | 9 passed, including exact boundaries, tenant isolation, effective allocations and concurrent snapshot consistency.                                                                                              |
| Full PostgreSQL regression             | `corepack pnpm test:integration` with owned-database controller                                                  | 485 passed in 28 files in 206.34 seconds. Backend source remained unchanged after this run.                                                                                                                     |
| Full unit/property/UI regression       | `corepack pnpm test:unit` in the final source snapshot                                                           | 667 passed in 45 files in 48.29 seconds, including the recorder retry, navigation and preference refinements.                                                                                                   |
| API drift                              | `corepack pnpm api:check`                                                                                        | Passed; generated OpenAPI and client types match the contracts.                                                                                                                                                 |
| Formatting                             | `corepack pnpm format:check`                                                                                     | Passed, including the final documentation.                                                                                                                                                                      |
| Lint                                   | `corepack pnpm lint`                                                                                             | Passed with zero warnings.                                                                                                                                                                                      |
| Comprehensive types                    | `corepack pnpm typecheck`                                                                                        | Root and all workspace packages passed; production web builds also checked the final client refinements.                                                                                                        |
| Production build                       | `corepack pnpm build` in the source-only copy                                                                    | Domain, worker and web passed with the production build environment.                                                                                                                                            |
| Built-app browser regression           | `corepack pnpm test:e2e` with owned-database controller                                                          | All 12 passed in 3.3 minutes against the final build.                                                                                                                                                           |
| Migration integrity/repeatability      | Cold owned-database `corepack pnpm db:migrate:check`                                                             | Passed with unchanged schema version 9.                                                                                                                                                                         |
| Application-role readiness             | `corepack pnpm db:check` and authenticated browser readiness                                                     | Passed: application role connects and schema is current; anonymous readiness remains protected.                                                                                                                 |
| Source/private configuration integrity | SHA-256 manifest, frozen financial/configuration boundaries, current private-binding scan, Git whitespace/status | 370 source hashes match the checkout and verification snapshot; existing financial engines, migrations, dependencies and configuration are unchanged; no current private binding appears in non-ignored source. |

## Browser and visual evidence

The browser suite exercises real persisted manual recording, existing-fill attribution, ledger reads, source import/preview/commit/reversal, original-risk publication, journal review and private attachments, immutable strategy versions and trade pins, dashboard filters/drill-down, preferences and authentication. The manual journey starts with an empty workspace and creates source-verified reference records through the UI. It deliberately commits an allocation then replaces its response with a 503, checks exact fractional source values and cash, and retries the original command without another execution or cash booking. Existing-fill attribution leaves cash unchanged. Account review displays `-4.25 USD` cash, partial equity and zero external flows without writing financial facts.

Automated axe checks cover the selected WCAG 2.x A/AA tags through 2.2 AA. Dashboard and strategy journeys run at desktop 1440, tablet 820 and mobile 390 widths in both themes; import, recording and account review cover 1440/light, 820/dark and 390/light+dark. Journal and authentication/overview checks cover desktop/mobile in both themes. The tests assert that the document does not overflow horizontally; financial tables retain their own scroll regions. Keyboard checks include dashboard tab navigation, sign-in, dialog Escape/cancellation/focus restoration and input validation. Screenshots were inspected for the manual recorder, account review, imports and journal, including desktop light and mobile dark views. This is representative visual review, not a complete manual accessibility audit.

## Findings corrected during validation

Initial zero-test module failures exposed an undeclared direct Zod import in web/test consumers. Consumers now use schema return types and the contracts package's declared Zod error export; no dependency was added. A manual-response fixture put an execution payload field at the top level; the fixture was corrected to the strict API shape. New read tests now assert the existing inaccessible-resource response without weakening tenant isolation. Journal date validation explicitly rejects year zero to match PostgreSQL timestamp representation. Unsupported Testing Library query options were removed without weakening name assertions.

Full lint identified mutable recorder React state and an effect that copied a derived matching leg into state. The final refinement separates mutable command progress from immutable rendered snapshots and derives the matching choice until preview freezes it. Sign-out confirmation distinguishes guards that supply their own continuation dialog from a shared fallback, preserves canceled input and retains dirty strategy protection when logout fails.

Browser validation initially finished with 8 passed and 4 failed, then 10 passed and 2 failed. These failures exposed undersized dashboard help disclosures, an unstyled strategy trade link and a preference initialization/edit race. Help targets now have a 44-pixel minimum height, the link is underlined, and preference fields remain disabled until React Hook Form is ready. The recorder error assertion is scoped away from Next.js’s global route announcer. Its final allocation assertion explicitly includes the ledger’s zero unassigned row, with exact cardinality and quantities rather than assuming that row disappears. All existing financial assertions were retained. The final complete browser run passed all 12.

## Limits

Automated axe checks and inspected screenshots do not establish complete WCAG 2.2 AA conformance or coverage of every screen reader, browser, operating system, zoom level or content extreme. The workflow boundaries in the [UX review](ux-review.md) remain material: one fill and at most one fee per recording, bounded catalogs, advanced API paths for unsupported allocations/cash/asset lifecycles, in-memory retry recovery and per-trade weekly reviews without a dedicated period-note entity. Account and campaign reports retain separate populations and observation policies.

## File inventory and publication

Final `git status --short --untracked-files=all` identifies **27 created, 41 modified and 0 deleted files** on `feat/phase-12-ux-refinement`. The working tree contains these uncommitted changes; HEAD remains the merged Phase 11 baseline. The final source manifest matches the checkout. Only documentation was finalized after the successful application build/browser run; application source remains unchanged. Runtime outputs and private configuration remain ignored. No commit, push or merge has been performed.

Created:

- `apps/web/src/app/accounts/page.tsx`
- `apps/web/src/app/record/page.tsx`
- `apps/web/src/components/accounts/account-workspace.tsx`
- `apps/web/src/components/accounts/accounts.css`
- `apps/web/src/components/application-shell.tsx`
- `apps/web/src/components/journal/journal-navigation.ts`
- `apps/web/src/components/journal/journal-ux.css`
- `apps/web/src/components/journal/journal-validation.ts`
- `apps/web/src/components/record/catalog-setup.tsx`
- `apps/web/src/components/record/manual-record-workspace.tsx`
- `apps/web/src/components/record/record-api.ts`
- `apps/web/src/components/record/record-fields.tsx`
- `apps/web/src/components/record/record.css`
- `apps/web/src/components/strategies/strategies.css`
- `apps/web/src/components/ux/confirm-dialog.tsx`
- `apps/web/src/components/ux/navigation-request.ts`
- `apps/web/src/components/ux/ux.css`
- `apps/web/src/lib/workspace-page.ts`
- `docs/decisions/0012-workflow-ux.md`
- `docs/phase-12-validation.md`
- `docs/ux-review.md`
- `tests/e2e/manual-record.spec.ts`
- `tests/integration/ux-read-workflows.test.ts`
- `tests/ui/accounts.test.tsx`
- `tests/ui/manual-record.test.tsx`
- `tests/ui/ux-dialog.test.tsx`
- `tests/unit/ux-read-contracts.test.ts`

Modified:

- `README.md`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/imports/page.tsx`
- `apps/web/src/app/journal/page.tsx`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/strategies/page.tsx`
- `apps/web/src/components/dashboard/dashboard-time.ts`
- `apps/web/src/components/dashboard/dashboard-workspace.tsx`
- `apps/web/src/components/dashboard/dashboard.css`
- `apps/web/src/components/imports/import-workspace.tsx`
- `apps/web/src/components/imports/imports.css`
- `apps/web/src/components/journal/journal-attachments.tsx`
- `apps/web/src/components/journal/journal-editor.tsx`
- `apps/web/src/components/journal/journal-workspace.tsx`
- `apps/web/src/components/sign-out-button.tsx`
- `apps/web/src/components/strategies/strategy-editor.tsx`
- `apps/web/src/components/strategies/strategy-workspace.tsx`
- `apps/web/src/components/workspace-preferences.tsx`
- `docs/decisions/0011-broker-agnostic-imports.md`
- `docs/decisions/README.md`
- `docs/development-plan.md`
- `packages/contracts/openapi.json`
- `packages/contracts/src/financial.ts`
- `packages/contracts/src/generate.ts`
- `packages/contracts/src/generated/api.d.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/journal.ts`
- `packages/server/src/financial/api.ts`
- `packages/server/src/financial/ledger.ts`
- `packages/server/src/journal/service.ts`
- `tests/e2e/dashboard.spec.ts`
- `tests/e2e/imports.spec.ts`
- `tests/e2e/journal.spec.ts`
- `tests/e2e/scaffold.spec.ts`
- `tests/e2e/strategies.spec.ts`
- `tests/ui/dashboard.test.tsx`
- `tests/ui/imports.test.tsx`
- `tests/ui/journal.test.tsx`
- `tests/ui/sign-out-button.test.tsx`
- `tests/ui/strategies.test.tsx`
