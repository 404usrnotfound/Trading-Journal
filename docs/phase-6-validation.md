# Phase 6 trade journal validation

This increment implements the authorized trade journal on the approved financial domain and architecture. Phases 0–5 remain intact. Calculated ledger results, immutable strategy references and original-risk commitments are separate from manual planning and review. No dashboards, broker imports, deployment, commit, push or merge are included.

Validation completed on **2026-10-12** with Node **24.19.0**, pnpm **10.34.6**, PostgreSQL **17** and Chromium. All checks below passed against the completed increment.

| Check                                                                    | Result                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Frozen install in the checkout                                           | Passed                                                                                                |
| Cold install into a source copy with a new pnpm store                    | Passed; 436 packages downloaded, no reused packages or private configuration copied                   |
| Full unit/property/UI suite                                              | 410 tests passed across 29 files, including 17 journal UI tests; also passed in the cold source copy  |
| Full PostgreSQL integration suite                                        | 287 tests passed across 16 files                                                                      |
| Full PostgreSQL suite on an independently created empty database         | 287 tests passed; only the owned temporary database was removed                                       |
| Development/test migrations, replay and non-owner database readiness     | Passed; schema version 7                                                                              |
| API drift, format, lint, full workspace type checks and production build | Passed against final application source; explicit exit status 0                                       |
| Full browser suite                                                       | 9 journeys passed, including 2 journal journeys and desktop/mobile light/dark axe and overflow checks |
| Clean-copy development and production standalone startup/restart         | Passed again against the final compiled application; fresh owned schema7 database cleaned up          |

## Workflow and financial correctness

The journal captures every requested manual field: strategy/version, setup, thesis, planned entry/stop/targets, actual stop and optional reported prices, initial risk and methodology, conditions, timeframe, mistakes, rule adherence, emotions, confidence, execution quality, lessons, post-trade review, tags and notes. Private evidence supports before/during/after labels. Financial detail separately supplies actual allocated-fill entry/exit, entered/exited/open quantities, basis, realized gross/net, allocated fee/cash events, lots/matches, source revision, calculation manifest and eligible R.

Financial tests use independent expectations for fractional shares, scaling in/out, partial allocations, multiple campaigns/accounts, long and short legs, complete/incomplete execution fees, historical FX, original and revised plans, supplemental risk, backdated correction/allocation, carrying-cost ambiguity and unsupported manual derivatives. Closed-trade review saves preserve lifecycle, financial source revision, quantities, realized results and R. New read models replay only relevant account/instrument books and retain the existing financial kernel.

R always uses the immutable original committed risk. Server microseconds establish commitment chronology; caller timestamps cannot backdate it. Every read rechecks the earliest effective allocated execution, so a later earlier-dated source can make R unavailable without rewriting the original plan. Retrospective plans, open campaigns, unresolved closure review, missing risk, missing/incorrectly targeted historical FX and incomplete cost attribution produce explained unavailable values. Manual prices, stops and subjective review never replace executions or enter financial calculations.

## Persistence, authorization and concurrency

PostgreSQL coverage verifies forced tenant RLS, owner/editor/viewer permissions, actor integrity, composite references, exact nested JSON, decimal spelling, compact 128 KiB bounds, Unicode label normalization, immutable revisions/plans/first commitments, contiguous current pointers, atomic audits and command effects, idempotent retries, stale edits and concurrent writers. Plan/risk publication rejects closed, canceled or archived trades; ordinary closed-trade review remains available.

The shared lock order acquires financial state before the workspace mutex and then strategy/trade/journal rows. A deterministic regression holds financial state, proves a waiting strategy link has not acquired the mutex, then completes simultaneous strategy linking and journal saving. Journal-only writes do not advance the economic revision or change cash, positions, lots, fees, financial commands or outbox events.

HTTP tests exercise authenticated routes, current membership, trusted origin, session CSRF, viewer mutation denial, foreign sessions/workspaces, UUID idempotency keys, bounded requests and cursor ownership. Private evidence retains the existing signature/type/size/hash validation and authorized delivery. Before/during/after and planning references are typed and immutable; removing a file from the current draft cannot make historically referenced media deletable.

## UI and browser verification

UI tests exercise exact text/decimal fields, manual rule outcomes, autosave, edits during an in-flight save, stable retry identities after lost responses, stale-draft preservation and explicit replacement, upload/save/navigation coordination, validation, viewers, closed reviews and unavailable financial explanations. Normalized text is acknowledged once rather than creating repeated revisions; comma-separated input preserves ordinary typing and conflicting drafts.

Final display regressions cover configured IANA timezone/DST and historical draft strategy fidelity. A saved draft can have selected a different strategy before the trade was pinned. Historical review must show that document's version/setup/assessment references; it must never borrow the current pin's labels.

The browser journeys cover mobile Overview entry, real catalog-linked trade creation, original/revised plans, fractional fills and fees, closed campaign R, manual review, private images, history and reload, a separate viewer, anonymous private-file denial, retrospective plan unavailability and editable closed review. Existing authentication, preference, ledger and strategy journeys remain in the suite. Axe, overflow assertions and screenshots cover desktop/mobile and light/dark views.

## Migrations and clean runtime

Published SQL and snapshots `0000`–`0004` are unchanged. Frozen `0005_trade_journal.sql` adds the journal schema and protections; SHA-256 is `60ef1dc51e85ef5abe7f38207631e489abcb67e767035d09f8ea09ceeefd264a`. After it was applied, independent review found unreadable raw whitespace labels could bypass the application contract. Additive `0006_journal_label_integrity.sql` fixes exact Unicode trimming, nonblank labels and normalized uniqueness without editing the applied migration; SHA-256 is `bbba28aecf8027d5edf7953dcc54edcca0f196d828cd97419ed4082c5a37e543`.

Upgrade fixtures preserve every prior row and applied hash from a populated `0000`–`0004` prefix containing balanced cash and strategy/media/trade facts. A populated compatible `0005` journal upgrade also preserves its complete history and replays unchanged. Incompatible raw history makes `0006` fail atomically, retaining the prior schema, history and migration ledger; it does not silently rewrite facts.

The cold source copy excludes `.env`, private media, Git metadata, dependency directories and generated builds. Independent runtime smoke creates its own dedicated `_test` database and generated credentials, applies schema/queue migrations, starts/restarts development web and worker, and starts/restarts the production standalone application. Exact original risk, later plan changes, four journal revisions, manual notes, strategy v1/v2 snapshots, the original trade pin, session and private PNG bytes/hash survive the restarts. Only its owned database and processes are cleaned up. Production smoke uses local transport with a configured HTTPS origin; no public TLS termination or deployment is claimed.

## Reproduction and scope

Use [README](../README.md) and the pinned toolchain:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:migrate:check
corepack pnpm db:check
corepack pnpm verify
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium corepack pnpm test:e2e
```

Run `env:init` when private configuration is absent. Keep test bindings on the dedicated test instance. No new dependency, secret or environment variable is required.

Financial entry remains available through the existing API; this increment supplies trade planning and review screens. Automatic native economics retain Phase 4's validated ordinary linear-asset scope; advanced/manual instruments can be journaled without fabricated calculations. Rule adherence is manual, and before/during/after labels do not certify image capture times. Private files retain the 10 MiB PNG/JPEG/WebP/PDF limit. Imports, analytics dashboards, daily/period reviews, exports, restore and production load/operations certification remain later work.

The [Phase 6 files](phase-6-files.md) inventory records **36 created files, 22 modified files and no deletions**. Changes are unstaged and uncommitted on `feat/phase-6-trade-journal`; HEAD remains `5834949f679ae9d60afa5994b9dc621e5710d99f`. No commit, push or merge was performed.
