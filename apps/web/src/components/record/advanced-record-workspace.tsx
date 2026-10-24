'use client';
import * as c from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  advancedOperations,
  advancedRowFields,
  buildAdvancedRecord,
  type AdvancedField,
  type AdvancedRows,
} from './advanced-record-model';
import { FinancialWriteError, recordRead, recordWrite, retainedCommand } from './record-api';
import { RecordField } from './record-fields';
import { CatalogPager, arrayCatalogPage, pinCatalogPage } from './catalog-page';
import { WORKSPACE_NAVIGATION_REQUEST } from '../ux/navigation-request';
import './record.css';

const emptyRows = (): AdvancedRows => ({
  fees: [],
  lots: [],
  allocations: [],
  legs: [],
  effects: [],
});
export function AdvancedRecordWorkspace({ workspace }: { workspace: c.WorkspaceResponse }) {
  const prefix = '/api/v1/workspaces/' + workspace.id + '/financial';
  const client = useQueryClient();
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const [operation, setOperation] = useState('cash-movements');
  const [values, setValues] = useState<Record<string, string>>({ orderingKey: '1' });
  const [rows, setRows] = useState(emptyRows);
  const [preview, setPreview] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    if (!unresolved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const blockNavigation = (event: Event) => {
      event.preventDefault();
      setFailure('Retry the pending confirmation before leaving this record.');
    };
    const blockLink = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]')) {
        event.preventDefault();
        event.stopPropagation();
        setFailure('Retry the pending confirmation before leaving this record.');
      }
    };
    window.addEventListener('click', blockLink, true);
    window.addEventListener(WORKSPACE_NAVIGATION_REQUEST, blockNavigation);
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('click', blockLink, true);
      window.removeEventListener(WORKSPACE_NAVIGATION_REQUEST, blockNavigation);
    };
  }, [unresolved]);
  const [message, setMessage] = useState('');
  const data = useQuery({
    queryKey: ['advanced-record-catalogs', workspace.id],
    queryFn: async () => {
      const [accounts, instruments, currencies, buckets, trades] = await Promise.all([
        recordRead(prefix + '/accounts?limit=200', c.accountResponseSchema.array()),
        recordRead(prefix + '/instruments?limit=200', c.instrumentResponseSchema.array()),
        recordRead(prefix + '/currencies?limit=200', c.currencyResponseSchema.array()),
        recordRead(prefix + '/cash-balances', c.cashBalanceResponseSchema.array()),
        recordRead(prefix + '/trades?limit=200', c.tradeResponseSchema.array()),
      ]);
      return { accounts, instruments, currencies, buckets, trades };
    },
  });
  const executions = useQuery({
    queryKey: ['advanced-executions', workspace.id, values.accountId],
    enabled:
      operation === 'execution-allocations' &&
      c.financialIdSchema.safeParse(values.accountId).success,
    queryFn: () =>
      recordRead(
        prefix + '/executions?accountId=' + values.accountId + '&limit=200',
        c.executionResponseSchema.array(),
      ),
  });
  const positions = useQuery({
    queryKey: ['advanced-source-lots', workspace.id, values.accountId],
    enabled: operation === 'executions' && c.financialIdSchema.safeParse(values.accountId).success,
    queryFn: () =>
      recordRead(
        prefix + '/positions?accountId=' + values.accountId,
        c.positionResponseSchema.array(),
      ),
  });
  const campaign = useQuery({
    queryKey: ['advanced-source-campaign-legs', workspace.id, values.campaignTradeId],
    enabled:
      operation === 'execution-allocations' &&
      c.financialIdSchema.safeParse(values.campaignTradeId).success,
    queryFn: () =>
      recordRead(
        prefix + '/trades/' + values.campaignTradeId + '/legs',
        c.tradeLegResponseSchema.array(),
      ),
  });
  const attribution = useQuery({
    queryKey: ['advanced-source-attribution', workspace.id, values.executionId],
    enabled:
      operation === 'execution-allocations' &&
      c.financialIdSchema.safeParse(values.executionId).success,
    queryFn: () =>
      recordRead(
        prefix + '/executions/' + values.executionId + '/allocations',
        c.executionAllocationResponseSchema,
      ),
  });
  const definition = advancedOperations[operation]!;
  const selectedReferences = [
    ...Object.values(values),
    ...Object.values(rows).flatMap((group) => group.flatMap((row) => Object.values(row))),
  ];
  function referencePager<Value extends { id: string }>(
    label: string,
    endpoint: string,
    items: Value[],
    schema: { parse(input: unknown): Value[] },
    replace: (items: Value[]) => void,
    key?: (item: Value) => string,
    search = true,
  ) {
    return (
      <CatalogPager
        label={label}
        endpoint={endpoint}
        items={items}
        load={arrayCatalogPage(schema)}
        search={search}
        disabled={busy || unresolved}
        onPage={(page) => replace(pinCatalogPage(items, page, selectedReferences, key))}
      />
    );
  }
  function change(key: string, value: string) {
    setValues((old) => ({ ...old, [key]: value }));
    setPreview(null);
    setMessage('');
  }
  function choices(field: AdvancedField): { id: string; label: string }[] {
    if (field.options)
      return field.options.map((value) => ({ id: value, label: value.replaceAll('_', ' ') }));
    if (!data.data || !field.catalog) return [];
    if (field.catalog === 'lots')
      return (positions.data ?? []).flatMap((position) =>
        position.inventory.lots.map((lot) => ({
          id: lot.id,
          label:
            (data.data!.instruments.find((instrument) => instrument.id === position.instrumentId)
              ?.name ?? position.instrumentId) +
            ' · ' +
            lot.direction +
            ' · remaining ' +
            lot.remainingQuantity +
            ' · source ' +
            lot.sourceId,
        })),
      );
    if (field.catalog === 'trades')
      return data.data.trades.map((trade) => ({ id: trade.id, label: trade.title }));
    if (field.catalog === 'campaign-legs')
      return (campaign.data ?? []).map((leg) => ({
        id: leg.id,
        label: leg.label + ' · ' + leg.direction,
      }));
    if (field.catalog === 'accounts')
      return data.data.accounts.map((row) => ({ id: row.id, label: row.name }));
    if (field.catalog === 'instruments')
      return data.data.instruments.map((row) => ({
        id: row.versionId,
        label: row.name + ' · v' + row.version,
      }));
    if (field.catalog === 'currencies')
      return data.data.currencies.map((row) => ({
        id: row.id,
        label: row.code + ' · ' + row.name,
      }));
    if (field.catalog === 'executions')
      return (executions.data ?? []).map((row) => ({
        id: row.id,
        label: row.side + ' ' + row.quantity + ' · ' + row.id,
      }));
    return data.data.buckets.map((row) => ({
      id: row.cashBucketId,
      label:
        (data.data!.accounts.find((account) => account.id === row.accountId)?.name ??
          row.accountId) +
        ' · ' +
        (data.data!.currencies.find((currency) => currency.id === row.currencyId)?.code ??
          row.currencyId) +
        ' · ' +
        row.kind,
    }));
  }
  function input(field: AdvancedField, value: string, update: (value: string) => void) {
    const options = choices(field);
    return (
      <RecordField
        key={field.key}
        label={field.label}
        {...(field.catalog && !field.options
          ? {
              help: 'Choose a record or enter its source reference. Historical references remain usable.',
            }
          : {})}
      >
        {(id, helpId) =>
          field.checked ? (
            <input
              id={id}
              type="checkbox"
              checked={value === 'true'}
              onChange={(event) => update(String(event.target.checked))}
              aria-describedby={helpId}
            />
          ) : field.options ? (
            <select
              id={id}
              value={value}
              onChange={(event) => update(event.target.value)}
              required={!field.optional}
            >
              <option value="">Choose…</option>
              {options.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                id={id}
                list={field.catalog ? id + '-options' : undefined}
                value={value}
                onChange={(event) => update(event.target.value)}
                required={!field.optional}
                maxLength={512}
                aria-describedby={helpId}
                autoComplete="off"
              />
              {field.catalog && (
                <datalist id={id + '-options'}>
                  {options.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </datalist>
              )}
            </>
          )
        }
      </RecordField>
    );
  }
  function review(event: FormEvent) {
    event.preventDefault();
    setFailure('');
    setMessage('');
    try {
      setPreview(buildAdvancedRecord(operation, values, rows));
    } catch (error) {
      setFailure(
        error instanceof c.ZodError
          ? error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message).join(' ')
          : error instanceof Error
            ? error.message
            : 'Review the source fields.',
      );
    }
  }
  async function submit() {
    if (busy || !preview || workspace.role === 'viewer') return;
    setBusy(true);
    setFailure('');
    try {
      await recordWrite(
        prefix + '/' + operation,
        preview,
        definition.response,
        retainedCommand(commands.current, operation, preview),
      );
      setMessage('Recorded successfully. Financial history and source references are retained.');
      setUnresolved(false);
      setPreview(null);
      // A deliberate new record must have a new command; interrupted retries keep the previous one.
      commands.current.delete(operation);
      setValues({ orderingKey: '1' });
      setRows(emptyRows());
      await client.invalidateQueries();
    } catch (error) {
      setUnresolved(error instanceof FinancialWriteError && error.outcome === 'unknown');
      setFailure(error instanceof Error ? error.message : 'The record could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Advanced financial entry</h1>
          <p>Record actual source facts, cash and allocation separately. No trade is placed.</p>
          <a href={'/record?workspace=' + workspace.id}>Guided trade entry</a>
        </div>
      </div>
      <Panel>
        <p>
          Amounts and quantities preserve their decimal text. Supply timestamps with a source
          offset, for example 2026-01-01T12:00:00+01:00. Unknown opening basis stays unknown.
          Negative manual prices are validated against the instrument convention.
        </p>
        {data.isPending && <p role="status">Loading references…</p>}
        {data.isError && (
          <p role="alert">Reference suggestions could not be loaded. Reload before recording.</p>
        )}
        {workspace.role === 'viewer' && (
          <p role="note">
            Viewer access can inspect this form; editor access is required to record.
          </p>
        )}
        {data.data && (
          <details>
            <summary>Browse source references</summary>
            {referencePager(
              'accounts',
              prefix + '/accounts',
              data.data.accounts,
              c.accountResponseSchema.array(),
              (accounts) =>
                client.setQueryData(['advanced-record-catalogs', workspace.id], {
                  ...data.data!,
                  accounts,
                }),
            )}
            {referencePager(
              'instrument versions',
              prefix + '/instruments',
              data.data.instruments,
              c.instrumentResponseSchema.array(),
              (instruments) =>
                client.setQueryData(['advanced-record-catalogs', workspace.id], {
                  ...data.data!,
                  instruments,
                }),
              (item) => item.versionId,
            )}
            {referencePager(
              'currencies',
              prefix + '/currencies',
              data.data.currencies,
              c.currencyResponseSchema.array(),
              (currencies) =>
                client.setQueryData(['advanced-record-catalogs', workspace.id], {
                  ...data.data!,
                  currencies,
                }),
            )}
            {referencePager(
              'campaigns',
              prefix + '/trades',
              data.data.trades,
              c.tradeResponseSchema.array(),
              (trades) =>
                client.setQueryData(['advanced-record-catalogs', workspace.id], {
                  ...data.data!,
                  trades,
                }),
            )}
            {operation === 'execution-allocations' &&
              executions.data &&
              referencePager(
                'source executions',
                prefix + '/executions?accountId=' + values.accountId,
                executions.data,
                c.executionResponseSchema.array(),
                (page) =>
                  client.setQueryData(
                    ['advanced-executions', workspace.id, values.accountId],
                    page,
                  ),
                undefined,
                false,
              )}
          </details>
        )}
        <form onSubmit={review}>
          <fieldset disabled={busy || unresolved || workspace.role === 'viewer'}>
            <RecordField label="Record type">
              {(id) => (
                <select
                  id={id}
                  value={operation}
                  onChange={(event) => {
                    setOperation(event.target.value);
                    setValues({ orderingKey: '1' });
                    setRows(emptyRows());
                    setPreview(null);
                    setMessage('');
                    setFailure('');
                  }}
                >
                  {Object.entries(advancedOperations).map(([key, op]) => (
                    <option key={key} value={key}>
                      {op.label}
                    </option>
                  ))}
                </select>
              )}
            </RecordField>
            {operation === 'execution-allocations' &&
              input(
                {
                  key: 'accountId',
                  label: 'Filter source executions by account',
                  catalog: 'accounts',
                  optional: true,
                },
                values.accountId ?? '',
                (value) => change('accountId', value),
              )}
            {operation === 'execution-allocations' &&
              input(
                {
                  key: 'campaignTradeId',
                  label: 'Choose campaign for allocation leg suggestions',
                  catalog: 'trades',
                  optional: true,
                },
                values.campaignTradeId ?? '',
                (value) => change('campaignTradeId', value),
              )}
            {positions.isFetching && <p role="status">Loading source lot references…</p>}
            {positions.isError && (
              <p role="alert">
                Source lots could not be loaded. Reload the account before selecting lots.
              </p>
            )}
            {operation === 'executions' && !!positions.data?.length && (
              <details>
                <summary>Available source lots</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Lot reference</th>
                      <th>Source</th>
                      <th>Remaining quantity</th>
                      <th>Direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.data.flatMap((position) =>
                      position.inventory.lots.map((lot) => (
                        <tr key={lot.id}>
                          <td>{lot.id}</td>
                          <td>{lot.sourceId}</td>
                          <td>{lot.remainingQuantity}</td>
                          <td>{lot.direction}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </details>
            )}
            {operation === 'execution-allocations' && campaign.data && (
              <details open>
                <summary>
                  Campaign leg references ·{' '}
                  {data.data?.trades.find((trade) => trade.id === values.campaignTradeId)?.title ??
                    values.campaignTradeId}
                </summary>
                <ul>
                  {campaign.data.map((leg) => (
                    <li key={leg.id}>
                      {leg.label} · {leg.direction} · {leg.id}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {operation === 'execution-allocations' && campaign.isError && (
              <p role="alert">
                Campaign leg references could not load. Retry the campaign selection before
                allocating.
              </p>
            )}
            {operation === 'execution-allocations' && attribution.data && (
              <section aria-label="Current execution allocation">
                <p>Current allocation version: {attribution.data.version}</p>
                <Button
                  variant="secondary"
                  onClick={() => change('expectedVersion', String(attribution.data!.version))}
                >
                  Use current allocation version
                </Button>
                <ul>
                  {attribution.data.allocations.map((row, index) => (
                    <li key={index}>
                      {row.tradeLegId ?? 'Unassigned'} · quantity {row.quantity}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {operation === 'execution-allocations' && attribution.isError && (
              <p role="alert">
                Current allocation could not be loaded. Reload and verify the source execution
                before reassigning.
              </p>
            )}
            <div className="record-fields">
              {definition.fields.map((field) =>
                input(field, values[field.key] ?? '', (value) => change(field.key, value)),
              )}
            </div>
            {definition.rows?.map((kind) => (
              <section key={kind} aria-label={kind + ' rows'}>
                <h2>
                  {
                    {
                      fees: 'Actual charges in their original currencies',
                      lots: 'Explicit source lot selection',
                      allocations: 'Campaign allocations',
                      legs: 'Order legs',
                      effects: 'Explicit manual cash effects',
                    }[kind]
                  }
                </h2>
                {kind === 'allocations' && (
                  <p>
                    Use campaign leg references from the trade detail. Unassigned residual is
                    retained; allocations cannot duplicate the fill.
                  </p>
                )}
                {kind === 'lots' && (
                  <p>
                    Use the source lot references from account inventory. Specific-lot accounts
                    require sufficient eligible quantities.
                  </p>
                )}
                {rows[kind].map((row, index) => (
                  <fieldset key={index} className="record-fields">
                    <legend>
                      {kind} {index + 1}
                    </legend>
                    {advancedRowFields[kind].map((field) =>
                      input(field, row[field.key] ?? '', (value) => {
                        setRows((old) => ({
                          ...old,
                          [kind]: old[kind].map((item, i) =>
                            i === index ? { ...item, [field.key]: value } : item,
                          ),
                        }));
                        setPreview(null);
                      }),
                    )}
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setRows((old) => ({
                          ...old,
                          [kind]: old[kind].filter((_, i) => i !== index),
                        }));
                        setPreview(null);
                      }}
                    >
                      Remove {kind} {index + 1}
                    </Button>
                  </fieldset>
                ))}
                <Button
                  variant="secondary"
                  disabled={
                    rows[kind].length >= (kind === 'fees' || kind === 'effects' ? 64 : 1000)
                  }
                  onClick={() => {
                    setRows((old) => ({ ...old, [kind]: [...old[kind], {}] }));
                    setPreview(null);
                  }}
                >
                  Add{' '}
                  {kind === 'fees'
                    ? 'charge'
                    : kind === 'lots'
                      ? 'lot'
                      : kind === 'allocations'
                        ? 'allocation'
                        : kind === 'legs'
                          ? 'order leg'
                          : 'cash effect'}
                </Button>
              </section>
            ))}
            <div className="record-actions">
              <Button type="submit">Review record</Button>
            </div>
          </fieldset>
        </form>
        {failure && <p role="alert">{failure}</p>}
        {unresolved && (
          <p role="note">
            The record outcome is not confirmed. Source fields are frozen; retry the same
            confirmation to retrieve its recorded result before starting another record.
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!!preview && (
          <section aria-label="Review financial record">
            <h2>Confirm {definition.label.toLowerCase()}</h2>
            <dl className="record-summary">
              {definition.fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>
                    {field.checked
                      ? values[field.key] === 'true'
                        ? 'Yes'
                        : 'No'
                      : choices(field).find((row) => row.id === values[field.key])?.label ||
                        values[field.key] ||
                        'Not supplied'}
                  </dd>
                </div>
              ))}
            </dl>
            {definition.rows?.map((kind) => (
              <div key={kind}>
                <h3>
                  {rows[kind].length} {kind} rows included
                </h3>
                {rows[kind].map((row, index) => (
                  <dl key={index} className="record-summary">
                    {advancedRowFields[kind].map((field) => (
                      <div key={field.key}>
                        <dt>{field.label}</dt>
                        <dd>
                          {choices(field).find((option) => option.id === row[field.key])?.label ||
                            row[field.key] ||
                            'Not supplied'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </div>
            ))}
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? 'Recording…' : 'Confirm and record'}
            </Button>
            <Button variant="quiet" disabled={busy || unresolved} onClick={() => setPreview(null)}>
              Return to source fields
            </Button>
          </section>
        )}
      </Panel>
    </>
  );
}
