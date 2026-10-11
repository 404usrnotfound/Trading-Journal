import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@journal/database';
import { strategyCreateSchema, strategyDefinitionSchema } from '@journal/contracts';
import { createStrategyServices } from '../../packages/server/src/strategies/service.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { financialFingerprint } from '../../packages/server/src/financial/repository.js';
import { createStrategyFixture } from './strategy-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
const revisedAt = '2025-04-01T00:00:00.000001Z';

describe('immutable strategy publications and trade pins on restricted PostgreSQL roles', () => {
  let fixture: Awaited<ReturnType<typeof createStrategyFixture>>;
  let strategies: ReturnType<typeof createStrategyServices>;
  let catalog: ReturnType<typeof createCatalogServices>;
  const definition = (name = `Strategy ${randomUUID()}`) =>
    strategyDefinitionSchema.parse({ name, status: 'active' });
  const create = (name?: string) =>
    strategies.create(
      fixture.owner.context,
      strategyCreateSchema.parse({ definition: definition(name), effectiveAt }),
      randomUUID(),
    );

  beforeAll(async () => {
    fixture = await createStrategyFixture();
    strategies = createStrategyServices(fixture.services);
    catalog = createCatalogServices(fixture.services);
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function financialSnapshot() {
    const result = await fixture.admin.pool.query(
      `SELECT
      (SELECT revision FROM app.financial_state WHERE workspace_id=$1) AS revision,
      (SELECT count(*)::text FROM app.financial_commands WHERE workspace_id=$1) AS commands,
      (SELECT count(*)::text FROM app.postings WHERE workspace_id=$1) AS postings,
      (SELECT count(*)::text FROM app.positions WHERE workspace_id=$1) AS positions,
      (SELECT count(*)::text FROM app.lots WHERE workspace_id=$1) AS lots,
      (SELECT count(*)::text FROM app.fees WHERE workspace_id=$1) AS fees,
      (SELECT count(*)::text FROM app.outbox_events WHERE workspace_id=$1) AS outbox`,
      [fixture.owner.context.workspaceId],
    );
    return result.rows[0];
  }

  it('publishes complete v1/v2 snapshots and leaves every historical field and initial trade pin unchanged', async () => {
    const first = await create('RSI reversal v1');
    const firstVersion = structuredClone(first.currentVersion);
    const trade = await catalog.createTrade(
      fixture.owner.context,
      {
        title: 'Three months of v1 rules',
        classification: 'active-trading',
        strategyVersionId: first.currentVersionId,
      },
      randomUUID(),
    );
    const before = await financialSnapshot();
    const checklistId = randomUUID();
    const definitionV2 = strategyDefinitionSchema.parse({
      ...firstVersion.definition,
      name: 'RSI reversal renamed',
      description: 'Revision after review',
      status: 'paused',
      assetClasses: ['stock', 'ETF'],
      markets: ['NYSE'],
      timeframes: ['1h'],
      direction: 'long',
      setupConditions: 'Pullback within trend',
      entryRules: 'RSI crosses 35 instead of 30',
      confirmationRules: 'Volume exceeds median',
      invalidationRules: 'Close below support',
      stopLossMethodology: 'Structural stop',
      takeProfitMethodology: 'Two planned targets',
      riskRules: 'Review aggregate exposure',
      positionSizingRules: 'Based on reviewed risk distance',
      exitRules: 'Stop or target',
      indicators: ['RSI(14)', 'SMA(200)'],
      notes: 'New review notes',
      tags: ['trend'],
      checklist: [{ id: checklistId, label: 'Confirm market conditions', required: true }],
      setups: [
        {
          id: randomUUID(),
          name: 'Trend pullback',
          conditions: 'Price above SMA',
          checklistItemIds: [checklistId],
        },
      ],
      parameters: [
        {
          id: randomUUID(),
          name: 'RSI threshold',
          type: 'decimal',
          value: '35',
          minimum: '0',
          maximum: '100',
          unit: 'RSI',
        },
      ],
    });
    const second = await strategies.update(
      fixture.owner.context,
      first.id,
      {
        definition: definitionV2,
        effectiveAt: revisedAt,
        expectedRevision: first.revision,
        changeReason: 'Revise RSI rule after review',
      },
      randomUUID(),
    );
    expect(second.currentVersion.version).toBe(2);
    expect(second.revision).toBe(2);
    expect(second.currentVersion.definition).toEqual(definitionV2);
    expect(second.currentVersion.definitionHash).toBe(financialFingerprint(definitionV2));
    expect(
      await strategies.getVersion(fixture.owner.context, first.id, first.currentVersionId),
    ).toEqual(firstVersion);
    expect(await catalog.getTrade(fixture.owner.context, trade.id)).toEqual(trade);
    expect(trade).toMatchObject({
      strategyId: first.id,
      strategyVersionId: first.currentVersionId,
      strategyLinkTiming: 'recorded-with-trade',
    });
    expect(await financialSnapshot()).toEqual(before);
    const versions = await strategies.versions(fixture.owner.context, first.id);
    expect(versions.versions.map((version) => version.version)).toEqual([2, 1]);
    expect((await strategies.linkedTrades(fixture.owner.context, first.id)).trades).toEqual([
      trade,
    ]);
  });

  it('preserves accepted decimal source text through publication, reads and immutable history', async () => {
    const sourceValues = ['0.1000', '-0', '1.000', `0.${'0'.repeat(510)}`];
    const initialDefinition = strategyDefinitionSchema.parse({
      name: 'Lossless decimal parameters',
      parameters: sourceValues.map((value, index) => ({
        id: randomUUID(),
        name: `Parameter ${index + 1}`,
        type: 'decimal',
        value,
        minimum: '-0',
        maximum: '1.000',
      })),
    });
    const first = await strategies.create(
      fixture.owner.context,
      {
        definition: initialDefinition,
        effectiveAt,
        changeReason: 'Preserve original parameter text',
      },
      randomUUID(),
    );
    expect(first.currentVersion.definition).toEqual(initialDefinition);
    expect(
      (await strategies.get(fixture.owner.context, first.id)).currentVersion.definition,
    ).toEqual(initialDefinition);
    const updatedDefinition = strategyDefinitionSchema.parse({
      ...initialDefinition,
      parameters: initialDefinition.parameters.map((parameter) => ({
        ...parameter,
        value: '0.2000',
      })),
    });
    const second = await strategies.update(
      fixture.owner.context,
      first.id,
      {
        definition: updatedDefinition,
        effectiveAt: revisedAt,
        expectedRevision: first.revision,
        changeReason: 'Update parameters without rewriting source history',
      },
      randomUUID(),
    );
    expect(second.currentVersion.definition).toEqual(updatedDefinition);
    expect(
      (await strategies.getVersion(fixture.owner.context, first.id, first.currentVersionId))
        .definition,
    ).toEqual(initialDefinition);
    expect(
      (await strategies.versions(fixture.owner.context, first.id)).versions.map(
        (version) => version.definition,
      ),
    ).toEqual([updatedDefinition, initialDefinition]);
    for (const invalid of ['1e-3', `0.${'0'.repeat(36)}1`]) {
      expect(
        strategyDefinitionSchema.safeParse({
          ...initialDefinition,
          parameters: [{ ...initialDefinition.parameters[0], value: invalid }],
        }).success,
      ).toBe(false);
    }
  });

  it('records explicit historical selection rather than silently pinning the current version', async () => {
    const first = await create();
    await strategies.update(
      fixture.owner.context,
      first.id,
      {
        definition: { ...first.currentVersion.definition, entryRules: 'New rule' },
        effectiveAt: revisedAt,
        expectedRevision: 1,
        changeReason: 'New setup',
      },
      randomUUID(),
    );
    const trade = await catalog.createTrade(
      fixture.owner.context,
      {
        title: 'Trade entered using v1',
        classification: 'active-trading',
        strategyVersionId: first.currentVersionId,
      },
      randomUUID(),
    );
    expect(trade.strategyVersionId).toBe(first.currentVersionId);
    expect((await strategies.get(fixture.owner.context, first.id)).currentVersion.version).toBe(2);
  });

  it('keeps unclassified legacy trades nullable and labels one-time retrospective links', async () => {
    const strategy = await create();
    const trade = await catalog.createTrade(
      fixture.owner.context,
      { title: 'Previously unclassified', classification: 'investing' },
      randomUUID(),
    );
    expect(trade).toMatchObject({
      strategyId: null,
      strategyVersionId: null,
      strategyLinkTiming: null,
    });
    const before = await financialSnapshot();
    const input = {
      tradeId: trade.id,
      versionId: strategy.currentVersionId,
      expectedTradeRevision: trade.revision,
      reason: 'Reviewed existing history',
    };
    const commandId = randomUUID();
    const linked = await strategies.linkTrade(fixture.owner.context, strategy.id, input, commandId);
    expect(linked).toMatchObject({
      strategyId: strategy.id,
      strategyVersionId: strategy.currentVersionId,
      strategyLinkTiming: 'retrospective',
      revision: 2,
    });
    expect(
      await strategies.linkTrade(fixture.owner.context, strategy.id, input, commandId),
    ).toEqual(linked);
    await expect(
      strategies.linkTrade(
        fixture.owner.context,
        strategy.id,
        { ...input, expectedTradeRevision: linked.revision },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'TRADE_STRATEGY_ALREADY_PINNED' });
    expect(await financialSnapshot()).toEqual(before);
  });

  it('archives without removing rules or pins and rejects subsequent ordinary selection or editing', async () => {
    const strategy = await create();
    const trade = await catalog.createTrade(
      fixture.owner.context,
      {
        title: 'Retained campaign',
        classification: 'active-trading',
        strategyVersionId: strategy.currentVersionId,
      },
      randomUUID(),
    );
    const before = await financialSnapshot();
    const commandId = randomUUID();
    const input = { expectedRevision: strategy.revision, reason: 'Retire playbook after review' };
    const archived = await strategies.archive(fixture.owner.context, strategy.id, input, commandId);
    expect(archived.archiveReason).toBe(input.reason);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.currentVersion).toEqual(strategy.currentVersion);
    expect(await strategies.archive(fixture.owner.context, strategy.id, input, commandId)).toEqual(
      archived,
    );
    expect(
      await strategies.getVersion(fixture.owner.context, strategy.id, strategy.currentVersionId),
    ).toEqual(strategy.currentVersion);
    expect(
      (await strategies.list(fixture.owner.context)).strategies.some(
        (row) => row.id === strategy.id,
      ),
    ).toBe(false);
    expect(
      (await strategies.list(fixture.owner.context, { includeArchived: true })).strategies.some(
        (row) => row.id === strategy.id,
      ),
    ).toBe(true);
    expect(await catalog.getTrade(fixture.owner.context, trade.id)).toEqual(trade);
    await expect(
      catalog.createTrade(
        fixture.owner.context,
        {
          title: 'Cannot choose archived',
          classification: 'active-trading',
          strategyVersionId: strategy.currentVersionId,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STRATEGY_ARCHIVED' });
    await expect(
      strategies.update(
        fixture.owner.context,
        strategy.id,
        {
          definition: strategy.currentVersion.definition,
          effectiveAt: revisedAt,
          expectedRevision: archived.revision,
          changeReason: 'Cannot update archived',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STRATEGY_ARCHIVED' });
    expect(await financialSnapshot()).toEqual(before);
  });

  it('returns exact stored retry responses after later publications and rejects changed command contents', async () => {
    const id = randomUUID();
    const input = strategyCreateSchema.parse({ definition: definition(), effectiveAt });
    const first = await strategies.create(fixture.owner.context, input, id);
    await strategies.update(
      fixture.owner.context,
      first.id,
      {
        definition: { ...first.currentVersion.definition, notes: 'Later notes' },
        effectiveAt: revisedAt,
        expectedRevision: 1,
        changeReason: 'Review',
      },
      randomUUID(),
    );
    expect(await strategies.create(fixture.owner.context, input, id)).toEqual(first);
    await expect(
      strategies.create(
        fixture.owner.context,
        { ...input, definition: { ...input.definition, name: 'Conflicting contents' } },
        id,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('serializes concurrent publications: only one matching expected revision wins', async () => {
    const strategy = await create();
    const updates = await Promise.allSettled(
      ['Rule A', 'Rule B'].map((entryRules) =>
        strategies.update(
          fixture.owner.context,
          strategy.id,
          {
            definition: { ...strategy.currentVersion.definition, entryRules },
            effectiveAt: revisedAt,
            expectedRevision: 1,
            changeReason: entryRules,
          },
          randomUUID(),
        ),
      ),
    );
    expect(updates.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = updates.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      code: 'STALE_STRATEGY_REVISION',
    });
    expect((await strategies.versions(fixture.owner.context, strategy.id)).versions).toHaveLength(
      2,
    );
  });

  it('supports editor writes and viewer reads but enforces current membership inside transactions', async () => {
    const strategy = await strategies.create(
      fixture.editor.context,
      strategyCreateSchema.parse({ definition: definition(), effectiveAt }),
      randomUUID(),
    );
    expect((await strategies.get(fixture.viewer.context, strategy.id)).id).toBe(strategy.id);
    await expect(
      strategies.create(
        fixture.viewer.context,
        strategyCreateSchema.parse({ definition: definition(), effectiveAt }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await fixture.admin.pool.query(
      'UPDATE app.workspace_memberships SET role=$3 WHERE workspace_id=$1 AND user_id=$2',
      [fixture.owner.context.workspaceId, fixture.editor.person.user.id, 'viewer'],
    );
    try {
      await expect(
        strategies.update(
          fixture.editor.context,
          strategy.id,
          {
            definition: strategy.currentVersion.definition,
            effectiveAt: revisedAt,
            expectedRevision: 1,
            changeReason: 'Stale authorized context',
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await fixture.admin.pool.query(
        'UPDATE app.workspace_memberships SET role=$3 WHERE workspace_id=$1 AND user_id=$2',
        [fixture.owner.context.workspaceId, fixture.editor.person.user.id, 'editor'],
      );
    }
  });

  it('hides cross-workspace identities, versions and pins and preserves transaction rollback', async () => {
    const strategy = await create();
    const before = await financialSnapshot();
    await expect(strategies.get(fixture.outsider.context, strategy.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      strategies.getVersion(fixture.outsider.context, strategy.id, strategy.currentVersionId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      catalog.createTrade(
        fixture.outsider.context,
        {
          title: 'Foreign strategy rejected',
          classification: 'active-trading',
          strategyVersionId: strategy.currentVersionId,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const unseen = await fixture.services.withWorkspaceContext(fixture.outsider.context, (tx) =>
      tx.execute(
        sql`SELECT id FROM app.strategies WHERE workspace_id=${fixture.owner.context.workspaceId}`,
      ),
    );
    expect(unseen.rows).toHaveLength(0);
    expect(await financialSnapshot()).toEqual(before);
  });

  it('paginates current identities, complete version history and linked campaigns without duplicate cursor rows', async () => {
    const strategy = await create(`Unique pagination ${randomUUID()}`);
    for (let index = 1; index <= 3; index++)
      await strategies.update(
        fixture.owner.context,
        strategy.id,
        {
          definition: { ...strategy.currentVersion.definition, notes: `Revision ${index}` },
          effectiveAt: revisedAt,
          expectedRevision: index,
          changeReason: `Publication ${index}`,
        },
        randomUUID(),
      );
    const page1 = await strategies.versions(fixture.owner.context, strategy.id, { limit: 2 });
    const page2 = await strategies.versions(fixture.owner.context, strategy.id, {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect([...page1.versions, ...page2.versions].map((version) => version.version)).toEqual([
      4, 3, 2, 1,
    ]);
    expect(page2.nextCursor).toBeNull();
    const one = await strategies.list(fixture.owner.context, {
      search: strategy.currentVersion.definition.name,
      status: 'active',
      limit: 1,
    });
    expect(one.strategies.map((row) => row.id)).toEqual([strategy.id]);
    const tradeIds = [];
    for (let index = 0; index < 3; index++)
      tradeIds.push(
        (
          await catalog.createTrade(
            fixture.owner.context,
            {
              title: `Linked ${index}`,
              classification: 'active-trading',
              strategyVersionId: strategy.currentVersionId,
            },
            randomUUID(),
          )
        ).id,
      );
    const first = await strategies.linkedTrades(fixture.owner.context, strategy.id, { limit: 2 });
    const second = await strategies.linkedTrades(fixture.owner.context, strategy.id, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect([...first.trades, ...second.trades].map((trade) => trade.id).sort()).toEqual(
      tradeIds.sort(),
    );
    expect(second.nextCursor).toBeNull();
    const foreignStrategy = await create();
    await expect(
      strategies.versions(fixture.owner.context, strategy.id, {
        cursor: foreignStrategy.currentVersionId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('validates eligible instrument references by workspace and rejects newly selecting archived instruments', async () => {
    const currency = await catalog.createCurrency(
      fixture.owner.context,
      {
        namespace: 'iso:4217',
        code: 'USD',
        kind: 'fiat',
        unitIdentity: 'iso:USD',
        name: 'US dollar',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt,
      },
      randomUUID(),
    );
    const instrument = await catalog.createInstrument(
      fixture.owner.context,
      {
        name: 'Eligible share',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `strategy-share:${randomUUID()}`,
        quantityUnit: 'share',
        quoteCurrencyId: currency.id,
        settlementCurrencyId: currency.id,
        multiplier: '1',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'native-linear',
        effectiveAt,
        metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
      },
      randomUUID(),
    );
    const input = strategyCreateSchema.parse({
      definition: { ...definition(), eligibleInstruments: [instrument.id] },
      effectiveAt,
    });
    const strategy = await strategies.create(fixture.owner.context, input, randomUUID());
    await expect(
      strategies.create(fixture.outsider.context, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await catalog.archiveCatalog(
      fixture.owner.context,
      'instrument',
      instrument.id,
      { expectedRevision: instrument.revision, reason: 'Retire instrument reference' },
      randomUUID(),
    );
    expect(
      (await strategies.getVersion(fixture.owner.context, strategy.id, strategy.currentVersionId))
        .definition.eligibleInstruments,
    ).toEqual([instrument.id]);
    await expect(
      strategies.create(fixture.owner.context, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'INSTRUMENT_ARCHIVED' });
  });

  it('requires owned ready attachments and keeps old attachment references when a new version omits them', async () => {
    const attachmentId = randomUUID();
    await fixture.admin.pool.query(
      `INSERT INTO app.strategy_attachments(workspace_id,id,command_id,payload_sha256,name,media_type,size,sha256,storage_key,state,actor_id)
       VALUES ($1,$2::uuid,$3,$4,'fixture.png','image/png',8,$4,($2::uuid)::text,'pending',$5)`,
      [
        fixture.owner.context.workspaceId,
        attachmentId,
        randomUUID(),
        'a'.repeat(64),
        fixture.owner.context.actorId,
      ],
    );
    const input = strategyCreateSchema.parse({
      definition: { ...definition(), attachmentIds: [attachmentId] },
      effectiveAt,
    });
    await expect(
      strategies.create(fixture.owner.context, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_READY' });
    await fixture.admin.pool.query(
      "UPDATE app.strategy_attachments SET state='ready',ready_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",
      [fixture.owner.context.workspaceId, attachmentId],
    );
    await expect(
      strategies.create(fixture.outsider.context, input, randomUUID()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const first = await strategies.create(fixture.owner.context, input, randomUUID());
    const next = await strategies.update(
      fixture.owner.context,
      first.id,
      {
        definition: {
          ...first.currentVersion.definition,
          attachmentIds: [],
          notes: 'Attachment removed from later playbook',
        },
        effectiveAt: revisedAt,
        expectedRevision: 1,
        changeReason: 'Review documents',
      },
      randomUUID(),
    );
    expect(next.currentVersion.definition.attachmentIds).toEqual([]);
    expect(
      (await strategies.getVersion(fixture.owner.context, first.id, first.currentVersionId))
        .definition.attachmentIds,
    ).toEqual([attachmentId]);
    const links = await fixture.admin.pool.query(
      'SELECT strategy_version_id FROM app.strategy_version_attachments WHERE workspace_id=$1 AND attachment_id=$2',
      [fixture.owner.context.workspaceId, attachmentId],
    );
    expect(links.rows.map((row) => row.strategy_version_id)).toEqual([first.currentVersionId]);
  });
});
