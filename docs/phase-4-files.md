# Phase 4 source file inventory

At the verification handoff, the working tree on `feat/phase-4-core-ledger` contains 40 created files, 20 modified files and 0 deleted files. These changes are unstaged and uncommitted; no push or deployment was performed. [Validation](phase-4-validation.md) records checks and material limits.

The approved specification, Phase 0–2 requirements/architecture/ADRs/domain/calculation/fixture/capability documents and migrations `0000`/`0001` are unchanged. The original platform schema was extracted into `platform-schema.ts` and re-exported together with the new financial schema.

## Created

- [apps/web/src/app/api/v1/workspaces/[workspaceId]/financial/[...path]/route.ts](../apps/web/src/app/api/v1/workspaces/[workspaceId]/financial/[...path]/route.ts)
- [docs/core-ledger.md](../docs/core-ledger.md)
- [docs/financial-metrics.md](../docs/financial-metrics.md)
- [docs/phase-4-files.md](../docs/phase-4-files.md)
- [docs/phase-4-validation.md](../docs/phase-4-validation.md)
- [packages/contracts/src/financial.ts](../packages/contracts/src/financial.ts)
- [packages/database/migrations/0002_core_financial_ledger.sql](../packages/database/migrations/0002_core_financial_ledger.sql)
- [packages/database/migrations/meta/0002_snapshot.json](../packages/database/migrations/meta/0002_snapshot.json)
- [packages/database/src/financial-schema.ts](../packages/database/src/financial-schema.ts)
- [packages/database/src/platform-schema.ts](../packages/database/src/platform-schema.ts)
- [packages/domain/src/decimal.ts](../packages/domain/src/decimal.ts)
- [packages/domain/src/inventory-types.ts](../packages/domain/src/inventory-types.ts)
- [packages/domain/src/inventory.ts](../packages/domain/src/inventory.ts)
- [packages/domain/src/money.ts](../packages/domain/src/money.ts)
- [packages/domain/src/postings.ts](../packages/domain/src/postings.ts)
- [packages/domain/src/valuation.ts](../packages/domain/src/valuation.ts)
- [packages/server/src/financial/api.ts](../packages/server/src/financial/api.ts)
- [packages/server/src/financial/catalog-types.ts](../packages/server/src/financial/catalog-types.ts)
- [packages/server/src/financial/catalog.ts](../packages/server/src/financial/catalog.ts)
- [packages/server/src/financial/commands.ts](../packages/server/src/financial/commands.ts)
- [packages/server/src/financial/ledger-types.ts](../packages/server/src/financial/ledger-types.ts)
- [packages/server/src/financial/ledger.ts](../packages/server/src/financial/ledger.ts)
- [packages/server/src/financial/observations.ts](../packages/server/src/financial/observations.ts)
- [packages/server/src/financial/reference-data.ts](../packages/server/src/financial/reference-data.ts)
- [packages/server/src/financial/repository.ts](../packages/server/src/financial/repository.ts)
- [tests/e2e/financial-ledger.spec.ts](../tests/e2e/financial-ledger.spec.ts)
- [tests/integration/financial-api.test.ts](../tests/integration/financial-api.test.ts)
- [tests/integration/financial-catalog.test.ts](../tests/integration/financial-catalog.test.ts)
- [tests/integration/financial-database.test.ts](../tests/integration/financial-database.test.ts)
- [tests/integration/financial-ledger.test.ts](../tests/integration/financial-ledger.test.ts)
- [tests/integration/financial-observations.test.ts](../tests/integration/financial-observations.test.ts)
- [tests/unit/financial-catalog.test.ts](../tests/unit/financial-catalog.test.ts)
- [tests/unit/financial-contracts.test.ts](../tests/unit/financial-contracts.test.ts)
- [tests/unit/financial-decimal.test.ts](../tests/unit/financial-decimal.test.ts)
- [tests/unit/financial-independent-fixtures.test.ts](../tests/unit/financial-independent-fixtures.test.ts)
- [tests/unit/financial-inventory-campaign.test.ts](../tests/unit/financial-inventory-campaign.test.ts)
- [tests/unit/financial-inventory-transfer.test.ts](../tests/unit/financial-inventory-transfer.test.ts)
- [tests/unit/financial-inventory.test.ts](../tests/unit/financial-inventory.test.ts)
- [tests/unit/financial-observations.test.ts](../tests/unit/financial-observations.test.ts)
- [tests/unit/financial-valuation.test.ts](../tests/unit/financial-valuation.test.ts)

## Modified

- [README.md](../README.md)
- [apps/web/src/lib/api-response.ts](../apps/web/src/lib/api-response.ts)
- [docs/development-plan.md](../docs/development-plan.md)
- [package.json](../package.json)
- [packages/contracts/openapi.json](../packages/contracts/openapi.json)
- [packages/contracts/src/generate.ts](../packages/contracts/src/generate.ts)
- [packages/contracts/src/generated/api.d.ts](../packages/contracts/src/generated/api.d.ts)
- [packages/contracts/src/index.ts](../packages/contracts/src/index.ts)
- [packages/database/README.md](../packages/database/README.md)
- [packages/database/migrations/meta/_journal.json](../packages/database/migrations/meta/_journal.json)
- [packages/database/src/index.ts](../packages/database/src/index.ts)
- [packages/database/src/readiness.ts](../packages/database/src/readiness.ts)
- [packages/database/src/schema.ts](../packages/database/src/schema.ts)
- [packages/domain/package.json](../packages/domain/package.json)
- [packages/domain/src/index.ts](../packages/domain/src/index.ts)
- [packages/server/package.json](../packages/server/package.json)
- [packages/server/src/errors.ts](../packages/server/src/errors.ts)
- [packages/server/src/index.ts](../packages/server/src/index.ts)
- [packages/server/src/services.ts](../packages/server/src/services.ts)
- [pnpm-lock.yaml](../pnpm-lock.yaml)

## Deleted

None.

Generated OpenAPI/client and migration metadata are included in the inventory. Private `.env`, storage, caches, dependencies, builds, database volumes, verification logs and disposable source copies are excluded by Git ignore rules and were not staged. `.env.example` contains no credentials and was unchanged by this phase.
