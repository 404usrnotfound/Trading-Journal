'use client';
import { useDisplayViews } from '../display-views/use-display-views';

import {
  strategyListResponseSchema,
  strategyResponseSchema,
  strategyTradesResponseSchema,
  strategyTradeLinkCreateSchema,
  strategyVersionListResponseSchema,
  strategyVersionResponseSchema,
  tradeResponseSchema,
  type StrategyDefinition,
  type StrategyTradeLinkCreateInput,
  type StrategyResponse,
  type StrategyVersionResponse,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Badge, Button, Panel } from '@journal/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ux/confirm-dialog';
import {
  WORKSPACE_NAVIGATION_REQUEST,
  type WorkspaceNavigationRequestDetail,
} from '../ux/navigation-request';
import './strategies.css';
import { StrategyAttachments } from './strategy-attachments';
import {
  StrategyApiError,
  strategyErrorMessage,
  strategyRead,
  strategyWrite,
} from './strategy-api';
import { StrategyEditor, strategyNarrativeFields } from './strategy-editor';
import { formatJournalTimestamp } from '../journal/journal-time';
import { CatalogPager, arrayCatalogPage, pinCatalogPage } from '../record/catalog-page';

function title(value: string): string {
  return `${value[0]?.toUpperCase()}${value.slice(1)}`;
}
function display(value: string | string[]): string {
  return (Array.isArray(value) ? value.join(', ') : value) || 'Not configured';
}

function RuleSnapshot({
  version,
  workspaceId,
}: {
  version: StrategyVersionResponse;
  workspaceId: string;
}) {
  const definition = version.definition;
  const eligibility = [
    ['Asset classes', definition.assetClasses],
    ['Markets', definition.markets],
    ['Timeframes', definition.timeframes],
    ['Direction', title(definition.direction)],
    ['Trading style', definition.style],
    ['Sessions', definition.sessions],
    ['Indicators', definition.indicators],
    ['Tags', definition.tags],
    ['Eligible instrument IDs', definition.eligibleInstruments],
  ] as const;
  return (
    <>
      <section className="strategy-section">
        <h3>Eligibility &amp; context</h3>
        <dl className="strategy-definitions">
          {eligibility.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{display(typeof value === 'string' ? value : [...value])}</dd>
            </div>
          ))}
        </dl>
      </section>
      {strategyNarrativeFields
        .filter(([key]) => definition[key].trim())
        .map(([key, label]) => (
          <section className="strategy-section" key={key}>
            <h3>{label}</h3>
            <p className="strategy-rules">{display(definition[key])}</p>
          </section>
        ))}
      <section className="strategy-section">
        <h3>Checklist</h3>
        {definition.checklist.length === 0 ? (
          <p className="muted">No checklist configured.</p>
        ) : (
          <ul>
            {definition.checklist.map((item) => (
              <li key={item.id}>
                {item.label}
                {item.required ? ' · Required' : ' · Optional'}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="strategy-section">
        <h3>Named setups</h3>
        {definition.setups.length === 0 ? (
          <p className="muted">No named setups configured.</p>
        ) : (
          definition.setups.map((setup) => (
            <div className="strategy-repeater-row" key={setup.id}>
              <h4>{setup.name}</h4>
              <p className="strategy-rules">{setup.description || 'No description.'}</p>
              <p className="strategy-rules">{setup.conditions || 'No additional conditions.'}</p>
              {setup.checklistItemIds.length > 0 && (
                <ul>
                  {setup.checklistItemIds.map((id) => (
                    <li key={id}>{definition.checklist.find((item) => item.id === id)?.label}</li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </section>
      <section className="strategy-section">
        <h3>Typed parameters</h3>
        <p className="strategy-readonly-note">
          Recorded rule configuration. Automatic rule evaluation is not performed.
        </p>
        {definition.parameters.length === 0 ? (
          <p className="muted">No parameters configured.</p>
        ) : (
          <dl className="strategy-definitions">
            {definition.parameters.map((parameter) => (
              <div key={parameter.id}>
                <dt>
                  {parameter.name} · {parameter.type}
                </dt>
                <dd>
                  {parameter.type === 'boolean'
                    ? parameter.value
                      ? 'Enabled'
                      : 'Disabled'
                    : parameter.value}
                  {parameter.type === 'decimal' && parameter.unit ? ` ${parameter.unit}` : ''}
                  {parameter.description && <p>{parameter.description}</p>}
                  {parameter.type === 'decimal' &&
                    (parameter.minimum !== null || parameter.maximum !== null) && (
                      <p className="muted">
                        Range: {parameter.minimum ?? 'Unbounded'} to{' '}
                        {parameter.maximum ?? 'Unbounded'}
                      </p>
                    )}
                  {parameter.type === 'enum' && (
                    <p className="muted">Choices: {parameter.options.join(', ')}</p>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <section className="strategy-section">
        <h3>Screenshots &amp; attachments</h3>
        <StrategyAttachments workspaceId={workspaceId} attachmentIds={definition.attachmentIds} />
      </section>
    </>
  );
}

function definitionText(definition: StrategyDefinition, key: keyof StrategyDefinition): string {
  switch (key) {
    case 'checklist':
      return (
        definition.checklist
          .map((item) => `${item.label}${item.required ? ' (required)' : ''}`)
          .join('\n') || 'Not configured'
      );
    case 'setups':
      return (
        definition.setups.map((setup) => `${setup.name}: ${setup.conditions}`).join('\n') ||
        'Not configured'
      );
    case 'parameters':
      return (
        definition.parameters
          .map((parameter) => `${parameter.name} (${parameter.type}): ${String(parameter.value)}`)
          .join('\n') || 'Not configured'
      );
    default: {
      const value = definition[key];
      return display(typeof value === 'string' ? value : (value as string[]));
    }
  }
}

export function StrategyWorkspace({
  workspace,
  workspaces,
  initialStrategyId,
  initialVersionId = null,
  initialTradeId = null,
}: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
  initialStrategyId: string | null;
  initialVersionId?: string | null;
  initialTradeId?: string | null;
}) {
  const prefix = `/api/v1/workspaces/${workspace.id}/strategies`;
  const client = useQueryClient();
  const router = useRouter();
  const canEdit = workspace.role !== 'viewer';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState(initialStrategyId);
  const [versionId, setVersionId] = useState<string | null>(initialVersionId);
  const [editing, setEditing] = useState<StrategyResponse | 'new' | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveForm, setArchiveForm] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [tradeId, setTradeId] = useState(initialTradeId ?? '');
  const [linkReason, setLinkReason] = useState('');
  const [comparisonId, setComparisonId] = useState('');
  const displayViews = useDisplayViews({
    workspaceId: workspace.id,
    screen: 'strategies',
    filters: { search, status, includeArchived: String(includeArchived) },
    onApply: (filters) => {
      setSearch(filters.search!);
      setStatus(filters.status!);
      setIncludeArchived(filters.includeArchived === 'true');
    },
  });
  const [editorDirty, setEditorDirty] = useState(false);
  const navigationApproved = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const pendingSignOut = useRef(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState<{
    strategyId: string;
    name: string;
    expectedRevision: number;
    reason: string;
    commandId: string;
  } | null>(null);
  const [linkConfirmation, setLinkConfirmation] = useState<{
    strategyId: string;
    tradeTitle: string;
    versionName: string;
    version: number;
    input: StrategyTradeLinkCreateInput;
    commandId: string;
  } | null>(null);

  function protectNavigation(action: () => void) {
    pendingSignOut.current = false;
    if (editorDirty) setPendingNavigation(() => action);
    else action();
  }
  useEffect(() => {
    if (!editorDirty) return;
    navigationApproved.current = false;
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (navigationApproved.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectDraft);
    const protectLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        anchor.origin !== window.location.origin ||
        (anchor.hash &&
          anchor.pathname === window.location.pathname &&
          anchor.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      pendingSignOut.current = false;
      setPendingNavigation(() => () => window.location.assign(anchor.href));
    };
    const protectSignOut = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceNavigationRequestDetail>).detail;
      if (detail?.handled) return;
      event.preventDefault();
      const continuation = detail?.continue;
      if (typeof continuation === 'function') {
        detail.handled = true;
        pendingSignOut.current = true;
        setPendingNavigation(() => continuation);
      } else setActionError('Save your strategy changes or cancel the edit before signing out.');
    };
    document.addEventListener('click', protectLink, true);
    window.addEventListener(WORKSPACE_NAVIGATION_REQUEST, protectSignOut);
    return () => {
      document.removeEventListener('click', protectLink, true);
      window.removeEventListener('beforeunload', protectDraft);
      window.removeEventListener(WORKSPACE_NAVIGATION_REQUEST, protectSignOut);
    };
  }, [editorDirty]);

  const list = useInfiniteQuery({
    queryKey: ['strategies', workspace.id, { search, status, includeArchived }],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const parameters = new URLSearchParams({
        limit: '25',
        includeArchived: String(includeArchived),
      });
      if (search.trim()) parameters.set('search', search.trim());
      if (status) parameters.set('status', status);
      if (pageParam) parameters.set('cursor', pageParam);
      return strategyRead(`${prefix}?${parameters}`, strategyListResponseSchema);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: ['strategy', workspace.id, selectedId],
    enabled: selectedId !== null,
    queryFn: () => strategyRead(`${prefix}/${selectedId}`, strategyResponseSchema),
  });
  const versions = useInfiniteQuery({
    queryKey: ['strategy-versions', workspace.id, selectedId],
    enabled: selectedId !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      strategyRead(
        `${prefix}/${selectedId}/versions?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        strategyVersionListResponseSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const pinnedVersion = useQuery({
    queryKey: ['strategy-version', workspace.id, selectedId, versionId],
    enabled: selectedId !== null && versionId !== null,
    queryFn: () =>
      strategyRead(`${prefix}/${selectedId}/versions/${versionId}`, strategyVersionResponseSchema),
  });
  const linked = useInfiniteQuery({
    queryKey: ['strategy-trades', workspace.id, selectedId],
    enabled: selectedId !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      strategyRead(
        `${prefix}/${selectedId}/trades?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        strategyTradesResponseSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const unclassified = useQuery({
    queryKey: ['strategy-unclassified-trades', workspace.id],
    enabled: canEdit && selectedId !== null && editing === null,
    queryFn: () =>
      strategyRead(
        `/api/v1/workspaces/${workspace.id}/financial/trades?limit=200&unclassified=true`,
        tradeResponseSchema.array(),
      ),
  });
  const requestedTrade = useQuery({
    queryKey: ['strategy-requested-trade', workspace.id, initialTradeId],
    enabled:
      !!initialTradeId &&
      unclassified.isSuccess &&
      !unclassified.data.some((trade) => trade.id === initialTradeId),
    queryFn: () =>
      strategyRead(
        `/api/v1/workspaces/${workspace.id}/financial/trades/${initialTradeId}`,
        tradeResponseSchema,
      ),
  });
  const strategy = detail.data;
  const loadedHistory = versions.data?.pages.flatMap((page) => page.versions) ?? [];
  const history =
    pinnedVersion.data && !loadedHistory.some((version) => version.id === pinnedVersion.data.id)
      ? [...loadedHistory, pinnedVersion.data]
      : loadedHistory;
  const selectedVersion = versionId
    ? (history.find((version) => version.id === versionId) ?? pinnedVersion.data)
    : strategy?.currentVersion;
  const comparisonVersion = history.find((version) => version.id === comparisonId);
  const loadedTrades = unclassified.data ?? [];
  const availableTrades = [
    ...loadedTrades,
    ...(requestedTrade.data && !loadedTrades.some((trade) => trade.id === requestedTrade.data.id)
      ? [requestedTrade.data]
      : []),
  ].filter((trade) => trade.strategyVersionId === null && trade.archivedAt === null);

  function choose(id: string) {
    setSelectedId(id);
    setVersionId(null);
    setEditing(null);
    setMessage(null);
    setActionError(null);
    setArchiveForm(false);
    setComparisonId('');
    setEditorDirty(false);
    setTradeId(initialTradeId ?? '');
    router.replace(
      `/strategies?workspace=${encodeURIComponent(workspace.id)}&strategy=${encodeURIComponent(id)}${initialTradeId ? `&trade=${encodeURIComponent(initialTradeId)}` : ''}`,
      { scroll: false },
    );
  }
  async function refreshViews() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['strategies', workspace.id] }),
      client.invalidateQueries({ queryKey: ['strategy', workspace.id] }),
      client.invalidateQueries({ queryKey: ['strategy-versions', workspace.id] }),
      client.invalidateQueries({ queryKey: ['strategy-trades', workspace.id] }),
      client.invalidateQueries({ queryKey: ['strategy-unclassified-trades', workspace.id] }),
    ]);
  }
  async function save(input: unknown, commandId: string) {
    setMessage(null);
    setActionError(null);
    try {
      const updated = await strategyWrite(
        editing && editing !== 'new' ? `${prefix}/${editing.id}` : prefix,
        editing && editing !== 'new' ? 'PUT' : 'POST',
        input,
        strategyResponseSchema,
        commandId,
      );
      setSelectedId(updated.id);
      setVersionId(null);
      setEditing(null);
      setEditorDirty(false);
      setConflict(false);
      client.setQueryData(['strategy', workspace.id, updated.id], updated);
      router.replace(
        `/strategies?workspace=${encodeURIComponent(workspace.id)}&strategy=${encodeURIComponent(updated.id)}${initialTradeId ? `&trade=${encodeURIComponent(initialTradeId)}` : ''}`,
        { scroll: false },
      );
      await refreshViews();
      setMessage(
        `Strategy saved as version ${updated.currentVersion.version}. Historical versions remain unchanged.`,
      );
    } catch (error) {
      if (error instanceof StrategyApiError && error.status === 409) setConflict(true);
      throw new Error(strategyErrorMessage(error));
    }
  }
  async function reloadEditor() {
    if (!editing || editing === 'new') return;
    const updated = await strategyRead(`${prefix}/${editing.id}`, strategyResponseSchema);
    client.setQueryData(['strategy', workspace.id, updated.id], updated);
    setEditing(updated);
    setConflict(false);
  }
  async function archive() {
    if (!archiveConfirmation || busy) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await strategyWrite(
        `${prefix}/${archiveConfirmation.strategyId}`,
        'DELETE',
        {
          expectedRevision: archiveConfirmation.expectedRevision,
          reason: archiveConfirmation.reason,
        },
        strategyResponseSchema,
        archiveConfirmation.commandId,
      );
      await refreshViews();
      setArchiveForm(false);
      setArchiveConfirmation(null);
      setMessage('Strategy archived. Its versions and linked trades have been preserved.');
    } catch (error) {
      setActionError(strategyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function prepareLink() {
    const trade = availableTrades.find((entry) => entry.id === tradeId);
    if (!trade || !selectedVersion || !strategy || busy) return;
    const parsed = strategyTradeLinkCreateSchema.safeParse({
      tradeId,
      versionId: selectedVersion.id,
      expectedTradeRevision: trade.revision,
      reason: linkReason.trim(),
    });
    if (!parsed.success) {
      setActionError(
        'Choose an unclassified trade, a version and a reason for the retrospective assignment.',
      );
      return;
    }
    setLinkConfirmation({
      strategyId: strategy.id,
      tradeTitle: trade.title,
      versionName: selectedVersion.definition.name,
      version: selectedVersion.version,
      input: parsed.data,
      commandId: crypto.randomUUID(),
    });
  }
  async function linkTrade() {
    if (!linkConfirmation || busy) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await strategyWrite(
        `${prefix}/${linkConfirmation.strategyId}/trade-links`,
        'POST',
        linkConfirmation.input,
        tradeResponseSchema,
        linkConfirmation.commandId,
      );
      await refreshViews();
      setTradeId('');
      setLinkReason('');
      setLinkConfirmation(null);
      setMessage(
        `Trade assigned retrospectively to version ${linkConfirmation.version}. This association cannot be reassigned.`,
      );
    } catch (error) {
      setActionError(strategyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PLAYBOOK</div>
          <h1>Strategies</h1>
          <p>
            Define your process. Keep each version’s rules connected to the trades that used them.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() =>
              protectNavigation(() => {
                setEditorDirty(false);
                setDraftKey((previous) => previous + 1);
                setEditing('new');
                setConflict(false);
                setMessage(null);
                setActionError(null);
              })
            }
          >
            <Plus size={17} aria-hidden="true" />
            New strategy
          </Button>
        )}
      </div>
      {workspace.isDemo && (
        <p className="demo-notice" role="note">
          This is a clearly labeled demo workspace, separate from real workspace data.
        </p>
      )}
      {!canEdit && (
        <p className="strategy-readonly-note">
          You have viewer access. Strategy versions and linked trades are read-only.
        </p>
      )}
      {workspaces.length > 1 && (
        <div className="workspace-switcher field">
          <label htmlFor="strategy-workspace">Workspace</label>
          <select
            id="strategy-workspace"
            value={workspace.id}
            onChange={(event) => {
              const targetWorkspace = event.target.value;
              protectNavigation(() => {
                setEditorDirty(false);
                client.clear();
                router.replace(`/strategies?workspace=${encodeURIComponent(targetWorkspace)}`);
                router.refresh();
              });
            }}
          >
            {workspaces.map((entry) => (
              <option value={entry.id} key={entry.id}>
                {entry.name}
                {entry.isDemo ? ' (demo)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {message && (
        <p className="strategy-status" role="status">
          {message}
        </p>
      )}
      {actionError && !archiveConfirmation && !linkConfirmation && (
        <p className="strategy-errors" role="alert">
          {actionError}
        </p>
      )}
      <div className="strategy-toolbar">
        <div className="field">
          <label htmlFor="strategy-search">Search strategies</label>
          <input
            id="strategy-search"
            type="search"
            value={search}
            maxLength={160}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
          />
        </div>
        <div className="field">
          <label htmlFor="strategy-filter-status">Filter by status</label>
          <select
            id="strategy-filter-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {['draft', 'active', 'paused', 'retired'].map((entry) => (
              <option value={entry} key={entry}>
                {title(entry)}
              </option>
            ))}
          </select>
        </div>
        <label className="strategy-check">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          Include archived
        </label>
      </div>
      {displayViews.controls}
      <div className="strategy-split">
        <section aria-label="Strategy list" className="strategy-list">
          {list.isPending && <p role="status">Loading strategies…</p>}
          {list.isError && (
            <Panel className="strategy-empty">
              <p role="alert">{strategyErrorMessage(list.error)}</p>
              <Button variant="secondary" onClick={() => void list.refetch()}>
                Retry strategy list
              </Button>
            </Panel>
          )}
          {list.data?.pages
            .flatMap((page) => page.strategies)
            .map((entry) => (
              <button
                className="strategy-card"
                key={entry.id}
                aria-label={`${entry.currentVersion.definition.name}${displayViews.columns.includes('status') ? ` · ${entry.archivedAt ? 'Archived' : title(entry.currentVersion.definition.status)}` : ''}${displayViews.columns.includes('version') ? ` · Version ${entry.currentVersion.version}` : ''}`}
                aria-current={entry.id === selectedId ? 'true' : undefined}
                onClick={() => protectNavigation(() => choose(entry.id))}
              >
                <div className="strategy-row-title">
                  <strong>{entry.currentVersion.definition.name}</strong>
                  {displayViews.columns.includes('status') && (
                    <Badge>
                      {entry.archivedAt
                        ? 'Archived'
                        : title(entry.currentVersion.definition.status)}
                    </Badge>
                  )}
                </div>
                {displayViews.columns.includes('description') && (
                  <p>{entry.currentVersion.definition.description || 'No description yet.'}</p>
                )}
                <small>
                  {displayViews.columns.includes('version') && (
                    <>Version {entry.currentVersion.version} </>
                  )}
                  {displayViews.columns.includes('assetClasses') &&
                    (entry.currentVersion.definition.assetClasses.join(', ') ||
                      'Asset classes not set')}
                </small>
              </button>
            ))}
          {list.data && list.data.pages.every((page) => page.strategies.length === 0) && (
            <Panel className="strategy-empty">
              <h2>
                {search || status || includeArchived
                  ? 'No matching strategies'
                  : 'Build your first playbook'}
              </h2>
              <p>
                {search || status || includeArchived
                  ? 'Try a different search or clear the filters.'
                  : 'Start with a name and your core rules. Save a draft, then add detail as your process develops.'}
              </p>
              {search || status || includeArchived ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setStatus('');
                    setIncludeArchived(false);
                  }}
                >
                  Clear strategy filters
                </Button>
              ) : (
                canEdit && (
                  <Button
                    onClick={() =>
                      protectNavigation(() => {
                        setDraftKey((previous) => previous + 1);
                        setEditing('new');
                        setEditorDirty(false);
                        setConflict(false);
                      })
                    }
                  >
                    Create your first strategy
                  </Button>
                )
              )}
            </Panel>
          )}
          {list.hasNextPage && (
            <Button
              variant="secondary"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? 'Loading…' : 'Load more strategies'}
            </Button>
          )}
        </section>
        <div>
          {editing !== null ? (
            <StrategyEditor
              key={editing === 'new' ? `new:${draftKey}` : `${editing.id}:${editing.revision}`}
              workspaceId={workspace.id}
              strategy={editing === 'new' ? null : editing}
              onSave={save}
              onDirtyChange={setEditorDirty}
              onCancel={() => {
                setEditorDirty(false);
                setEditing(null);
                setConflict(false);
              }}
              conflict={conflict}
              onReload={reloadEditor}
            />
          ) : selectedId === null ? (
            <Panel className="strategy-empty">
              <h2>Your rules, with a history</h2>
              <p>
                Select a strategy to read its rules, browse earlier versions or see linked trades.
              </p>
            </Panel>
          ) : detail.isPending ? (
            <Panel className="strategy-empty">
              <p role="status">Loading strategy…</p>
            </Panel>
          ) : detail.isError ? (
            <Panel className="strategy-empty">
              <p role="alert">{strategyErrorMessage(detail.error)}</p>
              <Button variant="secondary" onClick={() => void detail.refetch()}>
                Retry strategy
              </Button>
            </Panel>
          ) : strategy && selectedVersion ? (
            <Panel className="strategy-detail">
              <div className="strategy-detail-heading">
                <div>
                  <h2>{selectedVersion.definition.name}</h2>
                  <p className="muted">
                    Version {selectedVersion.version} · {title(selectedVersion.definition.status)}
                  </p>
                </div>
                <Badge>
                  {strategy.archivedAt
                    ? 'Archived'
                    : selectedVersion.id === strategy.currentVersionId
                      ? 'Current version'
                      : 'Historical version'}
                </Badge>
              </div>
              {strategy.archivedAt && (
                <p className="strategy-inline-notice">
                  Archived {formatJournalTimestamp(strategy.archivedAt, workspace.timezone)}.{' '}
                  {strategy.archiveReason} Existing versions and trade associations remain
                  available.
                </p>
              )}
              <p className="strategy-history-note">
                Effective {formatJournalTimestamp(selectedVersion.effectiveAt, workspace.timezone)}{' '}
                · Recorded {formatJournalTimestamp(selectedVersion.createdAt, workspace.timezone)}
                <br />
                Reason: {selectedVersion.changeReason}
              </p>
              {canEdit && !strategy.archivedAt && (
                <div className="strategy-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditing(strategy);
                      setConflict(false);
                      setActionError(null);
                    }}
                  >
                    Edit current version
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setArchiveForm(!archiveForm);
                      setArchiveReason('');
                    }}
                  >
                    Archive strategy
                  </Button>
                </div>
              )}
              {archiveForm && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setActionError(null);
                    if (archiveReason.trim())
                      setArchiveConfirmation({
                        strategyId: strategy.id,
                        name: strategy.currentVersion.definition.name,
                        expectedRevision: strategy.revision,
                        reason: archiveReason.trim(),
                        commandId: crypto.randomUUID(),
                      });
                  }}
                  className="strategy-repeater-row"
                >
                  <div className="strategy-field">
                    <label htmlFor="strategy-archive-reason">Reason for archiving</label>
                    <textarea
                      id="strategy-archive-reason"
                      value={archiveReason}
                      onChange={(event) => setArchiveReason(event.target.value)}
                      maxLength={2_000}
                      required
                    />
                  </div>
                  <p className="strategy-readonly-note">
                    Archiving preserves the strategy’s versions and trade references and removes it
                    from the default list.
                  </p>
                  <div className="strategy-actions">
                    <Button type="submit" disabled={busy || !archiveReason.trim()}>
                      Confirm archive
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setArchiveForm(false)}
                    >
                      Cancel archive
                    </Button>
                  </div>
                </form>
              )}
              <div className="strategy-history-control">
                <label htmlFor="strategy-version">View strategy version</label>
                <select
                  className="strategy-version-select"
                  id="strategy-version"
                  value={selectedVersion.id}
                  onChange={(event) => {
                    const nextVersionId = event.target.value;
                    setVersionId(nextVersionId);
                    setComparisonId('');
                    router.replace(
                      `/strategies?workspace=${encodeURIComponent(workspace.id)}&strategy=${encodeURIComponent(strategy.id)}&version=${encodeURIComponent(nextVersionId)}${initialTradeId ? `&trade=${encodeURIComponent(initialTradeId)}` : ''}`,
                      { scroll: false },
                    );
                  }}
                >
                  {history.length === 0 && (
                    <option value={strategy.currentVersionId}>
                      Version {strategy.currentVersion.version}
                    </option>
                  )}
                  {history.map((version) => (
                    <option key={version.id} value={version.id}>
                      Version {version.version} · {version.definition.name}
                      {version.id === strategy.currentVersionId ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
                {versions.hasNextPage && (
                  <Button
                    variant="secondary"
                    disabled={versions.isFetchingNextPage}
                    onClick={() => void versions.fetchNextPage()}
                  >
                    Load older versions
                  </Button>
                )}
                {versions.isError && (
                  <p role="alert" className="form-error">
                    Version history could not be loaded.
                  </p>
                )}
              </div>
              <div className="strategy-actions strategy-review-actions">
                <a
                  className="strategy-action-link"
                  href={`/dashboard?workspace=${encodeURIComponent(workspace.id)}&strategy=${encodeURIComponent(strategy.id)}&version=${encodeURIComponent(selectedVersion.id)}`}
                >
                  Review performance for version {selectedVersion.version}
                </a>
                <a
                  className="strategy-action-link"
                  href={`/dashboard?workspace=${encodeURIComponent(workspace.id)}&strategy=${encodeURIComponent(strategy.id)}`}
                >
                  Compare all versions
                </a>
              </div>
              <section className="strategy-section">
                <h3>Trades linked to version {selectedVersion.version}</h3>
                <p className="strategy-readonly-note">
                  Trade associations keep their original version. Retrospective assignments are
                  labeled separately.
                </p>
                {linked.isPending && <p role="status">Loading linked trades…</p>}
                {linked.isError && (
                  <p role="alert" className="form-error">
                    Linked trades could not be loaded.
                  </p>
                )}
                {linked.data && (
                  <ul className="strategy-trade-list">
                    {linked.data.pages
                      .flatMap((page) => page.trades)
                      .filter((trade) => trade.strategyVersionId === selectedVersion.id)
                      .map((trade) => (
                        <li key={trade.id}>
                          <a
                            href={`/journal?workspace=${encodeURIComponent(workspace.id)}&trade=${encodeURIComponent(trade.id)}`}
                          >
                            {trade.title}
                          </a>
                          <span className="muted">
                            {' '}
                            · {title(trade.status)} ·{' '}
                            {trade.strategyLinkTiming === 'retrospective'
                              ? 'Retrospective assignment'
                              : 'Recorded with trade'}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                {linked.data &&
                  !linked.data.pages.some((page) =>
                    page.trades.some((trade) => trade.strategyVersionId === selectedVersion.id),
                  ) && (
                    <p className="muted">No linked trades in the loaded pages for this version.</p>
                  )}
                {linked.hasNextPage && (
                  <Button
                    variant="secondary"
                    disabled={linked.isFetchingNextPage}
                    onClick={() => void linked.fetchNextPage()}
                  >
                    Load more linked trades
                  </Button>
                )}
                {canEdit && !strategy.archivedAt && (
                  <form
                    className="strategy-repeater-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setActionError(null);
                      prepareLink();
                    }}
                  >
                    <h4>
                      {initialTradeId
                        ? 'Assign this trade to a strategy version'
                        : 'Assign an existing unclassified trade retrospectively'}
                    </h4>
                    <p className="strategy-readonly-note">
                      This records a later classification using version {selectedVersion.version}.
                      It does not claim the rules were chosen before the trade. Once assigned, the
                      trade cannot be reassigned.
                    </p>
                    {unclassified.isPending && <p role="status">Loading unclassified trades…</p>}
                    {unclassified.isSuccess && availableTrades.length === 0 && (
                      <p className="strategy-inline-notice">
                        No unclassified trades match this page. Search or browse the remaining
                        records below.{' '}
                        <a href={`/journal?workspace=${encodeURIComponent(workspace.id)}`}>
                          Open the trade journal
                        </a>{' '}
                        to review an existing assignment, or{' '}
                        <a href={`/record?workspace=${encodeURIComponent(workspace.id)}`}>
                          record a manual trade
                        </a>
                        .
                      </p>
                    )}
                    {initialTradeId &&
                      unclassified.isSuccess &&
                      !availableTrades.some((trade) => trade.id === initialTradeId) && (
                        <p role="status">
                          The requested trade is already classified or unavailable to this
                          workspace.
                        </p>
                      )}
                    <div className="strategy-field">
                      <label htmlFor="strategy-link-trade">Unclassified trade</label>
                      <select
                        id="strategy-link-trade"
                        value={tradeId}
                        onChange={(event) => setTradeId(event.target.value)}
                      >
                        <option value="">Choose a trade</option>
                        {availableTrades.map((trade) => (
                          <option key={trade.id} value={trade.id}>
                            {trade.title} · {title(trade.status)}
                          </option>
                        ))}
                      </select>
                      <small>
                        Choices are unclassified trades. Search or page through all matching records
                        below.
                      </small>
                    </div>
                    {unclassified.data && (
                      <CatalogPager
                        label="unclassified trades"
                        endpoint={`/api/v1/workspaces/${workspace.id}/financial/trades?unclassified=true`}
                        items={unclassified.data}
                        load={arrayCatalogPage(tradeResponseSchema.array())}
                        onPage={(rows) =>
                          client.setQueryData<typeof unclassified.data>(
                            ['strategy-unclassified-trades', workspace.id],
                            (current) => pinCatalogPage(current ?? [], rows, [tradeId]),
                          )
                        }
                      />
                    )}
                    <div className="strategy-field">
                      <label htmlFor="strategy-link-reason">
                        Reason for retrospective assignment
                      </label>
                      <textarea
                        id="strategy-link-reason"
                        value={linkReason}
                        onChange={(event) => setLinkReason(event.target.value)}
                        maxLength={2_000}
                      />
                    </div>
                    <div className="strategy-actions">
                      <Button type="submit" disabled={busy || !tradeId || !linkReason.trim()}>
                        Assign to version {selectedVersion.version}
                      </Button>
                    </div>
                    {unclassified.isError && (
                      <p role="alert" className="form-error">
                        Unclassified trades could not be loaded.
                      </p>
                    )}
                  </form>
                )}
              </section>
              <RuleSnapshot version={selectedVersion} workspaceId={workspace.id} />
              <section className="strategy-section">
                <h3>Compare version rules</h3>
                <div className="strategy-field">
                  <label htmlFor="strategy-compare">Compare this version with</label>
                  <select
                    id="strategy-compare"
                    value={comparisonId}
                    onChange={(event) => setComparisonId(event.target.value)}
                  >
                    <option value="">Choose another version</option>
                    {history
                      .filter((version) => version.id !== selectedVersion.id)
                      .map((version) => (
                        <option key={version.id} value={version.id}>
                          Version {version.version} · {version.definition.name}
                        </option>
                      ))}
                  </select>
                </div>
                {comparisonVersion && (
                  <table className="strategy-comparison">
                    <caption>
                      Changed fields: version {selectedVersion.version} and version{' '}
                      {comparisonVersion.version}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Field</th>
                        <th scope="col">Version {selectedVersion.version}</th>
                        <th scope="col">Version {comparisonVersion.version}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(selectedVersion.definition) as Array<keyof StrategyDefinition>)
                        .filter(
                          (key) =>
                            JSON.stringify(selectedVersion.definition[key]) !==
                            JSON.stringify(comparisonVersion.definition[key]),
                        )
                        .map((key) => (
                          <tr key={key}>
                            <th scope="row">
                              {strategyNarrativeFields.find(([field]) => field === key)?.[1] ?? key}
                            </th>
                            <td className="strategy-rules">
                              {definitionText(selectedVersion.definition, key)}
                            </td>
                            <td className="strategy-rules">
                              {definitionText(comparisonVersion.definition, key)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </section>
            </Panel>
          ) : (
            <Panel className="strategy-empty">
              {pinnedVersion.isPending && versionId ? (
                <p role="status">Loading strategy version…</p>
              ) : (
                <p role="alert">This version is unavailable. Reload the strategy’s history.</p>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setVersionId(null);
                  void versions.refetch();
                }}
              >
                Show current version
              </Button>
            </Panel>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingNavigation !== null}
        title="Discard unsaved strategy changes?"
        description="Your unsaved rules and version details will be discarded. Saved historical versions remain unchanged."
        confirmLabel="Discard and continue"
        onCancel={() => {
          pendingSignOut.current = false;
          setPendingNavigation(null);
        }}
        onConfirm={() => {
          const navigate = pendingNavigation;
          const signingOut = pendingSignOut.current;
          pendingSignOut.current = false;
          setPendingNavigation(null);
          if (!signingOut) {
            navigationApproved.current = true;
            setEditorDirty(false);
          }
          navigate?.();
        }}
      />
      <ConfirmDialog
        open={archiveConfirmation !== null}
        title="Archive this strategy?"
        description={
          <>
            <p>
              Archive {archiveConfirmation?.name}? The strategy will leave the default list. Its
              versions and trade references remain available. Reason: {archiveReason}
            </p>
            {actionError && (
              <p role="alert" className="form-error">
                {actionError}
              </p>
            )}
          </>
        }
        confirmLabel="Archive strategy"
        busy={busy}
        onCancel={() => setArchiveConfirmation(null)}
        onConfirm={() => void archive()}
      />
      <ConfirmDialog
        open={linkConfirmation !== null}
        title="Confirm strategy assignment"
        description={
          <>
            <p>
              Assign {availableTrades.find((trade) => trade.id === tradeId)?.title ?? 'this trade'}{' '}
              to {selectedVersion?.definition.name}, version {selectedVersion?.version}? This is a
              retrospective assignment and cannot be changed later.
            </p>
            {actionError && (
              <p role="alert" className="form-error">
                {actionError}
              </p>
            )}
          </>
        }
        confirmLabel="Confirm assignment"
        busy={busy}
        onCancel={() => setLinkConfirmation(null)}
        onConfirm={() => void linkTrade()}
      />
    </>
  );
}
