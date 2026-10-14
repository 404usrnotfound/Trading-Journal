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
  warnings: boolean,
  correction: boolean,
  groupRows: number,
  historyItems: c.ImportBatchResponse[],
  savedTemplates: c.ImportTemplateResponse[];
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
  correction = false;
  groupRows = 1;
  historyItems = [];
  savedTemplates = [];
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
      if (path.endsWith('/templates')) return json({ items: savedTemplates });
      if (path.endsWith('/batches') && !body)
        return json({ items: historyItems, nextCursor: null });
      if (path.endsWith('/batches') && body) return json(batch);
      if (path.includes('/preview')) {
        batch = { ...batch, revision: 2 };
        const correctionReasons = c.importPreviewRequestSchema.parse(body).corrections;
        const needsCorrection = correction && !correctionReasons[uuid(5)]?.trim();
        return json({
          id: uuid(6),
          batchRevision: 2,
          sourceRevision: '7',
          groups: ['cash_movement:D1'],
          corrections: correctionReasons,
          committable: !invalid && !needsCorrection,
          rows: [
            {
              ...row(),
              status: invalid ? 'invalid' : needsCorrection ? 'correction' : 'new',
              errors: invalid
                ? [{ code: 'BAD_SIGN', message: 'Deposit must be positive.' }]
                : needsCorrection
                  ? [
                      {
                        code: 'IMPORT_CORRECTION_REQUIRED',
                        message:
                          'This broker source ID has changed. Review an explicit correction; do not append it.',
                      },
                    ]
                  : [],
            },
          ],
        });
      }
      if (path.endsWith('/reverse')) {
        batch = { ...batch, state: 'reversed', revision: batch.revision + 1 };
        return json(batch);
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
        groups: [{ key: 'cash_movement:D1', rows: groupRows, invalid: 0, committed: 0 }],
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
  await screen.findByText(/cash_movement:D1 · \d+ rows/);
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
    await screen.findByRole('dialog', { name: 'Post this reviewed import?' });
    expect(requests.some((request) => request.path.endsWith('/commit'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm posting' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm posting' }));
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
  it('lets the user cancel financial posting without sending a commit', async () => {
    mount();
    await stage();
    await preview();
    fireEvent.click(screen.getByRole('button', { name: 'Commit reviewed import' }));
    const dialog = await screen.findByRole('dialog', { name: 'Post this reviewed import?' });
    expect(dialog).toHaveTextContent('statement.csv');
    expect(dialog).toHaveTextContent('Account alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.some((request) => request.path.endsWith('/commit'))).toBe(false);
  });
  it('explains changed source IDs and requires revalidation after editing a correction reason', async () => {
    correction = true;
    mount();
    await stage();
    await preview();
    expect(screen.getByText(/This broker source ID has changed/)).toBeVisible();
    const input = screen.getByLabelText('Correction reason row 2');
    fireEvent.change(input, { target: { value: 'Correct broker statement amount' } });
    expect(screen.getByRole('status')).toHaveTextContent('Correction reasons changed.');
    expect(screen.getByRole('button', { name: 'Commit reviewed import' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Validate selected groups' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Commit reviewed import' })).toBeEnabled(),
    );
    expect(requests.at(-1)?.body).toMatchObject({
      corrections: { [uuid(5)]: 'Correct broker statement amount' },
    });
    expect(screen.getByLabelText('Correction reason row 2')).toHaveValue(
      'Correct broker statement amount',
    );
    fireEvent.change(screen.getByLabelText('Correction reason row 2'), {
      target: { value: 'Revised review reason' },
    });
    expect(screen.getByRole('button', { name: 'Commit reviewed import' })).toBeDisabled();
    expect(requests.some((request) => request.path.endsWith('/commit'))).toBe(false);
  });
  it('selects complete groups in one action and explains the existing 100-row review limit', async () => {
    groupRows = 101;
    mount();
    await stage();
    fireEvent.click(screen.getByRole('button', { name: 'Select all groups' }));
    expect(screen.getByRole('checkbox', { name: /cash_movement:D1/ })).toBeChecked();
    expect(screen.getByText(/Choose fewer groups/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Validate selected groups' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByRole('checkbox', { name: /cash_movement:D1/ })).not.toBeChecked();
    expect(requests.some((request) => request.path.includes('/preview'))).toBe(false);
  });
  it('preserves the selected mapping when choosing another source file', async () => {
    const saved: c.ImportTemplateResponse = {
      id: uuid(10),
      templateId: uuid(11),
      name: 'Reviewed mapping',
      version: 1,
      archived: false,
      mapping: c.importMappingSchema.parse({
        kind: 'cash_movement',
        sourceIdColumn: 'ID',
        fields: [
          { target: 'economicAt', column: 'Date', transform: 'instant', empty: 'omit' },
          { target: 'amount', column: 'Amount', transform: 'decimal', empty: 'omit' },
          { target: 'currencyId', constant: uuid(3), transform: 'text', empty: 'omit' },
        ],
      }),
    };
    savedTemplates = [saved];
    mount();
    await screen.findByText('Reviewed mapping · v1');
    fireEvent.change(screen.getByLabelText('Saved mapping'), { target: { value: saved.id } });
    fireEvent.change(screen.getByLabelText('Account', { exact: true }), {
      target: { value: uuid(2) },
    });
    const source = new File(['ID,Date,Amount'], 'new-statement.csv', { type: 'text/csv' });
    Object.defineProperty(source, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('ID,Date,Amount').buffer,
    });
    fireEvent.change(screen.getByLabelText('Broker CSV file'), { target: { files: [source] } });
    await screen.findByText(/Selected: new-statement.csv/);
    fireEvent.click(screen.getByRole('button', { name: 'Stage file for review' }));
    await screen.findByRole('heading', { name: '2. Review statement.csv' });
    expect(requests[0]?.body).toMatchObject({ templateVersionId: saved.id });
    expect(requests[0]?.body).not.toHaveProperty('mapping');
  });
  it('shows the reversal reason and requires confirmation before appending monetary reversals', async () => {
    batch = { ...batch, state: 'committed' };
    historyItems = [batch];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Review batch' }));
    await screen.findByRole('heading', { name: '2. Review statement.csv' });
    fireEvent.click(screen.getByText('Reverse eligible cash-only batch', { exact: true }));
    fireEvent.change(screen.getByLabelText('Reversal reason'), {
      target: { value: 'Wrong account statement' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review and reverse cash batch' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reverse this cash batch?' });
    expect(dialog).toHaveTextContent('Wrong account statement');
    expect(requests.some((request) => request.path.endsWith('/reverse'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reversal' }));
    await waitFor(() => expect(requests.at(-1)?.path).toContain('/reverse'));
    expect(requests.at(-1)?.body).toMatchObject({
      reason: 'Wrong account statement',
      expectedRevision: 1,
    });
  });
});
