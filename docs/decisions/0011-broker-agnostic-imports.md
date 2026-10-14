# ADR-0011: Canonical import adapters and reviewed ledger commits

- **Status:** Accepted following user approval and merge of Phase 10
- **Date:** 2026-10-13
- **Requirements:** Specification §4, §11 and §14; F-IM-01–06, F-IM-09, N-IM-01–02; INV-07; AC-09 and AC-11.

## Context

The core ledger must remain independent of broker CSV layouts. Imports need exact decimals, source preservation, scoped identities, explicit unknowns, review, retry safety and correction history. A parser that writes holdings or guesses monetary values would bypass the existing domain invariants. Existing financial commands already validate tenant references, balanced postings, quantity/basis, corrections and provenance in PostgreSQL transactions.

ADR 0007 proposes private file storage and durable jobs for large imports. A synchronous, tightly bounded initial CSV workflow needs a concrete storage and transaction boundary without implying that bulk orchestration, exports or restore are delivered.

## Decision

Use a trusted, versioned server adapter registry. Adapters translate files into a broker-neutral `CanonicalImportDraft` envelope containing kind/payload, stable source ID when available, local source key, complete dependency group and warnings. Strict shared financial contracts and a ledger port validate and apply existing commands. No CSV header, broker parser or broker accounting formula enters `packages/domain`.

Store accepted source text and its UTF-8 SHA-256, raw rows, immutable mapping/template versions, adapter identity/version, normalized drafts, issues, operation history and result links in tenant-scoped PostgreSQL records. For this initial **2 MiB / 1,000-row** text workflow, database storage provides one transaction/backup boundary and removes file/database orphan handling. This **refines ADR 0007 for bounded CSV source text only**: media remains in private file storage; large sources and durable bulk imports retain the planned storage/job contract. The accepted text is retained, not a claim to preserve arbitrary non-UTF-8 upload bytes. Authorized source downloads use attachment disposition, private/no-store caching and `nosniff`.

Scope identity by workspace, account, namespace and record kind, using a stable source ID or a versioned normalized payload fingerprint. Identical input is a financial no-op; changed stable IDs require reviewed correction. Identical occurrences without IDs in one source are ambiguous and cannot be silently deduplicated. Require unique local source keys and stable source IDs on rows containing references. Dependent-row payload hashes use fixed-size memoized dependency-intent hashes and result paths rather than local declaration names/order, avoiding exponential expansion of repeated dependency graphs. Import-specific source claims/history coexist with existing core cash/fill source identities so previously booked effects can be adopted rather than posted twice.

Dry runs invoke real financial commands under rollback savepoints and force deferred PostgreSQL constraints before accepting results. Persist only the review at its batch revision and financial source revision. Commit reruns the exact reviewed complete-group selection in one transaction; concurrent financial changes invalidate the review. A partial batch is a sequence of explicitly reviewed complete-group selections, never silent row dropping or a successfully committed prefix after failure. Bound each preview/commit to 100 rows and expose 50-item pages.

Retain unknown cost completeness by default for imported fills/opening lots. Reconcile explicit execution-linked statement cash to existing postings, with exact amount/currency/time/scope matching and no extra posting. Cash and execution corrections reuse append-only domain commands. Automatic batch reversal is limited to independent cash movements and blocks financial activity outside the batch after its first actual financial effect. Compute this boundary from owned commands across every partial commit; duplicate/no-op commits cannot reset it. Fills, lots, fees, FX, observations and catalog changes require explicit domain correction. Owned account/holding transfers and bucket settlement/reclassification are not canonical import kinds in this increment; they must use existing domain workflows, not be reclassified as external cash flows.

Use existing session/CSRF/membership boundaries, strict DTOs, idempotency keys and tenant RLS. Uploaded data can select only installed adapter versions; it cannot supply executable adapters. No new service, credentials, dependencies or background handler are necessary for the bounded implementation. Schema version 9 adds migration 0008; migrations 0000–0007 remain frozen.

## Alternatives considered

- **Broker layouts in the core ledger:** couples financial rules to exports and weakens shared invariants.
- **Parser-owned direct ledger writes:** makes preview, retry and correction behavior differ from manual entry.
- **Fingerprint-only or filename-based deduplication:** cannot distinguish repeated events or stable-ID corrections reliably.
- **Parse-only preview:** misses deferred database constraints, bucket/reference rules and real financial dependencies.
- **Filesystem source staging for the initial small files:** valid for future bulk sources, but adds an orphan/cleanup protocol without current need. Source text remains private and bounded in the database.
- **Unrestricted batch deletion/reversal:** can remove shared or consumed financial history. Use append-only monetary reversal and conservative dependency checks.
- **Immediate worker orchestration for all CSV:** adds a second progress/retry boundary for bounded requests. Durable large imports remain separately planned and require benchmarks and restart/cancellation tests.

## Consequences

Another broker format requires a parser, registration and source fixtures, not core-domain edits. Immutable versions and retained sources make diagnosis reproducible. Source text increases database size, so the bounded limits and operator backup/privacy requirements remain material. A future move to private source objects must preserve hashes, mappings, source rows and authorization with an explicit migration/lifecycle protocol.

Generic mapping is intentionally explicit about instrument/currency identities and signs. A source may be recordable with unknown economics while P&L remains unavailable. The importer is not a full statement reconciler, an automatic campaign generator or a lossless backup tool. Conservative reversal can refuse an economically independent later action because the initial dependency boundary checks all later financial activity outside the batch; a finer dependency planner requires separate review and tests.

## Validation

Required evidence covers independent CSV/decimal/time fixtures, adapter contracts, immutable templates/source records, tenant/API authorization, preview rollback including audits/outbox, deferred constraints, complete-group failure, scoped duplicates and concurrent claims, manual-source adoption, stable-ID corrections, stale previews, partial commits, execution-cash reconciliation, append-only reversal and no-op boundary protection. Browser checks cover the actual mapping/review/history workflow, keyboard access, responsive layouts and both themes. Full regression, migration integrity, API drift, formatting, types and build checks must pass before the increment is handed over. Executed results belong in the Phase 10 validation record; this ADR does not claim unexecuted bulk/restore tests.

## References

- [Import semantics and adapter extension](../imports.md)
- [Financial domain model](../domain-model.md#corrections-imports-reconciliation-and-portability)
- [ADR 0004: Financial kernel and ledger](0004-financial-kernel-and-ledger.md)
- [ADR 0007: Private storage and durable jobs](0007-private-storage-and-durable-jobs.md)
- [Product specification](../../Trading_Journal_Codex_Prompt.md)
