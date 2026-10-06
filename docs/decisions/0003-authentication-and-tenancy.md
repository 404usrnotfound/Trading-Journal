# ADR-0003: Database-backed authentication and workspace authorization

- **Status:** Proposed
- **Date:** 2026-10-06
- **Requirements:** Specification §1, §4, §13–14; F-AU-01–04, N-AU-01, F-SE-01–03; decisions D-02 and D-17; acceptance scenario AC-14.

## Context

Financial records, journal content, original import files, attachments, and exports must be private to the correct workspace. Authentication must work in local development without a paid identity provider. The specification requires ownership and isolation but does not require a team administration product. A browser-selected workspace or a known record UUID is not evidence of access.

The backend must establish one authorization contract shared by Next.js route handlers, server-rendered queries, application services, workers, and file delivery. PostgreSQL row-level security (RLS) is useful additional protection against a missed tenant predicate, but requires deliberate handling of global authentication tables, connection pooling, and privileged migration credentials.

## Decision

### Authentication and sessions

Use **Better Auth 1.x**, with its PostgreSQL Drizzle adapter, for email/password authentication. Pin a supported release and its compatible Drizzle versions during scaffolding; the references below establish the approach, not a claim that a dependency has been installed or tested. Keep password hashing inside the maintained authentication library, using its documented `scrypt` implementation. Verify the selected release's parameters and resource costs against current password-storage guidance before accepting the authentication foundation.

Use opaque database-backed sessions in PostgreSQL. Disable session cookie caching and stateless/JWT session modes: revocation must be checked against persisted state on each protected request, and cookies must not carry workspace roles or authorization claims. Proposed initial policy is a seven-day session expiry with automatic refresh disabled, a five-minute freshness window for account-security operations, and revocation of other sessions on password change and all sessions on password reset. These are configurable operational defaults, not product requirements.

Production session cookies are host-only, `HttpOnly`, `Secure`, and `SameSite=Lax`. Local HTTP development is explicitly limited to loopback and uses the library's development cookie behavior. Production requires HTTPS; cross-subdomain cookies, wildcard trusted origins, and public bearer-token APIs are disabled. Browser persistence must never store authentication tokens in `localStorage`.

Resolve the session on the server and project it into an explicit public user/profile DTO. Raw authentication-account rows, session tokens, hashes, verification records, IP addresses, and provider credentials are not application response models. Better Auth's standard email-sign-in response includes `session.token`, so an unfiltered public catch-all handler does not satisfy this contract.

Use a **route-specific authentication transport gateway** around the pinned library's supported server APIs/handler or documented response hooks. The library still performs authentication, hashing, session persistence, CSRF/origin checks, and auth rate limiting; the gateway authorizes the exposed route and shapes its response without replacing those mechanisms. Preserve every individual `Set-Cookie` header, required status/redirect/security headers, and cookie expiry/revocation behavior while emitting an allowlisted application-owned DTO. Do not fold multiple `Set-Cookie` headers into one comma-separated value or silently drop headers when rewriting JSON. Prove the supported gateway/hook integration against the exact release in Phase 2 before accepting the auth foundation.

The browser uses an application-owned typed auth client contract, not a client that assumes the library's complete public session response. Expose only needed sign-in/sign-out/password/recovery endpoints and safe profile/session-status DTOs; do not mount an unrestricted public catch-all or raw `get-session`/`list-sessions` routes. Obtain authorization sessions through the supported **server** API. For self-session management, return safe session IDs and approved device/time descriptors; the authenticated server checks ownership, resolves the corresponding token internally, and invokes the library's supported revocation API. No browser request or response needs to carry that token. UI capability hints never authorize a command.

### Initial users and workspace membership

Public signup is **off by default**, using Better Auth's documented email/password signup setting. Provision the initial user and personal workspace through an operator-only command that is not mounted as an HTTP route. It invokes the pinned library's supported account-creation API in a non-listening provisioning context; enabling signup for that context must not enable the public server endpoint. Prompt for passwords without echoing or passing them in command-line arguments, and never supply shared/default credentials.

One personal workspace is the initial product workflow. Model membership separately as `(workspace_id, user_id, role)` with `owner`, `editor`, and `viewer` capabilities. Team invitations, collaboration UI, OAuth, and MFA can be added later without changing financial ownership; they are not required for the initial manual-core delivery. Do not introduce a public cross-workspace administrator or impersonation capability.

| Capability | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| Read workspace records, authorized files, and ordinary filtered exports | Yes | Yes | Yes |
| Create/edit domain records, post/correct financial events, commit imports, edit strategies/risk policies | Yes | Yes | No |
| Manage members, transfer ownership, change workspace configuration, create full backups, restore a workspace | Yes | No | No |
| Change own password/preferences or revoke own sessions | Yes, for self | Yes, for self | Yes, for self |

Preserve at least one owner through transactional ownership changes. Workspace creation atomically creates the creator's owner membership and an empty real workspace. Demo data belongs to a separately labeled workspace and has no privileged access to real data.

Email delivery is optional infrastructure for verified-email/self-service recovery. An operator-provisioned local account can sign in without SMTP; the application does not display a working reset-email flow when delivery is unconfigured. Document an operator-only recovery procedure using the supported authentication API and session revocation. Enabling public signup later requires an explicit policy for verification, abuse controls, recovery, and mail delivery.

### Application authorization boundary

Every request authenticates, derives the actor from the verified session, validates the requested workspace, and loads current membership from the database. An application service receives an immutable server-created authorization context with actor, workspace, capabilities, and request identifier. Never construct this context from request-body ownership fields.

Authorize the action and each related record inside the database transaction, then run the domain command. Reject cross-workspace links even when both UUIDs are valid. Tenant entity identity is `(workspace_id, id)`, where `id` is UUIDv4; primary keys, uniqueness constraints, and foreign keys carry the workspace where appropriate. This supports stable business IDs when restoring records into a new workspace namespace and prevents a relation from crossing tenants.

Return a consistent not-found response for inaccessible object IDs where that avoids disclosing existence. Scope lists, aggregates, saved views, audit-history queries, cache keys, exports, and attachment/source-file delivery by workspace. Do not rely on hidden buttons, URL paths, storage keys, queue payloads, or a signed URL alone.

User-requested workers reauthorize the initiating user and required capability when they start and before publishing an export or committing a delayed import. Revoked membership cancels/rejects that work. Trusted system projection work is a distinct constrained service capability tied to an authenticated outbox event and an existing workspace; it never impersonates a user or gains unrestricted tenant access. Downloads always reauthorize the current requester, including artifacts created earlier. See [ADR-0007](0007-private-storage-and-durable-jobs.md).

### PostgreSQL defense in depth

Use separate credentials/roles for migrations, global authentication, tenant application queries, and queue operation:

- The migration role owns schema changes and RLS policies; it is unavailable to the running web and worker containers.
- Better Auth uses a narrow connection that accesses its global identity/account/session/verification/rate-limit tables. Those tables do not receive a fictitious workspace ID or a policy that breaks login. They are inaccessible through domain query handlers.
- The tenant application role is a non-owner, non-superuser, `NOBYPASSRLS` role with no DDL or role-changing grants. Enable and force RLS on tenant tables with both read predicates and write checks.
- Queue tables live in a separate schema with narrowly scoped grants. Worker domain operations still use the tenant role and authorization contract; possession of queue credentials does not imply access to global auth secrets.

For every tenant query, begin a transaction and establish validated actor/workspace context with transaction-local `set_config(..., true)`. Policies deny access when context is missing. Do not set tenant variables at session scope or issue tenant queries on a connection outside that transaction. Pool connections are reusable only after commit/rollback, so the next request cannot inherit context.

Membership lookup needs an explicit bootstrap policy: a verified actor may read their own memberships without first selecting a workspace. Owner operations use a separately reviewed, narrowly scoped membership-management path. Avoid recursive policies and broadly granted `SECURITY DEFINER` functions. Where a function is unavoidable, pin its search path, revoke public execution, and test its grants. RLS supports the application boundary; SQL-capable compromise of the application can forge custom session settings, so it is not claimed as protection against a fully compromised backend. PostgreSQL constraint checks can also bypass RLS and must not become user-facing existence leaks.

### Request and secret protection

Keep Better Auth's CSRF/origin checks enabled. Configure exact trusted origins from server-only configuration; do not infer them from an arbitrary forwarded host header. Apply separate same-origin/Fetch Metadata checks and a session-bound CSRF token to authenticated application mutations, including multipart uploads. No financial mutation uses GET. HTTP clients added later require an explicitly designed credential and CSRF contract.

Use PostgreSQL-backed auth rate limiting rather than per-process memory alone, and apply bounded application write/import/upload limits. Proposed initial login throttle is ten failed attempts per fifteen minutes per account-and-IP combination plus an IP ceiling; tune with tests so one shared IP does not lock every user out. Trust forwarded client IP headers only from the configured reverse proxy. Return generic login/recovery errors and redact password, token, cookie, authorization header, and personal input fields from logs.

Keep `BETTER_AUTH_SECRET`, database credentials, and any future SMTP/OAuth credentials server-only, absent from backups and `NEXT_PUBLIC_*` variables. Validate configuration at startup, fail closed on missing production secrets, and document rotation with session invalidation. Authentication events and membership changes produce audit events without copying credentials.

## Alternatives considered

- **Hosted identity platform:** simpler managed operations, but introduces an external service/account requirement for core local workflows. The adapter boundary leaves this replaceable later.
- **Custom password/session implementation:** avoids a dependency but increases security-sensitive code and maintenance. Use maintained auth mechanisms and test integration boundaries instead.
- **JWTs carrying tenant roles:** reduce session reads but complicate timely revocation and make client claims appear authoritative. Current database sessions and membership checks provide simpler semantics.
- **Single-user tables without workspace keys:** initially smaller but makes isolation and future sharing/restore expensive schema changes. Minimal workspace membership is justified by required ownership.
- **Application predicates without RLS:** necessary even with RLS, but insufficient additional protection against an accidentally unscoped query. RLS is included with explicit connection and role discipline.

## Consequences

Core authentication has no paid dependency and supports immediate revocation. It adds a database session/membership lookup to protected work, requires careful route response filtering, and makes authorization a dependency of all repositories and workers. Cache only public metadata and properly scoped domain responses; do not cache membership or session validity as long-lived authorization truth.

RLS increases schema/migration/test work and must be exercised with the actual non-owner roles. Authentication-library schema generation is reviewed and incorporated into application migrations; production startup never runs an auth schema mutation automatically. Team administration and external identity providers remain separate optional features, while tenant isolation is mandatory from the first persisted record.

## Validation required before accepting implementation

- Run login, logout, expiry, password change/reset, and session-revocation tests against the pinned Better Auth/PostgreSQL/Drizzle versions. Confirm cookie flags, no cookie session cache, safe public responses, and disabled signup.
- Assert no token/internal session fields appear in sign-in, session-status, session-list, password/recovery, success or error DTOs; reject raw catch-all/session endpoints. Verify response shaping preserves all separate `Set-Cookie` headers and status/redirect semantics, sign-in sets usable cookies, logout expires them, revocation is effective on the next request, and safe-ID session management cannot revoke another user's session.
- Provision and recover a local user without SMTP; prove no provisioning/admin endpoint is reachable over public HTTP and no default credentials exist.
- Test two users in disjoint workspaces across direct IDs, lists, aggregates, exports, imports, file downloads, shared caches, and workers (AC-14). Test viewer denial for every write family.
- Run tenant integration tests with the real application role: absent context, wrong context, cross-tenant foreign keys, pooled connection reuse, rollback, nested operations, and actor membership removal. Migration-role tests do not establish RLS correctness.
- Test current membership at delayed-job commit/artifact publication, constrained system work, CSRF rejection, trusted-proxy handling, distributed rate limits, and redacted auth logs.

## Official references

Reviewed the following official-source documentation on 2026-10-06 via its repository source. Direct website requests were unavailable through the environment proxy; these are not claims of executed integration tests. Recheck documentation against the exact release selected for implementation, because the referenced repository branches can evolve.

- Better Auth [email/password](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/authentication/email-password.mdx): signup controls, library hashing, and explicit session revocation on reset.
- Better Auth [session management](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/session-management.mdx): database sessions, hard-expiry/refresh options, and cookie-cache revocation behavior.
- Better Auth [sign-in endpoint source](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/routes/sign-in.ts) and [session endpoint source](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/routes/session.ts): default sign-in token response and full session-response behavior, establishing why public response shaping is required.
- Better Auth [security](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/reference/security.mdx), [rate limiting](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/rate-limit.mdx), and [Drizzle adapter](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/adapters/drizzle.mdx).
- PostgreSQL 17 [row-security source documentation](https://github.com/postgres/postgres/blob/REL_17_STABLE/doc/src/sgml/ddl.sgml): owner/bypass behavior, forced policies, and constraint/security caveats.
- OWASP [Session Management Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md) and [CSRF Prevention Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.md).
