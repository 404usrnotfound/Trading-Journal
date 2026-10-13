import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createAccountingFixture, accountingTestOrigin as origin } from './accounting-fixture.js';
import {
  createDashboardServices,
  createDashboardApi,
  createCatalogServices,
  createFinancialLedger,
  createJournalServices,
  createAccountingServices,
  createStrategyServices,
  toProblemResponse,
} from '@journal/server';
import {
  dashboardResponseSchema,
  strategyDefinitionSchema,
  journalDocumentSchema,
  type DashboardFilters,
} from '@journal/contracts';

describe('coherent dashboard with persisted independent account/trade economics', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let dashboard: ReturnType<typeof createDashboardServices>;
  let api: ReturnType<typeof createDashboardApi>;
  let eur: string,
    accountA: string,
    accountB: string,
    brokerA: string,
    portfolioVersionId: string,
    strategyId: string,
    strategyVersionId: string,
    assetId: string,
    tradeId: string;
  const effectiveAt = '2025-01-01T00:00:00Z';
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    dashboard = createDashboardServices(fixture.services);
    api = createDashboardApi(fixture.services);
    const context = fixture.owner.context,
      catalog = createCatalogServices(fixture.services),
      ledger = createFinancialLedger(fixture.services),
      journal = createJournalServices(fixture.services),
      accounting = createAccountingServices(fixture.services),
      strategies = createStrategyServices(fixture.services);
    eur = (
      await catalog.createCurrency(
        context,
        {
          namespace: 'iso',
          code: 'EUR',
          kind: 'fiat',
          unitIdentity: 'iso:EUR',
          name: 'Euro',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt,
        },
        randomUUID(),
      )
    ).id;
    const scopes = [];
    for (const [name, amount] of [
      ['Alpha', '1000'],
      ['Beta', '2000'],
    ] as const) {
      const broker = await catalog.createBroker(
        context,
        { name: `${name} broker`, sourceNamespace: name.toLowerCase() },
        randomUUID(),
      );
      const account = await catalog.createAccount(
        context,
        {
          name: `${name} account`,
          brokerId: broker.id,
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: eur,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      );
      const bucket = await ledger.createCashBucket(context, {
        commandId: randomUUID(),
        accountId: account.id,
        currencyId: eur,
        kind: 'settled',
      });
      await ledger.recordCashMovement(context, {
        commandId: randomUUID(),
        accountId: account.id,
        currencyId: eur,
        cashBucketId: bucket.id,
        amount,
        kind: 'deposit',
        economicAt: '2029-12-31T12:00:00Z',
        orderingKey: '1',
      });
      scopes.push({ account: account.id, broker: broker.id, bucket: bucket.id });
    }
    accountA = scopes[0]!.account;
    accountB = scopes[1]!.account;
    brokerA = scopes[0]!.broker;
    portfolioVersionId = (
      await accounting.createPortfolio(context, {
        commandId: randomUUID(),
        name: 'Alpha portfolio',
        description: 'Exact immutable scope',
        environment: 'live',
        accountIds: [accountA],
      })
    ).versionId;
    const strategy = await strategies.create(
      context,
      {
        definition: strategyDefinitionSchema.parse({ name: 'Original playbook', status: 'active' }),
        effectiveAt,
        changeReason: 'Publish original strategy',
      },
      randomUUID(),
    );
    strategyId = strategy.id;
    strategyVersionId = strategy.currentVersionId;
    const instrument = await catalog.createInstrument(
      context,
      {
        name: 'Dashboard equity',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: 'dashboard-test-equity',
        quantityUnit: 'share',
        quoteCurrencyId: eur,
        settlementCurrencyId: eur,
        multiplier: '1',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'native-linear',
        metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        effectiveAt,
      },
      randomUUID(),
    );
    assetId = instrument.id;
    const created = await journal.create(
      context,
      {
        title: 'Known dashboard winner',
        classification: 'active-trading',
        strategyVersionId,
        legs: [
          {
            accountId: accountA,
            instrumentVersionId: instrument.versionId,
            direction: 'long',
            label: 'Main',
          },
        ],
      },
      randomUUID(),
    );
    tradeId = created.trade.id;
    const saved = await journal.save(
      context,
      tradeId,
      {
        expectedRevision: created.journal.revision,
        document: journalDocumentSchema.parse({
          plan: {
            strategyVersionId,
            initialRisk: { amount: '10', currencyId: eur, method: 'Pre-trade' },
            timeframe: '1h',
          },
          review: { customTags: ['reviewed', 'overlap'] },
        }),
      },
      randomUUID(),
    );
    await journal.publishPlan(
      context,
      tradeId,
      {
        expectedRevision: saved.revision,
        expectedTradeRevision: created.trade.revision,
        reason: 'Commit before actual entry',
      },
      randomUUID(),
    );
    for (const [side, price, economicAt] of [
      ['buy', '100', '2030-01-02T12:00:00Z'],
      ['sell', '120', '2030-01-03T12:00:00Z'],
    ] as const) {
      const fill = await ledger.recordExecution(context, {
        commandId: randomUUID(),
        accountId: accountA,
        instrumentVersionId: instrument.versionId,
        side,
        quantity: '1',
        price,
        cashBucketId: scopes[0]!.bucket,
        costsComplete: true,
        economicAt,
        orderingKey: '1',
        fees: [
          { cashBucketId: scopes[0]!.bucket, currencyId: eur, amount: '1', kind: 'commission' },
        ],
      });
      await ledger.allocateExecution(context, {
        commandId: randomUUID(),
        executionId: fill.id,
        expectedVersion: 1,
        reason: 'Exact full campaign attribution',
        allocations: [{ tradeLegId: created.financial.legs[0]!.legId, quantity: '1' }],
      });
    }
    const trade = await catalog.getTrade(context, tradeId);
    await catalog.confirmTradeClosure(
      context,
      tradeId,
      {
        expectedRevision: trade.revision,
        reason: 'Actual flat quantity',
        obligationEvidence: 'Settled principal and commissions',
      },
      randomUUID(),
    );
    await ledger.recordCashMovement(context, {
      commandId: randomUUID(),
      accountId: accountA,
      currencyId: eur,
      cashBucketId: scopes[0]!.bucket,
      amount: '500',
      kind: 'deposit',
      economicAt: '2030-01-04T00:00:00Z',
      orderingKey: '1',
    });
    await accounting.recordIncome(context, {
      commandId: randomUUID(),
      accountId: accountB,
      currencyId: eur,
      cashBucketId: scopes[1]!.bucket,
      kind: 'interest',
      amount: '20',
      economicAt: '2030-01-04T00:00:00Z',
      orderingKey: '1',
    });
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });
  const query = () => ({
    reportingCurrencyId: eur,
    from: '2030-01-01T00:00:00Z',
    to: '2030-01-05T00:00:00Z',
    environment: 'live' as const,
    filters: {
      accountIds: [],
      brokerIds: [],
      strategyIds: [],
      strategyVersionIds: [],
      assetIds: [],
      assetClasses: [],
      tags: [],
    } as DashboardFilters,
    samples: 2,
    timezone: 'Europe/Madrid',
    fxPolicy: { id: 'dashboard-test/1', maxAgeMilliseconds: 0, sourcePriority: ['manual'] },
    priceMaxAgeMilliseconds: 0,
    priceSourcePriority: ['manual'],
  });
  async function report(
    filters: Partial<ReturnType<typeof query>['filters']> & { portfolioVersionId?: string } = {},
  ) {
    return dashboardResponseSchema.parse(
      await dashboard.report(fixture.viewer.context, {
        ...query(),
        filters: { ...query().filters, ...filters },
      }),
    );
  }
  it('separates equity and capital-adjusted account performance from closed trade P&L', async () => {
    const result = await report();
    expect(result.analytics?.completedOnly.metrics.netPnl.value).toBe('18');
    expect(result.analytics?.summary.metrics.averageR.value).toBe('1.8');
    expect(result.accountView.points[0]?.equity.value).toBe('3000');
    expect(result.accountView.points.at(-1)?.equity.value).toBe('3538');
    expect(result.accountView.points.at(-1)?.performance.value).toBe('38');
    expect(result.accountView.allocation.find((row) => row.id === accountA)?.equity.value).toBe(
      '1518',
    );
    expect(result.accountView.allocation.find((row) => row.id === accountB)?.equity.value).toBe(
      '2020',
    );
    expect(result.accountView.allocation.find((row) => row.id === 'transit')?.equity.value).toBe(
      '0',
    );
  });
  it('uses exact immutable portfolio membership intersected with account and broker selections', async () => {
    const result = await report({
      portfolioVersionId,
      accountIds: [accountA],
      brokerIds: [brokerA],
    });
    expect(result.analytics?.context.accountIds).toEqual([accountA]);
    expect(result.accountView.points.at(-1)?.equity.value).toBe('1518');
    expect(result.accountView.points.at(-1)?.performance.value).toBe('18');
    expect((await report({ portfolioVersionId, accountIds: [accountB] })).analytics).toBeNull();
  });
  it.each(['strategyIds', 'strategyVersionIds', 'assetIds', 'assetClasses', 'tags'] as const)(
    'propagates %s across all trade views and withholds unassignable equity',
    async (key) => {
      const selection = {
        strategyIds: strategyId,
        strategyVersionIds: strategyVersionId,
        assetIds: assetId,
        assetClasses: 'stock',
        tags: 'reviewed',
      }[key];
      const result = await report({ [key]: [selection] });
      expect(result.analytics?.records.map((row) => row.id)).toEqual([tradeId]);
      expect(result.views.calendar[0]?.value).toBe('18');
      expect(result.views.periods[0]?.value).toBe('18');
      expect(result.views.pnlDistribution.bins[0]?.count).toBe(1);
      expect(result.accountView).toMatchObject({
        state: 'unavailable',
        points: [],
        allocation: [],
      });
    },
  );
  it('reports empty results and never substitutes excluded groups with unfiltered totals', async () => {
    const result = await report({ tags: ['no-match'] });
    expect(result.analytics?.records).toEqual([]);
    expect(result.analytics?.summary.metrics.netPnl.value).toBe('0');
    expect(result.views.calendar).toEqual([]);
    expect(result.accountView.points).toEqual([]);
  });
  it('retains unavailable pre-configuration samples instead of aborting or inventing historical prices', async () => {
    const result = await dashboard.report(fixture.viewer.context, {
      ...query(),
      from: '2024-12-20T00:00:00Z',
      to: '2025-01-05T00:00:00Z',
      samples: 5,
    });
    expect(
      result.accountView.points.some((point) =>
        point.equity.reasons.includes('account_configuration_not_available_at_sample'),
      ),
    ).toBe(true);
    for (const point of result.accountView.points.filter(
      (point) => point.equity.state === 'unavailable',
    ))
      expect(point.equity.value).toBeNull();
  });
  it('deduplicates microsecond sample boundaries and preserves exact generation/currency across engines', async () => {
    const result = await dashboard.report(fixture.viewer.context, {
      ...query(),
      from: '2030-01-04T12:00:00.000001Z',
      to: '2030-01-04T12:00:00.000002Z',
      samples: 13,
    });
    expect(result.accountView.points.map((point) => point.at)).toEqual([
      '2030-01-04T12:00:00.000001Z',
      '2030-01-04T12:00:00.000002Z',
    ]);
    expect(result.accountView.points.every((point) => point.equity.currencyId === eur)).toBe(true);
  });
  it('exposes complete catalog identities and historical versions without leaking another tenant', async () => {
    const result = await dashboard.catalog(fixture.viewer.context);
    expect(result.accounts.map((row) => row.id)).toContain(accountA);
    expect(result.portfolios[0]?.id).toBe(portfolioVersionId);
    expect(result.strategyVersions[0]?.id).toBe(strategyVersionId);
    expect(result.tags).toContain('reviewed');
    expect((await dashboard.catalog(fixture.outsider.context)).accounts).toEqual([]);
  });
  async function request(
    body: unknown = query(),
    cookie = fixture.viewer.cookie,
    path = 'reports',
    method = 'POST',
  ) {
    try {
      return await api(
        new Request(
          `${origin}/api/v1/workspaces/${fixture.owner.context.workspaceId}/dashboard/${path}`,
          {
            method,
            headers: { cookie, 'content-type': 'application/json' },
            ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
          },
        ),
        fixture.owner.context.workspaceId,
        [path],
      );
    } catch (error) {
      return toProblemResponse(error, 'dashboard-test');
    }
  }
  it('permits viewer queries without mutation CSRF and writes no financial/audit/outbox facts', async () => {
    const counts = async () =>
      (
        await fixture.admin.pool.query(
          'SELECT (SELECT count(*) FROM app.financial_commands WHERE workspace_id=$1) AS commands,(SELECT count(*) FROM app.audit_events WHERE workspace_id=$1) AS audits,(SELECT count(*) FROM app.outbox_events WHERE workspace_id=$1) AS outbox',
          [fixture.owner.context.workspaceId],
        )
      ).rows;
    const before = await counts();
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await counts()).toEqual(before);
  });
  it('enforces authentication, tenant scopes, strict query bounds and safe responses', async () => {
    expect((await request(query(), '')).status).toBe(401);
    expect((await request(query(), fixture.outsider.cookie)).status).toBe(404);
    expect(
      (await request({ ...query(), filters: { ...query().filters, accountIds: [randomUUID()] } }))
        .status,
    ).toBe(404);
    expect((await request({ ...query(), samples: 14 })).status).toBe(400);
    expect((await request({ ...query(), from: query().to })).status).toBe(400);
    expect((await request({ ...query(), sourceRevision: '2147483647' })).status).toBe(422);
  });
  it('applies account scope before the synchronous account bound, so narrowing an oversized workspace works', async () => {
    await fixture.admin.pool.query(
      "INSERT INTO app.accounts(workspace_id,actor_id,name,environment,account_type) SELECT workspace_id,actor_id,'Additional account ' || n,environment,account_type FROM app.accounts CROSS JOIN generate_series(1,100) AS n WHERE workspace_id=$1 AND id=$2",
      [fixture.owner.context.workspaceId, accountA],
    );
    expect((await request(query())).status).toBe(409);
    const narrowed = await request({
      ...query(),
      filters: { ...query().filters, accountIds: [accountA] },
    });
    expect(narrowed.status).toBe(200);
    expect(
      dashboardResponseSchema.parse(await narrowed.json()).analytics?.completedOnly.metrics.netPnl
        .value,
    ).toBe('18');
  });
});
