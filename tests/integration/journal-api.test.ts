import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as contract from '@journal/contracts';
import { toProblemResponse } from '@journal/server';
import { createPrivateFileStore } from '@journal/server/storage';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createJournalApi } from '../../packages/server/src/journal/api.js';
import { createJournalAttachmentApi } from '../../packages/server/src/journal/attachments.js';
import {
  createJournalFixture,
  journalTestOrigin as origin,
  type JournalTestActor,
} from './journal-fixture.js';

type Options = {
  actor?: JournalTestActor | null;
  workspaceId?: string;
  commandId?: string;
  csrf?: string | null;
  requestOrigin?: string;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  raw?: string;
};
describe('journal HTTP workflow with real authentication, CSRF, tenant isolation and private evidence', () => {
  let fixture: Awaited<ReturnType<typeof createJournalFixture>>,
    api: ReturnType<typeof createJournalApi>,
    attachments: ReturnType<typeof createJournalAttachmentApi>,
    storeRoot: string;
  beforeAll(async () => {
    fixture = await createJournalFixture();
    api = createJournalApi(fixture.services);
    storeRoot = await mkdtemp(join(tmpdir(), 'journal-http-evidence-'));
    attachments = createJournalAttachmentApi(fixture.services, {
      store: createPrivateFileStore(storeRoot, { maximumBytes: 10 * 1024 * 1024 }),
    });
  });
  afterAll(async () => {
    await fixture?.cleanup();
    if (storeRoot) await rm(storeRoot, { recursive: true, force: true });
  });
  async function request(path = '', method = 'GET', body?: unknown, options: Options = {}) {
    const actor = options.actor === undefined ? fixture.owner : options.actor,
      workspaceId = options.workspaceId ?? fixture.owner.context.workspaceId;
    const headers = new Headers({
      origin: options.requestOrigin ?? origin,
      ...options.extraHeaders,
    });
    if (actor) headers.set('cookie', actor.cookie);
    if (method !== 'GET') {
      headers.set('content-type', options.contentType ?? 'application/json');
      headers.set('idempotency-key', options.commandId ?? randomUUID());
      const csrf = options.csrf === undefined ? actor?.csrf : options.csrf;
      if (csrf) headers.set('x-csrf-token', csrf);
    }
    const raw = new Request(
      `${origin}/api/v1/workspaces/${workspaceId}/journals${path ? `/${path}` : ''}`,
      {
        method,
        headers,
        ...(body === undefined && options.raw === undefined
          ? {}
          : { body: options.raw ?? JSON.stringify(body) }),
      },
    );
    try {
      return await api(raw, workspaceId, path.split('?')[0]!.split('/').filter(Boolean));
    } catch (error) {
      return toProblemResponse(error, 'journal-http-fixture');
    }
  }
  async function create(title = `HTTP trade ${randomUUID()}`) {
    const response = await request('', 'POST', { title, classification: 'active-trading' });
    const body: unknown = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    return contract.journalDetailResponseSchema.parse(body);
  }
  const document = (customNotes = 'Manual review') =>
    contract.journalDocumentSchema.parse({
      plan: { thesis: 'Objective plan, manually recorded' },
      review: {
        customNotes,
        marketConditions: 'Range bound',
        mistakes: ['Late entry'],
        emotions: ['Calm'],
        confidence: 4,
        executionQuality: 'mixed',
        lessonsLearned: 'Wait for confirmation',
        postTradeReview: 'Review after close',
        customTags: ['RSI', 'reviewed'],
      },
    });

  it('creates, autosaves, retrieves exact history and labels ledger calculations independently from manual review', async () => {
    const trade = await create();
    const saved = await request(trade.trade.id, 'PUT', {
      expectedRevision: 0,
      document: document(),
    });
    expect(saved.status).toBe(200);
    const entry = contract.journalEntryResponseSchema.parse(await saved.json());
    expect(entry.revision).toBe(1);
    const detailResponse = await request(trade.trade.id);
    expect(detailResponse.status).toBe(200);
    const detail = contract.journalDetailResponseSchema.parse(await detailResponse.json());
    expect(detail.journal.document).toEqual(document());
    expect(detail.financial.rMultiple).toMatchObject({
      source: 'calculated-ledger',
      status: 'unavailable',
      value: null,
    });
    const revisions = await request(`${trade.trade.id}/revisions?limit=1`);
    expect(revisions.status).toBe(200);
    const history = contract.journalRevisionsResponseSchema.parse(await revisions.json());
    expect(history.revisions).toHaveLength(1);
    const exact = await request(`${trade.trade.id}/revisions/${history.revisions[0]!.id}`);
    expect(exact.status).toBe(200);
    expect(contract.journalRevisionResponseSchema.parse(await exact.json()).document).toEqual(
      document(),
    );
  });
  it('publishes plans as immutable versions and returns the frozen original commitment in detail', async () => {
    const trade = await create();
    await request(trade.trade.id, 'PUT', { expectedRevision: 0, document: document() });
    const response = await request(`${trade.trade.id}/plans`, 'POST', {
      expectedRevision: 1,
      expectedTradeRevision: 1,
      reason: 'Publish original before execution',
    });
    expect(response.status).toBe(200);
    const plan = contract.journalPlanVersionResponseSchema.parse(await response.json());
    expect(plan.version).toBe(1);
    const plans = await request(`${trade.trade.id}/plans?limit=1`);
    expect(plans.status).toBe(200);
    expect(contract.journalPlansResponseSchema.parse(await plans.json()).plans).toEqual([plan]);
    const detail = contract.journalDetailResponseSchema.parse(
      await (await request(trade.trade.id)).json(),
    );
    expect(detail.originalPlan).toEqual(plan);
    expect(detail.commitment).toMatchObject({ originalPlanId: plan.id, timing: 'pre-trade' });
    expect(detail.journal.revision).toBe(2);
  });
  it('records supplemental risk through the API without replacing the original risk denominator', async () => {
    const catalog = createCatalogServices(fixture.services);
    const currency = await catalog.createCurrency(
      fixture.owner.context,
      {
        namespace: 'journal-http',
        code: 'HTTP',
        kind: 'custom',
        unitIdentity: `journal:http:${randomUUID()}`,
        name: 'HTTP risk unit',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt: '2025-01-01T00:00:00.000001Z',
      },
      randomUUID(),
    );
    const trade = await create(),
      draft = document();
    draft.plan.initialRisk = {
      amount: '20.000',
      currencyId: currency.id,
      method: 'Pre-trade planned risk',
      methodNotes: '',
    };
    await request(trade.trade.id, 'PUT', { expectedRevision: 0, document: draft });
    await request(`${trade.trade.id}/plans`, 'POST', {
      expectedRevision: 1,
      expectedTradeRevision: 1,
      reason: 'Original risk commitment',
    });
    const key = randomUUID(),
      body = {
        expectedRevision: 2,
        amount: '5.2500',
        currencyId: currency.id,
        method: 'Scale-in supplement',
        methodNotes: 'Recorded separately',
        reason: 'Increase planned exposure',
      };
    const response = await request(`${trade.trade.id}/risk-additions`, 'POST', body, {
      commandId: key,
    });
    expect(response.status).toBe(200);
    const risk = contract.journalRiskAdditionResponseSchema.parse(await response.json());
    expect(risk.amount).toBe('5.2500');
    const retry = await request(`${trade.trade.id}/risk-additions`, 'POST', body, {
      commandId: key,
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(risk);
    const page = await request(`${trade.trade.id}/risk-additions?limit=1`);
    expect(page.status).toBe(200);
    expect(
      contract.journalRiskAdditionsResponseSchema.parse(await page.json()).riskAdditions,
    ).toEqual([risk]);
    const detail = contract.journalDetailResponseSchema.parse(
      await (await request(trade.trade.id)).json(),
    );
    expect(detail.originalPlan!.definition.initialRisk!.amount).toBe('20.000');
    expect(detail.journal.revision).toBe(3);
  });
  it('rejects caller-supplied commitment timestamps and cross-trade plan cursors', async () => {
    const trade = await create(),
      other = await create();
    const injection = await request(`${trade.trade.id}/plans`, 'POST', {
      expectedRevision: 0,
      expectedTradeRevision: 1,
      reason: 'Attempt to backdate',
      committedAt: '2020-01-01T00:00:00Z',
    });
    expect(injection.status).toBe(400);
    const otherPlanResponse = await request(`${other.trade.id}/plans`, 'POST', {
      expectedRevision: 0,
      expectedTradeRevision: 1,
      reason: 'Original empty plan',
    });
    expect(otherPlanResponse.status).toBe(200);
    const otherPlan = contract.journalPlanVersionResponseSchema.parse(
      await otherPlanResponse.json(),
    );
    expect((await request(`${trade.trade.id}/plans?cursor=${otherPlan.id}`)).status).toBe(404);
  });
  it('replays autosave with the original expected revision and reports stale drafts explicitly', async () => {
    const trade = await create(),
      key = randomUUID(),
      body = { expectedRevision: 0, document: document('First draft') };
    const first = await request(trade.trade.id, 'PUT', body, { commandId: key });
    expect(first.status).toBe(200);
    const firstValue = await first.json();
    await request(trade.trade.id, 'PUT', {
      expectedRevision: 1,
      document: document('Second draft'),
    });
    const replay = await request(trade.trade.id, 'PUT', body, { commandId: key });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstValue);
    const stale = await request(trade.trade.id, 'PUT', body);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'STALE_JOURNAL_REVISION' });
    const changed = await request(
      trade.trade.id,
      'PUT',
      { ...body, document: document('Changed') },
      { commandId: key },
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it.each(['create', 'save', 'plan', 'risk'] as const)(
    'requires session-bound CSRF for %s mutations',
    async (operation) => {
      const trade = await create();
      const path =
        operation === 'create'
          ? ''
          : operation === 'save'
            ? trade.trade.id
            : `${trade.trade.id}/${operation === 'plan' ? 'plans' : 'risk-additions'}`;
      const method = operation === 'save' ? 'PUT' : 'POST';
      const response = await request(path, method, {}, { csrf: null });
      expect(response.status).toBe(403);
    },
  );
  it('rejects unauthenticated, foreign-origin and another session CSRF proofs', async () => {
    const anonymous = await request('', 'GET', undefined, { actor: null });
    expect(anonymous.status).toBe(401);
    const foreign = await request(
      '',
      'POST',
      { title: 'Foreign', classification: 'investing' },
      { requestOrigin: 'https://foreign.example' },
    );
    expect(foreign.status).toBe(403);
    const borrowed = await request(
      '',
      'POST',
      { title: 'Borrowed', classification: 'investing' },
      { csrf: fixture.editor.csrf },
    );
    expect(borrowed.status).toBe(403);
  });
  it('allows viewer detail but refuses viewer commands and cross-tenant identities', async () => {
    const trade = await create();
    expect(
      (await request(trade.trade.id, 'GET', undefined, { actor: fixture.viewer })).status,
    ).toBe(200);
    expect(
      (
        await request(
          trade.trade.id,
          'PUT',
          { expectedRevision: 0, document: document() },
          { actor: fixture.viewer },
        )
      ).status,
    ).toBe(403);
    expect(
      (await request(trade.trade.id, 'GET', undefined, { actor: fixture.outsider })).status,
    ).toBe(404);
    expect(
      (
        await request(trade.trade.id, 'GET', undefined, {
          workspaceId: fixture.outsider.context.workspaceId,
        })
      ).status,
    ).toBe(404);
  });
  it('strictly rejects invented calculated fields and automatic rule claims', async () => {
    const trade = await create();
    for (const invalid of [
      { ...document(), financial: { rMultiple: '10' } },
      { ...document(), review: { ...document().review, confidence: 0 } },
      {
        ...document(),
        review: {
          ...document().review,
          ruleAssessments: [
            { checklistItemId: randomUUID(), outcome: 'passed', evidence: '', source: 'automatic' },
          ],
        },
      },
    ]) {
      const response = await request(trade.trade.id, 'PUT', {
        expectedRevision: 0,
        document: invalid,
      });
      expect(response.status).toBe(400);
    }
    const detail = contract.journalDetailResponseSchema.parse(
      await (await request(trade.trade.id)).json(),
    );
    expect(detail.journal.revision).toBe(0);
  });
  it('rejects malformed JSON, unsupported media, oversized snapshots and body streams', async () => {
    const trade = await create();
    expect((await request(trade.trade.id, 'PUT', undefined, { raw: '{' })).status).toBe(400);
    expect(
      (
        await request(
          trade.trade.id,
          'PUT',
          { expectedRevision: 0, document: document() },
          { contentType: 'text/plain' },
        )
      ).status,
    ).toBe(415);
    expect(
      (await request(trade.trade.id, 'PUT', undefined, { raw: ' '.repeat(262_145) })).status,
    ).toBe(413);
    const oversized = contract.journalDocumentSchema.parse({});
    oversized.plan.thesis = 'x'.repeat(20_000);
    oversized.plan.marketConditions = 'x'.repeat(20_000);
    oversized.review.marketConditions = 'x'.repeat(20_000);
    oversized.review.lessonsLearned = 'x'.repeat(20_000);
    oversized.review.postTradeReview = 'x'.repeat(20_000);
    oversized.review.customNotes = 'x'.repeat(20_000);
    oversized.review.exitReason = 'x'.repeat(20_000);
    expect(
      (await request(trade.trade.id, 'PUT', { expectedRevision: 0, document: oversized })).status,
    ).toBe(400);
  });
  it('enforces bounded strict paging and exact revision ownership', async () => {
    const trade = await create(),
      other = await create();
    await request(other.trade.id, 'PUT', { expectedRevision: 0, document: document() });
    const history = contract.journalRevisionsResponseSchema.parse(
      await (await request(`${other.trade.id}/revisions`)).json(),
    );
    expect((await request(`${trade.trade.id}/revisions/${history.revisions[0]!.id}`)).status).toBe(
      404,
    );
    expect((await request('?limit=101')).status).toBe(400);
    expect((await request(`${trade.trade.id}/revisions?unknown=1`)).status).toBe(400);
    expect((await request(`${trade.trade.id}/plans?cursor=${randomUUID()}`)).status).toBe(404);
    expect((await request(trade.trade.id, 'DELETE')).status).toBe(405);
  });
  it('saves before/during/after private evidence and protects every historical file reference', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVYAAAAASUVORK5CYII=',
      'base64',
    );
    async function evidence(method: string, attachmentId?: string, actor = fixture.owner) {
      const headers = new Headers({ origin, cookie: actor.cookie });
      if (method !== 'GET') {
        headers.set('x-csrf-token', actor.csrf);
        headers.set('idempotency-key', randomUUID());
      }
      if (method === 'POST') {
        headers.set('content-type', 'image/png');
        headers.set('x-file-name', encodeURIComponent('Trade entry.png'));
      }
      const raw = new Request(
        `${origin}/api/v1/workspaces/${fixture.owner.context.workspaceId}/journal-attachments${attachmentId ? `/${attachmentId}` : ''}`,
        { method, headers, ...(method === 'POST' ? { body: png } : {}) },
      );
      try {
        return await attachments(raw, fixture.owner.context.workspaceId, attachmentId);
      } catch (error) {
        return toProblemResponse(error, 'journal-evidence-fixture');
      }
    }
    const refs = [];
    for (const phase of ['before', 'during', 'after'] as const) {
      const uploaded = await evidence('POST');
      expect(uploaded.status).toBe(201);
      const file = contract.strategyAttachmentResponseSchema.parse(await uploaded.json());
      refs.push({ attachmentId: file.id, phase });
    }
    const trade = await create(),
      snapshot = document();
    snapshot.plan.attachmentIds = [refs[0]!.attachmentId];
    snapshot.review.attachments = refs;
    const saved = await request(trade.trade.id, 'PUT', { expectedRevision: 0, document: snapshot });
    expect(saved.status).toBe(200);
    const downloaded = await evidence('GET', refs[0]!.attachmentId, fixture.viewer);
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(png);
    expect(downloaded.headers.get('cache-control')).toBe('private, no-store');
    await request(trade.trade.id, 'PUT', {
      expectedRevision: 1,
      document: document('Remove from current draft'),
    });
    for (const ref of refs) {
      const removed = await evidence('DELETE', ref.attachmentId);
      expect(removed.status).toBe(409);
      expect(await removed.json()).toMatchObject({ code: 'ATTACHMENT_REFERENCED' });
    }
    const publish = await request(`${trade.trade.id}/plans`, 'POST', {
      expectedRevision: 2,
      expectedTradeRevision: 1,
      reason: 'Publish after evidence review',
    });
    expect(publish.status).toBe(200);
  });
});
