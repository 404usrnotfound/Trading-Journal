# Database foundation

This package contains only platform persistence: reviewed Better Auth models,
workspaces, memberships, display preferences, and credential-free audit events.
It does not implement trades, accounts, instruments, a ledger, or financial metrics.

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

Reviewed `SECURITY DEFINER` functions belong to the non-login migration role,
use pinned `pg_catalog` search paths and schema-qualified references, and have no
public execution grant. The privileged membership lookup prevents recursive RLS.
RLS does not claim to defend against a compromised backend able to forge its
own transaction settings; application session/action checks remain mandatory.

The migrations use Drizzle's supported SQL journal and migration ledger, a
deployment advisory lock, and verification of hashes for already applied files.
`migrateDatabase` is tooling-only. `verifyDatabaseSchema` checks release/schema
compatibility without changing data. Do not edit an applied SQL migration or use
schema `push` on shared data. Generate candidate changes with the package's
Drizzle config, review SQL including grants/RLS/constraints, and add a new migration.

`provisionRuntimeRoles` is an operator-only helper accepting generated passwords
from private configuration. It quotes identifiers/literals through PostgreSQL,
never returns the generated SQL, and reports sanitized failures. It grants queue
object access without domain/auth access. Queue schema migration is separately
controlled by the worker package's migration helper.

Real PostgreSQL tests run through the repository integration command against a
dedicated `_test` database. They exercise actual non-owner credentials, missing
and wrong context, pooled and nested rollback, composite foreign keys, immutable
audit permissions, live revocation, and atomic/concurrent owner retention. Fixtures
use generated identities and exact cleanup predicates; tests never truncate real
tables or substitute SQLite/mocked authorization.
