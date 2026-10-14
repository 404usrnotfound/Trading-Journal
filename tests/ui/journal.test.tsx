import {
  currencyResponseSchema,
  journalDetailResponseSchema,
  journalDocumentSchema,
  strategyDefinitionSchema,
  type JournalDetailResponse,
  type JournalDocument,
  type StrategyResponse,
} from '@journal/contracts';
import { INVENTORY_CALCULATION_MANIFEST } from '@journal/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalEditor } from '../../apps/web/src/components/journal/journal-editor.js';
import { JournalFinancial } from '../../apps/web/src/components/journal/journal-financial.js';
import { JournalWorkspace } from '../../apps/web/src/components/journal/journal-workspace.js';

const { session, replace, push } = vi.hoisted(() => ({
  session: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../../apps/web/src/lib/api-client.js', () => ({ apiClient: { GET: session } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));
const workspaceId = 'bf209d8c-3c1e-4be1-aa20-c9a59e5dc3f5';
const tradeId = '6ca0e3a1-7878-4c7a-a946-621b8a7b8326';
const legId = '9a28ca43-fcf7-4038-922c-7a1293542f31';
const currencyId = 'bf2acf02-62d2-4d32-a079-710a70c58a15';
const ruleId = '3b9bde3e-9c0d-4c69-8038-7d6ebbb2316a';
const versionId = 'b3a0f1b3-93fd-48f4-8c13-60ac310c45da';
const instant = '2026-10-12T12:00:00.000Z';
const currency = currencyResponseSchema.parse({
  id: currencyId,
  namespace: 'iso:4217',
  code: 'USD',
  kind: 'fiat',
  unitIdentity: 'iso:USD',
  name: 'US dollar',
  displayScale: 2,
  settlementIncrement: '0.01',
  effectiveAt: instant,
  revision: 1,
  archivedAt: null,
  conventionId: legId,
  version: 1,
});
const metric = (value: string, unit = 'money') => ({
  status: 'available',
  value,
  reasons: [],
  unit,
  currencyId: unit === 'share' ? null : currencyId,
  source: 'calculated-ledger',
});
function fixture(): JournalDetailResponse {
  return journalDetailResponseSchema.parse({
    trade: {
      id: tradeId,
      title: 'RSI pullback',
      classification: 'active-trading',
      revision: 1,
      archivedAt: null,
      strategyVersionId: versionId,
      strategyId: tradeId,
      strategyLinkTiming: 'recorded-with-trade',
      status: 'open',
      closureReviewRequired: false,
    },
    journal: {
      tradeId,
      revision: 0,
      document: journalDocumentSchema.parse({ plan: { strategyVersionId: versionId } }),
      updatedAt: null,
      updatedBy: null,
    },
    strategy: {
      id: versionId,
      workspaceId,
      strategyId: tradeId,
      version: 1,
      effectiveAt: instant,
      definition: strategyDefinitionSchema.parse({
        name: 'RSI rules',
        status: 'active',
        entryRules: 'RSI below 30',
        checklist: [{ id: ruleId, label: 'RSI below threshold', required: true }],
      }),
      definitionHash: 'a'.repeat(64),
      changeReason: 'Initial',
      actorId: 'owner',
      createdAt: instant,
    },
    originalPlan: null,
    currentPlan: null,
    commitment: null,
    recentHistory: [],
    financial: {
      sourceRevision: '12',
      definitionVersion: 'trade-journal-financial/1',
      manifest: INVENTORY_CALCULATION_MANIFEST,
      rMultiple: {
        status: 'unavailable',
        value: null,
        reasons: ['missing_original_risk', 'campaign_not_completed'],
        unit: 'R',
        currencyId: null,
        source: 'calculated-ledger',
        originalPlanId: null,
        definitionVersion: 'original-risk-r/1',
        financialSourceRevision: '12',
      },
      timeline: [],
      legs: [
        {
          legId,
          accountId: tradeId,
          accountName: 'Primary account',
          instrumentId: legId,
          instrumentVersionId: legId,
          instrumentName: 'Fractional share',
          quantityUnit: 'share',
          quoteCurrencyId: currencyId,
          settlementCurrencyId: currencyId,
          direction: 'long',
          actualEntry: metric('100.125'),
          actualExit: {
            status: 'unavailable',
            value: null,
            reasons: ['no_effective_fills'],
            unit: 'price',
            currencyId,
            source: 'calculated-ledger',
          },
          enteredQuantity: metric('0.125', 'share'),
          exitedQuantity: metric('0', 'share'),
          openQuantity: metric('0.125', 'share'),
          realizedGross: metric('0'),
          realizedNet: metric('0'),
          costBasis: metric('12.515625'),
          fees: [],
          executions: [],
          lots: [],
          matches: [],
        },
      ],
    },
  });
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function wrap(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}
function editor(
  detail = fixture(),
  editable = true,
  historyDocument?: JournalDocument,
  strategies: StrategyResponse[] = [],
  onSavedImplementation?: () => Promise<void>,
) {
  const onSaved = vi.fn(onSavedImplementation ?? (() => Promise.resolve()));
  const onDirtyChange = vi.fn();
  wrap(
    <JournalEditor
      workspaceId={workspaceId}
      detail={detail}
      currencies={[currency]}
      strategies={strategies}
      editable={editable}
      onSaved={onSaved}
      onDirtyChange={onDirtyChange}
      {...(historyDocument ? { historyDocument } : {})}
    />,
  );
  return { onSaved, onDirtyChange };
}
beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    response: new Response(null, { headers: { 'x-csrf-token': 'proof' } }),
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
});

describe('trade journal editor', () => {
  it('keeps an unsaved draft when a page link is activated and saves with the keyboard shortcut', async () => {
    const writes: JournalDocument[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === 'PUT') {
          const document = JSON.parse(String(options.body)).document;
          writes.push(document);
          return response({
            tradeId,
            revision: 1,
            document,
            updatedAt: instant,
            updatedBy: 'owner',
          });
        }
        return response([]);
      }),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Thesis'), {
      target: { value: 'Review before leaving' },
    });
    expect(fireEvent.click(screen.getByRole('link', { name: 'Open strategy playbook' }))).toBe(
      false,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Save your journal draft before leaving');
    expect(screen.getByLabelText('Thesis')).toHaveValue('Review before leaving');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await screen.findByText('All journal changes saved');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.plan.thesis).toBe('Review before leaving');
    const unloading = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloading);
    expect(unloading.defaultPrevented).toBe(false);
  });

  it('requires explicit confirmation before publishing an original plan without risk', async () => {
    const publications: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/plans') && options?.method === 'POST') publications.push(options);
        return response([]);
      }),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Plan publication reason'), {
      target: { value: 'Commit this plan' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Commit original plan' }));
    expect(publications).toHaveLength(0);
    expect(screen.getByText(/No initial risk is recorded/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm publication' })).toBeVisible();
  });

  it('associates field help with the exact decimal input for assistive technology', () => {
    editor();
    expect(screen.getByLabelText('Planned targets · Fractional share')).toHaveAccessibleDescription(
      'Separate multiple targets with commas.',
    );
    expect(screen.getByLabelText('Custom tags')).toHaveAccessibleDescription(
      'Separate entries with commas.',
    );
  });

  it('keeps a typed trailing comma so a user can enter the next tag or target normally', async () => {
    let document: ReturnType<typeof journalDocumentSchema.parse> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method !== 'PUT') return response([]);
        document = JSON.parse(String(options.body)).document;
        return response({ tradeId, revision: 1, document, updatedAt: instant, updatedBy: 'owner' });
      }),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Custom tags'), { target: { value: 'pullback,' } });
    expect(screen.getByLabelText('Custom tags')).toHaveValue('pullback,');
    fireEvent.change(screen.getByLabelText('Custom tags'), {
      target: { value: 'pullback, practice' },
    });
    fireEvent.change(screen.getByLabelText('Emotions'), { target: { value: 'calm, ' } });
    expect(screen.getByLabelText('Emotions')).toHaveValue('calm, ');
    fireEvent.change(screen.getByLabelText('Emotions'), { target: { value: 'calm, focused' } });
    fireEvent.change(screen.getByLabelText('Planned targets · Fractional share'), {
      target: { value: '110,' },
    });
    expect(screen.getByLabelText('Planned targets · Fractional share')).toHaveValue('110,');
    fireEvent.change(screen.getByLabelText('Planned targets · Fractional share'), {
      target: { value: '110, 120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    await screen.findByText('All journal changes saved');
    expect(document?.review.customTags).toEqual(['pullback', 'practice']);
    expect(document?.review.emotions).toEqual(['calm', 'focused']);
    expect(document?.plan.legs[0]?.plannedTargets).toEqual(['110', '120']);
  });
  it('acknowledges normalized label whitespace once without repeated revisions or a false dirty state', async () => {
    let writes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method !== 'PUT') return response([]);
        writes += 1;
        const body = JSON.parse(String(options.body));
        return response({
          tradeId,
          revision: 1,
          document: journalDocumentSchema.parse(body.document),
          updatedAt: instant,
          updatedBy: 'owner',
        });
      }),
    );
    const { onDirtyChange } = editor();
    fireEvent.change(screen.getByLabelText('Timeframe'), { target: { value: ' 5m ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    await screen.findByText('All journal changes saved');
    expect(screen.getByLabelText('Timeframe')).toHaveValue('5m');
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    expect(writes).toBe(1);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(false);
  });
  it('autosaves a complete manual review without changing ledger actuals and uses exact decimal input', async () => {
    const writes: Array<{ body: Record<string, unknown>; headers: HeadersInit | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method !== 'PUT') return response([]);
        const body = JSON.parse(String(options.body));
        writes.push({ body, headers: options.headers });
        return response({
          tradeId,
          revision: writes.length,
          document: body.document,
          updatedAt: instant,
          updatedBy: 'owner',
        });
      }),
    );
    const { onDirtyChange } = editor();
    fireEvent.change(screen.getByLabelText('Thesis'), {
      target: { value: 'Controlled pullback in a rising trend.' },
    });
    fireEvent.change(screen.getByLabelText('Planned entry · Fractional share'), {
      target: { value: '100.123456789012345678901234567890123456' },
    });
    fireEvent.change(screen.getByLabelText('Actual stop · Fractional share'), {
      target: { value: '96.125' },
    });
    fireEvent.change(screen.getByLabelText('Manually reported entry · Fractional share'), {
      target: { value: '999' },
    });
    fireEvent.change(screen.getByLabelText('Mistakes'), {
      target: { value: 'early entry, oversized' },
    });
    fireEvent.change(screen.getByLabelText('Emotions'), { target: { value: 'calm, anxious' } });
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Execution quality'), { target: { value: 'mixed' } });
    fireEvent.change(screen.getByLabelText('Lessons learned'), {
      target: { value: '<script>literal notes</script>' },
    });
    fireEvent.change(screen.getByLabelText('Post-trade review'), {
      target: { value: 'Wait for confirmation next time.' },
    });
    fireEvent.change(screen.getByLabelText('Custom tags'), {
      target: { value: 'reversal, practice' },
    });
    fireEvent.change(screen.getByLabelText('Custom notes'), {
      target: { value: 'A private observation.' },
    });
    fireEvent.change(screen.getByLabelText('RSI below threshold · Required rule'), {
      target: { value: 'passed' },
    });
    await waitFor(() => expect(writes).toHaveLength(1), { timeout: 2500 });
    expect(writes[0]?.body).toMatchObject({
      expectedRevision: 0,
      document: {
        plan: {
          thesis: 'Controlled pullback in a rising trend.',
          legs: [{ plannedEntry: '100.123456789012345678901234567890123456' }],
        },
        review: {
          mistakes: ['early entry', 'oversized'],
          emotions: ['calm', 'anxious'],
          confidence: 4,
          executionQuality: 'mixed',
          customTags: ['reversal', 'practice'],
          actualObservations: [{ actualStop: '96.125', reportedEntry: '999' }],
          ruleAssessments: [{ checklistItemId: ruleId, outcome: 'passed', source: 'manual' }],
        },
      },
    });
    expect(fixture().financial.legs[0]?.actualEntry.value).toBe('100.125');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('All journal changes saved')).toBeVisible();
  });

  it('preserves a conflicting draft and only replaces it through the explicit latest-version action', async () => {
    const latest = fixture();
    latest.journal.revision = 2;
    latest.journal.document.plan.thesis = 'Saved by another tab';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) =>
        options?.method === 'PUT'
          ? response({}, 409)
          : url.includes('/journals/')
            ? response(latest)
            : response([]),
      ),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Thesis'), { target: { value: 'My local draft' } });
    fireEvent.change(screen.getByLabelText('Custom tags'), { target: { value: 'pullback, ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    await screen.findByText('Conflict · your draft is preserved');
    expect(screen.getByLabelText('Thesis')).toHaveValue('My local draft');
    expect(screen.getByLabelText('Custom tags')).toHaveValue('pullback, ');
    fireEvent.click(screen.getByRole('button', { name: 'View latest saved revision' }));
    await screen.findByRole('button', { name: 'Replace draft with latest saved version' });
    expect(screen.getByLabelText('Thesis')).toHaveValue('My local draft');
    fireEvent.click(
      screen.getByRole('button', { name: 'Replace draft with latest saved version' }),
    );
    expect(screen.getByLabelText('Thesis')).toHaveValue('My local draft');
    fireEvent.click(screen.getByRole('button', { name: 'Replace draft' }));
    expect(screen.getByLabelText('Thesis')).toHaveValue('Saved by another tab');
    expect(screen.getByLabelText('Custom tags')).toHaveValue('');
  });

  it('retries a lost save response with the same command and original expected revision', async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method !== 'PUT') return response([]);
        requests.push(options);
        if (requests.length === 1) throw new Error('Connection interrupted');
        const body = JSON.parse(String(options.body));
        return response({
          tradeId,
          revision: 1,
          document: body.document,
          updatedAt: instant,
          updatedBy: 'owner',
        });
      }),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Custom notes'), {
      target: { value: 'Retain this note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    await screen.findByRole('button', { name: 'Retry save' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await screen.findByText('All journal changes saved');
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(new Headers(requests[0]?.headers).get('Idempotency-Key')).toBe(
      new Headers(requests[1]?.headers).get('Idempotency-Key'),
    );
    expect(new Headers(requests[1]?.headers).get('X-CSRF-Token')).toBe('proof');
  });

  it('saves edits made during an in-flight request against the newly acknowledged revision', async () => {
    let complete: ((response: Response) => void) | undefined;
    const requests: Array<{
      expectedRevision: number;
      document: ReturnType<typeof journalDocumentSchema.parse>;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method !== 'PUT') return response([]);
        const body = JSON.parse(String(options.body));
        requests.push(body);
        if (requests.length === 1)
          return new Promise<Response>((resolve) => {
            complete = resolve;
          });
        return response({
          tradeId,
          revision: 2,
          document: body.document,
          updatedAt: instant,
          updatedBy: 'owner',
        });
      }),
    );
    editor();
    fireEvent.change(screen.getByLabelText('Thesis'), { target: { value: 'First thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    await screen.findByText('Saving journal…');
    fireEvent.change(screen.getByLabelText('Custom notes'), {
      target: { value: 'Added while saving' },
    });
    await waitFor(() => expect(complete).toBeDefined());
    complete!(
      response({
        tradeId,
        revision: 1,
        document: requests[0]!.document,
        updatedAt: instant,
        updatedBy: 'owner',
      }),
    );
    await waitFor(() => expect(requests).toHaveLength(2), { timeout: 3000 });
    expect(requests[0]?.expectedRevision).toBe(0);
    expect(requests[1]?.expectedRevision).toBe(1);
    expect(requests[1]?.document.review.customNotes).toBe('Added while saving');
    await screen.findByText('All journal changes saved');
  });

  it.each([false, true])(
    'keeps publication disabled through a deferred journal refresh and preserves edits made during it: %s',
    async (editDuringRefresh) => {
      let completeRefresh!: () => void;
      const refreshing = new Promise<void>((resolve) => {
        completeRefresh = resolve;
      });
      const refreshed = vi.fn().mockReturnValueOnce(refreshing).mockResolvedValue(undefined);
      const writes: { expectedRevision: number; document: JournalDocument }[] = [];
      const publications: {
        expectedRevision: number;
        expectedTradeRevision: number;
        reason: string;
      }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, options?: RequestInit) => {
          if (options?.method === 'PUT') {
            const body = JSON.parse(String(options.body));
            writes.push(body);
            return response({
              tradeId,
              revision: writes.length,
              document: body.document,
              updatedAt: instant,
              updatedBy: 'owner',
            });
          }
          if (url.endsWith('/plans') && options?.method === 'POST') {
            publications.push(JSON.parse(String(options.body)));
            return response({
              id: legId,
              tradeId,
              version: 1,
              definition: writes.at(-1)!.document.plan,
              definitionHash: 'b'.repeat(64),
              createdAt: instant,
              createdBy: 'owner',
              changeReason: 'Commit after refresh',
            });
          }
          return response([]);
        }),
      );
      const { onDirtyChange } = editor(fixture(), true, undefined, [], refreshed);
      fireEvent.change(screen.getByLabelText('Plan publication reason'), {
        target: { value: 'Commit after refresh' },
      });
      fireEvent.change(screen.getByLabelText('Thesis'), {
        target: { value: 'Draft acknowledged before refreshing' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
      await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
      expect(screen.getByText('Saving journal…')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Commit original plan' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled();
      if (editDuringRefresh) {
        fireEvent.change(screen.getByLabelText('Custom notes'), {
          target: { value: 'An additional note while the refresh is pending' },
        });
        expect(screen.getByText('Saving journal…')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Commit original plan' })).toBeDisabled();
      }
      fireEvent.click(screen.getByRole('button', { name: 'Commit original plan' }));
      expect(publications).toHaveLength(0);
      expect(writes).toHaveLength(1);

      await act(async () => {
        completeRefresh();
        await refreshing;
      });
      if (editDuringRefresh) {
        expect(screen.getByText('Unsaved draft · autosave pending')).toBeVisible();
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
      } else {
        expect(screen.getByText('All journal changes saved')).toBeVisible();
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
      }
      expect(screen.getByRole('button', { name: 'Commit original plan' })).not.toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Commit original plan' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }));
      await screen.findByText(/Plan v1 published/);
      expect(publications).toEqual([
        {
          expectedRevision: editDuringRefresh ? 2 : 1,
          expectedTradeRevision: 1,
          reason: 'Commit after refresh',
        },
      ]);
      expect(writes).toHaveLength(editDuringRefresh ? 2 : 1);
      if (editDuringRefresh) {
        expect(writes[1]?.expectedRevision).toBe(1);
        expect(writes[1]?.document.review.customNotes).toBe(
          'An additional note while the refresh is pending',
        );
      }
    },
  );

  it('pauses saves during private uploads and retains the selected before/during/after phase', async () => {
    let complete: ((response: Response) => void) | undefined;
    const writes: Array<ReturnType<typeof journalDocumentSchema.parse>> = [];
    const uploadHeaders: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/journal-attachments') && options?.method === 'POST') {
          uploadHeaders.push(new Headers(options.headers));
          return new Promise<Response>((resolve) => {
            complete = resolve;
          });
        }
        if (options?.method === 'PUT') {
          const body = JSON.parse(String(options.body));
          writes.push(body.document);
          return response({
            tradeId,
            revision: 1,
            document: body.document,
            updatedAt: instant,
            updatedBy: 'owner',
          });
        }
        return response([]);
      }),
    );
    const { onDirtyChange } = editor();
    fireEvent.change(screen.getByLabelText('Screenshot phase'), { target: { value: 'during' } });
    fireEvent.change(screen.getByLabelText('Upload screenshot or document'), {
      target: { files: [new File(['evidence'], 'execution.png', { type: 'image/png' })] },
    });
    await screen.findByText('Upload in progress · saving paused');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    fireEvent.change(screen.getByLabelText('Thesis'), {
      target: { value: 'Captured during execution' },
    });
    expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled();
    expect(writes).toHaveLength(0);
    complete!(
      response({
        id: legId,
        workspaceId,
        name: 'execution.png',
        mediaType: 'image/png',
        size: 8,
        sha256: 'a'.repeat(64),
        createdAt: instant,
      }),
    );
    await waitFor(() => expect(writes).toHaveLength(1), { timeout: 3000 });
    expect(writes[0]?.review.attachments).toEqual([{ attachmentId: legId, phase: 'during' }]);
    expect(writes[0]?.plan.attachmentIds).toEqual([]);
    expect(uploadHeaders[0]?.get('X-CSRF-Token')).toBe('proof');
    expect(uploadHeaders[0]?.get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/u);
    expect(screen.getByRole('link', { name: 'execution.png' })).toHaveAttribute(
      'href',
      expect.stringContaining('/journal-attachments/'),
    );
  });

  it('retries plan publication with the same identity if its response is lost', async () => {
    const detail = fixture();
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/plans') && options?.method === 'POST') {
          requests.push(options);
          if (requests.length === 1) throw new Error('Lost publication response');
          return response({
            id: legId,
            tradeId,
            version: 1,
            definition: detail.journal.document.plan,
            definitionHash: 'b'.repeat(64),
            createdAt: instant,
            createdBy: 'owner',
            changeReason: 'Commit initial thesis',
          });
        }
        return response([]);
      }),
    );
    editor(detail);
    fireEvent.change(screen.getByLabelText('Plan publication reason'), {
      target: { value: 'Commit initial thesis' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Commit original plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }));
    await screen.findByText('Lost publication response');
    fireEvent.click(screen.getByRole('button', { name: 'Commit original plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }));
    await screen.findByText(/Plan v1 published/);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(new Headers(requests[0]?.headers).get('Idempotency-Key')).toBe(
      new Headers(requests[1]?.headers).get('Idempotency-Key'),
    );
  });

  it('validates risk and price fields before persistence rather than turning missing data into zero', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal('fetch', fetcher);
    editor();
    fireEvent.click(screen.getByLabelText('Record planned initial risk'));
    fireEvent.change(screen.getByLabelText('Initial risk amount'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Initial risk methodology'), {
      target: { value: 'Stop distance' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Initial risk amount');
    expect(screen.getByLabelText('Initial risk amount')).toHaveAttribute('aria-invalid', 'true');
    expect(fetcher.mock.calls.some((call) => call[1]?.method === 'PUT')).toBe(false);
  });

  it('keeps viewer journal controls read only and rule assessments explicitly manual', () => {
    editor(fixture(), false);
    expect(screen.getByLabelText('Thesis')).toBeDisabled();
    expect(screen.getByLabelText('Confidence')).toBeDisabled();
    expect(screen.getByLabelText('RSI below threshold · Required rule')).toHaveValue('unknown');
    expect(screen.queryByRole('button', { name: 'Save now' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Upload screenshot or document')).not.toBeInTheDocument();
    expect(screen.getByText('Manual assessment')).toBeVisible();
  });

  it('shows closed campaign reviews without offering new plan or risk publication', () => {
    const detail = fixture();
    detail.trade.status = 'closed';
    editor(detail);
    expect(screen.getByLabelText('Post-trade review')).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Commit original plan' })).not.toBeInTheDocument();
    expect(screen.queryByText('Record supplemental risk')).not.toBeInTheDocument();
  });

  it('preserves a historical draft strategy and assessments when the trade was later pinned to another version', () => {
    const historicalVersionId = 'a4c3e1f4-1f4d-4e94-8b80-cc60ef177f31';
    const historicalSetupId = '7d1a0d7c-b7e1-4c19-bd63-a5b9278310b9';
    const historicalRuleId = '9ef76b2c-24e3-47cf-a5c6-d7d18daf00b1';
    const historical = journalDocumentSchema.parse({
      plan: { strategyVersionId: historicalVersionId, setupId: historicalSetupId },
      review: {
        ruleAssessments: [
          {
            checklistItemId: historicalRuleId,
            outcome: 'failed',
            evidence: 'Entry preceded confirmation under the draft rules.',
            source: 'manual',
          },
        ],
      },
    });
    editor(fixture(), true, historical);
    expect(screen.getByText(`Historical strategy version ${historicalVersionId}`)).toBeVisible();
    expect(screen.queryByText('RSI rules · v1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('RSI below threshold · Required rule')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Setup')).toHaveValue(historicalSetupId);
    expect(
      screen.getByRole('option', { name: `Recorded setup ${historicalSetupId}` }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(`Recorded rule ${historicalRuleId}`)).toHaveValue('failed');
    expect(screen.getByLabelText(`Evidence · Recorded rule ${historicalRuleId}`)).toHaveValue(
      'Entry preceded confirmation under the draft rules.',
    );
    expect(screen.getByLabelText(`Recorded rule ${historicalRuleId}`)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save now' })).not.toBeInTheDocument();
  });

  it('resolves historical setup and checklist labels only from the exact recorded version', () => {
    const historicalVersionId = 'a4c3e1f4-1f4d-4e94-8b80-cc60ef177f31';
    const historicalSetupId = '7d1a0d7c-b7e1-4c19-bd63-a5b9278310b9';
    const historicalRuleId = '9ef76b2c-24e3-47cf-a5c6-d7d18daf00b1';
    const detail = fixture();
    const historicalVersion = {
      ...detail.strategy!,
      id: historicalVersionId,
      definition: strategyDefinitionSchema.parse({
        name: 'Original confirmation rules',
        status: 'active',
        setups: [{ id: historicalSetupId, name: 'Historical pullback' }],
        checklist: [{ id: historicalRuleId, label: 'Original confirmation', required: true }],
      }),
    };
    const historical = journalDocumentSchema.parse({
      plan: { strategyVersionId: historicalVersionId, setupId: historicalSetupId },
      review: {
        ruleAssessments: [
          {
            checklistItemId: historicalRuleId,
            outcome: 'passed',
            evidence: 'Confirmed',
            source: 'manual',
          },
        ],
      },
    });
    editor(detail, true, historical, [
      {
        id: detail.strategy!.strategyId,
        workspaceId,
        revision: 1,
        currentVersionId: historicalVersionId,
        currentVersion: historicalVersion,
        archivedAt: null,
        archiveReason: null,
        createdAt: instant,
        updatedAt: instant,
      },
    ]);
    expect(screen.getByText('Original confirmation rules · v1')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Historical pullback' })).toBeInTheDocument();
    expect(screen.getByLabelText('Original confirmation · Required rule')).toHaveValue('passed');
    expect(screen.queryByLabelText('RSI below threshold · Required rule')).not.toBeInTheDocument();
  });
});

describe('calculated journal financial facts', () => {
  it('labels currencies, actual fill prices and unavailable R separately from manual observations', () => {
    render(<JournalFinancial detail={fixture()} currencies={[currency]} timeZone="UTC" />);
    expect(screen.getByText('100.125')).toBeVisible();
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/original committed plan does not contain initial risk/i),
    ).toBeVisible();
    expect(screen.getByText(/financially closed/i)).toBeVisible();
    expect(screen.getByText('Calculated · Read only')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('explains later backdated fills without claiming a recorded pre-trade plan proves eligibility', () => {
    const detail = fixture();
    detail.commitment = {
      originalPlanId: legId,
      committedAt: instant,
      financialSourceRevision: '5',
      timing: 'pre-trade',
      createdBy: 'owner',
    };
    detail.financial.rMultiple.reasons = ['execution_not_after_original_commitment'];
    render(<JournalFinancial detail={detail} currencies={[currency]} timeZone="UTC" />);
    expect(screen.getByText(/Recorded before known fills/)).toBeVisible();
    expect(screen.getByText(/Later backdated allocations or corrections/)).toBeVisible();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });

  it('shows workspace-local instants with distinct DST offsets while retaining exact event timestamps', () => {
    const detail = fixture();
    const beforeFallBack = '2026-10-25T00:30:00.123456Z';
    const afterFallBack = '2026-10-25T01:30:00.654321Z';
    detail.commitment = {
      originalPlanId: legId,
      committedAt: '2026-03-29T01:30:00.000Z',
      financialSourceRevision: '5',
      timing: 'pre-trade',
      createdBy: 'owner',
    };
    detail.financial.timeline = [beforeFallBack, afterFallBack].map((economicAt, index) => ({
      id: `fill-${index}`,
      kind: 'execution',
      economicAt,
      accountId: tradeId,
      legId,
      executionId: legId,
      feeId: null,
      currencyId,
      amount: null,
      quantity: '0.125',
      price: '100.125',
      allocationId: legId,
    }));
    render(
      <JournalFinancial
        detail={detail}
        currencies={[currency]}
        timeZone="Europe/Madrid"
        locale="en-GB"
      />,
    );
    expect(screen.getByText(/29 Mar 2026, 03:30:00 GMT\+02:00 · Europe\/Madrid/)).toBeVisible();
    fireEvent.click(screen.getByText('Financial timeline (2 events)'));
    expect(screen.getByText('25 Oct 2026, 02:30:00 GMT+02:00 · Europe/Madrid')).toHaveAttribute(
      'dateTime',
      beforeFallBack,
    );
    expect(screen.getByText('25 Oct 2026, 02:30:00 GMT+01:00 · Europe/Madrid')).toHaveAttribute(
      'dateTime',
      afterFallBack,
    );
  });
});

describe('journal workspace selection and creation', () => {
  function workspace(initialFilters?: { period?: string; from?: string; to?: string }) {
    return wrap(
      <JournalWorkspace
        workspace={{
          id: workspaceId,
          name: 'Private journal',
          role: 'owner',
          isDemo: false,
          timezone: 'Europe/Madrid',
          reportingCurrency: null,
          revision: 1,
        }}
        workspaces={[]}
        initialTradeId={null}
        {...(initialFilters ? { initialFilters } : {})}
      />,
    );
  }
  function emptyWorkspaceResponses(requests?: URL[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/journals?')) {
          requests?.push(new URL(url, 'http://localhost'));
          return response({ trades: [], nextCursor: null });
        }
        if (url.includes('/strategies?')) return response({ strategies: [], nextCursor: null });
        return response([]);
      }),
    );
  }

  it('focuses a new idea and protects it from reload, navigation and accidental dismissal', async () => {
    emptyWorkspaceResponses();
    workspace();
    fireEvent.click(screen.getByRole('button', { name: 'New trade idea' }));
    expect(screen.getByLabelText('Trade title')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Trade title'), { target: { value: 'Uncreated idea' } });
    const unloading = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloading);
    expect(unloading.defaultPrevented).toBe(true);
    expect(fireEvent.click(screen.getByRole('link', { name: 'Record manual trade' }))).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Create your trade journal or use Back');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Trade title')).toHaveValue('Uncreated idea');
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(screen.queryByLabelText('Trade title')).not.toBeInTheDocument();
    const safeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(safeUnload);
    expect(safeUnload.defaultPrevented).toBe(false);
  });

  it('requests a complete server-filtered local day across a DST change and preserves the filter in its URL', async () => {
    const requests: URL[] = [];
    emptyWorkspaceResponses(requests);
    workspace({ period: 'custom', from: '2026-10-25', to: '2026-10-25' });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.searchParams.get('from')).toBe('2026-10-24T21:59:59.999999Z');
    expect(requests[0]?.searchParams.get('to')).toBe('2026-10-25T22:59:59.999999Z');
    expect(screen.getByText(/Unfilled ideas use creation date/)).toBeVisible();
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining('period=custom&from=2026-10-25&to=2026-10-25'),
      { scroll: false },
    );
    await screen.findByText('No trades match these filters.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear journal filters' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.searchParams.has('from')).toBe(false);
    expect(screen.getByLabelText('Review period')).toHaveValue('all');
  });

  it('does not request a misleading journal result for an invalid historical range', async () => {
    const requests: URL[] = [];
    emptyWorkspaceResponses(requests);
    workspace({ period: 'custom', from: '2026-10-26', to: '2026-10-25' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'From date must be on or before to date.',
    );
    expect(requests).toHaveLength(0);
    expect(screen.queryByText('No trades match these filters.')).not.toBeInTheDocument();
  });

  it('offers an explicit weekly review checklist and the same period in account performance', async () => {
    emptyWorkspaceResponses();
    workspace({ period: 'week' });
    expect(screen.getByText('Weekly review checklist')).toBeVisible();
    fireEvent.click(screen.getByText('Weekly review checklist'));
    expect(screen.getByText(/Reviews save to each trade/)).toBeVisible();
    expect(screen.getByRole('link', { name: "Open this week's performance" })).toHaveAttribute(
      'href',
      expect.stringContaining(`/dashboard?workspace=${workspaceId}&from=`),
    );
    expect(screen.getByRole('link', { name: 'Record manual trade' })).toHaveAttribute(
      'href',
      `/record?workspace=${workspaceId}`,
    );
  });

  it('creates an idea without inventing instrument units or financial results', async () => {
    let created: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          created = JSON.parse(String(options.body));
          return response(fixture());
        }
        if (url.includes('/journals?')) return response({ trades: [], nextCursor: null });
        if (url.endsWith('/plans?limit=25')) return response({ plans: [], nextCursor: null });
        if (url.endsWith('/revisions?limit=25'))
          return response({ revisions: [], nextCursor: null });
        if (url.endsWith('/risk-additions?limit=25'))
          return response({ riskAdditions: [], nextCursor: null });
        if (url.includes('/journals/')) return response(fixture());
        if (url.includes('/strategies?')) return response({ strategies: [], nextCursor: null });
        return response([]);
      }),
    );
    wrap(
      <JournalWorkspace
        workspace={{
          id: workspaceId,
          name: 'Private journal',
          role: 'owner',
          isDemo: false,
          timezone: 'UTC',
          reportingCurrency: null,
          revision: 1,
        }}
        workspaces={[]}
        initialTradeId={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New trade idea' }));
    fireEvent.change(screen.getByLabelText('Trade title'), { target: { value: 'A new thesis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create trade journal' }));
    await waitFor(() =>
      expect(created).toEqual({
        title: 'A new thesis',
        classification: 'active-trading',
        legs: [],
      }),
    );
    expect(replace).toHaveBeenCalledWith(expect.stringContaining(`trade=${tradeId}`), {
      scroll: false,
    });
    expect(await screen.findByRole('heading', { name: 'RSI pullback' })).toBeVisible();
    expect(
      within(screen.getByRole('complementary', { name: 'Trade selection' })).queryByText(
        'A new thesis',
      ),
    ).not.toBeInTheDocument();
  });
});
