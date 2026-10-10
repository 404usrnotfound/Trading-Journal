# ADR 0009: Financial domain contracts and reconciling attribution

- **Status:** Accepted following Phase 2 approval; financial implementation deferred
- **Scope:** Domain detail within accepted ADRs 0004–0006; no change to the modular monolith or selected stack.
- **Resolves:** D-03–D-13 financial primitives and relationships; preserves later operation-specific validation gates.

## Context

The approved architecture separates cash, inventory, and trading decisions but leaves detailed matching, fee rounding, FX attribution, and incomplete-history contracts to the financial domain phase. Implementing a generic trade row before resolving them would make partial fills, multiple accounts, shared executions, derivatives, and historical corrections difficult to reconcile.

## Decision

Adopt the logical [domain model](../domain-model.md), versioned [calculation contracts](../financial-calculations.md), per-operation [instrument capabilities](../instrument-capabilities.md), and independent [fixture catalogue](../financial-fixtures.md) as the Phase 2 design for review.

1. An execution is actual activity; orders are recorded intent; a trade is a review campaign. Account holdings consume source inventory once. Analytical campaign FIFO matches conserved execution allocations separately from account lot-policy matching. Their realized basis differences need an explicit realized/unrealized attribution bridge.
2. Ordinary netted holding books are the initial native inventory boundary. True segregated broker long/short compartments require explicit book identity and validation. Zero-crossing fills close opposite inventory and open the remainder. Actual source breaches remain recordable; explicit close-only consumption must not exceed inventory.
3. Preserve source fill price/theoretical notional and actual booked settlement principal separately. Principal determines actual gross cash basis/proceeds; a verified settlement-rounding difference is an explicit decomposition, not an unexplained fee or altered fill price.
4. Use exact scale-36 analytical partitions of booked principal, quantities and every original charged-currency cost. Largest fractional remainder with stable-ID tie-breaking conserves source totals. Allocation pieces are not new spendable cash charges.
5. Actual FX conversions exchange native monetary units; reporting dependencies pin separate historical observations. Use signed transaction-anchored holding FX, signed cash mark-to-market identity, and a separate conversion execution difference. Account change reconciles these with trading effects, income, actual costs and scope-specific external flows. Tax FX lots are a separate possible jurisdiction module.
6. Internal transfers retain lot/basis/rate lineage. Evidenced cash or holdings in transit are once-counted economic assets; ledger controls explain postings and never become NAV assets. Cash/instrument custody representation prevents counting the same digital units twice.
7. Time precision, unknown opening basis, incomplete charges, source corrections and immutable plans/risk remain explicit. Effective source selection precedes inventory replay; bookkeeping reversals are not fictitious market trades. Later data creates new restated generations while retaining prior recorded outputs.
8. All required asset families have record/manual-settlement contracts. Native formulas are enabled per validated subtype and operation; no asset-family label authorizes stock-style cash/valuation arithmetic.

## Alternatives

| Alternative | Reason not selected |
| --- | --- |
| Campaign-owned custody lots | Duplicates inventory or makes strategy assignment change account economics. |
| Use quoted notional as every actual cash debit | Loses settlement rounding and incorrectly handles futures, inverse contracts and accrued-interest instruments. |
| Allocate every fractional fee to cash minor units | Adds unnecessary money distortion to analytical allocation; the original booked fee already controls actual cash. |
| Use current FX for all history or assume FIFO tax currency lots | Changes historical results or imposes a jurisdictional model outside the analytical journal. |
| Count transfer controls as equity | Treats explanatory counterparts as assets and can double count cash in transit. |
| Add a microservice for accounting | Does not improve these invariants; atomic commands and a shared pure kernel suffice. |

## Consequences and validation

The schema has explicit version, lineage, economic-effect and projection-context records. This increases relational detail while making monetary conservation and audit testable. The design can preserve useful quantities/cash/marks when P&L is unavailable.

The [Phase 2 validation report](../phase-2-validation.md) records documentation review and independent example arithmetic. It does not certify application financial behavior. Phase 3 must rebuild and verify the reverted scaffold. Phase 4 must implement the contracts with independent unit/property tests and real PostgreSQL constraint/concurrency tests. Advanced native modules, triangulation, segregated books, campaign reopening and return solvers retain their documented feature gates; mandatory recording/manual paths remain in scope.
