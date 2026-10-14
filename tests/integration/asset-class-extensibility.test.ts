import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@journal/database';
import { importMappingSchema, journalDocumentSchema } from '@journal/contracts';
import { sumDecimals } from '@journal/domain';
import {
  createCatalogServices,
  createFinancialLedger,
  createFinancialObservations,
  createImportServices,
} from '@journal/server';
import { createAccountingReports } from '../../packages/server/src/accounting/report.js';
import { createAnalyticsServices } from '../../packages/server/src/analytics/service.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import type {
  CreateInstrumentInput,
  InstrumentDto,
} from '../../packages/server/src/financial/catalog-types.js';
import type { ExecutionInput } from '../../packages/server/src/financial/ledger-types.js';
import { createAccountingFixture } from './accounting-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
const at = (day: number) => `2030-03-${String(day).padStart(2, '0')}T12:00:00.000001Z`;
const source = 'Asset accounting audit';
type Scope = { id: string; bucket: string };

describe('asset-class boundaries against immutable financial facts in real PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let journal: ReturnType<typeof createJournalServices>;
  let reports: ReturnType<typeof createAccountingReports>;
  let analytics: ReturnType<typeof createAnalyticsServices>;
  let usd: string;
  let eur: string;
  const ctx = () => fixture.owner.context;

  beforeAll(async () => {
    fixture = await createAccountingFixture();
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    observations = createFinancialObservations(fixture.services);
    journal = createJournalServices(fixture.services);
    reports = createAccountingReports(fixture.services);
    analytics = createAnalyticsServices(fixture.services);
    for (const code of ['USD', 'EUR']) {
      const currency = await catalog.createCurrency(
        ctx(),
        {
          namespace: 'iso:4217',
          code,
          name: code,
          kind: 'fiat',
          unitIdentity: `iso:${code}`,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt,
        },
        randomUUID(),
      );
      if (code === 'USD') usd = currency.id;
      else eur = currency.id;
    }
  });
  afterAll(async () => fixture?.cleanup());

  async function instrument(changes: Partial<CreateInstrumentInput> = {}) {
    return catalog.createInstrument(
      ctx(),
      {
        name: `Asset audit ${randomUUID()}`,
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `asset-audit:${randomUUID()}`,
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
        ...changes,
      },
      randomUUID(),
    );
  }
  async function account(): Promise<Scope> {
    const created = await catalog.createAccount(
      ctx(),
      {
        name: `Asset audit account ${randomUUID()}`,
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
    const bucket = await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: created.id,
      currencyId: usd,
      kind: 'settled',
    });
    return { id: created.id, bucket: bucket.id };
  }
  async function fund(scope: Scope, amount: string) {
    await ledger.recordCashMovement(ctx(), {
      commandId: randomUUID(),
      accountId: scope.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount,
      kind: 'deposit',
      economicAt: at(1),
      orderingKey: '1',
    });
  }
  async function fill(
    scope: Scope,
    metadata: InstrumentDto,
    side: 'buy' | 'sell',
    quantity: string,
    price: string | null,
    day: number,
    fee = '0',
    extra: Partial<ExecutionInput> = {},
    legId?: string,
  ) {
    const result = await ledger.recordExecution(ctx(), {
      commandId: randomUUID(),
      accountId: scope.id,
      instrumentVersionId: metadata.versionId,
      side,
      quantity,
      price,
      cashBucketId: scope.bucket,
      economicAt: at(day),
      orderingKey: '1',
      costsComplete: true,
      ...(fee === '0'
        ? {}
        : {
            fees: [
              { cashBucketId: scope.bucket, currencyId: usd, amount: fee, kind: 'commission' },
            ],
          }),
      ...extra,
    });
    if (legId)
      await ledger.allocateExecution(ctx(), {
        commandId: randomUUID(),
        executionId: result.id,
        expectedVersion: 1,
        reason: 'Reviewed actual source attribution',
        allocations: [{ tradeLegId: legId, quantity }],
      });
    return result;
  }
  const query = (scope: Scope) => ({
    accountIds: [scope.id],
    reportingCurrencyId: usd,
    from: effectiveAt,
    to: at(10),
    fxPolicy: {
      id: 'asset-audit/1',
      maxAgeMilliseconds: 31 * 86_400_000,
      sourcePriority: [source],
    },
    priceMaxAgeMilliseconds: 31 * 86_400_000,
    priceSourcePriority: [source],
  });
  async function mark(metadata: InstrumentDto, price: string) {
    return observations.recordPriceObservation(ctx(), {
      commandId: randomUUID(),
      instrumentVersionId: metadata.versionId,
      currencyId: usd,
      price,
      observedAt: at(10),
      source,
    });
  }
  async function campaign(scope: Scope, metadata: InstrumentDto) {
    const created = await journal.create(
      ctx(),
      {
        title: `Asset audit campaign ${randomUUID()}`,
        classification: 'active-trading',
        legs: [
          {
            accountId: scope.id,
            instrumentVersionId: metadata.versionId,
            direction: 'long',
            label: 'Recorded asset',
          },
        ],
      },
      randomUUID(),
    );
    const saved = await journal.save(
      ctx(),
      created.trade.id,
      {
        expectedRevision: created.journal.revision,
        document: journalDocumentSchema.parse({
          plan: {
            initialRisk: { amount: '100', currencyId: usd, method: 'Explicit initial cash risk' },
          },
        }),
      },
      randomUUID(),
    );
    await journal.publishPlan(
      ctx(),
      created.trade.id,
      {
        expectedRevision: saved.revision,
        expectedTradeRevision: created.trade.revision,
        reason: 'Persist the original plan before economic executions.',
      },
      randomUUID(),
    );
    return journal.get(ctx(), created.trade.id);
  }
  const money = (metric: { state: string; value: string | null }, amount: string) =>
    expect(metric).toMatchObject({ state: 'available', value: amount });

  it.each([
    {
      label: 'stocks',
      metadata: { family: 'stock', subtype: 'ordinary-share' },
      deposit: '500',
      buys: [['1.25', '80', '0.5']],
      sale: ['0.5', '100', '0.2'],
      mark: '90',
      quantity: '0.75',
      basis: '60',
      net: '9.6',
      cash: '449.3',
      holdings: '67.5',
      equity: '516.8',
    },
    {
      label: 'ETFs',
      metadata: { family: 'etf', subtype: 'ordinary-etf' },
      deposit: '1000',
      buys: [
        ['2.4', '125', '1.2'],
        ['1.6', '150', '0.8'],
      ],
      sale: ['3', '160', '1.5'],
      mark: '155',
      quantity: '1',
      basis: '150',
      net: '87',
      cash: '936.5',
      holdings: '155',
      equity: '1091.5',
    },
    {
      label: 'non-rebasing spot crypto',
      metadata: {
        family: 'crypto_spot',
        subtype: 'non-rebasing-spot',
        quantityUnit: 'token',
        quantityIncrement: '0.000000000000000001',
        priceIncrement: '1',
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'delivered',
          rebasing: false,
          network: 'fixture-chain',
          contractAddress: 'fixture-token',
        },
      },
      deposit: '10',
      buys: [['0.000000000000000003', '1000000000000000000', '0.03']],
      sale: ['0.000000000000000001', '2000000000000000000', '0.01'],
      mark: '1500000000000000000',
      quantity: '0.000000000000000002',
      basis: '2',
      net: '0.98',
      cash: '8.96',
      holdings: '3',
      equity: '11.96',
    },
  ] satisfies readonly {
    label: string;
    metadata: Partial<CreateInstrumentInput>;
    deposit: string;
    buys: string[][];
    sale: string[];
    mark: string;
    quantity: string;
    basis: string;
    net: string;
    cash: string;
    holdings: string;
    equity: string;
  }[])(
    '$label: independently calculated cash, FIFO basis, realized result and equity survive persistence',
    async (example) => {
      const scope = await account(),
        metadata = await instrument(example.metadata);
      await fund(scope, example.deposit);
      for (const [index, buy] of example.buys.entries())
        await fill(scope, metadata, 'buy', buy[0]!, buy[1]!, index + 2, buy[2]!);
      await fill(scope, metadata, 'sell', example.sale[0]!, example.sale[1]!, 5, example.sale[2]!);
      await mark(metadata, example.mark);
      const position = (await ledger.positions(ctx(), { accountId: scope.id }))[0]!;
      expect(position.inventory.openQuantity).toMatchObject({
        status: 'available',
        value: example.quantity,
      });
      expect(position.inventory.grossBasis.value).toBe(example.basis);
      expect(position.inventory.realizedNet.value).toBe(example.net);
      expect(
        (await ledger.executions(ctx(), { accountId: scope.id }))[0]!.instrumentVersionId,
      ).toBe(metadata.versionId);
      const report = await reports.report(fixture.viewer.context, query(scope));
      money(report.closing.cash, example.cash);
      money(report.closing.holdings, example.holdings);
      money(report.closing.equity, example.equity);
      money(report.closing.netLiquidationValue, example.equity);
      money(report.reconciliation.variance, '0');
    },
  );

  it('delivered forex stores both actual cash legs and its fee without inventing a pair holding', async () => {
    const scope = await account();
    await fund(scope, '1000');
    const destination = await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: scope.id,
      currencyId: eur,
      kind: 'settled',
    });
    await observations.recordFxObservation(ctx(), {
      commandId: randomUUID(),
      baseCurrencyId: eur,
      quoteCurrencyId: usd,
      rate: '1.25',
      observedAt: at(3),
      source,
    });
    await ledger.recordFxConversion(ctx(), {
      commandId: randomUUID(),
      sourceBucketId: scope.bucket,
      destinationBucketId: destination.id,
      sourceAmount: '125',
      destinationAmount: '100',
      rate: '0.8',
      economicAt: at(3),
      orderingKey: '2',
      fees: [{ cashBucketId: scope.bucket, currencyId: usd, amount: '1', kind: 'conversion' }],
    });
    const balances = await ledger.cashBalances(ctx(), { accountIds: [scope.id] });
    expect(balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currencyId: usd, amount: '874' }),
        expect.objectContaining({ currencyId: eur, amount: '100' }),
      ]),
    );
    expect(await ledger.positions(ctx(), { accountId: scope.id })).toEqual([]);
    const report = await reports.report(ctx(), query(scope));
    money(report.closing.cash, '999');
    money(report.closing.holdings, '0');
    money(report.closing.netLiquidationValue, '999');
    money(report.breakdown.conversionEffects, '0');
    money(report.breakdown.fees, '1');
    money(report.reconciliation.variance, '0');
  });

  const manualExamples = () =>
    [
      {
        family: 'option',
        subtype: 'equity-option',
        unit: 'contract',
        multiplier: '100',
        price: '1.5',
        quantity: '2',
        principal: '300',
        actualCash: '-300',
        fee: '2',
        deposit: '1000',
        cash: '698',
        metadata: {
          priceConvention: 'premium-per-underlying-unit',
          settlementStyle: 'premium',
          option: {
            putCall: 'call',
            strike: '50',
            expiry: '2030-06-21',
            exerciseStyle: 'american',
            settlementStyle: 'physical',
            deliverable: { instrumentIdentity: 'fixture:underlying', quantity: '100' },
          },
        },
      },
      {
        family: 'future',
        subtype: 'linear-future',
        unit: 'contract',
        multiplier: '50',
        price: '5000',
        quantity: '2',
        principal: null,
        actualCash: '1500',
        fee: '5',
        deposit: '10000',
        cash: '11495',
        metadata: {
          priceConvention: 'points',
          settlementStyle: 'variation-margin',
          future: {
            expiry: '2030-06-21',
            tickSize: '0.25',
            tickValue: '12.5',
            variationMargin: 'daily-cash',
            collateralCurrencyId: usd,
          },
        },
      },
      {
        family: 'bond',
        subtype: 'fixed-rate-bond',
        unit: 'face-value',
        multiplier: '0.01',
        price: '98.5',
        quantity: '1000',
        principal: '997',
        actualCash: '-997',
        fee: '3',
        deposit: '2000',
        cash: '1000',
        metadata: {
          priceConvention: 'percent-of-face',
          settlementStyle: 'dirty-price',
          bond: {
            faceCurrencyId: usd,
            couponRate: '0.05',
            maturity: '2035-06-21',
            dayCount: 'actual/actual',
            accruedInterest: '12',
            quotedPrice: 'clean',
          },
        },
      },
      {
        family: 'forex',
        subtype: 'rolling-spot',
        unit: 'base-currency',
        multiplier: null,
        price: '1.25',
        quantity: '100000',
        principal: null,
        actualCash: '-10',
        fee: '2',
        deposit: '1000',
        cash: '988',
        metadata: {
          priceConvention: 'quote-per-base',
          settlementStyle: 'rolling-margin',
          forex: {
            baseCurrencyId: eur,
            quoteCurrencyId: usd,
            financing: 'broker-supplied-actual-cash',
          },
        },
      },
    ] satisfies readonly {
      family: string;
      subtype: string;
      unit: string;
      multiplier: string | null;
      price: string;
      quantity: string;
      principal: string | null;
      actualCash: string;
      fee: string;
      deposit: string;
      cash: string;
      metadata: NonNullable<CreateInstrumentInput['metadata']>;
    }[];

  it.each(['option', 'future', 'bond', 'forex'])(
    '%s: record-only accounting retains source cash and metadata while withholding automatic monetary claims',
    async (family) => {
      const example = manualExamples().find((candidate) => candidate.family === family)!;
      const scope = await account(),
        metadata = await instrument({
          family,
          subtype: example.subtype,
          quantityUnit: example.unit,
          multiplier: example.multiplier,
          capability: 'manual',
          metadata: example.metadata,
        });
      const created = await campaign(scope, metadata),
        legId = created.financial.legs[0]!.legId;
      await fund(scope, example.deposit);
      const execution = await fill(
        scope,
        metadata,
        'buy',
        example.quantity,
        example.price,
        2,
        example.fee,
        {
          ...(example.principal === null
            ? {}
            : {
                bookedPrincipal: example.principal,
                principalCurrencyId: usd,
                principalReview: {
                  source: 'Broker statement',
                  reason: 'Actual supplied principal, not a derived notional.',
                },
              }),
          manualCashEffects: [
            { cashBucketId: scope.bucket, currencyId: usd, amount: example.actualCash },
          ],
        },
        legId,
      );
      const persisted = (await ledger.executions(ctx(), { accountId: scope.id }))[0]!;
      expect(persisted.id).toBe(execution.id);
      expect(persisted.bookedPrincipal).toBe(example.principal);
      expect(persisted.payload.manualCashEffects).toEqual([
        { cashBucketId: scope.bucket, currencyId: usd, amount: example.actualCash },
      ]);
      expect((await catalog.getInstrument(ctx(), metadata.id)).metadata).toMatchObject(
        example.metadata,
      );
      const position = (await ledger.positions(ctx(), { accountId: scope.id }))[0]!;
      expect(position.inventory.openQuantity).toMatchObject({
        status: 'available',
        value: example.quantity,
      });
      for (const metric of [
        position.inventory.grossBasis,
        position.inventory.netBasis,
        position.inventory.realizedGross,
        position.inventory.realizedNet,
      ])
        expect(metric).toMatchObject({ status: 'unsupported', value: null });
      const detail = await journal.get(ctx(), created.trade.id);
      expect(detail.financial.legs[0]!.openQuantity.value).toBe(example.quantity);
      expect(detail.financial.legs[0]!.realizedNet).toMatchObject({
        status: 'unavailable',
        value: null,
      });
      expect(detail.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
      await mark(metadata, example.price);
      const report = await reports.report(ctx(), query(scope));
      money(report.closing.cash, example.cash);
      expect(report.closing.holdings.value).toBeNull();
      expect(report.closing.equity.value).toBeNull();
      expect(report.closing.netLiquidationValue.value).toBeNull();
      const analysis = await analytics.report(ctx(), { ...query(scope), groupBy: ['assetClass'] });
      expect(analysis.records).toHaveLength(1);
      expect(analysis.records[0]!.netPnl.value).toBeNull();
      expect(analysis.summary.metrics.netPnl.value).toBeNull();
      const actualCash = await ledger.cashBalances(ctx(), { accountIds: [scope.id] });
      expect(sumDecimals(actualCash.map((balance) => balance.amount))).toBe(example.cash);
      const current = await catalog.getTrade(ctx(), created.trade.id);
      expect(current.status).not.toBe('closed');
      await expect(
        catalog.confirmTradeClosure(
          ctx(),
          current.id,
          {
            expectedRevision: current.revision,
            reason: 'Price alone is not contract lifecycle evidence.',
            obligationEvidence: 'Recorded contract still open.',
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'CAMPAIGN_HAS_OPEN_EXPOSURE' });
    },
  );

  it.each(['option', 'future', 'bond', 'forex'])(
    '%s cannot opt itself into native stock principal and inventory accounting',
    async (family) => {
      const example = manualExamples().find((candidate) => candidate.family === family)!;
      const before = (
        await fixture.admin.pool.query(
          'SELECT count(*)::text AS count FROM app.instrument_versions WHERE workspace_id=$1',
          [ctx().workspaceId],
        )
      ).rows;
      await expect(
        instrument({
          family,
          subtype: example.subtype,
          quantityUnit: example.unit,
          multiplier: example.multiplier ?? '1',
          capability: 'native-linear',
          metadata: example.metadata,
        }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
      const after = (
        await fixture.admin.pool.query(
          'SELECT count(*)::text AS count FROM app.instrument_versions WHERE workspace_id=$1',
          [ctx().workspaceId],
        )
      ).rows;
      expect(after).toEqual(before);
    },
  );

  it('specialized option metadata is versioned immutably without rewriting the source execution', async () => {
    const scope = await account(),
      original = await instrument({
        family: 'option',
        subtype: 'equity-option',
        capability: 'manual',
        quantityUnit: 'contract',
        multiplier: '100',
        metadata: {
          priceConvention: 'premium-per-underlying-unit',
          settlementStyle: 'premium',
          option: {
            strike: '50',
            putCall: 'call',
            expiry: '2030-06-21',
            deliverableQuantity: '100',
          },
        },
      });
    const execution = await fill(scope, original, 'buy', '1', '2', 2);
    const revised = await catalog.appendInstrumentVersion(
      ctx(),
      original.id,
      {
        expectedRevision: original.revision,
        reason: 'Correct additional reviewed descriptive contract terms.',
        quantityUnit: original.quantityUnit,
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: original.multiplier,
        quantityIncrement: original.quantityIncrement,
        priceIncrement: original.priceIncrement,
        capability: 'manual',
        effectiveAt: at(3),
        metadata: {
          ...original.metadata,
          option: {
            strike: '50',
            putCall: 'call',
            expiry: '2030-06-21',
            deliverableQuantity: '100',
            exerciseStyle: 'american',
          },
        },
      },
      randomUUID(),
    );
    expect(revised.version).toBe(2);
    const versions = await fixture.admin.pool.query<{ id: string; metadata: unknown }>(
      'SELECT id,payload AS metadata FROM app.instrument_versions WHERE workspace_id=$1 AND instrument_id=$2 ORDER BY version',
      [ctx().workspaceId, original.id],
    );
    expect(versions.rows).toEqual([
      { id: original.versionId, metadata: original.metadata },
      { id: revised.versionId, metadata: revised.metadata },
    ]);
    expect(
      (await ledger.executions(ctx(), { accountId: scope.id })).find(
        (row) => row.id === execution.id,
      )?.instrumentVersionId,
    ).toBe(original.versionId);
    await expect(
      fixture.services.withWorkspaceContext(ctx(), (tx) =>
        tx.execute(
          sql`UPDATE app.instrument_versions SET payload='{}'::jsonb WHERE workspace_id=${ctx().workspaceId}::uuid AND id=${original.versionId}::uuid`,
        ),
      ),
    ).rejects.toThrow();
    expect(
      (
        await fixture.admin.pool.query(
          'SELECT payload AS metadata FROM app.instrument_versions WHERE workspace_id=$1 AND id=$2',
          [ctx().workspaceId, original.versionId],
        )
      ).rows[0]!.metadata,
    ).toEqual(original.metadata);
  });

  it('manual option with unknown multiplier remains reviewable and never produces monetary R', async () => {
    const scope = await account(),
      metadata = await instrument({
        family: 'option',
        subtype: 'equity-option',
        capability: 'manual',
        quantityUnit: 'contract',
        multiplier: null,
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'manual',
          option: { expiry: '2030-06-21', deliverable: 'unknown' },
        },
      });
    const created = await campaign(scope, metadata),
      legId = created.financial.legs[0]!.legId;
    await fill(
      scope,
      metadata,
      'buy',
      '1',
      '2',
      2,
      '0',
      {
        manualCashEffects: [{ cashBucketId: scope.bucket, currencyId: usd, amount: '-200' }],
      },
      legId,
    );
    const detail = await journal.get(ctx(), created.trade.id);
    expect(detail.financial.legs[0]!.openQuantity.value).toBe('1');
    expect(detail.financial.legs[0]!.actualEntry).toMatchObject({
      status: 'available',
      value: '2',
      currencyId: usd,
    });
    expect(detail.financial.legs[0]!.realizedNet.value).toBeNull();
    expect(detail.financial.rMultiple.value).toBeNull();
    expect((await ledger.cashBalances(ctx(), { accountIds: [scope.id] }))[0]!.amount).toBe('-200');
  });

  it('journal refuses to average incompatible unit-price and percentage-of-face source quotes', async () => {
    const scope = await account(),
      original = await instrument({
        family: 'bond',
        subtype: 'fixed-rate-bond',
        capability: 'manual',
        quantityUnit: 'face-value',
        multiplier: '1',
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'manual',
          bond: { faceCurrencyId: usd },
        },
      });
    const created = await campaign(scope, original),
      legId = created.financial.legs[0]!.legId;
    await fill(scope, original, 'buy', '100', '0.98', 2, '0', {}, legId);
    const revised = await catalog.appendInstrumentVersion(
      ctx(),
      original.id,
      {
        expectedRevision: original.revision,
        reason: 'Record the broker quote units explicitly.',
        quantityUnit: original.quantityUnit,
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: '1',
        quantityIncrement: original.quantityIncrement,
        priceIncrement: original.priceIncrement,
        capability: 'manual',
        effectiveAt: at(3),
        metadata: {
          priceConvention: 'percent-of-face',
          settlementStyle: 'manual',
          bond: { faceCurrencyId: usd },
        },
      },
      randomUUID(),
    );
    await fill(scope, revised, 'buy', '100', '98', 4, '0', {}, legId);
    const detail = await journal.get(ctx(), created.trade.id);
    expect(detail.financial.legs[0]!.actualEntry).toMatchObject({
      status: 'unavailable',
      value: null,
    });
    expect(detail.financial.legs[0]!.actualEntry.reasons).toContain('incompatible_price_units');
    expect(detail.financial.legs[0]!.openQuantity.value).toBe('200');
    expect(detail.financial.rMultiple.value).toBeNull();
  });

  it('a manual bond percentage quote keeps its convention label instead of being presented as currency per face unit', async () => {
    const scope = await account(),
      metadata = await instrument({
        family: 'bond',
        subtype: 'fixed-rate-bond',
        capability: 'manual',
        quantityUnit: 'face-value',
        multiplier: '0.01',
        metadata: {
          priceConvention: 'percentage-of-face',
          settlementStyle: 'dirty-price',
          bond: { faceCurrencyId: usd },
        },
      });
    const created = await campaign(scope, metadata);
    await fill(scope, metadata, 'buy', '1000', '98', 2, '0', {}, created.financial.legs[0]!.legId);
    const detail = await journal.get(ctx(), created.trade.id);
    expect(detail.financial.legs[0]!.actualEntry).toMatchObject({
      status: 'available',
      value: '98',
      unit: 'quote/percentage-of-face',
      currencyId: null,
    });
    expect(detail.financial.legs[0]!.realizedNet.value).toBeNull();
    expect(detail.financial.rMultiple.value).toBeNull();
  });

  it.each([
    { label: 'missing', priceConvention: undefined },
    { label: 'oversized', priceConvention: 'x'.repeat(201) },
  ])(
    'a manual source price with a $label quote convention remains explicitly unavailable',
    async ({ priceConvention }) => {
      const scope = await account(),
        metadata = await instrument({
          family: 'bond',
          subtype: 'fixed-rate-bond',
          capability: 'manual',
          quantityUnit: 'face-value',
          multiplier: null,
          metadata: {
            settlementStyle: 'manual',
            bond: { faceCurrencyId: usd },
            ...(priceConvention === undefined ? {} : { priceConvention }),
          },
        });
      const created = await campaign(scope, metadata);
      await fill(
        scope,
        metadata,
        'buy',
        '1000',
        '98',
        2,
        '0',
        {},
        created.financial.legs[0]!.legId,
      );
      const detail = await journal.get(ctx(), created.trade.id);
      expect(detail.financial.legs[0]!.actualEntry).toMatchObject({
        status: 'unavailable',
        value: null,
        unit: 'quote/unknown',
      });
      expect(detail.financial.legs[0]!.realizedNet.value).toBeNull();
    },
  );

  it('explicit reviewed closure of flat manual contract quantities does not enable unsupported option performance', async () => {
    const scope = await account(),
      metadata = await instrument({
        family: 'option',
        subtype: 'equity-option',
        capability: 'manual',
        quantityUnit: 'contract',
        multiplier: '100',
        metadata: { priceConvention: 'premium-per-underlying-unit', settlementStyle: 'premium' },
      });
    const created = await campaign(scope, metadata),
      legId = created.financial.legs[0]!.legId;
    await fill(
      scope,
      metadata,
      'buy',
      '1',
      '2',
      2,
      '0',
      { manualCashEffects: [{ cashBucketId: scope.bucket, currencyId: usd, amount: '-200' }] },
      legId,
    );
    await fill(
      scope,
      metadata,
      'sell',
      '1',
      '3',
      3,
      '0',
      { manualCashEffects: [{ cashBucketId: scope.bucket, currencyId: usd, amount: '300' }] },
      legId,
    );
    const before = await journal.get(ctx(), created.trade.id);
    expect(before.trade.status).not.toBe('closed');
    expect(before.financial.legs[0]!.openQuantity.value).toBe('0');
    await catalog.confirmTradeClosure(
      ctx(),
      created.trade.id,
      {
        expectedRevision: before.trade.revision,
        reason: 'Reviewed broker closing execution and settlement evidence.',
        obligationEvidence:
          'Both actual premium cash legs settled; no remaining contract or assignment obligation.',
      },
      randomUUID(),
    );
    const after = await journal.get(ctx(), created.trade.id);
    expect(after.trade.status).toBe('closed');
    expect(after.financial.legs[0]!.realizedNet.value).toBeNull();
    expect(after.financial.rMultiple.value).toBeNull();
    expect((await ledger.cashBalances(ctx(), { accountIds: [scope.id] }))[0]!.amount).toBe('100');
  });

  it('negative futures prices are explicitly rejected, preserving the currently documented representation limit', async () => {
    const scope = await account(),
      metadata = await instrument({
        family: 'future',
        subtype: 'linear-future',
        capability: 'manual',
        quantityUnit: 'contract',
        multiplier: '1000',
        metadata: { priceConvention: 'points', settlementStyle: 'variation-margin' },
      });
    await expect(fill(scope, metadata, 'buy', '1', '-37.63', 2)).rejects.toThrow();
    expect(await ledger.executions(ctx(), { accountId: scope.id })).toEqual([]);
    expect(await ledger.cashBalances(ctx(), { accountIds: [scope.id] })).toEqual([
      expect.objectContaining({ amount: '0' }),
    ]);
  });

  it('manual futures opening inventory does not turn a quoted notional into an accounting opening adjustment', async () => {
    const scope = await account(),
      metadata = await instrument({
        family: 'future',
        subtype: 'linear-future',
        capability: 'manual',
        quantityUnit: 'contract',
        multiplier: '50',
        metadata: { priceConvention: 'points', settlementStyle: 'variation-margin' },
      });
    await fund(scope, '10000');
    await ledger.recordOpeningLot(ctx(), {
      commandId: randomUUID(),
      accountId: scope.id,
      instrumentVersionId: metadata.versionId,
      direction: 'long',
      quantity: '2',
      entryPrice: '5000',
      reason: 'Recorded contract quantity, unknown automatic basis.',
      economicAt: at(2),
      orderingKey: '1',
      costsComplete: true,
    });
    await observations.recordPriceObservation(ctx(), {
      commandId: randomUUID(),
      instrumentVersionId: metadata.versionId,
      currencyId: usd,
      price: '5000',
      observedAt: at(2),
      source,
    });
    const report = await reports.report(ctx(), query(scope));
    money(report.closing.cash, '10000');
    expect(report.breakdown.openingAdjustments.value).toBeNull();
    expect(report.breakdown.openingAdjustments.reasons).toContain('unsupported_inventory_module');
    expect(report.breakdown.openingAdjustments.knownSubtotal).not.toBe('500000');
    expect(report.closing.holdings.value).toBeNull();
    expect(report.closing.netLiquidationValue.value).toBeNull();
  });

  it('canonical imports preserve manual option cash evidence without deriving contract notional or enabling native inventory', async () => {
    const scope = await account(),
      metadata = await instrument({
        family: 'option',
        subtype: 'equity-option',
        capability: 'manual',
        quantityUnit: 'contract',
        multiplier: null,
        metadata: {
          priceConvention: 'premium-per-contract',
          settlementStyle: 'manual',
          option: { strike: '50', expiry: '2030-06-21' },
        },
      });
    const imports = createImportServices(fixture.services);
    const payload = {
      instrumentVersionId: metadata.versionId,
      side: 'buy',
      quantity: '1',
      price: '2',
      costsComplete: true,
      economicAt: at(2),
      orderingKey: '1',
      manualCashEffects: [{ cashBucketId: scope.bucket, currencyId: usd, amount: '-200' }],
    };
    const escaped = JSON.stringify(payload).replaceAll('"', '""');
    const batch = await imports.stage(
      ctx(),
      {
        accountId: scope.id,
        namespace: 'asset-audit-broker',
        filename: 'options.csv',
        mapping: importMappingSchema.parse({
          adapterId: 'canonical-csv',
          kind: 'execution',
          fields: [],
        }),
        content: `ID,Key,Kind,Group,Payload\r\noption-fill,option-fill,execution,option-fill,"${escaped}"`,
      },
      randomUUID(),
    );
    const detail = await imports.detail(ctx(), batch.id);
    const preview = await imports.preview(ctx(), batch.id, {
      expectedRevision: detail.batch.revision,
      groups: ['option-fill'],
      corrections: {},
    });
    expect(preview.committable).toBe(true);
    expect(await ledger.executions(ctx(), { accountId: scope.id })).toEqual([]);
    await imports.commit(
      ctx(),
      batch.id,
      { expectedRevision: preview.batchRevision, previewId: preview.id, acceptWarnings: true },
      randomUUID(),
    );
    const execution = (await ledger.executions(ctx(), { accountId: scope.id }))[0]!;
    expect(execution.bookedPrincipal).toBeNull();
    expect(execution.payload.manualCashEffects).toEqual(payload.manualCashEffects);
    expect((await ledger.cashBalances(ctx(), { accountIds: [scope.id] }))[0]!.amount).toBe('-200');
    expect(
      (await ledger.positions(ctx(), { accountId: scope.id }))[0]!.inventory.realizedGross.value,
    ).toBeNull();
  });
});
