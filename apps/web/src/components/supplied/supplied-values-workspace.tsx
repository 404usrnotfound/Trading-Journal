'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountResponseSchema,
  currencyResponseSchema,
  instrumentResponseSchema,
  tradeResponseSchema,
  suppliedComponentCreateSchema,
  suppliedComponentListResponseSchema,
  financialMutationResponseSchema,
  financialIdSchema,
  type SuppliedComponent,
  type SuppliedComponentInput,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { WorkspaceSwitcher } from '../workspace-switcher';
import { RecordField, RecordInput } from '../record/record-fields';
import {
  FinancialWriteError,
  recordRead,
  recordWrite,
  retainedCommand,
} from '../record/record-api';
import { formatJournalTimestamp } from '../journal/journal-time';
import './supplied-values.css';

type Collection = 'accounts' | 'currencies' | 'instruments' | 'trades';
type Reference = { id: string; value: string; label: string; disabled?: boolean };
function parseReferences(collection: Collection, value: unknown): Reference[] {
  if (collection === 'accounts')
    return accountResponseSchema
      .array()
      .parse(value)
      .map((row) => ({ id: row.id, value: row.id, label: `${row.name} · ${row.environment}` }));
  if (collection === 'currencies')
    return currencyResponseSchema
      .array()
      .parse(value)
      .map((row) => ({ id: row.id, value: row.id, label: `${row.code} · ${row.name}` }));
  if (collection === 'instruments')
    return instrumentResponseSchema
      .array()
      .parse(value)
      .map((row) => ({
        id: row.id,
        value: row.versionId,
        label: `${row.name} · v${row.version} · ${row.capability}`,
        disabled: row.capability !== 'manual',
      }));
  return tradeResponseSchema
    .array()
    .parse(value)
    .map((row) => ({ id: row.id, value: row.id, label: `${row.title} · ${row.status}` }));
}

/** One bounded page at a time; selected source identity survives paging and search. */
function ReferencePicker({
  root,
  collection,
  label,
  value,
  onChange,
  disabled,
}: {
  root: string;
  collection: Collection;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const identity = useId();
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<string[]>(['']);
  const [selected, setSelected] = useState<Reference | null>(null);
  const cursor = cursors.at(-1) ?? '';
  const page = useQuery({
    queryKey: ['supplied-reference', root, collection, search, cursor],
    enabled: !disabled,
    queryFn: () => {
      const query = new URLSearchParams({ limit: '25', includeArchived: 'true' });
      if (search.trim()) query.set('search', search.trim());
      if (cursor) query.set('afterId', cursor);
      return recordRead(`${root}/financial/${collection}?${query}`, {
        parse: (input) => parseReferences(collection, input),
      });
    },
  });
  const rows = page.data ?? [];
  return (
    <div>
      <label htmlFor={`${identity}-search`}>Search {label.toLowerCase()}</label>
      <input
        id={`${identity}-search`}
        value={search}
        maxLength={160}
        onChange={(event) => {
          setSearch(event.target.value);
          setCursors(['']);
        }}
      />
      <label htmlFor={`${identity}-select`}>{label}</label>
      <select
        id={`${identity}-select`}
        value={value}
        required
        onChange={(event) => {
          const row = rows.find((item) => item.value === event.target.value);
          setSelected(row ?? null);
          onChange(event.target.value);
        }}
      >
        <option value="">Choose…</option>
        {value && !rows.some((row) => row.value === value) && (
          <option value={value}>
            {selected?.value === value ? selected.label : `Selected reference ${value}`}
          </option>
        )}
        {rows.map((row) => (
          <option key={row.id} value={row.value} disabled={row.disabled}>
            {row.label}
          </option>
        ))}
      </select>
      {page.isError && (
        <p role="alert">
          Reference page could not be loaded.{' '}
          <Button
            type="button"
            onClick={() => {
              void page.refetch();
            }}
          >
            Retry {label.toLowerCase()}
          </Button>
        </p>
      )}
      <Button
        type="button"
        variant="quiet"
        disabled={cursors.length < 2 || page.isFetching}
        onClick={() => setCursors((previous) => previous.slice(0, -1))}
      >
        Previous {label.toLowerCase()}
      </Button>
      <Button
        type="button"
        variant="quiet"
        disabled={rows.length !== 25 || page.isFetching}
        onClick={() => setCursors((previous) => [...previous, rows.at(-1)!.id])}
      >
        Next {label.toLowerCase()}
      </Button>
    </div>
  );
}

export function SuppliedValuesWorkspace({
  workspace,
  workspaces,
}: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
}) {
  const root = `/api/v1/workspaces/${workspace.id}`;
  const endpoint = `${root}/supplied-components/observations`;
  const editor = workspace.role !== 'viewer';
  const queryClient = useQueryClient();
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const [cursors, setCursors] = useState<string[]>(['']);
  const cursor = cursors.at(-1) ?? '';
  const [kind, setKind] = useState<'position-equity' | 'campaign-net-result'>('position-equity');
  const [accountId, setAccountId] = useState('');
  const [instrumentVersionId, setInstrumentVersionId] = useState('');
  const [tradeId, setTradeId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [amount, setAmount] = useState('');
  const [signedQuantity, setSignedQuantity] = useState('');
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString());
  const [source, setSource] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [quality, setQuality] = useState<'broker-reported' | 'manually-verified'>(
    'broker-reported',
  );
  const [valueDefinition, setValueDefinition] = useState<
    'delivered-market-value' | 'residual-contract-equity'
  >('residual-contract-equity');
  const [accrualTreatment, setAccrualTreatment] = useState<
    'included-residual-only' | 'not-applicable'
  >('not-applicable');
  const [resultDefinition, setResultDefinition] = useState<
    'completed-realized-net' | 'lifetime-total-net'
  >('lifetime-total-net');
  const [cashExcluded, setCashExcluded] = useState(false);
  const [collateralExcluded, setCollateralExcluded] = useState(false);
  const [settledPnlExcluded, setSettledPnlExcluded] = useState(false);
  const [unsettledCashExcluded, setUnsettledCashExcluded] = useState(false);
  const [costsComplete, setCostsComplete] = useState(false);
  const [supersedesId, setSupersedesId] = useState('');
  const [review, setReview] = useState<SuppliedComponentInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const observations = useQuery({
    queryKey: ['supplied-observations', workspace.id, cursor],
    enabled: review === null,
    queryFn: () =>
      recordRead(
        `${endpoint}?limit=25${cursor ? `&afterId=${cursor}` : ''}`,
        suppliedComponentListResponseSchema,
      ),
  });
  const historicalVersion = useQuery({
    queryKey: ['supplied-instrument-version', workspace.id, instrumentVersionId],
    enabled:
      kind === 'position-equity' &&
      financialIdSchema.safeParse(instrumentVersionId).success &&
      review === null,
    queryFn: () =>
      recordRead(
        `${root}/financial/instrument-versions/${instrumentVersionId}`,
        instrumentResponseSchema,
      ),
  });
  function prepare(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!observations.data) {
      setError('Load the current source revision before reviewing a supplied component.');
      return;
    }
    if (kind === 'position-equity' && historicalVersion.data?.capability !== 'manual') {
      setError(
        'Load a valid manual instrument convention before reviewing its supplied position value.',
      );
      return;
    }
    const common = {
      amount,
      currencyId,
      observedAt,
      source,
      sourceReference,
      quality,
      expectedSourceRevision: observations.data.sourceRevision,
      ...(supersedesId ? { supersedesId } : {}),
    };
    const input = suppliedComponentCreateSchema.safeParse(
      kind === 'position-equity'
        ? {
            ...common,
            kind,
            accountId,
            instrumentVersionId,
            signedQuantity,
            valueDefinition,
            cashExcluded,
            collateralExcluded,
            settledPnlExcluded,
            unsettledCashExcluded,
            accrualTreatment,
          }
        : { ...common, kind, tradeId, resultDefinition, costsComplete },
    );
    if (!input.success) {
      setError(
        'Complete the source identities, exact decimal amounts, explicit offset timestamp and all required scope attestations before review.',
      );
      return;
    }
    setReview(input.data);
  }
  async function confirm() {
    if (!review || busy || !editor) return;
    setBusy(true);
    setError('');
    try {
      const result = await recordWrite(
        endpoint,
        review,
        financialMutationResponseSchema,
        retainedCommand(commands.current, 'supplied-component', review),
      );
      setUnknown(false);
      setReview(null);
      setSupersedesId('');
      setNotice(
        `Supplied observation recorded. Selection ID: ${result.id}. Explicitly select it in the relevant report to use this source; it posts no cash.`,
      );
      setCursors(['']);
      await queryClient.invalidateQueries({ queryKey: ['supplied-observations', workspace.id] });
    } catch (failure) {
      setUnknown(failure instanceof FinancialWriteError && failure.outcome === 'unknown');
      setError(
        failure instanceof Error ? failure.message : 'The observation could not be confirmed.',
      );
    } finally {
      setBusy(false);
    }
  }
  function correct(observation: SuppliedComponent) {
    const input = observation.sourceInput;
    setKind(input.kind);
    setCurrencyId(input.currencyId);
    setAmount(input.amount);
    setObservedAt(input.observedAt);
    setSource(input.source);
    setSourceReference(input.sourceReference);
    setQuality(input.quality);
    setSupersedesId(observation.id);
    if (input.kind === 'position-equity') {
      setAccountId(input.accountId);
      setInstrumentVersionId(input.instrumentVersionId);
      setSignedQuantity(input.signedQuantity);
      setValueDefinition(input.valueDefinition);
      setAccrualTreatment(input.accrualTreatment);
      setCashExcluded(false);
      setCollateralExcluded(false);
      setSettledPnlExcluded(false);
      setUnsettledCashExcluded(false);
    } else {
      setTradeId(input.tradeId);
      setResultDefinition(input.resultDefinition);
      setCostsComplete(false);
    }
    setError('');
    setNotice(
      'Review the replacement source and reconfirm its definition. The original observation remains immutable.',
    );
  }
  return (
    <div className="supplied-values">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SOURCED ANALYSIS</div>
          <h1>Supplied component values</h1>
          <p>
            Retain reviewed manual position equity or campaign results with their definitions and
            provenance. Explicit report selection replaces one compatible component and never posts
            a second cash effect.
          </p>
        </div>
      </div>
      {workspaces.length > 1 && (
        <WorkspaceSwitcher selected={workspace.id} workspaces={workspaces} />
      )}
      {editor ? (
        <Panel>
          <h2>Record a supplied component</h2>
          <p>
            Source revision: {observations.data?.sourceRevision ?? 'loading'}. Position values
            require a manual instrument convention and matching signed quantity at the observation
            boundary.
          </p>
          <form onSubmit={prepare}>
            <fieldset disabled={busy || review !== null}>
              <RecordField label="Component kind">
                {(id) => (
                  <select
                    id={id}
                    value={kind}
                    onChange={(event) => {
                      setKind(event.target.value as typeof kind);
                      setSupersedesId('');
                    }}
                  >
                    <option value="position-equity">Position residual equity</option>
                    <option value="campaign-net-result">Campaign net result</option>
                  </select>
                )}
              </RecordField>
              {kind === 'position-equity' ? (
                <>
                  <ReferencePicker
                    root={root}
                    collection="accounts"
                    label="Account"
                    value={accountId}
                    onChange={setAccountId}
                    disabled={busy || review !== null}
                  />
                  <ReferencePicker
                    root={root}
                    collection="instruments"
                    label="Manual instrument version"
                    value={instrumentVersionId}
                    onChange={setInstrumentVersionId}
                    disabled={busy || review !== null}
                  />
                  <RecordInput
                    label="Instrument version ID"
                    value={instrumentVersionId}
                    onChange={setInstrumentVersionId}
                    help="A retained historical version may be entered directly. The server verifies its convention, effective time and holding scope."
                    required
                  />
                  <RecordInput
                    label="Signed holding quantity"
                    value={signedQuantity}
                    onChange={setSignedQuantity}
                    decimal
                    required
                    help="Use the exact observed position quantity; long is positive and short is negative."
                  />
                  {historicalVersion.data && (
                    <p>
                      Selected convention: {historicalVersion.data.name}, version{' '}
                      {historicalVersion.data.version}, {historicalVersion.data.capability};
                      effective{' '}
                      {formatJournalTimestamp(
                        historicalVersion.data.effectiveAt,
                        workspace.timezone,
                      )}
                      .
                    </p>
                  )}
                  {historicalVersion.isError && (
                    <p role="alert">
                      The instrument version could not be verified. Check the retained source
                      version and try again.
                    </p>
                  )}
                  <RecordField label="Position value definition">
                    {(id) => (
                      <select
                        id={id}
                        value={valueDefinition}
                        onChange={(event) =>
                          setValueDefinition(event.target.value as typeof valueDefinition)
                        }
                      >
                        <option value="residual-contract-equity">Residual contract equity</option>
                        <option value="delivered-market-value">Delivered market value</option>
                      </select>
                    )}
                  </RecordField>
                  <RecordField label="Accrual treatment">
                    {(id) => (
                      <select
                        id={id}
                        value={accrualTreatment}
                        onChange={(event) =>
                          setAccrualTreatment(event.target.value as typeof accrualTreatment)
                        }
                      >
                        <option value="not-applicable">No applicable accruals</option>
                        <option value="included-residual-only">
                          Accruals included only in residual value
                        </option>
                      </select>
                    )}
                  </RecordField>
                  <p>
                    Confirm each exclusion from the supplied position amount to avoid counting cash
                    twice:
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={cashExcluded}
                      onChange={(event) => setCashExcluded(event.target.checked)}
                    />
                    Ledger cash excluded
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={collateralExcluded}
                      onChange={(event) => setCollateralExcluded(event.target.checked)}
                    />
                    Collateral balances excluded
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settledPnlExcluded}
                      onChange={(event) => setSettledPnlExcluded(event.target.checked)}
                    />
                    Settled P&amp;L excluded
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={unsettledCashExcluded}
                      onChange={(event) => setUnsettledCashExcluded(event.target.checked)}
                    />
                    Unsettled cash claims excluded
                  </label>
                </>
              ) : (
                <>
                  <ReferencePicker
                    root={root}
                    collection="trades"
                    label="Campaign"
                    value={tradeId}
                    onChange={setTradeId}
                    disabled={busy || review !== null}
                  />
                  <RecordField label="Campaign result definition">
                    {(id) => (
                      <select
                        id={id}
                        value={resultDefinition}
                        onChange={(event) =>
                          setResultDefinition(event.target.value as typeof resultDefinition)
                        }
                      >
                        <option value="lifetime-total-net">Lifetime total net result</option>
                        <option value="completed-realized-net">
                          Completed realized net result
                        </option>
                      </select>
                    )}
                  </RecordField>
                  <label>
                    <input
                      type="checkbox"
                      checked={costsComplete}
                      onChange={(event) => setCostsComplete(event.target.checked)}
                    />
                    All relevant campaign costs are included
                  </label>
                  <p>
                    These values apply only to campaigns containing a manual instrument leg.
                    Completed results require a current confirmed campaign closure.
                  </p>
                </>
              )}
              <ReferencePicker
                root={root}
                collection="currencies"
                label="Value currency"
                value={currencyId}
                onChange={setCurrencyId}
                disabled={busy || review !== null}
              />
              <RecordInput
                label="Supplied amount"
                value={amount}
                onChange={setAmount}
                decimal
                required
                help="Exact signed decimal in the selected monetary unit; no automatic rounding."
              />
              <RecordInput
                label="Observation timestamp"
                value={observedAt}
                onChange={setObservedAt}
                required
                help="ISO timestamp with Z or an explicit UTC offset, retaining at most six fractional second digits."
              />
              <RecordInput label="Source name" value={source} onChange={setSource} required />
              <RecordField label="Source reference and evidence">
                {(id) => (
                  <textarea
                    id={id}
                    value={sourceReference}
                    maxLength={4000}
                    required
                    onChange={(event) => setSourceReference(event.target.value)}
                  />
                )}
              </RecordField>
              <RecordField label="Evidence quality">
                {(id) => (
                  <select
                    id={id}
                    value={quality}
                    onChange={(event) => setQuality(event.target.value as typeof quality)}
                  >
                    <option value="broker-reported">Broker reported</option>
                    <option value="manually-verified">Manually verified</option>
                  </select>
                )}
              </RecordField>
              {supersedesId && (
                <p>
                  Correcting immutable observation {supersedesId}.{' '}
                  <Button type="button" variant="quiet" onClick={() => setSupersedesId('')}>
                    Create independently instead
                  </Button>
                </p>
              )}
              <Button
                type="submit"
                disabled={
                  !observations.data || (kind === 'position-equity' && historicalVersion.isFetching)
                }
              >
                Review supplied observation
              </Button>
            </fieldset>
          </form>
          {review && (
            <section aria-label="Supplied observation review">
              <h3>Review source and definition</h3>
              <p>
                Financial revision {review.expectedSourceRevision}; {review.kind}; {review.amount}{' '}
                in currency {review.currencyId}; observation time {review.observedAt}.
              </p>
              <pre>{JSON.stringify(review, null, 2)}</pre>
              <p>
                Recording retains source evidence only. Report use requires explicit compatible
                selection; cash remains separate.
              </p>
              <Button
                onClick={() => {
                  void confirm();
                }}
                disabled={busy}
              >
                {busy ? 'Confirming source…' : 'Confirm supplied observation'}
              </Button>
              <Button
                variant="secondary"
                disabled={busy || unknown}
                onClick={() => {
                  setReview(null);
                  setError('');
                }}
              >
                Return to source fields
              </Button>
            </section>
          )}
        </Panel>
      ) : (
        <p>
          Your role can inspect supplied observations. Editor access is required to record or
          supersede a source.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <Panel>
        <h2>Retained supplied observations</h2>
        {observations.isError && (
          <p role="alert">
            Supplied observations could not load.{' '}
            <Button
              onClick={() => {
                void observations.refetch();
              }}
            >
              Retry observations
            </Button>
          </p>
        )}
        {observations.data?.items.length === 0 && (
          <p>No supplied component observations have been recorded.</p>
        )}
        {observations.data && (
          <div className="dashboard-table-scroll">
            <table>
              <caption>Immutable source evidence and report selection identities</caption>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Scope</th>
                  <th>Value</th>
                  <th>Evidence</th>
                  <th>Revision and selection</th>
                </tr>
              </thead>
              <tbody>
                {observations.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.kind}
                      <small>{item.definitionVersion}</small>
                    </td>
                    <td>
                      {item.scopeLabel ??
                        (item.accountId
                          ? `Account ${item.accountId}; instrument version ${item.instrumentVersionId}; quantity ${item.signedQuantity}`
                          : `Campaign ${item.tradeId}`)}
                    </td>
                    <td>
                      {item.amount} · {item.currencyCode ?? item.currencyId}
                    </td>
                    <td>
                      {item.source} · {item.quality}
                      <p>{item.sourceReference}</p>
                      <time dateTime={item.observedAt}>
                        {formatJournalTimestamp(item.observedAt, workspace.timezone)}
                      </time>
                    </td>
                    <td>
                      Basis {item.basisRevision}; recorded {item.sourceRevision}
                      <p>
                        Selection ID: <code>{item.id}</code>
                      </p>
                      {item.supersedesId && <p>Supersedes {item.supersedesId}</p>}
                      <p>
                        <a
                          href={`${item.kind === 'position-equity' ? '/accounts' : '/dashboard'}?${new URLSearchParams({ workspace: workspace.id, currency: item.currencyId, [item.kind === 'position-equity' ? 'suppliedPositionIds' : 'suppliedCampaignResultIds']: item.id, ...(item.accountId ? { accountIds: item.accountId } : {}) })}`}
                        >
                          Review report with this source selected
                        </a>
                      </p>
                      {editor && (
                        <Button
                          disabled={busy || review !== null}
                          variant="quiet"
                          onClick={() => correct(item)}
                        >
                          Correct this observation
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button
          disabled={cursors.length < 2 || busy || review !== null || observations.isFetching}
          variant="secondary"
          onClick={() => setCursors((previous) => previous.slice(0, -1))}
        >
          Previous observations
        </Button>
        <Button
          disabled={
            !observations.data?.nextCursor || busy || review !== null || observations.isFetching
          }
          variant="secondary"
          onClick={() => setCursors((previous) => [...previous, observations.data!.nextCursor!])}
        >
          Next observations
        </Button>
        <p>
          Sources are never selected automatically. Superseded or stale evidence remains retained;
          the report verifies current financial facts, definition, quantity, age and scope before
          using any selected component.
        </p>
      </Panel>
    </div>
  );
}
