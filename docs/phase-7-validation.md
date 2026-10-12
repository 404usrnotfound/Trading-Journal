# Phase 7 validation

This increment implements portfolio/account-level accounting against the approved [domain model](domain-model.md) and [financial calculation contracts](financial-calculations.md). The [accounting guide](portfolio-accounting.md) records exact definitions, API shapes, independent examples and remaining scope. Earlier phase evidence remains historical; this document records checks on the Phase 7 implementation.

## Delivered changes

- First-class portfolios with immutable numbered definitions and relational account membership; archival preserves history and reports select an exact version.
- Typed dividends/received interest, atomic gross income and separate withholding, taxes/refunds and financing/interest/other expenses.
- Actual cash departure/receipt, duplicate/chronology safeguards, and once-counted evidenced monetary transit in the complete owned-account scope.
- Decimal account/portfolio opening/closing cash, signed holdings, equity/NLV, native realized/unrealized results and an interval reconciliation bridge separating trading, income, costs, taxes, FX and capital.
- Explicit reporting/price/FX policies, source-revision replay, selected dependencies, known subtotals and unavailable reasons.
- Historical instrument/book and cash-bucket population safeguards; account-policy checks now recognize transfer-only inventory activity.
- Strict authenticated REST/OpenAPI/client contracts, existing least-privilege roles and additive migration 0007/schema version 8.

No analytics dashboard, portfolio UI, return percentage, broker adapter, tax-law calculator or advanced native instrument settlement is introduced. No dependency or secret is added. Original financial, strategy and journal facts remain separate from this reporting model.

## Independent financial and security evidence

Unit/property fixtures cover the documented EUR/USD partial-disposal bridge, deposits and withdrawals, gross income/withholding, dated fees/expenses/tax refunds, conversion execution differences, historical/source-pinned rates, signed shorts, fractional holdings, scaling, opening capital, profitable holding transfers, arbitrary-period rather than lifetime P&L, and cash/transit FX.

The multi-currency fixture independently expects EUR cash `497`, USD cash `1177`, reporting holdings `627`, NLV `2242.15`, realized trading `73.60`, unrealized trading `57`, holding FX `38`, cash FX `79.27`, conversion effects `0`, actual costs `5.72`, external funding `2000`, performance `242.15`, and variance `0`. Transit fixture F-18 reconciles cash FX `12` plus transit FX `8` to the EUR `20` ownership change. Scope-crossing transfers are capital rather than profit. Two seeded property checks run 200 cases each.

Additional regressions cover missing/stale/future observations, unknown basis, incomplete fees, unresolved classification, native and reporting overflow, scale-36 rounding residuals, immutable source pins after observation correction, dated fees after acquisition, pre-inception empty opening books, later instrument versions and buckets at an earlier pinned revision, actual execution corrections, and transfer-only account policy guards.

Real PostgreSQL tests exercise typed source/command/revision/actor/audit/outbox consistency, exact per-currency cash conservation, tenant composite foreign keys, forced RLS, viewer restrictions, immutable membership/history, live/paper separation, optimistic versions, atomic withholding, signed refunds, concurrent/duplicate receipt rejection and microsecond/ordering chronology. HTTP tests verify sessions, CSRF, trusted origins, idempotency, read-only viewer reports, bounded/strict input and safe problem responses.

The original Phase 4/5/6 upgrade tests still compare every pre-existing column and value. They now permit additive nullable columns and separately verify that the new typed accounting links remain null for legacy ledger events. Migration history/hash/prefix and replay guards remain enforced; no published migration is rewritten.

## Executed checks

| Check                                                    | Result                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cold frozen-lockfile installation                        | Passed in a source-only copy with an empty dedicated store: 436 packages added, 433 downloaded, zero reused                                      |
| Unit/property/React regression suite                     | Passed: 474 tests in 31 files                                                                                                                    |
| Full PostgreSQL regression suite on fresh owned database | Passed: 362 tests in 20 files, including all prior financial/strategy/journal/platform regressions                                               |
| API/OpenAPI/generated-client drift                       | Passed in the clean source copy                                                                                                                  |
| Formatting                                               | Passed in the clean source copy; final handoff documents checked separately                                                                      |
| ESLint                                                   | Passed with zero warnings                                                                                                                        |
| Root and all workspace TypeScript checks                 | Passed                                                                                                                                           |
| Domain/worker/Next production build                      | Passed in both clean source and working checkout                                                                                                 |
| Fresh migration and populated upgrade preservation       | Passed; 66 journal/strategy database checks include original-column preservation and repeat migration                                            |
| ORM/schema snapshot consistency                          | Drizzle generation on a copied migration tree reported no schema changes                                                                         |
| Development web/worker and production standalone restart | Passed from the clean source copy; schema 8 readiness, persisted accounting reports/transit, prior workflows and sessions survived both restarts |
| Configured local database migration/readiness            | Passed: application-role connection/schema readiness, configured database/queue migration and isolated repeat-migration check                    |
| Existing browser/axe regressions                         | Passed: 9 journeys, including ledger persistence, journal/strategy history, desktop/mobile themes, keyboard access and axe checks                |
| Git/whitespace/source-scope inspection                   | 19 created, 19 modified, 0 deleted; no staged files or secret/configuration changes                                                              |

Validation uses Node `24.19.0`, pnpm `10.34.6`, PostgreSQL 17 and the unchanged lockfile. Private `.env`, `.git`, media, dependency directories and previous builds were excluded from the clean source copy. A new isolated package store supplied its installation. Fresh integration/runtime controllers created uniquely named owned `_test` databases on the dedicated test instance, injected existing role bindings and generated test-only identity/secret values, and retained the normal development database and private files.

External logs, source hash manifests and runner exit receipts are retained under `/tmp/trading-journal-phase7-checks/` and `/tmp/trading-journal-phase7-clean-yixodyeb/`; they are environment evidence rather than committed source or secrets. The runtime check exercises actual Next route handlers, authenticated readiness, immutable portfolio versions, gross income/taxes/fees/expenses, delayed receipt, complete and earlier-revision transit reports, existing journal/strategy pins, private image bytes/hash, sessions and managed service restarts. Local production-mode HTTP transport validates the standalone application; no TLS termination or deployment is claimed.

Initial failures were diagnosed and corrected: an invalid numeric sequence in a new unit fixture; test-helper TypeScript/API mismatches; a missing source-pinned FX response route; old upgrade snapshots counting new nullable columns as data rewrites; and a runtime fixture capturing a journal's financial revision before later accounting commands. The final outcome rows above reflect successful reruns. No test assertion was disabled and source-precision checks remain strict.

## Schema and handoff

Migration `0007_portfolio_accounting.sql` is additive. Published SQL/snapshots `0000`–`0006` remain unchanged. The frozen 0007 SHA-256 is `1e04faa07960114b46d96d52088c9924a4d855b5b572b2080e6001421d737778`; schema readiness is version 8.

Current work is on `feat/phase-7-portfolio-accounting`. Changes remain uncommitted for user review. No commit, push, merge or deployment is authorized or performed in Phase 7. Normal tracked and new source/documentation files are the only intended changes; no file deletion is intended. The final Git inventory is recorded at handoff.

Reports are read-only revision-pinned calculations, not archived stored report snapshots. Equity/NLV use supported marked ownership, without hypothetical liquidation fees, generic buying power or invented liabilities. Unknown historical basis can leave observed NAV change available while its trading/FX attribution remains unavailable. Incomplete costs or unresolved cash classification prevent a complete performance value. Numeric overflow retains an explained unavailable result, including nullable native cash amounts. Scale-36 output rounding is separated from unexplained variance.

Large asynchronous projections, broker-statement reconciliation, portfolio screens, dashboards, TWR/MWR, exports/restore and advanced instrument-native accounting remain future capabilities. The complete AC-01–AC-16 product workflows are not claimed complete by this increment.

## Final change inventory

Created (19):

```text
apps/web/src/app/api/v1/workspaces/[workspaceId]/accounting/[...path]/route.ts
docs/phase-7-validation.md
docs/portfolio-accounting.md
packages/contracts/src/accounting.ts
packages/database/migrations/0007_portfolio_accounting.sql
packages/database/migrations/meta/0007_snapshot.json
packages/database/src/accounting-schema.ts
packages/domain/src/accounting-types.ts
packages/domain/src/accounting.ts
packages/server/src/accounting/api.ts
packages/server/src/accounting/report.ts
packages/server/src/accounting/service.ts
tests/integration/accounting-fixture.ts
tests/integration/portfolio-accounting-api.test.ts
tests/integration/portfolio-accounting-database.test.ts
tests/integration/portfolio-accounting-reports.test.ts
tests/integration/portfolio-accounting-services.test.ts
tests/unit/accounting-contracts.test.ts
tests/unit/portfolio-accounting.test.ts
```

Modified (19):

```text
README.md
apps/web/src/lib/api-response.ts
docs/development-plan.md
docs/financial-metrics.md
packages/contracts/openapi.json
packages/contracts/src/financial.ts
packages/contracts/src/generate.ts
packages/contracts/src/generated/api.d.ts
packages/contracts/src/index.ts
packages/database/README.md
packages/database/migrations/meta/_journal.json
packages/database/src/financial-schema.ts
packages/database/src/readiness.ts
packages/database/src/schema.ts
packages/domain/src/index.ts
packages/server/src/financial/catalog.ts
packages/server/src/index.ts
tests/integration/journal-database.test.ts
tests/integration/strategy-database.test.ts
```

Deleted: none. Published migrations/snapshots, the lockfile, `.env.example`, deployment/CI configuration and authoritative product/architecture/domain specifications remain unchanged. Git status is intentionally dirty because this increment remains uncommitted; the index has no staged changes.
