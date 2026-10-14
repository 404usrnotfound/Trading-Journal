import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from '@journal/contracts';
import {
  executionAllocationResponseSchema,
  journalListQuerySchema,
  journalListResponseSchema,
} from '@journal/contracts';
import { sql } from '@journal/database';
import { createFinancialApi, toProblemResponse } from '@journal/server';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createJournalApi } from '../../packages/server/src/journal/api.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createJournalFinancialFixture } from './journal-financial-fixture.js';
import { strategyTestOrigin, type StrategyTestActor } from './strategy-fixture.js';

const initial = '2025-01-01T00:00:00.000001Z';
const past = '2025-06-01T12:00:00.000001Z';
const future = '2030-06-01T12:00:00.000001Z';
const pastWindow = {
  from: '2025-05-31T23:59:59.999999Z',
  to: '2025-06-01T23:59:59.999999Z',
};

describe('read-only review workflows on real PostgreSQL and restricted tenant sessions', () => {
  let fixture: Awaited<ReturnType<typeof createJournalFinancialFixture>>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let journals: ReturnType<typeof createJournalServices>;
  let financialApi: ReturnType<typeof createFinancialApi>;
  let journalApi: ReturnType<typeof createJournalApi>;
  let usd: string;
  let instrument: string;
  let sequence = 0;

  beforeAll(async () => {
    fixture = await createJournalFinancialFixture();
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    journals = createJournalServices(fixture.services);
    financialApi = createFinancialApi(fixture.services);
    journalApi = createJournalApi(fixture.services);
    usd = (
      await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso:4217',
          code: 'USD',
          kind: 'fiat',
          unitIdentity: 'iso:USD',
          name: 'US dollar',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        randomUUID(),
      )
    ).id;
    instrument = (
      await catalog.createInstrument(
        fixture.owner.context,
        {
          name: 'UX read workflow share',
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: `ux-read:${randomUUID()}`,
          quantityUnit: 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
          multiplier: '1',
          quantityIncrement: '0.0001',
          priceIncrement: '0.000001',
          capability: 'native-linear',
          effectiveAt: initial,
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        },
        randomUUID(),
      )
    ).versionId;
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function account() {
    const created = await catalog.createAccount(
      fixture.owner.context,
      {
        name: `UX account ${randomUUID()}`,
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt: initial,
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: created.id,
      currencyId: usd,
      kind: 'settled',
    });
    return { id: created.id, bucket: bucket.id };
  }

  const campaign = (title: string, accounts: { id: string }[]) =>
    journals.create(
      fixture.owner.context,
      {
        title,
        classification: 'active-trading',
        legs: accounts.map((scope) => ({
          accountId: scope.id,
          instrumentVersionId: instrument,
          direction: 'long' as const,
          label: 'Reviewed account leg',
        })),
      },
      randomUUID(),
    );

  const executionInput = (scope: { id: string; bucket: string }, economicAt: string) => ({
    accountId: scope.id,
    instrumentVersionId: instrument,
    side: 'buy' as const,
    quantity: '2',
    price: '10',
    cashBucketId: scope.bucket,
    economicAt,
    orderingKey: String(++sequence),
    costsComplete: true,
  });

  async function fill(scope: { id: string; bucket: string }, economicAt: string, legId?: string) {
    const created = await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      ...executionInput(scope, economicAt),
    });
    if (legId)
      await ledger.allocateExecution(fixture.owner.context, {
        commandId: randomUUID(),
        executionId: created.id,
        expectedVersion: 1,
        reason: 'Explicit review attribution',
        allocations: [{ tradeLegId: legId, quantity: '2' }],
      });
    return created;
  }

  const ids = (page: Awaited<ReturnType<typeof journals.list>>) =>
    page.trades.map((trade) => trade.id).sort();

  async function financialGet(
    executionId: string,
    actor: StrategyTestActor = fixture.owner,
    workspaceId = actor.context.workspaceId,
  ) {
    const request = new Request(
      `${strategyTestOrigin}/api/v1/workspaces/${workspaceId}/financial/executions/${executionId}/allocations`,
      { headers: { cookie: actor.cookie } },
    );
    try {
      return await financialApi(request, workspaceId, ['executions', executionId, 'allocations']);
    } catch (error) {
      return toProblemResponse(error, 'ux-read-fixture');
    }
  }

  async function journalGet(
    query: Record<string, string>,
    actor: StrategyTestActor = fixture.owner,
    workspaceId = actor.context.workspaceId,
  ) {
    const request = new Request(
      `${strategyTestOrigin}/api/v1/workspaces/${workspaceId}/journal?${new URLSearchParams(query)}`,
      { headers: { cookie: actor.cookie } },
    );
    try {
      return await journalApi(request, workspaceId, []);
    } catch (error) {
      return toProblemResponse(error, 'ux-read-fixture');
    }
  }

  async function sourceSnapshot() {
    return (
      await fixture.admin.pool.query(
        `SELECT
          (SELECT revision::text FROM app.financial_state WHERE workspace_id=$1) AS revision,
          (SELECT count(*)::text FROM app.financial_commands WHERE workspace_id=$1) AS commands,
          (SELECT count(*)::text FROM app.journal_commands WHERE workspace_id=$1) AS journal_commands,
          (SELECT count(*)::text FROM app.outbox_events WHERE workspace_id=$1) AS outbox,
          (SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id)::text,'')) FROM app.executions e WHERE workspace_id=$1) AS executions,
          (SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text,'')) FROM app.allocation_sets s WHERE workspace_id=$1) AS allocation_sets,
          (SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'')) FROM app.allocation_items i WHERE workspace_id=$1) AS allocation_items,
          (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'')) FROM app.postings p WHERE workspace_id=$1) AS postings,
          (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'')) FROM app.positions p WHERE workspace_id=$1) AS positions`,
        [fixture.owner.context.workspaceId],
      )
    ).rows[0];
  }

  it('uses actual activity instead of creation time once any effective assigned fill exists', async () => {
    const scope = await account();
    const prefix = `Activity clock ${randomUUID()}`;
    const oldActivity = await campaign(`${prefix} past`, [scope]);
    const futureActivity = await campaign(`${prefix} future`, [scope]);
    const unfilled = await campaign(`${prefix} unfilled`, [scope]);
    const activeToday = await campaign(`${prefix} active today`, [scope]);
    await fill(scope, past, oldActivity.financial.legs[0]!.legId);
    await fill(scope, future, futureActivity.financial.legs[0]!.legId);
    await fill(scope, new Date().toISOString(), activeToday.financial.legs[0]!.legId);
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const from = new Date(day.getTime() - 1).toISOString().replace('.999Z', '.999999Z');
    const to = new Date(day.getTime() + 86_400_000 - 1).toISOString().replace('.999Z', '.999999Z');
    expect(ids(await journals.list(fixture.owner.context, { search: prefix, from, to }))).toEqual(
      [unfilled.trade.id, activeToday.trade.id].sort(),
    );
    expect(
      ids(await journals.list(fixture.owner.context, { search: prefix, ...pastWindow })),
    ).toEqual([oldActivity.trade.id]);
    expect(ids(await journals.list(fixture.owner.context, { search: prefix }))).toEqual(
      [
        oldActivity.trade.id,
        futureActivity.trade.id,
        unfilled.trade.id,
        activeToday.trade.id,
      ].sort(),
    );
  });

  it('honors a lower-exclusive, upper-inclusive activity interval at microsecond precision', async () => {
    const scope = await account();
    const prefix = `Exact activity ${randomUUID()}`;
    const times = [
      '2025-06-01T12:00:00.000000Z',
      '2025-06-01T12:00:00.000001Z',
      '2025-06-01T12:00:00.000002Z',
      '2025-06-01T12:00:00.000003Z',
    ];
    const trades = [];
    for (const time of times) {
      const trade = await campaign(`${prefix} ${time}`, [scope]);
      trades.push(trade.trade.id);
      await fill(scope, time, trade.financial.legs[0]!.legId);
    }
    const response = await journalGet({
      search: prefix,
      from: '2025-06-01T14:00:00.000000+02:00',
      to: '2025-06-01T12:00:00.000002Z',
    });
    expect(response.status).toBe(200);
    expect(ids(journalListResponseSchema.parse(await response.json()))).toEqual(
      [trades[1]!, trades[2]!].sort(),
    );
  });

  it('uses the latest allocation set when attribution moves or becomes unassigned', async () => {
    const scope = await account();
    const prefix = `Moved activity ${randomUUID()}`;
    const first = await campaign(`${prefix} first`, [scope]);
    const second = await campaign(`${prefix} second`, [scope]);
    const source = await fill(scope, past, first.financial.legs[0]!.legId);
    const query = { search: prefix, ...pastWindow };
    expect(ids(await journals.list(fixture.owner.context, query))).toEqual([first.trade.id]);
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: source.id,
      expectedVersion: 2,
      reason: 'Move to the reviewed campaign',
      allocations: [{ tradeLegId: second.financial.legs[0]!.legId, quantity: '2' }],
    });
    expect(ids(await journals.list(fixture.owner.context, query))).toEqual([second.trade.id]);
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: source.id,
      expectedVersion: 3,
      reason: 'Leave this fill unassigned for review',
      allocations: [],
    });
    expect(ids(await journals.list(fixture.owner.context, query))).toEqual([]);
  });

  it('excludes superseded fills and follows replacement dates and effective attribution', async () => {
    const scope = await account();
    const prefix = `Corrected activity ${randomUUID()}`;
    const trade = await campaign(prefix, [scope]);
    const source = await fill(scope, past, trade.financial.legs[0]!.legId);
    expect(
      ids(await journals.list(fixture.owner.context, { search: prefix, ...pastWindow })),
    ).toEqual([trade.trade.id]);
    const replacement = await ledger.correctExecution(fixture.owner.context, {
      commandId: randomUUID(),
      originalExecutionId: source.id,
      reason: 'Broker-confirmed economic timestamp correction',
      replacement: executionInput(scope, future),
    });
    expect(
      ids(await journals.list(fixture.owner.context, { search: prefix, ...pastWindow })),
    ).toEqual([]);
    expect(
      ids(
        await journals.list(fixture.owner.context, {
          search: prefix,
          from: '2030-05-31T23:59:59.999999Z',
          to: '2030-06-01T23:59:59.999999Z',
        }),
      ),
    ).toEqual([trade.trade.id]);
    const originalResponse = await financialGet(source.id, fixture.viewer);
    expect(originalResponse.status).toBe(409);
    expect(await originalResponse.json()).toMatchObject({ code: 'SOURCE_NOT_EFFECTIVE' });
    const replacementResponse = await financialGet(replacement.id, fixture.viewer);
    expect(replacementResponse.status).toBe(200);
    expect(executionAllocationResponseSchema.parse(await replacementResponse.json())).toMatchObject(
      {
        executionId: replacement.id,
        version: 2,
        allocations: expect.arrayContaining([
          { tradeLegId: trade.financial.legs[0]!.legId, quantity: '2' },
          { tradeLegId: null, quantity: '0' },
        ]),
      },
    );
  });

  it('filters account membership consistently for single-account and multi-account campaigns', async () => {
    const first = await account();
    const second = await account();
    const prefix = `Account membership ${randomUUID()}`;
    const firstTrade = await campaign(`${prefix} first`, [first]);
    const secondTrade = await campaign(`${prefix} second`, [second]);
    const spanning = await campaign(`${prefix} both`, [first, second]);
    await fill(first, past, firstTrade.financial.legs[0]!.legId);
    await fill(second, past, secondTrade.financial.legs[0]!.legId);
    await fill(
      second,
      past,
      spanning.financial.legs.find((leg) => leg.accountId === second.id)!.legId,
    );
    expect(
      ids(
        await journals.list(fixture.owner.context, {
          search: prefix,
          accountId: first.id,
          ...pastWindow,
        }),
      ),
    ).toEqual([firstTrade.trade.id, spanning.trade.id].sort());
    expect(
      ids(
        await journals.list(fixture.owner.context, {
          search: prefix,
          accountId: second.id,
          ...pastWindow,
        }),
      ),
    ).toEqual([secondTrade.trade.id, spanning.trade.id].sort());
    expect(
      ids(await journals.list(fixture.owner.context, { search: prefix, accountId: randomUUID() })),
    ).toEqual([]);
  });

  it('applies activity filters before pagination so every qualifying trade is reachable', async () => {
    const scope = await account();
    const prefix = `Filtered pages ${randomUUID()}`;
    const expected = [];
    for (let index = 0; index < 6; index++) {
      const trade = await campaign(`${prefix} ${index}`, [scope]);
      const matches = index % 2 === 0;
      await fill(scope, matches ? past : future, trade.financial.legs[0]!.legId);
      if (matches) expected.push(trade.trade.id);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
      const page = await journals.list(fixture.owner.context, {
        search: prefix,
        limit: 1,
        ...pastWindow,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.trades).toHaveLength(1);
      seen.push(page.trades[0]!.id);
      if (!page.nextCursor) break;
      expect(page.nextCursor).toBe(page.trades[0]!.id);
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(expected.sort());
    expect(new Set(seen).size).toBe(3);
  });

  it('exposes latest assigned and unassigned quantities to viewers without changing financial facts', async () => {
    const scope = await account();
    const prefix = `Read-only attribution ${randomUUID()}`;
    const first = await campaign(`${prefix} first`, [scope]);
    const second = await campaign(`${prefix} second`, [scope]);
    const source = await fill(scope, past);
    const initialResponse = await financialGet(source.id, fixture.viewer);
    expect(initialResponse.status).toBe(200);
    expect(initialResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(executionAllocationResponseSchema.parse(await initialResponse.json())).toEqual({
      executionId: source.id,
      version: 1,
      allocations: [{ tradeLegId: null, quantity: '2' }],
    });
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: source.id,
      expectedVersion: 1,
      reason: 'Partially attribute reviewed source',
      allocations: [{ tradeLegId: first.financial.legs[0]!.legId, quantity: '1' }],
    });
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: source.id,
      expectedVersion: 2,
      reason: 'Replace attribution with corrected campaign selection',
      allocations: [{ tradeLegId: second.financial.legs[0]!.legId, quantity: '0.5' }],
    });
    const before = await sourceSnapshot();
    const response = await financialGet(source.id.toUpperCase(), fixture.viewer);
    expect(response.status).toBe(200);
    const allocation = executionAllocationResponseSchema.parse(await response.json());
    expect(allocation.executionId).toBe(source.id);
    expect(allocation.version).toBe(3);
    expect(allocation.allocations).toHaveLength(2);
    expect(allocation.allocations).toEqual(
      expect.arrayContaining([
        { tradeLegId: second.financial.legs[0]!.legId, quantity: '0.5' },
        { tradeLegId: null, quantity: '1.5' },
      ]),
    );
    const pageResponse = await journalGet(
      { search: prefix, accountId: scope.id, ...pastWindow },
      fixture.viewer,
    );
    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(ids(journalListResponseSchema.parse(await pageResponse.json()))).toEqual([
      second.trade.id,
    ]);
    await journals.get(fixture.viewer.context, second.trade.id);
    expect(await sourceSnapshot()).toEqual(before);
  });

  it('pins one allocation snapshot while a concurrent attribution revision is committed', async () => {
    const scope = await account();
    const prefix = `Pinned attribution ${randomUUID()}`;
    const first = await campaign(`${prefix} first`, [scope]);
    const second = await campaign(`${prefix} second`, [scope]);
    const source = await fill(scope, past, first.financial.legs[0]!.legId);
    const pinnedLedger = createFinancialLedger({
      withWorkspaceContext(context, operation, options) {
        return fixture.services.withWorkspaceContext(
          context,
          async (tx) => {
            // Acquire a real PostgreSQL snapshot before the separate writer commits.
            await tx.execute(sql`SELECT revision FROM app.financial_state
              WHERE workspace_id=${context.workspaceId}::uuid`);
            await ledger.allocateExecution(fixture.owner.context, {
              commandId: randomUUID(),
              executionId: source.id,
              expectedVersion: 2,
              reason: 'Concurrent reviewed attribution',
              allocations: [{ tradeLegId: second.financial.legs[0]!.legId, quantity: '2' }],
            });
            return operation(tx);
          },
          options,
        );
      },
    });
    const pinned = await pinnedLedger.executionAllocations(fixture.viewer.context, source.id);
    expect(pinned.version).toBe(2);
    expect(pinned.allocations).toEqual(
      expect.arrayContaining([
        { tradeLegId: first.financial.legs[0]!.legId, quantity: '2' },
        { tradeLegId: null, quantity: '0' },
      ]),
    );
    const current = await ledger.executionAllocations(fixture.viewer.context, source.id);
    expect(current.version).toBe(3);
    expect(current.allocations).toEqual(
      expect.arrayContaining([
        { tradeLegId: second.financial.legs[0]!.legId, quantity: '2' },
        { tradeLegId: null, quantity: '0' },
      ]),
    );
  });

  it('keeps read access tenant-scoped and returns safe validation feedback for invalid filters', async () => {
    const scope = await account();
    const prefix = `Tenant review ${randomUUID()}`;
    const trade = await campaign(prefix, [scope]);
    const source = await fill(scope, past, trade.financial.legs[0]!.legId);
    expect(ids(await journals.list(fixture.outsider.context, { search: prefix }))).toEqual([]);
    expect((await financialGet(source.id, fixture.outsider)).status).toBe(404);
    expect(
      (await financialGet(source.id, fixture.outsider, fixture.owner.context.workspaceId)).status,
    ).toBe(404);
    expect(
      (await journalGet({ search: prefix }, fixture.outsider, fixture.owner.context.workspaceId))
        .status,
    ).toBe(404);
    expect((await financialGet('invalid', fixture.viewer)).status).toBe(400);
    for (const query of [
      { from: past },
      { from: past, to: past },
      { from: future, to: past },
      { from: 'invalid', to: future },
      { from: '0000-01-01T00:00:00Z', to: future },
    ]) {
      const response = await journalGet(query, fixture.viewer);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
      expect(() => journals.list(fixture.viewer.context, query)).toThrowError(ZodError);
    }
    expect(journalListQuerySchema.safeParse({ from: past, to: future }).success).toBe(true);
  });
});
