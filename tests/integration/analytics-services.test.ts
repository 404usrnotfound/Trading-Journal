import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  analyticsReportResponseSchema,
  journalDocumentSchema,
  type AnalyticsReportRequest,
} from '@journal/contracts';
import { createAnalyticsServices } from '../../packages/server/src/analytics/service.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import type { ExecutionInput } from '../../packages/server/src/financial/ledger-types.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createAccountingFixture } from './accounting-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
const at = (day: number) => `2030-02-${String(day).padStart(2, '0')}T12:00:00.000001Z`;
type Scope = { id: string; bucket: string };

describe('analytics source service with immutable PostgreSQL financial and journal generations', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let journal: ReturnType<typeof createJournalServices>;
  let analytics: ReturnType<typeof createAnalyticsServices>;
  let usd: string;
  let eur: string;
  let instrument: string;

  beforeAll(async () => {
    fixture = await createAccountingFixture();
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    observations = createFinancialObservations(fixture.services);
    journal = createJournalServices(fixture.services);
    analytics = createAnalyticsServices(fixture.services);
    for (const code of ['USD', 'EUR']) {
      const currency = await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso:4217',
          code,
          kind: 'fiat',
          unitIdentity: `iso:${code}`,
          name: code,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt,
        },
        randomUUID(),
      );
      if (code === 'USD') usd = currency.id;
      else eur = currency.id;
    }
    instrument = (
      await catalog.createInstrument(
        fixture.owner.context,
        {
          name: 'Analytics temporal ordinary share',
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: `analytics-source:${randomUUID()}`,
          quantityUnit: 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
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
      )
    ).versionId;
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function account(): Promise<Scope> {
    const created = await catalog.createAccount(
      fixture.owner.context,
      {
        name: `Analytics generation account ${randomUUID()}`,
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt,
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

  async function campaign(
    scope: Scope,
    options: {
      direction?: 'long' | 'short';
      risk?: string | null;
      riskCurrency?: string;
      publish?: boolean;
      tags?: string[];
    } = {},
  ) {
    const created = await journal.create(
      fixture.owner.context,
      {
        title: `Analytics generation campaign ${randomUUID()}`,
        classification: 'active-trading',
        legs: [
          {
            accountId: scope.id,
            instrumentVersionId: instrument,
            direction: options.direction ?? 'long',
            label: 'Actual allocated leg',
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
            thesis: 'Original before economic entry',
            timeframe: '1h',
            marketConditions: 'Original market regime',
            initialRisk:
              options.risk === null
                ? null
                : {
                    amount: options.risk ?? '10',
                    currencyId: options.riskCurrency ?? usd,
                    method: 'Original cash risk',
                  },
          },
          review: { customTags: options.tags ?? [] },
        }),
      },
      randomUUID(),
    );
    if (options.publish !== false)
      await journal.publishPlan(
        fixture.owner.context,
        created.trade.id,
        {
          expectedRevision: saved.revision,
          expectedTradeRevision: created.trade.revision,
          reason: 'Commit original plan before economic executions',
        },
        randomUUID(),
      );
    return journal.get(fixture.owner.context, created.trade.id);
  }

  async function fill(
    scope: Scope,
    legId: string,
    side: 'buy' | 'sell',
    quantity: string,
    price: string,
    day: number,
    extra: Partial<ExecutionInput> = {},
  ) {
    const execution = await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      instrumentVersionId: instrument,
      side,
      quantity,
      price,
      cashBucketId: scope.bucket,
      economicAt: at(day),
      orderingKey: '1',
      costsComplete: true,
      ...extra,
    });
    const allocation = await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: execution.id,
      expectedVersion: 1,
      reason: 'Attribute actual execution to this campaign',
      allocations: [{ tradeLegId: legId, quantity }],
    });
    return { ...execution, allocatedRevision: String(allocation.sourceRevision) };
  }

  async function close(tradeId: string) {
    const current = await catalog.getTrade(fixture.owner.context, tradeId);
    return catalog.confirmTradeClosure(
      fixture.owner.context,
      tradeId,
      {
        expectedRevision: current.revision,
        reason: 'Effective allocated executions are flat',
        obligationEvidence: 'Actual principal and charges use settled cash buckets',
      },
      randomUUID(),
    );
  }

  async function report(scope: Scope, options: Partial<AnalyticsReportRequest> = {}) {
    return analyticsReportResponseSchema.parse(
      await analytics.report(fixture.viewer.context, {
        accountIds: [scope.id],
        reportingCurrencyId: usd,
        from: '2030-02-01T00:00:00.000000Z',
        to: at(20),
        timezone: 'Europe/Madrid',
        fxPolicy: {
          id: 'analytics-source-test/1',
          maxAgeMilliseconds: 86_400_000,
          sourcePriority: ['Analytics historical FX'],
        },
        priceMaxAgeMilliseconds: 86_400_000,
        priceSourcePriority: ['Analytics temporal mark'],
        groupBy: ['tag', 'timeframe', 'marketCondition', 'direction', 'hour', 'weekday'],
        ...options,
      }),
    );
  }

  async function mark(price: string, day: number, source = 'Analytics temporal mark') {
    return observations.recordPriceObservation(fixture.owner.context, {
      commandId: randomUUID(),
      instrumentVersionId: instrument,
      currencyId: usd,
      price,
      observedAt: at(day),
      source,
    });
  }

  it('selects actual economic exits, excludes future fills and retains an open lifetime outcome before the exit', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', 2);
    await mark('13', 3);
    await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);

    const beforeEntry = await report(scope, { to: at(1) });
    expect(beforeEntry.records).toEqual([]);
    expect(beforeEntry.summary.metrics.netPnl).toMatchObject({ state: 'available', value: '0' });
    const open = await report(scope, { to: at(3) });
    expect(open.summary.counts).toMatchObject({ completed: 0, open: 1, eligibleOutcomes: 0 });
    expect(open.records[0]).toMatchObject({ entryAt: at(2), closedAt: null });
    expect(open.summary.metrics.grossPnl.value).toBe('3');
    expect(open.summary.metrics.unrealizedPnl.value).toBe('3');
    expect(open.summary.metrics.winRate.state).toBe('unavailable');

    const completed = await report(scope, { to: at(4) });
    expect(completed.summary.counts.completed).toBe(1);
    expect(completed.records[0]).toMatchObject({ entryAt: at(2), closedAt: at(4) });
    expect(completed.summary.metrics.netPnl.value).toBe('2');
    expect(completed.summary.metrics.averageHoldingDuration.value).toBe('172800');
    expect((await report(scope, { from: at(4) })).records).toEqual([]);
  });

  it('includes pre-interval open exposure as an as-of lifetime result without classifying it as a completed outcome', async () => {
    const scope = await account(),
      created = await campaign(scope);
    await fill(scope, created.financial.legs[0]!.legId, 'buy', '0.25', '40', 2);
    await mark('48', 20);
    const result = await report(scope, { from: at(10) });
    expect(result.context.moneyPopulation).toBe('selected-completed-and-open-lifetime-asof');
    expect(result.records[0]?.entryAt).toBe(at(2));
    expect(result.summary.counts).toMatchObject({ open: 1, completed: 0, eligibleOutcomes: 0 });
    expect(result.summary.metrics.netPnl.value).toBe('2');
    expect(result.openOnly.metrics.netPnl.value).toBe('2');
    expect(result.completedOnly.metrics.netPnl.value).toBe('0');
  });

  it('pins allocations and closure evidence to their source revision and preserves an earlier correction generation', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    const entry = await fill(scope, legId, 'buy', '1', '10', 2);
    await mark('11', 20);
    const beforeExit = await report(scope, { sourceRevision: entry.allocatedRevision });
    expect(beforeExit.records[0]?.provenance.effectiveExecutionIds).toEqual([entry.id]);
    expect(beforeExit.records[0]?.provenance.closureId).toBeNull();
    expect(beforeExit.summary.counts.completed).toBe(0);
    await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);
    const original = await report(scope);
    expect(original.summary.metrics.netPnl.value).toBe('2');
    expect(original.summary.metrics.averageR.value).toBe('0.2');
    const corrected = await ledger.correctExecution(fixture.owner.context, {
      commandId: randomUUID(),
      originalExecutionId: entry.id,
      reason: 'Broker corrected the original entry principal',
      replacement: {
        accountId: scope.id,
        instrumentVersionId: instrument,
        side: 'buy',
        quantity: '1',
        price: '14',
        cashBucketId: scope.bucket,
        economicAt: at(2),
        orderingKey: '1',
        costsComplete: true,
      },
    });
    const current = await report(scope);
    expect(current.summary.metrics.netPnl.value).toBe('-2');
    expect(current.summary.metrics.averageR.value).toBe('-0.2');
    expect(current.records[0]?.originalPlanId).toBe(created.originalPlan!.id);
    expect(current.records[0]?.provenance.effectiveExecutionIds).toContain(corrected.id);
    expect(current.records[0]?.provenance.effectiveExecutionIds).not.toContain(entry.id);
    const repeated = await report(scope, {
      sourceRevision: original.context.sourceRevision,
      metadataAsOf: original.context.metadataAsOf,
    });
    expect(repeated.records).toEqual(original.records);
    expect(repeated.summary).toEqual(original.summary);
    expect(repeated.records[0]?.provenance.effectiveExecutionIds).toContain(entry.id);
  });

  it('selects review tags at metadataAsOf while original risk and published plan dimensions remain immutable', async () => {
    const scope = await account(),
      created = await campaign(scope, { tags: ['before'] });
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', 2);
    await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);
    const original = await report(scope);
    const currentJournal = await journal.get(fixture.owner.context, created.trade.id);
    await journal.save(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: currentJournal.journal.revision,
        document: {
          ...currentJournal.journal.document,
          plan: {
            ...currentJournal.journal.document.plan,
            timeframe: '5m',
            marketConditions: 'Later draft market regime',
            initialRisk: { amount: '999', currencyId: usd, method: 'Draft', methodNotes: '' },
          },
          review: { ...currentJournal.journal.document.review, customTags: ['after'] },
        },
      },
      randomUUID(),
    );
    const changed = await report(scope);
    expect(changed.context.sourceRevision).toBe(original.context.sourceRevision);
    expect(changed.records[0]?.provenance.journalRevisionId).not.toBe(
      original.records[0]?.provenance.journalRevisionId,
    );
    expect(changed.records[0]?.dimensions.tag).toEqual([{ key: 'after', label: 'after' }]);
    expect(changed.records[0]?.dimensions.timeframe).toEqual([{ key: '1h', label: '1h' }]);
    expect(changed.records[0]?.dimensions.marketCondition?.map((value) => value.label)).toEqual([
      'Original market regime',
    ]);
    expect(changed.records[0]?.rMultiple.value).toBe('0.2');
    expect(changed.records[0]?.provenance.originalPlanHash).toBe(
      original.records[0]?.provenance.originalPlanHash,
    );
    const historical = await report(scope, { metadataAsOf: original.context.metadataAsOf });
    expect(historical.records).toEqual(original.records);
    expect(historical.groups.find((group) => group.dimension === 'tag')?.key).toBe('value:before');
  });

  it.each(['missing-risk', 'retrospective-risk', 'unpublished-risk'] as const)(
    'does not invent R for %s while preserving a mathematically complete monetary outcome',
    async (reason) => {
      const scope = await account(),
        created = await campaign(scope, {
          risk: reason === 'missing-risk' ? null : '10',
          publish: reason !== 'unpublished-risk',
        });
      const legId = created.financial.legs[0]!.legId;
      await fill(scope, legId, 'buy', '1', '10', 2, {
        ...(reason === 'retrospective-risk' ? { economicAt: '2025-06-01T12:00:00.000001Z' } : {}),
      });
      await fill(scope, legId, 'sell', '1', '12', 4);
      await close(created.trade.id);
      const result = await report(scope);
      expect(result.summary.metrics.netPnl).toMatchObject({ state: 'available', value: '2' });
      expect(result.summary.metrics.winRate).toMatchObject({ state: 'available', value: '1' });
      expect(result.summary.counts).toMatchObject({ eligibleOutcomes: 1, eligibleR: 0 });
      expect(result.records[0]?.rMultiple.state).toBe('unavailable');
      expect(result.records[0]?.rMultiple.reasons).toContain(
        reason === 'retrospective-risk'
          ? 'execution_not_after_original_commitment'
          : 'missing_original_risk',
      );
      expect(result.summary.metrics.averageR.value).toBeNull();
      expect(result.summary.metrics.cumulativeR.value).toBeNull();
    },
  );

  it('preserves independent gross results when required execution-cost coverage is unknown', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', 2, { costsComplete: false });
    await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);
    const result = await report(scope);
    expect(result.summary.counts.completed).toBe(1);
    expect(result.summary.metrics.grossPnl).toMatchObject({ state: 'available', value: '2' });
    expect(result.summary.metrics.netPnl).toMatchObject({ state: 'unavailable', value: null });
    expect(result.summary.metrics.fees).toMatchObject({ state: 'unavailable', value: null });
    expect(result.summary.metrics.winRate.state).toBe('unavailable');
    expect(result.summary.metrics.maximumDrawdown.state).toBe('unavailable');
    expect(result.records[0]?.netPnl.reasons).toContain('incomplete_costs');
    expect(result.records[0]?.rMultiple.state).toBe('unavailable');
  });

  it('keeps original-currency R available when another reporting currency lacks compatible historical FX', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', 2);
    await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);
    const result = await report(scope, { reportingCurrencyId: eur });
    expect(result.summary.metrics.grossPnl.state).toBe('unavailable');
    expect(result.summary.metrics.netPnl.state).toBe('unavailable');
    expect(result.summary.metrics.netPnl.value).toBeNull();
    expect(result.records[0]?.rMultiple).toMatchObject({ state: 'available', value: '0.2' });
    expect(result.summary.metrics.averageR).toMatchObject({
      state: 'available',
      value: '0.2',
      currencyId: null,
    });
    expect(result.summary.metrics.winRate.state).toBe('unavailable');
  });

  it('conserves fractional short proceeds, fee partitions and rebates through partial and complete exits', async () => {
    const scope = await account(),
      created = await campaign(scope, { direction: 'short' });
    const legId = created.financial.legs[0]!.legId;
    const commission = (amount: string) => [
      { cashBucketId: scope.bucket, currencyId: usd, amount, kind: 'commission' },
    ];
    await fill(scope, legId, 'sell', '1.25', '80', 2, { fees: commission('0.5') });
    await fill(scope, legId, 'buy', '0.5', '70', 3, { fees: commission('0.2') });
    await mark('65', 3, 'Analytics fractional short mark');
    await fill(scope, legId, 'buy', '0.75', '60', 4, { fees: commission('-0.1') });
    await close(created.trade.id);

    // Partial short: (80-70)*.5=5 realized, (80-65)*.75=11.25 open.
    // The .5 opening fee partitions .2 realized/.3 open; exit costs .2.
    const partial = await report(scope, {
      to: at(3),
      priceSourcePriority: ['Analytics fractional short mark'],
    });
    expect(partial.summary.counts).toMatchObject({ open: 1, completed: 0 });
    expect(partial.summary.metrics.grossPnl.value).toBe('16.25');
    expect(partial.summary.metrics.realizedPnl.value).toBe('4.6');
    expect(partial.summary.metrics.unrealizedPnl.value).toBe('10.95');
    expect(partial.summary.metrics.netPnl.value).toBe('15.55');
    expect(partial.summary.metrics.fees.value).toBe('0.7');
    // Complete cash: sell 100, buy back 35+45, pay .5+.2-.1 => 19.4.
    const completed = await report(scope);
    expect(completed.summary.metrics.grossPnl.value).toBe('20');
    expect(completed.summary.metrics.fees.value).toBe('0.6');
    expect(completed.summary.metrics.netPnl.value).toBe('19.4');
    expect(completed.summary.metrics.realizedPnl.value).toBe('19.4');
    expect(completed.summary.metrics.unrealizedPnl.value).toBe('0');
    expect(completed.summary.metrics.averageR.value).toBe('1.94');
    expect(completed.summary.metrics.averageHoldingDuration.value).toBe('172800');
    expect(completed.records[0]?.provenance.feeIds).toHaveLength(3);
    expect(completed.groups.find((group) => group.dimension === 'direction')?.key).toBe(
      'value:short',
    );
  });

  it('uses historical principal and dated fee FX pins once instead of translating the net amount at a current rate', async () => {
    const scope = await account(),
      created = await campaign(scope, { riskCurrency: eur });
    const legId = created.financial.legs[0]!.legId;
    const entryFx = await observations.recordFxObservation(fixture.owner.context, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '0.9',
      observedAt: at(2),
      source: 'Analytics historical FX',
    });
    const exitFx = await observations.recordFxObservation(fixture.owner.context, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '0.95',
      observedAt: at(4),
      source: 'Analytics historical FX',
    });
    for (const [side, price, day, observationId, rate] of [
      ['buy', '10', 2, entryFx.id, '0.9'],
      ['sell', '12', 4, exitFx.id, '0.95'],
    ] as const) {
      const pin = { observationId, rate, baseCurrencyId: usd, quoteCurrencyId: eur };
      await fill(scope, legId, side, '10', price, day, {
        basisReportingFx: pin,
        fees: [
          {
            cashBucketId: scope.bucket,
            currencyId: usd,
            amount: '1',
            kind: 'commission',
            reportingFx: pin,
          },
        ],
      });
    }
    await close(created.trade.id);
    await observations.recordFxObservation(fixture.owner.context, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '3',
      observedAt: at(20),
      source: 'Analytics historical FX',
    });
    const result = await report(scope, { reportingCurrencyId: eur });
    // EUR principal 120*.95 - 100*.9 = 24; actual charge contexts .9+.95=1.85.
    expect(result.summary.metrics.grossPnl.value).toBe('24');
    expect(result.summary.metrics.fees.value).toBe('1.85');
    expect(result.summary.metrics.netPnl.value).toBe('22.15');
    expect(result.summary.metrics.realizedPnl.value).toBe('22.15');
    expect(result.summary.metrics.averageR.value).toBe('2.215');
    expect(result.records[0]?.provenance.fxObservationIds).toContain(entryFx.id);
    expect(result.records[0]?.provenance.fxObservationIds).toContain(exitFx.id);
    const native = await report(scope);
    expect(native.summary.metrics.netPnl.value).toBe('18');
    expect(native.summary.metrics.averageR.value).toBe('2.215');
  });

  it('does not add deposits, income or unrelated post-campaign account charges to campaign performance', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', 2);
    await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);
    for (const [kind, amount, day] of [
      ['deposit', '10000', 1],
      ['income', '50', 5],
    ] as const)
      await ledger.recordCashMovement(fixture.owner.context, {
        commandId: randomUUID(),
        accountId: scope.id,
        cashBucketId: scope.bucket,
        currencyId: usd,
        kind,
        amount,
        economicAt: at(day),
        orderingKey: '2',
      });
    await ledger.recordFee(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount: '5',
      kind: 'account-maintenance',
      economicAt: at(6),
      orderingKey: '1',
    });
    const result = await report(scope);
    expect(result.summary.metrics.netPnl.value).toBe('2');
    expect(result.summary.metrics.fees.value).toBe('0');
    expect(result.summary.metrics.averageR.value).toBe('0.2');
    const balances = await ledger.cashBalances(fixture.owner.context, { accountIds: [scope.id] });
    expect(balances.find((balance) => balance.cashBucketId === scope.bucket)?.amount).toBe('10047');
  });

  it('selects dated display-policy FX without supplying absent source pins to original cross-currency R', async () => {
    const scope = await account(),
      created = await campaign(scope, { riskCurrency: eur });
    const legId = created.financial.legs[0]!.legId;
    const march = (day: number) => `2030-03-${String(day).padStart(2, '0')}T12:00:00.000001Z`;
    const observationsIds: string[] = [];
    for (const [side, price, day, rate] of [
      ['buy', '10', 2, '0.9'],
      ['sell', '12', 4, '0.95'],
    ] as const) {
      const observed = await observations.recordFxObservation(fixture.owner.context, {
        commandId: randomUUID(),
        baseCurrencyId: usd,
        quoteCurrencyId: eur,
        rate,
        observedAt: march(day),
        source: 'Analytics historical FX',
      });
      observationsIds.push(observed.id);
      await fill(scope, legId, side, '10', price, day, { economicAt: march(day) });
    }
    await close(created.trade.id);
    const boundaries = { from: march(1), to: march(20) };
    const translated = await report(scope, { ...boundaries, reportingCurrencyId: eur });
    // Each actual principal uses its own observed rate: 120*.95 - 100*.9 = 24 EUR.
    expect(translated.summary.metrics.grossPnl.value).toBe('24');
    expect(translated.summary.metrics.netPnl.value).toBe('24');
    expect(translated.records[0]?.provenance.fxObservationIds).toEqual([...observationsIds].sort());
    expect(translated.records[0]?.rMultiple.state).toBe('unavailable');
    expect(translated.records[0]?.rMultiple.reasons).toContain('missing_basis_fx');
    const native = await report(scope, boundaries);
    expect(native.summary.metrics.netPnl.value).toBe('20');
    expect(native.records[0]?.rMultiple.state).toBe('unavailable');
    expect(native.summary.counts.eligibleR).toBe(0);
  });

  it('translates a foreign fee with its original nativeFx pin when report and principal currencies match', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    const april = (day: number) => `2030-04-${String(day).padStart(2, '0')}T12:00:00.000001Z`;
    const euroBucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      currencyId: eur,
      kind: 'settled',
    });
    const fx = await observations.recordFxObservation(fixture.owner.context, {
      commandId: randomUUID(),
      baseCurrencyId: eur,
      quoteCurrencyId: usd,
      rate: '1.25',
      observedAt: april(2),
      source: 'Analytics historical FX',
    });
    await fill(scope, legId, 'buy', '1', '10', 2, {
      economicAt: april(2),
      fees: [
        {
          cashBucketId: euroBucket.id,
          currencyId: eur,
          amount: '2',
          kind: 'commission',
          nativeFx: {
            observationId: fx.id,
            rate: '1.25',
            baseCurrencyId: eur,
            quoteCurrencyId: usd,
          },
        },
      ],
    });
    await fill(scope, legId, 'sell', '1', '15', 4, { economicAt: april(4) });
    await close(created.trade.id);
    const result = await report(scope, { from: april(1), to: april(20) });
    expect(result.summary.metrics.grossPnl.value).toBe('5');
    expect(result.summary.metrics.fees.value).toBe('2.5');
    expect(result.summary.metrics.netPnl.value).toBe('2.5');
    expect(result.summary.metrics.realizedPnl.value).toBe('2.5');
    expect(result.summary.metrics.averageR.value).toBe('0.25');
    expect(result.records[0]?.provenance.fxObservationIds).toContain(fx.id);
  });

  it('does not let a later added empty leg change historical account scope or mixed dimensions', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const initialLegId = created.financial.legs[0]!.legId;
    await fill(scope, initialLegId, 'buy', '1', '10', 2);
    await mark('11', 20, 'Analytics empty-leg historical mark');
    const original = await report(scope, {
      priceSourcePriority: ['Analytics empty-leg historical mark'],
      groupBy: ['account', 'direction'],
    });
    expect(original.records[0]?.status).toBe('open');
    expect(original.summary.metrics.netPnl.value).toBe('1');
    const other = await account();
    const currentTrade = await catalog.getTrade(fixture.owner.context, created.trade.id);
    const added = await catalog.addTradeLeg(
      fixture.owner.context,
      {
        tradeId: created.trade.id,
        expectedRevision: currentTrade.revision,
        accountId: other.id,
        instrumentVersionId: instrument,
        direction: 'short',
        label: 'Later unfilled hedge intention',
      },
      randomUUID(),
    );
    const pinned = await report(scope, {
      sourceRevision: original.context.sourceRevision,
      metadataAsOf: original.context.metadataAsOf,
      priceSourcePriority: ['Analytics empty-leg historical mark'],
      groupBy: ['account', 'direction'],
    });
    expect(pinned.records).toEqual(original.records);
    expect(pinned.groups).toEqual(original.groups);
    expect(pinned.records[0]?.provenance.legIds).not.toContain(added.id);
    const partial = await report(scope, {
      priceSourcePriority: ['Analytics empty-leg historical mark'],
    });
    expect(partial.records[0]).toMatchObject({
      status: 'excluded',
      exclusionReasons: expect.arrayContaining(['partial_campaign_scope']),
    });
    expect(partial.summary.metrics.netPnl.value).toBeNull();
  });

  it('blocks open attributed outcomes for an unassigned carrying cost without contaminating an earlier completed campaign', async () => {
    const scope = await account(),
      completed = await campaign(scope);
    await fill(scope, completed.financial.legs[0]!.legId, 'buy', '1', '10', 2);
    await fill(scope, completed.financial.legs[0]!.legId, 'sell', '1', '12', 3);
    await close(completed.trade.id);
    const open = await campaign(scope);
    await fill(scope, open.financial.legs[0]!.legId, 'buy', '1', '5', 4);
    const charge = await ledger.recordFee(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount: '0.5',
      kind: 'carrying',
      economicAt: at(5),
      orderingKey: '1',
    });
    await mark('6', 20, 'Analytics carrying scope mark');
    const withoutAttribution = await report(scope, {
      priceSourcePriority: ['Analytics carrying scope mark'],
    });
    const completedRecord = withoutAttribution.records.find(
      (record) => record.id === completed.trade.id,
    );
    const openRecord = withoutAttribution.records.find((record) => record.id === open.trade.id);
    expect(completedRecord?.netPnl).toMatchObject({ state: 'available', value: '2' });
    expect(openRecord?.grossPnl).toMatchObject({ state: 'available', value: '1' });
    expect(openRecord?.netPnl.reasons).toContain('standalone_costs_require_campaign_attribution');
    expect(openRecord?.unrealizedPnl.state).toBe('unavailable');
    expect(withoutAttribution.summary.metrics.netPnl).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '2',
    });
    const inventory = (await ledger.positions(fixture.owner.context, { accountId: scope.id }))[0]!;
    const activeLot = inventory.inventory.lots.find((lot) => lot.remainingQuantity !== '0')!;
    await ledger.attributeFee(fixture.owner.context, {
      commandId: randomUUID(),
      feeId: charge.id,
      instrumentVersionId: instrument,
      expectedVersion: 0,
      economicAt: at(5),
      orderingKey: '2',
      reason: 'Evidence assigns financing to the currently open holding',
      allocations: [
        { target: 'lot', targetId: activeLot.id, amount: '0.5' },
        { target: 'unassigned', amount: '0' },
      ],
    });
    const attributed = await report(scope, {
      priceSourcePriority: ['Analytics carrying scope mark'],
    });
    expect(
      attributed.records.find((record) => record.id === completed.trade.id)?.netPnl,
    ).toMatchObject({
      state: 'available',
      value: '2',
    });
    expect(
      attributed.records.find((record) => record.id === open.trade.id)?.netPnl.reasons,
    ).toContain('standalone_costs_require_campaign_attribution');
    expect(attributed.summary.metrics.winRate.value).toBe('1');
  });

  it('includes an execution-linked late charge only at its economic cutoff and financial revision', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', 2);
    const exit = await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);
    const original = await report(scope);
    const fee = await ledger.recordFee(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      executionId: exit.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount: '1',
      kind: 'commission',
      economicAt: at(6),
      orderingKey: '1',
    });
    const beforeCharge = await report(scope, { to: at(5) });
    expect(beforeCharge.summary.metrics.netPnl.value).toBe('2');
    expect(beforeCharge.summary.metrics.fees.value).toBe('0');
    expect(beforeCharge.records[0]?.provenance.feeIds).not.toContain(fee.id);
    const afterCharge = await report(scope, { to: at(6) });
    expect(afterCharge.summary.metrics.grossPnl.value).toBe('2');
    expect(afterCharge.summary.metrics.netPnl.value).toBe('1');
    expect(afterCharge.summary.metrics.realizedPnl.value).toBe('1');
    expect(afterCharge.summary.metrics.fees.value).toBe('1');
    expect(afterCharge.summary.metrics.averageR.value).toBe('0.1');
    expect(afterCharge.records[0]?.provenance.feeIds).toContain(fee.id);
    expect(afterCharge.records[0]?.closedAt).toBe(at(4));
    const pinned = await report(scope, { sourceRevision: original.context.sourceRevision });
    expect(pinned.summary).toEqual(original.summary);
    expect(pinned.records[0]?.provenance.feeIds).toEqual([]);
  });

  it('keeps microsecond economic duration exact while grouping the entry across the Madrid DST change', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    const entryAt = '2030-03-31T00:59:59.999999Z';
    const exitAt = '2030-03-31T01:00:00.000001Z';
    await fill(scope, legId, 'buy', '1', '10', 2, { economicAt: entryAt });
    await fill(scope, legId, 'sell', '1', '12', 4, { economicAt: exitAt });
    await close(created.trade.id);
    const bounds = { from: '2030-03-30T00:00:00.000000Z', to: exitAt };
    const madrid = await report(scope, bounds);
    expect(madrid.summary.metrics.averageHoldingDuration.value).toBe('0.000002');
    expect(madrid.records[0]).toMatchObject({ entryAt, closedAt: exitAt });
    expect(madrid.groups.find((group) => group.dimension === 'hour')?.key).toBe('value:1');
    expect(madrid.groups.find((group) => group.dimension === 'weekday')?.key).toBe('value:7');
    const utc = await report(scope, { ...bounds, timezone: 'Etc/UTC' });
    expect(utc.summary.metrics.averageHoldingDuration.value).toBe('0.000002');
    expect(utc.summary.metrics.netPnl.value).toBe(madrid.summary.metrics.netPnl.value);
    expect(utc.groups.find((group) => group.dimension === 'hour')?.key).toBe('value:0');
  });

  it('keeps an accepted closed campaign visibly incomplete after a correction removes its opening attribution', async () => {
    const scope = await account(),
      winner = await campaign(scope);
    await fill(scope, winner.financial.legs[0]!.legId, 'buy', '1', '10', 2);
    await fill(scope, winner.financial.legs[0]!.legId, 'sell', '1', '12', 3);
    await close(winner.trade.id);
    const broken = await campaign(scope);
    const brokenLeg = broken.financial.legs[0]!.legId;
    const entry = await fill(scope, brokenLeg, 'buy', '1', '10', 4);
    await fill(scope, brokenLeg, 'sell', '1', '12', 5);
    await close(broken.trade.id);
    const original = await report(scope);
    expect(original.summary.metrics.netPnl.value).toBe('4');
    expect(original.summary.counts.completed).toBe(2);
    const acceptedClosure = original.records.find((record) => record.id === broken.trade.id)!
      .provenance.closureId;
    await ledger.correctExecution(fixture.owner.context, {
      commandId: randomUUID(),
      originalExecutionId: entry.id,
      reason: 'Review shows opening fill belongs to unassigned custody inventory',
      replacement: {
        accountId: scope.id,
        instrumentVersionId: instrument,
        side: 'buy',
        quantity: '1',
        price: '10',
        cashBucketId: scope.bucket,
        economicAt: at(4),
        orderingKey: '1',
        costsComplete: true,
      },
      replacementAllocations: [],
    });
    const current = await report(scope);
    expect(current.records.find((record) => record.id === broken.trade.id)).toMatchObject({
      status: 'excluded',
      entryAt: null,
      closedAt: null,
      exclusionReasons: expect.arrayContaining(['missing_campaign_opening']),
      provenance: { closureId: acceptedClosure },
    });
    expect(current.summary.counts).toMatchObject({ completed: 1, excluded: 1 });
    expect(current.summary.metrics.netPnl).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '2',
    });
    for (const summary of [current.summary, current.completedOnly]) {
      expect(summary.metrics.maximumDrawdown.state).toBe('unavailable');
      expect(summary.metrics.longestWinStreak.state).toBe('unavailable');
      expect(summary.metrics.netPnl.state).not.toBe('available');
      expect(summary.metrics.netPnl.value).toBeNull();
      expect(summary.population.excludedIds).toContain(broken.trade.id);
    }
    const pinned = await report(scope, { sourceRevision: original.context.sourceRevision });
    expect(pinned.summary.metrics.netPnl.value).toBe('4');
    expect(pinned.summary.counts.completed).toBe(2);
  });

  it('retains independent realized P&L and fees when the only mark predates a remaining scale-in lot', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    const costs = (amount: string) => [
      { cashBucketId: scope.bucket, currencyId: usd, amount, kind: 'commission' },
    ];
    await fill(scope, legId, 'buy', '2', '10', 2, { fees: costs('0.4') });
    await fill(scope, legId, 'sell', '1', '12', 3, { fees: costs('0.1') });
    await mark('15', 3, 'Analytics pre-acquisition scale-in mark');
    await fill(scope, legId, 'buy', '1', '20', 4, { fees: costs('0.2') });
    const result = await report(scope, {
      to: at(4),
      priceSourcePriority: ['Analytics pre-acquisition scale-in mark'],
      priceMaxAgeMilliseconds: 172_800_000,
    });
    expect(result.records[0]?.status).toBe('open');
    expect(result.summary.metrics.realizedPnl).toMatchObject({ state: 'available', value: '1.7' });
    expect(result.summary.metrics.fees).toMatchObject({ state: 'available', value: '0.7' });
    expect(result.summary.metrics.unrealizedPnl.state).toBe('unavailable');
    expect(result.summary.metrics.netPnl.state).toBe('unavailable');
    expect(result.summary.metrics.grossPnl.state).toBe('unavailable');
    expect(result.records[0]?.provenance.markIds).toEqual([]);
  });

  it('does not classify an evidenced zero standalone fee as unknown campaign cost coverage', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', 2);
    await ledger.recordFee(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount: '0',
      kind: 'carrying',
      economicAt: at(3),
      orderingKey: '1',
    });
    await fill(scope, legId, 'sell', '1', '12', 4);
    await close(created.trade.id);
    const result = await report(scope);
    expect(result.summary.metrics.netPnl).toMatchObject({ state: 'available', value: '2' });
    expect(result.summary.metrics.fees).toMatchObject({ state: 'available', value: '0' });
    expect(result.summary.metrics.averageR).toMatchObject({ state: 'available', value: '0.2' });
    expect(result.records[0]?.netPnl.reasons).toEqual([]);
  });

  it('values an older leg with compatible later instrument-version fills and an actual quote-currency mark', async () => {
    const scope = await account(),
      created = await campaign(scope);
    const legId = created.financial.legs[0]!.legId;
    const current = (await catalog.listInstruments(fixture.owner.context)).find(
      (candidate) => candidate.versionId === instrument,
    )!;
    const revised = await catalog.appendInstrumentVersion(
      fixture.owner.context,
      current.id,
      {
        expectedRevision: current.revision,
        reason: 'Publish descriptive metadata with compatible financial conventions',
        quantityUnit: current.quantityUnit,
        quoteCurrencyId: current.quoteCurrencyId,
        settlementCurrencyId: current.settlementCurrencyId,
        multiplier: current.multiplier,
        quantityIncrement: current.quantityIncrement,
        priceIncrement: current.priceIncrement,
        capability: current.capability,
        effectiveAt: '2025-02-01T00:00:00.000001Z',
        metadata: { ...current.metadata, description: 'Reviewed updated exchange metadata' },
      },
      randomUUID(),
    );
    await fill(scope, legId, 'buy', '0.5', '10', 2, {
      instrumentVersionId: revised.versionId,
    });
    const selectedMark = await observations.recordPriceObservation(fixture.owner.context, {
      commandId: randomUUID(),
      instrumentVersionId: revised.versionId,
      currencyId: usd,
      price: '14',
      observedAt: at(20),
      source: 'Analytics compatible version mark',
    });
    const result = await report(scope, {
      priceSourcePriority: ['Analytics compatible version mark'],
    });
    expect(result.records[0]?.status).toBe('open');
    expect(result.summary.metrics.grossPnl).toMatchObject({ state: 'available', value: '2' });
    expect(result.summary.metrics.unrealizedPnl).toMatchObject({ state: 'available', value: '2' });
    expect(result.summary.metrics.netPnl).toMatchObject({ state: 'available', value: '2' });
    expect(result.records[0]?.provenance.instrumentVersionIds).toEqual(
      [instrument, revised.versionId].sort(),
    );
    expect(result.records[0]?.provenance.markIds).toEqual([selectedMark.id]);
  });
});
