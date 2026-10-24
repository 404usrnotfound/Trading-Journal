import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultDisplayViewSettings,
  type DisplayViewResponse,
  type DisplayViewScreen,
} from '../../packages/contracts/src/display-views.js';
import { useDisplayViews } from '../../apps/web/src/components/display-views/use-display-views.js';
vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'display-csrf-fixture',
}));
const workspace = '00000000-0000-4000-8000-000000000001';
const filters: Record<DisplayViewScreen, Record<string, string>> = {
  journal: {
    search: 'open plans',
    status: 'open',
    includeArchived: 'false',
    period: 'week',
    from: '',
    to: '',
    accountId: '',
  },
  strategies: { search: 'reviewed', status: 'active', includeArchived: 'true' },
  dashboard: {
    from: '2026-10-01',
    to: '2026-10-24',
    currency: '',
    environment: 'paper',
    age: '86400000',
    portfolioVersionId: '',
    accountIds: '',
    brokerIds: '',
    strategyIds: '',
    strategyVersionIds: '',
    assetIds: '',
    assetClasses: '',
    tags: '',
    search: 'closed',
    view: 'distributions',
    curve: 'performance',
  },
};
let stored: Map<string, DisplayViewResponse>,
  writes: { body: unknown; csrf: string | null }[],
  lost: boolean,
  conflict: boolean;
function Harness({ kind }: { kind: DisplayViewScreen }) {
  const [current, setCurrent] = useState(filters[kind]);
  const display = useDisplayViews({
    workspaceId: workspace,
    screen: kind,
    filters: current,
    onApply: setCurrent,
  });
  return (
    <>
      <p data-testid="columns">{display.columns.join(',')}</p>
      <p data-testid="filters">{JSON.stringify(current)}</p>
      <button onClick={() => setCurrent({ ...current, search: 'different' })}>
        Change local filters
      </button>
      {display.controls}
    </>
  );
}
function start(kind: DisplayViewScreen) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness kind={kind} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  stored = new Map();
  writes = [];
  lost = false;
  conflict = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input),
        kind = url.split('/').at(-1) as DisplayViewScreen,
        current = stored.get(url) ?? { revision: 0, settings: defaultDisplayViewSettings(kind) };
      if (!init?.method) return Response.json(current);
      const body = JSON.parse(String(init.body));
      writes.push({ body, csrf: new Headers(init.headers).get('x-csrf-token') });
      if (conflict)
        return Response.json(
          {
            type: 'about:blank',
            requestId: 'display-test-request',
            status: 409,
            code: 'REVISION_CONFLICT',
            title: 'Preferences changed',
            detail: 'Your display preferences changed elsewhere. Reload before saving again.',
          },
          { status: 409 },
        );
      if (current.revision === body.expectedRevision)
        stored.set(url, { revision: current.revision + 1, settings: body.settings });
      if (lost) {
        lost = false;
        throw new Error('Committed response lost');
      }
      return Response.json(stored.get(url));
    }),
  );
});
describe('reusable persistent saved views and visible fields', () => {
  for (const kind of ['dashboard', 'journal', 'strategies'] as const)
    it(`saves/restores ${kind} filter views and visible fields across a fresh client`, async () => {
      const first = start(kind);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save column preferences' })).toBeEnabled(),
      );
      fireEvent.click(screen.getByLabelText('Status'));
      fireEvent.change(screen.getByLabelText('Saved view name'), {
        target: { value: 'Weekly review' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save current filters as view' }));
      await screen.findByText('Saved your display preferences.');
      expect(writes[0]!.csrf).toBe('display-csrf-fixture');
      expect(screen.getByTestId('columns').textContent).not.toContain('status');
      first.unmount();
      start(kind);
      await screen.findByRole('option', { name: 'Weekly review' });
      expect(screen.getByTestId('columns').textContent).not.toContain('status');
      fireEvent.click(screen.getByRole('button', { name: 'Change local filters' }));
      expect(screen.getByTestId('filters')).toHaveTextContent('different');
      fireEvent.change(screen.getByLabelText(`Your saved ${kind} view`), {
        target: { value: [...stored.values()][0]!.settings.views[0]!.id },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply saved view' }));
      expect(JSON.parse(screen.getByTestId('filters').textContent!)).toEqual(filters[kind]);
      fireEvent.click(screen.getByRole('button', { name: 'Delete selected saved view' }));
      await waitFor(() => expect([...stored.values()][0]!.settings.views).toHaveLength(0));
    });
  it('freezes an uncertain write and retries the exact retained preference body without another mutation', async () => {
    start('journal');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save column preferences' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByLabelText('Status'));
    lost = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save column preferences' }));
    await screen.findByText(/preference save outcome is unknown/);
    expect(screen.getByLabelText('Status')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry retained preference save' }));
    await screen.findByText('Saved your display preferences.');
    expect(writes).toHaveLength(2);
    expect(writes[1]!.body).toEqual(writes[0]!.body);
    expect([...stored.values()][0]!.revision).toBe(1);
  });
  it('preserves local column selections on a conflict until an explicit saved-preference reload', async () => {
    start('strategies');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save column preferences' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByLabelText('Status'));
    conflict = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save column preferences' }));
    await screen.findByText(/display preferences changed elsewhere/);
    expect(screen.getByLabelText('Status')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved preferences' }));
    await waitFor(() => expect(screen.getByLabelText('Status')).toBeChecked());
  });
});
