import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountCorrections } from '../../apps/web/src/components/accounts/account-corrections.js';
import { AccountReturnSeries } from '../../apps/web/src/components/accounts/account-return-series.js';
import type { WorkspaceResponse } from '@journal/contracts';

vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'test-proof',
}));
vi.mock('../../apps/web/src/components/dashboard/dashboard-chart.js', () => ({
  DashboardChart: ({ title, rows }: { title: string; rows: { value: string | null }[] }) => (
    <section>
      <h3>{title}</h3>
      <p>{rows.map((point) => point.value ?? 'Unavailable').join(', ')}</p>
    </section>
  ),
}));
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const from = '2025-01-01T00:00:00Z';
const to = '2026-01-01T00:00:00Z';
const workspace: WorkspaceResponse = {
  id: id(1),
  name: 'Correction workspace',
  role: 'owner',
  isDemo: false,
  timezone: 'Europe/Madrid',
  reportingCurrency: 'USD',
  revision: 1,
};
const request = {
  accountIds: [id(2)],
  reportingCurrencyId: id(3),
  from,
  to,
  fxPolicy: { id: 'manual', maxAgeMilliseconds: 0, sourcePriority: ['manual'] },
  priceMaxAgeMilliseconds: 0,
  priceSourcePriority: ['manual'],
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
afterEach(() => vi.unstubAllGlobals());

describe('account historical correction and return UI', () => {
  it('retains the reviewed reversal command after a lost response and freezes its source fields', async () => {
    const writes: { body: unknown; key: string | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          writes.push({
            body: JSON.parse(options.body as string),
            key: (options.headers as Record<string, string>)['Idempotency-Key'],
          });
          if (writes.length === 1) throw new Error('response lost');
          return response({ id: id(4), commandId: writes[0]!.key, sourceRevision: '11' });
        }
        return response({
          sourceRevision: '10',
          items: [
            {
              id: id(4),
              sourceType: 'cash-event',
              kind: 'dividend',
              description: 'Wrong statement amount',
              economicAt: from,
              currencyId: id(3),
              amount: '100',
              reversed: writes.length > 1,
            },
          ],
          nextCursor: null,
        });
      }),
    );
    mount(<AccountCorrections workspace={workspace} />);
    await screen.findByRole('option', { name: /dividend/ });
    fireEvent.change(screen.getByLabelText('Historical accounting source'), {
      target: { value: id(4) },
    });
    fireEvent.change(screen.getByLabelText('Historical correction reason'), {
      target: { value: 'Correct statement transcription' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review historical reversal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm historical reversal' }));
    await screen.findByText(/response was interrupted/i);
    expect(screen.getByLabelText('Historical accounting source')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Return to source fields' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm historical reversal' }));
    await screen.findByText(/Historical source reversed/);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });
  it('keeps viewer access read-only', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mount(<AccountCorrections workspace={{ ...workspace, role: 'viewer' }} />);
    expect(
      screen.queryByRole('heading', { name: 'Correct historical account facts' }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('loads explicit pinned account series and labels raw NAV separately from flow-adjusted returns', async () => {
    const fetch = vi.fn(async (_url: string, _options?: RequestInit) =>
      response({
        accountIds: request.accountIds,
        reportingCurrencyId: id(3),
        sourceRevision: '42',
        from,
        to,
        method: 'exact-flow-boundaries/act-365/1',
        valuationPolicy: 'report-price-and-fx-policy',
        twr: { state: 'available', value: '0.1', reasons: [] },
        mwr: {
          state: 'unavailable',
          value: null,
          reasons: ['mwr_root_uniqueness_not_established'],
        },
        maximumDrawdown: { state: 'available', value: '0', reasons: [] },
        recoveryDurationMilliseconds: '0',
        series: [
          { at: from, nav: '100', capitalFlow: '0', unitIndex: '100', drawdown: '0', reasons: [] },
          { at: to, nav: '210', capitalFlow: '100', unitIndex: '110', drawdown: '0', reasons: [] },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    mount(
      <AccountReturnSeries
        workspaceId={workspace.id}
        timezone={workspace.timezone}
        request={{ ...request, sourceRevision: '42' }}
        currency="USD"
      />,
    );
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate account series' }));
    await screen.findByRole('heading', { name: 'Raw account NAV' });
    expect(
      screen.getByRole('heading', { name: 'Flow-adjusted account performance' }),
    ).toBeInTheDocument();
    expect(screen.getByText('100, 210')).toBeInTheDocument();
    expect(screen.getByText('100, 110')).toBeInTheDocument();
    expect(
      screen.getByText(/Unavailable: mwr_root_uniqueness_not_established/),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(body.sourceRevision).toBe('42');
    expect(body.checkpoints).toEqual([]);
  });
});
