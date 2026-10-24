import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AccountingReportRequest,
  AccountingReportResponse,
  DashboardCatalog,
  WorkspaceResponse,
} from '@journal/contracts';
import { FINANCIAL_CALCULATION_MANIFEST } from '@journal/domain';
import { AccountWorkspace } from '../../apps/web/src/components/accounts/account-workspace.js';
import {
  dashboardDatePreset,
  inclusiveDateRange,
} from '../../apps/web/src/components/dashboard/dashboard-time.js';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams('from=2030-01-01&to=2030-01-31'),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
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
const option = (last: number, label: string, parentId: string | null = null) => ({
  id: uuid(last),
  label,
  parentId,
});
const catalog: DashboardCatalog = {
  accounts: [
    { ...option(2, 'Main account', uuid(5)), environment: 'live' },
    { ...option(7, 'Second account', uuid(8)), environment: 'live' },
    { ...option(9, 'Paper account', uuid(5)), environment: 'paper' },
  ],
  brokers: [option(5, 'Broker A'), option(8, 'Broker B')],
  currencies: [{ ...option(3, 'Euro'), code: 'EUR' }],
  portfolios: [
    { ...option(4, 'Long-term portfolio'), accountIds: [uuid(2)], environment: 'live', version: 2 },
  ],
  strategies: [],
  strategyVersions: [],
  assets: [],
  tags: [],
  priceSources: ['reviewed-price', 'manual'],
  fxSources: ['reviewed-fx', 'manual'],
};
const metric = (value: string) => ({
  state: 'available' as const,
  value,
  knownSubtotal: value,
  currencyId: uuid(3),
  reasons: [],
  missingReferences: [],
});
function response(request: AccountingReportRequest): AccountingReportResponse {
  const snapshot = (asOf: string) => ({
    asOf,
    cashByCurrency: [{ currencyId: uuid(3), amount: '1000', reasons: [] }],
    cash: metric('1000'),
    holdings: metric('100'),
    transit: metric('0'),
    equity: metric('1100.000000001'),
    netLiquidationValue: metric('1100'),
    unrealizedGrossByCurrency: [],
  });
  return {
    context: {
      accountIds: request.accountIds ?? [uuid(2)],
      ...(request.portfolioVersionId ? { portfolioVersionId: request.portfolioVersionId } : {}),
      portfolioId: request.portfolioVersionId ? uuid(6) : null,
      portfolioVersion: request.portfolioVersionId ? 2 : null,
      environment: request.accountIds?.includes(uuid(9)) ? 'paper' : 'live',
      reportingCurrencyId: uuid(3),
      sourceRevision: '10',
      from: request.from,
      to: request.to,
      fxPolicy: request.fxPolicy,
      pricePolicy: {
        maxAgeMilliseconds: request.priceMaxAgeMilliseconds,
        sourcePriority: request.priceSourcePriority,
      },
      manifest: FINANCIAL_CALCULATION_MANIFEST,
      accountingVersion: 'portfolio-accounting-v1',
    },
    opening: snapshot(request.from),
    closing: snapshot(request.to),
    breakdown: {
      realizedTradingPnl: metric('40'),
      unrealizedTradingPnlChange: metric('10'),
      tradingPnl: metric('50'),
      holdingFx: metric('0'),
      cashFx: metric('0'),
      transitFx: metric('0'),
      conversionEffects: metric('0'),
      income: metric('3'),
      fees: metric('-2'),
      expenses: metric('-1'),
      taxes: metric('-1'),
      externalCashFlows: metric('1000'),
      boundaryTransfers: metric('0'),
      openingAdjustments: metric('0'),
    },
    native: { realizedGross: [], unrealizedGross: [] },
    reconciliation: {
      navChange: metric('49'),
      netCapitalFlows: metric('0'),
      performance: metric('49'),
      explainedChange: metric('49'),
      variance: metric('0'),
      roundingResidual: metric('0'),
    },
    dependencies: { fx: [], prices: [], sourceIds: [] },
  };
}
let requests: AccountingReportRequest[];
let currentCatalog: DashboardCatalog;
let changeReport: ((value: AccountingReportResponse) => unknown) | null;
let failReport: number | null;
let failCatalog: number | null;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountWorkspace workspace={workspace} workspaces={[workspace]} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  requests = [];
  currentCatalog = catalog;
  changeReport = null;
  failReport = null;
  failCatalog = null;
  navigation.params = new URLSearchParams('from=2030-01-01&to=2030-01-31');
  navigation.replace.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/supplied-components/observations?'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ sourceRevision: '0', items: [], nextCursor: null }),
        };
      if (url.endsWith('/catalog'))
        return {
          ok: failCatalog === null,
          status: failCatalog ?? 200,
          json: async () => currentCatalog,
        };
      const request = JSON.parse(String(init.body)) as AccountingReportRequest;
      requests.push(request);
      const result = response(request);
      return {
        ok: failReport === null,
        status: failReport ?? 200,
        json: async () => (changeReport ? changeReport(result) : result),
      };
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Account performance workspace', () => {
  it('carries explicit supplied source selections from the report URL into the authoritative request', async () => {
    navigation.params.set('suppliedPositionIds', uuid(99));
    mount();
    await screen.findByText('1100.000000001 EUR');
    expect(requests[0]?.suppliedPositionIds).toEqual([uuid(99)]);
  });
  it('shows exact report values and separates deposits, income and costs from trading performance for viewers', async () => {
    mount();
    expect(await screen.findByText('1100.000000001 EUR')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Trading P&L' })).getByText('50 EUR'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'External cash flows' })).getByText('1000 EUR'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Income' })).getByText('3 EUR'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Fees' })).getByText('-2 EUR'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Taxes' })).getByText('-1 EUR'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save|delete|record/i })).not.toBeInTheDocument();
    expect(requests[0]?.accountIds).toEqual([uuid(2), uuid(7)]);
    expect(requests[0]?.portfolioVersionId).toBeUndefined();
    expect(screen.getByText(/Deposits are capital/)).toBeInTheDocument();
  });

  it('keeps known subtotals distinct from unavailable financial totals and explains missing evidence', async () => {
    changeReport = (value) => ({
      ...value,
      closing: {
        ...value.closing,
        equity: {
          ...metric('42'),
          state: 'partial',
          value: null,
          reasons: ['missing_price'],
          missingReferences: ['instrument-review'],
        },
      },
      reconciliation: {
        ...value.reconciliation,
        variance: {
          ...metric('0'),
          state: 'unavailable',
          value: null,
          reasons: ['incomplete_nav'],
          missingReferences: [],
        },
      },
    });
    mount();
    const equity = await screen.findByRole('group', { name: 'Equity' });
    expect(within(equity).getByText('Partial — total unavailable')).toBeInTheDocument();
    expect(
      within(equity).getByText(/Known subtotal: 42 EUR. This is not the complete value./),
    ).toBeInTheDocument();
    expect(within(equity).getByText(/Missing evidence: missing price/)).toBeInTheDocument();
    const variance = screen.getByRole('group', { name: 'Reconciliation variance' });
    expect(within(variance).getByText('Unavailable')).toBeInTheDocument();
    expect(within(variance).queryByText('0 EUR')).not.toBeInTheDocument();
    expect(
      within(variance).getByText(/incomplete zero known subtotal does not prove reconciliation/),
    ).toBeInTheDocument();
  });

  it('applies dates, accounts and evidence policy together and saves the exact URL scope', async () => {
    mount();
    await screen.findByText('1100.000000001 EUR');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2030-02-01' } });
    fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2030-02-04' } });
    fireEvent.change(screen.getByLabelText('Maximum observation age (milliseconds)'), {
      target: { value: '3600000' },
    });
    fireEvent.change(screen.getByLabelText('Price source priority'), {
      target: { value: 'manual\nreviewed-price' },
    });
    expect(requests).toHaveLength(1);
    expect(screen.getByText(/Settings changed. Apply/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject({
      ...inclusiveDateRange('2030-02-01', '2030-02-04', workspace.timezone),
      accountIds: [uuid(2), uuid(7)],
      priceMaxAgeMilliseconds: 3600000,
      priceSourcePriority: ['manual', 'reviewed-price'],
    });
    const url = String(navigation.replace.mock.calls[0]?.[0]);
    expect(new URL(url, 'https://journal.test').searchParams.get('accountIds')).toBe(
      `${uuid(2)},${uuid(7)}`,
    );
    expect(new URL(url, 'https://journal.test').searchParams.get('portfolioVersionId')).toBeNull();
  });
  it('preserves an observation-source name containing a comma across Apply and URL reload', async () => {
    const sources = ['Broker, corrected', 'manual'];
    currentCatalog = { ...catalog, priceSources: sources };
    const first = mount();
    await screen.findByText('1100.000000001 EUR');
    expect(requests[0]?.priceSourcePriority).toEqual(sources);
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    const url = String(navigation.replace.mock.calls[0]?.[0]);
    const parameters = new URL(url, 'https://journal.test').searchParams;
    expect(JSON.parse(parameters.get('priceSources')!)).toEqual(sources);
    first.unmount();
    requests = [];
    navigation.params = parameters;
    mount();
    await screen.findByText('1100.000000001 EUR');
    expect(requests[0]?.priceSourcePriority).toEqual(sources);
  });

  it('rejects invalid URL accounts instead of silently widening the report and lets the user correct the selection', async () => {
    navigation.params.set('accountIds', uuid(999));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No report was requested for the invalid account selection',
    );
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Select all live accounts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    await screen.findByText('1100.000000001 EUR');
    expect(requests[0]?.accountIds).toEqual([uuid(2), uuid(7)]);
  });

  it('refuses combined account and portfolio URL scopes until an explicit selection resolves the conflict', async () => {
    navigation.params.set('accountIds', uuid(2));
    navigation.params.set('portfolioVersionId', uuid(4));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose accounts or an immutable portfolio version',
    );
    expect(requests).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Portfolio version'), { target: { value: uuid(4) } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    await screen.findByText('1100.000000001 EUR');
    expect(requests[0]?.portfolioVersionId).toBe(uuid(4));
    expect(requests[0]?.accountIds).toBeUndefined();
    expect(screen.getByText(/Portfolio v2/)).toBeInTheDocument();
  });

  it('keeps live and paper scopes separate and waits for Apply before replacing the report', async () => {
    mount();
    await screen.findByText('1100.000000001 EUR');
    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'paper' } });
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.accountIds).toEqual([uuid(9)]);
    expect(await screen.findByText(/Paper · 1 account/)).toBeInTheDocument();
  });

  it('rejects unavailable portfolio and currency identities from URL without requesting a report', async () => {
    navigation.params.set('portfolioVersionId', uuid(999));
    navigation.params.set('currency', uuid(998));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('portfolio version is unavailable');
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Accounts', { selector: 'input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an available reporting currency');
    expect(requests).toHaveLength(0);
  });

  it('does not silently replace an empty URL scope or an empty source policy', async () => {
    navigation.params.set('accountIds', '');
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid account selection');
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Select all live accounts' }));
    fireEvent.change(screen.getByLabelText('Price source priority'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    expect(requests).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(/Too small|at least/i);
  });

  it('browses a late account and requires explicit scope instead of reporting a truncated account page', async () => {
    currentCatalog = {
      ...catalog,
      accountChoicesComplete: false,
      accounts: Array.from({ length: 200 }, (_, index) => ({
        ...option(1000 + index, `Account ${index}`),
        environment: 'live' as const,
      })),
      pageCursors: { accounts: uuid(1199) },
    };
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/catalog?resource=accounts'))
          return Response.json({
            ...catalog,
            accounts: [{ ...option(1501, 'Late account 501'), environment: 'live' }],
            accountChoicesComplete: false,
            pageCursors: { accounts: null },
          });
        return originalFetch(url, init);
      }),
    );
    mount();
    expect(
      await screen.findByText(/This reference page does not contain every account/),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    fireEvent.click(
      screen.getByText('Search and browse all filter choices', { selector: 'summary' }),
    );
    const browse = screen.getByRole('group', { name: 'Browse accounts' });
    fireEvent.change(within(browse).getByLabelText('Search accounts'), {
      target: { value: 'Late account 501' },
    });
    fireEvent.click(within(browse).getByRole('button', { name: 'Search accounts' }));
    await screen.findByRole('option', { name: 'Late account 501' });
    const select = screen.getByRole('listbox', { name: 'Accounts' }) as HTMLSelectElement;
    for (const option of select.options) option.selected = option.value === uuid(1501);
    fireEvent.change(select);
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    await screen.findByText('1100.000000001 EUR');
    expect(requests.at(-1)?.accountIds).toEqual([uuid(1501)]);
    expect(requests.at(-1)?.detail).toBe('summary');
  });
  it('offers a setup path rather than a made-up zero account report', async () => {
    currentCatalog = { ...catalog, accounts: [], portfolios: [] };
    mount();
    expect(
      await screen.findByRole('heading', { name: 'No live accounts yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up accounts' })).toHaveAttribute(
      'href',
      `/record?workspace=${workspace.id}#catalog-setup`,
    );
    expect(requests).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'Equity' })).not.toBeInTheDocument();
  });

  it('recovers from a report failure without discarding the selected scope', async () => {
    navigation.params.set('accountIds', uuid(7));
    failReport = 409;
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose fewer accounts');
    failReport = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry account report' }));
    await screen.findByText('1100.000000001 EUR');
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.accountIds?.join(',') === uuid(7))).toBe(true);
  });

  it('shows authenticated-session feedback and a retry path for catalog failure', async () => {
    failCatalog = 401;
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session ended. Sign in again');
    failCatalog = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading accounts' }));
    await screen.findByText('1100.000000001 EUR');
  });

  it('rejects malformed financial responses rather than displaying a fabricated complete total', async () => {
    changeReport = (value) => ({
      ...value,
      closing: { ...value.closing, equity: { ...metric('1'), state: 'available', value: null } },
    });
    mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Equity' })).not.toBeInTheDocument();
  });

  it('uses workspace-local weekly boundaries and keeps presets as drafts until applied', async () => {
    mount();
    await screen.findByText('1100.000000001 EUR');
    const lastWeek = dashboardDatePreset('last-week', workspace.timezone);
    fireEvent.click(screen.getByRole('button', { name: 'Last week' }));
    expect(screen.getByLabelText('From')).toHaveValue(lastWeek.from);
    expect(screen.getByLabelText('Through')).toHaveValue(lastWeek.to);
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply report settings' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject(
      inclusiveDateRange(lastWeek.from, lastWeek.to, workspace.timezone),
    );
  });
});
