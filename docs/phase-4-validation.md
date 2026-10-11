# Phase 4 core ledger validation

This increment implements the financial backend against the approved [domain model](domain-model.md), [calculation contracts](financial-calculations.md) and [architecture](architecture.md). It adds no financial entry screens or analytics dashboards. The [core ledger guide](core-ledger.md) describes the APIs and current limits; the [metrics dictionary](financial-metrics.md) defines the available outputs.

All required financial and scaffold regression gates passed on 2026-10-11. The final clean run used the corrected, frozen application source; the remaining handoff edits are documentation only. No failed gate remains.

## Environment and isolation

Node 24.19.0, pnpm 10.34.6, PostgreSQL 17, TypeScript 5.9.3, Vitest 5.0.3 and Decimal.js 10.6.0. The lockfile pins exact dependencies. Financial authority uses validated decimal strings, isolated 160-digit HALF_EVEN Decimal arithmetic and PostgreSQL `NUMERIC(78,36)`, with raw input checked before generated numeric conversion. Original source input is retained separately from canonical text and explicit booking rounding.

The fresh dependency copy is `/tmp/trading-journal-phase4-clean-install-ookpoqhe/source`, with an empty store at `/tmp/trading-journal-phase4-clean-install-ookpoqhe/store`. It excludes the original `.env`, private data, Git metadata, dependencies, caches and builds. Frozen installation passed: eight workspaces, 436 packages added, 433 downloaded, zero reused; normal approved native postinstall scripts completed. The copied lockfile hash is `ac94077f03cdae6607005d833863fc949ec3b170a870b04ba9a878863c3c7d0f`.

Financial verification uses newly created, uniquely named `_test` databases on the dedicated PostgreSQL test instance. Each run applies reviewed migrations and runtime roles from scratch, uses generated test identities, and removes only its own disposable database. Default development/test bindings and retained archives are preserved. The complete standard PostgreSQL command also passed in the main checkout against the final schema.

## Gates

| Check                                 | Final executed result                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Frozen clean install                  | Passed; new source copy and empty store, 436 packages, normal build scripts                 |
| Unit/property/UI                      | Passed; 267 tests across 23 files                                                           |
| Full PostgreSQL integration           | Passed; 141 tests across 8 files in the clean copy and main checkout                        |
| Financial constraints/catalog/ledger  | Passed; database 31, catalog 15 and ledger 28 cases                                         |
| Authenticated financial API           | Passed; 9 actual-PostgreSQL cases                                                           |
| Observation/valuation persistence     | Passed; 13 actual-PostgreSQL cases                                                          |
| Lint                                  | Passed; zero warnings                                                                       |
| Type checking                         | Passed; strict root and all workspace checks                                                |
| OpenAPI/client drift and formatting   | Passed; final generated contracts and formatted source                                      |
| Migrations/runtime database readiness | Passed; fresh/repeat application and non-owner runtime connection, schema version 3         |
| Production build                      | Passed; domain, worker and optimized Next 16.3.8/standalone output                          |
| Browser and accessibility             | Passed; all 6 Playwright journeys, including axe and authenticated fractional ledger/reload |
| Development startup/restart           | Passed; web/worker readiness, real login, repeatable seed, persisted preferences/session    |
| Production standalone startup         | Passed; web/worker readiness, native Argon2 login, HttpOnly/Secure cookies and CSRF logout  |

The final `corepack pnpm verify` exited successfully in the clean copy, including every static gate, unit/UI and PostgreSQL suites, and all production builds. The clean PostgreSQL suite took 33.02 seconds; the separate main-checkout suite took 30.18 seconds. All six browser journeys passed in 29.4 seconds using installed Chromium 151. Local standalone authentication used production configuration and local transport; deployed TLS termination was not tested.

## Financial evidence

The independent fixture suite has 20 cases plus 200 seeded generated zero-crossing cases, checked against exact integer/rational expectations. Separate targeted suites exercise precision/overflow/rounding, signed balancing, allocation and fee conservation, FIFO/average/specific lots, partial/fractional fills, scaling in/out, shorts, transfers, campaign attribution and FX selection/valuation. Integration suites verify actual restricted runtime roles rather than substituting mocked persistence.

Important worked outcomes include:

- F-05: EUR cash `8497`, USD cash `1386.82`, six open shares with USD gross basis `600`, realized gross/net USD `90`/`88.02`, unrealized gross/net USD `180`/`178.8`, and EUR NAV `10013.774`. The independently decomposed trading, holding FX, cash FX, conversion difference and fees reconcile to the external-flow-adjusted change `13.774`. A new current FX mark changes the current valuation while historical accepted sale/cost pins remain intact.
- F-07: cross-account cash/holding transfers retain basis, cost and acquisition lineage without a fictitious sale or consolidated external contribution. Consolidated NAV `1047` reconciles to realized net `8.6` plus unrealized net `38.4` above the initial contribution.
- F-11: quantity `0.3333` at quoted price `10` retains that quote while the actual booked principal is `3.33`; mark `12` gives gross value `3.9996`, and the complete exit has exact final net result `0.65`.

The service/API suites exercise validated short conventions and unsupported crypto wrappers, canceled/archived/newly closed campaign allocation rejection and atomic correction rollback, command retries and changed-payload conflicts, separate source deduplication, concurrent close-only fills, immutable source correction/reversal, atomic audit/outbox/projection rollback, multiple accounts and live/paper isolation, current membership and workspace RLS, source units/increments, manual multi-currency cash effects with unknown economics, fees and actual FX, order intent versus derived fills, campaign allocations/closure and dependency guards. Deferred database constraints independently check the source amounts and projection conservation.

## Migration handling

`0000` and `0001` are preserved. The new, unpublished `0002` is additive and raises readiness to version 3. Its frozen SHA256 is `a03c7bd4718390def58ce0eedd923e0c64f5b18cb172c4c7d50d8074b720d333`; it adds 38 financial tables and 12 financial integrity functions, alongside the 11 unchanged platform/auth tables. During development, a guarded repair rebuilt only an empty draft financial layer after constraint changes: it refused any nonempty financial source/projection table or nonzero source revision, checked original migration history, retained all platform/auth/workspace/audit tables and row counts, then used the official migration runner. It did not rewrite an applied hash to hide SQL drift. When the guard encountered retained fixture facts, it refused and rolled back. The populated default test database was retained intact as `journal_phase4_draft_archive_954dcb6a83c6415699d98ac8b9ea9379_test`; the clean baseline test database was retained as `phase4_clean_baseline_ookpoqhe_20261011_test`. Fresh default `_test` databases then received the final migrations through the official runner. Earlier draft archives also remain retained. This is development evidence, not permission to rewrite a published migration.

The verification failures led to concrete fixes: exact execution monetary-event kinds preserve settlement provenance without posting principal twice; chronological settlement checks reject excess, duplicate and backdated consumption while accepting later fees; inventory quantity is independently reconciled to effective sources even when automatic metrics are unsupported; strict response DTOs retain original source input; transaction-bound catalog reads are sequential on one PostgreSQL client. Final regression tests cover these cases. Formatting drift in generated migration metadata was corrected before the final aggregate check.

## Reproduction

Use the pinned toolchain and cache overrides in [README](../README.md), with freshly generated private configuration and an isolated test database:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm env:init
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:migrate:check
corepack pnpm db:check
corepack pnpm verify
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium corepack pnpm test:e2e
```

The Chromium override is only necessary when using an already installed compatible browser. This cloud environment has Chromium 151; CI installs the Playwright browser. Never replace the guarded test bindings with a development or production operator URL.

## Limits and handoff

Native calculations cover ordinary delivered shares/ETFs and non-rebasing crypto spot longs in supported netted books. Automatic securities shorts require the explicit immutable borrow/carry metadata described in the core guide; crypto short/lending wrappers remain unsupported. Other asset families can retain manual records, unknown nullable economics and explicit cash effects; their automatic advanced formulas remain unavailable. Segregated books remain unsupported for automatic inventory. Opening price/principal must be positive when provided; unknown basis is distinct from known zero, and zero-basis gifts/rewards require a later reviewed event path. Broker buying power and account policy enforcement are not implemented. Unknown basis/mark/FX produces explained unavailable metrics or partial NAV.

Transfers commit synchronously. Delayed transit/departure/receipt workflows are disabled; pure transit fixtures do not certify persisted support. Corrections of executions with confirmed settlements or transferred descendants require grouped restatement and are explicitly blocked rather than silently losing settlement or lineage. Complete strategy/risk/import/reconciliation/export/restore workflows, analytics dashboards, saved report generations and integrations remain later phases.

Valuation is an as-of restatement at the current source revision with calculation manifests and selected dependencies, not retrieval of an archived historical generation. Accepted historical FX pins are immutable. API timestamps accept at most six fractional second digits, matching PostgreSQL; the pure kernel supports finer ordering but the API explicitly rejects unsupported persistence precision.

At handoff, `git status` shows 40 created files, 20 modified files and no deletions on `feat/phase-4-core-ledger`. The working tree is dirty, unstaged and uncommitted; HEAD remains `2db32057b94d5768313f9039dd66aaa5d11ba81e`. The [complete file inventory](phase-4-files.md) lists every path. No commit, push or deployment was performed. Passing this backend slice does not claim complete AC-01–AC-16 journeys, tax compliance, production load budgets or a tested backup/restore product.
