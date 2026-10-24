import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accountingReportResponseSchema,
  analyticsReportResponseSchema,
  financialValuationResponseSchema,
  suppliedComponentCreateSchema,
} from '@journal/contracts';
import {
  createCatalogServices,
  createFinancialLedger,
  createFinancialObservations,
  createAccountingReports,
  createAnalyticsServices,
  createNativeSnapshotServices,
} from '@journal/server';
import { createSuppliedComponents } from '../../packages/server/src/supplied/service.js';
import { createSuppliedApi } from '../../packages/server/src/supplied/api.js';
import { createPortabilityServices } from '../../packages/server/src/portability/service.js';
import { createPrivateFileStore } from '@journal/server/storage';
import { createAccountingFixture, accountingTestOrigin as origin } from './accounting-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z',
  entryAt = '2025-02-01T00:00:00.000001Z',
  observedAt = '2025-02-02T00:00:00.000002Z';
describe('explicit supplied values preserve manual source evidence on restricted PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>,
    catalog: ReturnType<typeof createCatalogServices>,
    ledger: ReturnType<typeof createFinancialLedger>,
    supplied: ReturnType<typeof createSuppliedComponents>,
    observations: ReturnType<typeof createFinancialObservations>;
  let usd: string,
    account: string,
    manual: string,
    native: string,
    bucket: string,
    componentId: string;
  const policy = {
    id: 'supplied-test',
    maxAgeMilliseconds: 86400000,
    sourcePriority: ['supplied-test'],
  };
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    supplied = createSuppliedComponents(fixture.services);
    observations = createFinancialObservations(fixture.services);
    const owner = fixture.owner.context;
    usd = (
      await catalog.createCurrency(
        owner,
        {
          namespace: 'iso',
          code: 'USD',
          kind: 'fiat',
          unitIdentity: 'iso:USD',
          name: 'US dollar',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt,
        },
        randomUUID(),
      )
    ).id;
    account = (
      await catalog.createAccount(
        owner,
        {
          name: 'Manual futures account',
          environment: 'paper',
          accountType: 'margin',
          baseCurrencyId: usd,
          inventoryMethod: 'fifo',
          allowShort: true,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      )
    ).id;
    for (const capability of ['manual', 'native-linear'] as const) {
      const instrument = await catalog.createInstrument(
        owner,
        {
          name: capability,
          family: capability === 'manual' ? 'future' : 'stock',
          subtype: capability === 'manual' ? 'source-settled-future' : 'ordinary-share',
          economicIdentity: randomUUID(),
          quantityUnit: capability === 'manual' ? 'contract' : 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
          multiplier: '1',
          quantityIncrement: '1',
          priceIncrement: '0.01',
          capability,
          effectiveAt,
          metadata: {
            priceConvention: 'unit-price',
            settlementStyle: capability === 'manual' ? 'explicit-source-settlement' : 'delivered',
          },
        },
        randomUUID(),
      );
      if (capability === 'manual') manual = instrument.versionId;
      else native = instrument.versionId;
    }
    bucket = (
      await ledger.createCashBucket(owner, {
        commandId: randomUUID(),
        accountId: account,
        currencyId: usd,
        kind: 'settled',
      })
    ).id;
    await ledger.recordCashMovement(owner, {
      commandId: randomUUID(),
      accountId: account,
      cashBucketId: bucket,
      currencyId: usd,
      amount: '100',
      kind: 'deposit',
      economicAt: entryAt,
      orderingKey: '0',
    });
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: account,
      instrumentVersionId: manual,
      side: 'buy',
      quantity: '2',
      price: '-37.63',
      economicAt: entryAt,
      orderingKey: '1',
      costsComplete: true,
      manualCashEffects: [{ cashBucketId: bucket, currencyId: usd, amount: '5' }],
    });
  });
  afterAll(async () => {
    await Promise.all([fixture?.services.close(), fixture?.admin.close()]);
  });
  async function input(extra: Record<string, unknown> = {}) {
    return suppliedComponentCreateSchema.parse({
      kind: 'position-equity',
      accountId: account,
      instrumentVersionId: manual,
      signedQuantity: '2',
      amount: '7',
      currencyId: usd,
      observedAt,
      source: 'supplied-test',
      sourceReference: 'Statement line: residual contract equity excludes settled variation margin',
      quality: 'broker-reported',
      expectedSourceRevision: (await supplied.list(fixture.owner.context)).sourceRevision,
      valueDefinition: 'residual-contract-equity',
      cashExcluded: true,
      collateralExcluded: true,
      settledPnlExcluded: true,
      unsettledCashExcluded: true,
      accrualTreatment: 'not-applicable',
      ...extra,
    });
  }
  const query = () => ({
    accountIds: [account],
    reportingCurrencyId: usd,
    asOf: observedAt,
    fxPolicy: policy,
    priceMaxAgeMilliseconds: 86400000,
    priceSourcePriority: ['supplied-test'],
  });
  it('requires exact reviewed source scope and never permits supplied native overrides', async () => {
    const before = (await supplied.list(fixture.owner.context)).sourceRevision;
    await expect(
      supplied.record(fixture.owner.context, await input({ signedQuantity: '3' }), randomUUID()),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      supplied.record(
        fixture.owner.context,
        await input({ instrumentVersionId: native }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      supplied.record(
        fixture.owner.context,
        await input({ observedAt: effectiveAt, amount: '7', signedQuantity: '0' }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    expect((await supplied.list(fixture.owner.context)).sourceRevision).toBe(before);
  });
  it('includes residual position equity once beside actual settled cash and preserves unavailable automatic P&L', async () => {
    const body = await input(),
      id = randomUUID();
    const recorded = await supplied.record(fixture.editor.context, body, id);
    componentId = recorded.id;
    expect(await supplied.record(fixture.editor.context, body, id)).toEqual(recorded);
    const nativeOnly = await observations.valuation(fixture.viewer.context, query());
    expect(nativeOnly.nav.state).toBe('partial');
    const result = financialValuationResponseSchema.parse(
      await observations.valuation(fixture.viewer.context, {
        ...query(),
        suppliedPositionIds: [componentId],
      }),
    );
    expect(result.nav).toMatchObject({ state: 'available', value: { amount: '112' } });
    expect(result.positions[0]?.valuation?.markedValue).toMatchObject({
      status: 'available',
      value: '7',
    });
    expect(result.positions[0]?.valuation?.unrealizedGross.status).toBe('unsupported');
    expect(result.positions[0]?.suppliedValue).toMatchObject({
      id: componentId,
      quality: 'broker-reported',
      definitionVersion: 'residual-position-equity/1',
    });
    const report = accountingReportResponseSchema.parse(
      await createAccountingReports(fixture.services).report(fixture.viewer.context, {
        accountIds: [account],
        reportingCurrencyId: usd,
        from: entryAt,
        to: observedAt,
        fxPolicy: policy,
        priceMaxAgeMilliseconds: 86400000,
        priceSourcePriority: ['supplied-test'],
        suppliedPositionIds: [componentId],
      }),
    );
    expect(report.closing.equity).toMatchObject({ state: 'available', value: '112' });
    expect(report.dependencies.suppliedValues?.[0]).toMatchObject({
      id: componentId,
      signedQuantity: '2',
      settledPnlExcluded: true,
    });
    const opening = await supplied.record(
      fixture.owner.context,
      await input({ observedAt: entryAt, amount: '5' }),
      randomUUID(),
    );
    const complete = accountingReportResponseSchema.parse(
      await createAccountingReports(fixture.services).report(fixture.viewer.context, {
        accountIds: [account],
        reportingCurrencyId: usd,
        from: entryAt,
        to: observedAt,
        fxPolicy: policy,
        priceMaxAgeMilliseconds: 86400000,
        priceSourcePriority: ['supplied-test'],
        suppliedPositionIds: [opening.id, componentId],
      }),
    );
    expect(complete.opening.equity).toMatchObject({ state: 'available', value: '110' });
    expect(complete.closing.equity).toMatchObject({ state: 'available', value: '112' });
    expect(complete.reconciliation.performance).toMatchObject({ state: 'available', value: '2' });
    expect(complete.breakdown.tradingPnl.state).not.toBe('available');
  });
  it('allows projection refresh without invalidating source evidence and rejects another tenant or viewer mutation', async () => {
    await createNativeSnapshotServices(fixture.services).refresh(
      fixture.owner.context,
      { reason: 'Rebuild a derived projection only' },
      randomUUID(),
    );
    expect(
      (
        await observations.valuation(fixture.owner.context, {
          ...query(),
          suppliedPositionIds: [componentId],
        })
      ).nav,
    ).toMatchObject({ state: 'available', value: { amount: '112' } });
    await expect(
      observations.valuation(fixture.outsider.context, {
        ...query(),
        suppliedPositionIds: [componentId],
      }),
    ).rejects.toMatchObject({ status: 404 });
    const api = createSuppliedApi(fixture.services),
      actor = fixture.viewer;
    await expect(
      api(
        new Request(`${origin}/api/v1/workspaces/${account}/supplied-components/observations`, {
          method: 'POST',
          headers: {
            origin,
            cookie: actor.cookie,
            'content-type': 'application/json',
            'x-csrf-token': actor.csrf,
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify(await input()),
        }),
        fixture.owner.context.workspaceId,
        ['observations'],
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('round trips a populated component and its atomic command into an owner rebound empty namespace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'supplied-portable-'));
    try {
      const portable = createPortabilityServices(
        fixture.services,
        createPrivateFileStore(root, { maximumBytes: 1024 * 1024 }),
      );
      const archive = await portable.backup(fixture.owner.context);
      expect(
        archive.tables.find((table) => table.name === 'supplied_components')?.rows,
      ).toHaveLength(2);
      const restored = await portable.restore(
        fixture.outsider.context,
        { name: 'Manual evidence round trip', archive },
        randomUUID(),
      );
      const rebound = await fixture.services.authorizeWorkspace(
        new Request(origin, { headers: { cookie: fixture.outsider.cookie } }),
        restored.workspaceId,
        'owner',
      );
      expect(
        (await supplied.list(rebound)).items.find((value) => value.id === componentId),
      ).toMatchObject({
        id: componentId,
        accountId: account,
        sourceReference:
          'Statement line: residual contract equity excludes settled variation margin',
      });
      const before = await observations.valuation(fixture.owner.context, {
          ...query(),
          suppliedPositionIds: [componentId],
        }),
        after = await observations.valuation(rebound, {
          ...query(),
          suppliedPositionIds: [componentId],
        });
      expect(after.nav).toEqual(before.nav);
      expect(after.positions[0]?.suppliedValue).toEqual(before.positions[0]?.suppliedValue);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects stale reviewed source facts and allows an immutable superseding correction', async () => {
    await ledger.recordCashMovement(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account,
      cashBucketId: bucket,
      currencyId: usd,
      amount: '1',
      kind: 'income',
      economicAt: observedAt,
      orderingKey: '2',
    });
    await expect(
      observations.valuation(fixture.owner.context, {
        ...query(),
        suppliedPositionIds: [componentId],
      }),
    ).rejects.toMatchObject({ code: 'STALE_SUPPLIED_COMPONENT' });
    const replacement = await supplied.record(
      fixture.owner.context,
      await input({ amount: '8', supersedesId: componentId }),
      randomUUID(),
    );
    await expect(
      supplied.record(
        fixture.owner.context,
        await input({ amount: '9', supersedesId: componentId }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SUPERSEDED_SUPPLIED_COMPONENT', status: 409 });
    await expect(
      observations.valuation(fixture.owner.context, {
        ...query(),
        suppliedPositionIds: [componentId],
      }),
    ).rejects.toMatchObject({ code: 'STALE_SUPPLIED_COMPONENT' });
    expect(
      (
        await observations.valuation(fixture.owner.context, {
          ...query(),
          suppliedPositionIds: [replacement.id],
        })
      ).nav,
    ).toMatchObject({ state: 'available', value: { amount: '114' } });
  });
  it('uses a reviewed campaign lifetime net result once in campaign analytics without inventing decomposition or R', async () => {
    const trade = await catalog.createTrade(
      fixture.owner.context,
      { title: 'Source-reported future campaign', classification: 'active-trading' },
      randomUUID(),
    );
    const leg = await catalog.addTradeLeg(
      fixture.owner.context,
      {
        tradeId: trade.id,
        expectedRevision: 1,
        accountId: account,
        instrumentVersionId: manual,
        direction: 'long',
        label: 'Futures source leg',
      },
      randomUUID(),
    );
    const fill = await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account,
      instrumentVersionId: manual,
      side: 'buy',
      quantity: '1',
      price: '-37.63',
      economicAt: observedAt,
      orderingKey: '3',
      costsComplete: true,
    });
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: fill.id,
      expectedVersion: 1,
      reason: 'Explicit source campaign allocation',
      allocations: [{ tradeLegId: leg.id, quantity: '1' }],
    });
    const recorded = await supplied.record(
      fixture.owner.context,
      {
        kind: 'campaign-net-result',
        tradeId: trade.id,
        amount: '-12.345',
        currencyId: usd,
        observedAt,
        source: 'supplied-test',
        sourceReference: 'Broker all-costs lifetime net line',
        quality: 'broker-reported',
        expectedSourceRevision: (await supplied.list(fixture.owner.context)).sourceRevision,
        resultDefinition: 'lifetime-total-net',
        costsComplete: true,
      },
      randomUUID(),
    );
    const report = analyticsReportResponseSchema.parse(
      await createAnalyticsServices(fixture.services).report(fixture.viewer.context, {
        accountIds: [account],
        reportingCurrencyId: usd,
        from: entryAt,
        to: observedAt,
        fxPolicy: policy,
        priceMaxAgeMilliseconds: 86400000,
        priceSourcePriority: ['supplied-test'],
        suppliedCampaignResultIds: [recorded.id],
      }),
    );
    expect(report.records).toHaveLength(1);
    expect(report.records[0]?.netPnl).toMatchObject({ state: 'available', value: '-12.345' });
    expect(report.summary.metrics.netPnl).toMatchObject({ state: 'available', value: '-12.345' });
    expect(report.records[0]?.grossPnl.state).toBe('unavailable');
    expect(report.records[0]?.rMultiple.state).toBe('unavailable');
    expect(report.records[0]?.provenance.suppliedResult).toMatchObject({
      id: recorded.id,
      definitionVersion: 'lifetime-campaign-net-result/1',
    });
  });
});
