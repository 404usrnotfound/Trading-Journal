# Trading Journal

A private, broker-independent trading journal project. The current release is the **platform scaffold**: real sign-in, database-backed sessions, isolated workspaces, a responsive light/dark shell, reviewed PostgreSQL migrations, private-storage foundations, and a durable worker with health checks.

Trading records, broker/accounts, instruments, financial ledgers/calculations, strategies, imports, analytics, attachment workflows, and workspace backup/restore are not implemented. Their actions are disabled with explanations; the interface contains no fabricated financial statistics. The full scope remains in the [product specification](Trading_Journal_Codex_Prompt.md), [requirements analysis](docs/requirements-analysis.md), and [development plan](docs/development-plan.md).

## Local setup

Use **Node.js 24.19.0**, **Corepack with pnpm 10.34.6**, and Docker Engine with Docker Compose v2. The repository pins pnpm through `packageManager`; invoke it through Corepack rather than an unrelated globally installed pnpm. The PostgreSQL 17 image is pinned by digest in [compose.yaml](compose.yaml).

Run these commands from the repository root:

```sh
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm env:init
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm user:create --email trader@example.com --name "Trader"
corepack pnpm dev
```

`env:init` creates an ignored, private `.env` with unique local database/authentication credentials and `.private/storage`; it preserves existing configuration. [The template](.env.example) documents bindings and contains no usable credentials. Database migrations provision separate least-privilege application, authentication, and queue roles. The launchers exclude migration/test/bootstrap credentials from child processes; the worker receives only its queue database credential. Runtime web/worker processes do not migrate the database.

`user:create` prompts for a password without echoing it and creates the owner and an empty personal workspace through the supported authentication API. Noninteractive provisioning can use a securely supplied `BOOTSTRAP_PASSWORD` environment variable; never pass a password on the command line or commit it. Public registration is disabled.

Open **http://localhost:3000** and sign in with the account you provisioned. `dev` starts the Next.js web process and the worker, uses the pinned package manager for child processes, and loads root `.env` configuration. Both Next development and production compilation explicitly use webpack to resolve Node-style workspace imports. No market-data, broker, AI, SMTP or S3 credentials are required for local core startup.

The development database defaults to `127.0.0.1:5432`, the isolated test database to port `5433`, and loopback worker health to port `3101`. Set `POSTGRES_PORT`, `TEST_POSTGRES_PORT`, or `APP_ORIGIN` before initial `env:init` if local ports must differ; keep the browser origin and application configuration consistent. The test service uses ephemeral storage, while the main database and private local storage persist.

An optional empty, labeled demo workspace can be created for an existing owner:

```sh
corepack pnpm db:seed --email trader@example.com
```

This scaffold seed creates workspace metadata only, not trades, positions, prices or performance. It is separate from the real workspace, and the overview selects a real workspace by default.

For this restricted cloud workspace, use writable tool caches:

```sh
export COREPACK_HOME=/workspace/.cache/corepack
corepack pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm-store
```

For browser tests, install Chromium once with `corepack pnpm exec playwright install chromium`, then run `corepack pnpm build` followed by `corepack pnpm test:e2e`. If the cloud environment already provides Chromium, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium corepack pnpm test:e2e`. To keep downloaded browsers inside this workspace, set `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` for both installation and testing. The E2E server uses port `3002` by default (`E2E_PORT` can override it).

## Commands and platform endpoints

| Command                                             | Purpose                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `corepack pnpm env:init`                            | Generate private local configuration once, preserving existing files                                                                             |
| `corepack pnpm db:up` / `db:down`                   | Start/stop local PostgreSQL services; the main volume is retained                                                                                |
| `corepack pnpm db:migrate`                          | Apply reviewed application/authentication/queue migrations and role grants                                                                       |
| `corepack pnpm db:check`                            | Check database/schema/role foundations                                                                                                           |
| `corepack pnpm user:create --email … --name …`      | Provision a real owner and empty workspace with secure password input                                                                            |
| `corepack pnpm db:seed --email …`                   | Create the explicitly labeled empty demo workspace                                                                                               |
| `corepack pnpm dev`                                 | Start web and worker together                                                                                                                    |
| `corepack pnpm dev:worker`                          | Run the worker independently in development                                                                                                      |
| `corepack pnpm build`                               | Compile the domain/worker and production Next.js application                                                                                     |
| `corepack pnpm start`                               | Start the built web and worker through the root launcher; standalone for HTTPS production, `next start` for local development/test configuration |
| `corepack pnpm start:web` / `start:worker`          | Start one built process independently                                                                                                            |
| `corepack pnpm api:generate` / `api:check`          | Generate/check the OpenAPI contract and typed client                                                                                             |
| `corepack pnpm format:check` / `lint` / `typecheck` | Check formatting, source boundaries and strict types                                                                                             |
| `corepack pnpm test:unit` / `test:integration`      | Unit and real-PostgreSQL platform tests                                                                                                          |
| `corepack pnpm test:e2e`                            | Real login, workspace, session, mobile/desktop and accessibility journeys                                                                        |
| `corepack pnpm db:migrate:check`                    | Check migration creation/idempotency in the isolated test database                                                                               |
| `corepack pnpm verify`                              | Run contract, formatting, lint, types, tests and builds                                                                                          |

The `TEST_*` database bindings are dedicated fixtures. Integration, migration and end-to-end setup create fixtures and clean their own test records; authentication rate-limit fixtures are reset; keep them distinct from development and real user databases. Playwright provisions its own test owner rather than requiring chat-supplied credentials. Browser setup uses verified Playwright Chromium or a configured supported system Chromium; consult [scaffold validation](docs/scaffold-validation.md) for the environment actually checked.

| Endpoint                                    | Access and response                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/v1/health/live`                   | Public process liveness only                                               |
| `GET /api/v1/health/ready`                  | Authenticated database/current-schema readiness; no internal credentials   |
| `GET /api/v1/session`                       | Safe user/expiry DTO or `null`; no session token in JSON                   |
| `GET /api/v1/workspaces`                    | Current authenticated user's authorized workspaces                         |
| `GET /api/v1/workspaces/{workspaceId}`      | Workspace-scoped read; another workspace is inaccessible                   |
| `POST /api/auth/sign-in/email` / `sign-out` | Allowlisted authentication operations with same-origin protections         |
| `GET /api/auth/session`                     | Safe session gateway; signup and raw library session endpoints are blocked |
| Worker `GET /health/live` / `/health/ready` | Loopback worker/queue health on port `3101` by default                     |

The worker's only current job is an infrastructure health probe. Imports, accounting rebuilds and exports are future jobs, not functioning integrations. Private storage currently supplies an immutable filesystem port and tests (UUID keys, a 20 MiB limit, checksums, private permissions, and symlink rejection); operators must keep its root and ancestors trusted. Application authorization belongs to callers; there is no public upload/download application workflow.

## Build, deployment, and progress

The approved architecture is Next.js 16.3.8 / React 19.3.0 / TypeScript 5.9.3, PostgreSQL 17 with Drizzle/node-postgres, Better Auth database sessions, Zod contracts, a shared server/domain boundary, Tailwind 4 and TanStack Query, and a pg-boss worker. Exact installed packages are recorded in the manifests and frozen lockfile. Approved chart/table/rule/instrument choices that are not needed by this scaffold remain future work.

Production requires HTTPS, an exact configured origin, runtime-injected secrets, persistent PostgreSQL/private storage, reviewed one-off migrations and compatible web/worker releases. With `NODE_ENV=production` and an HTTPS origin, the root launcher starts the built standalone Next.js server with its static assets and the built worker. Local development/test configuration uses `next start` for built-web smoke tests because the standalone server forces production mode; its standalone-output warning is expected in that local mode. The local HTTP settings are not production configuration. [Architecture](docs/architecture.md) and [accepted ADRs](docs/decisions/README.md) explain role isolation, storage, concurrency, configuration, and the vendor-independent production direction. No public deployment or live brokerage connection is performed by this scaffold.

The user's **Phase 3 scaffolding** maps to the original development plan's **Phase 2 platform increment**; the original plan's subsequent financial Phase 3 remains gated. [Scaffold validation](docs/scaffold-validation.md) records actual checks and limits. All 16 product acceptance scenarios remain scheduled; platform tests establish only their foundation portions, not a completed trading application.
