'use client';
import { useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@journal/ui';
import { suppliedComponentListResponseSchema } from '@journal/contracts';
import { recordRead } from '../record/record-api';

/** Explicit reviewed alternatives remain opt-in for each report and appear in its URL. */
export function SuppliedValuePicker({
  workspaceId,
  kind,
  value,
  onChange,
}: {
  workspaceId: string;
  kind: 'position-equity' | 'campaign-net-result';
  value: string;
  onChange: (ids: string) => void;
}) {
  const identity = useId();
  const [expanded, setExpanded] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['supplied-values', workspaceId],
    enabled: expanded,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      recordRead(
        `/api/v1/workspaces/${workspaceId}/supplied-components/observations?limit=100${pageParam ? `&afterId=${encodeURIComponent(pageParam)}` : ''}`,
        suppliedComponentListResponseSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const all = query.data?.pages.flatMap((page) => page.items) ?? [],
    superseded = new Set(all.flatMap((row) => (row.supersedesId ? [row.supersedesId] : [])));
  const rows = all.filter((row) => row.kind === kind && !superseded.has(row.id)),
    selected = value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        Reviewed supplied {kind === 'position-equity' ? 'position values' : 'campaign results'}
      </summary>
      <p>
        Select a source explicitly for this report. Source quantities, financial revisions, currency
        and observation age are checked when the report runs.{' '}
        <a href={`/supplied-values?workspace=${workspaceId}`}>Record or review supplied evidence</a>
        .
      </p>
      {rows.map((row) => (
        <label
          key={row.id}
          htmlFor={`${identity}-${row.id}`}
          style={{ display: 'block', marginBlock: 8 }}
        >
          <input
            type="checkbox"
            id={`${identity}-${row.id}`}
            checked={selected.includes(row.id)}
            onChange={(event) =>
              onChange(
                (event.target.checked
                  ? [...selected, row.id]
                  : selected.filter((id) => id !== row.id)
                ).join(','),
              )
            }
          />{' '}
          {row.scopeLabel ?? row.source} · {row.amount} {row.currencyCode ?? row.currencyId} ·{' '}
          {row.observedAt} · {row.quality}
          <br />
          <small>{row.sourceReference}</small>
        </label>
      ))}
      {selected
        .filter((id) => !rows.some((row) => row.id === id))
        .map((id) => (
          <label key={id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked
              onChange={() => onChange(selected.filter((value) => value !== id).join(','))}
            />{' '}
            Selected source {id} (load more or clear)
          </label>
        ))}
      {query.isError ? (
        <p role="alert">
          Supplied sources could not load.{' '}
          <Button variant="quiet" onClick={() => void query.refetch()}>
            Retry supplied sources
          </Button>
        </p>
      ) : query.isLoading ? (
        <p>Loading supplied sources…</p>
      ) : !rows.length ? (
        <p>No supplied evidence in these pages.</p>
      ) : null}
      {query.hasNextPage && (
        <Button
          variant="quiet"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more supplied sources
        </Button>
      )}
    </details>
  );
}
