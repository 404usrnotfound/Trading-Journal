# Strategy management

Strategies are workspace-owned playbook records, independent of brokers and accounts. Open **Strategies** from the workspace navigation to create, review, edit and archive them. Viewers can read; editors and owners can make changes. The PostgreSQL records, private files and authenticated APIs survive browser reloads and application restarts.

## Immutable versions

Creation publishes version 1. Saving an edit publishes another complete version, with an effective timestamp, author, recorded timestamp, change reason and definition hash. The strategy identity points to its current version; previous versions are immutable. Changes to names, rules, status, notes, tags, parameters, checklists or attachment references cannot rewrite an earlier definition.

An edit includes the expected strategy revision. A concurrent change returns a conflict; the client must review the latest version before retrying. Command requests use UUIDv4 idempotency keys: retrying an identical accepted request returns its stored result, while using the same key for a different request is rejected.

Deleting a strategy archives its identity. Versions and historical trade references remain readable. An archived strategy cannot be edited or receive new trade links. Status (`draft`, `active`, `paused`, `retired`) is part of each definition; archiving is a separate lifecycle action.

## Playbook definition

Every version contains the following fields, including empty values for rules that have not been configured:

| Area                        | Fields                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Identity and eligibility    | Name, description, status, asset classes, markets, timeframes, direction, eligible instruments, style and sessions |
| Hypothesis and entry        | Hypothesis/edge, market-regime filters, setup conditions, entry rules and confirmation rules                       |
| Invalidation and management | Invalidation rules, stop-loss methodology, take-profit methodology, scaling rules, management rules and exit rules |
| Risk and sizing             | Risk rules and position-sizing rules; no numeric risk budget is invented                                           |
| Supporting context          | Indicators, notes, tags and review schedule                                                                        |
| Structured definitions      | Required/optional checklist items, distinct named setups with checklist references, and typed parameters           |
| Media                       | Private screenshots and reference attachments, pinned by immutable attachment identity                             |

Typed parameters support exact decimal strings with optional units and bounds, booleans, text and enumerations. Checklist items, setups and parameters have stable identifiers within the version. References to checklist items must resolve inside that same definition. Narrative rules are user-authored text; this phase does not execute arbitrary expressions or claim automatic rule assessments.

## Trades retain the selected version

Financial trade creation accepts an optional `strategyVersionId`. The server validates the workspace and records an immutable link to that exact version. It never selects the latest strategy silently. Unassigned trades remain unclassified.

An existing unclassified trade can be linked once through the strategy detail view or API, with an expected trade revision and reason. That link is labeled **retrospective**. A strategy recorded with a newly created trade is labeled **recorded with trade**; this is not proof of a frozen pre-trade plan or an original risk denominator. An existing pin cannot be reassigned or deleted through these commands.

After a trade is linked to Strategy A version 1, publishing version 2 leaves the trade linked to version 1, with the original name, rules, parameters, checklist and attachment references. Linked-trade views expose version identities for comparison. Current performance links open [Dashboard analytics](analytics-definitions.md) scoped to the strategy or exact historical version; eligibility, exclusions and original-risk sufficiency still control win rates, expectancy and R. Publishing or linking a playbook never creates a financial outcome or a valid original-risk denominator.

Strategy commands do not post cash, fees, quantities or inventory changes. Linking a trade changes its classification revision without replacing its executions, allocations or financial projections.

Retries of financial trade commands recorded before strategy support retain the original result, with the new strategy fields reported as unassigned. They do not substitute a later retrospective pin or rewrite saved command history. Read the trade separately to retrieve its current classification.

## Private attachments

Uploads accept PNG, JPEG, WebP and PDF, with a maximum of 10 MiB per file. The server checks file signatures as well as declared media types and stores bytes in the configured private storage root. Files have immutable display metadata, size and SHA-256 checksums. Strategy versions reference only ready files in the same workspace.

Reading or downloading a file rechecks authenticated workspace access. File responses use private, non-cacheable delivery and safe content headers; PDF reference documents download as attachments. SVG, HTML and executable formats are rejected. Removing an attachment from a new definition leaves the historical version's reference intact. Files referenced by any published version cannot be deleted; unused uploads can be removed through the authorized file API.

The local filesystem and database do not share a transaction. The upload service manages publication and cleanup explicitly; operational backup must include both PostgreSQL and private storage. Follow the [backup/restore procedures and tested limits](operations/backup-and-restore.md); an attachment upload succeeding alone does not verify recovery.

## API and validation

All strategy resources are under `/api/v1/workspaces/{workspaceId}/strategies`:

| Method and path                          | Behavior                                                      |
| ---------------------------------------- | ------------------------------------------------------------- |
| `GET /`                                  | Filtered, bounded list of strategies                          |
| `POST /`                                 | Create identity and immutable version 1                       |
| `GET /{strategyId}`                      | Current definition and lifecycle state                        |
| `PUT /{strategyId}`                      | Publish the next complete version with optimistic concurrency |
| `DELETE /{strategyId}`                   | Archive without removing historical versions or references    |
| `GET /{strategyId}/versions`             | Bounded immutable version history                             |
| `GET /{strategyId}/versions/{versionId}` | The exact historical definition                               |
| `GET /{strategyId}/trades`               | Bounded linked trades with their pinned versions              |
| `GET /{strategyId}/trade-links`          | Alias for the same bounded linked-trade read                  |
| `POST /{strategyId}/trade-links`         | Explicit retrospective link for an unclassified trade         |

Private files use `/api/v1/workspaces/{workspaceId}/strategy-attachments` for upload/list and `/{attachmentId}` for download or removal. Uploads send bounded binary bytes with `Content-Type`, `X-File-Name` and `Idempotency-Key` headers.

JSON mutations require strict shared Zod DTOs, a session-bound CSRF token, same-origin validation and an idempotency key. Monetary/numeric parameter inputs remain decimal strings. Definitions are bounded to 192 KiB of serialized UTF-8 JSON; JSON request bodies are bounded to 256 KiB. Tenant ownership, immutable version references, ready attachment references and concurrency are checked in the transaction. PostgreSQL additionally enforces workspace foreign keys, forced row-level security and version/link immutability.

The generated OpenAPI document and typed client describe the request and response contracts. Run the normal documented migration, test and verification commands from [README](../README.md). [Phase 5 validation](phase-5-validation.md) records actual results and remaining scope.
