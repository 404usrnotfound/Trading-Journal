# Phase 5 source file inventory

At this inventory check, the working tree on `feat/phase-5-strategies` contains 33 created files, 18 modified files and 0 deleted files. These changes are unstaged and uncommitted. No commit, push or deployment was performed for this phase. [Validation](phase-5-validation.md) records executed checks and scope limits.

The approved specification, requirements, architecture/ADRs, Phase 2 domain/calculation/fixture/capability documents and published migrations `0000`–`0002` (including their snapshots) are unchanged. Phase 5 adds migrations `0003`/`0004` and their snapshots and updates the migration journal and readiness to version 5. Migration `0004` adds the compact JSON definition size check through a forward migration because `0003` was already applied; the applied migration was preserved. The financial ledger remains authoritative; strategy classification adds immutable version references without changing financial postings or projections.

## Purpose groups

- Frontend and routing: strategy list/detail/create/edit/archive screens, structured playbook controls, private attachment controls and authenticated strategy/file API routes.
- Contracts and services: strict shared strategy/file schemas, generated OpenAPI/client contracts, workspace authorization, immutable versions, concurrency/idempotency checks and explicit trade version pins.
- Persistence: additive strategy tables, tenant constraints, immutable historical records, private attachment metadata and schema readiness.
- Verification and documentation: contract/UI/unit/PostgreSQL/browser tests, development and migration instructions, strategy behavior, validation evidence and this exact file inventory.

## Created

- [apps/web/src/app/api/v1/workspaces/[workspaceId]/strategies/[...path]/route.ts](../apps/web/src/app/api/v1/workspaces/[workspaceId]/strategies/[...path]/route.ts)
- [apps/web/src/app/api/v1/workspaces/[workspaceId]/strategies/route.ts](../apps/web/src/app/api/v1/workspaces/[workspaceId]/strategies/route.ts)
- [apps/web/src/app/api/v1/workspaces/[workspaceId]/strategy-attachments/[attachmentId]/route.ts](../apps/web/src/app/api/v1/workspaces/[workspaceId]/strategy-attachments/[attachmentId]/route.ts)
- [apps/web/src/app/api/v1/workspaces/[workspaceId]/strategy-attachments/route.ts](../apps/web/src/app/api/v1/workspaces/[workspaceId]/strategy-attachments/route.ts)
- [apps/web/src/app/strategies/page.tsx](../apps/web/src/app/strategies/page.tsx)
- [apps/web/src/components/strategies/strategy-api.ts](../apps/web/src/components/strategies/strategy-api.ts)
- [apps/web/src/components/strategies/strategy-attachments.tsx](../apps/web/src/components/strategies/strategy-attachments.tsx)
- [apps/web/src/components/strategies/strategy-editor.tsx](../apps/web/src/components/strategies/strategy-editor.tsx)
- [apps/web/src/components/strategies/strategy-workspace.tsx](../apps/web/src/components/strategies/strategy-workspace.tsx)
- [docs/phase-5-files.md](../docs/phase-5-files.md)
- [docs/phase-5-validation.md](../docs/phase-5-validation.md)
- [docs/strategies.md](../docs/strategies.md)
- [packages/contracts/src/strategies.ts](../packages/contracts/src/strategies.ts)
- [packages/contracts/src/strategy-attachments.ts](../packages/contracts/src/strategy-attachments.ts)
- [packages/database/migrations/0003_strategy_management.sql](../packages/database/migrations/0003_strategy_management.sql)
- [packages/database/migrations/0004_strategy_definition_size.sql](../packages/database/migrations/0004_strategy_definition_size.sql)
- [packages/database/migrations/meta/0003_snapshot.json](../packages/database/migrations/meta/0003_snapshot.json)
- [packages/database/migrations/meta/0004_snapshot.json](../packages/database/migrations/meta/0004_snapshot.json)
- [packages/database/src/strategy-schema.ts](../packages/database/src/strategy-schema.ts)
- [packages/server/src/strategies/api.ts](../packages/server/src/strategies/api.ts)
- [packages/server/src/strategies/attachment-api.ts](../packages/server/src/strategies/attachment-api.ts)
- [packages/server/src/strategies/attachments.ts](../packages/server/src/strategies/attachments.ts)
- [packages/server/src/strategies/repository.ts](../packages/server/src/strategies/repository.ts)
- [packages/server/src/strategies/service.ts](../packages/server/src/strategies/service.ts)
- [tests/e2e/strategies.spec.ts](../tests/e2e/strategies.spec.ts)
- [tests/integration/strategy-api.test.ts](../tests/integration/strategy-api.test.ts)
- [tests/integration/strategy-attachments.test.ts](../tests/integration/strategy-attachments.test.ts)
- [tests/integration/strategy-database.test.ts](../tests/integration/strategy-database.test.ts)
- [tests/integration/strategy-fixture.ts](../tests/integration/strategy-fixture.ts)
- [tests/integration/strategy-services.test.ts](../tests/integration/strategy-services.test.ts)
- [tests/ui/strategies.test.tsx](../tests/ui/strategies.test.tsx)
- [tests/unit/strategy-attachments.test.ts](../tests/unit/strategy-attachments.test.ts)
- [tests/unit/strategy-contracts.test.ts](../tests/unit/strategy-contracts.test.ts)

## Modified

- [README.md](../README.md)
- [apps/web/src/app/globals.css](../apps/web/src/app/globals.css)
- [apps/web/src/app/page.tsx](../apps/web/src/app/page.tsx)
- [apps/web/src/lib/api-response.ts](../apps/web/src/lib/api-response.ts)
- [apps/web/src/lib/server-query.ts](../apps/web/src/lib/server-query.ts)
- [docs/development-plan.md](../docs/development-plan.md)
- [packages/contracts/openapi.json](../packages/contracts/openapi.json)
- [packages/contracts/src/financial.ts](../packages/contracts/src/financial.ts)
- [packages/contracts/src/generate.ts](../packages/contracts/src/generate.ts)
- [packages/contracts/src/generated/api.d.ts](../packages/contracts/src/generated/api.d.ts)
- [packages/contracts/src/index.ts](../packages/contracts/src/index.ts)
- [packages/database/README.md](../packages/database/README.md)
- [packages/database/migrations/meta/_journal.json](../packages/database/migrations/meta/_journal.json)
- [packages/database/src/readiness.ts](../packages/database/src/readiness.ts)
- [packages/database/src/schema.ts](../packages/database/src/schema.ts)
- [packages/server/src/financial/catalog-types.ts](../packages/server/src/financial/catalog-types.ts)
- [packages/server/src/financial/catalog.ts](../packages/server/src/financial/catalog.ts)
- [packages/server/src/index.ts](../packages/server/src/index.ts)

## Deleted

None.

Generated OpenAPI/client files and migration metadata are included above. Private `.env`, storage, caches, dependencies, builds, database volumes, logs and disposable verification copies remain ignored and are excluded. No secret files were added or staged. Environment examples, configuration files, package manifests and `pnpm-lock.yaml` are unchanged; no dependency changes were needed.
