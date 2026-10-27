# Operating and maintaining Trading Journal

Reviewed **26 October 2026**, Phase 19 Checkpoint 5, against committed Checkpoint 4 `b75b04cc92dbe89bb4bf131600fd1cb0a31a77e4` and unchanged application baseline `5132900a03efabaeb307787531546987228220e7`. Audience: deployment owners, application/database operators and security responders. These guides apply to the delivered full-source web/worker application, PostgreSQL 17 and private local media; they do not provision a production platform.

**Current release risks:** the fresh dependency audit failed with **7 reported advisories: 2 critical, 3 high and 2 moderate**. The pinned graph has not been changed or remediated by this documentation checkpoint. [The audit record](verification.md#dependency-audit-failure) identifies packages, scope and reported patch ranges; [security operations](security-operations.md) owns review/update handling. [FA-04](../final-audit.md) also remains open for production capacity. Passing a build or local recovery drill does not clear either gate.

## Choose the procedure and its owner

The existing flat runbooks remain canonical command/procedure owners. The new directory supplies lifecycle guidance, maintenance decisions, checklists and current execution evidence without creating competing deploy/restore recipes.

| Task                                                                                                                                   | Canonical documentation                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Prepare the complete release, private configuration, HTTPS/database/storage topology, apply the deployment sequence and start services | [Production deployment](../deployment.md)                  |
| Inspect runtime health, logs, pools, queue/outbox state, shutdown and bounded capacity                                                 | [Runtime operations and monitoring](../operations.md)      |
| Take and restore a coordinated PostgreSQL/roles/media recovery set                                                                     | [Backup and recovery procedure](../backup-and-recovery.md) |
| Decide what a valid backup contains, verify protection/retention/key recovery and record restore acceptance                            | [Backup and restore lifecycle](backup-and-restore.md)      |
| Perform per-session/daily, weekly and monthly maintenance according to the site's adopted policy                                       | [Routine maintenance](routine-maintenance.md)              |
| Manage database identities, schema/history, capacity, maintenance boundaries and safe retention                                        | [Database management](database-management.md)              |
| Prepare/rehearse an application or dependency upgrade, handle migration failure and choose retry/revert/recovery                       | [Upgrades and rollback](upgrades-and-rollback.md)          |
| Review access/dependencies/secrets, coordinate credential changes and handle suspected compromise                                      | [Security operations](security-operations.md)              |
| Recover from server/database/storage/configuration loss, corruption, failed release or compromise                                      | [Disaster recovery](disaster-recovery.md)                  |
| Execute initial deployment, maintenance, upgrade, backup, disaster and security incident checklists                                    | [Operational checklists](checklists.md)                    |
| Review exact fresh commands, restore comparisons, migration/build/HTTPS checks and unverified scope                                    | [Checkpoint verification](verification.md)                 |

For installation and ordinary tasks use [getting started](../getting-started/installation.md) and the [user manual](../user-guide/README.md). For an observed failure start with [troubleshooting](../troubleshooting/README.md) and its [safe diagnostics](../troubleshooting/diagnostics.md). The [environment inventory](../environment-inventory.md), [architecture](../architecture.md), [security model](../security.md) and [feature inventory](../feature-inventory.md) establish source and capability boundaries.

## Required invariants and recommended schedules

**Required** means a supported integrity/security prerequisite or a gate for the stated operation: correct release/toolchain and database compatibility, separated restricted runtime identities, private durable media, trusted origin/TLS, protected secrets, a verified recovery set before potentially destructive work, an explicitly selected isolated restore/test target and post-change validation. It does not mean a background scheduler enforces the task.

Daily/per-session, weekly and monthly frequencies are **recommended operator policy**, to be adopted for actual activity and risk. ADR 0008 proposes daily protected backups, 30-day retention, RPO at most 24 hours/RTO at most 4 hours, and an initial 14-day log-retention policy. These are not measured production guarantees. No backup scheduler, offsite encryption/key-recovery service, log collector/rotation pipeline, incident destination, failover/PITR service or dependency auto-update system is installed by these docs. See [maintenance](routine-maintenance.md), [recovery objectives](disaster-recovery.md) and the [ADR](../decisions/0008-testing-and-operations.md).

> **Warning:** Preserve the original system and a coordinated, verified recovery set before destructive replacement, recovery or a schema-changing release. Do not delete user volumes, rewrite financial/migration/audit/outbox history, disable RLS/triggers, weaken TLS/CSRF/CSP or run tests against user data to make a check pass. Use guarded financial corrections and reviewed forward migrations.

Application-only rollback, full-system recovery and portable workspace restore are different operations. The current runtime requires schema **17**; no database downgrade or universal zero-downtime upgrade is supported by these procedures. A portable archive restores a new workspace and does not replace PostgreSQL/auth/queue/roles/media/configuration recovery.

## Evidence and current documentation status

**Source-reviewed**, **Freshly passed**, **Historically passed**, **Failed** and **Not run** retain their meanings from [documentation standards](../documentation-standards.md). The [verification record](verification.md) separates fresh isolated SQL/media restore, migration/build/release/HTTPS and worker checks from unverified production backup authorization, offsite encryption, retention, key recovery, disaster cutover and older-release rollback. It records the failed current advisory gate without substituting older clean audit results.

Checkpoint 5 refreshed deployment/runtime/backup prose that previously described schema 9, a health-only worker and unavailable portability. Dated Phase 13/16/18 and Checkpoint 4 evidence remains historical. The recovery drill's raw report still has a stale sentence about unavailable end-user export/import; the current product implements portable workspaces, while that drill tests SQL/media recovery. No application script was rewritten to change the report. For engineering changes and their verification boundaries, use the [developer guide](../developer-guide/README.md) and its [verification record](../developer-guide/verification.md).
