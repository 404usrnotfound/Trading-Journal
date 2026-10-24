# Phase 15: performance

## Post-audit reporting remediation

The [retained remediation evidence](reporting-remediation-evidence.json) records new comparisons from 23 October 2026. This section describes partial improvements; the historical Phase 15 report below retains its original measurements. **FA-04 remains open for full capacity verification.** Million-fill reporting, ten concurrent readers, asynchronous large reports and the proposed latency budgets have not been demonstrated.

The accounting engine now shares the existing tested FX evidence index instead of repeatedly validating/scanning the complete rate history for every component. Reference reads are cached within the same authorized repeatable-read transaction, keyed by account plus economic boundary and instrument version. Source-time lookup uses actual lot/match/transfer dependencies. A conservative cohort proof removes only validated, historically closed native-flat campaigns before expensive analytics replay; open, recent, unsupported, inconsistent and multi-leg incomplete campaigns remain eligible for the ordinary engine and its explanations.

| Measured scope                                                                          | Original                                             | Remediated                                          | Financial comparison                                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pure accounting: 10,000 round trips, 20,000 fills, 30,000 postings, 50 books, 365 rates | 50,152.90 ms                                         | 553.26 ms full; 601.50 ms summary                   | Full DTO hash identical; independent EUR performance 72,000 and variance zero             |
| Same pure response                                                                      | 18,814,281 bytes                                     | 5,554 bytes summary                                 | All financial totals unchanged; explicit complete evidence counts and bounded pages       |
| PostgreSQL: 1,200 campaigns, 2,400 fills, 100 accounts, 500 books                       | 15,793.45 ms; 4,613 statements; 6,925,944 bytes full | 4,690.25 ms; 3,118 statements; 11,027 bytes summary | Identical financial-only DTO hash; source generation and coverage retained                |
| Recent 200-campaign cohort in that 1,200-campaign history                               | `ANALYTICS_SCOPE_TOO_LARGE` before cohort selection  | 1,089.02 ms; 1,005,013 bytes                        | New successful scope; no completed broad baseline DTO claimed                             |
| Comparable bounded recent cohort                                                        | 322.95 ms                                            | 385.33 ms                                           | Full DTO hash identical after excluding the response clock; no timing improvement claimed |

These are single measured sequential calls, with concurrent local verification and natural cache/heap variation. They are not p95 estimates or a concurrency benchmark. Source-only original accounting/analytics factories and the original kernel were retained from the reviewed HEAD; both paths used the same owned PostgreSQL fixture, roles, facts and unchanged SQL timeouts. The final query counts are actual executed statements, not distinct query shapes. The summary/page path bounds evidence transport without silently truncating totals. Remaining per-book source reads and broad-scope fact guards are explicit limitations rather than solved scaling problems.

Phase 15 profiles the delivered application at the merged Phase 14 baseline,
`8359d63e26e700764b07b5ce312f1f60b584cafe`. Current `origin/main` was fetched and
verified to contain that commit before creating `perf/phase-15-profiling`. The
checkout was clean and no interrupted benchmark files were recovered. Changes
remain uncommitted; this work does not authorize publication, push or merge.

All required persisted scales, backend/domain comparisons and ten formal
production-browser reports are complete. Measurements below retain their actual
scopes and outcomes, including limit rejections and timeouts.

## Reproduction and measurement boundaries

Use the pinned Node 24.19.0 and pnpm 10.34.6 toolchain and the setup in
[README](../README.md). Install with `corepack pnpm install --frozen-lockfile`,
start PostgreSQL, apply migrations and check the application role. Benchmark
fixtures require the existing isolated `TEST_*` bindings, including an operator
with `CREATEDB`; credentials are never command arguments or report fields.

The reusable entry points are:

```sh
corepack pnpm exec tsx scripts/performance/dataset.ts --trades 1000 --executions 2000 --distribution distributed --output work/performance/1000-2000-distributed.json
corepack pnpm exec tsx scripts/performance/dataset.ts --trades 10000 --executions 20000 --distribution distributed --output work/performance/10000-20000-distributed.json
corepack pnpm exec tsx scripts/performance/dataset.ts --trades 10000 --executions 100000 --distribution distributed --instruments 20 --output work/performance/10000-100000-distributed.json
corepack pnpm exec tsx scripts/performance/backend-benchmark.ts --manifest work/performance/1000-2000-distributed.json --output work/performance/backend-before.json --repetitions 3 --warmups 1 --explain 8
```

Repeat each operation against the same persisted database and manifest after the
change, adding `--compare work/performance/backend-before.json`. An untouched
detached worktree at the baseline commit supplies the before implementation;
separate workspace dependencies ensure its imports resolve baseline sources.
Copy the same benchmark scripts there and use absolute manifest/output paths.
Do not regenerate a database between a before/after pair.
Choose fresh manifest and report output paths for every invocation. The current
backend CLI rejects an existing output before authentication and creates its
final report exclusively. A failed financial comparison still persists the
measured observations with an explicit failed-comparison status and exits
unsuccessfully; it never replaces verified evidence.

For the large matrix, select the normal operations explicitly and run whole
accounting separately so its exceptional duration does not hide partial evidence:

```sh
corepack pnpm exec tsx scripts/performance/backend-benchmark.ts --manifest work/performance/10000-20000-distributed.json --output work/performance/backend-main-before.json --repetitions 3 --warmups 1 --explain 8 --operations journal.list.all,analytics.all,dashboard.all,journal.list.bounded,analytics.bounded,dashboard.bounded,accounting.bounded,journal.detail.1,journal.detail.2
timeout --signal=TERM --kill-after=5s 240s corepack pnpm exec tsx scripts/performance/backend-benchmark.ts --manifest work/performance/10000-20000-distributed.json --output work/performance/backend-accounting-before.json --repetitions 1 --warmups 0 --explain 8 --operations accounting.all
corepack pnpm exec tsx scripts/performance/backend-benchmark.ts --manifest work/performance/10000-20000-distributed.json --output work/performance/backend-intraday-before.json --repetitions 1 --warmups 0 --explain 8 --operations accounting.intraday,dashboard.intraday
```

Retain exit status and elapsed time if a process deadline terminates an attempt.
An absent completed output is never treated as financial equivalence. Use the
same selectors and persisted manifest for the paired after run.

The 100,000-execution normal run uses all ten default operations, including
whole accounting, with three samples and one warmup. Its separately labeled
supplement and the optimized repeated-request memory check use:

```sh
corepack pnpm exec tsx scripts/performance/backend-benchmark.ts --manifest work/performance/10000-100000-distributed.json --output work/performance/backend-supplement-before.json --repetitions 1 --warmups 0 --explain 8 --operations accounting.intraday,dashboard.intraday,accounting.recent,dashboard.recent,analytics.recent
corepack pnpm exec tsx scripts/performance/backend-benchmark.ts --manifest work/performance/10000-20000-distributed.json --output work/performance/backend-dashboard-soak-after.json --repetitions 8 --warmups 1 --explain 0 --operations dashboard.bounded --compare work/performance/backend-main-after.json
```

Final detail-only comparisons select `journal.detail.1,journal.detail.2` with
three samples, one warmup and six plans. At 1,000 trades they compare directly
with the pristine baseline; at 10,000 trades they compare with the successful
intermediate cash-query implementation because the pristine details time out.

Build normal production assets with `NODE_ENV=production corepack pnpm build`.
For local HTTP browser measurements, use the documented test runtime:

```sh
corepack pnpm exec tsx scripts/performance/serve.ts --manifest work/performance/1000-2000-distributed.json --origin http://localhost:3004
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium corepack pnpm exec tsx scripts/performance/frontend-benchmark.ts --manifest work/performance/1000-2000-distributed.json --origin http://localhost:3004 --output work/performance/browser-before.json
```

The default browser scope is the full-year bounded account. Repeat the large
fixture browser attempt with `--scope intraday` and a separate output name for
the explicit first-fill supplement, preserving the broad rejection or deadline
artifact. Paired after runs add `--compare` for that exact fixture and scope.
This browser option pins the dashboard report only. Journal list/search remain
the current account scope, and detail remains the complete current campaign;
the browser does not add intraday activity filters to those journal requests.

The server launcher passes the existing runtime allowlist to the child; operator
credentials and the generated owner's password are excluded. It checks that the
chosen loopback port is free and stops only its own process group. Stop that
server before serving another fixture or rebuilding. Browser comparisons use
the same fixture and pinned requests; add `--compare` to the after run. Build IDs
distinguish the unchanged baseline assets from the rebuilt optimized assets.
Run the browser harness from the same checkout as its server: its build ID is
read from that checkout's local production assets, rather than queried from the
remote server. The recorded before and after jobs follow this requirement.

Backend samples include membership checks, tenant transaction setup, calculation
and service DTO validation. Session ingress and HTTP transport are outside those
service timings; the browser exercises real authentication and HTTP. Business
query counts cover `tx.execute` inside the authorized callback, excluding
membership/context SQL and transaction control. Driver duration includes result
transfer/decoding. The wrapper preserves transaction options. Plans use
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` through the original tenant transaction,
under `journal_app`, not the operator. Reports verify a non-owner,
`NOSUPERUSER`/`NOBYPASSRLS` role, RLS enabled, matching tenant context and the
unchanged ten-second statement timeout. Plan expressions and SQL literals are
redacted; actual bind values never enter reports.
Backend JSON sizes are exact UTF-8 serialization lengths; gzip sizes are
benchmark compression estimates, not observed HTTP transfers. Browser CDP
measurements separately record actual encoded network transfers and decoded
response sizes. Service timing excludes benchmark hashing/compression; JSON
serialization time is recorded separately.
CDP encoded transfer lengths include network/protocol overhead and cache effects;
they are not interchangeable with decoded JSON body lengths or gzip estimates.

Normal backend operations have one warmup and three measured sequential requests.
The separate 20,000-execution whole-accounting attempts and explicitly labeled
intraday/recent supplement groups use one measured request without a warmup.
Whole accounting remains in the normal 3+1 group at 2,000 and 100,000 executions;
the latter reaches existing limits. Each artifact records its actual sampling.
Samples report median, range and empirical p95; with three observations p95 is
the maximum, not a production tail-latency estimate. Plans run after timings.
SQL/OS caches are not flushed. Browser runs distinguish the first cache-disabled
navigation from subsequent browser-cache-enabled navigation, record navigation
and interactions, actual network transfers, JSON lengths, DOM and retained CDP
node counts, long tasks and natural JavaScript heap. React hook counts are
global root commits, not per-component durations. A separate mocked-Recharts UI
test counts chart-subtree invocations. No React profiling build is represented
as a normal production build.
Interaction durations include Playwright action/readiness and two animation
frames; they are not isolated JavaScript handler durations.
The benchmark-only fetch wrapper pins report context while preserving credentials
and cancellation signals. It drains a clone of failed response bodies so CDP
completion accounting does not remain pending; successful responses retain their
normal body handling. Playwright request routing is avoided because it disables
the browser cache.

The environment is Linux 6.18.44 x86_64 on an AMD EPYC 9V74 host, with three
visible CPUs but a two-CPU cgroup quota and an 8 GiB cgroup memory limit. Storage
is a 32 GiB overlay filesystem. PostgreSQL is the repository's pinned 17
Bookworm image (server 17.11), with 128 MB shared buffers and 4 MB work memory;
Chromium is 151.0.7922.173. Browser runs use a 1440 × 1000 desktop viewport with
no CPU/network throttling over loopback HTTP. Reads use concurrency one with no
worker load. Quiet paired measurements are separate from exploratory/profile
runs made during fixture preparation. This does not certify the roadmap's
four-vCPU reference deployment, ten readers or worker-contention budgets.

## Fixture integrity and scope

Every database has a fresh generated `journal_perf_*_test` identity. Existing
databases, volumes and private bindings are retained. Hidden fixture bindings
are created with private permissions under `.private/performance`; manifests and
intermediate evidence live under `work/performance`. Local scratch is excluded
from Git and formatting/lint scans.
The SQL fixture seed is `phase-15-v1`, with UTC report bounds
`(2030-01-01T00:00:00.000000Z, 2030-12-31T23:59:59.999999Z]`. Each manifest pins
its recorded metadata cutoff and financial source revision. Fresh construction
reproduces the economic distribution but generates new catalog/provenance IDs;
complete before/after hashes therefore require the same persisted fixture.

Actual SQL counts were verified after construction:

| SQL population                      | 1,000 trades / 2,000 executions | 10,000 / 20,000 |  10,000 / 100,000 |
| ----------------------------------- | ------------------------------: | --------------: | ----------------: |
| Accounts                            |                             100 |             100 |               100 |
| Instruments                         |                               5 |               5 |                20 |
| Trades / trade legs                 |                   1,000 / 1,000 | 10,000 / 10,000 |   10,000 / 10,000 |
| Executions / actual fees            |                   2,000 / 2,000 | 20,000 / 20,000 | 100,000 / 100,000 |
| Ledger events                       |                           4,100 |          40,100 |           200,100 |
| Balanced postings                   |                           8,200 |          80,200 |           400,200 |
| Allocation sets / items             |                   2,000 / 4,000 | 20,000 / 40,000 | 100,000 / 200,000 |
| Cost attribution sets / allocations |                   2,000 / 4,000 | 20,000 / 40,000 | 100,000 / 200,000 |
| Books / positions                   |                       500 / 500 |       500 / 500 |     2,000 / 2,000 |
| Retained lots / matches             |                   1,000 / 1,000 | 10,000 / 10,000 |   50,000 / 50,000 |
| Trade closures                      |                           1,000 |          10,000 |            10,000 |
| Financial commands / outbox events  |                   1,179 / 1,179 |   1,179 / 1,179 |     2,709 / 2,709 |
| FX / price observations             |                         365 / 5 |         365 / 5 |          365 / 20 |
| Setup seconds, separate from reads  |                         179.834 |         467.706 |         2,571.361 |
| Independent realized net, USD       |                       12,971.25 |      129,933.75 |        128,933.75 |
| Independent closing cash, USD       |                   10,012,971.25 |   10,129,933.75 |     10,128,933.75 |

Every oracle matches the genuine projections and SQL postings exactly as numeric
values; all disabled-trigger counts are zero. The two larger fixtures finish
with zero preparation indexes. The first fixture used none. Setup includes
normal catalogs/market commands, full deferred checks, projections and final
verification, and was partly concurrent with correctness work.

Each account holds 10, 100 and 100 campaigns respectively, with 20, 200 and
1,000 executions. The last matrix uses 20 instruments and 2,000 books, compared
with five instruments and 500 books at the first two scales. This distribution
keeps each large-fixture book at 50 fills/25 retained lots while genuinely
retaining all 100,000 executions. Its whole-accounting scope exceeds the existing
1,000-book bound; its account scopes contain 20 books. Concentrated single-book
growth is measured separately by the full domain matrix, rather than being
represented as a completed concentrated SQL/API benchmark.

Controlled bulk SQL is fixture preparation, not application write/import
throughput. It uses the restricted tenant role, normal constraints and deferred
triggers, balanced execution/fee events, full allocations with explicit zero
residuals, matching command/audit/outbox records and actual domain replay
projections. It retains all closed lots and matches. Book/position state uses
the production FIFO calculation manifest, and sub-cent actual principals carry
explicit source booking review. Reference catalogs and market observations use
the normal commands. An independent integer-based oracle checks native P&L and
cash against projections and SQL postings; runtime catalog checks detect disabled
triggers. Setup duration is reported separately from reads.

Large/concentrated preparation may create temporary ordinary indexes to make
deferred constraint checking practical. Their definitions are recorded in the
manifest, every such index is dropped before `ANALYZE`, and a catalog assertion
requires zero preparation indexes before the fixture becomes ready. Measured
reads and plans see only migration-defined indexes. These indexes are not
production optimizations or evidence of application write throughput.

Persisted workloads contain fractional ordinary stock/ETF campaigns, partial
entry/exit fills, winners/losers, actual commissions, two brokers, multiple
accounts/instruments and dated USD/EUR reporting FX. Campaigns are completed,
flat and settled. The opening cutoff precedes the first funded foreign exposure,
preserving the Phase 14 zero-exposure NAV case. Bulk history omits original-risk
plans, strategies, orders, corrections, transfers, income, withholding, imports
and attachments. Their existing correctness suites remain necessary; no large
fixture performance claim covers those workflows. Although the final campaigns
are closed, the explicit first-fill interval also exercises historical partial
holdings rather than substituting empty financial results.
Bulk fixtures do not populate journal review/planning revision history; the
browser's auxiliary plan/history panels therefore exercise empty histories,
not large version-history performance. Ongoing campaigns, short inventory,
late costs and fees charged in another currency are absent from these SQL
fixtures; the separate domain/correctness workloads cover those semantics.
Allocation items deliberately retain the supported legacy payload without a
stored principal, exercising the current principal-reconstruction fallback at
every scale. This is recorded in fixture omissions; it is not a benchmark of
current allocation-command write throughput. The paired first fixture is kept
unchanged after measurement, including its original manifest.

The pure-domain harness separately exercises concentrated and distributed
histories at all three scales, including shorts, fee rebates, charged-currency
FX and pinned acquisition/realization FX. It measures replay plus valuation,
retaining and hashing the entire result. It is not database/API/import evidence.
Source fixture preparation, input IO, canonical serialization/hashing and
measurement boundaries are reported explicitly. Scenario deadlines checkpoint
the attempted input counts and input hash; a timeout has no completed financial
result and cannot count as a successful report.
The domain scenarios use one economic microsecond with sequence ordering; they
measure the replay kernel and do not establish date-filter query performance.
Domain samples request GC before each warmup/measured replay and sample memory
at book boundaries, including canonical result serialization. Backend and browser
request runs use natural GC. None captures every transient allocation peak.

The [domain evidence](performance-domain-evidence.json) contains the exact full
command matrix and can itself be passed to `--compare`. For example, from the
optimized checkout, the six-scenario run is:

```sh
node --expose-gc --import tsx scripts/performance/domain-benchmark.ts --fixture-dir=work/performance/domain-fixtures --deadline-ms=300000 --warmups=1 --repetitions=3 --label=after-repro --compare=docs/performance-domain-evidence.json --output=work/performance/domain-after-repro.json
```

From a pristine baseline worktree at `work/phase15-baseline`, with the same
benchmark scripts/dependencies copied/installed, the extended concentrated case
uses the same persisted input and directly verifies the complete expected hash:

```sh
node --expose-gc --import tsx scripts/performance/domain-benchmark.ts --datasets=10000-trades-100000-executions --distributions=concentrated --fixture-dir=../performance/domain-fixtures --deadline-ms=900000 --warmups=0 --repetitions=1 --label=equivalence-before-repro --compare=../../docs/performance-domain-evidence.json --output=../performance/domain-equivalence100k-repro.json
```

## Measured changes

The restricted-role accounting plan exposed unnecessary transfer-leg work on
ordinary postings: 41 returned rows caused 41 lateral aggregates, 456,585 shared
buffer hits in that branch and 2,306 ms of plan execution. The event-kind
condition in the outer join did not prevent execution of the lateral subquery.
Adding the identical condition inside its `WHERE` gates the branch before those
scans. The outer condition, original/reversal source-kind resolution, tenant
checks and financial formulas remain unchanged. A PostgreSQL plan regression
requires ordinary cash reports to leave transfer-leg scans unexecuted; existing
immediate/delayed transfer and correction tests retain their economic assertions.
The relevant posting index already exists; this plan does not justify another
index.

The journal's measured N+1 pattern returned ten completed trades with 31 business statements:
one page query plus trade and two closure-evidence reads per trade. Batched
trade/quantity/obligation reads reduce that pilot to four statements, with an
identical full DTO hash. The existing individual read remains an independent
comparison in the database regression. Later attribution changes, removed
activity, unsettled late fees, pagination and inaccessible tenant IDs are tested.

Journal detail's cash query joined the workspace execution history through a
text payload before filtering to the requested campaign. Its restricted-role
1,000-trade plan took 642 ms for two rows and 136,133 shared buffer hits; at
10,000 trades it reached the statement timeout. The preceding fill read already
resolves the exact effective execution population in the same snapshot. Passing
those UUIDs as one bound array narrows the cash join while retaining all original
revision, attribution, supersession, fee, tenant and ordering conditions. The
new plan takes 77 ms for the same two rows and 8,715 buffer hits. A regression
covers unrelated unassigned cash and removing attribution; existing corrections,
shared allocations and settlement tests provide complementary coverage.

The retained larger detail plan took 1,063 ms to return two fills, including
40,000 latest-allocation lookups across 20,000 executions. Allocation constraints require
every historical allocation to retain the execution account, and runtime trade
legs cannot change accounts. A second bound array restricts that lookup to all
accounts of the requested trade before the lateral work. It retains the full
original allocation/revision/tenant predicates and does not narrow fees by
account. The regression includes two account legs and sequentially removes
attribution from each, checking both preserved cash and the empty population.

A CPU profile of 20,000 concentrated executions attributed 40.47 seconds of
46.94 seconds inclusive replay time to the retained-lot filter, approximately
86% of sampled replay time. Matching now indexes only active lots by object
identity; full historical lots, matches, costs and source references remain in
the result. Opening, exact closure, zero crossing and holding transfer paths
maintain the active index. Decimal arithmetic, matching order and calculation
manifests are unchanged.

The dashboard UI census counted three chart-subtree invocations on each local
search or unapplied date edit, while the report-request count stayed one. A
memoized visualization boundary with stable explicit inputs reduces those
invocations to zero. Exact-value tables mount when their native disclosure is
opened. The pilot initially retained 30 hidden chart-table rows; production DOM
measurements and opening/reopening regressions assess the final behavior.
Memoization covers one response generation and explicit view inputs. A new
response, applied scope, timezone, currency or chart selection updates those
inputs; regressions also check fresh values after reopening and failed report
generations. Local search/draft edits still cause no extra report request, in
accord with TanStack Query's structural key behavior.

## Measured reads

Durations below are service milliseconds, median of three measured sequential
requests after one warmup unless stated otherwise. They include complete
calculation and validation. A journal list is one page, not a materialized report
of every trade. Bounded scopes use the first account: ten campaigns in the
1,000-trade fixture and 100 campaigns in the 10,000-trade fixture.

| Fixture                         | Operation                       | Before ms | After ms | Business SQL before → after | Financial comparison                           |
| ------------------------------- | ------------------------------- | --------: | -------: | --------------------------- | ---------------------------------------------- |
| 1,000 trades / 2,000 executions | Journal whole-scope 50-row page |    967.81 |   326.92 | 151 → 4                     | Identical                                      |
| 1,000 / 2,000                   | Journal bounded 10-row page     |    212.28 |    70.93 | 31 → 4                      | Identical                                      |
| 1,000 / 2,000                   | Journal detail 1, final code    |    954.43 |   278.18 | 24 → 24                     | Identical                                      |
| 1,000 / 2,000                   | Journal detail 2, final code    |    924.29 |   262.06 | 24 → 24                     | Identical                                      |
| 1,000 / 2,000                   | Bounded analytics               |    366.20 |   325.57 | 12 → 12                     | Identical; no analytics speedup claim          |
| 1,000 / 2,000                   | Bounded dashboard               | 17,055.18 | 1,583.97 | 377 → 377                   | Identical                                      |
| 1,000 / 2,000                   | Bounded accounting              |  2,794.21 |   273.28 | 59 → 59                     | Identical                                      |
| 10,000 / 20,000                 | Journal whole-scope 50-row page |  9,788.22 |   595.91 | 151 → 4                     | Identical                                      |
| 10,000 / 20,000                 | Journal bounded 50-row page     | 10,062.43 |   647.61 | 151 → 4                     | Identical                                      |
| 10,000 / 20,000                 | Bounded analytics               |  3,127.59 | 3,161.82 | 12 → 12                     | Identical; unchanged within observed variation |
| 10,000 / 20,000                 | First-fill accounting, n=1      |  1,984.34 |   525.08 | 23 → 23                     | Identical                                      |
| 10,000 / 20,000                 | First-fill dashboard, n=1       |  2,647.99 | 1,039.41 | 41 → 41                     | Identical                                      |

The supplemental first-fill interval is
`(2030-01-01T01:00:00.000000Z, 2030-01-01T01:00:00.000001Z]` in that same account,
with the same source revision, metadata cutoff and valuation policies. It
contains the first partial fill, actual fee and nonzero holding. It supplies a
comparable financial result where broad baseline requests time out; it does not
replace those broad attempts.

Whole analytics and dashboard requests reject with
`409 ANALYTICS_SCOPE_TOO_LARGE` in both implementations. At 1,000 campaigns the
4 MiB response check is reached; at 10,000 campaigns the initial campaign bound
is reached. These are not completed 1,000- or 10,000-trade financial reports.

At 10,000 trades / 100,000 executions, the whole-scope journal page improves
from 28,743.89 to 3,160.58 ms, and the bounded 50-row page from 29,176.32 to
3,499.49 ms. Both change from 151 to four business statements and retain exact
DTO hashes. Bounded analytics computes all 100 selected campaigns and 1,000
executions in 12,197.10 → 12,715.20 ms with 12 statements and 1,292,644 JSON
bytes. This is a measured remaining bottleneck, not an analytics speedup.
The recent-date supplement returns ten campaigns and 226,088 JSON bytes but
still takes 12,213.51 → 12,268.21 ms (n=1): the initial 100-campaign history is
selected before the final date cohort.

Full-year bounded accounting and dashboard in that largest fixture time out
before optimization and reject with `ACCOUNTING_SCOPE_TOO_LARGE` afterward;
neither implementation computes those reports. Whole accounting exceeds the
1,000-book guard: all three baseline samples reject explicitly, while optimized
samples contain two explicit rejections and one SQL timeout near the ten-second
statement budget. The warmup also times out. These mixed outcomes are retained
in the evidence rather than summarized as a uniformly successful guard check.
First-fill accounting does compute in both implementations, at 9,892.08 →
3,020.25 ms (n=1, 23 statements, 11,866 JSON bytes), with an identical full DTO.
First-fill dashboard changes from a SQL timeout to a computed 3,788.06 ms result
(n=1); that direct-service attempt has no completed baseline DTO for comparison.
The separate production-browser baseline later computes two of three intraday
dashboard requests and times out once; those HTTP outcomes and their available
financial comparisons are reported separately below. The two full journal
details likewise change from timeouts to 10,604.17 and 10,696.16 ms, each with
24 statements and roughly 33 KiB JSON. Total service duration can exceed ten
seconds because the unchanged timeout applies to each SQL statement.

The largest restricted-role plans show the remaining detail fee query taking
4.94 seconds, including a 200,000-row cost-allocation scan and 100,000 latest-set
lookups. The narrowed cash query still takes 2.14 seconds scanning ledger events.
These are retained limitations; the small trade-leg scan does not justify the
proposed trade-leg index. Plan summaries, actual returned rows, buffer activity,
sample distributions, response populations and comparison outcomes are in the
[backend evidence](performance-backend-evidence.json).

At 10,000 trades / 20,000 executions, the baseline full-account dashboard,
accounting and two journal details reach the unchanged SQL timeout. The optimized
versions compute at 16,953, 2,921, 3,697 and 3,337 ms respectively. These are
capacity improvements with **no completed baseline DTO for equivalence** at
those exact scopes. Equivalence is demonstrated separately by the successful
paired scopes, domain matrix and correctness suite.
Those detail figures describe the intermediate cash-query change. With the
final account-prefilter change, the same details compute in 2,895.92 and
2,623.96 ms; their complete DTOs match the intermediate successful results
exactly (three samples plus one warmup, 24 statements each). The original
baseline still has no completed detail DTO at this scale.

Whole accounting at 1,000 trades changes from a SQL timeout to a computed
17,679 ms report with 4,613 statements and 5,810,803 JSON bytes. The separate
10,000-trade whole-accounting attempt uses n=1, no warmup and a 240-second process
deadline: baseline times out in SQL at 20,882 ms; optimized completes in
151,679 ms with 4,613 statements and 55,973,279 JSON bytes (4,781,102 gzip bytes).
Only 13,182 ms of the latter is measured SQL; calculation/validation remains
expensive. Sampled heap/RSS reach 417,893,608 / 594,493,440 bytes. Accounting does
not share analytics' 4 MiB response guard. Neither the slow large response nor
the remaining per-book query pattern is represented as solved.

The quiet concentrated-domain replay/valuation pair over 20,000 executions
improves from 17,346.43 to 1,886.10 ms, a local 9.20× improvement; valuation alone
is essentially unchanged (433.44 → 442.57 ms). All six domain scenarios retain
identical complete financial outputs. The original 100,000-execution concentrated
attempt exceeded a 120-second scenario deadline before any measured sample
completed. A separately
labeled extended single-sample baseline completed in 783,543.52 ms, allowing
complete output equality to be checked. Its timing and the contended matrix
timings are not used for speedup ratios. Full input/output hashes, sample
statistics, profile evidence and limitations are retained in
[domain evidence](performance-domain-evidence.json).

## Production browser measurements

The browser uses the normal production assets, real sign-in, runtime role,
tenant isolation, CSRF and application HTTP responses. HTTP failures are
application outcomes; a zero capture-failure count does not mean every request
succeeded. Automatic retries remain in the observations and elapsed interaction
time. A previously computed response cannot pass comparison by hiding a failed
after attempt behind a later successful retry.
Journal navigation uses the UI's 25-row page; the direct-service page benchmark
requests 50 rows. Their durations are not timings for the same page population.

The completed 1,000-trade browser pair has one warmup and three measured
repetitions, with seven compared HTTP request groups retaining exact hashes.
Its cache-disabled dashboard sample makes 16 requests in each implementation:
599,608 → 599,795 total CDP-encoded bytes. The report itself remains 245,754
JSON bytes and 246,335 encoded transfer bytes in both. The measured improvement
does not come from removing financial payload fields or reducing request count.

| Browser operation, 1,000 trades | Before ms | After ms | Outcome                                      |
| ------------------------------- | --------: | -------: | -------------------------------------------- |
| Dashboard navigation/readiness  | 16,906.94 | 2,290.48 | Computed in every sample                     |
| Journal navigation              |    959.05 |   389.41 | Computed in every sample                     |
| Journal detail selection        |  1,343.88 |   491.53 | Computed in every sample                     |
| Dashboard local search          |     74.70 |    42.22 | No network requests in either implementation |
| Unapplied date edit             |     60.93 |    41.45 | No network requests in either implementation |

Local search and draft edits each cause three global React root commits and 18
chart DOM mutations before, versus one root commit and zero chart mutations
after, in all three samples. These are global commit counts and DOM observations;
the separate UI census establishes the chart-subtree invocation change of three
to zero. Closed chart tables retain 30 rows before and zero after; active page
elements fall from 1,239 to 1,054 in every navigation sample. Opening, closing
and keyboard reopening still complete. The ten-trade cohort has no next page,
so that unavailable action is not presented as pagination performance.
Lazy mounting moves some work to disclosure: first exact-table opening changes
from 42.61 to 75.37 ms median in this pair. Navigation long-task duration has a
102 → 109 ms median, so the measurements do not establish a navigation
long-task reduction. The measured benefits are reduced unrelated chart work
and fewer mounted nodes; initial disclosure has an observed cost.

The large-fixture dashboard results below separate successful report latency
from rejection latency. Each run requests three measured samples and one warmup.
First-fill means the explicitly pinned intraday dashboard interval; journal
requests still read full current account history.

| Executions / dashboard scope | Successful before median ms | Successful after median ms | Computed before → after | Report comparison                                          |
| ---------------------------- | --------------------------: | -------------------------: | ----------------------- | ---------------------------------------------------------- |
| 20,000 / full year           |                           — |                  17,104.03 | 0/3 → 3/3               | No completed baseline DTO                                  |
| 20,000 / first fill          |                    3,074.85 |                   1,674.48 | 3/3 → 3/3               | Identical                                                  |
| 100,000 / full year          |                           — |                          — | 0/3 → 0/3               | Both rejected                                              |
| 100,000 / first fill         |             10,773.65 (n=2) |                   3,806.45 | 2/3 → 3/3               | Both successful baseline DTOs identical to every after DTO |

The 20,000-execution full-year baseline rejects HTTP 500 in 13,853.47 ms median.
At 100,000 executions, full-year baseline requests reject HTTP 500 in 23,940.42
ms median; optimized requests reject HTTP 409 `ACCOUNTING_SCOPE_TOO_LARGE` in
17,324.63 ms. These are rejection latencies, not computed-report improvements.
The largest first-fill baseline's remaining request rejects HTTP 500 in
11,057.77 ms. Its successful-only median uses two samples; the failed request
is retained rather than folded into successful report timing or retried away.

Large full-year browser journal navigation improves from 5,325.49 → 971.12 ms
at 20,000 executions and 15,606.99 → 3,492.74 ms at 100,000, with exact list DTOs.
Journal detail changes from baseline SQL failures with real automatic retries
to computed medians of 2,889.09 and 10,608.37 ms respectively. Those detail
scopes have no completed baseline DTO. Their baseline UI error timings are
26,456.88 and 41,523.68 ms, including retries; they are not successful detail
latencies.

Successful dashboard JSON sizes remain 64,640 bytes for the 20,000-execution
first-fill pair and 64,638 bytes for the 100,000-execution first-fill pair. The
optimized 20,000-execution full-year report is 1,595,285 bytes. The largest
full-year optimized response is a 255-byte rejection, not a smaller financial
report. Corresponding CDP response transfers are 65,220 and 65,218 bytes for
the two first-fill scopes, 1,595,867 for the successful large full-year report
and 899 for the largest-fixture rejection. All ten formal artifacts have zero
response-capture failures and no
client readiness cutoff. Matched request groups per pair are 7, 5, 6, 5 and 6
(1,000 full year, 20,000 full year/first fill, 100,000 full year/first fill);
rejected baseline groups remain explicitly noncomparable.

The [frontend evidence](performance-frontend-evidence.json) preserves every
observed operation, retry, unavailable action, response hash, transfer length,
DOM/heap/retained-node sample, long task and global commit count, with separate
computed/rejected statistics and hashes of all ten raw reports. The baseline
build is `yq1hrutrCNM9Cv0ugWzl8`; optimized assets are
`rSQUPkHubK409M0WWNWx7`. These are normal production builds. Browser runs after
the usage pause reuse the unchanged persisted fixture and optimized build,
with fresh normal authentication and no competing workload.

The harness has a 60-second readiness deadline per measured interaction. It is
a benchmark cutoff, not an application report budget or PostgreSQL timeout.
Partial observations and skipped repetitions/actions remain explicit. After a
deadline the owned server is stopped before the next fixture/scope, allowing
remaining SQL to finish under the unchanged statement timeout. Unavailable
pagination and panels dependent on a failed response are not counted as
successful interactions.

The 1,000-trade baseline journal navigation makes five catalog/list requests;
selecting a trade also requests plans, revisions, risk additions and attachments.
Opening history then makes no new request because revisions were already loaded.
That disclosure timing measures cached UI work, not a deferred history fetch.
These early auxiliary requests remain unchanged: their elimination was not
established as a measured bottleneck. The single-change search scenario does
not test rapid-typing cancellation. Dashboard local search and unapplied date
edits already make no report request in the baseline.

## Memory observations

The 20,000-execution bounded dashboard's three optimized reads end at
163.22 → 208.05 → 262.42 MiB heap and 371.55 → 418.00 → 462.12 MiB RSS. The next
bounded-accounting reads drop heap to 69.63 → 67.95 → 56.07 MiB. These are natural
GC process observations, not isolated retained-object measurements. Backend
post-request memory is sampled after JSON serialization and before benchmark
hashing/compression; later requests can still encounter uncollected allocations
from that postprocessing. The upward dashboard sequence motivated an isolated
eight-request follow-up. After one warmup, its post-JSON heap measurements are
154.1, 63.3, 106.9, 165.4, 167.2, 84.8, 110.3 and 91.2 MiB, showing natural GC
reclamation. RSS rises from 338.0 to 404.6 MiB, with a sampled peak of 418.0 MiB.
All eight responses have the same exact financial hash, 377 statements and a
16,776.60 ms median (18,366.81 ms empirical p95). This short observation does not
establish a long-run RSS plateau or leak freedom.

The GC-conditioned quiet domain pair also does not demonstrate lower memory:
sampled heap peaks range from 111.93–120.04 MiB before and 144.95–154.52 MiB after.
The 100,000-execution concentrated optimized domain samples reach
484.13–505.33 MiB sampled heap, with 698.96–703.21 MiB post-run RSS; the process
high-water RSS of 873.83 MiB includes preparation/serialization. Domain and
natural-request memory samples have different boundaries and GC conditions.

Fewer active DOM elements do not demonstrate lower browser heap. The 1,000-trade
post-dashboard heap samples are 19.97, 23.91 and 26.76 MiB before, compared with
46.25, 64.61 and 40.87 MiB after. Retained CDP node counts are 2,786 / 2,786 /
2,683 before and 7,633 / 12,936 / 6,658 after. They include unreclaimed documents
and detached nodes across navigations, unlike the active element count. GC is
not forced; the third optimized sample shows reclamation. This short campaign
supports neither a browser memory reduction nor a long-run leak conclusion.

## Financial equivalence

Database comparisons use the same persisted source facts and pinned financial
revision, metadata cutoff, scope, valuation times and price/FX policies.
Analytics, dashboard and accounting receive explicit report pins. Journal APIs
read the unchanged fixture's current revision/catalog. Browser journal
list/search use the current account without activity-date filters, and detail
remains the full current campaign. An intraday dashboard measurement therefore
does not turn journal requests into historical first-fill snapshots.
Canonical object-key ordering preserves arrays, decimals, revisions, source
provenance, availability states and economic/source timestamps. The only
omissions are `/context/recordedAt` for analytics and
`/analytics/context/recordedAt` for dashboard: request-time observation clocks.
Journal and accounting DTOs omit nothing. Rejected operations are compared as
rejections, never assigned a financial hash or described as computed results.
Domain comparisons retain every output field and require equal input hashes.

## Capacity and interpretation

| Area               | Finding and decision                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N+1 queries        | Batch journal page closure evidence. Whole accounting still issues thousands of per-book reads; retain that limitation.                                                                   |
| Slow analytics     | A 100-campaign bounded report remains about 3.1 seconds at 20,000 executions. Whole requests reach existing campaign/payload guards. No arithmetic or population shortcut was introduced. |
| Frontend renders   | Measured chart-subtree work on unrelated local edits is removed; exact tables mount on disclosure. Global commit counts remain distinct from component timing.                            |
| Payload size       | Whole 20,000-execution accounting returns 55.97 MB JSON. Analytics/dashboard retain their 4 MiB guard; accounting response design remains a capacity issue.                               |
| Aggregation/replay | Active-lot matching removes measured repeated closed-history scans. Repeated book reconstruction and broad report calculation remain expensive.                                           |
| Database indexes   | Restricted-role plans support earlier population/branch filtering. They do not justify a production index migration; fixture-only helper indexes are removed before reads.                |
| Memory             | Retained history and large DTOs remain substantial. Sampled request/browser memory documents observed behavior, without certifying leak freedom or concurrency capacity.                  |

The safeguards remain: at most 1,000 initially selected campaigns, 500 groups,
50,000 combined analytics source facts and a 4 MiB analytics/dashboard response.
Facts include allocations, costs and observations, not just executions. Campaign
selection precedes final date-cohort filtering; narrowing only `from` does not
necessarily reduce the initial history. Dashboard trade dimensions filter after
source selection; account scope can reduce that initial population.

Accounting retains its separate account/book/posting/source bounds. Dashboard
synchronous account histories support ten accounts; larger scopes have explicit
history unavailability. PostgreSQL still enforces a ten-second runtime statement
timeout. Whole-dataset failures are capacity results, not successfully computed
10,000-trade reports. Bounded scopes inside the same large databases must be
reported separately.
At 100,000 executions, even a full-year single-account accounting/dashboard
scope reaches an existing later 50,000-source bound: accounting loads the
workspace's execution/opening-lot history for the selected instrument IDs.
Sharing all 20 instruments exposes that global history despite the account's
1,000 own executions. The original implementation times out earlier in cash
reporting; the optimized path exposes this explicit source rejection. Narrowing
only `from` retains that source history through `to`; the first-fill intraday
supplement uses an earlier `to` and is a separately labeled scope.

Heap/RSS observations sample process boundaries and query activity, rather than
continuous peaks. Browser heap/retained nodes follow natural GC, which is not
forced. Repeated requests can show behavior over the measured run; they do not
prove absence of leaks. Small repetition counts, local networking, a single
tenant workload and quiet sequential readers do not establish production
capacity. Million-fill rebuilds, 50,000-row imports, concurrent readers and heavy
worker contention from the broader roadmap remain unmeasured.

## Validation

Checks run with the pinned toolchain and existing isolated test bindings. The
production build uses `NODE_ENV=production`, HTTPS `APP_ORIGIN` and telemetry
disabled; browser checks serve those assets in the documented local HTTP test
mode with `/usr/bin/chromium`.

| Check                             | Executed result                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Frozen-lockfile installation      | Passed; lockfile unchanged                                                                           |
| API contract drift                | Passed                                                                                               |
| Formatting                        | Passed                                                                                               |
| Lint                              | Passed; updated harness files also checked separately                                                |
| Type checks                       | Workspace check passed; final harness-only updates checked separately                                |
| Unit/property/UI                  | 766 passed in 53 files                                                                               |
| Final benchmark-harness recheck   | 13 fixture/instrument tests passed; included in the 766 above, rechecked after final capture changes |
| PostgreSQL integration            | 508 passed in 29 files                                                                               |
| Migration verification            | Passed                                                                                               |
| Runtime/database readiness        | Passed                                                                                               |
| Dependency audit at low threshold | Passed; no known vulnerabilities                                                                     |
| Production build                  | Passed                                                                                               |
| Browser scenarios                 | 14 passed, including the persisted financial lifecycle and accessibility/security journeys           |

Executed command results, test counts, source/log hashes, build IDs and the file
inventory are retained in [validation evidence](performance-validation-evidence.json).
The known-private-value scan found no matching values in reviewable source or
public client assets; its scope/counts are recorded there.

The full financial correctness suite retains the independent Phase 14 lifecycle:
EUR 9,285 closing cash/equity, EUR 9,000 net external capital, EUR 285 account
performance, USD 229.5 campaign net P&L, EUR 255.325 reporting campaign net P&L,
2.295R against original USD 100 risk and zero reconciliation variance. Unknown
or nonzero foreign exposure still requires its inputs, and supplied available FX
contexts still receive strict validation. New regressions cover batch closure
review, cash/fill populations across two accounts and attribution removal,
restricted-role transfer-branch execution, active-lot lifecycle/late costs,
dashboard generations/disclosures and evidence/credential redaction.

The final worktree on `perf/phase-15-profiling` contains 13 created files: six
benchmark scripts, this report, four evidence JSON files and two harness tests.
Eighteen existing files are modified: seven production files, five regression
test files, four configuration/ignore files, README and the development plan.
There are no deleted files or staged changes. The validation evidence contains
every exact created/modified/deleted path. No Phase 15 commit, push or merge was
performed; existing databases, private bindings and the approved main history
are retained.
