'use client';

import './journal-ux.css';

import {
  accountResponseSchema,
  currencyResponseSchema,
  instrumentResponseSchema,
  journalCreateSchema,
  journalDetailResponseSchema,
  journalListResponseSchema,
  journalPlansResponseSchema,
  journalRevisionsResponseSchema,
  journalRiskAdditionsResponseSchema,
  strategyListResponseSchema,
  strategyVersionListResponseSchema,
  type JournalCreateInput,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Badge, Button, Panel } from '@journal/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { JournalEditor, JournalField } from './journal-editor';
import { journalErrorMessage, journalRead, journalWrite } from './journal-api';
import { JournalFinancial } from './journal-financial';
import { formatJournalTimestamp } from './journal-time';
import { ConfirmDialog } from '../ux/confirm-dialog';
import { useJournalNavigationGuard } from './journal-navigation';
import { dashboardDatePreset, inclusiveDateRange } from '../dashboard/dashboard-time';
import { journalValidationMessage } from './journal-validation';

function stateLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export function JournalWorkspace({
  workspace,
  workspaces,
  initialTradeId,
  initialFilters = {},
}: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
  initialTradeId: string | null;
  initialFilters?: {
    period?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    accountId?: string | undefined;
    search?: string | undefined;
    status?: string | undefined;
    includeArchived?: string | undefined;
  };
}) {
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const router = useRouter();
  const client = useQueryClient();
  const canEdit = workspace.role !== 'viewer';
  const id = useId();
  const [selectedId, setSelectedId] = useState(initialTradeId);
  const [search, setSearch] = useState(initialFilters.search ?? '');
  const [status, setStatus] = useState(
    ['planned', 'open', 'partially_closed', 'closed', 'canceled'].includes(
      initialFilters.status ?? '',
    )
      ? initialFilters.status!
      : '',
  );
  const [includeArchived, setIncludeArchived] = useState(initialFilters.includeArchived === 'true');
  const [period, setPeriod] = useState<'all' | 'today' | 'week' | 'custom'>(
    ['today', 'week', 'custom'].includes(initialFilters.period ?? '')
      ? (initialFilters.period as 'today' | 'week' | 'custom')
      : 'all',
  );
  const [fromDate, setFromDate] = useState(initialFilters.from ?? '');
  const [toDate, setToDate] = useState(initialFilters.to ?? '');
  const [accountId, setAccountId] = useState(initialFilters.accountId ?? '');
  const [creating, setCreating] = useState(false);
  const [createInput, setCreateInput] = useState<JournalCreateInput>({
    title: '',
    classification: 'active-trading',
    legs: [],
  });
  const [strategyId, setStrategyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [revisionId, setRevisionId] = useState('');
  const [planId, setPlanId] = useState('');
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [discardAction, setDiscardAction] = useState<{ tradeId: string | null } | null>(null);
  const createForm = useRef<HTMLFormElement>(null);
  const createDirty =
    creating &&
    (createInput.title !== '' ||
      createInput.classification !== 'active-trading' ||
      createInput.legs.length > 0 ||
      !!strategyId);
  const weeklyDates = dashboardDatePreset('this-week', workspace.timezone);
  const today = weeklyDates.to;
  const monday = weeklyDates.from;
  const activeFrom = period === 'today' ? today : period === 'week' ? monday : fromDate;
  const activeTo = period === 'today' || period === 'week' ? today : toDate;
  let dateRange: ReturnType<typeof inclusiveDateRange> | null = null;
  let dateError: string | null = null;
  if (period !== 'all') {
    try {
      dateRange = inclusiveDateRange(activeFrom, activeTo, workspace.timezone);
      if (activeFrom > activeTo) throw new Error('From date must be on or before to date.');
    } catch (error) {
      dateError = error instanceof Error ? error.message : 'Choose a valid date range.';
    }
  }
  useJournalNavigationGuard(
    () => createDirty || (creating && busy),
    () => setFailure('Create your trade journal or use Back to discard this draft before leaving.'),
  );
  useEffect(() => {
    if (creating) createForm.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [creating]);
  const journalLocation = useCallback(
    (tradeId: string | null) => {
      const parameters = new URLSearchParams({ workspace: workspace.id });
      if (tradeId) parameters.set('trade', tradeId);
      if (search.trim()) parameters.set('search', search.trim());
      if (status) parameters.set('status', status);
      if (includeArchived) parameters.set('includeArchived', 'true');
      if (period !== 'all') parameters.set('period', period);
      if (period === 'custom') {
        if (fromDate) parameters.set('from', fromDate);
        if (toDate) parameters.set('to', toDate);
      }
      if (accountId) parameters.set('accountId', accountId);
      return `/journal?${parameters}`;
    },
    [workspace.id, search, status, includeArchived, period, fromDate, toDate, accountId],
  );
  useEffect(() => {
    router.replace(journalLocation(selectedId), { scroll: false });
  }, [router, journalLocation, selectedId]);
  const createCommand = useRef<{ serialized: string; id: string } | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['journals', workspace.id, { search, status, includeArchived, dateRange, accountId }],
    enabled: dateError === null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const parameters = new URLSearchParams({
        limit: '25',
        includeArchived: String(includeArchived),
      });
      if (search.trim()) parameters.set('search', search.trim());
      if (status) parameters.set('status', status);
      if (accountId) parameters.set('accountId', accountId);
      if (dateRange) {
        parameters.set('from', dateRange.from);
        parameters.set('to', dateRange.to);
      }
      if (pageParam) parameters.set('cursor', pageParam);
      return journalRead(`${prefix}/journals?${parameters}`, journalListResponseSchema);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: ['journal-detail', workspace.id, selectedId],
    enabled: !!selectedId,
    queryFn: () => journalRead(`${prefix}/journals/${selectedId}`, journalDetailResponseSchema),
  });
  const catalogs = useQuery({
    queryKey: ['journal-catalogs', workspace.id],
    queryFn: async () => {
      const [accounts, instruments, currencies] = await Promise.all([
        journalRead(`${prefix}/financial/accounts?limit=200`, accountResponseSchema.array()),
        journalRead(`${prefix}/financial/instruments?limit=200`, instrumentResponseSchema.array()),
        journalRead(`${prefix}/financial/currencies?limit=200`, currencyResponseSchema.array()),
      ]);
      return { accounts, instruments, currencies };
    },
  });
  const strategies = useQuery({
    queryKey: ['journal-strategies', workspace.id],
    queryFn: () => journalRead(`${prefix}/strategies?limit=100`, strategyListResponseSchema),
  });
  const createVersions = useQuery({
    queryKey: ['journal-create-versions', workspace.id, strategyId],
    enabled: creating && !!strategyId,
    queryFn: () =>
      journalRead(
        `${prefix}/strategies/${strategyId}/versions?limit=100`,
        strategyVersionListResponseSchema,
      ),
  });
  const plans = useInfiniteQuery({
    queryKey: ['journal-plans', workspace.id, selectedId],
    enabled: !!selectedId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      journalRead(
        `${prefix}/journals/${selectedId}/plans?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        journalPlansResponseSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const revisions = useInfiniteQuery({
    queryKey: ['journal-revisions', workspace.id, selectedId],
    enabled: !!selectedId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      journalRead(
        `${prefix}/journals/${selectedId}/revisions?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        journalRevisionsResponseSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const additions = useInfiniteQuery({
    queryKey: ['journal-risk-additions', workspace.id, selectedId],
    enabled: !!selectedId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      journalRead(
        `${prefix}/journals/${selectedId}/risk-additions?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        journalRiskAdditionsResponseSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const refresh = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['journal-detail', workspace.id] }),
      client.invalidateQueries({ queryKey: ['journals', workspace.id] }),
      client.invalidateQueries({ queryKey: ['journal-plans', workspace.id] }),
      client.invalidateQueries({ queryKey: ['journal-revisions', workspace.id] }),
      client.invalidateQueries({ queryKey: ['journal-risk-additions', workspace.id] }),
    ]);
  }, [client, workspace.id]);

  function choose(tradeId: string, created = false) {
    if (createDirty && !created) {
      setDiscardAction({ tradeId });
      return;
    }
    if (dirty) {
      setFailure(
        'Save your current draft before selecting another trade. Your unsaved edits remain in the form.',
      );
      return;
    }
    setSelectedId(tradeId);
    setCreating(false);
    setFailure(null);
    setRevisionId('');
    setPlanId('');
    setCreateErrors({});
    router.replace(journalLocation(tradeId), { scroll: false });
  }
  function newTrade() {
    if (dirty) {
      setFailure('Save your draft before creating another trade.');
      return;
    }
    setCreating(true);
    setFailure(null);
    setRevisionId('');
    setPlanId('');
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = journalCreateSchema.safeParse(createInput);
    if (!parsed.success) {
      setCreateErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      );
      setFailure(
        parsed.error.issues
          .map((issue) => journalValidationMessage(issue.path, issue.message))
          .join(' '),
      );
      return;
    }
    const serialized = JSON.stringify(parsed.data);
    if (createCommand.current?.serialized !== serialized)
      createCommand.current = { serialized, id: crypto.randomUUID() };
    setBusy(true);
    setFailure(null);
    setCreateErrors({});
    try {
      const result = await journalWrite(
        `${prefix}/journals`,
        'POST',
        parsed.data,
        journalDetailResponseSchema,
        createCommand.current.id,
      );
      client.setQueryData(['journal-detail', workspace.id, result.trade.id], result);
      createCommand.current = null;
      setCreateInput({ title: '', classification: 'active-trading', legs: [] });
      setStrategyId('');
      choose(result.trade.id, true);
      await refresh();
    } catch (error) {
      setFailure(journalErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const trades = dateError ? [] : (list.data?.pages.flatMap((page) => page.trades) ?? []);
  const documentRevision = revisions.data?.pages
    .flatMap((page) => page.revisions)
    .find((revision) => revision.id === revisionId);
  const selectedPlan = plans.data?.pages
    .flatMap((page) => page.plans)
    .find((plan) => plan.id === planId);
  const journal = detail.data;
  const currencyName = (currencyId: string) =>
    catalogs.data?.currencies.find((currency) => currency.id === currencyId)?.code ?? currencyId;
  const hasFilters = !!search || !!status || includeArchived || period !== 'all' || !!accountId;

  return (
    <>
      <ConfirmDialog
        open={discardAction !== null}
        title="Discard this new trade draft?"
        description="This trade journal has not been created. Its title and selected instrument legs will be lost."
        confirmLabel="Discard draft"
        busy={busy}
        onCancel={() => setDiscardAction(null)}
        onConfirm={() => {
          const nextTrade = discardAction?.tradeId;
          setDiscardAction(null);
          setCreating(false);
          setCreateInput({ title: '', classification: 'active-trading', legs: [] });
          setStrategyId('');
          setCreateErrors({});
          setFailure(null);
          if (nextTrade) choose(nextTrade, true);
        }}
      />
      <div className="page-heading">
        <div>
          <span className="journal-eyebrow">THE TRADE, THE DECISION, THE LESSON</span>
          <h1>Trade journal</h1>
          <p>Review the numbers. Remember the reasoning.</p>
        </div>
        {canEdit && (
          <div className="journal-heading-actions">
            <a
              className="button button-secondary"
              href={`/record?workspace=${encodeURIComponent(workspace.id)}`}
            >
              Record manual trade
            </a>
            <Button onClick={newTrade}>
              <Plus size={16} aria-hidden="true" /> New trade idea
            </Button>
          </div>
        )}
      </div>
      {workspaces.length > 1 && (
        <div className="journal-field journal-workspace-select">
          <label htmlFor={`${id}-workspace`}>Workspace</label>
          <select
            id={`${id}-workspace`}
            value={workspace.id}
            onChange={(event) => {
              if (dirty || createDirty) {
                setFailure(
                  'Save your journal changes or discard the new trade draft before switching workspaces.',
                );
                return;
              }
              router.push(`/journal?workspace=${encodeURIComponent(event.target.value)}`);
            }}
          >
            {workspaces.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!canEdit && (
        <p className="journal-notice">
          Viewer access · You can inspect financial facts, journal records and immutable history.
        </p>
      )}
      {failure && (
        <p role="alert" className="form-error">
          {failure}
        </p>
      )}
      <div className="journal-split">
        <aside className="journal-list-panel" aria-label="Trade selection">
          <div className="journal-field">
            <label htmlFor={`${id}-period`}>Review period</label>
            <select
              id={`${id}-period`}
              value={period}
              onChange={(event) => setPeriod(event.target.value as typeof period)}
              aria-describedby={`${id}-period-help`}
            >
              <option value="all">All history</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="custom">Custom dates</option>
            </select>
            <small id={`${id}-period-help`}>
              Trade activity in {workspace.timezone}: allocated fill dates. Unfilled ideas use
              creation date.
            </small>
          </div>
          {period === 'custom' && (
            <div className="journal-fields">
              <div className="journal-field">
                <label htmlFor={`${id}-from`}>From date</label>
                <input
                  id={`${id}-from`}
                  type="date"
                  value={fromDate}
                  aria-invalid={dateError ? true : undefined}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </div>
              <div className="journal-field">
                <label htmlFor={`${id}-to`}>To date</label>
                <input
                  id={`${id}-to`}
                  type="date"
                  value={toDate}
                  aria-invalid={dateError ? true : undefined}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </div>
            </div>
          )}
          {dateError && (
            <p role="alert" className="form-error">
              {dateError}
            </p>
          )}
          {period === 'week' && (
            <details className="journal-review-guide">
              <summary>Weekly review checklist</summary>
              <ol>
                <li>Open each trade and compare the plan with ledger actuals.</li>
                <li>Record rule adherence, mistakes and lessons in its review.</li>
                <li>Compare strategy and account results for the same period.</li>
                <li>Check imported activity and unresolved financial coverage.</li>
              </ol>
              <a
                href={`/dashboard?workspace=${encodeURIComponent(workspace.id)}&from=${monday}&to=${today}`}
              >
                Open this week's performance
              </a>
              <p className="journal-help">
                Reviews save to each trade. This checklist does not create a separate weekly record.
              </p>
            </details>
          )}
          <div className="journal-field">
            <label htmlFor={`${id}-search`}>Find a trade</label>
            <input
              id={`${id}-search`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search trade titles"
              aria-describedby={`${id}-search-help`}
            />
            <small id={`${id}-search-help`}>Searches trade titles across the full journal.</small>
          </div>
          <div className="journal-list-filters">
            <div className="journal-field">
              <label htmlFor={`${id}-status`}>Trade status</label>
              <select
                id={`${id}-status`}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                {['planned', 'open', 'partially_closed', 'closed', 'canceled'].map((value) => (
                  <option key={value} value={value}>
                    {stateLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <label className="journal-check">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />{' '}
              Archived
            </label>
          </div>
          <div className="journal-field">
            <label htmlFor={`${id}-account-filter`}>Account</label>
            <select
              id={`${id}-account-filter`}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">All accounts</option>
              {catalogs.data?.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          {list.isPending && !dateError && <p role="status">Loading trades…</p>}
          {list.isFetching && !list.isPending && !list.isFetchingNextPage && (
            <p role="status">Updating trade list…</p>
          )}
          {list.isError && (
            <div role="alert" className="form-error">
              Trades could not be loaded.{' '}
              <Button variant="quiet" onClick={() => void list.refetch()}>
                Retry trade list
              </Button>
            </div>
          )}
          <div className="journal-trade-list" aria-busy={list.isFetching}>
            {trades.map((trade) => (
              <button
                key={trade.id}
                className="journal-trade-card"
                aria-current={selectedId === trade.id ? 'true' : undefined}
                onClick={() => choose(trade.id)}
              >
                <div>
                  <Badge variant={trade.status === 'closed' ? 'success' : 'neutral'}>
                    {stateLabel(trade.status)}
                  </Badge>
                  <span>
                    {trade.classification === 'investing' ? 'Investing' : 'Active trading'}
                  </span>
                </div>
                <strong>{trade.title}</strong>
                <small>
                  {trade.strategyVersionId ? 'Strategy version pinned' : 'Unclassified strategy'}
                  {trade.archivedAt ? ' · Archived' : ''}
                </small>
              </button>
            ))}
          </div>
          {!list.isPending && !list.isError && !dateError && trades.length === 0 && (
            <div className="journal-help">
              <p>
                {hasFilters
                  ? 'No trades match these filters.'
                  : 'Your journal is ready for its first trade.'}
              </p>
              {hasFilters ? (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setSearch('');
                    setStatus('');
                    setIncludeArchived(false);
                    setPeriod('all');
                    setFromDate('');
                    setToDate('');
                    setAccountId('');
                  }}
                >
                  Clear journal filters
                </Button>
              ) : (
                <>
                  <p>Record a manual fill, import broker activity, or start with a trade idea.</p>
                  <a href={`/imports?workspace=${encodeURIComponent(workspace.id)}`}>
                    Import broker trades
                  </a>
                </>
              )}
            </div>
          )}
          {list.hasNextPage && !dateError && (
            <Button
              variant="secondary"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? 'Loading more trades…' : 'Load more trades'}
            </Button>
          )}
        </aside>
        <div className="journal-detail-column">
          {creating ? (
            <Panel className="journal-create">
              <div className="journal-section-heading">
                <h2>Start a trade journal</h2>
                <Button
                  variant="quiet"
                  onClick={() =>
                    createDirty ? setDiscardAction({ tradeId: null }) : setCreating(false)
                  }
                  disabled={busy}
                >
                  <ArrowLeft size={15} aria-hidden="true" /> Back
                </Button>
              </div>
              <p className="journal-help">
                Start with an idea, or link instrument legs from your existing catalogs. Executions
                and cash economics remain in the ledger.
              </p>
              <form ref={createForm} onSubmit={(event) => void create(event)}>
                <fieldset className="journal-fieldset" disabled={busy}>
                  <legend>Trade identity</legend>
                  <div className="journal-fields">
                    <JournalField
                      label="Trade title"
                      value={createInput.title}
                      onChange={(value) => setCreateInput({ ...createInput, title: value })}
                      required
                      error={createErrors.title}
                    />
                    <div className="journal-field">
                      <label htmlFor={`${id}-classification`}>Classification</label>
                      <select
                        id={`${id}-classification`}
                        value={createInput.classification}
                        onChange={(event) =>
                          setCreateInput({
                            ...createInput,
                            classification: event.target
                              .value as JournalCreateInput['classification'],
                          })
                        }
                      >
                        <option value="active-trading">Active trading</option>
                        <option value="investing">Investing</option>
                      </select>
                    </div>
                    <div className="journal-field">
                      <label htmlFor={`${id}-create-strategy`}>Strategy</label>
                      <select
                        id={`${id}-create-strategy`}
                        value={strategyId}
                        onChange={(event) => {
                          setStrategyId(event.target.value);
                          setCreateInput(
                            ({ strategyVersionId: _strategyVersionId, ...previous }) => previous,
                          );
                        }}
                      >
                        <option value="">No strategy yet</option>
                        {strategies.data?.strategies
                          .filter((strategy) => !strategy.archivedAt)
                          .map((strategy) => (
                            <option key={strategy.id} value={strategy.id}>
                              {strategy.currentVersion.definition.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    {strategyId && (
                      <div className="journal-field">
                        <label htmlFor={`${id}-create-version`}>Strategy version</label>
                        <select
                          id={`${id}-create-version`}
                          value={createInput.strategyVersionId ?? ''}
                          disabled={createVersions.isPending || createVersions.isError}
                          onChange={(event) =>
                            setCreateInput({
                              ...createInput,
                              strategyVersionId: event.target.value,
                            })
                          }
                        >
                          <option value="">Choose immutable version</option>
                          {createVersions.data?.versions.map((version) => (
                            <option key={version.id} value={version.id}>
                              v{version.version} · {version.definition.name}
                            </option>
                          ))}
                        </select>
                        {createVersions.isPending && (
                          <small role="status">Loading strategy versions…</small>
                        )}
                        {createVersions.isError && (
                          <small role="alert">
                            Strategy versions could not be loaded.{' '}
                            <Button variant="quiet" onClick={() => void createVersions.refetch()}>
                              Retry versions
                            </Button>
                          </small>
                        )}
                        <small>The trade will retain this version when the playbook changes.</small>
                      </div>
                    )}
                  </div>
                </fieldset>
                <fieldset className="journal-fieldset" disabled={busy}>
                  <legend>Instrument legs · optional</legend>
                  {catalogs.isError && (
                    <p role="alert" className="form-error">
                      Account and instrument catalogs could not be loaded.
                    </p>
                  )}
                  {catalogs.isPending && <p role="status">Loading accounts and instruments…</p>}
                  {createInput.legs.map((leg, index) => (
                    <div className="journal-create-leg" key={index}>
                      <div className="journal-fields">
                        <div className="journal-field">
                          <label htmlFor={`${id}-account-${index}`}>Leg {index + 1} account</label>
                          <select
                            id={`${id}-account-${index}`}
                            value={leg.accountId}
                            aria-invalid={
                              createErrors[`legs.${index}.accountId`] ? true : undefined
                            }
                            onChange={(event) =>
                              setCreateInput({
                                ...createInput,
                                legs: createInput.legs.map((entry, position) =>
                                  position === index
                                    ? { ...entry, accountId: event.target.value }
                                    : entry,
                                ),
                              })
                            }
                          >
                            <option value="">Choose account</option>
                            {catalogs.data?.accounts
                              .filter(
                                (account) => !account.archivedAt && account.status === 'active',
                              )
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                          </select>
                          {createErrors[`legs.${index}.accountId`] && (
                            <small className="form-error">Choose an account for this leg.</small>
                          )}
                        </div>
                        <div className="journal-field">
                          <label htmlFor={`${id}-instrument-${index}`}>
                            Leg {index + 1} instrument
                          </label>
                          <select
                            id={`${id}-instrument-${index}`}
                            value={leg.instrumentVersionId}
                            aria-invalid={
                              createErrors[`legs.${index}.instrumentVersionId`] ? true : undefined
                            }
                            onChange={(event) =>
                              setCreateInput({
                                ...createInput,
                                legs: createInput.legs.map((entry, position) =>
                                  position === index
                                    ? { ...entry, instrumentVersionId: event.target.value }
                                    : entry,
                                ),
                              })
                            }
                          >
                            <option value="">Choose instrument</option>
                            {catalogs.data?.instruments
                              .filter((instrument) => !instrument.archivedAt)
                              .map((instrument) => (
                                <option key={instrument.id} value={instrument.versionId}>
                                  {instrument.name} · {instrument.quantityUnit}
                                </option>
                              ))}
                          </select>
                          {createErrors[`legs.${index}.instrumentVersionId`] && (
                            <small className="form-error">Choose an instrument for this leg.</small>
                          )}
                        </div>
                        <div className="journal-field">
                          <label htmlFor={`${id}-direction-${index}`}>
                            Leg {index + 1} direction
                          </label>
                          <select
                            id={`${id}-direction-${index}`}
                            value={leg.direction}
                            onChange={(event) =>
                              setCreateInput({
                                ...createInput,
                                legs: createInput.legs.map((entry, position) =>
                                  position === index
                                    ? {
                                        ...entry,
                                        direction: event.target.value as 'long' | 'short',
                                      }
                                    : entry,
                                ),
                              })
                            }
                          >
                            <option value="long">Long</option>
                            <option value="short">Short</option>
                          </select>
                        </div>
                        <JournalField
                          label={`Leg ${index + 1} label`}
                          value={leg.label}
                          onChange={(value) =>
                            setCreateInput({
                              ...createInput,
                              legs: createInput.legs.map((entry, position) =>
                                position === index ? { ...entry, label: value } : entry,
                              ),
                            })
                          }
                        />
                      </div>
                      <Button
                        variant="quiet"
                        onClick={() =>
                          setCreateInput({
                            ...createInput,
                            legs: createInput.legs.filter((_, position) => position !== index),
                          })
                        }
                      >
                        Remove leg {index + 1}
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    disabled={createInput.legs.length >= 20 || catalogs.isPending}
                    onClick={() =>
                      setCreateInput({
                        ...createInput,
                        legs: [
                          ...createInput.legs,
                          {
                            accountId: '',
                            instrumentVersionId: '',
                            direction: 'long',
                            label: `Leg ${createInput.legs.length + 1}`,
                          },
                        ],
                      })
                    }
                  >
                    Add instrument leg
                  </Button>
                  <p className="journal-help">
                    No catalogs yet? Create an idea without legs. Prices require a specific
                    instrument and unit.
                  </p>
                </fieldset>
                <Button
                  type="submit"
                  disabled={busy || (!!strategyId && !createInput.strategyVersionId)}
                >
                  {busy ? 'Creating trade…' : 'Create trade journal'}
                </Button>
              </form>
            </Panel>
          ) : selectedId ? (
            <>
              {detail.isPending && (
                <Panel className="journal-loading" role="status">
                  Loading the trade, its ledger facts and journal history…
                </Panel>
              )}
              {detail.isError && (
                <Panel className="journal-loading">
                  <p role="alert" className="form-error">
                    This trade could not be loaded. It may be unavailable in this workspace.
                  </p>
                  <Button variant="secondary" onClick={() => void detail.refetch()}>
                    Retry trade detail
                  </Button>
                </Panel>
              )}
              {journal && (
                <>
                  <div className="journal-trade-heading">
                    <div className="journal-trade-heading-label">
                      <Badge>{stateLabel(journal.trade.status)}</Badge>
                      <span>
                        {journal.trade.classification === 'investing'
                          ? 'Investing'
                          : 'Active trading'}
                      </span>
                      {journal.trade.archivedAt && <Badge>Archived</Badge>}
                    </div>
                    <h2>{journal.trade.title}</h2>
                    <p>
                      {journal.strategy
                        ? `${journal.strategy.definition.name} · immutable v${journal.strategy.version}`
                        : 'No strategy associated'}
                      {journal.trade.strategyLinkTiming === 'retrospective'
                        ? ' · Retrospective association'
                        : ''}
                    </p>
                    {canEdit &&
                      !journal.trade.archivedAt &&
                      !['closed', 'canceled'].includes(journal.trade.status) && (
                        <a
                          className="button button-secondary"
                          href={`/record?workspace=${encodeURIComponent(workspace.id)}&trade=${encodeURIComponent(journal.trade.id)}`}
                        >
                          Record execution
                        </a>
                      )}
                    {journal.trade.closureReviewRequired && (
                      <p className="journal-notice">
                        Financial sources changed after closure. Review the ledger closure before
                        treating this campaign as final.
                      </p>
                    )}
                  </div>
                  <JournalFinancial
                    detail={journal}
                    currencies={catalogs.data?.currencies ?? []}
                    timeZone={workspace.timezone}
                  />
                  <details className="journal-history">
                    <summary>Plans, reviews &amp; immutable history</summary>
                    <Panel>
                      <div className="journal-section-heading">
                        <h3>Immutable history</h3>
                        <span className="journal-source">Plans &amp; saved reviews</span>
                      </div>
                      <div className="journal-fields">
                        <div className="journal-field">
                          <label htmlFor={`${id}-plan-history`}>Published plan snapshot</label>
                          <select
                            id={`${id}-plan-history`}
                            value={planId}
                            onChange={(event) => setPlanId(event.target.value)}
                          >
                            <option value="">Choose a published plan</option>
                            {plans.data?.pages
                              .flatMap((page) => page.plans)
                              .map((plan) => (
                                <option value={plan.id} key={plan.id}>
                                  Plan v{plan.version}
                                  {journal.originalPlan?.id === plan.id ? ' · Original' : ''} ·{' '}
                                  {formatJournalTimestamp(plan.createdAt, workspace.timezone)}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="journal-field">
                          <label htmlFor={`${id}-revision-history`}>Journal review snapshot</label>
                          <select
                            id={`${id}-revision-history`}
                            value={revisionId}
                            onChange={(event) => {
                              if (dirty) {
                                setFailure(
                                  'Save your current draft before opening historical review snapshots.',
                                );
                                return;
                              }
                              setRevisionId(event.target.value);
                            }}
                          >
                            <option value="">Current editable journal</option>
                            {revisions.data?.pages
                              .flatMap((page) => page.revisions)
                              .map((revision) => (
                                <option value={revision.id} key={revision.id}>
                                  Revision {revision.revision} ·{' '}
                                  {formatJournalTimestamp(revision.createdAt, workspace.timezone)}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                      {(plans.isError || revisions.isError || additions.isError) && (
                        <p role="alert" className="form-error">
                          Some history could not be loaded.{' '}
                          <Button variant="quiet" onClick={() => void refresh()}>
                            Retry history
                          </Button>
                        </p>
                      )}
                      {selectedPlan && (
                        <section
                          className="journal-plan-snapshot"
                          aria-label={`Published plan v${selectedPlan.version}`}
                        >
                          <h4>
                            Plan v{selectedPlan.version}
                            {journal.originalPlan?.id === selectedPlan.id
                              ? ' · Original commitment'
                              : ' · Later revision'}
                          </h4>
                          <p className="journal-help">
                            {selectedPlan.changeReason} ·{' '}
                            {formatJournalTimestamp(selectedPlan.createdAt, workspace.timezone)} ·
                            Recorded by {selectedPlan.createdBy}
                          </p>
                          <dl>
                            <div>
                              <dt>Thesis</dt>
                              <dd>{selectedPlan.definition.thesis || 'Not recorded'}</dd>
                            </div>
                            <div>
                              <dt>Initial risk</dt>
                              <dd>
                                {selectedPlan.definition.initialRisk
                                  ? `${selectedPlan.definition.initialRisk.amount} ${currencyName(selectedPlan.definition.initialRisk.currencyId)} · ${selectedPlan.definition.initialRisk.method}`
                                  : 'Not recorded'}
                              </dd>
                            </div>
                            <div>
                              <dt>Market conditions</dt>
                              <dd>{selectedPlan.definition.marketConditions || 'Not recorded'}</dd>
                            </div>
                            <div>
                              <dt>Timeframe</dt>
                              <dd>{selectedPlan.definition.timeframe || 'Not recorded'}</dd>
                            </div>
                            {selectedPlan.definition.legs.map((leg) => (
                              <div key={leg.legId}>
                                <dt>
                                  {journal.financial.legs.find((entry) => entry.legId === leg.legId)
                                    ?.instrumentName ?? 'Instrument leg'}
                                </dt>
                                <dd>
                                  Entry {leg.plannedEntry ?? 'unrecorded'} · Stop{' '}
                                  {leg.plannedStop ?? 'unrecorded'} · Targets{' '}
                                  {leg.plannedTargets.join(', ') || 'unrecorded'} · Quantity{' '}
                                  {leg.plannedQuantity ?? 'unrecorded'}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {selectedPlan.definition.attachmentIds.length > 0 && (
                            <ul>
                              {selectedPlan.definition.attachmentIds.map((attachmentId) => (
                                <li key={attachmentId}>
                                  <a
                                    href={`${prefix}/journal-attachments/${attachmentId}`}
                                    download
                                  >
                                    Download original planning evidence {attachmentId}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      )}
                      {plans.hasNextPage && (
                        <Button
                          variant="quiet"
                          disabled={plans.isFetchingNextPage}
                          onClick={() => void plans.fetchNextPage()}
                        >
                          Load older plans
                        </Button>
                      )}
                      {revisions.hasNextPage && (
                        <Button
                          variant="quiet"
                          disabled={revisions.isFetchingNextPage}
                          onClick={() => void revisions.fetchNextPage()}
                        >
                          Load older reviews
                        </Button>
                      )}
                      <details>
                        <summary>Supplemental risk history</summary>
                        {additions.data?.pages.flatMap((page) => page.riskAdditions).length ? (
                          <ul>
                            {additions.data.pages
                              .flatMap((page) => page.riskAdditions)
                              .map((addition) => (
                                <li key={addition.id}>
                                  {addition.amount} {currencyName(addition.currencyId)} ·{' '}
                                  {addition.method} · {addition.reason} ·{' '}
                                  {formatJournalTimestamp(addition.createdAt, workspace.timezone)}
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="journal-help">No supplemental risk recorded.</p>
                        )}
                        {additions.hasNextPage && (
                          <Button variant="quiet" onClick={() => void additions.fetchNextPage()}>
                            Load older risk additions
                          </Button>
                        )}
                      </details>
                    </Panel>
                  </details>
                  {documentRevision && (
                    <p className="journal-notice">
                      Viewing immutable review revision {documentRevision.revision}. Financial
                      actuals above reflect the current financial source revision.
                    </p>
                  )}
                  <JournalEditor
                    key={`${journal.trade.id}:${revisionId || 'current'}`}
                    workspaceId={workspace.id}
                    detail={journal}
                    currencies={catalogs.data?.currencies ?? []}
                    editable={canEdit}
                    onSaved={refresh}
                    onDirtyChange={setDirty}
                    strategies={strategies.data?.strategies ?? []}
                    {...(documentRevision ? { historyDocument: documentRevision.document } : {})}
                  />
                </>
              )}
            </>
          ) : (
            <Panel className="journal-select-empty">
              <BookOpen size={36} strokeWidth={1.4} aria-hidden="true" />
              <span className="journal-eyebrow">A RECORD OF YOUR PROCESS</span>
              <h2>Every trade has a story.</h2>
              <p>Select a trade to compare the plan, the ledger actuals and what you learned.</p>
              {canEdit && (
                <>
                  <Button onClick={newTrade}>Start a trade journal</Button>
                  <a href={`/record?workspace=${encodeURIComponent(workspace.id)}`}>
                    Record a manual trade
                  </a>
                </>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
