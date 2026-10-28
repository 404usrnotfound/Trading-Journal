# Disaster recovery decisions and verification

Reviewed **26 October 2026** for Phase 19 Checkpoint 5 against committed Checkpoint 4 `b75b04cc92dbe89bb4bf131600fd1cb0a31a77e4`; application baseline remains `5132900a03efabaeb307787531546987228220e7`. The incident branches below are **Source-reviewed**. They are decision and acceptance guidance, not evidence that a production incident, failover, credential rotation or full-size recovery has been exercised. The [operations verification record](verification.md) identifies this checkpoint's executed local drill and remaining unrun branches.

The existing [backup and recovery procedure](../backup-and-recovery.md) owns coordinated backup/restore commands; [deployment](../deployment.md) owns release preparation and migration/rollout order; [operations](../operations.md) owns runtime supervision and shutdown. Use those procedures rather than maintaining another command sequence here. [Troubleshooting diagnostics](../troubleshooting/diagnostics.md) owns safe diagnostic commands and sanitized evidence collection.

Before this checkpoint, current flat runbook prose still repeated earlier Phase 16 scope: schema 9, deferred workspace portability and a health-only worker. Checkpoint 5 corrects that current prose while retaining dated historical measurements. At this baseline the application schema is **17**, [portable workspace backup/restore](../workspace-portability.md) exists, and the worker also consumes [native financial outbox projections](../financial-outbox.md). The existing small operational drill's pending queue item is an infrastructure probe; that test does not independently verify every restored business/outbox workflow. Preserve these evidence boundaries when applying the procedures.

## Declare scope and preserve the recovery point

An incident coordinator, authorized database/recovery operator, application maintainer and financial-data reviewer should own the decisions relevant to the incident. A security responder joins a suspected compromise. These are operational responsibilities, not new application membership roles or an invitation workflow.

1. Record the first known failure, affected release/host/service, safe event/request codes, timezone and affected workspace/account scope. Separate an infrastructure outage from a valid report that explains missing financial evidence.
2. Stop a rollout or recurring failed action. Contain affected ingress and writers when integrity, split-brain or compromise is possible. Drain the owned web/worker processes as the runtime procedure requires; also account for external writers. A lost HTTP response does not prove that its financial command failed to commit.
3. Preserve the original database/volumes, private media, failed release, protected configuration references and restricted logs. Record possible committed/unknown-outcome commands around the boundary. Do not delete evidence to make a clean restart easier.
4. Determine whether recovery needs process/release repair, source-specific append-only correction, or a coordinated restore. A healthy authoritative database does not need an older dump merely because an application host failed.
5. For restore, select a trusted coordinated recovery set and record its actual consistency cutoff and possible loss interval. Verify the protected manifest, archive hashes, release/tool compatibility, target capacity and separately recoverable secrets before changing a target. A checksum alone does not authenticate a backup that an attacker could replace together with its checksum.
6. Use a new empty isolated PostgreSQL 17 recovery target and empty private media location. Keep ingress/workers stopped, prevent original and recovery systems from accepting competing writes, and confirm which target every configured binding names. Preserve the original system for investigation.

> **Warning:** Obtain and verify the required backup/recovery evidence before a potentially destructive replacement, cutover or exceptional repair. Never reset an existing database, delete a data volume, edit ledger rows/revisions, disable integrity triggers/RLS or alter migration hashes as an incident shortcut. If no trustworthy recovery set exists, preserve what remains and escalate the data-loss decision; do not claim a complete reconstruction from filtered exports or a native projection.

## Know what must recover together

| Recovery element                              | Why it is required                                                                                                                                                  | Verification boundary                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete PostgreSQL database                  | `app`, `auth`, `queue` and `migrations` retain financial sources, memberships/sessions, versions, imports, media records, outbox/audit state and migration history. | Compare complete table/sequence state and security/catalog fingerprints before restored application writes. An app-only schema dump is insufficient.                                                                      |
| Global roles/ownership/grants                 | Logical database dumps do not create cluster-global roles. Restricted app/auth/jobs identities and non-login migrator ownership must remain separated.              | Preserve owners, ACL/default grants, policies, functions/search paths, constraints and enabled triggers. Runtime roles must not gain owner/superuser/BYPASSRLS/replication or cross-role membership to make restore work. |
| Coordinated private media                     | SQL metadata and ready bytes must describe the same quiesced cutoff. Pending/staged/removed objects retain their lifecycle meanings.                                | Compare ready object size/hash and authorized retrieval. Restore relative layout and restrictive ownership/modes; do not publish files as static assets or turn staged objects into ready attachments.                    |
| Matching release and reviewed migration files | Source, lockfile/build identity and applied journal establish the executable/schema baseline.                                                                       | Readiness checks schema 17 and PostgreSQL major 17 here, but does not replace exact applied hash/order checks or financial verification.                                                                                  |
| Protected configuration/secrets               | Dumps do not restore database login passwords, authentication secret, trusted origin/proxy/TLS settings, media mount selection or external encryption keys.         | Recover through the deployment's separate protected mechanism; validate the actual bindings without printing values. Verify release/service-specific identity and reachability.                                           |
| Trusted manifest and source context           | The cutoff, release, hashes and financial/report context establish what can be compared and what may be lost.                                                       | Compare exact decimal strings, timestamps, source/metadata revisions, provenance, calculation manifests and availability states. Do not strip differing economic fields to make fingerprints agree.                       |

The implemented file store is private **local filesystem** storage. No S3 adapter or automatic cross-host shared-media failover is delivered. Portable workspace restore creates a new workspace under its own compatibility/size/fidelity checks; it does not restore a complete deployment's auth/queue/roles/configuration. Filtered JSON/CSV exports are not either recovery set.

## Application server is lost

**Immediate response:** Remove the failed application instance from ingress and preserve its disks/logs where possible. Establish whether PostgreSQL and the original private media remain intact and whether any other instance is still writing. Do not restore an old database over a healthy current one.

**Recovery path:**

1. Prepare a trusted replacement host using the [supported deployment topology](../deployment.md), exact reviewed release and locked dependency/build procedure. Recover service-specific configuration from the protected source, not from browser assets or public logs.
2. Reattach or recover the intended private media securely. A new empty directory at the same path is not recovered storage.
3. Verify database/schema/release compatibility and actual restricted runtime identities. Use one serialized migration job only if a reviewed release change requires it; a same-release host replacement is not permission to rerun arbitrary upgrade steps.
4. Start privately, verify authenticated application/media access and worker status, then perform controlled ingress cutover after the acceptance checks below. Keep the old instance fenced against returning as a second writer.

**Verify and escalate:** Compare current financial source revisions and unknown-outcome commands with retained evidence; inspect outbox generation/status separately from worker readiness. Escalate missing host secrets, media or a trustworthy release before exposing the replacement. Host failover and an actual supervisor/proxy cutover are **Not run** by the small local recovery drill.

## Database becomes unavailable or is lost

**Immediate response:** Stop the rollout and contain repeated writes/retries. Use [database troubleshooting](../troubleshooting/database-and-migrations.md) to distinguish network, certificate/identity, connection capacity, schema and service failure from physical/logical data loss. A database timeout or failed readiness probe alone does not require restore.

**Recovery path:**

1. Preserve the database service/volume and its restricted diagnostic evidence. Restore connectivity/capacity through the existing authorized infrastructure process if the authoritative database remains intact.
2. If the database is lost or unusable, choose the last trustworthy coordinated recovery set and explicitly record the lost/unknown interval. Use the flat backup runbook's empty-target restore order, including role bootstrap and coordinated media; do not migrate empty application schemas before restoring the archived schemas.
3. Reconcile the recovered source cutoff with independently retained confirmations/statements. Later writes absent from the backup require a separate reviewed source reconstruction decision; never replay all browser/import submissions indiscriminately.
4. Keep both systems isolated until restricted-role, authentication, financial/media and queue/outbox checks pass. After controlled cutover, establish a new verified backup.

**Verify and escalate:** A successful connection or schema marker is only the first layer. Require exact restore fidelity and representative financial comparison at the recorded context. Physical recovery, failover replicas, WAL archive continuity and point-in-time recovery are not delivered/tested procedures here; do not claim a financial source revision can restore the entire database, auth and filesystem to that point.

## Data corruption or source inconsistency is suspected

**Immediate response:** Preserve the observed database/media and report context. Restrict affected writers if continued use could compound corruption; distinguish a missing mark/FX/unknown basis from an integrity defect using [financial discrepancy diagnosis](../troubleshooting/financial-discrepancies.md). Explained unavailability is not evidence that ledger tables need repair.

**Recovery path:**

1. Record the independent expected versus observed facts, source/metadata revision, effective boundary and minimal affected scope. Preserve safe request/event codes and original source documents privately.
2. Establish whether this is an incorrect source event with a supported append-only correction, an application defect, damaged media or database/storage corruption. Use the domain-specific correction workflow only when source evidence proves it; do not fabricate offsetting trades or balance plugs.
3. For a restore decision, identify a trusted recovery point from before corruption and restore it into an empty isolated target. Verify complete history/security/media rather than selectively omitting a failing table or disabling its trigger.
4. Compare candidate recovery points and the independently known loss interval before selecting a cutover. Preserve the suspect system; it can still contain later valid source facts requiring controlled investigation.

**Verify and escalate:** Require intact canonical fingerprints, source and allocation conservation, expected costs/FX/availability, attachment hashes and authorization checks. Persistent corruption or a failing trusted restore is a maintainer/database incident; do not edit checksums, archive records or source IDs to make verification pass. The documented local drill tests fidelity of its own synthetic set, not repair of arbitrary production corruption.

## Deployment fails after a release change

**Immediate response:** Stop further rollout, remove failing new replicas from traffic, preserve the previous and failed release identities, and record whether any migration or financial write completed. Healthy old processes do not prove that the old release remains compatible with the current database.

**Recovery path:**

1. Follow the [deployment migration and rollout order](../deployment.md#migration-and-rollout-order). Compare source/lock/build provenance, applied migration state, runtime configuration, readiness and private media separately.
2. Restart or redeploy a known-good artifact only after reviewing its compatibility with the current application schema and queue state. An additive migration filename is not proof that old and new writers can coexist.
3. If forward correction is required, preserve the recovery set, serialize the reviewed release/migration operation, and test the repaired candidate privately.
4. If code rollback is incompatible, an older database restore is a recovery decision with potential loss of later committed facts, not an automatic rollback. Use an empty isolated target and the coordinated runbook; never edit applied history or assume a down migration exists.

**Verify and escalate:** Confirm exact active release/schema, absence of split-brain writers, authenticated readiness, representative current financial reads, media bytes and worker/outbox status. Retain failed-command outcomes and original idempotency/source identities before retrying any uncertain write. Full live rollout/drain and public-edge cutover remain **Not run** deployment checks.

## Upgrade or migration fails partway through

**Immediate response:** Stop concurrent deploy/migration jobs. Preserve the first failure classification and current migration/queue/role state without exposing connection strings or raw SQL parameters. Do not repeatedly run the whole release job before identifying its completed phases.

**Recovery path:**

1. Use the read-only [migration-state inspection](../troubleshooting/diagnostics.md#inspect-migration-state). Confirm that applied application history is an exact reviewed prefix for the intended release. A schema marker alone cannot detect changed historical hashes.
2. Review which application SQL, pg-boss migration and runtime-role provisioning stages completed. Application migration serialization does not create a single transaction/lock for the complete release procedure; the deployment process must serialize all its stages.
3. After resolving the actual cause and verifying the recovery set, an authorized operator resumes only through the reviewed supported migration/release procedure. Tampered/incompatible history requires investigation or matching-release isolated recovery, not a hash/metadata edit.
4. Keep incompatible writers stopped until application, queue and role expectations agree. Do not install an older codebase over a newer schema as an unreviewed downgrade.

**Verify and escalate:** Require exact reviewed history, schema/major checks, safe runtime-role preflight, queue startup and application smoke tests. Retain a current protected record of all completed phases. Arbitrary interrupted upgrade, long-running production transaction and mixed-version rollout recovery are **Not run** branches unless specifically evidenced in the verification record.

## Configuration or recovery secrets are lost

**Immediate response:** Preserve surviving protected secret references, deployment identity and backup manifests. Do not dump process environments, commit `.env`, run local bootstrap generation over production settings or put a password in a support command.

**Recovery path:**

1. Recover the intended origin, role-specific database bindings, authentication secret, media mount/path, proxy/TLS configuration and necessary backup decryption material through the separate approved secret-recovery channel.
2. Compare credential versions with the selected database/release. A password-free global-role dump preserves role definitions, not usable login secrets. Freshly generated local configuration is not a recovery of existing database credentials or private media.
3. Where a secret cannot be recovered, use the site's controlled rotation/reprovisioning process on the explicit recovery target. Account for every service consumer and restart affected processes after reviewed updates. Do not substitute a migrator/operator credential for a failed runtime identity.
4. Assess restored session continuity intentionally: the local drill uses the unchanged authentication secret to check an existing session. Losing/changing it requires its own session-impact/recovery decision, not a promise that existing browser access survives.

**Verify and escalate:** Run the field-only configuration check, actual restricted-role connectivity/preflight, trusted-origin sign-in and authorized media/report reads. Keep sensitive values out of the evidence. Missing archive decryption keys or a trustworthy matching secret set can prevent recovery; no repository mechanism reconstructs them from hashes, source files or filtered exports.

## Credentials or a host may be compromised

**Immediate response:** Treat this as a security incident, contain affected ingress/service access and preserve evidence in restricted storage. Involve the authorized security responder. Do not rely on restarting the same potentially compromised host or restoring its untrusted configuration as the entire remedy.

**Recovery path:**

1. Establish the affected identities, hosts, secret channels and possible unauthorized financial/auth/media changes without publishing credentials or customer data. Preserve original evidence and trusted backup provenance.
2. Prepare a trusted replacement environment where necessary. Recover an authenticated, independently protected recovery set; a compromised host's matching archive/checksum pair alone is insufficient provenance.
3. Rotate/revoke affected credentials and assess sessions, account memberships, restored permissions and external infrastructure identities through the existing authorized security/identity process. The application has no general user-facing membership/session-administration or secret-rotation screen to substitute for that process.
4. Verify that services receive only their declared role-specific bindings, long-running processes do not retain operator/migration credentials, and restored privileges have not widened. Do not disable auth/CSRF/TLS/RLS or remove rate limits to regain access.
5. Review financial/source and audit evidence for integrity at the chosen cutoff before returning service. A backup can resurrect pre-cutoff sessions or memberships; assess subsequent revocations and incident decisions before opening ingress.

**Verify and escalate:** Verify authorized access, wrong/no-tenant denial, protected origin/readiness and the actual credential/session decisions on the target; source correctness also needs independent review. Exact production rotation/revocation and forensic containment are **Not run** here. [Security review](../security.md) defines implemented controls and their limits; a clean local restore is not a compromise-remediation certification.

## Private media storage fails

**Immediate response:** Restrict uploads/removals and affected writes, preserve the mount/storage and SQL lifecycle metadata, and inspect mount identity, capacity/inodes, ownership and backing-system health privately. An empty replacement directory or newly mounted wrong volume can conceal missing media while the database still appears healthy.

**Recovery path:**

1. Resolve an intact mount/permission/capacity fault through the existing operator process, retaining the configured private path. Do not make it world-readable, move files into the public web directory or accept symlink traversal to regain access.
2. If bytes are lost/corrupt, select a coordinated database/media recovery set. Follow the empty-target restore procedure and its path/type/hash checks; SQL attachment metadata alone cannot recreate original files.
3. Preserve pending/staged/removed lifecycle evidence and compare ready objects explicitly. Do not delete or promote unknown files during incident backup/restore.
4. If only an older media copy is available, record the mismatch and loss interval. Do not claim complete fidelity by suppressing missing attachments or changing their hashes. Recover evidence through a separately reviewed process before cutover.

**Verify and escalate:** Require matching ready-object count/size/hash and authorized original-byte downloads, restrictive ownership/modes and no public/static exposure. Storage preflight can create/read/remove its own probe but does not verify every stored object, disk durability or capacity alert delivery. Storage-full, inode exhaustion, device failure and production mount recovery remain **Not run** unless separately evidenced.

## Accept a recovered service deliberately

Complete the recovery runbook's verification before opening ingress; retain a restricted operator record of the selected target, cutoff and actual decision. At minimum:

- Confirm one active write authority, trusted release/configuration, PostgreSQL major/application schema compatibility and exact reviewed migration history.
- Verify complete data/sequence/security fidelity before restored writes, restricted runtime identities, enabled integrity/RLS guards and authorized/no-context/wrong-tenant access boundaries.
- Compare representative exact cash by native currency, source execution/lot/allocation quantities, principal and fee partitions, realized/unrealized availability, actual-versus-reporting FX and account bridge results at the same recorded context. A flat position is not automatic campaign closure; a known subtotal is not complete equity. Use [financial diagnostics](../troubleshooting/financial-discrepancies.md), not direct ledger repair.
- Verify a valid sign-in/session and private attachment/source retrieval. Readiness and SQL hashes do not prove public-edge TLS, media availability or every user workflow.
- Inspect restored queue/outbox state before worker resumption. Expiry/lease/retry and at-least-once delivery can replay a pending generation; do not truncate queues, mark outbox delivered or recreate source fills. Verify native generation status independently; it is not NAV or an as-of report. The current supported authenticated refresh requests another audited generation without changing financial balances.
- Record actual restored cutoff, missing/unknown confirmed writes, restore/verification/cutover timing and remaining exclusions. Establish a fresh verified backup and confirm deployment monitoring/alert ownership after cutover. Keep the prior environment isolated for investigation.

Independent statement reconciliation remains a separate scope-specific check. A zero internal accounting variance, a matched listed-only statement or one passing synthetic campaign does not establish all broker history was recovered. Do not reopen access while unresolved loss/integrity decisions are disguised as successful zero results.

## Recovery objectives and evidence limits

[ADR 0008](../decisions/0008-testing-and-operations.md) proposes daily protected backups, 30-day retention, **RPO ≤24 hours** and **RTO ≤4 hours** for an initial single-host baseline. These are **proposed policy**, not established host guarantees, financial SLAs or deployed schedules. No configured workflow alone provisions offsite encryption, recoverable keys, backup retention, monitoring recipients or production failover.

Measure the actual recovery set's consistency cutoff against independently confirmed later writes; report the resulting observed/potential loss interval. Measure service recovery through verification and controlled cutover, including replacement infrastructure/configuration, rather than quoting only archive extraction time. The tiny local drill's subsecond restore phase cannot establish a production RTO.

The source [recovery drill](../../scripts/operations/recovery-drill.ts) creates only its own synthetic source and new isolated target, coordinates SQL/media with its owned connections stopped, compares canonical complete snapshots/security and financial DTOs, checks existing/fresh authentication and a private PNG, and completes a restored pending queue probe. Its cleanup guards are in [recovery safety](../../scripts/operations/recovery-safety.ts). A [configured CI recovery step](../../.github/workflows/ci.yml) is not proof of a successful hosted run or actual production recovery.

Use the checkpoint [verification record](verification.md) for fresh results. Unexercised incident branches, production-size recovery/cutover, offsite/key recovery, physical backup/WAL/PITR, compromised-host forensics and alert delivery remain explicit gaps. [FA-04 production capacity](../final-audit.md) remains open; a documentation checkpoint or small restore drill closes no release gate.
