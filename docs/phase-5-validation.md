# Phase 5 strategy validation

This increment implements the authorized strategy management scope against the approved specification, architecture and domain model: first-class identities, complete immutable versions, explicit trade pins, private screenshots/reference files, management screens, shared validation and PostgreSQL persistence. [Strategy management](strategies.md) describes behavior; [the file inventory](phase-5-files.md) lists every changed path. Strategy performance analytics, automatic rule/risk assessment and frozen trade-plan workflows remain later work.

## Environment and isolation

Verification uses Node 24.19.0, pnpm 10.34.6, PostgreSQL 17, TypeScript 5.9.3, Vitest 5.0.3 and installed Chromium 151. No dependency, package manifest, lockfile, service or environment variable was added. Frozen offline installation passed in the existing checkout without lockfile changes. The Phase 4 clean-install evidence applies to the unchanged dependency set; this phase does not claim a new empty-store installation.

A fresh uniquely named `_test` database received the reviewed migrations and separated runtime roles before the complete PostgreSQL regression suite. Only that disposable database was removed afterward; the original development/test databases, financial records and retained Phase 4 archives were preserved. The normal migration command additionally upgraded the development database and the normal migration check upgraded the dedicated test database. No data reset or migration-hash rewrite was used.

## Final gates

All required gates passed on 2026-10-11. The final `corepack pnpm verify` exited successfully against the frozen application source, including all static gates, unit/UI and PostgreSQL suites, and production builds. Browser, accessibility, visual and startup/restart checks also passed. Remaining handoff edits are documentation only; no failed application gate remains.

| Check                                              | Executed result                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Frozen installation                                | Passed; existing checkout, offline, unchanged lockfile                                                 |
| OpenAPI/client drift                               | Passed; generated contracts are current                                                                |
| Formatting and lint                                | Passed; Prettier and zero-warning ESLint                                                               |
| Type checking                                      | Passed; strict root and every workspace                                                                |
| Unit/property/UI                                   | Passed; 313 tests across 26 files                                                                      |
| Fresh complete PostgreSQL integration              | Passed; 201 tests across 12 files                                                                      |
| Standard complete PostgreSQL integration           | Passed; 201 tests across 12 files                                                                      |
| Strategy database invariants                       | Passed; 24 cases, including populated-prefix upgrades and exact JSON byte boundaries                   |
| Strategy service/API/files                         | Passed; 12 service, 11 HTTP API and 13 private-file integration cases                                  |
| Migrations and runtime database readiness          | Passed; fresh, forward and repeated migration checks, restricted runtime connection, schema version 5  |
| Production build                                   | Passed; domain, worker and optimized Next 16.3.8/standalone output                                     |
| Browser/accessibility and visual review            | Passed; all 7 Playwright journeys, 12 strategy axe/overflow checks and desktop/mobile visual review    |
| Development/standalone startup and process restart | Passed; web/worker readiness, real authentication, versions, original trade pin, private bytes/session |

The fresh complete PostgreSQL suite took 55.79 seconds and the standard suite took 47.68 seconds. All seven browser journeys passed in 58.5 seconds; the strategy journey took 30.8 seconds. Browser checks caught and corrected undersized checkbox targets and attachment links distinguished only by color. Final screenshots confirm usable editor/history/viewer layouts at 1440 and 390 pixels in light/dark themes, including the corrected toolbar alignment. No financial entry/dashboard journey is claimed.

Startup verification used a separate copied source tree and complete final build assets, generated private configuration, unique loopback web/worker ports and a uniquely owned fresh `_test` database. Development and production standalone web/worker readiness passed. Real HTTP commands uploaded a PNG, published v1, recorded a trade against v1 and published v2; reads after separate process restarts retained both complete definitions, the original pin, exact decimal parameter and identical attachment bytes/SHA-256. Sessions persisted, anonymous file access returned 401, and production Argon2 login, HttpOnly/Secure cookies and CSRF logout passed. Local production transport exercised configuration/cookies; deployed TLS termination was not tested. Temporary verification databases were scoped to generated fixtures; original databases and private files were preserved.

## Strategy and ledger evidence

Contract tests cover full-field snapshots, defaults, strict unknown-field rejection, limits, unique normalized identities, same-version checklist references, discriminated parameters, exact bounds and invalid decimal precision. Numeric parameters use decimal strings and exact BigInt comparison, preserving accepted source text such as `0.1000`, `-0` and insignificant trailing zeros. No monetary calculation uses binary floating point.

Real PostgreSQL tests use restricted runtime roles and authenticated sessions. They cover current membership and forced tenant RLS, cross-workspace foreign keys, immutable versions and trade links, contiguous publication/current pointers, stale revisions, concurrent publication/link attempts, command replay and changed-payload conflicts, atomic audit rollback, archived strategy/trade rejection, UUID casing, nested strict validation and definition byte limits. Service tests prove create/read/update/history preserve every published definition, and that strategy changes do not advance financial-state revisions or change financial commands, cash postings, fees, lots, positions or outbox records. A legacy-response regression first reproduced HTTP 400 when replaying Phase 4 financial commands; service-boundary defaults now add the nullable strategy fields without rewriting the stored response/hash/revision or substituting a later trade pin.

Trade creation pins an explicitly selected historical version rather than a current-version shortcut. Unclassified trades remain nullable; one-time links to existing trades are visibly retrospective. Archive retains rules, pins and historical media. A strategy edit cannot rewrite a previously linked trade's definition. The existing financial unit/property/fixture and PostgreSQL suites run alongside this coverage.

Attachment tests cover bounded declared/chunked reads, type/signature checks, safe filenames and content headers, unauthorized/viewer/cross-workspace access, checksum/size failures, durable pending reservations, identical retries after interrupted publication, committed removal before byte cleanup, current membership rechecks and historical-reference deletion protection. Files live in private storage and are delivered through authorized routes; database rows never expose arbitrary public URLs or filesystem paths.

UI tests cover full-field editing, structured parameters/checklists/setups, viewer controls, history/comparison, archive, explicit retrospective linking, error/conflict recovery and blocking save while an upload is in flight. The browser journey creates a complete strategy with PNG/PDF files and an exact decimal parameter, records a trade against v1, publishes changed RSI rules as v2, then reads unchanged v1 rules and the original trade pin. It also checks literal rendering of HTML-like notes, private downloads, archive retention and a separate viewer session. Axe checks and screenshots exercise editor/history/viewer views on desktop and mobile in both themes.

## Migration handling

Published migrations `0000`–`0002` and their snapshots are unchanged. Phase 5 adds `0003_strategy_management.sql` with six tables, ten functions, scoped runtime grants/RLS, composite tenant relationships, deferred consistency checks, immutable snapshots/pins and durable attachment metadata. Its frozen SHA-256 is `677fa385c957efc517e8160fd31e5fcd3e2dda630225b3a3b603d211bad1f808`.

Final review found that the original SQL definition guard permitted larger snapshots than the shared read contract. After `0003` had been applied, the fix was implemented and applied as additive `0004_strategy_definition_size.sql`, preserving the applied hash. It adds an exact compact-JSON UTF-8 byte-count function and check rather than stripping whitespace inside strings or rejecting valid definitions because PostgreSQL inserts structural whitespace. Its frozen SHA-256 is `9dabc8b2db954a9b8148abafbc566d1f5511592f5ed655770ab096cb4353e409`. Readiness is version 5; all five application migration entries must match the reviewed journal.

A populated-prefix upgrade test applies the unchanged Phase 4 migrations, records representative existing financial/platform/auth facts, upgrades with Phase 5 and compares every prior row and applied hash. Existing trades remain unclassified. Fresh and repeated migrations passed, as did the non-owner runtime connection/schema check.

## Reproduction

Use the pinned toolchain, private configuration and cache overrides documented in [README](../README.md):

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:migrate:check
corepack pnpm db:check
corepack pnpm verify
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium corepack pnpm test:e2e
```

Run `corepack pnpm env:init` first when private configuration is absent. CI can install the Playwright browser instead of using the installed-Chromium override. Keep test database bindings on the dedicated test instance. Normal development and user bootstrap instructions remain in README.

## Limits and handoff

Narrative rules and typed parameters describe the playbook; this phase does not execute arbitrary user expressions, enforce a risk policy, freeze an original trade plan/risk denominator or calculate win rate, expectancy or R. The version-selection labels describe recorded association timing, not proof of a pre-trade plan. Full financial entry screens, analytics and other later product workflows remain deferred.

Strategy files are limited to 10 MiB PNG/JPEG/WebP/PDF. The filesystem and PostgreSQL do not share a transaction; pending reservations and tombstones make retries explicit, but abandoned private pending/staging objects may need operator review. Backups must include both stores. Complete backup/restore, malware scanning, multi-host/object-storage delivery and large-history production performance are not certified by this increment.

At handoff, the working tree on `feat/phase-5-strategies` contains 33 created files, 18 modified files and no deletions. These changes are unstaged and uncommitted; HEAD remains `3f680f20f1ef689ccf1d2f4a2a1df324ce496004`. [The inventory](phase-5-files.md) lists every path. No commit, push, merge or deployment was performed for Phase 5. Passing this increment does not complete all product acceptance scenarios or certify production load, deployments or backup/restore.
