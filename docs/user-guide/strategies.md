# Strategies, setups and immutable versions

Source-reviewed on **25 October 2026** for Phase 19, Checkpoint 3, against Checkpoint 2 documentation HEAD `3c790c2326bfd38e93698c60e80102a3787d077e` and application source `5132900a03efabaeb307787531546987228220e7`. This guide describes the delivered UI and its limits. The cited tests are source evidence; execution claims and retained Phase 18 evidence belong in [manual verification](verification.md).

A strategy is a workspace playbook. A setup is a named pattern inside one strategy version. Saving the strategy publishes a complete immutable version; choosing a version for a trade preserves those historical rules. Strategy text and parameters describe your process. Record checklist outcomes manually in the journal; the playbook does not automatically evaluate market conditions or enforce a numeric risk policy.

Sign in and select the intended workspace first. Owners and editors can create, edit, archive and assign strategies. Viewers can inspect definitions, history, linked trades and private files. No account, broker or execution is required to create a playbook. Catalog records are required only when you explicitly reference instruments or link a trade. See [first run](../getting-started/first-run.md), [accounts and portfolios](accounts-and-portfolios.md), and the [glossary](../reference/glossary.md).

## Create a playbook

Use this before planning a trade or when recording an existing decision process. Open **Strategies** (`/strategies`) in the workspace navigation.

1. Select **New strategy**.
2. Enter **Name**. Select **Status** and **Direction** under **Identity & eligibility**.
3. Enter any **Asset classes**, **Markets** and **Timeframes**, separated by commas. Leave unconfigured areas empty.
4. Complete **Core trading rules**. Expand the optional sections for additional context, detailed rules, checklists, setups, parameters or files.
5. In **Version record**, check **Effective date & time** and **Reason for this version**. The initial reason defaults to `Initial version`.
6. Select **Create strategy** and wait for the saved-version message. Reopen it from the list to inspect version 1.

| Fields or section                  | Meaning and input                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                               | Required, trimmed name of 1–160 characters.                                                                                                                                                                                                                   |
| Status                             | `Draft`, `Active`, `Paused` or `Retired`; a recorded playbook status, distinct from archiving.                                                                                                                                                                |
| Direction                          | `Long and short`, `Long` or `Short`.                                                                                                                                                                                                                          |
| Asset classes, Markets, Timeframes | User-defined labels; comma-separated, unique entries. They describe eligibility rather than validate every future execution.                                                                                                                                  |
| Core trading rules                 | **Description**, **Setup conditions**, **Entry rules**, **Stop-loss methodology**, **Risk rules**.                                                                                                                                                            |
| Additional eligibility & context   | **Sessions**, **Indicators**, **Tags**, **Trading style**, **Eligible instrument IDs**. The last field accepts existing workspace instrument UUIDs, separated by commas; it does not accept a symbol in place of an ID.                                       |
| Detailed rules & reference notes   | **Hypothesis / edge**, **Market regime filters**, **Confirmation rules**, **Invalidation rules**, **Take-profit methodology**, **Position sizing rules**, **Scaling rules**, **Trailing / management rules**, **Exit rules**, **Review schedule**, **Notes**. |
| Effective date & time              | Entered in the browser's local timezone and stored as a UTC instant. Strategy history displays it in the workspace timezone. It is distinct from the server's recorded time.                                                                                  |
| Reason for this version            | Required, trimmed text, at most 2,000 characters.                                                                                                                                                                                                             |

Narratives allow up to 20,000 characters each. List labels allow 160 characters each and at most 100 entries per list; duplicates are rejected. The complete definition must fit 192 KiB of UTF-8 JSON. Instrument references must belong to this workspace and be available for new selection. An empty rule remains unconfigured.

**Fictional example:** create `Paper opening-range pullback`, choose **Active** and **Long**, enter `share` for **Asset classes**, `15 minute` for **Timeframes**, and `Wait for a pullback after the opening range` for **Setup conditions**. Record `Exit below the planned invalidation level` as the stop methodology. The expected result is a saved version 1 with exactly those definitions, without an execution, position or inferred risk amount.

**Common mistakes:** treating a strategy status as an account permission, entering duplicate comma-separated tags, using an instrument symbol in the UUID field, or assuming an effective date proves the strategy was chosen before a fill. Trade plan publication records that separate commitment.

Related: [journal planning](journaling-and-reviews.md#write-and-commit-a-trade-plan), [risk policies](risk-and-reconciliation.md), [strategy reference](../strategies.md). Field and validation evidence: [StrategyEditor](../../apps/web/src/components/strategies/strategy-editor.tsx) and `strategyDefinitionSchema` in the [strategy contracts](../../packages/contracts/src/strategies.ts).

## Add checklist items and named setups

Use a checklist for discrete manual review questions and a setup for a particular pattern within the playbook. Owners/editors need an open new-strategy form or **Edit current version** on a nonarchived strategy.

1. Expand **Required checklist** and select **Add checklist item**.
2. Enter **Checklist item 1**, then keep or clear **Required item 1**. Repeat for each question.
3. Expand **Named setups** and select **Add named setup**.
4. Enter **Setup 1 name**, **Setup 1 description** and **Setup 1 conditions**. Check the **Setup 1: …** entries that belong to this setup.
5. Save the strategy using **Create strategy** or **Save new version**, including the effective time and version reason.

Checklist labels and setup names are required when their rows exist and allow 160 characters. Setup description/conditions allow 20,000 characters each. Each version supports up to 100 checklist items and 100 setups. The editor assigns stable item identities. A setup may reference only checklist items in that same version. **Remove checklist item 1** also removes that item's setup references in the current edit; prior published versions retain their own definitions. **Remove setup 1** removes the current edit's setup.

**Fictional example:** add required `Invalidation level recorded` and optional `Reference image attached`; create setup `First orderly pullback` and select the first checklist item. The saved version displays both items with required/optional labels and the named setup with its selected question. In the journal, select the setup and manually record `Passed`, `Failed` or `Unknown` for the corresponding checklist rules.

**Common mistakes:** using a narrative paragraph where separate review questions are needed, expecting a required checklist flag to block financial recording, or assuming that a checklist change updates old trades. Missing assessments remain unknown; required playbook flags do not create an automatic pass/fail engine.

Related: [manual rule adherence](journaling-and-reviews.md#record-the-trade-review), [version history](#inspect-history-compare-definitions-and-open-performance). Evidence: `strategyChecklistItemSchema`, `strategySetupSchema` and [strategy UI tests](../../tests/ui/strategies.test.tsx), including stable checklist/setup identities.

## Record typed parameters

Use parameters when a rule needs an explicit reusable value, such as a decimal threshold or a declared choice. Owners/editors use **Typed parameters** in the strategy editor.

1. Expand **Typed parameters** and select **Add parameter**.
2. Enter **Parameter 1 name** and optional **Parameter 1 description**.
3. Choose **Parameter 1 type** and complete the inputs below.
4. Save the complete strategy version. To change a type, review the new value: changing type resets the type-specific configuration.

| Type shown in UI | Fields and validation                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decimal number   | Exact **value**, optional **unit**, **minimum**, **maximum**. Use decimal text such as `0.75`, without currency signs, thousands separators or exponent notation. Minimum must not exceed maximum; the value must lie inside any declared bounds. |
| Boolean          | **Parameter 1 enabled** checkbox records true/false.                                                                                                                                                                                              |
| Text             | **Parameter 1 value**, at most 2,000 characters.                                                                                                                                                                                                  |
| Choice           | **Parameter 1 choices**, separated by commas, and **Parameter 1 value**, which must exactly match a declared option. Choices must be nonempty and unique.                                                                                         |

Names are required, at most 160 characters; descriptions allow 20,000 characters. A version can contain at most 100 parameters. Decimal validation preserves exact source text and checks the financial decimal bounds without floating-point rounding. A parameter's unit is descriptive configuration; it does not post money or size a position.

**Fictional example:** create decimal parameter `Maximum planned risk`, value `0.75`, unit `%`, minimum `0`, maximum `1`; create choice `Entry confirmation`, choices `close, retest`, value `retest`. The saved snapshot displays the recorded values and bounds. Entering `1.25` in the first value produces a validation error rather than a silently changed bound.

**Common mistakes:** entering `0.75%` as a decimal value, choosing a value absent from the choices, or expecting a parameter to enforce a risk budget. Configure delivered risk policies separately.

Related: [risk and reconciliation](risk-and-reconciliation.md), [financial concepts](../reference/financial-concepts.md). Evidence: `strategyParameterSchema` and its exact decimal comparison in the [contracts](../../packages/contracts/src/strategies.ts); precision and bounds cases in [strategy service tests](../../tests/integration/strategy-services.test.ts).

## Publish a changed version

Use a new version whenever the name, rules, setup, parameters, status, notes, tags or file references change. An owner/editor needs a nonarchived strategy; a historical version can be inspected, but edits always begin from the current definition.

1. Open the strategy and select **Edit current version**.
2. Make the intended changes. Check the displayed next version number.
3. Enter **Effective date & time** and a specific **Reason for this version**.
4. Select **Save new version**. Wait for `Strategy saved as version …` and inspect the result.
5. Use **View strategy version** to verify that the previous definition remains available.

Every successful save publishes the complete definition with effective time, server recorded time, author, reason and definition hash. The current-version pointer changes; earlier definitions and existing trade pins stay immutable. The UI shows effective/recorded times and reason. Author/hash are retained in the version API response, rather than shown as dedicated detail fields.

The form validates the same bounds as creation. A concurrent edit is rejected instead of overwriting another saved version. Your text stays in the form. Copy anything needed, select **Discard edits and reload latest**, and confirm **Discard and reload** before reapplying changes to the latest definition. **Cancel editing** on a dirty form requires **Discard changes**; navigating away also guards unsaved rules. Strategy forms require an explicit save and do not autosave.

**Fictional example:** change the stop methodology to `Exit below the pullback low`, reason `Clarify the invalidation level`. Expected result: version 2 is current; a campaign already assigned to version 1 keeps version 1's earlier stop rule.

**Common mistakes:** treating backdated effective time as a way to rewrite earlier decisions, expecting draft form edits to be durable before saving, or repeatedly submitting a stale edit after a conflict.

Related: [trade plans and original risk](journaling-and-reviews.md#write-and-commit-a-trade-plan), [history comparison](#inspect-history-compare-definitions-and-open-performance). Evidence: `update` in the [strategy service](../../packages/server/src/strategies/service.ts), immutable versions in the [strategy schema](../../packages/database/src/strategy-schema.ts), and concurrent publication cases in [service tests](../../tests/integration/strategy-services.test.ts).

## Attach private strategy references

Use private images or PDFs to preserve the reference material for a version. Owners/editors can attach files while creating/editing; workspace viewers can download saved references.

1. Expand **Screenshots & attachments** in the editor.
2. Choose **Upload screenshot or reference document** and select a file.
3. Wait for upload completion. Inspect the linked filename.
4. Save the strategy version so its definition references the upload.
5. To omit a reference from a later definition, select **Remove … from this version**, then save the new version.

Accepted formats are signature-checked PNG, JPEG, WebP and PDF, with a nonempty file up to **10 MiB**, a filename of at most **120 characters**, and at most 100 references per definition. Images must be at most 8,192 pixels per side and 16,777,216 pixels total. Download links recheck workspace authorization; PDF reference documents download as attachments.

**Fictional example:** upload `paper-pullback-reference.png` with synthetic chart data, then create version 1. Its filename appears in the saved reference list. Removing it from version 2 leaves version 1's reference readable.

**Common mistakes:** uploading SVG/HTML, leaving before saving the definition, or expecting removal from a new version to erase historical evidence. Published references protect the file from deletion. The UI removes references; permanent removal of an unused upload is an authorized attachment API operation, described in the [strategy reference](../strategies.md#private-attachments).

Related: [journal evidence](journaling-and-reviews.md#attach-private-before-during-and-after-evidence), [backup and export](imports-and-exports.md). Evidence: [StrategyAttachments](../../apps/web/src/components/strategies/strategy-attachments.tsx) and [attachment service](../../packages/server/src/strategies/attachments.ts).

## Assign the exact version to a trade

Use an explicit version to preserve which rules classified the campaign. Owners/editors need a nonarchived strategy, a same-workspace trade and no existing strategy pin. Assignments cannot be changed or removed by these commands.

| When                                          | Exact UI steps                                                                                                                                                                                                                                                                                             | Recorded meaning                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Creating an idea                              | Open **Journal** → **New trade idea**; select **Strategy** and **Strategy version**, then **Create trade journal**.                                                                                                                                                                                        | The exact version is recorded with the trade. This does not commit a pre-trade plan or original risk.                                        |
| Recording a fill with a new campaign          | In **Record trade**, select the strategy and explicit version for the new journal, review and confirm the financial record.                                                                                                                                                                                | Classification accompanies creation; financial entry still requires its own source facts. See [financial recording](financial-recording.md). |
| Publishing a plan for an unclassified trade   | In **Journal**, select **Strategy**, **Strategy version**, optional **Setup**, save the plan and commit/publish it.                                                                                                                                                                                        | Publishing pins the selected version once and labels the strategy association retrospective. Commitment timing is assessed separately.       |
| Classifying an existing trade from Strategies | Open the strategy; choose **View strategy version**. Under **Assign an existing unclassified trade retrospectively**, choose **Unclassified trade**, enter **Reason for retrospective assignment**, select **Assign to version …**, then select **Confirm assignment** in **Confirm strategy assignment**. | A later classification, permanently pinned to that version; it does not claim the trade followed those rules in advance.                     |

For retrospective assignment, use the catalog search/paging controls below the trade field when needed. The trade and selected version must remain available; a changed trade revision or an already assigned/archived trade rejects the request. The reason is required and allows 2,000 characters. After success, inspect **Trades linked to version …** and its **Retrospective assignment** label, then follow the trade title to its journal.

**Fictional example:** an unclassified `Paper pullback 01` already has fills. Select strategy version 1 and reason `Classify the historical example using its recorded playbook`, then confirm. Expected result: the journal shows the pin to version 1 and the retrospective label. Publishing version 2 never reassigns this campaign.

**Common mistakes:** selecting a strategy without an explicit version, assigning a newer rule set merely because it is current, or mistaking `Recorded with trade` for proof of original-risk R eligibility.

Related: [journal plans](journaling-and-reviews.md#write-and-commit-a-trade-plan), [analytics populations](analytics-and-dashboard.md), [original-risk definitions](../analytics-definitions.md#monetary-definitions-and-costs). Evidence: [StrategyWorkspace](../../apps/web/src/components/strategies/strategy-workspace.tsx), `insertTradeStrategyLink` in the [strategy repository](../../packages/server/src/strategies/repository.ts), and [journal services](../../packages/server/src/journal/service.ts).

## Inspect history, compare definitions and open performance

Use this when reviewing rule changes or the campaigns that used one historical version. Any workspace role can read the strategy; meaningful financial performance also requires eligible campaign data.

1. Open **Strategies**. Use **Search strategies**, **Filter by status** and **Include archived** as needed; select **Load more strategies** if another page exists.
2. Select the strategy and choose **View strategy version**. Select **Load older versions** when the required version is outside the loaded history.
3. Read its version number, current/historical/archived label, effective time, recorded time, reason and rules.
4. Under **Compare version rules**, choose **Compare this version with**. Read the changed-fields table. It compares definitions; for the full checklist, setup description, bounds or file context, inspect each version's snapshot.
5. Under **Trades linked to version …**, follow a trade title to the journal. Use **Load more linked trades** before concluding there are no matches; the empty message refers to loaded pages.
6. Select **Review performance for version …** to open Dashboard scoped to the selected historical version, or **Compare all versions** to open Dashboard scoped to the strategy identity. Apply the delivered Dashboard filters and inspect its coverage there.

Selecting a historical version updates the URL, so retain that URL when sharing a review with another authorized member. The comparison chooser contains loaded versions; load older history first when a version is missing. The links do not introduce a separate side-by-side metric comparison screen. Report dates, accounts, currency, completed-outcome eligibility and missing inputs still determine what Dashboard can display.

**Fictional example:** compare version 1 and version 2 after changing the stop methodology. The changed-field table shows the two texts. **Review performance for version 1** opens that exact version's campaign scope; an empty population produces an empty/unavailable result rather than fabricated statistics.

**Common mistakes:** comparing different date/account populations as though only the rules changed, treating missing R as zero, assuming the comparison table displays every nested definition detail, or overlooking unloaded history/trades.

Related: [analytics and Dashboard](analytics-and-dashboard.md), [campaign definitions](../analytics-definitions.md), [history tests](../../tests/ui/strategies.test.tsx). UI evidence: `definitionText`, version selectors and performance links in [StrategyWorkspace](../../apps/web/src/components/strategies/strategy-workspace.tsx).

## Archive a strategy

Use archiving when the playbook should leave the default list and receive no new versions or trade assignments. An owner/editor needs its current nonarchived identity. Setting **Retired** remains an ordinary version status; use this separate archive action for the lifecycle restriction.

1. Open the strategy and select **Archive strategy**.
2. Enter **Reason for archiving**.
3. Select **Confirm archive**. Read **Archive this strategy?**, then select **Archive strategy** in the confirmation dialog.
4. Turn on **Include archived** to find it again. Inspect the archived date/reason and historical definitions.

The reason must be nonempty after trimming and at most 2,000 characters. A stale revision or an already archived identity rejects the action. Archiving removes the strategy from the default list, preserves immutable versions and existing trade references, and blocks new edits/assignments. This UI has no unarchive or historical-version delete action.

**Fictional example:** archive `Paper opening-range pullback` with `Example review completed`. Expected result: it leaves the default list, returns with **Include archived**, and version 1 campaigns still show their pinned rules.

**Common mistakes:** archiving to erase a poor result, expecting **Retired** alone to archive, or assuming old linked campaigns become unclassified.

Related: [journal history](journaling-and-reviews.md#inspect-saved-plans-and-review-history), [backup and exports](imports-and-exports.md), [strategy lifecycle source](../../packages/server/src/strategies/service.ts). Return to the [manual index](README.md).
