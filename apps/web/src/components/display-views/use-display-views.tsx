'use client';
import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@journal/ui';
import {
  defaultDisplayViewSettings,
  displayViewColumns,
  displayViewResponseSchema,
  displayViewSettingsSchema,
  problemResponseSchema,
  type DisplayViewResponse,
  type DisplayViewScreen,
  type DisplayViewSettings,
} from '@journal/contracts';
import { sessionProof } from '../strategies/strategy-api';
import './display-views.css';
const labels: Record<string, string> = {
  title: 'Trade',
  name: 'Strategy',
  status: 'Status',
  netPnl: 'Net P&L',
  originalR: 'Original R',
  coverage: 'Coverage',
  classification: 'Classification',
  strategy: 'Pinned strategy',
  archived: 'Archived marker',
  description: 'Description',
  version: 'Version',
  assetClasses: 'Asset classes',
};
export function useDisplayViews({
  workspaceId,
  screen,
  filters,
  onApply,
}: {
  workspaceId: string;
  screen: DisplayViewScreen;
  filters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
}) {
  const id = useId(),
    client = useQueryClient(),
    url = `/api/v1/workspaces/${workspaceId}/display-views/${screen}`,
    key = ['display-views', workspaceId, screen];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Saved display preferences could not load.');
      return displayViewResponseSchema.parse(await response.json());
    },
    retry: false,
  });
  const [localColumns, setLocalColumns] = useState<string[] | null>(null),
    [name, setName] = useState(''),
    [selected, setSelected] = useState(''),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ expectedRevision: number; settings: DisplayViewSettings } | null>(null);
  const baseline = query.data?.settings ?? defaultDisplayViewSettings(screen),
    columns = localColumns ?? baseline.columns;
  async function save(settings?: DisplayViewSettings) {
    if (busy || !query.data) return;
    setBusy(true);
    setFailure(null);
    let transmitted = false;
    try {
      const body = pending.current ?? {
        expectedRevision: query.data.revision,
        settings: displayViewSettingsSchema.parse(settings),
      };
      pending.current = body;
      const csrf = await sessionProof();
      let response: Response;
      try {
        transmitted = true;
        response = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(body),
        });
      } catch {
        setUncertain(true);
        throw new Error(
          'The preference save outcome is unknown. Retry the retained save before editing.',
        );
      }
      if (!response.ok) {
        const problem = problemResponseSchema.safeParse(await response.json().catch(() => null));
        if (response.status >= 500 || response.status === 408) setUncertain(true);
        else pending.current = null;
        throw new Error(
          problem.success ? problem.data.detail : 'Display preferences could not save.',
        );
      }
      let value: DisplayViewResponse;
      try {
        value = displayViewResponseSchema.parse(await response.json());
      } catch {
        setUncertain(true);
        throw new Error(
          'The preference response was incomplete. Retry the retained save before editing.',
        );
      }
      client.setQueryData(key, value);
      pending.current = null;
      setUncertain(false);
      setLocalColumns(null);
      setMessage('Saved your display preferences.');
    } catch (error) {
      if (!transmitted && !uncertain) pending.current = null;
      setFailure(error instanceof Error ? error.message : 'Display preferences could not save.');
    } finally {
      setBusy(false);
    }
  }
  function validated(value: unknown) {
    try {
      return displayViewSettingsSchema.parse(value);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Check this saved view.');
      return null;
    }
  }
  const locked = busy || uncertain || !query.data;
  const controls = (
    <details className="saved-display-views">
      <summary>Saved views and visible columns</summary>
      <p>
        Private to your membership in this workspace. Applying a saved view restores its explicit
        filters; column preferences persist separately.
      </p>
      {query.isError && <p role="alert">Saved display preferences could not load.</p>}
      <fieldset disabled={locked}>
        <legend>Visible {screen === 'dashboard' ? 'table columns' : 'list fields'}</legend>
        {displayViewColumns[screen].map((column) => (
          <label key={column}>
            <input
              type="checkbox"
              checked={columns.includes(column)}
              disabled={column === 'title' || column === 'name'}
              onChange={(event) =>
                setLocalColumns(
                  event.target.checked
                    ? [...columns, column]
                    : columns.filter((item) => item !== column),
                )
              }
            />
            {labels[column]}
          </label>
        ))}
        <Button
          variant="secondary"
          onClick={() => {
            const settings = validated({ ...baseline, columns });
            if (settings) void save(settings);
          }}
        >
          Save column preferences
        </Button>
      </fieldset>
      <fieldset disabled={locked}>
        <legend>Named filter views</legend>
        <label htmlFor={`${id}-view`}>Your saved {screen} view</label>
        <select
          id={`${id}-view`}
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setName(baseline.views.find((view) => view.id === event.target.value)?.name ?? '');
          }}
        >
          <option value="">Choose a saved view</option>
          {baseline.views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          disabled={!selected}
          onClick={() => {
            const view = baseline.views.find((view) => view.id === selected);
            if (view) {
              onApply(
                Object.fromEntries(
                  Object.entries(view.filters).filter(
                    (entry): entry is [string, string] => typeof entry[1] === 'string',
                  ),
                ),
              );
              setMessage(`Applied saved view: ${view.name}.`);
            }
          }}
        >
          Apply saved view
        </Button>
        <label htmlFor={`${id}-name`}>Saved view name</label>
        <input
          id={`${id}-name`}
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!name.trim()}
          onClick={() => {
            const existing = baseline.views.find(
              (view) =>
                view.name.toLocaleLowerCase('en-US') === name.trim().toLocaleLowerCase('en-US'),
            );
            const settings = validated({
              ...baseline,
              columns,
              views: [
                ...baseline.views.filter((view) => view.id !== existing?.id),
                { id: existing?.id ?? crypto.randomUUID(), name, filters },
              ],
            });
            if (settings) void save(settings);
          }}
        >
          Save current filters as view
        </Button>
        <Button
          variant="quiet"
          disabled={!selected}
          onClick={() => {
            const settings = validated({
              ...baseline,
              columns,
              views: baseline.views.filter((view) => view.id !== selected),
            });
            if (settings) {
              setSelected('');
              setName('');
              void save(settings);
            }
          }}
        >
          Delete selected saved view
        </Button>
      </fieldset>
      {uncertain ? (
        <Button disabled={busy} onClick={() => void save()}>
          Retry retained preference save
        </Button>
      ) : (
        <Button
          variant="quiet"
          disabled={busy}
          onClick={() => {
            setLocalColumns(null);
            setFailure(null);
            void query.refetch();
          }}
        >
          Reload saved preferences
        </Button>
      )}
      {failure && <p role="alert">{failure}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
  return { columns, controls };
}
