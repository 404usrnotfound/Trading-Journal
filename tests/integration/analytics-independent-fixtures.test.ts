import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  analyticsReportResponseSchema,
  journalDocumentSchema,
  strategyDefinitionSchema,
} from '@journal/contracts';
import { createAnalyticsServices } from '../../packages/server/src/analytics/service.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createStrategyServices } from '../../packages/server/src/strategies/service.js';
import { createAccountingFixture } from './accounting-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
const at = (day: number) => `2030-01-${String(day).padStart(2, '0')}T12:00:00.000001Z`;
const from = '2030-01-01T00:00:00.000000Z';
const to = '2030-01-20T12:00:00.000001Z';

describe('independently calculated persisted campaign analytics fixtures', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let journal: ReturnType<typeof createJournalServices>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let strategies: ReturnType<typeof createStrategyServices>;
  let analytics: ReturnType<typeof createAnalyticsServices>;
  let eur: string;
  const scopes: { id: string; bucket: string; brokerId: string }[] = [];
  const instruments: { id: string; versionId: string }[] = [];
  const campaignIds: string[] = [];
  const planIds: string[] = [];
  const versions: string[] = [];
  let strategyId: string;
  const setupId = randomUUID();

  beforeAll(async () => {
    fixture = await createAccountingFixture();
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    journal = createJournalServices(fixture.services);
    observations = createFinancialObservations(fixture.services);
    strategies = createStrategyServices(fixture.services);
    analytics = createAnalyticsServices(fixture.services);
    eur = (
      await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso:4217',
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
    for (const family of ['stock', 'etf'] as const) {
      const broker = await catalog.createBroker(
        fixture.owner.context,
        { name: `Independent ${family} broker`, sourceNamespace: `independent:${family}` },
        randomUUID(),
      );
      const account = await catalog.createAccount(
        fixture.owner.context,
        {
          name: `Independent ${family} account`,
          brokerId: broker.id,
          environment: 'live',
          accountType: 'margin',
          baseCurrencyId: eur,
          inventoryMethod: 'fifo',
          allowShort: true,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      );
      const bucket = await ledger.createCashBucket(fixture.owner.context, {
        commandId: randomUUID(),
        accountId: account.id,
        currencyId: eur,
        kind: 'settled',
      });
      scopes.push({ id: account.id, bucket: bucket.id, brokerId: broker.id });
      const instrument = await catalog.createInstrument(
        fixture.owner.context,
        {
          name: `Independent ${family} instrument`,
          family,
          subtype: family === 'stock' ? 'ordinary-share' : 'ordinary-etf',
          economicIdentity: `independent:${randomUUID()}`,
          quantityUnit: 'share',
          quoteCurrencyId: eur,
          settlementCurrencyId: eur,
          multiplier: '1',
          quantityIncrement: '0.0001',
          priceIncrement: '0.000001',
          capability: 'native-linear',
          effectiveAt,
          metadata: {
            priceConvention: 'unit-price',
            settlementStyle: 'delivered',
            shortConvention: 'borrowed-delivery',
            carryCostPolicy: 'explicit-source-charges',
          },
        },
        randomUUID(),
      );
      instruments.push({ id: instrument.id, versionId: instrument.versionId });
    }
    let strategy = await strategies.create(
      fixture.owner.context,
      {
        definition: strategyDefinitionSchema.parse({
          name: 'Independent RSI strategy',
          status: 'active',
          entryRules: 'RSI crosses 30',
          setups: [{ id: setupId, name: 'RSI reversal', conditions: 'Reviewed RSI signal' }],
        }),
        effectiveAt,
        changeReason: 'Publish original analytics fixture strategy',
      },
      randomUUID(),
    );
    strategyId = strategy.id;
    versions.push(strategy.currentVersionId);
    // These expected outcomes are computed independently from actual posted cash:
    // exits minus 100 entry, minus two EUR 5 commissions = [100,-50,0,150,-25].
    const exitPrices = ['210', '60', '110', '260', '85'];
    const risks = ['100', '50', '100', '50', '50'];
    for (let index = 0; index < exitPrices.length; index++) {
      if (index === 3) {
        strategy = await strategies.update(
          fixture.owner.context,
          strategy.id,
          {
            definition: { ...strategy.currentVersion.definition, entryRules: 'RSI crosses 35' },
            effectiveAt: at(8),
            expectedRevision: strategy.revision,
            changeReason: 'Revise threshold after the first three campaigns',
          },
          randomUUID(),
        );
        versions.push(strategy.currentVersionId);
      }
      const scope = scopes[index < 3 ? 0 : 1]!;
      const instrument = instruments[index < 3 ? 0 : 1]!;
      const created = await createCampaign(
        scope,
        instrument.versionId,
        risks[index]!,
        strategy.currentVersionId,
        index < 3 ? 'Trending' : 'Range',
        index < 3 ? '1h' : '1d',
        ['sample', index % 2 === 0 ? 'odd' : 'even'],
      );
      campaignIds.push(created.trade.id);
      planIds.push(created.originalPlan!.id);
      await fill(scope, instrument.versionId, created.financial.legs[0]!.legId, {
        side: 'buy',
        quantity: '1',
        price: '100',
        fee: '5',
        day: 2 + index * 2,
      });
      await fill(scope, instrument.versionId, created.financial.legs[0]!.legId, {
        side: 'sell',
        quantity: '1',
        price: exitPrices[index]!,
        fee: '5',
        day: 3 + index * 2,
      });
      await close(created.trade.id);
    }
    // A later edit must not become the version used by any of these historical trades.
    await strategies.update(
      fixture.owner.context,
      strategy.id,
      {
        definition: { ...strategy.currentVersion.definition, entryRules: 'RSI crosses 40' },
        effectiveAt: at(12),
        expectedRevision: strategy.revision,
        changeReason: 'Publish future rules after completed campaigns',
      },
      randomUUID(),
    );
    const firstJournal = await journal.get(fixture.owner.context, campaignIds[0]!);
    await journal.save(
      fixture.owner.context,
      firstJournal.trade.id,
      {
        expectedRevision: firstJournal.journal.revision,
        document: {
          ...firstJournal.journal.document,
          plan: {
            ...firstJournal.journal.document.plan,
            timeframe: '5m',
            marketConditions: 'A later draft describes a different regime',
            initialRisk: {
              amount: '1000',
              currencyId: eur,
              method: 'Later draft risk',
              methodNotes: '',
            },
          },
        },
      },
      randomUUID(),
    );
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function createCampaign(
    scope: { id: string },
    instrumentVersionId: string,
    risk: string,
    strategyVersionId?: string,
    marketConditions = '',
    timeframe = '',
    customTags: string[] = [],
  ) {
    const created = await journal.create(
      fixture.owner.context,
      {
        title: `Independent campaign ${randomUUID()}`,
        classification: 'active-trading',
        ...(strategyVersionId ? { strategyVersionId } : {}),
        legs: [{ accountId: scope.id, instrumentVersionId, direction: 'long', label: 'Main leg' }],
      },
      randomUUID(),
    );
    const saved = await journal.save(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: created.journal.revision,
        document: journalDocumentSchema.parse({
          plan: {
            strategyVersionId: strategyVersionId ?? null,
            setupId: strategyVersionId ? setupId : null,
            marketConditions,
            timeframe,
            initialRisk: { amount: risk, currencyId: eur, method: 'Original cash risk' },
          },
          review: { customTags },
        }),
      },
      randomUUID(),
    );
    await journal.publishPlan(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: saved.revision,
        expectedTradeRevision: created.trade.revision,
        reason: 'Commit the original risk before future economic entry',
      },
      randomUUID(),
    );
    return journal.get(fixture.owner.context, created.trade.id);
  }

  async function fill(
    scope: { id: string; bucket: string },
    instrumentVersionId: string,
    legId: string,
    input: { side: 'buy' | 'sell'; quantity: string; price: string; fee: string; day: number },
  ) {
    const execution = await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      instrumentVersionId,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      cashBucketId: scope.bucket,
      costsComplete: true,
      economicAt: at(input.day),
      orderingKey: '1',
      fees: [
        { cashBucketId: scope.bucket, currencyId: eur, amount: input.fee, kind: 'commission' },
      ],
    });
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: execution.id,
      expectedVersion: 1,
      reason: 'Attribute the complete persisted execution once',
      allocations: [{ tradeLegId: legId, quantity: input.quantity }],
    });
  }

  async function close(tradeId: string) {
    const trade = await catalog.getTrade(fixture.owner.context, tradeId);
    await catalog.confirmTradeClosure(
      fixture.owner.context,
      tradeId,
      {
        expectedRevision: trade.revision,
        reason: 'Actual execution evidence proves the campaign flat',
        obligationEvidence: 'Principal and commissions settled in the EUR bucket',
      },
      randomUUID(),
    );
  }

  async function report(accountIds = scopes.map((scope) => scope.id)) {
    return analyticsReportResponseSchema.parse(
      await analytics.report(fixture.viewer.context, {
        accountIds,
        reportingCurrencyId: eur,
        from,
        to,
        timezone: 'Europe/Madrid',
        fxPolicy: {
          id: 'independent-test/1',
          maxAgeMilliseconds: 86_400_000,
          sourcePriority: ['independent-test'],
        },
        priceMaxAgeMilliseconds: 86_400_000,
        priceSourcePriority: ['Independent open mark'],
        groupBy: [
          'strategy',
          'strategyVersion',
          'asset',
          'assetClass',
          'broker',
          'account',
          'currency',
          'direction',
          'weekday',
          'hour',
          'timeframe',
          'setup',
          'tag',
          'marketCondition',
        ],
      }),
    );
  }

  it('reconciles five known outcomes, denominators, ratios, R, fees and recovery without copying implementation formulas', async () => {
    const result = await report();
    expect(result.summary.counts).toMatchObject({
      selected: 5,
      completed: 5,
      open: 0,
      excluded: 0,
      eligibleOutcomes: 5,
      wins: 2,
      losses: 2,
      breakevens: 1,
      eligibleR: 5,
      eligibleDuration: 5,
    });
    const metrics = result.summary.metrics;
    for (const [name, value] of Object.entries({
      netPnl: '175',
      grossPnl: '225',
      realizedPnl: '175',
      unrealizedPnl: '0',
      fees: '50',
      winRate: '0.4',
      lossRate: '0.4',
      averageWinner: '125',
      averageLoser: '37.5',
      payoffRatio: '3.333333333333333333333333333333333333',
      profitFactor: '3.333333333333333333333333333333333333',
      expectancy: '35',
      expectancyR: '0.5',
      averageR: '0.5',
      cumulativeR: '2.5',
      averageHoldingDuration: '86400',
      maximumDrawdown: '50',
      currentDrawdown: '25',
      longestWinStreak: '1',
      longestLossStreak: '1',
      currentWinStreak: '0',
      currentLossStreak: '1',
    })) {
      expect(metrics[name as keyof typeof metrics], name).toMatchObject({
        state: 'available',
        value,
      });
    }
    expect(result.summary.curve.points.map((point) => point.cumulativePnl)).toEqual([
      '0',
      '100',
      '50',
      '50',
      '200',
      '175',
    ]);
    expect(result.summary.recovery).toMatchObject({
      state: 'recovered',
      peakCampaignId: campaignIds[0],
      troughCampaignId: campaignIds[1],
      recoveredCampaignId: campaignIds[3],
      peakAt: at(3),
      troughAt: at(5),
      recoveredAt: at(9),
      durationSeconds: '518400',
      tradesToRecovery: 3,
    });
    expect(
      campaignIds.map((id) => result.records.find((record) => record.id === id)?.rMultiple.value),
    ).toEqual(['1', '-1', '0', '3', '-0.5']);
    expect(
      campaignIds.map((id) => result.records.find((record) => record.id === id)?.originalPlanId),
    ).toEqual(planIds);
    expect(result.context.timezone).toBe('Europe/Madrid');
  });

  it('preserves pinned strategy versions, complete account scopes and additive dimensions after later strategy changes', async () => {
    const result = await report();
    const versionGroups = result.groups.filter((group) => group.dimension === 'strategyVersion');
    expect(versionGroups).toHaveLength(2);
    expect(
      versionGroups.find((group) => group.key === `value:${versions[0]}`)?.summary.metrics.netPnl
        .value,
    ).toBe('50');
    expect(
      versionGroups.find((group) => group.key === `value:${versions[1]}`)?.summary.metrics.netPnl
        .value,
    ).toBe('125');
    const strategyGroups = result.groups.filter((group) => group.dimension === 'strategy');
    expect(strategyGroups).toHaveLength(1);
    expect(strategyGroups[0]).toMatchObject({ key: `value:${strategyId}`, additive: true });
    expect(strategyGroups[0]!.summary.metrics.netPnl.value).toBe('175');
    for (const [dimension, ids] of [
      ['account', scopes.map((scope) => scope.id)],
      ['broker', scopes.map((scope) => scope.brokerId)],
      ['asset', instruments.map((instrument) => instrument.id)],
    ] as const) {
      const groups = result.groups.filter((group) => group.dimension === dimension);
      expect(groups).toHaveLength(2);
      expect(
        groups.find((group) => group.key === `value:${ids[0]}`)?.summary.metrics.netPnl.value,
      ).toBe('50');
      expect(
        groups.find((group) => group.key === `value:${ids[1]}`)?.summary.metrics.netPnl.value,
      ).toBe('125');
    }
    const firstAccount = await report([scopes[0]!.id]);
    expect(firstAccount.summary.counts).toMatchObject({
      completed: 3,
      wins: 1,
      losses: 1,
      breakevens: 1,
    });
    expect(firstAccount.summary.metrics.netPnl.value).toBe('50');
    expect(firstAccount.summary.metrics.cumulativeR.value).toBe('0');
    expect(firstAccount.summary.metrics.winRate.value).toBe(
      '0.333333333333333333333333333333333333',
    );
    const classes = result.groups.filter((group) => group.dimension === 'assetClass');
    expect(classes.find((group) => group.key === 'value:stock')?.summary.metrics.netPnl.value).toBe(
      '50',
    );
    expect(classes.find((group) => group.key === 'value:etf')?.summary.metrics.netPnl.value).toBe(
      '125',
    );
    const timeframes = result.groups.filter((group) => group.dimension === 'timeframe');
    expect(timeframes).toHaveLength(2);
    expect(timeframes.find((group) => group.key === 'value:1h')?.summary.metrics.netPnl.value).toBe(
      '50',
    );
    expect(timeframes.find((group) => group.key === 'value:1d')?.summary.metrics.netPnl.value).toBe(
      '125',
    );
    const setups = result.groups.filter((group) => group.dimension === 'setup');
    expect(setups).toHaveLength(2);
    expect(
      setups.find((group) => group.key === `value:${versions[0]}:${setupId}`)?.summary.metrics
        .netPnl.value,
    ).toBe('50');
    expect(
      setups.find((group) => group.key === `value:${versions[1]}:${setupId}`)?.summary.metrics
        .netPnl.value,
    ).toBe('125');
    const conditions = result.groups.filter((group) => group.dimension === 'marketCondition');
    expect(conditions).toHaveLength(2);
    expect(
      conditions.find((group) => group.label === 'Trending')?.summary.metrics.netPnl.value,
    ).toBe('50');
    expect(conditions.find((group) => group.label === 'Range')?.summary.metrics.netPnl.value).toBe(
      '125',
    );
    expect(result.groups.filter((group) => group.dimension === 'hour')).toHaveLength(1);
    expect(result.groups.find((group) => group.dimension === 'hour')?.key).toBe('value:13');
    expect(
      result.groups.find((group) => group.dimension === 'currency')?.summary.metrics.netPnl.value,
    ).toBe('175');
    expect(
      result.groups.find((group) => group.dimension === 'direction')?.summary.metrics.netPnl.value,
    ).toBe('175');
  });

  it('reports overlapping tags explicitly without duplicating outcomes in the overall population', async () => {
    const result = await report();
    const tags = result.groups.filter((group) => group.dimension === 'tag');
    expect(tags).toHaveLength(3);
    expect(tags.every((group) => !group.additive)).toBe(true);
    expect(tags.find((group) => group.key === 'value:sample')?.summary.counts.completed).toBe(5);
    expect(tags.find((group) => group.key === 'value:sample')?.summary.metrics.netPnl.value).toBe(
      '175',
    );
    expect(tags.find((group) => group.key === 'value:odd')?.summary.metrics.netPnl.value).toBe(
      '75',
    );
    expect(tags.find((group) => group.key === 'value:even')?.summary.metrics.netPnl.value).toBe(
      '100',
    );
    expect(result.summary.metrics.netPnl.value).toBe('175');
    expect(result.summary.population.completedIds).toHaveLength(5);
  });

  it('excludes a partial campaign scope and counts a complete multi-leg campaign once in mixed groups', async () => {
    const selected: { id: string; bucket: string }[] = [];
    for (const existing of scopes) {
      const account = await catalog.createAccount(
        fixture.owner.context,
        {
          name: `Independent multi-leg scope ${randomUUID()}`,
          brokerId: existing.brokerId,
          environment: 'live',
          accountType: 'margin',
          baseCurrencyId: eur,
          inventoryMethod: 'fifo',
          allowShort: true,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      );
      const bucket = await ledger.createCashBucket(fixture.owner.context, {
        commandId: randomUUID(),
        accountId: account.id,
        currencyId: eur,
        kind: 'settled',
      });
      selected.push({ id: account.id, bucket: bucket.id });
    }
    const created = await journal.create(
      fixture.owner.context,
      {
        title: 'Independent multi-account long/short campaign',
        classification: 'active-trading',
        legs: [
          {
            accountId: selected[0]!.id,
            instrumentVersionId: instruments[0]!.versionId,
            direction: 'long',
            label: 'Stock long',
          },
          {
            accountId: selected[1]!.id,
            instrumentVersionId: instruments[1]!.versionId,
            direction: 'short',
            label: 'ETF short',
          },
        ],
      },
      randomUUID(),
    );
    const saved = await journal.save(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: created.journal.revision,
        document: journalDocumentSchema.parse({
          plan: {
            initialRisk: { amount: '20', currencyId: eur, method: 'Whole campaign original risk' },
          },
        }),
      },
      randomUUID(),
    );
    await journal.publishPlan(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: saved.revision,
        expectedTradeRevision: created.trade.revision,
        reason: 'Commit risk before both economic leg entries',
      },
      randomUUID(),
    );
    const longLeg = created.financial.legs.find((leg) => leg.accountId === selected[0]!.id)!.legId;
    const shortLeg = created.financial.legs.find((leg) => leg.accountId === selected[1]!.id)!.legId;
    await fill(selected[0]!, instruments[0]!.versionId, longLeg, {
      side: 'buy',
      quantity: '1',
      price: '100',
      fee: '1',
      day: 17,
    });
    await fill(selected[1]!, instruments[1]!.versionId, shortLeg, {
      side: 'sell',
      quantity: '1',
      price: '100',
      fee: '1',
      day: 17,
    });
    await fill(selected[0]!, instruments[0]!.versionId, longLeg, {
      side: 'sell',
      quantity: '1',
      price: '120',
      fee: '1',
      day: 18,
    });
    await fill(selected[1]!, instruments[1]!.versionId, shortLeg, {
      side: 'buy',
      quantity: '1',
      price: '90',
      fee: '1',
      day: 18,
    });
    await close(created.trade.id);
    const partial = await report([selected[0]!.id]);
    expect(partial.records).toHaveLength(1);
    expect(partial.records[0]).toMatchObject({ id: created.trade.id, status: 'excluded' });
    expect(partial.records[0]!.exclusionReasons).toContain('partial_campaign_scope');
    expect(partial.summary.counts).toMatchObject({
      completed: 0,
      eligibleOutcomes: 0,
      wins: 0,
      eligibleR: 0,
      excluded: 1,
    });
    expect(partial.summary.metrics.netPnl).toMatchObject({ state: 'unavailable', value: null });
    expect(partial.summary.metrics.averageR).toMatchObject({ state: 'unavailable', value: null });
    const complete = await report(selected.map((scope) => scope.id));
    expect(complete.summary.counts).toMatchObject({
      selected: 1,
      completed: 1,
      wins: 1,
      eligibleR: 1,
    });
    expect(complete.summary.metrics.grossPnl).toMatchObject({ state: 'available', value: '30' });
    expect(complete.summary.metrics.netPnl).toMatchObject({ state: 'available', value: '26' });
    expect(complete.summary.metrics.fees).toMatchObject({ state: 'available', value: '4' });
    expect(complete.summary.metrics.averageR).toMatchObject({ state: 'available', value: '1.3' });
    for (const dimension of ['account', 'broker', 'asset', 'assetClass', 'direction'] as const) {
      const groups = complete.groups.filter((group) => group.dimension === dimension);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ kind: 'mixed', additive: true });
      expect(groups[0]!.summary.counts.completed).toBe(1);
      expect(groups[0]!.summary.metrics.netPnl.value).toBe('26');
      expect(groups[0]!.summary.metrics.averageR.value).toBe('1.3');
    }
    expect(complete.groups.find((group) => group.dimension === 'direction')?.memberKeys).toEqual([
      'long',
      'short',
    ]);
    expect(complete.groups.find((group) => group.dimension === 'account')?.memberKeys).toEqual(
      selected.map((scope) => scope.id).sort(),
    );
  });

  it('keeps a partially filled scaled-out position outside closed win/R cohorts while retaining its marked open money', async () => {
    const isolated = await catalog.createAccount(
      fixture.owner.context,
      {
        name: 'Independent open campaign',
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: eur,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: isolated.id,
      currencyId: eur,
      kind: 'settled',
    });
    const scope = { id: isolated.id, bucket: bucket.id };
    const created = await createCampaign(scope, instruments[0]!.versionId, '100');
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, instruments[0]!.versionId, legId, {
      side: 'buy',
      quantity: '0.5',
      price: '100',
      fee: '1',
      day: 14,
    });
    await fill(scope, instruments[0]!.versionId, legId, {
      side: 'buy',
      quantity: '0.5',
      price: '120',
      fee: '1',
      day: 15,
    });
    await fill(scope, instruments[0]!.versionId, legId, {
      side: 'sell',
      quantity: '0.25',
      price: '140',
      fee: '1',
      day: 16,
    });
    await observations.recordPriceObservation(fixture.owner.context, {
      commandId: randomUUID(),
      instrumentVersionId: instruments[0]!.versionId,
      currencyId: eur,
      price: '150',
      observedAt: to,
      source: 'Independent open mark',
    });
    const result = await report([isolated.id]);
    // FIFO realizes .25*(140-100)=10; .25@100+.5@120 remain worth112.5 with85 gross basis.
    // The remaining entry commissions are1.5; realized entry+exit commissions are1.5.
    expect(result.summary.counts).toMatchObject({
      selected: 1,
      completed: 0,
      open: 1,
      eligibleOutcomes: 0,
      wins: 0,
      losses: 0,
      eligibleR: 0,
    });
    expect(result.summary.metrics.grossPnl).toMatchObject({ state: 'available', value: '37.5' });
    expect(result.summary.metrics.netPnl).toMatchObject({ state: 'available', value: '34.5' });
    expect(result.summary.metrics.realizedPnl).toMatchObject({ state: 'available', value: '8.5' });
    expect(result.summary.metrics.unrealizedPnl).toMatchObject({ state: 'available', value: '26' });
    expect(result.summary.metrics.fees).toMatchObject({ state: 'available', value: '3' });
    expect(result.summary.metrics.winRate).toMatchObject({ state: 'unavailable', value: null });
    expect(result.summary.metrics.averageR).toMatchObject({ state: 'unavailable', value: null });
    expect(result.summary.metrics.maximumDrawdown).toMatchObject({
      state: 'unavailable',
      value: null,
    });
    expect(result.completedOnly.population.completedIds).toHaveLength(0);
    expect(result.openOnly.population.openIds).toEqual([created.trade.id]);
  });
});
