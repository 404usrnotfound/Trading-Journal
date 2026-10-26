# Operational checklists

Reviewed **26 October 2026** for Phase 19 Checkpoint 5 against `b75b04cc92dbe89bb4bf131600fd1cb0a31a77e4`; application baseline `5132900a03efabaeb307787531546987228220e7`. Use these as private execution records for the actual target, not as evidence that unchecked host work has been completed. Command details belong to the linked canonical procedures. The [verification record](verification.md) states what was freshly exercised on disposable resources.

An item marked **required** is a prerequisite/integrity or security gate for that operation. A recommended cadence becomes a local obligation only when the deployment adopts it. No checklist installs automation or authorizes a destructive action on an unidentified target. Keep existing systems/recovery sets intact until acceptance is established.

## Initial production deployment

Use [deployment](../deployment.md), the existing [production-readiness checklist](../production-readiness-checklist.md) and [security operations](security-operations.md). This is an actual-host gate, not the result of a local build.

- [ ] **Required:** record exact source/lock/migration/build identity, full-source artifact, Node/pnpm pins and intended web/worker release; preserve a separate previous artifact when applicable.
- [ ] **Required:** resolve the current failed dependency-audit gate with a reviewed, tested dependency change and rerun evidence. The recorded **7 advisories, including 2 critical**, have not been fixed by these docs. Do not lower the audit threshold or disable the CI check.
- [ ] **Required:** address the open FA-04 release/capacity gate and establish the intended workload, concurrent readers, worker contention and deployment budget; a small local rehearsal is insufficient.
- [ ] **Required:** select the intended PostgreSQL 17 host/database, all seventeen reviewed application migrations and separate app/auth/jobs/operator identities; verify role safety and exact history, not just connection success.
- [ ] **Required:** provision private durable media, correct ownership/modes and capacity; verify the actual storage probe and authorized attachment behavior. Local development Compose is not a production web/worker stack.
- [ ] **Required:** inject protected runtime configuration, canonical HTTPS origin and certificate-verified remote database connections; keep migration/test/bootstrap secrets out of long-running children and all public assets.
- [ ] **Required:** establish supervised web/worker processes, graceful drain/restart and private listeners. Verify the actual trusted edge, redirects/security headers, sessions/CSRF and protected readiness.
- [ ] **Required:** establish a complete protected backup/secret-recovery design and successfully restore representative data/media/security into a separate target before a recoverability claim. Record backup authorization, offsite/key retrieval and adopted objectives.
- [ ] **Required:** execute the serialized deployment/migration procedure with a write fence and recoverable prior state where existing data is affected. Record application, queue and role-provisioning phase outcomes separately.
- [ ] **Required:** verify authenticated reads, independent financial/source expectations, tenant denial, private media, worker infrastructure readiness and native projection status separately.
- [ ] Establish restricted logs/monitoring, failure/staleness alerts, ownership and response channels on the actual host; verify delivery and retention rather than assuming the repository installed them.
- [ ] Record remaining host gates and the actual traffic/cutover decision. Do not mark a production-ready result while unresolved required gates remain.

## Routine maintenance

Follow [routine maintenance](routine-maintenance.md), [database management](database-management.md) and [runtime monitoring](../operations.md). The frequencies below are recommendations; supported security/data invariants apply whenever the system runs.

- [ ] Per session/daily as adopted: inspect web liveness and authenticated readiness, private worker readiness, unexpected restarts and first relevant safe failure events.
- [ ] Inspect native outbox generation/retry status separately where relevant; a successful queue probe does not establish complete business processing or NAV.
- [ ] Review database/storage utilization and connection/lock/error trends with approved read-only host tools. Record growth and the site's threshold/action; do not invent a universal free-space percentage.
- [ ] Confirm the most recent complete backup, consistency cutoff, age, hashes, protected offsite copy and usable secret/key references. Escalate an overdue/failed backup without replacing the last known-good set.
- [ ] Weekly as adopted: review recurring log/security/import/reconciliation errors, restore evidence freshness, dependency advisories and privileged/member access.
- [ ] Monthly as adopted: rehearse recovery to a separate target, review capacity/growth and retention policy, test secret/key retrieval and review operator access/incident contacts.
- [ ] Keep dependency, credential, schema or infrastructure changes in a separately rehearsed change record. They are not silent weekly cleanup jobs.
- [ ] **Required:** retain immutable ledger/source/audit history and current media/queue lifecycle evidence. Never truncate queues, remove provenance or delete files/volumes merely to reduce disk usage or clear a dashboard.
- [ ] Record findings, the affected target and follow-up owner. Store sanitized summaries separately from private dumps, logs, broker files, cookies and archives.

## Pre-upgrade verification

Use [upgrades and rollback](upgrades-and-rollback.md). The backup is a coordinated system recovery set, not a filtered CSV or portable-workspace-only archive.

- [ ] **Required:** identify current/target releases, dependency changes, runtime/schema/calculation/archive compatibility and every new SQL migration; inspect authorization, precision, data transformations and queue/provisioning implications.
- [ ] **Required:** retain the current full-source/build artifact, deployment configuration references and protected secrets; do not overwrite the running release in place.
- [ ] **Required:** take/verify a quiesced PostgreSQL/roles/private-media recovery set and matching source/secret identity. Verify retrieval/restoration, not merely file existence.
- [ ] Rehearse the intended upgrade against a separate restored copy, including independent cash/quantity/P&L/report/media/security checks. Prevent external actions and keep private data protected.
- [ ] **Required:** complete the target's frozen install, relevant quality/security checks, production build and release/artifact checks. A source hash manifest does not by itself attest build provenance.
- [ ] **Required:** compare runtime schema acceptance and migration history; establish whether any compatible code-only reversion exists. Do not assume a down migration or a previous binary accepts schema 17.
- [ ] **Required:** establish the write fence/maintenance window, one serialized migration operator, expected phase outputs, stop conditions and empty-target recovery path.
- [ ] Record expected loss/cutover implications and current open gates before starting. Dependency advisory failure is not a passing pre-upgrade check.

## Post-upgrade verification

Read the same-release verification and failed-change decision table in [upgrades](upgrades-and-rollback.md).

- [ ] **Required:** record the exit/result of application migration, queue migration and role provisioning individually; the complete root command is not one cross-phase transaction.
- [ ] **Required:** verify exact reviewed migration prefix/history, schema 17 for this baseline, all intended runtime credentials/least-privilege grants and database transport.
- [ ] **Required:** verify web/worker release identity, production configuration, private media and actual edge; liveness alone is insufficient.
- [ ] **Required:** exercise authenticated readiness/login, session/logout/CSRF, representative authorized financial/journal/report/media reads and tenant denial on the intended target.
- [ ] Compare pinned pre/post financial outputs, currencies, precision, economic timestamps, revisions, availability and original-risk/cost/source evidence; retain an explained result for any intentional definition change.
- [ ] Inspect logs, connections, queue infrastructure and native outbox generation separately; do not mark facts delivered, erase jobs or silently suppress errors.
- [ ] Keep traffic fenced if a required check fails; choose reviewed retry, compatible code reversion or coordinated recovery from the decision procedure.
- [ ] After accepted cutover, establish a new verified backup. Retain the prior release and recovery set according to the adopted policy, with private evidence of the change.

## Backup verification

Use [backup lifecycle](backup-and-restore.md) and the canonical [SQL/media procedure](../backup-and-recovery.md).

- [ ] **Required:** record release/toolchain/schema, consistency cutoff, selected source and scope, quiescence of all writers, backup operator authorization and command results.
- [ ] **Required:** include all application/auth/queue/migration data and definitions, global role attributes/memberships/ACLs, private media/lifecycle objects, matching full release and separately recoverable protected configuration/secrets.
- [ ] **Required:** check archive sizes/hashes, SQL readability/listing and every stage's exit status. A hash detects accidental change; it does not authenticate a maliciously replaced archive and manifest.
- [ ] Verify encryption/protected storage, offsite copy authenticity/retrieval, key access and adopted retention. Password-free role dumps still need secret recovery; a backup file does not recreate credentials or TLS.
- [ ] **Required for a restorable claim:** restore into a new empty isolated PostgreSQL 17 target and empty private media directory, using the matching release and recovered roles/configuration. Do not apply application migrations before restoring a full matching dump.
- [ ] **Required:** compare data/sequence and security/catalog fingerprints before restored writes; verify source/report outputs, metadata/history, runtime restrictions, no-context/wrong-tenant denial and media bytes/hashes.
- [ ] Verify actual restored login/session behavior and assess resurrected/revoked sessions or memberships. Inspect queue/native outbox recovery separately from infrastructure probe completion.
- [ ] Record restore plus verification/cutover duration and observed loss interval, dataset size and untested scope. Tiny logical-dump timings are not production RPO/RTO, PITR or HA proof.
- [ ] Retain the last known-good verified recovery set when a new run fails. Expiry must not erase authoritative application/audit history or the last recoverable copy.

## Disaster recovery

Use the scenario-specific [disaster recovery guide](disaster-recovery.md), including server loss, database failure/corruption, failed deployment/upgrade, lost configuration, credential compromise and storage loss.

- [ ] **Required:** identify the affected system, contain writes/ingress safely and preserve original database/media, failed artifacts, logs and last good recovery sets. Prevent split-brain writers.
- [ ] Distinguish availability, corrupt source, missing media, incompatible schema, lost secret and security compromise before choosing recovery; an empty report is not proof that source data is lost.
- [ ] **Required before destructive work:** verify the recovery set/cutoff and protected secret availability, select an explicitly new empty target and record the potential data-loss interval.
- [ ] Recover the matching release, PostgreSQL roles/data/security/queue, private media and protected configuration through canonical procedures; do not fix hashes, bypass RLS or manufacture balancing ledger entries.
- [ ] **Required:** complete the same-release financial/security/media acceptance checks and inspect persisted queue/outbox state before admitting writers.
- [ ] Reassess session/credential revocations and external exposure; do not restore a compromised credential merely because it exists in a backup.
- [ ] Record the actual cutover, restored state, elapsed recovery/loss and remaining gates. No ADR target is automatically a demonstrated SLA.
- [ ] Preserve the previous system for investigation, establish a new verified backup and record corrective actions without proceeding to unrelated upgrades.

## Security incident response

Follow [security operations](security-operations.md) and the applicable [recovery scenario](disaster-recovery.md). A package advisory is evidence for review, not proof that this installation was exploited.

- [ ] Record the incident/advisory, affected release and evidence source without exposing secrets or asserting an unverified exploit.
- [ ] **Required:** contain affected ingress/accounts/processes through the existing authorized control plane; preserve restricted logs and source/audit evidence. Do not disable authentication/CSRF/CSP/TLS to restore apparent availability.
- [ ] Determine exposed credential/session/database/storage/backup scope and whether backups/configuration are trustworthy; restrict suspected material while retaining recoverability/evidence.
- [ ] Coordinate supported password/session, runtime-role, auth-secret and infrastructure-key changes according to their different effects. There is no universal one-click rotate/revoke-all tool or multi-key auth ring.
- [ ] Rehearse the required patched dependency/full-source release and retain complete backup/change evidence before a schema-affecting response. Do not run a blind package-manager force-fix or production reset.
- [ ] Verify revocation/new access with the intended identities, exact role restrictions, protected origin/TLS/media and fresh quality/security results. Source review is not proof of production rotation success.
- [ ] Assess restored pre-cutoff sessions/memberships after recovery; do not reopen traffic solely on a healthy process.
- [ ] Record actual outcome, residual exposure and follow-up. Share only sanitized evidence through the organization's approved restricted channel.

## Completion record

Retain the actual checked items, operator/time/target aliases, release and binding names, command/results, backup references and verification scope. Keep all secret values, cookies, database URLs, raw source/financial records, media and dumps out of a shared checklist. Use [safe diagnostics](../troubleshooting/diagnostics.md#collect-a-sanitized-diagnostic-report) for a report template. An unchecked or explicitly unverified item must not be converted to a completed production claim by copying this page.
