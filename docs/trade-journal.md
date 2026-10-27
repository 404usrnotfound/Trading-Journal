# Trade journal

Phase 6 introduced trade planning and review on the financial ledger and immutable strategy versions. Open **Trade journal** from the workspace, create an idea or select an existing trade, then record its plan and review. Later increments provide [financial entry](advanced-financial-entry.md), [Dashboard](dashboard.md) and [CSV imports](imports.md) as separate workflows; journal edits do not post fills or cash.

## Plans and review

A trade has a manual draft document and append-only saved revisions. The plan records the exact strategy version and optional named setup, thesis, conditions, timeframe, per-leg planned entry/stop/targets/quantity/cost estimate, initial risk and planning evidence. Catalog-linked legs provide the account, instrument version, direction and units for price planning; an idea can initially have no legs.

Journal timestamps use the workspace's configured IANA display timezone, including daylight-saving transitions. UTC instants and microsecond ordering remain unchanged in financial calculations. Historical draft displays retain their own recorded strategy, setup and rule references rather than borrowing the current trade's labels.

The review records actual stop and optional reported prices as manual observations, conditions, mistakes, emotions, confidence, execution quality, rule adherence, lessons, exit reason, post-trade review, tags and notes. Confidence uses the explicit scale **1–5**; an unrecorded value remains null. Rule assessments are manual `passed`, `failed` or `unknown` outcomes against checklist IDs in the selected strategy version. Missing assessments are unknown. Notes are rendered as text rather than executable HTML.

Entry and exit prices displayed as **calculated ledger** values come from effective allocated executions. Reported prices and actual stop remain labeled **manual**; they never replace ledger prices, quantities, fees, cash or profit/loss. Saving a review does not close a trade or settle an execution. Closed trades can still be reviewed.

## Immutable original plan and risk

Saving a draft does not establish an original pre-trade commitment. Publishing records a complete immutable plan version, actor, reason, hash and server commitment instant. The first publication establishes the original plan once; later publications are new versions and preserve that original snapshot and original risk. Supplemental risk is recorded separately with its own currency, method, reason and actor.

A trade's strategy pin is authoritative. An existing pin cannot be reassigned by editing the journal. An unclassified trade may be explicitly linked once when publishing a plan; that strategy association is labeled retrospective. Historical pinned versions remain readable even when the strategy is archived. Setup and checklist references must resolve inside that exact snapshot.

Historical **R** divides a complete, compatible fee-net realized campaign result by the immutable original risk. It is available only for a completed campaign without unresolved closure review, with genuinely pre-trade original risk and complete required inputs. Open campaigns, missing risk, retrospective plans, incomplete costs and unavailable historical FX produce an explained unavailable value, not zero or a fabricated ratio. Supplemental risk never replaces the original denominator.

Timing is checked again on every financial read against the earliest effective allocated execution. A later backdated fill, correction or allocation can make an originally recorded plan ineligible for R without changing its historical commitment record. Cross-currency results require pinned historical rates in the requested original-risk currency; current market FX is not substituted.

Actual fill-weighted prices are calculated separately for each leg and unit. Remaining inventory average entry is a distinct calculation. The detail view carries its financial source revision and definition version, quantities, realized results, basis, fee currency partitions, lots/matches and linked execution/cash/fee events. Incompatible price or quantity units are never combined into a campaign average.

## Autosave, concurrency and evidence

Editors use draft autosave with visible saving, saved, error and conflict states. Commands send the expected journal revision and a stable UUID idempotency key for retries. A stale revision cannot overwrite a newer edit. Saved complete revisions remain available for inspection. Publication and risk additions also require the expected revision; publication checks the trade revision.

Private evidence can be labeled before, during or after. These are user-assigned review phases rather than verified capture timestamps. Uploads use the existing private workspace file registry, supporting signature-checked PNG, JPEG, WebP and PDF files up to **10 MiB**. Authorization applies to every download; files are not public web assets. Historical journal or plan references prevent file deletion even if an attachment is removed from the current draft.

Viewers can read journals and private evidence. Editors and owners can create, save, publish and add risk. Mutations require the existing authenticated session, trusted origin and session CSRF token. Journal records use forced tenant RLS, composite tenant references, immutable history and atomic audits.

## API

All paths below start with `/api/v1/workspaces/{workspaceId}`. Shared strict schemas and response types are generated into the existing OpenAPI contract. Monetary and price inputs are decimal strings; binary floating-point is not used for authoritative calculations.

| Path                                         | Methods     | Purpose                                                |
| -------------------------------------------- | ----------- | ------------------------------------------------------ |
| `/journals`                                  | GET, POST   | Bounded trade list or atomic idea/leg/journal creation |
| `/journals/{tradeId}`                        | GET, PUT    | Coherent detail snapshot or draft autosave             |
| `/journals/{tradeId}/plans`                  | GET, POST   | Bounded published history or publish the saved plan    |
| `/journals/{tradeId}/risk-additions`         | GET, POST   | Bounded supplements or append supplemental risk        |
| `/journals/{tradeId}/revisions`              | GET         | Bounded saved revision metadata                        |
| `/journals/{tradeId}/revisions/{revisionId}` | GET         | Exact historical document                              |
| `/journal-attachments`                       | GET, POST   | Private workspace file list or binary upload           |
| `/journal-attachments/{attachmentId}`        | GET, DELETE | Authorized delivery or removal of an unused file       |

The complete compact journal snapshot is limited to **128 KiB** of UTF-8 JSON. Individual narratives are limited to 20,000 characters, labels to 160 characters, and review lists to 100 entries. JSON command bodies are limited to 256 KiB. UUIDs are normalized before uniqueness and reference checks. Unknown nested keys and client claims of automatic rule assessment are rejected.

Migration `0005` added journal commands, entries, revisions, plan versions, first commitments, risk additions and typed attachment references. It extended the existing registry's historical deletion protection. Additive `0006` aligned independent database label validation with exact Unicode trimming and normalized uniqueness; it rejects unreadable raw writes without rewriting historical facts. Phase 6 readiness was schema **7**; the current application requires schema **17** through the complete [migration chain](developer-guide/database-migrations.md). Existing ledger facts and published migrations remain unchanged. Journal-only commands serialize with the financial state but do not advance its source revision or change balances and positions.

See [Phase 6 validation](phase-6-validation.md) for that increment's executed checks. Later implemented workflows include [standalone period reviews/templates](period-reviews.md), [Dashboard](dashboard.md), [exports and workspace restore](workspace-portability.md) and [imports](imports.md). Their populations, authorization and verification remain separate from a saved trade journal.
