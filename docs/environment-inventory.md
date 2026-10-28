# Environment inventory

Audit date: 24 October 2026. Reviewed source: post-remediation commit
`5132900a03efabaeb307787531546987228220e7`. Scope: implementation, configuration,
scripts and retained validation evidence. This is a reference inventory for
Phase 19 Checkpoint 1; it does not add installation or operating procedures.

## Evidence and compatibility boundaries

**Integration note — 27 October 2026:** runtime/dependency versions remain unchanged. Current setup and command evidence is consolidated in [final documentation validation](documentation-validation.md); the [audience index](README.md) links task guides. References below to later verification describe the original Checkpoint 1 acceptance dependencies, not proof of a production deployment.

- **Source-reviewed** means the named manifest, parser, script or workflow was
  inspected. A declared command is not an assertion that it ran in this audit.
- **Historically passed** means an existing dated report records execution.
  [Production evidence](production-readiness-evidence.json) records Linux x86_64,
  Node 24.19.0, pnpm 10.34.6 and PostgreSQL 17.11 on 17 October 2026, and explicitly
  sets `productionDeploymentVerified` to `false`.
- [The final audit's remediation outcome](final-audit.md#remediation-outcome--24-october-2026)
  records 913 unit/property/UI tests, 576 PostgreSQL tests, 18 browser tests, a
  production build and static checks on the remediation working tree. Its
  original 817/512 audit results remain historical. The
  [remediation record](audit-remediation.md) maps corrections to evidence; FA-04
  remains open for production capacity. These are retained results, not reruns
  for this checkpoint or production deployment certification.
- Current documentation-only validation and Git provenance belong in
  [the documentation plan](documentation-plan.md). No supported environment is
  inferred from the machine on which this document was written.

## Languages, frameworks and dependency management

| Component            | Declared implementation / version                                                                                        | Authoritative source                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application language | TypeScript 5.9.3, ESM; React TSX and SQL migrations                                                                      | [Root manifest](../package.json), [TypeScript base configuration](../tsconfig.base.json), [migration journal](../packages/database/migrations/meta/_journal.json) |
| Node runtime         | Exact development/release pin 24.19.0; package engine `>=24 <25`; release check enforces the exact pin                   | [.node-version](../.node-version), [.nvmrc](../.nvmrc), [root manifest](../package.json), [release verifier](../scripts/release-check.ts)                         |
| Package manager      | pnpm 10.34.6 through Corepack; engine `>=10 <11`; frozen lockfile used by CI                                             | [Root manifest](../package.json), [lockfile](../pnpm-lock.yaml), [CI](../.github/workflows/ci.yml)                                                                |
| Workspace            | `apps/*`, `packages/*`; strict engines/peers and exact dependency saves                                                  | [Workspace configuration](../pnpm-workspace.yaml), [.npmrc](../.npmrc)                                                                                            |
| Web and API          | Next.js 16.3.8 App Router, React/React DOM 19.3.0; webpack builds, standalone output                                     | [Web manifest](../apps/web/package.json), [Next configuration](../apps/web/next.config.ts)                                                                        |
| UI                   | Tailwind CSS 4.3.3, TanStack Query 5.104.1, React Hook Form 7.89.0, Recharts 3.8.0                                       | [Web manifest](../apps/web/package.json), [UI manifest](../packages/ui/package.json)                                                                              |
| API contracts        | Zod 4.6.5, Zod-to-OpenAPI 9.1.0, openapi-fetch 0.17.0; generated drift checks                                            | [Contracts manifest](../packages/contracts/package.json), [contract generator](../packages/contracts/src/generate.ts)                                             |
| Authentication       | Better Auth 1.7.7, native Argon2 2.2.2                                                                                   | [Server manifest](../packages/server/package.json), [authentication implementation](../packages/server/src/auth.ts)                                               |
| Financial arithmetic | decimal.js 10.6.0; independent domain package                                                                            | [Domain manifest](../packages/domain/package.json)                                                                                                                |
| Database access      | PostgreSQL driver `pg` 8.23.1, Drizzle ORM 0.45.3; Drizzle Kit 0.31.11 for candidate generation                          | [Database manifest](../packages/database/package.json), [Drizzle configuration](../packages/database/drizzle.config.ts)                                           |
| Worker               | Separate Node process, pg-boss 12.37.0; tsup 8.5.1 build tooling                                                         | [Worker manifest](../apps/worker/package.json), [root manifest](../package.json)                                                                                  |
| Logging              | Pino 10.4.0 structured JSON                                                                                              | [Server manifest](../packages/server/package.json), [logger](../packages/server/src/logging.ts)                                                                   |
| Quality tooling      | Vitest 5.0.3, Testing Library, jsdom, fast-check, Playwright 1.63.0, axe-core Playwright, ESLint 10.12.0, Prettier 3.9.9 | [Root manifest](../package.json)                                                                                                                                  |

The supported release is the complete source workspace with locked dependencies
and required build outputs. The presence of an engine range does not establish
verification for every minor release or another package manager. Native Argon2
compatibility is checked by [the release verifier](../scripts/release-check.ts);
an arbitrary OS/CPU or copied native module is not certified by the version pin.

## Database and required services

| Service / resource    | Requirement and boundary                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL            | Major version 17 only; migrations and runtime readiness reject other majors. Application schema version is 17, represented by seventeen reviewed migrations `0000`–`0016`. Original migrations `0000`–`0008` remain unchanged by remediation. | [Migration runner](../packages/database/src/migrate.ts), [readiness](../packages/database/src/readiness.ts), [journal](../packages/database/migrations/meta/_journal.json), [remediation record](audit-remediation.md) |
| Runtime identities    | Separate `journal_app`, `journal_auth`, `journal_jobs`; migration tooling takes an operator URL and provisions restricted roles. Tenant context/RLS belongs to application transactions.                                                      | [Migration runner](../packages/database/src/migrate.ts), [database access](../packages/database/src/index.ts), [initial constraints migration](../packages/database/migrations/0001_platform_identity_constraints.sql) |
| Web/API process       | Next.js server; default loopback port 3000. Production startup uses generated standalone server plus copied assets.                                                                                                                           | [.env.example](../.env.example), [launcher](../scripts/run.ts), [asset copier](../scripts/standalone-assets.ts)                                                                                                        |
| Worker process        | Separate pg-boss service using PostgreSQL queue schema; consumes health probes and financial outbox intents for revision-safe native cash/holding snapshots. Queued bulk imports and asynchronous large-report offloading remain unavailable. | [Worker](../apps/worker/src/index.ts), [queue configuration](../apps/worker/src/queue.ts), [outbox worker](../apps/worker/src/financial-outbox.ts), [outbox behavior](financial-outbox.md)                             |
| Private media         | Durable local filesystem storage, outside public/build paths, private directory/file permissions and no symlink traversal. No implemented S3 adapter.                                                                                         | [Storage implementation](../packages/server/src/storage.ts), [server parser](../packages/server/src/config.ts), [deployment](deployment.md)                                                                            |
| Production HTTPS edge | Trusted HTTPS reverse proxy and canonical origin; private Node/worker/database listeners and supervised processes. Provisioning, certificates and public-host verification are external obligations.                                          | [Server parser](../packages/server/src/config.ts), [deployment](deployment.md), [readiness checklist](production-readiness-checklist.md)                                                                               |
| Test database         | Distinct PostgreSQL database ending `_test`; operator/app/auth/job test URLs must target that instance and differ from development.                                                                                                           | [Test binding validation](../scripts/environment.ts), [integration setup](../tests/integration/global-setup.ts)                                                                                                        |
| Browser testing       | Chromium plus system libraries; default dedicated loopback port 3002. CI installs the locked Chromium.                                                                                                                                        | [Playwright configuration](../playwright.config.ts), [CI](../.github/workflows/ci.yml)                                                                                                                                 |

[Compose](../compose.yaml) contains only `postgres` and `postgres-test`, both using
the digest-pinned `postgres:17-bookworm` image. Development database data uses a
named volume; test database data uses `tmpfs`; both ports bind to loopback.
Compose is not a production application deployment. No application Dockerfile,
production Compose stack, Kubernetes manifest, Terraform configuration or hosted
deployment workflow was found in the tracked tree.

No Redis, broker connection, external market-data feed, SMTP, AI provider or object
storage service is required by the currently implemented local workflows. Future
integrations in the specification must not become setup requirements until their
implementations and configuration exist; see [deployment](deployment.md) and the
[feature inventory](feature-inventory.md).

## Operating systems and installation forms

| Environment / form                                                            | Support and verification status                                                                                                                                                                                                    | Source                                                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Linux production, full source release                                         | Documented deployment target; Linux x86_64 local release rehearsal exists. An actual production host remains unverified.                                                                                                           | [Deployment](deployment.md), [production evidence](production-readiness-evidence.json)                                              |
| Ubuntu 24.04 CI                                                               | Configured runner, exact Node pin, Corepack/pnpm, Compose databases and Chromium. A workflow definition does not prove a successful hosted run.                                                                                    | [CI](../.github/workflows/ci.yml)                                                                                                   |
| Linux development                                                             | Documented; the retained local verification environment is Linux.                                                                                                                                                                  | [README prerequisites](../README.md), [production evidence](production-readiness-evidence.json)                                     |
| macOS development                                                             | Claimed in README, but no macOS matrix or retained execution evidence found. Requires verification before an OS-specific guide is accepted.                                                                                        | [README](../README.md), [CI](../.github/workflows/ci.yml)                                                                           |
| Windows development                                                           | Launcher contains a Windows process-tree termination branch, but web package commands use POSIX shell expansion and storage documents POSIX-only infrastructure. No complete Windows support claim or verification is established. | [Process handling](../scripts/processes.ts), [web manifest](../apps/web/package.json), [storage](../packages/server/src/storage.ts) |
| Source checkout and locked installation                                       | Repository-backed development and release form; `corepack pnpm install --frozen-lockfile` is configured in CI. Corepack availability itself is a prerequisite.                                                                     | [CI](../.github/workflows/ci.yml), [deployment](deployment.md)                                                                      |
| Standalone-only directory, prebuilt installer or production application image | Not a supported complete installation artifact. Standalone server/worker output alone omits dependencies, operator sources or migrations; no packaged installer/image is supplied.                                                 | [Deployment](deployment.md), [release verifier](../scripts/release-check.ts)                                                        |

No resource minimum is asserted here. The limits and workload-specific
measurements in [performance](performance.md) and its retained evidence do not
establish a universal CPU, memory, storage or concurrency guarantee.

[Deployment](deployment.md), [database package documentation](../packages/database/README.md)
and portions of [the readiness checklist](production-readiness-checklist.md)
retain pre-remediation statements about schema 9/nine migrations, a health-only
worker, queue function grants or deferred workspace portability. For these
subjects, this inventory uses current readiness/migration/worker source and the
remediation behavior documents; those older claims require revision before later
guides are accepted. The configured deployment topology and toolchain remain
separate from those stale capability descriptions.

## Environment variables

Values below are defaults or constraints from tracked files, never live secrets.
[The template](../.env.example) deliberately contains unusable secret placeholders.
Tooling loads repository `.env` without overriding existing bindings;
[environment initialization](../scripts/env-init.ts) refuses to replace an existing
file. The launchers pass allowlisted runtime variables and exclude operator/test
credentials: [environment loading](../scripts/environment.ts),
[process environment](../scripts/processes.ts).

### Application, worker and database bindings

| Variable                                                                                        | Consumer / requirement                                               | Default or constraint                                                                                                                                                                             | Source                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                      | Web; launcher mode and browser security                              | Parser defaults `development`; accepts `development`, `test`, `production`. Production requires HTTPS origin.                                                                                     | [Server parser](../packages/server/src/config.ts), [launcher](../scripts/run.ts), [proxy](../apps/web/src/proxy.ts)                                         |
| `DATABASE_URL`                                                                                  | Required web/application database connection                         | PostgreSQL URL; runtime role `journal_app`                                                                                                                                                        | [Server parser](../packages/server/src/config.ts), [migration provisioning](../packages/database/src/migrate.ts)                                            |
| `AUTH_DATABASE_URL`                                                                             | Required web/authentication database connection                      | PostgreSQL URL; runtime role `journal_auth`                                                                                                                                                       | [Server parser](../packages/server/src/config.ts), [authentication](../packages/server/src/auth.ts)                                                         |
| `JOB_DATABASE_URL`                                                                              | Required worker queue connection; also required by web config parser | PostgreSQL URL; runtime role `journal_jobs`; worker requires username                                                                                                                             | [Server parser](../packages/server/src/config.ts), [worker parser](../apps/worker/src/config.ts)                                                            |
| `MIGRATION_DATABASE_URL`                                                                        | Required one-shot migration operator connection                      | Not a web/worker fallback; kept out of child runtime environment                                                                                                                                  | [Migration script](../scripts/migrate.ts), [process allowlist](../scripts/processes.ts)                                                                     |
| `BETTER_AUTH_SECRET`                                                                            | Required web authentication secret                                   | At least 32 nonblank characters; template is not usable                                                                                                                                           | [Server parser](../packages/server/src/config.ts), [template](../.env.example)                                                                              |
| `APP_ORIGIN`                                                                                    | Canonical authentication/application origin                          | Parser default `http://localhost:3000`; no credentials/path/query/fragment; nonproduction loopback HTTP(S); production HTTPS                                                                      | [Server parser](../packages/server/src/config.ts)                                                                                                           |
| `STORAGE_ROOT`                                                                                  | Private attachment storage                                           | Parser fallback `.data/private`; template/generated local config `.private/storage`; rejects filesystem root and public/build directories. Launcher resolves relative paths from repository root. | [Server parser](../packages/server/src/config.ts), [template](../.env.example), [initializer](../scripts/env-init.ts), [processes](../scripts/processes.ts) |
| `WEB_HOST`                                                                                      | Next.js listen host                                                  | `127.0.0.1`; production external binding requires private boundary                                                                                                                                | [Web manifest](../apps/web/package.json), [launcher](../scripts/run.ts), [deployment](deployment.md)                                                        |
| `PORT`                                                                                          | Next.js listen port                                                  | Local template `3000`; E2E overrides it                                                                                                                                                           | [Template](../.env.example), [Playwright config](../playwright.config.ts)                                                                                   |
| `WORKER_HEALTH_HOST`                                                                            | Worker HTTP health listener                                          | `127.0.0.1`                                                                                                                                                                                       | [Worker parser](../apps/worker/src/config.ts)                                                                                                               |
| `WORKER_HEALTH_PORT`                                                                            | Worker HTTP health listener                                          | `3101`; integer 1–65535                                                                                                                                                                           | [Worker parser](../apps/worker/src/config.ts)                                                                                                               |
| `LOG_LEVEL`                                                                                     | Web and worker JSON logger                                           | `info`; `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`                                                                                                                              | [Server parser](../packages/server/src/config.ts), [worker parser](../apps/worker/src/config.ts), [logger](../packages/server/src/logging.ts)               |
| `POSTGRES_PASSWORD`                                                                             | Local Compose administrator secret                                   | Required; random local value generated by initializer                                                                                                                                             | [Compose](../compose.yaml), [initializer](../scripts/env-init.ts)                                                                                           |
| `POSTGRES_PORT`                                                                                 | Local development PostgreSQL published port                          | `5432`                                                                                                                                                                                            | [Compose](../compose.yaml)                                                                                                                                  |
| `TEST_POSTGRES_PORT`                                                                            | Local isolated-test PostgreSQL published port                        | `5433`                                                                                                                                                                                            | [Compose](../compose.yaml)                                                                                                                                  |
| `COMPOSE_PROJECT_NAME`                                                                          | Local Compose isolation                                              | `trading-journal-foundation` in initializer; CI uses unique run/attempt name                                                                                                                      | [Initializer](../scripts/env-init.ts), [CI](../.github/workflows/ci.yml)                                                                                    |
| `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL`, `TEST_AUTH_DATABASE_URL`, `TEST_JOB_DATABASE_URL` | Required database-backed integration/E2E tests                       | Four roles targeting the same isolated `_test` database, distinct from development                                                                                                                | [Test URL validator](../scripts/environment.ts), [integration setup](../tests/integration/global-setup.ts)                                                  |
| `BOOTSTRAP_PASSWORD`                                                                            | Optional noninteractive owner creation/password recovery input       | Operator-only; otherwise hidden TTY prompt; removed from process environment after reading                                                                                                        | [Owner command](../scripts/create-user.ts)                                                                                                                  |

### Test, build and infrastructure overrides

| Variable                                                                                                                                                         | Scope / behavior                                                                                                   | Source                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `E2E_PORT`                                                                                                                                                       | Browser server port; default 3002; integer 1024–65535                                                              | [Playwright configuration](../playwright.config.ts)                                                                       |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`                                                                                                                            | Optional existing Chromium executable override                                                                     | [Playwright configuration](../playwright.config.ts), [frontend benchmark](../scripts/performance/frontend-benchmark.ts)   |
| `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`                                                                                                                        | Generated E2E credentials; test setup supplies them. Not installation input.                                       | [Browser setup](../tests/e2e/global-setup.ts)                                                                             |
| `PERFORMANCE_MANIFEST`, `PERFORMANCE_ORIGIN`, `PERFORMANCE_OUTPUT`                                                                                               | Optional benchmark-script inputs corresponding to CLI flags; not application runtime configuration                 | [Performance server](../scripts/performance/serve.ts), [frontend benchmark](../scripts/performance/frontend-benchmark.ts) |
| `PERFORMANCE_UI_CENSUS_OUTPUT`                                                                                                                                   | Optional test-only output path for mocked Dashboard chart invocation counts; not application runtime configuration | [Dashboard UI test](../tests/ui/dashboard.test.tsx)                                                                       |
| `NEXT_TELEMETRY_DISABLED`                                                                                                                                        | CI/build opt-out, configured to `1` in workflow                                                                    | [CI](../.github/workflows/ci.yml), [process allowlist](../scripts/processes.ts)                                           |
| `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`                                                                                                           | Supported trust-path propagation; does not replace PostgreSQL URL TLS configuration                                | [Process allowlist](../scripts/processes.ts), [deployment TLS requirements](deployment.md)                                |
| `PLAYWRIGHT_BROWSERS_PATH`, `COREPACK_HOME`, `COREPACK_ENABLE_NETWORK`, `COREPACK_ENABLE_DOWNLOAD_PROMPT`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `npm_config_cache` | Optional external tool/cache settings preserved by process allowlist; no application-specific default              | [Process environment](../scripts/processes.ts)                                                                            |
| `npm_execpath`, `npm_config_user_agent`                                                                                                                          | Package-manager-provided metadata used by launcher/release verifier; not user secrets                              | [Processes](../scripts/processes.ts), [release verifier](../scripts/release-check.ts)                                     |
| `HOSTNAME`                                                                                                                                                       | Generated standalone-server host binding derived by launcher from `WEB_HOST`                                       | [Launcher](../scripts/run.ts)                                                                                             |
| `NODE_TLS_REJECT_UNAUTHORIZED`                                                                                                                                   | Unsafe value `0` rejected by production verification tooling; not supported as a TLS setup method                  | [Preflight](../scripts/operations/production-preflight.ts), [HTTPS smoke](../scripts/operations/https-smoke.ts)           |
| `NAPI_RS_NATIVE_LIBRARY_PATH`, `NAPI_RS_FORCE_WASI`                                                                                                              | Native hashing overrides rejected by release verification                                                          | [Release verifier](../scripts/release-check.ts)                                                                           |

Standard platform variables such as `PATH`, `HOME`, `TEMP`, locale and CI/color
settings are allowlisted infrastructure inputs, not additional application
features. No `NEXT_PUBLIC_*` product variable or external provider credential is
declared in the inspected configuration. Syntax validation does not establish
database connectivity, role privileges, persistent storage or certificate trust.

The recovery drill explicitly removes inherited `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_TLS`, `DOCKER_TLS_VERIFY` and `DOCKER_CERT_PATH` before selecting its fixed local Docker socket. These are ignored infrastructure selectors for that tool, not supported remote recovery targets. `POSTGRES_DB` is fixed inside the Compose database services, not an application database-name override. Sources: [recovery drill](../scripts/operations/recovery-drill.ts), [Compose](../compose.yaml).

## Declared commands and their verification scope

All commands below run from repository root and are defined in
[package.json](../package.json), unless a different source is named. They are
listed for coverage planning, not as a sequence to execute. Mutation and external
dependencies are stated to prevent a command inventory becoming an implied
installation procedure.

| Purpose                        | Exact declared command                                                                             | Requirements / effects                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locked dependencies            | `corepack pnpm install --frozen-lockfile`                                                          | Corepack, package registry access/cache; installs workspace/native dependencies; configured in [CI](../.github/workflows/ci.yml)                         |
| Local configuration            | `corepack pnpm env:init`                                                                           | Creates private `.env` with generated credentials; preserves existing file                                                                               |
| Local databases                | `corepack pnpm db:up` / `corepack pnpm db:down`                                                    | Docker Engine and Compose v2; creates/stops only the configured development/test services                                                                |
| Development                    | `corepack pnpm dev` / `corepack pnpm dev:worker`                                                   | Valid runtime configuration, migrated PostgreSQL, free listener ports; combined web/worker or worker alone                                               |
| Owner/bootstrap                | `corepack pnpm user:create --email owner@example.test --name 'Example Owner'`                      | Operator action, auth database and secure password input; creates owner/workspace. Recovery adds `--reset-password` with `--email`; not a public signup. |
| Demo workspace                 | `corepack pnpm db:seed --email owner@example.test`                                                 | Existing owner; creates labeled empty demo workspace, not fabricated financial history                                                                   |
| Production build               | `corepack pnpm build`                                                                              | Domain build, worker build, Next webpack build in that order; lazy server imports avoid runtime-secret requirements                                      |
| Production processes           | `corepack pnpm start:web`, `corepack pnpm start:worker`, `corepack pnpm start`                     | Built artifacts and complete dependency graph; production bindings, HTTPS edge and services. `start` manages both children.                              |
| API generation / drift         | `corepack pnpm api:generate` / `corepack pnpm api:check`                                           | Generation changes contract artifacts; check compares generated OpenAPI/client with source                                                               |
| Formatting                     | `corepack pnpm format:check`                                                                       | Read-only Prettier verification; `format` writes repository-wide files and is not a validation equivalent                                                |
| Static checks                  | `corepack pnpm lint` / `corepack pnpm typecheck`                                                   | ESLint zero-warning requirement; root and workspace TypeScript checks                                                                                    |
| Unit/property/UI tests         | `corepack pnpm test:unit`                                                                          | Vitest Node and jsdom projects; this command includes UI tests                                                                                           |
| UI-only tests                  | `corepack pnpm test:ui`                                                                            | Vitest `ui` project subset                                                                                                                               |
| Integration tests              | `corepack pnpm test:integration`                                                                   | Isolated PostgreSQL test bindings; setup migrates and provisions test roles                                                                              |
| Default tests                  | `corepack pnpm test`                                                                               | Unit/property/UI followed by integration; does not include Playwright                                                                                    |
| Browser/accessibility          | `corepack pnpm test:e2e`                                                                           | Built web app, isolated test DB, Chromium/platform dependencies; controlled single worker/test server                                                    |
| Aggregate verification         | `corepack pnpm verify`                                                                             | API drift, formatting, lint, types, default tests, build; excludes E2E, advisory audit and operations smoke commands                                     |
| Dependency advisories          | `corepack pnpm security:audit`                                                                     | Registry-dependent `pnpm audit --audit-level=low`; results are time-dependent                                                                            |
| Release verification           | `corepack pnpm release:check`                                                                      | Complete release assets, exact toolchain/native hashing checks; not a production deployment certificate                                                  |
| Operational validation tooling | `corepack pnpm ops:preflight`, `corepack pnpm ops:https-smoke`, `corepack pnpm ops:recovery-drill` | Separate live/preflight, controlled HTTPS and isolated recovery exercises; not run by this documentation audit. Recovery creates isolated resources.     |

### Migration and schema commands

| Command                          | Defined behavior / boundary                                                                                                                                                                                                     | Source                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm db:migrate`       | Application migrations, queue migrations, then role provisioning; requires operator and three runtime URLs. Exact applied history prefix/hash validation and bounded locks; these phases are not one atomic global transaction. | [Script](../scripts/migrate.ts), [application runner](../packages/database/src/migrate.ts), [queue migrations](../apps/worker/src/migrate.ts) |
| `corepack pnpm db:migrate:check` | Applies application migrations twice to the isolated test database, then verifies schema compatibility; does not replace production migration-history review.                                                                   | [Repeatability script](../scripts/migration-check.ts)                                                                                         |
| `corepack pnpm db:check`         | Connects through application database identity and checks schema version/readiness.                                                                                                                                             | [Database check](../scripts/database-check.ts)                                                                                                |

Drizzle configuration supports generating candidate SQL. No root script for
`drizzle push`, destructive down migrations or automatic startup migrations is
declared. Reviewed migrations remain the schema source of truth.

## Logging, health and deployment obligations

[The logger](../packages/server/src/logging.ts) emits structured Pino JSON to its
default process destination, allowlists event fields, redacts sensitive keys and
serializes error classifications instead of raw SQL/messages/stacks. Worker
startup, readiness, queue errors, heartbeat and shutdown events use that logger.
No repository-supplied production log collector, dashboard, retention policy or
alert delivery service was found. Collection and ownership remain deployment
requirements, described in [operations](operations.md).

Public web liveness is `/api/v1/health/live`; web readiness at
`/api/v1/health/ready` requires authentication and checks database compatibility.
Worker liveness/readiness use private `/health/live` and `/health/ready`; readiness
depends on queue round-trip probes, and does not prove that each native financial
projection is current. Projection delivery status/revision has its own
[authenticated read and authorized refresh](financial-outbox.md). Sources: [web liveness](../apps/web/src/app/api/v1/health/live/route.ts),
[web readiness](../apps/web/src/app/api/v1/health/ready/route.ts),
[worker implementation](../apps/worker/src/index.ts).

Required deployment decisions still include actual host/CPU/native compatibility,
certificate and proxy configuration, verified PostgreSQL TLS, service supervision,
durable private-media capacity, backup/restore ownership, accepted recovery
objectives, monitoring and measured workload capacity. Existing procedures are
retained evidence and require reconciliation with
[the final audit](final-audit.md); they are not expanded in this checkpoint.

## Verification required before later guides

- Preserve the approved post-Phase-18 source identity and match retained
  remediation evidence to it before treating historical reports as current.
- Reconcile deployment/checklist/database prose with schema 17, financial outbox
  functions and implemented workspace portability; retain Phase 16 evidence as
  historical rather than relabelling its nine-migration rehearsal.
- Reconcile README's broad development OS wording with the Linux verification
  evidence and POSIX storage boundary; establish macOS or Windows support with
  real execution before publishing corresponding instructions.
- Verify full source-only installation/build, migration, browser and release
  commands on the selected baseline and record host/tool versions and results.
- Verify actual production PostgreSQL TLS, edge/session behavior, persistence,
  recovery and capacity separately from local smoke tools.
- Document configured CI separately from a successfully completed hosted run.

These are documentation acceptance dependencies, not claims that missing product
work or production certification has been completed.
