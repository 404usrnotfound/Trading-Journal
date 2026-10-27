# Local development

Reviewed **26 October 2026** against Checkpoint 5 `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`; application baseline `5132900a03efabaeb307787531546987228220e7`. This guide owns the developer loop after setup. [Installation](../getting-started/installation.md), [system requirements](../getting-started/system-requirements.md) and [configuration](../getting-started/configuration.md) remain the complete prerequisite/configuration authorities; do not maintain another setup recipe here.

## Prepare an isolated checkout

Use the complete source workspace with Node **24.19.0**, Corepack/pnpm **10.34.6**, PostgreSQL **17**, private local media and separate web/worker processes. The repository supplies database-only Compose services for local use; there is no application container image or desktop installer. Linux x86_64 has execution evidence; another OS/CPU/native-module environment requires its own verification.

1. Obtain/select the intended source using installation's Git instructions. Preserve an existing checkout's work. This documentation branch is `docs/phase-19-complete-documentation`; no branch tip is automatically a production release.
2. Complete the canonical frozen install, private local initialization, database startup, migrations and synthetic owner bootstrap in that order. Account creation/bootstrap does not seed a representative trade history.
3. Verify the four guarded `TEST_*` bindings identify one separate `_test` instance and no development target. Integration/browser/migration-repeatability tools modify that instance; the suffix alone does not make a user's database disposable.
4. Select a synthetic workspace/paper account for experiments and retain source evidence. Review the [first run](../getting-started/first-run.md) and [guided example](../user-guide/guided-example.md) when a UI task needs catalog records or funding.

All commands below run from the **repository root** with installed pinned dependencies and the intended private configuration. Root scripts load repository `.env` without replacing already-injected bindings. Do not print environments, connection URLs, passwords or cookies while diagnosing precedence. The launchers filter child bindings; a migration credential never belongs in web/worker runtime.

## Start and change the application

**State-changing:** the following starts local web/worker services; authenticated UI activity can persist data:

```bash
corepack pnpm dev
```

The default canonical web origin is `http://localhost:3000`; private worker health defaults to `127.0.0.1:3101`. Use the actual generated origin/ports if overridden. Keep localhost and 127.0.0.1 origin/session distinctions intact. The combined launcher validates web/worker configuration, starts the Next development server and worker watcher, and stops its other managed child if one fails. Stop it through its owning terminal/process signal; do not kill an unrelated host process to free a port.

- Frontend pages/components live under `apps/web`; the shell/navigation and server-page reads are described in [architecture](architecture.md) and [repository structure](repository-structure.md). A page with `'use client'` must stay inside the enforced client dependency boundary.
- Backend route adapters call factories in `packages/server`; services authorize workspace scope, validate DTOs and use the database transaction boundary. Domain kernels remain transport/framework/database-independent.
- Contracts and shared schemas live in `packages/contracts`. A schema or route change also requires generator/typed-client/reference review. The API reference is not a runtime route registration mechanism.
- The watcher does not make changes to secrets, pools/listeners or persistent schema apply safely to running services. Restart affected processes after a reviewed runtime-binding change; run migrations only through controlled tooling, not automatic replica startup.

Use [troubleshooting](../troubleshooting/README.md) for failed startup/requests. Logs are process stdout/stderr, not a repository-defined application log file. Liveness, protected readiness and native worker projection status answer different questions.

## Check a source change

These commands are available root scripts; see [testing](testing.md) for setup, effects and suite selection:

```bash
corepack pnpm api:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
```

For database-backed work, first confirm explicitly disposable test bindings, then:

```bash
corepack pnpm test:integration
```

For a browser/release change, build first and follow the test guide's owned browser-server prerequisites:

```bash
corepack pnpm build
corepack pnpm test:e2e
```

Lint/types/API checks read sources/generated declarations; tests can create temporary files/processes and, for integration/browser suites, mutate disposable databases. Build writes domain/worker/web artifacts. Do not run these commands under production credentials. A suite existing in the manifest does not mean it was rerun for every documentation checkpoint; [verification](verification.md) identifies the actual fresh selections. Current dependency-audit failure remains separately documented.

## Change schemas, endpoints or migrations

Follow [extensions](extensions-and-broker-adapters.md), [database/migrations](database-migrations.md) and [API generation](api-reference.md#regenerate-the-reference). New endpoints require source handlers, schemas, correct auth/role/Origin/CSRF/idempotency rules, generated contract/client changes and relevant tests; adding a Markdown row does not implement a route.

There is no `db:generate` root script or complete current ORM snapshot suitable for an unreviewed automatic schema replacement. Candidate Drizzle configuration is not permission to push a schema, overwrite published SQL or invent a down migration. Use reviewed forward SQL/journal changes and test upgrade/constraint/history behavior on isolated resources. Seed data only establishes the documented empty demo workspace for an existing user.

## Finish a session

Save/confirm outstanding UI writes and inspect uncertain persisted results before retries. Stop the owned developer launcher; preserve local edits/private data. The supported local database stop is:

```bash
corepack pnpm db:down
```

**State-changing service operation:** this stops the selected Compose services/network; the development named volume is retained, while the test service's tmpfs state is disposable. Confirm the intended project/daemon. Never add volume deletion as a routine cleanup/rollback step. Production operation, backup, retention and recovery belong to [operations](../operations/README.md).
