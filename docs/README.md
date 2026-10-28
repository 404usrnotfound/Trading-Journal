# Trading Journal documentation

Choose a task below without learning the source-tree layout. Current scope comes from the [feature inventory](feature-inventory.md), [environment inventory](environment-inventory.md) and [final Phase 19 validation](documentation-validation.md). Dated evidence describes its own release/environment, not automatic proof for a later deployment.

## New users

| Task                              | Start here                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Check prerequisites               | [System requirements](getting-started/system-requirements.md)                                                         |
| Install and launch locally        | [Quick start](getting-started/quick-start.md), [complete installation](getting-started/installation.md)               |
| Configure services and secrets    | [Configuration](getting-started/configuration.md)                                                                     |
| Sign in and record first activity | [First run](getting-started/first-run.md)                                                                             |
| Learn a realistic workflow        | [EUR deposit, conversion, fills, exits and review](user-guide/guided-example.md)                                      |
| Check setup evidence              | [Installation verification](getting-started/verification.md), [current final validation](documentation-validation.md) |

## Experienced users

The [user manual](user-guide/README.md) identifies browser tasks and explicitly marked API-only operations.

| Task                                                             | Guide                                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Navigate and change preferences                                  | [Settings and navigation](user-guide/settings-and-navigation.md)                                               |
| Set up brokers/accounts and inspect holdings/portfolios          | [Accounts and portfolios](user-guide/accounts-and-portfolios.md)                                               |
| Record orders, fills, cash, conversions, charges and corrections | [Financial recording](user-guide/financial-recording.md)                                                       |
| Define/version strategies and assign plans                       | [Strategies](user-guide/strategies.md)                                                                         |
| Review trades, attach evidence and complete period reviews       | [Journaling and reviews](user-guide/journaling-and-reviews.md)                                                 |
| Understand Dashboard and account results                         | [Analytics and Dashboard](user-guide/analytics-and-dashboard.md)                                               |
| Evaluate risk and reconcile statements                           | [Risk and reconciliation](user-guide/risk-and-reconciliation.md)                                               |
| Import, export and move a workspace                              | [Imports and exports](user-guide/imports-and-exports.md), [fictional CSV examples](examples/imports/README.md) |
| Understand financial terms                                       | [Glossary](reference/glossary.md), [financial concepts](reference/financial-concepts.md)                       |

## Administrators

The [operations index](operations/README.md) assigns procedure owners. Read [deployment](deployment.md) before production installation; quick-start HTTP is local development.

| Task                          | Guide                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy and supervise          | [Deployment](deployment.md), [runtime operations](operations.md)                                                                                                    |
| Perform routine checks        | [Maintenance](operations/routine-maintenance.md), [checklists](operations/checklists.md)                                                                            |
| Manage database/migrations    | [Database management](operations/database-management.md)                                                                                                            |
| Back up, verify and restore   | [Backup/restore acceptance](operations/backup-and-restore.md), [canonical SQL/media procedure](backup-and-recovery.md)                                              |
| Upgrade or assess rollback    | [Upgrades and rollback](operations/upgrades-and-rollback.md)                                                                                                        |
| Handle credentials/incidents  | [Security operations](operations/security-operations.md), [security model](security.md)                                                                             |
| Recover after failure         | [Disaster recovery](operations/disaster-recovery.md)                                                                                                                |
| Evaluate operational evidence | [Operations verification](operations/verification.md), [production checklist](production-readiness-checklist.md), [current validation](documentation-validation.md) |

## Developers

| Task                               | Guide                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set up the developer loop          | [Local development](developer-guide/local-development.md)                                                                                             |
| Understand components/data flow    | [Developer architecture](developer-guide/architecture.md), [repository/module map](developer-guide/repository-structure.md)                           |
| Respect financial invariants       | [Domain and financial model](developer-guide/domain-and-financial-model.md)                                                                           |
| Integrate an implemented endpoint  | [API reference](developer-guide/api-reference.md), [operation catalog](developer-guide/api/catalog.md), [OpenAPI](../packages/contracts/openapi.json) |
| Change persistence safely          | [Database/migrations](developer-guide/database-migrations.md)                                                                                         |
| Run suites and inspect fixtures/CI | [Testing](developer-guide/testing.md)                                                                                                                 |
| Add an importer or extend source   | [Broker adapters/extensions](developer-guide/extensions-and-broker-adapters.md)                                                                       |
| Prepare a contribution             | [Contributing](developer-guide/contributing.md), [documentation standards](documentation-standards.md)                                                |
| Review engineering evidence        | [Checkpoint 6 verification](developer-guide/verification.md), [current final validation](documentation-validation.md)                                 |

## Troubleshooting

Start with the [issue index](troubleshooting/README.md) and [safe diagnostics](troubleshooting/diagnostics.md). Prefer read-only checks and collect a sanitized report before escalation.

| Symptom area                                       | Guide                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Install, dependencies, configuration, startup      | [Installation/startup](troubleshooting/installation-and-startup.md)       |
| Database connections, roles, migrations            | [Database/migrations](troubleshooting/database-and-migrations.md)         |
| Sign-in, permissions, mutation proofs              | [Authentication/security](troubleshooting/authentication-and-security.md) |
| Import validation, duplicates                      | [Imports/duplicates](troubleshooting/imports-and-duplicates.md)           |
| Cash, executions, basis, FX, positions             | [Financial discrepancies](troubleshooting/financial-discrepancies.md)     |
| Analytics, valuation, market evidence, performance | [Analytics/performance](troubleshooting/analytics-and-performance.md)     |
| Backup, restore, recovery                          | [Backup/recovery](troubleshooting/backup-and-recovery.md)                 |
| Reproduced versus unverified remedies              | [Troubleshooting verification](troubleshooting/verification.md)           |

## Reference and design authorities

Link to these definitions when interpreting reports or changing behavior; task guides do not own competing formulas.

| Subject                                  | Authoritative references                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Obligations and delivered scope          | [Original specification](../Trading_Journal_Codex_Prompt.md), [requirements](requirements-analysis.md), [feature inventory](feature-inventory.md), [coverage/acceptance](documentation-validation.md)                                          |
| Architecture and decisions               | [Architecture](architecture.md), [ADRs](decisions/README.md), [domain model](domain-model.md), [development plan](development-plan.md)                                                                                                         |
| Ledger, calculation policy, capabilities | [Core ledger](core-ledger.md), [calculations](financial-calculations.md), [fixtures](financial-fixtures.md), [metrics](financial-metrics.md), [instrument capabilities](instrument-capabilities.md), [asset-class audit](asset-class-audit.md) |
| Account/portfolio economics              | [Portfolio accounting](portfolio-accounting.md), [performance/corrections](account-performance-and-corrections.md), [advanced entry](advanced-financial-entry.md)                                                                              |
| Campaign analysis and presentation       | [Analytics definitions](analytics-definitions.md), [Dashboard](dashboard.md), [display views](display-views.md)                                                                                                                                |
| Strategies, journals, reviews            | [Strategies](strategies.md), [trade journal](trade-journal.md), [period reviews](period-reviews.md)                                                                                                                                            |
| Risk, reconciliation, supplied evidence  | [Risk](risk.md), [statement reconciliation](statement-reconciliation.md), [supplied values](supplied-values.md)                                                                                                                                |
| Data movement and worker projections     | [Imports](imports.md), [workspace portability](workspace-portability.md), [financial outbox](financial-outbox.md)                                                                                                                              |
| Documentation ownership                  | [Coverage plan](documentation-plan.md), [standards](documentation-standards.md), [environment/commands](environment-inventory.md)                                                                                                              |

## Historical evidence and current release gates

[Final audit](final-audit.md), [Phase 18 remediation](audit-remediation.md), [testing campaign](testing-campaign.md), [performance](performance.md) and [UX review](ux-review.md) retain their original scope. The current documentation decision and fresh versus historical results are in [final validation](documentation-validation.md). Seven dependency advisories, including two critical, and FA-04 capacity remain release gates unless separately resolved with new evidence.

Earlier implementation evidence: [scaffold](scaffold-validation.md), [Phase 2](phase-2-validation.md), [Phase 4](phase-4-validation.md), [Phase 5](phase-5-validation.md), [Phase 6](phase-6-validation.md), [Phase 7](phase-7-validation.md), [Phase 8](phase-8-validation.md), [Phase 9](phase-9-validation.md), [Phase 10](phase-10-validation.md), [Phase 11](phase-11-validation.md) and [Phase 12](phase-12-validation.md). Their then-current commands/counts do not replace current setup, migration or release instructions.
