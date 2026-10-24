# Documentation standards

Baseline: Phase 19, Checkpoint 1, 24 October 2026. These conventions apply to new documentation and deliberate updates; historical evidence and accepted ADRs retain their original context.

## Authority and scope

The [product specification](../Trading_Journal_Codex_Prompt.md) and [requirements analysis](requirements-analysis.md) define obligations, not proof of delivery. The [feature inventory](feature-inventory.md) records current capabilities; the [environment inventory](environment-inventory.md) records the supported toolchain and commands. The [documentation plan](documentation-plan.md) assigns canonical owners and Checkpoints 2–7. Link to these sources rather than copying competing definitions.

Source code, contracts, migrations and executed evidence establish implemented behavior. If design and implementation differ, state both, cite the discrepancy and retain the requirement. Do not repair a documentation discrepancy by implying that missing software exists. This checkpoint creates inventories, a plan and standards only; installation instructions, user manuals and operating procedures belong to later checkpoints.

## Markdown and headings

- Use UTF-8, LF newlines and a final newline. Remove trailing whitespace and avoid tabs outside literal examples.
- Use one descriptive H1, then H2 sections and H3 subsections without skipped levels. Use sentence case and stable headings.
- Separate headings, paragraphs, lists, tables and fenced blocks with blank lines. Keep lists flat where possible. Tables must have a header and consistent columns.
- Use plain English, active voice and task-oriented titles. Explain unfamiliar domain terms on first use. Avoid promotional claims and words such as “complete” or “production-ready” without a defined, verified scope.
- Follow the repository's Prettier configuration. Run the pinned formatter against changed files; never run a repository-wide write solely to format new documentation. Respect [.prettierignore](../.prettierignore), particularly preserved specification/design/ADR files.

## Links and references

Use relative Markdown links to repository files, relative to the containing document, with meaningful labels. Use exact case and forward slashes. Link a directory to its existing index where one exists. Encode spaces and parentheses when necessary. Validate heading anchors whenever headings or incoming links change. Avoid absolute workstation paths and branch-relative GitHub links as permanent source evidence.

For source evidence, link the existing file and name the relevant function/type/table or test case in prose. Record the reviewed commit so evidence remains reproducible when lines move. Use immutable GitHub commit links for external review records. Local source links should remain usable in the checked-out repository. Proposed files must be identified as **proposed**, shown as code paths, and not linked until they exist. A code path naming a runtime route is an API/UI entry point, not a filesystem link.

Generated [OpenAPI](../packages/contracts/openapi.json) and [client declarations](../packages/contracts/src/generated/api.d.ts) are derived from contract schemas. Never hand-edit generated files or reproduce an independently maintained endpoint schema in prose. Link the schema and document intent, authorization, examples, errors and limits around it.

## Code blocks and commands

Fence examples with a language (`bash`, `json`, `typescript`, `sql`, `text` or `mermaid`). Do not include shell prompts in copyable commands. Keep commands literal and identify their working directory, prerequisites, applicable OS/runtime and side effects. Distinguish separate alternatives from a sequence. Shell syntax must match the stated shell; do not advertise POSIX commands as tested PowerShell instructions.

For every executable command introduced in a guide, record:

| Field            | Required content                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Command source   | Existing package script, implementation or workflow; distinguish script names from underlying invocation. |
| Preconditions    | Runtime/dependency versions, required services, private configuration and role, without secret values.    |
| Verification     | Date, commit, environment, exact command, exit/result and evidence location.                              |
| Effects          | Files, processes, queues, schema or records created/changed; whether a disposable database is required.   |
| Expected outcome | Observable success and relevant failure condition; variable timings/counts must be labeled examples.      |

Existence in `package.json` establishes availability, not successful execution. Label unexecuted commands accordingly. A failed environment setup is not a passing product check. Do not copy unverified commands from design text, invent flags, weaken TLS or authorization, or point destructive tests at an existing user database. Use explicit placeholders for private values. Keep any private validation logs under ignored `work/`; retain a sanitized result summary or durable repository evidence for claims reviewers must reproduce.

## Screenshots

Later checkpoints may add screenshots under a proposed `docs/images/<topic>/` directory. Use stable descriptive kebab-case names, useful alt text and a nearby caption with route, scenario, application commit, capture date, browser, viewport, theme and synthetic-data context. Prefer screenshots of a real verified workflow over mockups. Include empty, unavailable, validation and error states where needed to explain behavior. Never include credentials, real financial identifiers, real account balances or personal notes from users. Re-capture affected images after a UI change; screenshots supplement accessible text and cannot establish calculation correctness or WCAG conformance.

## Example data

Use isolated synthetic workspaces, invented brokers/instruments and clearly labeled example amounts. A fresh real workspace remains empty. Preserve decimal strings, currencies, units, timezone/offsets, source definitions, effective instants and revision context. Explicitly distinguish assumed values from observations and calculated results. Avoid real customer files, credentials and provider tokens.

Financial examples need independently stated inputs and expected results, with a referenced fixture/test where available. Include missing/stale/unsupported cases, fees, rounding and availability reasons as relevant. A broker/manual source is not independently authenticated simply because the application stores it. Import examples must state duplicate/correction behavior and point to [existing synthetic examples](examples/imports/README.md). CSV examples must respect spreadsheet-formula protection. Do not portray source-provided values as automatic instrument pricing.

## Terminology and financial safety

Use **workspace**, **broker**, **account**, **cash bucket**, **instrument version**, **campaign/trading idea**, **leg**, **order**, **execution/fill**, **allocation**, **holding book/lot**, **cash event/posting**, **observation**, **strategy version**, **journal** and **period review** consistently with the [domain model](domain-model.md) and source types. A fill is not automatically a completed trade; strategy narrative is distinct from an evaluated risk policy.

Use native/reporting currency, gross/net, realized/unrealized, raw NAV/flow-adjusted return, and available/unavailable precisely. Actual currency conversion posts cash; reporting translation does not. Original risk used for historical R is distinct from current scenario sizing. An internal reconciliation identity is distinct from comparison with an independent statement. Operational database/media recovery is distinct from portable workspace restore. A native worker snapshot is not NAV or a historical accounting report.

Preserve domain availability codes in code formatting and explain their user meaning. Do not replace unavailable results with zero, suppress incomplete coverage, sum R/percentages as portfolio return or imply jurisdiction-specific tax correctness. For advanced assets, distinguish validated native operations, recorded actual cash/quantity, explicitly selected supplied analysis components and unsupported automatic economics. Refer to the [asset-class audit](asset-class-audit.md), [financial metrics](financial-metrics.md) and [analytics definitions](analytics-definitions.md) for canonical meanings.

## Warnings and safety language

Use concise blockquotes beginning **Warning:** for a concrete data-loss, confidentiality or financial-integrity hazard, **Important:** for a required condition, and **Note:** for useful context. State the affected action, consequence and avoidance/recovery condition. Place the warning before the action. Avoid repetitive generic disclaimers.

Commands that reset/drop databases, reverse financial activity, restore archives or expose private data must name their exact scope and safeguards. Never publish usable secrets or instructions to bypass RLS, integrity guards or safe reporting caps. Document actual authorization and confirmation requirements; do not invent new approval processes.

## Version compatibility

Each environment-sensitive guide records the reviewed commit/date, manifest pins/ranges, database major/schema, package manager and tested OS/browser. Distinguish **declared**, **configured**, **historically tested** and **freshly tested** compatibility. A semver range or successful build on one platform does not certify all versions/platforms. Do not treat floating Docker tags as immutable image versions.

For archives, imports, APIs, calculations and migrations, use their actual schema/version identifiers and supported compatibility checks. New migrations are additive; published history is evidence. Document incompatibility and unavailable behavior rather than promise upgrades, backward compatibility or downgrades not exercised by tests. Recheck environment/source inventories when pins or compatibility boundaries change.

## Evidence and status labels

Use the following feature classifications exactly; verification scope must accompany the classification:

| Classification             | Meaning                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented and verified   | A working path exists in source and executed evidence covers the stated behavior. Say whether evidence is historical or fresh and identify limits. |
| Implemented but unverified | A source path exists but relevant execution evidence is absent or the claim exceeds available checks.                                              |
| Partially implemented      | A usable subset exists, with an explicit remaining requirement or unresolved defect.                                                               |
| Planned but unavailable    | Requirement/design exists without a working delivered path; cite the obligation and inspected implementation boundary.                             |
| Deprecated                 | An explicit repository deprecation/supersession decision exists; name its replacement and migration boundary. Age alone is not deprecation.        |

Use **Source-reviewed**, **Historically passed**, **Freshly passed**, **Failed**, **Blocked**, and **Not run** for verification. Each claim must identify its scope and evidence. A full-suite historical result may support existing tests but not missing scenarios, production deployment, all-browser support or capacity. Keep intermediate failed runs and later successful corrections in their original chronology. Never relabel historical test counts as this checkpoint's execution.

As of this baseline, [FA-04](final-audit.md) remains open despite functional remediation evidence. Preserve measured limits and unmet million-fill/concurrent-reader/bulk-processing gates. A documentation checkpoint must not silently close an engineering or release gate.

## Review and acceptance

Before accepting a document, check factual claims against the pinned source, validate local file targets and anchors, run the pinned Markdown formatter and `git diff --check`, and confirm that only intended files changed. Check all feature fields, command evidence, limits, permissions, examples and audience coverage. Record unresolved questions in the plan with their later checkpoint, and require cross-links to canonical references instead of duplicate sources of truth. Checkpoint 7 consolidates the evidence and coverage review; it does not overwrite earlier results.
