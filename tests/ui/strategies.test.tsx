import {
  strategyDefinitionSchema,
  type StrategyResponse,
  type StrategyVersionResponse,
  type WorkspaceResponse,
} from '@journal/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyEditor } from '../../apps/web/src/components/strategies/strategy-editor.js';
import { StrategyWorkspace } from '../../apps/web/src/components/strategies/strategy-workspace.js';

const { session, replace, refresh } = vi.hoisted(() => ({
  session: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../../apps/web/src/lib/api-client.js', () => ({ apiClient: { GET: session } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const workspace: WorkspaceResponse = {
  id: 'bf209d8c-3c1e-4be1-aa20-c9a59e5dc3f5',
  name: 'Private playbook',
  role: 'owner',
  isDemo: false,
  timezone: 'UTC',
  reportingCurrency: null,
  revision: 1,
};
const strategyId = '6ca0e3a1-7878-4c7a-a946-621b8a7b8326';
const v1: StrategyVersionResponse = {
  id: '9a28ca43-fcf7-4038-922c-7a1293542f31',
  workspaceId: workspace.id,
  strategyId,
  version: 1,
  effectiveAt: '2025-01-01T00:00:00.000Z',
  definition: strategyDefinitionSchema.parse({
    name: 'RSI pullback',
    status: 'active',
    entryRules: 'RSI below 30',
    description: 'Original rules',
  }),
  definitionHash: '1'.repeat(64),
  changeReason: 'Initial version',
  actorId: 'owner',
  createdAt: '2025-01-01T00:00:00.000Z',
};
const strategy: StrategyResponse = {
  id: strategyId,
  workspaceId: workspace.id,
  revision: 1,
  currentVersionId: v1.id,
  currentVersion: v1,
  archivedAt: null,
  archiveReason: null,
  createdAt: v1.createdAt,
  updatedAt: v1.createdAt,
};
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function withQueries(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
function editor(strategyValue: StrategyResponse | null = null, conflict = false) {
  const save = vi.fn().mockResolvedValue(undefined);
  const cancel = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  withQueries(
    <StrategyEditor
      workspaceId={workspace.id}
      strategy={strategyValue}
      onSave={save}
      onCancel={cancel}
      conflict={conflict}
      onReload={reload}
    />,
  );
  return { save, cancel, reload };
}
function submitEditor(name = 'New rule set') {
  fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: name } });
  fireEvent.submit(screen.getByRole('button', { name: 'Create strategy' }).closest('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    response: new Response(null, { status: 200, headers: { 'x-csrf-token': 'test-proof' } }),
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
});

describe('strategy editor', () => {
  it('rejects an empty name without calling persistence', async () => {
    const { save } = editor();
    submitEditor('   ');
    expect(await screen.findByRole('alert')).toHaveTextContent('name');
    expect(save).not.toHaveBeenCalled();
  });

  it('stores all rule families and precise decimal parameters in a complete snapshot', async () => {
    const { save } = editor();
    fireEvent.change(screen.getByLabelText('Asset classes'), { target: { value: 'stock, ETF' } });
    fireEvent.change(screen.getByLabelText('Markets'), { target: { value: 'NYSE, NASDAQ' } });
    fireEvent.change(screen.getByLabelText('Timeframes'), { target: { value: '1h, 1d' } });
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'long' } });
    fireEvent.change(screen.getByLabelText('Entry rules'), {
      target: { value: 'RSI below threshold' },
    });
    fireEvent.change(screen.getByLabelText('Confirmation rules'), {
      target: { value: 'Volume above average' },
    });
    fireEvent.change(screen.getByLabelText('Stop-loss methodology'), {
      target: { value: 'Below swing low' },
    });
    fireEvent.change(screen.getByLabelText('Risk rules'), {
      target: { value: 'One percent of risk capital' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: '<script>alert("test")</script>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
    fireEvent.change(screen.getByLabelText('Parameter 1 name'), {
      target: { value: 'Risk fraction' },
    });
    fireEvent.change(screen.getByLabelText('Parameter 1 value'), {
      target: { value: '0.123456789012345678901234567890123456' },
    });
    submitEditor();
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      definition: {
        name: 'New rule set',
        assetClasses: ['stock', 'ETF'],
        markets: ['NYSE', 'NASDAQ'],
        timeframes: ['1h', '1d'],
        direction: 'long',
        entryRules: 'RSI below threshold',
        confirmationRules: 'Volume above average',
        stopLossMethodology: 'Below swing low',
        riskRules: 'One percent of risk capital',
        notes: '<script>alert("test")</script>',
        parameters: [
          {
            type: 'decimal',
            name: 'Risk fraction',
            value: '0.123456789012345678901234567890123456',
          },
        ],
      },
      changeReason: 'Initial version',
    });
  });

  it('retains stable checklist/setup identities and removes dangling references', async () => {
    const { save } = editor();
    fireEvent.click(screen.getByRole('button', { name: 'Add checklist item' }));
    fireEvent.change(screen.getByLabelText('Checklist item 1'), {
      target: { value: 'Volume confirmed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add named setup' }));
    fireEvent.change(screen.getByLabelText('Setup 1 name'), {
      target: { value: 'Opening pullback' },
    });
    fireEvent.click(screen.getByLabelText('Setup 1: Volume confirmed'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove checklist item 1' }));
    submitEditor();
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      definition: { checklist: [], setups: [{ name: 'Opening pullback', checklistItemIds: [] }] },
    });
  });

  it('rejects duplicate tags and decimal values outside declared bounds', async () => {
    const { save } = editor();
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'momentum, momentum' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
    fireEvent.change(screen.getByLabelText('Parameter 1 name'), {
      target: { value: 'RSI threshold' },
    });
    fireEvent.change(screen.getByLabelText('Parameter 1 value'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Parameter 1 minimum'), { target: { value: '40' } });
    submitEditor();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Entries must be unique.');
    expect(alert).toHaveTextContent('Value is below minimum.');
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the source revision and original version intact when saving an edit', async () => {
    const { save } = editor(strategy);
    fireEvent.change(screen.getByLabelText('Entry rules'), { target: { value: 'RSI below 25' } });
    fireEvent.change(screen.getByLabelText('Reason for this version'), {
      target: { value: 'Refine RSI threshold' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Save new version' }).closest('form')!);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 1,
      definition: { entryRules: 'RSI below 25' },
    });
    expect(v1.definition.entryRules).toBe('RSI below 30');
  });

  it('preserves conflicting draft input and blocks saving until explicitly reloaded', async () => {
    const { save, reload } = editor(strategy, true);
    fireEvent.change(screen.getByLabelText('Entry rules'), {
      target: { value: 'Keep my unsaved change' },
    });
    expect(screen.getByLabelText('Entry rules')).toHaveValue('Keep my unsaved change');
    expect(screen.getByRole('button', { name: 'Save new version' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Your changes have been kept here.');
    fireEvent.click(screen.getByRole('button', { name: 'Discard edits and reload latest' }));
    expect(reload).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects unsafe attachment types before any upload mutation', async () => {
    editor();
    fireEvent.change(screen.getByLabelText('Upload screenshot or reference document'), {
      target: { files: [new File(['unsafe'], 'rules.html', { type: 'text/html' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a PNG, JPEG, WEBP or PDF');
    expect(session).not.toHaveBeenCalled();
  });

  it('waits for an attachment upload before saving the complete version snapshot', async () => {
    const attachment = {
      id: '291be64d-8ad1-473c-8b8e-7e63cfbce157',
      workspaceId: workspace.id,
      name: 'entry.png',
      mediaType: 'image/png',
      size: 68,
      sha256: 'a'.repeat(64),
      createdAt: '2026-10-11T00:00:00Z',
    };
    let finishUpload!: (value: Response) => void;
    const upload = new Promise<Response>((resolve) => {
      finishUpload = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: RequestInit) =>
        options?.method === 'POST' ? upload : Promise.resolve(response([attachment])),
      ),
    );
    const { save } = editor();
    fireEvent.change(screen.getByLabelText('Upload screenshot or reference document'), {
      target: { files: [new File(['PNG fixture'], 'entry.png', { type: 'image/png' })] },
    });
    expect(screen.getByRole('button', { name: 'Create strategy' })).toBeDisabled();
    submitEditor();
    expect(save).not.toHaveBeenCalled();
    finishUpload(response(attachment));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create strategy' })).toBeEnabled(),
    );
    submitEditor();
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      definition: { attachmentIds: [attachment.id] },
    });
  });
});

describe('strategy history view', () => {
  function historyFetch() {
    const v2: StrategyVersionResponse = {
      ...v1,
      id: '1daa15a8-77c7-429f-a8ae-fd2cfa16aa03',
      version: 2,
      definition: {
        ...v1.definition,
        name: 'RSI pullback refined',
        entryRules: 'RSI below 25',
        notes: '<img src=x onerror=alert(1)>',
      },
      changeReason: 'Refine RSI threshold',
    };
    const current = { ...strategy, revision: 2, currentVersionId: v2.id, currentVersion: v2 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/versions?limit=25'))
          return response({ versions: [v2, v1], nextCursor: null });
        if (url.endsWith('/trades?limit=25')) return response({ trades: [], nextCursor: null });
        if (url.includes('/financial/trades')) return response([]);
        if (url.includes('/strategy-attachments')) return response([]);
        if (url.endsWith(`/${strategyId}`)) return response(current);
        return response({ strategies: [current], nextCursor: null });
      }),
    );
    return v2;
  }

  it('browses immutable historical rules and compares changed fields without invented performance', async () => {
    const v2 = historyFetch();
    withQueries(
      <StrategyWorkspace
        workspace={workspace}
        workspaces={[workspace]}
        initialStrategyId={strategyId}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'RSI pullback refined', level: 2 }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByLabelText('View strategy version').querySelectorAll('option'),
      ).toHaveLength(2),
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    fireEvent.change(screen.getByLabelText('View strategy version'), { target: { value: v1.id } });
    expect(screen.getByRole('heading', { name: 'RSI pullback', level: 2 })).toBeVisible();
    expect(screen.getByText('RSI below 30')).toBeVisible();
    expect(screen.queryByText('RSI below 25')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Compare this version with'), {
      target: { value: v2.id },
    });
    const comparison = screen.getByRole('table');
    expect(within(comparison).getByText('RSI below 30')).toBeVisible();
    expect(within(comparison).getByText('RSI below 25')).toBeVisible();
    expect(screen.queryByText(/win rate|expectancy/iu)).not.toBeInTheDocument();
  });

  it('gives viewers version access without create/edit/archive/link controls', async () => {
    historyFetch();
    withQueries(
      <StrategyWorkspace
        workspace={{ ...workspace, role: 'viewer' }}
        workspaces={[workspace]}
        initialStrategyId={strategyId}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'RSI pullback refined', level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'You have viewer access. Strategy versions and linked trades are read-only.',
      ),
    ).toBeVisible();
    for (const name of ['New strategy', 'Edit current version', 'Archive strategy'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unclassified trade')).not.toBeInTheDocument();
  });
});
