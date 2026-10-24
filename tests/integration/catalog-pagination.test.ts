import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccountingFixture } from './accounting-fixture.js';
import {
  createCatalogServices,
  createDashboardServices,
  createFinancialApi,
  createFinancialLedger,
  createStrategyServices,
} from '@journal/server';
import { strategyDefinitionSchema, financialCatalogQuerySchema } from '@journal/contracts';

const at = '2025-01-01T00:00:00Z';
describe('bounded catalog pages and historical references on restricted PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let dashboard: ReturnType<typeof createDashboardServices>;
  let usd: string;
  const accountIds: string[] = [];
  const instrumentIds: string[] = [];
  let originalVersion: string;
  let latestVersion: string;
  let firstInstrument: string;
  let strategyId: string;
  let strategyVersionId: string;
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    catalog = createCatalogServices(fixture.services);
    dashboard = createDashboardServices(fixture.services);
    const context = fixture.owner.context;
    usd = (
      await catalog.createCurrency(
        context,
        {
          namespace: 'iso',
          code: 'USD',
          kind: 'fiat',
          unitIdentity: 'iso:USD',
          name: 'US dollar',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: at,
        },
        randomUUID(),
      )
    ).id;
    for (let index = 0; index < 201; index++)
      accountIds.push(
        (
          await catalog.createAccount(
            context,
            {
              name: `Account ${String(index).padStart(3, '0')}`,
              environment: 'live',
              accountType: 'cash',
              baseCurrencyId: usd,
              inventoryMethod: 'fifo',
              allowShort: false,
              holdingMode: 'netted',
              effectiveAt: at,
            },
            randomUUID(),
          )
        ).id,
      );
    for (let index = 0; index < 501; index++) {
      const item = await catalog.createInstrument(
        context,
        {
          name: `Instrument ${String(index).padStart(3, '0')}`,
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: `paged:${index}`,
          quantityUnit: 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
          multiplier: '1',
          quantityIncrement: '0.000001',
          priceIncrement: '0.01',
          capability: 'native-linear',
          effectiveAt: at,
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        },
        randomUUID(),
      );
      instrumentIds.push(item.id);
      if (index === 0) {
        originalVersion = item.versionId;
        firstInstrument = item.id;
      }
    }
    latestVersion = (
      await catalog.appendInstrumentVersion(
        context,
        firstInstrument,
        {
          expectedRevision: 1,
          reason: 'Finer compatible increment',
          effectiveAt: '2025-02-01T00:00:00Z',
          quantityUnit: 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
          multiplier: '1',
          quantityIncrement: '0.000001',
          priceIncrement: '0.001',
          capability: 'native-linear',
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        },
        randomUUID(),
      )
    ).versionId;
    const strategies = createStrategyServices(fixture.services);
    let strategy = await strategies.create(
      context,
      {
        definition: strategyDefinitionSchema.parse({ name: 'Paged strategy' }),
        effectiveAt: at,
        changeReason: 'Initial rules',
      },
      randomUUID(),
    );
    strategyId = strategy.id;
    for (let index = 1; index < 501; index++)
      strategy = await strategies.update(
        context,
        strategy.id,
        {
          expectedRevision: strategy.revision,
          definition: strategy.currentVersion.definition,
          effectiveAt: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
          changeReason: `Rules revision ${index + 1}`,
        },
        randomUUID(),
      );
    strategyVersionId = strategy.currentVersion.id;
    const ledger = createFinancialLedger(fixture.services);
    const bucket = await ledger.createCashBucket(context, {
      commandId: randomUUID(),
      accountId: accountIds[0]!,
      currencyId: usd,
      kind: 'settled',
    });
    await ledger.recordCashMovement(context, {
      commandId: randomUUID(),
      accountId: accountIds[0]!,
      cashBucketId: bucket.id,
      currencyId: usd,
      amount: '100',
      kind: 'deposit',
      economicAt: '2025-02-01T00:00:00Z',
      orderingKey: '1',
    });
  }, 120_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('pages beyond 200 accounts and searches before applying the page limit', async () => {
    const context = fixture.viewer.context;
    const first = await catalog.listAccounts(context, { limit: 200 });
    const second = await catalog.listAccounts(context, { limit: 200, afterId: first.at(-1)!.id });
    expect(first).toHaveLength(200);
    expect(second.map((item) => item.id)).toEqual([accountIds[200]]);
    expect(new Set([...first, ...second].map((item) => item.id))).toEqual(new Set(accountIds));
    expect(
      (await catalog.listAccounts(context, { limit: 10, search: 'Account 200' })).map(
        (item) => item.id,
      ),
    ).toEqual([accountIds[200]]);
    expect(financialCatalogQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
  it('keeps Dashboard catalog and a tiny account report working beyond 501 instruments and strategy versions', async () => {
    const context = fixture.viewer.context;
    const first = await dashboard.catalog(context);
    expect(first.assets).toHaveLength(200);
    expect(first.strategyVersions).toHaveLength(200);
    expect(first.accountChoicesComplete).toBe(false);
    const second = await dashboard.catalog(context, {
      resource: 'assets',
      afterId: first.pageCursors!.assets!,
      limit: 200,
    });
    const third = await dashboard.catalog(context, {
      resource: 'assets',
      afterId: second.pageCursors!.assets!,
      limit: 200,
    });
    expect(second.assets).toHaveLength(200);
    expect(third.assets).toHaveLength(101);
    expect(third.pageCursors?.assets).toBeNull();
    expect(
      new Set([...first.assets, ...second.assets, ...third.assets].map((item) => item.id)),
    ).toEqual(new Set(instrumentIds));
    expect(
      (
        await dashboard.catalog(context, {
          resource: 'assets',
          search: 'Instrument 500',
          limit: 10,
        })
      ).assets[0]?.label,
    ).toBe('Instrument 500');
    const versions2 = await dashboard.catalog(context, {
      resource: 'strategyVersions',
      afterId: first.pageCursors!.strategyVersions!,
      limit: 200,
    });
    const versions3 = await dashboard.catalog(context, {
      resource: 'strategyVersions',
      afterId: versions2.pageCursors!.strategyVersions!,
      limit: 200,
    });
    expect(versions3.strategyVersions).toHaveLength(101);
    expect(
      [
        ...first.strategyVersions,
        ...versions2.strategyVersions,
        ...versions3.strategyVersions,
      ].every((item) => item.parentId === strategyId),
    ).toBe(true);
    const report = await dashboard.report(context, {
      reportingCurrencyId: usd,
      from: '2025-02-01T00:00:00Z',
      to: '2025-02-02T00:00:00Z',
      environment: 'live',
      timezone: 'UTC',
      samples: 2,
      filters: {
        accountIds: [accountIds[0]!],
        brokerIds: [],
        strategyIds: [],
        strategyVersionIds: [],
        assetIds: [],
        assetClasses: [],
        tags: [],
      },
      fxPolicy: {
        id: 'paged-catalog/1',
        maxAgeMilliseconds: 86_400_000,
        sourcePriority: ['manual'],
      },
      priceMaxAgeMilliseconds: 86_400_000,
      priceSourcePriority: ['manual'],
    });
    expect(report.accountView.state).toBe('available');
    expect(report.accountView.points.at(-1)?.equity.value).toBe('100');
  }, 60_000);
  it('filters unclassified campaigns before the first-page limit', async () => {
    for (let index = 0; index < 200; index++)
      await catalog.createTrade(
        fixture.owner.context,
        { title: `Assigned ${index}`, classification: 'active-trading', strategyVersionId },
        randomUUID(),
      );
    const late = await catalog.createTrade(
      fixture.owner.context,
      { title: 'Unclassified late trade', classification: 'active-trading' },
      randomUUID(),
    );
    const page = await catalog.listTrades(fixture.viewer.context, {
      limit: 200,
      unclassified: true,
    });
    expect(page.map((item) => item.id)).toEqual([late.id]);
    const api = createFinancialApi(fixture.services);
    const response = await api(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${fixture.owner.context.workspaceId}/financial/trades?limit=10&unclassified=true&search=Unclassified`,
        { headers: { cookie: fixture.viewer.cookie } },
      ),
      fixture.owner.context.workspaceId,
      ['trades'],
    );
    expect((await response.json()).map((item: { id: string }) => item.id)).toEqual([late.id]);
  }, 60_000);
  it('loads immutable historical instrument conventions and scoped campaign legs through read APIs', async () => {
    const old = await catalog.getInstrumentVersion(fixture.viewer.context, originalVersion);
    const latest = await catalog.getInstrument(fixture.viewer.context, firstInstrument);
    expect(old.versionId).toBe(originalVersion);
    expect(old.priceIncrement).toBe('0.01');
    expect(latest.versionId).toBe(latestVersion);
    expect(latest.priceIncrement).toBe('0.001');
    await expect(
      catalog.getInstrumentVersion(fixture.outsider.context, originalVersion),
    ).rejects.toMatchObject({ status: 404 });
    const trade = await catalog.createTrade(
      fixture.owner.context,
      { title: 'Historical pinned idea', classification: 'active-trading' },
      randomUUID(),
    );
    const leg = await catalog.addTradeLeg(
      fixture.owner.context,
      {
        tradeId: trade.id,
        expectedRevision: trade.revision,
        accountId: accountIds[0]!,
        instrumentVersionId: originalVersion,
        direction: 'long',
        label: 'Original convention',
      },
      randomUUID(),
    );
    const api = createFinancialApi(fixture.services);
    const read = (path: string) =>
      api(
        new Request(
          `http://localhost:3000/api/v1/workspaces/${fixture.owner.context.workspaceId}/financial/${path}`,
          { headers: { cookie: fixture.viewer.cookie } },
        ),
        fixture.owner.context.workspaceId,
        path.split('/'),
      );
    expect((await (await read(`instrument-versions/${originalVersion}`)).json()).versionId).toBe(
      originalVersion,
    );
    expect(await (await read(`trades/${trade.id}/legs`)).json()).toEqual([leg]);
    await expect(catalog.listTradeLegs(fixture.outsider.context, trade.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
