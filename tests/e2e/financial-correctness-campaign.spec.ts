import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import * as c from '@journal/contracts';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import { testDatabaseUrls } from '../../scripts/environment.js';
import { campaignAt as at, FINANCIAL_CAMPAIGN as campaign } from '../helpers/financial-campaign.js';

// Source writes use the public authenticated APIs: the application does not yet expose
// a complete deposit / FX / dividend entry screen. Login and account review use the UI.
test('EUR-funded partial fills, scaling and income reconcile through persisted APIs and account review', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const baseUrl = info.project.use.baseURL;
  if (!baseUrl) throw new Error('The isolated browser application origin is required.');
  const origin = new URL(baseUrl).origin;
  const urls = testDatabaseUrls();
  const password = randomBytes(24).toString('hex');
  const owner = await bootstrapOwner(
    {
      email: `correctness-owner-${randomUUID()}@example.test`,
      password,
      name: 'Financial correctness browser owner',
    },
    parseServerConfig({
      ...process.env,
      DATABASE_URL: urls.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: urls.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: urls.TEST_JOB_DATABASE_URL,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
    }),
  );
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(owner.user.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const session = await page.request.get('/api/auth/session');
  expect(session.status()).toBe(200);
  const proof = session.headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  const workspace = c.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0];
  if (!workspace) throw new Error('The browser owner needs a workspace.');
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const financial = `${prefix}/financial`;
  async function post<T>(
    path: string,
    body: unknown,
    schema: { parse(value: unknown): T },
    commandId = randomUUID(),
  ) {
    const response = await page.request.post(`${prefix}/${path}`, {
      data: body,
      headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': commandId },
    });
    expect(response.status()).toBe(200);
    return schema.parse(await response.json());
  }
  async function get<T>(path: string, schema: { parse(value: unknown): T }) {
    const response = await page.request.get(`${financial}/${path}`);
    expect(response.status()).toBe(200);
    return schema.parse(await response.json());
  }
  const source = `correctness-browser:${randomUUID()}`;
  const effectiveAt = campaign.referenceAt;
  const currencies = [];
  for (const [code, name] of [
    ['EUR', 'Campaign euro'],
    ['USD', 'Campaign US dollar'],
  ] as const)
    currencies.push(
      await post(
        'financial/currencies',
        {
          namespace: source,
          code,
          kind: 'fiat',
          unitIdentity: `${source}:${code}`,
          name,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt,
        },
        c.currencyResponseSchema,
      ),
    );
  const [eur, usd] = currencies;
  if (!eur || !usd) throw new Error('The two source currencies are required.');
  const broker = await post(
    'financial/brokers',
    { name: 'Campaign source broker', sourceNamespace: source },
    c.brokerResponseSchema,
  );
  const account = await post(
    'financial/accounts',
    {
      name: 'Campaign EUR-funded FIFO account',
      brokerId: broker.id,
      environment: 'live',
      accountType: 'cash',
      baseCurrencyId: eur.id,
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt,
    },
    c.accountResponseSchema,
  );
  const buckets = [];
  for (const currency of [eur, usd])
    buckets.push(
      await post(
        'financial/cash-buckets',
        { accountId: account.id, currencyId: currency.id, kind: 'settled' },
        c.cashBucketResponseSchema,
      ),
    );
  const [eurBucket, usdBucket] = buckets;
  if (!eurBucket || !usdBucket) throw new Error('Both settlement cash buckets are required.');
  const instrument = await post(
    'financial/instruments',
    {
      name: 'Campaign fractional ordinary share',
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
      effectiveAt,
    },
    c.instrumentResponseSchema,
  );
  const strategy = await post(
    'strategies',
    {
      definition: {
        name: 'Campaign scale-in playbook',
        status: 'active',
        entryRules: 'Source-verified staged entries',
      },
      effectiveAt,
    },
    c.strategyResponseSchema,
  );
  const journal = await post(
    'journals',
    {
      title: 'EUR-funded partial fill campaign',
      classification: 'active-trading',
      strategyVersionId: strategy.currentVersionId,
      legs: [
        {
          accountId: account.id,
          instrumentVersionId: instrument.versionId,
          direction: 'long',
          label: 'Main stock leg',
        },
      ],
    },
    c.journalDetailResponseSchema,
  );
  const riskSave = await page.request.put(`${prefix}/journals/${journal.trade.id}`, {
    data: {
      expectedRevision: journal.journal.revision,
      document: c.journalDocumentSchema.parse({
        plan: {
          initialRisk: {
            amount: '100',
            currencyId: usd.id,
            method: 'Original pre-trade USD risk budget',
          },
          timeframe: '1h',
          marketConditions: 'Controlled pullback',
        },
        review: { customTags: ['financial-campaign'] },
      }),
    },
    headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
  });
  expect(riskSave.status()).toBe(200);
  const savedRisk = c.journalEntryResponseSchema.parse(await riskSave.json());
  const originalPlan = await post(
    `journals/${journal.trade.id}/plans`,
    {
      expectedRevision: savedRisk.revision,
      expectedTradeRevision: journal.trade.revision,
      reason: 'Commit original USD100 risk before all future-dated fills',
    },
    c.journalPlanVersionResponseSchema,
  );
  const tradeLegId = journal.financial.legs[0]!.legId;
  async function cash(expectedEur: string, expectedUsd: string) {
    const balances = await get(
      `cash-balances?accountId=${account.id}`,
      c.cashBalanceResponseSchema.array(),
    );
    expect(balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cashBucketId: eurBucket!.id,
          accountId: account.id,
          currencyId: eur!.id,
          amount: expectedEur,
        }),
      ]),
    );
    if (expectedUsd !== '0')
      expect(balances).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cashBucketId: usdBucket!.id,
            accountId: account.id,
            currencyId: usd!.id,
            amount: expectedUsd,
          }),
        ]),
      );
    else
      expect(
        balances.filter((row) => row.currencyId === usd!.id).every((row) => row.amount === '0'),
      ).toBe(true);
  }
  async function fx(rate: string, economicAt: string) {
    const observed = await post(
      'financial/fx-observations',
      {
        baseCurrencyId: usd!.id,
        quoteCurrencyId: eur!.id,
        rate,
        observedAt: economicAt,
        source,
      },
      c.financialMutationResponseSchema,
    );
    return { observationId: observed.id, rate, baseCurrencyId: usd!.id, quoteCurrencyId: eur!.id };
  }
  await post(
    'financial/cash-movements',
    {
      accountId: account.id,
      cashBucketId: eurBucket.id,
      currencyId: eur.id,
      amount: campaign.deposit,
      kind: 'deposit',
      economicAt: at('01'),
      orderingKey: '1',
    },
    c.financialMutationResponseSchema,
  );
  await cash('10000', '0');
  const entryFx = await fx('0.9', at('02'));
  await post(
    'financial/fx-conversions',
    {
      sourceBucketId: eurBucket.id,
      destinationBucketId: usdBucket.id,
      sourceAmount: campaign.conversion.source,
      destinationAmount: campaign.conversion.destination,
      fees: [
        {
          cashBucketId: eurBucket.id,
          currencyId: eur.id,
          amount: campaign.conversion.fee,
          kind: 'conversion',
        },
      ],
      economicAt: at('02'),
      orderingKey: '2',
    },
    c.fxConversionResponseSchema,
  );
  await cash('8998', '1100');
  const order = await post(
    'financial/orders',
    {
      accountId: account.id,
      kind: 'single',
      legs: [{ instrumentVersionId: instrument.versionId, side: 'buy', ratio: '1' }],
      instruction: {
        status: 'working',
        quantity: campaign.orderQuantity,
        orderType: 'market',
        timeInForce: 'gtc',
      },
      economicAt: at('03'),
    },
    c.orderResponseSchema,
  );
  expect(order.fillStatus).toBe('unfilled');
  await cash('8998', '1100'); // An order is intent, not a financial posting.
  async function execute(
    side: 'buy' | 'sell',
    quantity: string,
    price: string,
    fee: string,
    economicAt: string,
    rate: typeof entryFx,
    orderLegId?: string,
  ) {
    const body = {
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      ...(orderLegId ? { orderLegId } : {}),
      side,
      quantity,
      price,
      cashBucketId: usdBucket!.id,
      costsComplete: true,
      basisReportingFx: rate,
      economicAt,
      orderingKey: '2',
      fees: [
        {
          cashBucketId: usdBucket!.id,
          currencyId: usd!.id,
          amount: fee,
          kind: 'commission',
          reportingFx: rate,
        },
      ],
    };
    const commandId = randomUUID();
    const first = await post('financial/executions', body, c.executionResponseSchema, commandId);
    // A lost response may be retried without duplicating a fill, its fee or its cash.
    expect(await post('financial/executions', body, c.executionResponseSchema, commandId)).toEqual(
      first,
    );
    await post(
      'financial/execution-allocations',
      {
        executionId: first.id,
        expectedVersion: 1,
        reason: 'Source fill belongs to the campaign',
        allocations: [{ tradeLegId, quantity }],
      },
      c.allocationMutationResponseSchema,
    );
    return first;
  }
  const first = await execute('buy', '2.5', '100', '1', at('03'), entryFx, order.legs[0]!.id);
  await cash('8998', '849');
  const partial = await get(`orders/${order.id}`, c.orderResponseSchema);
  expect(partial.fillStatus).toBe('partially_filled');
  expect(partial.legs).toEqual([
    expect.objectContaining({
      intendedQuantity: '6.5',
      filledQuantity: '2.5',
      remainingQuantity: '4',
      executionCount: 1,
      overfillQuantity: '0',
    }),
  ]);
  const second = await execute(
    'buy',
    '4',
    '102',
    '1.5',
    at('04'),
    await fx('0.91', at('04')),
    order.legs[0]!.id,
  );
  await cash('8998', '439.5');
  const filled = await get(`orders/${order.id}`, c.orderResponseSchema);
  expect(filled.fillStatus).toBe('filled');
  expect(filled.legs).toEqual([
    expect.objectContaining({ filledQuantity: '6.5', remainingQuantity: '0', executionCount: 2 }),
  ]);
  const additional = await execute(
    'buy',
    '1.5',
    '110',
    '0.75',
    at('05'),
    await fx('0.92', at('05')),
  );
  await cash('8998', '273.75');
  const sale = await execute('sell', '3', '120', '1', at('06'), await fx('0.94', at('06')));
  await cash('8998', '632.75');
  await fx(campaign.dividend.rate, at('07'));
  await post(
    'accounting/income',
    {
      accountId: account.id,
      cashBucketId: usdBucket.id,
      currencyId: usd.id,
      kind: 'dividend',
      amount: '10',
      withholding: '1.5',
      description: 'Source-verified gross dividend and withheld tax',
      economicAt: at('07'),
      orderingKey: '2',
    },
    c.accountingMutationResponseSchema,
  );
  await cash('8998', '641.25');
  const lateFeeRate = await fx('0.95', at('08'));
  await post(
    'financial/fees',
    {
      accountId: account.id,
      cashBucketId: usdBucket.id,
      currencyId: usd.id,
      executionId: sale.id,
      amount: campaign.lateExecutionFee,
      kind: 'commission',
      reportingFx: lateFeeRate,
      economicAt: at('08'),
      orderingKey: '3',
    },
    c.financialMutationResponseSchema,
  );
  await cash('8998', '639.25');
  const end = at('10');
  await fx('0.95', end);
  await post(
    'financial/price-observations',
    {
      instrumentVersionId: instrument.versionId,
      currencyId: usd.id,
      price: campaign.mark,
      observedAt: end,
      source,
    },
    c.financialMutationResponseSchema,
  );
  const valuationQuery = new URLSearchParams({
    accountIds: account.id,
    reportingCurrencyId: eur.id,
    asOf: end,
    fxPolicyId: 'phase14-campaign/1',
    fxMaxAgeMilliseconds: '2678400000',
    fxSourcePriority: source,
    priceMaxAgeMilliseconds: '2678400000',
    priceSourcePriority: source,
  });
  const valuation = await get(`valuation?${valuationQuery}`, c.financialValuationResponseSchema);
  expect(valuation.nav).toMatchObject({
    state: 'available',
    value: { currencyId: eur.id, amount: '10222.7875' },
  });
  expect(valuation.positions).toHaveLength(1);
  const inventory = valuation.positions[0]!.inventory;
  for (const [key, value] of [
    ['openQuantity', '5'],
    ['averageEntryPrice', '104.4'],
    ['grossBasis', '522'],
    ['netBasis', '524.0625'],
    ['realizedGross', '59'],
    ['realizedNet', '54.8125'],
  ] as const)
    expect(inventory[key]).toMatchObject({ status: 'available', value });
  expect(inventory.lots.filter((lot) => lot.remainingQuantity !== '0')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: second.id,
        remainingQuantity: '3.5',
        remainingPrincipal: '357',
      }),
      expect.objectContaining({
        sourceId: additional.id,
        remainingQuantity: '1.5',
        remainingPrincipal: '165',
      }),
    ]),
  );
  expect(inventory.lots.filter((lot) => lot.remainingQuantity !== '0')).toHaveLength(2);
  expect(inventory.matches).toHaveLength(2);
  expect(inventory.matches).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        openingSourceId: first.id,
        closingSourceId: sale.id,
        quantity: '2.5',
        grossPnl: expect.objectContaining({ value: '50' }),
      }),
      expect.objectContaining({
        openingSourceId: second.id,
        closingSourceId: sale.id,
        quantity: '0.5',
        grossPnl: expect.objectContaining({ value: '9' }),
      }),
    ]),
  );
  expect(valuation.positions[0]!.valuation).toMatchObject({
    unrealizedGross: { status: 'available', value: '128' },
    unrealizedNet: { status: 'available', value: '125.9375' },
  });
  const executions = await get(
    `executions?accountId=${account.id}`,
    c.executionResponseSchema.array(),
  );
  expect(executions.map((execution) => execution.id)).toEqual([
    first.id,
    second.id,
    additional.id,
    sale.id,
  ]);
  expect(executions.map((execution) => execution.bookedPrincipal)).toEqual(
    campaign.fills.map((fill) => fill.principal),
  );
  const fees = await get(`fees?accountId=${account.id}`, c.currencyAmountResponseSchema.array());
  expect(fees).toEqual(
    expect.arrayContaining([
      { currencyId: eur.id, amount: '2' },
      { currencyId: usd.id, amount: '6.25' },
    ]),
  );
  const reportRequest = {
    accountIds: [account.id],
    reportingCurrencyId: eur.id,
    from: effectiveAt,
    to: end,
    fxPolicy: {
      id: 'phase14-campaign/1',
      maxAgeMilliseconds: 2_678_400_000,
      sourcePriority: [source],
    },
    priceMaxAgeMilliseconds: 2_678_400_000,
    priceSourcePriority: [source],
  };
  const report = await post('accounting/reports', reportRequest, c.accountingReportResponseSchema);
  for (const [key, value] of [
    ['realizedTradingPnl', '55.46'],
    ['unrealizedTradingPnlChange', '121.6'],
    ['holdingFx', '30.76'],
    ['cashFx', '24.6875'],
    ['conversionEffects', '-10'],
    ['income', '9.5'],
    ['taxes', '1.425'],
    ['fees', '7.795'],
    ['externalCashFlows', '10000'],
  ] as const)
    expect(report.breakdown[key]).toMatchObject({ state: 'available', value });
  expect(report.closing.cash).toMatchObject({ state: 'available', value: '9605.2875' });
  expect(report.closing.holdings).toMatchObject({ state: 'available', value: '617.5' });
  expect(report.reconciliation.performance).toMatchObject({
    state: 'available',
    value: '222.7875',
  });
  expect(report.reconciliation.variance).toMatchObject({ state: 'available', value: '0' });
  const params = new URLSearchParams({
    workspace: workspace.id,
    from: '2029-12-31',
    to: '2030-01-10',
    accountIds: account.id,
    currency: eur.id,
    priceSources: JSON.stringify([source]),
    fxSources: JSON.stringify([source]),
    age: '2678400000',
  });
  await page.goto(`/accounts?${params}`);
  await expect(
    page.getByRole('heading', { name: 'Account performance', exact: true }),
  ).toBeVisible();
  async function displayedReport() {
    for (const [name, amount] of [
      ['Cash', '9605.2875'],
      ['Equity', '10222.7875'],
      ['Net liquidation value', '10222.7875'],
      ['Account performance', '222.7875'],
      ['Reconciliation variance', '0'],
      ['Trading P&L', '177.06'],
      ['Income', '9.5'],
      ['Fees', '7.795'],
    ] as const)
      await expect(
        page.getByRole('group', { name, exact: true }).locator('.account-metric-value'),
      ).toHaveText(`${amount} EUR`);
  }
  await displayedReport();
  await page.getByText('Cash by native currency', { exact: true }).click();
  await expect(page.getByText('EUR: 8998', { exact: true })).toBeVisible();
  await expect(page.getByText('USD: 639.25', { exact: true })).toBeVisible();
  await page.reload();
  await displayedReport();
  expect(await get(`valuation?${valuationQuery}`, c.financialValuationResponseSchema)).toEqual(
    valuation,
  );
  // Neither browser review nor read-only report POSTs may advance the financial source revision.
  expect(await post('accounting/reports', reportRequest, c.accountingReportResponseSchema)).toEqual(
    report,
  );
  // Complete the lifecycle using actual settled cash, then remove external capital.
  // Orders, conversions, dividends and withdrawals must not invent another trade.
  const closing = campaign.finalSale;
  const finalFill = await execute(
    closing.side,
    closing.quantity,
    closing.price,
    closing.fee,
    at(closing.day),
    await fx(closing.rate, at(closing.day)),
  );
  await cash(campaign.expected.cashEur, campaign.returnConversion.source);
  const currentTrade = await get(`trades/${journal.trade.id}`, c.tradeResponseSchema);
  await post(
    `financial/trades/${journal.trade.id}/closures`,
    {
      expectedRevision: currentTrade.revision,
      reason: 'All actual source fills are flat',
      obligationEvidence: 'Both sales, principal and commissions are posted to the settled bucket',
    },
    c.tradeClosureResponseSchema,
  );
  const returning = campaign.returnConversion;
  await fx(returning.rate, at(returning.day));
  await post(
    'financial/fx-conversions',
    {
      sourceBucketId: usdBucket.id,
      destinationBucketId: eurBucket.id,
      sourceAmount: returning.source,
      destinationAmount: returning.destination,
      fees: [
        {
          cashBucketId: eurBucket.id,
          currencyId: eur.id,
          amount: returning.fee,
          kind: 'conversion',
        },
      ],
      economicAt: at(returning.day),
      orderingKey: '2',
    },
    c.fxConversionResponseSchema,
  );
  await cash('10285', '0');
  await post(
    'financial/cash-movements',
    {
      accountId: account.id,
      cashBucketId: eurBucket.id,
      currencyId: eur.id,
      kind: 'withdrawal',
      amount: `-${campaign.withdrawal.amount}`,
      economicAt: at(campaign.withdrawal.day),
      orderingKey: '1',
    },
    c.financialMutationResponseSchema,
  );
  const finalExpected = campaign.finalExpected;
  await cash(finalExpected.cashEur, finalExpected.cashUsd);
  const finalEnd = at('14');
  const finalQuery = new URLSearchParams(valuationQuery);
  finalQuery.set('asOf', finalEnd);
  const finalValuation = await get(`valuation?${finalQuery}`, c.financialValuationResponseSchema);
  expect(finalValuation.nav).toMatchObject({
    state: 'available',
    value: { currencyId: eur.id, amount: finalExpected.equity },
  });
  expect(finalValuation.positions).toHaveLength(1);
  const finalInventory = finalValuation.positions[0]!.inventory;
  for (const key of [
    'openQuantity',
    'grossBasis',
    'netBasis',
    'realizedGross',
    'realizedNet',
  ] as const)
    expect(finalInventory[key]).toMatchObject({ status: 'available', value: finalExpected[key] });
  expect(finalInventory.lots.every((lot) => lot.remainingQuantity === '0')).toBe(true);
  const finalExecutions = await get(
    `executions?accountId=${account.id}`,
    c.executionResponseSchema.array(),
  );
  expect(finalExecutions.map((execution) => execution.id)).toEqual([
    first.id,
    second.id,
    additional.id,
    sale.id,
    finalFill.id,
  ]);
  const finalFees = await get(
    `fees?accountId=${account.id}`,
    c.currencyAmountResponseSchema.array(),
  );
  expect(finalFees).toEqual(
    expect.arrayContaining([
      { currencyId: eur.id, amount: finalExpected.feesEur },
      { currencyId: usd.id, amount: finalExpected.feesUsd },
    ]),
  );
  const finalReportRequest = { ...reportRequest, to: finalEnd };
  const finalReport = await post(
    'accounting/reports',
    finalReportRequest,
    c.accountingReportResponseSchema,
  );
  for (const [key, value] of Object.entries(finalExpected.breakdown))
    expect(finalReport.breakdown[key as keyof typeof finalExpected.breakdown]).toMatchObject({
      state: 'available',
      value,
    });
  for (const key of ['cash', 'equity', 'netLiquidationValue'] as const)
    expect(finalReport.closing[key]).toMatchObject({
      state: 'available',
      value: finalExpected.equity,
    });
  expect(finalReport.closing.holdings).toMatchObject({ state: 'available', value: '0' });
  expect(finalReport.reconciliation).toMatchObject({
    navChange: { state: 'available', value: finalExpected.equity },
    netCapitalFlows: { state: 'available', value: '9000' },
    performance: { state: 'available', value: finalExpected.performance },
    variance: { state: 'available', value: '0' },
  });
  const reviewResponse = await page.request.get(`${prefix}/journals/${journal.trade.id}`);
  expect(reviewResponse.status()).toBe(200);
  const closedJournal = c.journalDetailResponseSchema.parse(await reviewResponse.json());
  expect(closedJournal.trade.status).toBe('closed');
  expect(closedJournal.originalPlan?.id).toBe(originalPlan.id);
  expect(closedJournal.originalPlan?.definition.initialRisk).toMatchObject({
    amount: '100',
    currencyId: usd.id,
  });
  expect(closedJournal.financial.rMultiple).toMatchObject({
    status: 'available',
    value: '2.295',
    originalPlanId: originalPlan.id,
  });

  const analytics = await post(
    'analytics/reports',
    {
      ...finalReportRequest,
      timezone: 'UTC',
      groupBy: c.analyticsDimensionSchema.options,
    },
    c.analyticsReportResponseSchema,
  );
  expect(analytics.records).toHaveLength(1);
  expect(analytics.records[0]).toMatchObject({
    id: journal.trade.id,
    status: 'completed',
    grossPnl: { state: 'available', value: campaign.closedAnalytics.grossPnl },
    fees: { state: 'available', value: campaign.closedAnalytics.fees },
    netPnl: { state: 'available', value: campaign.closedAnalytics.netPnl },
    rMultiple: { state: 'available', value: campaign.closedAnalytics.averageR },
    originalPlanId: originalPlan.id,
  });
  expect(analytics.summary.counts).toEqual({
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
  for (const [key, value] of Object.entries(campaign.closedAnalytics))
    expect(analytics.summary.metrics[key as keyof typeof campaign.closedAnalytics]).toMatchObject({
      state: 'available',
      value,
    });
  expect(analytics.summary.metrics.profitFactor).toMatchObject({ state: 'infinite', value: null });
  for (const key of ['averageLoser', 'payoffRatio'] as const)
    expect(analytics.summary.metrics[key]).toMatchObject({ state: 'unavailable', value: null });
  expect(analytics.summary.recovery.state).toBe('no-drawdown');
  expect(analytics.summary.curve.points.map((point) => point.cumulativePnl)).toEqual([
    '0',
    campaign.closedAnalytics.netPnl,
  ]);
  expect(analytics.groups).toHaveLength(c.analyticsDimensionSchema.options.length);
  for (const group of analytics.groups)
    expect(group.summary.metrics.netPnl).toMatchObject({
      state: 'available',
      value: campaign.closedAnalytics.netPnl,
    });
  // Account performance includes income, taxes and actual FX conversions. Campaign
  // P&L includes only assigned fills/costs; R uses original USD risk and USD P&L.
  expect(analytics.summary.metrics.netPnl.value).not.toBe(
    finalReport.reconciliation.performance.value,
  );

  params.set('to', '2030-01-14');
  await page.goto(`/accounts?${params}`);
  async function displayedFinalReport() {
    for (const [name, amount] of [
      ['Cash', finalExpected.reportingCash],
      ['Equity', finalExpected.equity],
      ['Net liquidation value', finalExpected.equity],
      ['Account performance', finalExpected.performance],
      ['Reconciliation variance', '0'],
      ['Trading P&L', finalExpected.breakdown.tradingPnl],
      ['Income', finalExpected.breakdown.income],
      ['Fees', finalExpected.breakdown.fees],
      ['External cash flows', finalExpected.breakdown.externalCashFlows],
    ] as const)
      await expect(
        page.getByRole('group', { name, exact: true }).locator('.account-metric-value'),
      ).toHaveText(`${amount} EUR`);
  }
  await displayedFinalReport();
  await page.reload();
  await displayedFinalReport();
  expect(await get(`valuation?${finalQuery}`, c.financialValuationResponseSchema)).toEqual(
    finalValuation,
  );
  expect(
    await post('accounting/reports', finalReportRequest, c.accountingReportResponseSchema),
  ).toEqual(finalReport);
});
