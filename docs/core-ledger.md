# Core ledger implementation

Phase 4 added a persisted financial backend to the Phase 3 application foundation. The Next.js handler at `/api/v1/workspaces/{workspaceId}/financial/{resource}` calls shared server services and the pure financial kernel. Later increments provide [financial entry](advanced-financial-entry.md), [Dashboard](dashboard.md) and other [user workflows](user-guide/README.md). [Phase 4 validation](phase-4-validation.md) retains that increment's executed checks and limitations; current feature coverage and verification belong in the [feature inventory](feature-inventory.md) and [documentation validation](documentation-validation.md).

The approved [domain model](domain-model.md), [calculation contracts](financial-calculations.md), [capability matrix](instrument-capabilities.md) and [independent fixtures](financial-fixtures.md) retain the full delivery requirements. The narrower implementation below does not remove those requirements. [Financial metrics](financial-metrics.md) describes the available outputs and their populations.

## Persistence and command boundary

Domain identity is `(workspace_id, id)` with UUIDv4 IDs and composite tenant foreign keys. Financial tables use forced tenant RLS and the existing transaction-local membership context. A viewer can read; an editor or owner can issue commands. Authentication, current membership, same-origin checks and session-bound CSRF are enforced on the server.

Every financial POST requires `Content-Type: application/json`, a UUIDv4 `Idempotency-Key`, the authenticated session cookie, an `Origin` matching `APP_ORIGIN`, and `X-CSRF-Token` from the authenticated `GET /api/auth/session` response header. Command bodies are strict Zod objects with a 65,536-byte limit. Unknown fields, invalid references and unsupported conventions are rejected rather than inferred. The command ID comes from the header; do not add `commandId` to a public request body. Responses use `Cache-Control: private, no-store`.

Commands lock the workspace financial-state row, serialize its source revision, and commit source facts, synchronous canonical inventory, stored command result, audit event and outbox intent in one PostgreSQL transaction. Retrying the same command identity and contents returns its stored result. Reusing the identity with different contents returns `IDEMPOTENCY_CONFLICT`. Execution and cash source identities additionally support an identical-source no-op; changed source economics require review rather than duplicate posting. This is a manual command foundation, not a CSV reimport workflow.

Accepted executions, fees, cash movements, conversions, postings, allocation versions, observations and closure records are append-only facts. Catalog headers and canonical inventory are controlled current state; account settings, currency conventions and instrument economics append versions. The [reviewed SQL migration](../packages/database/migrations/0002_core_financial_ledger.sql) supplies deferred checks for command/revision linkage, audit/outbox linkage, monetary and allocation conservation, and canonical inventory. Runtime tenant roles cannot bypass these checks by updating or deleting accepted facts.

Each ledger event has at least two postings and balances exactly in its own currency. A posting has one cash-bucket target or one named control counterpart. An FX exchange creates separate balanced source- and destination-currency events; EUR and USD cannot cancel each other to establish balance. Controls explain the counterpart and do not enter cash or NAV. Cash buckets distinguish `settled`, `unsettled`, `restricted` and `collateral_cash`.

## Precision, time and provenance

Money, quantity, price, basis and rates cross JSON as bounded dot-decimal strings. Public source scalars must fit PostgreSQL `NUMERIC(78,36)` without rounding: at most 42 integral digits and 36 significant fractional digits. JSON numbers, exponent notation, NaN and Infinity are not financial scalar inputs. The isolated Decimal.js context uses 160 working digits and `ROUND_HALF_EVEN`; named derived boundaries quantize to scale 36. Currency display scale and actual settlement increment are separate versioned settings. Principal booking rounds to the declared settlement increment with HALF_EVEN, retaining theoretical notional, derived principal and any reviewed actual-principal variance.

API instants include an explicit offset and at most six fractional second digits, matching PostgreSQL microseconds. Economic commands carry `economicAt` and a nonnegative integer-string `orderingKey`; recording time and source revision remain separate. Source timestamps and supplied decimal text remain in provenance. The pure kernel can order finer source instants, but the persisted API does not claim nanosecond storage.

## Supported catalogs and inventory

Currencies have a namespace, monetary-unit identity and effective convention; matching display codes alone do not merge units. Brokers retain a source namespace. Accounts declare `live` or `paper`, `cash`/`margin`/`other`, base currency, inventory method, short permission and holding mode. Live and paper accounts cannot share a valuation or transfer population. Account creation is financial catalog setup; it does not supply broker buying power, margin rules or reconciliation.

Native inventory currently supports exactly these delivered, unit-price conventions:

| Family        | Subtype             | Required convention                                                                                 |
| ------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `stock`       | `ordinary-share`    | `quantityUnit: "share"`, multiplier `"1"`, equal quote/settlement currency, delivered settlement    |
| `etf`         | `ordinary-etf`      | The same ordinary delivered-share convention                                                        |
| `crypto_spot` | `non-rebasing-spot` | Multiplier `"1"`, equal quote/settlement currency, delivered settlement, `metadata.rebasing: false` |

All native instruments require known quantity/price increments and `metadata.priceConvention: "unit-price"`, `metadata.settlementStyle: "delivered"`. Automatic inventory requires `holdingMode: "netted"`. Other asset families can be cataloged with `capability: "manual"`; nullable quote/settlement currencies, multiplier and increments preserve genuinely unknown metadata. A manual execution may have `price: null` and explicit actual cash effects. Known source quantity remains available while automatic basis/P&L stays unsupported with null values. Recording those facts does not enable an automatic derivative, fixed-income or custom valuation formula. Manual account valuation observations retain their definition and source; they do not silently override calculated NAV.

For native fills, actual quote price and booked settlement principal are distinct. Quantity × price × multiplier supplies theoretical quote notional; actual principal follows the pinned booking convention or explicit `principalReview` evidence. A native execution requires positive price, compatible increments and principal currency. Its principal creates cash once, normally in an automatically created unsettled bucket unless `cashBucketId` selects another compatible bucket. Settlement moves the existing signed obligation from unsettled to settled cash; it does not book another trade principal.

FIFO, eligible average cost and explicit specific-lot matching handle long/short, fractions, partial closes and both zero-crossing directions. Shorts retain positive opening proceeds and a signed holding liability. `closeOnly` prevents an unintended opposite opening. Specific selection names available lot IDs and exact quantities. Opening-lot events carry reviewed provenance and can omit entry price or principal; quantity stays recordable while affected basis/P&L remains unavailable. Missing fees also prevent a complete net result: explicitly declare `costsComplete` when supported by source coverage.

Automatic securities-short inventory requires explicit immutable instrument metadata `shortConvention: 'borrowed-delivery'` and `carryCostPolicy: 'explicit-source-charges'`, alongside the ordinary delivered share/ETF convention. Actual financing/borrowing charges still come from source fees; these declarations do not estimate buying power or borrow availability. `allowShort` stores account policy; it does not reject actual source facts or implement the later risk-control workflow. Missing conventions preserve actual cash and quantity with unsupported automatic metrics. Non-rebasing crypto spot supports native longs; crypto short/lending wrappers remain unsupported even if arbitrary metadata labels describe borrowing. Later catalog versions cannot retroactively supply missing original short conventions.

Opening-lot entry price and booked principal, when supplied, must be positive under the approved baseline. Omitting them represents unknown basis, not known zero basis. Gifts/rewards or other genuine zero-basis acquisition conventions require a later reviewed event path; this command does not infer their economics.

Fees keep their own identity, original amount/currency and charged instant, including signed rebates. Consumed, remaining and campaign cost partitions conserve each source charge independently. Third-currency net results require compatible pinned `nativeFx` or `reportingFx`; a missing translation does not remove the cost or turn the result into zero. Standalone carrying costs can be attributed to a lot, realized match or explicit unassigned residual with a versioned `fee-attributions` command. Attribution never rebooks cash.

Account settings are effective versions. Existing history permits a reviewed prospective FIFO-to-eligible-average transition at an unambiguous boundary; incompatible matching/holding changes require a separately reviewed transition. Instrument unit, multiplier or monetary-unit transformations cannot rewrite existing economics through an ordinary metadata version.

## Transfers, campaigns and corrections

`bucket-movements` supports synchronous same-currency internal cash transfers, bucket reclassification and execution-linked settlement. `holding-transfers` synchronously moves selected available lot slices between compatible native netted accounts in the same environment, preserving basis, cost, acquisition FX and lineage. Transfers create no fictitious sale or consolidated external contribution. Delayed departure/receipt and persisted cash/holding transit are disabled; the separate cash/transit pure-kernel fixture does not implement that workflow.

Orders are intent; amendments retain instruction history. Actual executions determine holdings and fill status, including recorded overfills or fills after terminal intent. Trades are minimal campaigns with account/instrument legs, separate from account holdings. Each accepted execution initially has an explicit unassigned allocation. `execution-allocations` appends a reviewed quantity partition and matching source-cost partition, retaining a residual. Campaign matching uses FIFO within each campaign leg/account/instrument pool, independently of account inventory policy. The campaign/account bridge explains their differing basis and realized results, including opposing analytical claims. Campaign exposure is attribution, not another broker holding.

Closure is explicit through `trades/{id}/closures` with `expectedRevision`, `reason` and `obligationEvidence`. It requires assigned activity, zero remaining quantity in every leg and no unresolved assigned unsettled cash obligation. A planned campaign without activity can be canceled. New allocations to a closed campaign are rejected; a new idea is required. Corrections that invalidate a recorded closure leave `closureReviewRequired` visible instead of silently redefining completion.

`execution-corrections` appends a replacement, execution supersession and monetary reversal/replacement, then synchronously rebuilds affected inventory and allocations. Quantity changes with campaign allocations require explicit `replacementAllocations`. Confirmed bucket settlement blocks an isolated correction with `DEPENDENT_SETTLEMENT_REVIEW_REQUIRED`, pending grouped source/settlement restatement. Acquisitions with holding-transfer descendants return `DEPENDENT_LINEAGE_REVIEW_REQUIRED`; automatic multi-account lineage restatement remains deferred. These guards preserve actual settlement and transferred basis evidence. Source history, fees and previous allocation versions remain inspectable.

## API resources and filters

All resource paths below are relative to `/api/v1/workspaces/{workspaceId}/financial`. The [strict schemas](../packages/contracts/src/financial.ts), [OpenAPI document](../packages/contracts/openapi.json) and [generated TypeScript contract](../packages/contracts/src/generated/api.d.ts) define exact fields. Run `corepack pnpm api:generate` after intentional contract changes and `corepack pnpm api:check` to detect drift.

| Operation                      | Paths                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET catalog lists              | `currencies`, `brokers`, `accounts`, `instruments`, `orders`, `trades`                                                                                              |
| GET catalog details            | `currencies/{id}`, `accounts/{id}`, `instruments/{id}`, `orders/{id}`, `trades/{id}`, `trades/{id}/legs`                                                            |
| POST create catalogs/intent    | `currencies`, `brokers`, `accounts`, `instruments`, `orders`, `trades`, `trade-legs`, `cash-buckets`                                                                |
| POST append versions/lifecycle | `currencies/{id}/conventions`, `accounts/{id}/settings`, `instruments/{id}/versions`, `orders/{id}/amendments`, `trades/{id}/closures`, `trades/{id}/cancellations` |
| POST archive catalog header    | `{currencies\|brokers\|accounts\|instruments\|trades}/{id}/archive`                                                                                                 |
| POST financial facts           | `cash-movements`, `fees`, `fx-conversions`, `bucket-movements`, `executions`, `opening-lots`, `holding-transfers`                                                   |
| POST reviewed revisions        | `execution-corrections`, `execution-allocations`, `fee-attributions`                                                                                                |
| POST observations              | `fx-observations`, `price-observations`, `account-valuations`                                                                                                       |
| GET financial results          | `executions`, `positions`, `cash-balances`, `fees`, `campaign-inventory`, `valuation`, `account-valuations`                                                         |

Catalog lists accept `includeArchived=true|false` and `limit` (1–200); accounts additionally accept `environment=live|paper`. Execution history accepts `accountId`, `afterId`, `includeSuperseded=true|false`, `limit`; its cursor must belong to the selected account. Positions accept `accountId` and `instrumentId`; campaign inventory additionally accepts `tradeId`. Fees accept `accountId`. Cash balances accept `accountId`, `asOf` and `sourceRevision`. Account valuation observation history accepts `accountId`, `asOf`, `includeSuperseded` and `limit`. Unknown query keys are rejected. Catalog/execution/observation pages are capped; position, campaign, fee and balance queries return their requested scope. Large-history performance and full-history exports remain unverified later work.

Valuation requires explicit known `accountIds` (comma-separated, 1–100 IDs), `reportingCurrencyId`, `asOf`, `fxPolicyId`, `fxMaxAgeMilliseconds`, `fxSourcePriority`, `priceMaxAgeMilliseconds` and `priceSourcePriority`. No provider, source priority or acceptable age is assumed. FX selects identity, then eligible direct, then eligible inverse; within a route it orders configured sources, latest eligible time and stable ID. Prices use configured source priority, eligible time and stable ID. Future observations and observations outside the declared freshness window cannot supply the mark. Triangulation and date-only inferred ordering remain disabled.

## Manual API example

Use an authenticated browser on the configured application origin. Replace `workspaceId` with an owned workspace ID. The browser supplies its session cookie and Origin; the following helper obtains the session CSRF proof without printing credentials. Retain one command ID and the same body when retrying a request whose outcome is uncertain.

```js
const workspaceId = 'REPLACE_WITH_WORKSPACE_UUID';
const base = `/api/v1/workspaces/${workspaceId}/financial`;
const session = await fetch('/api/v1/session', { credentials: 'same-origin' });
const csrf = session.headers.get('x-csrf-token');
if (!session.ok || !csrf) throw new Error('Sign in before issuing financial commands.');

async function command(resource, body, commandId = crypto.randomUUID()) {
  const response = await fetch(`${base}/${resource}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      'Idempotency-Key': commandId,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}

const usd = await command('currencies', {
  namespace: 'ISO-4217',
  code: 'USD',
  kind: 'fiat',
  unitIdentity: 'USD',
  name: 'US dollar',
  displayScale: 2,
  settlementIncrement: '0.01',
  effectiveAt: '2026-01-01T00:00:00Z',
});
const account = await command('accounts', {
  name: 'Manual paper account',
  environment: 'paper',
  accountType: 'cash',
  baseCurrencyId: usd.id,
  inventoryMethod: 'fifo',
  allowShort: false,
  holdingMode: 'netted',
  effectiveAt: '2026-01-01T00:00:00Z',
});
const cash = await command('cash-buckets', {
  accountId: account.id,
  currencyId: usd.id,
  kind: 'settled',
});
await command('cash-movements', {
  accountId: account.id,
  cashBucketId: cash.id,
  currencyId: usd.id,
  amount: '1000',
  kind: 'deposit',
  economicAt: '2026-01-02T09:00:00Z',
  orderingKey: '1',
});
const instrument = await command('instruments', {
  name: 'Example ordinary share',
  family: 'stock',
  subtype: 'ordinary-share',
  economicIdentity: 'manual-example-share',
  quantityUnit: 'share',
  quoteCurrencyId: usd.id,
  settlementCurrencyId: usd.id,
  multiplier: '1',
  quantityIncrement: '0.001',
  priceIncrement: '0.01',
  capability: 'native-linear',
  effectiveAt: '2026-01-01T00:00:00Z',
  metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
});
await command('executions', {
  accountId: account.id,
  instrumentVersionId: instrument.versionId,
  side: 'buy',
  quantity: '2.5',
  price: '100',
  cashBucketId: cash.id,
  costsComplete: true,
  economicAt: '2026-01-02T10:00:00Z',
  orderingKey: '2',
});
await command('price-observations', {
  instrumentVersionId: instrument.versionId,
  currencyId: usd.id,
  price: '110',
  observedAt: '2026-01-02T11:00:00Z',
  source: 'reviewed-manual',
});

const query = new URLSearchParams({
  accountIds: account.id,
  reportingCurrencyId: usd.id,
  asOf: '2026-01-02T11:00:00Z',
  fxPolicyId: 'manual-example/1',
  fxMaxAgeMilliseconds: '3600000',
  fxSourcePriority: 'reviewed-manual',
  priceMaxAgeMilliseconds: '3600000',
  priceSourcePriority: 'reviewed-manual',
});
const valuation = await fetch(`${base}/valuation?${query}`, { credentials: 'same-origin' });
const result = await valuation.json();
```

With these complete same-currency inputs the expected cash is USD `750`, quantity `2.5`, gross basis USD `250`, marked holding value USD `275`, unrealized gross/net USD `25`, and NAV USD `1025`. The selected age window is this example's explicit policy, not an application default. The example creates real paper facts in the selected workspace and does not seed a production account or place a broker order.

## Historical views and retained limits

Valuation uses a read-only repeatable-read snapshot, returns the current workspace `sourceRevision`, and replays facts through the requested economic `asOf`. It returns calculation manifests, price dependencies, selected FX dependencies and inventory observation references. Corrections produce a new current-revision restatement of a past as-of instant. Pinned acquisition/realization/cost FX is validated against a compatible tenant observation no later than its economic event; later observation corrections do not rewrite those accepted rate inputs. Persist a returned result externally if comparing it with a later view: archived report generation/retrieval is not implemented. Cash-balance `sourceRevision` is a narrower historical-posting filter, not a complete archived valuation service.

Unknown prices, basis, FX, costs or unsupported operations yield explained unavailable metrics with `value: null`, or an explicitly partial NAV with missing references. They do not become financial zero. Full strategies/frozen plans/risk, universal imports/reconciliation, advanced native event modules, broker integrations, dashboards/performance analytics/jobs, exports and tested restore remain later work. Ledger outbox intent and calculation manifests establish a foundation for those workflows; they do not claim their implementation.
