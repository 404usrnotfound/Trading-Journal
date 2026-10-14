# Phase 11 validation

Verification is complete on `feat/phase-11-asset-extensibility`, based on merged Phase 10 commit `3a10c0c22e860825767b67f0da1b3f925241f1fd`. This record describes the asset-class audit and its narrow financial fixes. All checks below passed, including the final source-only build and eleven browser journeys. No commit, push, merge or deployment has been performed for this increment.

## Scope and correctness evidence

The [asset-class audit](asset-class-audit.md) and [implemented capability matrix](instrument-capabilities.md#current-implemented-operations) distinguish native ordinary stocks, ETFs and non-rebasing spot crypto from delivered FX cash and manual contract recording. Options, futures, bonds and rolling FX do not acquire automatic basis, P&L, R or holding valuation through a family label, supplied multiplier or price.

Three discovered calculation paths were corrected:

- Journal financial detail accepts truthful nullable manual multipliers without crashing or substituting a multiplier of one.
- Journal fill-weighted prices require compatible pinned quantity, currency, multiplier, capability and quote/settlement conventions. Raw percentage quotes retain their quote unit. Missing/oversized conventions remain unavailable instead of breaking the response. The editor explains the source quote convention.
- Opening-capital accounting requires native instrument and effective account eligibility. A manual future with two contracts at 5,000 and multiplier 50 cannot contribute 500,000 of invented capital; its actual cash remains visible and unsupported monetary attribution remains unavailable.

No dependency, public API shape, environment variable, secret, database migration or new native asset handler was added. Schema readiness remains version 9. Existing metadata versions and financial facts stay immutable.

| Representative evidence | Assertions                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stocks                  | Fractional shares, FIFO cost/fee allocation, actual cash, realized/unrealized results and reconciled account equity.                                                                           |
| ETFs                    | Scaling, partial sale, remaining share basis, fees and no additional ownership of underlying holdings.                                                                                         |
| Crypto                  | Exact 18-decimal quantities, source principal/fees, marked spot value and unsupported native short conventions.                                                                                |
| Delivered FX            | Both actual currency cash legs, rate direction, separately charged fee, reconciled equity and no currency-pair holding.                                                                        |
| Options                 | Actual supplied premiums/cash, known quantity, nullable multiplier, immutable specialized metadata and unavailable monetary analytics.                                                         |
| Futures                 | Recorded contracts, actual variation margin/fees and owned collateral cash; no notional purchase/NAV/capital promotion. Negative prices are rejected and documented as a representation limit. |
| Bonds                   | Face quantity, supplied clean/dirty consideration and income/tax cash evidence; raw quote units and refusal to combine incompatible price conventions.                                         |
| Shared boundaries       | Forged native capability rejection, unsupported manual analytics/NAV, explicit reviewed flat-campaign closure and canonical option import preview/commit without inferred principal.           |

The unit examples use independently specified numerical expectations. PostgreSQL examples exercise actual catalog, ledger, journal, accounting, analytics and import services, including least-privilege reads and immutable source evidence. Unsupported results are tested as null with reasons, rather than accepted as zero or asserted as complete account equity.

## Verification method

Node 24.19.0 and pnpm 10.34.6 were used. A source-only snapshot in `/tmp/trading-journal-phase11-clean-qt4a1gel/source` excludes `.env`, `.git`, private/cache files, previous dependencies and generated build output, rejects source symlinks and records SHA-256 source hashes. Frozen-lockfile installation passed using the existing verified package cache; this is a fresh install of the source snapshot, not a cold network-download benchmark. Private bindings are passed to child processes without copying the environment file.

Database checks create uniquely named owned `_test` databases on the dedicated PostgreSQL 17 test instance. They apply the regular migration chain and runtime roles, exercise the checks and drop only the newly created database in `finally`. Existing development/test data and volumes are retained. Public reports exclude connection strings, secrets, session material and uploaded source contents.

Compiler, build and full-suite workloads run separately. Production builds explicitly set `NODE_ENV=production`; browser tests run the built application over local HTTP with their own generated identities and owned test database. This establishes local application startup and workflows; it does not establish standalone HTTPS deployment, restart durability, restore readiness or full advanced-asset accounting.

## Executed checks

| Check                                           | Command / method                                                                        | Result                                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source-only install                             | `corepack pnpm install --frozen-lockfile`                                               | Passed in 7.6 seconds.                                                                                                                           |
| Targeted unit examples and journal calculations | Vitest on the new unit asset file and existing journal financial file                   | 50 passed in two files.                                                                                                                          |
| Full unit/property/UI regression                | `corepack pnpm test:unit` in root and final source-only copy                            | 597 passed in 41 files in both; final source-only run completed in 28 seconds.                                                                   |
| Initial targeted PostgreSQL asset suite         | Owned-database controller with the new integration file                                 | 21 passed; a subsequent oversized-convention case is included in the full regression.                                                            |
| Full PostgreSQL regression                      | Vitest integration configuration through the owned-database controller                  | 476 passed in 27 files in 181.48 seconds, including all 22 final asset cases.                                                                    |
| API drift                                       | `corepack pnpm api:check`                                                               | Passed.                                                                                                                                          |
| Formatting                                      | `corepack pnpm format:check`                                                            | Passed, including final documentation.                                                                                                           |
| Lint                                            | `corepack pnpm lint` in the source-only copy                                            | Passed with zero warnings.                                                                                                                       |
| Comprehensive types                             | `corepack pnpm typecheck` in the source-only copy                                       | Passed for root and all workspace packages.                                                                                                      |
| Production build                                | `corepack pnpm build` in the source-only copy                                           | Passed for domain, worker and web with the production build environment.                                                                         |
| Built-app browser regression                    | `corepack pnpm test:e2e` against an owned test database                                 | All 11 passed in 2.3 minutes against the final source-only build.                                                                                |
| Database migration integrity/repeatability      | Cold owned-database `corepack pnpm db:migrate:check`                                    | Passed at schema version 9, including repeated migration and integrity verification.                                                             |
| Database application-role readiness             | `corepack pnpm db:check`                                                                | Passed: application role connects and schema is current.                                                                                         |
| Final inventory and integrity                   | Source hashes, frozen migrations/dependencies, git diff/status and private binding scan | Passed: 343 source hashes match; 30 frozen migration/dependency/configuration files unchanged; no current private binding in non-ignored source. |

## Limits

Native derivative/fixed-income lifecycle accounting, signed futures prices, supplied per-holding monetary calculation selection, custody-representation conversion and the full specification's advanced acceptance workflows remain deferred. Generic specialized JSON metadata is immutable but does not validate or execute all contract terms. Manual account-value observations remain comparison evidence rather than NAV replacements. The audit documents these limits and the gates for future native promotion.

## File inventory

`git status --short --untracked-files=all` identifies **4 created, 9 modified and 0 deleted files**. The working tree contains these uncommitted changes on `feat/phase-11-asset-extensibility`; HEAD remains the merged Phase 10 baseline. The final inventory and refreshed source manifest match the checkout. Only documentation was finalized after the successful application build; application source remained unchanged. Runtime outputs and private configuration remain ignored. No publication has been performed.

Created:

- `docs/asset-class-audit.md`
- `docs/phase-11-validation.md`
- `tests/integration/asset-class-extensibility.test.ts`
- `tests/unit/asset-class-extensibility.test.ts`

Modified:

- `README.md`
- `apps/web/src/components/journal/journal-editor.tsx`
- `docs/development-plan.md`
- `docs/instrument-capabilities.md`
- `packages/domain/src/accounting-types.ts`
- `packages/domain/src/accounting.ts`
- `packages/server/src/accounting/report.ts`
- `packages/server/src/journal/financial.ts`
- `tests/unit/portfolio-accounting.test.ts`
