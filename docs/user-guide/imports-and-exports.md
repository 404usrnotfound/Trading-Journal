# Imports, exports and workspace backups

Use **Imports** to review supported CSV activity before posting it. Use **Data & backups** for an owner workspace archive, a separate verified restore or a selected JSON/CSV export. These are different workflows: a filtered export is not a restorable workspace archive, and a broker CSV is not an authenticated broker connection.

**Source-reviewed:** 25 October 2026. Documentation baseline: Checkpoint 2 commit `3c790c2326bfd38e93698c60e80102a3787d077e`; application baseline: `5132900a03efabaeb307787531546987228220e7`. Existing import and portability tests have historical remediation evidence (H18); no new application execution is claimed here. See [manual verification](verification.md), [feature inventory](../feature-inventory.md) F12/F18/F26 and the canonical [import behavior](../imports.md) and [workspace portability](../workspace-portability.md) references.

## Choose a workflow and check access

| Task                                                                           | Open                                | Required role                             | What changes                                                                                             |
| ------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Read batch history or download original accepted source                        | **Imports** (`/imports`)            | Viewer, editor or owner                   | Nothing financial. The downloaded source is private, untrusted evidence.                                 |
| Stage, validate, commit, correct or reverse an eligible import; save a mapping | **Imports**                         | Editor or owner                           | Staging/validation retain review data; explicit commit/correction/reversal can change financial records. |
| Download a complete portable workspace archive                                 | **Data & backups** (`/portability`) | Owner                                     | Creates a private local JSON download; records are not altered.                                          |
| Restore a portable archive                                                     | **Data & backups**                  | Owner of the currently selected workspace | Creates a separate workspace owned by the restoring user after verification.                             |
| Export supported records as JSON/CSV                                           | **Data & backups**                  | Viewer, editor or owner                   | Creates a selected download; it does not change records.                                                 |

Check the workspace name before starting. Imports belong to one selected account; references must belong to the same workspace and, where account-bound, the same account. Create the required account, currencies, instrument versions and explicit buckets first. The importer can obtain a default settled bucket for eligible cash/fee/income/tax/expense rows when its identity is omitted; that does not replace the rest of account setup. FX requires explicit source/destination buckets.

**Fictional example:** use a dedicated paper account named **CSV practice**, with a synthetic USD currency. Keep it separate from the account used in [first run](../getting-started/first-run.md). A fresh account has no opening funding until it is recorded explicitly.

> **Warning:** Confirm the workspace, account, currency identities and source conventions before posting. Changing a namespace or source ID to get past duplicate/correction review can create a second financial event. Use stable identities and the correction workflow.

Related: [settings and access](settings-and-navigation.md), [accounts and portfolios](accounts-and-portfolios.md), [financial recording](financial-recording.md).

## Understand delivered CSV support

The installed **Importer** choices are **Universal CSV mapping · 1** (`generic-csv@1`) and **Canonical CSV interchange · 1** (`canonical-csv@1`). Both read UTF-8 CSV text. No named-broker parser, live broker API, credential connection, automated synchronization, trade placement, Excel workbook or PDF statement importer is delivered.

Universal CSV mapping associates your exact header names with canonical financial fields. It supports a single **Record type** through basic controls, and mixed kinds, conditional fields, aliases and dependencies through complete advanced mapping JSON. Canonical interchange expects a financial JSON payload per row and is useful for a prepared interchange file; it is not a claim that an ordinary broker export already has that format. An administrator/developer can install trusted adapters separately, but uploading a file never installs code.

CSV accepts an optional UTF-8 byte-order mark, LF/CRLF records, quoted delimiters, escaped double quotes and quoted multiline fields. Headers must be unique, nonempty safe names. Malformed quotes, inconsistent column counts and binary/control data are rejected. Displayed source row numbers are physical starting line numbers, so a multiline field can leave gaps between row numbers.

| Enforced import boundary                | Current limit                                                               |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Accepted UTF-8 source                   | 2 MiB                                                                       |
| Data rows per file                      | 1,000                                                                       |
| Columns                                 | 64                                                                          |
| Field size                              | 16 KiB                                                                      |
| Selected rows per validation/commit     | 100, in complete dependency groups                                          |
| Row/history page                        | 50 items; batch operation history shows the latest 100 events               |
| Mapping JSON / fields                   | 64 KiB / 64 mapped targets                                                  |
| Embedded/assembled payload nesting      | Twelve levels; dependency-hash traversal is separately bounded to 24 levels |
| Saved mapping catalog / catalog choices | 100 template entries; up to 500 per account/currency/instrument collection  |

A group larger than 100 rows cannot be committed as one synchronous selection. Split the source only where the groups are economically independent; removing dependencies to fit a limit changes the meaning. These limits do not establish the larger-scale import/performance acceptance gates as passed. [FA-04](../final-audit.md) remains open.

**Fictional example:** a 250-row file containing independent one-row cash groups can be reviewed in selections of at most 100 rows. A single 120-row dependency group cannot be truncated to its first 100 rows.

**Common mistakes:** renaming `.xlsx` to `.csv`; assuming a recorded broker name enables a connection; mapping an order as a fill; importing an internal account transfer as a deposit/withdrawal. Owned transfers, holding transfers, bucket settlement and reclassification are not supported import kinds here; use their [financial recording](financial-recording.md) workflows.

Related: [canonical import limits](../imports.md#limits-and-extension), [existing application examples](../examples/imports/README.md).

## Choose file and source conventions

Editor/owner access is required for these controls. Selecting a file is not posting it.

1. Open **Imports** and confirm the workspace.
2. Under **1. Source and mapping**, choose **Account**.
3. Check **Broker source namespace**. The account's source namespace may populate this field; retain the same value for later statements from that source.
4. Choose **Broker CSV file** and wait for **Selected: … · no financial activity has been posted.**
5. Select **Saved mapping** if you already have a reviewed template; otherwise retain **Custom mapping** and select **Importer**.
6. Expand **File format and date conventions** and match the actual source format.

| Field                   | Definition and validation                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account                 | One existing account for the entire batch. A payload cannot redirect account-bound activity to another account.                                                                                             |
| Broker source namespace | A stable, nonblank source label, at most 160 characters without control characters. Together with account, kind and identity it scopes duplicate/correction detection. It is not a filename or API address. |
| Broker CSV file         | UTF-8 CSV within the limits above. Accepted source text and its SHA-256 are retained when staged. The original filename is metadata, not an identity key.                                                   |
| Saved mapping           | A nonarchived, immutable saved mapping version. Earlier batches retain their own pinned version.                                                                                                            |
| Importer                | Installed parser identity/version. Keep the version associated with a reviewed source format.                                                                                                               |
| Record type             | The canonical kind for basic Universal CSV mapping. It is disabled for canonical interchange, where each row carries Kind.                                                                                  |
| Delimiter               | Comma, semicolon, tab or pipe. Quoted fields can contain delimiters; a wrong choice can turn a row into the wrong columns.                                                                                  |
| Decimal separator       | Dot or comma. Normalization yields exact decimal strings, not floating-point calculations.                                                                                                                  |
| Thousands separator     | None, dot, comma or space; it must differ from the decimal separator. Grouping must be valid three-digit grouping.                                                                                          |
| Date format             | ISO with explicit offset, Year-month-day, Day/month/year or Month/day/year. Avoid interpreting an ambiguous local date by guesswork.                                                                        |
| Source timezone         | A recognized IANA timezone for local dates/times. It initially uses the workspace timezone, but must describe the source. ISO timestamps still require their explicit offset.                               |

Decimal fields reject exponents, expressions, ambiguous separators and oversized values; canonical financial decimal strings support up to 42 integer digits and 36 significant fractional places. They are not rounded into acceptance. Quantity and rate positivity, sign rules and instrument increments are validated by the corresponding financial command. A sell uses positive quantity with side `sell`; do not negate quantity to represent a sell.

ISO input requires seconds, an explicit UTC offset and no more than six fractional digits. Local formats can include a time; omitted time means local midnight. Impossible dates, daylight-saving gaps and repeated local clock times are rejected. Resolve a repeated clock time with ISO and the correct explicit offset. Financial **Sequence within date** (`orderingKey`) is a nonnegative integer string; CSV row order is not a substitute.

**Fictional example:** the [generic cash source](../examples/imports/generic-cash.csv) uses semicolons, decimal comma, dot grouping, Day/month/year and `Europe/Madrid`. `1.000,00` normalizes to `1000`; `12/10/2026 09:30:00` becomes `2026-10-12T07:30:00.000000Z`. Choosing a US local-date convention would change the intended day or fail validation.

**Common mistakes:** using the workspace timezone when the broker's export uses another zone; accepting `01/02/2026` without identifying its convention; treating an account base currency as every row's charged currency; silently dropping a sign. Review normalized values before posting.

Related: [time and currency settings](settings-and-navigation.md#set-workspace-timezone-and-reporting-currency), [financial concepts](../reference/financial-concepts.md), [canonical decimal/date rules](../imports.md#decimal-and-date-conventions).

## Map financial fields

### Use basic Universal CSV mapping

1. Choose **Universal CSV mapping · 1**, then the appropriate **Record type**.
2. Enter the exact **Broker ID column (optional)** header if the source has stable IDs. Leave the control empty only when no such column exists; selecting a header whose row value is blank produces a missing-source-ID error.
3. Enter **Dependency group column (optional)** when linked commands must be reviewed together.
4. In **Financial field mapping**, inspect every **Field**, **Source**, **Column / constant** and **Conversion**.
5. Select **CSV column** for a source column or **Constant** for a reviewed value shared by these rows. Choose the actual catalog currency/instrument version for identity constants.
6. Use **Add field** or **Remove** to match the command's required fields. Choose **Stage file for review** only after the entire mapping is ready.

| Mapping control              | Meaning                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target field                 | Canonical payload field/path, such as `amount`, `economicAt`, `currencyId` or `fees.0.amount`. Targets must be unique; overlapping incompatible paths are rejected. |
| CSV column                   | Exact, case-sensitive source header. A missing mapped column is an error.                                                                                           |
| Constant                     | One value applied to all relevant rows. Currency/instrument controls store identities, not guessed symbol/code matches. Boolean constants offer Yes/No.             |
| `text`                       | Trim surrounding whitespace and retain text. Use for enumerations only when source values already equal the required values.                                        |
| `decimal` / `negate decimal` | Parse exact source conventions; the latter also reverses the sign. Negation is appropriate only when the source's documented convention requires it.                |
| `instant`                    | Parse the chosen date/time conventions.                                                                                                                             |
| `boolean`                    | Accept true/false; source aliases such as Yes/No need an explicit mapping.                                                                                          |
| `json`                       | Parse a JSON value for structured fields, not executable instructions.                                                                                              |
| `reference`                  | Resolve `sourceKey:result.path` to another row's resulting identity. See advanced mapping below.                                                                    |

Unmapped nonempty columns are retained and produce warnings; retention does not mean their meaning has been understood. Basic new fields omit empty values by default. Advanced mapping can require an error or explicitly set null. Empty and null do not substitute for an unknown required economic value.

**Fictional example:** for a cash file with headers Date, Sequence and Amount, map `economicAt` to Date using instant, `orderingKey` to Sequence using text, `amount` to Amount using decimal, and set constants for the actual USD `currencyId` and appropriate cash movement `kind`. A mixed deposit/withdrawal Type column needs explicit aliases, as in the existing mapping example.

**Expected result:** staging retains the mapping and source; normalized values appear for review. It creates no cash balance change. If the wrong mapping was staged, correct the mapping/file and stage a new review copy; the original accepted source/mapping is immutable.

**Common mistakes:** leaving the default ordering constant `1` for economically ordered same-time events without checking it; using a display name where an ID is required; assuming the initial fields cover every required field for every record type; marking costs complete because the fee column is absent.

Related: [financial recording and field meanings](financial-recording.md), [mapping example](../examples/imports/generic-cash.mapping.json), [import contracts](../../packages/contracts/src/imports.ts) (`importMappingSchema`, `canonicalImportPayloadSchemas`).

### Supported record types and their meaning

All kinds use the same stage → select complete groups → validate → explicit commit workflow. Their financial prerequisites and expected effects differ. Account-bound values use the batch's account. Dates are actual economic time for activity or observed time for observations; exact field requirements remain in the [financial contracts](../../packages/contracts/src/financial.ts) and [accounting contracts](../../packages/contracts/src/accounting.ts), with end-user field walkthroughs in [financial recording](financial-recording.md).

| Record type / kind                      | Fields and validation to review                                                                                                                                                                                                                                    | Fictional use and expected effect                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cash movement / `cash_movement`         | `economicAt`, `orderingKey`, signed `amount`, `currencyId`, movement `kind` (`deposit`, `withdrawal`, `opening`, `income`, `unresolved`); optional explicit `cashBucketId`. Match source classification and signs.                                                 | A `1000` deposit and `-100` withdrawal produce `900` cash, classified as flows rather than trading profit. An unresolved source remains unresolved.                                                       |
| Fill / `execution`                      | Actual instrument **version**, side, positive quantity, price (or permitted reviewed source principal/manual-cash path), economic time/sequence, principal bucket/currency as required, fees and `costsComplete`. Optional order-leg/lot references must be valid. | Buying 2 native shares at 50 records one fill and its supported cash/inventory effects. It does not create a campaign allocation or prove that all fees are known.                                        |
| Fee / `fee`                             | Actual charge amount/currency, fee kind, economic time/sequence, optional bucket and execution link. Use charged currency; do not absorb it into a rounded price.                                                                                                  | A separate 1 USD source fee records that charge once and can link it to the fill. A later statement-cash reference must not post it again.                                                                |
| FX conversion / `fx_conversion`         | Explicit source/destination buckets, positive actual source/destination amounts, economic time/sequence, optional declared rate/review and fee components. Buckets must be in the selected account.                                                                | Exchanging 100 USD for 90 EUR changes both cash currencies. It is actual conversion, unlike reporting translation.                                                                                        |
| Opening holding / `opening_lot`         | Instrument version, long/short direction, positive quantity, actual time/sequence and reason; entry price/booked principal/reporting FX only when known, and explicit cost completeness.                                                                           | Opening 3 shares with unknown historical basis preserves quantity and unknown basis; it must not fabricate realized P&L.                                                                                  |
| Instrument / `instrument`               | Name, family/subtype, economic identity, quote currency, unit, multiplier, settlement/valuation conventions, increments and effective time as required by its schema.                                                                                              | Create an explicitly defined synthetic ordinary share, then reference the resulting version in a dependent fill. A symbol alone does not select a version. Unsupported native economics stay unsupported. |
| Order / `order`                         | Single/package kind; legs with version, side and positive ratio; instruction status, quantity, market/limit/stop type, relevant limit/stop prices, time in force and economic time.                                                                                | A working limit order records an instruction. It neither fills nor changes cash because its order price was supplied.                                                                                     |
| Price observation / `price`             | Instrument version, currency, source price, `observedAt`, source label; optional supersession/reason. Evidence must match the instrument conventions.                                                                                                              | A source price of 55 can support an eligible mark under the selected freshness/source policy. It changes no fill or cash.                                                                                 |
| FX observation / `fx_rate`              | Explicit base and quote currencies, positive rate, observed time and source; optional supersession/reason. Verify direction.                                                                                                                                       | USD/EUR rate `0.9` means the declared quote per base, not its inverse. It is evidence, not a conversion.                                                                                                  |
| Account valuation / `account_valuation` | Amount/currency, observed time, source and valuation `definition`; optional supersession/reason.                                                                                                                                                                   | A broker-reported net-liquidation observation of 1020 is retained as evidence. It does not reset the cash ledger to 1020.                                                                                 |
| Income / `income`                       | Dividend/interest kind, positive actual amount, currency, economic time/sequence, optional nonnegative withholding and description/bucket.                                                                                                                         | A gross 10 USD dividend with 2 USD withholding preserves those distinct components; do not also enter another unrelated gross deposit.                                                                    |
| Tax / `tax`                             | Nonzero signed amount, currency, description and economic time/sequence; optional related income/bucket.                                                                                                                                                           | A source tax adjustment records its actual cash classification. It is not a jurisdictional tax calculation or filing result.                                                                              |
| Financing expense / `expense`           | Nonzero signed actual amount, currency, kind (`financing`, `interest`, `other`), description and economic time/sequence; optional bucket.                                                                                                                          | A recorded financing charge contributes actual cost evidence rather than an automatically inferred borrowing rate.                                                                                        |
| Fill cash reference / `execution_cash`  | Stable `executionSourceId`, currency, signed amount, economic time and `scope` (`principal`, `fees`, `net`). The exact existing fill cash in that account/namespace/currency/time must match.                                                                      | A statement row matching an already booked purchase's principal is marked reconciled and adds no cash posting. A mismatch blocks review.                                                                  |

The import framework obtains eligible omitted buckets idempotently. Imported fills and opening holdings default missing `costsComplete` to false; absent fees do not mean confirmed zero fees. Every instrument retains the native/manual/supplied-analysis boundaries described in the [asset-class audit](../asset-class-audit.md). An import does not extend the accounting engine.

### Use advanced mappings or canonical interchange

Use advanced mapping when a source contains mixed record types, source-specific words, multiple currency/instrument identities or dependent rows. You need a reviewed mapping definition; the UI does not infer these meanings.

1. Start from a [documented application mapping example](../examples/imports/README.md), replacing its placeholder currency ID with a real identity in this workspace.
2. Expand **Advanced mapping and value aliases**. Opening the section populates the current complete mapping JSON.
3. Paste your complete mapping into **Advanced mapping JSON**.
4. Select **Apply advanced mapping** and resolve any JSON/schema error.
5. Leave basic mapping controls unchanged afterward: editing them returns to a single-type mapping and clears the applied advanced definition.
6. Stage and validate the source as described below; inspect each raw and normalized payload.

| Advanced property                        | Meaning                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`, `adapterId`, `adapterVersion` | Mapping format `canonical-import/1` and installed parser identity/version.                                                                        |
| `kind`, `kindColumn`, `kindValues`       | Default kind or an explicit source-column → canonical-kind mapping for a mixed source. Unknown kinds block review.                                |
| `sourceIdColumn`                         | Stable broker/source ID header; strongly preferred over fallback fingerprints.                                                                    |
| `sourceKeyColumn`                        | Unique local declaration key used by dependencies. Every referenced key must identify one row.                                                    |
| `groupColumn`                            | Complete review/commit group key; without it, the row's source key defines its group.                                                             |
| Field `kinds`                            | Restrict that mapped field to selected canonical kinds.                                                                                           |
| Field `values`                           | Explicit aliases, such as `Deposit` → `deposit` or a currency code → the actual workspace currency UUID. Every used source value needs a mapping. |
| Field `empty`                            | `omit`, `null` or `error` for an empty source value. The underlying financial schema still determines whether omission/null is valid.             |

A reference uses `sourceKey:result.path` with the reference conversion, or `{ "$row": "fill-1", "path": "id" }` in canonical JSON. A dependent row needs its own stable source ID. Select an uncommitted dependency and its dependent commands together in complete groups; an already committed result can be referenced. References must resolve to string identities. Unresolved references, cycles, duplicate local keys and unsafe target/payload field names block review. JSON does not execute instructions; reserved keys `__proto__`, `constructor` and `prototype` are rejected inside JSON objects, including arrays.

For canonical interchange, choose **Canonical CSV interchange · 1**. Prepare headers `ID,Key,Kind,Group,Payload`; Payload is a correctly CSV-quoted JSON object containing canonical fields. Kind and Payload are required per row. Blank/absent ID means no stable source ID; Key and Group can default to the derived source key. The UI's short explanatory text omits optional Key, which the parser supports. Generic field mappings are unused (`fields: []` in a complete mapping). Configure the correct delimiter; extra columns remain warnings.

**Fictional example:** a row creates the synthetic instrument with local key `instrument-1`; a stable-ID fill references that row's returned version identity. Both must be in the validated dependency selection. Changing the local label alone does not represent changed economics; changing the instrument's actual definition can change a dependent row's normalized intent.

**Common mistakes:** pasting only a `fields` array instead of complete mapping JSON; leaving an example UUID unchanged; assuming the basic form retains an advanced mapping after another edit; using a cross-workspace reference; putting an uncommitted dependency outside the selection.

Related: [canonical mapping behavior](../imports.md#csv-and-mappings), [import contract](../../packages/contracts/src/imports.ts), [financial recording](financial-recording.md).

## Save and archive a reusable mapping

An editor/owner can retain a reviewed mapping for the workspace. A template has a stable identity and immutable numbered versions; batches keep the exact version they used.

1. Prepare or apply the intended mapping.
2. Enter **Mapping name**, for example `Practice cash statement`.
3. Select **Save mapping version**. The saved version becomes selected in **Saved mapping**, displayed with its version number.
4. To revise it, select the existing saved mapping, change the mapping, and select **Save mapping version** again. This appends a version rather than changing earlier batches.
5. To remove it from new-import choices, select the template and **Archive mapping**. In **Archive this mapping?**, review the name and select **Archive mapping** or **Cancel**.

Names/reasons follow the nonblank 160-character label bound. Updating/archiving checks the expected version; a concurrent change requires reloading the current template before saving. Archived mappings cannot start new imports; earlier sources retain their pinned mapping and audit history. There is no overwrite of prior mapping versions.

**Fictional example:** version 1 understands the practice source's Amount column. A later source adds a separate fee field; Mira reviews and saves version 2. The October batch still identifies version 1. Archiving the template later hides it from new choices without erasing that evidence.

**Common mistakes:** reusing a template after the broker changes date/sign conventions; expecting an update to remap an already staged batch; treating archive as a delete of source evidence.

Related: [source and mapping controls](#choose-file-and-source-conventions), [canonical template behavior](../imports.md#csv-and-mappings).

## Stage, validate and commit complete groups

### Stage and inspect

1. With file, account, namespace and mapping ready, select **Stage file for review**.
2. In **2. Review …**, check account, row count, batch state, namespace and **Source SHA-256**.
3. Expand each relevant **Raw and normalized values** row to compare the original fields with the interpreted financial payload.
4. Use **Next rows** and **First rows** for unvalidated source-row pages when needed.

Staging creates a private review copy, normalized drafts and issues. It posts no financial activity. A staged batch can contain row errors; a successful upload does not mean those rows are valid commands.

### Validate a selection

1. Under **Include complete dependency groups**, select the groups to review. **Select all groups** and **Clear selection** provide shortcuts.
2. Check the selected row count. Keep it at or below 100. Excluded groups stay unposted.
3. Select **Validate selected groups**.
4. Inspect new-record, duplicate, correction and attention counts plus every selected row's status, errors and warnings.
5. For blocking errors, fix the source/mapping in a newly staged batch, supply a permitted correction reason, or explicitly choose a complete independent valid subset and validate that subset again.

Validation runs the real financial commands as a dry run, forces relevant constraints and rolls simulated financial writes back. It retains the review result. **Preview valid. Ready for your explicit commit.** means the exact selected groups can proceed at that revision; financial records are still unchanged.

| Visible status              | User meaning and next action                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Awaiting validation         | Staged row needs validation.                                                                                               |
| Needs attention             | A parsing, identity, account, convention, financial or dependency rule failed; inspect the message.                        |
| Identity needs review       | Identical fallback-identity rows/local identity ambiguity cannot be silently interpreted; establish stable occurrence IDs. |
| New activity                | No matching posted source intent was found in scope. Verify the event is genuinely new.                                    |
| Duplicate — will be skipped | Matching source intent is already posted. Committing adds no duplicate financial effect.                                   |
| Correction reason required  | Stable source identity exists but its economic payload changed. Review an allowed correction and revalidate.               |
| Already reconciled          | An execution-cash reference matches existing booked cash; it does not post cash.                                           |
| Posted                      | This row has already been committed.                                                                                       |
| Reversed                    | Its eligible owned source effect was reversed; ordinary reimport cannot resurrect it.                                      |

### Confirm posting

> **Warning:** **Confirm posting** changes the financial ledger for new activity and accepted corrections. Review the actual normalized values, complete groups and warnings first. Automatic reversal is available only for the narrow cash-only case below.

1. Resolve all selected blocking errors and revalidate after any correction reason changes.
2. If warnings exist, inspect retained source columns and check **I reviewed retained unmapped columns and warnings.** Do not acknowledge a column whose missing meaning could change the accounting.
3. Select **Commit reviewed import**.
4. In **Post this reviewed import?**, confirm the filename, row count and target account. Select **Confirm posting** once, or **Cancel**.
5. Wait for the batch to reload. Confirm **Posted**, skipped duplicate/reconciled rows and the expected batch state (`committed` or `partial`). Inspect the resulting account records.

One commit atomically processes the exact reviewed selection. A commit failure rolls that selection back; it does not leave a successful prefix of that selection. Earlier separately committed selections remain. A `partial` batch has unprocessed groups: review/validate the remainder separately. A financial change after preview, including another user's activity, invalidates the review and requires a fresh validation.

**Fictional walkthrough:** use [generic-cash.csv](../examples/imports/generic-cash.csv) and [generic-cash.mapping.json](../examples/imports/generic-cash.mapping.json) in CSV practice. Replace the mapping's placeholder currency ID with this workspace's USD identity, apply its advanced mapping, retain namespace `docs:csv-practice`, stage, select both groups and validate. Review the retained Memo warning. After acknowledgement and **Confirm posting**, the two external flows net to **900 USD**. They are not 900 USD of profit. Reimport the same source without changing account/namespace/IDs: both rows are skipped and cash remains 900 USD. The equivalent canonical example has matching normalized intent and likewise must not add funding.

Imported fills require an additional attribution step. After a fill-containing commit, use **Create a journal trade from an existing fill**, or **Record trade** with the existing-fill method, to allocate the actual fill to a campaign. This does not post the fill again. Unallocated fills do not automatically become campaign analytics. See [financial recording](financial-recording.md) and [journaling](journaling-and-reviews.md).

**Common mistakes:** interpreting Stage or Validate as posting; acknowledging warnings without checking source meaning; selecting 100 of a group's 120 rows; reading a partial commit as a fully processed file; re-entering an imported fill manually; retrying a changed financial action after an unknown result without checking history.

Related: [preview and identity semantics](../imports.md#preview-duplicates-and-commit), [guided example](guided-example.md), [analytics scope](analytics-and-dashboard.md).

## Review duplicates, correct source changes and reverse eligible cash

### Keep source identities stable

Duplicate identity is scoped by **workspace + account + namespace + record kind + identity key**. A stable source ID is preferred. Without one, the importer derives a versioned fingerprint of normalized financial intent. Filename, upload date, physical row number, column order, local group and local declaration label are not economic identity.

An unchanged matching identity is skipped. Matching stable ID with changed economics requires a correction. Two identical rows without stable IDs may be two real occurrences and need explicit stable occurrence IDs; the importer does not choose one silently. If the source lacks an ID column, prepare an external review copy with a source-supported stable occurrence-ID column, map its exact header in **Broker ID column (optional)** and retain those same occurrence IDs on later statements. There is no per-row occurrence-ID editor in the review table. A changed fingerprint-only row looks like a new intent, so fallback fingerprints cannot reliably recognize a broker correction. Similar dates/prices alone do not establish duplication. Existing matching stable source records can be adopted after normalized-intent checking without double posting.

**Fictional example:** `CASH-002` remains the same withdrawal in every overlapping source file. Renaming a file does not create another withdrawal. If the broker changes that row's amount from `-100` to `-120`, retain `CASH-002` and review a correction; do not rename it `CASH-003` to force acceptance.

### Apply an eligible correction

1. Prepare the corrected source with the same account, namespace and stable source IDs.
2. Stage it, select the complete relevant groups and **Validate selected groups**.
3. For **Correction reason required**, inspect old intent/source history and the replacement raw/normalized values.
4. Enter **Correction reason** for the affected row, such as `Corrected practice statement reports withdrawal as 120 USD`.
5. Select **Validate selected groups** again. Changing a reason disables posting until this new validation.
6. Review all results/warnings, select **Commit reviewed import** and confirm **Confirm posting**.

Imported cash movements and fills support explicit corrections when their dependency rules permit them. Cash correction appends exact reversal of original postings and a replacement. Fill correction uses domain supersession/rebuild rules and can be blocked by downstream dependencies. Changed other record types require their appropriate domain correction; they cannot be appended as new under the old source identity. Reasons are nonblank, at most 160 characters here. Original source, actor and revision history remain retained.

**Expected fictional cash result:** after the earlier `1000 − 100 = 900` example, replacing the withdrawal with `-120` yields **880 USD**, with reversal/replacement history rather than an extra independent `-120` withdrawal. This correction also makes the batch ineligible for the simple reversal path described next.

**Common mistakes:** changing namespace/ID to bypass a conflict; assuming every source kind has importer correction support; entering a reason and committing without revalidation; treating historical source retention as proof that a broker authenticated the data.

### Reverse an eligible cash-only batch

Use this only for independent imported cash movements that still satisfy the conservative dependency checks. It does not undo arbitrary financial activity.

> **Warning:** Reversal appends offsetting monetary entries and changes balances. It preserves history, marks owned identities reversed and cannot be undone by simply importing the same file again. Later activity or prior corrections can block it; use explicit domain correction when required.

1. In **Import history**, select **Review batch** for the intended committed/partial batch.
2. Expand **Reverse eligible cash-only batch**.
3. Enter **Reversal reason**, for example `Remove synthetic funding from isolated CSV practice`.
4. Select **Review and reverse cash batch**.
5. In **Reverse this cash batch?**, inspect the filename/reason and select **Confirm reversal** or **Cancel**.
6. Wait for state `reversed` and confirm the offsetting cash records and retained audit history.

Eligibility requires owned independent `cash_movement` effects, current revision and unchanged active source claims, without earlier-history correction or financial activity outside the batch since its first financial effect. All partial commits count, including automatically created buckets; a later duplicate/no-op commit cannot hide downstream activity. Fills, fees, FX, opening lots, orders, observations and catalog changes block automatic batch reversal. Duplicate/reconciliation-only rows cannot reverse another batch's effects. A blocked reversal leaves the batch and ledger unchanged.

**Fictional example:** in a separate untouched paper account, reverse the original two-flow 900 USD batch before corrections or other activity. The offsets total `-900`, returning its cash effect to zero while retaining the source. If another financial record was posted afterward, expect a dependency error and use the appropriate explicit correction instead.

Related: [financial corrections](financial-recording.md), [canonical correction/reversal boundaries](../imports.md#corrections-and-reversal).

## Inspect provenance and distinguish reconciliation workflows

Any current workspace viewer can inspect **Import history**, use **Older batches**/**Newest batches**, select **Review batch**, and expand **Batch audit history**. History retains source hash, source identity, parser/mapping version, selected review/operation records and results; the table exposes the latest 100 operation events. Row review uses **Raw and normalized values**; prior actions remain even when later correction/reversal changes the active effect.

Select **Download original source** to obtain `import-<batch-id>.source.txt`. This is accepted UTF-8 source text with the original bytes/hash, served privately. It is not the spreadsheet-safe CSV export described later.

> **Warning:** Original source cells can contain spreadsheet formulas. Inspect the `.source.txt` file in a text editor. Renaming or manually opening/importing the original source in a spreadsheet can execute formulas; retaining the source does not sanitize its contents.

The import page is headed **Imports & reconciliation**, but its `execution_cash` reconciliation is narrow: it verifies exact existing fill cash for one stable execution source, account, namespace, currency, instant and principal/fees/net scope. A matching row receives **Already reconciled** and adds no money. Missing fill/cash, mismatch or wrong scope blocks validation. It is not a tolerance adjustment or a full statement balance comparison.

Use **Reconciliation** for independent cash/holding/account-value statement evidence and persisted variance runs. Import source provenance does not itself establish agreement with an independent statement, and an internally balanced ledger is not independent evidence. Use [risk and reconciliation](risk-and-reconciliation.md) for that separate step.

**Fictional example:** a purchase already posted `-100 USD` principal. A matching statement `execution_cash` row for principal `-100` is evidence only; cash must not fall another 100. A statement row `-101` fails that scope rather than inventing a 1 USD fee. Investigate and record the actual charge through a supported workflow.

**Common mistakes:** using the source download as a safe spreadsheet report; equating **Already reconciled** with a whole account's statement reconciliation; treating a source hash as proof of external authenticity.

Related: [risk and reconciliation](risk-and-reconciliation.md), [financial concepts](../reference/financial-concepts.md), [canonical execution-cash behavior](../imports.md#execution-linked-statement-cash).

## Recover from import problems

| Symptom/code                                                                 | What to do                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File decoding/size/CSV error                                                 | Export real UTF-8 CSV, verify delimiter/quotes/headers and fit the file/row/column/field limits. Do not rename a binary workbook.                                                                                                                                                                                                                                           |
| Invalid field or unknown record kind                                         | Inspect the named field, exact header, aliases, sign, decimal/date format and canonical kind. Stage a corrected immutable review copy.                                                                                                                                                                                                                                      |
| Identity needs review / `AMBIGUOUS_FINGERPRINT`                              | Establish source-supported stable occurrence IDs; do not silently deduplicate genuinely repeated events.                                                                                                                                                                                                                                                                    |
| Invalid/missing dependency                                                   | Give each local declaration a unique key, provide stable IDs for dependent rows and select its uncommitted dependencies. Resolve cycles instead of dropping dependencies.                                                                                                                                                                                                   |
| Inventory/convention/account error                                           | Check effective instrument/account versions, units, increments, quantities, available supported inventory and workspace/account ownership. Do not weaken the source to make it parse.                                                                                                                                                                                       |
| `IMPORT_CORRECTION_REQUIRED`                                                 | Review the changed stable source record, add a permitted correction reason and validate again.                                                                                                                                                                                                                                                                              |
| `STALE_IMPORT_PREVIEW`, `IMPORT_REVIEW_REQUIRED`, `IMPORT_REVISION_CONFLICT` | The page clears its stale review. Reload/reopen the batch if necessary and validate the exact selected groups again. Recheck warnings/corrections before confirming.                                                                                                                                                                                                        |
| `IMPORT_VALIDATION_FAILED`                                                   | Resolve selected errors or choose a complete valid independent subset and validate it.                                                                                                                                                                                                                                                                                      |
| `IMPORT_WARNINGS_UNREVIEWED`                                                 | Inspect retained columns/warnings, then explicitly acknowledge them.                                                                                                                                                                                                                                                                                                        |
| `IMPORT_SOURCE_REVERSED`                                                     | Reimport cannot resurrect a reversed identity. Investigate the audit trail and use a supported explicit correction.                                                                                                                                                                                                                                                         |
| `IMPORT_REVERSAL_DEPENDENCIES` / `IMPORT_REVERSAL_UNSUPPORTED`               | Use dependency-aware domain correction; the automatic cash-only reversal is unavailable.                                                                                                                                                                                                                                                                                    |
| Loading error                                                                | Select **Retry loading import data**. Confirm current history before another mutation.                                                                                                                                                                                                                                                                                      |
| Session/permission error                                                     | Sign in again or use an authorized editor/owner workspace. Viewer history remains read-only.                                                                                                                                                                                                                                                                                |
| Commit response lost or connection interrupted                               | Inspect **Import history**, batch state and account effects before posting again. Browser import requests create command keys per action; do not assume a generic retry message guarantees a frozen original request. Stable scoped source identities provide duplicate protection, but they do not justify changing identity or ignoring an uncertain correction/reversal. |

Related: [manual verification](verification.md), [source import service](../../packages/server/src/imports/service.ts) (`preview`, commit guards and reversal checks).

## Download a complete owner workspace backup

Use this to preserve the supported application's workspace records and private attachment bytes in one portable archive. It requires owner access to the selected workspace. An editor/viewer instead sees **Workspace owner access is required for a complete backup.**

> **Warning:** The archive contains private financial records, source text, journal/strategy history and attachment bytes. Store the downloaded file privately. It excludes sign-in credentials, but it is not anonymized or encrypted by this download workflow.

1. Open **Data & backups** and verify the workspace in the sidebar.
2. Under **Complete workspace backup**, select **Download workspace backup**.
3. Wait for **Workspace backup downloaded, including private attachment bytes and verification checksums.**
4. Locate `workspace-<workspace-id>.journal.json` in the browser's download location and retain the matching application release context.

The versioned archive format is `journal-workspace/1`. It retains a closed supported collection set: financial catalog/convention versions; accounts/portfolios; commands, ledger/cash/inventory and allocations; source/correction/audit/outbox history; observations; strategy/journal versions and attachments; import mappings/batches/source claims; statement reconciliation; risk policies/assessments; period reviews/templates; supplied components; and restore provenance. Decimal values remain strings. The archive includes workspace preferences, schema version, calculation manifest, per-collection/archive SHA-256 checksums, verification data and media size/checksum/content.

It excludes credentials, sessions, historical access grants, private member saved views, browser theme storage and operator/deployment secrets/configuration. Preserved historical actor identifiers are provenance, not new memberships. Derived/generated values are handled according to the archive/restore implementation rather than copied as an alternative accounting truth.

**Current bounds:** 64 MiB archive/request, 100,000 total collection rows, at most 10 MiB per media object, 48 MiB total expanded private media and 4,096 media entries. Backup also rejects a database-row JSON byte estimate above 32 MiB before materializing the archive. A workspace can therefore be rejected before reaching a displayed file-size ceiling. Narrowing filters is not available for a complete backup. Use the operator [backup and recovery](../backup-and-recovery.md) procedure for larger/full-system protection.

**Fictional example:** after completing the practice source import and attaching an invented screenshot to a journal, Mira downloads the archive. It includes source history and that attachment, but does not include her password or a colleague's viewer grant. It changes none of the 900 USD source economics.

**Common mistakes:** assuming a successful browser download proves a future restore has been tested; treating a filtered CSV as the backup; editing archive values/checksums; assuming complete workspace backup also captures the deployment's database cluster, operational configuration or private member views.

Related: [portable workspace behavior](../workspace-portability.md), [operational recovery](../backup-and-recovery.md), [saved-view exclusions](settings-and-navigation.md#save-private-filters-and-visible-columns).

## Restore into a separate verified workspace

You need owner access to the currently selected workspace, a supported intact archive and enough deployment capacity/private storage. Restore creates a new workspace owned by you. It never overwrites the current one and does not merge records into it.

1. Open **Data & backups**.
2. Under **Restore into a new workspace**, choose the file in **Workspace backup JSON**.
3. Enter **New workspace name**, for example `CSV practice restored`. The default is the current workspace name followed by ` restored`; review it rather than assuming it is the archive's original name.
4. Select **Review restore**.
5. In **Restore a separate workspace?**, inspect the filename and new name. Select **Restore and verify** or **Cancel**.
6. Wait for **The new workspace was restored and verified.**
7. Select **Open restored workspace** to open its Accounts page. Confirm the workspace identity, cash, holdings, source/history and expected attachment access.

| Field/check                      | Meaning and rejection behavior                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace backup JSON            | JSON in the supported `journal-workspace/1` format, within archive/request bounds. A malformed, incomplete or corrupted file is rejected.                                                                           |
| New workspace name               | Trimmed nonempty name, at most 120 characters. A new workspace ID is created even if names resemble one another.                                                                                                    |
| Schema/calculation compatibility | Exact current database schema version (**17** at this application baseline) and matching calculation manifest are required. The format label alone does not promise compatibility across releases.                  |
| Collection/checksum/media checks | Known complete supported collections, matching checksums, valid media bytes/sizes and source-workspace relationships are required. Do not repair a file by manually recomputing checksums around altered economics. |
| Financial verification           | Revision-ordered financial command evidence, immutable/conservation constraints and regenerated cash/inventory verification must pass before the new workspace becomes available.                                   |

A failed restore rolls back the new workspace and cleans up its newly written private files. The browser retains the restore command for an identical retry on the same page; after an uncertain response, inspect the workspace list before starting a distinct restore. A lost response does not prove no workspace was created. Repeating the retained identical command returns the committed result rather than another workspace.

Unsupported schema/calculation versions produce an incompatibility error directing you to the matching application release. No automatic archive upgrade, downgrade or cross-version migration workflow is delivered. Preserve the original archive and matching release; contact the installation operator for a supported environment. Restoring does not grant the archive's former members access or import their passwords/sessions. Recreate private saved views in the new workspace if needed.

**Fictional example:** restoring the untouched original practice archive as `CSV practice restored` creates another workspace owned by Mira. Its regenerated cash is 900 USD under the example's assumptions, its source row history and media remain available, and the old practice workspace is still present. A colleague's old viewer membership is not restored. This is a same-version expected example, not a new execution claim.

**Common mistakes:** choosing a filtered `journal-record-export/1` file; expecting restore to replace/repair the source workspace; assuming a name match means a workspace was overwritten; stripping an attachment to make the archive smaller; inferring that matching format name means matching schema/calculations.

Related: [workspace portability](../workspace-portability.md), [settings/workspace selection](settings-and-navigation.md#choose-a-workspace-and-understand-roles), [manual verification](verification.md).

## Export an exact supported record population

Filtered exports are available to any current viewer/editor/owner. Use JSON for lossless source values and nested structures; CSV is a quoted, spreadsheet-safe presentation. The export is not an archive and cannot be used by **Restore into a new workspace**.

1. Open **Data & backups** in the intended workspace.
2. Under **Filtered record export**, choose **Records** and **Format**.
3. For non-analytics records, enter optional **From (UTC, ISO timestamp)** and **Until (UTC, ISO timestamp)**. Use explicit UTC timestamps including `Z`.
4. Expand **Account and record identity filters** if needed. Enter actual **Account IDs (comma separated, optional)** and **Record IDs (comma separated, optional)**, according to the population table below. Whitespace-separated IDs are also accepted by the browser's splitter.
5. Select **Export selected records**.
6. Wait for **The filtered records were exported.** and locate `journal-<kind>.json` or `journal-<kind>.csv` in downloads.

All non-analytics time filters include From and exclude Until: `[from, to)`. Both are optional; when both are supplied, Until must be later than From. These are UTC instants, unlike the inclusive local From/Through day selectors on report screens. The browser converts the entered timestamp to ISO, so supply explicit `Z` rather than relying on browser-local parsing. Account and record IDs must be valid workspace identities; the controls accept IDs, not names. At most 100 account IDs and 1,000 record IDs are allowed. Non-analytics exports reject more than **10,000 rows** instead of truncating; all serialized exports are bounded to **16 MiB**. Narrow the appropriate selection after `EXPORT_SCOPE_TOO_LARGE`.

| Records choice | Exactly what is exported                                                                                                                                                                                                                                                                    | Account/record identity filters                                                                                                                                             | Time field                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `trades`       | Campaign/trade identity, title, classification, status/revision, creation/archive metadata and pinned strategy identity/version. This is not the full journal document, all legs or fills.                                                                                                  | Account matches a trade leg in any selected account; record IDs mean **trade IDs**. A campaign can have other legs too.                                                     | Trade creation time, not fill activity time.                                                    |
| `executions`   | Stored execution rows, with quantity/price/principal decimal strings, account/instrument version, side, economic time/sequence, source IDs, supersession and source payload. Historical superseded execution records are included when selected; it is not a current-only analytics cohort. | Account directly matches the execution; record IDs mean **execution IDs**.                                                                                                  | Execution economic time.                                                                        |
| `cash`         | Actual cash **posting rows** joined to ledger-event/cash-bucket context, including signed amount, currency, bucket, event kind, source revision/reversal and payload. A single event can yield multiple rows.                                                                               | Account means bucket account; record IDs mean **ledger event IDs**, although each exported row's `id` is its posting ID. Use the row's `eventId` to repeat an event filter. | Ledger event economic time.                                                                     |
| `strategies`   | Every selected published/stored strategy version with version identity/number, effective time, definition/hash and strategy archive metadata. It is not just the latest version.                                                                                                            | Account filters are rejected because strategies are account-independent; record IDs mean **strategy IDs**, not version IDs.                                                 | Version effective publication time.                                                             |
| `reviews`      | **Journal revision** rows: revision ID, trade ID, revision number/time, document and actor. This choice does not export standalone Period reviews or their templates.                                                                                                                       | Account matches a leg on the linked trade; record IDs mean **trade IDs**, not journal revision IDs.                                                                         | Journal revision creation time.                                                                 |
| `analytics`    | One calculated analytics report object using the required full calculation context; JSON retains the report's nested results, provenance, availability and coverage. This is not a screenshot or a download of every Dashboard filter state.                                                | Selection belongs inside Analytics calculation context JSON; ordinary account/record/time input controls are hidden.                                                        | Context `from`/`to`, source revision/metadata clock when supplied and selected evidence policy. |

No universal active-only, complete-only, current-version-only or archive exclusion rule applies across these choices. For example, cash includes actual reversal postings in scope; strategies include versions; journal revisions are historical documents. Account-filtered trades/reviews select matching campaigns and do not trim the document to only that account's leg. Select and interpret each population deliberately.

**Fictional examples:**

- To inspect the two practice flows, select `cash`, its account ID, From `2026-10-12T00:00:00Z` and Until `2026-10-14T00:00:00Z`. Expect the selected ledger's posting rows, not necessarily two event-summary rows. Do not add all balanced postings indiscriminately as trading profit.
- To export one campaign's journal history, select `reviews` and its **trade ID**. Selecting a period-review ID or a journal-revision ID is the wrong population/identity.
- To review every version of a synthetic strategy, select `strategies` with that strategy ID and leave Account IDs blank. A narrower effective-date interval can select particular versions.

The JSON envelope is `journal-record-export/1` with kind, submitted filters and rows. It preserves exact decimal strings and nested source data. CSV serializes nested objects as JSON text, sorts its present column names and quotes/escapes cells. Text beginning with spreadsheet formula characters `=`, `+`, `-` or `@` after whitespace/control characters is prefixed with an apostrophe; this also affects negative numeric-looking text. Use JSON for exact machine round trips. CSV protection applies to this generated export, not original import source downloads.

> **Warning:** Selected exports can contain private source payloads, journal documents and historical actor identifiers. Keep them private even when CSV formula protection is applied; that protection is not anonymization.

**Common mistakes:** using `reviews` for standalone period reviews; filtering cash by the exported posting ID instead of `eventId`; entering a strategy-version ID as strategy ID; expecting the list's visible columns/search to control this separate export; assuming account/time filters mean the same thing for every kind; omitting Until because a local Through date was inclusive elsewhere.

Related: [journal revisions and period reviews](journaling-and-reviews.md), [strategy versions](strategies.md), [financial concepts](../reference/financial-concepts.md), [canonical export implementation](../../packages/server/src/portability/exports.ts) (`filteredRows`, `csvCell`, `serializeExport`).

### Export analytics with its full context

Choose `analytics` only when you can supply the actual calculation context. The UI provides **Analytics calculation context JSON**; it does not automatically copy the current Dashboard report. Other export-form filters do not override the context.

Before switching from another Records choice to analytics, clear its ordinary date/account/record filters. The current form still submits retained values after hiding those inputs. They do not select the analytics population, but invalid hidden dates/IDs can still fail request validation. If that happens, switch back to a non-analytics choice, clear those fields, then select analytics again.

1. Identify the actual account IDs, reporting currency ID, UTC interval, timezone, source priorities and freshness settings for the intended report.
2. Choose **Records** `analytics` and the desired **Format**.
3. Enter a complete JSON request in **Analytics calculation context JSON**.
4. Select **Export selected records** and inspect the returned context, availability and coverage as well as numerical results.

The following is a fictional shape. Replace both placeholder UUIDs with actual workspace identities and use reviewed source labels/settings. It is not a claim that these identifiers or prices already exist.

```json
{
  "accountIds": ["00000000-0000-4000-8000-000000000001"],
  "reportingCurrencyId": "00000000-0000-4000-8000-000000000002",
  "from": "2026-10-01T00:00:00Z",
  "to": "2026-11-01T00:00:00Z",
  "timezone": "UTC",
  "fxPolicy": {
    "id": "docs-export-policy/1",
    "maxAgeMilliseconds": 86400000,
    "sourcePriority": ["docs:manual"]
  },
  "priceMaxAgeMilliseconds": 86400000,
  "priceSourcePriority": ["docs:manual"],
  "groupBy": ["account", "strategy"]
}
```

| Context field                                    | Definition and validation                                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountIds`                                     | 1–100 unique accessible account UUIDs. Use a coherent supported live/paper scope as required by analytics.                                                                         |
| `reportingCurrencyId`                            | Actual workspace currency UUID, not a code or preference label.                                                                                                                    |
| `from`, `to`                                     | Explicit financial instants, with the end strictly after the opening boundary and ordinary analytics scope limits.                                                                 |
| `timezone`                                       | Optional recognized IANA zone used for calendar dimensions.                                                                                                                        |
| `sourceRevision`, `metadataAsOf`                 | Optional financial revision and metadata instant for the intended snapshot. Omitting these does not freeze an earlier exported result.                                             |
| `fxPolicy`                                       | Policy identifier, nonnegative maximum observation age and ordered unique source labels, as defined by the [accounting contract](../../packages/contracts/src/accounting.ts).      |
| `priceMaxAgeMilliseconds`, `priceSourcePriority` | Nonnegative integer age and a nonempty unique priority list of up to 64 nonblank source labels. Source labels select observations; they do not fetch prices.                       |
| `groupBy`                                        | Optional unique dimensions, at most 14: strategy, strategyVersion, asset, assetClass, broker, account, currency, direction, weekday, hour, timeframe, setup, tag, marketCondition. |
| `suppliedCampaignResultIds`                      | Optional explicit selection of up to 100 reviewed supplied campaign-result component IDs; not automatic acceptance of every supplied value.                                        |

**Expected result:** one report with its actual eligible populations, exclusions, provenance and availability states. If the context lacks eligible price/FX/risk/cost evidence, relevant outputs remain unavailable; the export does not fill them with zero or a live quote. It calls the analytics report service rather than reproducing the entire Dashboard contract, so align scope and compare only equivalent report populations.

**Common mistakes:** pasting Dashboard URL parameters as JSON; using account names instead of IDs; assuming the browser's current report source policies were copied; exporting a different interval and comparing its totals as if identical; treating a supplied result as native accounting.

Related: [analytics and dashboard](analytics-and-dashboard.md), [analytics definitions](../analytics-definitions.md), [financial metrics](../financial-metrics.md), [analytics request contract](../../packages/contracts/src/analytics.ts) (`analyticsReportRequestSchema`).

## Source and verification references

| Subject                                             | Source and retained test coverage                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import controls and file decoding                   | [Import workspace](../../apps/web/src/components/imports/import-workspace.tsx), [file reader](../../apps/web/src/components/imports/import-file.ts), [import UI tests](../../tests/ui/imports.test.tsx), [browser import journey](../../tests/e2e/imports.spec.ts)                                                                                                                                                         |
| Parsers, mappings and normalization                 | [Adapter registry](../../packages/server/src/imports/adapters/registry.ts), [CSV parser](../../packages/server/src/imports/csv.ts), [normalization](../../packages/server/src/imports/normalize.ts), [contracts](../../packages/contracts/src/imports.ts), [unit tests](../../tests/unit/imports.test.ts)                                                                                                                  |
| Financial import review, identity and reversal      | [Service](../../packages/server/src/imports/service.ts), [ledger port](../../packages/server/src/imports/ledger-port.ts), [import integration](../../tests/integration/imports.test.ts), [safety integration](../../tests/integration/imports-safety.test.ts)                                                                                                                                                              |
| Backup, restore and archive bounds                  | [Portability UI](../../apps/web/src/components/portability/portability-workspace.tsx), [contracts](../../packages/contracts/src/portability.ts), [service](../../packages/server/src/portability/service.ts), [integrity checks](../../packages/server/src/portability/integrity.ts), [collection list](../../packages/server/src/portability/tables.ts), [portability tests](../../tests/integration/portability.test.ts) |
| Filtered population, permissions and CSV protection | [Export implementation](../../packages/server/src/portability/exports.ts), [API](../../packages/server/src/portability/api.ts), [portability integration tests](../../tests/integration/portability.test.ts)                                                                                                                                                                                                               |

See [manual index](README.md) for related workflows and [manual verification](verification.md) for the scope of evidence. Historical passing tests do not establish automatic broker compatibility, arbitrary archive compatibility, production capacity or a new browser verification run.
