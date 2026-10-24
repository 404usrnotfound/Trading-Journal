import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAccountingFixture } from './accounting-fixture.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createAnalyticsServices } from '../../packages/server/src/analytics/service.js';
import { createAccountingReports } from '../../packages/server/src/accounting/report.js';

it('keeps tiny same-currency reports available after 10,001 unrelated historical FX observations', async () => {
  const fixture = await createAccountingFixture();
  try {
    const context = fixture.owner.context;
    const catalog = createCatalogServices(fixture.services);
    const ledger = createFinancialLedger(fixture.services);
    const observations = createFinancialObservations(fixture.services);
    const journal = createJournalServices(fixture.services);
    const initial = '2025-01-01T00:00:00.000001Z';
    const entryAt = '2030-02-01T12:00:00.000001Z';
    const to = '2030-02-02T12:00:00.000001Z';
    const currencies: Record<string, string> = {};
    for (const code of ['USD', 'EUR', 'GBP']) {
      currencies[code] = (
        await catalog.createCurrency(
          context,
          {
            namespace: 'iso:4217',
            code,
            kind: 'fiat',
            unitIdentity: `iso:${code}`,
            name: code,
            displayScale: 2,
            settlementIncrement: '0.01',
            effectiveAt: initial,
          },
          randomUUID(),
        )
      ).id;
    }
    const usd = currencies.USD!;
    const account = await catalog.createAccount(
      context,
      {
        name: 'Audit USD only',
        environment: 'live',
        accountType: 'cash',
        baseCurrencyId: usd,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt: initial,
      },
      randomUUID(),
    );
    const instrument = await catalog.createInstrument(
      context,
      {
        name: 'Audit ordinary USD share',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `audit:${randomUUID()}`,
        quantityUnit: 'share',
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: '1',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'native-linear',
        effectiveAt: initial,
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'delivered',
          shortConvention: 'borrowed-delivery',
          carryCostPolicy: 'explicit-source-charges',
        },
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(context, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: usd,
      kind: 'settled',
    });
    const campaign = await journal.create(
      context,
      {
        title: 'Audit USD campaign',
        classification: 'active-trading',
        legs: [
          {
            accountId: account.id,
            instrumentVersionId: instrument.versionId,
            direction: 'long',
            label: 'USD leg',
          },
        ],
      },
      randomUUID(),
    );
    const execution = await ledger.recordExecution(context, {
      commandId: randomUUID(),
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy',
      quantity: '1',
      price: '10',
      cashBucketId: bucket.id,
      economicAt: entryAt,
      orderingKey: '1',
      costsComplete: true,
    });
    const detailedCampaign = await journal.get(context, campaign.trade.id);
    await ledger.allocateExecution(context, {
      commandId: randomUUID(),
      executionId: execution.id,
      expectedVersion: 1,
      reason: 'Audit scope',
      allocations: [{ tradeLegId: detailedCampaign.financial.legs[0]!.legId, quantity: '1' }],
    });
    await observations.recordPriceObservation(context, {
      commandId: randomUUID(),
      instrumentVersionId: instrument.versionId,
      currencyId: usd,
      price: '10',
      observedAt: to,
      source: 'manual',
    });
    const query = {
      accountIds: [account.id],
      reportingCurrencyId: usd,
      from: initial,
      to,
      fxPolicy: { id: 'audit-usd', maxAgeMilliseconds: 1000, sourcePriority: ['manual'] },
      priceMaxAgeMilliseconds: 1000,
      priceSourcePriority: ['manual'],
    };
    const accounting = createAccountingReports(fixture.services);
    const analytics = createAnalyticsServices(fixture.services);
    const beforeAccounting = await accounting.report(fixture.viewer.context, query);
    const beforeAnalytics = await analytics.report(fixture.viewer.context, query);
    expect(beforeAnalytics.records).toHaveLength(1);
    // Seed valid unrelated observations through ordinary SQL constraints in this
    // disposable owned fixture. No trigger or authorization guard is disabled.
    await fixture.admin.pool.query(
      `INSERT INTO app.fx_observations(workspace_id,id,actor_id,origin,base_currency_id,quote_currency_id,rate_raw,observed_at,source,payload)
    SELECT $1::uuid,gen_random_uuid(),$2,'provider',$3::uuid,$4::uuid,'0.9',
      '2026-01-01T00:00:00Z'::timestamptz + g * interval '1 second','unrelated-provider','{}'::jsonb
    FROM generate_series(1,10001) g`,
      [context.workspaceId, context.actorId, currencies.EUR, currencies.GBP],
    );
    const afterAccounting = await accounting.report(fixture.viewer.context, query);
    const afterAnalytics = await analytics.report(fixture.viewer.context, {
      ...query,
      metadataAsOf: beforeAnalytics.context.metadataAsOf,
    });
    expect(afterAccounting).toEqual(beforeAccounting);
    expect({
      ...afterAnalytics,
      context: { ...afterAnalytics.context, recordedAt: 'volatile' },
    }).toEqual({
      ...beforeAnalytics,
      context: { ...beforeAnalytics.context, recordedAt: 'volatile' },
    });
  } finally {
    await fixture.cleanup();
  }
}, 30000);
