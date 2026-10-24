import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as c from '@journal/contracts';
import { SuppliedValuesWorkspace } from '../../apps/web/src/components/supplied/supplied-values-workspace.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'supplied-source-proof',
}));
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const instant = '2026-10-23T23:15:00.123456+02:30';
const workspace: c.WorkspaceResponse = {
  id: id(1),
  name: 'Manual analysis',
  role: 'owner',
  isDemo: false,
  timezone: 'Pacific/Auckland',
  reportingCurrency: 'USD',
  revision: 1,
};
const currency = c.currencyResponseSchema.parse({
  id: id(2),
  namespace: 'iso:4217',
  code: 'USD',
  name: 'Dollar',
  kind: 'fiat',
  unitIdentity: 'iso:USD',
  displayScale: 2,
  settlementIncrement: '0.01',
  effectiveAt: '2025-01-01T00:00:00Z',
  revision: 1,
  archivedAt: null,
  conventionId: id(3),
  version: 1,
});
const account = c.accountResponseSchema.parse({
  id: id(4),
  name: 'Manual margin account',
  environment: 'live',
  accountType: 'margin',
  brokerId: null,
  baseCurrencyId: currency.id,
  inventoryMethod: 'fifo',
  allowShort: true,
  holdingMode: 'netted',
  effectiveAt: '2025-01-01T00:00:00Z',
  revision: 1,
  archivedAt: null,
  settingsId: id(5),
  settingsVersion: 1,
  status: 'active',
});
const instrument = c.instrumentResponseSchema.parse({
  id: id(6),
  name: 'Manual future',
  family: 'future',
  subtype: 'custom',
  economicIdentity: 'manual:future',
  quantityUnit: 'contract',
  quoteCurrencyId: currency.id,
  settlementCurrencyId: currency.id,
  multiplier: '1',
  quantityIncrement: '0.001',
  priceIncrement: '0.01',
  capability: 'manual',
  effectiveAt: '2025-01-01T00:00:00Z',
  metadata: {},
  revision: 1,
  archivedAt: null,
  versionId: id(7),
  version: 1,
});
const trade = c.tradeResponseSchema.parse({
  id: id(8),
  title: 'Manual campaign',
  classification: 'investing',
  strategyId: id(9),
  strategyVersionId: id(10),
  strategyLinkTiming: 'recorded-with-trade',
  revision: 1,
  archivedAt: null,
  status: 'closed',
  closureReviewRequired: false,
});
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function observation(
  input: c.SuppliedComponentInput,
  observationId = id(300),
): c.SuppliedComponent {
  return c.suppliedComponentResponseSchema.parse({
    id: observationId,
    kind: input.kind,
    amount: input.amount,
    currencyId: input.currencyId,
    observedAt: input.observedAt,
    source: input.source,
    sourceReference: input.sourceReference,
    quality: input.quality,
    definitionVersion:
      input.kind === 'position-equity'
        ? 'residual-position-equity/1'
        : 'lifetime-campaign-net-result/1',
    basisRevision: input.expectedSourceRevision,
    sourceRevision: '11',
    accountId: input.kind === 'position-equity' ? input.accountId : null,
    instrumentVersionId: input.kind === 'position-equity' ? input.instrumentVersionId : null,
    instrumentId: input.kind === 'position-equity' ? instrument.id : null,
    signedQuantity: input.kind === 'position-equity' ? input.signedQuantity : null,
    tradeId: input.kind === 'campaign-net-result' ? input.tradeId : null,
    supersedesId: input.supersedesId ?? null,
    sourceInput: input,
  });
}
let rows: c.SuppliedComponent[];
let writes: { body: c.SuppliedComponentInput; headers: Record<string, string> }[];
let requested: URL[];
let loseFirst: boolean;
let pagedAccounts: boolean;
function mount(role: c.WorkspaceResponse['role'] = 'owner') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SuppliedValuesWorkspace workspace={{ ...workspace, role }} workspaces={[workspace]} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  rows = [];
  writes = [];
  requested = [];
  loseFirst = false;
  pagedAccounts = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const parsed = new URL(url, 'http://localhost');
      requested.push(parsed);
      if (options?.method === 'POST') {
        const body = c.suppliedComponentCreateSchema.parse(JSON.parse(options.body as string));
        writes.push({ body, headers: options.headers as Record<string, string> });
        if (loseFirst && writes.length === 1) throw new Error('lost supplied source response');
        rows = [observation(body)];
        return response({
          id: id(300),
          commandId: writes.at(-1)!.headers['Idempotency-Key'],
          sourceRevision: '11',
        });
      }
      if (parsed.pathname.endsWith('/supplied-components/observations')) {
        c.suppliedComponentListQuerySchema.parse(Object.fromEntries(parsed.searchParams));
        return response({
          sourceRevision: rows.length ? '11' : '10',
          items: rows,
          nextCursor: null,
        });
      }
      if (parsed.pathname.includes('/instrument-versions/'))
        return response({
          ...instrument,
          versionId: parsed.pathname.split('/').at(-1),
          version: 2,
        });
      c.financialCatalogQuerySchema.parse(Object.fromEntries(parsed.searchParams));
      if (parsed.pathname.endsWith('/accounts'))
        return response(
          pagedAccounts
            ? parsed.searchParams.has('afterId') || parsed.searchParams.has('search')
              ? [{ ...account, id: id(500), name: 'Remote account' }]
              : Array.from({ length: 25 }, (_, index) => ({
                  ...account,
                  id: id(100 + index),
                  name: `Account ${index}`,
                }))
            : [account],
        );
      if (parsed.pathname.endsWith('/currencies')) return response([currency]);
      if (parsed.pathname.endsWith('/instruments')) return response([instrument]);
      if (parsed.pathname.endsWith('/trades')) return response([trade]);
      throw new Error(`Unexpected source request ${parsed.pathname}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function common() {
  await screen.findByRole('option', { name: 'USD · Dollar' });
  fireEvent.change(screen.getByLabelText('Value currency'), { target: { value: currency.id } });
  fireEvent.change(screen.getByLabelText('Supplied amount'), {
    target: { value: '-123.456789012345678901234567890123456789' },
  });
  fireEvent.change(screen.getByLabelText('Observation timestamp'), { target: { value: instant } });
  fireEvent.change(screen.getByLabelText('Source name'), {
    target: { value: 'Independent source statement' },
  });
  fireEvent.change(screen.getByLabelText('Source reference and evidence'), {
    target: { value: 'Reviewed statement line 42; cash and collateral separately reconciled.' },
  });
}
async function position() {
  await screen.findByRole('option', { name: 'Manual margin account · live' });
  fireEvent.change(screen.getByLabelText('Account'), { target: { value: account.id } });
  fireEvent.change(screen.getByLabelText('Manual instrument version'), {
    target: { value: instrument.versionId },
  });
  fireEvent.change(screen.getByLabelText('Signed holding quantity'), {
    target: { value: '-0.123456789012345678901234567890123456' },
  });
  await screen.findByText(/Selected convention: Manual future/);
  for (const label of [
    'Ledger cash excluded',
    'Collateral balances excluded',
    'Settled P&L excluded',
    'Unsettled cash claims excluded',
  ])
    fireEvent.click(screen.getByLabelText(label));
  await common();
}

describe('reviewed supplied component recording', () => {
  it('requires every exclusion and preserves exact signed source values and offset instants through confirmation', async () => {
    mount();
    await position();
    fireEvent.click(screen.getByLabelText('Unsettled cash claims excluded'));
    fireEvent.click(screen.getByRole('button', { name: 'Review supplied observation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('all required scope attestations');
    expect(
      screen.queryByRole('button', { name: 'Confirm supplied observation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Unsettled cash claims excluded'));
    fireEvent.click(screen.getByRole('button', { name: 'Review supplied observation' }));
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supplied observation' }));
    await screen.findByText(/Supplied observation recorded/);
    expect(writes[0]!.body).toMatchObject({
      kind: 'position-equity',
      amount: '-123.456789012345678901234567890123456789',
      signedQuantity: '-0.123456789012345678901234567890123456',
      observedAt: instant,
      expectedSourceRevision: '10',
      cashExcluded: true,
      collateralExcluded: true,
      settledPnlExcluded: true,
      unsettledCashExcluded: true,
    });
    expect(writes[0]!.headers['X-CSRF-Token']).toBe('supplied-source-proof');
  });
  it('records campaign net results only after complete-cost attestation, without position source fields', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Component kind'), {
      target: { value: 'campaign-net-result' },
    });
    await screen.findByRole('option', { name: 'Manual campaign · closed' });
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: trade.id } });
    await common();
    fireEvent.click(screen.getByRole('button', { name: 'Review supplied observation' }));
    await screen.findByRole('alert');
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('All relevant campaign costs are included'));
    fireEvent.click(screen.getByRole('button', { name: 'Review supplied observation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supplied observation' }));
    await screen.findByText(/Supplied observation recorded/);
    expect(writes[0]!.body).toMatchObject({
      kind: 'campaign-net-result',
      tradeId: trade.id,
      costsComplete: true,
      resultDefinition: 'lifetime-total-net',
    });
    expect(writes[0]!.body).not.toHaveProperty('accountId');
  });
  it('freezes a source with an unknown outcome and retries the identical command', async () => {
    loseFirst = true;
    mount();
    await position();
    fireEvent.click(screen.getByRole('button', { name: 'Review supplied observation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supplied observation' }));
    await screen.findByText(/response was interrupted/);
    expect(screen.getByLabelText('Supplied amount')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Return to source fields' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supplied observation' }));
    await screen.findByText(/Supplied observation recorded/);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });
  it('can select a retained historical convention by version identity', async () => {
    mount();
    await position();
    fireEvent.change(screen.getByLabelText('Instrument version ID'), { target: { value: id(70) } });
    await waitFor(() =>
      expect(requested.some((url) => url.pathname.endsWith(`/instrument-versions/${id(70)}`))).toBe(
        true,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review supplied observation' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review supplied observation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm supplied observation' }));
    await screen.findByText(/Supplied observation recorded/);
    expect(writes[0]!.body).toMatchObject({ instrumentVersionId: id(70) });
  });
  it('uses bounded searchable reference pages and preserves a selected identity across pages', async () => {
    pagedAccounts = true;
    mount();
    await screen.findByRole('option', { name: 'Account 0 · live' });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: id(100) } });
    fireEvent.click(screen.getByRole('button', { name: 'Next account' }));
    await screen.findByRole('option', { name: 'Remote account · live' });
    expect(screen.getByLabelText('Account')).toHaveValue(id(100));
    expect(
      requested.some(
        (url) =>
          url.pathname.endsWith('/accounts') &&
          url.searchParams.get('afterId') === id(124) &&
          url.searchParams.get('limit') === '25',
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Search account'), { target: { value: 'Remote' } });
    await waitFor(() =>
      expect(
        requested.some(
          (url) => url.searchParams.get('search') === 'Remote' && !url.searchParams.has('afterId'),
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review supplied observation' })).toBeEnabled(),
    );
  });
  it('allows viewers to inspect evidence while withholding mutation controls', async () => {
    rows = [
      observation(
        c.suppliedComponentCreateSchema.parse({
          kind: 'campaign-net-result',
          tradeId: trade.id,
          amount: '123',
          currencyId: currency.id,
          observedAt: instant,
          source: 'Broker evidence',
          sourceReference: '<script>literal source text</script>',
          quality: 'broker-reported',
          expectedSourceRevision: '10',
          resultDefinition: 'lifetime-total-net',
          costsComplete: true,
        }),
      ),
    ];
    mount('viewer');
    await screen.findByText('<script>literal source text</script>');
    expect(
      screen.queryByRole('button', { name: 'Review supplied observation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Correct this observation' }),
    ).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
  it('supersedes an immutable source only after reviewing a replacement and reconfirming its attestations', async () => {
    rows = [
      observation(
        c.suppliedComponentCreateSchema.parse({
          kind: 'position-equity',
          accountId: account.id,
          instrumentVersionId: instrument.versionId,
          signedQuantity: '1',
          amount: '100',
          currencyId: currency.id,
          observedAt: instant,
          source: 'Original source',
          sourceReference: 'Original statement',
          quality: 'broker-reported',
          expectedSourceRevision: '10',
          valueDefinition: 'residual-contract-equity',
          accrualTreatment: 'not-applicable',
          cashExcluded: true,
          collateralExcluded: true,
          settledPnlExcluded: true,
          unsettledCashExcluded: true,
        }),
      ),
    ];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Correct this observation' }));
    expect(screen.getByLabelText('Supplied amount')).toHaveValue('100');
    expect(screen.getByLabelText('Ledger cash excluded')).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Supplied amount'), { target: { value: '10' } });
    for (const label of [
      'Ledger cash excluded',
      'Collateral balances excluded',
      'Settled P&L excluded',
      'Unsettled cash claims excluded',
    ])
      fireEvent.click(screen.getByLabelText(label));
    await screen.findByText(/Selected convention: Manual future/);
    fireEvent.click(screen.getByRole('button', { name: 'Review supplied observation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supplied observation' }));
    await screen.findByText(/Supplied observation recorded/);
    expect(writes[0]!.body).toMatchObject({
      amount: '10',
      supersedesId: id(300),
      expectedSourceRevision: '11',
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
    });
  });
});
