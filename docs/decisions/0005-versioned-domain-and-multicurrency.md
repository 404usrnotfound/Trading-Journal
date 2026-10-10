# ADR 0005: Versioned trading domain and multi-currency reporting

- **Status:** Accepted in Phase 1; documentation baseline, not currently implemented
- **Date:** 2026-10-06
- **Scope:** Domain boundaries, inventory versus idea attribution, temporal provenance, plans/risk/strategy history, instrument capabilities, and native/reporting-currency views.
- **Requirements decisions:** D-05–D-12 and temporal aspects of D-13 in [the requirements analysis](../requirements-analysis.md).

## Context

A trading journal must not confuse the decision to trade with instructions, actual fills, ownership of inventory, money movement, or later valuations. Several strategies may use the same instrument at once, a fill may serve several ideas, and a multi-leg idea may have obligations that outlive a simple sale. Active trading and investing need separate classification but consolidated holdings/account views.

Changing a strategy, instrument convention, display currency, price, or FX rate must not silently rewrite an old plan or financial result. Explicit corrections nevertheless need to restate affected projections with an audit trail. Different sources may report incompatible P&L, valuations, or margin figures; incomplete data cannot be converted into zero or a passed rule.

Every asset family listed by the specification must be recordable. Automatic calculations must be restricted to verified capabilities, with visible manual/broker-valued alternatives. This ADR establishes the version and attribution contracts needed by those capabilities. Detailed derivative formulas, financial metrics, and calendars remain gated before the affected implementation phases.

## Decision

### 1. Keep financial facts, decisions, inventory, and observations distinct

Use stable, workspace-owned identities and explicit links for these domains:

Canonical tenant-owned identities and foreign keys use `(workspace_id, id)`, with UUIDv4 domain IDs. Server resolution and database relationships include the workspace component, preventing an otherwise valid foreign ID from linking another workspace's record. Restore into a new workspace preserves domain IDs and remaps the workspace boundary rather than generating unrelated identities or retaining the source tenant's authorization.

| Concept | Authoritative meaning | Does not stand in for |
| --- | --- | --- |
| Broker/account | Venue relationship and custody/accounting scope, including cash, margin, paper, or historical/closed accounts | A trading strategy or campaign |
| Instrument/metadata version | Economic identity plus effective-dated units and settlement/calculation conventions | A mutable ticker string |
| Idea/campaign and legs | Trader decision/review unit; one or more instrument/account legs, classified as active trading or investing | Account-wide inventory or one fill |
| Plan/version | Declared thesis, intended entry/stop/target/size/cost/risk, and later amendment history | An actual execution |
| Order/version | Recorded instruction and its status/history | A filled position or live broker trading permission |
| Execution/fill | Actual source quantity/price/time and charges | A completed trade or an idea's entire history |
| Execution allocation | Partition of a source fill's quantity and costs among idea legs plus any unclassified remainder | A second independently owned fill |
| Lot/position | Account/instrument inventory and eligible cost-basis projection from fills/opening events/transfers/corporate actions | Strategy assignment |
| Ledger event/postings | Actual cash/control movement as defined by ADR 0004 | Notional exposure or a current valuation |
| Price/FX/account valuation observation | Timestamped sourced fact or explicitly calculated result with definition and quality | A correction to source fills or cash |
| Reconciliation | Comparison with a stated source and a variance/assessment | Automatic authority to overwrite financial facts |

Multi-account legs are permitted within an idea, but every fill, lot, and cash posting remains anchored to its actual account. All relationships preserve workspace ownership. Orders are journal records; this architecture does not authorize routing an order, placing a trade, or connecting live broker credentials.

Keep import templates/batches/source rows, audit/correction groups, strategy/setups/rules, journals/reviews/tags, attachments, and typed custom fields as separate linked entities. Account valuations and imported position snapshots retain their source definition; they do not overwrite internally derived inventory just because they are newer.

### 2. Separate account lot accounting from campaign attribution

The inventory accounting pool is account + instrument economic identity + compatible quantity/settlement convention. A metadata change that alters units cannot simply join old and new lots as if the quantities were comparable. Futures expiries and distinct option contracts have separate instrument identities; a roll links events instead of mutating the old contract.

Use FIFO as the initial prospective default for an eligible ordinary linear inventory pool. Support versioned policy overrides for appropriate average cost and explicit lot selection; average cost is enabled only for instrument/pool conventions whose fixtures validate it. Do not market these analytical methods as jurisdictional tax compliance.

When an execution closes inventory, consume lots once under the selected account/instrument policy. Its idea allocations independently partition the decision-making attribution of that same execution. Strategy-specific remaining exposure/cost attribution is a projection of conserved allocations; it cannot create a second account holding or override the account's source quantity.

An unallocated fill remains explicit unclassified activity. Partial idea allocation preserves a visible remainder. Quantity and cost conservation follow ADR 0004, including fees charged in another currency. Campaign results and portfolio lot realization may differ by attribution convention; labels and the metric dictionary must explain the bridge rather than presenting them as identical.

Changing a lot policy applies prospectively through a new policy version. An intentional historical change requires a reviewed restatement/rebuild; it is not a preference toggle that silently rewrites realized results. Internal holding transfers preserve original acquisition lineage, basis currency/amount and known/unknown status, lot-policy context, and quantity changes from valid corporate actions. They are not sales for consolidated analytics.

Opening holdings are explicit inventory-establishment events with a known basis or an unknown-basis status. An imported position row defaults to a broker observation/reconciliation input until the reviewed mapping explicitly designates it as opening inventory. Do not fabricate historical buys, profit, acquisition times, or cost basis to make a snapshot resemble complete history.

### 3. Model lifecycle, completeness, and reconciliation independently

Store separate dimensions:

- **Lifecycle:** planned, open, partially closed, closed, or canceled/no-execution, with logged transitions.
- **Completeness:** sufficient/complete for a stated operation or incomplete with missing fields/source history. `Imported-incomplete` is a visible import-origin/completeness condition, not a lifecycle replacement.
- **Reconciliation:** unassessed, variances present, or reconciled as of a named source/date/revision.

The default campaign closure policy requires an explicit completion confirmation and evidence that all assigned legs have no remaining exposure or unresolved supported settlement/exercise obligations. A sale or an individual fill is never itself proof that the campaign is complete. No-execution cancellation is distinct from a campaign that entered and later flattened. Reconciliation can become stale after a correction without changing the campaign's intended lifecycle.

Closure does not certify every metric. A closed imported campaign may lack charges or basis and be excluded from a particular completed-trade metric population; missing risk can leave R unavailable without making quantity closure impossible. Each metric declares its completeness gate.

Default renewed trading after a confirmed closure to a **new linked idea**, preserving the original campaign's period and review. The schema retains lifecycle history and a configured policy can support deliberate reopening after its transition/statistics rules are validated. A correction that reveals residual exposure invalidates closure eligibility and requests review; it does not quietly classify the corrected fill as a fresh independent trade.

### 4. Preserve economic time and recorded time

For financial records and observations, distinguish when the source says the economic event happened from when it was recorded/imported/corrected. Versioned metadata and policies additionally carry their effective interval. This provides historical source provenance and restated-current views without adopting full event sourcing for every journal draft or UI preference.

Canonical instant fields use UTC PostgreSQL `TIMESTAMPTZ(6)`. Retain the original timestamp text, supplied offset and/or IANA zone, source granularity, trade date, settlement date, observation time, and any explicit normalization decision. A date-only source has date-only precision; midnight must not be presented as an observed fill time. Finer source precision is retained in provenance and deterministic ordering rather than discarded invisibly.

Use a workspace IANA display timezone, with per-user display preferences where appropriate, and locale-aware date/number formatting. Display timezone changes do not change economic facts. Day/week/session risk and analytics boundaries reference a versioned evaluation calendar/timezone context, not the viewer's current browser zone. Ambiguous DST/import interpretations must be reviewed or explicitly labeled estimated.

Persist stable source ordering/tie-break IDs for events sharing a timestamp or lacking precise time. The detail of economically valid ordering for date-only settlement events is a domain gate; a stable arbitrary sort is not asserted to prove chronology.

### 5. Publish immutable calculation-relevant versions and snapshots

Instrument identity is stable; calculation-relevant metadata is published as immutable versions with effective intervals, recorded time, source, and status. Executions, settlements, lots, and valuations explicitly bind the metadata version used. Newly effective multipliers/units do not modify historical fills. A discovery that old metadata was wrong creates a corrected/superseding version and an audited affected-scope restatement.

Published strategy versions contain their rules, typed parameters, setup definitions/versions, eligibility, management/risk settings, and effective dates. A trade plan binds the actual strategy/setup version used, not whatever is now the latest. Draft strategy edits are permitted; publishing creates a new version. Referenced strategies/instruments are archived rather than deleted.

Keep configurable numeric/boolean/text parameters and custom-field definitions typed and validated. Automatic rule evaluation initially uses vetted predicates with declared inputs/operators and versioned parameters. Narrative or unsupported conditions remain manual assessments. An assessment carries manual/automatic origin, policy/rule version, input references, effective assessment time, and passed/failed/unknown with a reason. Missing inputs cannot imply pass. This is not a general-purpose user script engine.

Freeze an original pre-trade plan at its explicit commitment boundary, retaining the declared initial risk amount/currency/method and its provenance. Later modifications append plan/risk additions or management amendments. A late/imported plan is labeled retrospective; the user cannot manufacture an original pre-trade timestamp by assigning an earlier economic date.

Original initial risk remains the immutable historical R basis. Scale-ins, added legs, and later risk changes retain separate supplemental snapshots and labels instead of overwriting it. If no valid original initial risk exists, historical R is unavailable. The exact supplemental risk metrics, nonlinear scenarios, and currency translation rules require the metric/risk dictionary before calculation.

Version account and strategy risk policies. Assess both applicable levels without permitting a strategy setting to relax an account restriction. Compatible limits combine conservatively; incompatible units or missing/stale operands produce an unknown assessment with reasons. Actual activity can still be recorded when it breached a policy: the journal reports the breach instead of suppressing the truth. No default capital, numeric risk limit, or strategy is invented.

### 6. Use per-operation instrument capability contracts

All required asset families are recordable: stocks/ETFs/ETPs/funds; crypto spot/tokens with transfers/rewards; spot FX; exchange futures; linear/inverse crypto futures/perpetuals; options and multi-leg structures; bonds/bills/fixed income; CFDs/leveraged OTC; warrants/turbos/knockouts/factor certificates/structured products; and commodities/custom instruments.

Register each subtype through a vetted server module manifest and typed configuration. Its contract declares:

- Identity, required metadata and validator version; units, quote/settlement/collateral currency roles, multiplier/ticks/price scale, expiry and applicable underlying/option/settlement conventions.
- Supported event types, including record-only types, and source/manual requirements.
- Valuation, cash-flow/settlement, lot/basis, exposure, and planned-risk capabilities with calculation/module versions and required inputs.
- Independent test fixtures and authoritative convention references before automatic capabilities are enabled.
- A structured result containing value(s) and units, gross/net and realized/unrealized basis where applicable, source/metadata/observation references, completeness/quality status, or an unavailable/unsupported reason.

Publish capabilities per **subtype and operation**, not one optimistic asset-class badge. Preserve the specification's three visible levels: validated native automatic support; broker/manual-valued recording and compatible analysis; unsupported automatic calculation with a visible reason and safe manual fallback. Manual settlements, notes, documents, and review must remain functional at the latter levels.

Ordinary linear modules are the initial native baseline. Exact subtypes and formula fixtures must be named in the capability matrix before their feature phase. Advanced derivatives/fixed income/custom products may use explicit broker values or settlements pending validation. An options record with manual settlement is not advertised as automatic exercise/assignment; an inverse perpetual is not advertised as a linear contract.

Use vetted modules, not arbitrary uploaded JavaScript. A constrained expression language is a possible later separately reviewed extension, not an implicit first-release requirement. Adding a subtype uses the registration contract instead of changing every consumer or broker adapter.

### 7. Keep native cash/asset units independent of reporting currency

Each account declares an account/base currency but may hold multiple native currency balances. The registry supports explicitly defined fiat and other supported currency units; a currency ID is not inferred from a hardcoded USD/EUR enum or ambiguous ticker. Crypto token holdings and currency balances must have an explicit economic classification so the same asset is not counted twice.

Workspace reporting currency is a versioned reporting preference/context. It changes the requested view, not original fills, fees, lots, or ledger postings. Native amounts remain available even when reporting conversion is unavailable.

Actual currency conversion is an immutable financial event carrying source/destination amounts and currencies, actual rate/direction, fee and fee currency, account, economic date/time, and source reference. Its amounts generate the native currency legs described by ADR 0004. The actual exchange rate is never replaced by a market/reference translation rate.

FX observations have explicit base/quote currency IDs (`quote units per one base unit`), value, timestamp, original precision, source, and quality/status. Rate selection creates a persisted reporting dependency/reference for the execution, cash event, or valuation context. It records whether a direct, inverse, or configured triangulated rate was used, including the component observation IDs and derived rounding convention.

Choose deterministic as-of lookup under a versioned workspace rate-selection policy: explicit reviewed event rate first for that translation context; otherwise eligible sourced observations no later than the economic/valuation instant within the allowed freshness window. No implicit future-rate lookup, silent interpolation, or default `1` for a different currency. Same-currency translation is an explicit identity operation. Missing or stale rates remain unavailable unless a user supplies an explicitly labeled manual observation.

Configured triangulation may use a named pivot and bounded acyclic path with time/freshness checks. It is disabled until its fixture/selection policy is validated. Adding a provider or changing route priority creates a new rate-selection version; it must not silently overwrite pinned historical reporting dependencies.

Existing reporting results retain their historical observation/version references. A corrected historical rate or a newly supplied missing rate enables an explicitly revised reporting generation with provenance; it does not erase the previous observation. Current marks/rates can change current unrealized views without modifying already recorded historical rates/results.

### 8. Choose transaction-anchored FX attribution and report sufficiency

The default reporting method translates original basis and each actual dated movement at its own pinned historical rate. Native trading results are translated at realization/valuation time; the remaining currency effect from translating the underlying basis is presented separately. Cash currency effects are separate from instrument trading effects. This is analytical performance attribution, not tax FX accounting.

For a simple single-currency linear holding, before fees and with one known basis, the contract can be illustrated using:

- `B`: native cost basis; `V`: native realization/mark value.
- `r_basis`: reporting units per native unit at acquisition; `r_end`: the realization/valuation rate.
- Native trading result: `V − B`.
- Reporting trading component: `(V − B) × r_end`.
- Holding FX component: `B × (r_end − r_basis)`.
- Their sum: `V × r_end − B × r_basis`.

This illustration fixes the allocation of the price/FX cross term to the trading component; it is not a universal derivative P&L formula. Multiple lots/fills preserve their own historical basis/rate references. Source-currency fees/carrying costs and actual conversion costs retain their dated charged-currency rates and explicit classification. Cash FX basis and movement history must bridge acquisition/disposal/transfer of currency units without counting the holding's FX effect twice. These detailed fixtures and rounding rules are gates before enabling the result, not untested promises.

Expose native trading P&L, reporting-currency trading P&L, holding/cash FX effects, costs, external flows, and total account change as separately labeled components. Consolidated internal transfers are not external flows. Every bridge requires compatible instrument cash/valuation definitions and sufficiently complete opening/ending observations and event history.

A reconciliation residual is reported as an unexplained variance when data is incomplete or definitions conflict; it is not automatically renamed FX profit. Broker-reported totals are independently sourced observations unless their metric definition is compatible with the chosen calculation basis. Selection/override requires a visible reason and never merges unlike gross/net or realized/unrealized definitions.

Financial and metric results carry typed availability and provenance. Unknown basis, missing original risk, unsupported valuation, absent/stale price/FX, insufficient path/history, undefined ratios, and incomplete charges retain distinct reasons. A zero is valid only when the defined metric has enough data to establish zero. Native gross results may be available while native net/reporting results are unavailable because a fee is in another currency. Population/sample/completeness disclosures follow the metric dictionary.

## Alternatives

| Alternative | Reason not selected |
| --- | --- |
| One mutable trade row containing orders, fills, holdings, cash, and results | Cannot represent multi-leg ideas, shared fills, partial exits, corrections, or distinct source/derived truth. |
| Strategy-specific inventory pools as the account ledger | Duplicates ownership or makes strategy tagging change actual holdings and cost basis. |
| A single state enum for open/closed/incomplete/reconciled | Loses combinations such as closed-but-incomplete or open-and-reconciled; correction freshness is independent of lifecycle. |
| Edit metadata/strategy/risk rows in place and resolve latest values at calculation time | Changes historical plans, units, and R denominators when settings change. |
| Always reopen the old campaign after every subsequent same-symbol fill | Merges unrelated decisions and changes completed-trade populations unexpectedly. Linked new campaigns are the safer default. |
| Translate all history at the latest reporting FX rate | Rewrites past performance and cannot explain distinct actual currency exchanges or FX effects. |
| Treat reporting-currency P&L as native P&L times one current rate | Loses dated basis and fee/cash translations; it does not reconcile account change. |
| Broker-provided figures always override internally calculated figures | Broker definitions may be incomplete or incompatible; provenance and a stated basis must precede comparison/selection. |
| Require native automatic pricing for all asset families at first delivery | Contradicts the explicit staged/manual support policy and encourages incorrect formulas. All-family recording still remains mandatory. |
| User-defined arbitrary code for formulas and rules | Violates the security requirement and prevents reliable versioned validation. |

## Consequences

- The domain contains more explicit relationships and version references than a simple trade CRUD application, but can represent shared executions and multi-asset money movements faithfully.
- Portfolio inventory, campaign attribution, and source observations can be reconciled rather than forced into identical definitions.
- Frozen snapshots and dual time provenance support honest plan-versus-actual and retrospective analysis; audited corrections can restate results without losing earlier facts.
- View/query keys must include relevant policy, reporting currency, FX selection, metadata, and calculation versions. A display preference is not a financial migration.
- Configurable fields/rules require typed/versioned validation, and automatic evaluation needs explicit required-input contracts.
- Manual workflows remain first-class. Unsupported automatic features return reasons and compatible manual outputs rather than fake numbers.
- FX attribution and cash/holding history require independently verified reconciliation fixtures before activation. A current exchange-rate endpoint alone is insufficient.
- These are accepted architectural decisions documented in Phase 1. No currently retained schema, module, rule engine, metric, or provider integration is claimed implemented or validated by this ADR.

## Validation

Before accepting the relevant feature phase, test:

1. Two strategies sharing one instrument and one source fill: execution/cost conservation, separate idea attribution, and one account inventory pool.
2. Multi-leg partial closure, confirmed completion, canceled orders, incomplete imported campaigns, stale reconciliation after correction, and linked new/reopened campaign policies.
3. Metadata/strategy/policy publication without historical mutation; retrospective plans; immutable original risk with supplemental scale-in/leg changes; manual/automatic/unknown rule assessment.
4. FIFO, eligible average cost and explicit lot matching; known/unknown opening basis; cash and holding transfers preserving lineage and not generating consolidated trade profit/external flows.
5. All-family recordability and per-operation capability display. Unsupported structured-product/inverse/fixed-income calculations still support source/manual settlements and useful unavailable states.
6. EUR funding, two actual EUR/USD exchanges with fees, USD equity partial exits, and later marks/rates. Native balances and the reporting/FX/cost bridge reconcile; changing today's rates does not overwrite pinned history.
7. Missing third-currency fee rates, prices, original risk, basis, granular MAE/MFE paths, and conflicting broker valuation definitions. Available components remain useful; absent components do not become zero.
8. Source offset/IANA/DST cases, date-only imports, separate trade/settlement/valuation times, and shared filter/risk period context.
9. Deterministic replay/restore under the same source/policy/metadata/FX/calculation context; correction-restated and earlier recorded views remain distinguishable.

Map these tests to AC-01–AC-13, AC-15, and AC-16 in the requirements analysis. Workspace authorization for every referenced record remains an independent mandatory check under AC-14. These are planned validations, not completed checks.

## Domain resolution and remaining feature gates

Phase 2's [domain model](../domain-model.md), [calculation contracts](../financial-calculations.md), [capability design](../instrument-capabilities.md), and [fixtures](../financial-fixtures.md) supply the core relationship, posting, attribution, risk, metric and temporal definitions below. [ADR 0009](0009-financial-domain-contracts.md) records the refinements for review. The original Phase 1 gate list is retained here for traceability; operation-specific advanced conventions and executable validation remain explicit in the Phase 2 documents.

This ADR selects the domain separation, FIFO default/override boundary, immutable version/snapshot model, independent states, linked-new-campaign default, capability interface, and FX reporting architecture. Resolve the following before the corresponding features are implemented/accepted:

- **Instrument/module conventions:** The exact subtype/metadata boundaries within the selected initial ordinary equities/ETFs and crypto-spot native baseline, verified quantity/price/basis formulas, short/average-cost eligibility, and supported option/futures/perpetual/fixed-income events. Every family still needs functional recording/manual settlement.
- **Campaign completion details:** Capability-specific residual obligations, multi-account close confirmation, corrections that invalidate closure, and validated reopening transition/statistics policy.
- **Risk/rule dictionary:** Supported predicate operators/input completeness, time/calendars, per-trade/daily/weekly loss definitions, exposure/concentration units, nonlinear scenarios, supplemental risk reporting, and R currency treatment. No numeric limits are assumed.
- **Metric/FX dictionary:** Multi-lot native/reporting P&L and fee allocation, cash currency basis/FX bridge, conversion-cost allocation, gross/net populations, TWR/MWR methods and valid-solution policy, drawdown source/strategy attribution, breakeven/sufficiency thresholds, and unavailable/infinite semantics.
- **Temporal/rate selection:** Default reporting/display contexts, source/freshness precedence, date-only/DST handling, calendars, and reviewed triangulation policy. Supplying a provider credential does not establish these financial definitions.
- **Reconciliation/correction contract:** Compatible observation definitions, source precedence, variance tolerances, approved replacement/restatement flow, and handling of imported snapshots without originating history.
- **Version migration:** Compatibility of published metadata/unit changes, policy revisions, archived modules/calculation manifests, and lossless backup/restore; see ADR 0004 for deterministic projection publication.

These are explicit feature gates, not a request for further implementation in this documentation phase or permission to drop required scope.

## References

- [Authoritative product specification](../../Trading_Journal_Codex_Prompt.md), especially §§2–9, 11–12, and 14–15.
- [Requirements analysis](../requirements-analysis.md), especially A-02–A-11, A-14, A-18, D-05–D-13, and D-20.
- [ADR 0004: Deterministic financial kernel and balanced cash ledger](0004-financial-kernel-and-ledger.md).
- [PostgreSQL 17 date/time types](https://www.postgresql.org/docs/17/datatype-datetime.html) for normalized timestamp storage and precision boundaries.
