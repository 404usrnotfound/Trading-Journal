# ADR 0004: Deterministic financial kernel and balanced cash ledger

- **Status:** Accepted by user; implementation tracked in scaffold validation and development plan
- **Date:** 2026-10-06
- **Scope:** Financial numeric contracts, cash/control postings, atomic financial commands, correction history, and calculation-versioned projections.
- **Requirements decisions:** D-03, D-04, financial invariants in D-07, and D-13 in [the requirements analysis](../requirements-analysis.md).

## Context

The application must explain cash movements independently of trading ideas, orders, fills, derived holdings, and valuation observations. It must support fractional quantities, crypto, multiple currencies, shorts, instrument-specific settlement, shared executions, and auditable corrections. A stock purchase formula cannot determine the cash behavior of futures, inverse contracts, options, or fixed income.

Financial outputs must be deterministic, independently testable, and reproducible after backup/restore under the same calculation version. Posted records must remain traceable when imports are corrected, allocations change, or calculations are upgraded. Missing information must produce unavailable results instead of fabricated money.

The technical baseline is a modular monolith using full-stack TypeScript, Next.js App Router/React, Node.js 24 LTS, PostgreSQL 17, Drizzle with node-postgres, Zod contracts, and Decimal.js. Web and worker processes use the same versioned domain code. PostgreSQL-backed pg-boss handles background jobs; Redis is not required. This ADR proposes financial boundaries within that baseline. It does not define every instrument formula or metric.

## Decision

### 1. Use typed decimal strings at every financial boundary

Persist canonical financial scalar values using PostgreSQL `NUMERIC(78,36)`: up to 42 integral digits and 36 fractional digits. This is the common storage envelope for quantities, prices, monetary amounts, rates, contract factors, and derived financial scalars. Instrument and currency metadata may impose stricter business increments; the database scale is not a currency's spendable increment or display precision.

Use Decimal.js for financial arithmetic with an isolated, explicitly configured context: 160 significant decimal digits, round-half-even as the default for documented derived-value boundaries. Do not mutate a process-global rounding configuration. Instrument modules may specify a different verified settlement convention, recording that convention in their calculation version.

Financial HTTP/JSON fields, database-driver values, import normalization, and worker payloads carry decimal strings, not JavaScript numbers. Drizzle/node-postgres must leave `NUMERIC` values as strings. Zod validates bounded lexical inputs and constructs canonical values without a binary floating-point intermediate. Display/chart adapters may convert an already calculated value for plotting only; these conversions must never feed accounting or exported financial calculations.

At a source-write boundary:

1. Preserve the original source text and its parsing convention as provenance.
2. Normalize sign, decimal separator, and insignificant leading/trailing zeros according to the reviewed input contract.
3. Reject non-finite values, more than 42 integral digits, or any nonzero digit beyond the 36th fractional place before PostgreSQL can round/coerce them. Trailing zeros do not make an otherwise representable value invalid.
4. Apply the currency/instrument's separate valid-unit and lot-increment checks.

An overprecision import row remains preserved and visibly invalid until explicitly corrected or reviewed. There is no silent truncation or automatic change to source amounts. Rounding a genuinely overprecise input requires a reviewed normalization/correction with the original retained, not a permissive database cast.

For calculated values, 160-digit working arithmetic is an explicit approximation policy for divisions and long operation chains, not a claim of arbitrary exactness. Persisting a nonterminating derived rate or ratio uses an explicitly named quantization boundary, retains its inputs and calculation version, and records the rounding convention. Calculations with representability overflow fail with a reason; they do not clamp, truncate, return zero, or masquerade as supported results.

### 2. Separate source precision, booking precision, and display precision

Keep these three boundaries distinct:

| Boundary | Rule |
| --- | --- |
| Source | Retain accepted economic quantities/amounts at their original representable precision and preserve the raw source. |
| Booking/settlement | Apply the currency or validated instrument/broker settlement rule only when creating an actual booked amount. Broker-reported actual charges take precedence over planning estimates. |
| Derived persistence | Quantize only at a documented output boundary within the storage envelope; retain calculation inputs and version. |
| Display | Locale-aware formatting may round visually without changing source or booked records. Exports distinguish original/booked and formatted values. |

Costs are partitioned in the original charged currency. When a booked charge cannot divide evenly among execution allocations, allocate the remainder deterministically using stable allocation IDs and a documented remainder rule. The allocated pieces plus the explicit unallocated remainder must equal the original charge exactly. Never round each piece independently and lose or create money.

### 3. Implement a cash/control ledger, balanced separately by currency

The ledger explains cash, settlement, and collateral movements. It is not a jurisdiction-specific tax general ledger, and it does not treat a security position as a cash posting. Holdings, cost basis, exposure, and marked asset values are governed by instrument and lot modules and reconciled with the ledger.

Each posted ledger event has stable workspace ownership, economic classification, source links, recorded/effective times, and at least two signed postings. A positive posting increases a cash bucket when that posting targets cash; a negative posting decreases it. For **each currency within each event**, the exact sum of all its postings must be zero. Amounts in different currencies are never summed or translated to make an event appear balanced.

The posting targets are:

- Actual cash buckets by account and currency, including settled, unsettled, and separately identified cash collateral/restricted cash where supported.
- Named control buckets explaining the counterpart: external contribution/withdrawal, trade settlement, fee/carrying cost, income/withholding, internal transfer, FX exchange, or explicitly unresolved source classification.

Control buckets provide an auditable counterpart and classification. They are not independently added to account NAV as another asset or deducted from P&L a second time. Total cash uses the relevant cash buckets; equity also requires compatible holding valuations and explicit liabilities from validated modules or broker observations. Buying power and broker margin remain observations, not fabricated values inferred from these controls.

Illustrative postings, omitting timestamps and ownership:

| Event | Cash posting | Control posting | Currency |
| --- | --- | --- | --- |
| Deposit 1,000 | Settled cash `+1000` | External contribution `-1000` | EUR |
| Known equity purchase obligation 110 | Unsettled cash `-110` | Trade settlement `+110` | USD |
| Actual commission 2 | Relevant cash bucket `-2` | Fee `+2` | EUR |
| Exchange source amount 1,000 | Settled cash `-1000` | FX exchange `+1000` | EUR |
| Exchange destination amount 1,100 | Settled cash `+1100` | FX exchange `-1100` | USD |

The last two rows are separate currency legs of one FX event; any fee adds its own balanced currency leg. The actual rate and source/destination amounts are retained on the conversion record. Reporting translation does not create ledger postings.

A settlement transition moves the known obligation/receivable between unsettled and settled cash buckets with equal-and-opposite postings. An expected settlement date alone is not evidence that settlement occurred. Product-specific actual settlement, cash collateral, variation margin, premiums, accrued interest, exercise, and funding require a validated event handler or explicit broker/manual settlement. Futures notional is never booked as a full purchase debit by default.

An internal cash transfer links its source and destination legs under one transfer identity. Each leg balances in its own account/currency, while consolidation cancels internal-transfer effects rather than treating them as external performance flows. A currency-changing transfer includes a separately modeled actual conversion. Transfers of holdings are noncash inventory events preserving lot lineage, not synthetic sales or deposits.

### 4. Make financial source records immutable after posting

Financial source events, their booked postings, and accepted financial allocation versions are append-only once posted. Drafts may be edited with optimistic revision checks before they are finalized. Nonfinancial mutable preferences are not ledger events.

Correct a posted ledger event by appending a linked reversal and, when appropriate, a replacement. The reversal uses the exact negated original postings; replacement amounts are independently validated. The correction group, reason, actor, source revision, and original links are retained. A replacement must not simply overwrite the old event or reuse an old identity to hide the correction.

Distinguish an accounting-data correction from a new economic event. A real refund received later is dated as that new receipt. A historically wrong imported amount is corrected with its intended economic date plus the later recorded/audit date. Restated projections use the correction chain; an audit view can still show what was recorded before the correction. Reporting must label intentional restatement rather than suggesting old figures never changed.

For lot replay, resolve superseded/corrected source fill versions before matching inventory. A bookkeeping reversal of a defective purchase is not itself a new actual sale, and must not manufacture realized trading results. Original/reversal/replacement cash postings remain auditable and balanced independently of that effective-source selection.

A source fill's generated cash postings carry the fill/event identity and an economic-effect identity. An imported cash row referring to that same effect attaches reconciliation evidence or proposes a correction. It must not produce a second trade settlement or a second fee. Ambiguous matches stay in explicit review; a similar amount and timestamp alone do not authorize suppressing or duplicating activity.

An unsupported cash handler can accept the fill as a recorded/incomplete fact and link explicit manual settlements. It cannot post guessed stock-style money movements merely to make the ledger look complete.

### 5. Put financial invariants inside atomic server commands

All entry points—manual forms, imports, reviewed corrections, and worker actions—call the same financial command boundary. Authentication/authorization precedes it; commands resolve workspace-owned references on the server and never trust supplied ownership or derived totals.

A command commits its accepted source event/fill, versions, allocation changes, related postings, audit links, source revision increment, and durable recomputation intent in one PostgreSQL transaction. Either the dependent write set is valid and commits, or none of it commits. This does not require a whole uploaded file to be one long transaction; the import contract separately chooses reviewed atomic commit units.

Use database foreign keys, unique identities/idempotency constraints, and scalar checks. Cross-row invariants require locked aggregate validation and database enforcement where practical; a PostgreSQL row `CHECK` is not presented as enforcing sums across an allocation table.

For shared executions:

- Each allocated quantity uses the source execution's direction and a nonnegative magnitude.
- Sum of idea allocations plus explicit unallocated quantity equals the source magnitude; no opposing allocation can hide over-allocation.
- Each original fee/cost is partitioned by cost identity and charged currency; allocated costs plus the unallocated remainder equal that source cost.
- Lot consumption cannot exceed eligible inventory under the selected accounting policy. Idea assignment does not independently consume another copy of the same inventory.

Use ordered row locks on the affected account/instrument accounting aggregates for lot consumption, shared allocations, linked transfers, and corrections. Commands touching several scopes acquire locks in one documented order and increment workspace financial source revision in a consistent transaction order. Clients include expected revisions for contested edits. Retry serialization/deadlock failures only with bounded retries and the same idempotency key; a retry cannot create a second financial effect.

Invariant-critical lot consumption and remaining inventory are validated synchronously against the canonical source revision while those locks are held. Maintain/update the affected canonical inventory slice in the source transaction, or reconstruct and validate that slice from authoritative events before accepting the write. An asynchronous analytics projection is never evidence that inventory is available. A pending correction/rebuild must cause a canonical-slice rebuild or an explicit conflict/blocked command, not an over-consumption accepted against stale balances.

The implementation must test concurrent commands, not merely sequential validation. Short, bounded commit units keep account locks out of file parsing, external requests, and long recalculation work.

### 6. Version deterministic projections independently of source truth

The financial kernel is a server-side, side-effect-free domain library. It takes explicit immutable inputs, calculation-module versions, policy versions, reporting context, and an as-of boundary. It does not access the wall clock, external providers, mutable defaults, browser state, or an LLM to obtain missing operands. Stable economic ordering and stable tie-break IDs make replay deterministic.

Source events/observations and correction chains are authoritative. Positions, lot realization, cash balances, P&L, exposure, and analytics are reproducible projections or explicitly imported observations with provenance; they are not silently interchangeable sources.

Identify a projection by workspace/scope, source revision, calculation manifest, accounting/risk policy versions where relevant, reporting currency/FX selection context, and as-of interval. A calculation manifest identifies the financial-kernel release and constituent instrument/rule/metric algorithms, precision/rounding policy, and required schema version. Changing an algorithm creates a new manifest, not an invisible change to old output semantics.

Materialize expensive projections in PostgreSQL and index their scoped query paths. Invariant-critical checks and affected canonical inventory are synchronous. Broad rebuilds, historical restatements, and large analytics run through pg-boss workers using the same kernel. Insert a domain outbox record with a stable event ID inside the source transaction. The same worker process dispatches outbox records to pg-boss at least once, and consumers use stable identities/revision keys to make duplicate delivery harmless. Do not rely on an HTTP request successfully enqueueing after its source transaction has committed; there is no distributed dual-write or exactly-once claim.

A worker reads a coherent source revision, builds into a new projection generation, and publishes it atomically only if its expected source/context generation remains current. An older completed job may be retained as historical output but cannot overwrite a newer generation. Jobs have bounded retries, recorded failure states, and no assumption of exactly-once delivery.

Until the requested generation is available, expose pending/failed/stale status and its source revision. Do not present a stale projection as current or silently merge parts from different generations. Ledger writes remain durable if an asynchronous projection fails.

Corrections invalidate the affected scope from the earliest economic boundary whose lots, rates, settlement, or attribution changed. The dependency graph must include cross-account transfers and shared allocations. Prefer a conservative wider rebuild over an apparently precise but incomplete invalidation.

Backup/restore includes source/correction history and calculation manifest. Rebuilding with the same compatible calculation version must reproduce totals. If that version is unavailable, restore may preserve records, but financial recomputation is visibly blocked; it must not claim the same totals using a silently substituted algorithm.

## Alternatives

| Alternative | Reason not selected |
| --- | --- |
| JavaScript `number` or JSON numeric fields for accounting | Binary floating-point and automatic parsing can change money before validation. |
| Store only currency minor units as integers | Useful for booked fiat cash, but insufficient as the sole model for fractional quantities, price scales, FX, inverse contracts, and crypto. Currency increments still apply at booking boundaries. |
| Unbounded PostgreSQL `NUMERIC` with unconstrained incoming strings | Avoids a fixed envelope but makes resource use and cross-runtime arithmetic harder to bound. Explicit high precision plus rejection is easier to validate and operate. |
| PostgreSQL `money`, or per-currency posting scales only | Ties money representation to locale/scale and cannot represent all required quantity/rate/price inputs. |
| General accounting/tax GL for all instruments at the outset | Expands scope into tax classifications and full security accounting. The selected cash/control ledger plus lot/valuation modules meets the journal's defined boundary without unsupported compliance claims. |
| Single reporting-currency balancing | Loses native cash conservation and makes a rate-setting change alter accounting truth. |
| Mutable transaction rows and cascading deletion | Hides the source of corrections, breaks reconciliation lineage, and makes audit/replay unreliable. |
| Fully event-source every application field | Adds replay complexity to drafts/preferences without improving the required financial invariants. Append-only financial facts and versioned policies are sufficient here. |
| Compute all history on every request, or use Redis as source of balances | Unbounded request cost or a second state system is unnecessary. PostgreSQL projections and jobs preserve one durable source. |

## Consequences

- Numeric APIs and form validation are more explicit; decimal strings must not accidentally become numbers in client or ORM adapters.
- Every posted cash event has a visible native-currency explanation and exact balance check. Control balances alone do not establish equity, profit, or broker margin.
- Audited corrections can restate derived history while preserving the original recorded facts and old calculation context.
- Allocation, posting, source identity, and correction concurrency need meaningful integration tests and some custom SQL/constraint logic alongside Drizzle.
- Projection generations, manifests, and outbox intents add schema and worker complexity but make stale/failing computations observable and prevent old jobs from publishing over new state.
- Fixed precision limits are deliberately conservative, not proof that every possible custom formula is safe. Product/module support is restricted to validated conventions; unsupported inputs remain honestly unavailable.
- This is a proposed architecture only. No library is installed, ledger/schema implemented, or financial scenario claimed to pass by this ADR.

## Validation

Before enabling financial writes, establish independent fixtures and tests for:

1. Decimal string round trips; 36-place fractional boundaries; 42-digit integral boundaries; rejection before database rounding; nonterminating derived ratios; locale parsing; display-only rounding; overflow and malformed inputs.
2. Currency-by-currency balance for deposits, withdrawals, fees in a third currency, actual FX exchanges, settlement transitions, collateral moves, and linked internal transfers. Changing a reporting rate creates no postings.
3. Source-fill and imported-cash reconciliation without a second cash/fee effect; exact reversal/replacement and recorded-versus-economic dates.
4. Shared fill quantities/costs, deterministic rounding residuals, short/partial lot consumption, and concurrent over-allocation/over-consumption attempts.
5. Atomic rollback of an intentionally invalid dependent write, duplicate request/import retries, and bounded transaction conflict retries.
6. Idempotent outbox/job delivery; overlapping source revisions; stale job publication prevention; visible projection failures; deterministic full versus affected-scope rebuild.
7. Backup/restore and replay using the same manifest, including correction chains and transferred lots. A missing compatible engine produces a truthful blocked calculation state.

Map these fixtures to AC-01–AC-04, AC-06, AC-09–AC-13, AC-15, and AC-16 in the requirements analysis. Instrument-specific acceptance additionally depends on ADR 0005's support contracts and the gated metric/module definitions below. These are planned checks, not completed verification.

## Unresolved domain gates

The numeric envelope, cash/control ledger, append-only correction pattern, command boundary, and projection architecture are selected defaults. These gates remain before their corresponding financial features can be accepted:

- **Posting/settlement catalog:** Verified per-instrument cash/settlement/collateral rules, supported settlement calendars, and how unknown/manual obligations are represented. No advanced handler becomes automatic without independent fixtures.
- **Allocation/lot conventions:** Detailed rounding remainder rule, supported short/average-cost conventions, fee-only correction handling, and transfer dependency behavior; see ADR 0005 for the selected inventory/idea boundary.
- **Metric dictionary:** Each metric's population, units, cost/FX inclusion, timing, rounding, unavailable/infinite states, and edge cases. This ADR does not turn a generic arithmetic function into a validated financial metric.
- **Correction and import UX:** Reviewed commit units, conflict resolution, safe downstream batch reversal, and economic identity matching. Reversal is not an authorization to delete dependent records.
- **Release/replay contract:** Calculation-manifest packaging, supported historical-engine retention, and tested migration/rebuild procedures. Compatibility must be established before a backup is claimed lossless financially.
- **Performance/concurrency budgets:** Seeded history scale, transaction duration/lock contention budgets, rebuild workload, and measured query limits. Any more granular locking or parallel rebuild scheme must preserve these invariants.

## References

- [Authoritative product specification](../../Trading_Journal_Codex_Prompt.md), especially §§2–5, 8–9, and 11–15.
- [Requirements analysis](../requirements-analysis.md), especially A-04–A-12, D-03–D-04, D-07–D-09, D-12–D-14, and D-20.
- [ADR 0005: Versioned domain and multi-currency reporting](0005-versioned-domain-and-multicurrency.md).
- [PostgreSQL 17 numeric types](https://www.postgresql.org/docs/17/datatype-numeric.html) and [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).
- [Decimal.js documentation](https://mikemcl.github.io/decimal.js/) for precision, rounding, string inputs, and isolated constructors.
