import {
  strategyDefinitionSchema,
  tradeResponseSchema,
  type StrategyResponse,
  type StrategyVersionResponse,
  type WorkspaceResponse,
} from '@journal/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyEditor } from '../../apps/web/src/components/strategies/strategy-editor.js';
import { StrategyWorkspace } from '../../apps/web/src/components/strategies/strategy-workspace.js';
import type { WorkspaceNavigationRequestDetail } from '../../apps/web/src/components/ux/navigation-request.js';

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
function openSection(name: string) {
  const summary = screen.getByText(name, { selector: 'summary' });
  const section = summary.closest('details')!;
  if (!section.open) fireEvent.click(summary);
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

  it('starts with essential fields and keeps optional configuration behind named disclosures', () => {
    editor();
    expect(screen.getByLabelText('Name', { exact: true })).toBeVisible();
    expect(screen.getByLabelText('Entry rules')).toBeVisible();
    expect(
      screen.getByText('Typed parameters', { selector: 'summary' }).closest('details'),
    ).not.toHaveAttribute('open');
    expect(
      screen
        .getByText('Detailed rules & reference notes', { selector: 'summary' })
        .closest('details'),
    ).not.toHaveAttribute('open');
    openSection('Typed parameters');
    expect(screen.getByRole('button', { name: 'Add parameter' })).toBeVisible();
  });

  it('explains a field error next to the field and focuses it from the summary', async () => {
    editor();
    submitEditor('');
    const alert = await screen.findByRole('alert');
    const name = screen.getByLabelText('Name', { exact: true });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/at least|too small/iu);
    fireEvent.click(within(alert).getByRole('button', { name: /^name:/u }));
    expect(name).toHaveFocus();
  });

  it('preserves unsaved rules until a cancellation is explicitly confirmed', async () => {
    const { cancel } = editor();
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), {
      target: { value: 'Unsaved playbook' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Discard unsaved strategy changes?');
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Name', { exact: true })).toHaveValue('Unsaved playbook');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }),
    );
    expect(cancel).toHaveBeenCalledOnce();
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
    openSection('Typed parameters');
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
    openSection('Required checklist');
    fireEvent.click(screen.getByRole('button', { name: 'Add checklist item' }));
    fireEvent.change(screen.getByLabelText('Checklist item 1'), {
      target: { value: 'Volume confirmed' },
    });
    openSection('Named setups');
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
    openSection('Typed parameters');
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
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard and reload' }),
    );
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
        if (url.endsWith(`/versions/${v1.id}`)) return response(v1);
        if (url.endsWith(`/versions/${v2.id}`)) return response(v2);
        if (url.endsWith(`/${strategyId}`)) return response(current);
        return response({ strategies: [current], nextCursor: null });
      }),
    );
    return v2;
  }

  it('displays strategy history in the workspace timezone instead of browser-local dates', async () => {
    historyFetch();
    const browserFormat = vi
      .spyOn(Date.prototype, 'toLocaleString')
      .mockReturnValue('browser-only-time');
    try {
      withQueries(
        <StrategyWorkspace
          workspace={{ ...workspace, timezone: 'Europe/Madrid' }}
          workspaces={[workspace]}
          initialStrategyId={strategyId}
        />,
      );
      await screen.findByRole('heading', { name: 'RSI pullback refined', level: 2 });
      const note = screen.getByText(/Effective .*Recorded/u);
      expect(note).toHaveTextContent('Europe/Madrid');
      expect(note).toHaveTextContent('01:00:00');
      expect(note).not.toHaveTextContent('browser-only-time');
    } finally {
      browserFormat.mockRestore();
    }
  });

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

  it('links performance to the selected historical version and persists version selection in the URL', async () => {
    const v2 = historyFetch();
    withQueries(
      <StrategyWorkspace
        workspace={workspace}
        workspaces={[workspace]}
        initialStrategyId={strategyId}
        initialVersionId={v1.id}
      />,
    );
    const performance = await screen.findByRole('link', {
      name: 'Review performance for version 1',
    });
    expect(performance).toHaveAttribute(
      'href',
      `/dashboard?workspace=${workspace.id}&strategy=${strategyId}&version=${v1.id}`,
    );
    fireEvent.change(screen.getByLabelText('View strategy version'), { target: { value: v2.id } });
    expect(screen.getByRole('link', { name: 'Review performance for version 2' })).toHaveAttribute(
      'href',
      `/dashboard?workspace=${workspace.id}&strategy=${strategyId}&version=${v2.id}`,
    );
    expect(replace).toHaveBeenLastCalledWith(
      `/strategies?workspace=${workspace.id}&strategy=${strategyId}&version=${v2.id}`,
      { scroll: false },
    );
  });

  it('protects unsaved rule edits when another strategy is selected', async () => {
    historyFetch();
    withQueries(
      <StrategyWorkspace
        workspace={workspace}
        workspaces={[workspace]}
        initialStrategyId={strategyId}
      />,
    );
    await screen.findByRole('heading', { name: 'RSI pullback refined', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Edit current version' }));
    fireEvent.change(screen.getByLabelText('Entry rules'), {
      target: { value: 'Unsaved threshold' },
    });
    fireEvent.click(screen.getByRole('button', { name: /RSI pullback refined · Active/u }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Discard unsaved strategy changes?');
    expect(screen.getByLabelText('Entry rules')).toHaveValue('Unsaved threshold');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Entry rules')).toHaveValue('Unsaved threshold');
    expect(replace).not.toHaveBeenCalled();
  });
  it('keeps dirty rules guarded when confirmed sign-out fails to navigate', async () => {
    historyFetch();
    withQueries(
      <StrategyWorkspace
        workspace={workspace}
        workspaces={[workspace]}
        initialStrategyId={strategyId}
      />,
    );
    await screen.findByRole('heading', { name: 'RSI pullback refined', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Edit current version' }));
    fireEvent.change(screen.getByLabelText('Entry rules'), {
      target: { value: 'Retain unsaved threshold after failed logout' },
    });
    const continuation = vi.fn();
    const detail: WorkspaceNavigationRequestDetail = {
      destination: '/sign-in',
      continue: continuation,
      handled: false,
    };
    const request = new CustomEvent('journal:navigation-request', { cancelable: true, detail });
    fireEvent(window, request);
    expect(request.defaultPrevented).toBe(true);
    expect(detail.handled).toBe(true);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Discard unsaved strategy changes?');
    expect(continuation).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard and continue' }));
    expect(continuation).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Entry rules')).toHaveValue(
      'Retain unsaved threshold after failed logout',
    );
    const unload = new Event('beforeunload', { cancelable: true });
    fireEvent(window, unload);
    expect(unload.defaultPrevented).toBe(true);
    const retry = new CustomEvent('journal:navigation-request', {
      cancelable: true,
      detail: { destination: '/sign-in', continue: continuation, handled: false },
    });
    fireEvent(window, retry);
    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'Discard unsaved strategy changes?',
    );
    expect(continuation).toHaveBeenCalledOnce();
  });

  it('preselects the journal trade and requires confirmation before immutable retrospective assignment', async () => {
    historyFetch();
    const tradeId = '951fba8b-7db1-4773-9954-f94766075157';
    const trade = tradeResponseSchema.parse({
      id: tradeId,
      title: 'Opening pullback trade',
      classification: 'active-trading',
      revision: 1,
      archivedAt: null,
      strategyVersionId: null,
      strategyId: null,
      strategyLinkTiming: null,
      status: 'closed',
      closureReviewRequired: false,
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('/financial/trades')) return response([trade]);
      if (options?.method === 'POST' && url.endsWith('/trade-links'))
        return response({
          ...trade,
          strategyId,
          strategyVersionId: v1.id,
          strategyLinkTiming: 'retrospective',
          revision: 2,
        });
      return originalFetch(url, options);
    });
    vi.stubGlobal('fetch', fetchMock);
    withQueries(
      <StrategyWorkspace
        workspace={workspace}
        workspaces={[workspace]}
        initialStrategyId={strategyId}
        initialVersionId={v1.id}
        initialTradeId={tradeId}
      />,
    );
    await screen.findByRole('heading', { name: 'RSI pullback', level: 2 });
    await waitFor(() => expect(screen.getByLabelText('Unclassified trade')).toHaveValue(tradeId));
    fireEvent.change(screen.getByLabelText('Reason for retrospective assignment'), {
      target: { value: 'Classify after weekly review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign to version 1' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Opening pullback trade');
    expect(dialog).toHaveTextContent('version 1');
    expect(dialog).toHaveTextContent('cannot be changed later');
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(
      0,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm assignment' }));
    await screen.findByText(
      'Trade assigned retrospectively to version 1. This association cannot be reassigned.',
    );
    const mutation = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({
      tradeId,
      versionId: v1.id,
      expectedTradeRevision: 1,
      reason: 'Classify after weekly review',
    });
  });

  it('collects an archive reason and confirms the consequence before mutating', async () => {
    historyFetch();
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) =>
      originalFetch(url, options),
    );
    vi.stubGlobal('fetch', fetchMock);
    withQueries(
      <StrategyWorkspace
        workspace={workspace}
        workspaces={[workspace]}
        initialStrategyId={strategyId}
      />,
    );
    await screen.findByRole('heading', { name: 'RSI pullback refined', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Archive strategy' }));
    expect(screen.getByRole('button', { name: 'Confirm archive' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for archiving'), {
      target: { value: 'Retire after research review' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm archive' }).closest('form')!);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Archive this strategy?');
    expect(dialog).toHaveTextContent('Its versions and trade references remain available.');
    expect(dialog).toHaveTextContent('Retire after research review');
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(
      0,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Reason for archiving')).toHaveValue(
      'Retire after research review',
    );
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
