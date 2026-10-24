import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CatalogPager,
  arrayCatalogPage,
  pinCatalogPage,
} from '../../apps/web/src/components/record/catalog-page.js';

type Choice = { id: string; label: string };
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const first = Array.from({ length: 200 }, (_, index) => ({
  id: id(index),
  label: `Choice ${index}`,
}));
const late = { id: id(201), label: 'Choice 201' };
const schema = {
  parse(value: unknown) {
    return value as Choice[];
  },
};
afterEach(() => vi.unstubAllGlobals());
function Browser({ submit }: { submit: () => void }) {
  const [items, setItems] = useState(first);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <CatalogPager
        label="choices"
        endpoint="/references?limit=200"
        items={items}
        load={arrayCatalogPage(schema)}
        onPage={(rows) => setItems((current) => pinCatalogPage(current, rows, [first[0]!.id]))}
      />
      <select aria-label="Available choices">
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </form>
  );
}
describe('bounded reference browsing', () => {
  it('reaches record 201 with an explicit cursor and retains selections without accumulating pages', async () => {
    const fetch = vi.fn(async (_url: string) => Response.json([late]));
    vi.stubGlobal('fetch', fetch);
    render(<Browser submit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next choices' }));
    await screen.findByRole('option', { name: 'Choice 201' });
    const url = new URL(String(fetch.mock.calls[0]?.[0]), 'http://fixture.local');
    expect(url.searchParams.get('afterId')).toBe(id(199));
    expect(url.searchParams.get('limit')).toBe('200');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'Choice 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next choices' })).toBeDisabled();
  });
  it('searches on Enter without submitting an enclosing financial form or discarding a failed page', async () => {
    const submit = vi.fn();
    const fetch = vi.fn(async () => {
      throw new TypeError('Interrupted');
    });
    vi.stubGlobal('fetch', fetch);
    render(<Browser submit={submit} />);
    fireEvent.change(screen.getByLabelText('Search choices'), { target: { value: 'Choice 201' } });
    fireEvent.keyDown(screen.getByLabelText('Search choices'), { key: 'Enter' });
    await screen.findByRole('alert');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getAllByRole('option')).toHaveLength(200);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search choices' })).toBeEnabled(),
    );
  });
});
