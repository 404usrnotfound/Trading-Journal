# Database persistence

Current baseline: application schema **17**, with reviewed SQL `0000`–`0016`. The phase-specific paragraphs below describe schema evolution; they are not the complete current migration list. Use the [developer database guide](../../docs/developer-guide/database-migrations.md) for current models/tooling/safety, [database operations](../../docs/operations/database-management.md) for deployed maintenance and [final documentation validation](../../docs/documentation-validation.md) for executed evidence. The application, queue migration and runtime-role provisioning phases are separate, not one global transaction.

This package contains platform persistence and the additive Phase 4 financial
schema: reviewed Better Auth models, workspaces, memberships, display preferences,
credential-free audit events, financial catalogs, source facts, balanced postings,
canonical inventory, allocations and observations. Pure financial calculations
belong to `packages/domain`; authorized financial commands belong to
`packages/server`. See the [core ledger guide](../../docs/core-ledger.md) and
[financial metrics](../../docs/financial-metrics.md) for current API behavior and
limits. Schema availability does not establish complete financial workflows or
product acceptance; executed evidence belongs in
[Phase 4 validation](../../docs/phase-4-validation.md). Phase 5 adds workspace-owned
strategies, immutable definitions, trade-version pins and private attachment
metadata; see [strategy management](../../docs/strategies.md) and
[Phase 5 validation](../../docs/phase-5-validation.md).

Phase 7 adds immutable portfolio versions/membership, typed account cash events and evidenced cash transfers/receipts in [accounting-schema.ts](src/accounting-schema.ts) and the additive [0007 migration](migrations/0007_portfolio_accounting.sql). Relational tenant/source links, append-only history, atomic commands and exact source-to-cash conservation are enforced in SQL; transit ownership is calculated from actual evidence. See [portfolio accounting](../../docs/portfolio-accounting.md).

Use `createDatabase(url)` to create a pool and typed Drizzle client. Runtime URLs
must use the separated `journal_app`, `journal_auth`, and `journal_jobs` roles.
Never pass the operator migration URL into the running web or worker.

Tenant queries use `withTenantTransaction(database, { actorId, workspaceId }, fn)`.
Actor IDs come from a verified server session. The helper binds transaction-local
settings, which RLS combines with current membership. `withActorTransaction` is
only for own-membership bootstrap; ordinary tenant records require a workspace.
`listOwnWorkspaces` and `createPersonalWorkspace` use narrow, actor-scoped database
functions. One real personal workspace per creator is allowed; labeled demo
workspaces are separate. Viewer preferences are self-owned; workspace settings
require owner membership. Runtime callers cannot directly modify memberships.

Operator bootstrap/seed can use `ensurePersonalWorkspace` to recover an initial
user whose workspace was not yet created and safely repeat concurrent setup.
It locks by verified creator/environment inside one transaction and checks both
current owner membership and `created_by`. Membership in another creator's
workspace is never treated as a personal workspace. Real workspaces are reused
after a rename; demo seed retries match their label, and additional separately
labeled demo workspaces remain permitted. Password verification belongs to the
supported authentication API before this database helper is invoked.

Workspace preferences expose an integer `revision` starting at 1. Owner updates
check the caller's expected revision inside the tenant transaction and increment
it with the change; stale requests do not overwrite another accepted update.
`timezone` and nullable `reportingCurrency` are display/evaluation preferences,
not a financial currency registry or ledger operation.

Reviewed `SECURITY DEFINER` functions belong to the non-login migration role,
use pinned `pg_catalog` search paths and schema-qualified references, and have no
public execution grant. The privileged membership lookup prevents recursive RLS.
RLS does not claim to defend against a compromised backend able to forge its
own transaction settings; application session/action checks remain mandatory.

The migrations use Drizzle's supported SQL journal and migration ledger, a
deployment advisory lock, and verification of hashes for already applied files.
Applied migration history must exactly match a prefix of the reviewed journal,
including order and timestamps; missing, changed, duplicate or unknown entries
stop migration before any new application SQL is applied. Waiting for the
deployment lock is bounded to 30 seconds.
`migrateDatabase` is tooling-only. `verifyDatabaseSchema` checks release/schema
compatibility without changing data. Do not edit an applied SQL migration or use
schema `push` on shared data. Generate candidate changes with the package's
Drizzle config, review SQL including grants/RLS/constraints, and add a new migration.

`provisionRuntimeRoles` is an operator-only helper accepting generated passwords
from private configuration. It quotes identifiers/literals through PostgreSQL,
never returns the generated SQL, and reports sanitized failures. It grants queue
object access without domain/auth access. Queue schema migration is separately
controlled by the worker package's migration helper.

Queue migration metadata is protected from the runtime role: `queue.version`
and asynchronous-DDL `queue.bam` are read-only, except column-level UPDATE on
`queue.version.flow_on` required by pg-boss's runtime dependency-flow cadence.
The schema-version number and other deployment cadence fields cannot be
changed, inserted or deleted. Runtime function execution is limited to
`queue.job_now()`; queue creation/deletion and migration helpers require the
operator connection. Repeated provisioning reapplies these restrictions after
the general queue job-table grants.

The `auth.security_events` table records only stable actor/subject identifiers,
action, request identifier, and time for authentication lifecycle audit. An
operator actor can be null; the subject is always identified. Identity deletion
does not delete that audit history. The auth role has INSERT/SELECT only; tenant
and queue roles cannot access it. No session token, hash, password, cookie,
personal input, or provider payload belongs in either audit table. Authentication
library writes and their security-audit insert are separate operations unless a
library-supported transaction explicitly binds them; this does not claim an
atomic cross-pool authentication transaction.

Real PostgreSQL tests run through the repository integration command against a
dedicated `_test` database. They exercise actual non-owner credentials, missing
and wrong context, pooled and nested rollback, composite foreign keys, immutable
audit permissions, live revocation, and atomic/concurrent owner retention. Fixtures
use generated identities and exact cleanup predicates; tests never truncate real
tables or substitute SQLite/mocked authorization.

The financial schema is declared in [financial-schema.ts](src/financial-schema.ts)
and enforced by the reviewed [0002 migration](migrations/0002_core_financial_ledger.sql).
Financial IDs are UUIDv4 with `(workspace_id, id)` primary keys and composite tenant
references. Financial tables are owned by the non-login migration role and use
forced RLS: current viewers can read; editor/owner commands can write. Authentication
and same-origin/session-CSRF checks still belong to the server boundary.

Financial numeric columns are generated `NUMERIC(78,36)` values from canonical
text columns. The immutable `app.financial_decimal` SQL function checks lexical
form and the 42-integral/36-fractional-digit envelope before the numeric cast,
rejecting overprecision instead of allowing PostgreSQL to round it silently.
Accepted canonical text has no insignificant trailing zeros, negative zero,
exponent notation or non-finite values. API normalization and preserved request
provenance are separate from these canonical stored scalars. Generated columns
cannot receive a caller-supplied numeric value that bypasses raw-text validation.
Display scale and actual settlement increment remain separate versioned fields.

The workspace financial-state revision serializes commands. Financial source
revisions use PostgreSQL `INTEGER`; public revision strings are bounded to
`0`–`2147483647`, with accepted source facts requiring a positive revision.
Economic `orderingKey` is a separate nonnegative integer string, limited to 80
digits by the command contract; it is not the workspace revision. Economic
timestamps retain PostgreSQL microsecond precision and remain distinct from
recording time.

Source executions, openings, fees, cash movements, conversions, ledger events,
postings, allocation/cost-attribution versions, observations, supersessions,
transfers and closure records have append-only runtime privileges. Catalog headers
have restricted editable columns; canonical holding books, positions, lots and
matches are controlled rebuildable state. Deferred constraints require source
facts to match their new atomic command/revision, at least two exactly balanced
postings per event currency, exact reversal targets/currencies, conserved
execution/cost partitions, compatible transfer ownership and current canonical
inventory quantities. A committed command cannot acquire additional source
effects. Its stored idempotent result, audit event and outbox intent commit with
the source facts; failed constraints roll the entire command back.

Source monetary checks independently conserve booked execution principal, actual
fees, cash movements, both actual FX legs and each supplied manual settlement
effect. An execution's confirmed settlement reclassifies its existing obligation;
it is not another principal booking. The deferred settlement trigger requires an
effective execution in the same currency, one nonzero unsettled posting and one
settled posting in that execution's account, and no settlement before its source
execution. It checks every economic-time/source-revision prefix, including future
settlements, so an unsourced, wrong-sign or already consumed obligation cannot
be settled again. The server additionally guards isolated corrections with
confirmed settlement or holding-transfer descendants pending grouped restatement.

Migration integration fixtures create and remove uniquely named temporary
`*_test` databases on that dedicated PostgreSQL test instance. Its operator test
credential must have `CREATEDB` (the local Compose test operator does). The tests
verify empty creation, original-platform upgrades with persisted identities,
sessions, preferences and audit history, repeated/concurrent migration,
tampered journal rejection, and atomic failure when historical IDs violate the
new UUIDv4 constraints. They never reset the development database or rewrite an
applied migration. Migration `0000_platform_foundation` remains the original
platform migration; `0001_platform_identity_constraints` remains the additive
platform identity upgrade that established readiness version 2. Neither historical
migration is rewritten by Phase 4. The additive `0002_core_financial_ledger`
migration creates the financial foundation and established schema readiness
version 3. Phase 5's additive `0003_strategy_management` established version 4.
The forward-only `0004_strategy_definition_size` migration independently enforces
the shared compact UTF-8 definition size limit without changing published migration
files or strategy snapshots, establishing schema **version 5**. Phase 6 adds the forward-only
`0005_trade_journal` migration, establishing schema **version 6**. The additive
`0006_journal_label_integrity` migration rejects labels blank after shared-contract
Unicode trimming and normalized duplicate labels, advancing the current release to
**version 7**, checked
read-only by [readiness.ts](src/readiness.ts).
Runtime readiness also requires PostgreSQL 17.
Use the root's `corepack pnpm db:migrate`, `corepack pnpm db:migrate:check` and
`corepack pnpm test:integration` commands with the documented private environment
bindings; schema readiness alone does not certify every financial capability.

The strategy schema is declared in [strategy-schema.ts](src/strategy-schema.ts).
Strategy identities select a current immutable `strategy_versions` snapshot.
Publication advances both the identity revision and contiguous version sequence;
archive advances the identity revision while retaining its last version. Deferred
constraints require the current pointer and complete attachment reference set
to match the accepted publication. Published definitions, typed attachment links,
command responses and trade-version pins cannot be updated or deleted.

`strategy_commands` and atomic audit records are independent of financial source
revisions. Strategy/attachment commands share a workspace advisory mutex; identity
and attachment row locks protect publication, archive, pinning and file removal.
Trade classification changes also serialize with the existing financial catalog
lock, without posting new cash or rebuilding authoritative inventory. Forced RLS
and composite workspace references apply to every new table.

Private attachment metadata progresses from pending reservation to ready after
file publication and checksum verification. Removal commits a tombstone before
filesystem cleanup, and all historical version references prevent removal. The
filesystem does not share the PostgreSQL transaction: retries resume pending
uploads or removal cleanup, and crashes can leave unpublished private objects
requiring operator review. No file is served from a pending/removed reservation.

The Phase 6 journal schema is declared in [journal-schema.ts](src/journal-schema.ts).
`journal_entries` selects the latest complete append-only `journal_revisions`
snapshot. Optimistic revisions advance one at a time, with one atomic command
and matching actor/action audit for every accepted save, plan publication or risk
supplement. Journal mutations serialize against the financial-state row and
workspace attachment mutex without advancing the financial source revision.
Trade creation remains an existing financial catalog command.

Published `journal_plan_versions` are contiguous and immutable. The first plan
requires a once-only `journal_plan_commitments` record. PostgreSQL supplies its
server commitment clock, captures the locked financial revision and derives
pre-trade versus retrospective timing from effective allocated executions. Later
plans and separately recorded `journal_risk_additions` cannot replace the original
plan or its risk denominator. Closed campaigns remain reviewable; new plan and
risk publications require an active, unarchived campaign.

Strict JSON checks require complete snapshots, exact supported Decimal strings,
Unicode character-length parity with shared validation, and a compact UTF-8 maximum of
128 KiB. Deferred checks independently validate campaign legs, risk currencies,
strategy pins, setup/checklist identities, command effects and complete private
attachment reference sets. `journal_revision_attachments` records planning or
before/during/after evidence, while `journal_plan_attachments` protects published
plan files. Both reuse the private file registry and prevent removal of any
historically referenced object, including files removed from a later draft.

All eight new tables use composite workspace references and forced row-level
security. Viewer membership permits reads; editor/owner membership permits
authorized writes, with the actor bound to the transaction. History tables have
insert-only runtime grants plus immutable triggers. Database integrity does not
replace session verification, CSRF checks or server-side action authorization.
The Phase 6 database integration suite exercises direct runtime SQL and a
populated Phase 5 prefix upgrade, preserving all earlier rows and migration hashes.

The forward-only label-integrity migration uses an exact ECMAScript
`String.trim` whitespace helper, including tabs, nonbreaking spaces and the byte
order mark. Independent constraints reject blank revision/publication reasons,
risk-supplement methods/reasons, risk-method labels and subjective label arrays.
Uniqueness applies after the same trim normalization used by the shared contract,
so distinct raw strings cannot create unreadable duplicate labels. Existing facts
are validated by the new constraints without rewriting history; any incompatible
row stops migration rather than silently changing an immutable journal.
