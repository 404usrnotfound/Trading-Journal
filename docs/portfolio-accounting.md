# Portfolio and account accounting

Phase 7 adds first-class portfolio definitions, typed account income/expenses/taxes, evidenced cash transfers and a revision-pinned accounting API. It uses the existing financial ledger and pure Decimal kernel. Portfolio reports aggregate account inventory rather than trade/campaign attribution; a strategy's realized results do not prove account profit.

## Scope and history

A portfolio is a workspace identity with immutable numbered definition versions. Each version contains its name, description, live/paper environment and a relational set of account IDs. Edits publish a new version with an expected-version check; archival publishes history rather than deleting it. A report selects an exact `portfolioVersionId` or an explicit deduplicated `accountIds` list. It never silently uses a later membership definition for an earlier report.

Accounts can belong to multiple portfolios. Each report counts its selected accounts once; summing overlapping portfolio reports is not a workspace consolidation. Accounts can have different brokers, base currencies and cash currencies. Broker identity does not select accounting formulas. Live and paper accounts require separate populations. A closed account still owns its recorded cash and holdings; closing it does not liquidate them.

Every report supplies `reportingCurrencyId`, `from`, `to`, price source/freshness policy and FX source/freshness policy. `sourceRevision` defaults to the coherent current financial revision and can explicitly select an earlier accepted revision. Opening and closing snapshots and interval facts are read in one read-only repeatable-read transaction. Observations and observation supersessions respect that revision. The economic interval is **`(from, to]`**, and boundary balances include events at their boundary instant. UTC timestamps retain PostgreSQL's six fractional digits; display preferences do not change accounting dates.

The result retains account IDs, portfolio version, boundaries, source revision, calculation manifest, policies, source identities and selected price/FX dependencies. Replaying requires the same source revision, definition and calculation version; exporting or storing an archived report is a later workflow.

Reports accept `detail: "summary"` for complete monetary results with bounded evidence transport. This changes no accounting population or formula. `dependencies.coverage` gives the full FX, price and source-identity counts; empty arrays explicitly represent unrequested evidence. To recover evidence, repeat the same request at the returned `sourceRevision` with `detail: "summary"` and `dependencyPage: { "kind": "fx", "offset": 0, "limit": 200 }`. Kinds are `fx`, `prices` and `sourceIds`; follow `coverage.page.nextOffset` until null. A page must pin its revision and cannot exceed 200 items. Dashboard samples retain their coverage and replay request. Unpaged full detail remains available for bounded reports, with a 4,000 FX/price dependency budget and four MiB response bound; larger detail returns an explicit instruction to use complete summary totals and bounded evidence pages. No totals or evidence are silently truncated.

FX source loading selects only native/reporting and fee/native pairs actually required by the selected financial population, including inverse direction and the requested providers. Unrelated workspace FX history does not consume a report's evidence budget. Source-pinned historical translations and compatible observation supersessions retain their original rules.

The asynchronous [native cash/holdings snapshot](financial-outbox.md) is a separate, generation-labelled read projection. It does not replace this dated accounting calculation.

## Money, assets and availability

Authoritative amounts are decimal strings with 42 integral and 36 significant fractional digits. PostgreSQL validates canonical source text before generating `NUMERIC(78,36)` values. The isolated Decimal.js context works at 160 digits and quantizes derived outputs at scale 36 with HALF_EVEN rounding. Money is never calculated through JavaScript `Number`.

Cash includes economically owned settled, unsettled, restricted and collateral buckets once. It excludes ledger controls. Holdings use signed marked values; a short is already a negative holding value. Cash proceeds from opening a short are not profit. Fees already reduce actual cash and are not deducted from NAV again.

This report defines **equity** and **net liquidation value** identically as translated owned cash plus signed supported marked holdings plus evidenced owned monetary transit claims. It estimates no hypothetical liquidation charges, margin, buying power, tax liability, derivative notional or unsupported accrued asset. Those need their own compatible source definitions or validated modules.

Each monetary result has `state`, nullable `value`, `knownSubtotal`, `currencyId`, `reasons` and `missingReferences`. A fully known empty population is available zero. A subtotal with missing inputs is partial or unavailable and has no complete value. Unknown acquisition basis may leave marked NAV and flow-adjusted monetary account change available while trading/holding-FX attribution remains unavailable. Unknown fees prevent a complete net-performance claim. Missing or stale prices/FX and unsupported holdings remain visible.

Native realized/unrealized results retain their currencies. Reporting results never sum unrelated native units. Source-pinned compatible historical rates remain historical inputs; another reporting currency creates an explicitly selected reporting context. Same-currency translation uses identity. Market observations never borrow future rates or treat an actual cash exchange as an implicit universal reporting rate.

## Events and classifications

| Event                                     | Cash treatment                                                      | Accounting treatment                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Deposit / withdrawal                      | Existing positive / negative cash movement                          | External capital, excluded from performance                                       |
| Reviewed opening cash or holding          | Starting economics, with known or unknown basis                     | Opening capital adjustment, never fabricated prior profit                         |
| Execution principal                       | Actual gross booked settlement principal                            | Gross account trading result; price notional and booked principal remain distinct |
| Commission / fee                          | Existing signed charge; refund reverses the expense sign            | Actual dated fees, counted once                                                   |
| Dividend / received interest              | Typed positive gross income                                         | Income, separate from trading P&L                                                 |
| Withholding                               | Separate typed cash deduction in the same dividend/interest command | Tax, distinct from gross income and fees                                          |
| Paid interest / financing / other expense | Typed positive charge or negative refund                            | Actual dated expenses                                                             |
| Tax / tax refund                          | Typed positive charge or negative refund                            | Taxes; no jurisdictional tax computation                                          |
| FX conversion                             | Actual source debit and destination receipt, plus explicit fees     | Conversion execution difference, separate from monetary and holding FX            |
| Internal cash / holding transfer          | Preserved ownership/lineage                                         | Selected-scope capital transfer, never trading profit                             |
| Settlement / bucket reclassification      | Linked redistribution of an existing obligation                     | Cancels across owned buckets; no duplicate principal                              |
| Unresolved cash source                    | Balanced and recordable                                             | Blocks complete effect classification; never guessed income or profit             |

Legacy generic `income` remains income with an unspecified subtype. Arbitrary historical fee labels remain fees; a label containing “tax” does not retroactively become a typed tax event. Gross income and withholding are stored separately, with immutable source links. An actual refund is a new dated negative expense; an execution correction is the ledger's exact reversal and replacement.

## Transfers and money in transit

Immediate existing bucket transfers remain supported. New first-class transfers record immutable departure evidence and an optional same-instant actual receipt; otherwise a separate receipt command is required. They require distinct user-owned accounts in one environment and the same currency. A currency-changing transfer records its FX conversion separately. Duplicate receipts and receipts before departure are rejected; an expected receipt date never fabricates cash.

The approved fixtures define consolidation boundaries explicitly:

- Both endpoint accounts selected: synchronous legs cancel. Between delayed departure and actual receipt, the report includes one evidenced monetary transit claim. Receipt replaces that claim with destination cash.
- Source account only: departure is a scope capital outflow; the claim is outside this selected-account scope.
- Destination account only: actual receipt is a scope capital inflow.

Transit is derived from actual typed departure/receipt evidence, never from a control balance. Its separate monetary FX identity preserves currency exposure while cash is travelling. Historical reports exclude receipt facts accepted after their pinned revision.

A holding transfer preserves original lot quantity, principal basis, charges and acquisition lineage. If a transfer crosses the selected scope, the report needs a compatible contemporaneous mark and rate to measure the capital crossing. It offsets carried historical unrealized trading/holding-FX components so inherited gains cannot appear as new performance. Selecting both endpoints cancels those boundary adjustments once.

## Reconciliation equation

`NAV change = closing NLV − opening NLV`

`net capital flows = external cash flows + selected-boundary transfers + opening adjustments`

`performance = NAV change − net capital flows`

`explained change = gross trading P&L + holding FX + cash FX + transit FX + conversion effects + income − fees − expenses − taxes`

`reconciliation variance = performance − explained change`

Gross trading includes period account-lot realizations and the change in open gross marked result, adjusted for scope-crossing/opening capital. Holding FX similarly uses interval realizations plus the change between opening and closing components; lifetime FX on ending holdings alone is not period FX. Period costs follow their actual charge dates, not the dates when lots consume attributed costs. Campaign fee-net P&L is an alternative attribution view and is not an extra deduction in this bridge.

For every monetary currency:

`cash FX = ending cash × ending rate − opening cash × opening rate − Σ(dated signed cash movement × its event rate)`.

Every movement participates, including funding, principal, income, costs, conversions and transfers. Transit uses the same identity on its separately evidenced population. For each signed holding basis tranche:

`reporting trading = (realized/marked native value − native basis) × end/realization rate`

`holding FX = native basis × (end/realization rate − acquisition rate)`.

An actual exchange's gross execution effect is `destination principal × destination reporting rate − source principal × source reporting rate`. Its embedded exchange difference is already in the actual amounts; it is not deducted again as a spread estimate. Explicit conversion fees are ordinary dated costs.

Unmatched differences remain **reconciliation variance**, with missing or contradictory input evidence. They are never renamed FX or trading profit. Rounding residuals are separately named: displayed closing NLV minus displayed opening NLV, capital-flow components, economic components and unexplained variance. Derived metrics quantize once and can differ from arithmetic on already rounded displays. A complete numerical bridge has available components and zero unexplained variance; a partial subtotal cannot claim reconciliation.

## Authenticated API

All endpoints are beneath `/api/v1/workspaces/{workspaceId}/accounting`. Reads require current viewer membership. Mutations require editor/owner membership, same-origin/session CSRF and a UUIDv4 `Idempotency-Key`; facts, durable response, revision, audit and outbox commit together. Identical retries replay the original response, and changed content under the same identity conflicts. JSON bodies and read populations are bounded.

| Method     | Resource                   | Input / behavior                                                                      |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------- |
| GET / POST | `portfolios`               | List / create a versioned account scope                                               |
| GET / POST | `portfolios/{id}`          | Read / publish a full next definition with `expectedVersion` and `reason`             |
| GET        | `portfolios/{id}/versions` | Immutable definition history                                                          |
| POST       | `portfolios/{id}/archive`  | Append archival version; preserve history                                             |
| POST       | `income`                   | `kind: dividend                                                                       | interest`, positive gross `amount`, optional nonnegative `withholding`, account/bucket/currency, economic instant and ordering key |
| POST       | `taxes`                    | Signed nonzero `amount`: positive charge, negative refund; optional `relatedIncomeId` |
| POST       | `expenses`                 | Signed nonzero charge/refund; `kind: financing                                        | interest                                                                                                                           | other` |
| GET / POST | `transfers`                | List actual state / record departure; optional same-instant `receiptAt`               |
| POST       | `transfers/{id}/receipt`   | Actual receipt instant and ordering key                                               |
| POST       | `reports`                  | Read-only query; viewers allowed; creates no financial command or revision            |

Use the generated [OpenAPI contract](../packages/contracts/openapi.json) for exact schemas and pagination. Reports accept at most 100 accounts, 1,000 holding books and 10,000 observations per bounded population; larger requests fail explicitly rather than returning silent omissions. Heavy historical projections and asynchronous reports remain future work.

For an already authenticated browser/session, replace the IDs below with the existing workspace and financial currency/account IDs from the [ledger API](core-ledger.md):

```js
const response = await fetch(`/api/v1/workspaces/${workspaceId}/accounting/reports`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accountIds: [accountId],
    reportingCurrencyId: eurCurrencyId,
    from: '2025-03-01T00:00:00.000000Z',
    to: '2025-03-31T23:59:59.999999Z',
    fxPolicy: {
      id: 'reviewed-manual-daily-v1',
      maxAgeMilliseconds: 86400000,
      sourcePriority: ['manual'],
    },
    priceMaxAgeMilliseconds: 86400000,
    priceSourcePriority: ['manual'],
  }),
});
if (!response.ok) throw new Error(`Accounting query failed: ${response.status}`);
const report = await response.json();
```

Freshness choices above are explicit example policies, not product defaults. Record eligible dated FX/price observations before expecting complete reports. A portfolio query replaces `accountIds` with the exact `portfolioVersionId`; it cannot provide both selectors.

## Documented accounting examples

### External capital and gross income

Start with EUR 1,000 cash, deposit EUR 500, receive a EUR 100 dividend with EUR 15 withheld, receive EUR 5 interest, pay EUR 3 commission and EUR 2 financing expense, then withdraw EUR 200. Ending cash/equity is `1000 + 500 + 100 − 15 + 5 − 3 − 2 − 200 = 1385`.

External flows are `500 − 200 = 300`; performance is `1385 − 1000 − 300 = 85`. Income is `105`, fees `3`, expenses `2`, taxes `15`; the bridge is `105 − 3 − 2 − 15 = 85`. Trading P&L and every FX component are zero. A later EUR 2 tax refund is negative tax expense and adds EUR 2 to performance on its actual date.

### Multiple brokers and portfolio boundaries

Two EUR accounts at different brokers start with EUR 1,000 and EUR 100. An internal transfer of EUR 300 leaves them at EUR 700 and EUR 400. A portfolio containing both retains equity EUR 1,100, with zero external flows, zero boundary flows and zero profit. A source-only portfolio has NAV change `−300` and boundary transfer `−300`, hence zero performance; a destination-only portfolio similarly has `+300` capital and zero performance. An additional overlapping portfolio is an alternative account selection, not another asset.

### Delayed transfer with FX exposure

The complete owned-account scope starts with USD 100 at EUR/USD `0.8`, giving EUR 80 equity. USD 40 departs at `0.8`, is in transit while the rate reaches `0.9`, and is received when the rate reaches `1`.

At the intermediate boundary, owned cash is USD 60 and transit USD 40: equity is EUR 90, not EUR 54. Cash FX is EUR 6 and transit FX EUR 4. After receipt, cash totals USD 100, transit is zero and equity is EUR 100. Across the complete interval, cash FX is EUR 12 and transit FX EUR 8; `12 + 8 = 100 − 80 = 20`. There is no deposit, conversion or trading gain. The source-only scope treats departure as capital leaving at its departure rate; the destination-only scope recognizes capital on receipt at its receipt rate.

### Partial disposal, actual conversions and fees

Use EUR reporting, immediate settlement and EUR per USD reference rates. Start with no assets; fund EUR 2,000. Exchange EUR 1,000 for USD 1,100 at reference rate `0.90`, charging EUR 2. Exchange EUR 500 for USD 600 at reference rate `0.85`, charging EUR 1. Buy 10 shares at USD 100 when the rate is `0.90`, charging USD 2. Sell 4 at USD 120 when the rate is `0.92`, charging USD 1. Mark the remaining 6 at USD 110 and end rate `0.95`.

| Result                                  | Exact value                                          |
| --------------------------------------- | ---------------------------------------------------- |
| Native ending cash                      | EUR 497 and USD 1,177                                |
| Reporting cash                          | `497 + 1177 × 0.95 = EUR 1615.15`                    |
| Remaining gross principal basis         | USD 600                                              |
| Gross marked holding                    | `6 × 110 × 0.95 = EUR 627`                           |
| Ending equity / NLV                     | EUR 2242.15                                          |
| Native gross realized / unrealized P&L  | USD 80 / USD 60                                      |
| Reporting realized / unrealized trading | EUR 73.60 / EUR 57                                   |
| Holding FX                              | `400 × (0.92 − 0.90) + 600 × (0.95 − 0.90) = EUR 38` |
| Cash FX                                 | EUR 79.27                                            |
| Conversion execution effects            | EUR −10 and EUR +10, net zero                        |
| Actual costs                            | EUR 3 + USD 2 × 0.90 + USD 1 × 0.92 = EUR 5.72       |
| External funding                        | EUR 2000                                             |
| Performance                             | `2242.15 − 2000 = EUR 242.15`                        |
| Reconciled components                   | `73.60 + 57 + 38 + 79.27 − 5.72 = EUR 242.15`        |

The entry fee is already charged to cash. An alternative matched-lot net presentation allocates USD 0.8 to the closed shares and USD 1.2 to the remainder, but the account bridge charges the original USD 2 once. It never subtracts those cost allocations again.

### A period starts after acquisition

Buy one USD share for USD 100 at rate `0.8`. The requested interval begins later, with a mark of USD 110 and rate `0.9`, and ends at mark USD 120 and rate `1`. With no interval fills, open reporting trading moves from `10 × 0.9 = 9` to `20 × 1 = 20`, so period trading is EUR 11. Holding FX moves from `100 × (0.9 − 0.8) = 10` to `100 × (1 − 0.8) = 20`, so period holding FX is EUR 10. Holding value moves EUR 99 to EUR 120: `11 + 10 = 21`. Using the ending lifetime gain EUR 40 would overstate this period's change.

## Verification and remaining scope

Independent Decimal/property tests and real-PostgreSQL reconciliation tests cover these identities, scoped transfers, partial closes, shorts, fractional holdings, costs, refunds, immutable membership, tenant boundaries and revision-pinned corrections. HTTP tests cover authentication, CSRF, idempotency, validation and viewer reports. Executed outcomes are recorded in [Phase 7 validation](phase-7-validation.md).

This increment delivers accounting APIs and the domain engine. Portfolio screens, charts, TWR/MWR, performance percentages, strategy analytics, automated broker reconciliation, imports, tax-law calculations and advanced instrument-native settlement modules remain later work. Existing broker account-value observations stay separate observations; they cannot silently overwrite calculated equity or plug a reconciliation variance.
