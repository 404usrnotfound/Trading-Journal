# First run with a paper account

Reviewed on 25 October 2026 against documentation baseline `d7e5637f5c1619f8f7acc2f73f72adba41a43212` and application source `5132900a03efabaeb307787531546987228220e7`. This walkthrough covers initial access and one synthetic financial record. It is not the full user manual.

Complete [installation](installation.md) and [configuration](configuration.md) first. Use the versions and platform boundaries in [system requirements](system-requirements.md). Execution evidence and its limits belong in [verification](verification.md); source inspection alone is not a passing browser run.

> **Warning:** The amounts and identities below are invented. Use a fresh local workspace or a dedicated paper account. Confirm the workspace and account before posting; these actions persist financial records.

## Sign in and check the empty workspace

Open the configured local application origin, normally `http://localhost:3000`, and enter the owner email and password created during installation in **Email address** and **Password**. Select **Sign in**. Public registration is unavailable; the provisioning command creates the owner and **Personal workspace**. Reusing provisioning does not silently replace existing credentials.

On **Overview**, confirm the workspace name. If more than one workspace exists, use **Workspace** to select the intended one. Application links retain that selection. A fresh workspace contains no accounts, instruments, funding, fills or calculated demonstration performance.

As the owner, set **Workspace preferences**:

| Field              | Value for this walkthrough |
| ------------------ | -------------------------- |
| Timezone           | `UTC`                      |
| Reporting currency | `USD`                      |

Select **Save preferences** and wait for **Preferences saved.** Reload Overview and confirm `UTC` and `USD` remain selected. Reporting currency here is a display/reporting preference; it neither creates a currency record nor converts cash. Other workspace roles may have read-only controls.

The optional demo seed creates a separate, labeled **empty** demo workspace. It does not populate a sample portfolio. It is unnecessary for this walkthrough. See [the environment inventory](../environment-inventory.md#declared-commands-and-their-verification-scope) for its command and prerequisites.

## Create reference records

Use the fixed dates below only in this synthetic example. Actual records require their true source conventions and effective dates. The conventions must be effective before the later deposit, execution and observation.

### Currency

Open **Record trade**, then expand **Set up currencies, accounts and instruments**. Choose **Currency** in **Reference record** and enter:

| Field                                           | Synthetic value        |
| ----------------------------------------------- | ---------------------- |
| Name                                            | `First-run dollar`     |
| Currency namespace                              | `docs:first-run`       |
| Currency code                                   | `USD`                  |
| Currency kind                                   | `fiat`                 |
| Unit identity                                   | `docs:first-run:USD`   |
| Display decimal places                          | `2`                    |
| Cash settlement increment                       | `0.01`                 |
| Conventions effective at (ISO time with offset) | `2026-01-01T00:00:00Z` |

Select **Create currency** and wait for **Currency created. Select it in your trade.** The code alone is not the currency's identity; retain the namespace and unit definition.

### Broker

Open **Advanced financial entry** from the recording page. In **Record type**, choose **Broker setup**. Enter **Broker name** `Fictional first-run broker` and **Source namespace** `docs:first-run`.

Select **Review record**, inspect **Review financial record**, then select **Confirm and record**. Wait for **Recorded successfully. Financial history and source references are retained.** This stores a broker identity; it establishes no broker connection and places no trade. A broker is optional for account creation; this walkthrough creates one to show the association.

### Account and instrument

Return through **Guided trade entry**, expand the setup section and choose **Account** in **Reference record**:

| Field                                           | Synthetic value              |
| ----------------------------------------------- | ---------------------------- |
| Name                                            | `First-run paper account`    |
| Account base currency                           | `USD · First-run dollar`     |
| Broker (optional)                               | `Fictional first-run broker` |
| Account environment                             | `Paper`                      |
| Account type                                    | `cash`                       |
| Inventory policy                                | `FIFO`                       |
| Holding mode                                    | `Netted`                     |
| Allow supported short inventory                 | `No`                         |
| Conventions effective at (ISO time with offset) | `2026-01-01T00:00:00Z`       |

Select **Create account** and wait for its acknowledgement. Account creation assumes no starting capital.

Choose **Instrument** in **Reference record** and enter:

| Field                                           | Synthetic value                                |
| ----------------------------------------------- | ---------------------------------------------- |
| Name                                            | `First-run share`                              |
| Instrument accounting                           | `Ordinary share · native delivered unit-price` |
| Economic identity                               | `docs:first-run:share`                         |
| Quote currency                                  | `USD · First-run dollar`                       |
| Quantity increment                              | `1`                                            |
| Price increment                                 | `0.01`                                         |
| Conventions effective at (ISO time with offset) | `2026-01-01T00:00:00Z`                         |

For this invented instrument, check the confirmation beginning **I verified delivered settlement, unit-price quotation, multiplier 1** and select **Create instrument**. Wait for its acknowledgement. The ordinary-share choice supplies the supported share unit, delivered settlement and multiplier `1`; it does not enable advanced derivative accounting.

## Record initial cash explicitly

Open **Advanced financial entry** again. Reference fields offer matching records as suggestions; choosing a suggestion stores its identifier. Select the named account and currency created above. Do not substitute a display name where a source identifier is required.

First choose **Cash bucket setup** in **Record type**:

| Field             | Value                     |
| ----------------- | ------------------------- |
| Account           | `First-run paper account` |
| Currency          | `USD · First-run dollar`  |
| Cash category     | `settled`                 |
| Custody reference | Leave empty               |

Use **Review record** → **Confirm and record** and wait for success. A cash bucket categorizes money; creating it does not fund it.

Next choose **Deposit, withdrawal or opening cash**:

| Field                                | Value                            |
| ------------------------------------ | -------------------------------- |
| Account                              | `First-run paper account`        |
| Cash bucket                          | The account's settled USD bucket |
| Currency                             | `USD · First-run dollar`         |
| Movement type                        | `deposit`                        |
| Actual amount                        | `1000`                           |
| Economic time (ISO 8601 with offset) | `2026-10-01T09:00:00Z`           |
| Source ordering sequence             | `1`                              |

Review and confirm once. Expected native cash is now **1000 USD**. This is simulated external funding, not trading profit. For real historical starting balances, select the appropriate source event rather than labeling every opening amount a new deposit.

## Record one fill and inspect its result

Return to **Guided trade entry**. Close the setup disclosure if it obscures the recording form, then enter:

| Field                              | Value                                                    |
| ---------------------------------- | -------------------------------------------------------- |
| Recording method                   | `Record a new execution`                                 |
| Account                            | `First-run paper account`                                |
| Instrument                         | `First-run share · v1 · native delivered`                |
| Execution side                     | `Buy`                                                    |
| Quantity (share)                   | `1`                                                      |
| Execution price                    | `100`                                                    |
| Executed at (ISO time with offset) | `2026-10-01T10:00:00Z`                                   |
| Source ordering key                | `2`                                                      |
| Principal cash bucket              | The existing settled USD bucket with current cash `1000` |
| Commission or fee (optional)       | Leave empty: this invented example has no charges        |
| Journal destination                | `Create a new trade journal`                             |
| Trade title                        | `First-run paper purchase`                               |
| Campaign direction                 | `Long`                                                   |
| Trade classification               | `Active trading`                                         |
| Strategy (optional)                | `Assign later in the journal`                            |
| Attribution reason                 | `Synthetic first-run fill belongs to this campaign`      |

Check the statement beginning **I checked the source and confirm all execution costs are recorded**, because the example deliberately has no costs. For an actual fill, an empty fee field alone does not establish complete costs.

Select **Preview record**. The **Record this execution?** dialog must show a buy of `1` share at `100`, the intended account and cash bucket, and the new journal. Preview does not post the fill. Select **Record execution and attribute** once, then wait for **Review this trade**. That link opens the linked journal; the journal combines review context with the recorded execution without making the two interchangeable.

| Check                       | Expected result before recording a price observation                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Native cash                 | `1000 − (1 × 100) = 900 USD` in the settled bucket                                                        |
| Holding quantity            | `1` share                                                                                                 |
| Execution count             | One recorded purchase                                                                                     |
| Campaign                    | Has an allocated fill; it is not a completed trade merely because recording succeeded                     |
| Complete closing equity/NAV | Not established without a compatible closing price; a known cash subtotal is not a complete account value |

Open **Accounts**, select **Environment** `Paper` and **Reporting currency** `USD · First-run dollar`. Under **Report scope**, choose the **Accounts** radio option, then select `First-run paper account` in the **Accounts** multiple-selection list. Set **From** `2026-10-01` and **Through** `2026-10-01`, then select **Apply report settings**. With timezone `UTC`, the report includes the example's deposit and purchase on that calendar day. **Cash** should show `900 USD`; missing closing price evidence must remain visible for equity/NAV. Refreshing the report does not fetch a live quote.

> **Important:** If a confirmation response is interrupted, retain the page and use its retry action with the frozen command. A lost response does not establish that nothing committed. Retry state is held in memory; after navigation or reload, inspect the recorded execution and cash before starting another fill. Do not recreate the purchase merely to obtain another success message.

## Optional: supply a compatible price

To finish the arithmetic example, open **Advanced financial entry** and choose **Manual instrument mark**:

| Field                                | Value                    |
| ------------------------------------ | ------------------------ |
| Instrument version                   | `First-run share · v1`   |
| Currency                             | `USD · First-run dollar` |
| Observed source price                | `110`                    |
| Observed time (ISO 8601 with offset) | `2026-10-01T11:00:00Z`   |
| Price source                         | `docs:first-run`         |

Review and confirm. This records an invented price observation; it is not a fill and changes no cash.

Return to the same Accounts scope. Expand **Price and FX evidence policy**, set **Price source priority** to the single line `docs:first-run`, and set **Maximum observation age (milliseconds)** to `86400000`. Retain the same dates, account and USD reporting currency, then select **Apply report settings**.

The observation precedes the closing boundary and is less than 24 hours old. With no charges, FX conversion, additional positions or later activity, closing cash remains **900 USD**, marked holding value is **110 USD**, and closing equity/NAV is **1010 USD**. The **10 USD** change above the **1000 USD** deposit is unrealized holding performance; the deposit is not profit. Wait until the report finishes applying and the address contains the selected account/date settings, then reload the page and verify the saved records and applied scope remain available. This does not close the campaign or create original committed risk for historical R.

## Optional: try the existing CSV examples separately

Use a **second empty paper account**, with the same currency, to keep this import independent of the funded purchase above. Follow [the existing import examples](../examples/imports/README.md) for the canonical file definitions and expected economics; they are application examples, not real broker exports.

1. Copy [generic-cash.mapping.json](../examples/imports/generic-cash.mapping.json) to a working file. Replace the placeholder currency ID with the actual USD currency identifier from this workspace. The **Currency** suggestion in Advanced financial entry reveals that identifier when selected. Retain the file's semicolon/decimal-comma/`Europe/Madrid` conventions.
2. In **Imports**, select the second account, enter **Broker source namespace** `docs:first-run:csv`, and choose [generic-cash.csv](../examples/imports/generic-cash.csv) in **Broker CSV file**. Wait for **Selected: generic-cash.csv · no financial activity has been posted.**
3. Expand **Advanced mapping and value aliases** and wait for the existing JSON to appear. Replace it with the corrected mapping into **Advanced mapping JSON**, then select **Apply advanced mapping**. Leave basic mapping controls unchanged afterward; editing them replaces advanced mapping.
4. Select **Stage file for review**, then **Select all groups** and **Validate selected groups**. Inspect both source rows, normalized amounts/dates and the retained unmapped **Memo** warning. Staging and validation do not post funding.
5. After reviewing the warning, check **I reviewed retained unmapped columns and warnings.**, select **Commit reviewed import**, inspect the confirmation, and select **Confirm posting**.

Expected cash in this separate account is **900 USD**: a **1000 USD** deposit and **−100 USD** withdrawal. These are external flows, not trading profit. The original source and audit history remain available. Reimporting the same source with the same account, namespace and stable IDs must not add another funding event. Do not change the namespace or IDs to bypass a correction conflict.

## Finish the session

After saved work is acknowledged, select **Sign out**. Confirm that the **Welcome back** sign-in screen appears. If an unsaved-work confirmation is shown, cancel to retain the draft or review the stated discard action before continuing. Signing out clears the authenticated application session; protected readiness returns an authentication denial afterward. See [verification](verification.md) for the exact health check and its expected status.

## Scope and implementation references

This walkthrough ends after initial setup, one recorded fill and optional observation/import checks. Continue with the [user manual](../user-guide/README.md) for strategies, reviews, risk, reconciliation, supplied analysis, exports and correction workflows. Their current scope is recorded in [the feature inventory](../feature-inventory.md).

| Subject                                 | Source and existing acceptance coverage                                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provisioning and empty demo behavior    | [Owner command](../../scripts/create-user.ts), [seed command](../../scripts/seed.ts), [workspace services](../../packages/server/src/services.ts)                                                                                               |
| Sign-in and preferences                 | [Sign-in form](../../apps/web/src/components/sign-in-form.tsx), [workspace preferences](../../apps/web/src/components/workspace-preferences.tsx), [scaffold browser checks](../../tests/e2e/scaffold.spec.ts)                                   |
| Reference setup and guided fill         | [Setup form](../../apps/web/src/components/record/catalog-setup.tsx), [guided recorder](../../apps/web/src/components/record/manual-record-workspace.tsx), [fresh-workspace browser journey](../../tests/e2e/manual-record.spec.ts)             |
| Broker, bucket, funding and mark fields | [Advanced field model](../../apps/web/src/components/record/advanced-record-model.ts), [advanced form](../../apps/web/src/components/record/advanced-record-workspace.tsx), [advanced browser journey](../../tests/e2e/advanced-record.spec.ts) |
| Closing balances and source policy      | [Accounts form](../../apps/web/src/components/accounts/account-workspace.tsx), [accounting report tests](../../tests/integration/portfolio-accounting-reports.test.ts)                                                                          |
| Optional CSV path                       | [Import interface](../../apps/web/src/components/imports/import-workspace.tsx), [examples](../examples/imports/README.md), [import browser journey](../../tests/e2e/imports.spec.ts)                                                            |
