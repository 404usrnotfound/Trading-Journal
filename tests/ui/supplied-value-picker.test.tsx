import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuppliedValuePicker } from '../../apps/web/src/components/supplied/supplied-value-picker.js';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function observation(n: number) {
  return {
    id: id(n),
    kind: 'position-equity',
    amount: '7',
    currencyId: id(10),
    currencyCode: 'USD',
    scopeLabel: `Manual future account · contract ${n}`,
    observedAt: '2025-02-02T00:00:00.000002Z',
    source: 'Broker statement',
    sourceReference: `Residual source line ${n}`,
    quality: 'broker-reported',
    definitionVersion: 'residual-position-equity/1',
    basisRevision: '3',
    sourceRevision: '4',
    accountId: id(11),
    instrumentVersionId: id(12),
    instrumentId: id(13),
    tradeId: null,
    signedQuantity: '2',
    supersedesId: null,
    sourceInput: {
      kind: 'position-equity',
      amount: '7',
      currencyId: id(10),
      observedAt: '2025-02-02T00:00:00.000002Z',
      source: 'Broker statement',
      sourceReference: `Residual source line ${n}`,
      quality: 'broker-reported',
      expectedSourceRevision: '3',
      accountId: id(11),
      instrumentVersionId: id(12),
      signedQuantity: '2',
      valueDefinition: 'residual-contract-equity',
      cashExcluded: true,
      collateralExcluded: true,
      settledPnlExcluded: true,
      unsettledCashExcluded: true,
      accrualTreatment: 'not-applicable',
    },
  };
}
function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <SuppliedValuePicker
        workspaceId={id(1)}
        kind="position-equity"
        value={value}
        onChange={setValue}
      />
      <output aria-label="Selected source identifiers">{value}</output>
    </>
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('explicit paged supplied report selection', () => {
  it('loads reviewed evidence on demand, retains selections over pages, and clears them explicitly', async () => {
    const fetcher = vi.fn(async (url: string) =>
      Response.json({
        sourceRevision: '5',
        items: [observation(url.includes('afterId') ? 3 : 2)],
        nextCursor: url.includes('afterId') ? null : id(2),
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Harness />
      </QueryClientProvider>,
    );
    expect(fetcher).not.toHaveBeenCalled();
    const details = screen.getByText('Reviewed supplied position values').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    const first = await screen.findByRole('checkbox', { name: /contract 2/ });
    expect(screen.getByText('Residual source line 2')).toBeVisible();
    fireEvent.click(first);
    expect(screen.getByLabelText('Selected source identifiers')).toHaveTextContent(id(2));
    fireEvent.click(screen.getByRole('button', { name: 'Load more supplied sources' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /contract 3/ }));
    expect(screen.getByLabelText('Selected source identifiers')).toHaveTextContent(
      `${id(2)},${id(3)}`,
    );
    fireEvent.click(first);
    await waitFor(() =>
      expect(screen.getByLabelText('Selected source identifiers')).toHaveTextContent(id(3)),
    );
    expect(screen.getByLabelText('Selected source identifiers')).not.toHaveTextContent(id(2));
    expect(fetcher.mock.calls.some(([url]) => url.includes(`afterId=${id(2)}`))).toBe(true);
  });
});
