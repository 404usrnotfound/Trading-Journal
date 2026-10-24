'use client';

import { useId, useState } from 'react';
import { Button } from '@journal/ui';
import { recordRead } from './record-api';
import './catalog-page.css';

type Entity = { id: string };
export type CatalogPage<Value> = { items: Value[]; nextCursor: string | null };
/** Array endpoints retain their original response shape; a full page permits a bounded next read. */
export function arrayCatalogPage<Value extends Entity>(schema: { parse(value: unknown): Value[] }) {
  return async (url: string): Promise<CatalogPage<Value>> => {
    const items = await recordRead(url, schema);
    const limit = Number(new URL(url, 'http://internal.local').searchParams.get('limit') ?? 100);
    return { items, nextCursor: items.length === limit ? items.at(-1)!.id : null };
  };
}
export function objectCatalogPage<Value>(
  schema: { parse(value: unknown): { nextCursor: string | null; [key: string]: unknown } },
  field: string,
) {
  return async (url: string): Promise<CatalogPage<Value>> => {
    const page = await recordRead(url, schema);
    return { items: page[field] as Value[], nextCursor: page.nextCursor };
  };
}
/** Keep only the current page and explicit selections, rather than accumulating every page. */
export function pinCatalogPage<Value extends Entity>(
  current: readonly Value[],
  page: readonly Value[],
  selected: readonly string[],
  key: (item: Value) => string = (item) => item.id,
): Value[] {
  const result = new Map(page.map((item) => [key(item), item]));
  for (const item of current) if (selected.includes(key(item))) result.set(key(item), item);
  return [...result.values()];
}

export function CatalogPager<Value extends Entity>({
  label,
  endpoint,
  items,
  load,
  onPage,
  pageSize = 200,
  cursorName = 'afterId',
  search = true,
  disabled = false,
}: {
  label: string;
  endpoint: string;
  items: readonly Value[];
  load: (url: string) => Promise<CatalogPage<Value>>;
  onPage: (items: Value[]) => void;
  pageSize?: number;
  cursorName?: string;
  search?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [term, setTerm] = useState('');
  const [appliedTerm, setAppliedTerm] = useState('');
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function page(targets: Array<string | null>, query: string) {
    if (busy || disabled) return;
    setBusy(true);
    setFailure('');
    try {
      const url = new URL(endpoint, 'http://internal.local');
      url.searchParams.set('limit', String(pageSize));
      const cursor = targets.at(-1);
      if (cursor) url.searchParams.set(cursorName, cursor);
      else url.searchParams.delete(cursorName);
      if (query.trim()) url.searchParams.set('search', query.trim());
      else url.searchParams.delete('search');
      const result = await load(`${url.pathname}${url.search}`);
      onPage(result.items);
      setCursors(targets);
      setAppliedTerm(query);
      setNext(result.nextCursor);
    } catch {
      setFailure(`Unable to load ${label}. Your selected records were kept; retry this page.`);
    } finally {
      setBusy(false);
    }
  }
  const nextCursor =
    next === undefined ? (items.length >= pageSize ? items.at(-1)?.id : null) : next;
  return (
    <div className="catalog-pager" role="group" aria-label={`Browse ${label}`}>
      {search && (
        <>
          <label htmlFor={id}>Search {label}</label>
          <input
            id={id}
            value={term}
            maxLength={160}
            disabled={busy || disabled}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void page([null], term);
              }
            }}
          />
          <Button
            variant="secondary"
            disabled={busy || disabled}
            onClick={() => void page([null], term)}
          >
            Search {label}
          </Button>
        </>
      )}
      <Button
        variant="quiet"
        disabled={busy || disabled || cursors.length === 1}
        onClick={() => void page(cursors.slice(0, -1), appliedTerm)}
      >
        Previous {label}
      </Button>
      <Button
        variant="quiet"
        disabled={busy || disabled || !nextCursor}
        onClick={() => nextCursor && void page([...cursors, nextCursor], appliedTerm)}
      >
        Next {label}
      </Button>
      {busy && <small role="status">Loading {label}…</small>}
      {failure && <small role="alert">{failure}</small>}
    </div>
  );
}
