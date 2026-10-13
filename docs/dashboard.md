# Dashboard semantics

The authenticated `/dashboard` presents the Phase 8 campaign engine and Phase 7 account accounting engine. It adds presentation and read-only aggregation; authoritative amounts remain Decimal calculations and decimal-string DTOs. Recharts receives JavaScript numbers only for plot coordinates. Exact decimal values remain available in tooltips and accessible tables.

## Applied scope

Date, immutable portfolio membership version, account, broker, strategy, strategy version, asset, asset class and journal tag filters apply together. Choices within a dimension are OR; dimensions intersect. Portfolio/account/broker scope intersects before financial reads. Live and paper account populations remain separate. Trade dimensions match any historical campaign member and retain the entire campaign, including mixed groups; filtering never allocates fractions of a campaign's P&L or original risk.

Workspace-local inclusive dates become the financial engine's `(from, to]` interval: one microsecond before local midnight through one microsecond before midnight after the final day. DST transitions use the selected IANA timezone. Financial and separately captured metadata cutoffs are disclosed by the report. Account, currency and portfolio identities are authorized server-side. Unknown owned selections produce empty intersections; inaccessible identities are rejected.

A single tenant-scoped, read-only repeatable-read transaction supplies the filter result, campaign metrics and account samples. Applied filters persist in the URL. Draft selections do not change metrics until Apply; browser history restores applied state. Request keys include workspace and the complete generation, and superseded requests are aborted. Loading and failed queries hide previous-generation metrics.

## Financial populations and definitions

Metric formulas and availability states inherit [analytics definitions](analytics-definitions.md) and [portfolio accounting](portfolio-accounting.md).

- Primary closed net P&L, win rate, profit factor and average R use completed campaigns. Open campaign figures are separately labeled. Profit factor without losses remains explicitly infinite or undefined according to the engine.
- Cumulative P&L and monetary drawdown use chronological completed campaign net P&L. They are campaign outcomes, not account NAV or percentage returns. Missing chronology or economics remains disclosed.
- Calendar and monthly performance sum completed campaign net P&L by workspace-local close date/month. An incomplete member makes the bucket partial with a known subtotal; the plotted complete value is unavailable. Undated outcomes are disclosed separately. A day without outcomes is blank, rather than a fabricated zero observation.
- P&L and R histograms use completed campaigns with an available respective metric. Six equal-width Decimal bins span the sample minimum/maximum; quantized duplicate boundaries are collapsed. Bins are lower-inclusive and upper-exclusive except the last upper-inclusive bin. Equal values form one bin. Excluded campaign IDs remain available. R without committed original risk is excluded, never inferred.
- Win/loss/breakeven counts use completed, available net outcomes. Strategy and asset breakdowns retain Phase 8 whole-campaign grouped populations, including open lifetime P&L, with mixed/unknown groups. These are explicitly labeled separately from closed-only cards.
- Account equity is cash plus holdings plus monetary transit at each sampled economic cutoff. Two to thirteen uniformly spaced samples (default seven) are calculated from source observations, with duplicate microsecond timestamps removed. It is a sampled curve, not a complete daily history; missing/stale prices, FX or account settings produce gaps. No forward-filled invented values are used.
- Capital-adjusted monetary performance uses the accounting reconciliation's performance, separating external funding and owned transfers from performance. It is not TWR, MWR, annualized return or a percentage. Its opening zero is available only when opening equity is complete.
- Allocation shows signed cash plus holdings per account, with owned transfers in transit as a separate scope-level component. Negative values and unavailable inputs are retained. It does not imply percentages or double-count transit.

Account equity and allocation are explicitly unavailable under strategy/version, asset/class or tag filters: the current model has no valid account-capital attribution for those dimensions. Account-scoped campaign statistics remain available. Clearing trade filters restores account accounting.

## Interaction and accessibility

Performance, Distributions and Breakdowns provide information hierarchy without displaying every chart at once. Cards, calendar days and chart tables select supporting campaigns; strategy/asset breakdowns can apply shared cross-filters. The supporting trade list is searchable, paginated and links to the persistent journal trade detail. Chart data tables expose exact values and keyboard actions. Missing inputs, sample/exclusion counts and source dependencies accompany results. Light/dark theme controls use the existing application preference.

Desktop uses the persistent workspace navigation and multi-column cards/charts; tablet and mobile collapse charts and filter controls, preserving readable tables with contained scrolling. Charts have labeled units and tooltips. Color supplements labels and signed values.

## Sources, limits and infrastructure

The dashboard exposes selected price/FX source priorities and freshness windows (one hour, one day or seven days). Priorities default to the catalog's displayed alphabetical order; no implicit authoritative provider is assumed. Reporting currency is explicit. Report dependencies retain source and observation IDs; absent manual prices/FX remain visible gaps rather than zeros.

The endpoint bounds intervals to 367 elapsed days, request bodies to 256 KiB and responses to 4 MiB. Selection lists are limited to 100, catalog collections to 500 and source collections to 64. Campaign/fact/group limits inherit the analytics engine; catalog overflow fails explicitly instead of silently truncating. Synchronous account histories support at most ten accounts; larger scopes retain campaign analytics with an explained unavailable history. Narrowing the scope is the current recovery path; background projections are deferred.

`GET /api/v1/workspaces/{workspaceId}/dashboard/catalog` and `POST /api/v1/workspaces/{workspaceId}/dashboard/reports` require current viewer membership. POST is a read-only query and creates no ledger event, audit mutation or outbox intent. Tenant RLS, strict contracts and bounded error responses apply. No schema migration, worker, new secret, pricing integration or deployment is introduced. Recharts and react-is are pinned dependencies. Existing installation, database and startup instructions apply.
