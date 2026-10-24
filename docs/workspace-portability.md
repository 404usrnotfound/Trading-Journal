# Workspace portability

**Data portability** provides a complete workspace JSON backup, restore into a separate workspace, and filtered JSON/CSV exports of supported record populations. Complete backup and restore require the workspace owner. Filtered exports require viewer access. Mutation requests retain the normal session, Origin and CSRF checks.

The versioned `journal-workspace/1` archive includes the closed set of supported application collections, source and correction history, decimal strings, calculation manifests, per-collection and archive SHA-256 checksums, and private attachment bytes with their own size and checksum. Credentials, sessions and historical access grants are excluded. Treat the downloaded file as private financial data.

Restore validates the supported schema/calculation versions, collection set, checksums, media, tenant relationships and immutable financial constraints. It creates a new workspace owned by the current user; it does not overwrite the original. Historical source actors remain provenance rather than new access grants. Original attachment object identities remain inside the new workspace's private storage namespace.

Historical financial commands are restored in revision order. Each command is checked by the existing financial command integrity trigger against its matching revision, audit and outbox evidence before advancing. Final deferred foreign-key and conservation checks and regenerated financial verification must pass before commit. A failed restore rolls back the new workspace and cleans up its new private files. Retrying the same restore command returns its committed result.

The current synchronous archive limit is 64 MiB and 100,000 total rows, with at most 10 MiB per media object. Oversized requests are rejected explicitly. This is separate from the full operational database/media backup and recovery procedure in [backup-and-recovery.md](backup-and-recovery.md).

Filtered exports accept explicit record/account and time selections. CSV text is escaped against spreadsheet formula interpretation. Analytics exports require the complete calculation context and retain normal availability and coverage semantics.

Regression coverage in `tests/integration/portability.test.ts` includes real source/media and financial round trips, new workspace isolation, idempotency, corrupt archives and media, tenant/authentication/CSRF boundaries, immutable guards and rollback. Executed results are recorded in [the final audit](final-audit.md).
