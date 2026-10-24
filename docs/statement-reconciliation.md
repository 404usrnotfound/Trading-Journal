# Independent statement reconciliation

A statement is independent source evidence for one account at a precise UTC instant. Record the source name and reference, optionally its SHA-256 file hash, and the statement's native cash balances, signed net instrument quantities and optional equity total. The statement never posts cash, changes inventory or overrides an internal valuation.

Cash comparisons use **all economically owned cash buckets**, including settled, unsettled, restricted and collateral cash. Holding comparisons use the account's netted instrument ownership books. Equity uses the declared `owned-cash-plus-signed-holdings/1` definition for that account, with explicit price/FX source priorities and freshness policies. Broker figures with different definitions must first be supplied under compatible source definitions; buying power, margin and derivative notional are not interchangeable with equity.

Mark a cash or holding section complete only when it lists the entire account population at that instant. A complete section treats omitted internal currencies or holdings as independently stated zero and reports any difference. An incomplete section compares only explicitly listed rows. Every amount/quantity has an exact nonnegative tolerance, default zero. Variance is **internal amount minus statement amount**, and a row matches when its absolute variance is at most the stated tolerance. Tolerances do not change either source value or hide the retained variance. Missing marks, FX, basis/unsupported quantity evidence or numeric overflow produce an unavailable comparison rather than an assumed zero.

Each assessment retains the statement instant, actor, review note, financial source revision, valuation policy and per-row expected/actual/variance/tolerance. A result is matched, has variance, or is unavailable. Only a wholly matched result can be explicitly accepted. Statements and assessments are immutable; reassessment appends another record. Currentness is conservative: any newer workspace financial command, apart from statement creation/assessment, marks an older assessment stale. Its historical acceptance and exact original comparison remain visible, and a new assessment is required before relying on current agreement. This can request reassessment after unrelated account or catalog changes rather than risk retaining an obsolete assertion.

All resources are beneath `/api/v1/workspaces/{workspaceId}/reconciliation`:

| Method     | Resource                      | Behavior                                                                     |
| ---------- | ----------------------------- | ---------------------------------------------------------------------------- |
| GET / POST | `statements`                  | List / record independent source evidence                                    |
| GET        | `statements/{id}`             | Read immutable statement                                                     |
| GET / POST | `statements/{id}/evaluations` | List assessments / compare a pinned financial revision and optionally accept |
| GET        | `evaluations/{id}`            | Read original comparison with current stale status                           |

Current workspace viewers can read evidence. Recording and assessing require editor/owner access, a valid mutation session, same-origin CSRF proof and a UUIDv4 idempotency identity. Identical retries preserve the original assessment; changed inputs under the same identity conflict. Tenant RLS, composite source FKs and immutable triggers also protect persisted evidence.

The synchronous workflow permits 100 cash units and 100 holding books per statement/account, uses exact decimal strings and retains explicit scope errors. It supports manual statements without broker credentials or market subscriptions. It does not assert that a user's manually entered statement or optional file hash was independently authenticated; the supplied source provenance remains reviewable evidence.
