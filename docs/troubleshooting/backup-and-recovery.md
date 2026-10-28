# Backup and recovery problems

Reviewed **26 October 2026** for Phase 19 Checkpoint 4 against committed Checkpoint 3 `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2` and application baseline `5132900a03efabaeb307787531546987228220e7`. These procedures are **Source-reviewed**; the [manual verification](../user-guide/verification.md), [portability tests](../../tests/integration/portability.test.ts), [FA-06 remediation](../audit-remediation.md) and existing local recovery drill provide **Historically passed** evidence. [Checkpoint verification](verification.md) identifies fresh checks and unrun recovery procedures.

Use **Data & backups** for a supported portable workspace archive. Use the existing [operator backup/recovery procedure](../backup-and-recovery.md) for coordinated PostgreSQL, roles, private media and protected release/configuration recovery. A filtered CSV/JSON record export is neither of these recovery sets. Before the Checkpoint 5 refresh, the operator document's opening and worker paragraphs described workspace portability as unimplemented and worker processing as health-only. Those statements described earlier behavior and are now corrected in the current runbook: current [workspace portability](../workspace-portability.md) and [financial outbox](../financial-outbox.md) are implemented. Preserve that historical text's context rather than applying those old exclusions to an incident.

> **Warning:** Preserve the original database/volumes, media, failed release and last good recovery set before any potentially destructive restore, replacement or repair. Use a separate empty recovery target with ingress/writers stopped. Volume deletion, database reset, archive editing and manual ledger changes are not first-line troubleshooting fixes.

## The chosen file is not a restorable workspace archive

**Problem:** **Restore into a new workspace** rejects the selected download.

**Symptoms:** The UI can show **Select a workspace backup.**, **Use a backup smaller than 64 MiB.**, a JSON parsing failure, or a server problem such as `INVALID_REQUEST` / `INVALID_WORKSPACE_ARCHIVE`. Invalid JSON browser wording varies; this guide does not assign it a fabricated application message.

**Possible causes:** A filtered `journal-record-export/1` file or CSV was selected; truncated/invalid JSON; a different format; an empty filename; incorrect file contents/structure; or the request exceeds the allowed size. The restore expects a complete `journal-workspace/1` archive, not source broker CSV or an operational SQL dump.

**Diagnosis:**

1. Preserve the original file privately. Check its source, release/date, extension and size without sharing its contents.
2. Confirm that it came from **Complete workspace backup** → **Download workspace backup**, rather than **Export selected records** or a browser error-page download.
3. Read the safe error/code/request ID. An operator can inspect the format/schema/calculation fields locally using restricted tools; do not paste the archive or base64 media into a public JSON validator.

**Resolution:**

1. Select the intact original workspace backup. If the source workspace is healthy and accessible to its owner, download a new complete backup through the [manual workflow](../user-guide/imports-and-exports.md#download-a-complete-owner-workspace-backup).
2. If only a filtered export exists, retain it as evidence. It cannot be converted to an equivalent complete archive by renaming/repacking it; escalate the recovery requirement.
3. Restore into a separate new workspace and review the confirmation. Do not overwrite or drop the original workspace to make room for a retry.

**Verification:** The UI shows **The new workspace was restored and verified.**, then **Open restored workspace**. Check its new identity, expected cash/holdings/source history and authorized attachments. Download success alone is not restore verification.

**Escalation:** Collect private file size, format/schema metadata, release identity, source of the download, status/code/request ID and whether the original is still available. Do not attach the archive: it includes financial records, journal/source text and private media. Evidence: [portable contracts](../../packages/contracts/src/portability.ts), [restore UI](../../apps/web/src/components/portability/portability-workspace.tsx) and [integrity validator](../../packages/server/src/portability/integrity.ts).

## Archive schema or calculation versions are incompatible

**Problem:** The archive requires a different application/schema/calculation baseline.

**Symptoms:** `422 INCOMPATIBLE_WORKSPACE_ARCHIVE` says **This archive requires another schema or calculation version. Restore it with the matching application release.**

**Possible causes:** A backup from another application release has a different exact database schema or financial calculation manifest. The same `journal-workspace/1` format name is not a cross-version compatibility guarantee. Current schema is 17 at this baseline.

**Diagnosis:**

1. Record the producing release and archived version metadata privately; compare with the running release and [database diagnostics](database-and-migrations.md).
2. Confirm that the selected file is an untouched complete archive. Do not change its version fields simply to make validation proceed.
3. Determine whether the matching release, lockfile and reviewed migrations remain available. No automatic archive upgrade/downgrade workflow is delivered.

**Resolution:**

1. Preserve the archive and the current system. Have an operator prepare an isolated environment running the matching release with its proper schema.
2. Restore and verify there before considering a reviewed forward upgrade of that new environment. Follow the supported installation/migration and recovery boundaries; never downgrade the existing live schema or edit applied history.
3. If the matching release cannot be recovered, escalate with version metadata. Do not recalculate checksums around manually changed schema or economic fields.

**Verification:** A matching-release isolated restore passes all built-in checks and the operator's selected financial/media comparisons. Upgrading afterward requires its own evidence; a successful historical-format restore does not certify the upgrade.

**Escalation:** Provide producing/running commit IDs, schema version and calculation-version names, safe status/code/request ID, and availability of a matching recovery release. Keep archive content and identities private. Evidence: `validateArchive` in [integrity](../../packages/server/src/portability/integrity.ts), [calculation manifest](../../packages/domain/src/index.ts) and [portability tests](../../tests/integration/portability.test.ts).

## Checksums, source relationships or replay verification fail

**Problem:** The archive is not internally valid or does not reproduce its recorded financial evidence.

**Symptoms:** `INVALID_WORKSPACE_ARCHIVE` can report **The archive checksum does not match.**, **Unknown or duplicate archive collection.**, **Archive records must belong to its declared source workspace.** or **Private media is duplicated, malformed or has an invalid checksum.** `WORKSPACE_FIDELITY_MISMATCH` reports **Regenerated inventory or native cash differs from the archive verification. Nothing was restored.** Other collection/constraint failures can have a safe generic response.

**Possible causes:** Corruption/truncation, manual edits, detached or wrong archive/media content, unsupported/duplicate/missing collections, foreign workspace references, changed verification evidence or a genuine application/restore defect. A checksum establishes internal byte consistency; it does not authenticate who supplied the archive or make edited financial facts true.

**Diagnosis:**

1. Preserve the original archive and failing response/request ID. Compare its protected transfer/file checksum with the original backup manifest if available.
2. Obtain another intact copy from the trusted backup source. Check whether the same untouched file fails on its matching release in isolation.
3. Use the built-in restore checks rather than selecting raw ledger tables or disabling constraints. The implementation requires collection hashes, media size/hash, supported relationships and independently regenerated financial verification.

**Resolution:**

1. Retry with a verified intact copy only after confirming the original outcome. Do not repair checksum fields or remove records/attachments to pass validation.
2. If a trusted copy still fails, stop retries and escalate. Preserve the source workspace/recovery set. A failed new-workspace restore rolls back its database work and attempts cleanup of newly written media; inspect unexpected storage-cleanup errors privately rather than deleting arbitrary files.
3. If the source system itself is damaged, an operator follows the separate coordinated full-system recovery process into an empty target, with a preserved recovery set and explicit cutover decision.

**Verification:** A restore must return `verified: true` and permit the expected authorized reads; compare actual cash, quantities, open/closed campaign state and known attachment bytes. A partially visible directory or HTTP connection completion is not a passed restore.

**Escalation:** Collect archive provenance, safe size/hash/version metadata, request/code IDs, matching-release reproduction and whether a new workspace appears. Share original private artifacts only through an approved secure channel. Evidence: [integrity checks](../../packages/server/src/portability/integrity.ts), [restore transaction/replay](../../packages/server/src/portability/service.ts), [SQL restore guard](../../packages/database/migrations/0011_workspace_portability.sql) and [negative restore tests](../../tests/integration/portability.test.ts).

## The workspace is too large for portable backup or restore

**Problem:** The synchronous portable workflow refuses its bounded record/media/byte scope.

**Symptoms:** `WORKSPACE_ARCHIVE_TOO_LARGE` can say **This workspace exceeds the portable archive record/byte budget. Use an operator backup for larger workspaces.** Other validator details include **The archive exceeds 64 MiB.**, **The archive exceeds 100,000 records.** and **Expanded private media exceeds 48 MiB.** The browser says **Use a backup smaller than 64 MiB.** for a selected file above its client limit.

**Possible causes:** More than 100,000 total collection rows; database row-JSON byte estimate over 32 MiB before materialization; a complete archive/request exceeding 64 MiB; media object over 10 MiB; expanded media over 48 MiB; or other contract structural/count limits. A backup can be rejected before its final file would reach 64 MiB. Complete backups do not support filters.

**Diagnosis:**

1. Record the exact limit/code and safe size/count estimates. Check the [manual's current bounds](../user-guide/imports-and-exports.md#download-a-complete-owner-workspace-backup) against the [contract](../../packages/contracts/src/portability.ts).
2. Distinguish portable backup from filtered export limits and from disk/database capacity. A filesystem increase does not remove the application's archive budget.
3. Ask the operator to assess a coordinated full-system backup. Do not repeatedly materialize the same large archive while the service is already under pressure.

**Resolution:**

1. Preserve authoritative records and use [operator backup/recovery](../backup-and-recovery.md) for larger/full-system protection.
2. Use filtered exports only for supported analysis/data-sharing tasks; they do not become restore archives or replace the recovery set.
3. Keep production-capacity [FA-04](../final-audit.md) open. Do not raise/remove byte limits or delete financial/audit/media history to force a portable export through.

**Verification:** The selected operator backup records a coordinated cutoff, complete database/roles/media and authenticated manifest, and passes an isolated restore/financial/media verification. A successful filtered export does not resolve a failed backup requirement.

**Escalation:** Collect the safe operation/limit/status/request ID, approximate row/media counts and storage availability, workload scope, and existence/age of a known-good recovery set. Production-sized backup throughput and restore objectives remain deployment-specific and unverified by the small local drill.

## A ready attachment cannot be included or retrieved

**Problem:** Private media storage and recorded attachment evidence do not agree or cannot be accessed safely.

**Symptoms:** A size/hash mismatch during backup can yield `WORKSPACE_MEDIA_UNAVAILABLE`, **An attachment is missing or has changed. A media-complete backup cannot be created.** A missing/unreadable/unsafe-path object can instead surface as a generic failed request; storage errors are deliberately sanitized. Private-store classifications include `NOT_FOUND`, `UNSAFE_STORAGE_PATH`, `INPUT_TOO_LARGE` and `STORAGE_FAILED`, not necessarily a user-visible problem code.

**Possible causes:** Missing private-media mount, wrong `STORAGE_ROOT`, insufficient ownership/permissions, symlink/public/build-path rejection, storage/inode exhaustion, removed bytes, corruption or an incomplete media copy. The private store requires operator-controlled POSIX directories and rejects unsafe paths; exposing storage publicly is not a supported fix.

**Diagnosis:**

1. Confirm workspace/role and attempt one known attachment's authorized download. Distinguish a `401/403/404` access boundary from a genuine media-store failure using [authentication troubleshooting](authentication-and-security.md).
2. The operator checks the configured storage root, mount/space/inodes and service ownership using [diagnostics](diagnostics.md). Keep object paths, filenames and content private. Ordinary configuration validation does not prove filesystem persistence.
3. Compare a ready object's recorded size/hash with protected backup evidence through reviewed operator tooling. Do not change its database hash/state to fit whatever bytes happen to exist.

**Resolution:**

1. Restore the intended private mount/configuration and least-privilege ownership without making files world-readable. Preserve evidence before changing paths or replacing data.
2. If bytes are lost/corrupt, recover their exact authorized content from a coordinated known-good recovery set into an isolated target, following [operator recovery](../backup-and-recovery.md). Verify its lifecycle/ready state and hash before any cutover.
3. Do not omit missing media from a supposedly complete archive or publish pending/staging objects. Escalate an unrecoverable object and document the gap honestly.

**Verification:** The authorized attachment download returns expected bytes/size/hash and complete workspace backup no longer fails the media check. Test a nonmember remains denied. Healthy web/worker probes alone do not establish media integrity.

**Escalation:** Collect release/request IDs, safe storage-error class, mount/space/permission findings and expected-versus-observed size/hash through a restricted channel. Exclude private file bytes, paths revealing account data and original screenshot/journal content. Evidence: [private storage](../../packages/server/src/storage.ts), [attachment lifecycle](../../packages/server/src/strategies/attachments.ts) and [backup media capture](../../packages/server/src/portability/service.ts).

## Restore response is lost, or a repeated attempt reports an idempotency conflict

**Problem:** The browser did not receive a definitive result, or a command key was reused with changed content.

**Symptoms:** A connection failure after **Restore and verify**, an apparently absent success message, or `IDEMPOTENCY_CONFLICT` with **This restore key was already used for another archive.** The new workspace may already have committed despite a lost response.

**Possible causes:** Network/timeout/navigation interruption; a retained identical retry; a changed archive reusing an earlier command key; or a page reload losing in-memory retained-command state. The UI retains the restore command while the same page/body remains available; retention is not durable across reload.

**Diagnosis:**

1. Stop creating new attempts. Inspect the current workspace list for the intended new workspace and its restore result/history; a matching name alone is insufficient because names are not identities.
2. Record the original request ID/time, whether the page remains open, and whether the file/name changed. Do not share the idempotency key or payload in public.
3. An authorized integration/operator can inspect the committed result using its normal authorized workflow. Do not delete restore-request rows or a newly restored workspace to silence a conflict.

**Resolution:**

1. If available, retry the exact retained command without altering the file/body. The server returns the original committed result for the same key/archive.
2. If the page state is gone, establish the prior outcome before starting a distinct restore. Opening an already verified restored workspace may be all that is needed.
3. For an intentional different archive, use a new reviewed restore request only after acknowledging that it creates another workspace. An unexplained conflict requires escalation, not a database edit.

**Verification:** Exactly the intended new workspace is identified, its response is verified and its financial/media reads agree. Existing source/current workspaces remain intact. The [portability tests](../../tests/integration/portability.test.ts) cover exact retries and isolation historically.

**Escalation:** Collect safe request IDs, timestamps, original/result workspace aliases and whether a retained retry or reload occurred. Preserve private archive/hash/key evidence for restricted support. Evidence: [retained-command UI](../../apps/web/src/components/portability/portability-workspace.tsx) and [restore idempotency transaction](../../packages/server/src/portability/service.ts).

## An operational backup or recovery drill fails

**Problem:** The operator's complete recovery set cannot be produced or verified, or the repository's isolated drill refuses its prerequisites/target.

**Symptoms:** Backup tooling exits nonzero, a manifest/hash/media check fails, restored financial/security fingerprints differ, or the safe drill log reports a classified failure. Actual internal drill messages include **The recovery drill requires the local isolated Compose test service**, **Exactly one isolated test PostgreSQL container is required**, **The private test binding does not match the local Compose test service**, and **Recovery verification differs from the quiesced source snapshot**. CLI reporting may omit those raw details intentionally.

**Possible causes:** The wrong Compose project/test port/daemon; missing pinned PostgreSQL image/tools; nonquiesced writers; insufficient complete-database/role/media privileges; storage/space errors; incompatible PostgreSQL/release; missing roles/ACL/RLS/functions/constraints; altered metadata; or a partial SQL/media recovery set. The drill deliberately refuses caller-selected existing recovery targets and existing output files. It is not a general production restore command.

**Diagnosis:**

1. Stop cutover and retain the last known-good recovery set, failed artifacts and safe logs privately. Check every command's exit result; a dump file's existence is not success.
2. Follow [diagnostics](diagnostics.md) to confirm source/target identity, release, database/migration state and filesystem resources. Do not print credential-bearing connection strings, full SQL statements or role passwords.
3. For a local drill, compare the selected project and isolated test binding with the existing [drill prerequisites](../backup-and-recovery.md#reproducible-local-drill) and [recovery safety guards](../../scripts/operations/recovery-safety.ts). For a real incident, use the operator recovery procedure and deployment-specific support, not test-fixture commands against production.

**Resolution:**

1. Correct the documented prerequisite or incomplete backup cause without removing the guard. Serialize maintenance and quiesce all web/worker/external writers when taking the coordinated SQL/media set.
2. Before any destructive replacement/cutover, preserve a complete coordinated backup of the current state and authenticated candidate recovery set, explicitly choose an empty isolated target, and record the potential loss interval. Do not run `--clean`, drop/recreate an existing user database, disable triggers/RLS or delete volumes as an incident shortcut.
3. Restore roles, ownership/ACLs, application/auth/queue/migration state and exact media through the canonical procedure. Verify financial DTOs/fingerprints, tenant denial, media bytes and current native-snapshot/outbox behavior separately. A healthy infrastructure probe is not proof that every financial projection is current.
4. Rerun only the affected isolated drill after its cause is addressed. A full production restore/cutover requires the operator's target review, accepted recovery objective and complete verification; this guide does not certify it.

**Verification:** The operator records a successful complete restore with expected source/table/security/financial/media comparisons, current schema/roles, safe authenticated access and worker behavior, then verifies the approved cutover and a new backup. The small local logical-dump drill does not establish PITR/WAL continuity, HA failover, production TLS, million-fill recovery time, RPO/RTO or alert delivery.

**Escalation:** Collect safe tool/version/step/exit data, source/target aliases, cutoff, manifest hashes/sizes, expected-versus-observed verification categories, elapsed time and backup age. Database dumps, role files, manifests, cookies, logs and media can be sensitive; submit only reviewed summaries through an authorized channel. Evidence: [recovery drill](../../scripts/operations/recovery-drill.ts), [safety tests](../../tests/unit/recovery-safety.test.ts), [existing recovery boundaries](../backup-and-recovery.md) and [outbox behavior](../financial-outbox.md).
