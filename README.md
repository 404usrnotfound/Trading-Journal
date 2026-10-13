# Trading Journal

A broker-independent, multi-asset trading journal. Phase 3 supplies the authenticated shell, persisted workspace preferences, PostgreSQL-backed API, private storage and durable worker. Phase 4 adds financial catalogs, balanced cash commands, ordinary share/ETF/non-rebasing spot inventory, campaign attribution, corrections and explicit price/FX valuation through authenticated APIs. Phase 5 adds strategy management screens, immutable playbook versions, explicit trade references and private strategy attachments. Phase 6 adds trade planning and review, immutable original plan/risk, draft history, private evidence and calculated ledger detail. Phase 7 adds versioned portfolio scopes, typed income/taxes/expenses, evidenced delayed cash transfers and reconciled account reporting. Phase 8 adds a tested campaign analytics API with metric definitions, explicit eligibility, original-risk R, monetary drawdown/recovery and 14 historical breakdown dimensions. Phase 9 adds a responsive dashboard with shared filters and trade drill-down. Phase 10 adds canonical import adapters, universal CSV mappings, reviewed dry runs, scoped duplicates/corrections and import history. Full financial entry screens, bulk imports, exports/restore and later product workflows remain deferred.

Read the authoritative [product specification](Trading_Journal_Codex_Prompt.md), [requirements](docs/requirements-analysis.md), [architecture](docs/architecture.md), [domain model](docs/domain-model.md), and [development plan](docs/development-plan.md). [Core ledger](docs/core-ledger.md), [financial metrics](docs/financial-metrics.md), [strategy management](docs/strategies.md), [trade journal](docs/trade-journal.md), [portfolio accounting](docs/portfolio-accounting.md), [analytics definitions](docs/analytics-definitions.md), [dashboard semantics](docs/dashboard.md) and [imports](docs/imports.md) describe the current application. [Scaffold validation](docs/scaffold-validation.md), [Phase 4 validation](docs/phase-4-validation.md), [Phase 5 validation](docs/phase-5-validation.md), [Phase 6 validation](docs/phase-6-validation.md), [Phase 7 validation](docs/phase-7-validation.md), [Phase 8 validation](docs/phase-8-validation.md) and [Phase 9 validation](docs/phase-9-validation.md) record the executed checks and limits for their increments.

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

Visit **http://localhost:3000/sign-in**. `dev` starts web and worker together; Ctrl+C stops only its managed processes. The owner starts with an empty personal workspace. Open **Strategies** to create a playbook, publish an edited version, browse history and attach a screenshot or reference document. Open **Journal** to create an idea or review an existing trade, autosave a plan and review, publish a plan snapshot and attach before/during/after evidence. Catalog-linked legs use existing accounts and instrument versions; create financial catalogs through the [ledger API](docs/core-ledger.md). Fills and cash can be recorded through that API or reviewed through **Imports** using existing catalog identities. Open **Analytics dashboard** for consistently filtered metrics/charts. An empty idea has no fabricated financial metrics. Edit the workspace's IANA timezone and optional reporting-currency code preference to test persistence; this preference is separate from the financial currency registry and the explicit reporting currency required by valuation requests.

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
corepack pnpm test:unit
corepack pnpm test:integration
corepack pnpm api:check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

`test` runs both listed test commands: unit/property/UI tests followed by real-PostgreSQL integration tests, including financial fixtures and ledger/API boundaries. `verify` combines API drift, formatting, lint, type checking, tests and the production build. Integration tests require the running test service; guards reject development bindings, ambiguous URLs and non-`_test` databases. Migration tests create/remove uniquely named temporary databases only on that test instance; its operator credential needs `CREATEDB`. Never substitute a production operator URL.

Run browser and axe checks after building:

```sh
corepack pnpm exec playwright install --with-deps chromium
corepack pnpm test:e2e
```

Playwright provisions generated test identities and starts built web assets on port 3002 against the isolated test database. Its journeys check login/logout, preferences, concurrency, keyboard access, desktop/mobile layouts and both themes, financial API persistence, strategy publication and historical trade pins, journal planning/review, original-risk R, private files, viewer permissions and dashboard filters/drill-down. Actual executed outcomes are recorded in the increment validation documents linked above. Comprehensive financial entry journeys remain deferred. If browser downloads are unavailable but a compatible Chromium is installed, use the explicit supported override:

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

No financial examples are seeded automatically. The [manual paper-account API example](docs/core-ledger.md#manual-api-example) creates explicitly selected test facts. Without SMTP, an operator can recover an existing user's password with the same hidden-input command:

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
- `/api/v1/workspaces/{workspaceId}/financial/{resource}`: viewer reads and editor/owner commands, strict decimal-string contracts, UUIDv4 `Idempotency-Key`, same-origin/session-CSRF checks, tenant RLS and atomic audit/outbox intent. See [core ledger](docs/core-ledger.md) for resources, filters and exact request examples.
- `/api/v1/workspaces/{workspaceId}/strategies`: strategy CRUD, immutable history and linked trades; viewer reads, editor/owner mutations, optimistic revisions and command retries. Financial trade creation can explicitly pin a strategy version.
- `/api/v1/workspaces/{workspaceId}/strategy-attachments`: private PNG/JPEG/WebP/PDF uploads up to 10 MiB, authorized delivery and removal of unused files. Historical version references prevent file deletion. See [strategy management](docs/strategies.md).
- `/api/v1/workspaces/{workspaceId}/journals`: trade-detail reads, draft saves, immutable published plans, original-risk commitments, supplemental risk and saved revision history. Viewer reads and editor/owner mutations use the same authentication, CSRF and tenant boundaries. See [trade journal](docs/trade-journal.md).
- `/api/v1/workspaces/{workspaceId}/analytics/reports`: bounded read-only campaign analytics for current viewers, with explicit financial and recorded-metadata cutoffs, tested definitions, source dependencies and missing-input states. See [analytics definitions](docs/analytics-definitions.md). It needs no new package, secret or migration; the existing setup commands apply.
- `/api/v1/workspaces/{workspaceId}/accounting`: immutable portfolio definitions, gross income/withholding, taxes/refunds, financing expenses, cash departure/receipt and read-only revision-pinned reports. See [portfolio accounting](docs/portfolio-accounting.md) for scope boundaries, reconciliation equations and worked examples. The existing install/migration/start commands apply; no new dependency or secret is required.
- `/api/v1/workspaces/{workspaceId}/journal-attachments`: the existing private workspace registry, with before/during/after journal and planning references. Historical journal and plan references also prevent file deletion.
- `/api/v1/workspaces/{workspaceId}/imports`: universal/canonical CSV, immutable mapping versions, staged source rows, reviewed preview/commit, scoped duplicate detection, explicit cash/fill corrections, conservative cash reversal and paginated history. Sources are bounded private PostgreSQL text under RLS. See [imports](docs/imports.md) for contracts, limits and broker-adapter extension; no broker credentials or new dependency are required.

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
packages/domain    Pure decimal, postings, inventory, allocation and valuation kernel
packages/server    Auth, authorization, financial services, config, errors, logs and storage
packages/ui        Shared presentation components
scripts            Setup, migration, seed, provisioning and process launchers
tests              Unit/property, React, PostgreSQL integration and browser tests
docs               Approved design, ADRs and verification records
```

The [Phase 2 calculation contracts](docs/financial-calculations.md), [capabilities](docs/instrument-capabilities.md) and [independent financial fixtures](docs/financial-fixtures.md) remain the requirements for financial implementation. Passing scaffold or financial backend checks does not complete AC-01–AC-16.

## Phase 4 scope

Financial amounts use JSON decimal strings, PostgreSQL `NUMERIC(78,36)` and an isolated Decimal.js 160-digit HALF_EVEN context. Cash events balance by currency; fills retain actual quote price separately from booked principal, and fees retain their charged currency. Native netted inventory supports FIFO, eligible average and specific lots, fractions and zero-crossing. Securities shorts additionally require explicit borrow/carry conventions; crypto spot longs do not enable short/lending wrappers. Other asset families have manual recording with nullable unknown economics and explicit cash effects; automatic advanced valuation remains unavailable.

Cash and holding transfers commit synchronously with conserved lineage. Campaign FIFO attribution is distinct from account lot realization. Corrections append reversals/replacements and rebuild canonical inventory, with guards for transferred descendants and reviewed allocations. Price/FX observations and historical references retain provenance. Valuation requires explicit account IDs, reporting currency, as-of instant, source priorities and freshness windows; missing inputs produce explained null metrics or partial NAV, never invented zero.

Valuation returns the current source revision, calculation manifests and selected dependencies for an as-of restatement. Archived reports and tested restore are deferred. Automated risk assessment, full broker-statement reconciliation, advanced native events, broker integrations, account-return analytics/background projections, exports and complete product journeys remain later work. Phase 7 supplies evidenced delayed cash transfers, monetary transit and the revision-pinned interval accounting API; holding transfers remain synchronous. Phase 8 supplies the separately defined campaign analytics engine. Phase 10 imports use these same financial commands and reconcile explicitly identified fill-cash rows without double posting.

## Phase 5 scope

Strategies are first-class workspace identities with complete immutable versions. Every saved edit publishes the next version; a trade's explicit version pin preserves its original rules, checklist, parameters and attachment references. Existing unclassified trades can receive an explicitly retrospective link. Strategy deletion archives the identity and retains history. Strategy screens support creation, editing, filters, detail, historical definitions and linked trades; all data uses server persistence.

This increment adds no strategy performance metrics or automatic rule/risk assessments. Narrative rules and exact typed parameters describe the playbook without executing user expressions or inventing an R denominator. Follow [strategy management](docs/strategies.md) for exact semantics and [Phase 5 validation](docs/phase-5-validation.md) for test evidence. No additional package, service or external credential is required; existing migration and development commands apply the new additive schema.

## Phase 9 dashboard

Open **Analytics dashboard** from Overview or the workspace navigation. Select dates, currency and account scope, then apply filters. Performance, Distributions and Breakdowns share the same applied generation. Exact-value tables provide keyboard drill-down to supporting trades. Light/dark appearance follows the existing theme control.

See [dashboard semantics](docs/dashboard.md) for populations, freshness policies, history gaps and limits, and [Phase 9 validation](docs/phase-9-validation.md) for verification evidence. Recharts is pinned in the lockfile; the existing frozen install, migration, test and startup commands remain unchanged. No new environment variable, secret or migration is needed.

## Phase 10 imports

Run the existing `corepack pnpm db:migrate` and `corepack pnpm db:check` after updating the checkout. Additive migration `0008_broker_agnostic_imports.sql` advances application schema readiness to version 9; prior migrations remain unchanged. Existing install, test and startup commands apply with no new secret, package or service.

Open **Imports**, choose the account and a stable source namespace, upload UTF-8 CSV, configure its conventions/field mapping or choose a saved template, and stage the source. Select complete groups and review the dry run before committing; resolve row errors and explicitly acknowledge retained-column warnings. Dates, monetary signs, currency IDs, instrument versions and cost completeness are explicit. Previewing does not post financial facts. Identical reimport is a financial no-op; changed stable source IDs require review and reason.

Sources are limited to 2 MiB and 1,000 rows; each reviewed selection has at most 100 rows. History and original accepted source download remain private to the workspace. Automatic reversal is conservative and limited to independent cash movements; fills and dependent history use explicit domain correction. Imported fills do not create journal campaign attribution automatically.

[Import semantics and adapter extension](docs/imports.md), [ADR 0011](docs/decisions/0011-broker-agnostic-imports.md) and [CSV/mapping examples](docs/examples/imports/README.md) explain how another broker parser can use this pipeline without changing the core domain. [Phase 10 validation](docs/phase-10-validation.md) records verification progress and executed results. Delivered adapters are universal mapping and application canonical interchange; no named broker compatibility, full statement reconciliation, large background imports, exports or backup/restore is claimed.
