import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createSuppliedComponents } from '../../packages/server/src/supplied/service.js';
import { createAccountingFixture } from './accounting-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
const observedAt = '2030-02-02T12:00:00.000001Z';
const fxSource = 'Independent supplied-component boundary FX';

describe('supplied financial value precision and economic boundaries on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let components: ReturnType<typeof createSuppliedComponents>;
  let usd: string;
  let eur: string;
  const context = () => fixture.owner.context;

  beforeAll(async () => {
    fixture = await createAccountingFixture();
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    observations = createFinancialObservations(fixture.services);
    components = createSuppliedComponents(fixture.services);
    for (const code of ['USD', 'EUR']) {
      const created = await catalog.createCurrency(
        context(),
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
      if (code === 'USD') usd = created.id;
      else eur = created.id;
    }
  });

  afterAll(async () => {
    if (!fixture) return;
    const client = await fixture.admin.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query('DELETE FROM app.supplied_components WHERE workspace_id=$1', [
        context().workspaceId,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await fixture.cleanup();
    }
  });

  async function manualScope() {
    const account = await catalog.createAccount(
      context(),
      {
        name: `Independent supplied source ${randomUUID()}`,
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd,
        inventoryMethod: 'fifo',
        holdingMode: 'netted',
        allowShort: true,
        effectiveAt,
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(context(), {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: usd,
      kind: 'settled',
    });
    const instrument = await catalog.createInstrument(
      context(),
      {
        name: `Independent manual future ${randomUUID()}`,
        family: 'future',
        subtype: 'source-settled-future',
        economicIdentity: randomUUID(),
        quantityUnit: 'contract',
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: '1000',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'manual',
        effectiveAt,
        metadata: { priceConvention: 'points', settlementStyle: 'variation-margin' },
      },
      randomUUID(),
    );
    await ledger.recordExecution(context(), {
      commandId: randomUUID(),
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy',
      quantity: '1',
      price: '-37.63',
      economicAt: observedAt,
      orderingKey: '1',
      costsComplete: true,
      manualCashEffects: [],
    });
    return { account, bucket, instrument };
  }

  async function positionSource(
    scope: Awaited<ReturnType<typeof manualScope>>,
    amount: string,
    currencyId: string,
  ) {
    const { sourceRevision } = await components.list(context());
    return components.record(
      context(),
      {
        kind: 'position-equity',
        accountId: scope.account.id,
        instrumentVersionId: scope.instrument.versionId,
        signedQuantity: '1',
        amount,
        currencyId,
        observedAt,
        source: 'Independent verified source',
        sourceReference: 'statement:residual-value-excludes-settled-cash',
        quality: 'manually-verified',
        expectedSourceRevision: sourceRevision,
        valueDefinition: 'residual-contract-equity',
        cashExcluded: true,
        collateralExcluded: true,
        settledPnlExcluded: true,
        unsettledCashExcluded: true,
        accrualTreatment: 'not-applicable',
      },
      randomUUID(),
    );
  }

  function query(scope: Awaited<ReturnType<typeof manualScope>>, componentId: string) {
    return {
      accountIds: [scope.account.id],
      reportingCurrencyId: usd,
      asOf: observedAt,
      suppliedPositionIds: [componentId],
      fxPolicy: { id: 'independent-supplied/1', maxAgeMilliseconds: 0, sourcePriority: [fxSource] },
      priceMaxAgeMilliseconds: 0,
      priceSourcePriority: ['Independent verified source'],
    };
  }

  it('quantizes the derived product of a 36-place residual and an 18-place FX rate while retaining both source values', async () => {
    const scope = await manualScope();
    const rate = '1.000000000000000001';
    const amount = '1.000000000000000000000000000000000001';
    const fx = await observations.recordFxObservation(context(), {
      commandId: randomUUID(),
      baseCurrencyId: eur,
      quoteCurrencyId: usd,
      rate,
      observedAt,
      source: fxSource,
    });
    const selected = await positionSource(scope, amount, eur);
    const result = await observations.valuation(context(), query(scope, selected.id));
    const expected = '1.000000000000000001000000000000000001';
    expect(result.positions[0]?.valuation.markedValue).toMatchObject({
      status: 'available',
      value: amount,
    });
    expect(result.positions[0]?.valuation.reportingMarkedValue).toMatchObject({
      status: 'available',
      value: expected,
    });
    expect(result.nav).toMatchObject({ state: 'available', value: { amount: expected } });
    const original = (await components.list(context(), { accountId: scope.account.id })).items[0]!;
    expect(original.amount).toBe(amount);
    expect(original.sourceInput.amount).toBe(amount);
    expect(
      (
        await fixture.admin.pool.query(
          'SELECT rate_raw FROM app.fx_observations WHERE workspace_id=$1 AND id=$2',
          [context().workspaceId, fx.id],
        )
      ).rows[0]?.rate_raw,
    ).toBe(rate);
  });

  it('keeps the supplied native residual while explaining missing reporting FX', async () => {
    const scope = await manualScope();
    const selected = await positionSource(scope, '100', eur);
    const request = query(scope, selected.id);
    const result = await observations.valuation(context(), {
      ...request,
      fxPolicy: { ...request.fxPolicy, sourcePriority: ['No supplied boundary FX observation'] },
    });
    expect(result.positions[0]?.valuation.markedValue).toMatchObject({
      status: 'available',
      value: '100',
      currencyId: eur,
    });
    expect(result.positions[0]?.valuation.reportingMarkedValue).toMatchObject({
      status: 'unavailable',
      value: null,
      currencyId: usd,
      reasons: expect.arrayContaining(['missing_fx']),
    });
    expect(result.nav).toMatchObject({
      state: 'partial',
      reasons: expect.arrayContaining(['missing_fx']),
    });
  });

  it('reports an evidenced zero residual as reporting zero without FX, consistently with its available NAV', async () => {
    const scope = await manualScope();
    const selected = await positionSource(scope, '0', eur);
    const request = query(scope, selected.id);
    const result = await observations.valuation(context(), {
      ...request,
      fxPolicy: { ...request.fxPolicy, sourcePriority: ['No zero residual FX observation'] },
    });
    expect(result.nav).toMatchObject({ state: 'available', value: { amount: '0' } });
    expect(result.positions[0]?.valuation.reportingMarkedValue).toMatchObject({
      status: 'available',
      value: '0',
      currencyId: usd,
      reasons: [],
    });
  });

  it('keeps a valid supplied residual and returns explained unavailability when its reporting product overflows', async () => {
    const scope = await manualScope();
    const amount = '999999999999999999999999999999999999999999';
    const source = `${fxSource} overflow`;
    await observations.recordFxObservation(context(), {
      commandId: randomUUID(),
      baseCurrencyId: eur,
      quoteCurrencyId: usd,
      rate: '2',
      observedAt,
      source,
    });
    const selected = await positionSource(scope, amount, eur);
    const request = query(scope, selected.id);
    const result = await observations.valuation(context(), {
      ...request,
      fxPolicy: { ...request.fxPolicy, sourcePriority: [source] },
    });
    expect(result.positions[0]?.valuation.markedValue).toMatchObject({
      status: 'available',
      value: amount,
    });
    expect(result.positions[0]?.valuation.reportingMarkedValue).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: expect.arrayContaining(['numeric_overflow']),
    });
    expect(result.nav).toMatchObject({
      state: 'partial',
      reasons: expect.arrayContaining(['numeric_overflow']),
    });
  });

  it('rejects a supplied campaign result one microsecond before its assigned execution and accepts the exact boundary', async () => {
    const scope = await manualScope();
    const journal = createJournalServices(fixture.services);
    const trade = await journal.create(
      context(),
      {
        title: 'Independent microsecond campaign boundary',
        classification: 'active-trading',
        legs: [
          {
            accountId: scope.account.id,
            instrumentVersionId: scope.instrument.versionId,
            direction: 'long',
            label: 'Source quantity',
          },
        ],
      },
      randomUUID(),
    );
    const boundary = '2030-02-03T12:00:00.000002Z';
    const execution = await ledger.recordExecution(context(), {
      commandId: randomUUID(),
      accountId: scope.account.id,
      instrumentVersionId: scope.instrument.versionId,
      side: 'buy',
      quantity: '1',
      price: '-37.63',
      economicAt: boundary,
      orderingKey: '1',
      costsComplete: true,
      manualCashEffects: [],
    });
    await ledger.allocateExecution(context(), {
      commandId: randomUUID(),
      executionId: execution.id,
      expectedVersion: 1,
      reason: 'Actual source execution attribution',
      allocations: [{ tradeLegId: trade.financial.legs[0]!.legId, quantity: '1' }],
    });
    const { sourceRevision } = await components.list(context());
    const source = {
      kind: 'campaign-net-result',
      tradeId: trade.trade.id,
      amount: '12',
      currencyId: usd,
      source: 'Independent verified source',
      sourceReference: 'statement:campaign-lifetime-net',
      quality: 'manually-verified',
      expectedSourceRevision: sourceRevision,
      resultDefinition: 'lifetime-total-net',
      costsComplete: true,
    };
    await expect(
      components.record(
        context(),
        { ...source, observedAt: '2030-02-03T12:00:00.000001Z' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    const accepted = await components.record(
      context(),
      { ...source, observedAt: boundary },
      randomUUID(),
    );
    expect((await components.list(context(), { tradeId: trade.trade.id })).items).toEqual([
      expect.objectContaining({ id: accepted.id, observedAt: boundary }),
    ]);
  });
});
