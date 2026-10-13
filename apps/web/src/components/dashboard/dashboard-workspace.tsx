'use client';
import { formatDashboardValue as format } from './dashboard-format';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  dashboardCatalogSchema,
  dashboardResponseSchema,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { DashboardChart } from './dashboard-chart';
import { DashboardCalendar } from './dashboard-calendar';
import { inclusiveDateRange, todayInZone } from './dashboard-time';

async function read<T>(
  url: string,
  schema: { parse(value: unknown): T },
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal ?? null,
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Your session ended. Sign in again.'
        : response.status === 409
          ? 'This scope exceeds the dashboard limit. Choose fewer accounts or a shorter date range.'
          : 'The dashboard could not be loaded. Check your filters and try again.',
    );
  return schema.parse(await response.json());
}
const filterKeys = [
  'portfolioVersionId',
  'accountIds',
  'brokerIds',
  'strategyIds',
  'strategyVersionIds',
  'assetIds',
  'assetClasses',
  'tags',
] as const;
const labels = [
  'Portfolio version',
  'Account',
  'Broker',
  'Strategy',
  'Strategy version',
  'Asset',
  'Asset class',
  'Tag',
];
type Form = {
  from: string;
  to: string;
  currency: string;
  environment: 'live' | 'paper';
  age: string;
} & Record<(typeof filterKeys)[number], string>;

function DashboardContent({
  workspace,
  workspaces,
}: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
}) {
  const router = useRouter(),
    params = useSearchParams(),
    id = useId(),
    prefix = `/api/v1/workspaces/${workspace.id}/dashboard`;
  const today = todayInZone(workspace.timezone);
  const defaults: Form = {
    from: new Date(Date.parse(`${today}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10),
    to: today,
    currency: '',
    environment: 'live',
    age: '86400000',
    portfolioVersionId: '',
    accountIds: '',
    brokerIds: '',
    strategyIds: '',
    strategyVersionIds: '',
    assetIds: '',
    assetClasses: '',
    tags: '',
  };
  const initial = {
    ...defaults,
    ...Object.fromEntries(
      Object.keys(defaults).flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])),
    ),
  } as Form;
  const [form, setForm] = useState(initial),
    [applied, setApplied] = useState(initial),
    [failure, setFailure] = useState<string | null>(null),
    [tab, setTab] = useState(
      ['performance', 'distributions', 'breakdowns'].includes(params.get('view') ?? '')
        ? params.get('view')!
        : 'performance',
    ),
    [drill, setDrill] = useState<string[] | null>(null),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(''),
    [curve, setCurve] = useState('equity');
  const catalog = useQuery({
    queryKey: ['dashboard-catalog', workspace.id],
    queryFn: ({ signal }) => read(`${prefix}/catalog`, dashboardCatalogSchema, undefined, signal),
  });
  const data = catalog.data;
  const currency =
    applied.currency ||
    data?.currencies.find((row) => row.code === workspace.reportingCurrency)?.id ||
    data?.currencies[0]?.id ||
    '';
  let request: unknown;
  let invalid: string | null = null;
  try {
    request = {
      ...inclusiveDateRange(applied.from, applied.to, workspace.timezone),
      reportingCurrencyId: currency,
      environment: applied.environment,
      timezone: workspace.timezone,
      samples: 7,
      filters: Object.fromEntries(
        filterKeys.map((key) => [
          key,
          key === 'portfolioVersionId'
            ? applied[key] || undefined
            : applied[key]
              ? [applied[key]]
              : [],
        ]),
      ),
      fxPolicy: {
        id: 'dashboard-explicit-sources/1',
        maxAgeMilliseconds: Number(applied.age),
        sourcePriority: data?.fxSources.length ? data.fxSources : ['manual'],
      },
      priceMaxAgeMilliseconds: Number(applied.age),
      priceSourcePriority: data?.priceSources.length ? data.priceSources : ['manual'],
    };
  } catch (error) {
    invalid = error instanceof Error ? error.message : 'Choose valid dates.';
  }
  const report = useQuery({
    queryKey: ['dashboard-report', workspace.id, request],
    enabled:
      !!data &&
      !!currency &&
      !invalid &&
      data.accounts.some((account) => account.environment === applied.environment),
    queryFn: ({ signal }) => read(`${prefix}/reports`, dashboardResponseSchema, request, signal),
    retry: false,
  });
  function apply(next: Form) {
    setForm(next);
    setApplied(next);
    setDrill(null);
    setPage(0);
    setFailure(null);
    const url = new URLSearchParams({ workspace: workspace.id, view: tab });
    for (const [key, value] of Object.entries(next)) if (value) url.set(key, value);
    router.replace(`/dashboard?${url}`, { scroll: false });
  }
  function drillInto(ids: string[]) {
    setDrill(ids);
    setPage(0);
    document
      .getElementById(`${id}-records`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const response = report.data,
    analytics = response?.analytics;
  const money = data?.currencies.find((row) => row.id === currency)?.code ?? 'reporting currency';
  const options = data
    ? [
        data.portfolios.filter((row) => row.environment === form.environment),
        data.accounts.filter((row) => row.environment === form.environment),
        data.brokers,
        data.strategies,
        data.strategyVersions.filter(
          (row) => !form.strategyIds || row.parentId === form.strategyIds,
        ),
        data.assets,
        [...new Set(data.assets.map((row) => row.assetClass))].map((key) => ({
          id: key,
          label: key.replaceAll('_', ' '),
        })),
        data.tags.map((tag) => ({ id: tag, label: tag })),
      ]
    : [];
  const rows = (analytics?.records ?? []).filter(
    (row) =>
      (!drill || drill.includes(row.id)) && row.title.toLowerCase().includes(search.toLowerCase()),
  );
  const metricKeys = ['netPnl', 'winRate', 'profitFactor', 'averageR'] as const;
  const metricNames = ['Closed net P&L', 'Win rate', 'Profit factor', 'Average R'];
  const groupRows = (dimension: 'strategy' | 'asset') =>
    analytics?.groups
      .filter((group) => group.dimension === dimension)
      .map((group) => ({
        key: group.key,
        label: group.label,
        value: group.summary.metrics.netPnl.value,
        campaignIds: group.summary.population.campaignIds,
        detail:
          group.kind === 'mixed'
            ? 'Mixed campaign · counted once'
            : `${group.summary.counts.completed} completed trades`,
      })) ?? [];
  const distributionRows = (kind: 'pnlDistribution' | 'rDistribution') =>
    response?.views[kind].bins.map((bin) => ({
      key: bin.key,
      label:
        bin.lower === bin.upper
          ? format(bin.lower, kind === 'rDistribution' ? 'R' : money)
          : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(bin.lower))}–${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(bin.upper))}`,
      value: String(bin.count),
      campaignIds: bin.campaignIds,
      detail: `Exact boundaries: ${bin.lower} to ${bin.upper} ${kind === 'rDistribution' ? 'R' : money}; final upper boundary included`,
    })) ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PERFORMANCE WORKSPACE</div>
          <h1>Analytics dashboard</h1>
          <p>Understand your results. Review the decisions behind them.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            if (
              currency &&
              data?.accounts.some((account) => account.environment === applied.environment) &&
              !invalid
            )
              void report.refetch();
            void catalog.refetch();
          }}
        >
          Refresh data
        </Button>
      </div>
      {workspaces.length > 1 && (
        <WorkspaceSwitcher selected={workspace.id} workspaces={workspaces} />
      )}
      <Panel className="dashboard-filters">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply(form);
          }}
        >
          <div className="dashboard-filter-primary">
            <div className="field">
              <label htmlFor={`${id}-from`}>From</label>
              <input
                id={`${id}-from`}
                type="date"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-to`}>Through</label>
              <input
                id={`${id}-to`}
                type="date"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-currency`}>Reporting currency</label>
              <select
                id={`${id}-currency`}
                value={form.currency || currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {data?.currencies.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {row.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-environment`}>Environment</label>
              <select
                id={`${id}-environment`}
                value={form.environment}
                onChange={(e) =>
                  setForm({
                    ...form,
                    environment: e.target.value as 'live' | 'paper',
                    accountIds: '',
                    portfolioVersionId: '',
                  })
                }
              >
                <option value="live">Live accounts</option>
                <option value="paper">Paper accounts</option>
              </select>
            </div>
            <Button type="submit">Apply filters</Button>
            <Button variant="quiet" onClick={() => apply(defaults)}>
              Reset
            </Button>
          </div>
          <details>
            <summary>Portfolio, trade and pricing filters</summary>
            <div className="dashboard-filter-grid">
              {filterKeys.map((key, index) => (
                <div className="field" key={key}>
                  <label htmlFor={`${id}-${key}`}>{labels[index]}</label>
                  <select
                    id={`${id}-${key}`}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [key]: e.target.value,
                        ...(key === 'strategyIds' ? { strategyVersionIds: '' } : {}),
                      })
                    }
                  >
                    <option value="">
                      All{' '}
                      {
                        [
                          'portfolio versions',
                          'accounts',
                          'brokers',
                          'strategies',
                          'strategy versions',
                          'assets',
                          'asset classes',
                          'tags',
                        ][index]
                      }
                    </option>
                    {options[index]?.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="field">
                <label htmlFor={`${id}-age`}>Maximum price / FX age</label>
                <select
                  id={`${id}-age`}
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                >
                  <option value="3600000">1 hour</option>
                  <option value="86400000">24 hours</option>
                  <option value="604800000">7 days</option>
                </select>
              </div>
            </div>
            <p className="muted">
              Source priority: {data?.priceSources.join(' → ') || 'manual'} for prices;{' '}
              {data?.fxSources.join(' → ') || 'manual'} for FX. All observations are historical;
              future prices are excluded.
            </p>
          </details>
        </form>
        <div className="dashboard-active-filters" aria-label="Active filters">
          <span>
            {applied.from} — {applied.to} · {workspace.timezone} · {applied.environment} · {money}
          </span>
          {filterKeys
            .filter((key) => applied[key])
            .map((key) => (
              <button key={key} onClick={() => apply({ ...applied, [key]: '' })}>
                {labels[filterKeys.indexOf(key)]}:{' '}
                {options[filterKeys.indexOf(key)]?.find((row) => row.id === applied[key])?.label ??
                  applied[key]}{' '}
                ×
              </button>
            ))}
        </div>
      </Panel>
      {(failure || invalid || catalog.error || report.error) && (
        <Panel className="dashboard-message" role="alert">
          <p>
            {failure ||
              invalid ||
              (catalog.error as Error | null)?.message ||
              (report.error as Error | null)?.message}
          </p>
          <Button onClick={() => void report.refetch()}>Try again</Button>
        </Panel>
      )}
      {(catalog.isPending || report.isFetching) && (
        <p role="status" className="dashboard-message">
          Loading a consistent dashboard…
        </p>
      )}
      {!catalog.isPending &&
        data &&
        (!currency || !data.accounts.some((row) => row.environment === applied.environment)) && (
          <Panel className="dashboard-message">
            <h2>Your performance starts with financial records</h2>
            <p>
              No {applied.environment} accounts or reporting currencies are available. Create
              financial records through the ledger API, then return to review your results.
            </p>
            <a href={`/journal?workspace=${workspace.id}`}>Open trade journal</a>
          </Panel>
        )}
      {response && !analytics && (
        <Panel className="dashboard-message">
          <h2>No accounts match these filters</h2>
          <p>Adjust the account, broker or portfolio selection.</p>
        </Panel>
      )}
      {analytics && !report.isFetching && !report.error && (
        <>
          <div className="dashboard-metrics">
            {metricKeys.map((key, index) => {
              const metric = analytics.completedOnly.metrics[key];
              return (
                <button
                  className="panel dashboard-metric"
                  key={key}
                  onClick={() => drillInto(metric.eligibleIds)}
                >
                  <span>{metricNames[index]}</span>
                  <strong>
                    {metric.state === 'infinite'
                      ? '∞'
                      : metric.state === 'available'
                        ? key === 'winRate'
                          ? `${new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(Number(metric.value))}`
                          : format(
                              metric.value,
                              key === 'netPnl' ? money : key === 'averageR' ? 'R' : 'ratio',
                            )
                        : 'Unavailable'}
                  </strong>
                  <small>
                    {metric.sampleSize} eligible · {metric.excludedIds.length} excluded
                  </small>
                  <span className="dashboard-metric-help">
                    {metric.reasons.length
                      ? metric.reasons.map((reason) => reason.replaceAll('_', ' ')).join('; ')
                      : 'Review supporting trades'}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="dashboard-context">
            <p>
              {analytics.summary.counts.completed} completed · {analytics.summary.counts.open} open
              · {analytics.summary.counts.excluded} excluded
            </p>
            <p>
              Open net P&L: {format(analytics.openOnly.metrics.netPnl.value, money)} · Attributed
              fees: {format(analytics.summary.metrics.fees.value, money)}
            </p>
            <details>
              <summary>Definitions and coverage</summary>
              <p>
                Closed statistics use completed, fully evidenced campaigns. Open P&L is lifetime
                attribution at the ending date. Calendar and distributions use eligible completed
                outcomes. Account equity includes funding; adjusted monetary performance excludes
                capital flows. Unknown values are never zero-filled.
              </p>
              <p>
                Financial generation {analytics.context.sourceRevision} · metadata{' '}
                {analytics.context.metadataAsOf} · definition {analytics.definitionVersion}
              </p>
              <p>
                Missing close chronology: {response.views.unknownChronologyIds.length} trades.
                Sample exclusions are retained in each metric.
              </p>
            </details>
          </div>
          <div className="dashboard-tabs" role="tablist" aria-label="Dashboard views">
            {['performance', 'distributions', 'breakdowns'].map((value) => (
              <button
                role="tab"
                aria-selected={tab === value}
                aria-controls={`${id}-${value}`}
                id={`${id}-tab-${value}`}
                key={value}
                onClick={() => setTab(value)}
              >
                {value[0]!.toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${id}-${tab}`}
            aria-labelledby={`${id}-tab-${tab}`}
            className="dashboard-chart-grid"
          >
            {tab === 'performance' && (
              <>
                <div className="dashboard-wide">
                  <div className="dashboard-inline-controls">
                    <Button
                      variant={curve === 'equity' ? 'primary' : 'quiet'}
                      onClick={() => setCurve('equity')}
                    >
                      Account equity
                    </Button>
                    <Button
                      variant={curve === 'performance' ? 'primary' : 'quiet'}
                      onClick={() => setCurve('performance')}
                    >
                      Capital-adjusted performance
                    </Button>
                  </div>
                  <DashboardChart
                    title={
                      curve === 'equity' ? 'Equity curve' : 'Capital-adjusted monetary performance'
                    }
                    description={
                      curve === 'equity'
                        ? 'Raw account equity includes deposits and withdrawals. Sampled historical valuations; gaps remain unavailable.'
                        : 'Change in marked equity less net capital flows since the opening boundary. Money, not a percentage return.'
                    }
                    unit={money}
                    kind="line"
                    rows={response.accountView.points.map((point) => ({
                      key: point.at,
                      label: new Intl.DateTimeFormat(undefined, {
                        timeZone: workspace.timezone,
                        month: 'short',
                        day: 'numeric',
                      }).format(new Date(point.at)),
                      value: point[curve === 'equity' ? 'equity' : 'performance'].value,
                      campaignIds: [],
                      detail: `${point.at} · ${point.priceObservationIds.length} price observations · ${point.fxObservationIds.length} FX observations`,
                    }))}
                    empty={
                      response.accountView.reason ?? 'Complete historical valuations are missing.'
                    }
                  />
                </div>
                <DashboardChart
                  title="Cumulative closed P&L"
                  description="Fee-net completed-campaign outcomes, ordered by actual close time. Deposits never enter this curve."
                  unit={money}
                  kind="step"
                  rows={analytics.summary.curve.points.map((point) => ({
                    key: point.campaignId ?? 'baseline',
                    label: new Intl.DateTimeFormat(undefined, {
                      timeZone: workspace.timezone,
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(point.economicAt)),
                    value: point.cumulativePnl,
                    campaignIds: point.campaignId ? [point.campaignId] : [],
                  }))}
                  onSelect={(row) => drillInto(row.campaignIds)}
                  empty="A complete closed-outcome sequence is needed."
                />
                <DashboardChart
                  title="Drawdown"
                  description="Monetary depth below the zero-anchored closed-P&L peak. Account equity and cash-flow recovery are separate."
                  unit={money}
                  kind="step"
                  rows={analytics.summary.curve.points.map((point) => ({
                    key: point.campaignId ?? 'baseline',
                    label: new Intl.DateTimeFormat(undefined, {
                      timeZone: workspace.timezone,
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(point.economicAt)),
                    value: point.drawdown,
                    campaignIds: point.campaignId ? [point.campaignId] : [],
                  }))}
                  onSelect={(row) => drillInto(row.campaignIds)}
                />
                <DashboardCalendar
                  key={`${applied.from}:${applied.to}`}
                  days={response.views.calendar}
                  from={applied.from}
                  to={applied.to}
                  currency={money}
                  unknownCount={response.views.unknownChronologyIds.length}
                  onSelect={drillInto}
                />
                <DashboardChart
                  title="Performance over time"
                  description="Monthly fee-net completed-campaign outcomes; partial buckets never plot as complete totals."
                  unit={money}
                  rows={response.views.periods.map((row) => ({
                    key: row.key,
                    label: row.key,
                    value: row.value,
                    campaignIds: [...row.campaignIds, ...row.excludedIds],
                    detail: `${row.excludedIds.length} excluded`,
                  }))}
                  onSelect={(row) => drillInto(row.campaignIds)}
                />
              </>
            )}
            {tab === 'distributions' && (
              <>
                <DashboardChart
                  title="P&L distribution"
                  description={`${response.views.pnlDistribution.excludedIds.length} excluded; six exact equal-width outcome bins, with a single bin for identical results.`}
                  unit="trades"
                  rows={distributionRows('pnlDistribution')}
                  onSelect={(row) => drillInto(row.campaignIds)}
                />
                <DashboardChart
                  title="R distribution"
                  description={`${response.views.rDistribution.excludedIds.length} excluded; original committed risk only. R is not a portfolio return.`}
                  unit="trades"
                  rows={distributionRows('rDistribution')}
                  onSelect={(row) => drillInto(row.campaignIds)}
                />
                <DashboardChart
                  title="Win/loss distribution"
                  description="Exact fee-net sign; breakevens stay in the eligible denominator."
                  unit="trades"
                  rows={(['win', 'loss', 'breakeven'] as const).map((key) => {
                    const selected = analytics.records.filter(
                      (row) =>
                        row.status === 'completed' &&
                        row.netPnl.state === 'available' &&
                        row.netPnl.value !== null &&
                        (key === 'win'
                          ? !row.netPnl.value.startsWith('-') && /[1-9]/.test(row.netPnl.value)
                          : key === 'loss'
                            ? row.netPnl.value.startsWith('-') && /[1-9]/.test(row.netPnl.value)
                            : !/[1-9]/.test(row.netPnl.value)),
                    );
                    return {
                      key,
                      label: key,
                      value: String(selected.length),
                      campaignIds: selected.map((row) => row.id),
                    };
                  })}
                  onSelect={(row) => drillInto(row.campaignIds)}
                />
              </>
            )}
            {tab === 'breakdowns' && (
              <>
                <DashboardChart
                  title="Strategy performance"
                  description="Completed + open lifetime campaign P&L by historical strategy. Mixed/unknown groups remain explicit. Select a strategy to cross-filter."
                  unit={money}
                  rows={groupRows('strategy')}
                  onSelect={(row) => {
                    if (row.key.startsWith('value:'))
                      apply({ ...applied, strategyIds: row.key.slice(6), strategyVersionIds: '' });
                    else drillInto(row.campaignIds);
                  }}
                />
                <DashboardChart
                  title="Asset performance"
                  description="Completed + open lifetime campaign P&L. Multi-asset campaigns are counted once in a mixed group."
                  unit={money}
                  rows={groupRows('asset')}
                  onSelect={(row) => {
                    if (row.key.startsWith('value:'))
                      apply({ ...applied, assetIds: row.key.slice(6) });
                    else drillInto(row.campaignIds);
                  }}
                />
                <DashboardChart
                  title="Account allocation"
                  description="Signed cash + holdings by account; owned transfers in transit appear separately. Values are not percentages."
                  unit={money}
                  rows={response.accountView.allocation.map((row) => ({
                    key: row.id,
                    label: row.label,
                    value: row.equity.value,
                    campaignIds: [],
                    detail:
                      row.equity.state === 'available'
                        ? 'Account ledger'
                        : row.equity.reasons.join('; '),
                  }))}
                  empty={response.accountView.reason ?? 'Allocation inputs are incomplete.'}
                />
              </>
            )}
          </div>
          <Panel className="dashboard-records" id={`${id}-records`}>
            <div className="dashboard-chart-heading">
              <h2>Supporting trades</h2>
              {drill && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setDrill(null);
                    setPage(0);
                  }}
                >
                  Show all filtered trades
                </Button>
              )}
            </div>
            <div className="field">
              <label htmlFor={`${id}-search`}>Search supporting trades</label>
              <input
                id={`${id}-search`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="dashboard-table-scroll">
              <table>
                <caption>
                  {rows.length} records under the active filters · {money}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Trade</th>
                    <th scope="col">Status</th>
                    <th scope="col">Net P&L</th>
                    <th scope="col">Original R</th>
                    <th scope="col">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 25, (page + 1) * 25).map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <a href={`/journal?workspace=${workspace.id}&trade=${row.id}`}>
                          {row.title}
                        </a>
                      </th>
                      <td>{row.status}</td>
                      <td>
                        {row.netPnl.value === null ? 'Unavailable' : `${row.netPnl.value} ${money}`}
                      </td>
                      <td>{row.rMultiple.value ?? 'Unavailable'}</td>
                      <td>
                        {[...row.exclusionReasons, ...row.netPnl.reasons, ...row.rMultiple.reasons]
                          .map((reason) => reason.replaceAll('_', ' '))
                          .join('; ') || 'Complete'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dashboard-pagination">
              <Button variant="quiet" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>
                Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 25))}
              </span>
              <Button
                variant="quiet"
                disabled={(page + 1) * 25 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

export function DashboardWorkspace(props: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
}) {
  const params = useSearchParams();
  return <DashboardContent key={`${props.workspace.id}:${params.toString()}`} {...props} />;
}
