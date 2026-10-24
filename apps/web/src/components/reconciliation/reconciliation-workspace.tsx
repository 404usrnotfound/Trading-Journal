'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountResponseSchema,
  currencyResponseSchema,
  instrumentResponseSchema,
  createStatementRequestSchema,
  evaluateStatementRequestSchema,
  statementListResponseSchema,
  statementEvaluationListResponseSchema,
  statementResponseSchema,
  statementReconciliationResponseSchema,
  type StatementResponse,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { WorkspaceSwitcher } from '../workspace-switcher';
import { RecordField, RecordInput } from '../record/record-fields';
import { recordRead, recordWrite, retainedCommand } from '../record/record-api';
import { formatJournalTimestamp } from '../journal/journal-time';
import './reconciliation.css';

type CashInput = { key: string; currencyId: string; amount: string; tolerance: string };
type HoldingInput = {
  key: string;
  instrumentVersionId: string;
  quantity: string;
  tolerance: string;
};
const sources = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'The statement operation could not be completed.';

export function ReconciliationWorkspace({
  workspace,
  workspaces,
}: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
}) {
  const base = `/api/v1/workspaces/${workspace.id}`;
  const root = `${base}/reconciliation`;
  const editor = workspace.role !== 'viewer';
  const queryClient = useQueryClient();
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const [cursors, setCursors] = useState<string[]>(['']);
  const cursor = cursors.at(-1) ?? '';
  const [selected, setSelected] = useState<StatementResponse | null>(null);
  const [assessmentId, setAssessmentId] = useState('');
  const [evaluationCursors, setEvaluationCursors] = useState<string[]>(['']);
  const evaluationCursor = evaluationCursors.at(-1) ?? '';
  const [accountId, setAccountId] = useState('');
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 16));
  const [sourceName, setSourceName] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [sourceHash, setSourceHash] = useState('');
  const [notes, setNotes] = useState('');
  const [cash, setCash] = useState<CashInput[]>([]);
  const [holdings, setHoldings] = useState<HoldingInput[]>([]);
  const [completeCash, setCompleteCash] = useState(false);
  const [completeHoldings, setCompleteHoldings] = useState(false);
  const [includeEquity, setIncludeEquity] = useState(false);
  const [equityCurrencyId, setEquityCurrencyId] = useState('');
  const [equityAmount, setEquityAmount] = useState('');
  const [equityTolerance, setEquityTolerance] = useState('0');
  const [priceSources, setPriceSources] = useState('manual');
  const [fxSources, setFxSources] = useState('manual');
  const [maximumAgeHours, setMaximumAgeHours] = useState('24');
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const accounts = useQuery({
    queryKey: [workspace.id, 'statement-accounts'],
    queryFn: () =>
      recordRead(
        `${base}/financial/accounts?limit=200&includeArchived=true`,
        accountResponseSchema.array(),
      ),
  });
  const currencies = useQuery({
    queryKey: [workspace.id, 'statement-currencies'],
    queryFn: () =>
      recordRead(
        `${base}/financial/currencies?limit=200&includeArchived=true`,
        currencyResponseSchema.array(),
      ),
  });
  const instruments = useQuery({
    queryKey: [workspace.id, 'statement-instruments'],
    queryFn: () =>
      recordRead(
        `${base}/financial/instruments?limit=200&includeArchived=true`,
        instrumentResponseSchema.array(),
      ),
  });
  const statements = useQuery({
    queryKey: [workspace.id, 'statements', cursor],
    queryFn: () =>
      recordRead(
        `${root}/statements?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        statementListResponseSchema,
      ),
  });
  const statement = selected ?? statements.data?.items[0] ?? null;
  const evaluations = useQuery({
    queryKey: [workspace.id, 'statement-evaluations', statement?.id, evaluationCursor],
    enabled: statement !== null,
    queryFn: () =>
      recordRead(
        `${root}/statements/${statement!.id}/evaluations?limit=100${evaluationCursor ? `&cursor=${encodeURIComponent(evaluationCursor)}` : ''}`,
        statementEvaluationListResponseSchema,
      ),
  });
  const evaluationDetail = useQuery({
    queryKey: [workspace.id, 'statement-evaluation', assessmentId],
    enabled: Boolean(assessmentId),
    queryFn: () =>
      recordRead(`${root}/evaluations/${assessmentId}`, statementReconciliationResponseSchema),
  });
  const assessment = assessmentId
    ? (evaluationDetail.data ?? null)
    : (evaluations.data?.items[0] ?? null);
  const currencyName = (id: string) => currencies.data?.find((item) => item.id === id)?.code ?? id;
  const instrumentName = (id: string) => {
    const item = instruments.data?.find((row) => row.versionId === id);
    return item ? `${item.name} (v${item.version})` : `Instrument version ${id}`;
  };
  const accountName = (id: string) => accounts.data?.find((item) => item.id === id)?.name ?? id;
  const referenceFailure = accounts.error ?? currencies.error ?? instruments.error;
  const canAccept =
    assessment?.status === 'matched' &&
    !assessment.stale &&
    !assessment.accepted &&
    !evaluations.error &&
    !evaluations.isFetching &&
    (!assessmentId || (!evaluationDetail.error && !evaluationDetail.isFetching));

  async function saveStatement(event: FormEvent) {
    event.preventDefault();
    if (busy || !editor) return;
    setError('');
    setNotice('');
    try {
      const result = createStatementRequestSchema.safeParse({
        accountId,
        asOf: asOf ? new Date(`${asOf}Z`).toISOString() : '',
        sourceName,
        sourceReference,
        ...(sourceHash.trim() ? { sourceHash: sourceHash.trim() } : {}),
        cashDefinition: 'all-owned-cash/1',
        holdingsDefinition: 'netted-account-inventory/1',
        completeCash,
        completeHoldings,
        cash: cash.map(({ currencyId, amount, tolerance }) => ({ currencyId, amount, tolerance })),
        holdings: holdings.map(({ instrumentVersionId, quantity, tolerance }) => ({
          instrumentVersionId,
          quantity,
          tolerance,
        })),
        ...(includeEquity
          ? {
              equity: {
                currencyId: equityCurrencyId,
                amount: equityAmount,
                tolerance: equityTolerance,
                definition: 'owned-cash-plus-signed-holdings/1',
              },
            }
          : {}),
        notes,
      });
      if (!result.success)
        throw new Error(result.error.issues[0]?.message ?? 'Check the statement fields.');
      setBusy(true);
      const saved = await recordWrite(
        `${root}/statements`,
        result.data,
        statementResponseSchema,
        retainedCommand(commands.current, 'statement', result.data),
      );
      commands.current.delete('statement');
      setSelected(saved);
      setAssessmentId('');
      setEvaluationCursors(['']);
      setSourceReference('');
      setNotice('Independent statement saved. Compare it with the ledger before accepting.');
      await queryClient.invalidateQueries({ queryKey: [workspace.id, 'statements'] });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function evaluate(accept: boolean) {
    if (!statement || busy || !editor || (accept && !canAccept)) return;
    setError('');
    setNotice('');
    try {
      const hours = Number(maximumAgeHours);
      if (
        statement.document.equity &&
        (!maximumAgeHours.trim() || !Number.isFinite(hours) || hours < 0)
      )
        throw new Error('Enter a nonnegative maximum age in hours.');
      const policy = accept
        ? assessment?.valuationPolicy
        : statement.document.equity
          ? {
              fxPolicy: {
                id: 'statement-review/1',
                maxAgeMilliseconds: hours * 3_600_000,
                sourcePriority: sources(fxSources),
              },
              pricePolicy: {
                maxAgeMilliseconds: hours * 3_600_000,
                sourcePriority: sources(priceSources),
              },
            }
          : undefined;
      const result = evaluateStatementRequestSchema.safeParse({
        accept,
        reviewNote,
        ...(accept && assessment ? { sourceRevision: assessment.comparedRevision } : {}),
        ...(policy ? { valuationPolicy: policy } : {}),
      });
      if (!result.success)
        throw new Error(
          result.error.issues[0]?.message ?? 'Add a review note and check the comparison settings.',
        );
      setBusy(true);
      const saved = await recordWrite(
        `${root}/statements/${statement.id}/evaluations`,
        result.data,
        statementReconciliationResponseSchema,
        retainedCommand(commands.current, `evaluate-${statement.id}`, result.data),
      );
      commands.current.delete(`evaluate-${statement.id}`);
      queryClient.setQueryData([workspace.id, 'statement-evaluation', saved.id], saved);
      setAssessmentId(saved.id);
      setEvaluationCursors(['']);
      await queryClient.invalidateQueries({
        queryKey: [workspace.id, 'statement-evaluations', statement.id],
      });
      setNotice(
        saved.stale
          ? 'Financial records changed. This comparison is stale; compare again before relying on it.'
          : saved.accepted
            ? 'Matching statement accepted at the recorded financial revision.'
            : 'Comparison saved. Review every variance and unavailable value.',
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reconciliation-workspace">
      <div className="page-heading">
        <div>
          <h1>Statement reconciliation</h1>
          <p>Compare independent account evidence with recorded cash, holdings and equity.</p>
        </div>
        <WorkspaceSwitcher workspaces={workspaces} selected={workspace.id} />
      </div>
      <Panel className="reconciliation-intro">
        <h2>Independent evidence</h2>
        <p>
          Enter balances from an actual broker statement or another independently verified source.
          The Accounts identity bridge explains its own ledger totals; it cannot prove agreement
          with a statement.
        </p>
        <p>
          Comparisons preserve their financial revision, source reference, tolerances and review
          note. Later financial changes mark earlier comparisons stale.
        </p>
      </Panel>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {referenceFailure && (
        <p role="alert">
          Reference records could not be loaded. Refresh this page before recording a statement.
        </p>
      )}
      {!editor && (
        <p role="note">
          Viewer access: you can inspect statements and comparison history. An editor or owner
          records and accepts evidence.
        </p>
      )}
      {editor && (
        <Panel>
          <h2>Record independent statement</h2>
          <form
            onSubmit={(event) => void saveStatement(event)}
            aria-label="Record independent statement"
          >
            <fieldset disabled={busy || Boolean(referenceFailure)}>
              <legend>Statement source and time</legend>
              <div className="reconciliation-fields">
                <RecordField label="Account">
                  {(id) => (
                    <select
                      id={id}
                      required
                      value={accountId}
                      onChange={(event) => setAccountId(event.target.value)}
                    >
                      <option value="">Choose account</option>
                      {accounts.data?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.environment}
                        </option>
                      ))}
                    </select>
                  )}
                </RecordField>
                <RecordInput
                  label="Statement time (UTC)"
                  type="datetime-local"
                  value={asOf}
                  onChange={setAsOf}
                  required
                  help="Enter the statement snapshot time in UTC. Saved evidence is displayed in your workspace timezone."
                />
                <RecordInput
                  label="Statement source"
                  value={sourceName}
                  onChange={setSourceName}
                  required
                  help="For example, the broker or independent custodian."
                />
                <RecordInput
                  label="Statement reference"
                  value={sourceReference}
                  onChange={setSourceReference}
                  required
                  help="A statement number, document reference or independently retained evidence identifier."
                />
              </div>
            </fieldset>
            <fieldset disabled={busy}>
              <legend>Native cash balances</legend>
              <p>
                Enter signed amounts in their original currency. Tolerances are absolute amounts in
                that currency.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={completeCash}
                  onChange={(event) => setCompleteCash(event.target.checked)}
                />{' '}
                Statement lists every cash currency; omitted currencies mean zero.
              </label>
              {cash.map((line, index) => (
                <div
                  className="reconciliation-line"
                  key={line.key}
                  role="group"
                  aria-label={`Cash line ${index + 1}`}
                >
                  <RecordField label={`Cash currency ${index + 1}`}>
                    {(id) => (
                      <select
                        id={id}
                        required
                        value={line.currencyId}
                        onChange={(event) =>
                          setCash(
                            cash.map((row) =>
                              row.key === line.key
                                ? { ...row, currencyId: event.target.value }
                                : row,
                            ),
                          )
                        }
                      >
                        <option value="">Choose currency</option>
                        {currencies.data?.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code}
                          </option>
                        ))}
                      </select>
                    )}
                  </RecordField>
                  <RecordInput
                    label={`Statement cash ${index + 1}`}
                    value={line.amount}
                    onChange={(amount) =>
                      setCash(cash.map((row) => (row.key === line.key ? { ...row, amount } : row)))
                    }
                    decimal
                    required
                  />
                  <RecordInput
                    label={`Cash tolerance ${index + 1}`}
                    value={line.tolerance}
                    onChange={(tolerance) =>
                      setCash(
                        cash.map((row) => (row.key === line.key ? { ...row, tolerance } : row)),
                      )
                    }
                    decimal
                    required
                  />
                  <Button
                    variant="quiet"
                    onClick={() => setCash(cash.filter((row) => row.key !== line.key))}
                  >
                    Remove cash line {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                disabled={cash.length >= 100}
                onClick={() =>
                  setCash([
                    ...cash,
                    { key: crypto.randomUUID(), currencyId: '', amount: '', tolerance: '0' },
                  ])
                }
              >
                Add cash balance
              </Button>
            </fieldset>
            <fieldset disabled={busy}>
              <legend>Native holding quantities</legend>
              <p>
                Use signed net quantities in the instrument’s stated units. Enter historical
                instrument-version IDs when the current catalog version differs.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={completeHoldings}
                  onChange={(event) => setCompleteHoldings(event.target.checked)}
                />{' '}
                Statement lists every holding; omitted holdings mean zero.
              </label>
              <datalist id={`statement-instruments-${workspace.id}`}>
                {instruments.data?.map((item) => (
                  <option key={item.versionId} value={item.versionId}>
                    {item.name} · version {item.version}
                  </option>
                ))}
              </datalist>
              {holdings.map((line, index) => (
                <div
                  className="reconciliation-line"
                  key={line.key}
                  role="group"
                  aria-label={`Holding line ${index + 1}`}
                >
                  <RecordField label={`Instrument version ${index + 1}`}>
                    {(id) => (
                      <input
                        id={id}
                        list={`statement-instruments-${workspace.id}`}
                        required
                        value={line.instrumentVersionId}
                        onChange={(event) =>
                          setHoldings(
                            holdings.map((row) =>
                              row.key === line.key
                                ? { ...row, instrumentVersionId: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    )}
                  </RecordField>
                  <RecordInput
                    label={`Statement quantity ${index + 1}`}
                    value={line.quantity}
                    onChange={(quantity) =>
                      setHoldings(
                        holdings.map((row) => (row.key === line.key ? { ...row, quantity } : row)),
                      )
                    }
                    decimal
                    required
                  />
                  <RecordInput
                    label={`Quantity tolerance ${index + 1}`}
                    value={line.tolerance}
                    onChange={(tolerance) =>
                      setHoldings(
                        holdings.map((row) => (row.key === line.key ? { ...row, tolerance } : row)),
                      )
                    }
                    decimal
                    required
                  />
                  <Button
                    variant="quiet"
                    onClick={() => setHoldings(holdings.filter((row) => row.key !== line.key))}
                  >
                    Remove holding line {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                disabled={holdings.length >= 100}
                onClick={() =>
                  setHoldings([
                    ...holdings,
                    {
                      key: crypto.randomUUID(),
                      instrumentVersionId: '',
                      quantity: '',
                      tolerance: '0',
                    },
                  ])
                }
              >
                Add holding quantity
              </Button>
            </fieldset>
            <fieldset disabled={busy}>
              <legend>Statement equity (optional)</legend>
              <label>
                <input
                  type="checkbox"
                  checked={includeEquity}
                  onChange={(event) => setIncludeEquity(event.target.checked)}
                />{' '}
                Compare statement equity
              </label>
              <p>
                Use owned cash plus signed holdings, including owned cash in transit. A broker’s
                buying power, margin or differently defined liquidation value is not comparable.
              </p>
              {includeEquity && (
                <div className="reconciliation-fields">
                  <RecordField label="Equity currency">
                    {(id) => (
                      <select
                        id={id}
                        required
                        value={equityCurrencyId}
                        onChange={(event) => setEquityCurrencyId(event.target.value)}
                      >
                        <option value="">Choose currency</option>
                        {currencies.data?.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code}
                          </option>
                        ))}
                      </select>
                    )}
                  </RecordField>
                  <RecordInput
                    label="Statement equity"
                    value={equityAmount}
                    onChange={setEquityAmount}
                    decimal
                    required
                  />
                  <RecordInput
                    label="Equity tolerance"
                    value={equityTolerance}
                    onChange={setEquityTolerance}
                    decimal
                    required
                  />
                </div>
              )}
            </fieldset>
            <fieldset disabled={busy}>
              <legend>Evidence details</legend>
              <RecordInput
                label="Source SHA-256 (optional)"
                value={sourceHash}
                onChange={setSourceHash}
                help="If retained, enter the original document’s 64-character lowercase SHA-256 hash."
              />
              <RecordField label="Statement notes">
                {(id) => (
                  <textarea
                    id={id}
                    maxLength={4000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                )}
              </RecordField>
            </fieldset>
            <Button
              type="submit"
              disabled={busy || Boolean(referenceFailure) || accounts.isPending}
            >
              {busy ? 'Saving…' : 'Save independent statement'}
            </Button>
          </form>
        </Panel>
      )}
      <Panel>
        <h2>Statement history</h2>
        {statements.isPending ? (
          <p role="status">Loading statements…</p>
        ) : statements.error ? (
          <p role="alert">
            Statement history could not be loaded.{' '}
            <Button variant="secondary" onClick={() => void statements.refetch()}>
              Retry history
            </Button>
          </p>
        ) : !statements.data?.items.length ? (
          <p>No independent statements recorded.</p>
        ) : (
          <>
            <div className="reconciliation-table">
              <table>
                <caption>Independent source documents</caption>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Account</th>
                    <th>Statement time</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.document.sourceName}
                        <br />
                        {item.document.sourceReference}
                      </td>
                      <td>{accountName(item.accountId)}</td>
                      <td>{formatJournalTimestamp(item.asOf, workspace.timezone)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelected(item);
                            setAssessmentId('');
                            setEvaluationCursors(['']);
                            setError('');
                            setNotice('');
                          }}
                        >
                          Review {item.document.sourceReference}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="reconciliation-actions">
              <Button
                variant="secondary"
                disabled={cursors.length === 1}
                onClick={() => setCursors(cursors.slice(0, -1))}
              >
                Previous statements
              </Button>
              <Button
                variant="secondary"
                disabled={!statements.data.nextCursor}
                onClick={() =>
                  statements.data?.nextCursor &&
                  setCursors([...cursors, statements.data.nextCursor])
                }
              >
                Next statements
              </Button>
            </div>
          </>
        )}
      </Panel>
      {statement && (
        <Panel>
          <h2>Review {statement.document.sourceReference}</h2>
          <p>
            {statement.document.sourceName} · {accountName(statement.accountId)} ·{' '}
            {formatJournalTimestamp(statement.asOf, workspace.timezone)}
          </p>
          <p>
            Cash scope:{' '}
            {statement.document.completeCash
              ? 'complete; omitted currencies are zero'
              : 'listed currencies only'}
            . Holdings scope:{' '}
            {statement.document.completeHoldings
              ? 'complete; omitted holdings are zero'
              : 'listed instruments only'}
            .
          </p>
          <div className="reconciliation-table">
            <table>
              <caption>Preserved statement values</caption>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Unit</th>
                  <th>Statement</th>
                  <th>Absolute tolerance</th>
                </tr>
              </thead>
              <tbody>
                {statement.document.cash.map((line) => (
                  <tr key={`cash-${line.currencyId}`}>
                    <td>Cash</td>
                    <td>{currencyName(line.currencyId)}</td>
                    <td>{line.amount}</td>
                    <td>{line.tolerance}</td>
                  </tr>
                ))}
                {statement.document.holdings.map((line) => (
                  <tr key={`holding-${line.instrumentVersionId}`}>
                    <td>Holding quantity</td>
                    <td>{instrumentName(line.instrumentVersionId)}</td>
                    <td>{line.quantity}</td>
                    <td>{line.tolerance}</td>
                  </tr>
                ))}
                {statement.document.equity && (
                  <tr>
                    <td>Equity</td>
                    <td>{currencyName(statement.document.equity.currencyId)}</td>
                    <td>{statement.document.equity.amount}</td>
                    <td>{statement.document.equity.tolerance}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {statement.document.notes && <p>Source notes: {statement.document.notes}</p>}
          {statement.document.sourceHash && (
            <p className="reconciliation-reference">
              Document SHA-256: {statement.document.sourceHash}
            </p>
          )}
          {editor && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void evaluate(false);
              }}
              aria-label="Compare statement"
            >
              <fieldset disabled={busy}>
                <legend>Comparison review</legend>
                {statement.document.equity && (
                  <>
                    <p>
                      Equity requires compatible price and FX observations. Missing evidence remains
                      unavailable.
                    </p>
                    <div className="reconciliation-fields">
                      <RecordInput
                        label="Price sources in priority order"
                        value={priceSources}
                        onChange={setPriceSources}
                        help="Comma-separated observation sources."
                      />
                      <RecordInput
                        label="FX sources in priority order"
                        value={fxSources}
                        onChange={setFxSources}
                        help="Comma-separated observation sources."
                      />
                      <RecordInput
                        label="Maximum observation age (hours)"
                        value={maximumAgeHours}
                        onChange={setMaximumAgeHours}
                      />
                    </div>
                  </>
                )}
                <RecordField label="Review note">
                  {(id) => (
                    <textarea
                      id={id}
                      maxLength={2000}
                      required
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                    />
                  )}
                </RecordField>
              </fieldset>
              <div className="reconciliation-actions">
                <Button type="submit" disabled={busy}>
                  Compare with ledger
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !canAccept}
                  onClick={() => void evaluate(true)}
                >
                  Accept matching statement
                </Button>
              </div>
              <p>
                Acceptance requires a current match within every tolerance. A stale or incomplete
                comparison must be reviewed again. Accepting retains the displayed comparison’s
                financial revision and valuation policy.
              </p>
            </form>
          )}
          <h3>Saved comparisons</h3>
          <Button
            variant="secondary"
            onClick={() => {
              void evaluations.refetch();
              if (assessmentId) void evaluationDetail.refetch();
            }}
          >
            Refresh comparison status
          </Button>
          {evaluations.isPending ? (
            <p role="status">Loading comparisons…</p>
          ) : evaluations.error ? (
            <p role="alert">Comparison history could not be loaded.</p>
          ) : !evaluations.data?.items.length ? (
            <p>No comparison recorded for this statement.</p>
          ) : (
            <>
              {evaluationDetail.error && assessmentId && (
                <p role="alert">
                  The selected comparison could not be refreshed. Retry its status before accepting
                  evidence.
                </p>
              )}
              <RecordField label="Comparison history">
                {(id) => (
                  <select
                    id={id}
                    value={assessment?.id ?? ''}
                    onChange={(event) => setAssessmentId(event.target.value)}
                  >
                    {assessment &&
                      !evaluations.data.items.some((item) => item.id === assessment.id) && (
                        <option value={assessment.id}>
                          {formatJournalTimestamp(assessment.createdAt, workspace.timezone)} ·{' '}
                          {assessment.status}
                          {assessment.accepted ? ' · accepted' : ''}
                          {assessment.stale ? ' · stale' : ''}
                        </option>
                      )}
                    {evaluations.data.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatJournalTimestamp(item.createdAt, workspace.timezone)} · {item.status}
                        {item.accepted ? ' · accepted' : ''}
                        {item.stale ? ' · stale' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </RecordField>
              <div className="reconciliation-actions">
                <Button
                  variant="secondary"
                  disabled={evaluationCursors.length === 1}
                  onClick={() => {
                    setEvaluationCursors(evaluationCursors.slice(0, -1));
                    setAssessmentId('');
                  }}
                >
                  Previous comparisons
                </Button>
                <Button
                  variant="secondary"
                  disabled={!evaluations.data.nextCursor}
                  onClick={() => {
                    if (evaluations.data?.nextCursor) {
                      setEvaluationCursors([...evaluationCursors, evaluations.data.nextCursor]);
                      setAssessmentId('');
                    }
                  }}
                >
                  Next comparisons
                </Button>
              </div>
              {assessment && (
                <section aria-label="Statement comparison result">
                  <p className="reconciliation-state">
                    Result: {assessment.status}. {assessment.accepted ? 'Accepted' : 'Not accepted'}
                    .{' '}
                    {assessment.stale
                      ? 'Stale — financial records changed; compare again.'
                      : 'Current comparison'}
                    .
                  </p>
                  <p>
                    Compared financial revision {assessment.comparedRevision}; current financial
                    revision {assessment.currentRevision}. Reviewed{' '}
                    {formatJournalTimestamp(assessment.createdAt, workspace.timezone)}.
                  </p>
                  <p>Review note: {assessment.reviewNote}</p>
                  <div className="reconciliation-table">
                    <table>
                      <caption>
                        Independent statement versus ledger; variance is ledger minus statement
                      </caption>
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th>Unit</th>
                          <th>Statement</th>
                          <th>Ledger</th>
                          <th>Variance</th>
                          <th>Tolerance</th>
                          <th>Status and evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessment.rows.map((row) => (
                          <tr key={`${row.kind}-${row.referenceId}`}>
                            <td>
                              {row.kind === 'holding'
                                ? 'Holding quantity'
                                : row.kind === 'cash'
                                  ? 'Cash'
                                  : 'Equity'}
                            </td>
                            <td>
                              {row.kind === 'holding'
                                ? instrumentName(row.referenceId)
                                : currencyName(row.referenceId)}
                            </td>
                            <td>{row.expected}</td>
                            <td>{row.actual ?? 'Unavailable'}</td>
                            <td>{row.variance ?? 'Unavailable'}</td>
                            <td>{row.tolerance}</td>
                            <td>
                              {row.state}
                              {row.reasons.length > 0 && (
                                <span>
                                  {' '}
                                  ·{' '}
                                  {row.reasons
                                    .map((reason) => reason.replaceAll('_', ' '))
                                    .join('; ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
