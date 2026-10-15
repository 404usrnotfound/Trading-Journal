# Testing and correctness campaign

Phase 14 reviews merged Phase 13 commit `17b4105bc1630056d77d4dcae54d76f466ec421d` against the corrected complete testing prompt. The [domain model](domain-model.md), [financial calculations](financial-calculations.md), [portfolio accounting](portfolio-accounting.md) and [analytics definitions](analytics-definitions.md) remain authoritative. This increment adds tests, documentation and a narrow correction to NAV availability for proven zero foreign exposure. It adds no product features. Financial formulas, classifications, migrations, dependencies and runtime configuration remain unchanged; validation is preserved and strengthened.

## Coverage audit

The baseline already has 718 unit/property/UI tests, 494 PostgreSQL tests and 13 browser scenarios. Counts describe executed test cases, not financial completeness or percentage coverage. The audit prioritizes independent expected results and combinations across boundaries.

| Area                               | Existing coverage                                                                                                                                               | Gap and Phase 14 response                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decimal arithmetic and lot costing | `financial-decimal`, `financial-inventory`, independent F-03/F-04/F-05 fixtures; FIFO/average/specific selection, zero crossings, small fees and unknown basis  | One existing property generated integer quantities at price 1 despite its “fractional partials” name. Its description now accurately identifies fractional fee allocation; assertions are retained. New deterministic BigInt properties generate genuinely fractional quantities, differing cent prices and signed per-share costs for multiple long/short lots. |
| Multi-currency accounting          | Independent F-05 and `portfolio-accounting-reports` cover conversion, one acquisition and partial disposal; cash/transfer conservation properties already exist | No single persisted workflow joined order partial fills, separate scale-in, partial FIFO disposal, dividend withholding, a later commission, final disposal, return conversion and withdrawal. The new campaign checks them together against independently authored constants.                                                                                   |
| Orders versus executions           | `financial-api` tests partial fills, amendments, late fills and execution history                                                                               | The joined campaign proves placing an order leaves cash untouched, checks partial/complete order quantities, and then reconciles actual executions to inventory and account performance.                                                                                                                                                                         |
| Fee attribution                    | Existing tiny-fee/final-remainder and cost-attribution tests                                                                                                    | New cases distinguish entry/exit commissions, a dated execution-linked late charge, actual account fees and their historical FX. Every source charge is conserved in the fractional properties; fees reduce cash once.                                                                                                                                           |
| Idempotency and atomicity          | Existing services/SQL tests cover retries, corrections, competing close-only commands and scoped imports                                                        | The joined API campaign concurrently replays its actual conversion, fill and dividend; compares full-row SHA-256 fingerprints; rejects changed retries and an oversized close-only sale without residual commands, cash, fees, projections, audit or outbox effects.                                                                                             |
| Multiple accounts and brokers      | Existing transfer and versioned portfolio tests                                                                                                                 | A second broker/account holds the same instrument and reuses a broker source ID. Separate results and a combined immutable portfolio scope are checked; duplicate report accounts are rejected.                                                                                                                                                                  |
| Temporal correctness               | Existing microsecond ordering, historical context and observation selection tests                                                                               | The joined bridge is split exactly at the dividend timestamp. Income/tax appear once and the following day's fee stays in the later interval. Quotes one microsecond beyond the report boundary are excluded; widening the boundary uses them, while the original source revision reproduces the report exactly.                                                 |
| Availability and access            | Existing missing-price/FX/basis/fee tests and tenant/role regressions                                                                                           | The campaign's real conversion cannot substitute for missing market FX. A partial known EUR subtotal cannot become complete performance. Viewer reports remain read-only; viewer writes and cross-tenant reports are denied without financial changes.                                                                                                           |
| Browser persistence                | Existing single-currency fractional ledger/reload, manual-entry retry, import, journal, strategy, dashboard and security journeys                               | A new browser scenario signs in, performs real authenticated API writes, checks checkpoints and reconciliation, reviews the actual account page and reloads it. No network results or financial calculations are mocked.                                                                                                                                         |

Canonical FX-index equivalence tests remain useful for implementation consistency, but are not independent arithmetic oracles. The new inventory oracle uses test-local BigInt rational arithmetic rather than production decimal, money, matching or summation helpers. The primary acceptance constants are hand-worked, shared test data; they are never generated from engine output.

The corrected scope extends the joined scenario through final liquidation, the return FX conversion and withdrawal. It also verifies the complete analytics dictionary and additional precision, zero/negative, missing-market-data and hostile-import cases described below. The audit table's individual-operation coverage is complemented by the complete lifecycle; passing individual operations alone is insufficient evidence for the joined accounting result.

The new browser case provisions a separate owner and workspace through the existing operator bootstrap. It does not share another scenario's data or sign-in allowance. Production rate limits and authentication checks remain enabled.

## Worked acceptance scenario

Use one EUR-base cash account, settled EUR/USD buckets, ordinary delivered shares, multiplier 1 and FIFO. Quantities/prices/amounts are decimal strings. All USD rates below mean **EUR per USD**, not the actual exchange's execution rate. Fixed synthetic 2030 dates make the fixture reproducible. Economic instants retain six fractional digits; source ordering keys resolve same-instant facts.

| Step       | Source facts                                                                | EUR cash | USD cash |
| ---------- | --------------------------------------------------------------------------- | -------: | -------: |
| 1 January  | Deposit EUR 10,000                                                          |    10000 |        0 |
| 2 January  | Exchange EUR 1,000 for USD 1,100; EUR 2 conversion fee; reference rate 0.90 |     8998 |     1100 |
| 3 January  | Place buy order for 6.5 shares; no execution yet                            |     8998 |     1100 |
| 3 January  | Partial fill 2.5 shares at USD 100; USD 1 commission; rate 0.90             |     8998 |      849 |
| 4 January  | Fill remaining 4 at USD 102; USD 1.50 commission; rate 0.91                 |     8998 |    439.5 |
| 5 January  | Additional buy 1.5 at USD 110; USD 0.75 commission; rate 0.92               |     8998 |   273.75 |
| 6 January  | Sell 3 at USD 120; USD 1 commission; rate 0.94                              |     8998 |   632.75 |
| 7 January  | USD 10 gross dividend, USD 1.50 withholding; rate 0.95                      |     8998 |   641.25 |
| 8 January  | USD 2 late broker commission linked to the partial sale; rate 0.95          |     8998 |   639.25 |
| 10 January | Mark remaining shares at USD 130; end rate 0.95                             |     8998 |   639.25 |
| 11 January | Final sale of 5 at USD 140; USD 1.25 commission; rate 0.96                  |     8998 |     1338 |
| 12 January | Exchange all USD 1,338 for EUR 1,290; EUR 3 fee; reference rate 0.97        |    10285 |        0 |
| 13 January | Withdraw EUR 1,000                                                          |     9285 |        0 |

The first disposal consumes all 2.5 shares from the first fill and 0.5 of the second fill. Consumed principal is `250 + 51 = USD 301`; gross realized P&L is `360 − 301 = USD 59`. Consumed entry charges are `1 + 1.5 × 0.5/4 = USD 1.1875`; the original exit commission gives net realized P&L `59 − 1.1875 − 1 = USD 56.8125`. The evidenced Jan 8 late execution commission reduces that realized net result to USD 54.8125. It is charged once to cash and attributed once to the sale.

At the Jan 10 checkpoint, remaining lots are 3.5 shares at USD 102 and 1.5 at USD 110. Their gross principal basis is `357 + 165 = USD 522`, remaining entry fees are `1.3125 + 0.75 = USD 2.0625`, and fee-inclusive basis is USD 524.0625. Open quantity is 5; average entry price is `522/5 = USD 104.4`. Marked value is USD 650; gross/net unrealized P&L is USD 128 / 125.9375. The late exit commission does not become an entry cost on remaining inventory.

| Complete EUR accounting bridge |                                                                                    Exact value |
| ------------------------------ | ---------------------------------------------------------------------------------------------: |
| Realized gross trading         |                                                                            `59 × 0.94 = 55.46` |
| Unrealized gross trading       |                                                                           `128 × 0.95 = 121.6` |
| Holding FX                     | `250 × (0.94 − 0.90) + 51 × (0.94 − 0.91) + 357 × (0.95 − 0.91) + 165 × (0.95 − 0.92) = 30.76` |
| Cash FX                        |                     `639.25 × 0.95 − Σ(dated signed USD cash movement × event rate) = 24.6875` |
| Conversion execution effect    |                                                                     `1100 × 0.90 − 1000 = −10` |
| Gross income                   |                                                                              `10 × 0.95 = 9.5` |
| Taxes                          |                                                                           `1.5 × 0.95 = 1.425` |
| Actual dated fees              |                        `2 + 1 × 0.90 + 1.5 × 0.91 + 0.75 × 0.92 + 1 × 0.94 + 2 × 0.95 = 7.795` |
| Reporting cash                 |                                                             `8998 + 639.25 × 0.95 = 9605.2875` |
| Reporting holdings             |                                                                       `5 × 130 × 0.95 = 617.5` |
| Closing equity / NLV           |                                                               `9605.2875 + 617.5 = 10222.7875` |
| External capital               |                                                                                        `10000` |
| Account performance            |                                                                `10222.7875 − 10000 = 222.7875` |
| Explained performance          |                        `55.46 + 121.6 + 30.76 + 24.6875 − 10 + 9.5 − 1.425 − 7.795 = 222.7875` |
| Unexplained variance           |                                                                                            `0` |

This bridge is the **Jan 10 open-position checkpoint**. The USD cash-movement translation sum is EUR 582.6. The conversion fee is already in EUR cash; commissions and withholding are already in USD cash. The bridge subtracts actual costs once, without deducting them again from NAV or using fee-net campaign P&L as gross account trading.

## Final liquidation, conversion and withdrawal

The final sale consumes the remaining USD 522 principal and USD 2.0625 entry fees. Its gross/net result is `700 − 522 = USD 178` / `178 − 2.0625 − 1.25 = USD 174.6875`. Lifetime realized gross is `59 + 178 = USD 237`; lifetime net is `54.8125 + 174.6875 = USD 229.5`. Total execution charges, including the linked late commission, are USD 7.5. Quantity, gross/net remaining basis and unrealized gross/net are exactly zero; average entry is unavailable for a closed position.

After the final sale, `639.25 + 700 − 1.25 = USD 1338`; at rate 0.96 the cash-only account is worth `8998 + 1338 × 0.96 = EUR 10282.48`, with EUR 282.48 performance and EUR 31.08 cash FX. The return exchange books actual source/destination amounts: its reference rate is not substituted for the execution ratio. The API's optional actual `rate` is omitted; the amounts establish `1290/1338`. After conversion and fee, EUR cash is `8998 + 1290 − 3 = 10285`. Withdrawing EUR 1,000 reduces both cash and external capital by 1,000; account performance remains EUR 285.

| Final account bridge         | Exact EUR value |
| ---------------------------- | --------------: |
| Gross realized trading       |          226.34 |
| Unrealized trading change    |               0 |
| Holding FX                   |           35.98 |
| Cash FX                      |           44.46 |
| Conversion execution effects |          -17.86 |
| Income                       |             9.5 |
| Taxes deducted               |           1.425 |
| Actual dated fees deducted   |          11.995 |
| Closing cash / equity / NLV  |            9285 |
| Closing holdings             |               0 |
| Net external capital         |            9000 |
| Account performance          |             285 |
| Unexplained variance         |               0 |

Trading is `59 × 0.94 + 178 × 0.96 = 226.34`. Holding FX is the principal's historical currency movement, totaling 35.98. The final USD movement translation sum is `582.6 + 698.75 × 0.96 − 1338 × 0.97 = −44.46`; closing USD is zero, so cash FX is 44.46. Conversion effects are `−10 + 1290 − 1338 × 0.97 = −17.86`. Fees are the Jan 10 EUR 7.795 plus `1.25 × 0.96 + 3 = 4.2`. Thus `226.34 + 35.98 + 44.46 − 17.86 + 9.5 − 1.425 − 11.995 = 285 = 9285 − 9000`.

The original two-account portfolio is also checked after liquidation. The second account remains invested, marked at USD 140 and FX 0.97: EUR 795.4 cash plus EUR 271.6 holdings equals EUR 1,067 NLV and EUR 147 performance. Consolidated cash is EUR 10,080.4, holdings EUR 271.6, NLV EUR 10,352, external capital EUR 9,920 and performance EUR 432; variance remains zero.

## Analytics expectations

A journal campaign is created and USD 100 original risk is published before the future-dated economic entry. All five real fills are fully allocated to its leg, the late fee is execution-linked, and closure is explicitly confirmed after the final fill. Neither a flat position nor a withdrawal closes a trade implicitly. No timestamp is backdated through SQL.

At Jan 10, analytics includes open lifetime exposure but has no completed-outcome sample: EUR 207.82 gross, EUR 202.025 net, EUR 63.079375 realized, EUR 138.945625 unrealized and EUR 5.795 assigned fees. Win/loss ratios remain unavailable. Final reporting gross is `226.34 + 35.98 = EUR 262.32`; dated campaign fees are EUR 6.995; net/realized is EUR 255.325 and unrealized is zero. R uses original USD risk: `229.5/100 = 2.295R`. Reporting-currency net is not computed by multiplying lifetime USD net by the last rate.

The single completed winner has the following tested dictionary; all 22 metric fields are accounted for, including undefined/infinite outcomes.

| Metrics                                       | Expected result                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Net / gross / realized / unrealized P&L; fees | EUR 255.325 / 262.32 / 255.325 / 0; EUR 6.995                                   |
| Win / loss rate                               | 1 / 0                                                                           |
| Average winner; expectancy                    | EUR 255.325 each                                                                |
| Average loser; payoff ratio                   | Unavailable: no eligible losing outcomes                                        |
| Profit factor                                 | Explicitly infinite with null numeric value: positive profit, zero gross losses |
| Expectancy in R; average R; cumulative R      | 2.295 each                                                                      |
| Average holding duration                      | 691200 seconds: exactly 8 days                                                  |
| Maximum / current drawdown                    | 0 / 0                                                                           |
| Longest / current win streak                  | 1 / 1                                                                           |
| Longest / current loss streak                 | 0 / 0                                                                           |

The cumulative curve is `[0, 255.325]`. Recovery is `no-drawdown`, with no fabricated recovery episode. All 14 grouping dimensions are represented and retain the same campaign result; tag cohorts remain nonadditive. Existing independent five-outcome fixtures retain mixed wins/losses/breakevens, finite ratios and actual drawdown/recovery coverage. Account performance EUR 285 differs from campaign net EUR 255.325 because income, taxes, conversion costs/effects and cash FX belong to account accounting.

Standalone account costs retain their existing conservative treatment: an unassigned fee during campaign exposure can make campaign net/fees/R incomplete. The tested USD 2 charge has explicit broker evidence linking it to the partial execution. The campaign does not invent a new attribution feature or disguise an unassigned account cost as complete campaign data.

## Edge cases and confirmed correction

`financial-correctness-edges.test.ts` adds independent signed scale-36 HALF_EVEN checks over the full 78-digit storage envelope, including zero, signed ties and 200 deterministic generated samples. Another 200 fractional long/short FIFO cases use differing prices and signed charges, conserving every original entry/exit charge through the final close; 100 additional cases verify equal-price fractional fill-partition invariance.

Current-price tests distinguish missing, genuine zero and invalid negative stock marks after partial realization. Known historical realized P&L survives a missing current mark; current valuation remains unavailable. A genuine zero mark yields a defined loss, without charging fees twice. The persisted account test also proves missing prices cannot produce complete equity/performance from a cash subtotal.

Import cases reject binary JSON monetary numbers, values beyond binary integer precision, exponent forms, nonpositive quantities, negative stock prices and excess precision without coercing them into authoritative money. Raw source evidence is retained. Neighboring prices separated by one scale-36 quantum have different payload hashes. A malformed row does not corrupt an adjacent valid row; equivalent trailing-zero representations preserve identity. Existing CSV syntax, injection, file-budget, duplicate, preview/commit and rollback suites remain active.

The complete PostgreSQL lifecycle reproduced one production defect: `calculateNav` required FX even for identified foreign cash/holdings whose exact amount was already zero. The final EUR-only account incorrectly returned partial NAV when FX was missing. The correction adds known zero components as zero reporting value without inventing a rate. Unknown amounts/currencies, nonzero exposure and missing market values remain incomplete. Supplied available FX contexts still undergo the original instant/direction/identity/rate validation. Decimal parsing and negative-liability checks occur before the unavailable-FX branch, preserving strict runtime validation. New unit guards and the real PostgreSQL final-valuation assertion exercise both sides of this boundary.

## Additional acceptance controls

At the dividend boundary, an independently supplied USD 125 mark gives first-period NLV EUR 10,200.9375 and performance EUR 200.9375. The adjacent interval has trading EUR 23.75, fees EUR 1.9 and performance EUR 21.85. Their sum is EUR 222.7875; neither income nor tax crosses the `(from, to]` boundary twice.

A second account at another broker deposits USD 1,000 at rate 0.92 and buys 2 shares at USD 90 with explicitly complete zero costs. It ends with USD 820 cash and USD 260 holdings, EUR 1,026 NLV, EUR 920 external capital and EUR 106 performance. The two-account portfolio has EUR 11,248.7875 NLV, EUR 10,920 external capital and EUR 328.7875 performance. Primary-account results do not change; the same instrument/source identifier is scoped by account.

Future price 999 and USD/EUR rate 7 at `2030-01-10T12:00:00.000002Z` cannot affect a report ending at `.000001Z`. Extending the end by one microsecond produces independently calculable NLV EUR 48,437.75, proving the observations exist and are eligible in the later context. Pinning the original source revision returns the exact original report.

## Verification

Node 24.19.0, pnpm 10.34.6, PostgreSQL 17 and system Chromium are used. A source-only snapshot under `/tmp/trading-journal-phase14-clean-a79qjny9/source` excludes Git metadata, private configuration, dependencies and previous build output. A SHA-256 manifest records its 386 source files. Frozen-lockfile installation uses the existing verified package cache; this is a fresh installation of the snapshot, not a cold network-download benchmark. Private bindings are supplied to child processes without copying `.env` into the snapshot.

PostgreSQL and browser suites each use a uniquely named owned `_test` database, normal migrations and runtime roles. Their external controllers drop only the database they created in `finally`; existing development/test data and volumes are retained. The production build explicitly uses `NODE_ENV=production`. Browser tests start that built web application over local HTTP. They establish local startup and the tested persisted workflows, without claiming production deployment readiness.

The complete regression is rerun after incorporating the corrected prompt and NAV fix; earlier runs of the shorter scenario are interim evidence. Captured verification logs/controllers remain outside the checkout; private configuration and connection material are never published.

| Check                           | Command / method                                                                             | Final result                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Source-only installation        | `corepack pnpm install --frozen-lockfile`                                                    | Passed; package declarations and lockfile unchanged.                                              |
| Independent acceptance oracle   | External Python `Fraction` calculation using only source facts and test constants            | All 75 partial/final amounts, bridge components and finite analytics agree; both variances zero.  |
| Focused persisted campaign      | Vitest integration campaign in a fresh owned database                                        | 11 passed, including full liquidation/withdrawal, all analytics and final consolidated portfolio. |
| Full unit/property/UI suite     | `corepack pnpm test:unit`                                                                    | 747 passed in 51 files.                                                                           |
| Full PostgreSQL suite           | `corepack pnpm test:integration` in a fresh owned database                                   | 505 passed in 29 files.                                                                           |
| Built-app browser suite         | `corepack pnpm test:e2e` with system Chromium and a fresh owned database                     | 14 passed against the final production build.                                                     |
| API contract drift              | `corepack pnpm api:check`                                                                    | Passed; generated schemas/types unchanged.                                                        |
| Formatting                      | `corepack pnpm format:check`                                                                 | Passed, including final documentation.                                                            |
| Lint                            | `corepack pnpm lint`                                                                         | Passed with zero warnings.                                                                        |
| Comprehensive types             | `corepack pnpm typecheck`                                                                    | Root and all workspace package checks passed.                                                     |
| Production build                | `corepack pnpm build` with production environment                                            | Domain, worker and web passed against the NAV correction.                                         |
| Cold migrations / repeatability | `corepack pnpm db:migrate:check` in a fresh owned database                                   | Passed; unchanged schema version 9.                                                               |
| Application-role readiness      | `corepack pnpm db:check`                                                                     | Application role connects and schema is current.                                                  |
| Dependency advisory audit       | `corepack pnpm security:audit`                                                               | Passed; no known vulnerabilities reported by the registry at validation time.                     |
| Private-binding checks          | Scan current private bindings in source and public build artifacts without publishing values | Final source and 57 public build artifacts contain no current private secret/database bindings.   |

All final checks passed; no test was disabled or skipped to obtain these results. Unit/property/UI execution took 106.60 seconds; PostgreSQL execution took 288.40 seconds; the browser suite took 3.2 minutes. Only documentation was finalized after successful application/test validation. All 386 source hashes match the checkout and verification snapshot; application and test hashes are unchanged from the complete final runs. Git whitespace/status checks pass. The NAV kernel is the only modified production source; all other application code, migrations, dependency declarations, lockfile and runtime configuration match the merged baseline.

## Limits

- The new fixed financial scenario covers delivered ordinary shares. Existing native/manual capability limits for other asset classes remain; this campaign does not certify unsupported derivatives, corporate actions, tax law or leveraged accounting.
- Deterministic generated cases use four-decimal share quantities, cent prices and signed linear per-share charges. Existing scale-36/tiny-fee/large-value tests remain necessary; 300 generated cases do not prove every possible input or race schedule.
- Browser source writes use supported authenticated APIs because complete deposit, FX and dividend entry screens do not exist. Login/account review/reload use the actual UI. No new product screens are added.
- The new command races replay already accepted commands; they do not exhaust first-acceptance interleavings. New grouping assertions check dimension presence, metric totals and tag nonadditivity. Existing concurrency and independent historical-key/strategy-version fixtures remain necessary.
- No live broker statement/provider, network failure distribution, load benchmark, production TLS, backup restore or complete manual accessibility audit is claimed. Existing import, security, journal, analytics and asset-class suites remain complementary evidence.
- The NAV correction concerns availability of evidenced zero components. It does not supply missing historical FX, change accounting classifications, create unsupported lifecycle support or relax financial validation.

## File inventory and publication

`git status --short --untracked-files=all` identifies **6 created, 4 modified and 0 deleted files** on `test/phase-14-correctness`. No changes are staged. HEAD remains the merged Phase 13 baseline above; the working tree contains these uncommitted review changes. No commit, push or merge has been performed. Generated artifacts and private configuration remain ignored.

| Status   | File                                                       | Purpose                                                                                                |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Created  | `docs/testing-campaign.md`                                 | Coverage audit, independently worked accounting/analytics, defect, verification and limits             |
| Created  | `tests/helpers/financial-campaign.ts`                      | Shared immutable source facts and independently authored acceptance constants                          |
| Created  | `tests/unit/financial-correctness-campaign.test.ts`        | Exact lifecycle inventory and independent fractional long/short/conservation properties                |
| Created  | `tests/unit/financial-correctness-edges.test.ts`           | Precision, zero/negative/missing data, hostile monetary imports and NAV regressions                    |
| Created  | `tests/integration/financial-correctness-campaign.test.ts` | Real PostgreSQL API lifecycle, two-account portfolio, all analytics, atomicity and historical controls |
| Created  | `tests/e2e/financial-correctness-campaign.spec.ts`         | Authenticated complete lifecycle and actual account UI/reload persistence                              |
| Modified | `README.md`                                                | Current phase summary and campaign documentation link                                                  |
| Modified | `docs/development-plan.md`                                 | Corrected authorized Phase 14 scope and validation requirements                                        |
| Modified | `packages/domain/src/valuation.ts`                         | Proven zero foreign exposure no longer needs unavailable FX for NAV                                    |
| Modified | `tests/unit/financial-inventory.test.ts`                   | Correct the existing integer-quantity property's misleading name; assertions unchanged                 |
