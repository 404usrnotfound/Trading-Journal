# ADR 0008: Independent financial tests and vendor-neutral operations

- Status: Accepted in Phase 1; documentation baseline, not currently implemented
- Date: 2026-10-06
- Resolves: requirements-analysis D-16 performance, D-17 operations, D-18 verification, D-20

## Context

A successful build does not establish accounting accuracy, restore fidelity, authorization or usable workflows. Core operation must remain independent of integrations/subscriptions. The system needs practical development/deployment instructions, meaningful security/financial tests, and measurable performance rather than claims of production readiness.

## Decision

### Testing layers

| Layer | Selected tools | Required evidence |
| --- | --- | --- |
| Pure domain/unit | Vitest compatible stable line (currently 5), fast-check | Independent hand-calculated fixture results and official instrument specifications; decimal, units, FX, fees, invariants, missing/undefined cases |
| Database/application integration | Vitest against real PostgreSQL 17, isolated databases/schemas | Transactions, locks, tenant RLS, allocation conservation, ledger/import correction, outbox retry and migration fidelity; no SQLite substitute |
| UI/contract | React Testing Library and Vitest, generated OpenAPI contract checks | Validation/error/unknown states, relevant fields, safe DTO/decimal round trips, no generated drift |
| End-to-end | Playwright 1, axe-core integration | Primary journeys, independent-user isolation, CSV idempotency, attachments, backup/restore, reload/server restart, matching filters and keyboard journeys |
| Performance/operations | Repeatable seed/query/job measurements and Playwright timing | Documented workload/environment and budgets; inspect query plans, bounded responses, job memory/lag and restart behavior |

The [development plan](../development-plan.md) maps every AC-01–AC-16 scenario to a phase and evidence. Capability status may become native only after its independent fixtures pass. A fixture generated solely by the calculation code under test is not independent verification. Property checks supplement, rather than replace, economic examples. E2E assertions must examine persisted quantities, cash and results, not just visible success banners.

Use ESLint directly (Next 16 has no `next lint` workflow), strict `tsc`, Prettier, package-boundary checks, generated-contract drift checks and a real Next/worker build. Pin exact compatible test/tool patches in Phase 3; no application test suite or build is being installed/run in Phase 1 or Phase 2.

### Initial performance targets

These are **proposed engineering budgets**, not source-mandated numbers or achieved benchmarks. Establish the fixture before endpoints/jobs, measure on 4 vCPU/8 GiB with local PostgreSQL and no external providers, and record cold/warm state and concurrency (10 active read sessions, one bulk job):

- Representative workspace: 1 million fills, 2 million postings, 100,000 campaigns, 100,000 observations plus mixed strategies/accounts/currencies and incomplete data.
- Bounded 50-row indexed list: server p95 <=500 ms; bounded dashboard summary <=1 s; initial useful browser data <=2 s on the documented local network/test profile.
- 50,000-row source validation/commit workflow <=120 s excluding human review; deterministic million-fill rebuild <=10 min, with bounded chunks and no unbounded heap growth.
- A job must not degrade interactive-query budgets at the measured concurrency. If budgets fail, fix plans/indexes/batching first; change architecture or budget only with recorded evidence.

Each endpoint limits range/page/series size. Large reports/imports/rebuilds use the worker. Dataset assumptions are revised if actual event expansion differs; correctness and source fidelity never yield to a benchmark.

### Logging and observability

Use **Pino JSON logs** on the server/worker, `pino-pretty` only in development. Allowlist structured fields: timestamp, level, event/operation code, request/job/correlation ID, pseudonymous workspace/actor IDs, duration, record counts, revision and calculation version. Redact cookies, authorization headers, passwords/tokens, environment secrets, journal/source/file contents and sensitive financial payloads. Do not log bodies or SQL parameters by default.

Financial audit is a durable, authorization-controlled database record written atomically with changes; operational logs are not its replacement. Expose lightweight liveness and protected readiness checks for schema/DB, worker heartbeat/queue lag and storage health. Health responses reveal no credentials or detailed account information. Trace correlation across commands, outbox events and jobs; add OpenTelemetry/vendor reporting later only if justified and privacy-reviewed.

### Configuration and secrets

Use startup-validated Zod config and fail fast on missing required values or invalid production settings. Keep server configuration separate from browser-safe config; never export DB/auth/storage/provider keys through `NEXT_PUBLIC_*`. Document only names/non-secret defaults in the future `.env.example`; never commit actual `.env` files or production values.

Required server bindings: tenant DB URL, narrow auth DB URL, auth secret/base URL, allowed application origin, storage root/driver, job-role DB URL, limits/log level and environment. Migration DB URL belongs to one-off migration tooling, not browser/web runtime. Optional S3/provider/email settings do not block local core. Use runtime secret injection or a secrets manager, least-privilege role credentials, rotation procedures and HTTPS/TLS-verified network clients. No credentials will be requested or connected during this documentation phase.

### Local development and deployment

Provide Docker Compose for PostgreSQL 17 and optional app/worker containers with persistent DB/media volumes, alongside host Node 24/pnpm development. PostgreSQL service is private; the web server binds only the intended interface. A single documented dev command starts web and worker; migrations, bootstrap user, isolated demo seed and real empty workspace creation are explicit commands. A local filesystem store avoids an S3/paid-service dependency. Preserve TLS/signature/integrity verification during installation. CI uses frozen installs and an isolated PostgreSQL service.

Production baseline: Linux OCI containers, TLS reverse proxy, web plus worker from the same release/image, PostgreSQL 17, and either persistent private local media on a single host or shared private S3-compatible media for multiple replicas. No serverless/edge-only deployment assumption. Use one-shot reviewed migrations before replicas roll; readiness gates incompatible schemas and worker versions. Graceful shutdown stops new jobs and permits retryable unfinished jobs without losing posted facts.

Backups include PostgreSQL/PITR where available and coordinated media plus tested application workspace export/restore. Initially propose daily protected operational backups retained 30 days, an operational recovery target RPO <=24 h/RTO <=4 h for a single-host baseline, and verification by restore drills before a production-readiness claim. These are deployment policies, not a financial SLA; tighter goals require WAL/PITR and measured recovery. Immutable audit/financial sources are retained unless an explicit controlled retention/deletion policy is adopted. Log retention starts at 14 days with redaction and access control. Never treat volume deletion as a migration/rollback strategy.

Public deployment, live trading and live broker credentials remain outside current authorization. Document production steps without executing them.

## Alternatives considered

- **Mocks-only integration tests:** cannot prove PostgreSQL constraints/transactions/RLS or financial concurrency.
- **External observability/hosted auth as required services:** adds provider/cost dependencies to core workflows; optional adapters may be introduced later.
- **Serverless-only web with ephemeral storage/no worker:** mismatches durable files and heavy processing; supported only through an ADR establishing equivalent contracts.
- **Coverage percentages as acceptance:** useful secondary signal, insufficient for the required financial scenarios and independent fixtures.

## Consequences

CI requires PostgreSQL and browser tooling. Restore and performance checks are first-class deliverables with documented workloads. A deployable topology is selected, but no deployment or operational target is claimed validated until implementation and drills demonstrate it.

## Validation required

Before accepting the implemented foundation, run the exact compatible frozen install, strict lint/type/contract checks and Next/worker build against PostgreSQL 17. Validate the domain with independent fixtures, tenant/runtime roles with real database tests, and each available user journey with browser assertions on persisted state. Confirm sensitive values and file/journal contents are absent from logs and browser configuration, and core startup works without optional provider bindings.

Before delivery, attach measured seeded performance/query/job results, all scenario outcomes and capability limitations, desktop/mobile/accessibility evidence, and both workspace restore and coordinated operational recovery drills. Record actual RPO/RTO and workload differences; a proposed budget is not a passing check. These validations belong to later authorized implementation phases and have not run in Phase 1.

## References

- [Product specification](../../Trading_Journal_Codex_Prompt.md), §§12–15
- [Requirements analysis](../requirements-analysis.md), TE, IN, SE, AC-01–AC-16
- [Vitest](https://vitest.dev/)
- [fast-check](https://fast-check.dev/)
- [Playwright](https://playwright.dev/)
- [Pino](https://github.com/pinojs/pino)
- [Next installation/tooling documentation source](https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/01-installation.mdx)
