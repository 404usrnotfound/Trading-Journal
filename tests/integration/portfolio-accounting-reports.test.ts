import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, sql, type Database } from '@journal/database';
import { accountingReportResponseSchema } from '@journal/contracts';
import {
  createServerServices,
  parseServerConfig,
  type AuthorizationContext,
  type ServerServices,
} from '@journal/server';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { createAccountingServices } from '../../packages/server/src/accounting/service.js';
import { createAccountingReports } from '../../packages/server/src/accounting/report.js';
import { instrumentPlatform } from '../../scripts/performance/instrument.js';

const origin = 'http://localhost:3000';
const password = 'portfolio-accounting-fixture-passphrase-42';
const initial = '2025-01-01T00:00:00.000001Z';
const at = (day: number) => `2025-01-${String(day).padStart(2, '0')}T12:00:00.000001Z`;

/** Expected numbers below are independently worked accounting equations, not kernel-generated values. */
describe('portfolio accounting reconciliation on restricted real PostgreSQL', () => {
  let admin: Database;
  let services: ServerServices;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let accounting: ReturnType<typeof createAccountingServices>;
  let reports: ReturnType<typeof createAccountingReports>;
  let owner: AuthorizationContext;
  let viewer: AuthorizationContext;
  let outsider: AuthorizationContext;
  let eur: string;
  let usd: string;

  async function authenticate(
    person: Awaited<ReturnType<ServerServices['bootstrapOwner']>>,
    workspaceId: string,
    role: 'viewer' | 'editor',
  ) {
    const response = await services.handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: person.user.email, password }),
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    return services.authorizeWorkspace(
      new Request(`${origin}/api/workspaces`, { headers: { cookie } }),
      workspaceId,
      role,
    );
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated test PostgreSQL is required');
    admin = createDatabase(process.env.TEST_DATABASE_URL);
    services = createServerServices(
      parseServerConfig({
        NODE_ENV: 'test',
        APP_ORIGIN: origin,
        DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
        AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
        JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL,
        BETTER_AUTH_SECRET: 'portfolio-accounting-fixture-secret-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    catalog = createCatalogServices(services);
    ledger = createFinancialLedger(services);
    observations = createFinancialObservations(services);
    accounting = createAccountingServices(services);
    reports = createAccountingReports(services);
    const people = [];
    for (let index = 0; index < 3; index++)
      people.push(
        await services.bootstrapOwner({
          email: `accounting-report-${randomUUID()}@example.test`,
          name: 'Accounting report actor',
          password,
        }),
      );
    const [first, second, third] = people;
    if (!first || !second || !third) throw new Error('Accounting fixture actors missing');
    await admin.pool.query(
      'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
      [first.workspace.id, second.user.id, 'viewer'],
    );
    owner = await authenticate(first, first.workspace.id, 'editor');
    viewer = await authenticate(second, first.workspace.id, 'viewer');
    outsider = await authenticate(third, third.workspace.id, 'editor');
    for (const code of ['EUR', 'USD']) {
      const currency = await catalog.createCurrency(
        owner,
        {
          namespace: 'iso:4217',
          code,
          name: code,
          kind: 'fiat',
          unitIdentity: `iso:${code}`,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        randomUUID(),
      );
      if (code === 'EUR') eur = currency.id;
      else usd = currency.id;
    }
  });

  afterAll(async () => {
    // Unique immutable financial history remains only in the guarded disposable test database.
    await Promise.all([services?.close(), admin?.close()]);
  });

  async function fixture(environment: 'live' | 'paper' = 'live', effectiveAt = initial) {
    const source = `accounting:${randomUUID()}`;
    const broker = await catalog.createBroker(
      owner,
      { name: source, sourceNamespace: source },
      randomUUID(),
    );
    const account = await catalog.createAccount(
      owner,
      {
        name: source,
        brokerId: broker.id,
        environment,
        accountType: 'margin',
        baseCurrencyId: eur,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const instrument = await catalog.createInstrument(
      owner,
      {
        name: source,
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: source,
        quantityUnit: 'share',
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: '1',
        quantityIncrement: '0.0001',
        priceIncrement: '0.000001',
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
    const eurBucket = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: eur,
      kind: 'settled',
    });
    const usdBucket = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: usd,
      kind: 'settled',
    });
    return { source, broker, account, instrument, eurBucket, usdBucket };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  function query(
    accountIds: string[],
    source: string,
    from = initial,
    to = at(10),
    reportingCurrencyId = eur,
  ) {
    return {
      accountIds,
      reportingCurrencyId,
      from,
      to,
      fxPolicy: {
        id: `policy:${source}`,
        maxAgeMilliseconds: 31 * 86_400_000,
        sourcePriority: [source],
      },
      priceMaxAgeMilliseconds: 31 * 86_400_000,
      priceSourcePriority: [source],
    };
  }
  async function fund(
    f: Fixture,
    amount: string,
    currency = eur,
    economicAt = at(2),
    kind: 'deposit' | 'withdrawal' | 'opening' | 'income' | 'unresolved' = 'deposit',
  ) {
    return ledger.recordCashMovement(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      cashBucketId: currency === eur ? f.eurBucket.id : f.usdBucket.id,
      currencyId: currency,
      amount,
      kind,
      economicAt,
      orderingKey: '1',
    });
  }
  async function fx(f: Fixture, rate: string, economicAt: string) {
    return observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate,
      observedAt: economicAt,
      source: f.source,
    });
  }
  async function mark(f: Fixture, price: string, economicAt: string) {
    return observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd,
      price,
      observedAt: economicAt,
      source: f.source,
    });
  }
  const money = (metric: { state: string; value: string | null }, value: string) =>
    expect(metric).toMatchObject({ state: 'available', value });

  it('does not scan transfer legs while reporting ordinary cash postings under the runtime role', async () => {
    const f = await fixture();
    await fund(f, '100');
    const instrumentation = instrumentPlatform(services);
    const result = await createAccountingReports(instrumentation.platform).report(
      owner,
      query([f.account.id], f.source),
    );
    money(result.closing.equity, '100');
    money(result.breakdown.boundaryTransfers, '0');
    money(result.reconciliation.performance, '0');
    money(result.reconciliation.variance, '0');
    const plans = await instrumentation.explain(owner, 100);
    const postingPlan = plans.find((plan) => plan.shape.includes('LEFT JOIN LATERAL'));
    expect(postingPlan?.state).toBe('available');
    if (!postingPlan || !('plan' in postingPlan)) throw new Error('Posting plan was not captured');
    const pending: unknown[] = [postingPlan.plan];
    const transferLegScans: Record<string, unknown>[] = [];
    while (pending.length) {
      const node = pending.pop();
      if (Array.isArray(node)) pending.push(...node);
      else if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (record.Alias === 'leg') transferLegScans.push(record);
        pending.push(...Object.values(record));
      }
    }
    // PG17 may prune the branch entirely; every retained transfer scan must remain unexecuted.
    expect(transferLegScans.every((node) => node['Actual Loops'] === 0)).toBe(true);
  });

  it('reconciles independent multi-currency price, holding FX, cash FX, conversion and fee effects', async () => {
    const f = await fixture();
    await fund(f, '2000');
    await fx(f, '0.9', at(3));
    await ledger.recordFxConversion(owner, {
      commandId: randomUUID(),
      sourceBucketId: f.eurBucket.id,
      destinationBucketId: f.usdBucket.id,
      sourceAmount: '1000',
      destinationAmount: '1100',
      economicAt: at(3),
      orderingKey: '2',
      fees: [{ cashBucketId: f.eurBucket.id, currencyId: eur, amount: '2', kind: 'conversion' }],
    });
    await fx(f, '0.85', at(4));
    await ledger.recordFxConversion(owner, {
      commandId: randomUUID(),
      sourceBucketId: f.eurBucket.id,
      destinationBucketId: f.usdBucket.id,
      sourceAmount: '500',
      destinationAmount: '600',
      economicAt: at(4),
      orderingKey: '2',
      fees: [{ cashBucketId: f.eurBucket.id, currencyId: eur, amount: '1', kind: 'conversion' }],
    });
    const buyRate = await fx(f, '0.9', at(5));
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '10',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: at(5),
      orderingKey: '2',
      costsComplete: true,
      basisReportingFx: { observationId: buyRate.id, rate: '0.9' },
      fees: [{ cashBucketId: f.usdBucket.id, currencyId: usd, amount: '2', kind: 'commission' }],
    });
    const sellRate = await fx(f, '0.92', at(6));
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'sell',
      quantity: '4',
      price: '120',
      cashBucketId: f.usdBucket.id,
      economicAt: at(6),
      orderingKey: '2',
      costsComplete: true,
      basisReportingFx: { observationId: sellRate.id, rate: '0.92' },
      fees: [{ cashBucketId: f.usdBucket.id, currencyId: usd, amount: '1', kind: 'commission' }],
    });
    await fx(f, '0.95', at(10));
    await mark(f, '110', at(10));
    const result = accountingReportResponseSchema.parse(
      await reports.report(viewer, query([f.account.id], f.source)),
    );
    money(result.closing.cash, '1615.15');
    money(result.closing.holdings, '627');
    money(result.closing.equity, '2242.15');
    money(result.closing.netLiquidationValue, '2242.15');
    expect(result.closing.cashByCurrency).toEqual(
      expect.arrayContaining([
        { currencyId: eur, amount: '497', reasons: [] },
        { currencyId: usd, amount: '1177', reasons: [] },
      ]),
    );
    money(result.breakdown.realizedTradingPnl, '73.6');
    money(result.breakdown.unrealizedTradingPnlChange, '57');
    money(result.breakdown.tradingPnl, '130.6');
    money(result.breakdown.holdingFx, '38');
    money(result.breakdown.cashFx, '79.27');
    money(result.breakdown.conversionEffects, '0');
    money(result.breakdown.fees, '5.72');
    money(result.breakdown.externalCashFlows, '2000');
    money(result.reconciliation.performance, '242.15');
    money(result.reconciliation.variance, '0');
    expect(result.native.realizedGross).toContainEqual(
      expect.objectContaining({
        currencyId: usd,
        metric: expect.objectContaining({ value: '80' }),
      }),
    );
  });

  it('treats deposits and withdrawals as external capital, including fractional amounts, never performance', async () => {
    const f = await fixture();
    await fund(f, '1000.1234');
    await fund(f, '-250.0001', eur, at(4), 'withdrawal');
    const result = await reports.report(owner, query([f.account.id], f.source));
    money(result.closing.equity, '750.1233');
    money(result.breakdown.externalCashFlows, '750.1233');
    money(result.breakdown.tradingPnl, '0');
    money(result.reconciliation.performance, '0');
    money(result.reconciliation.variance, '0');
  });

  it('keeps gross dividends, interest, commissions, expenses, withholding, taxes and refunds separate', async () => {
    const f = await fixture();
    await fund(f, '1000');
    await accounting.recordIncome(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      cashBucketId: f.eurBucket.id,
      currencyId: eur,
      kind: 'dividend',
      amount: '100',
      withholding: '15',
      economicAt: at(3),
      orderingKey: '2',
      description: 'Gross dividend and withholding',
    });
    await accounting.recordIncome(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      cashBucketId: f.eurBucket.id,
      currencyId: eur,
      kind: 'interest',
      amount: '5',
      economicAt: at(4),
      orderingKey: '2',
    });
    await accounting.recordExpense(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      cashBucketId: f.eurBucket.id,
      currencyId: eur,
      kind: 'interest',
      amount: '3',
      economicAt: at(5),
      orderingKey: '2',
      description: 'Margin interest paid',
    });
    await ledger.recordFee(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      cashBucketId: f.eurBucket.id,
      currencyId: eur,
      amount: '2',
      kind: 'tax-looking free text remains fee',
      economicAt: at(6),
      orderingKey: '2',
    });
    await accounting.recordTax(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      cashBucketId: f.eurBucket.id,
      currencyId: eur,
      amount: '4',
      economicAt: at(7),
      orderingKey: '2',
      description: 'Explicit tax',
    });
    await accounting.recordTax(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      cashBucketId: f.eurBucket.id,
      currencyId: eur,
      amount: '-1',
      economicAt: at(8),
      orderingKey: '2',
      description: 'Tax refund',
    });
    const result = await reports.report(owner, query([f.account.id], f.source));
    money(result.closing.equity, '1082');
    money(result.breakdown.income, '105');
    money(result.breakdown.fees, '2');
    money(result.breakdown.expenses, '3');
    money(result.breakdown.taxes, '18');
    money(result.breakdown.tradingPnl, '0');
    money(result.reconciliation.performance, '82');
    money(result.reconciliation.variance, '0');
  });

  it('cancels an immediate transfer between brokers in consolidation and excludes narrower boundary flows from performance', async () => {
    const a = await fixture();
    const b = await fixture();
    await fund(a, '100');
    await ledger.moveCashBuckets(owner, {
      commandId: randomUUID(),
      sourceBucketId: a.eurBucket.id,
      destinationBucketId: b.eurBucket.id,
      amount: '40',
      kind: 'internal-transfer',
      economicAt: at(3),
      orderingKey: '2',
    });
    const both = await reports.report(owner, query([a.account.id, b.account.id], a.source));
    money(both.closing.equity, '100');
    money(both.breakdown.boundaryTransfers, '0');
    money(both.reconciliation.performance, '0');
    money(both.reconciliation.variance, '0');
    const source = await reports.report(owner, query([a.account.id], a.source));
    money(source.closing.equity, '60');
    money(source.breakdown.externalCashFlows, '100');
    money(source.breakdown.boundaryTransfers, '-40');
    money(source.reconciliation.performance, '0');
    const destination = await reports.report(owner, query([b.account.id], b.source));
    money(destination.closing.equity, '40');
    money(destination.breakdown.externalCashFlows, '0');
    money(destination.breakdown.boundaryTransfers, '40');
    money(destination.reconciliation.performance, '0');
  });

  it('counts documented cash in transit once only when both endpoint accounts are selected', async () => {
    const a = await fixture();
    const b = await fixture();
    await fund(a, '100');
    const transfer = await accounting.createCashTransfer(owner, {
      commandId: randomUUID(),
      sourceBucketId: a.eurBucket.id,
      destinationBucketId: b.eurBucket.id,
      amount: '40',
      economicAt: at(3),
      orderingKey: '2',
      description: 'Owned bank transfer pending receipt',
    });
    const beforeReceipt = await reports.report(
      owner,
      query([a.account.id, b.account.id], a.source, initial, at(4)),
    );
    money(beforeReceipt.closing.cash, '60');
    money(beforeReceipt.closing.transit, '40');
    money(beforeReceipt.closing.equity, '100');
    money(beforeReceipt.reconciliation.performance, '0');
    const source = await reports.report(owner, query([a.account.id], a.source, initial, at(4)));
    money(source.closing.transit, '0');
    money(source.breakdown.boundaryTransfers, '-40');
    money(source.reconciliation.performance, '0');
    await accounting.receiveCashTransfer(owner, transfer.id, {
      commandId: randomUUID(),
      economicAt: at(6),
      orderingKey: '2',
    });
    const afterReceipt = await reports.report(
      owner,
      query([a.account.id, b.account.id], a.source, at(4), at(10)),
    );
    money(afterReceipt.opening.transit, '40');
    money(afterReceipt.closing.transit, '0');
    money(afterReceipt.closing.equity, '100');
    money(afterReceipt.breakdown.boundaryTransfers, '0');
    money(afterReceipt.reconciliation.performance, '0');
    money(afterReceipt.reconciliation.variance, '0');
    const destination = await reports.report(owner, query([b.account.id], b.source, at(4), at(10)));
    money(destination.breakdown.boundaryTransfers, '40');
    money(destination.reconciliation.performance, '0');
  });

  it('attributes exchange movements to cash and transit separately without treating an owned transfer as profit', async () => {
    const a = await fixture();
    const b = await fixture();
    await fx(a, '0.9', at(2));
    await fund(a, '100', usd);
    await fx(a, '0.9', at(3));
    const transfer = await accounting.createCashTransfer(owner, {
      commandId: randomUUID(),
      sourceBucketId: a.usdBucket.id,
      destinationBucketId: b.usdBucket.id,
      amount: '40',
      economicAt: at(3),
      orderingKey: '2',
      description: 'USD transfer with retained ownership',
    });
    await fx(a, '0.95', at(6));
    await accounting.receiveCashTransfer(owner, transfer.id, {
      commandId: randomUUID(),
      economicAt: at(6),
      orderingKey: '2',
    });
    await fx(a, '1', at(10));
    const result = await reports.report(owner, query([a.account.id, b.account.id], a.source));
    money(result.closing.equity, '100');
    money(result.breakdown.externalCashFlows, '90');
    money(result.breakdown.cashFx, '8');
    money(result.breakdown.transitFx, '2');
    money(result.breakdown.boundaryTransfers, '0');
    money(result.breakdown.tradingPnl, '0');
    money(result.reconciliation.performance, '10');
    money(result.reconciliation.variance, '0');
  });

  it('pins immutable portfolio membership rather than summing overlapping portfolios or borrowing a later definition', async () => {
    const a = await fixture();
    const b = await fixture();
    await fund(a, '100');
    await fund(b, '200');
    const first = await accounting.createPortfolio(owner, {
      commandId: randomUUID(),
      name: 'Primary',
      description: '',
      environment: 'live',
      accountIds: [a.account.id],
    });
    const second = await accounting.updatePortfolio(owner, first.id, {
      commandId: randomUUID(),
      name: 'Primary expanded',
      description: '',
      environment: 'live',
      accountIds: [a.account.id, b.account.id],
      expectedVersion: 1,
      reason: 'Include the second broker',
    });
    const overlapping = await accounting.createPortfolio(owner, {
      commandId: randomUUID(),
      name: 'Overlap',
      description: '',
      environment: 'live',
      accountIds: [b.account.id],
    });
    const base = query([a.account.id], a.source);
    const { accountIds: _accountIds, ...versionQuery } = base;
    const old = await reports.report(viewer, {
      ...versionQuery,
      portfolioVersionId: first.versionId,
    });
    const updated = await reports.report(viewer, {
      ...versionQuery,
      portfolioVersionId: second.versionId,
    });
    const overlap = await reports.report(viewer, {
      ...versionQuery,
      portfolioVersionId: overlapping.versionId,
    });
    money(old.closing.equity, '100');
    money(updated.closing.equity, '300');
    money(overlap.closing.equity, '200');
    expect(old.context).toMatchObject({
      accountIds: [a.account.id],
      portfolioId: first.id,
      portfolioVersion: 1,
    });
    expect(updated.context.portfolioVersion).toBe(2);
    await accounting.archivePortfolio(owner, first.id, {
      commandId: randomUUID(),
      expectedVersion: 2,
      reason: 'Archive scope without rewriting history',
    });
    money(
      (await reports.report(viewer, { ...versionQuery, portfolioVersionId: first.versionId }))
        .closing.equity,
      '100',
    );
    await expect(
      reports.report(owner, {
        ...versionQuery,
        portfolioVersionId: second.versionId,
        sourceRevision: first.sourceRevision,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('calculates interval performance rather than lifetime unrealized gains when existing holdings are partially closed', async () => {
    const f = await fixture();
    await fund(f, '1000', usd);
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '2',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: at(3),
      orderingKey: '2',
      costsComplete: true,
    });
    await mark(f, '110', at(4));
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'sell',
      quantity: '1',
      price: '120',
      cashBucketId: f.usdBucket.id,
      economicAt: at(6),
      orderingKey: '2',
      costsComplete: true,
    });
    await mark(f, '130', at(10));
    const result = await reports.report(owner, query([f.account.id], f.source, at(4), at(10), usd));
    money(result.opening.equity, '1020');
    money(result.closing.equity, '1050');
    money(result.breakdown.realizedTradingPnl, '20');
    money(result.breakdown.unrealizedTradingPnlChange, '10');
    money(result.reconciliation.performance, '30');
    money(result.reconciliation.variance, '0');
  });

  it('preserves inherited holding basis across brokers and excludes market-valued boundary transfers from account performance', async () => {
    const source = await fixture();
    const destination = await fixture();
    await fund(source, '2000', usd);
    const entry = await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: source.account.id,
      instrumentVersionId: source.instrument.versionId,
      side: 'buy',
      quantity: '10',
      price: '100',
      cashBucketId: source.usdBucket.id,
      economicAt: at(3),
      orderingKey: '2',
      costsComplete: true,
    });
    await mark(source, '110', at(4));
    await mark(source, '120', at(5));
    await ledger.recordHoldingTransfer(owner, {
      commandId: randomUUID(),
      sourceAccountId: source.account.id,
      destinationAccountId: destination.account.id,
      instrumentVersionId: source.instrument.versionId,
      economicAt: at(5),
      orderingKey: '2',
      reason: 'Move ownership custody with historical basis',
      selections: [{ lotId: entry.id, quantity: '4' }],
    });
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: destination.account.id,
      instrumentVersionId: source.instrument.versionId,
      side: 'sell',
      quantity: '2',
      price: '130',
      cashBucketId: destination.usdBucket.id,
      economicAt: at(6),
      orderingKey: '2',
      costsComplete: true,
    });
    await mark(source, '140', at(10));
    const consolidated = await reports.report(
      owner,
      query([source.account.id, destination.account.id], source.source, at(4), at(10), usd),
    );
    money(consolidated.opening.equity, '2100');
    money(consolidated.closing.equity, '2380');
    money(consolidated.breakdown.realizedTradingPnl, '60');
    money(consolidated.breakdown.unrealizedTradingPnlChange, '220');
    money(consolidated.breakdown.boundaryTransfers, '0');
    money(consolidated.reconciliation.performance, '280');
    money(consolidated.reconciliation.variance, '0');
    const departing = await reports.report(
      owner,
      query([source.account.id], source.source, at(4), at(10), usd),
    );
    money(departing.closing.equity, '1840');
    money(departing.breakdown.boundaryTransfers, '-480');
    money(departing.reconciliation.performance, '220');
    money(departing.reconciliation.variance, '0');
    const received = await reports.report(
      owner,
      query([destination.account.id], source.source, at(4), at(10), usd),
    );
    money(received.closing.equity, '540');
    money(received.breakdown.boundaryTransfers, '480');
    money(received.breakdown.realizedTradingPnl, '60');
    money(received.reconciliation.performance, '60');
    money(received.reconciliation.variance, '0');

    // Transfer-only acquisition history also protects the account's replay policy.
    const transferOnly = await fixture();
    await ledger.recordHoldingTransfer(owner, {
      commandId: randomUUID(),
      sourceAccountId: source.account.id,
      destinationAccountId: transferOnly.account.id,
      instrumentVersionId: source.instrument.versionId,
      economicAt: at(7),
      orderingKey: '2',
      reason: 'Transfer-only destination',
      selections: [{ lotId: entry.id, quantity: '1' }],
    });
    const historicalQuery = {
      ...query([transferOnly.account.id], source.source, initial, at(10), usd),
      sourceRevision: (
        await reports.report(
          owner,
          query([transferOnly.account.id], source.source, initial, at(10), usd),
        )
      ).context.sourceRevision,
    };
    const historical = await reports.report(owner, historicalQuery);
    await expect(
      catalog.appendAccountSettings(
        owner,
        transferOnly.account.id,
        {
          baseCurrencyId: eur,
          inventoryMethod: 'fifo',
          allowShort: true,
          holdingMode: 'segregated',
          effectiveAt: at(8),
          expectedRevision: transferOnly.account.revision,
          reason: 'Must not reinterpret inherited holding history',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'POLICY_TRANSITION_REQUIRED' });
    await expect(
      catalog.appendAccountSettings(
        owner,
        transferOnly.account.id,
        {
          baseCurrencyId: eur,
          inventoryMethod: 'average',
          allowShort: true,
          holdingMode: 'netted',
          effectiveAt: at(6),
          expectedRevision: transferOnly.account.revision,
          reason: 'Must not move the policy transition before an accepted transfer',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_REFERENCE' });
    expect(await reports.report(owner, historicalQuery)).toEqual(historical);
  });

  it('preserves fractional short liabilities and counts commissions exactly once in equity', async () => {
    const f = await fixture();
    await fund(f, '1000', usd);
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'sell',
      quantity: '0.5',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: at(3),
      orderingKey: '2',
      costsComplete: true,
      fees: [{ cashBucketId: f.usdBucket.id, currencyId: usd, amount: '1', kind: 'commission' }],
    });
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '0.2',
      price: '80',
      cashBucketId: f.usdBucket.id,
      economicAt: at(6),
      orderingKey: '2',
      costsComplete: true,
      fees: [{ cashBucketId: f.usdBucket.id, currencyId: usd, amount: '0.5', kind: 'commission' }],
    });
    await mark(f, '90', at(10));
    const result = await reports.report(
      owner,
      query([f.account.id], f.source, initial, at(10), usd),
    );
    money(result.closing.cash, '1032.5');
    money(result.closing.holdings, '-27');
    money(result.closing.equity, '1005.5');
    money(result.breakdown.realizedTradingPnl, '4');
    money(result.breakdown.unrealizedTradingPnlChange, '3');
    money(result.breakdown.fees, '1.5');
    money(result.reconciliation.performance, '5.5');
    money(result.reconciliation.variance, '0');
  });

  it('keeps unresolved cash classification and missing FX explicit rather than inventing zero performance or FX effects', async () => {
    const f = await fixture();
    await fund(f, '100');
    await fund(f, '5', eur, at(3), 'unresolved');
    const unresolved = await reports.report(owner, query([f.account.id], f.source));
    money(unresolved.closing.equity, '105');
    expect(unresolved.reconciliation.variance.state).not.toBe('available');
    expect(unresolved.reconciliation.variance.value).toBeNull();
    const missing = await fixture();
    await fund(missing, '100', usd);
    const noRate = await reports.report(owner, query([missing.account.id], missing.source));
    expect(noRate.closing.equity.value).toBeNull();
    expect(noRate.closing.equity.reasons).toContain('missing_fx');
    expect(noRate.reconciliation.performance.value).toBeNull();
    expect(noRate.breakdown.cashFx.value).toBeNull();
  });

  it('uses the pinned financial revision for corrected observations and excludes future/stale mark evidence', async () => {
    const f = await fixture();
    await fund(f, '100', usd);
    const original = await fx(f, '0.8', at(2));
    const before = await reports.report(owner, {
      ...query([f.account.id], f.source),
      sourceRevision: original.sourceRevision,
    });
    money(before.closing.equity, '80');
    const replacement = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '0.9',
      observedAt: at(2),
      source: f.source,
      supersedesId: original.id,
      reason: 'Correct exchange quote',
    });
    const pinned = await reports.report(owner, {
      ...query([f.account.id], f.source),
      sourceRevision: original.sourceRevision,
    });
    const current = await reports.report(owner, query([f.account.id], f.source));
    money(pinned.closing.equity, '80');
    money(current.closing.equity, '90');
    expect(current.context.sourceRevision).toBe(replacement.sourceRevision);
    await expect(
      reports.report(owner, {
        ...query([f.account.id], f.source),
        sourceRevision: String(BigInt(replacement.sourceRevision) + 1n),
      }),
    ).rejects.toMatchObject({ status: 422 });
    await ledger.recordOpeningLot(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      direction: 'long',
      quantity: '1',
      entryPrice: '5',
      bookedPrincipal: '5',
      reason: 'Known imported holding',
      economicAt: at(3),
      orderingKey: '2',
      costsComplete: true,
    });
    await mark(f, '10', at(3));
    await mark(f, '20', at(11));
    const stale = await reports.report(owner, {
      ...query([f.account.id], f.source),
      priceMaxAgeMilliseconds: 0,
    });
    expect(stale.closing.equity.value).toBeNull();
    expect(stale.dependencies.prices.some((dependency) => dependency.observedAt === at(11))).toBe(
      false,
    );
  });

  it('translates later execution fees at their charge dates and honors only their own reviewed FX evidence', async () => {
    const f = await fixture();
    await fx(f, '0.9', at(2));
    await fund(f, '1000', usd);
    const entryRate = await fx(f, '0.9', at(3));
    const execution = await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '1',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: at(3),
      orderingKey: '2',
      costsComplete: true,
      basisReportingFx: { observationId: entryRate.id, rate: '0.9' },
    });
    await fx(f, '0.95', at(6));
    await ledger.recordFee(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      executionId: execution.id,
      cashBucketId: f.usdBucket.id,
      currencyId: usd,
      amount: '10',
      kind: 'late commission',
      economicAt: at(6),
      orderingKey: '2',
    });
    const reviewedRate = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '0.97',
      observedAt: at(7),
      source: 'reviewed-fee-context',
    });
    await ledger.recordFee(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      executionId: execution.id,
      cashBucketId: f.usdBucket.id,
      currencyId: usd,
      amount: '5',
      kind: 'reviewed commission',
      economicAt: at(7),
      orderingKey: '2',
      reportingFx: { observationId: reviewedRate.id, rate: '0.97' },
    });
    await fx(f, '1', at(10));
    await mark(f, '110', at(10));
    const result = accountingReportResponseSchema.parse(
      await reports.report(owner, query([f.account.id], f.source)),
    );
    money(result.closing.equity, '995');
    money(result.breakdown.fees, '14.35');
    money(result.breakdown.cashFx, '89.35');
    money(result.breakdown.tradingPnl, '10');
    money(result.breakdown.holdingFx, '10');
    money(result.reconciliation.performance, '95');
    money(result.reconciliation.variance, '0');
  });

  it('reproduces prior revision reports after a later instrument version and holding-book projection update', async () => {
    const f = await fixture();
    await fund(f, '1000', usd);
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '1',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: at(3),
      orderingKey: '2',
      costsComplete: true,
    });
    const originalMark = await mark(f, '110', at(4));
    const originalQuery = {
      ...query([f.account.id], f.source, initial, at(4), usd),
      sourceRevision: originalMark.sourceRevision,
    };
    const original = await reports.report(owner, originalQuery);
    money(original.closing.equity, '1010');
    const nextVersion = await catalog.appendInstrumentVersion(
      owner,
      f.instrument.id,
      {
        quantityUnit: 'share',
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: '1',
        quantityIncrement: '0.0001',
        priceIncrement: '0.0001',
        capability: 'native-linear',
        effectiveAt: at(5),
        expectedRevision: f.instrument.revision,
        reason: 'Prospective price increment review',
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'delivered',
          shortConvention: 'borrowed-delivery',
          carryCostPolicy: 'explicit-source-charges',
        },
      },
      randomUUID(),
    );
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: nextVersion.versionId,
      side: 'buy',
      quantity: '1',
      price: '120',
      cashBucketId: f.usdBucket.id,
      economicAt: at(6),
      orderingKey: '2',
      costsComplete: true,
    });
    await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: nextVersion.versionId,
      currencyId: usd,
      price: '130',
      observedAt: at(10),
      source: f.source,
    });
    await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      currencyId: eur,
      kind: 'restricted',
    });
    expect(await reports.report(owner, originalQuery)).toEqual(original);
    const current = await reports.report(
      owner,
      query([f.account.id], f.source, at(4), at(10), usd),
    );
    money(current.opening.equity, '1010');
    money(current.closing.equity, '1040');
    money(current.reconciliation.performance, '30');
    money(current.reconciliation.variance, '0');
    expect(current.dependencies.prices).toEqual(
      expect.arrayContaining([expect.objectContaining({ observationId: originalMark.id })]),
    );
  });

  it('derives a known empty opening when the account first becomes effective within the reporting interval', async () => {
    const f = await fixture('live', at(3));
    await fund(f, '1000', usd, at(4));
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '1',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: at(5),
      orderingKey: '2',
      costsComplete: true,
    });
    await mark(f, '110', at(10));
    const result = await reports.report(
      owner,
      query([f.account.id], f.source, initial, at(10), usd),
    );
    money(result.opening.equity, '0');
    money(result.closing.equity, '1010');
    money(result.breakdown.externalCashFlows, '1000');
    money(result.reconciliation.performance, '10');
    money(result.reconciliation.variance, '0');
  });

  it('classifies original, exact reversal and replacement cash effects while using only effective inventory facts', async () => {
    const f = await fixture();
    await fund(f, '1000', usd);
    const original = await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '2',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: at(3),
      orderingKey: '2',
      costsComplete: true,
      fees: [{ cashBucketId: f.usdBucket.id, currencyId: usd, amount: '1', kind: 'commission' }],
    });
    const observation = await mark(f, '120', at(10));
    const originalQuery = {
      ...query([f.account.id], f.source, initial, at(10), usd),
      sourceRevision: observation.sourceRevision,
    };
    const before = await reports.report(owner, originalQuery);
    money(before.closing.equity, '1039');
    money(before.breakdown.tradingPnl, '40');
    money(before.breakdown.fees, '1');
    await ledger.correctExecution(owner, {
      commandId: randomUUID(),
      originalExecutionId: original.id,
      reason: 'Correct authoritative fill price',
      replacement: {
        accountId: f.account.id,
        instrumentVersionId: f.instrument.versionId,
        side: 'buy',
        quantity: '2',
        price: '110',
        cashBucketId: f.usdBucket.id,
        economicAt: at(3),
        orderingKey: '2',
        costsComplete: true,
        fees: [{ cashBucketId: f.usdBucket.id, currencyId: usd, amount: '2', kind: 'commission' }],
      },
    });
    const after = await reports.report(
      owner,
      query([f.account.id], f.source, initial, at(10), usd),
    );
    money(after.closing.cash, '778');
    money(after.closing.holdings, '240');
    money(after.closing.equity, '1018');
    money(after.breakdown.tradingPnl, '20');
    money(after.breakdown.fees, '2');
    money(after.reconciliation.performance, '18');
    money(after.reconciliation.variance, '0');
    expect(await reports.report(owner, originalQuery)).toEqual(before);
  });

  it('returns explicit accounting overflow instead of rejecting valid source amounts whose derived sum exceeds the output bound', async () => {
    const f = await fixture();
    const maximumSource = '9'.repeat(42);
    await fund(f, maximumSource);
    await fund(f, maximumSource, eur, at(3));
    const result = accountingReportResponseSchema.parse(
      await reports.report(owner, query([f.account.id], f.source)),
    );
    expect(result.closing.equity).toMatchObject({ state: 'unavailable', value: null });
    expect(result.closing.equity.reasons).toContain('numeric_overflow');
    expect(result.closing.cashByCurrency).toContainEqual(
      expect.objectContaining({
        currencyId: eur,
        amount: null,
        reasons: ['numeric_overflow'],
      }),
    );
  });

  it('keeps one repeatable-read snapshot while an independently committed deposit arrives', async () => {
    const f = await fixture();
    const funded = await fund(f, '100');
    let injected = false;
    const coherent = createAccountingReports({
      withWorkspaceContext: (context, callback, options) =>
        services.withWorkspaceContext(
          context,
          async (tx) => {
            expect(options).toEqual({ isolationLevel: 'repeatable read', accessMode: 'read only' });
            await tx.execute(
              sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
            );
            if (!injected) {
              injected = true;
              await fund(f, '50', eur, at(3));
            }
            return callback(tx);
          },
          options,
        ),
    });
    const old = await coherent.report(viewer, query([f.account.id], f.source));
    expect(old.context.sourceRevision).toBe(funded.sourceRevision);
    money(old.closing.equity, '100');
    const current = await reports.report(viewer, query([f.account.id], f.source));
    money(current.closing.equity, '150');
    money(current.reconciliation.performance, '0');
  });

  it('rejects cross-workspace scopes and mixed paper/live populations while allowing a viewer coherent reads', async () => {
    const live = await fixture();
    const paper = await fixture('paper');
    await fund(live, '25');
    money(
      (await reports.report(viewer, query([live.account.id], live.source))).closing.equity,
      '25',
    );
    await expect(
      reports.report(outsider, query([live.account.id], live.source)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reports.report(owner, query([live.account.id, paper.account.id], live.source)),
    ).rejects.toMatchObject({ status: 422 });
  });
});
