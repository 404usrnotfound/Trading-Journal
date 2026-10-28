# Record financial activity

Reviewed **25 October 2026** against documentation baseline **`3c790c2326bfd38e93698c60e80102a3787d077e`** and application source **`5132900a03efabaeb307787531546987228220e7`**. This chapter is **Source-reviewed**. Relevant ledger, accounting, UI and browser tests are **Historically passed** in the [retained remediation evidence](../final-audit.md#remediation-outcome--24-october-2026); no new execution is claimed here. See [manual verification](verification.md).

Use **Record trade** for an actual fill and its campaign attribution, or **Advanced financial entry** for source cash, orders, multiple costs, specific lots, allocation changes and observations. These screens record history; they do not send an order to a broker. See [accounts and portfolios](accounts-and-portfolios.md) for initial currencies, accounts, buckets and openings, and [guided example](guided-example.md) for a connected synthetic journey.

## Prepare the source and choose a recording path

Owners and editors can record. Viewers can inspect records and read reports; advanced entry explicitly disables their write fields. Select the correct **Workspace**, then verify the account's **Paper** or **Live** environment before posting. Required references must belong to that workspace and have conventions covering the event. No live broker connection or price feed is supplied.

Retain the actual account, instrument convention, side, quantity, source quote, principal/settlement facts, economic timestamp with offset, event ordering and every cost in its original currency. Use canonical dot-decimal text, for example `0.000001` or `1000.25`, with at most 42 integral and 36 significant fractional digits. Commas, exponent notation and floating-point approximations are invalid financial inputs. Instants support up to six fractional-second digits; **Source ordering key** / **Source ordering sequence** is a nonnegative integer string such as `1`, without leading zeros. Recording time is separate from economic time.

| Need                                                                                                                                     | Delivered path                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One fill, one optional charge, one campaign attribution                                                                                  | **Record trade** (`/record`).                                                                                                                                                |
| Attribute an entirely unassigned imported/existing fill                                                                                  | **Record trade → Recording method → Link an imported / existing execution** (`/record?mode=existing`).                                                                       |
| Several charges, explicit source lots, an order, cash movement, observation or allocation partition                                      | **Advanced financial entry** (`/record?mode=advanced`).                                                                                                                      |
| Typed dividend/interest, tax/expense, delayed owned-account transfer, holding transfer, execution correction or cost-attribution command | Authenticated API, with the specific steps below. These operations do not have general entry forms in advanced recording.                                                    |
| Import a reviewed file                                                                                                                   | [Imports and exports](imports-and-exports.md). Do not manually post the same source again.                                                                                   |
| Record reviewed manual position/campaign analysis values                                                                                 | **Supplied values**; follow [analytics and dashboard](analytics-and-dashboard.md), which covers its source form, correction and explicit report selection. It posts no cash. |

## Understand orders, fills, campaigns and lots

| Concept                     | What recording it does                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Order**                   | Retains an instruction and its status. It creates no fill, cash or position by itself. An order marked canceled can still have actual earlier fills.                                 |
| **Execution / fill**        | Records an actual quantity and source economics. Native settlement or explicit manual effects change cash once. One order can have several fills; a fill can exist without an order. |
| **Campaign / trading idea** | Groups decisions and review context, called a **trade journal** in guided recording. It can contain several legs, fills, accounts and instruments.                                   |
| **Allocation**              | Partitions one fill between campaign legs and an unassigned remainder. It does not duplicate the fill or its cash.                                                                   |
| **Position / holding book** | The account's inventory under a compatible instrument convention and policy. It owns no additional copy of campaign exposure.                                                        |
| **Lot / match**             | Acquisition lineage and the portions consumed by disposals. FIFO, eligible average or specific lots determine account matching; campaign matching is a separate attribution view.    |

A sale can partially close a lot, cross through zero into an opposite holding, or complete a leg. It does not automatically complete the campaign. A flat account can coexist with opposing campaign claims. Review the account/campaign bridge rather than assuming every fill is a completed trade. [Financial concepts](../reference/financial-concepts.md), [journaling and reviews](journaling-and-reviews.md), and the [glossary](../reference/glossary.md) explain the separate populations.

## Create the correct instrument

Create an instrument when the actual economic contract has no matching reference. Inspect existing references first. A ticker alone is insufficient; different expiries, strikes, deliverables, token chains or contract identities may require separate instruments.

1. In **Record trade**, expand **Set up currencies, accounts and instruments**, then choose **Instrument** in **Reference record**.
2. Enter **Name** and choose **Instrument accounting** using the support table below.
3. Enter a stable **Economic identity**, verified **Quote currency**, and the known quantity/price increments. For spot crypto, also enter **Quantity unit**. For a manual instrument, enter its additional fields below.
4. Set **Conventions effective at (ISO time with offset)** before the event.
5. For a native instrument, check **I verified delivered settlement, unit-price quotation, multiplier 1 and the entered increments. Crypto is non-rebasing. Quote and settlement use the selected currency.** Select **Create instrument** and wait for **Instrument created. Select it in your trade.** No holding or trade is created yet.

| **Instrument accounting** / asset                                      | Source recording and calculation boundary                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ordinary share · native delivered unit-price**                       | `stock` / `ordinary-share`, quantity unit `share`, multiplier `1`, same quote/settlement currency and known positive increments. Native netted account inventory supports long FIFO/eligible average/specific lots.            |
| **Ordinary ETF · native delivered unit-price**                         | `etf` / `ordinary-etf`, the same delivered-share gates. A fund holding is not ownership of a second copy of its underlying assets.                                                                                             |
| **Non-rebasing spot crypto · native delivered unit-price**             | `crypto_spot` / `non-rebasing-spot`, explicit token quantity unit, multiplier `1`, delivered settlement and non-rebasing metadata. Native longs are supported; spot crypto shorts/lending/rebasing are unavailable.            |
| Delivered spot forex                                                   | Record **Actual currency conversion** between cash currencies. Do not create a currency-pair holding worth the same acquired balance.                                                                                          |
| Rolling/margin FX, options/warrants, futures/perpetuals, bonds         | Choose **Other instrument · source recording only**. Preserve contract quantities/quotes and explicit actual cash. Native pip, premium, tick/variation-margin, clean/dirty/accrual and lifecycle calculations are unavailable. |
| Commodities, structured products, certificates and other custom assets | Use the manual choice with explicit units, terms and actual source effects. A family name or known multiplier does not grant an automatic module.                                                                              |

Manual fields retain **Instrument family**, **Instrument subtype**, **Quantity unit**, optional **Quote currency**, **Settlement currency**, **Contract multiplier (if known)**, **Quantity increment**, **Price increment**, and **Source instrument metadata (JSON)**. Family/subtype/identity and units are required nonempty labels. Unknown manual currencies, multiplier and increments may remain empty; supplied positive increments/multiplier must be valid decimals. JSON must parse as an object. Preserve terms such as option expiry/strike/deliverable, futures tick/margin convention, or bond face/clean-price/day-count definition. The generic metadata form does not validate specialized economics.

Native increments constrain fills: quantity and price must be exact multiples of their pinned increments. Native fills require positive prices; native marks may be zero. Signed manual source quotes, including negative futures quotes, can be retained without deriving notional cash or native P&L.

Example: `Example option Oct call`, family `option`, a source-specific subtype, quantity unit `contract`, verified USD currencies, multiplier `100`, and manual capability can record `2` contracts and actual premium cash `-300`. It does not infer a `2 × quote × 100` cash debit or native option valuation. Use actual source terms; the [asset-class audit](../asset-class-audit.md#implemented-operation-matrix) and [supplied values](../supplied-values.md) distinguish manual cash from explicitly selected reviewed analysis.

Native securities shorts additionally require the exact immutable stock/ETF version to declare `shortConvention: "borrowed-delivery"` and `carryCostPolicy: "explicit-source-charges"`, alongside compatible account settings and actual source charges. The simple native setup form does not expose these metadata fields. Creating a source-verified short-capable version therefore requires the [catalog API](../core-ledger.md#api-resources-and-filters); changing metadata later cannot repair the original convention of an old fill. Do not mislabel derivatives or synthetic shorts as ordinary shares to obtain numbers.

Instrument changes and archival use [versioned API steps](accounts-and-portfolios.md#change-conventions-or-archive-reference-data-through-the-api). Automatic exercise, assignment, expiry settlement, splits, futures rolls, coupon accrual or redemption must not be inferred from dates or JSON terms.

## Record a fill in guided entry

Use this for a new actual fill in a compatible account when you want to attribute its entire quantity to one journal. Create the account, instrument and required currencies first. Specific-lot accounts require advanced entry; the guided recorder refuses to choose their lots.

1. Open **Record trade** and select **Record a new execution** in **Recording method**.
2. Select **Account** and the exact **Instrument** version. Active references are required for new recording. Source conventions must be effective at the execution instant.
3. Fill **Execution side** (**Buy** or **Sell**), **Quantity (unit)**, **Execution price**, **Executed at (ISO time with offset)** and **Source ordering key**. Quantity is always positive; sell direction is not a negative quantity. A native fill requires positive price. An unknown manual price can remain empty.
4. For native booking, choose **Principal cash bucket**, or **Create / use default bucket** and **Principal new bucket category** (**Unsettled**, **Settled**, **Restricted** or **Cash collateral**). Default native principal uses an unsettled bucket. Select the correct actual category instead of accepting a default that contradicts the source.
5. For manual/segregated source recording, enter the actual cash effects as described below. Native principal is derived from verified quantity, price, multiplier and settlement increment; actual principal exceptions require the API workflow below.
6. Expand **Commission or fee (optional)** for one actual charge or rebate. Enter **Fee amount**, **Fee currency**, **Fee category**, and the matching **Fee cash bucket**, or default bucket and **Fee new bucket category**. Positive charges reduce cash; negative rebates increase it. Leave amount empty only when no fee is being entered.
7. Check **I checked the source and confirm all execution costs are recorded, including when there are no costs. Otherwise net metrics remain incomplete.** only when source coverage supports it.
8. Under **Journal destination**, choose **Create a new trade journal** or an existing active campaign. For a new journal, enter **Trade title**, **Campaign direction** (**Long**/**Short**), **Trade classification** (**Active trading**/**Investing**), optional **Strategy (optional)** and exact **Strategy version used**. **Assign later in the journal** is valid. An existing journal requires a **Matching trade leg** with the same account and exact instrument version.
9. Enter **Attribution reason**, then select **Preview record**. Inspect **Record this execution?** for the account, version, quantity, source time, cash, costs and journal. Preview posts nothing.
10. Select **Record execution and attribute**. Wait for **Trade ready for review**, then use **Review this trade**. **Record another execution** starts a deliberate new record after success.

Synthetic example: with `1000` USD settled cash, buy `2` shares at `100` into that bucket and record a USD commission `1`. Cash becomes `799` USD, holding quantity is `2`, gross principal basis is `200` USD and entry cost is `1` USD. Assigning the fill creates campaign attribution, not another holding. A closing price observation is still needed for marked equity; recording succeeded does not imply the campaign is closed or historical R is available.

For scaling in/out, select the same compatible **Journal destination** and leg for later fills. Example: sell `1` of those shares at `120` with fee `0.50`; remaining quantity is `1`, cash increases by `119.50` USD, and native gross realized gain is `20` USD before allocated costs. A native **Close only** restriction is available in advanced entry when the source intent must not open an opposite position.

Common mistakes are using negative sell quantities, choosing today's instrument version for a historical fill, treating an order limit as the actual fill price, counting a fee both in principal and as a charge, selecting a fee bucket in the wrong currency, and checking complete costs without reviewing the source. Multiple charges and specific lots belong in advanced entry even though older guided help text points to the API.

### Manual source cash in guided entry

When automatic cash booking is unavailable, guided entry displays a source-recording notice. Under the fill:

1. If evidence confirms no actual cash movement, check **The source confirms this execution has no cash movement.** Do not check this merely because consideration is unknown.
2. Otherwise select **Add source cash effect**. Fill **Source cash 1 currency**, **Source cash 1 amount**, **Source cash 1 cash bucket**, and, if creating a default, **Source cash 1 new bucket category**. Additional rows receive their corresponding number; use **Remove cash effect 1** to remove a wrong row.
3. Enter signed effects: a premium payment might be `-300` USD; a source receipt might be `200` USD. Each bucket must match the selected account/currency. Up to 64 effects are supported.
4. Enter fees separately, review and confirm the whole fill as above.

The option example of a two-contract purchase with `-300` USD actual premium and a separate `2` USD fee reduces cash by `302` USD and records quantity `2`. Automatic option basis/P&L/valuation remains unavailable (`unsupported_inventory_module`). A whole-account observation cannot fill that gap. Use reviewed supplied components only through their explicit [analysis workflow](analytics-and-dashboard.md).

Do not enter contract notional as actual cash, silently assume zero cash because the price is unknown, or repeat a manual cash effect as another deposit/expense. Cash effects establish their stated amount; they do not prove a specialized lifecycle or return classification.

### Recover a partially confirmed guided record

Journal creation, execution booking and attribution are separate commands. If a later step fails, earlier confirmed steps remain committed. **Recording progress** identifies **Journal ready**, **Execution recorded** and **Execution attributed to the trade journal** separately.

Keep the page open and select **Retry remaining steps**. The frozen draft retains the same command IDs. A recorded execution is already booked even when attribution failed. **Open recorded journal** can inspect the confirmed journal. Reload/navigation discards in-memory retry state: inspect existing executions and cash before starting another record. Do not recreate a fill merely to obtain the final link.

## Link an existing or imported execution

Use this after an import or a source-only advanced fill when its entire quantity is still unassigned. It creates attribution only.

1. Open `/record?mode=existing` or choose **Link an imported / existing execution** in **Recording method**.
2. Select **Account**, then **Recorded execution**. Use **Load more executions** for later pages or **Retry executions** on a loading error. The source's exact historical instrument version is loaded; do not replace it with the current version.
3. Confirm the displayed source side, quantity, price and time. Set the journal destination/new journal fields and **Attribution reason** as in guided recording.
4. Select **Preview attribution**, inspect **Attribute this existing execution?**, then select **Confirm attribution**.
5. Inspect the linked journal. Execution count, original principal and cash are unchanged.

Example: an imported purchase of `10` shares becomes a `10`-share campaign allocation; there is still one source purchase. Guided linking rejects a fill with any existing campaign attribution and checks the latest allocation version at commit. Use [split/reassign](#split-or-reassign-an-existing-fill) for partially assigned fills. Selecting **Record a new execution** instead would risk duplicating the source.

## Review, confirm and retry an advanced record

All advanced workflows below share this procedure. Open **Record trade → Advanced financial entry**, choose the named **Record type**, fill its fields and any rows, select **Review record**, inspect **Review financial record**, then select **Confirm and record**. Success is **Recorded successfully. Financial history and source references are retained.** **Return to source fields** abandons an unposted preview so you can correct it.

References offer suggestions or accept exact source identifiers. Use **Browse source references** and its search/paging controls if the desired reference is not on the first page. A version identifier and an instrument identity are different references.

> **Important:** If confirmation returns an unknown/interrupted outcome, keep the page open. Fields and record type freeze; retry **Confirm and record** to retrieve the result using the same command identity. A lost response does not prove failure. After navigation or reload, inspect persisted sources/cash before deliberately creating another command.

The server validates every command, including workspace references, economic dates, signs and conservation. A preview that passes field validation can still fail current-state validation at confirmation. An explicitly rejected command permits correction; a stale version requires rereading the effective state. Do not bypass a conflict with another source identity.

## Record deposits, withdrawals and unresolved cash

Use these for actual external funding or truthful source cash not yet classified. Prerequisites are an account, defined currency and compatible bucket; create historical starting balances using [openings](accounts-and-portfolios.md#establish-historical-openings).

1. Choose **Deposit, withdrawal or opening cash**.
2. Set **Account**, **Cash bucket**, **Currency**, **Movement type**, signed **Actual amount**, **Economic time (ISO 8601 with offset)** and **Source ordering sequence**.
3. Review the sign and category, then confirm. Check **Accounts → Cash by native currency** in a scope containing this account and event date.

| **Movement type** | Validation and expected effect                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deposit`         | Positive amount; `1000` adds `1000` cash and external capital, not profit.                                                                            |
| `withdrawal`      | Negative amount; `-200` removes `200` cash and external capital. A positive withdrawal is rejected.                                                   |
| `opening`         | Signed nonzero reviewed starting balance; opening-capital adjustment.                                                                                 |
| `income`          | Legacy signed nonzero generic income, without dividend/interest subtype or linked withholding. Prefer the typed API below for those known sources.    |
| `unresolved`      | Signed nonzero actual cash with unknown classification. It stays unresolved and blocks complete effect classification; the app does not guess profit. |

Zero movements are rejected, and the bucket's account/currency must match. A deposit of `1000` followed by withdrawal `-200` leaves `800` cash and net external funding `800`, with zero performance absent other events. Do not label a transfer between owned accounts as a deposit/withdrawal pair or a statement mismatch as income. Actual costs/taxes have their separate expense sign conventions below.

## Record an actual currency conversion

Use this when one account actually exchanges currencies. Create both currency definitions and the two matching account buckets first. Reporting translation alone requires an observation and does not use this command.

1. Choose **Actual currency conversion**.
2. Select **Source cash bucket** and **Destination cash bucket**, in the same account but different monetary units.
3. Enter positive **Actual source amount** and **Actual destination amount**. They are gross principal cash legs; enter separately charged costs as rows.
4. Optionally enter **Source quoted rate (optional)** as destination units per one source unit. Enter economic time and ordering sequence.
5. Under **Actual charges in their original currencies**, select **Add charge** for every actual charge and fill **Currency**, **Cash bucket**, **Actual amount** and **Charge kind**. Use **Remove fees 1** (or the applicable row number) for a wrong row. Up to 64 charges are accepted.
6. Review all amounts/currencies and confirm. Check both native bucket balances.

Example: exchange `100` USD for `90` EUR and charge `0.50` USD plus `0.20` EUR. Source cash falls by `100.50` USD and destination cash rises by `89.80` EUR. The actual gross rate is `0.9` EUR/USD. The charges are counted once; no extra spread estimate is deducted. This follows the independent amounts in the [advanced browser fixture](../../tests/e2e/advanced-record.spec.ts).

Both principal amounts must be positive. Same-currency and cross-account conversions reject. If a quoted rate differs from the amount-implied rate at its supplied precision, the API requires explicit `rateReview` with `reason` and `source`. That evidence field is absent from this form; omit an optional quote you cannot support, or use the documented API to retain a reviewed source discrepancy. Never change the actual amounts merely to make an indicative quote fit.

## Record an advanced fill with costs and source lots

Use this for multiple charges, an order-leg reference, specific-lot matching or explicit source cash. Prerequisites are the account, exact instrument version, matching buckets and any eligible lots. An advanced fill is initially unassigned to a campaign; follow [link existing](#link-an-existing-or-imported-execution) or [split/reassign](#split-or-reassign-an-existing-fill).

1. Choose **Advanced source fill**. Set **Account**, **Instrument version**, **Side** `buy`/`sell`, positive **Quantity**, **Actual source fill price**, economic time and ordering sequence.
2. For native settlement choose matching **Cash bucket**, or leave it empty to use the automatically created compatible unsettled bucket. Native quote/principal use the pinned increment/booking rule.
3. If this is a fill of a recorded order, enter its **Source order leg reference**. Account, instrument version and side must agree with that leg. Leave it empty if no order evidence exists.
4. Check **All actual source costs are included** only with evidence. Use **Add charge** for each fee, with its original **Currency**, **Cash bucket**, signed **Actual amount** and **Charge kind**. Positive costs reduce cash; negative rebates increase it.
5. For an eligible native disposal, check **Close only** if the fill must only consume opposite inventory. It rejects an excessive quantity or ambiguous chronology instead of opening an opposite position.
6. For specific lots, select the account and expand **Available source lots**. Inspect **Lot reference**, **Source**, **Remaining quantity** and **Direction**. Under **Explicit source lot selection**, select **Add lot**, choose **Source lot reference** and positive **Quantity** for each consumed slice. Use **Remove lots 1** to correct a row.
7. For a manual instrument, check **Use explicit supplied cash effects (manual instruments)** and use **Add cash effect** under **Explicit manual cash effects**. Each row requires **Cash bucket**, **Currency** and signed **Actual amount**. Leave **Close only** unchecked: it requires a supported native inventory book. A truly cashless manual fill can use an explicit empty effect set; preserve supporting evidence separately.
8. Review every row and confirm. Verify the execution, resulting cash, inventory quantities and any unavailable calculations. Then attribute the existing fill if appropriate.

Specific-lot selections must identify distinct eligible lots at the event boundary, with selected quantities totaling the quantity being closed; they do not select today's inventory for an old event. Use explicit selection only for a specific-lot policy: FIFO/average pools reject supplied selections. Up to 1,000 lot selections are accepted. Unselected or impossible source quantities cannot be invented. Native quantity/price increments and positive price are enforced; manual unknown price can remain blank and signed source quotes are retained. Do not enter manual effects for native principal or book a fee twice.

Historical fixture example: open a known-basis lot of `2` shares at `100`, then sell `1` at `120`, explicitly selecting `1` from that source lot, with `1` USD and `2` EUR charges. One share remains and source gross realized gain is `20` USD. Cash gains `119` USD and loses `2` EUR. Complete net reporting results still need compatible fee FX evidence; subtracting `2` EUR directly from USD P&L is invalid.

The advanced form does not expose `bookedPrincipal`, `principalCurrencyId`, reviewed principal exceptions, per-charge `economicAt`, `nativeFx`/`reportingFx`, source identities or acquisition `basisReportingFx`. When these source facts are necessary, use the strict [execution/fee API schemas](../../packages/contracts/src/financial.ts), authenticated [ledger command reference](../core-ledger.md#persistence-and-command-boundary) and operation reference below. A reviewed actual native principal differing from the pinned booking rule requires `principalReview` evidence; a manual recorded principal without explicit cash effects posts no consideration by itself.

## Record orders without creating fills

Use an order to retain actual instruction evidence, including a single instrument or a package. It is optional for historical fills and creates no broker instruction outside the journal.

1. Choose **Single or package order instruction** in advanced entry.
2. Select **Account**, **Order structure** `single` or `package`, and **Instruction time (ISO 8601 with offset)**.
3. Select **Instruction status** (`recorded`, `working`, `partially filled`, `filled`, `canceled`, `rejected`, `expired`), positive **Quantity**, **Order type** (`market`, `limit`, `stop`, `stop limit`), and source **Time in force** such as `DAY`.
4. Supply positive **Limit price** for limit/stop-limit, positive **Stop price** for stop/stop-limit. These fields retain their positive-price validation even when manual execution quotes can be negative.
5. Under **Order legs**, select **Add order leg** and enter **Instrument version**, **Side**, and positive **Leg ratio** for each leg. A single order requires exactly one leg; packages accept up to 32.
6. Review and confirm. Record later actual fills separately using each order-leg identifier; do not use instruction quantity/limit as proof of execution.

Example: a single buy order for `10` shares, type `limit`, limit `100`, ratio `1`, status `working` and time-in-force `DAY` changes no cash/holding. An actual fill of `3` at `99` creates `3` shares when separately recorded. Fill status uses effective actual facts, including overfills and fills after terminal instruction evidence; a canceled label does not erase them.

Amending/canceling existing order intent is API-only: GET `/financial/orders/{id}`; review its `revision` and retained instruction; POST `/financial/orders/{id}/amendments` with current `expectedRevision`, complete new `instruction`, `economicAt` and `reason`, under the authenticated command rules. To record cancellation set that instruction's status `canceled`; do not send a negative fill. Inspect the appended instruction history. Stale revisions conflict and require rereading. See [catalog/intent API resources](../core-ledger.md#api-resources-and-filters) and [order schemas](../../packages/contracts/src/financial.ts).

## Split or reassign an existing fill

Use this when one actual fill belongs to several campaign legs, or when correcting attribution without changing source cash. Create the intended campaign legs first through [journaling](journaling-and-reviews.md); a package order alone does not create campaign legs.

1. Choose **Split or reassign an existing fill**.
2. Set **Filter source executions by account**, then **Recorded execution**. Browse later **source executions** pages if needed.
3. Inspect **Current execution allocation** and select **Use current allocation version** to fill **Current allocation version**. Review every current portion, including **Unassigned**.
4. Select **Choose campaign for allocation leg suggestions**. Inspect **Campaign leg references** and select the desired **Campaign leg reference** in each row.
5. Select **Add allocation** per assigned portion and enter positive **Quantity**. Select another campaign to obtain its leg suggestions when splitting across ideas. Existing row references remain in the draft. Use **Remove allocations 1** for a wrong row.
6. Enter **Reason / source evidence**, review the entire replacement partition, and confirm.
7. Inspect current allocations again and compare source execution count/cash. They remain unchanged; a new effective allocation version is recorded.

Example: a `1`-share fill allocated `0.4` to idea A and `0.6` to idea B still has quantity `1`, with zero unassigned residual. Allocating only `0.4` leaves `0.6` explicitly unassigned. Quantity and each source cost partition must conserve; allocating `0.7` plus `0.6` rejects. Up to 1,000 assigned rows are accepted. A stale version conflicts; reload and rereview the whole partition. Closed/canceled/archived or incompatible account/instrument legs cannot receive new activity. Reallocation is not a correction to the fill price, a cash movement or evidence that either campaign completed.

## Record standalone fees and carrying charges

Use this when a source charge arrives separately from a fill, or for actual carrying/funding/borrowing costs. It records money, not an estimate from a borrow-rate label.

1. Choose **Actual fee or carrying charge**.
2. Set **Account**, matching **Cash bucket** and **Currency**, signed **Actual amount**, and **Charge kind** (`commission`, `exchange`, `regulatory`, `carrying`, `funding`, `borrow` or `other`).
3. If the source belongs to a fill, enter **Related execution**. It must be the current effective execution in the same account.
4. Enter the actual economic time and ordering sequence, review and confirm. Positive `3` USD reduces cash by `3`; negative `-1` is a `1` USD rebate. Source fees are not rounded to the currency's display scale.

Example: EUR `2` borrowing cost reduces EUR cash by `2`. A USD campaign net result may remain incomplete until compatible translation and attribution are provided. Do not put a tax into **Charge kind** and expect typed tax reporting, assume every label containing “tax” is tax, or attach a charge to a superseded fill. Typed financing expenses use the accounting API below; fee labels and typed expenses retain their own source definitions.

Standalone cost attribution to inventory is API-only:

1. Retain `feeId` from the standalone fee creation response, and inspect the relevant `/financial/positions` book for target lot/match IDs. GET `/financial/fees` returns currency totals, not individual fee IDs or attribution versions.
2. POST `/financial/fee-attributions` with `feeId`, `instrumentVersionId`, current `expectedVersion` (initially `0` when no inventory attribution exists), economic ordering, reason and the full `allocations`. Each row names `target` `lot`, `match` or `unassigned`, optional `targetId`, and signed `amount`.
3. Include exactly one explicit unassigned residual; all portions must conserve the original source amount/currency. For a `3` USD standalone fee, allocating `2` to a lot and `1` to `unassigned` retains total cost `3` and creates no new cash charge.
4. Retain the returned attribution `version` for later updates, and inspect the updated inventory costs. There is no dedicated attribution-version read endpoint or editor; do not guess a missing version. An identical retry with the retained command can retrieve its original response; a new command with a stale version returns `STALE_COST_ATTRIBUTION`.

Execution-linked charges already follow their execution's partitions and reject this independent attribution. Attribution cannot precede the actual cost or assign it to another book. See [ledger cost rules](../core-ledger.md#supported-catalogs-and-inventory) and [fee attribution schema](../../packages/contracts/src/financial.ts).

## Record typed income, withholding, taxes and expenses through the API

**Availability:** these typed accounting commands are API-only. The advanced form's generic `income` option is available but has no dividend/interest subtype, linked withholding or typed expense fields. Accounts displays and reverses typed history.

Use the API for a known dividend/interest source, withholding, actual tax/refund, or actual financing/interest/other expense. Prerequisites are editor/owner membership, account/currency/bucket references and the [authenticated command requirements](../core-ledger.md#persistence-and-command-boundary): session, matching Origin, CSRF proof, JSON and a retained UUIDv4 idempotency key for each deliberate command. See the canonical [accounting API reference](../portfolio-accounting.md#authenticated-api), [strict accounting schemas](../../packages/contracts/src/accounting.ts) and [OpenAPI](../../packages/contracts/openapi.json). The following are API-client steps, not hidden UI actions.

1. Confirm the source account, bucket/currency and actual event date/order. Choose exactly the applicable resource below.
2. POST the strict request beneath `/api/v1/workspaces/{workspaceId}/accounting`, retaining request and command identity for a safe identical retry.
3. Inspect the command response (`id`, `commandId`, `sourceRevision`) and Accounts report for the event period. Verify both cash and the separate income/tax/expense classification.
4. For an erroneous fact, use [historical correction](#correct-historical-account-facts). Record a genuine later refund as a new actual event on its later date.

| POST resource | Fields beyond account/bucket/currency and `economicAt`/`orderingKey`                                                                                                                             | Example and expected effect                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `income`      | `kind: "dividend"` or `"interest"`; positive gross `amount`; optional nonnegative `withholding`; optional `description`.                                                                         | Dividend `100` with withholding `15` creates gross income `100`, linked tax `15`, net cash `85`, atomically. It is not net income `85` plus another `15` deduction. |
| `taxes`       | Signed nonzero `amount`, `description`; optional `relatedIncomeId`. Positive is a charge, negative an actual refund. The linked income must be a dividend/interest in the same account/currency. | Tax `2` reduces cash by `2`; later refund `-2` raises cash by `2` and reduces tax expense on the actual refund date.                                                |
| `expenses`    | `kind: "financing"`, `"interest"` or `"other"`; signed nonzero `amount`; `description`. Positive is a charge, negative a refund.                                                                 | Financing `2` reduces cash/performance by `2`. Received interest belongs in `income`, not a negative financing guess.                                               |

Amounts, times and references use the common validation rules; income cannot be zero/negative, withholding cannot be negative, and standalone tax/expense cannot be zero. `description` retains up to 4,000 characters of source narrative. The schemas allow supplied withholding above gross; only record what the source actually evidences rather than imposing a fabricated net amount.

Independent same-currency example: starting `1000`, deposit `500`, dividend `100`, withholding `15`, interest income `5`, fee `3`, financing expense `2`, withdrawal `-200` yields cash `1385`. External funding is `300`; performance is `85 = 105 income − 3 fees − 2 expenses − 15 taxes`. [Portfolio accounting examples](../portfolio-accounting.md#external-capital-and-gross-income) and [service tests](../../tests/integration/portfolio-accounting-services.test.ts) retain the calculation basis. No jurisdictional tax liability or automatic coupon accrual is calculated.

## Settle or move existing cash

Use an internal movement when money changes bucket/category or moves synchronously between owned accounts. It is distinct from an external deposit, expense or actual currency conversion.

1. Choose **Settlement or internal cash movement** in advanced entry.
2. Select distinct **Source cash bucket** and **Destination cash bucket** in the same monetary unit.
3. Enter positive **Actual amount**, **Movement kind** (`settlement`, `reclassification`, `internal-transfer`; the last displays as `internal-transfer`), optional/required **Related execution** as below, economic time and ordering sequence.
4. Review source/destination and confirm. Inspect both bucket balances, plus their consolidated owned cash.

| **Movement kind**   | Required evidence and expected result                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settlement`        | Same account; source `unsettled`, destination `settled`; **Related execution** required. The positive entered amount moves the signed outstanding obligation, never exceeding it or preceding execution. A buy obligation of `-100` becomes unsettled `0` and settled `-100`; it does not debit another principal on top of the original obligation. |
| `reclassification`  | Same account/currency. Moving `100` from settled to collateral reduces one by `100`, increases the other by `100`, and leaves total owned cash unchanged.                                                                                                                                                                                            |
| `internal-transfer` | Same currency and compatible environment; synchronous redistribution, including across owned accounts. Moving `300` from A to B leaves total selected A+B cash unchanged.                                                                                                                                                                            |

Settlement rejects a mismatched/superseded execution, excess or duplicate consumption of the outstanding obligation (`SETTLEMENT_EXCESS`). Live/paper transfers reject. Currency changes require a separate conversion. Do not manually book principal again on settlement, treat collateral as a fee, or use an immediate movement while actual money remains in transit. Use the typed transfer API below for explicit departure/receipt history.

## Record an owned-account transfer with transit through the API

**Availability:** typed departure and later receipt are API-only. Use them when two owned accounts exchange the same currency and the actual receipt can occur later. Both accounts must be in one environment; create matching buckets first. Currency-changing transfers require a separate actual conversion.

1. With the authenticated accounting command rules, POST `/accounting/transfers` with `sourceBucketId`, `destinationBucketId`, positive `amount`, `description`, departure `economicAt` and `orderingKey`.
2. If actual receipt occurred at exactly the departure instant, include `receiptAt` equal to that instant. Otherwise omit it. An expected receipt date is not evidence and must not be posted as one.
3. Retain the transfer ID and inspect GET `/accounting/transfers`. Between actual departure and receipt, consolidated accounting may include the evidenced monetary transit claim rather than invent destination cash.
4. When actual delayed receipt is known, POST `/accounting/transfers/{id}/receipt` with actual receipt `economicAt` and `orderingKey`, using a new retained command identity.
5. Inspect both accounts and the combined report. Receipt replaces the transit claim with destination cash. A duplicate receipt, a receipt before departure (including its same-time sequence), or a reversed transfer rejects.

Example: A has USD `100`; `40` departs and later reaches B. Between legs the A+B scope has cash `60` plus transit `40`, not only `60` equity. On receipt it has cash `100` and no transit. An A-only scope sees a capital outflow at departure; a B-only scope sees a capital inflow at receipt. Neither is trading profit. FX exposure during transit remains separate from an actual conversion. See [transfer accounting reference](../portfolio-accounting.md#transfers-and-money-in-transit), [accounting schemas](../../packages/contracts/src/accounting.ts), and [risk and reconciliation](risk-and-reconciliation.md).

Holding transfer is also API-only. GET source positions and lot lineage, then POST `/financial/holding-transfers` with distinct `sourceAccountId`/`destinationAccountId`, exact `instrumentVersionId`, reason, economic ordering and `selections` of `lotId` plus positive quantity. Eligible native netted accounts must be compatible and in the same environment. Review destination and source books after confirmation. Moving `1` of `2` shares preserves that slice's acquisition basis, charges and FX lineage; it creates no sale/profit and no second external contribution when both endpoints are selected. Unknown/ineligible lots, insufficient quantity and incompatible conventions reject. A mark/FX may still be needed to measure capital crossing a report's selected boundary. See [holding transfer schema](../../packages/contracts/src/financial.ts) and [ledger transfer reference](../core-ledger.md#transfers-campaigns-and-corrections); specialized multi-account correction of descendant basis remains unavailable.

## Correct historical account facts

Use this for erroneous typed dividend/interest, tax, expense or owned-transfer sources. It reverses the original economics at the original instants and retains source evidence; it is different from recording an actual later refund. Owners/editors have the correction panel; viewers do not.

> **Warning:** A historical reversal changes current-revision reports of the original period. Review linked withholding and both transfer legs before confirming. A replacement is a separate command; the reversed state remains visible until it is recorded.

1. Open **Accounts** and find **Correct historical account facts**.
2. In **Historical source**, select the source by kind, amount, economic time and description/ID. Use **Next sources** to page or **First sources** to return. Reversed sources are disabled.
3. Enter **Correction reason**, then select **Review historical reversal**.
4. Read the described source, original economic time, linked effects and reason. Select **Confirm historical reversal**, or **Return to source fields** before confirmation to correct the review.
5. Wait for **Historical source reversed. Original evidence is retained. Record the corrected replacement using its original economic time.** Then record the reviewed correct source using the appropriate API and its true original time, linking the old source in the description.

Example: an erroneous dividend `100` with withholding `15` had added net cash `85`. Reversing it appends negations of both the income and linked unreversed tax, removing that `85` effect at the correction revision. A transfer reversal removes departure and any receipt together; it cannot later receive a receipt. Reports pinned before reversal preserve their original view.

The API requires current `expectedSourceRevision`, exact `sourceType` and a nonempty reason of at most 2,000 characters. Stale reviews and a new duplicate reversal conflict. After an unknown response the reviewed fields freeze: retry **Confirm historical reversal** with the retained identity; do not start another reversal. This panel is not a general reversal UI for deposits, generic legacy income, fees, conversions, opening lots or executions. See the [correction reference](../account-performance-and-corrections.md#correct-an-erroneous-account-fact) for exact API behavior.

### Correct a fill through the API

Execution source corrections are API-only. Do not reallocate a wrong price or add an offsetting fictitious fill to conceal it.

1. Read the effective execution, fees, allocations and dependent settlement/transfer evidence through the [ledger APIs](../core-ledger.md#api-resources-and-filters).
2. Prepare POST `/financial/execution-corrections` with `originalExecutionId`, a nonempty `reason` and complete `replacement` execution fields. When quantity changes on an allocated fill, include explicit `replacementAllocations` conserving the reviewed replacement quantity.
3. Review principal, fees, dates, lots and campaign portions together; submit with the authenticated command and retained idempotency identity.
4. Inspect the replacement, original supersession, monetary reversal/replacement, rebuilt inventory and effective allocations. The original remains immutable. Compare reports at the intended source revision; inspect any `closureReviewRequired` campaign state.

Example: replacing an unencumbered buy of `2` at `100` with the correctly evidenced buy of `2` at `101` reverses the wrong principal and records the corrected principal; it is not a second purchase of `2`. An isolated correction of a confirmed settled fill rejects with `DEPENDENT_SETTLEMENT_REVIEW_REQUIRED`. Acquisition lineage transferred to another account rejects with `DEPENDENT_LINEAGE_REVIEW_REQUIRED`; grouped settlement or descendant-lineage restatement is not delivered. Do not remove the dependency evidence to force a correction. See [execution correction schemas](../../packages/contracts/src/financial.ts), [ledger correction rules](../core-ledger.md#transfers-campaigns-and-corrections) and [historical correction tests](../../tests/integration/financial-ledger.test.ts).

Campaign completion requires assigned activity, zero remaining quantity on every leg, resolved assigned obligations and explicit obligation evidence. A correction can invalidate an earlier closure. Use the actual [journal lifecycle workflow](journaling-and-reviews.md); dates, `filled` order status or a last sell do not supply this evidence.

## Record observations without moving money

Observations supply dated source evidence for a defined measurement. They do not create fills, convert cash, or repair missing basis by themselves. Owners/editors can record them through advanced entry; viewers can read resulting reports. Exact source names must agree with each report's allowed source priority and maximum age. Future or stale observations cannot satisfy a boundary.

### Manual instrument mark

1. Choose **Manual instrument mark**.
2. Select **Instrument version**, **Currency**, **Observed source price**, **Observed time (ISO 8601 with offset)** and **Price source**.
3. Review and confirm, then apply a report policy selecting that source and freshness window.

For the native two-share example, mark price `110` USD values quantity `2` at `220` USD with compatible conventions. It changes no cash. A mark requires a published quote currency, must use that currency and cannot predate the instrument version. Native marks must be nonnegative; manual signed quotes can be retained while automatic valuation remains unsupported. The price is a quote in the instrument's units, not a whole-account value or a currency-pair rate. A native eligible mark does not close a campaign or supply original risk.

### Historical reporting FX observation

1. Choose **Historical reporting FX observation**.
2. Select **Base currency** and **Quote currency**, enter positive **Quote units per one base unit**, observed time and **Rate source**.
3. Review and confirm. Apply the corresponding source priority/age to the report; inspect its selected FX evidence.

Example: base USD, quote EUR, rate `0.9` means USD `100` translates to EUR `90`. Reversing the fields without inverting the rate is wrong. Same-unit pairs and nonpositive rates reject. Eligible direct/inverse evidence can support reporting; it creates no cash conversion or acquired currency. Prices alone cannot supply missing FX, and a rate observed after an event cannot become its historical pre-event evidence.

### Broker or manual account observation

1. Choose **Broker / manual account observation**.
2. Set **Account**, **Currency**, **Actual amount**, **Observed time (ISO 8601 with offset)**, **Valuation definition and included components**, and **Valuation source**.
3. Review and confirm. Read it as comparison evidence with the declared definition, then investigate differences using [reconciliation](risk-and-reconciliation.md).

Example: source equity `1010` USD at an observed instant with definition `Statement equity including owned cash and marked shares; excludes buying power` preserves that evidence. It does not overwrite calculated equity, allocate `1010` to holdings or plug a reconciliation variance. Signed amounts can retain an actually negative source equity. **Valuation definition and included components** is required short text; cash, equity, margin and buying power are different measures.

Observation corrections append a superseding source using API fields `supersedesId` and `reason`; these correction fields are absent from the advanced form:

1. Retain the exact original observation ID and definition from its command response/source record or report dependencies. Account observations also have GET `/financial/account-valuations` history, with `includeSuperseded`; price/FX do not have a dedicated history screen or list endpoint.
2. POST the reviewed replacement to the same observation resource with the full new source fields, `supersedesId` and a nonempty `reason`, following the authenticated command rules. Keep the original FX pair direction; price corrections keep the exact instrument version/currency; account corrections keep the account, currency and stated definition.
3. Inspect returned identity and report dependencies. For example, correcting an unpinned mark from `110` to the evidenced `109` changes a later policy-selected valuation to that replacement; cash stays unchanged. A competing replacement returns `OBSERVATION_ALREADY_SUPERSEDED`.

Accepted fill-pinned historical FX does not silently change when later observations are corrected. See [observation schemas](../../packages/contracts/src/financial.ts), [supplied values](../supplied-values.md) for the separate reviewed-analysis records, and [analytics and dashboard](analytics-and-dashboard.md) for report policies and availability.

## Check the result and handle unavailable output

After success, inspect the recorded source and native cash/quantity in the relevant account/journal, then apply the intended reporting dates, currency, sources and revision. Cash and quantity can be known while basis, net P&L, NAV or R is unavailable. Missing costs, unknown openings, stale marks/FX, unsupported inventory modules or ambiguous chronology remain explained missing evidence; a known subtotal is not a complete zero-valued result.

An account/campaign performance difference may come from different lot matching, allocations, dated costs or selection boundaries. Investigate the linked evidence instead of changing a source to match a desired chart. Use [analytics and dashboard](analytics-and-dashboard.md), [risk and reconciliation](risk-and-reconciliation.md), [strategies](strategies.md) and [journaling and reviews](journaling-and-reviews.md) for the respective analysis and review steps.

## Source and verification references

Exact UI labels and retry boundaries come from the [guided recorder](../../apps/web/src/components/record/manual-record-workspace.tsx), [catalog setup](../../apps/web/src/components/record/catalog-setup.tsx), [advanced field model](../../apps/web/src/components/record/advanced-record-model.ts), [advanced workspace](../../apps/web/src/components/record/advanced-record-workspace.tsx) and [account correction panel](../../apps/web/src/components/accounts/account-corrections.tsx). The [financial contract](../../packages/contracts/src/financial.ts), [accounting contract](../../packages/contracts/src/accounting.ts), [ledger service](../../packages/server/src/financial/ledger.ts) and [accounting service](../../packages/server/src/accounting/service.ts) define accepted facts and boundaries.

Representative historical coverage includes [manual browser recording](../../tests/e2e/manual-record.spec.ts), [advanced browser recording](../../tests/e2e/advanced-record.spec.ts), [ledger integration](../../tests/integration/financial-ledger.test.ts), [financial correctness campaign](../../tests/integration/financial-correctness-campaign.test.ts), [accounting services](../../tests/integration/portfolio-accounting-services.test.ts), [account corrections UI](../../tests/ui/account-remediation.test.tsx), [asset-class integration](../../tests/integration/asset-class-extensibility.test.ts) and [supplied financial boundaries](../../tests/integration/supplied-financial-boundaries.test.ts). The broader [feature inventory](../feature-inventory.md) preserves partial and unavailable scope, including specialized lifecycle modules and live external integrations.
