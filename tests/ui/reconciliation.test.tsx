import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as c from '@journal/contracts';
import { ReconciliationWorkspace } from '../../apps/web/src/components/reconciliation/reconciliation-workspace.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'independent-statement-proof',
}));
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const instant = '2026-10-22T00:30:00Z';
const workspace: c.WorkspaceResponse = {
  id: id(1),
  name: 'Independent review',
  role: 'owner',
  isDemo: false,
  timezone: 'Europe/Madrid',
  reportingCurrency: 'USD',
  revision: 1,
};
const currency = c.currencyResponseSchema.parse({
  id: id(2),
  namespace: 'iso:4217',
  code: 'USD',
  kind: 'fiat',
  unitIdentity: 'iso:USD',
  name: 'Dollar',
  displayScale: 2,
  settlementIncrement: '0.01',
  effectiveAt: instant,
  revision: 1,
  archivedAt: null,
  conventionId: id(3),
  version: 1,
});
const account = c.accountResponseSchema.parse({
  id: id(4),
  name: 'Statement account',
  environment: 'live',
  accountType: 'cash',
  brokerId: null,
  baseCurrencyId: currency.id,
  inventoryMethod: 'fifo',
  allowShort: false,
  holdingMode: 'netted',
  effectiveAt: instant,
  revision: 1,
  archivedAt: null,
  settingsId: id(5),
  settingsVersion: 1,
  status: 'active',
});
const instrument = c.instrumentResponseSchema.parse({
  id: id(6),
  name: 'Reviewed holding',
  family: 'stock',
  subtype: 'ordinary-share',
  economicIdentity: 'fixture:holding',
  quantityUnit: 'share',
  quoteCurrencyId: currency.id,
  settlementCurrencyId: currency.id,
  multiplier: '1',
  quantityIncrement: '0.000001',
  priceIncrement: '0.01',
  capability: 'native-linear',
  effectiveAt: instant,
  metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
  revision: 1,
  archivedAt: null,
  versionId: id(7),
  version: 1,
});
const document = c.createStatementRequestSchema.parse({
  accountId: account.id,
  asOf: instant,
  sourceName: 'Independent custodian',
  sourceReference: 'OCT-2026',
  cashDefinition: 'all-owned-cash/1',
  holdingsDefinition: 'netted-account-inventory/1',
  completeCash: true,
  completeHoldings: true,
  cash: [{ currencyId: currency.id, amount: '100', tolerance: '0.01' }],
  holdings: [
    { instrumentVersionId: instrument.versionId, quantity: '1.000001', tolerance: '0.000001' },
  ],
  notes: 'Retained original statement.',
});
const statement = (value = document): c.StatementResponse => ({
  id: id(10),
  accountId: account.id,
  asOf: value.asOf,
  createdAt: instant,
  sourceRevision: '10',
  document: value,
});
const policy = {
  fxPolicy: {
    id: 'fixture-policy/1',
    maxAgeMilliseconds: 86_400_000,
    sourcePriority: ['reviewed-fx'],
  },
  pricePolicy: { maxAgeMilliseconds: 86_400_000, sourcePriority: ['reviewed-price'] },
};
function assessment(overrides: Partial<c.StatementReconciliation> = {}): c.StatementReconciliation {
  return c.statementReconciliationResponseSchema.parse({
    id: id(20),
    statementId: id(10),
    accountId: account.id,
    asOf: instant,
    createdAt: instant,
    sourceRevision: '13',
    comparedRevision: '12',
    currentRevision: '12',
    stale: false,
    status: 'variance',
    accepted: false,
    reviewNote: 'Compared independent statement.',
    rows: [
      {
        kind: 'cash',
        referenceId: currency.id,
        expected: '100',
        actual: '90',
        variance: '-10',
        tolerance: '0.01',
        state: 'variance',
        reasons: [],
      },
    ],
    ...overrides,
  });
}
let statements: c.StatementResponse[];
let evaluations: c.StatementReconciliation[];
let nextAssessment: c.StatementReconciliation;
let writes: Array<{ url: string; body: unknown; headers: Headers }>;
let loseSaveResponse: boolean;
function mount(role: c.WorkspaceResponse['role'] = 'owner') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReconciliationWorkspace
        workspace={{ ...workspace, role }}
        workspaces={[{ ...workspace, role }]}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  statements = [];
  evaluations = [];
  nextAssessment = assessment();
  writes = [];
  loseSaveResponse = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (/\/financial\/(accounts|currencies|instruments)\?/u.test(url))
        c.financialCatalogQuerySchema.parse(
          Object.fromEntries(new URL(url, 'http://fixture.local').searchParams),
        );
      if (url.includes('/financial/accounts')) return Response.json([account]);
      if (url.includes('/financial/currencies')) return Response.json([currency]);
      if (url.includes('/financial/instruments')) return Response.json([instrument]);
      if (init.method === 'POST') {
        const body: unknown = JSON.parse(String(init.body));
        writes.push({ url, body, headers: new Headers(init.headers) });
        if (url.endsWith('/statements')) {
          const saved = statement(c.createStatementRequestSchema.parse(body));
          statements = [saved];
          if (loseSaveResponse) {
            loseSaveResponse = false;
            throw new Error('Response interrupted');
          }
          return Response.json(saved);
        }
        const request = c.evaluateStatementRequestSchema.parse(body);
        const saved = {
          ...nextAssessment,
          id: id(20 + evaluations.length),
          accepted: request.accept,
          reviewNote: request.reviewNote,
        };
        evaluations = [saved, ...evaluations];
        return Response.json(saved);
      }
      if (/\/evaluations\/[0-9a-f-]+$/u.test(url))
        return Response.json(evaluations.find((item) => url.endsWith(item.id)));
      if (url.includes('/evaluations?'))
        return Response.json({ items: evaluations, nextCursor: null });
      if (url.includes('/statements?'))
        return Response.json({ items: statements, nextCursor: null });
      throw new Error(`Unexpected route ${url}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function fillStatement() {
  await screen.findByRole('option', { name: 'Statement account · live' });
  fireEvent.change(screen.getByLabelText('Account'), { target: { value: account.id } });
  fireEvent.change(screen.getByLabelText('Statement time (UTC)'), {
    target: { value: '2026-10-22T00:30' },
  });
  fireEvent.change(screen.getByLabelText('Statement source'), {
    target: { value: 'Independent custodian' },
  });
  fireEvent.change(screen.getByLabelText('Statement reference'), { target: { value: 'OCT-2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add cash balance' }));
  fireEvent.change(screen.getByLabelText('Cash currency 1'), { target: { value: currency.id } });
  fireEvent.change(screen.getByLabelText('Statement cash 1'), {
    target: { value: '100.000000000001' },
  });
  fireEvent.change(screen.getByLabelText('Cash tolerance 1'), { target: { value: '0.01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add holding quantity' }));
  fireEvent.change(screen.getByLabelText('Instrument version 1'), {
    target: { value: instrument.versionId },
  });
  fireEvent.change(screen.getByLabelText('Statement quantity 1'), {
    target: { value: '1.000001' },
  });
  fireEvent.change(screen.getByLabelText('Quantity tolerance 1'), {
    target: { value: '0.000001' },
  });
  fireEvent.click(screen.getByLabelText(/Statement lists every cash currency/));
  fireEvent.click(screen.getByLabelText(/Statement lists every holding/));
}

describe('Independent statement reconciliation', () => {
  it('records native statement evidence and user tolerances exactly with mutation proof', async () => {
    mount();
    await fillStatement();
    fireEvent.click(screen.getByRole('button', { name: 'Save independent statement' }));
    expect(await screen.findByRole('heading', { name: 'Review OCT-2026' })).toBeInTheDocument();
    expect(writes[0]?.body).toMatchObject({
      asOf: '2026-10-22T00:30:00.000Z',
      completeCash: true,
      completeHoldings: true,
      sourceName: 'Independent custodian',
      cash: [{ currencyId: currency.id, amount: '100.000000000001', tolerance: '0.01' }],
      holdings: [
        { instrumentVersionId: instrument.versionId, quantity: '1.000001', tolerance: '0.000001' },
      ],
    });
    expect(writes[0]?.headers.get('x-csrf-token')).toBe('independent-statement-proof');
    expect(writes[0]?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/u);
    expect(screen.getByText(/cannot prove agreement with a statement/)).toBeInTheDocument();
    const preserved = screen.getByRole('table', { name: 'Preserved statement values' });
    expect(within(preserved).getByText('100.000000000001')).toBeInTheDocument();
    expect(screen.getAllByText(/Europe\/Madrid/).length).toBeGreaterThan(0);
  });

  it('shows an independent variance and prevents acceptance of a mismatched statement', async () => {
    statements = [statement()];
    mount();
    await screen.findByRole('heading', { name: 'Review OCT-2026' });
    fireEvent.change(screen.getByLabelText('Review note'), {
      target: { value: 'Investigate missing 10 USD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with ledger' }));
    const result = await screen.findByRole('region', { name: 'Statement comparison result' });
    const table = within(result).getByRole('table');
    expect(within(table).getByText('100')).toBeInTheDocument();
    expect(within(table).getByText('90')).toBeInTheDocument();
    expect(within(table).getByText('-10')).toBeInTheDocument();
    expect(within(table).getByText('0.01')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept matching statement' })).toBeDisabled();
    expect(writes[0]?.body).toEqual({ accept: false, reviewNote: 'Investigate missing 10 USD.' });
  });

  it('accepts only a current match and pins the displayed financial revision and valuation policy', async () => {
    statements = [
      statement({
        ...document,
        equity: {
          currencyId: currency.id,
          amount: '110',
          tolerance: '0.01',
          definition: 'owned-cash-plus-signed-holdings/1',
        },
      }),
    ];
    evaluations = [
      assessment({
        status: 'matched',
        valuationPolicy: policy,
        rows: [
          {
            kind: 'equity',
            referenceId: currency.id,
            expected: '110',
            actual: '110',
            variance: '0',
            tolerance: '0.01',
            state: 'matched',
            reasons: [],
          },
        ],
      }),
    ];
    nextAssessment = { ...evaluations[0]! };
    mount();
    const accept = await screen.findByRole('button', { name: 'Accept matching statement' });
    await waitFor(() => expect(accept).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Review note'), {
      target: { value: 'Accepted against retained statement and marks.' },
    });
    fireEvent.change(screen.getByLabelText('FX sources in priority order'), {
      target: { value: 'unreviewed-source' },
    });
    fireEvent.click(accept);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toMatchObject({
      accept: true,
      sourceRevision: '12',
      valuationPolicy: policy,
    });
    await screen.findByText('Matching statement accepted at the recorded financial revision.');
    expect(screen.getByRole('button', { name: 'Accept matching statement' })).toBeDisabled();
  });

  it('marks accepted evidence stale after a later financial change without silently accepting it again', async () => {
    statements = [statement()];
    evaluations = [
      assessment({
        status: 'matched',
        accepted: true,
        stale: true,
        currentRevision: '14',
        rows: [
          {
            kind: 'cash',
            referenceId: currency.id,
            expected: '100',
            actual: '100',
            variance: '0',
            tolerance: '0.01',
            state: 'matched',
            reasons: [],
          },
        ],
      }),
    ];
    mount();
    const result = await screen.findByRole('region', { name: 'Statement comparison result' });
    expect(within(result).getByText(/Stale — financial records changed/)).toBeInTheDocument();
    expect(
      within(result).getByText(/Compared financial revision 12; current financial revision 14/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept matching statement' })).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  it('lets a viewer inspect incomplete evidence without exposing recording or acceptance actions', async () => {
    statements = [statement()];
    evaluations = [
      assessment({
        status: 'unavailable',
        rows: [
          {
            kind: 'holding',
            referenceId: instrument.versionId,
            expected: '1.000001',
            actual: null,
            variance: null,
            tolerance: '0.000001',
            state: 'unavailable',
            reasons: ['missing_booked_principal'],
          },
        ],
      }),
    ];
    mount('viewer');
    const result = await screen.findByRole('region', { name: 'Statement comparison result' });
    expect(within(result).getAllByText('Unavailable')).toHaveLength(2);
    expect(within(result).getByText(/missing booked principal/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save independent statement' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare with ledger' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Accept matching statement' }),
    ).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('retains a statement command identity after an interrupted save response', async () => {
    loseSaveResponse = true;
    mount();
    await fillStatement();
    fireEvent.click(screen.getByRole('button', { name: 'Save independent statement' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Save independent statement' }));
    await screen.findByRole('heading', { name: 'Review OCT-2026' });
    expect(writes).toHaveLength(2);
    expect(writes[0]?.headers.get('idempotency-key')).toBe(
      writes[1]?.headers.get('idempotency-key'),
    );
    expect(writes[0]?.body).toEqual(writes[1]?.body);
  });
});
