'use client';
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as c from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { ConfirmDialog } from '@/components/ux/confirm-dialog';
import { readImportFile } from './import-file';

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
const fieldNames: Record<string, string> = {
  economicAt: 'Activity date',
  observedAt: 'Observation date',
  orderingKey: 'Sequence within date',
  side: 'Buy / sell',
  quantity: 'Quantity',
  price: 'Price',
  amount: 'Amount',
  currencyId: 'Currency',
  sourceCurrencyId: 'Source currency',
  destinationCurrencyId: 'Destination currency',
  instrumentVersionId: 'Instrument version',
  costsComplete: 'Fees fully recorded',
  kind: 'Cash movement type',
  direction: 'Position direction',
  reason: 'Reason',
  source: 'Observation source',
  definition: 'Valuation definition',
};
const statuses: Record<c.ImportRowResponse['status'], string> = {
  ready: 'Awaiting validation',
  invalid: 'Needs attention',
  ambiguous: 'Identity needs review',
  new: 'New activity',
  duplicate: 'Duplicate — will be skipped',
  correction: 'Correction reason required',
  reconciled: 'Already reconciled',
  committed: 'Posted',
  reversed: 'Reversed',
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
    [reason, setReason] = useState(''),
    [reviewNeedsValidation, setReviewNeedsValidation] = useState(false),
    [confirmation, setConfirmation] = useState<'commit' | 'reverse' | 'archive' | null>(null);
  const detail = useQuery({
    queryKey: ['import-detail', workspace.id, batch?.id, cursor],
    enabled: !!batch,
    queryFn: () =>
      read(`${prefix}/batches/${batch!.id}?cursor=${cursor}`, c.importBatchDetailSchema),
  });
  const current = detail.data?.batch ?? batch,
    rows = review?.rows ?? detail.data?.rows ?? [];
  const data = catalog.data;
  const selectedRowCount =
    detail.data?.groups
      .filter((group) => selected.includes(group.key))
      .reduce((sum, group) => sum + group.rows, 0) ?? 0;
  const selectionTooLarge = selectedRowCount > c.IMPORT_LIMITS.commitRows;
  const needsWarningAcknowledgement = review?.rows.some((row) => row.warnings.length > 0);
  const canCommit =
    !!review?.committable &&
    !reviewNeedsValidation &&
    (!needsWarningAcknowledgement || ack) &&
    !busy;
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
    const result = c.importMappingSchema.safeParse(advanced ?? draftMapping());
    if (!result.success)
      throw new Error(
        `Check the mapping: ${result.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    return result.data;
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
    setSelected(value.preview?.groups ?? []);
    setReview(value.preview);
    setCorrections(value.preview?.corrections ?? {});
    setAck(false);
    setReviewNeedsValidation(false);
    setReason('');
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
      <ol className="import-progress" aria-label="Import progress">
        <li aria-current={!current ? 'step' : undefined}>
          <span>1</span> Choose source and mapping
        </li>
        <li aria-current={current && !review ? 'step' : undefined}>
          <span>2</span> Review and validate
        </li>
        <li aria-current={review ? 'step' : undefined}>
          <span>3</span> Confirm posting
        </li>
      </ol>
      {busy && (
        <p className="import-working" aria-live="polite">
          Processing import request…
        </p>
      )}
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
          {error && !review && current && (
            <p className="muted">Validate your selected groups again before posting.</p>
          )}
          {(catalog.error || templates.error || history.error || detail.error) && (
            <Button
              variant="secondary"
              onClick={() => {
                void Promise.all([
                  catalog.refetch(),
                  templates.refetch(),
                  history.refetch(),
                  ...(batch ? [detail.refetch()] : []),
                ]);
              }}
            >
              Retry loading import data
            </Button>
          )}
        </Panel>
      )}
      {!canEdit && (
        <Panel>
          <p>You have viewer access. Source files and import history are read-only.</p>
        </Panel>
      )}
      {canEdit && (
        <Panel className="import-setup" aria-busy={busy || catalog.isPending}>
          <h2>1. Source and mapping</h2>
          <p className="muted">
            UTF-8 CSV · up to 2 MiB and 1,000 rows. Commit complete groups of at most 100 rows at a
            time.
          </p>
          <details>
            <summary>Correcting a previously imported statement</summary>
            <p className="muted">
              Upload the corrected CSV to the same account with the same broker source namespace and
              stable source IDs. Validation flags changed records for review. Enter a reason,
              validate again, then confirm posting. Unchanged records are skipped as duplicates.
            </p>
            <p className="muted">
              Cash movements and fills support explicit corrections when their dependencies allow
              them. Other record types need a domain correction; changing a source ID would create
              new activity and must not be used to bypass review.
            </p>
          </details>
          {catalog.isPending && <p className="muted">Loading accounts and mapping choices…</p>}
          {data && data.accounts.length === 0 && (
            <div className="import-guidance">
              <strong>Create an account before importing.</strong>
              <p>Each file belongs to one account. Add its currencies and instruments first.</p>
              <a href={`/record?workspace=${workspace.id}#catalog-setup`}>Set up an account</a>
            </div>
          )}
          <div className="import-fields">
            <div className="journal-field">
              <label htmlFor={`${id}-account`}>Account</label>
              <select
                id={`${id}-account`}
                value={account}
                disabled={busy || catalog.isPending}
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
                disabled={busy}
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
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.files?.[0];
                  if (!value) return;
                  setFile(null);
                  void run(async () => {
                    const text = await readImportFile(value);
                    setFile({ name: value.name, text });
                  });
                }}
              />
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-template`}>Saved mapping</label>
              <select
                id={`${id}-template`}
                value={template?.id ?? ''}
                disabled={busy || templates.isPending}
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
              {editingTemplate && !template && (
                <small className="muted">
                  Unsaved changes based on {editingTemplate.name} · v{editingTemplate.version}. Save
                  a new version to reuse them.
                </small>
              )}
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
          </div>
          <details className="import-settings">
            <summary>File format and date conventions</summary>
            <p className="muted">
              Defaults: comma-separated, decimal point, ISO dates with an offset. Match your
              statement before staging; local dates use the source timezone below.
            </p>
            <div className="import-fields">
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
          </details>
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
              <p className="muted">
                Use the exact CSV header for each column. Choose catalog entries for constants;
                files containing multiple currencies or instruments need explicit value aliases in
                advanced mapping.
              </p>
              {kind === 'execution' && (
                <p className="import-guidance">
                  Map actual fills using the correct instrument version. Mark fees fully recorded
                  only when all source costs are supplied. Imported fills must be allocated to trade
                  campaigns in the journal before trade analytics can include them; unsupported
                  instruments retain their accounting limits.
                </p>
              )}
              <div
                className="import-table"
                role="region"
                aria-label="Scrollable financial field mapping"
                tabIndex={0}
              >
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
                          <strong className="import-field-name">
                            {fieldNames[field.target] ?? 'Custom financial field'}
                          </strong>
                          <input
                            aria-label={`Target field ${index + 1}`}
                            list={`${id}-mapping-targets`}
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
                          ) : ['currencyId', 'sourceCurrencyId', 'destinationCurrencyId'].includes(
                              field.target,
                            ) ? (
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
                                  {value.name} · version {value.versionId.slice(-8)}
                                </option>
                              ))}
                            </select>
                          ) : field.transform === 'boolean' ? (
                            <select
                              aria-label={`Constant value ${index + 1}`}
                              value={String(field.constant ?? '')}
                              onChange={(event) => {
                                setFields(
                                  fields.map((value, i) =>
                                    i === index
                                      ? { ...value, constant: event.target.value === 'true' }
                                      : value,
                                  ),
                                );
                                setTemplate(null);
                                setAdvanced(null);
                              }}
                            >
                              <option value="false">No</option>
                              <option value="true">Yes</option>
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
              <datalist id={`${id}-mapping-targets`}>
                {Object.entries(fieldNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </datalist>
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
                  setConfirmation('archive');
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
          {!file && (
            <p className="muted">
              Choose a CSV and account to begin. Staging creates a review copy only.
            </p>
          )}
        </Panel>
      )}
      {current && (
        <Panel className="import-review" aria-busy={busy || detail.isPending}>
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
          <p className="muted">
            Raw source is untrusted text and downloads as .source.txt with its original bytes.
            Spreadsheet formulas may execute if you manually open or import it in a spreadsheet.
            Inspect it in a text editor.
          </p>
          {detail.isPending && <p className="muted">Loading source rows and dependency groups…</p>}
          {current.state === 'reversed' && (
            <p className="import-guidance">
              This batch was reversed. Its original source and audit history remain available.
            </p>
          )}
          {['committed', 'partial'].includes(current.state) &&
            rows.some((row) => row.kind === 'execution') && (
              <p className="import-guidance">
                Fills are recorded.{' '}
                <a href={`/record?workspace=${workspace.id}&mode=existing`}>
                  Create a journal trade from an existing fill
                </a>{' '}
                to allocate it to a campaign without posting it again.
              </p>
            )}
          {canEdit && current.state !== 'reversed' && (
            <>
              <p className="muted">
                Select complete groups, then validate to identify new activity, duplicates and
                corrections. Validation leaves financial records unchanged.
              </p>
              <div className="import-actions">
                <Button
                  variant="secondary"
                  disabled={busy || !detail.data?.groups.length}
                  onClick={() => {
                    setSelected(detail.data?.groups.map((group) => group.key) ?? []);
                    setReview(null);
                    setAck(false);
                    setReviewNeedsValidation(false);
                  }}
                >
                  Select all groups
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !selected.length}
                  onClick={() => {
                    setSelected([]);
                    setReview(null);
                    setAck(false);
                    setReviewNeedsValidation(false);
                  }}
                >
                  Clear selection
                </Button>
              </div>
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
                        setReviewNeedsValidation(false);
                      }}
                    />
                    {group.key} · {group.rows} rows{group.invalid ? ' · errors' : ''}
                    {group.committed ? ' · previously processed' : ''}
                  </label>
                ))}
              </fieldset>
              <p className="muted">
                Selected: {selectedRowCount} rows. Excluded groups stay unposted.
              </p>
              {selectionTooLarge && (
                <p className="import-guidance">
                  Choose fewer groups: each review can include at most 100 rows. Remaining groups
                  can be posted in a later review.
                </p>
              )}
              <Button
                disabled={busy || detail.isPending || !selected.length || selectionTooLarge}
                onClick={() => {
                  void run(async () => {
                    const result = await read(
                      `${prefix}/batches/${current.id}/preview`,
                      c.importPreviewResponseSchema,
                      { expectedRevision: current.revision, groups: selected, corrections },
                    );
                    setReview(result);
                    setAck(false);
                    setReviewNeedsValidation(false);
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
              {reviewNeedsValidation
                ? 'Correction reasons changed. Validate selected groups again before posting.'
                : review.committable
                  ? 'Preview valid. Ready for your explicit commit.'
                  : 'Preview has blocking errors. Resolve them or select complete valid groups.'}{' '}
              Financial records are unchanged by preview.
            </p>
          )}
          {review && (
            <div className="import-preview-summary" aria-label="Preview summary">
              <span>
                <strong>
                  {
                    review.rows.filter((row) => row.status === 'new' && !review.corrections[row.id])
                      .length
                  }
                </strong>{' '}
                new records
              </span>
              <span>
                <strong>{review.rows.filter((row) => row.status === 'duplicate').length}</strong>{' '}
                duplicates skipped
              </span>
              <span>
                <strong>
                  {
                    review.rows.filter(
                      (row) => row.status === 'correction' || review.corrections[row.id],
                    ).length
                  }
                </strong>{' '}
                corrections
              </span>
              <span>
                <strong>{review.rows.filter((row) => row.errors.length > 0).length}</strong> rows
                needing attention
              </span>
            </div>
          )}
          <div
            className="import-table"
            role="region"
            aria-label="Scrollable source row review"
            tabIndex={0}
          >
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
                      <strong>{statuses[row.status]}</strong>
                      {row.status === 'duplicate' && (
                        <p>
                          This source record is already posted. Committing the review will not post
                          it again.
                        </p>
                      )}
                      {row.errors.map((value, index) => (
                        <p key={index}>
                          {value.field && `${value.field}: `}
                          {value.message}
                        </p>
                      ))}
                      {row.warnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                      ))}
                      {canEdit &&
                        (row.status === 'correction' ||
                          corrections[row.id] !== undefined ||
                          review?.corrections[row.id] !== undefined) && (
                          <label>
                            Correction reason
                            <input
                              aria-label={`Correction reason row ${row.rowNumber}`}
                              value={corrections[row.id] ?? ''}
                              disabled={busy}
                              onChange={(event) => {
                                setCorrections({ ...corrections, [row.id]: event.target.value });
                                setReviewNeedsValidation(true);
                                setAck(false);
                              }}
                            />
                            <small>
                              Explain the changed broker record, then validate again. The original
                              source remains in the audit history.
                            </small>
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
            {!detail.isPending && rows.length === 0 && (
              <p className="muted">No source rows are available for this batch.</p>
            )}
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
                  disabled={busy || reviewNeedsValidation}
                  onChange={(event) => setAck(event.target.checked)}
                />{' '}
                I reviewed retained unmapped columns and warnings.
              </label>
              <Button
                disabled={!canCommit}
                onClick={() => {
                  setConfirmation('commit');
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
                disabled={busy || !reason.trim()}
                onClick={() => {
                  setConfirmation('reverse');
                }}
              >
                Review and reverse cash batch
              </Button>
            </details>
          )}
          <details>
            <summary>Batch audit history</summary>
            {detail.data?.history.length === 0 && <p className="muted">No recorded actions yet.</p>}
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
          <p aria-live="polite">Loading import history…</p>
        ) : history.error ? (
          <p className="muted">
            Import history is unavailable. Retry loading to see your previous statements.
          </p>
        ) : !history.data?.items.length ? (
          <div className="import-guidance">
            <strong>No imported statements yet.</strong>
            <p>
              {canEdit
                ? 'Choose an account and CSV above. You can review every change before posting it.'
                : 'Uploaded source files and their review history will appear here.'}
            </p>
          </div>
        ) : (
          <div
            className="import-table"
            role="region"
            aria-label="Scrollable import history"
            tabIndex={0}
          >
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
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const current = await read(
                              `${prefix}/batches/${value.id}`,
                              c.importBatchDetailSchema,
                            );
                            open(current.batch);
                          })
                        }
                      >
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
      <ConfirmDialog
        open={confirmation !== null}
        busy={busy}
        title={
          confirmation === 'reverse'
            ? 'Reverse this cash batch?'
            : confirmation === 'archive'
              ? 'Archive this mapping?'
              : 'Post this reviewed import?'
        }
        confirmLabel={
          confirmation === 'reverse'
            ? 'Confirm reversal'
            : confirmation === 'archive'
              ? 'Archive mapping'
              : 'Confirm posting'
        }
        description={
          confirmation === 'reverse' ? (
            <>
              <p>
                {current?.filename} will receive exact offsetting cash entries if it remains
                eligible. Source files and audit history are preserved.
              </p>
              <p>
                <strong>Reason:</strong> {reason}
              </p>
              <p>
                Fills, fees, FX, holdings and later financial activity require explicit corrections
                instead.
              </p>
            </>
          ) : confirmation === 'archive' ? (
            <p>
              {editingTemplate?.name} will be hidden from saved mapping choices. Existing imports
              retain the version they used.
            </p>
          ) : (
            <>
              <p>
                Post {review?.rows.length ?? 0} reviewed rows from{' '}
                <strong>{current?.filename}</strong> to{' '}
                <strong>
                  {data?.accounts.find((value) => value.id === current?.accountId)?.name ??
                    'this account'}
                </strong>
                .
              </p>
              <p>
                Duplicates are skipped. Reviewed corrections preserve prior source history. This
                updates the financial ledger; reversal is available only for eligible cash batches.
              </p>
            </>
          )
        }
        onCancel={() => {
          if (!busy) setConfirmation(null);
        }}
        onConfirm={() => {
          if (busy) return;
          if (confirmation === 'commit' && current && review && canCommit) {
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
            }).finally(() => setConfirmation(null));
          } else if (confirmation === 'reverse' && current && reason.trim()) {
            void run(async () => {
              const result = await read(
                `${prefix}/batches/${current.id}/reverse`,
                c.importBatchResponseSchema,
                { expectedRevision: current.revision, reason },
              );
              open(result);
              await refresh();
            }).finally(() => setConfirmation(null));
          } else if (confirmation === 'archive' && editingTemplate) {
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
              await client.invalidateQueries({ queryKey: ['import-templates', workspace.id] });
            }).finally(() => setConfirmation(null));
          }
        }}
      />
    </>
  );
}
