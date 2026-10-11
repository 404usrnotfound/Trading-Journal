'use client';

import {
  strategyListResponseSchema,
  strategyResponseSchema,
  strategyTradesResponseSchema,
  strategyTradeLinkCreateSchema,
  strategyVersionListResponseSchema,
  tradeResponseSchema,
  type StrategyDefinition,
  type StrategyResponse,
  type StrategyVersionResponse,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Badge, Button, Panel } from '@journal/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StrategyAttachments } from './strategy-attachments';
import {
  StrategyApiError,
  strategyErrorMessage,
  strategyRead,
  strategyWrite,
} from './strategy-api';
import { StrategyEditor, strategyNarrativeFields } from './strategy-editor';

function formatDate(instant: string): string {
  return new Date(instant).toLocaleString();
}
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
      {strategyNarrativeFields.map(([key, label]) => (
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
}: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
  initialStrategyId: string | null;
}) {
  const prefix = `/api/v1/workspaces/${workspace.id}/strategies`;
  const client = useQueryClient();
  const router = useRouter();
  const canEdit = workspace.role !== 'viewer';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState(initialStrategyId);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StrategyResponse | 'new' | null>(null);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveForm, setArchiveForm] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [tradeId, setTradeId] = useState('');
  const [linkReason, setLinkReason] = useState('');
  const [comparisonId, setComparisonId] = useState('');

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
        `/api/v1/workspaces/${workspace.id}/financial/trades?limit=200`,
        tradeResponseSchema.array(),
      ),
  });
  const strategy = detail.data;
  const history = versions.data?.pages.flatMap((page) => page.versions) ?? [];
  const selectedVersion = versionId
    ? history.find((version) => version.id === versionId)
    : strategy?.currentVersion;
  const comparisonVersion = history.find((version) => version.id === comparisonId);
  const availableTrades =
    unclassified.data?.filter(
      (trade) => trade.strategyVersionId === null && trade.archivedAt === null,
    ) ?? [];

  function choose(id: string) {
    setSelectedId(id);
    setVersionId(null);
    setEditing(null);
    setMessage(null);
    setActionError(null);
    setArchiveForm(false);
    setComparisonId('');
    setTradeId('');
    router.replace(
      `/strategies?workspace=${encodeURIComponent(workspace.id)}&strategy=${encodeURIComponent(id)}`,
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
      setConflict(false);
      client.setQueryData(['strategy', workspace.id, updated.id], updated);
      router.replace(
        `/strategies?workspace=${encodeURIComponent(workspace.id)}&strategy=${encodeURIComponent(updated.id)}`,
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
    if (!strategy || busy || !archiveReason.trim()) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await strategyWrite(
        `${prefix}/${strategy.id}`,
        'DELETE',
        { expectedRevision: strategy.revision, reason: archiveReason.trim() },
        strategyResponseSchema,
        crypto.randomUUID(),
      );
      await refreshViews();
      setArchiveForm(false);
      setMessage('Strategy archived. Its versions and linked trades have been preserved.');
    } catch (error) {
      setActionError(strategyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function linkTrade() {
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
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await strategyWrite(
        `${prefix}/${strategy.id}/trade-links`,
        'POST',
        parsed.data,
        tradeResponseSchema,
        crypto.randomUUID(),
      );
      await refreshViews();
      setTradeId('');
      setLinkReason('');
      setMessage(
        `Trade assigned retrospectively to version ${selectedVersion.version}. This association cannot be reassigned.`,
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
            onClick={() => {
              setEditing('new');
              setConflict(false);
              setMessage(null);
              setActionError(null);
            }}
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
              client.clear();
              router.replace(`/strategies?workspace=${encodeURIComponent(event.target.value)}`);
              router.refresh();
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
      {actionError && (
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
                aria-current={entry.id === selectedId ? 'true' : undefined}
                onClick={() => choose(entry.id)}
              >
                <div className="strategy-row-title">
                  <strong>{entry.currentVersion.definition.name}</strong>
                  <Badge>
                    {entry.archivedAt ? 'Archived' : title(entry.currentVersion.definition.status)}
                  </Badge>
                </div>
                <p>{entry.currentVersion.definition.description || 'No description yet.'}</p>
                <small>
                  Version {entry.currentVersion.version} ·{' '}
                  {entry.currentVersion.definition.assetClasses.join(', ') ||
                    'Asset classes not set'}
                </small>
              </button>
            ))}
          {list.data && list.data.pages.every((page) => page.strategies.length === 0) && (
            <Panel className="strategy-empty">
              <h2>No matching strategies</h2>
              <p>Create a strategy or adjust your search and filters.</p>
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
              key={editing === 'new' ? 'new' : `${editing.id}:${editing.revision}`}
              workspaceId={workspace.id}
              strategy={editing === 'new' ? null : editing}
              onSave={save}
              onCancel={() => {
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
                  Archived {formatDate(strategy.archivedAt)}. {strategy.archiveReason} Existing
                  versions and trade associations remain available.
                </p>
              )}
              <p className="strategy-history-note">
                Effective {formatDate(selectedVersion.effectiveAt)} · Recorded{' '}
                {formatDate(selectedVersion.createdAt)}
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
                    void archive();
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
                    setVersionId(event.target.value);
                    setComparisonId('');
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
                          <strong>{trade.title}</strong>
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
                      void linkTrade();
                    }}
                  >
                    <h4>Assign an existing unclassified trade retrospectively</h4>
                    <p className="strategy-readonly-note">
                      This records a later classification using version {selectedVersion.version}.
                      It does not claim the rules were chosen before the trade. Once assigned, the
                      trade cannot be reassigned.
                    </p>
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
                        Showing up to 200 recent workspace trades with no strategy assignment.
                      </small>
                    </div>
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
            </Panel>
          ) : (
            <Panel className="strategy-empty">
              <p role="alert">This version is unavailable. Reload the strategy’s history.</p>
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
    </>
  );
}
