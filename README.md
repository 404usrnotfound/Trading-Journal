# Trading Journal

A broker-independent, multi-asset trading journal. Phase 3 supplies a runnable application foundation: an authenticated shell, persisted workspace preferences, a PostgreSQL-backed API, private storage, and a durable worker. Financial accounts, instruments, transactions, calculations and dashboards are not implemented.

Read the authoritative [product specification](Trading_Journal_Codex_Prompt.md), [requirements](docs/requirements-analysis.md), [architecture](docs/architecture.md), [domain model](docs/domain-model.md), and [development plan](docs/development-plan.md). [Scaffold validation](docs/scaffold-validation.md) records the current verification and limitations.

## Prerequisites

- Node.js **24.19.0** (`.node-version` / `.nvmrc`), Corepack, and **pnpm 10.34.6** selected by `packageManager`. Use `corepack pnpm` below rather than a different global pnpm.
- Docker Engine and Docker Compose v2, running and accessible to your user.
- Free loopback ports **3000**, **3101**, **5432**, **5433**; browser tests also use **3002**. The database image is pinned PostgreSQL 17 Bookworm.
- Linux, macOS or a supported Node/Docker development environment. Browser checks need Chromium and its platform libraries.

## First setup

Run from the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm env:init
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:check
corepack pnpm user:create --email you@example.com --name 'Your Name'
corepack pnpm dev
```

The owner command prompts for a hidden password of 12–128 characters. Public registration is disabled; there is no default password. For automation, bind `BOOTSTRAP_PASSWORD` securely in the child environment instead of putting it in command arguments, shell history, `.env.example`, or source control.

Visit **http://localhost:3000/sign-in**. `dev` starts web and worker together; Ctrl+C stops only its managed processes. The owner starts with an empty personal workspace. Edit its IANA timezone and optional three-letter reporting-currency preference to test persistence; this preference does not create a currency registry or financial valuation.

`env:init` creates an ignored `.env` with fresh local credentials and `.private/storage`, with private permissions. Rerunning it preserves existing configuration. `.env.example` documents names and placeholders; it is not a usable credentials file. Never commit `.env`, private media, database dumps, session tokens, or logs containing secrets.

Compose uses the separate **trading-journal-foundation** project and persistent development volume. The test service is a separate PostgreSQL instance with temporary data. `corepack pnpm db:down` stops this project's databases without deleting the development volume. Do not use `down -v` against data you want to retain. Existing volumes from the reverted scaffold are not automatically reused or modified.

For another isolated local instance, set overrides before the first `env:init`:

```sh
COMPOSE_PROJECT_NAME=trading-journal-isolated APP_ORIGIN=http://localhost:3300 POSTGRES_PORT=5542 TEST_POSTGRES_PORT=5543 WORKER_HEALTH_PORT=3311 corepack pnpm env:init
```

The generated file stores those values and derives `PORT` and database URLs. Choose an unused `E2E_PORT` when running concurrent browser checks. `WEB_HOST` defaults to `127.0.0.1`; use an explicit binding and trusted access boundary when exposing a development server.

## Commands and checks

```sh
corepack pnpm db:migrate:check
corepack pnpm test
corepack pnpm api:check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

`test` runs unit/property/UI tests followed by real-PostgreSQL integration tests. `verify` combines API drift, formatting, lint, type checking, tests and the production build. Integration tests require the running test service; guards reject development bindings, ambiguous URLs and non-`_test` databases. Migration tests create/remove uniquely named temporary databases only on that test instance; its operator credential needs `CREATEDB`. Never substitute a production operator URL.

Run browser and axe checks after building:

```sh
corepack pnpm exec playwright install --with-deps chromium
corepack pnpm test:e2e
```

Playwright provisions generated test identities, starts built web assets on port 3002 against the isolated test database, and checks login/logout, preferences, concurrency, keyboard access, desktop/mobile layouts and both themes. It does not test unimplemented financial workflows. If browser downloads are unavailable but a compatible Chromium is installed, use the explicit supported override:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium corepack pnpm test:e2e
```

`test:ui` runs only the React form tests. `api:generate` regenerates the checked-in OpenAPI 3.1 document and TypeScript client; `api:check` detects drift. `format` formats current implementation files; authoritative design documents are preserved rather than reformatted wholesale.

## Database, seed and recovery

`db:migrate` applies reviewed SQL and queue migrations under a bounded deployment lock, checks applied migration hashes/order, and provisions separate tenant, auth and job roles. Runtime services never auto-migrate or receive operator/test database credentials. Use additive reviewed migrations; never edit an applied migration or use Drizzle schema `push` on shared data. See the [database package](packages/database/README.md).

Optional, repeatable seed infrastructure creates a separate labeled empty demo workspace for an existing owner:

```sh
corepack pnpm db:seed --email you@example.com
```

No financial examples are seeded in Phase 3. Without SMTP, an operator can recover an existing user's password with the same hidden-input command:

```sh
corepack pnpm user:create --email you@example.com --reset-password
```

Recovery revokes prior sessions. There is no public recovery, invitation, or signup endpoint. Authenticated API foundations include safe session inspection/list/revocation and a fresh-session password change. Login limits are persisted across replicas: 100 shared ingress attempts per 15 minutes and ten attempts per email bucket, including successful logins. Client-forwarded IP headers are not trusted. Auth auditing records identifiers/actions only; library credential/session writes and the subsequent auth audit insert are separate operations. Tenant preference updates and their audit are atomic.

## Runtime and configuration

All server configuration is validated before use. Production requires HTTPS `APP_ORIGIN`, a strong auth secret, distinct least-privilege database bindings, and a private persistent `STORAGE_ROOT` outside public/build directories. Worker configuration receives only its queue binding and health/log options. Optional broker, pricing, SMTP, AI or S3 credentials are not required by the scaffold. Pino logs and public errors redact credentials, cookies and internal database details.

- `GET /api/v1/health/live`: public process liveness without secrets.
- `GET /api/v1/health/ready`: authenticated application database/schema readiness.
- Worker `http://127.0.0.1:3101/health/live` and `/health/ready`: private loopback liveness and live queue/worker readiness. No public production exposure is intended.
- `GET /api/v1/session`, workspace reads and owner preference updates: shared Zod/OpenAPI DTOs, current membership checks, RLS and session-bound CSRF for mutations.

`corepack pnpm dev:worker` starts only the development worker. After `build`, `corepack pnpm start` starts web and worker with the configured environment; `start:web` and `start:worker` start them independently. A local HTTP built-assets smoke run keeps `NODE_ENV=development` or `test`. Deployments use `NODE_ENV=production`, HTTPS at a trusted reverse proxy, persistent private media, PostgreSQL, and a separate one-shot migration job before readiness-gated rollout. The standalone web launcher copies static assets before starting. No deployment is performed by this phase; Docker Compose here supplies databases, not a production hosting platform.

## Cloud workspace cache paths

If the cloud image's default home/cache paths are unavailable, use supported cache overrides without changing `HOME` or disabling signatures/TLS:

```sh
export COREPACK_HOME=/workspace/.cache/trading-journal/corepack
export XDG_CACHE_HOME=/workspace/.cache/trading-journal
export XDG_DATA_HOME=/workspace/.cache/trading-journal/data
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/trading-journal/playwright
```

Then run the same commands from the checkout. Cloud task restarts may stop services; rerun `db:up`, `db:migrate`, `db:check`, then `dev`. Preserve the private `.env` and development volume; do not regenerate credentials for a volume initialized with different passwords.

## Structure

```text
apps/web           Next.js App Router UI and thin API handlers
apps/worker        pg-boss worker, queue migrations and health probes
packages/contracts Shared strict Zod DTOs, OpenAPI and generated client
packages/database  Drizzle models, reviewed migrations and tenant transactions
packages/domain    Pure domain type boundary; financial implementation deferred
packages/server    Auth, authorization, config, services, errors, logs and storage
packages/ui        Shared presentation components
scripts            Setup, migration, seed, provisioning and process launchers
tests              Unit/property, React, PostgreSQL integration and browser tests
docs               Approved design, ADRs and verification records
```

The [Phase 2 calculation contracts](docs/financial-calculations.md), [capabilities](docs/instrument-capabilities.md) and [independent financial fixtures](docs/financial-fixtures.md) remain requirements for Phase 4. Passing scaffold checks does not establish financial correctness or completion of AC-01–AC-16.
