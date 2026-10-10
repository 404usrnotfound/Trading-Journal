# Phase 3 scaffold validation

This record covers the newly authorized foundation rebuilt from approved Phase 0–2 documents. Financial features are not part of this increment. All eight required clean-environment gates passed on 2026-10-10; the final results below certify this source, not the reverted scaffold.

## Verification environment

Node 24.19.0, Corepack 0.34.6, pnpm 10.34.6, PostgreSQL 17 (pinned Compose image), Next.js 16.3.8, React 19.3.0, TypeScript 5.9.3 and Vitest 5.0.3. Exact dependencies are in package manifests and the lockfile; official registry engine/peer metadata was checked before installation.

The verification source copy is `/tmp/trading-journal-phase3-clean-48c0c9bd`, copied without Git metadata, dependencies, build products, environment files, caches or private data. Installation uses a new empty pnpm store. It has new credentials, Compose project `trading-journal-clean-48c0c9bd`, a new development volume, a dedicated temporary test instance, database ports 5542/5543 and web/worker ports 3300/3311. It does not reuse the retained scaffold database or archived runtime files.

## Required gates

| Gate                | Command/evidence                                                                                       | Result                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Install             | `corepack pnpm install --frozen-lockfile --store-dir /tmp/trading-journal-phase3-final-store-48c0c9bd` | Passed; final lockfile reproduced in the clean copy with 436 installed packages                                      |
| Start               | Development and standalone web/worker HTTP readiness; process restart                                  | Passed; real login, repeatable seed, persisted preferences/session, native standalone login and CSRF logout          |
| Database connection | `corepack pnpm db:check`; actual non-owner runtime role                                                | Passed; live PostgreSQL connection and schema version 2                                                              |
| Migrations          | `db:migrate`, `db:migrate:check` and real-PostgreSQL migration fixtures                                | Passed; fresh/repeat/concurrent application, preserved-data upgrade, tampering detection and failed-upgrade rollback |
| Tests               | Unit/property/UI, PostgreSQL integration, Playwright/axe                                               | Passed; 86 unit/UI tests (14 files), 45 PostgreSQL tests (3 files), 5 browser journeys                               |
| Lint                | `corepack pnpm lint`, zero warnings                                                                    | Passed; final changed test/config files checked again                                                                |
| Type checking       | `corepack pnpm typecheck`                                                                              | Passed; strict root and workspace checks, including final browser config after startup tests                         |
| Build               | `corepack pnpm build`                                                                                  | Passed; domain types, worker output, optimized Next routes/static assets/standalone native traces                    |

Additional checks passed for formatting, OpenAPI/client drift, migration snapshot consistency, private configuration exclusion, local documentation links, preserved specification/financial documents, and Git whitespace/status inspection.

## Reproduction and evidence

From the clean copy, with the supported cache overrides documented in README:

```sh
corepack pnpm install --frozen-lockfile --store-dir /tmp/trading-journal-phase3-final-store-48c0c9bd
corepack pnpm env:init
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:migrate:check
corepack pnpm db:check
corepack pnpm verify
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium E2E_PORT=3302 corepack pnpm test:e2e
```

The first aggregate `verify` run passed API drift, format, lint, types and all unit/UI tests; it found the worker integration test's undeclared root `pg` import. That test now uses the declared database package. The complete integration suite then passed, followed by build and final type checks. After the two browser test-config corrections, the complete five-journey suite passed. No failed gate remains. Application source was not changed after the passing clean build.

An ignored verification driver (`.cache/foundation-smoke.ts` in the clean copy) starts and stops only its owned `pnpm dev`/`pnpm start` process groups. It generates an owner/password in memory, repeats isolated demo seeding, checks actual authenticated readiness, updates preferences with CSRF/revision proof, restarts web/worker and verifies the persisted preference/session, then verifies production standalone login and logout with HTTPS application-origin configuration and Secure cookies. Its two successful final assertions were:

- Development web/worker readiness, real owner login, repeatable seed, and preference/session persistence across process restart.
- Production standalone web/worker readiness, native Argon2 login, Secure cookies and CSRF logout; local transport, without deployed TLS termination.

The final browser run took 48.1 seconds with one worker. Axe found no violations for the checked sign-in and authenticated shell at desktop/mobile sizes in both themes. Keyboard validation/retry, logout access denial, persistent preferences and concurrent-edit conflicts passed. Screenshots were visually inspected for clipping/overlap and legibility. This is foundation coverage, not a complete WCAG certification or financial workflow claim.

The clean run exposed and corrected native-package external resolution, the worker-test dependency boundary, conflicting browser test database bindings, and selectors that accidentally matched Next's global route announcer. A transient type check run during a development restart was rerun after services stopped; generated Next type directories must not be rewritten concurrently with type checking.

## Scope and limits

Only platform identity, tenancy, preferences and audit tables are migrated. No accounts, instruments, executions, cash postings, positions/lots or financial calculations are implemented. Core-domain unit fixtures and comprehensive ledger integration tests remain Phase 4 obligations. AC-14/AC-16 begin with platform coverage; no complete product acceptance scenario is claimed.

This environment's network policy rejected the pinned Playwright Chromium download with HTTP 403. Browser verification uses the documented `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` override with installed Chromium 151.0.7922.173. CI is configured to install Playwright's bundled browser; at the local verification handoff, remote CI had not run.

Production deployment, performance budgets, external providers, full restore drills and email delivery are not validated. Authentication audit delivery is separate from library credential/session commits; [ADR 0010](decisions/0010-password-hashing-foundation.md) records that boundary. Production standalone authentication is separately smoke-checked so native password hashing is not certified by build alone.

## Validation handoff state

The [file inventory](scaffold-files.md) records created/modified/deleted source files. At the Phase 3 review handoff, changes were unstaged and uncommitted on `feat/phase-3-foundation`; no push or deployment had been performed. Cloud install/start instructions were saved successfully as a configuration draft. They require review/save and publication in environment settings to activate; remote restoration had not been validated at that handoff.
