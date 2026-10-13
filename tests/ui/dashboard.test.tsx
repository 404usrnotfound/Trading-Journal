import { configure } from '@testing-library/react';
import { afterAll as restoreAfterAll } from 'vitest';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  calculateAnalytics,
  INVENTORY_CALCULATION_MANIFEST,
  type AnalyticsCampaign,
} from '@journal/domain';
import type { DashboardCatalog, WorkspaceResponse } from '@journal/contracts';
import { DashboardWorkspace } from '../../apps/web/src/components/dashboard/dashboard-workspace.js';
const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams('from=2030-01-01&to=2030-01-31'),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
  strategyVersions: [],
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
function response(filters: unknown = {}) {
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
    campaigns: [campaign],
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
      records: [
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
restoreAfterAll(() => configure({ asyncUtilTimeout: 1000 }));
beforeEach(() => {
  configure({ asyncUtilTimeout: 10_000 });
  requests = [];
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.body) return new Response(JSON.stringify(catalog), { status: 200 });
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return new Response(JSON.stringify(response(body.filters)), { status: 200 });
    }),
  );
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DashboardWorkspace workspace={workspace} workspaces={[workspace]} />
    </QueryClientProvider>,
  );
}
describe('dashboard UI generation and financial display', () => {
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
    vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 409 }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2029-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /Closed net P&L/ })).not.toBeInTheDocument();
  });
  it('provides an empty-account path without invented summary numbers or a report request', async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response(JSON.stringify({ ...catalog, accounts: [] })),
    );
    mount();
    await screen.findByRole('heading', { name: 'Your performance starts with financial records' });
    expect(screen.queryByRole('button', { name: /Closed net P&L/ })).not.toBeInTheDocument();
    expect(requests).toEqual([]);
  });
});
