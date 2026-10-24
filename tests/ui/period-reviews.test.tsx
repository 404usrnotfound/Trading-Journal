import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PeriodReviewTemplateVersion,
  PeriodReviewVersion,
  WorkspaceResponse,
} from '@journal/contracts';
import { ReviewWorkspace } from '../../apps/web/src/components/reviews/review-workspace.js';
vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'review-fixture-csrf',
}));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workspace: WorkspaceResponse = {
  id: uuid(1),
  name: 'Period review workspace',
  role: 'owner',
  isDemo: false,
  timezone: 'Europe/Madrid',
  reportingCurrency: 'EUR',
  revision: 1,
};
const at = '2026-10-23T10:00:00.000001Z';
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
let writes: { path: string; body: Record<string, unknown>; key: string }[],
  versions: PeriodReviewVersion[],
  template: PeriodReviewTemplateVersion | null,
  loseResponse: boolean;
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
function start(role: WorkspaceResponse['role'] = 'owner') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <ReviewWorkspace workspace={{ ...workspace, role }} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  window.history.replaceState(null, '', '/reviews');
  writes = [];
  versions = [];
  template = null;
  loseResponse = false;
  const results = new Map<string, unknown>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (!init?.method) {
        if (url.pathname.endsWith('/catalog')) return json({ items: [], nextCursor: null });
        if (url.pathname.endsWith('/templates'))
          return json({ templates: template ? [template] : [], nextCursor: null });
        if (url.pathname.endsWith('/entries'))
          return json({ entries: versions.slice(-1), nextCursor: null });
        if (url.pathname.endsWith('/history'))
          return json({ versions: [...versions].reverse(), nextCursor: null });
        if (url.pathname.endsWith('/summary'))
          return json({
            entryVersionId: versions.at(-1)!.id,
            sourceRevision: '0',
            generatedAt: at,
            linkedTradeCount: 0,
            reviewedTradeCount: 0,
            statusCounts: {},
            missingTradeReviewIds: [],
            recurringMistakes: [],
            goalCount: versions.at(-1)!.definition.goals.length,
            openActionCount: 0,
            sourceRecords: [],
            explanation: 'Only explicit source links are summarized; no causal conclusion.',
          });
        return json(versions.at(-1));
      }
      const body = JSON.parse(String(init.body)),
        key = new Headers(init.headers).get('idempotency-key')!;
      writes.push({ path: url.pathname, body, key });
      if (results.has(key)) return json(results.get(key));
      let result: unknown;
      if (url.pathname.includes('/templates')) {
        template = {
          id: uuid(10),
          templateId: uuid(11),
          version: body.expectedVersion + 1,
          actorId: 'owner',
          createdAt: at,
          reason: body.reason,
          definition: body.definition,
        };
        result = template;
      } else {
        const version: PeriodReviewVersion = {
          id: uuid(20 + versions.length),
          entryId: uuid(19),
          version: body.expectedVersion + 1,
          actorId: 'owner',
          createdAt: at,
          reason: body.reason,
          definition: body.definition,
          template: body.definition.templateVersionId ? template : null,
        };
        versions.push(version);
        result = version;
      }
      results.set(key, result);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Lost after server commit');
      }
      return json(result);
    }),
  );
});
describe('standalone period reviews and reusable templates UI', () => {
  it('autosaves valid independent drafts, retains multiline goals and finalizes with immutable version history', async () => {
    start();
    change('Review title', 'Friday process review');
    change('Review kind', 'session-review');
    change(
      'Notes and session preparation/review',
      'Reviewed execution process, without inventing a trade.',
    );
    change('Goals', 'Read the plan\nRecord observations');
    change('Emotions', 'Focused\nPatient');
    expect(screen.getByLabelText('Goals', { exact: true })).toHaveValue(
      'Read the plan\nRecord observations',
    );
    await waitFor(() => expect(versions).toHaveLength(1), { timeout: 4000 });
    expect(versions[0]!.definition).toMatchObject({
      kind: 'session-review',
      tradeIds: [],
      goals: ['Read the plan', 'Record observations'],
      emotions: ['Focused', 'Patient'],
      status: 'draft',
    });
    change('Notes and session preparation/review', 'Later reflection');
    await waitFor(() => expect(versions).toHaveLength(2), { timeout: 4000 });
    await screen.findByText('Saved version 2 · draft.');
    fireEvent.click(screen.getByRole('button', { name: 'Finalize review' }));
    await screen.findByText('Saved version 3 · finalized.');
    expect(versions[0]!.definition.notes).toContain('without inventing a trade');
    expect(versions[2]!.definition.status).toBe('final');
    expect(screen.getByLabelText('Review title', { exact: true })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reopen as a new draft version' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Permanent period review' })).toHaveAttribute(
      'href',
      `/reviews?workspace=${workspace.id}&entry=${uuid(19)}`,
    );
  });
  it('publishes configurable typed templates and pins their exact version and answers into a period review', async () => {
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Reusable review templates' }));
    change('Template name', 'Process quality template');
    change('Template instructions', 'Use recorded facts.');
    change('Template change reason', 'First reviewed template');
    fireEvent.click(screen.getByRole('button', { name: 'Add configurable review field' }));
    change('Field 1 label', 'Process score');
    change('Field 1 type', 'decimal');
    fireEvent.click(screen.getByLabelText('Required before finalization'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish review template' }));
    await screen.findByText('Published Process quality template template v1.');
    fireEvent.click(screen.getByRole('button', { name: /^Period reviews$/ }));
    await screen.findByRole('option', { name: 'Process quality template · v1' });
    change('Reusable template version', uuid(10));
    change('Review title', 'Monthly discipline review');
    change('Review kind', 'monthly');
    change('Process score (required)', '0.75');
    fireEvent.click(screen.getByRole('button', { name: 'Finalize review' }));
    await screen.findByText('Saved version 1 · finalized.');
    expect(versions[0]!.definition).toMatchObject({
      kind: 'monthly',
      templateVersionId: uuid(10),
      answers: [{ fieldId: template!.definition.fields[0]!.id, value: '0.75' }],
      tradeIds: [],
    });
  });
  it('pauses editing after an unknown save outcome and retries the exact retained command instead of duplicating a review', async () => {
    start();
    loseResponse = true;
    change('Review title', 'Retained uncertain draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft now' }));
    await screen.findByText(/previous save outcome is unknown/);
    expect(screen.getByLabelText('Review title', { exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry retained review save' }));
    await screen.findByText('Saved version 1 · draft.');
    expect(writes).toHaveLength(2);
    expect(writes[1]!.key).toBe(writes[0]!.key);
    expect(writes[1]!.body).toEqual(writes[0]!.body);
    expect(versions).toHaveLength(1);
  });
  it('protects an incomplete unsaved draft across internal workflow navigation until explicitly discarded', async () => {
    start();
    change('Notes and session preparation/review', 'Still incomplete without a title.');
    await waitFor(() =>
      expect(
        screen.getByLabelText('Notes and session preparation/review', { exact: true }),
      ).toHaveValue('Still incomplete without a title.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reusable review templates' }));
    expect(
      screen.getByText('Save or discard the current review before changing this workspace view.'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard local changes and reload saved review' }),
    );
    await screen.findByText('Unsaved draft discarded.');
    fireEvent.click(screen.getByRole('button', { name: 'Reusable review templates' }));
    expect(screen.getByLabelText('Template name', { exact: true })).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
  it('guards unpublished template drafts and retries an uncertain publication with its exact command', async () => {
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Reusable review templates' }));
    change('Template name', 'Retained template');
    fireEvent.click(screen.getByRole('button', { name: /^Period reviews$/ }));
    expect(
      screen.getByText('Save or discard the current review before changing this workspace view.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard unpublished template changes' }));
    expect(screen.getByLabelText('Template name', { exact: true })).toHaveValue('');
    change('Template name', 'Retained template');
    change('Template change reason', 'Reviewed first definition');
    loseResponse = true;
    fireEvent.click(screen.getByRole('button', { name: 'Publish review template' }));
    await screen.findByText(/previous template publication outcome is unknown/);
    expect(screen.getByLabelText('Template name', { exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry retained template publication' }));
    await screen.findByText('Published Retained template template v1.');
    expect(writes).toHaveLength(2);
    expect(writes[1]!.key).toBe(writes[0]!.key);
    expect(writes[1]!.body).toEqual(writes[0]!.body);
    expect(template!.version).toBe(1);
  });
  it('disables review and template mutations for viewers', async () => {
    start('viewer');
    expect(screen.getByRole('button', { name: 'Save draft now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalize review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reusable review templates' }));
    expect(screen.getByRole('button', { name: 'Publish review template' })).toBeDisabled();
  });
});
