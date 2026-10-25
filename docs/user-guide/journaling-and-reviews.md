# Trade journals and period reviews

Source-reviewed on **25 October 2026** for Phase 19, Checkpoint 3, against Checkpoint 2 documentation HEAD `3c790c2326bfd38e93698c60e80102a3787d077e` and application source `5132900a03efabaeb307787531546987228220e7`. Test links identify inspected coverage, not a new execution claim; see [manual verification](verification.md) for execution evidence and its limits.

A **campaign**, also called a trade or trading idea, is the decision and review unit. Its **legs** identify account/instrument/direction combinations. Executions and allocations supply actual financial activity; a journal records your plan and observations. A **period review** is a separate daily, session, weekly, monthly or custom record and needs no fictitious trade.

Sign in and select the intended workspace. Owners/editors can create and save journals, publish plans, append risk and edit period reviews/templates. Viewers can inspect records, history, calculated actuals and authorized private downloads. Begin with [first run](../getting-started/first-run.md) if you need catalog records or a paper account. The [glossary](../reference/glossary.md) and [financial concepts](../reference/financial-concepts.md) explain the units used below.

## Find a campaign and read its actuals

Use **Journal** (`/journal`) to review an existing campaign, including one created by the recorder or import. Any workspace role can read; the record must belong to the selected workspace.

1. Select **Review period**: **All history**, **Today**, **This week** or **Custom dates**. For custom dates enter **From date** and **To date**; correct an invalid interval before expecting results.
2. Use **Find a trade**, **Trade status**, **Account** and **Archived** to narrow the list. Select **Load more trades** when available.
3. Select the trade title. Check its classification/status and **Ledger actuals**.
4. Expand each leg's **Fills, fees & lot attribution** and the **Financial timeline** to inspect effective allocated fills, fee currencies and source events.

Journal date filters use allocated fill activity dates in the workspace timezone; an unfilled idea uses creation date. They are distinct from Dashboard's completed-campaign analytics cohort. **This week** also exposes a **Weekly review checklist** and **Open this week's performance** link. That checklist is guidance for individual trade reviews; it does not save a standalone weekly review.

**Ledger actuals** labels its financial source revision. Each leg shows its own account, instrument, direction, quantity unit, actual entry/exit, entered/exited/open quantities, cost basis and realized gross/net P&L. Actual entry/exit are fill-weighted effective allocated prices across the effective fills, including after the position is flat. They differ from the inventory average entry of remaining lots. **Cost basis** is the remaining net basis, including allocated entry/carry costs: after the guided example’s partial exit it is `421.5 USD`, comprising `420 USD` principal and `1.5 USD` remaining entry fees. Different instruments or units do not acquire a fictional campaign-wide average. A missing value appears **Unavailable** with its reason. A source change after closure can display a closure-review warning.

**Fictional example:** open the campaign from the [guided example](guided-example.md), with buys of `4 @ 100` and `2 @ 110`, exits of `2 @ 120` and `4 @ 115`, and a `1 USD` fee on each fill. For the stated complete native-share inputs, gross campaign P&L is `80 USD`, fees total `4 USD`, and fee-net P&L is `76 USD`. R remains unavailable without original committed risk. Inspect the fill rows and currencies instead of treating the manually reported exit as a calculation input.

**Common mistakes:** treating a fill as a completed campaign, using a journal activity filter as proof of Dashboard population membership, interpreting unavailable as zero, or summing incompatible leg prices.

Related: [financial recording](financial-recording.md), [analytics and Dashboard](analytics-and-dashboard.md), [account reports](accounts-and-portfolios.md). Source: [JournalWorkspace](../../apps/web/src/components/journal/journal-workspace.tsx), [JournalFinancial](../../apps/web/src/components/journal/journal-financial.tsx) and [financial journal tests](../../tests/integration/journal-financial.test.ts).

## Create a trade idea and its legs

Use this before recording a plan or when you want an idea without financial activity. An owner/editor needs only a title and classification for a bare idea. Adding legs requires existing active accounts and available instrument versions in this workspace; choosing a strategy requires an available immutable version.

1. Open **Journal** → **New trade idea**. In an empty view, **Start a trade journal** opens the same form.
2. Enter **Trade title** and **Classification**: **Active trading** or **Investing**.
3. Optionally choose **Strategy** and then **Strategy version**. Select the exact version; it is not silently replaced by the latest later.
4. If the account and instrument are known, select **Add instrument leg**. Complete **Leg 1 account**, **Leg 1 instrument**, **Leg 1 direction** and **Leg 1 label**. Repeat or use **Remove leg 1** as needed.
5. Expand **Search and browse all reference records** for catalog searches/paging when a choice is missing from the loaded records.
6. Select **Create trade journal** and wait for the created campaign to open.

Titles and leg labels are trimmed, nonempty and at most 160 characters. Each creation supports up to 20 legs. Every leg requires its account, immutable instrument version and explicit long/short direction. Selecting a strategy without its version leaves creation disabled. You may create an idea with zero legs; prices need an instrument and unit, so the bare idea has no invented actuals. Creation does not post a fill or fund an account.

**Fictional example:** create `Paper pullback preparation`, classify it **Active trading**, select playbook version 1, and add a long leg in `Paper account` for `Fictional share · v1`. Expected result: a planned campaign with a leg and an editable journal, without executions or P&L. Its strategy is recorded with the trade, but no original plan is committed yet.

**Common mistakes:** creating a second journal for an existing campaign, assuming a new leg creates holdings, using a symbol instead of selecting its instrument version, or expecting to add later legs through this creation form. Existing-campaign leg additions are [API-only](#complete-cancel-archive-or-add-legs-to-a-campaign).

Related: [accounts and portfolios](accounts-and-portfolios.md), [strategy assignment](strategies.md#assign-the-exact-version-to-a-trade), [financial recording](financial-recording.md). Evidence: `journalCreateSchema` in the [journal contracts](../../packages/contracts/src/journal.ts), `create` in the [journal service](../../packages/server/src/journal/service.ts), and [journal UI tests](../../tests/ui/journal.test.tsx).

## Write and commit a trade plan

Use a plan to retain your intended decision before trading, or honestly record a later plan. Owners/editors can draft; committing/publishing requires an active, nonarchived campaign that is neither closed nor canceled. Price planning needs its catalog-linked legs; initial risk needs an existing currency.

> **Important:** The first publication permanently establishes the original plan and its risk snapshot. Publishing without initial risk permanently records that omission. A later plan or supplemental risk cannot supply a replacement original R denominator.

1. Open the campaign. In **Plan · manual**, inspect the pinned playbook. For an unclassified trade, choose **Strategy** and **Strategy version** explicitly if desired.
2. Select **Setup** from that version, then enter **Timeframe**, **Thesis** and **Planned market conditions**.
3. For each leg enter any **Planned entry**, **Planned stop**, **Planned quantity**, **Estimated costs** and **Planned targets**. Separate multiple targets with commas.
4. To retain initial risk, check **Record planned initial risk**. Enter **Initial risk amount**, **Initial risk currency**, **Initial risk methodology** and optional **Risk methodology notes**.
5. Attach any planning evidence under **Before** as described [below](#attach-private-before-during-and-after-evidence). Wait for **All journal changes saved**, or use **Save now**.
6. Enter **Plan publication reason**, select **Commit original plan**, read **Commit the original plan?**, and select **Confirm publication**. For a later revision use **Publish plan revision** and the same confirmation.

| Input                          | Validation and meaning                                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy/setup                 | Setup and checklist references must resolve inside the exact selected strategy version. An existing trade pin is authoritative and cannot be reassigned through the journal. Selecting a different uncommitted draft version clears incompatible setup/assessment references. |
| Entry, stop, targets, quantity | Optional positive exact decimal strings. Use the leg's quantity/quote convention; a blank remains unrecorded. Up to 100 targets per planned leg.                                                                                                                              |
| Estimated costs                | Optional nonnegative decimal text. An estimate does not book actual fees.                                                                                                                                                                                                     |
| Initial risk                   | When enabled, amount must be strictly positive, currency must be available, and methodology must be nonempty, at most 160 characters. It is a recorded method/amount, not a guaranteed loss bound.                                                                            |
| Timeframe and narrative        | Timeframe allows 160 characters; thesis, conditions and risk notes allow 20,000 each. The complete journal snapshot must fit 128 KiB.                                                                                                                                         |
| Publication reason             | Required trimmed text, at most 2,000 characters. The journal and trade revisions must still match the server.                                                                                                                                                                 |

Saving a draft alone does not commit a plan. Publication records a complete immutable snapshot, actor, reason, hash and server commitment time. The first publication is original; later publications preserve it. A plan published after effective executions is retrospective. An unclassified trade pinned during publication gets a retrospective strategy-association label even if the plan's separate commitment timing is pre-trade.

**Fictional example:** before any fill, record a planned entry `100`, stop `95`, quantity `10`, a stated risk amount `50 USD` and methodology `Synthetic manual loss estimate`. Commit with reason `Retain paper plan before entry`. Expected result: original plan v1 and its server-timed risk snapshot. Changing the draft stop to `97` and publishing v2 preserves v1's initial risk. These are declared example assumptions, not an independently established risk formula.

Historical R requires a financially completed campaign, current closure eligibility, a genuinely pre-trade original positive risk amount, complete compatible fee-net realized results and required pinned historical FX in the original-risk currency. Open campaigns, missing risk, retrospective commitments, unresolved costs or unsupported calculations keep R unavailable with reasons. A later backdated fill, allocation or correction can reveal that an execution preceded the commitment, making R unavailable without editing the original snapshot.

**Common mistakes:** saving without committing, backdating a narrative to imply a pre-trade decision, trying to replace the trade's strategy pin, treating a planned stop as an executed stop, or adding risk after the first publication to repair historical R.

Related: [strategies and versions](strategies.md), [risk policies and sizing](risk-and-reconciliation.md), [R definition](../analytics-definitions.md#monetary-definitions-and-costs). Evidence: [journal contracts](../../packages/contracts/src/journal.ts), `publishPlan` in the [journal service](../../packages/server/src/journal/service.ts), and [original-risk financial tests](../../tests/integration/journal-financial.test.ts).

## Save drafts and recover from a failed save

Use the save indicator whenever editing a plan or review. Owners/editors can save the current journal; a historical snapshot or viewer is read-only.

1. Edit the fields, then wait through **Unsaved draft · autosave pending** and **Saving journal…** to **All journal changes saved**. Autosave waits approximately 800 ms after an edit and pauses during file uploads.
2. Select **Save now**, or press **Ctrl+S** / **⌘+S**, to save immediately.
3. If validation appears, follow the field errors and correct the values. Incomplete enabled risk fields, invalid decimals or duplicate labels cannot be saved.
4. For **Save failed · your draft is preserved**, use **Retry save**. The client retries the retained command and expected revision before submitting newer edits.
5. For a conflict, select **View latest saved revision**. Copy local notes that you need. Select **Replace draft with latest saved version** only when ready, then confirm **Replace draft**. Reapply intended edits to the reloaded version.

Each accepted save appends a complete revision. Navigation and workspace/trade switching are guarded while changes or uploads remain unsaved. Local unsaved text is not a durable server draft or a promise of recovery after closing the browser. A stale revision cannot overwrite someone else's save. Session/role errors require restoring a valid authorized session; a retry does not grant access.

**Fictional example:** two editors open the same paper journal. One saves new lessons; the other's save conflicts. The second editor's text remains visible until explicitly replaced. Expected result: the saved revision survives, and no silent merge or overwrite occurs.

**Common mistakes:** leaving while autosave still shows pending/error, repeatedly editing after an uncertain result instead of retrying it, or choosing replacement before copying unsaved work.

Related: [immutable history](#inspect-saved-plans-and-review-history), [settings and navigation](settings-and-navigation.md). Evidence: `save`, retry and conflict handling in [JournalEditor](../../apps/web/src/components/journal/journal-editor.tsx) and [journal UI retry/concurrency tests](../../tests/ui/journal.test.tsx).

## Record the trade review

Use this during the campaign and after exit to retain observations, decisions and lessons. Owners/editors can review closed/canceled campaigns as well as active ones; saving a review neither closes a campaign nor changes financial facts.

1. Open **Review & lessons**, or scroll to **Review · manual observations**.
2. Enter **Observed market conditions**, **Mistakes**, **Emotions** and **Custom tags**. Use commas between labels.
3. Select **Confidence** and **Execution quality**, or leave **Not recorded**.
4. Enter **Exit reason**, **Lessons learned**, **Post-trade review** and **Custom notes**.
5. For each leg, optionally enter **Actual stop**, **Manually reported entry**, **Manually reported exit** and **Execution notes**.
6. Under **Rule adherence**, choose an outcome for each checklist item and enter its **Evidence · …**. Save and wait for acknowledgement.

| Field                           | Meaning and bounds                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mistakes, Emotions, Custom tags | Your own unique labels, at most 100 per list and 160 characters per label. No automatic emotional interpretation or vocabulary is assigned.                                    |
| Confidence                      | Integer 1–5: very low, low, moderate, high, very high. Unrecorded stays null.                                                                                                  |
| Execution quality               | `excellent`, `good`, `mixed`, `poor`, or unrecorded.                                                                                                                           |
| Review narratives/evidence      | Up to 20,000 characters each, subject to the complete 128 KiB journal limit. Notes render as text.                                                                             |
| Actual stop/reported prices     | Optional positive exact decimals, explicitly manual observations. They do not replace ledger entry/exit, quantities, fees, cash or P&L.                                        |
| Rule outcomes                   | **Unknown / unassessed**, **Passed · manually assessed**, **Failed · manually assessed**, against checklist IDs in the recorded strategy version. No assessment means unknown. |

**Fictional example:** for the completed paper campaign enter mistake `late exit`, emotion `impatient`, confidence `3 · Moderate`, quality `mixed`, and a post-trade review explaining the exit. Mark `Invalidation level recorded` as manually passed with evidence `Recorded in original plan v1`. Expected result: a saved review revision and unchanged calculated ledger actuals. A standalone summary counts this trade as reviewed when its latest saved **Post-trade review** contains text.

There is no separate **Finalize trade review** action in this journal. The saved **Post-trade review** and append-only revisions retain your finished review; later changes append another revision. Standalone period reviews have the separate finalization workflow [below](#finalize-reopen-and-inspect-a-period-review).

**Common mistakes:** treating unknown as passed, assuming a required checklist item is automatically verified, using a manually reported exit to correct a fill, or believing that a review save confirms financial closure.

Related: [strategy checklists](strategies.md#add-checklist-items-and-named-setups), [financial correction workflows](financial-recording.md), [period summaries](#link-supporting-records-and-read-the-process-summary). Evidence: `journalReviewDefinitionSchema` in the [journal contracts](../../packages/contracts/src/journal.ts), [editor review controls](../../apps/web/src/components/journal/journal-editor.tsx), and [manual/ledger separation tests](../../tests/ui/journal.test.tsx).

## Record supplemental risk

Use this to append a separately timed addition after the original plan exists. Owners/editors need an original commitment and a nonarchived campaign that is not closed/canceled.

1. Open **Record supplemental risk** below the journal.
2. Enter **Supplemental risk amount**, **Supplemental risk currency**, **Supplemental risk methodology**, optional **Supplemental risk notes**, and **Supplemental risk reason**.
3. Select **Record risk addition** and wait for the confirmation. Any pending journal draft is saved first.
4. Open **Plans, reviews & immutable history** → **Supplemental risk history** to inspect the amount, method, reason and time. Use **Load older risk additions** when available.

Amount must be a positive exact decimal; currency must belong to the workspace; methodology is required, at most 160 characters; notes allow 20,000 and reason 2,000. A matching journal revision is required. No original commitment means no supplemental-risk command.

**Fictional example:** append `20 USD`, methodology `Manual added-leg estimate`, reason `Record the separate scale-in assumption`. Expected result: a new dated risk addition and unchanged original committed risk/R denominator. This does not create the leg or its execution.

**Common mistakes:** using an addition as a replacement for absent original risk, expecting it to post cash, or recording it after a campaign is completed through unavailable controls.

Related: [original plan](#write-and-commit-a-trade-plan), [risk and reconciliation](risk-and-reconciliation.md). Evidence: `journalRiskAdditionSchema` in the [contracts](../../packages/contracts/src/journal.ts) and risk history in [JournalWorkspace](../../apps/web/src/components/journal/journal-workspace.tsx).

## Attach private before, during and after evidence

Use evidence to retain synthetic charts or source documents with a journal. Owners/editors can upload and remove draft references; all workspace roles can download authorized saved evidence.

1. Open **Screenshots & evidence**.
2. Choose **Screenshot phase**: **Before**, **During** or **After**.
3. Choose **Upload screenshot or document**, then wait for upload completion and journal save acknowledgement. Use **Retry upload** on an upload error.
4. Follow the filename to download. To omit it from the current draft, select **Remove … from draft** and save.

Files must be nonempty signature-checked PNG, JPEG, WebP or PDF, at most **10 MiB** each, with filenames no longer than 120 characters. Images allow at most 8,192 pixels per side and 16,777,216 pixels total. A journal can reference at most 100 files. **Before** files also become planning-evidence references in the draft plan and are retained when that plan is published.

Phase labels are manually assigned and do not verify capture time. Downloads recheck workspace authorization; these are private files. Removing a reference from the latest draft does not erase saved revisions or original-plan evidence. Referenced files cannot be deleted; permanent removal of an unused upload is an authorized attachment API operation, without a delete-file control in this UI.

**Fictional example:** upload `paper-before.png` under **Before**, commit the plan, then upload `paper-after.pdf` under **After** while reviewing. Expected result: separate phase groups and preserved planning evidence in the original snapshot.

**Common mistakes:** uploading unsupported SVG/HTML, interpreting a **Before** label as proof the file existed before entry, or assuming draft-reference removal deletes historical private files.

Related: [strategy attachments](strategies.md#attach-private-strategy-references), [backup and exports](imports-and-exports.md). Evidence: [JournalAttachments](../../apps/web/src/components/journal/journal-attachments.tsx), [journal attachments service](../../packages/server/src/journal/attachments.ts) and [attachment integration tests](../../tests/integration/strategy-attachments.test.ts).

## Inspect saved plans and review history

Use history to distinguish the original decision from later edits. All workspace roles can inspect immutable history; save a dirty draft before switching to a historical review snapshot.

1. Open **Plans, reviews & immutable history**.
2. Choose **Published plan snapshot** to inspect a plan's version, original/later label, reason, recorded time/actor, thesis, initial risk, conditions, timeframe, per-leg prices/quantity and original planning download links.
3. Choose **Journal review snapshot** to show a **Historical journal snapshot**. Its plan/review fields are read-only and use the strategy/setup/checklist references recorded in that revision.
4. Use **Load older plans** or **Load older reviews** for additional pages. Select **Current editable journal** to return to the latest editor.
5. Expand **Supplemental risk history** for additions, separately from original risk.

Historical snapshots are inspection paths; they are not restore/overwrite commands. The saved draft may have recorded a different selection before a later immutable trade pin, so its own exact historical labels matter. If history fails to load, select **Retry history**; do not interpret the error as absence of earlier versions.

**Fictional example:** original plan v1 records stop `95`; v2 records `97`. Selecting v1 still shows `95` and its original risk. Selecting an older review shows its earlier manual assessment, without borrowing a current rule label.

**Common mistakes:** treating the current draft as the original plan, assuming a historical snapshot becomes editable, or overlooking paginated history.

Related: [strategy history](strategies.md#inspect-history-compare-definitions-and-open-performance), [financial concepts](../reference/financial-concepts.md). Evidence: history controls in [JournalWorkspace](../../apps/web/src/components/journal/journal-workspace.tsx), [journal revision contracts](../../packages/contracts/src/journal.ts), and historical-reference cases in [journal UI tests](../../tests/ui/journal.test.tsx).

## Complete, cancel, archive or add legs to a campaign

A flat account position does not automatically complete its campaign. Use explicit campaign closure only after all assigned exposure and obligations have been resolved. At this application baseline, **Journal has no close, cancel, archive, reopen or add-existing-leg control**. The supported close/cancel/archive/leg commands below are API-only; deliberate campaign reopening is unavailable. An authorized operator/integrator must use the actual API rather than look for a nonexistent button.

For API commands, prerequisites are a current editor/owner session, the selected workspace's UUIDs and current trade revision, and verified source facts. Read the campaign at `GET /api/v1/workspaces/{workspaceId}/financial/trades/{tradeId}` and its legs at the same path plus `/legs`. Retrieve session CSRF proof from the `X-CSRF-Token` response header of `GET /api/auth/session`. Send the session cookie, configured application `Origin`, `Content-Type: application/json`, `X-CSRF-Token` and a fresh UUIDv4 `Idempotency-Key` on the mutation. The same accepted request can be retried with the same key/body; never reuse that key for changed content. Viewer requests cannot mutate records.

| Action and when to use it           | POST path after `/api/v1/workspaces/{workspaceId}/financial` | Required body fields and constraints                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a later leg before completion   | `/trade-legs`                                                | `tradeId`, current `expectedRevision`, `accountId`, immutable `instrumentVersionId`, `direction` (`long`/`short`), nonempty `label`. References must be available in this workspace. Closed, canceled or archived campaigns reject new legs.                                                   |
| Confirm a financially flat campaign | `/trades/{tradeId}/closures`                                 | Current `expectedRevision`, nonempty `reason`, explicit `obligationEvidence`. HTTP reason/evidence each allow at most 160 trimmed characters. There must be effective assigned activity, exactly zero remaining assigned quantity on every leg and no unresolved actual settlement obligation. |
| Cancel an unused idea               | `/trades/{tradeId}/cancellations`                            | Current `expectedRevision` and nonempty `reason` (at most 160 characters). Only a nonarchived planned campaign without effective assigned activity can be canceled.                                                                                                                            |
| Archive a campaign identity         | `/trades/{tradeId}/archive`                                  | Current `expectedRevision` and nonempty `reason` (at most 160 characters). This removes ordinary selection; it preserves historical facts and does not reverse fills or cash.                                                                                                                  |

**Fictional closure workflow:** after the guided example's four effective fills, first inspect the assigned quantities and source settlement records. All legs must show exact zero remaining assigned exposure; settle any genuine unsettled cash obligations through the financial workflow first. Fetch the current trade revision, then submit the closure request with the corresponding revision. For an example whose current revision is `7`, a request body could be:

```json
{
  "expectedRevision": 7,
  "reason": "Complete the synthetic paper campaign",
  "obligationEvidence": "Reviewed all assigned fills; no open units or outstanding settlement obligations."
}
```

This is a request-body illustration, not an executed command or proof that another campaign has no obligations. Replace the revision with the actual current revision and describe actual reviewed evidence. A successful response reports `status: closed`, `definitionVersion: campaign-closure/1`, closure identity, confirmed time, updated trade revision and financial source revision. Reload Journal to inspect the new status. Closure changes classification; it does not create the exits or settle a cash obligation. With the complete example inputs, completion enables the applicable closed-outcome population; missing original risk still keeps R unavailable.

Closure errors are explicit: `CAMPAIGN_HAS_NO_ACTIVITY` means cancel an unused planned idea; `CAMPAIGN_HAS_OPEN_EXPOSURE` means assigned quantities remain; `CAMPAIGN_HAS_UNSETTLED_OBLIGATIONS` means settlement remains unresolved. A stale revision requires re-reading and reviewing current data before creating a changed command. Later corrections/allocations/obligations may retain historical closed status but set `closureReviewRequired`, excluding an unquestioned completed result. This baseline has no delivered reopen or repeat-closure workflow to clear such a case; retain the warning and resolve the source issue with an authorized maintainer. New activity after closure requires a new campaign.

**Common mistakes:** expecting the last sale or review save to close the campaign, using rounded displayed zero instead of exact assigned quantity, writing obligation evidence instead of recording real settlement, repeatedly posting a new closure after a lost response, or archiving as a financial correction.

Related: [financial recording](financial-recording.md), [accounting and reconciliation](risk-and-reconciliation.md), [guided example](guided-example.md). Authority: `tradeLegCreateSchema`, `tradeClosureCreateSchema` and `archiveFinancialSchema` in the [financial contracts](../../packages/contracts/src/financial.ts); route dispatch in the [financial API](../../packages/server/src/financial/api.ts); `addTradeLeg`, `cancelTrade`, `confirmTradeClosure`, `readTrade` and `archiveCatalog` in the [catalog service](../../packages/server/src/financial/catalog.ts); [campaign lifecycle design](../domain-model.md#state-models-and-transitions).

## Create a standalone period review

Use **Period reviews** (`/reviews`) for session preparation, daily reflection or a broader review without creating financial activity. Owners/editors can save; viewers can inspect existing records. No campaign or template is required.

1. Open **Period reviews** → **Start a standalone review**.
2. Choose **Review kind** first: `daily`, `session-preparation`, `session-review`, `weekly`, `monthly` or `custom`.
3. Enter **Review title**. Check/edit **Period starts at**, **Period ends at** and **Review timezone** after selecting the kind.
4. Optionally choose **Reusable template version**, then complete its answers. Changing the template selection clears the current template answers.
5. Enter **Notes and session preparation/review**, **Goals**, **Recurring mistakes**, **Emotions** and **Improvement actions**. Use one entry per line in the lists. Mark **Completed: …** for a finished improvement action.
6. Select **Save draft now** or wait for the valid draft's autosave after approximately one second. Confirm `Saved version … · draft` and retain **Permanent period review** if needed.

| Fields                                           | Validation and behavior                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Review title                                     | Required trimmed text, 1–160 characters.                                                                                                                                                                                                                           |
| Period starts/ends                               | ISO instants with explicit `Z` or offset, at most six fractional-second digits. Start is included; end is excluded and must be later than start.                                                                                                                   |
| Review timezone                                  | Valid IANA timezone such as `UTC` or `Europe/London`. Saved boundaries are explicit instants and do not move when display preferences change.                                                                                                                      |
| Kind presets                                     | Daily/session presets start with the current local day; weekly starts Monday and ends the following Monday; monthly uses calendar-month boundaries. Selecting a kind resets the proposed boundaries, including `custom`; enter custom instants after selecting it. |
| Notes                                            | At most 20,000 characters.                                                                                                                                                                                                                                         |
| Goals, recurring mistakes, emotions, action text | Up to 100 entries per collection, each nonempty after trimming and at most 2,000 characters. Emotions remain your labels. Actions have stable IDs and open/done state.                                                                                             |
| Overall snapshot                                 | At most 128 KiB; at most 50 template answers and 100 links of each source type.                                                                                                                                                                                    |

An incomplete draft remains local and cannot be assumed saved. Navigation to another review/template/workspace is guarded while dirty. To discard, select **Discard local changes and reload saved review**; this replaces local edits, or discards a never-saved draft. After a known save failure, correct the error and select **Save draft now**. If the previous outcome is unknown, editing pauses: use **Retry retained review save** to resolve the exact retained command before continuing. A concurrency conflict preserves local text; copy it before explicitly discarding/reloading the latest saved version.

**Fictional example:** choose `weekly`, title `Paper process review`, timezone `UTC`, start `2026-10-19T00:00:00Z`, end `2026-10-26T00:00:00Z`. Add goals `Review each planned invalidation` and `Record costs before completion` on separate lines. Expected result: a standalone draft with that exact interval and two goals, without a ledger event or assumed links to every trade in the week.

**Common mistakes:** using comma-separated period-review lists instead of lines, entering an end before start, assuming timezone changes shift already saved instants, selecting a preset after entering custom dates, or leaving an invalid local draft expecting persistence.

Related: [settings and timezones](settings-and-navigation.md), [linked sources](#link-supporting-records-and-read-the-process-summary), [period-review reference](../period-reviews.md). Evidence: `blank`, `period`, `save` and controls in [ReviewWorkspace](../../apps/web/src/components/reviews/review-workspace.tsx); [period-review contracts](../../packages/contracts/src/period-reviews.ts) and [UI tests](../../tests/ui/period-reviews.test.tsx).

## Create and version reusable typed templates

Use a template for repeatable review questions. Owners/editors can publish templates in the selected workspace. A template version defines questions; each review pins the exact version so future changes cannot reinterpret its answers.

1. Open **Period reviews** → **Reusable review templates** → **Start a new template**.
2. Enter **Template name**, optional **Template instructions**, and **Template status** (**Active** for new selection).
3. Select **Add configurable review field**. Enter **Field 1 label**, choose **Field 1 type** (**Text**, **Yes / No**, **Exact decimal**), add **Field 1 help**, and optionally check **Required before finalization**. Repeat or **Remove field 1**.
4. Enter **Template change reason** and select **Publish review template**. Confirm the published name/version notice.
5. To revise it, select **Edit template as new version**, change its definition, enter a new reason and publish. To prevent new selection, publish a version with **Archived for new selection**; existing pinned reviews remain readable.

Name/field labels are required, at most 160 characters. Instructions allow 20,000; help and reason allow 2,000 each. Up to 50 fields are permitted and the template write must fit 128 KiB. Field identities remain explicit within each immutable definition. Templates require explicit publication and do not autosave. Use **Discard unpublished template changes** before leaving an unwanted local edit. An unknown publication result pauses editing; select **Retry retained template publication** instead of starting a duplicate template. A stale expected version requires loading the latest template before reapplying changes.

**Fictional example:** publish `Paper discipline review` v1 with required **Yes / No** question `Did I record each invalidation?`, optional **Text** `What will I change?`, and **Exact decimal** `Minutes spent reviewing`. In a review, select that template v1 and answer `No`, `Record the stop before entry`, and `12.5`. Expected result: typed answers pinned to v1. A later v2 with a renamed question leaves the earlier question/answer context intact. Explicit `No` satisfies the required yes/no answer; **Unanswered** does not. Decimal answers use exact decimal text, not a currency sign or exponent.

**Common mistakes:** assuming template edits change existing answers, confusing optional unanswered with false, expecting unpublished questions to be reusable, or assuming an archived template can be selected for a new review.

Related: [finalization](#finalize-reopen-and-inspect-a-period-review), [strategy parameters](strategies.md#record-typed-parameters). Evidence: `validatePeriodReviewAnswers` in the [review contracts](../../packages/contracts/src/period-reviews.ts), `saveTemplate`/`saveEntry` in the [review service](../../packages/server/src/reviews/service.ts), and [template integration tests](../../tests/integration/period-reviews.test.ts).

## Finalize, reopen and inspect a period review

Use finalization to retain a finished period-review snapshot, and reopen it when another draft is needed. Owners/editors can finalize/reopen; viewers can inspect saved versions. The title, interval, timezone and any required template answers must be valid.

1. Open the saved draft. Review its content, source links and template answers.
2. Select **Finalize review**. Correct required-answer or type errors, then retry. Wait for `Saved version … · finalized` and read-only content.
3. To continue later, select **Reopen as a new draft version**. Wait for a saved draft acknowledgement, or select **Save draft now**. The finalized snapshot remains immutable.
4. Expand **Immutable review history**, then **Read this saved snapshot**. Use **More saved versions** for older pages. The UI history preview shows version/status, time/reason, notes, goals and pinned template name/version.
5. Use **Permanent period review** to reopen the record. Use **Search period review titles**, **Filter review kind** and **More period reviews** to find another record.

Every accepted draft save/finalization appends a complete version. The client records a draft-save or explicit-finalization reason; there is no separate per-save reason field in the review form. The version API retains actor, full definition and pinned template; the history preview does not show every historical answer/action/link or actor. The API also supports a status list filter; the delivered UI offers title and kind filters, with draft/final status shown on each entry. Reopening this review is separate from unavailable financial campaign reopening.

**Fictional example:** finalize the weekly paper review with the required answer `No`, then reopen it and add an action. Expected result: the original finalized version remains in history and the new saved version is a draft. No cash, risk denominator, inventory or analytics result is changed by either save.

**Common mistakes:** expecting **Finalize review** to close linked campaigns, treating reopened content as an edit of the old finalized snapshot, or assuming the compact history preview exposes the complete historical API response.

Related: [trade review semantics](#record-the-trade-review), [period-review reference](../period-reviews.md), [backup and exports](imports-and-exports.md). Evidence: [review UI](../../apps/web/src/components/reviews/review-workspace.tsx), `periodReviewVersionSchema` in the [contracts](../../packages/contracts/src/period-reviews.ts), and final/draft history cases in [integration tests](../../tests/integration/period-reviews.test.ts).

## Link supporting records and read the process summary

Use optional source links to state which records you considered. Owners/editors need a draft review; viewers can read its saved summary. A period review can remain standalone with zero links.

1. In the draft, expand **Link supporting trades and strategy versions**.
2. Enter **Search supporting trade**, choose **Supporting trade**, then select **Link selected trade**. Repeat for other trades, using **More source records** as needed.
3. Use **Search supporting strategy version**, **Supporting strategy version** and **Link selected strategy version** for exact immutable playbook versions.
4. To remove a draft link, select **Unlink …**, then save. Inspect the saved **Recorded process summary** below the editor.

Each source must belong to the same workspace; duplicate links are blocked. At most 100 trade and 100 strategy-version links are permitted per review. Selecting a period never automatically links its trades, and a supporting strategy link does not reclassify any campaign.

The deterministic summary reports explicitly linked trade count, how many have nonblank latest saved **Post-trade review**, review goal count, open improvement-action count and mistake labels from linked journals. Each mistake label contributes at most once per linked trade. It displays financial source revision and generation time. The API additionally retains current status counts, missing-review trade IDs and each linked trade's current status/latest journal revision reference. Summary generation uses a coherent source snapshot on request; it is not a permanent financial claim frozen inside the finalized review and may change when linked journals/statuses change. Reload the saved record to request current data; do not assume an already open summary refreshes immediately after an edit elsewhere.

**Fictional example:** link two paper campaigns. Only one has saved post-trade review text; both have mistake label `late exit`. With two goals and one open action, the expected summary is two linked trades, one reviewed trade, two goals, one open action, and `late exit: 2 linked trades`. The review's own **Recurring mistakes** list is separate from these counted journal labels.

**Common mistakes:** assuming every trade in the interval was reviewed, interpreting repeated labels as a cause of losses, treating the summary as win rate/P&L, or expecting linked strategy versions to supply performance comparisons. AI-generated review is unavailable; these counts require no provider account or key.

Related: [analytics definitions](../analytics-definitions.md), [Dashboard](analytics-and-dashboard.md), [period reviews](../period-reviews.md). Evidence: `summarizePeriodReview` in the [review domain](../../packages/domain/src/period-reviews.ts), `summary` in the [review service](../../packages/server/src/reviews/service.ts), and independent linked-source examples in [period-review integration tests](../../tests/integration/period-reviews.test.ts). Return to the [manual index](README.md).
