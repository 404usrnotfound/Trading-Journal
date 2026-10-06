# Requirements analysis: professional multi-asset trading journal

## Scope, authority, and traceability

This document analyzes **Trading_Journal_Codex_Prompt.md in full**, including its 15 sections and 16 acceptance scenarios. The reviewed source is [the specification at commit `951fd39f2f3ca9f48de70281a48a5d0312a8514b`](https://github.com/404usrnotfound/Trading-Journal/blob/951fd39f2f3ca9f48de70281a48a5d0312a8514b/Trading_Journal_Codex_Prompt.md), read from `origin/main` (278 lines). The local checkout was still at the preceding initial commit when analyzed; the analysis uses the newer specification, not the one-line README.

The specification is the authoritative product specification. The current user instruction limits this task to requirements analysis and overrides its directions to begin implementation immediately. This document adds no application code, chooses no final architecture, and makes no claims about implemented capabilities or passing application tests.

Requirements below use `F` for functional behavior, `N` for non-functional constraints, and `P` for future implementation/delivery process requirements. Category abbreviations make identifiers stable within this analysis. References such as **§4** point to sections of the source specification. A requirement may affect several categories; cross-cutting implications are explained separately rather than changing its meaning.

Unless labeled otherwise, an extracted requirement is **required**. **Conditional** means its behavior is required when the stated capability or inputs exist. **Optional** means the feature itself is not required. **Suggested/preferred** means the specification recommends an approach without mandating it. Decisions and implications are analysis, not additional product requirements.

### Scope boundaries already established

- The product is a complete, persistent, locally runnable journal and analysis application, with manual workflows independent of integrations. A static mockup or localStorage-only application is insufficient. (§1)
- The repository has no established application stack. The specification therefore prescribes full-stack TypeScript, React, PostgreSQL, migrations, a type-safe database layer, runtime validation, and documented authentication; it leaves framework/library selection open. (§1)
- Every listed asset family must be recordable and reviewable. Automatic calculations require validation and may be staged; permitted manual/broker-valued fallbacks must be working, explicit, and traceable. This does not permit deferring the recording workflows themselves. (§3, §15)
- Strategies and financial foundations are core scope. Advanced native pricing, AI assistance, risk-adjusted analytics, tax modules, and named external providers are not all mandatory native capabilities. (§3, §6, §9–11, §15)
- This task does not authorize placing trades, connecting live brokerage credentials, or publishing a public deployment. The eventual deliverable includes local setup and deployment instructions. (§1)
- No particular broker, account capital, trading strategy, risk limit, paid data feed, or AI subscription may be assumed. (§1–2)

## Grouped functional and non-functional requirements

### 1. Core platform

**Functional**

- **F-CP-01** — Record, import, organize, review, and analyze activity across brokers, accounts, asset classes, currencies, and strategies. Combine reliable financial records, a strategy playbook, risk monitoring, behavioral review, and visual analytics. (§1)
- **F-CP-02** — Distinguish original plans, orders, actual executions, derived positions/lots, cash records, and timestamped valuations in the domain, UI, and documentation. A trading idea/campaign is the decision-making and review unit. (§2, §4)
- **F-CP-03** — Keep active trading and longer-term investing distinguishable while supporting consolidated portfolio views. (§2)
- **F-CP-04** — Make missing, stale, estimated, imported, and manually verified data distinguishable. Preserve provenance and avoid silently mixing incompatible broker/manual and internally calculated definitions. (§2–3)
- **F-CP-05** — Preserve historical records when settings, prices, rates, instrument metadata, and strategy rules change. Corrections retain audit history and recompute affected derived data. Archive referenced strategies/instruments without breaking links. (§2–4)
- **F-CP-06** — Give required domain entities stable IDs, relationships, validation, timestamps, and ownership. Support configurable custom-field definitions and values. The minimum entity inventory appears below. (§4)
- **F-CP-07** — Provide a central deterministic financial-calculation layer, documented methods, and an instrument support matrix visible to users as well as documented. (§2–3, §9)
- **F-CP-08** — When an attempted integration is blocked by credentials/services, provide its interface, working manual fallback, configuration documentation, and truthful status; never display a stub as working. (§1)

**Non-functional**

- **N-CP-01** — Use the prescribed maintainable TypeScript/React/PostgreSQL stack in this empty repository, with migrations, type-safe persistence, runtime validation, supported dependencies selected from official documentation, and appropriate component/chart libraries. (§1)
- **N-CP-02** — Use a broker-independent domain model; adapters translate into it. Financial results must be deterministic and tested; an LLM must never be the accounting engine. (§2)
- **N-CP-03** — Primary workflows must work without market-data or AI subscriptions, with no paid service required for core functionality. (§1–2)
- **N-CP-04** — Accuracy, traceability, resilience, flexibility, and usability define completeness. Persistent workflows must survive reloads and server restarts. (§1, §14)
- **N-CP-05** — Store timestamps consistently while retaining source timezone/offset provenance. Display in a configurable IANA timezone with daylight-saving support; keep trade date, settlement date, and valuation time distinct. (§4)

### 2. Accounts and brokers

**Functional**

- **F-AB-01** — Manage multiple brokers and accounts, including cash, margin, paper, and historical/closed accounts. (§2)
- **F-AB-02** — Set up broker/account information, account currencies, opening balances, historical holdings/lots, and reconciliation dates. Opening holdings require known cost basis or an explicit unknown-cost status; do not invent prior profit. (§8)
- **F-AB-03** — Support account-level and consolidated views, keeping account/broker identity available for filtering, attribution, and reconciliation. (§8–9)
- **F-AB-04** — Expose available settlement, margin, collateral, and buying-power information. Cash accounts distinguish settled from unsettled funds. Broker-reported information is permitted and must identify its source and freshness. (§8)

**Non-functional**

- **N-AB-01** — Accounts must not depend on one broker's schema or a live broker connection. Generic estimates must not imply exact broker margin availability. (§2, §8)
- **N-AB-02** — Retain historical account activity and lot provenance, including when transferring holdings or using closed/historical accounts. (§2, §4, §8)

### 3. Instruments/assets

**Functional**

- **F-IA-01** — Provide an extensible registry supporting identification, categorization, recording, import, notes, and review for **every family in the following table**. (§3)

| Required recordable family | Explicit conventions/events to accommodate |
| --- | --- |
| Stocks, ETFs, exchange-traded products, mutual funds, other investment funds | Relevant identifiers, units, currencies, costs, and holdings |
| Crypto spot and token holdings | Transfers and configurable staking/reward events |
| Spot FX | Currency-pair conventions and multiple currency balances |
| Exchange-traded futures | Expiry, rolls, tick/multiplier, and settlement/variation margin |
| Linear and inverse crypto futures/perpetuals | Funding, collateral, inverse-contract and settlement conventions |
| Options on equities, indices, futures, other supported underlyings | Multi-leg structures, premium/multiplier, exercise/assignment or explicit settlement |
| Bonds, bills, other fixed income | Quantity/price conventions and accrued interest or explicit broker-valued fallback |
| CFDs and other leveraged OTC instruments | Leverage and product-specific cash/settlement conventions |
| Warrants, turbo/knockout products, factor certificates, structured products | Product-specific metadata and safe manual settlement/valuation when unsupported |
| Commodities and custom instruments | Explicit units and settlement conventions |

- **F-IA-02** — Store applicable identifiers, exchange/venue, asset family, underlying, quote currency, settlement currency, multiplier, tick size/value, lot size, price scale, expiry, strike, option type, exercise/settlement style, collateral currency, and quantity conventions. Version or effective-date calculation-relevant metadata. (§3)
- **F-IA-03** — Provide instrument-specific calculation/event handlers. Model notional exposure separately from actual cash debits; explicitly accommodate variation margin, premiums, accrued interest, inverse contracts, and leveraged-product settlement. (§3)
- **F-IA-04** — Document and display three support levels: (1) native recording and test-validated automatic calculations; (2) recording/analysis using explicit broker valuations/cash settlements; (3) unsupported automatic calculations with a visible reason and safe manual fallback. (§3)
- **F-IA-05** — Begin automatic modules with ordinary linear instruments, then derivative/fixed-income conventions. Advanced/custom products may remain explicitly broker/manual-valued until formulas are validated; their recording/review/manual settlement must still work. (§3, §15)
- **F-IA-06** — Allow adding a subtype by registering metadata, validator, valuation method, cash-flow handling, and test fixtures without rewriting the application. (§3)
- **F-IA-07** — Accommodate dividend/corporate-action events and appropriate effects on holdings, lots, and cash; keep source history. (§4, §14)

**Non-functional**

- **N-IA-01** — Never use a universal stock-style P&L/cash formula for all instruments or fabricate numbers to imply support. Preserve valuation provenance and definition compatibility. (§3)
- **N-IA-02** — Custom formulas must use vetted server-side modules or a constrained expression system; arbitrary user-supplied JavaScript must never execute. (§3)

### 4. Transactions and cash movements

**Functional**

- **F-TX-01** — Record cash-ledger events and postings, deposits, withdrawals, transfers, currency exchanges, trading proceeds, fees, dividends, interest, withholding, funding, borrowing charges, and corporate actions with distinct classifications. (§4–5)
- **F-TX-02** — Use a currency-aware, auditable ledger with balanced postings under documented valuation conventions. Link execution-generated postings to source fills. Imported cash rows for those fills must reconcile rather than create duplicate cash movements. (§4)
- **F-TX-03** — Preserve appropriate lot history on internal transfers. Internal transfers must not count as consolidated external flows; deposits/withdrawals must not count as trade profit. (§4, §14)
- **F-TX-04** — Record commissions, exchange/regulatory fees, financing, borrowing, and funding costs in their charged currencies. Support configurable planning fee estimates; actual charges determine realized results. Permit optional trade allocation of conversion costs. (§5)
- **F-TX-05** — Track monetary settlement according to the instrument. Futures/perpetual notional is not a full purchase debit by default. (§3, §14)
- **F-TX-06** — Keep trade date and settlement date distinct, supporting settled/unsettled cash information. (§4, §8)
- **F-TX-07** — Correct posted events with an audit trail and recompute dependencies; reversals/replacements are the preferred approach for posted-ledger corrections. (§4)

**Non-functional**

- **N-TX-01** — Dependent financial writes must be atomic database transactions. Conservation and ledger invariants must prevent duplication or inconsistent partial writes. (§4)
- **N-TX-02** — Use decimal-safe monetary calculations and sufficient database precision for prices, fractional quantities, crypto, and FX. Do not use binary floating-point for monetary accounting. Specify rounding boundaries and retain original precision. (§4)

### 5. Orders and executions

**Functional**

- **F-OE-01** — Record orders as instructions and executions/fills as actual activity, separately from plans and holdings. Capture actual order/fill timestamps, instruments, direction, quantities, prices, fees, and source identifiers where available. (§4, §7, §11)
- **F-OE-02** — Support multiple fills, partial entries/exits, long/short activity, and fractional quantities. (§2, §7)
- **F-OE-03** — Allocate one execution across several trading ideas; enforce conservation of quantities and costs so neither is duplicated. Keep trade allocation distinct from lot allocation. (§4, §14)
- **F-OE-04** — Canceled orders must not generate holdings or P&L. Preserve linked cash events and source-fill relationships in execution timelines. (§4, §7)
- **F-OE-05** — Capture reference prices needed for slippage. Embedded spread/slippage are execution-quality measures, not extra deductions from fill-based P&L. (§5, §9)
- **F-OE-06** — Prevent accidental duplicate submissions and duplicate imported fills. (§7, §11)

**Non-functional**

- **N-OE-01** — Fill, allocation, costs, and ledger links must remain traceable and conserved across manual entry, import, correction, and recomputation. (§4, §11, §14)

### 6. Trades/positions

**Functional**

- **F-TP-01** — Model trading ideas/campaigns, legs, allocations, positions, and lots as distinct concepts. Positions/lots are derived holdings; a multi-leg idea may contain several instruments. Multiple concurrent ideas may use the same instrument. (§2, §4)
- **F-TP-02** — Capture account, instruments/legs, strategy version, setup, direction, timestamps, and tags; support unclassified ideas without a strategy. (§6–7)
- **F-TP-03** — Capture original thesis, market context, indicators/timeframes, intended entry/stop/target/quantity, planned costs, initial risk, and expected reward-to-risk where meaningful. Freeze the pre-trade plan, log changes, and label late/imported plans retrospective. (§6–7)
- **F-TP-04** — Record actual activity and linked cash, partial entries/exits, plan changes, exit reason, results, duration, checklist outcomes, mistakes, emotions, lessons, screenshots, notes, and post-trade review. (§7)
- **F-TP-05** — Support open, partially closed, closed, canceled/no-execution, imported-incomplete, and reconciled states. Define idea completion rather than treating every sale/fill as a completed trade. Configure reopening or creating a new linked idea. (§4, §7)
- **F-TP-06** — Support configurable FIFO, average cost where appropriate, and explicit lot allocation; document eligible methods. Preserve lot history through internal transfers. Analytical lot accounting must be distinguished from tax accounting. (§4)
- **F-TP-07** — Provide a detail page for every trade: plan-versus-actual, execution/cash timeline, leg/lot allocations, financial breakdown, documents, rule compliance, and audit history. (§7)
- **F-TP-08** — Keep hypothetical outcomes separate from actual results. Unknown opening cost basis must remain explicit and must not produce fabricated historical profit. (§7–8)

**Non-functional**

- **N-TP-01** — Historical strategy versions, metadata, plan snapshots, risk, and source relationships must survive later settings changes. Deliberate corrections must be auditable rather than silently rewriting history. (§2–4, §6, §8)

### 7. Strategies

**Functional**

- **F-ST-01** — Provide a dedicated playbook with strategy list, detail, editor, version history, linked-trade views, and comparison views. (§6)
- **F-ST-02** — Store name, description, hypothesis/edge, lifecycle status, owner, tags, eligible instruments/markets, direction, trading style, timeframes, and sessions. (§6)
- **F-ST-03** — Store market-regime filters, setup conditions, entry trigger, invalidation, initial stop rules, targets, scaling, trailing/management, and exit rules. (§6)
- **F-ST-04** — Store sizing rules, risk budget, exposure/concentration limits, daily/weekly limits, required checklists, example screenshots, reference documents, and review schedule. (§6)
- **F-ST-05** — Version rules with effective dates; trades retain the version used. Allow configurable numeric/boolean/text parameters and rule fields without source edits. (§6)
- **F-ST-06** — Separate strategies from named setups; one strategy may have several setups. Display trades without an assignment as unclassified. (§6)
- **F-ST-07** — Show performance by strategy **and version**: completed-trade count, wins/losses/breakevens, net P&L, expectancy, available R, cost burden, attributed drawdown, holding duration, and rule adherence. (§6)
- **F-ST-08** — Compare versions, setups, and selected strategies over matching date ranges; expose sample sizes and completeness. (§6)
- **F-ST-09** — Distinguish manual assessments from automatically evaluable rules. Missing data cannot be reported as a passed rule. Preserve the frozen plan and changes, including retrospective labels. (§6)

**Non-functional**

- **N-ST-01** — Changing strategy rules must not alter prior plans or historical associations; archive referenced strategies. Strategy drawdown/metrics require documented attribution rather than invented independent equity. (§4, §6)

### 8. Risk management

**Functional**

- **F-RM-01** — Configure risk policies at account and strategy levels with documented precedence; do not assume a risk limit. (§1, §8)
- **F-RM-02** — Support per-trade risk, daily/weekly loss limits, maximum concurrent positions, concentration, leverage/exposure, overnight restrictions, and prohibited instruments. Show breaches and unknown assessments with actionable explanations. (§8)
- **F-RM-03** — Provide pre-trade sizing for validated instrument types using currencies, multiplier, stop distance, costs, and lot increments. (§8)
- **F-RM-04** — For complex/nonlinear trades, use a documented scenario/max-loss method or explicit manual initial risk; a stock stop-distance formula is insufficient. (§8)
- **F-RM-05** — Keep original initial risk immutable for historical R. Define handling of scale-ins, added risk, and multi-leg changes. Missing original risk makes R unavailable. (§8)
- **F-RM-06** — Capture planned risk/reward and strategy risk parameters; show compliance in trade reviews and strategy analytics. (§6–9)

**Non-functional**

- **N-RM-01** — Explain that stop-based planned risk does not guarantee realized loss. Report uncertainty instead of false compliance or generic exact-margin claims. (§6, §8)

### 9. Portfolio/accounting

**Functional**

- **F-PA-01** — Show cash by currency, positions, unrealized results, account equity, allocation, concentration, gross/net exposure, and available settlement/margin information. (§8)
- **F-PA-02** — Store timestamped account valuations and price observations, allowing broker/manual observations and internally calculated values with source, status, freshness, and compatible definitions. (§3–4, §8)
- **F-PA-03** — Reconcile quantities, cash, and equity against source records; provide reconciliation records, dates, variance reports, and supporting drill-down. (§4, §8, §11)
- **F-PA-04** — Calculate native/reporting, gross/net, realized/unrealized P&L with actual costs; maintain distinct raw equity/NAV and cash-flow-adjusted performance series. (§5, §9)
- **F-PA-05** — Consolidate account views without treating internal transfers as external flows or deposits/withdrawals as trading gains. (§2, §14)
- **F-PA-06** — Preserve lot/cost history, handle unknown basis explicitly, and avoid inventing historical results. Distinguish analytical accounting from jurisdiction-specific tax treatment. (§4, §8, §11)

**Non-functional**

- **N-PA-01** — Financial totals must be traceable to source executions, cash events, valuation/FX observations, costs, allocations, and defined calculation methods. Prevent incompatible definitions and double counting. (§3–5, §9)
- **N-PA-02** — Preserve historical financial inputs and audit intentional corrections; backup/restore must reproduce derived totals under the same calculation version. (§2, §4, §14)

### 10. Multi-currency/FX

**Functional**

- **F-FX-01** — Allow any account currency and a configurable workspace reporting currency; provide native-currency and consolidated reporting views. (§5)
- **F-FX-02** — Record actual exchanges as dated events with source/destination amounts and currencies, actual rate, fee/fee currency, account, and source reference. Reporting translation is a separate operation. (§5)
- **F-FX-03** — Store historical translation rates for executions, cash events, and valuations with pair direction, timestamp, source, and status. Today's rate must not overwrite historical rates. (§5)
- **F-FX-04** — Changing reporting currency creates another view rather than rewriting source records. Support manual FX rates and manual marks without providers. (§5)
- **F-FX-05** — Separately present native trading P&L, reporting-currency P&L, currency effects on holdings/cash, and total account change. Define and test reconciling FX attribution without double counting. (§5)
- **F-FX-06** — Preserve original cost currencies, including conversion fees, and support optional conversion-cost allocation to trades. (§5)

**Non-functional**

- **N-FX-01** — Use adequate decimal precision and historical rate provenance. Original records/rates must survive reporting-currency/current-rate changes; missing rates cannot silently produce fabricated metrics. (§4–5, §14)

### 11. Analytics

**Functional**

- **F-AN-01** — Maintain a metric dictionary defining formula, units, included costs, population, interval, currency treatment, required inputs, and edge cases for every financial metric. (§9)
- **F-AN-02** — Provide realized/unrealized P&L, native/reporting and gross/net views, total fees, and carrying costs. (§9)
- **F-AN-03** — Provide completed-trade count, win rate, breakeven count, average win/loss, payoff ratio, profit factor, monetary expectancy, R expectancy, outcome distributions, streaks, duration, and turnover. R requires original risk. (§8–9)
- **F-AN-04** — Provide raw equity/NAV and distinct cash-flow-adjusted curves; specify the source series for maximum drawdown and recovery duration. Deposits must not appear as performance recovery. (§9)
- **F-AN-05** — **Conditional on sufficient valuations/flows and a valid solution:** provide TWR and MWR. Label approximations and return unavailable when inputs or a valid solution are absent. (§9)
- **F-AN-06** — Break down analytics by strategy/version, setup, asset class, instrument, account/broker, direction, timeframe, session, day/week/month, market regime, mistake, and compliance. (§9)
- **F-AN-07** — **Conditional on sufficient price paths or explicit observations:** provide MAE/MFE with disclosed observation resolution. Fills alone are insufficient. Provide slippage against a recorded reference and cost impact. (§9)
- **F-AN-08** — **Optional:** Sharpe, Sortino, and benchmark comparison, only with appropriate periodic returns, risk-free assumptions, calendars, and sample sizes. (§9)
- **F-AN-09** — Define campaign/lot/fill/account/portfolio populations. Completed-trade metrics must exclude partial trades unless explicitly presented separately; open gains belong in appropriate portfolio analyses. (§9)
- **F-AN-10** — Explain unavailable/infinite/undefined ratios and insufficient history; do not substitute zero or fabricate empty-state metrics. Never sum percentages or R values to imply portfolio return. (§9)
- **F-AN-11** — Chart/card drill-down and cross-filtering are mandatory; date ranges and account/currency filters must be consistent, with clear gross/net and realized/unrealized labels. (§9, §12)
- **F-AN-12** — Expose strategy/version/setups comparison sample sizes and completeness, plus rule adherence and documented strategy drawdown attribution. (§6)

**Non-functional**

- **N-AN-01** — Financial metrics must use the central deterministic tested layer and appropriate inputs; absence, approximation, precision, resolution, source, and population limitations must be visible. (§2, §6, §9)

### 12. Journaling

**Functional**

- **F-JR-01** — Provide daily notes, session preparation, end-of-session reviews, weekly/monthly reviews, goals, recurring mistakes, and improvement actions. (§10)
- **F-JR-02** — Link notes/reviews to trades, strategies, and periods; provide reusable review templates and configurable emotion/process-quality fields. (§10)
- **F-JR-03** — Capture thesis/context, mistakes, emotions, lessons, exit reasons, checklist outcomes, post-trade reviews, and plan changes alongside financial activity. (§7)
- **F-JR-04** — Autosave journal drafts. Support before/during/after screenshots, notes, supporting documents, and retrospective plan labels. (§6–7)
- **F-JR-05** — Provide deterministic review summaries without AI credentials. Optional AI behavior and its safeguards are specified under Future integrations and Security. (§10)

**Non-functional**

- **N-JR-01** — Preserve the distinction between original decisions, subsequent edits, and retrospective narratives; behavioral interpretations must not replace accounting facts. (§6–7, §10)

### 13. Import/export

**Functional**

- **F-IM-01** — Universal CSV import must include saved mapping templates, configurable delimiter/decimal/date/timezone conventions, field previews, validation, and a dry run before commit. (§11)
- **F-IM-02** — Import instruments, fills, cash events, opening balances, valuations, and positions; preserve original source rows/files and broker identifiers. (§11)
- **F-IM-03** — Review duplicates, partial imports, corrections, inconsistent signs, ambiguous symbols, fee currencies, and unsupported metadata explicitly. (§11)
- **F-IM-04** — Use stable broker IDs where available, otherwise documented scoped fingerprints. Identical reimport must change neither activity counts nor balances. Changed rows must be offered as corrections, not silently appended. (§11, §14)
- **F-IM-05** — Reconcile imported cash rows with existing execution-generated postings rather than double posting. (§4)
- **F-IM-06** — Provide batch summaries and row-level errors; invalid rows must not corrupt valid records. Make import batches reversible with safe handling of downstream dependencies. (§11, §14)
- **F-IM-07** — Reconcile quantities/cash/equity and present variance reports. (§11)
- **F-IM-08** — Provide application JSON for lossless backup/restore. Export filtered trades, executions, cash records, strategies, reviews, analytics, and full workspace backups. (§11)
- **F-IM-09** — Broker-specific formats use a common adapter contract. **If an adapter is delivered**, require actual or documented samples and tests. Manual entry/CSV must work independently of adapters and APIs. (§11)
- **F-IM-10** — Tax-supporting records may be exported, but jurisdiction-specific compliance claims require an implemented and validated jurisdiction module; no such module is required by default. (§11)

**Non-functional**

- **N-IM-01** — Imports must be idempotent, source-preserving, auditable, safely reversible, and resistant to corrupt financial state. Dependent committed records require atomic writes. (§4, §11, §14)
- **N-IM-02** — Protect against malicious/oversized inputs and spreadsheet-formula injection in exports. Backup/restore must reproduce records and derived totals under the same calculation version. (§13–14)

### 14. Attachments/screenshots

**Functional**

- **F-AS-01** — Support before/during/after trade screenshots, trade documents, strategy example screenshots, and reference documents; show related materials in detail/review workflows. (§6–7)
- **F-AS-02** — Persist attachment entities with stable identity, timestamps, ownership, and relevant record links. (§4)
- **F-AS-03** — Validate file size/type, authorize attachment access, and render/sanitize safely. (§13)

**Non-functional**

- **N-AS-01** — Use private storage and server-side authorization for every attachment; public file URLs must not defeat workspace isolation. (§13–14)
- **N-AS-02** — Imported notes/files are untrusted data. Their content cannot become executable code or AI instructions with authority over the application. (§10, §13)

### 15. Authentication/users

**Functional**

- **F-AU-01** — Model users and workspaces with ownership across all required entities. (§4)
- **F-AU-02** — Provide secure authentication and session handling, with a documented authentication solution. (§1, §13)
- **F-AU-03** — Enforce user/workspace isolation on the server for all record, export, and attachment access; another user must not access those resources. (§13–14)
- **F-AU-04** — Support workspace reporting currency and persistent user display preferences, including configurable timezone/currency presentation. (§5, §12)

**Non-functional**

- **N-AU-01** — Authorization must apply at every server access boundary, not merely in the UI. The exact membership/role model is unspecified. (§13–14)

### 16. UI/UX

**Functional**

- **F-UX-01** — Provide guided fast trade entry and an advanced editor with asset/structure-relevant fields and progressive disclosure. Support keyboard navigation, draft autosave, and duplicate-submission prevention. (§2, §7)
- **F-UX-02** — Provide overview, trades, strategies, portfolio/accounts, analytics, journal/reviews, imports/reconciliation, and settings workflows. This exact primary-navigation order is **suggested**, not required. (§12)
- **F-UX-03** — Provide searchable, filterable, sortable, paginated tables, selectable columns, saved views, inline validation, contextual metric explanations, sensible defaults, and quick actions for fill/cash entry, import, and review. Persist display preferences. (§12)
- **F-UX-04** — Make active filters visible and apply account/date/currency filters consistently. Use URL-addressable filters where useful. (§12)
- **F-UX-05** — Support light/dark themes, visible focus, keyboard operation, accessible contrast, and non-color indicators for gains/losses/status. (§12)
- **F-UX-06** — Support English initially, localization-ready labels, locale-aware number/date formatting, and configurable timezone/currency; avoid hardcoded US conventions. (§12)
- **F-UX-07** — Charts require meaningful axes, units, tooltips, legends, empty/loading/error states, accessible data-table alternatives, and links to underlying observations. Label stale/manual prices. (§12)
- **F-UX-08** — Provide isolated, clearly labeled demo data with varied accounts/assets/currencies/strategies, partial fills, gains/losses, and missing data. Real new workspaces start empty; no fake feeds, random charts, or decorative financial values appear in real views. (§12)
- **F-UX-09** — Every visible primary action must work or be disabled with an explanation. Core screens cannot contain placeholder workflows/TODO calculations. (§12)
- **F-UX-10** — Display provenance, support limitations, rule-assessment unknowns, retrospective plans, current filters, metric definitions, and useful empty states where relevant. (§2–3, §6, §8–9, §12)

**Non-functional**

- **N-UX-01** — Use a restrained, cohesive financial-product design: typography, spacing, icons, surfaces, charts, readable tables, information hierarchy, and focused workflows. Common actions should be fast; advanced details use progressive disclosure. (§1–2, §12)
- **N-UX-02** — Desktop-first layouts must remain functional on tablets/phones. Target WCAG 2.2 AA for core flows and report verification limits honestly. (§12, §15)
- **N-UX-03** — Use consistent source-aware labels, units, currency, timezone, and dates; explain data/metric limitations instead of implying unsupported certainty. (§2, §9, §12)

### 17. Infrastructure

**Functional**

- **F-IN-01** — Provide real server-side PostgreSQL persistence, migrations, a documented schema, and local setup/run instructions. (§1, §13)
- **F-IN-02** — Support backups and tested restore, audit logs, basic health checks, structured redacted logs, and useful error reporting. (§13)
- **F-IN-03** — Provide an environment-variable template and production deployment guidance independent of a particular hosting vendor. A documented container option is **preferred**, not mandated. (§13)
- **F-IN-04** — Support server-side filtering/pagination and indexes for realistic history. (§13)

**Non-functional**

- **N-IN-01** — Establish documented performance budgets and validate them with a representative large seeded dataset. Avoid unbounded client-side loads and N+1 queries; numeric budgets are not supplied. (§13)
- **N-IN-02** — Keep setup straightforward and each eventual implementation increment runnable. Data must persist across server restarts; integrations are not prerequisites for core operation. (§1, §14–15)
- **N-IN-03** — Backups must be recoverable, not merely exportable; restore fidelity includes calculation-version consistency. Exact recovery objectives and operational topology remain open. (§13–14)

### 18. Security

**Functional**

- **F-SE-01** — Validate requests on the server and provide appropriate CSRF and rate-limit protections with secure authentication/session handling. (§13)
- **F-SE-02** — Keep secrets server-side and out of source control/logs; expose safe configuration documentation/templates. (§13)
- **F-SE-03** — Protect every financial record, export, source file, and attachment through workspace-scoped authorization; attachments use private storage, file validation, and safe rendering/sanitization. (§10, §13–14)
- **F-SE-04** — Treat imports/notes/files as untrusted; reject or safely handle malicious/oversized files and sanitize spreadsheet-sensitive exports. Never execute arbitrary user formulas as JavaScript. (§3, §10, §13)
- **F-SE-05** — **If AI is included:** preview outgoing data, use explicitly selected context, and require an explicit reviewed action before AI changes posted financial records. (§10)

**Non-functional**

- **N-SE-01** — User/workspace confidentiality and server-enforced access must cover record APIs, exports, attachment delivery, and linked source material. Structured logs must be redacted. (§13–14)
- **N-SE-02** — Development under this specification does not authorize live trade placement, connecting live brokerage credentials, or publishing a public deployment. Unavailable integrations must be described truthfully. (§1)

### 19. Testing

**Functional verification requirements**

- **F-TE-01** — Provide meaningful financial unit tests, integration tests for persistence/import/ledger workflows, and end-to-end tests for main user journeys. (§14)
- **F-TE-02** — Validate against independent hand-calculated fixtures and official instrument/broker specifications, not solely expectations generated by the implementation. (§14)
- **F-TE-03** — Maintain a capability matrix linking all 16 acceptance scenarios to features/tests, manual fallbacks, and limitations; support claims require corresponding scenario success. (§14)
- **F-TE-04** — Test restore, authorization boundaries, responsive/accessibility behavior, and performance with representative data; run the application and inspect desktop/mobile UI using available tools before eventual completion. (§13–15)

**Non-functional and delivery process**

- **N-TE-01** — Run appropriate checks, fix failures, and report what was actually verified. A build alone is not evidence of production readiness or financial correctness. (§14–15)
- **P-TE-01** — During future implementation, maintain an implementation plan, acceptance checklist, assumptions, and progress file preserving the full scope. Explain consequential architecture decisions; make reasonable reversible decisions without repeated confirmation and ask only about material blockers/incompatibilities. (§1, §15)
- **P-TE-02** — Follow functioning increments: (1) assumptions/architecture/schema/metrics/support/UI/checklist; (2) auth/persistence/accounts/instruments/ledger/fills/positions/FX/shell; (3) strategies/plans/reviews/import/reconciliation/core recording; (4) asset modules/analytics/risk/journal/attachments/views/exports/restore; (5) financial/security/UI/accessibility/performance verification and documentation. Prioritize financial foundations and strategy workflows without silently discarding remaining scope. (§15)
- **P-TE-03** — Eventually deliver source, migrations, safe demo seeds, import examples, tests, configuration template, and documentation for setup, architecture, domain model, calculations, asset support, import mappings, backup/restore, and extension points. The final implementation report must explain how to run it, capabilities, checks, limitations, and credentials still needed. (§15)

These are extracted obligations for a later implementation task. No application checks are claimed by this analysis-only task.

### 20. Future integrations

**Functional**

- **F-FI-01** — Provide extensible instrument calculation/event interfaces and a common broker-format adapter contract. No specific broker/API/provider is required. Delivered adapters need documented or actual samples and tests. (§2–3, §11)
- **F-FI-02** — Maintain manual prices, manual FX, manual entry, universal CSV, and explicit broker valuation/settlement paths independent of APIs/subscriptions. When a pursued integration is unavailable, its fallback/configuration/status must work. (§1–3, §5, §11)
- **F-FI-03** — **Optional:** AI review behind a provider-neutral interface, disabled until configured. If included, use calculated aggregates and selected journal context, cite supporting trades, distinguish facts/interpretations, disclose sample limitations, and never invent fills, fees, causal explanations, or performance. Preview outgoing context and require reviewed financial-write actions. (§10)
- **F-FI-04** — **Optional/conditional extension:** broker-specific adapters, external market-data/FX providers, benchmark data, and tax modules must respect domain boundaries, provenance, capability labeling, and relevant validation. The specification does not name a provider or require a native jurisdiction module. (§1–3, §9–11)

**Non-functional**

- **N-FI-01** — Provider-neutral AI and broker-independent financial interfaces must preserve core independence. Integration status and capability claims must be truthful; imported content must remain untrusted. (§1–3, §10–11)

## Mandatory acceptance scenarios and traceability

These scenarios are mandatory future acceptance criteria, not a list of tests executed in this analysis. Explicit manual/broker-valued capability levels are allowed where the source permits them; the associated workflows must still be tested. All scenarios originate in **§14**.

| ID | Required scenario and observable outcome | Principal requirement groups |
| --- | --- | --- |
| AC-01 | EUR-funded account; two distinct EUR/USD exchanges with fees; USD stock trading and partial closes; valuation at a later FX rate. Current-rate changes do not alter historical results; balances reconcile. | TX, TP, PA, FX |
| AC-02 | Multiple fills and partial exits for one idea produce correct remaining quantity, cost/fee allocation, and completion status. | OE, TP, PA |
| AC-03 | Two strategies trade the same instrument concurrently; one fill allocated across ideas duplicates neither quantities nor costs. | OE, TP, ST |
| AC-04 | A short position correctly includes fees and borrowing costs. | IA, TX, TP, PA |
| AC-05 | Options capture premium/multiplier and multi-leg recording, plus exercise/assignment or explicit settlement for the declared capability level. | IA, TX, TP |
| AC-06 | Futures capture tick/multiplier and settlement; a supported perpetual captures funding; no full-notional cash debit by default. | IA, TX, PA |
| AC-07 | Fixed income captures stated quantity/price conventions and accrued interest, or an explicit broker-valued fallback. | IA, TX, PA |
| AC-08 | Structured/custom product with unsupported automatic pricing remains recordable; manual settlement works and unavailable metrics are honest. | IA, TX, AN |
| AC-09 | Dividend/corporate action, internal account transfer, unknown-basis opening holdings, and a post-import correction retain coherent records. | AB, IA, TX, TP, IM |
| AC-10 | Deposits/withdrawals are excluded from trade profit; internal transfers are excluded from consolidated external flows. | TX, PA, AN |
| AC-11 | Identical reimport changes no counts/balances; invalid rows are explained and cannot corrupt valid records. | IM, TX |
| AC-12 | Strategy version changes do not change recorded plans; missing original risk produces unavailable R. | TP, ST, RM, AN |
| AC-13 | Missing prices/FX, zero trades, zero losing trades, tiny samples, and undefined ratios are transparent. | CP, PA, FX, AN, UX |
| AC-14 | A different user cannot access workspace records, exports, or attachments. | AU, AS, SE |
| AC-15 | Backup/restore reproduces records and derived totals under the same calculation version. | CP, IM, IN, TE |
| AC-16 | Core workflows work without integrations and survive page reloads/server restarts. | CP, JR, IM, IN, FI |

## Requirements that materially affect architecture or the data model

The following are implications of the specification, not finalized schemas or additional feature scope.

### Minimum entity and relationship inventory

All entities below need stable identity, ownership, timestamps, validation, and relationships (**F-CP-06**, §4). The source requires logical entities; it does not require a separate physical table for every term.

| Domain | Required entities | Architectural/data-model implications |
| --- | --- | --- |
| Ownership and accounts | User/workspace, broker, account, currency | Tenant ownership across all access paths; account versus reporting currency; membership model unresolved. |
| Instrument identity | Instrument, instrument metadata version | Metadata references must reproduce historical calculations; symbols alone are insufficient identifiers. |
| Trading intent/activity | Trading idea/campaign, trade leg, order, execution/fill, execution allocation | Idea-to-instrument/leg and fill-to-idea allocation relationships; one fill can support multiple ideas; orders do not imply fills. |
| Monetary events | Cash-ledger event/posting, transfer, actual currency conversion, fee, dividend, interest, withholding, funding, borrowing charge, corporate action | Balanced currency-aware journal; source links; event-specific posting rules; distinguish notional from actual money; prevent import/execution duplication. |
| Holdings and observations | Position/lot, price observation, FX observation, account valuation, reconciliation record | Derived holdings versus imported observations; lot-transfer lineage; timestamp, source, status, and reconciliation differences; account and campaign attribution remain distinct. |
| Strategy and compliance | Strategy, strategy version, setup, checklist/rule, risk policy, rule assessment | Versioned plan/rule references, typed configuration, account/strategy policy precedence, manual/automatic/unknown outcomes. |
| Review and media | Journal entry, review, tag, screenshot/attachment, custom-field definition/value | Many relevant record/period links; private ownership-aware storage; pre-trade snapshot versus draft/review history. |
| Ingestion and audit | Import template, import batch, source row, mapping, validation error, correction/audit event | Durable source-to-record lineage, identity/fingerprints, batch reversibility, and correction dependencies. |

### Architectural constraints and invariants

| Concern | Constraint and design consequence | Source |
| --- | --- | --- |
| Stack and persistence | React/full-stack TypeScript/PostgreSQL are prescribed for this empty repository; migrations, type-safe access, and server validation are required. Framework/ORM choices remain open. | §1, §13 |
| Domain separation | Plans, orders, fills, idea allocations, derived holdings, cash, and valuations cannot be collapsed into a single stock-trade row. | §2, §4, §7 |
| Conserved allocation | Split execution quantities/costs cannot exceed or duplicate their source. Lot consumption and campaign attribution require distinct relationships and invariants. | §4, §14 |
| Ledger transactions | Balanced postings, dependent-write atomicity, classifications, source-fill links, and cash-row reconciliation constrain posting and import boundaries. | §3–5, §11 |
| Calculation capabilities | Instrument modules require metadata validation, valuation, event/cash handlers, and fixtures. Capability/provenance must be discoverable by calculation and presentation layers. | §3 |
| Decimal and unit system | Currency-aware decimals, quantities, contract multipliers, quote/settlement/collateral currencies, and rounding rules must be established before financial schema/functions. | §3–5 |
| Temporal history | Version instrument metadata, strategy/rules, original plans/risk, historical FX/prices, and auditable corrections; retain calculation-version reproducibility for restore. | §2–6, §8, §14 |
| Time semantics | Normalize timestamps while retaining source timezone/offset, display with IANA/DST support, and separate trade, settlement, and valuation times. | §4, §12 |
| Derived state | Corrections trigger recomputation; backups reproduce totals. A deterministic dependency/rebuild strategy is necessary whether computation is synchronous, cached, or queued. | §4, §14 |
| Data sufficiency | Unknown basis/risk/prices/FX, stale/manual observations, undefined metrics, and incompatible definitions must be representable, not coerced to zero. | §2–3, §8–9 |
| Tenant/security boundary | Server ownership enforcement applies to records, relationships, exports, attachments, and imports. Private storage and secrets cannot depend on client secrecy. | §4, §13–14 |
| Reporting populations | Campaign, lot, fill, account, portfolio, currency, time range, and strategy version attribution must be explicit and shared across cards/charts/export. | §5–6, §9, §12 |
| Safe ingestion | Source preservation, idempotency, correction recognition, dry runs, partial-row errors, atomic commits, and downstream-safe reversal require durable import lineage. | §4, §11 |
| Scale | Server filtering/pagination, indexes, bounded loading, and query-budget awareness rule out loading all history into the browser. | §13 |
| Integration independence | A manual-data workflow must share the same domain/calculation path as adapters; AI cannot be the accounting layer. | §1–3, §10–11 |
| Storage and restoration | Source files and attachments need private storage; workspace JSON backup must be defined so lossless restore and financial-version fidelity are testable. | §11, §13–14 |

## Ambiguous, conflicting, and underspecified requirements

Most issues below are missing definitions or tensions, not contradictions that invalidate the specification. No issue is silently resolved by selecting a formula or inventing business policy.

| ID | Type | Ambiguity/conflict and consequence | Required clarification/decision | Source |
| --- | --- | --- | --- | --- |
| A-01 | Instruction conflict resolved by current request | The source says to implement immediately and continue through delivery; the current request explicitly prohibits implementation. | This task produces analysis only. Implementation directions remain future obligations. | §1, §15; current user request |
| A-02 | Capability boundary ambiguity | “All assets supported” can mean recording or automatic valuation; support levels 2 and 3 both permit manual data. Derivative acceptance scenarios also require event workflows. | Define per-subtype/per-operation capability levels, validated native baseline, and level-2 analysis versus level-3 unavailable metrics. Do not treat manual fallback as permission to omit recording/settlement. | §3, §14–15 |
| A-03 | Lifecycle ambiguity | “Closed,” reopening, multi-leg completion, partially closed, canceled/no-execution, imported-incomplete, and reconciled are not given transition rules; some statuses describe orthogonal dimensions. | Define a campaign completion/reopening policy and separate lifecycle, completeness, and reconciliation dimensions as needed. | §4, §7 |
| A-04 | Accounting ambiguity | “Balanced postings” does not define ledger accounts or how unequal units across currencies are balanced; futures/inverse/collateral/interest settlement rules differ. | Define cash-ledger versus broader asset/liability/income scope, per-currency/value balancing, posting schemas and valuation conventions, including conversion, fees, derivative settlement, and rounding residuals. | §3–5 |
| A-05 | History-versus-correction tension | Historical records must remain stable while corrections intentionally recompute history. Imported/manual valuations cannot silently mix with internal ones. | Distinguish immutable source/version history from deliberate restated projections, superseded observations, and calculation-version migration. | §2–5, §14 |
| A-06 | Derived-versus-imported holdings tension | Positions/lots are derived, but imports accept positions, opening holdings, and account valuations that may not include their originating fills. | Decide whether position imports create opening lots, observations, reconciliation adjustments, or another explicitly labeled source; distinguish inventory truth from broker snapshots. | §4, §8, §11 |
| A-07 | Attribution ambiguity | One fill may belong to several ideas, while lot accounting is separately configurable; cost splits, rounding, unallocated fills, shorts, and fee-only corrections are undefined. | Define conservation/allocation rules and the boundary between portfolio lot realization and campaign results. | §4–5, §7 |
| A-08 | Lot-policy ambiguity | FIFO, eligible average-cost, and explicit allocation are required, but scope/defaults, method changes, cross-account transfer rules, and short lots are not defined. | Choose applicability, account/instrument scope, effective dates, recomputation policy, and transfer lineage conventions. | §4, §8 |
| A-09 | FX ambiguity | Actual exchanges and reporting translations are separate, but rate selection and decomposition of cash/holding FX effects are unspecified. “Any account currency” and “account currencies” do not establish base-versus-balance rules. | Define FX attribution, rate timestamp/lookup hierarchy and missingness, pair direction, reporting views, account base currency, and multi-currency balances. | §3–5, §8–9 |
| A-10 | Risk ambiguity | Original risk is immutable, yet scale-ins/multi-leg changes add risk; account/strategy precedence and daily/weekly loss definitions are unspecified. | Define R denominator policy and risk-addition history, compliance precedence, calendars/cutoffs, loss basis, sizing inputs, and unknown outcomes. | §6, §8 |
| A-11 | Metric ambiguity | The specification requests metrics but leaves formulas/populations/calendar/flow timing/FX and cost allocation decisions to the metric dictionary. Strategy drawdown may not have a natural equity series. | Define metric populations, breakeven threshold, cost treatment, source series, strategy attribution, TWR/MWR method/solver, and unavailable/infinite behavior. | §6, §9 |
| A-12 | Import consistency ambiguity | Atomic dependent writes coexist with partial imports, row errors, reversible batches, and corrections after downstream activity. Reversal is not necessarily deletion. | Choose commit units, fingerprint scope, correction matching, reversals, dependency checks, and reconcile-versus-post behavior. | §4, §11, §14 |
| A-13 | Ownership/auth ambiguity | User/workspace ownership and isolation are required, but collaboration, membership, roles, signup, and administrative access are unspecified. | Define the tenancy and authentication/session model before schemas and authorization APIs. Do not assume team collaboration is required. | §1, §4, §13–14 |
| A-14 | Time ambiguity | Source offsets and IANA display are required, but timestamp-less imports, ambiguous DST times, exchange sessions, settlement calendars, and review-period boundaries are unspecified. | Define normalization/defaults, ambiguity review, precision, trading/settlement calendars, and which timezone sets daily/weekly limits and filters. | §4, §8–9, §11–12 |
| A-15 | Backup completeness ambiguity | JSON must be lossless; source files/attachments are private, and restored totals require the same calculation version. Backup scope and compatibility are not defined. | Define file inclusion/references, versioned schema, restore into empty versus existing workspace, merge/replace and ID collision handling, import/audit provenance, derived-state rebuilding, and excluded secrets/sessions. | §11, §13–14 |
| A-16 | Undefined quality thresholds | “Professional,” “fast,” “realistic history,” “large seeded dataset,” and sufficient MAE/MFE resolution/sample sizes lack measurable thresholds. | Establish performance/dataset budgets and accessible core journeys; define stale-data and metric sufficiency criteria without fabricating source requirements. | §1–2, §9, §12–13 |
| A-17 | Optional integration scope ambiguity | External interfaces/fallbacks are demanded when an integration is blocked, but no integration/broker/provider is selected. AI and risk-adjusted metrics are optional. | Choose pursued integrations and required extension contracts; the source does not mandate every possible adapter or provider at first delivery. | §1, §9–11 |
| A-18 | Configurable-rule boundary ambiguity | Rules/fields are configurable without source edits, while arbitrary user JavaScript is forbidden. Eligible automatic predicates and unknown/manual evaluation semantics are not listed. | Choose typed fields versus a constrained rule/expression language, validation, versioning, and supported automatic rule capabilities. | §3, §6, §8 |
| A-19 | Missing operational policy | Private files, backups, audit, health and error reporting are required, but limits, retention, deletion, recovery targets, and supported production topology are absent. | Define implementable operating policies and storage contracts; do not infer a hosting vendor or jurisdictional compliance requirement. | §13 |

## Missing decisions before implementation

These decisions need documented resolution before their affected implementation begins. They do not all require a user questionnaire: the source permits reasonable reversible engineering choices. Financial semantics, irreversible schema choices, incompatible policies, and scope reductions require particular care. No decisions are made by this document.

| ID | Decision to resolve | Minimum decision artifact | Timing/dependency |
| --- | --- | --- | --- |
| D-01 | Application framework, API/server boundaries, type-safe DB layer, runtime validator, component/chart libraries, supported/pinned toolchain, migration and decimal packages within the mandated stack. | Stack/boundary ADR with local run model. | Before scaffolding. |
| D-02 | User/workspace tenancy, personal versus shared ownership, memberships/roles if any, signup/bootstrap, authentication/session lifecycle and authorization rules. | Ownership/access matrix and auth ADR. | Before schema/API/auth work. |
| D-03 | Cash-ledger versus broader asset/liability/income scope, chart/accounts and event-to-posting rules; currency/value balancing; cash settlement; fill/cash linkage; reversal and audit semantics. | Posting examples and financial invariants, including conversions/fees/derivatives. | Before ledger/financial writes. |
| D-04 | Canonical quantities/currency units, decimal/database precision, rounding points, residual allocation, timestamp precision and source timezone/offset retention. | Precision/unit/time conventions with fixtures. | Before financial schema and calculations. |
| D-05 | Instrument identity and metadata effective dating, subtype/module API, manual/broker/internal valuation precedence and compatibility, minimum native-calculation baseline. | Instrument schema and per-operation capability matrix. | Before instrument schema/modules. |
| D-06 | Campaign/leg/order/fill relationships; lifecycle versus completeness/reconciliation; completion and reopening; active-trading versus investing classification. | State model and transition examples. | Before trade/position schemas. |
| D-07 | Fill-to-idea quantities/cost allocation, unallocated fills, fees in other currencies, lot consumption versus campaign attribution, short positions and transfer lineage. | Conservation and allocation examples. | Before fills/positions/P&L. |
| D-08 | FIFO/average/explicit lot-method eligibility and configuration scope, method changes/effective dates, opening position imports and unknown-basis behavior. | Lot/opening-import policy and fixtures. | Before lot engine/imports. |
| D-09 | Reporting/native P&L and FX attribution; account base currency versus currency balances; historical rate sourcing/selection; stale/missing rates; conversion-cost allocation. | Reconciling FX example matching AC-01. | Before multi-currency totals. |
| D-10 | Strategy/setup/rule versioning, effective dates, frozen/retrospective plans, custom fields, supported automatic predicates and manual/unknown assessments. | Strategy/rule schema and versioning contract. | Before playbook and plan workflows. |
| D-11 | Account/strategy risk-policy precedence; loss/exposure calendars and basis; original R risk with scale-ins/legs; manual/scenario sizing and missing-data behavior. | Risk-policy/R dictionary and scenario fixtures. | Before risk/sizing and R metrics. |
| D-12 | Metric populations, cost/FX treatment, completion/breakeven definitions, calendars/date basis, curve/drawdown/strategy attribution, TWR/MWR and sufficiency criteria. | Initial metric dictionary, with input/unavailable rules. | Define primitives before financial engine; settle individual methods before analytics. |
| D-13 | Source-of-truth, corrections/restatement, calculation versions, dependency graph, derived state/cache storage, synchronous versus queued recomputation and concurrency controls. | Recompute/audit/versioning ADR and invariants. | Before financial persistence and correction APIs. |
| D-14 | CSV mappings/fingerprint scope, symbol resolution, row versus batch atomicity, correction matching, quantity/cash/equity reconciliation tolerances, downstream-safe reversal. | Import/adapter/commit/reversal contracts and examples. | Before import persistence/workflows. |
| D-15 | Private attachment/source-file storage, supported types/limits, access/delivery and sanitization; JSON backup boundaries/versioning and file packaging; restore into empty versus existing workspace, merge/replace and ID collision handling, recovery targets. | Storage/backup/restore contract. | Before attachment/import storage and backup. |
| D-16 | API query/filter/pagination contract, indexes, cache boundaries, representative seeded scale, latency/throughput/resource budgets and any required background-worker topology. | Query/performance budget and dataset definition. | Before high-volume endpoints and performance validation. |
| D-17 | Local setup and production topology; config/secret ownership, health/logging/rate-limit/CSRF mechanisms, migration/backup operations and audit/file retention. | Operational/security ADR and runbook outline. | Before infrastructure/security implementation. |
| D-18 | Core responsive/accessibility journeys, table/filter/preferences behavior, timezone/locale defaults, autosave conflict handling and measurable design acceptance. | UI workflow map and verification checklist. | Before UI foundations and main flows. |
| D-19 | Integration scope at first delivery, provider contracts, optional AI/data consent boundaries, verified broker samples, optional advanced metrics/tax features. | Explicit inclusion/deferment list with honest capability statuses. | Before any integration/optional feature; not a blocker for manual core. |
| D-20 | Test framework/harness, independent financial fixtures and official references, supported instrument settlement examples, capability assertions, acceptance dataset and check commands. | Test/acceptance matrix mapped to AC-01–AC-16. | Establish foundation before financial modules; complete before acceptance. |

### Decisions already fixed by the specification

Do not reopen these as unspecified choices: persistent server-side storage; TypeScript/React/PostgreSQL in this empty repository; broker-independent domain separation; deterministic decimal-safe accounting; all-family recording; explicit manual fallbacks; historical strategy/metadata/FX integrity; immutable original risk for historical R; server-side tenant authorization; private attachments; import idempotency; no live trading/public deployment authorization; and integration-free primary workflows.

### Architectural resolution checklist

Before implementation, resolve and document the architecture for:

1. The full-stack application and persistence boundaries within TypeScript, React, and PostgreSQL (**D-01**).
2. Tenant ownership, membership, authentication, sessions, and server authorization (**D-02**).
3. The balanced multi-currency ledger, posting/settlement rules, precision, units, and time conventions (**D-03–D-04**).
4. Instrument identity, metadata versions, calculation/event modules, valuation provenance, and capability boundaries (**D-05**).
5. Campaign lifecycle, execution-to-idea allocation, position/lot accounting, opening data, and transfer lineage (**D-06–D-08**).
6. Historical FX selection, reporting-currency translation, and reconciling P&L attribution (**D-09**).
7. Strategy/plan versioning, configurable rule evaluation, risk precedence, and immutable-R semantics (**D-10–D-11**).
8. Metric populations, return/drawdown series, data-sufficiency rules, and calculation-version/recomputation design (**D-12–D-13**).
9. Import identity, atomicity, reconciliation, correction, and downstream-safe reversal (**D-14**).
10. Private file storage and versioned lossless backup/restore (**D-15**).
11. Query/pagination/index/cache boundaries, performance budgets, operations, and security controls (**D-16–D-17**).
12. Shared UI/filter/timezone/accessibility contracts and an independent acceptance-test architecture (**D-18, D-20**).
13. Which optional integrations are included, and how their contracts preserve manual-core independence (**D-19**; resolve before those integrations, not before core work).
