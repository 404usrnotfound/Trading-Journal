# Operations

Reviewed **26 October 2026** for Phase 19 Checkpoint 5 against committed
Checkpoint 4 `b75b04cc92dbe89bb4bf131600fd1cb0a31a77e4`; unchanged application
baseline `5132900a03efabaeb307787531546987228220e7`. This is the canonical runtime,
health, logging and capacity runbook. It covers the Next.js web process, pg-boss
worker with native financial outbox processing, PostgreSQL 17/schema 17 and private
local attachment storage. Use [deployment](deployment.md)
for release preparation and [backup and recovery](backup-and-recovery.md) for
coordinated recovery. [Routine maintenance](operations/routine-maintenance.md)
owns recommended cadences and maintenance records. The
[production-readiness checklist](production-readiness-checklist.md) separates local
verification from deployment obligations. Current [operational verification](operations/verification.md)
owns this checkpoint's fresh command results and unexecuted target procedures.
No public deployment, live provider connection or production alert destination is
established by this documentation. [FA-04](final-audit.md) remains open.

## Runtime components and invariants

| Component          | Supported responsibility and boundary                                                                                                                                                        | Source                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                | Next.js Node process; authenticated UI/APIs, synchronous financial writes/imports/bounded reports; tenant and authentication pools.                                                          | [Services](../packages/server/src/services.ts), [web launcher](../scripts/run.ts)                                                               |
| Worker             | Queue-only runtime credentials; `platform.health-probe` plus `financial.native-snapshot` handlers; no runtime DDL/migration.                                                                 | [Worker](../apps/worker/src/index.ts), [queue configuration](../apps/worker/src/queue.ts), [dispatcher](../apps/worker/src/financial-outbox.ts) |
| PostgreSQL         | Major 17; schema 17, reviewed migration history and distinct tenant/auth/jobs roles. Readiness checks compatibility; it never applies migrations.                                            | [Schema readiness](../packages/database/src/readiness.ts), [migration runner](../packages/database/src/migrate.ts)                              |
| Private storage    | Durable application-owned local POSIX directory; ready attachment metadata/bytes must agree. It must remain outside public/static roots.                                                     | [Private file store](../packages/server/src/storage.ts), [configuration](getting-started/configuration.md)                                      |
| Ingress/supervisor | Deployment-provided HTTPS termination, routing, process supervision, log collection and alert delivery. No vendor-specific service unit or external monitor is installed by the application. | [Deployment](deployment.md), [architecture](architecture.md)                                                                                    |

Keep web and worker on the same reviewed release with its locked dependency graph.
Runtime identities must remain least-privilege; the operator migration identity
must not be injected into web/worker. Do not replace configured durable media with
an ephemeral container layer or run isolated replicas with unrelated media roots.
An immutable source/audit record is not disposable operational telemetry. The
[configuration reference](getting-started/configuration.md) owns environment names,
precedence and restart requirements; this runbook does not define additional knobs.

## Service ownership and daily checks

Run web and worker from the same reviewed release under a supervisor. Keep the
database and worker health port private. Run the web process behind the HTTPS
reverse proxy described in the deployment runbook; direct Internet access to its
Node listener is outside this topology. Use an unprivileged service account with
read access to release files and write access to the private media directory,
explicitly allocated temporary storage and the launcher-owned standalone asset/cache
locations described in the deployment guide. Monitor that directory's filesystem
and inode space independently of the application.

At each release and at the recommended routine cadence, check authenticated web readiness, private
worker readiness, recent successful worker heartbeats, database connection use,
disk/inode capacity, backup age and a known attachment's authorized retrieval.
Treat stale backups, missing media and integrity failures as incidents even when
both processes are alive. The [daily/session, weekly and monthly schedule](operations/routine-maintenance.md)
is an operator recommendation, not an installed scheduler, cron job or external
monitoring integration.

The worker consumes `platform.health-probe` and `financial.native-snapshot`.
The [financial outbox](financial-outbox.md) dispatcher publishes a revision-safe
native cash/holdings projection, with authenticated generation/status reads and
an authorized refresh path. Monitor its source/processed revisions and safe
failed/blocked state separately from process readiness. Ordinary financial
commands, imports and bounded accounting reports still run synchronously in
the web process. Asynchronous large-report/import handlers, cancellation UI and
generic failed-business-job redrive are not implemented. A healthy queue probe
does not prove every financial projection is current. Do not invent application
job names or delete outbox facts to make a lag chart appear healthy.

## Health checks

| Probe                                    | Authentication and exposure                                    | Healthy result                                                        | What it establishes                                                                                |
| ---------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`                | Public, through the normal web origin                          | `200`, `{"status":"ok","service":"web"}`                              | The web handler can answer. It does not access the database, queue or media.                       |
| `GET /api/v1/health/ready`               | Existing authenticated session; keep probe credentials private | `200`, `{"status":"ready","database":"connected","schema":"current"}` | Tenant database schema version 17, PostgreSQL major version 17 and an auth-database query succeed. |
| `GET http://127.0.0.1:3101/health/live`  | Private worker listener; port/host configurable                | `200`, `{"status":"ok"}`                                              | Worker process is not shutting down.                                                               |
| `GET http://127.0.0.1:3101/health/ready` | Same private listener                                          | `200`, `{"status":"ok"}`                                              | Most recent worker queue probe completed and shutdown has not begun.                               |

All health responses disable caching. Anonymous web readiness receives `401` when
authentication is available. An authentication database exception or authenticated
schema/database failure receives a safe `503 NOT_READY` problem with a generated
request ID. Explicit authentication `401`/`403` rejections retain their status.
Readiness never discloses connection strings, SQL or database exception text.
Web liveness remains independent of those failures.

The HTTP contracts and classifications above are implemented by the
[web readiness route](../apps/web/src/app/api/v1/health/ready/route.ts),
[service readiness](../packages/server/src/services.ts),
[schema verifier](../packages/database/src/readiness.ts) and
[worker listener](../apps/worker/src/index.ts). Use the current configured
`APP_ORIGIN` and `WORKER_HEALTH_HOST`/`WORKER_HEALTH_PORT`; the loopback URLs in the
table are defaults, not production routing instructions. Keep a secured web
session out of command arguments, shell history and shared monitoring output.
[Diagnostics](troubleshooting/diagnostics.md) owns safe probe and configuration
inspection examples.

Worker readiness stays unavailable until startup's real enqueue/consume/complete
round trip succeeds. After startup the probe runs every 30 seconds, with a
15-second polling window; an in-flight database call can extend that window.
Queue error events immediately clear readiness;
a later successful probe can restore it. This is not a per-request live DB check:
an outage just after success can remain undetected until the next probe fails.
The pg-boss registry heartbeat is separately configured at 10 seconds. Worker
readiness does not check the application's schema, tenant credentials or media.

The web readiness endpoint deliberately uses ordinary sessions rather than a
separate monitoring credential. Sessions expire after seven days, are not sliding,
and can be revoked. A monitor must securely manage a valid session and distinguish
`401` from `503`; never disable authentication, store cookie values in a public
probe configuration or repeatedly log in until persisted rate limits lock it out.
`corepack pnpm db:check` is a separate operator check of the tenant schema; it is
not an anonymous HTTP readiness replacement.

Suggested probe intervals and alert thresholds require testing with the selected
supervisor: liveness every 15 seconds with a startup allowance, readiness every
30 seconds, warning after two failures and an incident after sustained failure.
Allow at least the queue's 15-second polling window plus connection/query time.
These are proposed settings, not measured production SLOs. Storage availability,
proxy/TLS validity, disk space and backup freshness need independent checks.

## Startup, shutdown and failed requests

After the deployment preflight and one-shot migrations, start services separately:

From the reviewed release's repository root, in the Linux/POSIX environment and
with its private production configuration already supplied, these are two
separate supervisor services, not sequential foreground commands in one terminal:

```bash
corepack pnpm start:web
```

```bash
corepack pnpm start:worker
```

**State-changing:** these commands open listeners and pools; worker startup
registers its handlers and can process pending outbox work. They do not run
application or queue migrations. Command definitions are in
[package.json](../package.json) and [the launcher](../scripts/run.ts); frozen
dependencies and [production build outputs](deployment.md) are prerequisites.
Expected results are supervised live/ready processes and a real queue round trip,
not merely a successful spawn. These launch templates are **Source-reviewed**;
the [verification record](operations/verification.md) identifies the actual
commands, environment and startup/shutdown checks executed for this checkpoint.

The documented launchers filter the child environment: web receives declared
runtime bindings; worker receives queue/health/log bindings. Migration, bootstrap,
test and unrelated provider credentials do not pass to either child. A direct
`node apps/worker/dist/index.js` invocation must be given an equivalently scoped
environment by the supervisor. Do not inject the operator's complete environment
into a container/service just because the launcher would otherwise filter it.

For a planned stop, remove web traffic and send `SIGTERM` to the owned service
process. Worker signal handlers are installed before connecting to PostgreSQL.
Shutdown clears readiness, cancels new heartbeat probes, aborts probe polling,
stops/awaits the financial outbox dispatcher, and asks pg-boss to stop fetching and
drain active handlers with a 10-second grace.
The launcher allows 15 seconds before killing its owned process group. Configure
the outer supervisor with at least 30 seconds to avoid cutting off that drain.
A second termination signal can force process termination; do not use repeated
signals as the normal shutdown procedure.

Web termination relies on Next.js server shutdown and the launcher deadline;
there is no separate application hook that explicitly drains the tenant/auth pools.
Remove traffic and drain requests before stopping the web process. An in-flight
multi-statement financial request interrupted during rollout needs an actual-target
rehearsal; the local worker and launcher checks do not verify that cutover.

An in-flight SQL call remains subject to its configured statement timeout; aborting
probe polling is not SQL cancellation. Startup checks stop progressing to ready
after termination, including when a schema query was already in flight. Shutdown
errors produce a fixed operational event and a failing process exit. A process
that needs `SIGKILL` must be investigated before rollout continues.

The queues have separate settings. `platform.health-probe` has two retries,
initial one-second exponential backoff and 30-second job expiry.
`financial.native-snapshot` has four retries, initial two-second exponential
backoff and 60-second job expiry. Both are configured with 3,600-second retention
and 300-second delete-after values in the [one-shot queue migration](../apps/worker/src/migrate.ts).
These pg-boss settings govern queue rows; the durable financial outbox has its own
lease/attempt state and retained provenance. Runtime queue supervision is enabled,
but application scheduling, runtime queue migration and automatic reindex are not.
No authoritative financial posting depends on the infrastructure probe.
Database mutations commit atomically with their command,
audit/outbox facts and invariant checks. If a connection or browser response is
lost, the outcome may be unknown to the caller. Inspect the persisted record or
retry the exact original operation with its original idempotency key; never assume
a `5xx` proves that nothing was committed. Do not manually edit source facts,
allocation sets, revisions or ledger postings to clear an operational error.

The ten-second runtime SQL timeout is per statement, not an end-to-end HTTP
deadline. Large reports may exceed it over multiple statements or return explicit
bounded-scope errors. [Phase 15 measurements](performance.md) include slow valid
requests and rejected large scopes. Edge HTTP/body/connection deadlines and
capacity-based concurrency limits must be selected and tested for the actual
deployment; increasing timeouts or removing financial/report safeguards is not an
incident workaround.

## Logs and correlation

Server and worker logs use Pino JSON on standard output. The database factory's
handled idle-connection failure emits one fixed JSON event on standard error.
Collect both streams using the host/container supervisor; keep access restricted
and use the proposed initial 14-day retention policy from [ADR 0008](decisions/0008-testing-and-operations.md), subject to
the deployment's approved privacy and retention policy. A log collector, shipping
pipeline, disk rotation and alert destination have not been installed here.

Allowed structured fields include event/operation codes, request/job/correlation
IDs, actor/workspace IDs, duration/counts, revision and calculation version.
The error serializer keeps error classification/code and validated configuration
field names, omitting raw error messages and stacks. Bodies, notes, file/source
contents, credentials, cookies, authorization headers and SQL parameters are not
operational log inputs. Keep message strings fixed: arbitrary strings passed as
the Pino message are not automatically scrubbed. Do not enable PostgreSQL
parameter/full-statement logging or attach private browser traces to public issues
without a separate redaction review.

Useful existing events:

| Event                                                         | Initial response                                                                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web.request.failed`                                          | Correlate the safe `operation`, status/code and request ID with the caller's problem response. `4xx` rejection volume and `5xx` failures have different causes.                                          |
| `database.idle-connection-failed`                             | Inspect database/network availability and connection counts. The failed idle client is removed; a later query can reconnect. Active query errors still reject.                                           |
| `worker.starting`, `worker.ready`                             | Confirm release startup and successful initial queue round trip.                                                                                                                                         |
| `worker.heartbeat`, `worker.heartbeat.failed`                 | A success or failure of the periodic infrastructure probe. Check private readiness and PostgreSQL.                                                                                                       |
| `worker.queue.error`, `worker.queue.warning`                  | Inspect queue/database health using privileged diagnostics without printing raw job payloads or credential-bearing errors.                                                                               |
| `worker.outbox.dispatch.failed`                               | Inspect durable projection status/generations and queue/database access. This dispatcher event does not itself clear worker readiness; a healthy infrastructure probe does not prove dispatch succeeded. |
| `worker.stopping`, `worker.stopped`, `worker.shutdown.failed` | Confirm planned drain or investigate an incomplete stop.                                                                                                                                                 |
| `worker.startup.failed`                                       | Check validated field names, compatible queue migrations and private connectivity. Restart only after the cause is understood.                                                                           |

HTTP problem responses carry the generated `x-request-id` and matching JSON
`requestId`, which is also present in the safe failure log. Successful requests
do not currently have a universal access log or duration metric. React commits,
browser timings and SQL instrumentation in `scripts/performance` are benchmark
tools, not a production telemetry pipeline. Financial audit records remain
authorization-controlled database facts; operational log retention must not be
used as a substitute for financial source/audit retention.

The [logging implementation](../packages/server/src/logging.ts) establishes the
redaction/allowlist/error-serialization boundary. Logs go to process streams, not
a repository-defined `logs/` file. Host logs, reverse-proxy access logs, stderr
from third-party tools and an arbitrary string passed as a logger message need
their own redaction review. Before sharing, follow the
[sanitized diagnostic report checklist](troubleshooting/diagnostics.md).

## Database connections and capacity

| Consumer                                           |                 Pool cap per process | Connection / statement bounds                                                       |
| -------------------------------------------------- | -----------------------------------: | ----------------------------------------------------------------------------------- |
| Web tenant database                                |                                   10 | Connect/acquire 5 seconds, idle 30 seconds, each statement 10 seconds               |
| Web authentication database                        |                                   10 | Same shared factory settings                                                        |
| Worker pg-boss database                            |                                    4 | Connect/acquire 5 seconds; statements and locks 5 seconds                           |
| Operator application migration / role provisioning |                               1 each | Connect 5 seconds; migration advisory-lock wait bounded by 30-second `lock_timeout` |
| `db:check`                                         | 10 configured, one sequential reader | Shared database factory settings                                                    |
| One-shot pg-boss migration                         |                    Driver default 10 | Connect 5 seconds; this is operator tooling, not the runtime worker pool            |

Pool maxima are fixed defaults, not environment-variable knobs. A web process can
therefore use 20 connections despite receiving three URL bindings; it opens no
runtime pg-boss pool. A normal worker uses four pooled connections. pg-boss is in
polling mode (`useListenNotify` is not enabled), so no extra dedicated LISTEN client
is assumed in this budget. Driver keepalive/network failure behavior still depends
on the deployment network; no network-partition or connection-proxy certification
is claimed.

Reserve capacity using:

```text
20 × maximum simultaneous web processes
+ 4 × maximum simultaneous worker processes
+ one-shot migration/queue tooling, backup/restore and monitoring connections
+ PostgreSQL reserved/admin and safety headroom
< available database connections
```

Include old and new replicas during rollout, CI if pointed at a separate shared
cluster, and any administrator session. Two web plus two worker processes require
48 connections before headroom; overlap with two more of each raises that to 96.
Do not infer that PostgreSQL's default `max_connections=100` can safely support
that rollout. Keep production separate from tests and the benchmark fixture
databases. Use a private, certificate-verified database transport when crossing
hosts; do not disable certificate validation to pass a readiness check.

The following SQL is a **Source-reviewed**, read-only monitoring template, not
an automatically installed collector. **Freshly passed:** the exact statements ran
on the Checkpoint 5 disposable PostgreSQL instance through its authorized operator
binding; see [operational verification](operations/verification.md) for scope.
Production monitoring permissions, collection and alert delivery remain unverified. Use a PostgreSQL 17 client on the operator/monitoring
host; the working directory is irrelevant to SQL, while connection selection and
permissions are deployment-specific. Inspect aggregate statistics through a restricted operator/monitoring connection,
without selecting SQL text, job `data`/`output` or financial payloads:

```sql
BEGIN READ ONLY;

SELECT application_name, state, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY application_name, state;

SELECT name, state, count(*) AS jobs,
       min(created_on) AS oldest_created_on, max(retry_count) AS maximum_retries
FROM queue.job
GROUP BY name, state;

SELECT name, heartbeat_on, stopped_on,
       pool_max, pool_total, pool_idle, pool_waiting
FROM queue.instance;

ROLLBACK;
```

These views require deployment-specific monitoring permissions; runtime tenant
credentials intentionally cannot inspect the queue. Group the two queue names
separately: an old infrastructure probe is not financial processing lag, and an
empty/complete queue is not proof that the durable financial outbox caught up.
Use the authenticated `GET /api/v1/workspaces/{workspaceId}/accounting/native-snapshot`
status to compare latest/processed revisions, attempt counts and safe failure
classification. The browser has no dedicated projection-status panel. The API's
`current`, `stale`, `pending`, `empty` and `unavailable` states preserve distinct
meanings; a returned older snapshot must not be relabeled current. Do not expose
instance host/process/config details over public HTTP.

The [outbox reference](financial-outbox.md) owns native projection recovery and
bounds: dispatcher ticks every second, claims at most two workspace generations
per tick and registers local handler concurrency two. Sixty-second leases,
generation checks and durable retries protect at-least-once delivery. A workspace
without a current owner is blocked; five failed durable attempts wait for newer
activity or an authorized refresh. The 2,000-bucket/2,000-book/one-MiB candidate
bound is not a large-report capacity promise. Do not edit checkpoint rows, grant
raw financial privileges to the queue role, truncate a queue or recreate source
cash/fills to cure lag.
Alert on sustained pool waiting, growing active/idle-in-transaction populations,
connection exhaustion, PostgreSQL restarts, repeated `57014` timeouts and rising
RSS/disk use. Verify thresholds and alert delivery under a representative workload;
Phase 15 did not establish production concurrency or a memory-leak SLO.

## Incident and maintenance procedure

1. Record release ID, safe request/event codes, time window and affected scope.
   Check liveness, authenticated readiness, worker probe age and storage separately.
2. For unavailable dependencies, stop rollout and protect existing data. Investigate
   database reachability, schema/version mismatch, connection capacity, disk/inodes,
   secret injection and TLS expiry without printing secret bindings.
3. For persistent application failures, remove the affected replica from traffic,
   drain it, preserve safe logs and inspect the authoritative operation outcome.
   Roll back code only where the deployment runbook's schema compatibility review
   permits it. Never roll back an applied migration by editing its journal.
4. For corruption or lost media, follow the coordinated recovery runbook and verify
   restored financial/audit facts and file hashes before re-enabling writes.
5. After recovery, verify a real authenticated workflow and worker round trip,
   document the cause and follow-up, and test the corrected alert path.

The application migration advisory lock serializes application SQL migrations.
The current command runs queue migration and runtime-role provisioning afterward;
it does not hold one lock over the entire release procedure. Operators must
serialize the complete one-shot migration command, including queue tooling, and
prevent concurrent deploy/recovery jobs. A shell command returning success does
not independently verify TLS termination, backup durability or alert delivery.

## Local verification and outstanding checks

Phase 16 verification in the production-readiness checklist remains historical;
its nine-migration rehearsal is not the current schema-17 evidence. Later
[Phase 18 remediation](audit-remediation.md) and [manual verification](user-guide/verification.md)
retain their own scope and dates. This checkpoint's fresh results belong in
[operational verification](operations/verification.md).

Targeted runtime regressions are available in
[readiness route tests](../tests/unit/readiness-route.test.ts),
[production-readiness tests](../tests/unit/production-readiness.test.ts),
[worker lifecycle tests](../tests/integration/worker-lifecycle.test.ts) and
[financial outbox tests](../tests/integration/financial-outbox.test.ts). They cover
protected readiness classification, safe diagnostics, release assets, probe
cancellation, owned shutdown and generation-safe durable projection behavior.
The presence of those tests is not a claim that all were rerun for this document.

Production TLS/proxy failure drills, storage-full alerts, sustained concurrent
load, host failover, external log retention, alert delivery and actual supervisor
drain remain deployment checks. Documentation and local tests do not mark those
items complete.
