# Operations

This runbook covers the current Next.js web process, pg-boss infrastructure worker,
PostgreSQL 17 and private local attachment storage. Use [deployment](deployment.md)
for release preparation and [backup and recovery](backup-and-recovery.md) for
recovery. The [production-readiness checklist](production-readiness-checklist.md)
separates local verification from deployment obligations. No public deployment,
live provider connection or production alert destination was configured in Phase 16.

## Service ownership and daily checks

Run web and worker from the same reviewed release under a supervisor. Keep the
database and worker health port private. Run the web process behind the HTTPS
reverse proxy described in the deployment runbook; direct Internet access to its
Node listener is outside this topology. Use an unprivileged service account with
read access to release files and write access to the private media directory,
explicitly allocated temporary storage and the launcher-owned standalone asset/cache
locations described in the deployment guide. Monitor that directory's filesystem
and inode space independently of the application.

At each release and daily thereafter, check authenticated web readiness, private
worker readiness, recent successful worker heartbeats, database connection use,
disk/inode capacity, backup age and a known attachment's authorized retrieval.
Treat stale backups, missing media and integrity failures as incidents even when
both processes are alive. Daily cadence is an operator recommendation; no scheduler
or external monitoring integration is supplied by this repository.

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

| Probe                                    | Authentication and exposure                                    | Healthy result                                                        | What it establishes                                                                               |
| ---------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`                | Public, through the normal web origin                          | `200`, `{"status":"ok","service":"web"}`                              | The web handler can answer. It does not access the database, queue or media.                      |
| `GET /api/v1/health/ready`               | Existing authenticated session; keep probe credentials private | `200`, `{"status":"ready","database":"connected","schema":"current"}` | Tenant database schema version 9, PostgreSQL major version 17 and an auth-database query succeed. |
| `GET http://127.0.0.1:3101/health/live`  | Private worker listener; port/host configurable                | `200`, `{"status":"ok"}`                                              | Worker process is not shutting down.                                                              |
| `GET http://127.0.0.1:3101/health/ready` | Same private listener                                          | `200`, `{"status":"ok"}`                                              | Most recent worker queue probe completed and shutdown has not begun.                              |

All health responses disable caching. Anonymous web readiness receives `401` when
authentication is available. An authentication database exception or authenticated
schema/database failure receives a safe `503 NOT_READY` problem with a generated
request ID. Explicit authentication `401`/`403` rejections retain their status.
Readiness never discloses connection strings, SQL or database exception text.
Web liveness remains independent of those failures.

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

```sh
corepack pnpm start:web
corepack pnpm start:worker
```

The documented launchers filter the child environment: web receives declared
runtime bindings; worker receives queue/health/log bindings. Migration, bootstrap,
test and unrelated provider credentials do not pass to either child. A direct
`node apps/worker/dist/index.js` invocation must be given an equivalently scoped
environment by the supervisor. Do not inject the operator's complete environment
into a container/service just because the launcher would otherwise filter it.

For a planned stop, remove web traffic and send `SIGTERM` to the owned service
process. Worker signal handlers are installed before connecting to PostgreSQL.
Shutdown clears readiness, cancels new heartbeat probes, aborts probe polling and
asks pg-boss to stop fetching and drain active handlers with a 10-second grace.
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

pg-boss retry settings apply only to the infrastructure probe: two retries, initial
one-second exponential backoff and 30-second job expiry. No financial posting
depends on that probe. Database mutations commit atomically with their command,
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
and use the proposed initial 14-day retention policy from ADR 0008, subject to
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

| Event                                                         | Initial response                                                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web.request.failed`                                          | Correlate the safe `operation`, status/code and request ID with the caller's problem response. `4xx` rejection volume and `5xx` failures have different causes. |
| `database.idle-connection-failed`                             | Inspect database/network availability and connection counts. The failed idle client is removed; a later query can reconnect. Active query errors still reject.  |
| `worker.starting`, `worker.ready`                             | Confirm release startup and successful initial queue round trip.                                                                                                |
| `worker.heartbeat`, `worker.heartbeat.failed`                 | A success or failure of the periodic infrastructure probe. Check private readiness and PostgreSQL.                                                              |
| `worker.queue.error`, `worker.queue.warning`                  | Inspect queue/database health using privileged diagnostics without printing raw job payloads or credential-bearing errors.                                      |
| `worker.stopping`, `worker.stopped`, `worker.shutdown.failed` | Confirm planned drain or investigate an incomplete stop.                                                                                                        |
| `worker.startup.failed`                                       | Check validated field names, compatible queue migrations and private connectivity. Restart only after the cause is understood.                                  |

HTTP problem responses carry the generated `x-request-id` and matching JSON
`requestId`, which is also present in the safe failure log. Successful requests
do not currently have a universal access log or duration metric. React commits,
browser timings and SQL instrumentation in `scripts/performance` are benchmark
tools, not a production telemetry pipeline. Financial audit records remain
authorization-controlled database facts; operational log retention must not be
used as a substitute for financial source/audit retention.

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

Inspect aggregate statistics through a restricted operator/monitoring connection,
without selecting SQL text, job `data`/`output` or financial payloads:

```sql
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
```

These views require deployment-specific monitoring permissions; runtime tenant
credentials intentionally cannot inspect the queue. The current queue contains
infrastructure probes rather than business jobs, so its oldest row is not business
processing lag. Do not expose instance host/process/config details over public HTTP.
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

Phase 16 verification is recorded in the production-readiness checklist. Targeted
runtime regression tests live in `tests/unit/readiness-route.test.ts`,
`tests/unit/production-readiness.test.ts` and
`tests/integration/worker-lifecycle.test.ts`. They exercise protected readiness
classification, safe diagnostics, optional standalone assets, probe cancellation,
and owned worker process shutdown during startup and after readiness.

Production TLS/proxy failure drills, storage-full alerts, sustained concurrent
load, host failover, external log retention, alert delivery and actual supervisor
drain remain deployment checks. Documentation and local tests do not mark those
items complete.
