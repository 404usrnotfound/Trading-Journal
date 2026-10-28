# Safe diagnostics and support evidence

Reviewed **26 October 2026** against Checkpoint 3 `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2`; application baseline `5132900a03efabaeb307787531546987228220e7`. Use this guide to locate a failing layer before changing configuration or financial history. Issue-specific remedies are in the [knowledge base](README.md); executed scope is in [verification](verification.md).

## Preconditions and command effects

Commands below use Bash/POSIX shell syntax from the **repository root**, with Node 24.19.0, the pinned pnpm 10.34.6 and installed source dependencies. Substitute your reviewed application origin/listener when a configured port differs. A source-reviewed command is not certification of your operating system, proxy, supervisor or deployment. [System requirements](../getting-started/system-requirements.md) and [configuration](../getting-started/configuration.md) remain authoritative.

Unless marked otherwise, probes read local files, process configuration or service state without changing schema or financial records. HTTP probes may produce ordinary access/security logs; an authenticated request can refresh authentication state. Running `curl`, Docker or PostgreSQL tooling requires its existing authorized host/network access. Keep production web/worker/database listeners private behind the supported edge.

| Action                                                       | Source / effects                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git/runtime version checks                                   | Installed Git/Node/Corepack commands and [version pins](../../package.json); no application writes.                                                                                                              |
| `docker compose ps`, logs and `pg_isready`                   | [Database-only Compose services](../../compose.yaml); status/log reads, no schema changes. Confirm the intended daemon/project first.                                                                            |
| Web/worker health GETs                                       | [Web live](../../apps/web/src/app/api/v1/health/live/route.ts), [web ready](../../apps/web/src/app/api/v1/health/ready/route.ts), [worker](../../apps/worker/src/index.ts); no financial writes.                 |
| Configuration-name probe                                     | [Environment loader](../../scripts/environment.ts), [server parser](../../packages/server/src/config.ts), [worker parser](../../apps/worker/src/config.ts); reads bindings and prints validity/field names only. |
| `corepack pnpm db:check`                                     | [Database checker](../../scripts/database-check.ts); read-only app-role query/schema/major check.                                                                                                                |
| Migration-state probe                                        | [Reviewed migration reader](../../packages/database/src/migrate.ts) plus read-only catalog/history queries; requires authorized operator access. Does not run migrations or provision roles.                     |
| `corepack pnpm db:migrate`                                   | **State-changing**, operator-only application/queue migration and runtime-role provisioning. Use the [migration issue guide](database-and-migrations.md), release procedure and backup first.                    |
| `corepack pnpm db:migrate:check` / integration/browser tests | **State-changing**, only for explicitly disposable isolated test databases. Never a production readiness probe.                                                                                                  |
| `corepack pnpm ops:preflight`                                | An operator deployment check that can create/remove its own private storage probe objects; not wholly read-only. Use the existing [deployment guide](../deployment.md), not a speculative incident run.          |

## Establish release and configuration context

From the repository root:

```bash
git status --short --branch
git rev-parse HEAD
node --version
corepack pnpm --version
```

Expected runtime pins are Node `v24.19.0` and pnpm `10.34.6`. Record the real commit and whether local edits exist; preserve those edits. A clean Git tree does not prove configuration, installed dependencies, database history or private media are healthy. Corepack may need its existing writable cache/network; a version invocation can populate its tool cache, not application data.

Do not print `.env`, `env`, `printenv`, `docker inspect` environment blocks, expanded Compose configuration, process argument/environment dumps or credential-bearing URLs for a support report. Confirm presence/validity using the following field-only probe instead. It uses the same repository `.env` loader as the scripts: already-set process bindings take precedence. Run it in the intended service environment; do not invent production bindings to force a pass.

```bash
node --import tsx --input-type=module <<'JS'
import { loadEnvironment } from './scripts/environment.ts';
import { parseServerConfig } from './packages/server/src/config.ts';
import { readWorkerConfiguration } from './apps/worker/src/config.ts';
loadEnvironment();
for (const [service, parse] of [
  ['web', parseServerConfig],
  ['worker', readWorkerConfiguration],
]) {
  try {
    parse(process.env);
    console.log(JSON.stringify({ service, configuration: 'valid' }));
  } catch (error) {
    const fields = Array.isArray(error?.fields)
      ? error.fields.filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name))
      : [];
    console.log(JSON.stringify({ service, configuration: 'invalid', fields }));
    process.exitCode = 1;
  }
}
JS
```

Exit 0 means both parsers accepted the bindings. Exit 1 identifies invalid field names without their values. This checks syntax/policy only: it does not connect to PostgreSQL, establish least privilege, test media ownership/durability, provision TLS or verify secrets against database roles. A filtered worker-only production environment is expected to lack web bindings; evaluate the service you actually configured rather than adding unrelated secrets. Restart affected services after a reviewed configuration change; the running process caches configuration and owns existing pools/listeners.

## Inspect service status

For the local **database-only** Compose installation, first confirm that Docker targets the intended local daemon and the generated `.env` selects the intended project. Then run:

```bash
docker compose ps --all
docker compose exec -T postgres pg_isready -U postgres -d trading_journal
```

`postgres` should be running/healthy and `pg_isready` should report that it accepts connections. This does **not** prove the application password, role permissions or schema. `postgres-test` is a separate disposable test service; its tmpfs data is not durable. There is no Compose web/worker service in this repository. Do not target another daemon or initialize/delete a volume to make status look healthy.

For full-source `dev`/`start`, inspect the terminal or your actual supervisor's process state and both output streams. The repository supplies no installed systemd/launchd unit or universal `journalctl` command. The combined launcher stops its other managed child if one child exits; inspect the first child failure rather than assuming two independent outages. Production supervision must use the site's existing reviewed service configuration.

### Probe web liveness and readiness separately

For the default local origin, these are read-only GETs:

```bash
curl --fail-with-body --silent --show-error --max-time 10 http://localhost:3000/api/v1/health/live
curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}\n' http://localhost:3000/api/v1/health/ready
```

Liveness returns HTTP 200 with `{"status":"ok","service":"web"}` when the handler answers. It does not access the database, authentication, queue or media. Anonymous readiness normally returns **401** when authentication is functioning. That demonstrates the authentication boundary, not successful readiness. An auth dependency failure can return **503** instead. Do not put a password/cookie/token in a copyable command or share a captured credential jar.

To inspect authenticated readiness, sign in through the normal UI, remain on the correct trusted origin, and run this read-only snippet in that page's browser console if your organization's support policy allows console use:

```javascript
fetch('/api/v1/health/ready', { credentials: 'same-origin', cache: 'no-store' })
  .then(async (response) => ({
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    body: await response.json(),
  }))
  .then(console.log);
```

Expected success is HTTP 200 with `status: ready`, `database: connected`, `schema: current`. The implementation checks application schema **17**, PostgreSQL major **17**, and an auth-role query. A 503 `NOT_READY` with detail `The service is not ready.` intentionally omits raw database diagnostics. A 401 requires an authorized session, not disabling the guard. Readiness does not validate every role privilege, media object, financial result or background snapshot; inspect the relevant layer next. Source: `verifyReadiness` in [services](../../packages/server/src/services.ts).

### Probe the private worker

From the host authorized to access the configured private listener, default port 3101:

```bash
curl --fail-with-body --silent --show-error --max-time 10 http://127.0.0.1:3101/health/live
curl --fail-with-body --silent --show-error --max-time 10 http://127.0.0.1:3101/health/ready
```

Both return `{"status":"ok"}` with HTTP 200 in the ready state. A worker readiness 503 returns `{"status":"unavailable"}`; connection refusal is distinct from that response. The listener begins only after startup/initial queue round-trip checks. Subsequent readiness reflects the latest periodic infrastructure probe, so failure/recovery can lag the underlying database event. It is not proof that every native outbox item is current or that asynchronous bulk reporting exists. Follow [worker/snapshot troubleshooting](analytics-and-performance.md) for its actual API boundary. Never expose this listener publicly to simplify monitoring.

## Inspect application logs

Application/worker Pino JSON is emitted to **standard output**; handled idle PostgreSQL connection failures emit the fixed event `database.idle-connection-failed` on **standard error**. Next/launcher/tool failures can also use stderr. Collect both streams from the terminal or actual site supervisor. No repository-managed `logs/application.log`, log directory, shipping pipeline or rotation service exists. A file under ignored `work/` in a verification record is a private rehearsal artifact, not a production log location.

For local database container logs only:

```bash
docker compose logs --no-color --since 15m --tail 100 postgres
```

Inspect the output privately. PostgreSQL logs can contain identities, statement/error context and operational addresses. Share only a reviewed minimal classification and timing. Do not enable SQL parameter/full-statement logging as a routine financial incident diagnostic.

| Existing safe event                                                                    | What to correlate                                                                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `web.request.failed`                                                                   | Operation, HTTP status/code and request ID. Expected 4xx rejection and unexpected 5xx failure have different causes.             |
| `database.idle-connection-failed`                                                      | Database/network availability. The failed idle client is removed; this does not prove an active transaction succeeded or failed. |
| `worker.starting`, `worker.ready`                                                      | Startup and the initial queue round trip.                                                                                        |
| `worker.heartbeat`, `worker.heartbeat.failed`                                          | Latest periodic queue probe outcome.                                                                                             |
| `worker.queue.error`, `worker.queue.warning`, `worker.outbox.dispatch.failed`          | Queue/connectivity versus native outbox dispatch; do not dump job payloads.                                                      |
| `worker.stopping`, `worker.stopped`, `worker.shutdown.failed`, `worker.startup.failed` | Planned drain versus incomplete startup/shutdown.                                                                                |

Failure problem responses include `requestId` in JSON and the matching `x-request-id` header. Record those with status/code and a timestamp/offset, then correlate the same ID in `web.request.failed`. Successful requests do not have a universal access/duration log. Absence of a log is not proof an operation did not commit. Source: [API failure handler](../../apps/web/src/lib/api-response.ts), [problem serializer](../../packages/server/src/errors.ts), [logger](../../packages/server/src/logging.ts), [database factory](../../packages/database/src/index.ts), [worker](../../apps/worker/src/index.ts).

The structured logger allowlists fields and classifies errors without raw messages/stacks; it redacts credential/body paths. This is not a general sanitizer for arbitrary free-text Pino messages, framework output, external tools, broker files or screenshots. Actor/workspace/job/request IDs can still identify activity and need restricted handling. Raising `LOG_LEVEL` does not create missing telemetry or justify logging private payloads.

## Verify database connectivity

From the configured source checkout with the intended app runtime identity:

```bash
corepack pnpm db:check
```

Expected success: `Runtime application role connects successfully; database schema is current.` The script performs `SELECT 1`, reads the schema marker and checks the PostgreSQL major. Typical sanitized failures include `Database readiness failed (ECONNREFUSED). Check the documented configuration and database readiness.` and a driver code such as `28P01` for an authentication rejection. A code narrows the layer; it does not prove one specific password/configuration cause. See [database troubleshooting](database-and-migrations.md).

This uses `DATABASE_URL`; it is not a web auth-role, worker queue-role, migration hash or attachment-access check. A direct tenant-table query outside the application's authorized transaction can be denied/empty under RLS even when the UI works. Never disable RLS, grant superuser/BYPASSRLS or replace runtime bindings with operator credentials to force a successful incident check.

## Inspect migration state

`db:check` confirms a schema marker, not exact applied-file history. The read-only probe below uses an **authorized migration/operator binding** already selected through the site's secret mechanism or local generated `.env`. It opens a repeatable-read, read-only transaction, compares applied hashes/timestamps with the checkout's reviewed files, and prints only schema/count/compatibility facts. It never calls the migration runner, provisions a role, lists tenant data or prints the URL.

```bash
node --import tsx --input-type=module <<'JS'
import { createRequire } from 'node:module';
const { Pool } = createRequire(new URL('./packages/database/package.json', import.meta.url))('pg');
import { loadEnvironment, required } from './scripts/environment.ts';
import { migrationsFolder, readMigrationFiles } from './packages/database/src/migrate.ts';
loadEnvironment();
let pool, client;
try {
  pool = new Pool({ connectionString: required('MIGRATION_DATABASE_URL'), max: 1,
    connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const present = await client.query("SELECT to_regclass('migrations.__drizzle_migrations') IS NOT NULL AS present");
  const applied = present.rows[0].present
    ? (await client.query('SELECT hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at, id')).rows
    : [];
  const reviewed = readMigrationFiles({ migrationsFolder });
  const exactPrefix = applied.length <= reviewed.length && applied.every((row, index) =>
    row.hash === reviewed[index].hash && String(row.created_at) === String(reviewed[index].folderMillis));
  const metadata = await client.query("SELECT to_regclass('app.schema_metadata') IS NOT NULL AS present");
  const schema = metadata.rows[0].present
    ? (await client.query('SELECT version FROM app.schema_metadata WHERE singleton = true')).rows[0]?.version ?? null
    : null;
  console.log(JSON.stringify({ schema, appliedCount: applied.length,
    reviewedCount: reviewed.length, exactPrefix, allReviewedApplied: exactPrefix && applied.length === reviewed.length }));
  await client.query('COMMIT');
} catch (error) {
  await client?.query('ROLLBACK').catch(() => undefined);
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
    ? error.code : 'ERROR';
  console.error(JSON.stringify({ operation: 'migration-state-read', status: 'failed', code }));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
JS
```

For this baseline expect schema 17, applied/reviewed counts 17, `exactPrefix: true` and `allReviewedApplied: true`. A valid shorter prefix identifies pending application files; false prefix indicates drift/incompatibility requiring operator investigation. **Exit 0 means the inspection ran, not that every printed compatibility flag passed.** Compare all fields. This probe does not check queue schema/role provisioning, exact permissions, all database objects or transactional financial correctness. It is diagnostic source code in this guide, not a newly added application command/API.

If the operator binding is unavailable, do not extract another person's secret or use runtime credentials to evade grants. Escalate the read to the authorized operator. On a production deployment keep migration credentials out of long-running web/worker environments. Apply reviewed migrations only through the [supported migration resolution](database-and-migrations.md); never edit journal hashes/metadata to match this output. Existing [deployment](../deployment.md) and [backup/recovery](../backup-and-recovery.md) own release/restore procedures.

## Inspect import validation and uncertain writes

Use **Imports** in the selected workspace. Retain the import batch, mapping/version, adapter/layout, namespace, timestamp/decimal conventions, account/instrument/currency identities and the problem's row/group references. Inspect staging, selected dependency groups, **Validate selected groups**, warnings/acknowledgements, preview and history before posting again. Follow [imports troubleshooting](imports-and-duplicates.md) for exact error classes and [the manual](../user-guide/imports-and-exports.md) for the actual controls.

Distinguish file parse/mapping failure from financial validation, duplicate classification, cash reconciliation variance, a stale preview, and an interrupted commit response. Compare the persisted source identity/history first. Do not change IDs/namespaces to bypass duplicate detection, split a dependency group to skip a validation error, or modify source rows to create an artificial match. Establish the persisted result before another submission. Exact retained-command retries apply only where the workflow supports them; Imports generates a fresh key for each mutation, so another submission can be a distinct operation.

An operational log is not a replacement for the authorized private import source/history. Do not attach the raw broker file, JSON source envelope or private mapping references to a public report. Use a minimal fictional row preserving the failing shape/units/timezone/identity relationship; do not reuse actual account numbers or trades.

## Verify account and position reconciliation

1. Confirm workspace, paper/live environment, accounts or exact portfolio version, date/as-of boundary and timezone. Compare the same source revision, currencies and observation policy. A current report and a pinned historical one may intentionally differ.
2. Read native cash by bucket/currency and effective executions before reporting translation. An order creates no cash or holdings; allocation changes campaign attribution rather than posting another execution.
3. Compare entered/exited/open quantities and source allocations. Distinguish instrument/account inventory from a campaign leg, and a flat position from an explicitly closed campaign. Check costs, lot policy and unknown opening basis rather than deriving basis from a display price.
4. Check price/FX eligibility, corrections, missing/stale sources and supplied residual exclusions. Actual conversion posts cash; reporting FX does not. Preserve availability reasons and known subtotals.
5. In **Accounts**, apply the exact report context and inspect opening/closing equity, capital, performance/explained components and variance. Compare **Reconciliation** with a genuinely independent statement of declared scope. A zero internal bridge variance is not evidence that the broker statement is complete or agrees.
6. In **Trade journal** and **Dashboard**, compare campaign attribution/closure/sample membership and gross/net/fees/original risk separately from the account bridge. Use the [financial guide](financial-discrepancies.md), [analytics guide](analytics-and-performance.md) and canonical [financial concepts](../reference/financial-concepts.md) for the correct definitions.

These are read-only investigation steps. Recording a missing observation, correcting a source, changing attribution, reversing an eligible event or accepting a statement is **state-changing** and uses the documented guarded UI/API path. Preserve the pre-correction report context and source evidence; never repair the ledger through direct SQL. Ask for authorized integration assistance where the manual marks an API-only operation rather than searching for an invented browser button.

## Collect a sanitized diagnostic report

Create a new restricted report manually; there is no delivered one-click support-bundle exporter. Start from this template and omit fields unnecessary for the issue:

```text
Observed at (date/time with timezone):
Application commit and local-change state:
Node / pnpm / PostgreSQL / browser versions relevant to the issue:
Installation method and service topology (no credential-bearing endpoints):
Route and visible action:
Expected result / actual result:
HTTP status, application code, safe availability reason:
Request ID and matching safe log event/time:
Workspace/account aliases and paper/live environment:
Economic interval, timezone, reporting currency and policy aliases:
Source/accounting revision and calculation version, when relevant:
Read-only checks performed and sanitized results:
Whether a write may have committed; retained command/result status:
Small fictional reproduction and independent expected values:
Supported correction attempted, its scope and verification:
What remains unresolved:
```

Keep request/workspace/actor/job/source identifiers in a restricted annex only when correlation needs them; public reports should use stable fictional aliases. Preserve equality/group relationships when replacing IDs, decimal strings, currencies, units, precision, offsets and ordering needed to explain the failure. Redacting one amount while leaving other identifying economics may still expose private activity.

**Never include:** `.env` or full environment/process dumps; passwords/database URL userinfo/auth secrets; cookies/Set-Cookie/Authorization/CSRF tokens/session state; raw SQL parameters/connection errors/stacks without review; real broker identifiers/statements/CSV/source rows; notes/journal content; attachments, portable archives, database/media backups; raw HAR, Playwright traces, browser storage or unreviewed screenshots. Those artifacts can contain credentials and private financial records even when a nearby Pino event is safe. Retain originals only under approved restricted access; share a small reviewed derivative. No automatic logger redaction makes an arbitrary diagnostic bundle safe.

## Evidence and limits

The [verification record](verification.md) identifies freshly exercised configuration, migration, database, health/security, import, financial and restore cases and the commands actually run. Default-port examples above are source-reviewed; fresh runtime probes used isolated nondefault ports. Host supervision, external log routing/retention, actual production TLS/recovery, capacity incidents, every browser/OS and every resolution branch remain separately unverified. Do not infer an operational guarantee from a passing local probe.
