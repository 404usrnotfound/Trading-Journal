# Instrument identities, conventions, and capability contracts

Phase 2 financial-domain design, 2026-10-07. This is a design contract, not an implemented support claim. No instrument module or automatic result has been validated by application tests in this repository.

This document specializes the [domain model](domain-model.md), [financial calculations](financial-calculations.md), and [ADR 0005](decisions/0005-versioned-domain-and-multicurrency.md). The [product specification](../Trading_Journal_Codex_Prompt.md), especially §§3–5 and 14, requires every listed asset family to be recordable and allows staged automatic calculations. A missing derivative formula is a reason to use a visible manual workflow, not a reason to omit that asset family or reuse an equity formula.

## 1. Identity and version boundaries

An instrument represents one economically distinguishable asset or contract. It is not a broker ticker, an account balance, a campaign, a venue, or a currency code. Tenant identities and references use `(workspace_id, id)`; the domain ID is a UUIDv4.

| Identity element | Contract |
| --- | --- |
| Family and subtype | A stable family plus a registered subtype, such as ordinary share, spot token, equity option, or inverse perpetual. A substantive contract change may require a new instrument rather than another metadata version. |
| External identifier | Identifier scheme, value, issuer/namespace, source, and validity interval. ISIN, exchange contract ID, chain/token address, and broker symbol are different schemes; none is universally mandatory. |
| Venue/listing | A listing or contract venue identifies an economic contract when its terms require it. An execution venue is recorded on a fill and does not automatically create another instrument. Distinct listings may share an economic identity only after reviewed evidence of fungibility. |
| Symbol | A display/search identifier with venue, source, and effective interval. Symbols can change and collide. A symbol match alone cannot resolve an import or merge identities. |
| Underlying | An explicitly typed instrument, currency pair, index/reference, basket, or other defined reference. An index is not inventively modeled as a held security. Underlying references preserve contract/source versions and cannot create unresolved cyclic dependencies for automatic calculation. |
| Contract discriminator | Expiry, strike, put/call, exercise style, settlement style, deliverable, contract venue, and other legally distinguishing terms. Different futures expiries and option strikes are separate identities. |
| Token discriminator | Chain/network ID plus contract address or native-asset designation. A wrapped, bridged, or liquid-staking token is distinct from its referenced asset unless a documented conversion event establishes a relationship. |
| Lifecycle | Draft, active, or archived reference data. Archiving preserves all historical references and does not close account inventory. |

An `InstrumentMetadataVersion` publishes an immutable, validated economic convention. It has an effective interval, recorded time, provenance, validator/module version, known/unknown fields, and supersession/correction links. There must be one unambiguous applicable accepted convention for an automatic operation; unresolved conflicting versions block that operation. Executions, opening lots, settlements, corporate actions, and observations bind the exact convention they used.

Incomplete instrument records remain saveable/importable with declared unknown fields and provenance. A recording validator distinguishes an incomplete but truthful record from an invalid contradiction; it does not demand all inputs needed for every automatic operation. Posting an actual cash amount still requires a known monetary currency/unit and balanced ledger effects. Recording a fill with known contract quantity may establish quantity inventory even when monetary basis, settlement or P&L remains unavailable; a broker position snapshot alone remains an observation until explicitly accepted as an opening event.

Calculation-relevant metadata includes:

- Quantity unit, permissible inventory precision, trade increment, minimum quantity where relevant, and whether a quantity counts shares, tokens, contracts, face value, weight, volume, or another defined unit. Exchange order increments and permissible broker-held fractional inventory are separate fields.
- Price unit and scale: quote currency per quantity unit, points, percentage of face, reciprocal price, yield, or another named convention; multiplier with dimensional units; tick size and tick-value currency/method; quantity-to-deliverable ratio.
- Quote, settlement, collateral, premium, income, and underlying currency roles as applicable. These may differ. A missing settlement currency is not inferred from the account base currency.
- Expiry instant/date and source precision; last trade date; exercise/assignment cutoff; delivery/settlement window; business calendar; physical versus cash settlement; premium versus futures-style cash behavior.
- Subtype-specific payload, such as accrued-interest/day-count conventions, indexation, funding cadence, reference index, knockout barrier, certificate reset/leverage, or redemption terms.
- Permitted event handlers, inventory-pool compatibility key, valuation/exposure/risk conventions, and their version references.

Changing a multiplier, units, settlement convention, or other economic term must never reinterpret an old fill through the newest metadata. A genuine split or redenomination is a linked corporate-action/conversion event with quantity/basis lineage. A discovery that a historical convention was wrong creates an audited corrected version and explicit affected-scope restatement. A new future expiry or newly issued option contract creates a new instrument, not a metadata edit to the old one.

## 2. Currency, inventory, and price units

`Currency` defines a monetary unit and its independently versioned precision/booking increment. It is not an instrument price observation and is not restricted to a hardcoded fiat list. Account base currency identifies a reporting/account convention, not the only currency the account can own.

| Currency role | Meaning |
| --- | --- |
| Quote | Unit in which the source price is expressed, with its named price convention. |
| Settlement | Currency in which an actual obligation or receipt is booked. |
| Collateral | Currency/asset pledged or restricted; pledging is not itself a fee or P&L. |
| Premium | Currency of an option/warrant premium, if distinct from settlement. |
| Cost | Original currency of each commission, financing, borrowing, funding, conversion fee, or other actual charge. |
| Reporting | Requested workspace view currency; changes create another view without changing native records. |

An instrument/currency mapping can identify the same underlying economic unit, but it does not authorize counting it twice. Each custody holding has one explicit representation: monetary cash bucket or instrument inventory. A token held as inventory is included through its holding valuation; a token designated as a supported monetary balance is included through cash translation. A change of representation uses a reviewed conversion/reclassification with lineage, conserved units, and basis references. It creates neither profit nor another copy of the asset.

Delivered spot FX is normally an actual currency exchange and two native cash legs, not another held instrument worth the full acquired currency amount. A currency-pair instrument/reference can identify the execution, idea, and rate convention without creating additional instrument NAV. Margin/rolling FX, FX CFDs, and forward-like obligations are distinct subtypes with explicit exposure and settlement conventions; they are not retrospectively reclassified as two delivered cash balances.

Commodity metadata uses explicit units such as troy ounce, avoirdupois ounce, kilogram, barrel of a defined specification, or bushel of a named commodity. Conversion requires an immutable dimension-compatible conversion factor and reference. Do not assume a volume-to-mass density, identical commodity quality, or equivalence between troy and avoirdupois ounces. Contract counts, physical inventory, storage receipts, and quoted benchmark prices are distinct units and identities.

All quantities, prices, factors, rates, and money use the decimal and rounding contract in [ADR 0004](decisions/0004-financial-kernel-and-ledger.md). A unit conversion requiring quantization records its output boundary and remainder convention. Display precision does not define valid source or booking precision.

## 3. Operation-level support states

Capabilities are published per subtype, operation, metadata/module version, and required-input set. An asset-family badge cannot imply every operation is supported.

| Product level | Required behavior |
| --- | --- |
| Level 1: native and validated | Recording works and the specific automatic operation has passed independent fixtures and relevant integration/conservation tests. Publish calculation and convention versions. |
| Level 2: supplied values | Recording works; compatible broker/manual cash settlements, marks, basis, or defined P&L observations support the explicitly available analysis. Every supplied value has its definition, units, as-of time, source, and completeness. |
| Level 3: automatic operation unavailable | Recording, import, notes/review, and explicit actual-settlement entry work. The automatic result returns a visible reason and its required manual path. An unsupported metric remains unavailable, rather than treating an arbitrary entered amount as a validated formula. |

The implementation also needs `pending_validation` to describe a planned native module. It is not a fourth advertised support level and cannot be displayed as Level 1. An operation falls back to Level 2 only when its supplied inputs establish a compatible result; otherwise it remains Level 3. The distinction is about the specific result, not whether the user can save an instrument record.

The following matrix describes delivery design. `N` means a **native implementation candidate, pending validation**, not currently validated software; `M` means a required explicit broker/manual workflow; `U` means automatic calculation remains unavailable until a separate validated module exists. `R` means required record/import/review support for every row. Generic decimal addition of explicitly recorded cash postings is native ledger arithmetic; it does not validate the instrument-specific amount or settlement rule that supplied them.

| Family / subtype | Record | Fill/event cash behavior | Lot / basis / realized result | Mark / account valuation | Exposure / planned risk | Mandatory subtype gate |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary common/preferred shares with standard linear delivery | R | N: actual share purchase/sale obligation plus separately identified charges | N: eligible long/short FIFO and explicit lots; average cost only under eligible policy | N: quantity × compatible price, with signed liabilities for shorts | N: linear exposure and stop-plan sizing when inputs exist | Fractional inventory, multiplier/unit validation, settled/unsettled transitions, known short borrowing convention; nonstandard preferred/redemption terms move to a separate subtype. |
| Ordinary unleveraged ETF shares | R | N: share cash settlement | N: eligible linear inventory methods | N: share mark; underlying holdings are not separately owned | N: share exposure/linear stop plan; look-through optional and separately sourced | Cash versus in-kind corporate actions, share/price units, and distributions identified separately. |
| Leveraged/inverse/complex ETP or exchange-traded note | R | N only for verified purchased-share cash settlement; M for additional product events | N only for verified ordinary share inventory; M for special redemption/basis events | N only for compatible observed traded-share price; M for product-specific valuation | U for underlying leverage/knockout/path-dependent risk; M supplied scenarios | A quoted share may be linear in its own traded price; this does not validate underlying payoff, daily-reset behavior, issuer liability, or risk. |
| Mutual fund / other investment fund units | R | M: actual subscription/redemption proceeds and settlement | M initially; later N only for validated NAV/fee/average-cost subtype | M: dated published/entered NAV with price definition | U for unsupported liquidity/look-through/risk assumptions; M supplied values | Forward pricing, share classes, dealing cutoffs, distributions, loads, and settlement conventions. |
| Non-rebasing crypto spot native asset / fungible token | R | N: quantity and fiat/eligible quoted-unit consideration, with explicit transfer/cost events | N for compatible long FIFO/explicit lots; average cost by eligible policy | N using compatible spot mark; token-versus-cash representation exclusive | N spot exposure/linear stop plan; no invented borrowing or guaranteed stop | Chain/token identity, units, third-currency/network fees, source precision; token-to-token consideration requires its own reviewed legs/basis and is not automatically fiat settlement. |
| Crypto rewards / configurable staking distribution | R | M: actual received quantity, reward/income definition, and any charges | M: explicit known/unknown received basis and inventory creation | N only for a token's already-validated compatible spot mark | U for automatic staking yield, lockup/slashing risk; M observations | Reward, principal unlock, and custody transfer are different events. No invented historical basis or market income amount. |
| Rebasing / wrapped / bridged / liquid-staking / other token variants | R | M: actual conversion/rebase/redemption/transfer events | M: lineage and explicit basis transformations | M, or N only for independently validated traded spot-price marking | U for unsupported conversion, protocol, or redemption risk | Ratio/time/source, chain identity, fees, rounding/dust, lockup, and liabilities; a name resembling a known coin is insufficient. |
| Delivered spot FX / currency-balance exchange | R | N: actual source/destination cash amounts and fee legs | N: currency-history basis/FX bridge under the selected policy; no duplicate security lot | N: cash translation with pinned eligible FX observations; no additional pair notional NAV | N: currency exposure; U for stop sizing unless an explicitly defined deliverable strategy/risk module applies | Pair direction, actual rate consistency, settlement dates, and cash-history sufficiency. |
| Margin / rolling spot FX and other nondeliverable FX exposures | R | M: actual broker cash settlement, carry, collateral, and costs | M: contract quantity/P&L observations; U for generic stock-lot cash rules | M: clearly defined net settlement value or broker valuation | M supplied exposure/risk; U for unvalidated pip/contract/risk formulas | Contract size, pip/tick, quote/settlement/collateral roles, rollover convention, and netting mode. |
| Exchange-traded linear futures | R | M: actual variation margin, margin transfers, delivery/final settlement; never full-notional purchase | M: contract inventory and explicit realizations; U for stock-style cash basis | M: dated residual contract value under VM definition | M; U for automatic tick/settlement/sizing until subtype fixtures | Exchange contract specification, price scale/tick/multiplier, expiry, delivery, and settlement chronology. Different rate/bond/commodity conventions require distinct validators. |
| Linear crypto futures / linear perpetuals | R | M: actual settlement, funding, collateral and costs | M: contract records/explicit realized result | M: defined open result and collateral treatment | M; U for automatic leverage/liquidation/sizing | Contract unit and settlement/collateral currencies, funding sign/rate/time/amount, margin observations, and final settlement where applicable. |
| Inverse crypto futures / inverse perpetuals | R | M: actual reciprocal-price settlement, funding and collateral | M; U for linear P&L/basis formulas | M: compatible coin-denominated result or broker net value | M; U for automatic inverse exposure/risk/liquidation | Reciprocal price convention, contract face value, settlement coin, multiplier, and independent inverse fixtures; linear module substitution prohibited. |
| Equity options | R | M: premium, exercise/assignment, cash-in-lieu, fees and settlement | M: contract inventory, explicit settlement and underlying deliverables | M: compatible option premium/market-value observation | M scenario/max-loss/original risk; U for automatic nonlinear or exercise rules | Put/call, strike, expiry, multiplier, deliverable, exercise style, physical/cash settlement, adjusted contracts, and event lineage. |
| Index options | R | M: premium and actual cash exercise/final settlement | M: contract inventory/result | M: compatible premium/net-value observation | M scenarios; U automatic nonlinear risk | Index reference, exercise style, AM/PM fixing, final settlement source and currency; no invented stock delivery. |
| Options on futures | R | M: premium or futures-style settlement, assignment and resulting future | M: option and resulting futures inventory kept distinct | M under premium/VM-compatible definition | M scenarios; U automatic nonlinear risk | Premium-style versus futures-style terms, deliverable future ID, expiry/assignment chronology, and settlement definition. |
| Options on other supported underlyings / multi-leg option structures | R | M: leg-specific actual premiums/settlements/deliverables | M: per-leg records plus conserved campaign attribution | M: compatible per-leg or explicitly defined package observation, never both | M explicit scenario/max loss; U stock stop-distance formula | Underlying/subtype terms and leg linkage; a package mark cannot silently override or duplicate leg marks. |
| Fixed-rate bonds | R | M: dirty consideration, accrued interest, coupons, withholding, redemption and fees | M: face quantity and supplied known/unknown basis | M: clean/dirty price plus compatible accrued-interest definition | M supplied exposure/risk; U unvalidated duration/yield formulas | Quote per 100 face versus amount, day count, coupon calendar, ex-coupon terms, settlement date and maturity. |
| Bills / zero-coupon debt | R | M: actual purchase/redemption/settlement | M: face quantity and explicit basis/discount conventions | M: compatible price/value | M; U unvalidated discount/yield annualization | Price versus discount/yield input, quoted unit, maturity, settlement and day-count basis. |
| Floating / inflation-linked / amortizing / convertible / other fixed income | R | M: actual reset/indexed/amortization/conversion cash and inventory events | M: explicit basis/principal lineage | M: supplied compatible value | M; U unvalidated yield/option/indexation risk | Each economic subtype needs its own schedule/indexation/principal/deliverable conventions; the fixed-rate module cannot stand in for all debt. |
| CFDs / leveraged OTC contracts | R | M: actual net settlement, financing, funding, collateral and costs | M: contractual exposure and explicit result; no fictitious share ownership | M: defined net liability/receivable or broker value | M; U generic broker margin/leverage/liquidation estimates | Contract units, financing/dividend adjustment, quote/settlement roles, cash semantics, expiry or rolling terms. |
| Warrants | R | M: actual premium/redemption/exercise/deliverables | M: quantity and supplied basis/result | M: compatible traded-price or supplied value | M scenarios; U unvalidated option-style formulas | Issuer terms, subscription/exercise ratio, strike/expiry, dilution or cash terms; not assumed interchangeable with listed options. |
| Turbo / knockout products | R | M: purchase, financing adjustment, knockout/redemption and settlement | M: explicit termination/basis/result | M: supplied market/redemption value | M scenarios; U automatic barrier/gap/max-loss assumptions | Barrier source/time, financing level, ratio, residual value, issuer and event terms. |
| Factor certificates | R | M: actual purchase/redemption/adjustments | M: explicit basis/result | M: supplied market value | M scenarios; U automatic underlying multiplier/path-risk formula | Daily reset/path dependence, fees, reference, issuer terms and adjustment events. |
| Other structured products | R | M: actual coupons, calls, maturity, delivery/redemption and charges | M: explicit inventory/basis/result | M: supplied compatible value | M scenarios; U automatic payoff/discount/risk | Term sheet, linked underlyings, observation schedule, barriers/caps/participation, issuer/currency/delivery definitions. |
| Physical commodities / custody receipts | R | M: actual consideration, delivery, storage/insurance and sales | M: physical units, source basis and transfer lineage | M: compatible same-quality/unit/location value | M; U unvalidated delivery/storage/liquidity/risk assumptions | Commodity quality, unit, custody/location, deliverability, currency and settlement; derivatives use their own future/OTC subtype. |
| Custom instruments / unsupported subtype | R | M: explicit actual cash and inventory effects | M supplied basis/results, or U with reason | M compatible observations, or U with reason | M entered initial risk/scenarios; U unvalidated automatic formulas | Typed unit/settlement definition and vetted validator required; user-provided JavaScript cannot execute. |

The initial native implementation envelope is ordinary eligible shares/ETFs and non-rebasing crypto spot holdings, plus the generic ledger and currency-conversion primitives. A listed candidate is narrowed further by its metadata and policy gates. Other families must receive functional recording/manual-settlement paths before delivery acceptance, even when a native extension remains deferred. A share-like marking capability for an ETP does not make its underlying payoff or risk native.

Long and short inventory are separate accounting directions. A short's sale proceeds are cash, while its open signed holding is a liability; sale proceeds are not profit and cannot be netted away by creating a long lot. Native short calculations are restricted to a validated linear subtype and known borrow/carry conventions. Crypto spot long support does not imply a lending or short wrapper. Actual negative holdings or broker liabilities remain recordable with explicit completeness/unsupported reasons when the automatic short module is unavailable.

## 4. Module registration and result contracts

A vetted server-side subtype module publishes an immutable manifest containing:

| Manifest component | Required declaration |
| --- | --- |
| Identity/metadata | Subtype key, stable version, supported schema version, validator version, economic-identity discriminator, metadata schema and conditional required fields. |
| Units | Quantity/price/factor definitions, currency roles, permitted sign, trade versus inventory increments, pool-compatibility key, and unit transformations. |
| Events | Recordable event kinds; validators; cash, inventory, basis and obligation effects; actual/manual requirements; deduplication/economic-effect identity contract. |
| Operations | Separate capability for settlement, inventory/lot matching, realized P&L, marking/unrealized P&L, exposure, planned risk/sizing, exercise/assignment, corporate action, expiry, funding, accrued interest and other applicable operations. Nonapplicable is distinct from unsupported. |
| Dependencies | Required metadata versions, policies, prices/FX, calendars, source completeness and accepted supplied-value definitions. Missing inputs do not activate a fallback formula. |
| Arithmetic | Module precision/quantization/booking rules and any validated override to the common HALF_EVEN rule. |
| Verification | Independent fixture IDs, reference document/version, expected quantities/cash/results, integration/concurrency coverage where applicable, and validation status. |
| Compatibility | Calculation manifest IDs and compatible saved/source versions; supported upgrade/restatement behavior. |

Registration changes only the registry and vetted module/configuration. The frontend reads its field/capability contract; imports map to it; ledger/campaign consumers call declared interfaces rather than switch on broker names. Broker adapters cannot grant capabilities or silently change a subtype's accounting conventions. A constrained custom expression engine is a separately reviewed future extension, not the default registration mechanism.

An operation receives explicit accepted inputs and context; it cannot fetch the wall clock, latest defaults, a provider, or an LLM to fill gaps. Its typed result contains:

- Operation and subtype/module/calculation versions; workspace/account/instrument scope; metadata, policy, source-revision and as-of context.
- Available value components with decimal values and units/currency; quantity, basis, gross/net and realized/unrealized definitions where applicable; full/partial coverage.
- Source mode: native calculation, broker observation, manual observation or explicit manual settlement; input/observation/source-row references.
- Quality such as reviewed, estimated, stale or incomplete; a supplied value being manually verified does not turn its formula into native support.
- `available`, `partial`, or `unavailable`, with structured reasons and missing inputs. Examples include unknown basis, missing mark/FX, ambiguous units, unsupported event, unresolved settlement, incompatible observation definition, or pending module validation.

Requested components can differ in availability. A holding's quantity may be known while basis/P&L is unavailable; native gross P&L may be known while net P&L requires an absent third-currency fee rate. A partial portfolio value discloses excluded instruments and is never labeled full NAV.

## 5. Economic-event handling

An execution records a fill and references its instrument convention; an economic-event handler supplies its verified dependent effects. Account inventory is not multiplied again for each campaign allocation. Manual actual settlements use the same posted-ledger invariants as native handlers, but their supplied economic amounts retain provenance and do not assert an automatic formula.

| Event | Required separation and invariants |
| --- | --- |
| Trade settlement | A verified delivered purchase/sale creates a known cash obligation/receivable and later actual settlement transition. Expected date is not settlement evidence. A future/CFD fill does not debit its full notional. |
| Fee / funding / borrow / financing | One charged-currency identity and actual amount, linked to its source/effect and allocations. Funding can be received or paid under explicit sign/classification. Estimates and embedded spread/slippage never become an additional actual deduction. |
| Collateral / margin transfer | Move actual cash between unrestricted and restricted buckets, or identify pledged asset custody. It is not automatically a fee, realized loss or external account contribution. Margin/liquidation/buying power remain sourced observations until a validated convention exists. |
| Futures variation margin | Record actual settled amount, period/settlement reference, affected contract and costs. The open mark's value definition excludes VM already in cash or uses an explicit adjustment; no cash-plus-full-accumulated-P&L duplicate. Daily settlement does not itself close all contract quantity. |
| Futures roll | Link actual close/expiry of the old identity and opening of the new identity, with distinct fills/costs and any cash effects. Do not mutate expiry or move historical cost into a new contract by changing its symbol. |
| Expiry / final settlement | Record event type, affected quantity, final price/source, actual cash/deliverables and obligations. A calendar expiry date alone does not invent settlement, disappearance of holdings, or realized result. |
| Option exercise / assignment | A linked event consumes the relevant option obligation/quantity and creates actual underlying/futures deliverables and/or cash settlement. Preserve strike, deliverable, ratio, premium lineage, fees and source chronology. Manual event handling remains possible; automatic basis transfer is unavailable until its particular convention is validated. |
| Option multi-leg package | Each leg binds its own contract, quantity, premiums, costs and settlement. Campaign grouping and a package order do not fuse instruments or cancel economic obligations. Package and leg marks are alternatives with an explicit compatible decomposition, not additive assets. |
| Bond purchase/sale | Retain actual dirty consideration, clean price, accrued interest and their convention. Do not deduct accrued interest twice or interpret a percentage-of-face quote as cash per security. If only dirty amount is known, record it truthfully and leave unsupported breakdowns unavailable. |
| Coupon / dividend / reward / interest | Actual income receipt and withholding/charges are separate effects. Accrual estimates, declared distributions and received cash are distinct states; a declared amount cannot be recorded again as another receipt when it settles. Reinvestment links the income and a separate acquisition. |
| Fixed-income redemption / amortization | Actual principal reduction, cash, fees and remaining face quantity are explicit. Preserve principal/basis lineage. A maturity date alone cannot establish receipt or zero quantity; indexation/conversion details require their own module or manual effects. |
| Stock split / consolidation | Transform quantity through a versioned ratio and preserve aggregate basis and acquisition lineage, subject to explicitly recorded cash-in-lieu. Historical fills retain their original units. |
| Merger / spin-off / exchange / tender / rights | Link predecessor and successor instruments; record actual cash/quantity changes and supplied allocation of known/unknown basis. Rights/options exercise and optional elections are separate events. Missing a defensible basis allocation yields unknown basis rather than invented P&L. |
| Transfer / custody movement | Preserve same-workspace lot acquisition, basis status, historical FX and quantity lineage. A transfer is not a sale or new contribution at consolidated workspace scope; a network/custody fee remains its own actual cost. Cross-workspace movement requires separately authorized export/import provenance, not cross-tenant foreign keys. |
| Token swap / unwrap / rebase | Explicit quantities, consideration, conversion ratio, fees, chain/source and basis treatment. Asset-to-asset swaps are not relabeled as same-asset transfers; whether a reviewed transformation preserves analytical lineage is policy-specific and never a tax claim. |
| Manual settlement / corporate action | User supplies actual effects and evidence, optionally linking manual valuation/result observations. Validate decimal units, source identities, conservation and balanced currency postings. Do not execute an uploaded formula or invent effects needed to balance a financial story. |

Each event has an economic-effect identity linking generated postings, source fills and imported evidence. Importing a broker settlement row for the same effect reconciles or proposes a correction; it does not post the cash twice. Pending, incomplete, unsupported and manual states are explicit. Correction reversals are bookkeeping history, not fictitious new market sales or exercises.

An incomplete internal cash transfer can have a separately evidenced in-transit receivable while the destination has not received cash. That receivable is an economic claim under the transfer convention, not the ledger's explanatory transfer control bucket. Never add both the claim and a fictitious destination receipt to account/workspace equity.

Corporate actions and manual deliverables may affect several accounts/lots. Their source acceptance, exact affected quantity/basis lineage, charges, ledger postings where applicable, audit/revision and recomputation intent commit atomically under ordered aggregate locks. Unknown allocation/basis does not invalidate a truthful received quantity, but it blocks the result that requires that missing operand. Cross-account and cross-instrument dependencies participate in restatement invalidation.

## 6. Compatible observations and account equity

Every supplied value must state its metric definition, units/currency, observation time/source, scope and treatment of cash, collateral, unsettled obligations, accrued income, fees and realized/settled P&L. A label such as "broker value" is insufficient to decide how to aggregate it.

| Observation definition | Safe use |
| --- | --- |
| Delivered-share/token market value | Include once as inventory value alongside separately recorded cash, if representation and units are compatible. |
| Derivative unrealized P&L / settlement receivable | Include only under its explicit residual-versus-total/VM basis. Do not use notional exposure as market value. |
| Account equity / NAV | Compare/reconcile as a whole-account observation. If selected as the account's supplied valuation, do not add its constituent holdings/cash again. |
| Package value | Select package or compatible constituent values for that scope; do not sum both. |
| Collateral/restricted cash | Include owned monetary collateral once within the appropriate cash buckets; do not also add it as derivative market value. Noncash pledged assets remain the same assets with restricted status. |
| Broker P&L | Compare or select for its declared scope and definition. It is not a cash posting or another NAV asset, and cannot be merged with incompatible internally calculated gross/net results. |

Selections are explicit, provenance-preserving and reversible through another calculation context. A stale or incompatible observation remains visible but does not silently fill a missing compatible operand. Unexplained reconciliation residual is variance, not automatically "FX", "fees" or "profit".

## 7. Independent fixtures and promotion gates

The fixtures below are design obligations. Their numerical expectations must be independently worked or sourced before feature validation; none is evidence that application tests already pass. Match them to the domain/calculation fixture catalogue during implementation.

| Fixture group | Independent evidence and acceptance obligation |
| --- | --- |
| INST-EQ | Hand-calculated ordinary share/ETF fractional partial fills, scale-in/out, known short/covers, FIFO/explicit/eligible average pools, fees in another currency, actual settled/unsettled transitions and immutable multipliers. Verify quantity, cash and allocation conservation. |
| INST-CRYPTO | Hand-calculated non-rebasing spot quantity/price/high-precision fills, transfers with network fees, token/cash no-double-count classification, rewards with unknown basis, wrapped/rebase/manual events and explicit custody/chain identity. |
| INST-FX | Independent actual exchange amounts/rate/direction/fees, multiple cash currencies, cash-basis/holding-FX bridge and delivered-pair no-duplicate-NAV case. Include unsupported rolling FX with working manual settlement. Maps to AC-01. |
| INST-FUT | Exchange contract specification for named linear future, tick/multiplier/price scale and VM; old/new expiry roll; final cash/physical settlement and residual-value definition. Verify no full-notional debit and no VM double count. Maps to AC-06. |
| INST-PERP | Named exchange/venue linear and inverse contract specifications; known contract size/collateral, positive/negative funding examples, reciprocal-price cases, and explicit mark/settlement definitions. The inverse case must fail if sent to the linear handler. Maps to AC-06. |
| INST-OPT | Documented option contract/deliverable/premium terms plus independently worked physical exercise/assignment, cash settlement, adjusted multiplier and futures-style variant. Multi-leg allocation, residual obligation and supplied scenario tests. Maps to AC-05. |
| INST-FI | Source term sheet/schedule for named bond and bill: face/quote scaling, clean/dirty/accrued consideration, coupon/withholding, redemption, and settlement day-count. Add separate indexed/amortizing/conversion examples before those operations become native. Maps to AC-07. |
| INST-STRUCT | Documented warrant/turbo/factor/structured term sheet; recording, manual actual redemption/knockout cash and quantity termination, declared unsupported risk/formula reason and compatible supplied valuation. Never infer payoff from a family name. Maps to AC-08. |
| INST-CORPACT | Independently worked split, cash-in-lieu, merger/spin-off basis allocation or explicit unknown basis, dividend reinvestment and transfer cases preserving history. New metadata must not change original fills. |
| INST-CUSTOM | Defined commodity/custom units, same-dimension conversion, rejected incompatible unit, actual manual settlement, unavailable unsupported metrics and safe extension registration. Maps to AC-08. |

For each specific native operation, promotion requires all of the following:

1. Name the exact subtype and convention supported; retain a versioned authoritative contract, term sheet or applicable provider/source sample where needed. General asset-family knowledge is insufficient.
2. Validate metadata, source precision/units, missing-input and incompatible-observation behavior with independent fixtures. Expected results cannot be generated only by calling the implementation under test.
3. Verify source/effect deduplication, cost/quantity/ledger conservation, relevant lot/correction/replay behavior, immutable metadata and pinned price/FX context.
4. Exercise actual PostgreSQL atomicity, concurrent commands, same-workspace references and cross-user isolation for persistence-dependent effects.
5. Verify record/import/review/manual fallback and truthful capability display, including a failed/unsupported automatic case. A tested automatic formula cannot compensate for a missing event workflow.
6. Publish the validation evidence, fixture IDs and calculation/module version. A formula or settlement convention change produces a new version and revalidation/restatement decision.

Official contract documents should be obtained from the relevant listing exchange/clearing house or issuer; crypto derivative conventions from the named venue's versioned contract/funding documentation; debt/structured terms from their actual prospectus/term sheet. Broker samples supplement these with actual booking behavior. No specific broker, subscription or external integration is required to record or manually verify an event.

## 8. Decisions and remaining implementation gates

Phase 2 selects explicit economic identities, immutable conventions, per-operation capabilities, manual-settlement conservation, no-double-count currency/inventory representation, and the narrow initial native candidate envelope. These are domain design decisions; runtime source provenance and tested status determine whether an actual result is available.

Before enabling an advanced native module, resolve and independently test its named contract's price/quantity/settlement/collateral conventions, calendars and actual event sequence. Defaulting unknown inverse, option, accrued-interest, barrier or leverage behavior to a linear stock calculation is prohibited. The unresolved advanced convention affects that automatic operation; it does not block required recording and explicit manual settlement.

Before implementing the initial native modules, validate the financial calculation document's ordinary-equity/ETF and crypto-spot fixtures, short and average-cost eligibility, fee allocations, cash history/FX bridge, precision bounds and unit conversion rules. All native-capability statuses remain pending until those checks run against the implementation.
