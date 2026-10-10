# Database foundation

This package contains only platform persistence: reviewed Better Auth models,
workspaces, memberships, display preferences, and credential-free audit events.
It does not implement trades, broker accounts, instruments, a ledger, or financial metrics.

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

Migration integration fixtures create and remove uniquely named temporary
`*_test` databases on that dedicated PostgreSQL test instance. Its operator test
credential must have `CREATEDB` (the local Compose test operator does). The tests
verify empty creation, original-platform upgrades with persisted identities,
sessions, preferences and audit history, repeated/concurrent migration,
tampered journal rejection, and atomic failure when historical IDs violate the
new UUIDv4 constraints. They never reset the development database or rewrite an
applied migration. Migration `0000` remains unchanged; `0001` is an additive
platform upgrade, with schema readiness version 2.
