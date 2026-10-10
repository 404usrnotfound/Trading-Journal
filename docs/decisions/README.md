# Architectural decision records

ADRs 0001–0008 record the **approved Phase 1 architecture** and are marked accepted following the user's approval. ADR 0009 records the Phase 2 financial-domain refinements for review. These records do not imply currently retained implementation, dependency installation, test success, deployment, or product support. The previous Phase 3 scaffold was reverted. Phase 0's requirements analysis remains historical input; these records address its missing decisions without editing its original findings.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-monolith-and-stack.md) | Modular monolith, workspace boundaries and compatible stack | Accepted |
| [0002](0002-contracts-and-ui.md) | Typed REST/OpenAPI contracts, validation, UI state and charts | Accepted |
| [0003](0003-authentication-and-tenancy.md) | Local authentication, database sessions and workspace authorization | Accepted |
| [0004](0004-financial-kernel-and-ledger.md) | Deterministic decimal kernel, balanced ledger and atomic invariants | Accepted |
| [0005](0005-versioned-domain-and-multicurrency.md) | Domain separation, historical versions, assets, lot attribution and FX | Accepted |
| [0006](0006-postgres-drizzle-and-migrations.md) | PostgreSQL/Drizzle, constraints, query scope and migrations | Accepted |
| [0007](0007-private-storage-and-durable-jobs.md) | Private files, lossless restore and durable PostgreSQL jobs | Accepted |
| [0008](0008-testing-and-operations.md) | Independent tests, performance, logging, configuration and deployment | Accepted |
| [0009](0009-financial-domain-contracts.md) | Financial identities, principal/basis, attribution, signed FX and transit ownership | Proposed for Phase 2 review |

Use numbered ADRs with context, a concrete decision, alternatives, consequences, validation and references. Following review, record accepted/superseded status explicitly; later changes supersede prior ADRs rather than erasing their reasoning. Product requirements still take precedence over architecture choices. Resolving a future financial-method gate requires documented definitions and fixtures, not an unsupported capability claim.
