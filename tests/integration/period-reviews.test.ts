import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { journalDocumentSchema, periodReviewDefinitionSchema } from '@journal/contracts';
import { sql } from '@journal/database';
import { createPeriodReviewServices } from '../../packages/server/src/reviews/service.js';
import { createPeriodReviewApi } from '../../packages/server/src/reviews/api.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createPrivateFileStore } from '../../packages/server/src/storage.js';
import { createPortabilityServices } from '../../packages/server/src/portability/service.js';
import { createAccountingFixture } from './accounting-fixture.js';
describe('standalone reviews/templates and source summaries on restricted PostgreSQL roles', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>,
    reviews: ReturnType<typeof createPeriodReviewServices>;
  let tradeIds: string[], temporaryStorage: string;
  const fieldId = randomUUID();
  const body = (kind = 'weekly') =>
    periodReviewDefinitionSchema.parse({
      title: `Reviewed ${kind}`,
      kind,
      from: '2026-10-19T00:00:00Z',
      to: '2026-10-26T00:00:00Z',
      timezone: 'Europe/Madrid',
      status: 'draft',
      notes: 'Original review evidence',
      goals: ['Review entries'],
      recurringMistakes: ['Rushed preparation'],
      emotions: ['Focused'],
      improvementActions: [{ id: randomUUID(), text: 'Prepare checklist', status: 'open' }],
      templateVersionId: null,
      answers: [],
      tradeIds: [],
      strategyVersionIds: [],
    });
  const owner = () => fixture.owner.context;
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    reviews = createPeriodReviewServices(fixture.services);
    temporaryStorage = await mkdtemp(join(tmpdir(), 'period-review-portable-'));
    const journals = createJournalServices(fixture.services);
    const first = await journals.create(
      owner(),
      { title: 'Reviewed trade', classification: 'active-trading', legs: [] },
      randomUUID(),
    );
    const second = await journals.create(
      owner(),
      { title: 'Still needs review', classification: 'investing', legs: [] },
      randomUUID(),
    );
    await journals.save(
      owner(),
      first.trade.id,
      {
        expectedRevision: 0,
        document: journalDocumentSchema.parse({
          review: { postTradeReview: 'Recorded post-trade review', mistakes: ['Late entry'] },
        }),
      },
      randomUUID(),
    );
    tradeIds = [first.trade.id, second.trade.id];
  }, 60000);
  afterAll(async () => {
    await Promise.all([fixture?.services.close(), fixture?.admin.close()]);
    if (temporaryStorage) await rm(temporaryStorage, { recursive: true, force: true });
  });
  it('persists every required note period independently, retains draft history and conserves financial state', async () => {
    const before = await fixture.admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [owner().workspaceId],
    );
    for (const kind of ['daily', 'session-preparation', 'session-review', 'weekly', 'monthly']) {
      const first = await reviews.saveEntry(
        owner(),
        null,
        { expectedVersion: 0, reason: 'Session preparation and notes', definition: body(kind) },
        randomUUID(),
      );
      expect(first.definition.tradeIds).toEqual([]);
      const key = randomUUID(),
        update = {
          expectedVersion: 1,
          reason: 'Autosaved later reflection',
          definition: { ...first.definition, notes: 'Later draft' },
        };
      const second = await reviews.saveEntry(owner(), first.entryId, update, key);
      expect(await reviews.saveEntry(owner(), first.entryId, update, key)).toEqual(second);
      const history = await reviews.history(fixture.viewer.context, first.entryId);
      expect(history.versions.map((version) => version.definition.notes)).toEqual([
        'Later draft',
        'Original review evidence',
      ]);
      await expect(
        reviews.saveEntry(
          owner(),
          first.entryId,
          { ...update, definition: { ...second.definition, notes: 'Stale edit' } },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'STALE_REVIEW_VERSION' });
    }
    expect(
      (
        await fixture.admin.pool.query(
          'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
          [owner().workspaceId],
        )
      ).rows,
    ).toEqual(before.rows);
  });
  it('pins reusable typed template versions and requires complete answers only for finalized reviews', async () => {
    const first = await reviews.saveTemplate(
      owner(),
      null,
      {
        expectedVersion: 0,
        reason: 'Reviewed reusable template',
        definition: {
          name: 'Session process',
          instructions: 'Use recorded evidence',
          status: 'active',
          fields: [
            {
              id: fieldId,
              label: 'Preparation complete',
              type: 'boolean',
              required: true,
              help: 'Use yes or no honestly.',
            },
          ],
        },
      },
      randomUUID(),
    );
    const review = await reviews.saveEntry(
      owner(),
      null,
      {
        expectedVersion: 0,
        reason: 'Draft linked to explicit template',
        definition: { ...body(), templateVersionId: first.id },
      },
      randomUUID(),
    );
    await expect(
      reviews.saveEntry(
        owner(),
        review.entryId,
        {
          expectedVersion: 1,
          reason: 'Invalid finalization',
          definition: { ...review.definition, status: 'final' },
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const final = await reviews.saveEntry(
      owner(),
      review.entryId,
      {
        expectedVersion: 1,
        reason: 'Reviewed finalization',
        definition: { ...review.definition, status: 'final', answers: [{ fieldId, value: false }] },
      },
      randomUUID(),
    );
    const next = await reviews.saveTemplate(
      owner(),
      first.templateId,
      {
        expectedVersion: 1,
        reason: 'Revised process definition',
        definition: {
          ...first.definition,
          name: 'Updated template',
          fields: [{ ...first.definition.fields[0]!, type: 'text' }],
        },
      },
      randomUUID(),
    );
    expect(next.version).toBe(2);
    expect((await reviews.entry(owner(), final.entryId)).template).toEqual(first);
    await expect(
      fixture.services.withWorkspaceContext(owner(), (tx) =>
        tx.execute(
          sql`UPDATE app.period_review_versions SET reason='rewrite' WHERE workspace_id=${owner().workspaceId} AND id=${review.id}`,
        ),
      ),
    ).rejects.toThrow();
  });
  it('validates related ownership and gives a deterministic coverage summary of explicitly linked trades', async () => {
    const linked = await reviews.saveEntry(
      owner(),
      null,
      {
        expectedVersion: 0,
        reason: 'Linked records for weekly review',
        definition: { ...body(), tradeIds },
      },
      randomUUID(),
    );
    const summary = await reviews.summary(fixture.viewer.context, linked.entryId);
    expect(summary).toMatchObject({
      entryVersionId: linked.id,
      linkedTradeCount: 2,
      reviewedTradeCount: 1,
      missingTradeReviewIds: [tradeIds[1]],
      recurringMistakes: [{ label: 'Late entry', count: 1 }],
      goalCount: 1,
      openActionCount: 1,
    });
    await expect(reviews.entry(fixture.outsider.context, linked.entryId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      reviews.saveEntry(
        fixture.outsider.context,
        null,
        {
          expectedVersion: 0,
          reason: 'Cross-tenant reference rejected',
          definition: { ...body(), tradeIds },
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reviews.saveEntry(
        fixture.viewer.context,
        linked.entryId,
        { expectedVersion: 1, reason: 'Viewer rejected', definition: body() },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('checks HTTP mutation session/CSRF and makes read responses private', async () => {
    const api = createPeriodReviewApi(fixture.services),
      path = `http://localhost:3000/api/v1/workspaces/${owner().workspaceId}/reviews/entries`;
    const request = (csrf: boolean) =>
      new Request(path, {
        method: 'POST',
        headers: {
          cookie: fixture.owner.cookie,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
          ...(csrf ? { 'x-csrf-token': fixture.owner.csrf } : {}),
        },
        body: JSON.stringify({
          expectedVersion: 0,
          reason: 'HTTP review',
          definition: body('daily'),
        }),
      });
    await expect(api(request(false), owner().workspaceId, ['entries'])).rejects.toMatchObject({
      status: 403,
    });
    expect((await api(request(true), owner().workspaceId, ['entries'])).status).toBe(200);
    const response = await api(
      new Request(path, { headers: { cookie: fixture.viewer.cookie } }),
      owner().workspaceId,
      ['entries'],
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('round-trips review/template versions, explicit links and deterministic derived counts in a portable workspace', async () => {
    const portability = createPortabilityServices(
      fixture.services,
      createPrivateFileStore(temporaryStorage),
    );
    const archive = await portability.backup(owner());
    expect(
      archive.tables.find((table) => table.name === 'period_review_versions')!.rows.length,
    ).toBeGreaterThan(0);
    expect(
      archive.tables.find((table) => table.name === 'period_review_template_versions')!.rows,
    ).toHaveLength(2);
    const restored = await portability.restore(
      owner(),
      { name: 'Restored standalone review workspace', archive },
      randomUUID(),
    );
    const restoredContext = await fixture.services.authorizeWorkspace(
      new Request('http://localhost:3000/api/v1/workspaces', {
        headers: { cookie: fixture.owner.cookie },
      }),
      restored.workspaceId,
      'editor',
    );
    const source = await reviews.entries(owner()),
      copy = await reviews.entries(restoredContext);
    expect(copy).toEqual(source);
    const linked = source.entries.find((entry) => entry.definition.tradeIds.length > 0)!;
    const sourceSummary = await reviews.summary(owner(), linked.entryId),
      copySummary = await reviews.summary(restoredContext, linked.entryId);
    expect({ ...copySummary, generatedAt: '' }).toEqual({ ...sourceSummary, generatedAt: '' });
  });
});
