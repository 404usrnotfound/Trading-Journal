# Database connectivity and migrations

Reviewed **26 October 2026** against Checkpoint 3 `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2`, with unchanged application baseline `5132900a03efabaeb307787531546987228220e7`. This guide is for the installation operator. An ordinary user should collect the safe evidence below and involve that operator rather than request an administrator database password.

The supported database is **PostgreSQL 17** and this release's application schema is **17**, from migrations `0000`–`0016`. The [configuration reference](../getting-started/configuration.md) owns connection bindings, precedence and restart requirements; [installation](../getting-started/installation.md) owns the setup sequence. The metadata inspection in diagnostics does not read authoritative ledger contents. Read [diagnostics](diagnostics.md) before sharing output and [verification](verification.md) for fresh reproduction results.

## Select the right diagnostic

Run package and Compose commands from the **repository root**, with the intended private `.env`, supported Node/pnpm dependencies and access to the intended local Docker daemon. Existing process environment values override `.env`. Confirm the non-secret project/host/port/database names privately; never print connection URLs or passwords to compare them.

| Check                                                                       | What it establishes                                                                                                        | Effects and verification scope                                                                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose ps`                                                         | The selected Compose project's container state and published ports.                                                        | Read-only inspection; local Compose only. Does not authenticate the application role.                                                                                               |
| `docker compose exec -T postgres pg_isready -U postgres -d trading_journal` | The repository's local PostgreSQL service is accepting connections, using the same check as [Compose](../../compose.yaml). | Read-only availability probe; does not establish password validity, migrations or runtime role access. External PostgreSQL needs its own approved monitoring connection.            |
| `corepack pnpm db:check`                                                    | A `DATABASE_URL` query succeeds, application schema metadata is 17, and PostgreSQL major is 17.                            | Read-only database check; [implementation](../../scripts/database-check.ts). Does not validate auth/worker credentials, media, every permission, or exact migration journal hashes. |
| Metadata inspection in [diagnostics](diagnostics.md)                        | Current application schema and migration-journal summary, through an existing approved operator connection.                | Read-only queries. Application runtime roles are intentionally not general operator accounts.                                                                                       |
| `corepack pnpm db:migrate`                                                  | Applies reviewed application/queue migrations and provisions restricted runtime roles using operator configuration.        | **Modifies state:** schema, queue definitions, runtime role passwords/grants. Use only as the planned release/install action described below.                                       |
| `corepack pnpm db:migrate:check`                                            | Applies migrations twice and verifies the configured isolated test database.                                               | **Modifies state:** this is not a production migration-status check. It requires the guarded, disposable `TEST_*` database bindings.                                                |

The command availability and metadata SQL are **Source-reviewed**; execution status for this checkpoint is in [verification](verification.md). Earlier successful installation checks remain [historical evidence](../getting-started/verification.md). A successful health container is not a successful application login.

[Diagnostics](diagnostics.md) owns the exact read-only metadata probes, using the generated local operator binding or an approved deployment-specific operator binding. Expected current values are server version `170000`–`179999`, schema version `17`, and **17 migration rows**. A row count does not verify hashes/order or prove that an arbitrary database has the correct objects. Before first migration, missing metadata relations are expected; preserve the error classification and follow the installation sequence. Runtime application credentials are not general database-administrator credentials.

## Database check fails or the database intermittently disconnects

**Problem:** The application cannot obtain or retain a connection to its intended database.

**Symptoms:** `db:check` fails; authenticated readiness is unavailable; or a private process log contains the exact event `database.idle-connection-failed`. The tool deliberately prints `Database readiness failed (<code>). Check the documented configuration and database readiness.` with a driver code or `ERROR`, not the underlying credential-bearing exception. The idle-connection event has no diagnostic URL or exception payload.

**Possible causes:** The PostgreSQL container is stopped/unready, a URL points at the wrong host or published port, the database restarted, private network/TLS access failed, connection capacity is exhausted, or the process inherited an old binding. The database pool has a five-second connection timeout and ten-second statement timeout; these bounds do not identify the cause by themselves.

**Diagnosis:**

1. Inspect `docker compose ps` for the intended local project, then run its `pg_isready` check above. On an external service use the deployment's approved private status check.
2. Run `corepack pnpm db:check`. Keep its operation/code/time and exit status; do not replace the sanitized output with a raw URL or exception dump.
3. Privately compare the configured non-secret target with the service's actual host/port/database. Account for inherited environment precedence and distinguish database port 5432 from the default local test port 5433.
4. Check [service status and logs](diagnostics.md). A one-time idle failure followed by successful queries differs from repeated active failures. For connection pressure, use [analytics and performance](analytics-and-performance.md); do not expose SQL text from `pg_stat_activity`.

**Resolution:**

1. Restore the intended dependency/network path. If the already configured local Compose services are stopped, follow the existing [service startup](../getting-started/installation.md) procedure; starting services changes process state but does not require resetting their data.
2. Correct an incorrect private binding deliberately, retaining the established credentials. Restart the affected web/worker processes so their cached pools receive the correction.
3. If PostgreSQL is available but authentication fails, follow the role issue below. If schema verification fails, follow the migration issue. Investigate persistent capacity/TLS failures with the database operator.

**Verification:** `db:check` prints `Runtime application role connects successfully; database schema is current.` and exits 0. Then separately check authenticated web readiness and worker readiness, and perform the authorized read that originally failed. The pool removes failed idle clients; a later query can reconnect, but the event alone does not prove recovery.

**Escalation:** Collect release SHA, timestamp/timezone, affected process, sanitized tool code, container status, recurrence counts and the pass/fail results of each independent health check. Exclude database URLs, passwords, SQL payloads, financial records and `.env`.

## PostgreSQL is healthy but a runtime role cannot connect or access its own service

**Problem:** PostgreSQL availability succeeds while application, authentication or queue access fails.

**Symptoms:** A runtime service fails after dependency startup, login/readiness fails while `db:check` succeeds, or the operator tool reports `Runtime role provisioning failed; check operator configuration` internally. The `db:migrate` CLI itself reports only the sanitized `Migration failed (<code>). Check the documented configuration and database readiness.`

**Possible causes:** Migrations/provisioning were not completed; credentials were regenerated independently from an existing database; `DATABASE_URL`, `AUTH_DATABASE_URL` or `JOB_DATABASE_URL` uses the wrong role/instance; or a role's grants/membership were altered. Generating `.env` does not rotate an existing database password. Web `db:check` tests only `journal_app`, not `journal_auth` or `journal_jobs`.

**Diagnosis:** Privately verify the expected identity of each binding against [configuration](../getting-started/configuration.md): application `journal_app`, authentication `journal_auth`, queue `journal_jobs`, all targeting the intended application database. Confirm whether the complete one-shot migration/provisioning command succeeded. Use the existing [production preflight](../production-readiness-checklist.md) for its reviewed role/membership/TLS checks; a TCP probe is insufficient. Production preflight codes such as `RUNTIME_ROLE_UNSAFE` identify a failed boundary, not permission to remove the boundary.

**Resolution:**

1. Recover the installation's correct private configuration rather than generating replacements as a diagnostic experiment.
2. Before any role repair, retain a verified coordinated [database/media backup](../backup-and-recovery.md) and record the intended target/release privately. Serialize the complete operator migration/provisioning command; ensure dependent processes will be restarted consistently.
3. An authorized operator may apply `corepack pnpm db:migrate` only after reviewing its target and existing migration history. It applies migrations and resets the three runtime role passwords/grants to configured values; it is not a harmless password probe. Unknown grants/membership changes need investigation rather than ad hoc SQL repairs.
4. Restart the affected services with the matching private configuration. Never substitute an administrator URL, grant superuser/BYPASSRLS or merge the runtime roles to conceal an access error.

**Verification:** Check application connectivity, authenticated readiness, login and worker readiness independently. The migration success message is `Database and queue migrations applied; least-privilege runtime roles provisioned.` The relevant authorized workflow must succeed while unrelated workspace access remains denied.

**Escalation:** Provide safe process/error codes, which binding name failed, role names, whether provisioning completed, and any recent release/secret-management changes. Do not share actual secrets, role password statements, auth tables, sessions or queue payloads.

## PostgreSQL major version is unsupported

**Problem:** The configured server is outside the release's PostgreSQL 17 compatibility boundary.

**Symptoms:** Migration or readiness fails even though PostgreSQL accepts connections. The internal check throws `The supported database is PostgreSQL 17`; the database/migration CLI emits its sanitized operation failure instead of that exception text.

**Possible causes:** An external service defaults to another major version, the target binding selects a different server, or the database was upgraded independently from this release. A newer PostgreSQL version is not automatically a compatible replacement.

**Diagnosis:** An authorized operator uses the read-only server-version inspection in [diagnostics](diagnostics.md). Compare its value with the permitted range `170000`–`179999` and the actual target selected by the private binding. The [Compose image](../../compose.yaml) pins PostgreSQL 17; a running container from another project does not establish the target's version.

**Resolution:**

1. Confirm the approved database/application pair and stop the incomplete rollout from accepting writes.
2. If a binding is wrong, correct it to the intended already-provisioned PostgreSQL 17 target and restart affected processes.
3. If the actual database must be moved, retain a verified coordinated backup and require an operator-reviewed migration/recovery plan rehearsed on a separate target. Do not replace a container image against an existing data directory or assume a downgrade is safe. This repository does not provide a generic cross-major migration procedure.

**Verification:** The intended target reports PostgreSQL 17, application schema 17 passes `db:check`, and authenticated web/worker workflows pass after the planned change. A server-version fix does not by itself certify data migration or restore correctness.

**Escalation:** Collect release SHA, server major/minor, deployment type, schema version and sanitized failure code. Keep topology, backups and actual connection bindings in restricted operator channels.

## A new release reports an incompatible or missing application schema

**Problem:** The application release and database schema do not match.

**Symptoms:** The database connection succeeds but readiness or `db:check` fails. The internal readiness error is `Database schema version is incompatible with this release`; tools expose the sanitized failure described above. A completely unmigrated database can instead fail because the metadata relation does not exist. Existing Phase 16 operational prose mentioning schema 9 is historical; this release requires schema 17.

**Possible causes:** The database is new; one-shot migrations were skipped/failed; code and database were upgraded separately; the runtime points to another instance; or a rollback used code incompatible with the already applied schema.

**Diagnosis:** Compare release SHA and target privately. Use the metadata inspection in [diagnostics](diagnostics.md) if permitted. Review the migration command's last outcome and the [reviewed journal](../../packages/database/migrations/meta/_journal.json); published migrations `0000`–`0008` remain unchanged and later migrations are additive. Do not infer currency/account/trade data is missing merely because readiness failed.

**Resolution:**

1. Confirm the intended code/database pair and stop the incomplete rollout from receiving new traffic.
2. For a newly created empty installation, follow the exact [initial migration sequence](../getting-started/installation.md). For an existing database, first retain a verified coordinated backup and review release/schema compatibility.
3. Serialize the reviewed `corepack pnpm db:migrate` action under operator control. This changes application/queue schema and runtime roles; preserve any failure and investigate its code before retrying.
4. If the database is ahead of the selected code, restore compatible code or follow the reviewed recovery plan. Do not edit `app.schema_metadata`, drop tables or remove migration rows to make the version appear compatible.

**Verification:** Metadata is schema 17, `db:check` succeeds, the complete migration command succeeds and authenticated application/worker checks pass. Verify representative existing records after an upgrade. A schema integer alone is not hash/order validation.

**Escalation:** Collect before/after release IDs, schema version, migration row count, sanitized operation/code and whether writes were enabled during the failed rollout. Exclude financial contents and credentials.

## Migration history differs from the reviewed release

**Problem:** Applied migration history is not an exact prefix of the reviewed files.

**Symptoms:** The migration tool fails; its internal guard is `Applied migration history differs from the reviewed migration files`. The CLI may show only `Migration failed (ERROR). Check the documented configuration and database readiness.` A separate `db:check` can still pass because metadata version and journal integrity are different checks.

**Possible causes:** Changed SQL in an already published migration, an unreviewed release, a missing/duplicate/unknown journal row, a manually altered hash/time, or the wrong database/release pair. A gap is dangerous because the underlying migrator advances by journal time; the prefix guard prevents silently skipping earlier work.

**Diagnosis:** Preserve the failing release and a backup. Compare the checked-out [migration files and journal](../../packages/database/migrations/meta/_journal.json) with the approved release. An authorized operator can inspect migration hashes/timestamps in its private session and compare them to `readMigrationFiles` in the [migration runner](../../packages/database/src/migrate.ts). Row count and current schema version alone cannot establish equality.

**Resolution:**

1. Stop further deployment/migration attempts against the uncertain target and preserve safe evidence.
2. Establish whether the wrong code or wrong target was selected. Restore the approved, unchanged release files when that is the cause.
3. If history was modified or the database's provenance is uncertain, escalate for reviewed repair/recovery from a verified coordinated backup. Rehearse on a separate target before re-enabling writes. This guide does not provide a generic SQL journal repair.

**Verification:** The reviewed migrator accepts the history, applies only the intended pending work, and subsequent `db:check`, authenticated readiness and representative existing-data checks pass. The [database integration tests](../../tests/integration/database.test.ts) historically verify rejection of changed/missing/duplicate/unknown history before mutation; this is not permission to reproduce journal tampering on user data.

**Escalation:** Provide release SHA, affected migration filenames, count/order observations and sanitized failure code. Keep the database backup and detailed history in the operator's restricted incident store; never post a database dump publicly.

## A migration waits, times out or fails during an upgrade

**Problem:** The complete migration command did not finish successfully.

**Symptoms:** No success message, a nonzero exit, or a sanitized migration failure code. A failure may occur during application migrations, queue migration or role provisioning; completion of one stage does not establish completion of all stages.

**Possible causes:** Concurrent release/recovery jobs, an application-migration advisory-lock wait exceeding its 30-second `lock_timeout`, PostgreSQL resource/connectivity problems, insufficient operator privileges, or an existing row that violates a new constraint. The [integration tests](../../tests/integration/database.test.ts) include an invalid historical UUID upgrade that rolls back rather than rewriting the identifier.

**Diagnosis:** Preserve time window and code. Confirm only one complete release/migration procedure is active. The application migration uses advisory lock `1791244800`; it releases that lock before queue migration and role provisioning, so operators must serialize the entire command. Use aggregate monitoring from [diagnostics](diagnostics.md), not queries exposing other users' SQL or raw financial payloads. Do not infer that every stage was rolled back simply because the overall command failed.

**Resolution:**

1. Pause overlapping deployment/recovery work and restore dependency health. Do not terminate unidentified database sessions or remove lock safeguards.
2. Check target/release/history and preserve a verified coordinated backup before an upgrade retry or recovery action.
3. If the cause is a transient connection/lock condition, the operator can rerun the same reviewed migration command after that cause is removed. Published application migrations are designed to be repeatable; queue and provisioning outcomes still need verification.
4. If the failure identifies historical data/constraint incompatibility or an uncertain partial release, escalate for a reviewed migration/recovery plan. Never rewrite ledger rows or historical identities just to pass a constraint.

**Verification:** The serialized command exits 0, `db:check` passes, auth/worker checks pass and existing representative records remain intact. Confirm no second release process is still acting on the target. Historical tests cover migration repeatability and concurrent application runners; they do not certify arbitrary production upgrade failures.

**Escalation:** Include release SHA, stage/time, sanitized PostgreSQL/tool code, whether another release was active, metadata summary and backup availability. Keep exception query text and any data rows private.

## Direct SQL appears empty or denied while the application has records

**Problem:** A database session is being used outside the application authorization context.

**Symptoms:** A direct tenant-table query returns no rows or is denied, or a queue/auth table is inaccessible through the application role. The application may still display the user's authorized records correctly.

**Possible causes:** Row-level security deliberately requires a server-verified actor/workspace context inside a transaction. `journal_app`, `journal_auth` and `journal_jobs` have separate responsibilities. A username or supplied workspace UUID alone is not permission to inspect another user's data.

**Diagnosis:** First inspect the same authorized workspace through the browser, checking account/environment/date filters. Confirm whether the direct query was part of a reviewed operator diagnostic or an attempt to use a runtime role as an administrator. [Database transactions](../../packages/database/src/index.ts) set actor/workspace context internally and clear it at transaction completion; [database tests](../../tests/integration/database.test.ts) cover isolated roles and denied access.

**Resolution:**

1. Use authenticated application reads and the [financial investigation workflow](financial-discrepancies.md) for balances/positions.
2. If operator metadata is needed, use the deployment's approved restricted monitoring/operator access for the named inspection, retaining its access controls.
3. Resolve an actual membership/role issue through the supported administration process. Do not grant superuser/BYPASSRLS, disable RLS, forge actor settings or supply another user's session to make a query return rows.

**Verification:** Authorized browser records remain visible in the correct scope; unrelated workspace and role boundaries remain enforced. An intentionally denied direct query is not a data-loss diagnosis.

**Escalation:** Share the route, role category, expected scope and sanitized denial code/request identifier. Never include session cookies, auth tokens, raw query results or another workspace's identities.

## A migration or test command rejects the isolated test bindings

**Problem:** The tool refuses to use a database that has not passed its disposable-test target guard.

**Symptoms:** The internal guard identifies `Invalid isolated test database binding: <NAME>`, `Test database instance mismatch: <NAME>`, `Invalid development database binding: <NAME>`, or `Test database must differ from every development database.` CLI wrappers can reduce that to their sanitized operation failure. These messages name configuration fields rather than print credentials.

**Possible causes:** A test database name lacks the required `_test` suffix; test URLs do not identify the same host/port/database; credentials/host are missing; a test URL has query/fragment ambiguity; or any development/migration URL points at the same target. Loopback aliases are normalized to prevent treating `localhost` and `127.0.0.1` as distinct instances.

**Diagnosis:** Review all four `TEST_*` bindings privately against [configuration](../getting-started/configuration.md), and compare their target with every development binding. The guard is implemented in [testDatabaseUrls](../../scripts/environment.ts) and [unit tests](../../tests/unit/test-database-config.test.ts). Do not run `db:migrate:check` as a read-only probe of an existing user database.

**Resolution:**

1. Provision/select a dedicated disposable test instance following [installation](../getting-started/installation.md), preserving all user/development data.
2. Correct private test bindings so their four distinct credentials target that same isolated `_test` database and no development binding targets it.
3. Only after confirming isolation, run the intended test/migration-check action. It modifies test data/schema; never rename a user database or bypass the guard to make it eligible.

**Verification:** The guarded test command reaches its intended checks. For `db:migrate:check`, the success message is `Isolated test database migrations and repeatability checks passed.` Development connectivity and user data remain unchanged.

**Escalation:** Collect only binding names, a redacted target comparison, intended test action, release SHA and sanitized code. Keep all actual URLs/passwords private.

## Source and related references

The principal authorities are [runtime schema checks](../../packages/database/src/readiness.ts), [application migration/provisioning](../../packages/database/src/migrate.ts), [queue migration](../../apps/worker/src/migrate.ts), [tool configuration/error handling](../../scripts/environment.ts), [runtime database contexts](../../packages/database/src/index.ts), [production preflight](../../scripts/operations/production-preflight.ts), [database integration tests](../../tests/integration/database.test.ts) and [Phase 18 remediation](../audit-remediation.md). Recovery authority remains [backup and recovery](../backup-and-recovery.md); this chapter does not replace its coordinated restoration procedure.
