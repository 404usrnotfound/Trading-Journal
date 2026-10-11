import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as contract from '@journal/contracts';
import { toProblemResponse } from '@journal/server';
import { createStrategyApi } from '../../packages/server/src/strategies/api.js';
import { createFinancialApi } from '../../packages/server/src/financial/api.js';
import {
  createStrategyFixture,
  strategyTestOrigin as origin,
  type StrategyTestActor,
} from './strategy-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
type Options = {
  actor?: StrategyTestActor | null;
  workspaceId?: string;
  commandId?: string;
  csrf?: string | null;
  requestOrigin?: string;
  contentType?: string;
};

describe('strategy HTTP CRUD, version history and trade pins with real session boundaries', () => {
  let fixture: Awaited<ReturnType<typeof createStrategyFixture>>;
  let api: ReturnType<typeof createStrategyApi>;
  let financialApi: ReturnType<typeof createFinancialApi>;
  beforeAll(async () => {
    fixture = await createStrategyFixture();
    api = createStrategyApi(fixture.services);
    financialApi = createFinancialApi(fixture.services);
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function request(
    path = '',
    method = 'GET',
    body?: unknown,
    options: Options = {},
    financial = false,
  ) {
    const actor = options.actor === undefined ? fixture.owner : options.actor;
    const workspaceId = options.workspaceId ?? fixture.owner.context.workspaceId;
    const headers = new Headers({ origin: options.requestOrigin ?? origin });
    if (actor) headers.set('cookie', actor.cookie);
    if (method !== 'GET') {
      headers.set('content-type', options.contentType ?? 'application/json');
      headers.set('idempotency-key', options.commandId ?? randomUUID());
      const csrf = options.csrf === undefined ? actor?.csrf : options.csrf;
      if (csrf) headers.set('x-csrf-token', csrf);
    }
    const raw = new Request(
      `${origin}/api/v1/workspaces/${workspaceId}/${financial ? 'financial' : 'strategies'}${path ? `/${path}` : ''}`,
      {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    try {
      return await (financial ? financialApi : api)(
        raw,
        workspaceId,
        path.split('?')[0]!.split('/').filter(Boolean),
      );
    } catch (error) {
      return toProblemResponse(error, 'strategy-api-fixture');
    }
  }

  async function create(name = `API strategy ${randomUUID()}`, options: Options = {}) {
    const response = await request(
      '',
      'POST',
      {
        definition: { name, status: 'active', entryRules: 'RSI below 30', notes: 'Original notes' },
        effectiveAt,
      },
      options,
    );
    const body: unknown = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    return contract.strategyResponseSchema.parse(body);
  }

  it('replays pre-strategy financial responses without rewriting them or substituting a later pin', async () => {
    const definition = await create('Legacy command compatibility');
    const creationId = randomUUID();
    const creationInput = { title: 'Phase 4 historical response', classification: 'investing' };
    const initial = await request('trades', 'POST', creationInput, { commandId: creationId }, true);
    expect(initial.status).toBe(200);
    const trade = contract.tradeResponseSchema.parse(await initial.json());
    const cancelTradeResponse = await request(
      'trades',
      'POST',
      { title: 'Phase 4 canceled response', classification: 'investing' },
      {},
      true,
    );
    expect(cancelTradeResponse.status).toBe(200);
    const cancelTrade = contract.tradeResponseSchema.parse(await cancelTradeResponse.json());
    const cancellationId = randomUUID();
    const cancellationInput = {
      expectedRevision: cancelTrade.revision,
      reason: 'Cancel unused idea',
    };
    const cancellationPath = `trades/${cancelTrade.id}/cancellations`;
    const canceledResponse = await request(
      cancellationPath,
      'POST',
      cancellationInput,
      { commandId: cancellationId },
      true,
    );
    expect(canceledResponse.status).toBe(200);
    const canceled = contract.tradeResponseSchema.parse(await canceledResponse.json());

    // Dedicated test administrator recreates the stored response shape published in Phase 4.
    // Runtime permissions never allow changing committed command history.
    const client = await fixture.admin.pool.connect();
    let historical;
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      historical = await client.query(
        `UPDATE app.financial_commands
         SET result=result-'strategyId'-'strategyVersionId'-'strategyLinkTiming'
         WHERE workspace_id=$1 AND id=ANY($2::uuid[]) RETURNING id,result,request_hash,source_revision`,
        [fixture.owner.context.workspaceId, [creationId, cancellationId]],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    expect(historical.rows).toHaveLength(2);
    const link = await request(`${definition.id}/trade-links`, 'POST', {
      tradeId: trade.id,
      versionId: definition.currentVersionId,
      expectedTradeRevision: trade.revision,
      reason: 'Classify historical trade retrospectively',
    });
    expect(link.status).toBe(200);
    const before = await fixture.admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [fixture.owner.context.workspaceId],
    );
    for (const [path, input, commandId, expected] of [
      ['trades', creationInput, creationId, trade],
      [cancellationPath, cancellationInput, cancellationId, canceled],
    ] as const) {
      const replay = await request(path, 'POST', input, { commandId }, true);
      expect(replay.status, JSON.stringify(await replay.clone().json())).toBe(200);
      expect(contract.tradeResponseSchema.parse(await replay.json())).toEqual(expected);
    }
    const current = await request(`trades/${trade.id}`, 'GET', undefined, {}, true);
    expect(contract.tradeResponseSchema.parse(await current.json())).toMatchObject({
      strategyVersionId: definition.currentVersionId,
      strategyLinkTiming: 'retrospective',
      revision: 2,
    });
    const after = await fixture.admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [fixture.owner.context.workspaceId],
    );
    expect(after.rows).toEqual(before.rows);
    const saved = await fixture.admin.pool.query(
      `SELECT id,result,request_hash,source_revision FROM app.financial_commands
       WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id`,
      [fixture.owner.context.workspaceId, [creationId, cancellationId]],
    );
    expect(saved.rows).toEqual(
      historical.rows.sort((left, right) => String(left.id).localeCompare(String(right.id))),
    );
  });

  it('creates, reads, updates and archives full snapshots while preserving v1 and its trade association', async () => {
    const first = await create('RSI API strategy');
    const tradeResponse = await request(
      'trades',
      'POST',
      {
        title: 'Original-rule campaign',
        classification: 'active-trading',
        strategyVersionId: first.currentVersionId,
      },
      {},
      true,
    );
    expect(tradeResponse.status).toBe(200);
    const trade = contract.tradeResponseSchema.parse(await tradeResponse.json());
    const update = await request(first.id, 'PUT', {
      definition: {
        ...first.currentVersion.definition,
        name: 'Renamed playbook',
        entryRules: 'RSI below 35',
        notes: 'Changed notes',
        status: 'paused',
      },
      effectiveAt: '2025-04-01T00:00:00Z',
      expectedRevision: first.revision,
      changeReason: 'Change RSI threshold',
    });
    expect(update.status).toBe(200);
    const second = contract.strategyResponseSchema.parse(await update.json());
    expect(second.currentVersion.version).toBe(2);
    const historical = await request(`${first.id}/versions/${first.currentVersionId}`);
    expect(contract.strategyVersionResponseSchema.parse(await historical.json())).toEqual(
      first.currentVersion,
    );
    const versions = await request(`${first.id}/versions?limit=1`);
    const page = contract.strategyVersionListResponseSchema.parse(await versions.json());
    expect(page.versions.map((version) => version.version)).toEqual([2]);
    expect(page.nextCursor).toBe(second.currentVersionId);
    const nextPage = await request(`${first.id}/versions?limit=1&cursor=${page.nextCursor}`);
    expect(
      contract.strategyVersionListResponseSchema.parse(await nextPage.json()).versions,
    ).toEqual([first.currentVersion]);
    const linked = await request(`${first.id}/trades`);
    expect(contract.strategyTradesResponseSchema.parse(await linked.json()).trades).toEqual([
      trade,
    ]);
    const deleted = await request(first.id, 'DELETE', {
      expectedRevision: second.revision,
      reason: 'Archive after evaluation',
    });
    expect(deleted.status).toBe(200);
    const archived = contract.strategyResponseSchema.parse(await deleted.json());
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.currentVersion).toEqual(second.currentVersion);
    const getArchived = await request(first.id);
    expect(contract.strategyResponseSchema.parse(await getArchived.json())).toEqual(archived);
    const retainedTrade = await request(`trades/${trade.id}`, 'GET', undefined, {}, true);
    expect(contract.tradeResponseSchema.parse(await retainedTrade.json())).toEqual(trade);
  });

  it('permits editor CRUD and viewer history while rejecting viewer mutations', async () => {
    const strategy = await create(undefined, { actor: fixture.editor });
    expect((await request(strategy.id, 'GET', undefined, { actor: fixture.viewer })).status).toBe(
      200,
    );
    expect(
      (await request(`${strategy.id}/versions`, 'GET', undefined, { actor: fixture.viewer }))
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          '',
          'POST',
          { definition: { name: 'Viewer cannot write' }, effectiveAt },
          { actor: fixture.viewer },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          strategy.id,
          'DELETE',
          { expectedRevision: strategy.revision, reason: 'Viewer cannot archive' },
          { actor: fixture.viewer },
        )
      ).status,
    ).toBe(403);
  });

  it('requires authenticated sessions, matching origins and session-bound CSRF proofs on every command', async () => {
    const body = { definition: { name: 'Protected strategy' }, effectiveAt };
    expect((await request('', 'GET', undefined, { actor: null })).status).toBe(401);
    expect((await request('', 'POST', body, { actor: null })).status).toBe(401);
    expect((await request('', 'POST', body, { csrf: null })).status).toBe(403);
    expect((await request('', 'POST', body, { csrf: fixture.editor.csrf })).status).toBe(403);
    expect(
      (await request('', 'POST', body, { requestOrigin: 'https://foreign.example.test' })).status,
    ).toBe(403);
  });

  it('rejects foreign workspace identities and immutable version IDs without leaking their contents', async () => {
    const strategy = await create();
    for (const path of [
      strategy.id,
      `${strategy.id}/versions`,
      `${strategy.id}/versions/${strategy.currentVersionId}`,
      `${strategy.id}/trades`,
    ]) {
      const result = await request(path, 'GET', undefined, {
        actor: fixture.outsider,
        workspaceId: fixture.outsider.context.workspaceId,
      });
      expect(result.status).toBe(404);
      expect(await result.json()).toMatchObject({ code: 'NOT_FOUND' });
    }
    expect((await request(strategy.id, 'GET', undefined, { actor: fixture.outsider })).status).toBe(
      404,
    );
    const foreign = await create('Foreign playbook', {
      actor: fixture.outsider,
      workspaceId: fixture.outsider.context.workspaceId,
    });
    const trade = await request(
      'trades',
      'POST',
      {
        title: 'Foreign pin rejected',
        classification: 'active-trading',
        strategyVersionId: foreign.currentVersionId,
      },
      {},
      true,
    );
    expect(trade.status).toBe(404);
  });

  it('normalizes UUID casing consistently for workspace, history and retrospective trade references', async () => {
    const strategy = await create('Canonical strategy identifiers');
    const options = { workspaceId: fixture.owner.context.workspaceId.toUpperCase() };
    const history = await request(
      `${strategy.id.toUpperCase()}/versions/${strategy.currentVersionId.toUpperCase()}`,
      'GET',
      undefined,
      options,
    );
    expect(history.status).toBe(200);
    expect(contract.strategyVersionResponseSchema.parse(await history.json())).toEqual(
      strategy.currentVersion,
    );
    const tradeResponse = await request(
      'trades',
      'POST',
      { title: 'Case-independent retrospective link', classification: 'active-trading' },
      {},
      true,
    );
    expect(tradeResponse.status).toBe(200);
    const trade = contract.tradeResponseSchema.parse(await tradeResponse.json());
    const link = await request(
      `${strategy.id.toUpperCase()}/trade-links`,
      'POST',
      {
        tradeId: trade.id.toUpperCase(),
        versionId: strategy.currentVersionId.toUpperCase(),
        expectedTradeRevision: trade.revision,
        reason: 'Explicit historical classification',
      },
      options,
    );
    expect(link.status).toBe(200);
    expect(contract.tradeResponseSchema.parse(await link.json())).toMatchObject({
      strategyId: strategy.id,
      strategyVersionId: strategy.currentVersionId,
      strategyLinkTiming: 'retrospective',
    });
  });

  it('requires canonical UUID idempotency keys and returns identical retries or conflicts on reused contents', async () => {
    const key = randomUUID();
    const name = `Idempotent ${randomUUID()}`;
    const first = await create(name, { commandId: key });
    expect(await create(name, { commandId: key })).toEqual(first);
    const conflict = await request(
      '',
      'POST',
      { definition: { name: 'Different contents' }, effectiveAt },
      { commandId: key },
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(
      (
        await request(
          '',
          'POST',
          { definition: { name: 'Bad key' }, effectiveAt },
          { commandId: 'not-a-uuid' },
        )
      ).status,
    ).toBe(400);
  });

  it('validates strict definitions, typed parameters and revision preconditions', async () => {
    for (const definition of [
      { name: '   ' },
      { name: 'Unknown field', secretRule: 'Unexpected' },
      { name: 'Bad direction', direction: 'sideways' },
      { name: 'Duplicate tags', tags: ['same', 'same'] },
      {
        name: 'Invalid threshold',
        parameters: [
          { id: randomUUID(), name: 'Threshold', type: 'decimal', value: '1', minimum: '2' },
        ],
      },
      {
        name: 'Number disallowed',
        parameters: [{ id: randomUUID(), name: 'Threshold', type: 'decimal', value: 0.1 }],
      },
      {
        name: 'Dangling checklist reference',
        setups: [{ id: randomUUID(), name: 'Setup', checklistItemIds: [randomUUID()] }],
      },
    ])
      expect((await request('', 'POST', { definition, effectiveAt })).status).toBe(400);
    const strategy = await create();
    const stale = await request(strategy.id, 'PUT', {
      definition: strategy.currentVersion.definition,
      effectiveAt,
      expectedRevision: strategy.revision + 1,
      changeReason: 'Stale revision',
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'STALE_STRATEGY_REVISION' });
  });

  it('validates bounded list filters and supports status, literal substring search and archive inclusion', async () => {
    const name = `Unique%_literal ${randomUUID()}`;
    const strategy = await create(name);
    const response = await request(`?search=${encodeURIComponent(name)}&status=active&limit=1`);
    expect(response.status).toBe(200);
    expect(
      contract.strategyListResponseSchema
        .parse(await response.json())
        .strategies.map((item) => item.id),
    ).toEqual([strategy.id]);
    for (const query of [
      '?limit=101',
      '?limit=01',
      '?includeArchived=yes',
      '?unexpected=true',
      '?cursor=not-uuid',
    ])
      expect((await request(query)).status).toBe(400);
    await request(strategy.id, 'DELETE', { expectedRevision: 1, reason: 'Archive query fixture' });
    const archived = await request(`?search=${encodeURIComponent(name)}&includeArchived=true`);
    expect(
      contract.strategyListResponseSchema
        .parse(await archived.json())
        .strategies.map((item) => item.id),
    ).toEqual([strategy.id]);
  });

  it('links an existing unclassified trade once with retrospective timing and rejects replacement', async () => {
    const strategy = await create();
    const old = await request(
      'trades',
      'POST',
      { title: 'Existing unclassified trade', classification: 'active-trading' },
      {},
      true,
    );
    const trade = contract.tradeResponseSchema.parse(await old.json());
    const input = {
      tradeId: trade.id,
      versionId: strategy.currentVersionId,
      expectedTradeRevision: trade.revision,
      reason: 'Review older journal entry',
    };
    const linked = await request(`${strategy.id}/trade-links`, 'POST', input);
    expect(linked.status).toBe(200);
    const result = contract.tradeResponseSchema.parse(await linked.json());
    expect(result).toMatchObject({
      strategyLinkTiming: 'retrospective',
      strategyVersionId: strategy.currentVersionId,
      revision: 2,
    });
    const replace = await request(`${strategy.id}/trade-links`, 'POST', {
      ...input,
      expectedTradeRevision: 2,
    });
    expect(replace.status).toBe(409);
    expect(await replace.json()).toMatchObject({ code: 'TRADE_STRATEGY_ALREADY_PINNED' });
  });

  it('rejects oversize or unsupported command bodies with safe problem details', async () => {
    const oversize = await request('', 'POST', {
      definition: { name: 'Oversized', notes: 'x'.repeat(262_145) },
      effectiveAt,
    });
    expect(oversize.status).toBe(413);
    const problem = contract.problemResponseSchema.parse(await oversize.json());
    expect(problem.detail).not.toContain('x'.repeat(20));
    const wrongContentType = await request(
      '',
      'POST',
      { definition: { name: 'Wrong format' }, effectiveAt },
      { contentType: 'text/plain' },
    );
    expect(wrongContentType.status).toBe(415);
    expect((await request('', 'PATCH', {})).status).toBe(405);
  });
});
