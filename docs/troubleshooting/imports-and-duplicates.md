# Troubleshoot imports and duplicate activity

Use this guide when a CSV will not stage, review cannot be committed, source activity appears missing or duplicated, or an import correction/reversal is refused. Begin with read-only inspection; **Stage**, **Validate**, commit, correction and reversal are different actions. Never repair import history by editing database rows or changing source identity to bypass a guard.

**Source-reviewed:** 26 October 2026, Checkpoint 3 commit `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2`; unchanged application baseline `5132900a03efabaeb307787531546987228220e7`. This chapter introduces no new shell command. The [diagnostics guide](diagnostics.md) owns service/log commands and sanitized evidence collection; [checkpoint verification](verification.md) distinguishes freshly reproduced issues from source-reviewed and historical cases. The [imports and exports manual](../user-guide/imports-and-exports.md) owns normal field definitions and complete task instructions.

Check the workspace and account before investigating. Owners/editors can stage, validate and change imports; viewers can inspect authorized history/source downloads. CSV files, raw fields, source identifiers and mapping constants can contain personal or financial data. Do not attach an unredacted broker statement, original source download, full request body or screenshot of account details to a shared report. Preserve the original privately, and use a minimal fictional reproduction when sharing.

## File selection or CSV parsing fails

**Problem:** The file cannot be decoded or staged, or a named broker format is not available.

**Symptoms:** The browser can show `Choose a CSV up to 2 MiB.` or `Choose a CSV encoded as valid UTF-8. The source has not been staged.` The parser can return `CSV contains binary/control data. Use UTF-8 text.`, `CSV headers must be nonempty, unique safe names.` or `CSV exceeds 1,000 data rows.` A malformed quoted field can produce `Unclosed quoted field on line ….`; an inconsistent record produces `Line … has … columns; expected ….` Here `…` represents the source-dependent number, not literal application text.

**Possible causes:** A non-UTF-8 export, binary Excel/PDF content, incorrect delimiter, malformed quoting, duplicate/blank/unsafe headers, or a file above the enforced limits. Installed parsers are **Universal CSV mapping · 1** and **Canonical CSV interchange · 1**; a broker record in the catalog does not install a named-broker parser or live connection. Limits are 2 MiB accepted UTF-8, 1,000 data rows, 64 columns and 16 KiB per field.

**Diagnosis:** Without staging another copy, inspect **1. Source and mapping**, its **Importer**, **Broker CSV file**, and **File format and date conventions**. In a trusted local text editor, inspect a private copy's encoding, header, delimiter and quoting around the reported physical line. Quoted multiline fields mean physical source line numbers need not equal visible record positions. Do not open an untrusted source as an executable document or enable spreadsheet macros/formulas to diagnose it.

**Resolution:**

1. Keep the original export unchanged. Ask for an actual UTF-8 CSV export if the source is a workbook or PDF; renaming an extension is insufficient.
2. Select the correct delimiter and an installed importer. For an ordinary broker CSV, prepare the explicit Universal mapping described in the manual; canonical interchange requires its documented payload shape.
3. Correct a review copy's CSV structure only when it preserves source meaning. Resolve malformed/duplicate headers and quoting with the producer if uncertain.
4. For an oversized file, obtain bounded exports or divide only economically independent dependency groups, retaining original IDs/account/namespace. A group larger than 100 rows cannot be solved by dropping its dependencies.
5. **State-changing review action:** select **Stage file for review** once the file/mapping is understood. Staging retains a private source/review copy but posts no money.

**Verification:** The staged batch shows the intended account, row count and **Source SHA-256**. Inspect **Raw and normalized values**; successful staging alone does not prove valid financial commands. Continue with explicit validation, not immediate posting. Parser/file cases have available [unit](../../tests/unit/imports.test.ts) and [file-decoding](../../tests/unit/import-file.test.ts) tests; this specific file is not verified by those tests.

**Escalation:** Collect application commit, installed importer/version, file byte size, encoding/delimiter, redacted header and a minimal fictional failing row, exact error and physical line number. Keep the original private. Source: [file decoder](../../apps/web/src/components/imports/import-file.ts), `parseCsv` in [CSV implementation](../../packages/server/src/imports/csv.ts), [adapter registry](../../packages/server/src/imports/adapters/registry.ts).

## Mapping, amount or timestamp is rejected

**Problem:** A staged row's interpretation is invalid, or the normalized amount/date differs from the statement's intended meaning.

**Symptoms:** Actual messages include `Mapped column does not exist.`, `Required field is empty.`, `Value needs an explicit mapping.`, `Invalid thousands grouping.`, `Use the configured decimal/grouping convention; no exponents or expressions.`, `ISO timestamps need seconds, at most six fractional digits and an explicit offset.`, `Ambiguous DST time; supply an ISO timestamp with offset.` and `Nonexistent local time; verify the date/timezone.` Mapping schema failures begin `Check the mapping:` followed by the failing fields.

**Possible causes:** Header case/spelling mismatch, a required blank field, unsupported source-value aliases, incompatible decimal/grouping separators, exponent/expression text, the wrong selected date format/timezone, an impossible date, or an ambiguous daylight-saving clock time. Choosing the workspace timezone does not prove it matches the broker's source timezone. A valid parse can still reflect the wrong intended convention.

**Diagnosis:** Inspect the row's **Raw and normalized values**, errors and field path. Compare the exact CSV header with the mapping. Under **File format and date conventions**, compare delimiter, decimal separator, thousands separator, date format and source timezone with the producer's format. Check currency identity and units beside the amount; do not infer them from a display label. Inspect whether a sell is represented by positive quantity with side `sell` rather than a negative quantity.

**Resolution:**

1. Establish the producer's conventions rather than guessing an ambiguous date or separator.
2. Correct the mapping/header reference or a reviewed source copy. Map side/kind/boolean values explicitly where required; do not convert a rejected field to zero or omit a real fee.
3. For an ambiguous local clock time, obtain the correct offset and use a supported ISO timestamp. Do not select an arbitrary offset merely to make validation pass.
4. **State-changing review action:** stage a new batch with the corrected file/mapping, keeping stable account, namespace and source IDs. Existing batch evidence remains historical.
5. Validate complete intended groups and compare normalized amounts, timestamps/offsets, quantities and fee currencies before committing.

**Verification:** The selected rows have no blocking parsing/schema errors and their normalized intent matches the source. For a fictional example, `1.000,00` under decimal comma/dot grouping means `1000`; that same string is not permission to assume the convention for another file. [Decimal/date unit tests](../../tests/unit/imports.test.ts) cover exact normalization and DST rejection; the manual's [source convention example](../user-guide/imports-and-exports.md#choose-file-and-source-conventions) supplies expected values.

**Escalation:** Provide the exact error/field path, importer version, convention settings and a redacted minimal raw/expected-normalized pair with fictional identity constants. Source: `normalizeDecimal`/`normalizeInstant` in [CSV code](../../packages/server/src/imports/csv.ts), [mapping adapter](../../packages/server/src/imports/adapters/registry.ts) and [contracts](../../packages/contracts/src/imports.ts).

## Financial references or inventory rules block a group

**Problem:** CSV syntax is valid, but the financial command cannot be applied to the selected account and referenced records.

**Symptoms:** The row becomes **Needs attention**. Source messages include `A batch cannot write to another account.`, `Every cash bucket must belong to the selected batch account.`, and `Review quantity, chronology, short permissions and lot/basis coverage for this group.` The latter is the safe `INVENTORY_CONFLICT` detail. `LEDGER_VALIDATION_FAILED` reports `The ledger rejected this group. Review financial references, precision and group size.` More specific financial validation can appear beside its actual field/code.

**Possible causes:** A foreign or wrong-account bucket, an absent/incorrect immutable instrument version, an economic timestamp before the referenced convention is effective, invalid increments/precision, insufficient supported inventory, incomplete lot history, or unsupported economics. CSV parsing does not authorize a cross-account write or create a universal asset-class formula.

**Diagnosis:** Read the exact row error and normalized references. Confirm selected account/environment, currency identity, cash buckets, immutable instrument version, effective times, positive quantity/side, source ordering and reviewed opening holdings. Compare actual activity against [financial recording](../user-guide/financial-recording.md) and [financial discrepancies](financial-discrepancies.md). Check whether the group includes its required earlier facts; a valid-looking exit can fail when its opening inventory is absent.

**Resolution:**

1. Correct a mistaken reference in the mapping/source copy and stage a new review; do not redirect an account-bound command to another workspace or weaken its quantities.
2. If real prior holdings exist, obtain their actual source evidence and record/import the supported reviewed opening-holding workflow. Do not invent an earlier purchase or acquisition basis.
3. Retain unknown cost/basis states when evidence is missing. Use supported manual/supplied paths only for their documented meanings.
4. Validate the intended complete groups again before any commit. Escalate unsupported financial correction/economics instead of editing ledger tables.

**Verification:** The group validates with the correct immutable references and chronology, or remains explicitly blocked with a reason. A successful preview changes no balances; after a separately confirmed commit, compare source cash and quantity with the expected changes. Available [persisted import tests](../../tests/integration/imports.test.ts) include exact fractional fills, opening holdings and real financial guards.

**Escalation:** Collect error code/detail, importer version, redacted record kind, quantity/units, effective timestamps, convention version/revision and a private reference list. Share synthetic examples publicly; do not send database connection strings or full raw payloads. Source: `validateDraft` in [normalization](../../packages/server/src/imports/normalize.ts), `safeIssue`/account checks in [service](../../packages/server/src/imports/service.ts).

## Dependency groups or local identities cannot be resolved

**Problem:** A selection is incomplete or ambiguous, so dependent financial facts cannot be safely ordered.

**Symptoms:** Errors include `Choose complete groups totaling at most 100 rows.`, `Every local source key must identify exactly one row. Map distinct keys before resolving dependencies.`, `Records with local row references require a stable broker source ID. Map it before importing dependent financial facts.`, `Rows within this group have circular dependencies.` or an `Unresolved reference to …` message identifying the local declaration/path. Codes include `AMBIGUOUS_SOURCE_KEY`, `STABLE_SOURCE_ID_REQUIRED` and `INVALID_IMPORT_DEPENDENCY`.

**Possible causes:** Duplicate local declaration keys, missing prerequisite rows/groups, references to the wrong result path, cyclic dependencies, dependent rows lacking stable IDs, or a group exceeding the 100-row selection bound. Local row keys order a batch; they are not an alternative to stable economic source identity.

**Diagnosis:** Read all affected rows and their local source/group references. Under **Include complete dependency groups**, check whether the prerequisite is already posted/reconciled or included in the selected complete groups. Check the selected row count. Review advanced mapping JSON privately; do not paste real reference values into a public ticket.

**Resolution:**

1. Correct duplicate local keys, paths or missing dependencies in the prepared source/mapping; obtain stable source IDs for dependent facts.
2. Resolve cycles according to actual source relationships. Merge a genuinely interdependent group only when it remains within supported bounds; do not remove a real dependency to fit the limit.
3. **State-changing review action:** restage corrected input, select the complete dependency groups and validate again. An already committed dependency may resolve through its retained result without re-posting it.
4. If one independent group is invalid, explicitly select and validate a complete valid subset only when it is economically independent. Retain the invalid group for later resolution.

**Verification:** The exact selection has no unresolved dependencies and is committable. Committing a reviewed valid subset produces a `partial` batch while unselected groups remain unposted. A failed commit is atomic for that selection; earlier separate commits remain. [Import integration tests](../../tests/integration/imports.test.ts) cover group rejection/subsets and declaration-before-fill ordering.

**Escalation:** Collect batch revision, selected row/group counts, relevant error codes and a fictional dependency diagram or tiny mapping. Source: reference traversal in [normalization](../../packages/server/src/imports/normalize.ts), group ordering/transaction handling in [service](../../packages/server/src/imports/service.ts).

## Preview is stale, warnings are unreviewed or posting is unavailable

**Problem:** A prior validation no longer authorizes the current selection to commit.

**Symptoms:** `IMPORT_REVIEW_REQUIRED`: `Preview this exact selection before committing.`; `STALE_IMPORT_PREVIEW`: `Financial activity changed after preview. Preview again before committing.`; `IMPORT_VALIDATION_FAILED`: `Resolve errors or explicitly select complete valid groups.`; or `IMPORT_WARNINGS_UNREVIEWED`: `Acknowledge retained unmapped columns before committing.` A stale batch can also return `IMPORT_REVISION_CONFLICT` with `Refresh this batch before reviewing.`

**Possible causes:** Another financial write changed the workspace source revision, another review changed the batch revision, no matching current preview exists, a correction reason/selection changed, selected errors remain, or retained-column warnings have not been acknowledged. These guards prevent posting a different economic command from the one reviewed.

**Diagnosis:** Inspect the selected groups, current row errors, correction reasons, preview state and **Batch audit history**. Compare any concurrent activity. Check the actual role and session if controls are read-only; see [authentication and security](authentication-and-security.md).

**Resolution:**

1. Refresh/reopen the intended batch through **Import history** → **Review batch** and inspect current persisted state before changing anything.
2. Select complete intended groups, resolve blocking errors and enter any permitted correction reasons.
3. **State-changing review action:** select **Validate selected groups** again. Review every change in raw/normalized values and preview counts.
4. Read retained unmapped columns and warnings. Check **I reviewed retained unmapped columns and warnings.** only when their meaning is understood; a potential missing economic field requires mapping/source correction, not acknowledgement alone.
5. **Financial write:** only after the new preview is valid, use **Commit reviewed import** and review **Post this reviewed import?** before **Confirm posting**.

**Verification:** **Preview valid. Ready for your explicit commit.** refers to the current selection/revision, not a prior review. After successful confirmation, intended rows are **Posted**, **Duplicate — will be skipped** or **Already reconciled** as appropriate, and the account changes match only new/corrected activity. [Persisted tests](../../tests/integration/imports.test.ts) and [concurrency tests](../../tests/integration/imports-safety.test.ts) cover stale previews and competing commits.

**Escalation:** Collect code/detail, batch revision, preview ID/source revision if available, selected group count, approximate concurrent-action times and redacted history. Do not force an old preview by changing API fields. Source: `preview`/`commit` guards in [service](../../packages/server/src/imports/service.ts), [review UI](../../apps/web/src/components/imports/import-workspace.tsx).

## A repeated file is skipped, ambiguous or appears to add duplicates

**Problem:** Reimported activity is skipped unexpectedly, identical rows require identity review, or the same economic activity appears twice.

**Symptoms:** **Duplicate — will be skipped** means an unchanged scoped source intent already exists. **Identity needs review** can show `AMBIGUOUS_FINGERPRINT`: `Identical rows without stable broker IDs may represent distinct events. Map a stable occurrence/source ID; no row will be silently dropped.` Unexpected **New activity** after a supposed reimport needs investigation before posting.

**Possible causes:** Import identity is scoped by workspace + account + namespace + record kind + source identity. A stable broker/source ID is preferred; without one, the normalized financial intent supplies a versioned fallback fingerprint. Changing account, namespace, kind or ID can make an event new. Changing a fingerprint-only row's economics can do the same. Filename, upload date, row number, column order and local declaration/group labels do not create a new occurrence. Two identical no-ID rows may be real repeated events; the importer will not silently choose one.

**Diagnosis:** Read existing **Import history**, **Review batch**, **Batch audit history** and **Raw and normalized values**. Compare the original stable source ID/namespace/account/kind with the new mapping. Check whether the event was entered manually before import or came from a different identity scope. Compare source cash/quantity instead of assuming every matching display amount is a duplicate. Renaming a file is not a remedy.

**Resolution:**

1. For a genuine unchanged reimport, retain its original scope and stable IDs, and validate. Expected duplicates need no replacement event.
2. For ambiguous real repeated occurrences, obtain source-supported stable occurrence IDs in a reviewed external source copy, map their exact header in **Broker ID column (optional)**, and preserve them on later imports. There is no per-row identity editor in the review table.
3. For changed stable-ID economics, use the correction workflow below. Do not create a fresh namespace or ID merely to bypass review.
4. If duplicate activity is already posted under separate identities, stop importing. Preserve evidence and determine each event's domain correction and dependencies with an authorized operator; the importer is not a global fuzzy duplicate remover. Do not delete ledger/source rows or append a fabricated opposite trade.

**Verification:** An unchanged same-scope reimport validates as duplicates and adds no cash/fill effect. Confirm actual account cash and quantity. A separate real occurrence has its own evidenced stable ID. The [manual's fictional cash example](../user-guide/imports-and-exports.md#confirm-posting) ends at USD 900 both before and after its unchanged reimport. Available [identity unit tests](../../tests/unit/imports.test.ts) and [persisted tests](../../tests/integration/imports.test.ts) distinguish scope, stable fingerprints and ambiguous repeats.

**Escalation:** Collect original/new batch identifiers, redacted identity scope, kind, mapping version, statuses and before/after expected totals. Keep source IDs private unless the recipient is authorized. Source: `importIdentity` in [normalization](../../packages/server/src/imports/normalize.ts), scoped source claims in [service](../../packages/server/src/imports/service.ts).

## Changed stable source IDs require correction

**Problem:** A broker corrected a previously imported record, and the importer refuses to append it as another transaction.

**Symptoms:** **Correction reason required** or `IMPORT_CORRECTION_REQUIRED`: `This broker source ID has changed. Review an explicit correction; do not append it.` An unsupported correction returns `CORRECTION_REVIEW_REQUIRED`: `This record type needs an explicit domain correction outside this importer; it cannot be appended as new activity.`

**Possible causes:** The same scoped stable source ID now has different normalized economics. Imported cash movements and executions have explicit correction paths; other kinds require their domain-specific correction workflow. Downstream dependencies can also prevent a fill replacement.

**Diagnosis:** Compare original retained intent and replacement raw/normalized values, including effective timestamp, amount, currency, fees and source ordering. Establish that the source is truly a correction rather than another occurrence. Read its later financial dependencies before attempting a reversal or replacement.

**Resolution:**

1. Keep original account, namespace and stable source ID in the corrected source.
2. **State-changing review action:** stage and validate the corrected batch. Inspect the affected **Correction reason required** rows.
3. Enter a genuine **Correction reason** of 1–160 trimmed characters, then select **Validate selected groups** again. A changed reason requires another validation.
4. For a supported eligible correction, review the replacement and warnings, then **Commit reviewed import** → **Confirm posting**. This is a financial write: cash correction appends reversal/replacement; execution correction uses supersession/rebuild rules and preserves earlier evidence.
5. For another kind or a dependency blocker, collect evidence and use authorized domain correction assistance. Do not append it under a new ID, invent an offsetting cash entry or directly alter authoritative data.

**Verification:** The corrected source chain/audit history retains original and replacement evidence; the account reflects replacement economics once. In the manual's fictional cash example, changing the USD 100 withdrawal to USD 120 changes USD 900 to USD 880, rather than adding an unrelated second withdrawal. Check any affected reports and closure-review warnings. Source/relevant coverage: `correct` in [ledger port](../../packages/server/src/imports/ledger-port.ts), [cash correction and source-history integration tests](../../tests/integration/imports.test.ts).

**Escalation:** Collect correction code/detail, original/replacement source kind, redacted changed fields, source revision and dependency summary. Do not share entire broker statements. Link the normal [correction instructions](../user-guide/imports-and-exports.md#apply-an-eligible-correction) rather than treating this guide as a second accounting formula source.

## Fill-cash reconciliation reports a difference

**Problem:** An imported `execution_cash` row does not match cash already booked by the referenced execution/fees.

**Symptoms:** `FILL_REFERENCE_MISSING`: `Import or identify the referenced execution first.`; `FILL_CASH_REFERENCE_MISSING`: `No cash posting matches this fill, currency, scope and date.`; or `FILL_CASH_VARIANCE` with `Reported cash … differs from the existing fill cash …. No extra cash will be posted.` The amounts are runtime values and may be sensitive.

**Possible causes:** Wrong execution source ID or namespace/account, an execution not yet imported, incorrect currency/economic timestamp, wrong principal-versus-fees scope, reversed sign or mismatched actual source amount. An execution already books its actual principal cash; its cash-reconciliation row is not another deposit/withdrawal.

**Diagnosis:** Compare the execution's source identity, actual economic instant, currency, principal and fee postings with the row's chosen reconciliation scope. For a net cash statement, check whether both principal and fees belong in its scope. Inspect complete group membership and earlier source results. Distinguish this exact fill-cash check from the independent statement workflow on **Reconciliation**.

**Resolution:**

1. Identify the real referenced fill and correct a mistaken source reference/mapping in a new review copy.
2. Obtain exact source amounts/times and choose the scope matching the statement; preserve sign and currency.
3. Include required uncommitted execution dependencies, or reference the existing source identity when already posted. Do not manually record the same fill again.
4. **State-changing review action:** restage/revalidate complete groups. If the source and current ledger genuinely differ, use the correct execution/fee correction path; do not add cash to force agreement.

**Verification:** The cash-reference row is **Already reconciled** and produces no second cash posting. A failed variance check rolls back tentative writes in its failed selection; verify existing account evidence before retrying. [Persisted import tests](../../tests/integration/imports.test.ts) cover matched fractional fill/fee cash and variance rollback. Source: `reconcileCash` in [ledger port](../../packages/server/src/imports/ledger-port.ts); see [financial discrepancies](financial-discrepancies.md) for cash/position investigation.

**Escalation:** Collect code, redacted execution identity, currency, exact economic instant, scope, reported versus expected amount and related batch/group revision. Do not send a live account's full ledger export unless securely authorized.

## Posted executions are absent from campaign analytics or have unavailable net results

**Problem:** Source import succeeded, but the expected trade journal, completed outcome or fee-net metric is absent.

**Symptoms:** Posted fills affect account cash/quantity while no campaign result appears. A campaign may remain open after a partial/final exit, or its net P&L/R may be unavailable even though gross source activity exists. These are availability/population states, not evidence that staging should be repeated.

**Possible causes:** Imported executions still lack campaign allocation, allocation belongs to another leg/account, a position is only partially closed, no accepted campaign closure exists, costs are unconfirmed, original risk was never committed before trading, or report filters/currency evidence exclude the result. Omitted imported execution/opening-lot `costsComplete` defaults to false; omitted costs are not automatically zero.

**Diagnosis:** Verify **Posted** and the actual fill ID in batch results/history. Inspect the account's cash/quantity separately from Journal's allocated fills. Check campaign/leg allocation, remaining quantity, costs-complete evidence, closure review state and applied analytics filters. Read the exact unavailable reason rather than replacing it with zero.

**Resolution:**

1. For an existing unallocated source fill, use **Create a journal trade from an existing fill** or the existing-fill method under **Record trade**. Allocate the existing fill; do not post another execution.
2. Resolve genuinely missing source costs using the permitted recording/correction workflow. Never assert costs complete merely to enable a metric.
3. Keep a genuine remaining position open. For a truly flat campaign, use the documented authorized lifecycle path if completion is required; there is no browser Close/Reopen campaign control.
4. Review Dashboard/account scope and evidence policies using [analytics troubleshooting](analytics-and-performance.md). Missing original pre-trade risk cannot be repaired by fabricating a retrospective commitment.

**Verification:** Account source activity remains booked once, Journal displays the correct effective allocations, and only eligible completed/marked samples enter the selected report. Financial results can remain honestly unavailable after correct import. See [recording/attribution](../user-guide/financial-recording.md), [journal lifecycle](../user-guide/journaling-and-reviews.md#complete-cancel-archive-or-add-legs-to-a-campaign), [analytics manual](../user-guide/analytics-and-dashboard.md) and `validateDraft` in [normalization](../../packages/server/src/imports/normalize.ts).

**Escalation:** Collect source/campaign/leg revisions, redacted allocation totals, applied report scope and exact availability reasons. [Import integration tests](../../tests/integration/imports.test.ts) cover source posting; [journal financial tests](../../tests/integration/journal-financial.test.ts) cover the separate financial/journal interpretation. Do not assume either historical suite proves a fresh user record is complete.

## Batch reversal is blocked or a reversed source will not reimport

**Problem:** A whole batch cannot be safely reversed, or an already reversed identity is refused on ordinary reimport.

**Symptoms:** `IMPORT_REVERSAL_UNSUPPORTED` says `Automatic monetary reversal is limited to independent cash movements. Fills, lots, fees, FX, orders and catalog/valuation records need explicit domain correction.` `IMPORT_REVERSAL_DEPENDENCIES` explains outside activity, prior correction or changed source claims. `IMPORT_SOURCE_REVERSED` says `This source was reversed. Reimport will not resurrect it automatically.` A stale reversal can return `Refresh this committed batch before reversing.`

**Possible causes:** Non-cash source kinds, later outside financial activity after the batch's first effect, earlier-history corrections, another change to an owned source, stale batch revision or an identity deliberately marked reversed. Duplicate-only/no-op later commits cannot reset the dependency boundary. This conservative path is not arbitrary undo.

**Diagnosis:** Read **Batch audit history**, source kinds and later account financial activity; confirm the exact original batch and its current state. An attempted blocked reversal leaves its ledger unchanged. Do not repeatedly reimport under renamed namespaces/IDs or delete history to remove the guard.

**Resolution:**

1. Refresh/reopen the committed/partial batch and verify whether it consists only of eligible independent owned cash movements.
2. For a genuinely eligible correction, follow the [cash-only reversal instructions](../user-guide/imports-and-exports.md#reverse-an-eligible-cash-only-batch). **Financial write:** its confirmation appends offsetting postings and marks source identities reversed; it does not delete original evidence.
3. If eligibility fails or the source is already reversed, stop and review the domain-specific correction with an authorized operator. Obtain a current backup before any proposed exceptional recovery procedure that could overwrite/remove data; the [backup troubleshooting guide](backup-and-recovery.md) distinguishes this from normal append-only correction.
4. Preserve original/changed source evidence, actor/reason history and dependency order. Do not use a database reset, volume deletion or direct ledger edit to recover an import.

**Verification:** An allowed reversal leaves a `reversed` batch, its retained original/audit history and exact offsetting cash effects. A blocked reversal leaves financial totals unchanged and its reason visible. Ordinary reimport does not revive reversed source effects. [Persisted import tests](../../tests/integration/imports.test.ts) and [safety tests](../../tests/integration/imports-safety.test.ts) cover dependencies, no-op/interleaved commits and reversed identities; root checkpoint evidence states which were freshly run.

**Escalation:** Collect reversal code/detail, batch/source revision and state, owned source kinds, prior corrections and a redacted chronological dependency summary. Source: `reverse` in [import service](../../packages/server/src/imports/service.ts).

## A request ended without a clear result or import history fails to load

**Problem:** A network/session/service interruption leaves the outcome uncertain, or the browser cannot display persisted history.

**Symptoms:** The UI can show `Import history is unavailable. Retry loading to see your previous statements.`, **Retry loading import data**, `Refresh your session before changing an import.`, or the fallback `The import request could not be completed.` An altered integrator retry can return `IDEMPOTENCY_CONFLICT`: `This import command key has different contents.` A generic network error does not establish whether a prior commit succeeded.

**Possible causes:** Lost response, expired session, changed membership, unavailable API/database, stale cached batch data or reuse of an API idempotency key with different action/body. The browser import client generates a new UUID per mutation; a generic retry here does not promise the recorder's frozen-request recovery semantics.

**Diagnosis:** Preserve unsaved mapping information privately. Read current **Import history** and **Review batch** if available, then inspect row statuses, **Batch audit history** and actual account effects. Check service/session symptoms using [diagnostics](diagnostics.md) and [authentication](authentication-and-security.md). Do not infer failure from a missing success toast or infer success from a submitted request.

**Resolution:**

1. Restore a valid session/service connection without bypassing authorization. Use **Retry loading import data** for read failures.
2. Reopen the persisted batch and establish whether staging, validation, commit/correction or reversal already completed. Account for all earlier partial commits.
3. If it did not complete, revalidate the current exact selection before another financial confirmation. Retain stable source identities and review changed economics explicitly.
4. For a reviewed API integration, an exact retry uses the same original key/action/body; do not reuse a key for changed contents. If the original outcome cannot be established, collect evidence and stop before another financial write.

**Verification:** The current authorized batch/history and account records agree on the outcome; no second economic event was introduced while recovering display/network access. Source: `read` and request handling in [import UI](../../apps/web/src/components/imports/import-workspace.tsx), `replay` and `readBatch` in [service](../../packages/server/src/imports/service.ts). [Import safety tests](../../tests/integration/imports-safety.test.ts) cover exact-once/concurrent persisted boundaries; [UI tests](../../tests/ui/imports.test.tsx) cover loading/review behavior.

**Escalation:** Collect application commit, incident time/timezone, HTTP status/problem code, request correlation identifier if present, operation type and a redacted batch-state timeline. Exclude cookies, Authorization headers, CSRF tokens, passwords, database URLs, full source files and raw financial payloads. Follow [sanitized diagnostics](diagnostics.md) for the shared report.
