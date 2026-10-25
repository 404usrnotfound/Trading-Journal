# Accounts and portfolios

Reviewed **25 October 2026** against documentation baseline **`3c790c2326bfd38e93698c60e80102a3787d077e`** and application source **`5132900a03efabaeb307787531546987228220e7`**. Workflows below are **Source-reviewed**. Existing catalog, ledger and accounting tests are **Historically passed** within the [retained remediation evidence](../final-audit.md#remediation-outcome--24-october-2026); this chapter does not claim a fresh browser run. See [manual verification](verification.md).

Use this chapter to establish the custody and reporting scopes in which you record money and holdings. An **account** owns cash and inventory; a **broker** identifies its source or custodian; a **portfolio version** selects accounts for a report. A portfolio creates no second copy of their assets. See the [glossary](../reference/glossary.md) and [financial concepts](../reference/financial-concepts.md).

## Before creating records

Complete [first run](../getting-started/first-run.md), sign in and select the intended **Workspace**. Owners and editors can create financial records; viewers can read existing records and reports. Workspace membership management and broker connections are unavailable in these setup forms. A fresh workspace has no financial catalog or starting capital.

For examples below, use an isolated **Paper** account and invented broker `Example custody`, currency namespace `docs:manual`, USD unit identity `docs:manual:USD` and an effective instant of `2026-01-01T00:00:00Z`. Example financial events occur after that instant. Use the actual source identity and effective date for real records. Live and paper populations stay separate.

Common validation applies throughout:

| Input                         | Meaning and validation                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Names and short source labels | Required trimmed text, normally 1–160 characters. A display name is not an identifier.                                                                                     |
| Amounts and increments        | Dot-decimal text such as `1000.25`; no comma grouping or exponent notation. At most 42 integral and 36 significant fractional digits. A positive increment cannot be zero. |
| Effective/economic instants   | ISO 8601 with `Z` or an explicit offset, for example `2026-01-01T09:00:00+01:00`; at most six fractional-second digits. Reference conventions must cover the event.        |
| Reference suggestions         | Select the named record from suggestions. Advanced entry stores its identifier; typing only its label does not supply a valid reference.                                   |

Guided setup is at **Record trade → Set up currencies, accounts and instruments** (`/record`). It creates reference records immediately when you select **Create currency**, **Create account** or **Create instrument**; there is no second financial confirmation dialog for that setup form.

Advanced setup is at **Record trade → Advanced financial entry** (`/record?mode=advanced`). Choose **Record type**, fill the fields, select **Review record**, inspect **Review financial record**, then select **Confirm and record**. Success reads **Recorded successfully. Financial history and source references are retained.** Review itself posts nothing. See [financial recording](financial-recording.md#review-confirm-and-retry-an-advanced-record) for interrupted confirmations.

## Define a currency

Create a currency before creating an account, cash bucket or currency-denominated instrument. Use a distinct identity for a genuinely different monetary unit, including tokens with colliding tickers. The workspace's reporting-currency preference alone does not create this financial record.

1. Open **Record trade** and expand **Set up currencies, accounts and instruments**.
2. Choose **Currency** in **Reference record**.
3. Enter the source definition using the fields below.
4. Select **Create currency**. Wait for **Currency created. Select it in your trade.** The currency becomes available to selectors; no cash appears.

| Field                                               | Definition and synthetic example                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Name**                                            | Display label: `Example dollar`.                                                                        |
| **Currency namespace**                              | Issuer/definition namespace: `docs:manual`. Use `iso:4217` only for a verified ISO definition.          |
| **Currency code**                                   | Display/search code: `USD`; it is not the full monetary identity.                                       |
| **Currency kind**                                   | `fiat`, `digital` or `custom`; example `fiat`.                                                          |
| **Unit identity**                                   | Stable unit definition: `docs:manual:USD`. Digital units need chain/contract identity where applicable. |
| **Display decimal places**                          | Integer `0`–`36`; example `2`. It controls presentation, not source rounding.                           |
| **Cash settlement increment**                       | Verified positive booking increment: `0.01`. This is separate from display precision.                   |
| **Conventions effective at (ISO time with offset)** | Actual start of the convention; example `2026-01-01T00:00:00Z`.                                         |

Common mistakes are creating duplicate definitions because a selector is on another page, treating two identical codes as the same unit, or using two display places to justify discarding source precision. Browse existing records first. Historical convention changes use the [versioned API workflow](#change-conventions-or-archive-reference-data-through-the-api), not another deposit.

## Add a broker

A broker is optional for an account. Add one when you want several accounts grouped under a known institution or source namespace. This records an identity; it does not authenticate the source, connect to a broker or authorize live trading.

1. Open **Advanced financial entry** and choose **Broker setup** in **Record type**.
2. Enter **Broker name** `Example custody` and **Source namespace** `docs:manual:broker`.
3. Select **Review record**, check both labels, and select **Confirm and record**.
4. After success, return through **Guided trade entry**. The broker is available in **Broker (optional)** when creating an account.

Both fields require nonempty short labels. Keep source namespaces stable; renaming an import source to bypass duplicate detection can duplicate financial history. An account with no broker is valid. See [imports and exports](imports-and-exports.md) for the distinct import source identity rules.

## Create an account

Create one account per actual custody/accounting scope. Choose **Paper** for synthetic work. An account's base currency is a convention; it can still own cash in other explicitly defined currencies.

1. Create its base currency and, if needed, broker first.
2. In guided setup choose **Account** in **Reference record**.
3. Fill the fields below and select **Create account**.
4. Wait for **Account created. Select it in your trade.** Select the new account in the recorder or Accounts report. It starts with no funding or holdings.

| Field                                               | Meaning, choices and example                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                                            | `Example paper account`. Use a recognizable label without private account numbers.                                                                      |
| **Account base currency**                           | Existing currency definition; choose `USD · Example dollar`. It does not convert balances.                                                              |
| **Broker (optional)**                               | Choose `Example custody`, or leave unassigned.                                                                                                          |
| **Account environment**                             | **Paper** or **Live**. Reports and transfers require a compatible environment.                                                                          |
| **Account type**                                    | `cash`, `margin` or `other`; example `cash`. Selecting margin does not implement broker margin or buying-power calculations.                            |
| **Inventory policy**                                | **FIFO**, **Average cost**, or **Specific lots (advanced recording required)**. It controls eligible account lot matching. Example **FIFO**.            |
| **Holding mode**                                    | **Netted** or **Segregated**. Native automatic inventory requires **Netted**; segregated source recording does not gain automatic calculations.         |
| **Allow supported short inventory**                 | **No** or **Yes — requires supported instrument conventions**. Example **No**. Permission alone supplies no borrow evidence or native short capability. |
| **Conventions effective at (ISO time with offset)** | Actual convention start, before the financial events; example `2026-01-01T00:00:00Z`.                                                                   |

FIFO consumes eligible oldest lots; average cost is available only for compatible native inventory; specific lots require explicit source-lot selection in advanced entry. Campaign allocation uses its own analytical matching, so it need not reproduce account-lot P&L. See [recording positions and lots](financial-recording.md#understand-orders-fills-campaigns-and-lots).

Do not create an execution to establish existing holdings when the source is only an opening statement. Use opening records below. Do not select **Live** for paper examples, assume a short sale is validated because **Yes** was selected, or choose specific lots and expect guided recording to choose them. Account setting changes append versions through the API; the UI has no general account editor.

## Create cash buckets

A cash bucket separates owned money by account, currency and category. Use it before funding an account, recording a fee or choosing explicit execution principal cash. Creating a bucket supplies no money.

1. In **Advanced financial entry**, choose **Cash bucket setup**.
2. Select **Account** `Example paper account` and **Currency** `USD · Example dollar`.
3. Set **Cash category** and optional **Custody reference**, using the table below.
4. Review and confirm. The bucket appears in financial cash selectors with the account, currency and category.

| Field or category           | Definition                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Cash category** `settled` | Settled owned cash; use this for the example.                                                               |
| `unsettled`                 | Actual unsettled cash obligation/receipt. Settling it later redistributes that obligation.                  |
| `restricted`                | Owned cash with restrictions. It remains owned cash in equity.                                              |
| `collateral cash`           | The displayed label for `collateral_cash`: owned cash pledged as collateral. Pledging it is not an expense. |
| **Custody reference**       | Optional source subaccount/custody identifier, up to 160 characters. Leave blank if none is known.          |

The account and currency must belong to the selected workspace and be eligible references. Reusing the same compatible bucket does not require another opening amount. Do not create a second representation of the same money as both collateral and unrestricted cash, or as both token cash and instrument inventory. Use [settlement and reclassification](financial-recording.md#settle-or-move-existing-cash) when money changes category.

## Establish historical openings

Use an opening when adopting an account with pre-existing economics. Use a deposit for actual new external funding. Both are capital rather than trading profit. Record opening cash and opening holdings separately so a holding does not also manufacture a purchase debit.

### Opening cash

Prerequisites are an account, currency and matching bucket effective at the opening instant.

1. Choose **Deposit, withdrawal or opening cash** in advanced entry.
2. Set **Account**, **Cash bucket**, **Currency**, **Movement type** `opening`, and signed **Actual amount**.
3. Enter **Economic time (ISO 8601 with offset)** and **Source ordering sequence**. The sequence is a nonnegative integer string, for example `1`; use verified order for events at the same instant.
4. Review and confirm. Example `1000` USD creates starting cash of `1000` USD with an opening-capital classification. A negative opening is allowed only when it truthfully represents the source balance.

Zero is rejected. Currency and account must agree with the bucket. Do not enter a withdrawal-style negative amount as new positive starting cash, record the same opening again after reloading, or infer income from an unexplained statement difference. [Cash recording](financial-recording.md#record-deposits-withdrawals-and-unresolved-cash) explains other movement types.

### Opening holding or historical lot

Use a source-verified instrument version and account. Native automatic calculations require compatible netted settings and instrument conventions; manual quantities can remain recordable with unavailable economics.

1. Choose **Opening holding / historical lot**.
2. Select **Account** and **Instrument version**. Set **Direction** `long` or `short` and positive **Quantity**.
3. Supply **Known original entry price** and/or **Known original booked basis** only when supported by evidence. Leave unknown basis empty. The basis is the original principal for the lot, not today's marked value.
4. Check **Original actual costs are complete** only if source coverage proves it. Enter **Reason / source evidence**, the economic instant and ordering sequence.
5. Review and confirm. Inspect **Available source lots** under **Advanced source fill** for the account, or the journal/account inventory API for its lineage.

Synthetic example: opening a native long lot of `2` shares with original price `100`, booked basis `200` and complete zero costs creates quantity `2` and basis `200` USD. It creates no purchase cash debit. With both basis fields absent, quantity remains `2` while affected basis/P&L remains unavailable. Native opening prices/principal must be positive; manual signed source quotes can be retained without enabling a valuation formula. A zero-basis gift is not represented by inventing price `0` in this command.

Do not invent acquisition prices, claim all costs are known because a statement omits them, or double-record the opening as a buy. An opening mark may support opening capital valuation but never reconstructs missing acquisition basis. See [instrument setup](financial-recording.md#create-the-correct-instrument) and [financial concepts](../reference/financial-concepts.md).

## Select account or portfolio scope in Accounts

Viewers, editors and owners can inspect **Accounts** (`/accounts`). Use this to check balances after setup; detailed report, return and supplied-value interpretation belongs in [analytics and dashboard](analytics-and-dashboard.md).

1. Open **Accounts**, choose **Environment** **Paper** or **Live**, and choose the actual financial **Reporting currency** definition.
2. Set **From** and **Through**. These calendar dates use the workspace timezone; **Through** is included. **Today**, **This week**, **Last week** and **Last 30 days** provide date presets.
3. Under **Report scope**, select **Accounts** and choose one or more entries in the **Accounts** multiple-selection list. Use Ctrl/Command for multiple selections, Shift with arrow keys, or **Select all paper accounts** / **Select all live accounts**.
4. Alternatively, select **Immutable portfolio version**, then choose **Portfolio version**. This option is disabled when no compatible versions are available. The chosen version fixes account membership.
5. Expand **Price and FX evidence policy** to review the allowed observation age and source priorities. Enter one source per line, highest priority first. **Maximum observation age (milliseconds)** `86400000` means 24 hours; `0` requires a boundary-time observation. See [recording observations](financial-recording.md#record-observations-without-moving-money) and the analytics chapter for explicit supplied-position selection.
6. Select **Apply report settings**. Wait for the report to finish; draft settings alone do not update it. Read **Closing balances**, **Cash by native currency**, and **Applied scope and evidence** to confirm the environment, selected accounts, currency and revision.

Example: two paper USD accounts have cash `1000` and `100`. Selecting both gives owned cash `1100` USD. Selecting one gives only that account's balance. A portfolio containing both is the same selection, not another `1100` asset. A missing mark or FX rate can leave complete equity unavailable even when the known cash subtotal is visible; refreshing the report does not obtain a market feed. Mixed environments, empty explicit selections, unavailable references and invalid date/policy inputs require correction before applying.

## Create and maintain portfolios through the API

**Availability:** creation, definition editing, version history and archival are API-only. The Accounts screen selects existing immutable versions; it has no portfolio editor. This distinction also applies if a report selector is empty.

A portfolio is useful for a recurring account selection, such as all live accounts at two brokers. Prerequisites are editor/owner membership, 1–100 distinct active account IDs from one environment, and the [authenticated command requirements](../core-ledger.md#persistence-and-command-boundary). Use the exact [accounting schemas](../../packages/contracts/src/accounting.ts) and [OpenAPI](../../packages/contracts/openapi.json); [portfolio accounting API reference](../portfolio-accounting.md#authenticated-api) describes the supported resources. The following steps describe a manual API-client workflow, not UI buttons or a fresh executed command.

1. Read eligible accounts from `/api/v1/workspaces/{workspaceId}/financial/accounts`, filtering the environment and following its pages. Retain account IDs, not their labels.
2. POST `/api/v1/workspaces/{workspaceId}/accounting/portfolios` with `name`, optional `description`, `environment` (`paper` or `live`) and the complete `accountIds` array. Use the authenticated session, matching Origin, CSRF proof and a new retained UUIDv4 `Idempotency-Key`.
3. Inspect the response and retain the portfolio ID, immutable version ID and version number. In Accounts select **Immutable portfolio version** and that definition; new page data may require a reload after the API command.
4. To revise membership, GET `.../portfolios/{id}` and POST to the same path with the full next definition plus `expectedVersion` and a nonempty `reason`. An update does not merge a partial account list. A stale version returns `STALE_PORTFOLIO_VERSION`; reread and review instead of guessing a version.
5. GET `.../portfolios/{id}/versions` to inspect retained definitions. Portfolio and version lists use cursor pages, default 25 and maximum 100; follow `nextCursor` rather than assuming the first page is complete.
6. To retire a portfolio, POST `.../portfolios/{id}/archive` with current `expectedVersion` and `reason`. Archival appends a version and retains history; an archived portfolio cannot be updated or archived again.

Synthetic example: create `Paper custody view` with accounts A and B in `paper`. Version 1 selects A+B. Publish version 2 with only A and reason `Separate account B for review`. A report pinned to version 1 still selects A+B. Neither command moves money, changes account ownership, liquidates holdings or rewrites past scope.

Common mistakes are supplying mixed live/paper accounts, duplicate IDs, sending only the added account in an update, using a portfolio ID where a `portfolioVersionId` is required, and summing overlapping portfolios. Account and portfolio selectors are alternatives: an accounting report accepts exactly one of `accountIds` or `portfolioVersionId`.

## Change conventions or archive reference data through the API

**Availability:** the delivered setup UI creates records. Account settings, currency conventions, instrument versions and catalog archival have supported API paths, without a general editor or lifecycle screen. Use them for reviewed future convention changes or retiring references, not to rewrite accepted source events.

Prerequisites are editor/owner membership, the current catalog `revision`, reviewed source evidence and the authenticated command requirements above. Follow these steps with the strict [financial schemas](../../packages/contracts/src/financial.ts) and [ledger API reference](../core-ledger.md#api-resources-and-filters):

1. GET the existing currency/account/instrument to obtain its ID, revision and conventions. Retain exact historical instrument version IDs for prior fills.
2. Choose the operation below and submit all required next-version fields with `expectedRevision` and a nonempty `reason`.
3. Inspect the returned new revision/version and reread the record. An effective instant must be strictly later than the prior version. If the revision conflicts, reread and review before another command.
4. Verify old executions/openings still reference their accepted conventions. New definitions must be effective for later source events.

| API operation under `/financial`                                         | Required next definition and boundary                                                                                               | Synthetic example / expected result                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `currencies/{id}/conventions`                                       | `displayScale` 0–36, positive `settlementIncrement`, `effectiveAt`, revision and reason.                                            | Publish display scale `4` prospectively. Old booked amounts remain native facts; no conversion occurs.                                               |
| POST `accounts/{id}/settings`                                            | Complete `baseCurrencyId`, `inventoryMethod`, `allowShort`, `holdingMode`, `effectiveAt`, revision and reason.                      | Change base reporting convention from USD to EUR. USD cash remains USD; it is not exchanged.                                                         |
| POST `instruments/{id}/versions`                                         | Complete quantity unit, nullable currencies/multiplier/increments, capability, metadata and effective instant, revision and reason. | Append reviewed future metadata while old fills retain their pinned version. Different expiry/strike contracts require separate economic identities. |
| POST `{currencies\|brokers\|accounts\|instruments\|trades}/{id}/archive` | Current revision and reason.                                                                                                        | Retire an unused duplicate reference. It disappears from new selection while history remains readable; cash/holdings are not reversed.               |

After inventory history exists, an eligible FIFO-to-average transition has a specific prospective path: netted holding mode stays unchanged and the new effective instant must follow all accepted inventory activity. Other incompatible matching/holding changes require a separately reviewed transition (`POLICY_TRANSITION_REQUIRED`). Do not promise an arbitrary inventory-policy toggle.

Instrument changes cannot reinterpret quantity units, a known multiplier or known monetary units (`UNIT_TRANSFORMATION_REQUIRED`). A capability change after executions/openings is also blocked (`CAPABILITY_TRANSFORMATION_REQUIRED`). A stock split, redenomination, new option strike or futures roll is not an ordinary metadata edit; specialized automatic transformation workflows remain unavailable. Archived headers reject new version publication. See [financial recording](financial-recording.md#create-the-correct-instrument) for native/manual gates.

## Find records and resolve setup problems

Expand **Search and browse all reference records** in guided entry or **Browse source references** in advanced entry. Use the labeled search field and **Search accounts**, **Search instruments** (advanced: **Search instrument versions**), **Search currencies**, **Search brokers** or **Search trades** (advanced: **Search campaigns**) where offered. **Next …** and **Previous …** browse bounded pages; records selected in the current draft are retained while pages change. Search before creating a supposed missing duplicate. Historical instrument versions can remain valid references even when absent from the current suggestion page.

If suggestions fail, reload or retry the indicated page before recording. A record from another workspace is unavailable even when its UUID is syntactically valid. If an event predates its currency/account/instrument convention, correct the reference or source date rather than backdating unverified economics. If cash remains zero after setup, record actual opening cash or funding; catalog creation itself never funds the account.

Related tasks: [financial recording](financial-recording.md), [guided example](guided-example.md), [settings and navigation](settings-and-navigation.md), [risk and reconciliation](risk-and-reconciliation.md), and [imports and exports](imports-and-exports.md).

## Source and verification references

The [catalog setup form](../../apps/web/src/components/record/catalog-setup.tsx), [advanced field model](../../apps/web/src/components/record/advanced-record-model.ts), [catalog pager](../../apps/web/src/components/record/catalog-page.tsx) and [Accounts workspace](../../apps/web/src/components/accounts/account-workspace.tsx) establish the labels and UI boundaries. [Catalog services](../../packages/server/src/financial/catalog.ts), [reference validation](../../packages/server/src/financial/reference-data.ts), [accounting services](../../packages/server/src/accounting/service.ts) and [accounting API](../../packages/server/src/accounting/api.ts) establish server behavior.

Representative historical coverage includes [catalog integration](../../tests/integration/financial-catalog.test.ts), [catalog pagination](../../tests/integration/catalog-pagination.test.ts), [portfolio accounting services](../../tests/integration/portfolio-accounting-services.test.ts), [accounting reports](../../tests/integration/portfolio-accounting-reports.test.ts), and the [advanced browser journey](../../tests/e2e/advanced-record.spec.ts). These support the stated operations, not live broker connectivity, universal instrument accounting or jurisdiction-specific tax correctness.
