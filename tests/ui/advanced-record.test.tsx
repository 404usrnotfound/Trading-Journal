import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedRecordWorkspace } from '../../apps/web/src/components/record/advanced-record-workspace.js';
import type { WorkspaceResponse } from '@journal/contracts';
vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'safe-fixture-proof',
}));
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const workspace: WorkspaceResponse = {
  id: id(1),
  name: 'Actual source workspace',
  role: 'owner',
  isDemo: false,
  timezone: 'UTC',
  reportingCurrency: 'USD',
  revision: 1,
};
let writes: { body: Record<string, unknown>; key: string | null }[] = [];
let interrupted = false;
function renderEditor(role: WorkspaceResponse['role'] = 'owner') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdvancedRecordWorkspace workspace={{ ...workspace, role }} />
    </QueryClientProvider>,
  );
}
const fill = (
  label: string,
  value: string,
  scope: Pick<typeof screen, 'getByLabelText'> = screen,
) => fireEvent.change(scope.getByLabelText(label), { target: { value } });
beforeEach(() => {
  writes = [];
  interrupted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ body, key: new Headers(init.headers).get('idempotency-key') });
        if (interrupted) return new Response('{}', { status: 500 });
        return Response.json({
          id: id(20),
          commandId: new Headers(init.headers).get('idempotency-key'),
          sourceRevision: '2',
          ...Object.fromEntries(
            [
              'accountId',
              'instrumentVersionId',
              'side',
              'quantity',
              'price',
              'economicAt',
              'orderingKey',
            ].map((key) => [key, body[key]]),
          ),
          bookedPrincipal: '100',
          principalCurrencyId: id(5),
          supersedesId: null,
          payload: { ...body, sourceInput: body },
        });
      }
      return Response.json([]);
    }),
  );
});
describe('advanced manual financial editor', () => {
  it('finds an account beyond the first 200 references while retaining the explicit selection', async () => {
    const account = (n: number) => ({
      id: id(n),
      name: 'Account ' + n,
      environment: 'paper',
      accountType: 'cash',
      brokerId: null,
      baseCurrencyId: id(2),
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt: '2025-01-01T00:00:00Z',
      revision: 1,
      archivedAt: null,
      settingsId: id(n + 2000),
      settingsVersion: 1,
      status: 'active',
    });
    const firstPage = Array.from({ length: 200 }, (_, index) => account(1000 + index));
    const reads: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        reads.push(url);
        return Response.json(
          url.pathname.endsWith('/accounts')
            ? url.searchParams.has('afterId')
              ? [account(1200)]
              : firstPage
            : [],
        );
      }),
    );
    renderEditor();
    await waitFor(() => expect(screen.queryByText('Loading references…')).not.toBeInTheDocument());
    fill('Account', id(1000));
    fireEvent.click(screen.getByText('Browse source references'));
    fireEvent.click(screen.getByRole('button', { name: 'Next accounts' }));
    await waitFor(() =>
      expect(document.querySelector(`datalist option[value="${id(1200)}"]`)).not.toBeNull(),
    );
    expect(document.querySelector(`datalist option[value="${id(1000)}"]`)).not.toBeNull();
    expect(screen.getByLabelText('Account')).toHaveValue(id(1000));
    const next = reads.find((url) => url.searchParams.has('afterId'));
    expect(next?.searchParams.get('afterId')).toBe(id(1199));
    expect(next?.searchParams.get('limit')).toBe('200');
    expect(writes).toHaveLength(0);
  });
  it('requires review, preserves multiple actual charges and explicit lots, and retains retry identity', async () => {
    renderEditor();
    await waitFor(() => expect(screen.queryByText('Loading references…')).not.toBeInTheDocument());
    fill('Record type', 'executions');
    fill('Account', id(2));
    fill('Instrument version', id(3));
    fill('Side', 'sell');
    fill('Quantity', '1.234567891234567891');
    fill('Actual source fill price', '100');
    fill('Cash bucket', id(4));
    fill('Economic time (ISO 8601 with offset)', '2026-01-01T12:00:00+01:00');
    fireEvent.click(screen.getByLabelText('All actual source costs are included'));
    fireEvent.click(screen.getByRole('button', { name: 'Add charge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add charge' }));
    const fee1 = within(screen.getByRole('group', { name: 'fees 1' }));
    const fee2 = within(screen.getByRole('group', { name: 'fees 2' }));
    for (const [scope, currency, bucket, amount] of [
      [fee1, id(5), id(4), '0.000000000000000001'],
      [fee2, id(6), id(7), '1.99'],
    ] as const) {
      fill('Currency', currency, scope);
      fill('Cash bucket', bucket, scope);
      fill('Actual amount', amount, scope);
      fill('Charge kind', 'commission', scope);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add lot' }));
    const lot = within(screen.getByRole('group', { name: 'lots 1' }));
    fill('Source lot reference', 'original-lot-reference', lot);
    fill('Quantity', '1.234567891234567891', lot);
    fireEvent.click(screen.getByRole('button', { name: 'Review record' }));
    expect(screen.getByRole('region', { name: 'Review financial record' })).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    interrupted = true;
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and record' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Record type')).toBeDisabled();
    expect(screen.getByLabelText('Account')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Return to source fields' })).toBeDisabled();
    expect(writes[0]!.body).toMatchObject({
      fees: [
        { currencyId: id(5), amount: '0.000000000000000001' },
        { currencyId: id(6), amount: '1.99' },
      ],
      specificLots: [{ lotId: 'original-lot-reference', quantity: '1.234567891234567891' }],
    });
    interrupted = false;
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and record' }));
    await screen.findByText(
      'Recorded successfully. Financial history and source references are retained.',
    );
    expect(writes).toHaveLength(2);
    expect(writes[0]!.key).toEqual(writes[1]!.key);
  });
  it('prevents viewers from submitting financial facts', async () => {
    renderEditor('viewer');
    expect(screen.getByRole('button', { name: 'Review record' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('editor access is required');
    expect(writes).toHaveLength(0);
  });
});
