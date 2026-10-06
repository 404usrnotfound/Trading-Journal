# Independent financial acceptance fixtures

Status: Phase 2 design; expected results are independently calculated examples, not implemented or passing application tests. These fixtures accompany [the domain model](domain-model.md), [the calculation contracts](financial-calculations.md), and [the instrument capability matrix](instrument-capabilities.md). They refine [ADR 0004](decisions/0004-financial-kernel-and-ledger.md), [ADR 0005](decisions/0005-versioned-domain-and-multicurrency.md), and [AC-01–AC-16](requirements-analysis.md#mandatory-acceptance-scenarios-and-traceability) from the requirements analysis.

All numeric inputs and expected financial outputs below are decimal strings. Formula punctuation is explanatory; an implementation must use the isolated decimal context, bounded precision, explicit units, and output boundaries selected in ADR 0004. Display rounding never changes these expectations. Readable record aliases stand for stable workspace-scoped IDs, not symbols or globally unique broker identifiers.

Fixtures are economic acceptance contracts. Future test authors must transcribe the expected values; they must not generate the expected results using the financial implementation under test. Property-based tests and database tests supplement these examples. Advanced manual examples establish recordability and accounting of supplied cash values; they do not validate an automatic derivative module.

## Common conventions

- Each example starts from the stated opening cash and holdings; unspecified opening cash is `0`. Negative cash in an arithmetic fixture is an explicit net funding liability, not a buying-power claim. Account permissions and actual short-position recording are tested separately.
- Unless an example explicitly models unsettled/delayed money, actual settlement is confirmed at each cash event and no further settlement obligation is assumed. This simplification never authorizes inferring settlement merely from a date.
- Ordinary share examples use quantity in shares, price in currency per share, multiplier `1`, and compatible quote/settlement currencies. Gross basis uses actual booked principal; the source quoted price and any verified principal rounding adjustment remain distinct. Most examples have equal quoted/booked principal; F-11 intentionally differs. Actual entry fees remain separate carried cost components; entry-fee portions follow consumed versus remaining quantity. Report both gross basis/entry price and basis including eligible entry costs, with their definitions.
- All fees are actual charges. Exit costs are assigned to the closed quantity; entry costs partition into consumed and remaining portions exactly. Borrowing/carrying costs use the explicitly stated attribution policy. No spread or slippage deduction is added to actual fill results.
- Positive cash postings increase the named cash bucket. Each event must balance exactly, independently for every currency. Control counterparts explain cash; they are not another NAV asset or another P&L deduction.
- Inventory consumption and campaign attribution are independent conserved views. FIFO, eligible average cost, and explicit lot matching use a pinned policy version. These are analytical accounting conventions, not claims of tax compliance.
- Results require source/correction, metadata, policy, observation, reporting, and calculation-manifest versions. Every fixture must also be exercised after deterministic replay and equivalent backup/restore.

## F-01 — Decimal boundaries and explicit quantization

These expectations apply before PostgreSQL can coerce a scalar into `NUMERIC(78,36)`.

| Input/operation | Expected result |
| --- | --- |
| Add `0.1` and `0.2` | Exactly `0.3`, including API/DB/backup round trips |
| Normalize `0001.2300` under an explicitly selected dot-decimal convention | Canonical `1.23`; original text retained |
| `0.000000000000000000000000000000000001` | Accepted: one nonzero digit at fractional place 36 |
| `0.0000000000000000000000000000000000001` | Rejected as source overprecision: nonzero fractional place 37 |
| `1.0000000000000000000000000000000000000000` | Accepted as `1`; insignificant trailing zeros do not cause rejection |
| `999999999999999999999999999999999999999999` | Accepted: 42 integral digits |
| `1000000000000000000000000000000000000000000` | Rejected: 43 integral digits |
| Largest accepted 42-digit integer plus `1` | Derived representability overflow; no clamp or zero |
| `1000000000000000000000000000000` multiplied by itself | Derived representability overflow at persistence boundary |
| Derived `1 / 3`, explicitly quantized to 36 places, half-even | `0.333333333333333333333333333333333333`, with inputs and rounding version retained |
| Half-even cents booking of `0.005`, `0.015`, `-0.005`, `-0.015` | `0`, `0.02`, `0`, `-0.02`; source inputs retained |
| `NaN`, infinity, empty string, an overlong lexical payload, or malformed grouped digits | Validation error; no booked effect |
| `1,234` without a declared import convention | Ambiguous input; require review, never infer `1.234` versus `1234` |
| A financial JSON number `0.1` where a decimal string is required | Contract rejection; no binary-number normalization |

Instrument lot increments and currency booking increments are separate constraints. An accepted 36-place scalar can still be an invalid share increment or non-bookable cash amount. The raw source row remains available when normalization fails. Scientific notation, if an adapter supports it, must be explicitly normalized with decimal-safe parsing; it cannot bypass precision or length limits.

## F-02 — Original-currency cost conservation and rounding remainders

A source purchase is `10.5` shares with quantity allocations `3.5`, `3.5`, `3.5` to stable allocation IDs A, B, C in ascending remainder order. There are two independent actual fee components: USD `0.05` and GBP `0.01`. Both fee currencies have a `0.01` cash-booking increment, but analytical partitions use the scale-36 attribution quantum; they are not new independently charged amounts.

| Allocation | Quantity | USD component | GBP component |
| --- | --- | --- | --- |
| A | `3.5` | `0.016666666666666666666666666666666667` | `0.003333333333333333333333333333333334` |
| B | `3.5` | `0.016666666666666666666666666666666667` | `0.003333333333333333333333333333333333` |
| C | `3.5` | `0.016666666666666666666666666666666666` | `0.003333333333333333333333333333333333` |
| Sum | `10.5` | `0.05` | `0.01` |

Use the documented exact integer largest-remainder rule at `10^-36`, with stable allocation IDs breaking equal remainders. USD has two residual attribution units; GBP has one. Independent rounding to cash cents would produce USD `0.06` and is forbidden as a source partition. A separate display may reconcile grouped rounded values visibly, but cannot overwrite these exact analytical shares or create more cash charges. Each source cost identity is partitioned separately, even when two components share a currency. Reordering payload arrays does not move the remainder.

For a second case, the quantities are A `6`, B `3`, and an explicit unallocated remainder `1.5`; USD `2.10` partitions into `1.20`, `0.60`, and `0.30`. Unallocated quantity and costs remain visible. A request allocating `6 + 5` against source `10.5`, or inserting an opposite-direction quantity to conceal the excess, fails atomically.

Missing GBP translation rates leave the original fee and its partitions correct. USD gross trading results can remain available; a supposedly complete USD net result must be unavailable until that GBP component can be translated compatibly. GBP `0.01` cannot be treated as USD `0.01`, discarded as small, or deducted twice.

## F-03 — Partial fills, fractional scaling, and three lot policies

One order requests `2` shares. Its first fill buys `1.25` at USD `80`, actual fee USD `0.50`; its second buys `0.75` at USD `120`, fee USD `0.30`. A later execution sells `1` at USD `130`, fee USD `0.40`. Mark the remaining `1` share at USD `125`.

Purchase principal is `100 + 90 = 190`; gross average price before the sale is `95`. Entry charges total `0.80`. After the first fill, the order is partially filled with `0.75` unfilled; an order record creates no extra position or cash beyond its fills.

| Pinned lot policy | Consumed gross basis | Remaining gross basis | Remaining gross average entry price | Realized gross | Realized net | Unrealized gross | Unrealized net including carried entry fees |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FIFO | `80` from first fill | `20 + 90 = 110` | `110` | `50` | `49.20` | `15` | `14.60` |
| Eligible average cost | `95` | `95` | `95` | `35` | `34.20` | `30` | `29.60` |
| Explicit: consume second fill `0.75` and first fill `0.25` | `90 + 20 = 110` | `80` | `80` | `20` | `19.20` | `45` | `44.60` |

Every method consumes entry fees `0.40`, retains entry fees `0.40`, and assigns exit fee `0.40` to the sale. Thus realized net plus unrealized net is `63.80` under each policy, although realization timing and remaining basis differ. Cash is `-100 - 0.50 - 90 - 0.30 + 130 - 0.40 = -61.20`; cash plus the marked holding `125` is also `63.80`.

Finally sell the remaining `1` at USD `125`, fee USD `0.50`. The additional net realized amounts are FIFO `14.10`, average `29.10`, and explicit `44.10`. Every method ends at quantity `0`, basis `0`, cash `63.30`, and cumulative realized net `63.30`. There is no remaining entry-fee residue.

Completion still requires campaign confirmation and resolution of relevant obligations. A flat inventory pool does not itself close every campaign or cancel an unfilled order. Changing the selected lot policy later requires a new prospective policy version or an explicitly audited historical restatement.

## F-04 — Short inventory and zero crossing

### Partial cover with borrowing costs

Sell short `2.5` shares at USD `40`, fee `0.50`; cover `1` at USD `30`, fee `0.20`; charge actual borrow cost USD `0.30`. For this example only, an explicit carrying-cost attribution version partitions borrowing cost by the original `2.5` units: closed portion `0.12`, remaining portion `0.18`. Mark at USD `35`.

| Result | Expected value |
| --- | --- |
| Open signed quantity | `-1.5` |
| Remaining short gross entry proceeds / entry price | `60` / `40` |
| Remaining signed gross principal basis | `-60` |
| Realized gross | `10` |
| Realized net | `10 - 0.20 entry fee - 0.20 cover fee - 0.12 borrowing = 9.48` |
| Unrealized gross | `60 - 52.50 = 7.50` |
| Unrealized net under this cost-attribution policy | `7.50 - 0.30 remaining entry fee - 0.18 borrowing = 7.02` |
| Cash | `100 - 0.50 - 30 - 0.20 - 0.30 = 69` |
| Signed holding value / net account value | `-52.50` / `16.50` |

The bridge is `9.48 + 7.02 = 16.50`. Cover the final `1.5` at USD `35`, fee `0.30`: ending cash and cumulative realized net are `16.20`, open quantity is `0`. Borrow charges are sourced ledger costs, not an invented percentage of exposure. Broker margin/buying power remains separately reported.

### One execution crosses from short to long

Start short `2.5` at USD `40`, source fee `0.50`. One actual buy execution is `3` at USD `30`, source fee `0.60`. Decompose its inventory effect into cover `2.5` and new long `0.5`; partition the source fee into `0.50` and `0.10`, without inventing a second fill.

Gross short realization is `100 - 75 = 25`; net short realization is `25 - 0.50 original entry fee - 0.50 cover fee = 24`. Remaining long gross basis is `15`, with carried entry fee `0.10`. At mark USD `32`, long value is `16`, gross unrealized is `1`, and net unrealized is `0.90`. Cash is `100 - 0.50 - 90 - 0.60 = 8.90`; account value is `24.90`, matching `24 + 0.90`.

Campaign allocation of this same source buy is a separate decision. A new linked long campaign does not create additional account inventory. If the pool convention is not validated for short/zero-crossing accounting, record actual activity but return an explicit unsupported calculation state rather than using a long-only formula.

Exercise the opposite crossing independently: buy `2.5` at USD `30`, fee `0.50`; sell `3` at USD `40`, fee `0.60`. Close `2.5` with fee `0.50`, open short `0.5` with fee `0.10`. Realized gross/net are `25` / `24`; remaining short gross proceeds are `20`. At mark `35`, signed holding value is `-17.50`, gross/net unrealized are `2.50` / `2.40`, cash is `43.90`, and NAV is `26.40 = 24 + 2.40`. Both crossing directions conserve the single source fee/principal.

## F-05 — Two actual FX exchanges and a complete account bridge

Reporting currency is EUR. Use pinned reporting rates in **EUR per USD**. There are no opening holdings or USD cash; EUR cash starts at `0`. USD principal and USD fees in this example already satisfy the booking increment, so there is no principal rounding adjustment. Every row has its own stable economic-effect identity and increasing precise economic time.

| Event | Actual native amounts | Pinned EUR-per-USD reporting rate |
| --- | --- | --- |
| External funding | Deposit EUR `10000` | EUR identity |
| Actual conversion 1 | Spend EUR `1000`, receive USD `1250`, pay fee EUR `2`; actual rate `1.25` USD per EUR | `0.8` |
| Purchase | Buy `10.5` shares at USD `100`; fee USD `2.10` | `0.8` |
| Actual conversion 2 | Spend EUR `500`, receive USD `650`, pay fee EUR `1`; actual rate `1.3` USD per EUR | `0.75` |
| Partial sale | Sell `4.5` at USD `120`; fee USD `1.08` | `0.75` |
| Ending observation | Remaining `6` marked at USD `130` | `0.7` |

The second actual rate is not the market/reference rate. At `0.75` EUR per USD, USD `650` is EUR `487.50`, versus source EUR `500`. Preserve both actual amounts and the dated reporting observation; never replace the actual `1.3` with the reference reciprocal.

### Native balances and trading results

| Quantity/result | Expected value |
| --- | --- |
| Ending EUR cash | `10000 - 1000 - 2 - 500 - 1 = 8497` |
| Ending USD cash | `1250 - 1050 - 2.10 + 650 + 540 - 1.08 = 1386.82` |
| Remaining shares / quoted gross basis | `6` / USD `600` |
| Remaining carried entry fee | USD `1.20` |
| Remaining gross average entry price | USD `100` per share |
| Realized gross | USD `90` |
| Realized net including consumed entry fee | `90 - 0.90 - 1.08 = 88.02` USD |
| Unrealized gross / net including remaining entry fee | USD `180` / USD `178.80` |
| Total native trading gross / net | USD `270` / USD `266.82` |
| Ending holding value | USD `780` = EUR `546` |
| Ending USD cash value | EUR `970.774` |
| Ending account NAV | `8497 + 970.774 + 546 = 10013.774` EUR |
| Change after excluding external funding | EUR `13.774` |

### Reporting decomposition

The transaction-anchored convention assigns the price/FX cross term to the trading component. Fees translate at their charged dates. The holding FX component uses quoted principal basis; fees are not hidden inside it.

| Component | Derivation | EUR result |
| --- | --- | --- |
| Realized trading gross | `(540 - 450) × 0.75` | `67.50` |
| Unrealized trading gross | `(780 - 600) × 0.7` | `126` |
| Realized holding FX | `450 × (0.75 - 0.8)` | `-22.50` |
| Remaining holding FX | `600 × (0.7 - 0.8)` | `-60` |
| Entry/exit trading fees | `-(2.10 × 0.8 + 1.08 × 0.75)` | `-2.49` |
| Actual conversion 1 execution-price effect | `1250 × 0.8 - 1000` | `0` |
| Actual conversion 2 execution-price effect | `650 × 0.75 - 500` | `-12.50` |
| Actual conversion fees | `-2 - 1` | `-3` |
| Cash currency FX effect | Signed cash-change identity below | `-79.236` |
| Sum | `67.50 + 126 - 22.50 - 60 - 2.49 - 12.50 - 3 - 79.236` | `13.774` |

For USD cash, the sum of dated signed cash changes translated at their pinned rates is:

`1250 × 0.8 - 1050 × 0.8 - 2.10 × 0.8 + 650 × 0.75 + 540 × 0.75 - 1.08 × 0.75 = 1050.010 EUR`.

Therefore cash FX is `C_end × r_end - C_start × r_start - Σ(delta_i × r_i) = 1386.82 × 0.7 - 0 - 1050.010 = -79.236 EUR`. EUR cash FX is `0`. This is an analytical bridge over signed eligible cash buckets, not a prescription for tax currency lots. Every external and internal cash change included in the scope must appear exactly once in the identity. Settlement bucket moves cancel in total cash rather than becoming another economic currency acquisition.

Realized net reporting trading is `67.50 - 0.90 × 0.8 - 1.08 × 0.75 = 65.97`; unrealized net reporting trading is `126 - 1.20 × 0.8 = 125.04`. These are trading components. They do not include holding FX, cash FX, or actual conversion effects, and do not equal USD native net multiplied by one latest rate.

Actual conversion spread is already captured by the amounts/reference comparison. An extra spread or slippage deduction would break the bridge. Optional campaign attribution of conversion cost partitions the same cost; it must not add another account expense.

Change the current USD reporting rate to `0.9` in a new current valuation view: historical sale trading gross remains EUR `67.50`, historical fees remain EUR `2.49`, and the two actual conversions retain their amounts/rates. A pinned historical valuation at `0.7` remains EUR `10013.774`. The new current NAV is `8497 + 1386.82 × 0.9 + 780 × 0.9 = 10447.138` EUR; its change from the old current NAV is `433.364` EUR. That change is an updated mark/rate view, not a mutation of historical source events.

## F-06 — Shared fills and campaign attribution versus account lots

### Conserved source allocation

One account buys `100` shares at USD `10`, actual fee USD `1`. Campaign X receives `60`, entry fee `0.60`; campaign Y receives `40`, entry fee `0.40`. Account inventory is exactly `100`, gross basis `1000`, not `200`. A sell of `60` at USD `12`, with no fee for this narrowly scoped example, allocates closed attribution to Y `40` and X `20`.

Account gross realization is `120`, remaining quantity is `40`, and remaining gross basis is `400`. At mark `12`, account gross unrealized is `80`. Campaign Y gross realized is `80`; X gross realized is `40` and unrealized is `80`. Source cost USD `1` is conserved between realized entry cost `0.60` and remaining entry cost `0.40`; net account/campaign totals both equal `199`. Quantity and fee allocation histories are versioned together.

### Attribution basis can differ from actual FIFO realization

Use a separate no-fee example. Campaign X buys `100` at USD `10`; Y buys `100` at USD `20`; Y sells `100` at USD `30`. Account FIFO consumes the first source lot once: account gross realized `2000`, remaining actual gross basis `2000`, and unrealized `1000` at mark `30`. The campaign attributed-flow convention gives Y realized `1000`, and X remaining attributed basis `1000` with unrealized `2000`.

Both combined views total `3000`, but their realized split differs by `1000`. The attributed remainder is not a second physical account lot. Strategy tags cannot cause FIFO to consume the later actual lot or leave `200` owned shares. Display the scope and attribution definition; never claim these two realized figures are the same metric.

Unclassified quantities/costs must complete every reconciliation. A campaign cannot be confirmed closed while one of its attributed legs still has exposure or an unresolved supported obligation; an account-wide sale alone does not determine that status.

## F-07 — Multiple accounts, cash transfers, and holding lineage

Accounts A and B share one workspace/reporting currency EUR, but may belong to different brokers. Deposit EUR `1000` into A. A buys `10` shares at EUR `20`, fee EUR `2`. Transfer cash EUR `100` from A to B. Transfer `4` shares from A to B with original acquisition identity, original gross basis EUR `80`, and entry-cost component EUR `0.80`. B then sells `2` at EUR `25`, fee EUR `1`. Mark the remaining `8` at EUR `25`.

| Result | Account A | Account B | Consolidated |
| --- | --- | --- | --- |
| Cash | `698` | `149` | `847` |
| Open quantity | `6` | `2` | `8` |
| Remaining gross basis | `120` | `40` | `160` |
| Remaining carried entry fee | `1.20` | `0.40` | `1.60` |
| Marked holding value | `150` | `50` | `200` |
| Realized gross | `0` | `10` | `10` |
| Realized net with transferred entry-cost lineage | `0` | `8.60` | `8.60` |
| Unrealized gross / net | `30` / `28.80` | `10` / `9.60` | `40` / `38.40` |

Consolidated NAV is `1047`; profit after excluding the EUR `1000` deposit is `47 = 8.60 + 38.40`. The cash transfer is neither trading profit nor a consolidated external flow. The holding transfer produces no sale P&L, no invented destination purchase, and no cash debit. Destination consumption follows preserved lot lineage and the applicable accounting-pool compatibility policy.

Each cash-transfer leg balances in its actual account/currency and shares one transfer identity. Source and destination writes commit together; a failed destination write rolls back the source. A currency-changing transfer additionally references its explicit actual FX conversion; different-currency postings cannot balance each other by arithmetic addition.

An execution in B cannot consume inventory held solely in A. Corrections to an A acquisition that has descendants in B invalidate both scopes. FIFO chronology uses original acquisition lineage for transferred lots, not transfer arrival time as an invented acquisition date. Duplicate broker execution IDs in A and B remain distinct under their correct scoped identities.

## F-08 — Corrections, closure, and no synthetic realized sale

### Replace a posted acquisition

Buy `5` at USD `10`, fee `1`; sell `3` at USD `15`, fee `0.60`; mark remaining `2` at `20`. Original cash is `-6.60`, gross remaining basis `20`, market value `40`, and net account value `33.40`. Realized net is `15 - 0.60 entry fee - 0.60 exit fee = 13.80`; unrealized net is `20 - 0.40 = 19.60`.

Correct the purchase to `5` at USD `12`, fee `1.50`. Preserve the original purchase cash event (`-51` cash), append its exact reversal (`+51` cash), and append replacement (`-61.50` cash). Each event independently balances with its controls; the correction retains economic date, later recorded date, reason, actor, original source version, and replacement identity.

Restated cash is `-17.10`; quantity remains `2`; gross basis is `24`; market value remains `40`. Restated realized net is `45 - 36 - 0.90 - 0.60 = 7.50`; unrealized net is `40 - 24 - 0.60 = 15.40`; combined net is `22.90`. The bookkeeping reversal is not an actual sale of `5` and produces no synthetic sale realization. Canonical lot replay resolves the effective source chain before consuming inventory.

### Correction after confirmed closure

Buy `5` at USD `10`, fee `1`; sell all `5` at USD `15`, fee `1`; confirm campaign closure. Initial cash/realized net is `23`. Correct the purchase to `5` at `12`, fee `1.50`: flat quantity remains `0`, net realized/cash becomes `12.50`, and historical metric/reconciliation generations become stale until restated. A fee-only correction from original `1` to `1.50` at unchanged price would instead produce `22.50`, with no lot-quantity change.

In a separate replacement, correct purchase quantity to `6` at `12`, fee `1.50`, keeping the actual sale of `5` at `15`, fee `1`; the reviewed replacement allocates all `6` purchased units to the original campaign. Remaining quantity is `1`; realized net is `75 - 60 - 1.25 - 1 = 12.75`. At mark `20`, unrealized net is `20 - 12 - 0.25 = 7.75`; cash is `0.50`, NAV is `20.50`. Prior closure eligibility is invalid, and the campaign requires review rather than silently remaining a completed flat trade or treating the residual as a fresh unrelated campaign. If review instead assigns the extra unit elsewhere/unclassified, closure follows the effective conserved attribution, with the difference disclosed.

An audit-as-recorded view at the pre-correction recorded boundary reproduces its old expected values. A current restated view uses the new chain and labels its revision. A real later refund is a new economic receipt, not a backdated correction.

## F-09 — Opening holdings with unknown basis and sourced observations

Establish opening cash USD `100` and opening quantity `5` with explicitly unknown acquisition basis. A compatible opening mark is USD `12`, giving sourced/marked holding value `60` and account NAV `160`. Sell `2` at USD `15`, fee USD `1`; mark remaining `3` at `12`. Ending cash is `129`, holding value `36`, and account NAV `165`.

Quantity, proceeds `30`, fee `1`, cash, and current value are available. Average entry price, cost basis, realized trading P&L, and unrealized trading P&L are unavailable with `unknown_basis`; zero basis must not be substituted. With complete compatible opening/ending NAV and flow observations, observed account change `5` can be available even though its trading/FX attribution is unavailable. Any unresolved reconciliation difference remains unexplained, not automatically FX profit.

A imported position snapshot remains an observation until explicitly designated as opening inventory. Importing the same quantity observation alongside the opening record must not double holdings. Subsequent disclosure of acquisition basis creates a reviewed source correction and revised projection generation, preserving the earlier unknown result.

## F-10 — Settlement buckets do not double-count cash or fees

Start settled EUR cash `1000`. Buy `2` shares at EUR `50`, fee EUR `1`, with a known unsettled obligation. Book unsettled cash `-100` and trade control `+100`; book fee unsettled cash `-1` and fee control `+1`. Before settlement, settled cash is `1000`, unsettled cash is `-101`, total eligible cash is `899`; holding value at `50` is `100`, account NAV is `999`.

Actual settlement moves settled cash `-101` and unsettled cash `+101` in one balanced event. Ending settled cash is `899`, unsettled cash is `0`, total cash remains `899`, NAV remains `999`, and total fee remains `1`. A scheduled settlement date passing does not authorize this transition without a supported actual-settlement rule or explicit source evidence. Settled cash `1000` before settlement is not a claim of free buying power.

Then sell `1` at EUR `60`, fee EUR `0.60`, initially unsettled. Settled cash stays `899`; unsettled receivable is `59.40`; total cash is `958.40`; remaining marked holding is `60`; NAV is `1018.40`. Realized net is `10 - 0.50 entry fee - 0.60 exit fee = 8.90`; unrealized net is `10 - 0.50 remaining entry fee = 9.50`. Settle the receivable: settled cash `958.40`, unsettled `0`, unchanged NAV/profit `18.40`.

At the same event rate, both bucket legs cancel in the signed total-cash FX identity. A broker cash statement referring to either trade principal or fee attaches reconciliation evidence to that existing economic effect. It does not append a second principal, fee, or settlement.

## F-11 — Quoted basis versus actual rounded settlement principal

Buy `0.3333` shares at USD `10`: exact quoted principal is USD `3.333`; a verified cash-booking convention reports actual principal USD `3.33`; actual fee is USD `0.01`. Preserve source quantity/price, actual booked principal, and explicit principal rounding adjustment separately. The purchase produces cash `-3.34`, gross booked basis `3.33`, entry fee `0.01`, and a quote-to-booked principal adjustment giving economic benefit `+0.003`.

At mark USD `12`, holding value is `3.9996`; quote-price contribution is `0.6666`; gross unrealized against booked basis is `3.9996 - 3.33 = 0.6696`, equal to that price contribution plus purchase rounding benefit `0.003`. Subtract entry fee `0.01` to get net/account change `0.6596`. Cash plus holding also gives `-3.34 + 3.9996 = 0.6596`. The current marked value need not be rounded to spendable cash cents. The adjustment is already included in booked-basis gross P&L and must not be added again.

Sell all at USD `12`. Quoted proceeds are `3.9996`; actual booked proceeds are USD `4.00`; fee is USD `0.01`; sale rounding benefit is `+0.0004`. Gross realized against booked principal is `4.00 - 3.33 = 0.67`, decomposed into quote-price contribution `0.6666` and verified adjustments `0.003 + 0.0004`. Ending cash and total net realized account change are `0.65 = 0.67 - 0.02`. Quoted gross entry price stays `10`; economic net entry basis is `3.34`. No database cast may silently change the fill to fabricate this result, and an adjustment is not renamed fee, slippage, or FX. A reported booked amount that differs from the declared rounding rule must be reviewed/reconciled rather than silently coerced.

## F-12 — Advanced instruments are recordable without guessed notional cash

| Example | Required record/manual behavior | Forbidden implication |
| --- | --- | --- |
| Two futures contracts, entry `4000`, multiplier USD `50` per point, broker variation settlement USD `1000` | Preserve contract/expiry/tick metadata, actual fills, and explicit `+1000` cash with variation-settlement control. Any residual mark/P&L must specify whether prior variation margin reset its reference. | No automatic USD `400000` purchase debit; no second P&L addition for variation already settled in cash. |
| Option purchase, quantity `1` contract, premium USD `2`, multiplier `100`, explicit premium USD `200`, fee USD `1` | Record premium/multiplier and supplied cash `-201` with distinct fee identity; link manual exercise/assignment settlement when required. | Recording premium does not advertise native exercise/assignment or create a guessed underlying holding. |
| Multi-leg option idea | Record each contract/leg and each actual account settlement, with separate units/costs. | Do not add contracts with different underlyings/expiries into one interchangeable inventory quantity. |
| Bond face quantity `1000`, clean price `99` per `100` face, accrued interest `5`, explicit dirty cash principal `995` | Preserve quote convention, clean value `990`, accrued `5`, and supplied dirty settlement `995`; basis/income split requires the capability's defined convention. | Do not interpret price as USD `99` per unit or deduct accrued interest twice. |
| Inverse perpetual | Preserve inverse quantity/settlement/collateral units, explicit funding and broker valuations with metric definitions. | No linear stock formula and no invented collateral/full-notional debit. |
| Structured/knockout/custom product lacking a validated multiplier | Fill, instrument metadata, documents, and explicit cash/collateral events remain recordable; automatic missing-operand metrics are unavailable. | Do not infer `price × quantity` as cash, P&L, maximum loss, or a native capability. |
| Token reward/transfer | Record actual quantity, classification, lineage and any supplied value/basis convention; no paid provider is required. | No duplicate token asset and currency cash balance, invented historical fair value, or assumed zero basis. |

An explicit manual futures variation cash event `+1000` has a control `-1000` in the same currency; it balances without asset notional. Fees/funding each have their own effect identity. These tests validate safe record-only support and supplied settlements for AC-05–AC-08; each automatic module requires additional independent authoritative-contract examples before its capability status can change.

## F-13 — Rates, source dates, DST, and missing operands

- A fill at `10:00Z` sees rate observations at `09:00Z` (`0.8`) and `10:01Z` (`0.9`). With a pinned maximum age `30 minutes`, the first is stale and the second is future; reporting result is unavailable. An explicit reviewed observation at `09:59Z`, `0.85`, can enable a newly versioned view. No default cross-currency `1` is supplied.
- Direct USD-to-EUR `0.8` and the explicit inverse of EUR-to-USD `1.25` both yield `0.8`, with different provenance paths. Same-currency translation uses explicit identity `1` without a fake market observation. An approved EUR→USD `1.25`, USD→JPY `160` path yields EUR→JPY `200`; triangulation remains disabled until its policy and independent tests are accepted. Cyclic paths or incompatible/stale component times fail.
- Date-only buys and sells on the same date do not acquire invented midnight timestamps or an economically justified order from random UUID sorting. Require a trusted source ordinal or reviewed chronology; otherwise lot-consuming calculations/commands needing chronology remain blocked or incomplete. Date-only FX translation must use a declared date-precision policy, with its assumption disclosed.
- `2026-10-25 02:30 Europe/Madrid` is ambiguous: offset `+02:00` maps to `00:30Z`, offset `+01:00` to `01:30Z`. Require supplied offset or explicit reviewed interpretation. `2026-03-29 02:30 Europe/Madrid` is nonexistent and cannot silently normalize into a valid observed fill instant.
- Source sub-microsecond timestamp precision is retained in provenance and source order; database `TIMESTAMPTZ(6)` precision does not silently redefine sequence. Economic, recorded, trade-date, actual-settlement, and valuation fields remain distinct.
- A missing mark makes holding value/unrealized unavailable while quantity/cash may remain valid. A missing third-currency fee rate can block net/reporting P&L while native gross remains valid. Unknown original risk makes R unavailable, not `0`. No trades makes a trade-population ratio unavailable; positive gross gains with zero gross losses require the documented infinite/undefined result, not profit factor `0`.

## F-14 — Frozen strategy, plan, risk, and completion context

A campaign commits a genuine pre-trade plan under strategy version V1, with original risk EUR `20`. A later scale-in records supplemental risk EUR `10`; strategy V2 changes its stop/risk rules. For a complete EUR net result `30`, original-risk R is `30 / 20 = 1.5`, retaining V1 and the original snapshot. A separate explicitly named supplemental-risk measure may use other denominators only under its own dictionary; it cannot relabel `30 / 30 = 1` as original-risk R.

Missing, nonpositive, incompatible, or retrospective-only original risk makes the original-risk R unavailable. V2 publication, strategy archival, a display-currency change, or a late imported plan cannot mutate the V1 plan/risk provenance. A corrected source result can create a labeled R restatement while the genuine original denominator stays frozen.

Closed, sufficient, reconciled, and projection-current are independent states. A confirmed flat campaign may be closed but incomplete for fee-inclusive metrics; an open campaign may be reconciled. A canceled order with no fills generates no holdings, cash or actual P&L. Canceling an order after a partial fill leaves its actual fills and inventory intact. A canceled/no-execution campaign is not a completed trading outcome; hypothetical results stay separate.

## F-15 — Dividend, withholding, and split lineage

Start EUR cash `1000`; buy `10` shares at EUR `20`, actual entry fee EUR `2`, leaving cash `798`, gross principal basis `200`, and carried entry fee `2`. Receive dividend EUR `5` and withholding EUR `1` as distinct linked source effects. Cash becomes `802`; net income is `4`; gross basis remains `200`. The dividend is not silently subtracted from source entry price.

A reviewed `2-for-1` split changes quantity to `20` and compatible quote-price lineage to EUR `10` per new share, preserving total gross basis `200`, entry fee `2`, acquisition/FX/policy lineage, and no cash effect. At a split-adjusted mark EUR `10`, holding value and P&L are unchanged. At later mark EUR `12`, holding value is `240`; gross unrealized is `40`; net trading unrealized is `38`; NAV is `1042`, reflecting price gain `40`, dividend `5`, withholding `-1`, and entry fee `-2`.

Sell `6` post-split shares at EUR `12`, fee EUR `0.60`. Consume gross basis `60` and entry fee `0.60`; realized net is `72 - 60 - 0.60 - 0.60 = 10.80`. Remaining quantity is `14`, gross basis `140`, carried fee `1.40`, and net unrealized at `12` is `168 - 140 - 1.40 = 26.60`. Ending cash `873.40` plus holdings `168` gives NAV `1041.40`, agreeing with trading net `37.40` plus net income `4` after excluding original external funding.

The corporate-action handler must retain old/new unit conventions and conserve lineage; a ticker/metadata edit alone cannot perform the split. This is an independent expected-value gate for a future supported split handler. An unvalidated spinoff, return of capital, merger, reward basis, or other action remains record/manual treatment until its own convention and fixtures exist.

## F-16 — Negative monetary cash and short holding FX signs

### Negative cash

At interval start an explicit supported margin-cash balance is USD `-100`, reporting rate EUR `0.8` per USD. An external contribution of USD `40` at rate `0.9` reduces the liability. Ending balance is USD `-60`, ending rate `1`. Opening/ending reporting NAVs for this cash-only example are EUR `-80` / EUR `-60`; net dated external flow is EUR `36`.

Cash FX is `-60 × 1 - (-100 × 0.8) - 40 × 0.9 = -16`. Account change excluding external flow is likewise `-60 - (-80) - 36 = -16`. The negative cash liability has increased in reporting value relative to unchanged-currency funding; the result must not be flipped because the cash balance is negative. No holdings/price component or invented currency lot exists.

### Short asset liability versus cash proceeds

In a separate no-fee example, open a short of `10` at USD `100`, reporting rate EUR `0.8` per USD. Cash receives USD `1000`; signed gross holding basis is USD `-1000`; opening NAV is `0`. At USD mark `90` and reporting rate `0.9`, cash is EUR `900`; signed holding value is EUR `-810`; NAV is EUR `90`.

Native gross unrealized is USD `100`. Reporting trading component is `(V - B) × r_end = (-900 + 1000) × 0.9 = 90`. Holding FX is `B × (r_end - r_basis) = -1000 × (0.9 - 0.8) = -100`; cash FX is `1000 × 0.9 - 1000 × 0.8 = 100`. The complete bridge is `90 - 100 + 100 = 90`; short liabilities and their cash proceeds are separate populations counted exactly once.

## F-17 — Delayed transfer ownership while in transit

Start with EUR cash `100` in A and `0` in B. Depart EUR `40` from A to B: cash in A becomes `60`, B remains `0`, and the supported linked in-transit monetary asset is `40`. Consolidated NAV remains `100`. Receipt requires actual evidence; it moves B cash to `40` and extinguishes transit value to `0`, preserving consolidated NAV `100` and creating no profit/external owner-level flow. Transfer controls are not the in-transit asset.

Receiving the same transfer twice must fail idempotently. A failed/delayed receipt does not restore the departed money to A or create destination money without evidence. If in-transit ownership/custody cannot be established, the affected interval is incomplete; do not claim consolidated NAV `60` as a trading loss or assume arrival from an expected date. A view selecting only A treats the departing `40` as leaving that selected scope, while complete owner-level consolidation treats it as internal.

For a separate holding example, start with A holding `10` shares, gross basis EUR `200`, marked at EUR `25` each. Depart `4`: A has `6` with basis `120`, transit has `4` with preserved basis `80`, B has `0`; consolidated quantity stays `10`, marked value `250`, gross unrealized `50`. Receipt transfers the same `4`/`80` lineage to B and extinguishes transit quantity; totals stay identical. Source, transit and destination representations cannot all claim the same `4` shares simultaneously.

## F-18 — Foreign-currency transfer has separate cash and transit FX

Reporting currency is EUR; all rates are EUR per USD. Start with USD `100` cash in A, `0` in B, no in-transit claim, and rate `0.8`, giving opening NAV EUR `80`. Depart USD `40` at rate `0.8`, preserve owned in-transit money, and receive the same USD `40` into B at rate `1`. There are no fees, conversions, holdings, or external owner-level flows. Actual transfer amounts are unchanged; market translation does not create additional native units.

| Boundary | A cash USD | B cash USD | In-transit monetary claim USD | EUR-per-USD rate | Cash value EUR | Transit value EUR | Consolidated NAV EUR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Opening | `100` | `0` | `0` | `0.8` | `80` | `0` | `80` |
| Departure confirmed | `60` | `0` | `40` | `0.8` | `48` | `32` | `80` |
| Intermediate valuation before receipt | `60` | `0` | `40` | `0.9` | `54` | `36` | `90` |
| Receipt confirmed / ending | `60` | `40` | `0` | `1` | `100` | `0` | `100` |

For cash only, dated movements are `-40` at `0.8` and `+40` at `1`; their reporting sum is `8`. Cash FX over the full interval is `100 × 1 - 100 × 0.8 - (-40 × 0.8 + 40 × 1) = 12` EUR.

The separately named transit monetary FX component uses the same identity over the owned claim population: `T_end × r_end - T_start × r_start - Σ(delta T_j × r_j)`. Transit movements are `+40` at departure and `-40` at receipt, with reporting sum `-8`; transit FX is `0 - 0 - (40 × 0.8 - 40 × 1) = 8` EUR. These are distinct populations: the transfer control is not the claim, and the claim is not counted again as a cash bucket.

Full-interval monetary FX is `12 + 8 = 20`, matching `100 - 80` EUR NAV change. At the intermediate `0.9` boundary, cash FX is `54 - 80 - (-32) = 6` and transit FX is `36 - 0 - 32 = 4`, giving total `10` and NAV `90`. Counting only cash during transit would falsely show EUR `54` rather than `90`; attributing all FX to cash while also adding transit FX would double-count.

Cash/claim transitions use one confirmed event time/rate context per transition and offset their dated movement values exactly. A missing ownership claim, missing transition/rate, duplicate receipt, or an unsupported transit convention makes the affected complete bridge unavailable; it cannot be renamed unexplained transfer loss or settled cash.

## F-19 — Prospective FIFO-to-average transition preserves source FX and costs

Start with USD cash `100`, no holdings, reporting EUR rate `0.8`, and FIFO policy V1. Buy lot L1: `2` shares at USD `10`, actual entry fee USD `2`, reporting rate `0.8`. Buy L2: `2` at USD `20`, fee USD `2`, rate `0.9`. Principals already equal quoted values. Publish a reviewed prospective average-cost policy V2 and an explicit pool-conversion snapshot before the next disposal.

| Preserved contribution at transition | Quantity | Gross principal USD | Original EUR-per-USD basis rate | Historical gross principal EUR | Entry cost USD | Charged-date entry cost EUR |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | `2` | `20` | `0.8` | `16` | `2` | `1.60` |
| L2 | `2` | `40` | `0.9` | `36` | `2` | `1.80` |
| Total | `4` | `60` | Explicit source vector | `52` | `4` | `3.40` |

The transition has no cash postings, no new income/P&L, no new acquisition date, and no retroactive rematching. Quantity remains `4`, gross principal basis `60`, economic net entry basis `64` USD, and execution-weighted gross entry price `15`. The original L1/L2 rates, charged-currency components, acquisition identity/order, metadata versions and V1 history remain stored. A rounded average FX rate cannot replace this vector.

Under V2, sell `2` at USD `30`, fee USD `1`, reporting rate `1`. Proportional average consumption removes one half of each source contribution: L1 quantity `1`, principal `10`, entry fee `1`; L2 quantity `1`, principal `20`, entry fee `1`. Historical consumed principal is EUR `8 + 18 = 26`, and consumed entry fees are EUR `0.80 + 0.90 = 1.70`. The identical source portions remain for the open `2` units.

| Result | Independent expected value |
| --- | --- |
| Realized gross native | `60 - 30 = 30` USD |
| Realized net native | `30 - 2 consumed entry fees - 1 exit fee = 27` USD |
| Realized reporting trading component | `30 × 1 = 30` EUR |
| Realized holding FX | `10 × (1 - 0.8) + 20 × (1 - 0.9) = 4` EUR |
| Realized net reporting, including holding FX | `30 + 4 - 1.70 - 1 = 31.30` EUR |
| Remaining quantity / gross principal basis / gross average price | `2` / USD `30` / USD `15` per share |
| Remaining original principal/FX and fee components | L1 USD `10` at `0.8`, L2 USD `20` at `0.9`; USD `1` fee at each original charged-date rate |

Mark the remaining shares at USD `25`, reporting rate `1.1`. Value is USD `50` / EUR `55`; native gross/net unrealized are USD `20` / USD `18`. Reporting trading is `20 × 1.1 = 22`; holding FX is `10 × (1.1 - 0.8) + 20 × (1.1 - 0.9) = 7`; remaining entry fees are EUR `1.70`; net reporting unrealized including holding FX is EUR `27.30`. Gross reporting against historical basis also reconciles: `55 - 26 = 29 = 22 + 7`.

Ending USD cash is `100 - 20 - 2 - 40 - 2 + 60 - 1 = 95`. Its dated movement value is `-22 × 0.8 - 42 × 0.9 + 59 × 1 = 3.60` EUR, so cash FX is `95 × 1.1 - 100 × 0.8 - 3.60 = 20.90` EUR. Ending NAV is `95 × 1.1 + 55 = 159.50`; the bridge is `31.30 + 27.30 + 20.90 = 79.50 = 159.50 - 80`, with no period external flow or additional transition effect.

An unreviewed preference toggle from V2 back to FIFO is rejected: it cannot invent individually assignable original basis or rewrite the already completed average disposal. A requested migration that restores full L1 `2`/`20` as the only remaining lot would lose USD `10` basis and the L2 FX/cost lineage even though its displayed quantity is `2`; reject it without changing facts/policy. A compatible explicitly reviewed future transition is permitted only if remaining quantity `2`, basis `30`, fee vector `2`/EUR `1.70`, source FX contributions and historical matching remain conserved. If assignable lineage is unavailable, keep the existing pool policy or require a separately audited historical restatement. Do not infer a fresh FIFO acquisition at the transition date.

## Persistence and concurrency acceptance plans

These are mandatory future real-PostgreSQL integration tests. Passing arithmetic alone does not satisfy them.

| Test contract | Setup/action | Required observable outcome |
| --- | --- | --- |
| Per-currency balance | Try an event with USD `+10/-9`, or USD `+10` offset only by EUR `-10` | Commit rejected; no partial sources/postings/audit/outbox; every accepted event has exact zero sum for each currency |
| Atomic dependent writes | Valid source fill followed by invalid allocation/fee/posting | Full dependent transaction rolls back, including financial source revision and recomputation intent |
| Concurrent shared allocation | Two transactions each allocate `6` against one `10` source magnitude under contested revisions | No committed total over `10`; loser receives explicit conflict/retry outcome; exact cost/unallocated remainder preserved |
| Concurrent lot consumption | Two explicit close-only commands each request consumption of `6` from available long inventory `10` | At most one conflicting full request succeeds; loser receives a revision/inventory conflict; stale async projections cannot justify overconsumption. Genuine actual fills that cross zero are recorded as closure plus new short exposure with any eligibility warning |
| Opposite-direction concealment | Allocate `12` long and `-2` short against a long `10` source | Rejected; magnitude and direction rules do not permit cancellation to hide duplication |
| Multi-account lock ordering | Concurrent A→B and B→A transfers/corrections | Shared documented lock order; bounded retries with original idempotency key; no half transfer or duplicate event |
| Historical correction dependencies | Correct a source lot transferred across accounts and later consumed/shared between campaigns | Dependent inventory and attributed results invalidate from the earliest affected economic boundary, including destination scopes |
| Effective-source replay | Replay F-08 original/reversal/replacement | Expected restated quantities/P&L; no synthetic realized sale from bookkeeping reversal; audit-as-recorded view retained |
| Duplicate request/import | Retry identical command/file/broker IDs after timeout/restart | Counts, cash, quantities, fees, source revision and effects do not duplicate; same key with different payload is an explicit conflict/correction proposal |
| Source-effect reconciliation | Import cash principal/fee already generated by a known source fill | Attach evidence to the existing exact economic-effect identity; changed rows propose reviewed correction; ambiguous matches stay reviewable |
| Workspace isolation | Every referenced account/instrument/currency/strategy/fill/lot/source/file belongs to another workspace | Server rejects link; composite foreign keys and RLS prevent storage/read/write; export/attachments also deny access |
| Runtime role containment | Attempt privileged bypass, schema changes or auth-data reads via journal DB role; submit client claims for another tenant | Privileged operations denied; server rejects unauthorized tenant selection. RLS denies missing/wrong transaction context and pool leakage, but does not protect against a compromised SQL-capable application that can choose its trusted context |
| Outbox durability | Crash immediately after source commit and before enqueue; redeliver outbox/job | Posted facts survive; recomputation is retried at least once; duplicate dispatch produces no second financial effect/generation publication |
| Stale generation publication | Jobs read revisions N and N+1; N finishes after N+1 | N cannot overwrite the current N+1 generation; no mixed-context response; stale/pending/failed state is visible |
| Canonical-slice freshness | A correction is pending when a new inventory-consuming write arrives | Synchronous affected-slice rebuild under locks or explicit blocked/conflict response; no stale inventory acceptance |
| Engine version and restore | Restore F-05/F-07/F-08 with sources, manifests, pinned rates and IDs | Same compatible engine reproduces totals; missing engine blocks recomputation truthfully; latest engine is not silently substituted |
| Metadata changes | Publish a new multiplier/unit version after recorded fills | Historical bindings stay unchanged; incompatible units do not join one accounting pool; a correction uses explicit restatement |
| Transit currency ownership | Replay F-18 departure, intermediate valuation and receipt, including restart/duplicate arrival | Cash and transit FX sum to EUR `20`; intermediate NAV is `90`; each native unit is owned/countable once; missing claim/transition data blocks complete bridge |
| Lot policy conversion | Replay F-19 reviewed FIFO-to-average transition and attempt invalid average-to-FIFO toggle | Exact principal/FX/cost/source lineage preserved; transition posts no cash/profit; invalid migration rejected atomically and prior realization is not rewritten |
| Restart/offline providers | Reload/restart between posted sources, outbox retry and projection reads with no providers configured | Source facts persist and core manual operations work; no fake provider status or hidden market-rate requirement |

Tests must run under application roles as well as narrowly privileged test setup. Exercise source versions, expected revisions, database constraints, actor/workspace authorization, durable commit boundaries, and restart states; mocks-only tests are insufficient. Any integrity failure keeps the associated write/calculation capability disabled.

## Acceptance traceability

| Requirement scenario | Phase 2 foundation contracts |
| --- | --- |
| AC-01: two EUR/USD conversions, partial exits, later FX | F-05, F-11, F-13, F-18–F-19; exact native/reporting/account bridge and preserved FX lineage |
| AC-02: partial fills/exits and completion | F-02–F-04, F-14, F-19; conserved quantities/costs/policy transitions and independent closure |
| AC-03: shared fills across strategies | F-02, F-06; one account inventory pool, conserved attribution |
| AC-04: shorts and borrow costs | F-04, F-16; signed quantity/valuation/FX, actual costs, partial cover/both zero-crossing directions |
| AC-05: options/multi-leg exercise or explicit settlement | F-12; record/manual contract, automatic module separately gated |
| AC-06: futures/perpetual settlement/funding | F-12; no full-notional cash debit or settled-P&L double count |
| AC-07: fixed-income quote/accrued conventions | F-12; explicit compatible dirty settlement and gated native valuation |
| AC-08: unsupported custom automatic pricing | F-12–F-13; useful recordability/manual cash and reasoned unavailable metrics |
| AC-09: corporate action/transfer/unknown basis/correction | F-07–F-09, F-15, F-17–F-19; split/dividend/transit/policy lineage plus subtype-specific action gates |
| AC-10: external versus internal flows | F-05, F-07, F-10, F-17–F-18; deposits/transfers never become trading profit |
| AC-11: duplicate import and invalid rows | F-01 plus idempotency/atomic/source-effect persistence contracts |
| AC-12: strategy versions and missing R | F-14; immutable real original plan/risk and typed unavailable results |
| AC-13: insufficient inputs/undefined metrics | F-02, F-09, F-13; component availability, no fabricated zero |
| AC-14: workspace/user isolation | Workspace/role integration contracts; every nested source/attachment/export reference |
| AC-15: backup/restore reproduces totals | All fixtures under the same calculation manifest, source versions and reporting inputs |
| AC-16: core manual/offline workflows and persistence | Restart/outbox/manual-capability contracts; reload and restart source fidelity |

This document specifies expected results and acceptance plans only. Decimal arithmetic for the reconciling examples was independently checked during Phase 2 review. Unit/integration/browser tests, automatic instrument capabilities, restore fidelity, security behavior and runtime performance remain unimplemented and unverified after the scaffold rollback.
