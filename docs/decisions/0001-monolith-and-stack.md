# ADR 0001: Modular monolith and compatible TypeScript stack

- Status: Proposed for Phase 1 review; not implemented
- Date: 2026-10-06
- Resolves: requirements-analysis D-01 and the topology portion of D-16–D-17

## Context

The repository contains documentation and no established application stack. The product specification requires React, full-stack TypeScript, PostgreSQL, migrations, type-safe database access, runtime validation, and integration-free core workflows. Financial writes span fills, allocations, postings, audit, and derived state. Separate domain services would introduce distributed consistency problems before there is evidence of independent scaling needs.

## Decision

Use a **modular monolith** in one private pnpm workspace:

- Next.js 16 App Router with React 19 for the web interface and same-origin HTTP API; Node.js 24 LTS runtime, not an edge runtime for financial/database work.
- PostgreSQL 17 as the authoritative datastore, including a durable job queue. Use Drizzle ORM 0.45.x, Drizzle Kit 0.31.x, and node-postgres. Selected patches must satisfy Better Auth's compatibility requirements: ORM at least 0.45.2 and Kit at least 0.31.4 within these lines.
- TypeScript 5.9 as the compatibility baseline, strict mode, `noUncheckedIndexedAccess`, and exact optional-property checks. Do not select the registry's newest compiler without checking all tool peers: the selected OpenAPI generator currently supports TypeScript 5.x.
- pnpm 10 with an exact `packageManager` pin and committed lockfile at scaffolding. No Turborepo, Nx, message broker, Redis, GraphQL gateway, or independent backend service is needed initially.
- One codebase/release artifact, with separate web and worker entrypoints. A worker is a process role sharing domain modules and PostgreSQL, not an independently versioned business microservice.

Proposed package responsibilities:

| Path | Responsibility and allowed dependencies |
| --- | --- |
| `apps/web` | Next routes, server rendering, browser composition; server entrypoints call `server`, browser code imports `contracts` and `ui` only |
| `apps/worker` | Durable job entrypoint; calls `server` with explicit actor/workspace/service context |
| `packages/domain` | Framework-independent financial types, instrument modules, deterministic calculations and invariants; no database, HTTP, UI, clock, or provider I/O |
| `packages/contracts` | Zod request/response and operation schemas, public DTOs and generated API types; no persistence models or secrets |
| `packages/database` | Drizzle schema, reviewed SQL migrations, PostgreSQL repositories and transactional tenant scope; no React or HTTP |
| `packages/server` | Application commands/queries, authorization, repository ports, infrastructure adapters and composition; domain rules stay in `domain` |
| `packages/ui` | Shared React design-system components and presentation utilities; no database access or authoritative accounting |

Group features within modules rather than creating a package for every entity. Start with concrete repositories and narrow interfaces where isolation/testing requires them; avoid a generic repository framework or elaborate dependency-injection container. The composition root constructs services explicitly.

Imports flow from entrypoints toward application/domain. The `server` package's infrastructure layer implements its ports through `database`, storage, auth and queue adapters. Domain never imports application infrastructure. Browser bundles must not contain `database`, `server`, providers, authentication internals, or secret configuration. Enforce boundaries with ESLint restricted imports and package exports.

### Version policy

The versions above are selected architecture targets, **not installed or locked dependencies**. Use supported stable releases, no prereleases, and verify compatible exact patches in Phase 2 through official release documentation, package engines/peers, a frozen install, type-check, and a real build. Record the chosen versions in version pins and lockfiles then. Review upgrades as normal changes, with fixtures and migrations tested before adoption.

Read-only verification on 2026-10-06 confirmed that Node 24 satisfies Next's Node >=20.9, pg-boss 12's Node >=22.12, and pnpm 10's Node >=18.12 constraints. PostgreSQL 17 satisfies pg-boss's PostgreSQL >=13 requirement. This is compatibility evidence, not an executed application build.

## Alternatives considered

- **Vite SPA plus separate Fastify API:** viable, but adds independently configured routing/build/auth origins without a present need. Next provides a single UI/API host and server rendering.
- **Next server actions as the only API:** tightly couples durable commands and consumers to framework invocation. Explicit contracts and route handlers are selected in ADR 0002.
- **Microservices/event bus:** rejected initially because financial invariants benefit from local transactions and there is no demonstrated team or scale boundary requiring distribution.
- **Single package with no worker boundary:** simpler at first, but long-running imports/rebuilds need restart-safe execution independent of HTTP timeouts. Shared packages keep the additional process modest.
- **Latest version of every library:** rejected when peer requirements conflict; compatible supported lines are more important than unrelated version recency.

## Consequences

Deployment has one application release and one database. Modules, not brokers or asset families, define code boundaries. A process can scale horizontally later, but all replicas must use shared storage and PostgreSQL-backed state. Financial computation stays reusable in unit tests, API commands, jobs and future adapters. The workspace adds build-order and import-boundary checks; it does not create separate business services.

## Validation required in Phase 2

Verify dependency peers/engines, strict type-check and package-boundary lint; generate API types; build the Next Node runtime and worker; run them against PostgreSQL 17; prove browser bundles exclude server packages; prove local setup does not require external provider credentials. No such application validation has run in Phase 1.

## References

- [Product specification](../../Trading_Journal_Codex_Prompt.md), §§1–4, 13–15
- [Requirements analysis](../requirements-analysis.md), D-01, D-16, D-17
- [Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
- [Next official installation documentation source](https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/01-installation.mdx)
- [pnpm installation/compatibility](https://pnpm.io/installation)
- [Drizzle official repository](https://github.com/drizzle-team/drizzle-orm)
- [pg-boss official documentation](https://github.com/timgit/pg-boss)
- [Better Auth package compatibility metadata](https://registry.npmjs.org/better-auth/latest)
