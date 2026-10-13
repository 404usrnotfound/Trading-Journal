'use client';
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as c from '@journal/contracts';
import { Button, Panel } from '@journal/ui';

type Workspace = c.WorkspaceResponse;
type Field = c.ImportMapping['fields'][number];
const names: Record<c.ImportKind, string> = {
  cash_movement: 'Cash movement',
  execution: 'Fill',
  fee: 'Fee',
  fx_conversion: 'FX conversion',
  opening_lot: 'Opening holding',
  instrument: 'Instrument',
  order: 'Order',
  price: 'Price observation',
  fx_rate: 'FX observation',
  account_valuation: 'Account valuation',
  income: 'Income',
  tax: 'Tax',
  expense: 'Financing expense',
  execution_cash: 'Fill cash reference',
};
class ImportRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
async function read<T>(path: string, schema: { parse(value: unknown): T }, body?: unknown) {
  let headers: Record<string, string> = {};
  if (body !== undefined) {
    const session = await fetch('/api/auth/session'),
      proof = session.headers.get('x-csrf-token');
    if (!proof) throw new Error('Refresh your session before changing an import.');
    headers = {
      'content-type': 'application/json',
      origin: location.origin,
      'x-csrf-token': proof,
      'idempotency-key': crypto.randomUUID(),
    };
  }
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const problem = c.problemResponseSchema.safeParse(value);
    throw new ImportRequestError(
      problem.success ? problem.data.detail : 'The import request could not be completed.',
      problem.success ? problem.data.code : 'REQUEST_FAILED',
    );
  }
  return schema.parse(value);
}
function initialFields(kind: c.ImportKind): Field[] {
  const field = (
    target: string,
    column: string,
    transform: Field['transform'] = 'text',
  ): Field => ({ target, column, transform, empty: 'omit' });
  const constant = (target: string, value: string): Field => ({
    target,
    constant: value,
    transform: 'text',
    empty: 'omit',
  });
  const date = field(
    ['price', 'fx_rate', 'account_valuation'].includes(kind) ? 'observedAt' : 'economicAt',
    'Date',
    'instant',
  );
  if (kind === 'execution')
    return [
      date,
      field('orderingKey', 'Sequence'),
      field('side', 'Side'),
      field('quantity', 'Quantity', 'decimal'),
      field('price', 'Price', 'decimal'),
      constant('instrumentVersionId', ''),
      { target: 'costsComplete', constant: false, transform: 'boolean', empty: 'omit' },
    ];
  if (kind === 'cash_movement')
    return [
      date,
      constant('orderingKey', '1'),
      field('amount', 'Amount', 'decimal'),
      constant('currencyId', ''),
      constant('kind', 'deposit'),
    ];
  if (kind === 'opening_lot')
    return [
      date,
      field('orderingKey', 'Sequence'),
      constant('instrumentVersionId', ''),
      field('quantity', 'Quantity', 'decimal'),
      constant('direction', 'long'),
      constant('reason', 'Reviewed opening holdings; historical fills not supplied'),
    ];
  if (kind === 'account_valuation')
    return [
      date,
      field('amount', 'Amount', 'decimal'),
      constant('currencyId', ''),
      constant('source', 'Broker statement'),
      constant('definition', 'broker-reported-net-liquidation-value'),
    ];
  return [date, field('amount', 'Amount', 'decimal')];
}
export function ImportWorkspace({
  workspace,
  workspaces,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
}) {
  const id = useId(),
    client = useQueryClient(),
    prefix = `/api/v1/workspaces/${workspace.id}/imports`,
    canEdit = workspace.role !== 'viewer';
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const catalog = useQuery({
      queryKey: ['import-catalog', workspace.id],
      queryFn: () => read(`${prefix}/catalog`, c.importCatalogResponseSchema),
    }),
    templates = useQuery({
      queryKey: ['import-templates', workspace.id],
      queryFn: () => read(`${prefix}/templates`, c.importTemplatesResponseSchema),
    }),
    history = useQuery({
      queryKey: ['import-history', workspace.id, historyCursor],
      queryFn: () =>
        read(
          `${prefix}/batches${historyCursor ? `?cursor=${historyCursor}` : ''}`,
          c.importHistoryResponseSchema,
        ),
    });
  const [account, setAccount] = useState(''),
    [namespace, setNamespace] = useState(''),
    [file, setFile] = useState<{ name: string; text: string } | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<c.ImportKind>('cash_movement'),
    [adapter, setAdapter] = useState('generic-csv'),
    [adapterVersion, setAdapterVersion] = useState('1'),
    [fields, setFields] = useState<Field[]>(initialFields('cash_movement')),
    [delimiter, setDelimiter] = useState<c.ImportMapping['conventions']['delimiter']>(','),
    [decimal, setDecimal] = useState<'.' | ','>('.'),
    [grouping, setGrouping] =
      useState<c.ImportMapping['conventions']['thousandsSeparator']>('none'),
    [dateFormat, setDateFormat] = useState<c.ImportMapping['conventions']['dateFormat']>('iso'),
    [timezone, setTimezone] = useState(workspace.timezone),
    [sourceColumn, setSourceColumn] = useState('ID'),
    [groupColumn, setGroupColumn] = useState(''),
    [template, setTemplate] = useState<c.ImportTemplateResponse | null>(null),
    [editingTemplate, setEditingTemplate] = useState<c.ImportTemplateResponse | null>(null),
    [advanced, setAdvanced] = useState<c.ImportMapping | null>(null),
    [advancedText, setAdvancedText] = useState(''),
    [templateName, setTemplateName] = useState(''),
    [batch, setBatch] = useState<c.ImportBatchResponse | null>(null),
    [cursor, setCursor] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState<c.ImportPreviewResponse | null>(null),
    [ack, setAck] = useState(false),
    [corrections, setCorrections] = useState<Record<string, string>>({}),
    [reason, setReason] = useState('');
  const detail = useQuery({
    queryKey: ['import-detail', workspace.id, batch?.id, cursor],
    enabled: !!batch,
    queryFn: () =>
      read(`${prefix}/batches/${batch!.id}?cursor=${cursor}`, c.importBatchDetailSchema),
  });
  const current = detail.data?.batch ?? batch,
    rows = review?.rows ?? detail.data?.rows ?? [];
  const data = catalog.data;
  function draftMapping() {
    return {
      adapterId: adapter,
      adapterVersion,
      kind,
      fields: adapter === 'generic-csv' ? fields : [],
      conventions: {
        delimiter,
        decimalSeparator: decimal,
        thousandsSeparator: grouping,
        dateFormat,
        timezone,
      },
      ...(sourceColumn ? { sourceIdColumn: sourceColumn } : {}),
      ...(groupColumn ? { groupColumn } : {}),
    };
  }
  function mapping() {
    return c.importMappingSchema.parse(advanced ?? draftMapping());
  }
  async function run(operation: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await operation();
    } catch (value) {
      if (
        value instanceof ImportRequestError &&
        ['STALE_IMPORT_PREVIEW', 'IMPORT_REVIEW_REQUIRED', 'IMPORT_REVISION_CONFLICT'].includes(
          value.code,
        )
      ) {
        setReview(null);
        setAck(false);
        await refresh();
      }
      setError(value instanceof Error ? value.message : 'The import could not be completed.');
    } finally {
      setBusy(false);
    }
  }
  function applyMapping(map: c.ImportMapping) {
    setKind(map.kind);
    setAdapter(map.adapterId);
    setAdapterVersion(map.adapterVersion);
    setFields(map.fields);
    setDelimiter(map.conventions.delimiter);
    setDecimal(map.conventions.decimalSeparator);
    setGrouping(map.conventions.thousandsSeparator);
    setDateFormat(map.conventions.dateFormat);
    setTimezone(map.conventions.timezone);
    setSourceColumn(map.sourceIdColumn ?? '');
    setGroupColumn(map.groupColumn ?? '');
    setAdvanced(map);
  }
  function loadTemplate(value: c.ImportTemplateResponse | null) {
    setTemplate(value);
    setEditingTemplate(value);
    if (!value) {
      setAdvanced(null);
      return;
    }
    applyMapping(value.mapping);
    setTemplateName(value.name);
  }

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['import-history', workspace.id] }),
      client.invalidateQueries({ queryKey: ['import-detail', workspace.id] }),
    ]);
  }
  function open(value: c.ImportBatchResponse) {
    setBatch(value);
    setCursor(0);
    setSelected([]);
    setReview(value.preview);
    setCorrections({});
    setAck(false);
  }
  function summary(row: c.ImportRowResponse) {
    const payload = row.payload;
    if (!payload) return 'Unmapped / invalid record';
    return (
      ['amount', 'quantity', 'price', 'sourceAmount', 'destinationAmount', 'rate', 'side', 'kind']
        .filter((key) => payload[key] !== undefined)
        .map((key) => `${key}: ${String(payload[key])}`)
        .join(' · ') || names[row.kind ?? 'cash_movement']
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SOURCE → REVIEW → LEDGER</div>
          <h1>Imports & reconciliation</h1>
          <p>Review broker activity before it changes your financial records.</p>
        </div>
      </div>
      <nav className="journal-mobile-nav" aria-label="Mobile page navigation">
        <a href={`/?workspace=${workspace.id}`}>Overview</a>
        <a href={`/dashboard?workspace=${workspace.id}`}>Dashboard</a>
        <a href={`/strategies?workspace=${workspace.id}`}>Strategies</a>
        <a href={`/journal?workspace=${workspace.id}`}>Trade journal</a>
        <a href={`/imports?workspace=${workspace.id}`} aria-current="page">
          Imports
        </a>
      </nav>
      {workspaces.length > 1 && (
        <div className="journal-field">
          <label htmlFor={`${id}-workspace`}>Workspace</label>
          <select
            id={`${id}-workspace`}
            value={workspace.id}
            onChange={(event) => location.assign(`/imports?workspace=${event.target.value}`)}
          >
            {workspaces.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {(error || catalog.error || templates.error || history.error || detail.error) && (
        <Panel role="alert">
          <p>
            {error ?? (catalog.error ?? templates.error ?? history.error ?? detail.error)?.message}
          </p>
        </Panel>
      )}
      {!canEdit && (
        <Panel>
          <p>You have viewer access. Source files and import history are read-only.</p>
        </Panel>
      )}
      {canEdit && (
        <Panel className="import-setup">
          <h2>1. Source and mapping</h2>
          <p className="muted">
            UTF-8 CSV · up to 2 MiB and 1,000 rows. Commit complete groups of at most 100 rows at a
            time.
          </p>
          <div className="import-fields">
            <div className="journal-field">
              <label htmlFor={`${id}-account`}>Account</label>
              <select
                id={`${id}-account`}
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                  setNamespace(
                    data?.accounts.find((item) => item.id === event.target.value)?.namespace ?? '',
                  );
                }}
              >
                <option value="">Choose an account</option>
                {data?.accounts.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-namespace`}>Broker source namespace</label>
              <input
                id={`${id}-namespace`}
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
              />
              <small className="muted">Keep this stable across statement reimports.</small>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-file`}>Broker CSV file</label>
              <input
                id={`${id}-file`}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const value = event.target.files?.[0];
                  if (!value) return;
                  void run(async () => {
                    if (value.size > c.IMPORT_LIMITS.fileBytes)
                      throw new Error('Choose a CSV up to 2 MiB.');
                    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
                      await value.arrayBuffer(),
                    );
                    setFile({ name: value.name, text });
                    setTemplate(null);
                    setAdvanced(null);
                  });
                }}
              />
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-template`}>Saved mapping</label>
              <select
                id={`${id}-template`}
                value={editingTemplate?.id ?? ''}
                onChange={(event) =>
                  loadTemplate(
                    templates.data?.items.find((value) => value.id === event.target.value) ?? null,
                  )
                }
              >
                <option value="">Custom mapping</option>
                {templates.data?.items
                  .filter((value) => !value.archived)
                  .map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name} · v{value.version}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="import-fields">
            <div className="journal-field">
              <label htmlFor={`${id}-adapter`}>Importer</label>
              <select
                id={`${id}-adapter`}
                value={`${adapter}@${adapterVersion}`}
                onChange={(event) => {
                  const chosen = data?.adapters.find(
                    (value) => `${value.id}@${value.version}` === event.target.value,
                  );
                  if (chosen) {
                    setAdapter(chosen.id);
                    setAdapterVersion(chosen.version);
                  }
                  setTemplate(null);
                  setAdvanced(null);
                }}
              >
                {data?.adapters.map((value) => (
                  <option
                    key={`${value.id}@${value.version}`}
                    value={`${value.id}@${value.version}`}
                  >
                    {value.name} · {value.version}
                  </option>
                ))}
              </select>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-kind`}>Record type</label>
              <select
                id={`${id}-kind`}
                value={kind}
                disabled={adapter !== 'generic-csv'}
                onChange={(event) => {
                  const next = c.importKindSchema.parse(event.target.value);
                  setKind(next);
                  setFields(initialFields(next));
                  setTemplate(null);
                  setAdvanced(null);
                }}
              >
                {c.importKinds.map((value) => (
                  <option key={value} value={value}>
                    {names[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-delimiter`}>Delimiter</label>
              <select
                id={`${id}-delimiter`}
                value={delimiter}
                onChange={(event) => {
                  setDelimiter(event.target.value as typeof delimiter);
                  setTemplate(null);
                  setAdvanced(null);
                }}
              >
                {[
                  [',', 'Comma'],
                  [';', 'Semicolon'],
                  ['\t', 'Tab'],
                  ['|', 'Pipe'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-decimal`}>Decimal separator</label>
              <select
                id={`${id}-decimal`}
                value={decimal}
                onChange={(event) => {
                  setDecimal(event.target.value as typeof decimal);
                  setTemplate(null);
                  setAdvanced(null);
                }}
              >
                <option value=".">Dot (1234.56)</option>
                <option value=",">Comma (1234,56)</option>
              </select>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-grouping`}>Thousands separator</label>
              <select
                id={`${id}-grouping`}
                value={grouping}
                onChange={(event) => {
                  setGrouping(event.target.value as typeof grouping);
                  setTemplate(null);
                  setAdvanced(null);
                }}
              >
                <option value="none">None</option>
                <option value=",">Comma</option>
                <option value=".">Dot</option>
                <option value=" ">Space</option>
              </select>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-date`}>Date format</label>
              <select
                id={`${id}-date`}
                value={dateFormat}
                onChange={(event) => {
                  setDateFormat(event.target.value as typeof dateFormat);
                  setTemplate(null);
                  setAdvanced(null);
                }}
              >
                <option value="iso">ISO with explicit offset</option>
                <option value="ymd">Year-month-day</option>
                <option value="dmy">Day/month/year</option>
                <option value="mdy">Month/day/year</option>
              </select>
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-zone`}>Source timezone</label>
              <input
                id={`${id}-zone`}
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                  setTemplate(null);
                  setAdvanced(null);
                }}
              />
            </div>
          </div>
          {adapter === 'generic-csv' ? (
            <>
              <div className="import-fields">
                <div className="journal-field">
                  <label htmlFor={`${id}-source-id`}>Broker ID column (optional)</label>
                  <input
                    id={`${id}-source-id`}
                    value={sourceColumn}
                    onChange={(event) => {
                      setSourceColumn(event.target.value);
                      setTemplate(null);
                      setAdvanced(null);
                    }}
                  />
                </div>
                <div className="journal-field">
                  <label htmlFor={`${id}-group`}>Dependency group column (optional)</label>
                  <input
                    id={`${id}-group`}
                    value={groupColumn}
                    onChange={(event) => {
                      setGroupColumn(event.target.value);
                      setTemplate(null);
                      setAdvanced(null);
                    }}
                  />
                </div>
              </div>
              <p className="muted">
                Map currency and instrument identities explicitly. Unmapped columns are retained for
                review. Without broker IDs, identical rows require an occurrence ID.
              </p>
              <div className="import-table">
                <table>
                  <caption>Financial field mapping</caption>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Source</th>
                      <th>Column / constant</th>
                      <th>Conversion</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            aria-label={`Target field ${index + 1}`}
                            value={field.target}
                            onChange={(event) => {
                              setFields(
                                fields.map((value, i) =>
                                  i === index ? { ...value, target: event.target.value } : value,
                                ),
                              );
                              setTemplate(null);
                              setAdvanced(null);
                            }}
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Source type ${index + 1}`}
                            value={field.column !== undefined ? 'column' : 'constant'}
                            onChange={(event) => {
                              const next: Field = {
                                target: field.target,
                                transform: field.transform,
                                empty: field.empty,
                                ...(event.target.value === 'column'
                                  ? { column: '' }
                                  : { constant: '' }),
                              };
                              setFields(fields.map((value, i) => (i === index ? next : value)));
                              setTemplate(null);
                              setAdvanced(null);
                            }}
                          >
                            <option value="column">CSV column</option>
                            <option value="constant">Constant</option>
                          </select>
                        </td>
                        <td>
                          {field.column !== undefined ? (
                            <input
                              aria-label={`CSV column ${index + 1}`}
                              value={field.column}
                              onChange={(event) => {
                                setFields(
                                  fields.map((value, i) =>
                                    i === index ? { ...value, column: event.target.value } : value,
                                  ),
                                );
                                setTemplate(null);
                                setAdvanced(null);
                              }}
                            />
                          ) : field.target === 'currencyId' ? (
                            <select
                              aria-label={`Currency field ${index + 1}`}
                              value={String(field.constant ?? '')}
                              onChange={(event) => {
                                setFields(
                                  fields.map((value, i) =>
                                    i === index
                                      ? { ...value, constant: event.target.value }
                                      : value,
                                  ),
                                );
                                setTemplate(null);
                                setAdvanced(null);
                              }}
                            >
                              <option value="">Choose currency</option>
                              {data?.currencies.map((value) => (
                                <option key={value.id} value={value.id}>
                                  {value.code} · {value.name}
                                </option>
                              ))}
                            </select>
                          ) : field.target === 'instrumentVersionId' ? (
                            <select
                              aria-label={`Instrument field ${index + 1}`}
                              value={String(field.constant ?? '')}
                              onChange={(event) => {
                                setFields(
                                  fields.map((value, i) =>
                                    i === index
                                      ? { ...value, constant: event.target.value }
                                      : value,
                                  ),
                                );
                                setTemplate(null);
                                setAdvanced(null);
                              }}
                            >
                              <option value="">Choose instrument/version</option>
                              {data?.instruments.map((value) => (
                                <option key={value.versionId} value={value.versionId}>
                                  {value.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={`Constant value ${index + 1}`}
                              value={
                                typeof field.constant === 'string'
                                  ? field.constant
                                  : JSON.stringify(field.constant)
                              }
                              onChange={(event) => {
                                const text = event.target.value;
                                setFields(
                                  fields.map((value, i) =>
                                    i === index
                                      ? {
                                          ...value,
                                          constant:
                                            field.transform === 'boolean' &&
                                            ['true', 'false'].includes(text)
                                              ? text === 'true'
                                              : text,
                                        }
                                      : value,
                                  ),
                                );
                                setTemplate(null);
                                setAdvanced(null);
                              }}
                            />
                          )}
                        </td>
                        <td>
                          <select
                            aria-label={`Conversion ${index + 1}`}
                            value={field.transform}
                            onChange={(event) => {
                              setFields(
                                fields.map((value, i) =>
                                  i === index
                                    ? {
                                        ...value,
                                        transform: event.target.value as Field['transform'],
                                      }
                                    : value,
                                ),
                              );
                              setTemplate(null);
                              setAdvanced(null);
                            }}
                          >
                            {[
                              'text',
                              'decimal',
                              'negate_decimal',
                              'instant',
                              'boolean',
                              'json',
                              'reference',
                            ].map((value) => (
                              <option key={value} value={value}>
                                {value.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setFields(fields.filter((_, i) => i !== index));
                              setTemplate(null);
                              setAdvanced(null);
                            }}
                            aria-label={`Remove field ${index + 1}`}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setFields([
                    ...fields,
                    { target: '', column: '', transform: 'text', empty: 'omit' },
                  ]);
                  setTemplate(null);
                  setAdvanced(null);
                }}
              >
                Add field
              </Button>
            </>
          ) : (
            <p className="muted">
              Canonical interchange expects ID, Kind, Group and Payload columns. Payload contains
              the documented financial JSON object. This adapter demonstrates the extension
              contract.
            </p>
          )}
          <details
            onToggle={(event) => {
              if (event.currentTarget.open)
                setAdvancedText(JSON.stringify(advanced ?? draftMapping(), null, 2));
            }}
          >
            <summary>Advanced mapping and value aliases</summary>
            <p className="muted">
              Use complete mapping JSON for mixed record types, conditional fields, enum/currency
              aliases and dependency references. Editing basic controls returns to a single-type
              mapping.
            </p>
            <textarea
              className="import-json"
              aria-label="Advanced mapping JSON"
              value={advancedText}
              onChange={(event) => setAdvancedText(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                void run(async () => {
                  const map = c.importMappingSchema.parse(JSON.parse(advancedText));
                  applyMapping(map);
                  setTemplate(null);
                });
              }}
            >
              Apply advanced mapping
            </Button>
          </details>

          <div className="import-actions">
            <div className="journal-field">
              <label htmlFor={`${id}-template-name`}>Mapping name</label>
              <input
                id={`${id}-template-name`}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              disabled={busy || !templateName}
              onClick={() => {
                void run(async () => {
                  const saved = await read(
                    `${prefix}/templates${editingTemplate ? `/${editingTemplate.templateId}/versions` : ''}`,
                    c.importTemplateResponseSchema,
                    {
                      name: templateName,
                      mapping: mapping(),
                      ...(editingTemplate ? { expectedVersion: editingTemplate.version } : {}),
                    },
                  );
                  setTemplate(saved);
                  setEditingTemplate(saved);
                  setAdvanced(saved.mapping);
                  await client.invalidateQueries({ queryKey: ['import-templates', workspace.id] });
                });
              }}
            >
              Save mapping version
            </Button>
            {editingTemplate && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await read(
                      `${prefix}/templates/${editingTemplate.templateId}/versions`,
                      c.importTemplateResponseSchema,
                      {
                        name: editingTemplate.name,
                        mapping: editingTemplate.mapping,
                        expectedVersion: editingTemplate.version,
                        archived: true,
                      },
                    );
                    setTemplate(null);
                    setAdvanced(null);
                    setEditingTemplate(null);
                    await client.invalidateQueries({
                      queryKey: ['import-templates', workspace.id],
                    });
                  });
                }}
              >
                Archive mapping
              </Button>
            )}
            <Button
              disabled={busy || !file || !account || !namespace}
              onClick={() => {
                void run(async () => {
                  const result = await read(`${prefix}/batches`, c.importBatchResponseSchema, {
                    accountId: account,
                    namespace,
                    filename: file!.name,
                    content: file!.text,
                    ...(template ? { templateVersionId: template.id } : { mapping: mapping() }),
                  });
                  open(result);
                  await refresh();
                });
              }}
            >
              Stage file for review
            </Button>
          </div>
          {file && (
            <p className="muted">Selected: {file.name} · no financial activity has been posted.</p>
          )}
        </Panel>
      )}
      {current && (
        <Panel className="import-review">
          <h2>2. Review {current.filename}</h2>
          <p className="muted">
            Account:{' '}
            <strong>
              {data?.accounts.find((value) => value.id === current.accountId)?.name ??
                current.accountId}
            </strong>
          </p>
          <p>
            {current.rowCount} source rows · {current.state} · {current.namespace}
          </p>
          <p className="muted">
            Source SHA-256: <code>{current.fileHash}</code>
          </p>
          <a href={`${prefix}/batches/${current.id}/source`}>Download original source</a>
          {canEdit && current.state !== 'reversed' && (
            <>
              <fieldset className="import-groups">
                <legend>Include complete dependency groups</legend>
                {detail.data?.groups.map((group) => (
                  <label key={group.key}>
                    <input
                      type="checkbox"
                      checked={selected.includes(group.key)}
                      disabled={busy}
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? [...selected, group.key]
                            : selected.filter((key) => key !== group.key),
                        );
                        setReview(null);
                        setAck(false);
                      }}
                    />
                    {group.key} · {group.rows} rows{group.invalid ? ' · errors' : ''}
                    {group.committed ? ' · previously processed' : ''}
                  </label>
                ))}
              </fieldset>
              <p className="muted">
                Selected:{' '}
                {detail.data?.groups
                  .filter((group) => selected.includes(group.key))
                  .reduce((sum, group) => sum + group.rows, 0) ?? 0}{' '}
                rows. Excluded groups stay unposted.
              </p>
              <Button
                disabled={busy || !selected.length}
                onClick={() => {
                  void run(async () => {
                    const result = await read(
                      `${prefix}/batches/${current.id}/preview`,
                      c.importPreviewResponseSchema,
                      { expectedRevision: current.revision, groups: selected, corrections },
                    );
                    setReview(result);
                    setAck(false);
                    setBatch({ ...current, revision: result.batchRevision, preview: result });
                    await refresh();
                  });
                }}
              >
                Validate selected groups
              </Button>
            </>
          )}
          {review && (
            <p role="status">
              {review.committable
                ? 'Preview valid. Ready for your explicit commit.'
                : 'Preview has blocking errors. Resolve them or select complete valid groups.'}{' '}
              Financial records are unchanged by preview.
            </p>
          )}
          <div className="import-table">
            <table>
              <caption>
                {review ? 'Validated selection' : 'Source rows'} · {rows.length} displayed
              </caption>
              <thead>
                <tr>
                  <th>Row / source ID</th>
                  <th>Type</th>
                  <th>Values</th>
                  <th>Status / validation</th>
                  <th>Source details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      {row.rowNumber}
                      <small>{row.sourceId ?? 'Fingerprint identity'}</small>
                    </th>
                    <td>{row.kind ? names[row.kind] : 'Invalid record'}</td>
                    <td>{summary(row)}</td>
                    <td>
                      <strong>{row.status}</strong>
                      {row.errors.map((value, index) => (
                        <p key={index}>
                          {value.field && `${value.field}: `}
                          {value.message}
                        </p>
                      ))}
                      {row.warnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                      ))}
                      {canEdit && row.status === 'correction' && (
                        <label>
                          Correction reason
                          <input
                            aria-label={`Correction reason row ${row.rowNumber}`}
                            value={corrections[row.id] ?? ''}
                            onChange={(event) =>
                              setCorrections({ ...corrections, [row.id]: event.target.value })
                            }
                          />
                        </label>
                      )}
                    </td>
                    <td>
                      <details>
                        <summary>Raw and normalized values</summary>
                        <pre>{JSON.stringify(row.raw, null, 2)}</pre>
                        <pre>{JSON.stringify(row.payload, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!review && (
            <div className="import-actions">
              <Button
                variant="secondary"
                disabled={busy || cursor === 0}
                onClick={() => setCursor(0)}
              >
                First rows
              </Button>
              {detail.data?.nextCursor && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setCursor(detail.data!.nextCursor!)}
                >
                  Next rows
                </Button>
              )}
            </div>
          )}
          {canEdit && review && (
            <div className="import-actions">
              <label>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(event) => setAck(event.target.checked)}
                />{' '}
                I reviewed retained unmapped columns and warnings.
              </label>
              <Button
                disabled={
                  busy ||
                  !review.committable ||
                  (!ack && review.rows.some((row) => row.warnings.length > 0))
                }
                onClick={() => {
                  void run(async () => {
                    const result = await read(
                      `${prefix}/batches/${current.id}/commit`,
                      c.importBatchResponseSchema,
                      {
                        expectedRevision: review.batchRevision,
                        previewId: review.id,
                        acceptWarnings: ack,
                      },
                    );
                    open(result);
                    await refresh();
                  });
                }}
              >
                Commit reviewed import
              </Button>
            </div>
          )}
          {canEdit && ['committed', 'partial'].includes(current.state) && (
            <details>
              <summary>Reverse eligible cash-only batch</summary>
              <p className="muted">
                This appends exact monetary reversals. Later activity, corrections, fills, lots,
                fees, FX and reference/valuation changes block automatic reversal.
              </p>
              <div className="journal-field">
                <label htmlFor={`${id}-reverse`}>Reversal reason</label>
                <input
                  id={`${id}-reverse`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={busy || !reason}
                onClick={() => {
                  void run(async () => {
                    const result = await read(
                      `${prefix}/batches/${current.id}/reverse`,
                      c.importBatchResponseSchema,
                      { expectedRevision: current.revision, reason },
                    );
                    open(result);
                    await refresh();
                  });
                }}
              >
                Review and reverse cash batch
              </Button>
            </details>
          )}
          <details>
            <summary>Batch audit history</summary>
            {detail.data?.history.map((item) => (
              <p key={item.id}>
                {item.action} · {item.createdAt}
              </p>
            ))}
          </details>
        </Panel>
      )}
      <Panel>
        <h2>Import history</h2>
        {historyCursor && (
          <Button variant="secondary" onClick={() => setHistoryCursor(null)}>
            Newest batches
          </Button>
        )}
        {history.isPending ? (
          <p>Loading import history…</p>
        ) : !history.data?.items.length ? (
          <p>No imported statements yet.</p>
        ) : (
          <div className="import-table">
            <table>
              <caption>Recent statement batches</caption>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>State</th>
                  <th>Rows</th>
                  <th>Uploaded</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((value) => (
                  <tr key={value.id}>
                    <th scope="row">
                      {value.filename}
                      <small>{value.namespace}</small>
                    </th>
                    <td>{value.state}</td>
                    <td>{value.rowCount}</td>
                    <td>{value.createdAt}</td>
                    <td>
                      <Button variant="secondary" onClick={() => open(value)}>
                        Review batch
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.data?.nextCursor && (
          <Button variant="secondary" onClick={() => setHistoryCursor(history.data!.nextCursor)}>
            Older batches
          </Button>
        )}
      </Panel>
    </>
  );
}
