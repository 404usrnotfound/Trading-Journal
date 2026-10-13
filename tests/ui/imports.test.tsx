import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as c from '@journal/contracts';
import { ImportWorkspace } from '../../apps/web/src/components/imports/import-workspace.js';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workspace: c.WorkspaceResponse = {
  id: uuid(1),
  name: 'Import workspace',
  role: 'owner',
  isDemo: false,
  timezone: 'UTC',
  reportingCurrency: 'USD',
  revision: 1,
};
const catalog: c.ImportCatalogResponse = {
  accounts: [{ id: uuid(2), name: 'Account alpha', namespace: 'broker-fixture' }],
  currencies: [{ id: uuid(3), name: 'Dollar', code: 'USD' }],
  instruments: [],
  adapters: [
    { id: 'generic-csv', version: '1', name: 'Universal CSV mapping' },
    { id: 'canonical-csv', version: '1', name: 'Canonical CSV interchange' },
  ],
};
let batch: c.ImportBatchResponse,
  requests: { path: string; body: unknown }[],
  invalid: boolean,
  stale: boolean,
  warnings: boolean;
const row = (): c.ImportRowResponse => ({
  id: uuid(5),
  rowNumber: 2,
  groupKey: 'cash_movement:D1',
  sourceKey: 'cash_movement:D1',
  sourceId: 'D1',
  kind: 'cash_movement',
  raw: { ID: 'D1', Amount: '100' },
  payload: { amount: '100', currencyId: uuid(3), kind: 'deposit' },
  errors: [],
  warnings: warnings ? ['Unmapped column retained in source: Notes'] : [],
  status: 'ready',
  result: null,
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  configure({ asyncUtilTimeout: 10000 });
  requests = [];
  invalid = false;
  stale = false;
  warnings = false;
  batch = {
    id: uuid(4),
    accountId: uuid(2),
    namespace: 'broker-fixture',
    filename: 'statement.csv',
    fileHash: 'a'.repeat(64),
    adapterId: 'generic-csv',
    adapterVersion: '1',
    revision: 1,
    state: 'staged',
    rowCount: 1,
    createdAt: '2030-01-01T00:00:00Z',
    preview: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/auth/session')
        return new Response('{}', { headers: { 'x-csrf-token': 'fixture-proof' } });
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body) requests.push({ path, body });
      if (path.endsWith('/catalog')) return json(catalog);
      if (path.endsWith('/templates')) return json({ items: [] });
      if (path.endsWith('/batches') && !body) return json({ items: [], nextCursor: null });
      if (path.endsWith('/batches') && body) return json(batch);
      if (path.includes('/preview')) {
        batch = { ...batch, revision: 2 };
        return json({
          id: uuid(6),
          batchRevision: 2,
          sourceRevision: '7',
          groups: ['cash_movement:D1'],
          corrections: {},
          committable: !invalid,
          rows: [
            {
              ...row(),
              status: invalid ? 'invalid' : 'new',
              errors: invalid ? [{ code: 'BAD_SIGN', message: 'Deposit must be positive.' }] : [],
            },
          ],
        });
      }
      if (path.includes('/commit')) {
        if (stale)
          return json(
            {
              type: 'about:blank',
              title: 'Stale import',
              status: 409,
              code: 'STALE_IMPORT_PREVIEW',
              detail: 'Financial activity changed after preview.',
              requestId: uuid(9),
            },
            409,
          );
        batch = { ...batch, state: 'committed', revision: 3 };
        return json(batch);
      }
      return json({
        batch,
        rows: [row()],
        nextCursor: null,
        groups: [{ key: 'cash_movement:D1', rows: 1, invalid: 0, committed: 0 }],
        history: [],
      });
    }),
  );
});
afterEach(() => configure({ asyncUtilTimeout: 1000 }));
function mount(role: c.WorkspaceResponse['role'] = 'owner') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ImportWorkspace workspace={{ ...workspace, role }} workspaces={[workspace]} />
    </QueryClientProvider>,
  );
}
async function stage() {
  await screen.findByText('Account alpha');
  fireEvent.change(screen.getByLabelText('Account', { exact: true }), {
    target: { value: uuid(2) },
  });
  fireEvent.change(screen.getByLabelText('Currency field 4'), { target: { value: uuid(3) } });
  const file = new File(['ID,Date,Amount\nD1,2030-01-01T00:00:00Z,100'], 'statement.csv', {
    type: 'text/csv',
  });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () =>
      new TextEncoder().encode('ID,Date,Amount\nD1,2030-01-01T00:00:00Z,100').buffer,
  });
  fireEvent.change(screen.getByLabelText('Broker CSV file'), { target: { files: [file] } });
  await screen.findByText(/Selected: statement.csv/);
  fireEvent.click(screen.getByRole('button', { name: 'Stage file for review' }));
  await screen.findByRole('heading', { name: '2. Review statement.csv' });
  await screen.findByText(/cash_movement:D1 · 1 rows/);
}
async function preview() {
  fireEvent.click(screen.getByRole('checkbox', { name: /cash_movement:D1/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Validate selected groups' }));
  await screen.findByRole('status');
}
describe('import review UI', () => {
  it('sends explicit account/unit mapping, validates complete groups and requires a separate commit action', async () => {
    mount();
    await stage();
    expect(requests.some((request) => request.path.endsWith('/commit'))).toBe(false);
    expect(requests[0]?.body).toMatchObject({
      accountId: uuid(2),
      namespace: 'broker-fixture',
      mapping: {
        adapterId: 'generic-csv',
        fields: expect.arrayContaining([
          expect.objectContaining({ target: 'currencyId', constant: uuid(3) }),
        ]),
      },
    });
    await preview();
    expect(requests.at(-1)?.body).toMatchObject({
      expectedRevision: 1,
      groups: ['cash_movement:D1'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Commit reviewed import' }));
    await waitFor(() =>
      expect(requests.some((request) => request.path.endsWith('/commit'))).toBe(true),
    );
    expect(requests.at(-1)?.body).toMatchObject({ expectedRevision: 2, previewId: uuid(6) });
  });
  it('shows row-level validation and disables financial commit for an invalid group', async () => {
    invalid = true;
    mount();
    await stage();
    await preview();
    expect(screen.getByText('Deposit must be positive.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Commit reviewed import' })).toBeDisabled();
    expect(requests.some((request) => request.path.endsWith('/commit'))).toBe(false);
  });
  it('invalidates the ready-to-commit display after financial state changes', async () => {
    stale = true;
    mount();
    await stage();
    await preview();
    fireEvent.click(screen.getByRole('button', { name: 'Commit reviewed import' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Financial activity changed after preview.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Commit reviewed import' }),
    ).not.toBeInTheDocument();
  });
  it('requires fresh warning acknowledgement after selecting and previewing again', async () => {
    warnings = true;
    mount();
    await stage();
    await preview();
    const acknowledgement = screen.getByRole('checkbox', { name: /reviewed retained/i });
    expect(screen.getByRole('button', { name: 'Commit reviewed import' })).toBeDisabled();
    fireEvent.click(acknowledgement);
    expect(acknowledgement).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /cash_movement:D1/ }));
    await preview();
    expect(screen.getByRole('checkbox', { name: /reviewed retained/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Commit reviewed import' })).toBeDisabled();
  });
  it('keeps viewer access read-only with no upload, preview or commit controls', async () => {
    mount('viewer');
    await screen.findByText(
      'You have viewer access. Source files and import history are read-only.',
    );
    expect(screen.queryByLabelText('Broker CSV file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stage file for review' })).not.toBeInTheDocument();
    expect(requests).toEqual([]);
  });
});
