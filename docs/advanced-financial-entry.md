# Advanced financial entry

Open **Record → Advanced financial entry** for source events beyond the guided fill workflow. The editor uses the same authorized, idempotent commands as imports and the public API. Review the source values before confirming; viewing the review does not post anything.

The editor supports brokers, cash buckets, deposits and withdrawals, opening cash and lots, actual currency conversions, native and manual executions, multiple actual charges, specific source lots, orders and packages, split execution allocations, settlement and internal cash movements, standalone fees, and price, FX and account-value observations. Unsupported automatic instrument accounting remains explicit; recording source values does not invent a valuation formula.

Amounts, quantities, prices and rates remain decimal strings. Economic instants require an ISO 8601 offset. Enter actual conversion amounts and charges separately: a reporting exchange rate does not move cash. Opening lots preserve unknown basis and incomplete costs when source evidence is missing.

For specific-lot accounts, choose the account and inspect **Available source lots**. For a split allocation, select the recorded execution, load its current allocation version, and choose campaign leg references. Allocation changes preserve the original fill and cash postings; the server checks quantity and fee conservation and rejects a stale allocation version.

If a confirmation response is interrupted, the editor retains the exact command and freezes its source fields. Retry confirmation to discover the committed result without booking a second event. An explicit rejected command permits correction. Do not infer failure from a lost response.

Regression coverage includes exact multi-currency charges and source timestamps, manual source economics, explicit lots, allocation validation and interrupted-response command reuse in unit/UI tests. `tests/e2e/advanced-record.spec.ts` exercises funding, conversion, a specific-lot disposal with two charge currencies, an interrupted committed response, and a split allocation against the real application and database. Executed release results are recorded in [the final audit](final-audit.md).
