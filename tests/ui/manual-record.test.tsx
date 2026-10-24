import * as c from '@journal/contracts';
import { INVENTORY_CALCULATION_MANIFEST } from '@journal/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualRecordWorkspace } from '../../apps/web/src/components/record/manual-record-workspace.js';

vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'fixture-proof',
}));
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const instant = '2026-01-01T00:00:00Z';
const workspace: c.WorkspaceResponse = {
  id: uuid(1),
  name: 'Trading workspace',
  role: 'owner',
  isDemo: false,
  timezone: 'UTC',
  reportingCurrency: 'USD',
  revision: 1,
};
const currency = c.currencyResponseSchema.parse({
  id: uuid(2),
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
  conventionId: uuid(3),
  version: 1,
});
const account = c.accountResponseSchema.parse({
  id: uuid(4),
  name: 'Paper account',
  environment: 'paper',
  accountType: 'cash',
  brokerId: null,
  baseCurrencyId: currency.id,
  inventoryMethod: 'fifo',
  allowShort: false,
  holdingMode: 'netted',
  effectiveAt: instant,
  revision: 1,
  archivedAt: null,
  settingsId: uuid(5),
  settingsVersion: 1,
  status: 'active',
});
const instrument = c.instrumentResponseSchema.parse({
  id: uuid(6),
  name: 'Fractional share',
  family: 'stock',
  subtype: 'ordinary-share',
  economicIdentity: 'fixture:share',
  quantityUnit: 'share',
  quoteCurrencyId: currency.id,
  settlementCurrencyId: currency.id,
  multiplier: '1',
  quantityIncrement: '0.000001',
  priceIncrement: '0.000001',
  capability: 'native-linear',
  effectiveAt: instant,
  metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
  revision: 1,
  archivedAt: null,
  versionId: uuid(7),
  version: 1,
});
function detail() {
  const metric = (unit: string) => ({
    status: 'unavailable',
    value: null,
    reasons: ['no_effective_fills'],
    unit,
    currencyId: null,
    source: 'calculated-ledger',
  });
  return c.journalDetailResponseSchema.parse({
    trade: {
      id: uuid(8),
      title: 'Morning review',
      classification: 'active-trading',
      revision: 1,
      archivedAt: null,
      strategyVersionId: null,
      strategyId: null,
      strategyLinkTiming: null,
      status: 'planned',
      closureReviewRequired: false,
    },
    journal: {
      tradeId: uuid(8),
      revision: 0,
      document: c.journalDocumentSchema.parse({}),
      updatedAt: null,
      updatedBy: null,
    },
    strategy: null,
    originalPlan: null,
    currentPlan: null,
    commitment: null,
    recentHistory: [],
    financial: {
      sourceRevision: '1',
      definitionVersion: 'trade-journal-financial/1',
      manifest: INVENTORY_CALCULATION_MANIFEST,
      rMultiple: {
        ...metric('R'),
        originalPlanId: null,
        definitionVersion: 'original-risk-r/1',
        financialSourceRevision: '1',
      },
      timeline: [],
      legs: [
        {
          legId: uuid(9),
          accountId: account.id,
          accountName: account.name,
          instrumentId: instrument.id,
          instrumentVersionId: instrument.versionId,
          instrumentName: instrument.name,
          quantityUnit: instrument.quantityUnit,
          quoteCurrencyId: currency.id,
          settlementCurrencyId: currency.id,
          direction: 'long',
          actualEntry: metric('price/share'),
          actualExit: metric('price/share'),
          enteredQuantity: metric('share'),
          exitedQuantity: metric('share'),
          openQuantity: metric('share'),
          realizedGross: metric('money'),
          realizedNet: metric('money'),
          costBasis: metric('money'),
          fees: [],
          executions: [],
          lots: [],
          matches: [],
        },
      ],
    },
  });
}
const executionBody = {
  accountId: account.id,
  instrumentVersionId: instrument.versionId,
  side: 'buy',
  quantity: '0.125001',
  price: '10.000001',
  economicAt: '2026-10-14T09:30:00.123456+02:00',
  orderingKey: '2',
  costsComplete: false,
};
const execution = c.executionResponseSchema.parse({
  accountId: executionBody.accountId,
  instrumentVersionId: executionBody.instrumentVersionId,
  side: executionBody.side,
  quantity: executionBody.quantity,
  price: executionBody.price,
  economicAt: executionBody.economicAt,
  orderingKey: executionBody.orderingKey,
  id: uuid(10),
  commandId: uuid(11),
  sourceRevision: '3',
  bookedPrincipal: '1.25',
  principalCurrencyId: currency.id,
  supersedesId: null,
  payload: { ...executionBody, sourceInput: executionBody },
});
type Write = { path: string; body: Record<string, unknown>; commandId: string | null };
let writes: Write[], allocationFailures: number, executionFailures: number, assigned: boolean;
let selectedAccount: typeof account;
let allocationVersion: number, loseCommittedAllocation: boolean;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  writes = [];
  allocationFailures = 0;
  executionFailures = 0;
  assigned = false;
  selectedAccount = account;
  allocationVersion = 7;
  loseCommittedAllocation = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, options?: RequestInit) => {
      if (!options?.body) {
        if (path.includes('/cash-balances')) return json([]);
        if (path.includes('/accounts?')) return json([selectedAccount]);
        if (path.includes('/instruments?')) return json([instrument]);
        if (path.includes('/currencies?')) return json([currency]);
        if (path.includes('/brokers?')) return json([]);
        if (path.includes('/financial/trades?')) return json([]);
        if (path.includes('/strategies?')) return json({ strategies: [], nextCursor: null });
        if (path.endsWith('/allocations'))
          return json({
            executionId: execution.id,
            version: allocationVersion,
            allocations: [
              { tradeLegId: assigned ? uuid(100) : null, quantity: execution.quantity },
            ],
          });
        if (path.includes('/executions?')) return json([execution]);
        throw new Error(`Unexpected read: ${path}`);
      }
      const body = JSON.parse(String(options.body)) as Record<string, unknown>;
      writes.push({ path, body, commandId: new Headers(options.headers).get('idempotency-key') });
      if (path.endsWith('/journals')) return json(detail());
      if (path.endsWith('/cash-buckets'))
        return json({
          id: uuid(12),
          commandId: writes.at(-1)!.commandId,
          sourceRevision: '2',
          accountId: account.id,
          currencyId: currency.id,
          kind: 'unsettled',
        });
      if (path.endsWith('/executions')) {
        if (executionFailures-- > 0) throw new TypeError('Network response lost');
        return json(execution);
      }
      if (path.endsWith('/execution-allocations')) {
        if (allocationFailures-- > 0) {
          if (loseCommittedAllocation) {
            allocationVersion = 8;
            assigned = true;
          }
          return json({}, 503);
        }
        return json({
          id: uuid(13),
          commandId: writes.at(-1)!.commandId,
          sourceRevision: '4',
          version: 8,
        });
      }
      throw new Error(`Unexpected mutation: ${path}`);
    }),
  );
});
function mount(
  mode: 'record' | 'existing' = 'record',
  role: c.WorkspaceResponse['role'] = 'owner',
  initialTradeId: string | null = null,
) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ManualRecordWorkspace
        workspace={{ ...workspace, role }}
        workspaces={[workspace]}
        initialMode={mode}
        initialTradeId={initialTradeId}
      />
    </QueryClientProvider>,
  );
}
const set = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function fill(mode: 'record' | 'existing' = 'record') {
  await screen.findByLabelText('Account');
  set('Account', account.id);
  if (mode === 'record') {
    set('Instrument', instrument.versionId);
    set('Quantity (share)', execution.quantity);
    set('Execution price', execution.price!);
    set('Executed at (ISO time with offset)', execution.economicAt);
    set('Source ordering key', '2');
  } else {
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /2026-10-14/ })).toBeInTheDocument(),
    );
    set('Recorded execution', execution.id);
  }
  set('Trade title', 'Morning review');
  set('Attribution reason', 'Source fill belongs to morning setup');
  fireEvent.click(
    screen.getByRole('button', {
      name: mode === 'record' ? 'Preview record' : 'Preview attribution',
    }),
  );
}
async function confirm(mode: 'record' | 'existing' = 'record') {
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: mode === 'record' ? 'Record execution and attribute' : 'Confirm attribution',
    }),
  );
}
describe('manual source recording', () => {
  it('previews without mutation, cancels with Escape and records exact decimals with unconfirmed costs', async () => {
    mount();
    await fill();
    const dialog = await screen.findByRole('dialog');
    expect(writes).toHaveLength(0);
    expect(within(dialog).getByText(/0.125001 share at 10.000001/)).toBeVisible();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview record' }));
    await confirm();
    await screen.findByRole('link', { name: 'Review this trade' });
    const booked = writes.find((item) => item.path.endsWith('/executions'))!;
    expect(booked.body).toMatchObject({
      quantity: execution.quantity,
      price: execution.price,
      economicAt: execution.economicAt,
      orderingKey: '2',
      costsComplete: false,
      cashBucketId: uuid(12),
    });
    const allocation = writes.find((item) => item.path.endsWith('/execution-allocations'))!;
    expect(allocation.body).toMatchObject({
      expectedVersion: 7,
      allocations: [{ tradeLegId: uuid(9), quantity: execution.quantity }],
    });
    expect(writes.some((item) => item.path.includes('/closures'))).toBe(false);
  });
  it('preserves confirmed execution and retries only attribution with the same command and frozen source', async () => {
    allocationFailures = 1;
    mount();
    await fill();
    await confirm();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Quantity (share)')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry remaining steps' }));
    await screen.findByRole('link', { name: 'Review this trade' });
    expect(writes.filter((item) => item.path.endsWith('/executions'))).toHaveLength(1);
    expect(writes.filter((item) => item.path.endsWith('/journals'))).toHaveLength(1);
    const retries = writes.filter((item) => item.path.endsWith('/execution-allocations'));
    expect(retries).toHaveLength(2);
    expect(retries[1]?.commandId).toBe(retries[0]?.commandId);
    expect(retries[1]?.body).toEqual(retries[0]?.body);
  });
  it('retains the execution command after a lost booking response', async () => {
    executionFailures = 1;
    mount();
    await fill();
    await confirm();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry remaining steps' }));
    await screen.findByRole('link', { name: 'Review this trade' });
    const retries = writes.filter((item) => item.path.endsWith('/executions'));
    expect(retries).toHaveLength(2);
    expect(retries[1]?.commandId).toBe(retries[0]?.commandId);
    expect(retries[1]?.body).toEqual(retries[0]?.body);
    expect(writes.filter((item) => item.path.endsWith('/cash-buckets'))).toHaveLength(1);
  });
  it('retains the exact optimistic allocation after the server commits but its response is lost', async () => {
    loseCommittedAllocation = true;
    allocationFailures = 1;
    mount();
    await fill();
    await confirm();
    await screen.findByRole('alert');
    expect(allocationVersion).toBe(8);
    fireEvent.click(screen.getByRole('button', { name: 'Retry remaining steps' }));
    await screen.findByRole('link', { name: 'Review this trade' });
    const retries = writes.filter((item) => item.path.endsWith('/execution-allocations'));
    expect(retries).toHaveLength(2);
    expect(retries[1]?.commandId).toBe(retries[0]?.commandId);
    expect(retries[1]?.body).toEqual(retries[0]?.body);
    expect(retries[1]?.body.expectedVersion).toBe(7);
    expect(writes.filter((item) => item.path.endsWith('/executions'))).toHaveLength(1);
  });
  it('links an imported fill using its current allocation revision without booking another execution', async () => {
    mount('existing');
    await fill('existing');
    await confirm('existing');
    await screen.findByRole('link', { name: 'Review this trade' });
    expect(
      writes.some(
        (item) => item.path.endsWith('/executions') || item.path.endsWith('/cash-buckets'),
      ),
    ).toBe(false);
    expect(writes.find((item) => item.path.endsWith('/execution-allocations'))?.body).toMatchObject(
      { executionId: execution.id, expectedVersion: 7 },
    );
  });
  it('links a historical fill after metadata publication using its immutable instrument version', async () => {
    const originalFetch = globalThis.fetch;
    const readVersion = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (!options?.body && path.includes('/instruments?'))
          return json([
            { ...instrument, version: 2, versionId: uuid(200), priceIncrement: '0.0000001' },
          ]);
        if (!options?.body && path.endsWith(`/instrument-versions/${instrument.versionId}`)) {
          readVersion();
          return json(instrument);
        }
        return originalFetch(path, options);
      }),
    );
    mount('existing');
    await screen.findByLabelText('Account');
    set('Account', account.id);
    await screen.findByRole('option', { name: /2026-10-14/ });
    set('Recorded execution', execution.id);
    await waitFor(() => expect(readVersion).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview attribution' })).toBeEnabled(),
    );
    set('Trade title', 'Historical allocation');
    set('Attribution reason', 'Reviewed old fill under its source conventions');
    fireEvent.click(screen.getByRole('button', { name: 'Preview attribution' }));
    await confirm('existing');
    await screen.findByRole('link', { name: 'Review this trade' });
    expect(writes.find((entry) => entry.path.endsWith('/journals'))?.body).toMatchObject({
      legs: [{ instrumentVersionId: instrument.versionId }],
    });
    expect(
      writes.some(
        (entry) => entry.path.endsWith('/executions') || entry.path.endsWith('/cash-buckets'),
      ),
    ).toBe(false);
  });
  it('records an exit for a historically pinned campaign leg after metadata publication', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (!options?.body && path.includes('/instruments?'))
          return json([{ ...instrument, version: 2, versionId: uuid(200) }]);
        if (!options?.body && path.endsWith(`/instrument-versions/${instrument.versionId}`))
          return json(instrument);
        if (!options?.body && path.endsWith(`/journals/${uuid(8)}`)) return json(detail());
        return originalFetch(path, options);
      }),
    );
    mount('record', 'owner', uuid(8));
    await screen.findByLabelText('Account');
    set('Account', account.id);
    await screen.findByRole('option', {
      name: `${instrument.name} · historical version for this trade`,
    });
    set('Instrument', instrument.versionId);
    await screen.findByLabelText('Quantity (share)');
    set('Execution side', 'sell');
    set('Quantity (share)', execution.quantity);
    set('Execution price', execution.price!);
    set('Executed at (ISO time with offset)', execution.economicAt);
    set('Source ordering key', '3');
    set('Attribution reason', 'Exit belongs to the historically pinned campaign');
    await waitFor(() => expect(screen.getByLabelText('Matching trade leg')).toHaveValue(uuid(9)));
    fireEvent.click(screen.getByRole('button', { name: 'Preview record' }));
    await screen.findByRole('dialog');
    await confirm();
    await screen.findByRole('link', { name: 'Review this trade' });
    expect(writes.find((entry) => entry.path.endsWith('/executions'))?.body).toMatchObject({
      instrumentVersionId: instrument.versionId,
      side: 'sell',
    });
    expect(
      writes.find((entry) => entry.path.endsWith('/execution-allocations'))?.body,
    ).toMatchObject({
      allocations: [{ tradeLegId: uuid(9), quantity: execution.quantity }],
    });
    expect(writes.some((entry) => entry.path.endsWith('/journals'))).toBe(false);
  });
  it('preserves allocations belonging to another campaign instead of replacing them', async () => {
    assigned = true;
    mount('existing');
    await fill('existing');
    expect(await screen.findByRole('alert')).toHaveTextContent('already attributed');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
  it('rejects scientific notation locally before any financial mutation', async () => {
    mount();
    await fill();
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    set('Quantity (share)', '1e3');
    fireEvent.click(screen.getByRole('button', { name: 'Preview record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('quantity');
    expect(writes).toHaveLength(0);
  });
  it('requires actual source cash effects for a native instrument in a segregated account', async () => {
    selectedAccount = { ...account, holdingMode: 'segregated' };
    mount();
    await screen.findByLabelText('Account');
    set('Account', account.id);
    set('Instrument', instrument.versionId);
    expect(await screen.findByText(/This account uses segregated holdings/)).toBeVisible();
    expect(screen.queryByLabelText('Principal cash bucket')).not.toBeInTheDocument();
    set('Quantity (share)', execution.quantity);
    set('Execution price', execution.price!);
    set('Executed at (ISO time with offset)', execution.economicAt);
    set('Source ordering key', '2');
    set('Source cash 1 currency', currency.id);
    set('Source cash 1 amount', '-1.25');
    set('Trade title', 'Segregated source recording');
    set('Attribution reason', 'Explicit source cash for segregated account');
    fireEvent.click(screen.getByRole('button', { name: 'Preview record' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Source recording only/)).toBeVisible();
    await confirm();
    await screen.findByRole('link', { name: 'Review this trade' });
    const booked = writes.find((item) => item.path.endsWith('/executions'))!;
    expect(booked.body.manualCashEffects).toEqual([
      { cashBucketId: uuid(12), currencyId: currency.id, amount: '-1.25' },
    ]);
    expect(booked.body).not.toHaveProperty('cashBucketId');
    expect(booked.body).not.toHaveProperty('bookedPrincipal');
  });
  it('rejects a zero native source price before creating a journal', async () => {
    mount();
    await fill();
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    set('Execution price', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Preview record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('positive decimal');
    expect(writes).toHaveLength(0);
  });
  it('warns before leaving an unfinished record and preserves the retry state on cancel', async () => {
    allocationFailures = 1;
    mount();
    await fill();
    await confirm();
    await screen.findByRole('alert');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Open recorded journal' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Leave an incomplete recording?' }),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry remaining steps' }));
    await screen.findByRole('link', { name: 'Review this trade' });
    const completeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(completeUnload);
    expect(completeUnload.defaultPrevented).toBe(false);
    expect(writes.filter((item) => item.path.endsWith('/executions'))).toHaveLength(1);
  });
  it('requires explicit confirmation before a sign-out continuation discards an unfinished recording', async () => {
    allocationFailures = 1;
    mount();
    await fill();
    await confirm();
    await screen.findByRole('alert');
    const continuation = vi.fn();
    const request = new CustomEvent('journal:navigation-request', {
      cancelable: true,
      detail: { destination: '/sign-in', continue: continuation },
    });
    window.dispatchEvent(request);
    expect(request.defaultPrevented).toBe(true);
    const dialog = await screen.findByRole('dialog');
    expect(continuation).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(continuation).not.toHaveBeenCalled();
    const secondRequest = new CustomEvent('journal:navigation-request', {
      cancelable: true,
      detail: { destination: '/sign-in', continue: continuation },
    });
    window.dispatchEvent(secondRequest);
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave page' }),
    );
    expect(continuation).toHaveBeenCalledTimes(1);
    // A rejected sign-out must still protect the frozen record that remains on this page.
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
  it('gives viewers review-only feedback and disables mutation controls', async () => {
    mount('record', 'viewer');
    expect(await screen.findByText(/Recording and attribution require/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Preview record' })).toBeDisabled();
    expect(
      screen.queryByText('Set up currencies, accounts and instruments'),
    ).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
});
