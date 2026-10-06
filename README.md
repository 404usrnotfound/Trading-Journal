# Trading Journal

Broker-independent, multi-asset trading journal. This checkout contains the Phase 0–2 design documents. The earlier Phase 3 scaffold has been reverted; application implementation has not resumed.

Start with the authoritative [product specification](Trading_Journal_Codex_Prompt.md), then read:

1. [Requirements analysis](docs/requirements-analysis.md) — scope, ambiguities and acceptance scenarios.
2. [Approved architecture](docs/architecture.md) and [architectural decisions](docs/decisions/README.md).
3. [Financial domain model](docs/domain-model.md) — entities, relationships, states and invariants.
4. [Financial calculation contracts](docs/financial-calculations.md), [instrument capabilities](docs/instrument-capabilities.md) and [independent financial examples](docs/financial-fixtures.md).
5. [Development plan](docs/development-plan.md) and [Phase 0–2 validation](docs/phase-2-validation.md).

There are no install, start, migration, test, lint, type-check or build commands in this documentation baseline. Phase 3 will create and validate the application foundation before Phase 4 implements the ledger. No credentials or environment files are required to review these documents.
