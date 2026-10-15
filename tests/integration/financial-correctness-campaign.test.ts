import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as c from '@journal/contracts';
import {
  createAccountingApi,
  createAnalyticsApi,
  createFinancialApi,
  createJournalApi,
  toProblemResponse,
} from '@journal/server';
import {
  createAccountingFixture,
  accountingTestOrigin as origin,
  type AccountingTestActor,
} from './accounting-fixture.js';
import { FINANCIAL_CAMPAIGN as data, campaignAt as at } from '../helpers/financial-campaign.js';

describe('Phase 14 persisted financial correctness campaign', () => {
  let f: Awaited<ReturnType<typeof createAccountingFixture>>;
  let financial: ReturnType<typeof createFinancialApi>;
  let accounting: ReturnType<typeof createAccountingApi>;
  let analytics: ReturnType<typeof createAnalyticsApi>;
  let journals: ReturnType<typeof createJournalApi>;
  let campaign: c.JournalDetailResponse;
  let eur: ReturnType<typeof c.currencyResponseSchema.parse>,
    usd: ReturnType<typeof c.currencyResponseSchema.parse>;
  let account: ReturnType<typeof c.accountResponseSchema.parse>,
    otherAccount: ReturnType<typeof c.accountResponseSchema.parse>;
  let eurBucket: ReturnType<typeof c.cashBucketResponseSchema.parse>,
    usdBucket: ReturnType<typeof c.cashBucketResponseSchema.parse>;
  let instrument: ReturnType<typeof c.instrumentResponseSchema.parse>;
  let order: ReturnType<typeof c.orderResponseSchema.parse>,
    partial: ReturnType<typeof c.orderResponseSchema.parse>,
    filled: ReturnType<typeof c.orderResponseSchema.parse>;
  let portfolio: c.PortfolioMutationResponse;
  let baseline: c.AccountingReportResponse;
  const source = `phase14:${randomUUID()}`;
  const checkpoints: Array<{ label: string; eur: string; usd: string }> = [];
  const retries: Array<{ resource: string; body: unknown; id: string; response: unknown }> = [];
  const fills: ReturnType<typeof c.executionResponseSchema.parse>[] = [];
  const end = at('10');

  async function request(
    resource: string,
    method = 'GET',
    body?: unknown,
    id: string = randomUUID(),
    actor?: AccountingTestActor,
  ) {
    const who = actor ?? f.owner;
    const headers = new Headers({ origin, cookie: who.cookie });
    if (method === 'POST' || method === 'PUT') {
      headers.set('content-type', 'application/json');
      headers.set('x-csrf-token', who.csrf);
      headers.set('idempotency-key', id);
    }
    const raw = new Request(
      `${origin}/api/v1/workspaces/${f.owner.context.workspaceId}/${resource}`,
      {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    const [area, ...path] = resource.split('?')[0]!.split('/');
    try {
      const handlers = { financial, accounting, analytics, journals };
      const handler = handlers[area as keyof typeof handlers];
      if (!handler) throw new Error('Unknown test API area.');
      return await handler(raw, f.owner.context.workspaceId, path);
    } catch (error) {
      return toProblemResponse(error, 'phase14-campaign');
    }
  }
  async function post<T>(
    resource: string,
    body: unknown,
    schema: { parse(value: unknown): T },
    remember = false,
  ): Promise<T> {
    const id = randomUUID();
    const response = await request(resource, 'POST', body, id);
    expect(response.status).toBe(200);
    const raw: unknown = await response.json();
    if (remember) retries.push({ resource, body, id, response: raw });
    return schema.parse(raw);
  }
  async function get<T>(resource: string, schema: { parse(value: unknown): T }): Promise<T> {
    const response = await request(`financial/${resource}`);
    expect(response.status).toBe(200);
    return schema.parse(await response.json());
  }
  async function fx(rate: string, observedAt: string) {
    const response = await post(
      'financial/fx-observations',
      {
        baseCurrencyId: usd.id,
        quoteCurrencyId: eur.id,
        rate,
        observedAt,
        source,
      },
      c.financialMutationResponseSchema,
    );
    return { observationId: response.id, rate, baseCurrencyId: usd.id, quoteCurrencyId: eur.id };
  }
  async function cash(label: string) {
    const rows = await get(
      `cash-balances?accountId=${account.id}`,
      c.cashBalanceResponseSchema.array(),
    );
    checkpoints.push({
      label,
      eur: rows.find((row) => row.cashBucketId === eurBucket.id)?.amount ?? '0',
      usd: rows.find((row) => row.cashBucketId === usdBucket.id)?.amount ?? '0',
    });
  }
  function reportQuery(accountIds = [account.id]) {
    return {
      accountIds,
      reportingCurrencyId: eur.id,
      from: data.referenceAt,
      to: end,
      fxPolicy: {
        id: 'phase14-independent/1',
        maxAgeMilliseconds: 2_678_400_000,
        sourcePriority: [source],
      },
      priceMaxAgeMilliseconds: 2_678_400_000,
      priceSourcePriority: [source],
    };
  }
  async function report(query: unknown, actor = f.viewer) {
    const response = await request('accounting/reports', 'POST', query, randomUUID(), actor);
    expect(response.status).toBe(200);
    return c.accountingReportResponseSchema.parse(await response.json());
  }
  async function snapshot() {
    // Full row fingerprints catch mutations of balances/projections as well as
    // orphan command, audit or outbox rows. Table names are a fixed test allowlist.
    const result: Record<string, string> = {};
    for (const table of [
      'financial_state',
      'financial_commands',
      'executions',
      'fees',
      'cash_movements',
      'postings',
      'ledger_events',
      'account_cash_events',
      'holding_books',
      'lots',
      'lot_matches',
      'cost_allocations',
      'positions',
      'audit_events',
      'outbox_events',
    ]) {
      const rows = await f.admin.pool.query<{ state: string }>(
        `SELECT coalesce(jsonb_agg(to_jsonb(record) ORDER BY to_jsonb(record)::text)::text,'[]') AS state
         FROM app.${table} record WHERE workspace_id=$1`,
        [f.owner.context.workspaceId],
      );
      result[table] = createHash('sha256').update(rows.rows[0]!.state).digest('hex');
    }
    return result;
  }
  beforeAll(async () => {
    f = await createAccountingFixture();
    financial = createFinancialApi(f.services);
    accounting = createAccountingApi(f.services);
    analytics = createAnalyticsApi(f.services);
    journals = createJournalApi(f.services);
    const currencies: ReturnType<typeof c.currencyResponseSchema.parse>[] = [];
    for (const code of ['EUR', 'USD'])
      currencies.push(
        await post(
          'financial/currencies',
          {
            namespace: source,
            code,
            name: `Campaign ${code}`,
            kind: 'fiat',
            unitIdentity: `${source}:${code}`,
            displayScale: 2,
            settlementIncrement: '0.01',
            effectiveAt: data.referenceAt,
          },
          c.currencyResponseSchema,
        ),
      );
    [eur, usd] = [currencies[0]!, currencies[1]!];
    async function makeAccount(name: string) {
      const broker = await post(
        'financial/brokers',
        { name: `${name} broker`, sourceNamespace: `${source}:${name}` },
        c.brokerResponseSchema,
      );
      return post(
        'financial/accounts',
        {
          name,
          brokerId: broker.id,
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: eur.id,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt: data.referenceAt,
        },
        c.accountResponseSchema,
      );
    }
    account = await makeAccount('Primary');
    eurBucket = await post(
      'financial/cash-buckets',
      { accountId: account.id, currencyId: eur.id, kind: 'settled' },
      c.cashBucketResponseSchema,
    );
    usdBucket = await post(
      'financial/cash-buckets',
      { accountId: account.id, currencyId: usd.id, kind: 'settled' },
      c.cashBucketResponseSchema,
    );
    instrument = await post(
      'financial/instruments',
      {
        name: 'Campaign ordinary share',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `${source}:share`,
        quantityUnit: 'share',
        quoteCurrencyId: usd.id,
        settlementCurrencyId: usd.id,
        multiplier: '1',
        quantityIncrement: '0.0001',
        priceIncrement: '0.01',
        capability: 'native-linear',
        metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        effectiveAt: data.referenceAt,
      },
      c.instrumentResponseSchema,
    );
    campaign = await post(
      'journals',
      {
        title: 'Source-verified complete EUR-funded campaign',
        classification: 'active-trading',
        legs: [
          {
            accountId: account.id,
            instrumentVersionId: instrument.versionId,
            direction: 'long',
            label: 'Main leg',
          },
        ],
      },
      c.journalDetailResponseSchema,
    );
    const saved = await request(`journals/${campaign.trade.id}`, 'PUT', {
      expectedRevision: campaign.journal.revision,
      document: c.journalDocumentSchema.parse({
        plan: {
          initialRisk: {
            amount: '100',
            currencyId: usd.id,
            method: 'Committed source-currency risk',
          },
          timeframe: 'daily',
          marketConditions: 'Source-verified trend',
        },
        review: { customTags: ['phase14', 'reviewed'] },
      }),
    });
    expect(saved.status).toBe(200);
    await post(
      `journals/${campaign.trade.id}/plans`,
      {
        expectedRevision: c.journalEntryResponseSchema.parse(await saved.json()).revision,
        expectedTradeRevision: campaign.trade.revision,
        reason: 'Commit original risk before future economic entry',
      },
      c.journalPlanVersionResponseSchema,
    );
    await post(
      'financial/cash-movements',
      {
        accountId: account.id,
        cashBucketId: eurBucket.id,
        currencyId: eur.id,
        amount: data.deposit,
        kind: 'deposit',
        economicAt: at('01'),
        orderingKey: '1',
      },
      c.financialMutationResponseSchema,
    );
    await cash('deposit');
    await fx(data.conversion.rate, at('02'));
    await post(
      'financial/fx-conversions',
      {
        sourceBucketId: eurBucket.id,
        destinationBucketId: usdBucket.id,
        sourceAmount: data.conversion.source,
        destinationAmount: data.conversion.destination,
        fees: [
          {
            cashBucketId: eurBucket.id,
            currencyId: eur.id,
            amount: data.conversion.fee,
            kind: 'conversion',
          },
        ],
        economicAt: at('02'),
        orderingKey: '2',
      },
      c.fxConversionResponseSchema,
      true,
    );
    await cash('conversion');
    order = await post(
      'financial/orders',
      {
        accountId: account.id,
        kind: 'single',
        legs: [{ instrumentVersionId: instrument.versionId, side: 'buy', ratio: '1' }],
        instruction: {
          status: 'working',
          quantity: data.orderQuantity,
          orderType: 'market',
          timeInForce: 'gtc',
        },
        economicAt: at('03'),
      },
      c.orderResponseSchema,
    );
    await cash('order-only');
    for (const [index, fill] of data.fills.entries()) {
      const rate = await fx(fill.rate, at(fill.day));
      fills.push(
        await post(
          'financial/executions',
          {
            accountId: account.id,
            instrumentVersionId: instrument.versionId,
            ...(index < 2 ? { orderLegId: order.legs[0]!.id } : {}),
            sourceIdentity: { namespace: source, id: `fill:${index}` },
            side: fill.side,
            quantity: fill.quantity,
            price: fill.price,
            cashBucketId: usdBucket.id,
            costsComplete: true,
            basisReportingFx: rate,
            economicAt: at(fill.day),
            orderingKey: '2',
            fees: [
              {
                cashBucketId: usdBucket.id,
                currencyId: usd.id,
                amount: fill.fee,
                kind: 'commission',
                reportingFx: rate,
              },
            ],
          },
          c.executionResponseSchema,
          index === 0,
        ),
      );
      await post(
        'financial/execution-allocations',
        {
          executionId: fills[index]!.id,
          expectedVersion: 1,
          reason: 'Attribute exactly the source execution quantity',
          allocations: [{ tradeLegId: campaign.financial.legs[0]!.legId, quantity: fill.quantity }],
        },
        c.allocationMutationResponseSchema,
      );
      await cash(`fill:${index}`);
      if (index === 0) partial = await get(`orders/${order.id}`, c.orderResponseSchema);
      if (index === 1) filled = await get(`orders/${order.id}`, c.orderResponseSchema);
    }
    const incomeRate = await fx(data.dividend.rate, at('07'));
    await post(
      'accounting/income',
      {
        accountId: account.id,
        cashBucketId: usdBucket.id,
        currencyId: usd.id,
        kind: 'dividend',
        amount: data.dividend.amount,
        withholding: data.dividend.withholding,
        description: 'Verified dividend and withholding',
        economicAt: at('07'),
        orderingKey: '2',
      },
      c.accountingMutationResponseSchema,
      true,
    );
    await cash('dividend');
    await post(
      'financial/fees',
      {
        accountId: account.id,
        cashBucketId: usdBucket.id,
        currencyId: usd.id,
        amount: data.lateExecutionFee,
        kind: 'commission',
        executionId: fills[3]!.id,
        reportingFx: incomeRate,
        economicAt: at('08'),
        orderingKey: '3',
      },
      c.financialMutationResponseSchema,
    );
    await cash('fee');
    await fx(data.finalRate, end);
    await post(
      'financial/price-observations',
      {
        instrumentVersionId: instrument.versionId,
        currencyId: usd.id,
        price: data.mark,
        observedAt: end,
        source,
      },
      c.financialMutationResponseSchema,
    );

    otherAccount = await makeAccount('Secondary');
    const otherBucket = await post(
      'financial/cash-buckets',
      { accountId: otherAccount.id, currencyId: usd.id, kind: 'settled' },
      c.cashBucketResponseSchema,
    );
    await post(
      'financial/cash-movements',
      {
        accountId: otherAccount.id,
        cashBucketId: otherBucket.id,
        currencyId: usd.id,
        amount: '1000',
        kind: 'deposit',
        economicAt: at('05'),
        orderingKey: '1',
      },
      c.financialMutationResponseSchema,
    );
    await post(
      'financial/executions',
      {
        accountId: otherAccount.id,
        instrumentVersionId: instrument.versionId,
        sourceIdentity: { namespace: source, id: 'fill:0' },
        side: 'buy',
        quantity: '2',
        price: '90',
        cashBucketId: otherBucket.id,
        costsComplete: true,
        economicAt: at('05'),
        orderingKey: '3',
      },
      c.executionResponseSchema,
    );
    portfolio = await post(
      'accounting/portfolios',
      {
        name: 'Primary + secondary',
        environment: 'live',
        accountIds: [account.id, otherAccount.id],
      },
      c.portfolioMutationResponseSchema,
    );
    baseline = await report(reportQuery());
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it('books only actual fills and exact dated cash, with partial/complete order status', () => {
    expect(checkpoints).toEqual([
      { label: 'deposit', eur: '10000', usd: '0' },
      { label: 'conversion', eur: '8998', usd: '1100' },
      { label: 'order-only', eur: '8998', usd: '1100' },
      ...data.cashCheckpointsUsd
        .slice(1, 5)
        .map((usd, index) => ({ label: `fill:${index}`, eur: '8998', usd })),
      { label: 'dividend', eur: '8998', usd: '641.25' },
      { label: 'fee', eur: '8998', usd: '639.25' },
    ]);
    expect(order.fillStatus).toBe('unfilled');
    expect(partial.fillStatus).toBe('partially_filled');
    expect(partial.legs).toEqual([
      expect.objectContaining({
        intendedQuantity: '6.5',
        filledQuantity: '2.5',
        remainingQuantity: '4',
        executionCount: 1,
      }),
    ]);
    expect(filled.fillStatus).toBe('filled');
    expect(filled.legs).toEqual([
      expect.objectContaining({
        filledQuantity: '6.5',
        remainingQuantity: '0',
        executionCount: 2,
        overfillQuantity: '0',
      }),
    ]);
  });

  it('matches independent fractional FIFO lots, partial disposal costs and the complete account bridge', async () => {
    const parameters = new URLSearchParams({
      accountIds: account.id,
      reportingCurrencyId: eur.id,
      asOf: end,
      fxPolicyId: 'phase14-independent/1',
      fxMaxAgeMilliseconds: '2678400000',
      fxSourcePriority: source,
      priceMaxAgeMilliseconds: '2678400000',
      priceSourcePriority: source,
    });
    const valuation = await get(`valuation?${parameters}`, c.financialValuationResponseSchema);
    expect(valuation.positions).toHaveLength(1);
    const inventory = valuation.positions[0]!.inventory;
    for (const key of [
      'openQuantity',
      'averageEntryPrice',
      'grossBasis',
      'netBasis',
      'realizedGross',
      'realizedNet',
    ] as const)
      expect(inventory[key]).toMatchObject({ status: 'available', value: data.expected[key] });
    expect(
      inventory.matches.map((match) => ({
        openingSourceId: match.openingSourceId,
        quantity: match.quantity,
        consumedPrincipal: match.consumedPrincipal,
      })),
    ).toEqual([
      { openingSourceId: fills[0]!.id, quantity: '2.5', consumedPrincipal: '250' },
      { openingSourceId: fills[1]!.id, quantity: '0.5', consumedPrincipal: '51' },
    ]);
    expect(
      inventory.lots
        .filter((lot) => lot.remainingQuantity !== '0')
        .map((lot) => ({
          sourceId: lot.sourceId,
          quantity: lot.remainingQuantity,
          principal: lot.remainingPrincipal,
          fees: lot.costs.map((cost) => cost.amount),
        })),
    ).toEqual([
      { sourceId: fills[1]!.id, quantity: '3.5', principal: '357', fees: ['1.3125'] },
      { sourceId: fills[2]!.id, quantity: '1.5', principal: '165', fees: ['0.75'] },
    ]);
    expect(valuation.positions[0]!.valuation!.unrealizedGross.value).toBe(
      data.expected.unrealizedGross,
    );
    expect(valuation.positions[0]!.valuation!.unrealizedNet.value).toBe(
      data.expected.unrealizedNet,
    );
    expect(valuation.nav).toMatchObject({
      state: 'available',
      value: { currencyId: eur.id, amount: data.expected.equity },
    });
    for (const [key, value] of Object.entries(data.expected.breakdown))
      expect(baseline.breakdown[key as keyof typeof baseline.breakdown]).toMatchObject({
        state: 'available',
        value,
      });
    for (const [key, value] of [
      ['cash', '9605.2875'],
      ['holdings', '617.5'],
      ['equity', '10222.7875'],
      ['netLiquidationValue', '10222.7875'],
    ] as const)
      expect(baseline.closing[key]).toMatchObject({ state: 'available', value });
    expect(baseline.reconciliation.performance).toMatchObject({
      state: 'available',
      value: '222.7875',
    });
    expect(baseline.reconciliation.variance).toMatchObject({ state: 'available', value: '0' });
    expect(baseline.opening.netLiquidationValue).toMatchObject({ state: 'available', value: '0' });
    expect(baseline.closing.cashByCurrency).toEqual(
      expect.arrayContaining([
        { currencyId: eur.id, amount: '8998', reasons: [] },
        { currencyId: usd.id, amount: '639.25', reasons: [] },
      ]),
    );
  });

  it('replays conversion, fill and dividend concurrently without duplicate fees, postings or side effects', async () => {
    const before = await snapshot();
    for (const retry of retries) {
      const responses = await Promise.all([
        request(retry.resource, 'POST', retry.body, retry.id),
        request(retry.resource, 'POST', retry.body, retry.id),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(retry.response);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back an oversized close-only fill including provisional cash/fees and rejects a changed retry', async () => {
    const before = await snapshot();
    const response = await request('financial/executions', 'POST', {
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'sell',
      quantity: '5.0001',
      price: '130',
      cashBucketId: usdBucket.id,
      closeOnly: true,
      economicAt: at('09'),
      orderingKey: '2',
      costsComplete: true,
      fees: [{ cashBucketId: usdBucket.id, currencyId: usd.id, amount: '99', kind: 'commission' }],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'INVENTORY_CONFLICT' });
    const retry = retries.find((value) => value.resource === 'accounting/income')!;
    const changed = await request(
      retry.resource,
      'POST',
      { ...(retry.body as object), amount: '11' },
      retry.id,
    );
    expect(changed.status).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect(
      await report({ ...reportQuery(), sourceRevision: baseline.context.sourceRevision }),
    ).toEqual(baseline);
  });

  it('keeps accounts and brokers isolated, and consolidates a versioned portfolio once', async () => {
    const other = await report(reportQuery([otherAccount.id]));
    expect(other.closing.cash.value).toBe('779');
    expect(other.closing.holdings.value).toBe('247');
    expect(other.closing.netLiquidationValue.value).toBe('1026');
    expect(other.breakdown.externalCashFlows.value).toBe('920');
    expect(other.reconciliation.performance.value).toBe('106');
    const { accountIds: _scope, ...query } = reportQuery();
    const both = await report({ ...query, portfolioVersionId: portfolio.versionId });
    expect(both.closing.cash.value).toBe('10384.2875');
    expect(both.closing.holdings.value).toBe('864.5');
    expect(both.closing.netLiquidationValue.value).toBe('11248.7875');
    expect(both.breakdown.externalCashFlows.value).toBe('10920');
    expect(both.reconciliation.performance.value).toBe('328.7875');
    expect(both.reconciliation.variance.value).toBe('0');
    expect((await report(reportQuery())).closing.equity).toEqual(baseline.closing.equity);
    const balances = await get(
      `cash-balances?accountId=${account.id}`,
      c.cashBalanceResponseSchema.array(),
    );
    expect(balances).toHaveLength(2);
    expect(balances.every((row) => row.accountId === account.id)).toBe(true);
    const executions = await get(
      `executions?accountId=${account.id}`,
      c.executionResponseSchema.array(),
    );
    expect(executions.map((execution) => execution.id)).toEqual(fills.map((fill) => fill.id));
    const invalid = await request(
      'accounting/reports',
      'POST',
      reportQuery([account.id, account.id]),
    );
    expect(invalid.status).toBe(400);
  });

  it('does not turn an actual exchange into missing market FX or a partial subtotal into complete performance', async () => {
    const missing = await report({
      ...reportQuery(),
      fxPolicy: {
        id: 'missing-reference/1',
        sourcePriority: ['not-recorded'],
        maxAgeMilliseconds: 2_678_400_000,
      },
    });
    expect(missing.closing.cash.value).toBeNull();
    expect(missing.closing.cash.knownSubtotal).toBe('8998');
    expect(missing.closing.cash.reasons.length).toBeGreaterThan(0);
    expect(missing.reconciliation.performance.value).toBeNull();
    expect(missing.reconciliation.variance.value).toBeNull();
    const unpriced = await report({ ...reportQuery(), priceSourcePriority: ['not-recorded'] });
    expect(unpriced.closing.cash.value).toBe('9605.2875');
    expect(unpriced.closing.holdings.value).toBeNull();
    expect(unpriced.closing.equity.value).toBeNull();
    expect(unpriced.closing.equity.knownSubtotal).toBe('9605.2875');
    expect(unpriced.reconciliation.performance.value).toBeNull();
  });

  it('denies cross-tenant reads and viewer writes without changing the financial snapshot', async () => {
    const before = await snapshot();
    expect(
      await report({ ...reportQuery(), sourceRevision: baseline.context.sourceRevision }, f.viewer),
    ).toEqual(baseline);
    const denied = await request(
      'accounting/reports',
      'POST',
      reportQuery(),
      randomUUID(),
      f.outsider,
    );
    expect(denied.status).toBe(404);
    const retry = retries[0]!;
    const viewerWrite = await request(retry.resource, 'POST', retry.body, randomUUID(), f.viewer);
    expect(viewerWrite.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it('splits the bridge at the exact dividend boundary without moving income or later fees between periods', async () => {
    const cut = at('07');
    await post(
      'financial/price-observations',
      {
        instrumentVersionId: instrument.versionId,
        currencyId: usd.id,
        price: '125',
        observedAt: cut,
        source,
      },
      c.financialMutationResponseSchema,
    );
    const whole = await report(reportQuery());
    const revision = whole.context.sourceRevision;
    const first = await report({ ...reportQuery(), to: cut, sourceRevision: revision });
    const second = await report({ ...reportQuery(), from: cut, sourceRevision: revision });
    expect(first.closing.netLiquidationValue.value).toBe('10200.9375');
    expect(second.opening.netLiquidationValue).toEqual(first.closing.netLiquidationValue);
    expect(first.reconciliation.performance.value).toBe('200.9375');
    expect(second.reconciliation.performance.value).toBe('21.85');
    expect(whole.reconciliation.performance.value).toBe('222.7875');
    expect(first.breakdown.tradingPnl.value).toBe('153.31');
    expect(second.breakdown.tradingPnl.value).toBe('23.75');
    expect(whole.breakdown.tradingPnl.value).toBe('177.06');
    expect(first.breakdown.income.value).toBe('9.5');
    expect(second.breakdown.income.value).toBe('0');
    expect(first.breakdown.taxes.value).toBe('1.425');
    expect(second.breakdown.taxes.value).toBe('0');
    expect(first.breakdown.fees.value).toBe('5.895');
    expect(second.breakdown.fees.value).toBe('1.9');
    expect(second.breakdown.externalCashFlows.value).toBe('0');
    expect(first.reconciliation.variance.value).toBe('0');
    expect(second.reconciliation.variance.value).toBe('0');
    expect(whole.reconciliation.variance.value).toBe('0');
  });

  it('excludes observations one microsecond in the future and exactly replays the accepted source revision', async () => {
    const future = '2030-01-10T12:00:00.000002Z';
    await fx('7', future);
    await post(
      'financial/price-observations',
      {
        instrumentVersionId: instrument.versionId,
        currencyId: usd.id,
        price: '999',
        observedAt: future,
        source,
      },
      c.financialMutationResponseSchema,
    );
    const current = await report(reportQuery());
    expect(current.closing.netLiquidationValue.value).toBe('10222.7875');
    expect(current.reconciliation.performance.value).toBe('222.7875');
    expect(current.breakdown.realizedTradingPnl.value).toBe('55.46');
    expect(
      await report({ ...reportQuery(), sourceRevision: baseline.context.sourceRevision }),
    ).toEqual(baseline);
    const next = await report({ ...reportQuery(), to: future });
    expect(next.closing.cash.value).toBe('13472.75');
    expect(next.closing.holdings.value).toBe('34965');
    expect(next.closing.netLiquidationValue.value).toBe('48437.75');
    expect(next.reconciliation.performance.value).toBe('38437.75');
    expect(next.reconciliation.variance.value).toBe('0');
  });

  it('keeps open marked exposure out of completed-outcome ratios and preserves exact lifetime gross, net and fees', async () => {
    const response = await request('analytics/reports', 'POST', {
      ...reportQuery(),
      timezone: 'Europe/Madrid',
      groupBy: c.analyticsDimensionSchema.options,
    });
    expect(response.status).toBe(200);
    const result = c.analyticsReportResponseSchema.parse(await response.json());
    expect(result.summary.counts).toMatchObject({
      selected: 1,
      completed: 0,
      open: 1,
      eligibleOutcomes: 0,
    });
    for (const [name, value] of Object.entries({
      grossPnl: '207.82',
      netPnl: '202.025',
      realizedPnl: '63.079375',
      unrealizedPnl: '138.945625',
      fees: '5.795',
    }))
      expect(result.summary.metrics[name as keyof typeof result.summary.metrics]).toMatchObject({
        state: 'available',
        value,
      });
    expect(result.summary.metrics.winRate).toMatchObject({ state: 'unavailable', value: null });
    expect(result.summary.metrics.lossRate).toMatchObject({ state: 'unavailable', value: null });
  });

  it('closes the remaining lot, converts all USD, withdraws EUR and verifies every defined campaign metric', async () => {
    const final = data.finalSale;
    const finalRate = await fx(final.rate, at(final.day));
    const execution = await post(
      'financial/executions',
      {
        accountId: account.id,
        instrumentVersionId: instrument.versionId,
        side: final.side,
        quantity: final.quantity,
        price: final.price,
        cashBucketId: usdBucket.id,
        costsComplete: true,
        closeOnly: true,
        basisReportingFx: finalRate,
        economicAt: at(final.day),
        orderingKey: '2',
        fees: [
          {
            cashBucketId: usdBucket.id,
            currencyId: usd.id,
            amount: final.fee,
            kind: 'commission',
            reportingFx: finalRate,
          },
        ],
      },
      c.executionResponseSchema,
    );
    await post(
      'financial/execution-allocations',
      {
        executionId: execution.id,
        expectedVersion: 1,
        reason: 'Attribute the final exact source quantity',
        allocations: [{ tradeLegId: campaign.financial.legs[0]!.legId, quantity: final.quantity }],
      },
      c.allocationMutationResponseSchema,
    );
    const trade = await get(`trades/${campaign.trade.id}`, c.tradeResponseSchema);
    await post(
      `financial/trades/${trade.id}/closures`,
      {
        expectedRevision: trade.revision,
        reason: 'Every attributed share sold',
        obligationEvidence: 'Principal and broker commissions settled in the account',
      },
      c.tradeClosureResponseSchema,
    );
    await cash('final-sale');
    expect(checkpoints.at(-1)).toEqual({ label: 'final-sale', eur: '8998', usd: '1338' });
    await post(
      'financial/price-observations',
      {
        instrumentVersionId: instrument.versionId,
        currencyId: usd.id,
        price: final.price,
        observedAt: at(final.day),
        source,
      },
      c.financialMutationResponseSchema,
    );
    const afterSale = await report({ ...reportQuery(), to: at(final.day) });
    expect(afterSale.closing.cash.value).toBe('10282.48');
    expect(afterSale.closing.holdings.value).toBe('0');
    expect(afterSale.breakdown.cashFx.value).toBe('31.08');
    expect(afterSale.reconciliation.performance.value).toBe('282.48');

    const conversion = data.returnConversion;
    await fx(conversion.rate, at(conversion.day));
    await post(
      'financial/fx-conversions',
      {
        sourceBucketId: usdBucket.id,
        destinationBucketId: eurBucket.id,
        sourceAmount: conversion.source,
        destinationAmount: conversion.destination,
        fees: [
          {
            cashBucketId: eurBucket.id,
            currencyId: eur.id,
            amount: conversion.fee,
            kind: 'conversion',
          },
        ],
        economicAt: at(conversion.day),
        orderingKey: '2',
      },
      c.fxConversionResponseSchema,
    );
    await cash('return-conversion');
    expect(checkpoints.at(-1)).toEqual({ label: 'return-conversion', eur: '10285', usd: '0' });
    const beforeWithdrawal = await report({ ...reportQuery(), to: at(conversion.day) });
    expect(beforeWithdrawal.closing.netLiquidationValue.value).toBe('10285');
    expect(beforeWithdrawal.reconciliation.performance.value).toBe('285');
    await post(
      'financial/cash-movements',
      {
        accountId: account.id,
        cashBucketId: eurBucket.id,
        currencyId: eur.id,
        amount: `-${data.withdrawal.amount}`,
        kind: 'withdrawal',
        economicAt: at(data.withdrawal.day),
        orderingKey: '1',
      },
      c.financialMutationResponseSchema,
    );
    await cash('withdrawal');
    expect(checkpoints.at(-1)).toEqual({ label: 'withdrawal', eur: '9285', usd: '0' });
    const to = at(data.withdrawal.day);
    const finalReport = await report({ ...reportQuery(), to });
    for (const [name, value] of Object.entries(data.finalExpected.breakdown))
      expect(finalReport.breakdown[name as keyof typeof finalReport.breakdown]).toMatchObject({
        state: 'available',
        value,
      });
    for (const name of ['cash', 'equity', 'netLiquidationValue'] as const)
      expect(finalReport.closing[name]).toMatchObject({ state: 'available', value: '9285' });
    expect(finalReport.closing.holdings).toMatchObject({ state: 'available', value: '0' });
    expect(finalReport.reconciliation.performance).toMatchObject({
      state: 'available',
      value: '285',
    });
    expect(finalReport.reconciliation.variance).toMatchObject({ state: 'available', value: '0' });
    const { accountIds: _selectedAccounts, ...portfolioQuery } = reportQuery();
    const consolidated = await report({
      ...portfolioQuery,
      portfolioVersionId: portfolio.versionId,
      to,
    });
    expect(consolidated.closing.cash.value).toBe('10080.4');
    expect(consolidated.closing.holdings.value).toBe('271.6');
    expect(consolidated.closing.netLiquidationValue.value).toBe('10352');
    expect(consolidated.breakdown.externalCashFlows.value).toBe('9920');
    expect(consolidated.reconciliation.performance.value).toBe('432');
    expect(consolidated.reconciliation.variance.value).toBe('0');
    // Withdrawal changes external capital and cash equally, never performance.
    expect(finalReport.reconciliation.performance).toEqual(
      beforeWithdrawal.reconciliation.performance,
    );
    expect(finalReport.closing.cashByCurrency).toEqual(
      expect.arrayContaining([
        { currencyId: eur.id, amount: '9285', reasons: [] },
        { currencyId: usd.id, amount: '0', reasons: [] },
      ]),
    );
    expect(
      await get(`fees?accountId=${account.id}`, c.currencyAmountResponseSchema.array()),
    ).toEqual(
      expect.arrayContaining([
        { currencyId: eur.id, amount: '5' },
        { currencyId: usd.id, amount: '7.5' },
      ]),
    );
    // A flat account needs neither a current market price nor nonzero foreign cash FX.
    const valuation = await get(
      `valuation?${new URLSearchParams({
        accountIds: account.id,
        reportingCurrencyId: eur.id,
        asOf: to,
        fxPolicyId: 'final-no-marks/1',
        fxMaxAgeMilliseconds: '0',
        fxSourcePriority: 'not-recorded',
        priceMaxAgeMilliseconds: '0',
        priceSourcePriority: 'not-recorded',
      })}`,
      c.financialValuationResponseSchema,
    );
    expect(valuation.nav).toMatchObject({
      state: 'available',
      value: { currencyId: eur.id, amount: '9285' },
    });
    expect(valuation.positions).toHaveLength(1);
    const position = valuation.positions[0]!;
    for (const name of [
      'openQuantity',
      'grossBasis',
      'netBasis',
      'realizedGross',
      'realizedNet',
    ] as const)
      expect(position.inventory[name]).toMatchObject({
        status: 'available',
        value: data.finalExpected[name],
      });
    expect(position.inventory.averageEntryPrice.value).toBeNull();
    expect(position.valuation!.unrealizedGross.value).toBe('0');
    expect(position.valuation!.unrealizedNet.value).toBe('0');

    const analyticsQuery = {
      ...reportQuery(),
      to,
      timezone: 'Europe/Madrid',
      groupBy: c.analyticsDimensionSchema.options,
    };
    const beforeRead = await snapshot();
    const response = await request('analytics/reports', 'POST', analyticsQuery);
    expect(response.status).toBe(200);
    const result = c.analyticsReportResponseSchema.parse(await response.json());
    expect(result.summary.counts).toMatchObject({
      selected: 1,
      completed: 1,
      open: 0,
      excluded: 0,
      eligibleOutcomes: 1,
      wins: 1,
      losses: 0,
      breakevens: 0,
      eligibleR: 1,
      eligibleDuration: 1,
    });
    for (const [name, value] of Object.entries(data.closedAnalytics))
      expect(
        result.summary.metrics[name as keyof typeof result.summary.metrics],
        name,
      ).toMatchObject({ state: 'available', value });
    expect(result.summary.metrics.averageLoser).toMatchObject({
      state: 'unavailable',
      value: null,
    });
    expect(result.summary.metrics.payoffRatio).toMatchObject({ state: 'unavailable', value: null });
    expect(result.summary.metrics.profitFactor).toMatchObject({ state: 'infinite', value: null });
    expect(result.summary.recovery).toMatchObject({
      state: 'no-drawdown',
      peakAt: null,
      troughAt: null,
      recoveredAt: null,
      durationSeconds: null,
      tradesToRecovery: null,
    });
    expect(result.summary.curve.points.map((point) => point.cumulativePnl)).toEqual([
      '0',
      '255.325',
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      id: campaign.trade.id,
      status: 'completed',
      rMultiple: { value: '2.295' },
    });
    expect(new Set(result.groups.map((group) => group.dimension))).toEqual(
      new Set(c.analyticsDimensionSchema.options),
    );
    for (const group of result.groups) {
      expect(group.summary.metrics.netPnl.value).toBe('255.325');
      expect(group.additive).toBe(group.dimension !== 'tag');
    }
    expect(await snapshot()).toEqual(beforeRead);
    // Closing/funding operations cannot rewrite the earlier accepted snapshot.
    expect(
      await report({ ...reportQuery(), sourceRevision: baseline.context.sourceRevision }),
    ).toEqual(baseline);
  });
});
