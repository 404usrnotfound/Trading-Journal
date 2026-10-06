# Codex development prompt: Professional multi-asset trading journal

Copy the prompt below into Codex in the project workspace. It is a development instruction, not a request for a design proposal.

---

You are building a professional, broker-agnostic, multi-asset trading journal as a complete web application. Act as a senior full-stack engineer, product designer, and financial-software engineer. Produce working software with persistent data, documented financial calculations, meaningful tests, and a polished interface.

## 1. Objective and operating instructions

Build an application that lets a trader record, import, organize, review, and analyze trading activity across brokers, accounts, asset classes, currencies, and strategies. It must combine reliable financial records, a strategy playbook, risk monitoring, behavioral review, and useful visual analytics.

Professional means accurate, traceable, resilient, flexible, and pleasant to use. Do not interpret completeness as a large collection of decorative screens.

Inspect the existing repository and its instructions first. Preserve an established stack where practical. In an empty repository, choose a maintainable full-stack TypeScript architecture with React, PostgreSQL, migrations, a type-safe database layer, runtime validation, and a documented authentication solution. Select supported dependency versions using official documentation. Explain consequential architecture decisions briefly and then implement them. Use appropriate component and chart libraries, without paid services being required for core functionality.

Make reasonable reversible decisions without repeatedly asking for confirmation. Ask only when a missing answer materially blocks implementation or creates incompatible requirements. Record assumptions. Do not assume a specific broker, account capital, trading strategy, or risk limit.

Create and maintain an implementation plan and acceptance checklist in the repository. Work in functioning increments and continue through implementation and verification. A proposal, static mockup, or localStorage-only prototype does not satisfy this request. If an external credential or unavailable service blocks an integration, complete its interface, manual fallback, configuration documentation, and a truthful status display. Do not represent a stub as a working integration.

Development does not authorize placing trades, connecting live brokerage credentials, or publishing a public deployment. This is a journal and analysis tool. Provide a locally runnable application and deployment instructions.

## 2. Product principles

- Broker-independent domain model; broker adapters map into this model rather than determining it.
- Support multiple brokers and accounts, including cash, margin, paper, and historical/closed accounts.
- Support long and short positions, fractional quantities, multiple entries/exits, and multiple simultaneous trading ideas in the same instrument.
- Track active trading and longer-term investing separately while allowing consolidated portfolio views.
- Separate original plans, actual executions, derived positions, cash transactions, and account valuations.
- Make missing, stale, estimated, imported, and manually verified information distinguishable.
- Preserve historical records when settings, prices, rates, or strategy rules change.
- All primary workflows must work without a market-data subscription or AI subscription.
- Make common actions fast and advanced details available through progressive disclosure.
- Use deterministic, tested calculations for financial metrics. An LLM must never be the accounting engine.

## 3. Multi-asset support and extensibility

Provide an extensible instrument registry and calculation/event-handler interfaces. Support recording, identifying, categorizing, importing, attaching notes to, and reviewing all of the following:

- Stocks, ETFs, exchange-traded products, mutual funds, and other investment funds.
- Crypto spot assets and token holdings, including transfers and configurable staking/reward events.
- Spot FX and multiple currency balances.
- Exchange-traded futures, including expiry and rolls.
- Linear and inverse crypto futures/perpetuals, including funding and collateral conventions.
- Options on equities, indices, futures, and other supported underlyings, including multi-leg trades.
- Bonds, bills, and other fixed-income instruments.
- CFDs and other leveraged OTC instruments.
- Warrants, turbo/knockout products, factor certificates, and structured products.
- Commodities and custom instruments, with clearly defined units and settlement conventions.

Do not apply a universal stock-style P&L formula to every instrument. Define instrument-specific metadata and capabilities: identifiers, exchange/venue, asset family, underlying, quote currency, settlement currency, multiplier, tick size/value, lot size, price scale, expiry, strike, option type, exercise/settlement style, collateral currency, and quantity conventions as applicable. Version or effective-date metadata that affects historical calculations.

Handle monetary cash flows according to the instrument: notional exposure is not automatically a purchase cash debit. Futures variation margin, option premiums, bond accrued interest, inverse contracts, and leveraged-product settlement need explicit models.

Document and display a support matrix with separate levels:

1. Native recording and automatic calculations validated by tests.
2. Recording and analysis using explicitly entered broker valuations/cash settlements.
3. Unsupported automatic calculations, with a visible reason and safe manual fallback.

Every listed asset family must be recordable in the delivered application. Implement automatic calculation modules in stages, with working ordinary linear instruments first, then derivative and fixed-income conventions. Advanced/custom products may use explicit broker-reported values until their modules are validated. Do not generate incorrect numbers to make support look complete. Imported/manual valuations must retain provenance, and must not be silently combined with internally calculated values using incompatible definitions.

Provide a supported way to add an instrument subtype and register its metadata, validator, valuation method, cash-flow handling, and test fixtures without rewriting the application. Custom formulas must be vetted server-side modules or a constrained expression system; never execute arbitrary user-supplied JavaScript.

## 4. Data architecture and financial records

Model at least the following entities with stable IDs, relationships, validation, timestamps, and ownership:

- User/workspace, broker, account, currency, instrument, instrument metadata version.
- Trading idea/trade campaign, trade leg, order, execution/fill, execution allocation.
- Cash-ledger event and posting, transfer, actual currency conversion, fee, dividend, interest, withholding, funding, borrowing charge, corporate action.
- Position/lot, price observation, FX observation, account valuation, reconciliation record.
- Strategy, strategy version, setup, checklist/rule, risk policy, rule assessment.
- Journal entry, review, tag, screenshot/attachment, custom-field definition/value.
- Import template, import batch, source row, mapping, validation error, correction/audit event.

A trading idea is the unit of decision-making and review. Orders are instructions. Executions are actual fills. Positions and lots are derived holdings. Cash records explain money movements. Portfolio valuations are timestamped observations or calculations. Keep these concepts distinct in the UI and documentation.

Allow one execution to be allocated across trading ideas with conservation checks: quantities and costs cannot be duplicated. A multi-leg idea may contain several instruments. A closed idea requires a documented completion rule; do not classify every sale or fill as a completed trade. Support reopened ideas explicitly or start a new linked idea according to a configured policy.

Use a currency-aware ledger with auditable, balanced postings under documented valuation conventions. Link execution-generated postings to their source fill. Imported cash rows referring to those same fills must reconcile rather than duplicate them. Use atomic database transactions for dependent writes. Deposits/withdrawals, transfers, currency exchanges, and trading proceeds have distinct classifications.

Support configurable FIFO, average-cost where appropriate, and explicit lot allocation; document supported methods and distinguish analytical lot accounting from jurisdiction-specific tax treatment. Internal transfers preserve appropriate lot history; trade attribution and lot accounting must not be confused.

Use decimal-safe calculations and sufficient database precision for prices, fractional quantities, FX rates, and crypto. Do not use binary floating-point for monetary accounting. Specify rounding boundaries and retain original precision.

Store timestamps consistently with source timezone/offset provenance, and display in a configurable IANA timezone with daylight-saving support. Keep trade date, settlement date, and valuation time distinct.

Corrections must retain an audit trail and trigger recomputation of affected derived data. Prefer reversals/replacements for posted ledger corrections. Archive referenced strategies/instruments instead of breaking historical links.

## 5. Multi-currency and costs

Allow any account currency and a configurable reporting currency per workspace, with native-currency views and consolidated reporting views.

Record each actual currency conversion as its own dated event: source and destination amounts, currencies, actual rate, fee and fee currency, account, and source reference. An actual currency exchange is different from translating a value for reporting.

Store historical translation rates for executions, cash events, and valuations with pair direction, timestamp, source, and status. Changing today's FX rate must not overwrite historical rates. Changing reporting currency creates another reporting view, not a rewrite of the original records.

Provide separate, documented presentations for native trading P&L, reporting-currency P&L, currency-related effects on holdings/cash, and total account change. Define the FX attribution method and verify that components reconcile without double counting.

Support commissions, exchange/regulatory fees, financing, borrow costs, funding, and optional trade allocations of currency-conversion costs. Preserve the original charged currency. Configurable fee estimates support planning; actual charges determine realized results.

Spread and slippage embedded in actual fill prices are execution-quality measures, not additional deductions from actual P&L. Prevent double deductions. Manual marks and manual FX rates must remain possible when providers are absent.

## 6. Strategy workspace — a core feature

Build a dedicated strategy/playbook area, with list, detail, editor, version history, linked-trade views, and comparison views.

Each strategy must support:

- Name, description, hypothesis/edge, lifecycle status, owner, tags.
- Eligible instruments, markets, trading direction, style, timeframes, and sessions.
- Market-regime filters, setup conditions, entry trigger, invalidation conditions.
- Initial stop rules, targets, scaling rules, trailing/management rules, exit rules.
- Position-sizing rules, risk budget, exposure/concentration limits, daily/weekly limits.
- Required checklist, example screenshots, reference documents, review schedule.
- Versioned rules with effective dates; linked trades retain the version used.
- Configurable numeric/boolean/text parameters and rule fields without source-code edits.

Separate strategies from setups: one strategy can include several named setups. Allow trades without an assigned strategy and expose them as unclassified.

Show performance by strategy AND version: completed-trade count, wins/losses/breakevens, net P&L, expectancy, R results where available, cost burden, drawdown under documented attribution, holding duration, and rule adherence. Compare versions, setups, and selected strategies over matching date ranges, with sample sizes and data-completeness indicators.

Distinguish manual rule assessments from rules that can be evaluated automatically. Do not claim a rule passed when required data is missing. Preserve a frozen pre-trade plan and log subsequent changes. Late/imported plans must be labeled retrospective rather than presented as original decisions.

## 7. Trade recording and review

Build a fast guided entry flow and an advanced editor. Show only relevant fields for the chosen asset and trade structure. Autosave journal drafts, support keyboard navigation, and prevent accidental duplicate submissions.

Capture:

- Account, instruments/legs, strategy version, setup, direction, timestamps, tags.
- Original thesis, market context, indicators/timeframes, intended entry, stop, target, quantity, planned costs, initial risk and expected reward-to-risk where meaningful.
- Actual orders/fills, fees, partial entries/exits, changes to plan, linked cash events.
- Exit reason, results, duration, checklist outcomes, mistakes, emotions, lessons.
- Screenshots before/during/after, notes, and post-trade review.

Give every trade a detail page with plan-versus-actual comparison, execution and cash timeline, leg/lot allocation, financial breakdown, supporting documents, rule compliance, and audit history.

Support open, partially closed, closed, canceled/no-execution, imported-incomplete, and reconciled states. Canceled orders do not create holdings or P&L. Attach hypothetical outcomes separately from actual results.

## 8. Accounts, portfolio, and risk

Provide broker/account setup, opening balances, historical holdings/lots, account currencies, and reconciliation dates. Opening holdings require cost basis or an explicitly unknown cost status; do not invent historical profit.

Show cash by currency, positions, unrealized results, account equity, allocation, concentration, gross/net exposure, and available information on settlement and margin. Cash accounts distinguish settled/unsettled funds. Margin/collateral/buying-power data may be broker-reported; label source and freshness, and never imply exact broker margin availability from a generic estimate.

Risk policies are configurable at account and strategy level with documented precedence. Support per-trade risk, daily/weekly loss limits, maximum concurrent positions, concentration limits, leverage/exposure limits, overnight restrictions, and prohibited instruments. Display breaches and unknown assessments with actionable explanations.

Support a pre-trade sizing calculator for validated instrument types with currencies, multiplier, stop distance, costs, and lot increments. Complex/nonlinear trades require a documented scenario/max-loss method or explicit manual initial risk; a stop-distance stock formula is insufficient.

Original initial risk is immutable for historical R calculations. Define handling of scale-ins, risk additions, and multi-leg changes. Missing original risk means R is unavailable. Explain that stop-based risk is a plan and does not guarantee the realized loss.

## 9. Analytics and metric definitions

Create a central, tested financial calculation layer and a metric dictionary defining each formula, units, costs included, population, time interval, currency treatment, required data, and edge cases.

Provide:

- Realized/unrealized P&L, native/reporting currency, gross/net views, total fees/carrying costs.
- Completed-trade count, win rate, breakeven count, average win/loss, payoff ratio, profit factor, monetary expectancy, R expectancy, distribution of outcomes, streaks, duration, turnover.
- Raw equity/NAV curve and a distinct cash-flow-adjusted performance curve.
- TWR and MWR when required valuations/cash-flow data exists; identify approximations and return unavailable when inputs or a valid solution are absent.
- Maximum drawdown and recovery duration with a specified source series; deposit-related changes must not masquerade as performance recovery.
- Breakdowns by strategy/version, setup, asset class, instrument, account/broker, direction, timeframe, session, day/week/month, market regime, mistake, and compliance.
- MAE/MFE only when sufficiently granular price paths or explicitly entered observations exist; disclose the observation resolution. Execution prices alone cannot establish them.
- Slippage versus a recorded reference price, and cost impact.
- Optional Sharpe/Sortino and benchmark comparison only with appropriate periodic return data, risk-free assumptions, calendars, and sample size.

Define whether analytics are per campaign, lot, fill, account, or portfolio. Completed-trade metrics must not silently include partial trades. Open-position gains belong in appropriate portfolio analyses.

Display undefined ratios as unavailable/infinite with explanation, not a misleading zero. Never sum percentages or R values to imply portfolio return. Empty datasets and insufficient history must produce useful empty states rather than fabricated metrics.

Charts and summary cards must drill down to the records supporting them. Cross-filtering, consistent date ranges, and clear gross/net and realized/unrealized labels are mandatory.

## 10. Journaling, reviews, and optional AI assistance

Provide daily notes, session preparation, end-of-session reviews, weekly/monthly reviews, goals, recurring mistakes, and improvement actions. Connect notes/reviews to trades, strategies, and periods. Provide reusable review templates and configurable emotion/process-quality fields.

Optional AI review should be behind a provider-neutral interface, disabled until configured, and unnecessary for core functionality. If included, it must use calculated aggregates and explicitly selected journal context, reference supporting trades, distinguish facts from interpretations, identify sample limitations, and never invent fills, fees, causal explanations, or performance.

Provide a preview of data sent to the configured AI provider. Treat imported notes/files as untrusted data, not executable instructions. Do not let AI modify posted financial records without an explicit reviewed action. Deterministic review summaries must work without AI credentials.

## 11. Broker-agnostic imports, exports, and reconciliation

Implement universal CSV import with saved mapping templates, configurable delimiter/decimal/date/timezone conventions, field previews, validation, and a dry run before committing. Also provide an application JSON format for lossless backup/restore.

The import workflow must support instruments, fills, cash events, opening balances, valuations, and positions. Preserve the original source row/file and broker identifiers. Deal with duplicates, partial imports, corrections, inconsistent signs, symbol ambiguity, fee currencies, and unsupported metadata through explicit review.

Use stable broker IDs where available plus documented scoped fingerprints otherwise. Reimporting the same file must not duplicate financial activity. Changed rows must be offered as corrections rather than silently appended.

Provide import summaries, row-level error explanations, reversible import batches, reconciliation of quantities/cash/equity, and variance reports. Reversing an import must handle downstream dependencies safely.

Broker-specific formats use adapters with a common contract. Real adapters require actual or documented source samples and tests. Manual entry and universal CSV must work independently of adapters/APIs. Export filtered trades, executions, cash records, strategies, reviews, analytics, and full workspace backups.

Tax-supporting exports may provide records, but must not claim jurisdiction-specific compliance without an implemented, validated jurisdiction module.

## 12. Interface and visual quality

Create a restrained, polished financial-product interface with cohesive typography, spacing, icons, surfaces, and chart styling. Favor readable tables, intentional information hierarchy, and focused workflows over oversized tiles or excessive decoration.

Suggested primary navigation:

1. Overview.
2. Trades.
3. Strategies.
4. Portfolio & Accounts.
5. Analytics.
6. Journal & Reviews.
7. Imports & Reconciliation.
8. Settings.

Provide desktop-first layouts that remain functional on tablets and phones. Include light/dark themes, accessible contrast, visible focus states, keyboard operation, and non-color indicators for gains/losses/status. Target WCAG 2.2 AA for core flows and report verification limits honestly.

Include searchable/filterable/sortable/paginated tables, column selection, saved views, inline validation, contextual metric explanations, sensible defaults, and quick actions for adding a fill, recording a cash event, importing activity, and starting a review. Persist user display preferences.

Use URL-addressable filters where useful. Apply account/date/currency filters consistently and make active filters visible. Support English initially with localization-ready labels, locale-aware formatting, and configurable timezone/currency. Avoid hardcoded US number/date conventions.

Charts must have meaningful axes, units, tooltips, legends, empty/loading/error states, and an accessible data-table alternative. Link chart points to underlying observations. Clearly label stale or manually entered prices.

Provide isolated, clearly labeled demo data that showcases varied accounts, assets, currencies, strategies, partial fills, gains/losses, and missing-data states. A fresh real workspace starts empty. No fake market feed, random chart series, or decorative financial numbers in real views.

Every visible primary action must work, or be disabled with an explanation. Core screens must not contain placeholder workflows or TODO calculations.

## 13. Security, persistence, and operations

Use real server-side persistence with migrations and a documented schema. Isolate user/workspace data and verify authorization on the server for every record and attachment. Provide secure authentication, session handling, request validation, and appropriate CSRF/rate-limit protections.

Keep secrets server-side, out of source control and logs. Provide an environment-variable template. Use private attachment storage, file size/type validation, authorization checks, and safe rendering/sanitization. Guard exports against spreadsheet-formula injection and imports against malicious files/oversized inputs.

Support backups and tested restore, audit logs, basic health checks, structured redacted logs, and useful error reporting. Provide a straightforward local setup, preferably a documented container option, and production deployment guidance without requiring a particular hosting vendor.

Use server-side filtering/pagination and indexes for realistic history. Establish documented performance budgets with a representative large seeded dataset. Avoid unbounded client-side loading and N+1 queries.

## 14. Verification and acceptance criteria

Add meaningful unit tests for financial calculations, integration tests for persistence/import/ledger workflows, and end-to-end tests for the main user journeys. Run appropriate checks and fix failures. Validate against independent hand-calculated fixtures and official instrument/broker specifications, not only code-generated expected values.

Acceptance scenarios must include:

- EUR-funded account, two different EUR/USD conversion events with fees, USD stock trading, partial closes, and later valuation at another FX rate. Historical results remain unchanged when current rates change; balances reconcile.
- One trade with multiple fills and partial exits; correct remaining quantity, cost allocation, fees, and completed-trade status.
- Two strategies trading the same instrument concurrently, including allocating one fill across ideas without duplicating quantities/costs.
- A short position with fees and borrowing costs.
- Option premium/multiplier and multi-leg recording, plus an exercise/assignment or explicit settlement workflow for the supported capability level.
- Futures recording with tick/multiplier and settlement treatment; funding for a supported perpetual contract; no full-notional cash debit by default.
- Fixed-income recording with stated quantity/price conventions and accrued-interest treatment or an explicit broker-valued fallback.
- A structured/custom product with unsupported automatic pricing: records and manual settlement work, unavailable metrics are honest.
- A dividend/corporate action, an internal account transfer, opening holdings with unknown basis, and a correction after import.
- Deposits/withdrawals do not count as trade profit; internal transfers do not count as consolidated external flows.
- Reimporting identical data changes no balances or counts; invalid rows are explained and cannot corrupt valid records.
- Strategy version changes do not alter previously recorded plans; missing initial risk yields unavailable R.
- Missing prices/FX, no trades, no losing trades, tiny samples, and undefined ratios are handled transparently.
- Workspace authorization prevents another user from accessing records, exports, or attachments.
- Backup/restore reproduces records and derived totals under the same calculation version.
- Core workflows operate without external integrations and survive page reloads/server restarts.

Keep a capability matrix mapping these scenarios to implemented features/tests, manual fallbacks, and remaining limitations. Do not claim support that cannot pass its corresponding scenarios.

## 15. Delivery and execution sequence

Work through these milestones without stopping at a plan:

1. Inspect repository; establish product assumptions, architecture, schema, metric dictionary, asset support matrix, UI direction, and acceptance checklist.
2. Implement authentication, persistence, accounts/instruments, ledger, fills, derived positions, multi-currency foundations, and a polished application shell.
3. Complete strategy versioning, trade plans/reviews, imports/reconciliation, and core end-to-end recording workflows.
4. Add validated asset modules, analytics, risk monitoring, journal/review workflows, attachments, saved views, exports, and backup/restore.
5. Verify financial fixtures, security boundaries, responsive/accessibility behavior, and performance. Refine visual quality and complete documentation.

Keep each increment runnable. Prioritize financial foundations and strategy workflows, while retaining the full scope in a progress file. Advanced native-calculation modules may remain explicit manual/broker-valued capabilities if their formulas cannot be validated within the environment; document this prominently and leave all corresponding recording/review workflows functional. Do not hide deferred features behind apparent automatic support.

Deliver source code, migrations, safe demo seed data, import examples, tests, configuration template, and concise documentation covering setup, architecture, domain model, calculation methods, asset support, import mappings, backup/restore, and extension points.

Before declaring completion, run the application, exercise primary workflows, inspect its interface at desktop and mobile sizes using available tools, and run the relevant checks. Report what was actually verified.

Your final response should state how to run it, what works, checks performed, and material limitations or credentials still needed. Do not describe it as production-ready merely because it builds.

Begin by inspecting the workspace and implementing the application.
