# Contributing changes

Reviewed **26 October 2026**, Phase 19 Checkpoint 6, against committed Checkpoint 5 `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`, with application baseline `5132900a03efabaeb307787531546987228220e7`. This guide describes checked-in rules and a recommended review workflow. It does not invent GitHub branch-protection settings or an approval count absent from repository evidence.

Read [architecture](../architecture.md), the [developer architecture guide](architecture.md), [domain model](../domain-model.md), [testing/operations ADR](../decisions/0008-testing-and-operations.md) and [documentation standards](../documentation-standards.md) before changing boundaries. Use [local development](local-development.md) for the developer loop, [database migrations](database-migrations.md) for schema changes and [testing](testing.md) for exact command prerequisites/effects.

## Preserve work and choose a branch

First inspect the checkout from repository root:

```bash
git status --short --branch
git rev-parse HEAD
```

These read-only checks show local source state, not a separately deployed service. Preserve existing edits and private configuration. Select the intended reviewed baseline before creating or switching branches; do not reset, clean, overwrite configuration or merge into a shared branch merely to follow a guide. Use a separate checkout when isolation is needed.

Existing history uses branches such as `feat/phase-10-imports`, `fix/phase-13-security`, `perf/phase-15-profiling`, `test/phase-14-correctness`, `chore/phase-16-production-readiness` and `docs/phase-19-complete-documentation`. **Recommended convention:** use a short purpose-specific `feat/`, `fix/`, `perf/`, `test/`, `chore/` or `docs/` name. The checked-in CI workflow runs on push/pull request; no local rule was found that enforces those prefixes. A documentation branch is not automatically a production release base.

Keep a change focused on one concrete behavior or documentation outcome. Split an unrelated refactor/dependency update from a financial fix when their evidence can be reviewed independently. Do not rewrite others' history or force-push shared work as routine contribution practice.

## Code style and module boundaries

The enforced sources are [ESLint](../../eslint.config.mjs), [Prettier](../../.prettierrc.json), [TypeScript base configuration](../../tsconfig.base.json), [.npmrc](../../.npmrc) and [workspace settings](../../pnpm-workspace.yaml). TypeScript is strict, with unchecked indexed access and exact optional-property checking. Prettier selects semicolons, single quotes, trailing commas and a 100-column print width while preserving prose wrapping; use the pinned tool rather than a competing formatter.

- Keep `packages/domain` independent of framework, transport, Node and server/database infrastructure. Preserve browser/client boundaries, including dynamic imports/re-exports. The lint rule checks more than ordinary static imports.
- Treat contracts as the public transport boundary, server services as authorization/transaction orchestration and database constraints as persisted invariants. A UI validation check does not replace a service/SQL guard.
- Preserve exact decimal strings, quantity/currency identities, economic timestamp precision, source ordering, immutable revisions and explicit availability. Do not use floating-point conveniences or silent zero/fallback formulas for unsupported economics.
- Keep financial changes append-only through reviewed source correction/reversal/attribution paths. Do not edit historical ledger, migration, original-risk, strategy, journal or audit facts to repair a test/report.
- Use current session/membership/role and same-origin CSRF checks at the intended boundary. Do not broaden a privileged function or queue-role grant to avoid designing an authorized interface.
- Log fixed safe classifications and correlation metadata. Never add request bodies, cookies, connection strings, raw SQL/errors, broker files or private notes to operational logs.

Use the [repository structure guide](repository-structure.md) to locate public interfaces and tests. Follow neighboring source patterns while evaluating their current constraints; an old phase comment is not proof that an unimplemented extension point exists.

## Dependency, API and database changes

Use the complete pinned Corepack/pnpm workspace. `.npmrc` enforces engine/peer checks and exact saves; the workspace also contains reviewed build-dependency/override settings. An approved source change may update manifests/lockfile, but release installation uses `corepack pnpm install --frozen-lockfile`. Do not clear an error with a floating package, automatic force-fix, disabled peer/integrity/TLS checks or an ad hoc runtime-only install.

The completed Checkpoint 5 audit reported seven advisories, including two critical. A passing build or old clean audit does not clear them. Use [security operations](../operations/security-operations.md) and [upgrade controls](../operations/upgrades-and-rollback.md) for a separately reviewed/tested dependency change; no dependency upgrade is implied by a documentation contribution.

For an API change, update the actual source Zod contracts/registration and the implementing route/dispatcher/service together. Run the declared `api:generate` command and review both generated OpenAPI and typed client differences, then run `api:check`. Never hand-edit generated schemas/client declarations or claim an endpoint exists because only its schema was added. Keep request/response examples fictional, schema-valid and faithful to authorization, business validation, errors and binary/download behavior. See [API reference](api-reference.md).

For a schema change, review the full [migration creation/execution process](database-migrations.md). Preserve published SQL/journal history, add reviewed forward changes and test original/empty/populated-prefix behavior, invalid history, tenant/role boundaries and failure atomicity. The runtime requires exact schema 17 at this baseline; no down-migration or generic older-binary rollback is supported. The root migration command includes application SQL, queue migration and runtime-role password/grant provisioning as separate phases, not a universal transaction.

## Choose tests for the change

The [testing guide](testing.md) owns the runnable commands and safe targets. Run the focused meaningful regression first, then the relevant complete gates. Record actual selection/results; do not infer coverage from a file argument that matched no tests. Pure documentation changes need the appropriate link/example/Markdown checks; do not add implementation-mirroring tests merely to increase counts.

| Change                                        | Evidence to include in review                                                                                                                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure domain/financial calculation             | Independent worked inputs/expected results, exact precision/units, missing/unsupported cases, affected pure tests and persisted service/API evidence where orchestration is involved.                                        |
| Ledger, accounting, database or authorization | Disposable PostgreSQL tests for constraints/roles/RLS, source conservation, transaction rollback, idempotent retries, correction/history and selected scope. Include migration upgrade/history checks when relevant.         |
| API/schema/client                             | Generated drift check, accepted/rejected payloads, authentication/authorization/CSRF and safe error cases, response validation and client behavior.                                                                          |
| Frontend page/component                       | Component behavior/validation/loading/error/retry tests plus a representative real browser journey when the UI workflow changed; keyboard/theme/responsive/accessibility assertions where affected.                          |
| Import adapter/mapping                        | Parser/normalization boundaries, full dependency groups, exact amounts/timezone/precision, stable duplicate/correction identities, preview/reconciliation/atomic rejection and source privacy.                               |
| Strategy/journal/analytics                    | Immutable version/plan pins, original-risk timing, revision conflicts, sample/filter semantics, accounting definitions, availability/exclusions and affected report/UI cases.                                                |
| Runtime/dependency/build/storage/worker       | Fresh build/release checks and appropriate native/runtime, lifecycle, secure HTTPS, role/storage, generation/lease/retry and disposable recovery evidence. A tiny fixture does not establish capacity or production RPO/RTO. |
| Documentation/examples                        | Current source and command paths, schema-valid fictional payloads, links/anchors, Mermaid component accuracy, pinned formatting, whitespace and explicit verified/unverified scope.                                          |

For the complete ordinary quality chain, the root `verify` script runs API drift, formatting, lint, types, unit/UI and PostgreSQL integration tests, then build. It needs a disposable configured database and does **not** include every separate gate. The [CI workflow](../../.github/workflows/ci.yml) additionally declares advisory, migration/repeatability, release, HTTPS/recovery and browser checks. The current failed advisory gate prevents an honest all-green pipeline claim. Do not suppress a failing gate or remove meaningful tests to obtain a green status.

## Prepare a reviewable commit and pull request

Existing commit subjects follow a Conventional Commit-like style: `feat(imports): …`, `fix(finance): …`, `fix(security): …`, `chore(ops): …`, `perf: …` and `docs: …`. **Recommended convention:** `<type>(<optional scope>): <concrete change>`, using the observed type appropriate to the result. No checked-in commit-message linter or mandatory scope policy was found. Prefer a factual subject such as `fix(imports): preserve source identity during correction` over a vague “updates” subject.

Before committing, review the complete intended diff and changed-file list. Keep source/configuration secrets, `.env`, private media, database dumps, portable archives, real broker CSV, browser state and unreviewed traces out of Git. Generated contract outputs belong with their source change; build outputs/private test artifacts remain governed by ignore/release rules. Preserve existing excluded specification/ADR/history formatting rather than applying a repository-wide formatting write.

The repository has no checked-in pull-request template or `CODEOWNERS` file at this baseline. For a proposed PR, provide:

1. The concrete problem/trigger and resulting behavior, with a small before/after example when useful.
2. The final implementation scope, compatibility/migration/security/financial consequences and documentation changes. Do not describe abandoned approaches unless they explain a material tradeoff.
3. Exact validation commands, commit/environment/fixture scope, results and remaining failures/unrun paths. Separate source review, historical evidence and fresh execution; do not relabel the earlier 913/576/18 suite counts as this change's result.
4. Any operational requirement: data/write-fence/backup implications, supported rollback/recovery boundary, new configuration and unresolved release gates. A production rollout requires its separate deployment evidence.

**Recommended review coverage:** obtain reviewers who can assess affected financial/domain invariants, database/migration/authorization boundaries, frontend accessibility/state/retry behavior and operational/security effects. These are review considerations, not an invented enforced GitHub approval count. Check actual repository protection/maintainer policy before merging; checked-in workflow files alone do not establish the server-side rules. Do not merge/deploy merely because a local script passed.

## Documentation and security responsibilities

Update the canonical document that owns the changed behavior: architecture/ADRs for boundaries; domain/financial dictionaries for definitions; source-generated API reference/contracts for transport; user tasks for visible behavior; configuration/environment inventory for bindings; operations for deployment/recovery; and feature/verification records for implemented scope. Link instead of creating competing formulas or duplicate deploy/restore recipes. Preserve dated historical evidence while correcting current prose explicitly.

Apply [documentation standards](../documentation-standards.md): relative source links and stable anchors, one H1, language-tagged code fences, exact commands with working directory/prerequisites/effects, fictional data, and accurate **Source-reviewed**, **Historically passed**, **Freshly passed**, **Failed**, **Blocked** and **Not run** labels. Document source-only or API-only capabilities honestly; never invent a page/control/provider or claim a spec-only feature is implemented.

For a suspected vulnerability or exposed credential, preserve the smallest necessary evidence through the organization's approved restricted process. The repository does not define a private reporting mailbox/SLA or authorize posting secrets in public issues. Use [security operations](../operations/security-operations.md) and [sanitized diagnostics](../troubleshooting/diagnostics.md#collect-a-sanitized-diagnostic-report); do not attach raw cookie/Authorization/CSRF headers, `.env`, SQL/connection errors, user data or browser traces. No automated logger redaction makes an arbitrary report safe.

For this documentation checkpoint, current [verification](verification.md) records actual checks and remaining gaps. No instruction here authorizes an automatic production rollout, a new checkpoint or an unreviewed change to financial history.
