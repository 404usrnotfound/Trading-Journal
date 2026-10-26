# Troubleshooting Trading Journal

Reviewed **26 October 2026**, Phase 19 Checkpoint 4, against committed Checkpoint 3 `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2` and unchanged application baseline `5132900a03efabaeb307787531546987228220e7`. This knowledge base is for users, support engineers and authorized operators. Start with the symptom below, then follow the linked issue's diagnosis, resolution and verification in order.

Use [installation](../getting-started/installation.md), [configuration](../getting-started/configuration.md) and the [user manual](../user-guide/README.md) for normal tasks. The [feature inventory](../feature-inventory.md) defines delivered capabilities. An unavailable feature does not become a troubleshooting procedure simply because the specification requests it.

## Find the relevant issue

| Symptom or category                                                                                                                                 | Guide                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Runtime/dependency install, cache/network/permissions, configuration, Docker, missing build/native modules, listener or launcher failure            | [Installation and startup](installation-and-startup.md)       |
| Database unreachable, role/password mismatch, PostgreSQL/schema incompatibility, migration history/locks, RLS or isolated-test guard                | [Database and migrations](database-and-migrations.md)         |
| Sign-in/session failures, throttling, Origin/CSRF, workspace access, CSP or operator password recovery                                              | [Authentication and security](authentication-and-security.md) |
| Broker CSV rejected, mapping/date/decimal errors, dependencies, preview changes, duplicates/corrections, cash variance, uncertain posting           | [Imports and duplicates](imports-and-duplicates.md)           |
| Cash, executions, attribution, partial positions, basis, realized P&L, actual conversions, portfolio/statement differences                          | [Financial discrepancies](financial-discrepancies.md)         |
| Empty/different analytics, missing prices/FX, supplied-value exclusions, account returns/drawdown, scope/performance limits, stale native snapshots | [Analytics and performance](analytics-and-performance.md)     |
| Wrong archive type, compatibility/checksum/media/size failure, uncertain restore, operational database/media recovery                               | [Backup and recovery](backup-and-recovery.md)                 |
| Need safe log/status/configuration/database/migration checks or a sanitized support report                                                          | [Diagnostics](diagnostics.md)                                 |
| Need the exact execution scope, reproduced failures, commands and remaining verification limits                                                     | [Checkpoint verification](verification.md)                    |

Each issue supplies **Problem**, **Symptoms**, **Possible causes**, **Diagnosis**, **Resolution**, **Verification** and **Escalation**. Quoted errors and codes come from the linked implementation. A plausible cause is a hypothesis until the read-only checks support it. Do not repeatedly submit a financial write to see whether an error disappears.

## Follow a safe investigation order

1. Record the symptom, time with timezone, release/commit, affected route and safe request/error code. Establish whether a write may already have committed.
2. Confirm the workspace, account, paper/live environment, date interval, currency and source/revision policies. A filter or availability reason can explain a different result without a damaged database.
3. Use read-only browser evidence and the [diagnostic ladder](diagnostics.md). Liveness, readiness, database role access, import validation and financial reconciliation answer different questions.
4. Preserve source files, revisions, import history, private media and relevant restricted logs. Collect the smallest sanitized example that reproduces the issue.
5. Apply the chapter's supported correction only after identifying the cause. State-changing actions are explicitly identified. Retain a verified backup/recovery set before potentially destructive work; preserve the original target and rehearse recovery in isolation.
6. Repeat the verification at the same economic/report context and inspect the authoritative operation result before retrying an uncertain command. Escalate with the documented evidence when the cause or outcome remains unclear.

> **Warning:** Do not edit authoritative ledger rows, migration journals, hashes, grants, RLS policies, import provenance or audit/outbox facts to make a diagnostic pass. Do not delete database volumes as an ordinary repair. Never disable TLS, CSRF, CSP, authentication or authorization to hide an error. Financial corrections use the guarded workflows and preserve history.

Do not run integration/browser tests, migration-repeatability checks, restores or failure simulations against an existing user's database. Read-only inspection still requires the intended identity and authorized scope. Do not use a migration/admin credential for ordinary web, auth or worker operation.

## Interpret evidence and availability

- **Source-reviewed** means current code, contracts and available tests support the described behavior; it does not mean the procedure was executed on your host.
- **Freshly passed** and **Historically passed** identify executed scope in [verification](verification.md), [Checkpoint 3](../user-guide/verification.md) or the retained [Phase 18 remediation](../audit-remediation.md). **Not run** means execution is absent for that scope. A deliberately reproduced rejection is a passing diagnostic assertion, not successful completion of the rejected operation.
- Available, partial, unavailable, stale, unconfigured, infinite and zero describe different states. Read the reason. Do not replace missing money, unknown basis, missing prices/FX or unavailable ratios with zero.
- A healthy process or balanced internal accounting bridge does not prove broker agreement, complete economics, all jobs processed or production capacity. [FA-04](../final-audit.md) remains open.

Some older operational/phase paragraphs still mention schema 9, health-only worker processing or deferred portability/reconciliation. The current source requires schema 17 and implements native outbox snapshots and portable workspace workflows. These discrepancies are recorded in [verification](verification.md); the new guides use current source without rewriting historical evidence. Existing financial dictionaries and recovery procedures retain their canonical ownership.

## Escalation and privacy

Use the [sanitized report template](diagnostics.md#collect-a-sanitized-diagnostic-report). The repository does not establish a support mailbox, issue-response SLA, remote-support service or production telemetry destination. Send the report through your organization's approved restricted support channel. Never attach a raw `.env`, credential-bearing URL, session cookie/token, database dump, portable archive, private media, broker statement or unreviewed browser trace to a public report.
