# Production-readiness checklist

This is a release gate, not a claim that a production deployment exists. An
item is checked only for the exact local verification described. Deployment
items remain unchecked until evidence exists for the actual host, database,
domain, service identity and operational workload. A proposed policy or a
configured CI step is not an executed check.

The checked local items and dated summary below retain **historical Phase 16**
evidence. Current source uses schema **17**, **seventeen** reviewed application
migrations, [portable workspace export/restore](workspace-portability.md) and
[native financial outbox processing](financial-outbox.md). Use the current
[operational checklists](operations/checklists.md) and
[Checkpoint 5 execution record](operations/verification.md) for later local
verification. The unchanged dependency graph has **seven unresolved advisories,
including two critical**, and [FA-04](final-audit.md) remains open. A historical
checked box does not clear those present release gates.

Use [deployment](deployment.md), [operations](operations.md) and
[backup/recovery](backup-and-recovery.md) together. The [Phase 16 verification record](production-readiness-evidence.json) identifies
executed commands, input/source hashes and remaining limitations. No public deployment or live-provider connection is authorized by
this preparation work.

## Local configuration and release verification

- [x] Required runtime/operator/test bindings are inventoried in the deployment
      guide and matched to the implemented configuration and launcher allowlists.
      Runtime children do not inherit migration/test/bootstrap credentials.
- [x] Production origin, secret and private-storage path validation, cookie
      configuration, CSRF/header rules and safe configuration errors have focused
      unit coverage executed during this phase. Live-target properties are separate
      gates below.
- [x] Exact Node 24.19.0/pnpm 10.34.6 pins, dependency declarations and frozen
      installation are reviewed; a fresh source-only frozen offline installation
      completed without copied dependencies/private configuration. This is not a
      cold-network installation claim.
- [x] A fresh production build and the current-checkout build both complete,
      with recorded build IDs, source/lock hashes and semantic artifact comparison.
- [x] Full-checkout release verification passes for the final outputs, including
      worker/domain artifacts, native Argon2 containment, static assets and all nine
      reviewed SQL migrations at Phase 16. Current source has seventeen migrations;
      later complete-release verification is recorded separately above.
      Completeness is not byte-identical reproducibility.
- [x] Final API drift, formatting, lint, type, unit/property/UI, real PostgreSQL,
      migration, dependency-audit and built-app browser checks have executed results.
- [x] Production HTTPS smoke runs against the final standalone build with a
      trusted local CA, rejects wrong CA/hostname, and verifies secure-cookie flags,
      session/CSRF/header/asset/readiness behavior. This is not an actual domain test.
- [x] Known private bindings are absent from reviewable source and public build
      assets in the final scan. A known-value scan is not a security certification.

## Local database and connection verification

- [x] Live preflight checks the expected three distinct runtime identities,
      non-owner/non-superuser/no-BYPASSRLS/no-other-role-membership properties, schema/version
      compatibility and cross-schema table/column privilege denial on isolated PG17.
- [x] Strict preflight has executed URL-policy/negative guard tests and code that
      requires encrypted sessions. The successful local preflight uses the labelled
      loopback plaintext exception; no certificate-verified PostgreSQL connection
      was exercised. Actual database TLS remains a deployment gate.
- [x] Preflight storage probes write/read/hash and remove only their owned object;
      inaccessible/symlink/unsafe mounts and unsafe database bindings fail safely.
- [x] Fresh migration/upgrade/concurrency/tamper checks pass without editing an
      applied migration or using schema push. App SQL, queue DDL and provisioning
      remain separate phases controlled by one serialized release job.
- [x] Connection caps and timeouts are reviewed: up to 20 configured connections
      per web process and four per worker, plus tooling/backup/monitor/operator reserve.
      Rolling-overlap capacity is included in the documented budget. This does not
      verify the selected production database's capacity.

## Local health, failure and shutdown verification

- [x] Protected readiness preserves authentication denial and maps dependency
      authentication failures to sanitized 503 responses in fault-injected route
      tests. No actual production authentication outage was induced.
- [x] Real PG17 worker process checks verify readiness, 404/405 behavior and
      SIGTERM both during queue startup and after readiness, with owned pool cleanup.
- [x] Launcher shutdown permits the worker drain: 15-second launcher grace and
      a real six-second owned-child drain regression exceed the former five-second
      kill window. This does not exercise a future business handler's shutdown.
- [x] Structured log allowlists/redaction tests and aggregate monitoring SQL
      examples execute successfully. They do not establish a deployed collector,
      universal successful-request metrics or delivered alerts.
- [x] Documentation distinguishes public liveness, authenticated web readiness,
      private worker readiness and operator storage checks. Readiness-session expiry
      and persisted login limits are included in the monitoring procedure.
- [x] Worker scope is explicit. The original Phase 16 verification covered health
      probes; subsequent audit remediation adds the separately tested
      [native financial outbox projection](financial-outbox.md). Heavy imports,
      asynchronous large reports and generic rebuild handlers remain unclaimed.

## Local recovery verification

- [x] A quiesced full logical PostgreSQL dump and private media restore into a
      newly created PostgreSQL17 cluster, with target-only global-role bootstrap.
- [x] Before restored application writes, every captured table/sequence hash and
      owner/ACL/column/default-grant/RLS/index/function/trigger/constraint fingerprint
      matches. Runtime-role attributes include denial of replication privilege. A
      fresh-target-only membership grant proves `SET ROLE` escalation is detected;
      revoking it restores exact original state before positive checks.
- [x] Exact financial DTOs, an existing restored session, a fresh password login,
      tenant-denial checks, private attachment hashes and a restored pending queue
      probe are verified under restricted roles.
- [x] Recovery tools reject unsafe cleanup targets and retain all existing
      databases/volumes/private configuration; only recorded owned resources are
      removed. Archive/key/media artifacts remain private and outside Git.
- [x] Operational full-database recovery is distinguished from portable workspace
      export/restore, which was deferred at Phase 16 and is now implemented.
      Logical recovery does not establish WAL/PITR, offsite durability or generic
      business-job redrive.

## Executed local check summary

On 17 October 2026, the final validation passed **817 unit/property/UI tests**,
**512 PostgreSQL integration tests** and **14 browser scenarios**. The finalized
preflight helper also passed its two focused PostgreSQL cases after the later
membership-query correction. API drift, formatting, lint, types, migration checks,
database readiness, dependency audit and production build passed. The known-value
scan found no private bindings in reviewable files or public assets.

The source-only frozen install/build and current checkout match compiled inputs,
all nine migrations, 29 routes, 53 static assets, all five CSS hashes and
worker/domain/native artifact bytes. The final local-CA HTTPS smoke passed 13
checks. The fresh-cluster recovery compared 89 tables plus security/sequence/role
state and exact financial DTOs. Individual commands, timestamps, hashes, disclosed
tooling differences and limitations are in the verification record above.

## Gates for the actual production deployment

These items cannot be checked by a local fixture or source review. Attach the
operator, environment/release identifier, timestamp, result and safe evidence to
each before enabling production traffic.

- [ ] An approved immutable/versioned source release and successful hosted CI
      run are retained; full installed dependencies and migration/operator sources
      are included. No private/test configuration is shipped.
- [ ] Non-root service identities, filesystem ownership, persistent private media,
      disk/inode capacity, restart persistence and host/container/network isolation
      are verified on the real target. The launcher asset-copy/cache write boundary
      is compatible with the chosen artifact permissions.
- [ ] Actual database URL identities and grants pass live preflight; connection
      headroom covers peak replica overlap and operations. Network database TLS uses
      the intended CA/hostname, and a wrong CA/hostname is rejected. Any strictly
      local transport exception is separately reviewed and approved.
- [ ] The canonical domain's valid certificate/chain, renewal, DNS, HTTP redirect,
      unknown-host rejection and proxy forwarding-header policy are exercised.
      Clients cannot bypass the trusted proxy to a public standalone listener.
- [ ] Real HTTPS browser sign-in/out, Secure/HttpOnly/SameSite/host-only cookies,
      CSRF denial, private cache policy, nonce CSP and protected media are checked
      through the actual proxy. TLS termination does not remove security headers or
      merge/drop individual Set-Cookie headers.
- [ ] Edge time/body/concurrency limits and resource allocations are exercised
      with the intended workload. Known Phase15 reporting limits remain visible;
      synchronous large reports are not assumed to meet a production latency SLO.
- [ ] A serialized migration job, compatible rollout/readiness gating, supervised
      30-second-or-longer outer drain, restart backoff and tested rollback/recovery
      decision are configured. In-flight web request/transaction outcomes are rehearsed;
      there is no separate web tenant/auth pool-drain hook. Schema compatibility is
      checked before an app rollback.
- [ ] An authenticated readiness probe and private worker probe work from the
      monitoring network, including expired sessions/authentication failure, without
      bypassing shared login limits or exposing credentials in logs.
- [ ] Redacted log collection/access/retention, database/storage/queue/availability
      monitoring, thresholds, escalation owners and actual alert delivery are tested.
      Disk-full, queue failure and process/restart incidents have a usable runbook.
- [ ] Backup scheduling, encrypted offsite copies, protected recovery secrets,
      retention, failure/staleness alerts and retrieval are configured and tested.
      Authentication/session material in operational dumps is protected as secrets.
- [ ] A production-size coordinated database/media restore and cutover rehearsal
      records actual loss interval and elapsed recovery time. Accepted RPO/RTO and
      retention are signed off; the ADR's daily/30-day/24-hour/4-hour numbers remain
      proposals until then.
- [ ] If tighter recovery requires PITR, base backups/WAL continuity and matching
      media versions are tested at the chosen timestamp. A logical dump drill is not
      evidence for this item; otherwise record an explicitly approved non-PITR policy.
- [ ] Dependency/OS patch ownership, secret rotation/password recovery, incident
      access, release approval and support responsibility are assigned.

No pending gate is waived by a successful build, liveness response, source audit
or small restore fixture. The current repository can be prepared and verified
locally while deployment-specific readiness remains unproven.
