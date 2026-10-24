import { configure } from '@testing-library/react';
import { writeFile } from 'node:fs/promises';
import { afterAll as restoreAfterAll } from 'vitest';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  calculateAnalytics,
  INVENTORY_CALCULATION_MANIFEST,
  type AnalyticsCampaign,
} from '@journal/domain';
import type { DashboardCatalog, WorkspaceResponse } from '@journal/contracts';
import { DashboardWorkspace } from '../../apps/web/src/components/dashboard/dashboard-workspace.js';
import { DashboardChart } from '../../apps/web/src/components/dashboard/dashboard-chart.js';
import {
  dashboardDatePreset,
  inclusiveDateRange,
} from '../../apps/web/src/components/dashboard/dashboard-time.js';
const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    replace,
    router: { replace },
    params: new URLSearchParams('from=2030-01-01&to=2030-01-31'),
  };
});
const chartCensus = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  useSearchParams: () => navigation.params,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => {
    chartCensus.render();
    return <div>{children}</div>;
  },
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Bar: () => null,
  Line: () => null,
}));
const uuid = (last: number) => `00000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
const workspace: WorkspaceResponse = {
  id: uuid(1),
  name: 'Test workspace',
  role: 'viewer',
  isDemo: false,
  timezone: 'Europe/Madrid',
  reportingCurrency: 'EUR',
  revision: 1,
};
const option = (id: string, label: string, parentId: string | null = null) => ({
  id,
  label,
  parentId,
});
const catalog: DashboardCatalog = {
  accounts: [{ ...option(uuid(2), 'Main account', uuid(5)), environment: 'live' }],
  brokers: [option(uuid(5), 'Broker')],
  currencies: [{ ...option(uuid(3), 'Euro'), code: 'EUR' }],
  portfolios: [],
  strategies: [option(uuid(4), 'Playbook')],
  strategyVersions: [option(uuid(7), 'Playbook v1', uuid(4))],
  assets: [],
  tags: ['reviewed'],
  fxSources: [],
  priceSources: [],
};
const metric = (value: string) => ({
  state: 'available' as const,
  value,
  reasons: [],
  missingReferences: [],
});
function response(filters: unknown = {}, empty = false) {
  const campaign: AnalyticsCampaign = {
    id: uuid(6),
    status: 'completed',
    entryAt: '2030-01-02T12:00:00Z',
    closedAt: '2030-01-03T12:00:00Z',
    grossPnl: metric('10'),
    netPnl: metric('10'),
    realizedPnl: metric('10'),
    unrealizedPnl: metric('0'),
    fees: metric('0'),
    rMultiple: metric('1'),
    dimensions: { strategy: [{ key: uuid(4), label: 'Playbook' }] },
    exclusionReasons: [],
    originalPlanId: null,
  };
  const result = calculateAnalytics({
    campaigns: empty ? [] : [campaign],
    reportingCurrencyId: uuid(3),
    from: '2030-01-01T00:00:00Z',
    asOf: '2030-02-01T00:00:00Z',
    groupBy: ['strategy'],
  });
  return {
    filters: {
      accountIds: [],
      brokerIds: [],
      strategyIds: [],
      strategyVersionIds: [],
      assetIds: [],
      assetClasses: [],
      tags: [],
      ...(filters as object),
    },
    analytics: {
      ...result,
      context: {
        accountIds: [uuid(2)],
        reportingCurrencyId: uuid(3),
        from: '2030-01-01T00:00:00Z',
        to: '2030-02-01T00:00:00Z',
        sourceRevision: '10',
        recordedAt: '2026-10-13T12:00:00Z',
        metadataAsOf: '2026-10-13T12:00:00Z',
        timezone: 'Europe/Madrid',
        workspaceRevision: 1,
        environment: 'live',
        fxPolicy: { id: 'test', maxAgeMilliseconds: 0, sourcePriority: ['manual'] },
        priceMaxAgeMilliseconds: 0,
        priceSourcePriority: ['manual'],
        population: 'campaign-attribution',
        moneyPopulation: 'selected-completed-and-open-lifetime-asof',
        manifest: INVENTORY_CALCULATION_MANIFEST,
      },
      records: empty
        ? []
        : [
            {
              ...campaign,
              title: 'Recorded trade',
              provenance: {
                originalPlanId: null,
                originalPlanHash: null,
                metadataPlanId: null,
                metadataPlanHash: null,
                metadataPlanSource: null,
                journalRevisionId: null,
                journalRevisionHash: null,
                strategyId: uuid(4),
                strategyVersionId: null,
                strategyVersionHash: null,
                strategyLinkTiming: null,
                closureId: null,
                legIds: [],
                effectiveExecutionIds: [],
                allocationSetIds: [],
                feeIds: [],
                instrumentVersionIds: [],
                markIds: [],
                fxObservationIds: [],
              },
            },
          ],
    },
    views: {
      calendar: [
        {
          key: '2030-01-03',
          state: 'available',
          value: '10',
          knownSubtotal: '10',
          campaignIds: [uuid(6)],
          excludedIds: [],
        },
      ],
      periods: [],
      pnlDistribution: { bins: [], excludedIds: [] },
      rDistribution: { bins: [], excludedIds: [] },
      unknownChronologyIds: [],
    },
    accountView: {
      state: 'unavailable',
      reason: 'Account equity is not attributed to trade filters.',
      points: [],
      allocation: [],
    },
  };
}
let requests: Record<string, unknown>[] = [];
function auxiliaryRead(url: unknown) {
  if (String(url).includes('/display-views/'))
    return new Response(
      JSON.stringify({
        revision: 0,
        settings: {
          screen: 'dashboard',
          columns: ['title', 'status', 'netPnl', 'originalR', 'coverage'],
          views: [],
        },
      }),
    );
  if (String(url).includes('/supplied-components/observations?'))
    return new Response(JSON.stringify({ sourceRevision: '0', items: [], nextCursor: null }));
  return null;
}
restoreAfterAll(() => configure({ asyncUtilTimeout: 1000 }));
beforeEach(() => {
  configure({ asyncUtilTimeout: 10_000 });
  requests = [];
  vi.clearAllMocks();
  navigation.params = new URLSearchParams('from=2030-01-01&to=2030-01-31');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const auxiliary = auxiliaryRead(_url);
      if (auxiliary) return auxiliary;
      if (!init?.body) return new Response(JSON.stringify(catalog), { status: 200 });
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return new Response(JSON.stringify(response(body.filters)), { status: 200 });
    }),
  );
});
afterEach(() => vi.useRealTimers());
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DashboardWorkspace workspace={workspace} workspaces={[workspace]} />
    </QueryClientProvider>,
  );
}
describe('dashboard UI generation and financial display', () => {
  it('carries reviewed supplied lifetime results from its URL into the single dashboard report request', async () => {
    navigation.params.set('suppliedCampaignResultIds', uuid(99));
    mount();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0]?.suppliedCampaignResultIds).toEqual([uuid(99)]);
  });
  it('measures chart subtree renders during local search and draft changes without changing the financial generation', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const auxiliary = auxiliaryRead(_url);
      if (auxiliary) return auxiliary;
      if (!init?.body) return new Response(JSON.stringify(catalog));
      const body = JSON.parse(String(init.body));
      requests.push(body);
      const fixture = response(body.filters);
      return new Response(
        JSON.stringify({
          ...fixture,
          views: {
            ...fixture.views,
            periods: [
              {
                key: '2030-01',
                state: 'available',
                value: '10',
                knownSubtotal: '10',
                campaignIds: [uuid(6)],
                excludedIds: [],
              },
            ],
          },
        }),
      );
    });
    mount();
    await screen.findByRole('button', { name: /Closed net P&L/ });
    const initial = chartCensus.render.mock.calls.length;
    expect(initial).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Search supporting trades'), {
      target: { value: 'Recorded' },
    });
    const afterSearch = chartCensus.render.mock.calls.length;
    fireEvent.change(screen.getByLabelText('From', { exact: true }), {
      target: { value: '2030-01-02' },
    });
    const afterDraft = chartCensus.render.mock.calls.length;
    const census = {
      environment: 'React UI test with mocked Recharts; invocation counts, not browser durations',
      initial,
      searchChartSubtreeRenders: afterSearch - initial,
      draftChartSubtreeRenders: afterDraft - afterSearch,
      reportRequests: requests.length,
    };
    expect(requests).toHaveLength(1);
    expect(census.searchChartSubtreeRenders).toBe(0);
    expect(census.draftChartSubtreeRenders).toBe(0);
    expect(screen.getByRole('button', { name: /Closed net P&L/ })).toHaveTextContent('10 EUR');
    expect(screen.getByRole('link', { name: 'Recorded trade' })).toBeVisible();
    if (process.env.PERFORMANCE_UI_CENSUS_OUTPUT)
      await writeFile(
        process.env.PERFORMANCE_UI_CENSUS_OUTPUT,
        `${JSON.stringify(census, null, 2)}\n`,
      );
  });
  it('mounts exact chart values on expansion, supports drill-down, and preserves them when reopened', async () => {
    const select = vi.fn();
    const props = {
      title: 'Exact sample',
      description: 'Decimal strings remain authoritative.',
      unit: 'EUR',
      onSelect: select,
      rows: [
        { key: 'first', label: 'Known', value: '12345678901234567890.125', campaignIds: [uuid(6)] },
        { key: 'second', label: 'Missing', value: null, campaignIds: [] },
      ],
    };
    const view = render(<DashboardChart {...props} />);
    const summary = screen.getByText('View data · 2 observations');
    expect(screen.queryByRole('table', { hidden: true })).not.toBeInTheDocument();
    fireEvent.click(summary);
    await screen.findByRole('table');
    expect(screen.getByText('12345678901234567890.125 EUR')).toBeVisible();
    expect(screen.getByText('Unavailable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 trades' }));
    expect(select).toHaveBeenCalledWith(props.rows[0]);
    fireEvent.click(summary);
    await waitFor(() =>
      expect(screen.queryByRole('table', { hidden: true })).not.toBeInTheDocument(),
    );
    view.rerender(
      <DashboardChart
        {...props}
        rows={[{ ...props.rows[0]!, value: '12345678901234567890.126' }, props.rows[1]!]}
      />,
    );
    fireEvent.click(summary);
    await screen.findByRole('table');
    expect(screen.getByText('12345678901234567890.126 EUR')).toBeVisible();
    expect(screen.queryByText('12345678901234567890.125 EUR')).not.toBeInTheDocument();
  });
  it('preserves a multi-account report link as individual IDs across queries, filters and account review', async () => {
    navigation.params.set('accountIds', `${uuid(2)},${uuid(8)}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const auxiliary = auxiliaryRead(_url);
        if (auxiliary) return auxiliary;
        if (!init?.body)
          return new Response(
            JSON.stringify({
              ...catalog,
              accounts: [
                ...catalog.accounts,
                { ...option(uuid(8), 'Second account'), environment: 'live' },
              ],
            }),
            { status: 200 },
          );
        const body = JSON.parse(String(init.body));
        requests.push(body);
        return new Response(JSON.stringify(response(body.filters)), { status: 200 });
      }),
    );
    mount();
    await screen.findByText('Closed net P&L', { exact: true });
    expect(requests[0]?.filters).toMatchObject({ accountIds: [uuid(2), uuid(8)] });
    expect(
      screen.getByRole('button', { name: /Account: Main account, Second account/ }),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Review account performance' });
    const linked = new URL(link.getAttribute('href')!, 'https://journal.test');
    expect(linked.searchParams.get('accountIds')).toBe(`${uuid(2)},${uuid(8)}`);
    expect(linked.searchParams.has('portfolioVersionId')).toBe(false);
  });
  it('searches assets outside the first catalog page without disabling a small dashboard', async () => {
    const firstPage: DashboardCatalog = {
      ...catalog,
      assets: Array.from({ length: 200 }, (_, index) => ({
        ...option(uuid(1000 + index), `Asset ${index}`),
        assetClass: 'stock',
      })),
      pageCursors: { assets: uuid(1199), strategyVersions: uuid(2200) },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/catalog?resource=assets'))
          return Response.json({
            ...catalog,
            assets: [{ ...option(uuid(1501), 'Late asset 501'), assetClass: 'stock' }],
            pageCursors: { assets: null },
          });
        if (!init?.body) return Response.json(firstPage);
        const body = JSON.parse(String(init.body));
        requests.push(body);
        return Response.json(response(body.filters));
      }),
    );
    mount();
    await screen.findByText('Closed net P&L', { exact: true });
    fireEvent.click(
      screen.getByText('Search and browse all filter choices', { selector: 'summary' }),
    );
    const browse = screen.getByRole('group', { name: 'Browse assets' });
    fireEvent.change(within(browse).getByLabelText('Search assets'), {
      target: { value: 'Late asset 501' },
    });
    fireEvent.click(within(browse).getByRole('button', { name: 'Search assets' }));
    await screen.findByRole('option', { name: 'Late asset 501' });
    fireEvent.change(screen.getByLabelText('Asset', { exact: true }), {
      target: { value: uuid(1501) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(requests.at(-1)?.filters).toMatchObject({ assetIds: [uuid(1501)] }));
    expect(await screen.findByText('Closed net P&L', { exact: true })).toBeInTheDocument();
  });
  it('shows tested metrics with samples, explicit infinity and useful missing-equity explanation', async () => {
    mount();
    await screen.findByText('Closed net P&L', { exact: true });
    expect(screen.getByRole('button', { name: /Profit factor/ })).toHaveTextContent('∞');
    expect(screen.getByText('Account equity is not attributed to trade filters.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Recorded trade' })).toHaveAttribute(
      'href',
      `/journal?workspace=${uuid(1)}&trade=${uuid(6)}`,
    );
    expect(requests).toHaveLength(1);
  });
  it('sends all global filters as one server query and exposes them in the URL and active chips', async () => {
    mount();
    await screen.findByText('Closed net P&L', { exact: true });
    fireEvent.click(screen.getByText('Portfolio, trade and pricing filters'));
    fireEvent.change(screen.getByLabelText('Strategy', { exact: true }), {
      target: { value: uuid(4) },
    });
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(requests.at(-1)?.filters).toMatchObject({
        strategyIds: [uuid(4)],
        tags: ['reviewed'],
      }),
    );
    expect(navigation.replace.mock.calls.at(-1)?.[0]).toContain(`strategyIds=${uuid(4)}`);
    expect(screen.getByRole('button', { name: /Tag: reviewed/ })).toBeVisible();
  });
  it('does not show cached metrics under a failed new filter generation', async () => {
    mount();
    await screen.findByText('Closed net P&L', { exact: true });
    vi.mocked(fetch).mockImplementation(
      async (url) => auxiliaryRead(url) ?? new Response('{}', { status: 409 }),
    );
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2029-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /Closed net P&L/ })).not.toBeInTheDocument();
  });
  it('provides an empty-account path without invented summary numbers or a report request', async () => {
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        auxiliaryRead(url) ?? new Response(JSON.stringify({ ...catalog, accounts: [] })),
    );
    mount();
    await screen.findByRole('heading', { name: 'Your performance starts with financial records' });
    expect(screen.queryByRole('button', { name: /Closed net P&L/ })).not.toBeInTheDocument();
    expect(requests).toEqual([]);
    expect(screen.getByRole('link', { name: 'Set up and record a trade' })).toHaveAttribute(
      'href',
      `/record?workspace=${workspace.id}`,
    );
    expect(screen.getByRole('link', { name: 'Import a CSV' })).toHaveAttribute(
      'href',
      `/imports?workspace=${workspace.id}`,
    );
  });
  it('honors strategy and immutable-version deep links before the first report request', async () => {
    navigation.params.set('strategy', uuid(4));
    navigation.params.set('strategyVersionId', uuid(7));
    navigation.params.set('view', 'breakdowns');
    mount();
    await screen.findByRole('button', { name: /Closed net P&L/ });
    expect(requests[0]?.filters).toMatchObject({
      strategyIds: [uuid(4)],
      strategyVersionIds: [uuid(7)],
    });
    expect(screen.getByLabelText('Strategy', { exact: true })).toHaveValue(uuid(4));
    expect(screen.getByLabelText('Strategy version')).toHaveValue(uuid(7));
    expect(screen.getByRole('tab', { name: 'Breakdowns' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
  it('leaves the active scope unchanged until Apply, then updates the whole report', async () => {
    mount();
    await screen.findByRole('button', { name: /Closed net P&L/ });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2030-01-02' } });
    expect(screen.getByText(/Filters changed. Apply filters/)).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Closed net P&L/ })).toHaveTextContent('10 EUR');
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.from).toBe('2030-01-01T22:59:59.999999Z');
    await screen.findByText('Metrics and charts use the active filters below.');
  });
  it('rejects reversed dates inline without issuing a report or hiding the prior active scope', async () => {
    mount();
    await screen.findByRole('button', { name: /Closed net P&L/ });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2030-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'From must be on or before Through.',
    );
    expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toHaveLength(1);
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Closed net P&L/ })).toBeVisible();
  });
  it('applies weekly calendar presets in one click with exact timezone boundaries and retained strategy scope', async () => {
    vi.setSystemTime(new Date('2026-10-25T23:30:00Z')); // Monday in Madrid, Sunday in UTC.
    navigation.params.set('strategyIds', uuid(4));
    mount();
    await screen.findByRole('button', { name: /Closed net P&L/ });
    fireEvent.click(screen.getByRole('button', { name: 'Last week' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-19');
    expect(screen.getByLabelText('Through')).toHaveValue('2026-10-25');
    expect(requests[1]).toMatchObject({
      from: '2026-10-18T21:59:59.999999Z',
      to: '2026-10-25T22:59:59.999999Z',
      filters: { strategyIds: [uuid(4)] },
    });
    expect(screen.getByRole('button', { name: 'Last week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('uses Monday calendar weeks across year boundaries without assuming the report days are 24 hours', () => {
    vi.setSystemTime(new Date('2027-01-03T23:30:00Z'));
    expect(dashboardDatePreset('today', 'Europe/Madrid')).toEqual({
      from: '2027-01-04',
      to: '2027-01-04',
    });
    expect(dashboardDatePreset('this-week', 'Europe/Madrid')).toEqual({
      from: '2027-01-04',
      to: '2027-01-04',
    });
    expect(dashboardDatePreset('last-week', 'Europe/Madrid')).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    });
    expect(inclusiveDateRange('2026-10-25', '2026-10-25', 'Europe/Madrid')).toEqual({
      from: '2026-10-24T21:59:59.999999Z',
      to: '2026-10-25T22:59:59.999999Z',
    });
  });
  it('provides keyboard tab navigation and preserves the existing strategy query in the view URL', async () => {
    navigation.params.set('strategyIds', uuid(4));
    mount();
    await screen.findByRole('button', { name: /Closed net P&L/ });
    const performance = screen.getByRole('tab', { name: 'Performance' });
    performance.focus();
    fireEvent.keyDown(performance, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Distributions' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Distributions' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(navigation.replace.mock.calls.at(-1)?.[0]).toContain(`strategyIds=${uuid(4)}`);
    expect(navigation.replace.mock.calls.at(-1)?.[0]).toContain('view=distributions');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Distributions' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Breakdowns' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0');
    expect(requests).toHaveLength(1);
  });
  it('offers contextual definitions and links account economics without applying trade-specific filters there', async () => {
    navigation.params.set('strategyIds', uuid(4));
    navigation.params.set('brokerIds', uuid(5));
    navigation.params.set('age', '604800000');
    mount();
    await screen.findByRole('button', { name: /Closed net P&L/ });
    fireEvent.click(screen.getByText('About Average R'));
    expect(screen.getByText(/Missing or retrospective risk is excluded/)).toBeVisible();
    const link = new URL(
      screen.getByRole('link', { name: 'Review account performance' }).getAttribute('href')!,
      'http://local.test',
    );
    expect(link.pathname).toBe('/accounts');
    expect(Object.fromEntries(link.searchParams)).toMatchObject({
      workspace: workspace.id,
      accountIds: uuid(2),
      from: '2030-01-01',
      to: '2030-01-31',
      age: '604800000',
      environment: 'live',
      currency: uuid(3),
    });
    expect(link.searchParams.has('strategyIds')).toBe(false);
    fireEvent.click(screen.getByText('Weekly review guide'));
    expect(screen.getByText(/Record lessons in the trade journal/)).toBeVisible();
  });
  it('shows a meaningful empty-period and supporting-trade state without inventing metrics', async () => {
    vi.mocked(fetch).mockImplementation(
      async (_url, init) =>
        auxiliaryRead(_url) ??
        new Response(JSON.stringify(init?.body ? response({}, true) : catalog)),
    );
    mount();
    await screen.findByRole('heading', { name: 'No completed trades in this period' });
    expect(screen.getByRole('button', { name: /Win rate/ })).toHaveTextContent('Unavailable');
    expect(screen.getByText(/No trades match the active filters/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Review open trades' })).toHaveAttribute(
      'href',
      `/journal?workspace=${workspace.id}`,
    );
  });
  it('shows loading feedback while an applied generation waits, then displays its tested metrics', async () => {
    let finish: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const auxiliary = auxiliaryRead(_url);
      if (auxiliary) return auxiliary;
      return init?.body
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : new Response(JSON.stringify(catalog));
    });
    mount();
    await screen.findByText('Updating all metrics and charts for the active filters…');
    expect(screen.queryByRole('button', { name: /Closed net P&L/ })).not.toBeInTheDocument();
    finish!(new Response(JSON.stringify(response())));
    await screen.findByRole('button', { name: /Closed net P&L/ });
    expect(screen.queryByText('Loading a consistent dashboard…')).not.toBeInTheDocument();
  });
  it('retries the catalog when setup choices fail rather than requesting a report with no currency', async () => {
    let catalogAttempts = 0,
      reportAttempts = 0;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const auxiliary = auxiliaryRead(_url);
      if (auxiliary) return auxiliary;
      if (init?.body) {
        reportAttempts++;
        return new Response(JSON.stringify(response()));
      }
      catalogAttempts++;
      return catalogAttempts === 1
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify(catalog));
    });
    mount();
    await screen.findByRole('alert');
    expect(reportAttempts).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: /Closed net P&L/ });
    expect(catalogAttempts).toBe(2);
    expect(reportAttempts).toBe(1);
  });
});
