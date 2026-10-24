'use client';

import { CatalogPager, arrayCatalogPage, objectCatalogPage, pinCatalogPage } from './catalog-page';

import * as c from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../ux/confirm-dialog';
import {
  WORKSPACE_NAVIGATION_REQUEST,
  type WorkspaceNavigationRequestDetail,
} from '../ux/navigation-request';
import { CatalogSetup } from './catalog-setup';
import { RecordField, RecordInput } from './record-fields';
import { recordRead, recordWrite, retainedCommand } from './record-api';
import './record.css';

type Account = ReturnType<typeof c.accountResponseSchema.parse>;
type Instrument = ReturnType<typeof c.instrumentResponseSchema.parse>;
type Execution = ReturnType<typeof c.executionResponseSchema.parse>;
type BucketKind = 'settled' | 'unsettled' | 'restricted' | 'collateral_cash';
type CashRow = { currencyId: string; bucketId: string; kind: BucketKind; amount: string };
type Draft = {
  accountId: string;
  instrumentVersionId: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  economicAt: string;
  orderingKey: string;
  bucketId: string;
  bucketKind: BucketKind;
  costsComplete: boolean;
  fee: CashRow;
  feeKind: string;
  cashEffects: CashRow[];
  noManualCash: boolean;
  targetTradeId: string;
  legId: string;
  title: string;
  direction: 'long' | 'short';
  classification: 'active-trading' | 'investing';
  strategyId: string;
  strategyVersionId: string;
  executionId: string;
  allocationReason: string;
};
const cashRow = (): CashRow => ({ currencyId: '', bucketId: '', kind: 'unsettled', amount: '' });
const initialDraft = (tradeId: string | null): Draft => ({
  accountId: '',
  instrumentVersionId: '',
  side: 'buy',
  quantity: '',
  price: '',
  economicAt: '',
  orderingKey: '1',
  bucketId: '',
  bucketKind: 'unsettled',
  costsComplete: false,
  fee: cashRow(),
  feeKind: 'commission',
  cashEffects: [cashRow()],
  noManualCash: false,
  targetTradeId: tradeId ?? '',
  legId: '',
  title: '',
  direction: 'long',
  classification: 'active-trading',
  strategyId: '',
  strategyVersionId: '',
  executionId: '',
  allocationReason: '',
});
type Pending = {
  mode: 'record' | 'existing';
  draft: Draft;
  account: Account;
  instrument: Instrument;
  started: boolean;
  trade: c.JournalDetailResponse | null;
  execution: Execution | null;
  buckets: Map<string, string>;
  allocation: ReturnType<typeof c.executionAllocationSchema.parse> | null;
  result: ReturnType<typeof c.allocationMutationResponseSchema.parse> | null;
  sourceAllocationVersion: number | null;
};

// The account convention is part of the existing ledger's native booking gate.
function usesNativeBooking(account: Account, instrument: Instrument) {
  return instrument.capability === 'native-linear' && account.holdingMode === 'netted';
}

function validationMessage(error: unknown) {
  return error instanceof c.ZodError
    ? error.issues.map((issue) => `${issue.path.join('.') || 'Record'}: ${issue.message}`).join(' ')
    : error instanceof Error
      ? error.message
      : 'Check the source fields before continuing.';
}

export function ManualRecordWorkspace({
  workspace,
  initialTradeId = null,
  initialMode = 'record',
}: {
  workspace: c.WorkspaceResponse;
  workspaces: c.WorkspaceResponse[];
  initialTradeId?: string | null;
  initialMode?: 'record' | 'existing';
}) {
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const financial = `${prefix}/financial`;
  const client = useQueryClient();
  const canEdit = workspace.role !== 'viewer';
  const [mode, setMode] = useState<'record' | 'existing'>(initialMode);
  const [draft, setDraft] = useState(() => initialDraft(initialTradeId));
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [leaveDestination, setLeaveDestination] = useState<string | null>(null);
  const [leaveContinuation, setLeaveContinuation] = useState<(() => void) | null>(null);
  const leaving = useRef(false);
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const catalogs = useQuery({
    queryKey: ['record-catalogs', workspace.id],
    queryFn: async () => {
      const [accounts, instruments, currencies, brokers, buckets, trades] = await Promise.all([
        recordRead(`${financial}/accounts?limit=200`, c.accountResponseSchema.array()),
        recordRead(`${financial}/instruments?limit=200`, c.instrumentResponseSchema.array()),
        recordRead(`${financial}/currencies?limit=200`, c.currencyResponseSchema.array()),
        recordRead(`${financial}/brokers?limit=200`, c.brokerResponseSchema.array()),
        recordRead(`${financial}/cash-balances`, c.cashBalanceResponseSchema.array()),
        recordRead(`${financial}/trades?limit=200`, c.tradeResponseSchema.array()),
      ]);
      return { accounts, instruments, currencies, brokers, buckets, trades };
    },
  });
  const target = useQuery({
    queryKey: ['record-target', workspace.id, draft.targetTradeId],
    enabled: !!draft.targetTradeId,
    queryFn: () =>
      recordRead(`${prefix}/journals/${draft.targetTradeId}`, c.journalDetailResponseSchema),
  });
  const executions = useInfiniteQuery({
    queryKey: ['record-existing-executions', workspace.id, draft.accountId],
    enabled: mode === 'existing' && !!draft.accountId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const parameters = new URLSearchParams({ accountId: draft.accountId, limit: '100' });
      if (pageParam) parameters.set('afterId', pageParam);
      return recordRead(`${financial}/executions?${parameters}`, c.executionResponseSchema.array());
    },
    getNextPageParam: (page) => (page.length === 100 ? page.at(-1)?.id : undefined),
  });
  const strategies = useQuery({
    queryKey: ['record-strategies', workspace.id],
    queryFn: () => recordRead(`${prefix}/strategies?limit=100`, c.strategyListResponseSchema),
  });
  const versions = useQuery({
    queryKey: ['record-strategy-versions', workspace.id, draft.strategyId],
    enabled: !!draft.strategyId && !draft.targetTradeId,
    queryFn: () =>
      recordRead(
        `${prefix}/strategies/${draft.strategyId}/versions?limit=100`,
        c.strategyVersionListResponseSchema,
      ),
  });
  const sourceExecution = executions.data?.pages
    .flat()
    .find((item) => item.id === draft.executionId);
  const selectedVersionId =
    mode === 'existing' ? sourceExecution?.instrumentVersionId : draft.instrumentVersionId;
  const currentInstrument = catalogs.data?.instruments.find(
    (item) => item.versionId === selectedVersionId,
  );
  const historicalInstrument = useQuery({
    queryKey: ['record-instrument-version', workspace.id, selectedVersionId],
    enabled: !!selectedVersionId && !currentInstrument,
    queryFn: () =>
      recordRead(
        `${financial}/instrument-versions/${selectedVersionId}`,
        c.instrumentResponseSchema,
      ),
  });
  const instrument = currentInstrument ?? historicalInstrument.data;
  const account = catalogs.data?.accounts.find((item) => item.id === draft.accountId);
  const native = !!account && !!instrument && usesNativeBooking(account, instrument);
  const selectedLegs =
    target.data?.financial.legs.filter(
      (leg) =>
        leg.accountId === draft.accountId && leg.instrumentVersionId === instrument?.versionId,
    ) ?? [];
  const selectedLegId = draft.legId || (selectedLegs.length === 1 ? selectedLegs[0]!.legId : '');
  const locked = busy || !!pending?.started;
  const change = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const hasDraft =
    !pending?.result &&
    (!!pending ||
      !!draft.accountId ||
      !!draft.instrumentVersionId ||
      !!draft.executionId ||
      !!draft.title ||
      !!draft.quantity ||
      !!draft.price ||
      !!draft.economicAt ||
      !!draft.fee.amount ||
      draft.cashEffects.some((row) => !!row.amount) ||
      !!draft.allocationReason);
  useEffect(() => {
    if (!hasDraft) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      if (
        leaving.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank') return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveContinuation(null);
      setLeaveDestination(anchor.href);
    };
    const requestNavigation = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceNavigationRequestDetail>).detail;
      const continuation = detail?.continue;
      if (typeof continuation !== 'function' || detail.handled) return;
      event.preventDefault();
      detail.handled = true;
      setLeaveContinuation(() => () => continuation());
      setLeaveDestination(detail.destination ?? '/sign-in');
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener(WORKSPACE_NAVIGATION_REQUEST, requestNavigation);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener(WORKSPACE_NAVIGATION_REQUEST, requestNavigation);
      document.removeEventListener('click', navigate, true);
    };
  }, [hasDraft]);

  async function preview(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    if (!account || !instrument) {
      setFailure(
        'Choose an available account and instrument version before continuing. Historical versions are loaded from the recorded source; retry if their reference could not be loaded.',
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === 'record') {
        if (account.status !== 'active' || account.archivedAt || instrument.archivedAt)
          throw new Error('Choose an active account and instrument before recording.');
        c.executionCreateSchema.parse({
          accountId: account.id,
          instrumentVersionId: instrument.versionId,
          side: draft.side,
          quantity: draft.quantity,
          price: draft.price === '' ? null : draft.price,
          economicAt: draft.economicAt,
          orderingKey: draft.orderingKey,
          costsComplete: draft.costsComplete,
        });
        if (native) c.positiveFinancialDecimalSchema.parse(draft.price);
        if (account.inventoryMethod === 'specific')
          throw new Error(
            'This account uses specific lots. Use Advanced financial entry to select the source lots explicitly.',
          );
        if (!native && !draft.noManualCash) {
          if (!draft.cashEffects.length)
            throw new Error(
              'Add the source cash effects or explicitly confirm there was no cash movement.',
            );
          for (const row of draft.cashEffects) {
            c.financialIdSchema.parse(row.currencyId);
            c.financialDecimalSchema.parse(row.amount);
          }
        }
        if (draft.fee.amount !== '') {
          c.financialDecimalSchema.parse(draft.fee.amount);
          c.financialIdSchema.parse(draft.fee.currencyId);
          if (!draft.feeKind.trim()) throw new Error('Enter a fee category.');
        }
      }
      let sourceAllocationVersion: number | null = null;
      if (mode === 'existing') {
        if (!sourceExecution) throw new Error('Select a recorded execution.');
        const allocations = await recordRead(
          `${financial}/executions/${sourceExecution.id}/allocations`,
          c.executionAllocationResponseSchema,
        );
        if (allocations.allocations.some((item) => item.tradeLegId !== null))
          throw new Error(
            'This execution is already attributed to a trade. Open its journal or use Advanced financial entry to review the complete allocation.',
          );
        sourceAllocationVersion = allocations.version;
      }
      if (draft.targetTradeId) {
        const leg = target.data?.financial.legs.find((item) => item.legId === selectedLegId);
        if (
          !target.data ||
          !leg ||
          leg.accountId !== account.id ||
          leg.instrumentVersionId !== instrument.versionId
        )
          throw new Error(
            'Choose a matching account and instrument-version leg in the selected trade.',
          );
        if (
          target.data.trade.archivedAt ||
          ['closed', 'canceled'].includes(target.data.trade.status)
        )
          throw new Error(
            'Choose an active trade; closed, canceled and archived trades cannot receive new activity.',
          );
      } else {
        if (draft.strategyId && !draft.strategyVersionId)
          throw new Error('Choose the exact strategy version used, or assign the strategy later.');
        c.journalCreateSchema.parse({
          title: draft.title,
          classification: draft.classification,
          ...(draft.strategyVersionId ? { strategyVersionId: draft.strategyVersionId } : {}),
          legs: [
            {
              accountId: account.id,
              instrumentVersionId: instrument.versionId,
              direction: draft.direction,
              label: instrument.name,
            },
          ],
        });
      }
      if (!draft.allocationReason.trim())
        throw new Error('Enter an attribution reason for the journal history.');
      setPending({
        mode,
        draft: structuredClone({ ...draft, legId: selectedLegId }),
        account,
        instrument,
        started: false,
        trade: draft.targetTradeId ? (target.data ?? null) : null,
        execution: mode === 'existing' ? (sourceExecution ?? null) : null,
        buckets: new Map(),
        allocation: null,
        result: null,
        sourceAllocationVersion,
      });
      setConfirming(true);
    } catch (error) {
      setFailure(validationMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!pending || busy || pending.result) return;
    const working = { ...pending, buckets: new Map(pending.buckets) };
    const progress = () => setPending({ ...working, buckets: new Map(working.buckets) });
    const commandMap = commands.current;
    setConfirming(false);
    setBusy(true);
    setFailure(null);
    working.started = true;
    progress();
    const write = <Value,>(
      resource: string,
      body: unknown,
      schema: { parse(value: unknown): Value },
      key: string,
    ) => recordWrite(resource, body, schema, retainedCommand(commandMap, key, body));
    async function bucket(
      key: string,
      row: { currencyId: string; bucketId: string; kind: BucketKind },
    ) {
      if (row.bucketId) {
        const existing = catalogs.data?.buckets.find((item) => item.cashBucketId === row.bucketId);
        if (
          !existing ||
          existing.accountId !== working!.account.id ||
          existing.currencyId !== row.currencyId
        )
          throw new Error('Choose a cash bucket matching the account and currency.');
        return row.bucketId;
      }
      if (working!.buckets.has(key)) return working!.buckets.get(key)!;
      const result = await write(
        `${financial}/cash-buckets`,
        {
          accountId: working!.account.id,
          currencyId: row.currencyId,
          kind: row.kind,
        },
        c.cashBucketResponseSchema,
        `bucket:${key}`,
      );
      working!.buckets.set(key, result.id);
      progress();
      return result.id;
    }
    try {
      const frozen = working.draft;
      if (!working.trade) {
        working.trade = await write(
          `${prefix}/journals`,
          c.journalCreateSchema.parse({
            title: frozen.title,
            classification: frozen.classification,
            ...(frozen.strategyVersionId ? { strategyVersionId: frozen.strategyVersionId } : {}),
            legs: [
              {
                accountId: working.account.id,
                instrumentVersionId: working.instrument.versionId,
                direction: frozen.direction,
                label: working.instrument.name,
              },
            ],
          }),
          c.journalDetailResponseSchema,
          'journal',
        );
        progress();
      }
      if (!working.execution) {
        const fees =
          frozen.fee.amount === ''
            ? []
            : [
                {
                  cashBucketId: await bucket('fee', frozen.fee),
                  currencyId: frozen.fee.currencyId,
                  amount: frozen.fee.amount,
                  kind: frozen.feeKind,
                },
              ];
        const manualCashEffects = [];
        if (!usesNativeBooking(working.account, working.instrument) && !frozen.noManualCash)
          for (const [index, row] of frozen.cashEffects.entries())
            manualCashEffects.push({
              cashBucketId: await bucket(`manual:${index}`, row),
              currencyId: row.currencyId,
              amount: row.amount,
            });
        const cashBucketId = usesNativeBooking(working.account, working.instrument)
          ? await bucket('principal', {
              currencyId: working.instrument.settlementCurrencyId!,
              bucketId: frozen.bucketId,
              kind: frozen.bucketKind,
            })
          : undefined;
        const executionBody = c.executionCreateSchema.parse({
          accountId: working.account.id,
          instrumentVersionId: working.instrument.versionId,
          side: frozen.side,
          quantity: frozen.quantity,
          price: frozen.price === '' ? null : frozen.price,
          economicAt: frozen.economicAt,
          orderingKey: frozen.orderingKey,
          costsComplete: frozen.costsComplete,
          fees,
          ...(cashBucketId ? { cashBucketId } : {}),
          ...(!usesNativeBooking(working.account, working.instrument) ? { manualCashEffects } : {}),
        });
        working.execution = await write(
          `${financial}/executions`,
          executionBody,
          c.executionResponseSchema,
          'execution',
        );
        progress();
      }
      if (!working.allocation) {
        const legId = frozen.targetTradeId ? frozen.legId : working.trade.financial.legs[0]?.legId;
        if (!legId)
          throw new Error(
            'The journal was created without a matching leg. Review it before attributing the execution.',
          );
        let version = working.sourceAllocationVersion;
        if (version === null) {
          const allocation = await recordRead(
            `${financial}/executions/${working.execution.id}/allocations`,
            c.executionAllocationResponseSchema,
          );
          if (allocation.allocations.some((item) => item.tradeLegId !== null))
            throw new Error(
              'This execution was attributed elsewhere while recording. Its allocation is preserved; use Advanced financial entry to review it.',
            );
          version = allocation.version;
        }
        working.allocation = c.executionAllocationSchema.parse({
          executionId: working.execution.id,
          expectedVersion: version,
          reason: frozen.allocationReason,
          allocations: [{ tradeLegId: legId, quantity: working.execution.quantity }],
        });
        // Preserve this exact optimistic version/body even if the server commits and its response is lost.
        progress();
      }
      working.result = await write(
        `${financial}/execution-allocations`,
        working.allocation,
        c.allocationMutationResponseSchema,
        'allocation',
      );
      progress();
      await Promise.all([
        client.invalidateQueries({ queryKey: ['journals', workspace.id] }),
        client.invalidateQueries({ queryKey: ['journal-detail', workspace.id] }),
        client.invalidateQueries({ queryKey: ['record-existing-executions', workspace.id] }),
        client.invalidateQueries({ queryKey: ['record-catalogs', workspace.id] }),
      ]);
    } catch (error) {
      setFailure(validationMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function cashInputs(
    row: CashRow,
    onChange: (next: CashRow) => void,
    name: string,
    includeAmount = true,
  ) {
    const choices =
      catalogs.data?.buckets.filter(
        (item) => item.accountId === draft.accountId && item.currencyId === row.currencyId,
      ) ?? [];
    return (
      <>
        <RecordField label={`${name} currency`}>
          {(id) => (
            <select
              id={id}
              value={row.currencyId}
              onChange={(event) =>
                onChange({ ...row, currencyId: event.target.value, bucketId: '' })
              }
              required
            >
              <option value="">Choose currency…</option>
              {catalogs.data?.currencies.map((currency) => (
                <option key={currency.id} value={currency.id}>
                  {currency.code} · {currency.name}
                </option>
              ))}
            </select>
          )}
        </RecordField>
        {includeAmount && (
          <RecordInput
            label={`${name} amount`}
            value={row.amount}
            onChange={(amount) => onChange({ ...row, amount })}
            decimal
            required
            help={
              name === 'Fee'
                ? 'Positive charges reduce cash; negative amounts are rebates. Leave the fee section empty if no fee is known.'
                : 'Copy the signed source cash movement. Positive credits cash; negative debits cash. Do not enter a theoretical notional.'
            }
          />
        )}
        <RecordField label={`${name} cash bucket`}>
          {(id) => (
            <select
              id={id}
              value={row.bucketId}
              onChange={(event) => onChange({ ...row, bucketId: event.target.value })}
            >
              <option value="">Create / use default bucket</option>
              {choices.map((item) => (
                <option key={item.cashBucketId} value={item.cashBucketId}>
                  {item.kind} · current cash {item.amount}
                </option>
              ))}
            </select>
          )}
        </RecordField>
        {!row.bucketId && (
          <RecordField label={`${name} new bucket category`}>
            {(id) => (
              <select
                id={id}
                value={row.kind}
                onChange={(event) => onChange({ ...row, kind: event.target.value as BucketKind })}
              >
                <option value="unsettled">Unsettled</option>
                <option value="settled">Settled</option>
                <option value="restricted">Restricted</option>
                <option value="collateral_cash">Cash collateral</option>
              </select>
            )}
          </RecordField>
        )}
      </>
    );
  }
  const quantity = pending?.execution?.quantity ?? pending?.draft.quantity;
  const summary = pending && (
    <>
      <dl className="record-summary">
        <div>
          <dt>Account</dt>
          <dd>
            {pending.account.name} · {pending.account.environment}
          </dd>
        </div>
        <div>
          <dt>Instrument</dt>
          <dd>
            {pending.instrument.name} · version {pending.instrument.version}
          </dd>
        </div>
        <div>
          <dt>Source execution</dt>
          <dd>
            {pending.execution?.side ?? pending.draft.side} {quantity}{' '}
            {pending.instrument.quantityUnit} at{' '}
            {(pending.execution?.price ?? pending.draft.price) || 'price unknown'}
          </dd>
        </div>
        <div>
          <dt>Economic time</dt>
          <dd>{pending.execution?.economicAt ?? pending.draft.economicAt}</dd>
        </div>
        <div>
          <dt>Trade journal</dt>
          <dd>
            {pending.trade?.trade.title ?? pending.draft.title} ·{' '}
            {pending.draft.targetTradeId ? 'existing trade' : 'new trade'}
          </dd>
        </div>
        <div>
          <dt>Attribution</dt>
          <dd>
            Entire execution quantity {quantity}. Reason: {pending.draft.allocationReason}
          </dd>
        </div>
      </dl>
      {pending.mode === 'record' && (
        <>
          <p>
            {usesNativeBooking(pending.account, pending.instrument)
              ? `The ledger books source quantity and price using the instrument’s validated settlement convention into the selected ${pending.draft.bucketId ? 'existing' : pending.draft.bucketKind} cash bucket.`
              : 'Source recording only: the ledger posts your explicit cash effects; it does not infer derivative or bond notional, P&L, risk or valuation.'}
          </p>
          {!pending.draft.noManualCash &&
            !usesNativeBooking(pending.account, pending.instrument) && (
              <ul>
                {pending.draft.cashEffects.map((row, index) => (
                  <li key={index}>
                    {row.amount}{' '}
                    {catalogs.data?.currencies.find((item) => item.id === row.currencyId)?.code} ·{' '}
                    {row.bucketId ? 'existing bucket' : row.kind}
                  </li>
                ))}
              </ul>
            )}
          <p>
            Fee:{' '}
            {pending.draft.fee.amount
              ? `${pending.draft.fee.amount} ${catalogs.data?.currencies.find((item) => item.id === pending.draft.fee.currencyId)?.code} (${pending.draft.feeKind})`
              : 'none entered'}
            . Cost coverage:{' '}
            {pending.draft.costsComplete ? 'user confirms complete' : 'not confirmed complete'}.
          </p>
        </>
      )}
      <p>
        {pending.mode === 'existing'
          ? 'This action only attributes an existing execution. It creates no duplicate execution or cash booking.'
          : 'Journal creation, execution booking and attribution are separate commands. A later failure does not roll back an earlier successful command.'}{' '}
        No trade is automatically closed.
      </p>
    </>
  );

  return (
    <section className="workspace-main record-main" aria-label="Source execution and trade journal">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Execution and journal</span>
          <h1>Record a trade</h1>
          <a href={'/record?workspace=' + workspace.id + '&mode=advanced'}>
            Advanced financial entry
          </a>
          <p>Record source facts once, then connect the execution to your trading review.</p>
        </div>
      </div>
      {catalogs.isPending && (
        <Panel role="status" aria-busy="true">
          Loading accounts, instruments and cash buckets…
        </Panel>
      )}
      {catalogs.isError && (
        <Panel role="alert">
          <p>Reference records could not be loaded.</p>
          <Button onClick={() => void catalogs.refetch()}>Retry loading</Button>
        </Panel>
      )}
      {catalogs.data && (
        <>
          {!canEdit && (
            <Panel role="status">
              Your workspace role can review trades. Recording and attribution require an editor or
              owner.
            </Panel>
          )}
          {canEdit && !pending?.started && (
            <Panel>
              {(!catalogs.data.accounts.length || !catalogs.data.instruments.length) && (
                <div className="record-notice">
                  <strong>Set up your first trade</strong>
                  <p>
                    Create a currency, an account and an instrument from your source records below.
                    No starting capital is assumed. Then record an execution.
                  </p>
                </div>
              )}
              <CatalogSetup
                prefix={financial}
                currencies={catalogs.data.currencies}
                brokers={catalogs.data.brokers}
                onCreated={() => catalogs.refetch()}
              />
            </Panel>
          )}
          <details className="record-catalog-browser">
            <summary>Search and browse all reference records</summary>
            <p>
              Each search or page loads a bounded set of choices. Explicit selections are retained
              when browsing another page.
            </p>
            <CatalogPager
              label="accounts"
              endpoint={`${financial}/accounts`}
              items={catalogs.data.accounts}
              load={arrayCatalogPage(c.accountResponseSchema.array())}
              disabled={locked}
              onPage={(rows) =>
                client.setQueryData<typeof catalogs.data>(
                  ['record-catalogs', workspace.id],
                  (current) =>
                    current
                      ? {
                          ...current,
                          accounts: pinCatalogPage(current.accounts, rows, [draft.accountId]),
                        }
                      : current,
                )
              }
            />
            <CatalogPager
              label="instruments"
              endpoint={`${financial}/instruments`}
              items={catalogs.data.instruments}
              load={arrayCatalogPage(c.instrumentResponseSchema.array())}
              disabled={locked}
              onPage={(rows) =>
                client.setQueryData<typeof catalogs.data>(
                  ['record-catalogs', workspace.id],
                  (current) =>
                    current
                      ? {
                          ...current,
                          instruments: pinCatalogPage(
                            current.instruments,
                            rows,
                            [draft.instrumentVersionId],
                            (item) => item.versionId,
                          ),
                        }
                      : current,
                )
              }
            />
            <CatalogPager
              label="currencies"
              endpoint={`${financial}/currencies`}
              items={catalogs.data.currencies}
              load={arrayCatalogPage(c.currencyResponseSchema.array())}
              disabled={locked}
              onPage={(rows) =>
                client.setQueryData<typeof catalogs.data>(
                  ['record-catalogs', workspace.id],
                  (current) =>
                    current
                      ? {
                          ...current,
                          currencies: pinCatalogPage(current.currencies, rows, [
                            draft.fee.currencyId,
                            ...draft.cashEffects.map((row) => row.currencyId),
                          ]),
                        }
                      : current,
                )
              }
            />
            <CatalogPager
              label="brokers"
              endpoint={`${financial}/brokers`}
              items={catalogs.data.brokers}
              load={arrayCatalogPage(c.brokerResponseSchema.array())}
              disabled={locked}
              onPage={(rows) =>
                client.setQueryData<typeof catalogs.data>(
                  ['record-catalogs', workspace.id],
                  (current) => (current ? { ...current, brokers: rows } : current),
                )
              }
            />
            <CatalogPager
              label="trades"
              endpoint={`${financial}/trades`}
              items={catalogs.data.trades}
              load={arrayCatalogPage(c.tradeResponseSchema.array())}
              disabled={locked}
              onPage={(rows) =>
                client.setQueryData<typeof catalogs.data>(
                  ['record-catalogs', workspace.id],
                  (current) =>
                    current
                      ? {
                          ...current,
                          trades: pinCatalogPage(current.trades, rows, [draft.targetTradeId]),
                        }
                      : current,
                )
              }
            />
            {strategies.data && (
              <CatalogPager
                label="strategies"
                endpoint={`${prefix}/strategies`}
                items={strategies.data.strategies}
                pageSize={100}
                cursorName="cursor"
                load={objectCatalogPage<c.StrategyResponse>(
                  c.strategyListResponseSchema,
                  'strategies',
                )}
                disabled={locked}
                onPage={(rows) =>
                  client.setQueryData<c.StrategyListResponse>(
                    ['record-strategies', workspace.id],
                    (current) =>
                      current
                        ? {
                            ...current,
                            strategies: pinCatalogPage(current.strategies, rows, [
                              draft.strategyId,
                            ]),
                          }
                        : current,
                  )
                }
              />
            )}
            {draft.strategyId && versions.data && (
              <CatalogPager
                key={draft.strategyId}
                label="strategy versions"
                endpoint={`${prefix}/strategies/${draft.strategyId}/versions`}
                items={versions.data.versions}
                pageSize={100}
                cursorName="cursor"
                search={false}
                load={objectCatalogPage<c.StrategyVersionResponse>(
                  c.strategyVersionListResponseSchema,
                  'versions',
                )}
                disabled={locked}
                onPage={(rows) =>
                  client.setQueryData<c.StrategyVersionListResponse>(
                    ['record-strategy-versions', workspace.id, draft.strategyId],
                    (current) =>
                      current
                        ? {
                            ...current,
                            versions: pinCatalogPage(current.versions, rows, [
                              draft.strategyVersionId,
                            ]),
                          }
                        : current,
                  )
                }
              />
            )}
          </details>
          <Panel>
            <form onSubmit={(event) => void preview(event)}>
              <fieldset disabled={!canEdit || locked || !!pending}>
                <h2>1. Source execution</h2>
                <div className="record-fields">
                  <RecordField label="Recording method">
                    {(id) => (
                      <select
                        id={id}
                        value={mode}
                        onChange={(event) => {
                          setMode(event.target.value as 'record' | 'existing');
                          setFailure(null);
                          change('executionId', '');
                        }}
                      >
                        <option value="record">Record a new execution</option>
                        <option value="existing">Link an imported / existing execution</option>
                      </select>
                    )}
                  </RecordField>
                  <RecordField label="Account">
                    {(id) => (
                      <select
                        id={id}
                        value={draft.accountId}
                        required
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            accountId: event.target.value,
                            bucketId: '',
                            executionId: '',
                            legId: '',
                            costsComplete: false,
                            noManualCash: false,
                            fee: cashRow(),
                            cashEffects: [cashRow()],
                          }))
                        }
                      >
                        <option value="">Choose account…</option>
                        {catalogs.data.accounts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.environment}
                          </option>
                        ))}
                      </select>
                    )}
                  </RecordField>
                  {mode === 'record' ? (
                    <RecordField label="Instrument">
                      {(id) => (
                        <select
                          id={id}
                          value={draft.instrumentVersionId}
                          required
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              instrumentVersionId: event.target.value,
                              bucketId: '',
                              legId: '',
                              costsComplete: false,
                              noManualCash: false,
                              cashEffects: [cashRow()],
                            }))
                          }
                        >
                          <option value="">Choose instrument…</option>
                          {target.data?.financial.legs
                            .filter(
                              (leg) =>
                                leg.accountId === draft.accountId &&
                                !catalogs.data!.instruments.some(
                                  (item) => item.versionId === leg.instrumentVersionId,
                                ),
                            )
                            .map((leg) => (
                              <option key={leg.instrumentVersionId} value={leg.instrumentVersionId}>
                                {leg.instrumentName} · historical version for this trade
                              </option>
                            ))}
                          {catalogs.data.instruments.map((item) => (
                            <option key={item.versionId} value={item.versionId}>
                              {item.name} · v{item.version} ·{' '}
                              {item.capability === 'manual'
                                ? 'source recording only'
                                : 'native delivered'}
                            </option>
                          ))}
                        </select>
                      )}
                    </RecordField>
                  ) : (
                    <RecordField label="Recorded execution">
                      {(id) => (
                        <select
                          id={id}
                          value={draft.executionId}
                          required
                          onChange={(event) => {
                            change('executionId', event.target.value);
                            change('legId', '');
                          }}
                        >
                          <option value="">Choose execution…</option>
                          {executions.data?.pages.flat().map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.economicAt} · {item.side} {item.quantity} ·{' '}
                              {catalogs.data?.instruments.find(
                                (candidate) => candidate.versionId === item.instrumentVersionId,
                              )?.name ?? item.instrumentVersionId}
                            </option>
                          ))}
                        </select>
                      )}
                    </RecordField>
                  )}
                  {mode === 'record' && (
                    <>
                      <RecordField label="Execution side">
                        {(id) => (
                          <select
                            id={id}
                            value={draft.side}
                            onChange={(event) =>
                              change('side', event.target.value as 'buy' | 'sell')
                            }
                          >
                            <option value="buy">Buy</option>
                            <option value="sell">Sell</option>
                          </select>
                        )}
                      </RecordField>
                      <RecordInput
                        label={instrument ? `Quantity (${instrument.quantityUnit})` : 'Quantity'}
                        value={draft.quantity}
                        onChange={(value) => change('quantity', value)}
                        required
                        decimal
                        help="Enter the exact source quantity. Fractional quantities must match the instrument’s quantity increment."
                      />
                      <RecordInput
                        label="Execution price"
                        value={draft.price}
                        onChange={(value) => change('price', value)}
                        decimal
                        required={!!native}
                        help={
                          native
                            ? 'Exact source price per instrument unit. The ledger applies its validated cash settlement rule.'
                            : 'Source quote only; leave unknown prices empty. Signed manual quotes are retained under the instrument convention.'
                        }
                      />
                      <RecordInput
                        label="Executed at (ISO time with offset)"
                        value={draft.economicAt}
                        onChange={(value) => change('economicAt', value)}
                        required
                        help="Include Z or a UTC offset, e.g. 2026-10-14T09:30:00+02:00. Up to six fractional second digits are retained."
                      />
                      <RecordInput
                        label="Source ordering key"
                        value={draft.orderingKey}
                        onChange={(value) => change('orderingKey', value)}
                        required
                        help="Nonnegative integer. Use the actual source ordering for fills at the same instant; this form never changes chronology to force a result."
                      />
                      {native && (
                        <>
                          <RecordField label="Principal cash bucket">
                            {(id) => (
                              <select
                                id={id}
                                value={draft.bucketId}
                                onChange={(event) => change('bucketId', event.target.value)}
                              >
                                <option value="">Create / use default bucket</option>
                                {catalogs.data.buckets
                                  .filter(
                                    (item) =>
                                      item.accountId === draft.accountId &&
                                      item.currencyId === instrument?.settlementCurrencyId,
                                  )
                                  .map((item) => (
                                    <option key={item.cashBucketId} value={item.cashBucketId}>
                                      {item.kind} · current cash {item.amount}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </RecordField>
                          {!draft.bucketId && (
                            <RecordField label="Principal new bucket category">
                              {(id) => (
                                <select
                                  id={id}
                                  value={draft.bucketKind}
                                  onChange={(event) =>
                                    change('bucketKind', event.target.value as BucketKind)
                                  }
                                >
                                  <option value="unsettled">Unsettled</option>
                                  <option value="settled">Settled</option>
                                  <option value="restricted">Restricted</option>
                                  <option value="collateral_cash">Cash collateral</option>
                                </select>
                              )}
                            </RecordField>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
                {mode === 'existing' && (
                  <>
                    {executions.isPending && draft.accountId && (
                      <p role="status">Loading recorded executions…</p>
                    )}
                    {executions.isError && (
                      <p role="alert">
                        Recorded executions could not be loaded.{' '}
                        <Button variant="quiet" onClick={() => void executions.refetch()}>
                          Retry executions
                        </Button>
                      </p>
                    )}
                    {executions.hasNextPage && (
                      <Button
                        variant="secondary"
                        disabled={executions.isFetchingNextPage}
                        onClick={() => void executions.fetchNextPage()}
                      >
                        {executions.isFetchingNextPage ? 'Loading…' : 'Load more executions'}
                      </Button>
                    )}
                    {executions.data && !executions.data.pages.flat().length && (
                      <p>
                        No executions in this account yet.{' '}
                        <a href={`/imports?workspace=${workspace.id}`}>Import a source file</a> or
                        select “Record a new execution”.
                      </p>
                    )}
                    <p>
                      Only fully unassigned executions can be linked here. Existing attribution is
                      preserved. The server checks the latest allocation revision at commit.
                    </p>
                    {sourceExecution && (
                      <p>
                        Source: {sourceExecution.side} {sourceExecution.quantity} at{' '}
                        {sourceExecution.price ?? 'unknown price'} · {sourceExecution.economicAt}.
                        This mode does not book cash again.
                      </p>
                    )}
                  </>
                )}
                {mode === 'record' && instrument && !native && (
                  <>
                    <div className="record-notice">
                      {account?.holdingMode === 'segregated' &&
                      instrument.capability === 'native-linear'
                        ? 'This account uses segregated holdings, so native cash booking and automatic inventory calculations are unavailable in this form.'
                        : 'This instrument supports source recording. Automatic P&L, risk and valuation are unavailable.'}{' '}
                      Enter actual source cash effects; contract notional is not cash.
                    </div>
                    <label className="record-check">
                      <input
                        type="checkbox"
                        checked={draft.noManualCash}
                        onChange={(event) => change('noManualCash', event.target.checked)}
                      />
                      The source confirms this execution has no cash movement.
                    </label>
                    {!draft.noManualCash && (
                      <>
                        {draft.cashEffects.map((row, index) => (
                          <div key={index}>
                            <div className="record-fields">
                              {cashInputs(
                                row,
                                (next) =>
                                  change(
                                    'cashEffects',
                                    draft.cashEffects.map((item, position) =>
                                      position === index ? next : item,
                                    ),
                                  ),
                                `Source cash ${index + 1}`,
                              )}
                            </div>
                            <Button
                              variant="quiet"
                              onClick={() =>
                                change(
                                  'cashEffects',
                                  draft.cashEffects.filter((_, position) => position !== index),
                                )
                              }
                            >
                              Remove cash effect {index + 1}
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="secondary"
                          disabled={draft.cashEffects.length >= 64}
                          onClick={() => change('cashEffects', [...draft.cashEffects, cashRow()])}
                        >
                          Add source cash effect
                        </Button>
                      </>
                    )}
                  </>
                )}
                {mode === 'record' && (
                  <>
                    <details>
                      <summary>Commission or fee (optional)</summary>
                      <p>
                        Add one source charge or rebate. For several charges or complex lot
                        instructions, use the reviewed financial API.
                      </p>
                      <div className="record-fields">
                        <RecordInput
                          label="Fee amount"
                          value={draft.fee.amount}
                          onChange={(value) => change('fee', { ...draft.fee, amount: value })}
                          decimal
                          help="Positive charges reduce cash; negative amounts are rebates. Empty means no fee entered."
                        />
                        {draft.fee.amount !== '' && (
                          <>
                            {cashInputs(draft.fee, (next) => change('fee', next), 'Fee', false)}
                            <RecordInput
                              label="Fee category"
                              value={draft.feeKind}
                              onChange={(value) => change('feeKind', value)}
                              required
                            />
                          </>
                        )}
                      </div>
                    </details>
                    <label className="record-check">
                      <input
                        type="checkbox"
                        checked={draft.costsComplete}
                        onChange={(event) => change('costsComplete', event.target.checked)}
                      />
                      I checked the source and confirm all execution costs are recorded, including
                      when there are no costs. Otherwise net metrics remain incomplete.
                    </label>
                  </>
                )}
                <h2>2. Trade journal</h2>
                <p>
                  A trade is a review campaign, not an order or an individual fill. Connect scaling
                  in or out to the same campaign explicitly.
                </p>
                <div className="record-fields">
                  <RecordField label="Journal destination">
                    {(id) => (
                      <select
                        id={id}
                        value={draft.targetTradeId}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            targetTradeId: event.target.value,
                            legId: '',
                          }))
                        }
                      >
                        <option value="">Create a new trade journal</option>
                        {target.data &&
                          !catalogs.data.trades.some((item) => item.id === target.data.trade.id) &&
                          !target.data.trade.archivedAt &&
                          !['closed', 'canceled'].includes(target.data.trade.status) && (
                            <option value={target.data.trade.id}>
                              {target.data.trade.title} ·{' '}
                              {target.data.trade.status.replaceAll('_', ' ')}
                            </option>
                          )}
                        {catalogs.data.trades
                          .filter(
                            (item) =>
                              !item.archivedAt && !['closed', 'canceled'].includes(item.status),
                          )
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title} · {item.status.replaceAll('_', ' ')}
                            </option>
                          ))}
                      </select>
                    )}
                  </RecordField>
                  {draft.targetTradeId ? (
                    <RecordField label="Matching trade leg">
                      {(id) => (
                        <select
                          id={id}
                          required
                          value={selectedLegId}
                          onChange={(event) => change('legId', event.target.value)}
                        >
                          <option value="">Choose matching leg…</option>
                          {selectedLegs.map((leg) => (
                            <option key={leg.legId} value={leg.legId}>
                              {leg.instrumentName} · {leg.direction} · {leg.accountName}
                            </option>
                          ))}
                        </select>
                      )}
                    </RecordField>
                  ) : (
                    <>
                      <RecordInput
                        label="Trade title"
                        value={draft.title}
                        onChange={(value) => change('title', value)}
                        required
                      />
                      <RecordField label="Campaign direction">
                        {(id) => (
                          <select
                            id={id}
                            value={draft.direction}
                            onChange={(event) =>
                              change('direction', event.target.value as 'long' | 'short')
                            }
                          >
                            <option value="long">Long</option>
                            <option value="short">Short</option>
                          </select>
                        )}
                      </RecordField>
                      <RecordField label="Trade classification">
                        {(id) => (
                          <select
                            id={id}
                            value={draft.classification}
                            onChange={(event) =>
                              change(
                                'classification',
                                event.target.value as 'active-trading' | 'investing',
                              )
                            }
                          >
                            <option value="active-trading">Active trading</option>
                            <option value="investing">Investing</option>
                          </select>
                        )}
                      </RecordField>
                      <RecordField label="Strategy (optional)">
                        {(id) => (
                          <select
                            id={id}
                            value={draft.strategyId}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                strategyId: event.target.value,
                                strategyVersionId: '',
                              }))
                            }
                          >
                            <option value="">Assign later in the journal</option>
                            {strategies.data?.strategies.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.currentVersion.definition.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </RecordField>
                      {draft.strategyId && (
                        <RecordField label="Strategy version used">
                          {(id) => (
                            <select
                              id={id}
                              required
                              value={draft.strategyVersionId}
                              onChange={(event) => change('strategyVersionId', event.target.value)}
                            >
                              <option value="">Choose exact version…</option>
                              {versions.data?.versions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  Version {item.version} · {item.changeReason}
                                </option>
                              ))}
                            </select>
                          )}
                        </RecordField>
                      )}
                    </>
                  )}
                  <RecordInput
                    label="Attribution reason"
                    value={draft.allocationReason}
                    onChange={(value) => change('allocationReason', value)}
                    required
                    help="Explain why this execution belongs to this campaign. The reason is retained with its allocation history."
                  />
                </div>
                {target.isPending && draft.targetTradeId && (
                  <p role="status">Loading selected trade…</p>
                )}
                {target.isError && (
                  <p role="alert">
                    The selected trade could not be loaded.{' '}
                    <Button variant="quiet" onClick={() => void target.refetch()}>
                      Retry trade
                    </Button>
                  </p>
                )}
                {draft.targetTradeId && target.data && !selectedLegs.length && (
                  <p role="status">
                    Choose the account and exact instrument version matching a leg in this trade.
                    Create a separate trade for a different instrument.
                  </p>
                )}
                {strategies.isError && (
                  <p role="status">
                    Strategies could not be loaded. You can assign one later or{' '}
                    <Button variant="quiet" onClick={() => void strategies.refetch()}>
                      retry strategies
                    </Button>
                    .
                  </p>
                )}
                {versions.isPending && draft.strategyId && (
                  <p role="status">Loading strategy versions…</p>
                )}
                {versions.isError && draft.strategyId && (
                  <p role="alert">
                    Strategy versions could not be loaded.{' '}
                    <Button variant="quiet" onClick={() => void versions.refetch()}>
                      Retry versions
                    </Button>
                  </p>
                )}
                <div className="record-actions">
                  <Button
                    type="submit"
                    disabled={!!selectedVersionId && !instrument && historicalInstrument.isPending}
                  >
                    Preview {mode === 'existing' ? 'attribution' : 'record'}
                  </Button>
                  <a href={`/imports?workspace=${workspace.id}`}>Import a file instead</a>
                </div>
              </fieldset>
            </form>
            {!!selectedVersionId && !currentInstrument && historicalInstrument.isPending && (
              <p role="status">Loading pinned instrument conventions…</p>
            )}
            {failure && <p role="alert">{failure}</p>}
          </Panel>
          {pending && (
            <Panel aria-label="Recording progress">
              <h2>
                {pending.result
                  ? 'Trade ready for review'
                  : pending.started
                    ? 'Recording progress'
                    : 'Review source facts'}
              </h2>
              {summary}
              {pending.started && (
                <ol className="record-progress">
                  <li>
                    {pending.trade
                      ? `Journal ready: ${pending.trade.trade.title}`
                      : 'Journal creation awaiting confirmation'}
                  </li>
                  <li>
                    {pending.execution ? (
                      <>
                        Execution recorded: <code>{pending.execution.id}</code>
                      </>
                    ) : (
                      'Execution booking awaiting confirmation'
                    )}
                  </li>
                  <li>
                    {pending.result
                      ? 'Execution attributed to the trade journal'
                      : 'Journal attribution awaiting confirmation'}
                  </li>
                </ol>
              )}
              {pending.started && !pending.result && (
                <div className="record-notice" role="status">
                  Keep this page open. The fields are frozen and retries retain the same command
                  IDs. A confirmed execution is already booked even if journal attribution failed.
                  Check the recorded execution before starting another record; refresh or navigation
                  discards this page’s retry state.
                </div>
              )}
              <div className="record-actions">
                {pending.result ? (
                  <>
                    <a
                      className="button button-primary"
                      href={`/journal?workspace=${workspace.id}&trade=${pending.trade!.trade.id}`}
                    >
                      Review this trade
                    </a>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setPending(null);
                        setDraft(initialDraft(null));
                        commands.current.clear();
                        setFailure(null);
                      }}
                    >
                      Record another execution
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => (pending.started ? void commit() : setConfirming(true))}
                    >
                      {busy
                        ? 'Recording…'
                        : pending.started
                          ? 'Retry remaining steps'
                          : 'Confirm record'}
                    </Button>
                    {!pending.started && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setPending(null);
                          setConfirming(false);
                        }}
                      >
                        Edit source facts
                      </Button>
                    )}
                    {pending.trade && (
                      <a
                        href={`/journal?workspace=${workspace.id}&trade=${pending.trade.trade.id}`}
                      >
                        Open recorded journal
                      </a>
                    )}
                  </>
                )}
              </div>
              {pending.result && (
                <p role="status">
                  Execution and journal attribution confirmed. Review plans, screenshots and lessons
                  in the trade journal. Historical strategy rules stay pinned to the selected
                  version.
                </p>
              )}
            </Panel>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!leaveDestination}
        title={pending?.started ? 'Leave an incomplete recording?' : 'Discard this trade draft?'}
        description={
          pending?.started
            ? 'Successful commands are already saved. Leaving discards this page’s retry identifiers. Review the recorded journal and execution before creating another record.'
            : 'Your unsaved source facts will be discarded. No financial activity has been posted.'
        }
        confirmLabel="Leave page"
        busy={busy}
        onConfirm={() => {
          if (!leaveDestination) return;
          if (leaveContinuation) {
            setLeaveDestination(null);
            setLeaveContinuation(null);
            leaveContinuation();
            return;
          }
          leaving.current = true;
          window.location.assign(leaveDestination);
        }}
        onCancel={() => {
          setLeaveDestination(null);
          setLeaveContinuation(null);
        }}
      />
      <ConfirmDialog
        open={confirming}
        title={
          pending?.mode === 'existing'
            ? 'Attribute this existing execution?'
            : 'Record this execution?'
        }
        description={summary}
        confirmLabel={
          pending?.mode === 'existing' ? 'Confirm attribution' : 'Record execution and attribute'
        }
        busy={busy}
        onConfirm={() => void commit()}
        onCancel={() => {
          setConfirming(false);
          if (!pending?.started) setPending(null);
        }}
      />
    </section>
  );
}
