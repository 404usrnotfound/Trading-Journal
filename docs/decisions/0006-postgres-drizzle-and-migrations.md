# ADR 0006: PostgreSQL, explicit relational invariants, and reviewed migrations

- Status: Proposed for Phase 1 review; not implemented
- Date: 2026-10-06
- Resolves: requirements-analysis D-01 database/ORM, D-02 ownership keys, D-13 persistence, D-16 queries, D-17 migrations

## Context

Financial records need relational conservation, atomic writes, historical references, decimal precision, audit, reconciliation, and queryable provenance. Type-safe application queries alone do not prevent a cross-workspace relationship, concurrent over-allocation, unbalanced posting, or silently rounded database value.

## Decision

Use **PostgreSQL 17**, **Drizzle ORM 0.45.x/Kit 0.31.x**, and **node-postgres 8.x**. Drizzle is selected for transparent typed SQL and access to PostgreSQL-specific transactions, locks, constraints, numeric types and RLS. Use stable exact patches compatible with ADR 0001 when implementation begins.

### Data organization

- Domain entities have canonical identity `(workspace_id, id)`. IDs are UUIDv4 generated independently of business identifiers. Workspace-scoped primary/foreign keys preserve tenant isolation and allow domain IDs to survive restoration into a new workspace namespace. API object lookup always includes workspace identity.
- Authentication identity/session tables are global and managed through reviewed Better Auth-compatible migrations. Workspace/membership bootstrap is explicit and separate from financial tenant scope. Library identity is not synonymous with a tenant-owned financial record.
- Tenant-owned currency definitions can represent ISO fiat and applicable non-ISO settlement/collateral units; read-only standard codes may be reference data. Account base currency, individual balance currencies, quote/settlement/collateral currencies, and reporting currency remain distinct.
- Use relational columns/FKs for identity, amounts/currencies, event dates, version references, allocations and statuses. Use versioned validated JSONB only for subtype metadata, rule configuration, mapping templates and custom field payloads; never hide the complete ledger in an opaque JSON column.
- Store original source text/row provenance alongside canonical decimal values. `NUMERIC(78,36)` uses string codecs, never Drizzle's number mapping. Reject excess nonzero fractional precision/overflow **before** PostgreSQL coercion; test boundaries under ADR 0004.
- Store economic timestamps as `timestamptz`, retain source timezone/offset and original text/precision, and use `date` for explicit trade/settlement dates. Dates without a time remain dates, not invented midnight instants. Keep `recorded_at` separate from economic/effective time.

### Constraints and concurrency

Use composite workspace FKs and uniqueness on broker-scoped source identity, idempotency commands, versions and import fingerprints. Enforce ordinary row checks in SQL. Where invariants span rows, use reviewed SQL deferred constraint triggers or restricted posting functions plus the application transaction, with independent invariant tests:

- A posted event has at least two valid postings and sums to zero separately per currency.
- Posted events/postings and published version data cannot be edited or deleted through the application role; corrections append reversal/replacement links.
- Allocated quantities and each cost-currency component, including an explicit unassigned residual, conserve the source fill. Concurrent commands lock the fill and relevant account/instrument inventory in a deterministic order before checking totals.
- Internal transfers link both accounts/legs in the same workspace and preserve lot lineage; a receipt cannot appear twice.
- Source references cannot cross a workspace or point to archived/deleted replacement data incorrectly.

Use short transactions, bounded lock/statement timeouts, and explicit retry of safe transient serialization/deadlock failures under the same idempotency key. Default ordinary reads/writes to READ COMMITTED with locks and optimistic revisions for aggregate mutations; choose SERIALIZABLE for commands whose checked predicate cannot be guarded by a stable aggregate lock. Do not blindly retry every exception or hold a transaction during provider HTTP calls/file processing.

Authoritative source writes, financial invariant checks, affected inventory state, audit event, source revision and outbox insertion commit together. Heavy projections may run later but cannot be trusted as the sole input to the next inventory/risk-critical financial write. Prefer a direct bounded source query or synchronous affected-slice validation over relying on stale analytics.

### Authorization and query design

Application services verify identity, workspace membership, action capability and linked-object scope. Add RLS to tenant tables as defense in depth with transaction-local user/workspace context and non-owner `NOBYPASSRLS` roles. Enable/force RLS where applicable. Missing context must deny access. Auth, migrations and pg-boss have separately restricted roles/schemas; a broad worker role is not a tenant-access shortcut. Pool reuse must not retain previous tenant context. RLS is not claimed to protect against a compromised SQL-capable application that can choose its context.

Index common access paths beginning with workspace, account/instrument where relevant, economic time plus ID, campaign/strategy-version references, import identity, postings event and projection revision. Use SQL aggregates and bounded joins/projections; avoid N+1 queries. No partitioning or read replicas until measured volumes justify them. Reporting queries carry revision, filter population, reporting currency and calculation version.

### Migrations

Drizzle schema plus **checked-in reviewed SQL migrations** are authoritative. Drizzle Kit generates candidate SQL; review and amend SQL for constraints/triggers/RLS/indexes not represented adequately by generation. Never use schema `push` against shared/production data.

Run migrations as a dedicated one-off release step using a narrowly controlled migration role and a deployment advisory lock. Web/worker startup verifies compatible schema versions rather than migrating independently. Coordinate Better Auth and pg-boss schema changes in this step using the pinned tools' supported mechanisms; do not let a worker with restricted permissions implicitly upgrade the queue.

Use expand/backfill/contract changes with resumable backfills where necessary. Financial precision/policy/version changes require fixtures and explicit restatement rules. Test clean creation and upgrade from the prior release with representative historical records. Do not depend on automatic destructive down migrations; use an application-compatible rollback or tested backup/restore when rollback would otherwise lose records. Failed migrations stop deployment.

## Alternatives considered

- **Prisma:** viable typed client and migrations, but Drizzle's SQL visibility fits tenant predicates, numeric codecs, custom constraints, transaction context and lock control with less abstraction.
- **SQLite/document storage:** fails the prescribed PostgreSQL choice and complicates multi-user relational accounting/queue concurrency.
- **Raw SQL everywhere:** gives full control but loses useful type/schema tooling; reserve raw reviewed SQL for invariants and specialized queries.
- **Event sourcing for every entity:** unnecessary complexity. Use append-only financial facts/version history plus relational editable drafts and rebuildable projections.
- **RLS as the only authorization mechanism:** insufficient for action capabilities, attachment delivery and the trusted application context; server checks remain required.

## Consequences

This design has a PostgreSQL dependency for meaningful integration tests and some hand-authored SQL. It deliberately avoids pretending ORM validation replaces relational invariants. Tenant namespaces facilitate isolated demo/restore data. Migrations and auth/queue schema upgrades become release artifacts, not incidental application startup behavior.

## Validation required

Real PostgreSQL tests for cross-tenant FK/RLS failures, pooled-context isolation, atomic rollback, balanced postings, concurrent allocation/lot consumption, no mutable posted rows, numeric round trips and rejection before coercion, source idempotency, migration upgrade/backfill/recovery, and query plans/budgets at representative scale. The schema and migrations do not exist in Phase 1.

## References

- [Product specification](../../Trading_Journal_Codex_Prompt.md), §§4, 11, 13–14
- [Requirements analysis](../requirements-analysis.md), D-02–D-04, D-13–D-17
- [Drizzle PostgreSQL support](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle migration guidance](https://orm.drizzle.team/docs/migrations)
- [PostgreSQL numeric types](https://www.postgresql.org/docs/17/datatype-numeric.html)
- [PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
