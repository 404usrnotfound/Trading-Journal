import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  accountingMetricSchema,
  accountingReportRequestSchema,
  accountingReportResponseSchema,
  archivePortfolioRequestSchema,
  cashTransferListQuerySchema,
  cashTransferResponseSchema,
  createCashTransferRequestSchema,
  createPortfolioRequestSchema,
  portfolioListQuerySchema,
  portfolioMutationResponseSchema,
  portfolioResponseSchema,
  portfolioVersionsQuerySchema,
  receiveCashTransferRequestSchema,
  recordExpenseRequestSchema,
  recordIncomeRequestSchema,
  recordTaxRequestSchema,
  updatePortfolioRequestSchema,
} from '@journal/contracts';
import { FINANCIAL_CALCULATION_MANIFEST } from '@journal/domain';

const accountId = randomUUID();
const bucketId = randomUUID();
const currencyId = randomUUID();
const economicAt = '2026-10-12T12:00:00.123456+02:00';
const economic = { economicAt, orderingKey: '1' };
const portfolio = { name: 'Long-term account', environment: 'live', accountIds: [accountId] };
const income = {
  ...economic,
  accountId,
  cashBucketId: bucketId,
  currencyId,
  kind: 'dividend',
  amount: '12.345678901234567890123456789012345678',
  withholding: '2.50',
};
const transfer = {
  ...economic,
  sourceBucketId: bucketId,
  destinationBucketId: randomUUID(),
  amount: '0.000000000000000000000000000000000001',
  description: 'Transfer between owned broker accounts',
};
const report = {
  accountIds: [accountId],
  reportingCurrencyId: currencyId,
  from: '2026-10-12T08:00:00Z',
  to: '2026-10-12T12:00:00Z',
  fxPolicy: {
    id: 'reviewed-accounting-v1',
    maxAgeMilliseconds: 60_000,
    sourcePriority: ['manual'],
  },
  priceMaxAgeMilliseconds: 60_000,
  priceSourcePriority: ['manual'],
};
const metric = {
  state: 'available',
  value: '0',
  knownSubtotal: '0',
  currencyId,
  reasons: [],
  missingReferences: [],
};

function reportResponse() {
  const snapshot = {
    asOf: report.from,
    cashByCurrency: [{ currencyId, amount: '0', reasons: [] }],
    cash: metric,
    holdings: metric,
    transit: metric,
    equity: metric,
    netLiquidationValue: metric,
    unrealizedGrossByCurrency: [{ currencyId, metric }],
  };
  return {
    context: {
      accountIds: [accountId],
      reportingCurrencyId: currencyId,
      portfolioId: null,
      portfolioVersion: null,
      environment: 'live',
      sourceRevision: '0',
      from: report.from,
      to: report.to,
      fxPolicy: report.fxPolicy,
      pricePolicy: { maxAgeMilliseconds: 60_000, sourcePriority: ['manual'] },
      manifest: FINANCIAL_CALCULATION_MANIFEST,
      accountingVersion: 'portfolio-accounting-v1',
    },
    opening: snapshot,
    closing: { ...snapshot, asOf: report.to },
    breakdown: {
      realizedTradingPnl: metric,
      unrealizedTradingPnlChange: metric,
      tradingPnl: metric,
      holdingFx: metric,
      cashFx: metric,
      transitFx: metric,
      conversionEffects: metric,
      income: metric,
      fees: metric,
      expenses: metric,
      taxes: metric,
      externalCashFlows: metric,
      boundaryTransfers: metric,
      openingAdjustments: metric,
    },
    native: { realizedGross: [{ currencyId, metric }], unrealizedGross: [] },
    reconciliation: {
      navChange: metric,
      netCapitalFlows: metric,
      performance: metric,
      explainedChange: metric,
      variance: metric,
      roundingResidual: metric,
    },
    dependencies: { fx: [], prices: [], sourceIds: [] },
  };
}

describe('portfolio accounting source boundaries', () => {
  it('requires an explicit account population and preserves a full versioned portfolio definition', () => {
    expect(createPortfolioRequestSchema.parse(portfolio)).toEqual({
      ...portfolio,
      description: '',
    });
    expect(
      updatePortfolioRequestSchema.parse({
        ...portfolio,
        expectedVersion: 1,
        reason: 'Add account',
      }),
    ).toMatchObject({ expectedVersion: 1, reason: 'Add account' });
    for (const value of [
      { ...portfolio, accountIds: [] },
      { ...portfolio, accountIds: Array.from({ length: 101 }, () => randomUUID()) },
      { ...portfolio, accountIds: [accountId, accountId.toUpperCase()] },
      { ...portfolio, environment: 'combined' },
      { ...portfolio, name: ' ' },
      { ...portfolio, description: 'x'.repeat(4_001) },
      { ...portfolio, archived: true },
    ])
      expect(createPortfolioRequestSchema.safeParse(value).success).toBe(false);
  });

  it('normalizes account identities before validating duplicates and idempotent source input', () => {
    expect(
      createPortfolioRequestSchema.parse({ ...portfolio, accountIds: [accountId.toUpperCase()] })
        .accountIds,
    ).toEqual([accountId]);
    expect(
      recordIncomeRequestSchema.parse({ ...income, accountId: accountId.toUpperCase() }).accountId,
    ).toBe(accountId);
  });

  it('requires optimistic version checks and a reason when changing or archiving a portfolio', () => {
    for (const value of [
      { ...portfolio, reason: 'Change' },
      { ...portfolio, expectedVersion: 0, reason: 'Change' },
      { ...portfolio, expectedVersion: 1, reason: ' ' },
      { expectedVersion: 1, reason: 'Patch name', name: 'New name' },
    ])
      expect(updatePortfolioRequestSchema.safeParse(value).success).toBe(false);
    expect(
      archivePortfolioRequestSchema.parse({ expectedVersion: 2, reason: 'Retire scope' }),
    ).toEqual({ expectedVersion: 2, reason: 'Retire scope' });
    expect(archivePortfolioRequestSchema.safeParse({ expectedVersion: 2 }).success).toBe(false);
  });

  it('records gross income and withholding as distinct exact decimal source facts', () => {
    expect(recordIncomeRequestSchema.parse(income)).toEqual(income);
    expect(
      recordIncomeRequestSchema.parse({ ...income, kind: 'interest', withholding: '0' })
        .withholding,
    ).toBe('0');
    for (const value of [
      { ...income, amount: 12.34 },
      { ...income, amount: '0' },
      { ...income, amount: '-1' },
      { ...income, amount: '1e2' },
      { ...income, amount: '1'.repeat(43) },
      { ...income, amount: `0.${'0'.repeat(36)}1` },
      { ...income, withholding: '-0.01' },
      { ...income, withholding: 0.1 },
      { ...income, kind: 'trading-profit' },
      { ...income, netAmount: '9.845678901234567890123456789012345678' },
    ])
      expect(recordIncomeRequestSchema.safeParse(value).success).toBe(false);
  });

  it('preserves signed tax and expense refunds without accepting zero charges or invented totals', () => {
    const source = {
      ...economic,
      accountId,
      cashBucketId: bucketId,
      currencyId,
      description: 'Reviewed adjustment',
    };
    expect(recordTaxRequestSchema.parse({ ...source, amount: '-0.01' }).amount).toBe('-0.01');
    expect(
      recordExpenseRequestSchema.parse({ ...source, amount: '5.50', kind: 'financing' }).amount,
    ).toBe('5.50');
    expect(
      recordExpenseRequestSchema.parse({ ...source, amount: '-5.50', kind: 'interest' }).amount,
    ).toBe('-5.50');
    for (const amount of ['0', '-0', '0.000', '-0.000', 0.01, 'NaN', '1,000']) {
      expect(recordTaxRequestSchema.safeParse({ ...source, amount }).success).toBe(false);
      expect(
        recordExpenseRequestSchema.safeParse({ ...source, amount, kind: 'other' }).success,
      ).toBe(false);
    }
    expect(
      recordExpenseRequestSchema.safeParse({ ...source, amount: '1', kind: 'tax' }).success,
    ).toBe(false);
    expect(
      recordTaxRequestSchema.safeParse({ ...source, amount: '1', totalTaxes: '1' }).success,
    ).toBe(false);
  });

  it('accepts pending departures and same-instant receipts with exact offset and microsecond equivalence', () => {
    expect(createCashTransferRequestSchema.parse(transfer)).toEqual(transfer);
    expect(
      createCashTransferRequestSchema.parse({
        ...transfer,
        receiptAt: '2026-10-12T10:00:00.123456Z',
      }).receiptAt,
    ).toBe('2026-10-12T10:00:00.123456Z');
    for (const receiptAt of [
      '2026-10-12T10:00:00.123455Z',
      '2026-10-12T10:00:00.123457Z',
      '2026-10-13T10:00:00Z',
    ])
      expect(createCashTransferRequestSchema.safeParse({ ...transfer, receiptAt }).success).toBe(
        false,
      );
    expect(
      createCashTransferRequestSchema.safeParse({
        ...transfer,
        destinationBucketId: bucketId.toUpperCase(),
      }).success,
    ).toBe(false);
  });

  it('records a separate receipt without accepting an amount, actor, or transfer identity in the body', () => {
    expect(receiveCashTransferRequestSchema.parse(economic)).toEqual(economic);
    for (const field of ['amount', 'actorId', 'transferId', 'sourceRevision', 'status'])
      expect(
        receiveCashTransferRequestSchema.safeParse({ ...economic, [field]: 'client-value' })
          .success,
      ).toBe(false);
  });

  it('rejects server-owned command and financial fields on every mutation input', () => {
    const source = {
      ...economic,
      accountId,
      cashBucketId: bucketId,
      currencyId,
      amount: '1',
      description: 'Recorded tax',
    };
    for (const [schema, body] of [
      [createPortfolioRequestSchema, portfolio],
      [recordIncomeRequestSchema, income],
      [recordTaxRequestSchema, source],
      [recordExpenseRequestSchema, { ...source, kind: 'other' }],
      [createCashTransferRequestSchema, transfer],
    ] as const)
      for (const field of ['commandId', 'workspaceId', 'actorId', 'sourceRevision', 'realizedPnl'])
        expect(schema.safeParse({ ...body, [field]: randomUUID() }).success).toBe(false);
  });

  it('selects exactly one explicit account population or immutable portfolio version', () => {
    expect(accountingReportRequestSchema.parse(report)).toEqual(report);
    const { accountIds: _accountIds, ...withoutAccounts } = report;
    expect(
      accountingReportRequestSchema.parse({ ...withoutAccounts, portfolioVersionId: randomUUID() })
        .portfolioVersionId,
    ).toBeDefined();
    expect(accountingReportRequestSchema.safeParse(withoutAccounts).success).toBe(false);
    expect(
      accountingReportRequestSchema.safeParse({ ...report, portfolioVersionId: randomUUID() })
        .success,
    ).toBe(false);
    expect(
      accountingReportRequestSchema.safeParse({
        ...report,
        accountIds: [accountId, accountId.toUpperCase()],
      }).success,
    ).toBe(false);
    expect(
      accountingReportRequestSchema.safeParse({ ...withoutAccounts, portfolioId: randomUUID() })
        .success,
    ).toBe(false);
  });

  it('compares period instants at microsecond precision instead of truncating to JavaScript milliseconds', () => {
    expect(
      accountingReportRequestSchema.safeParse({
        ...report,
        from: '2026-10-12T10:00:00.123456Z',
        to: '2026-10-12T12:00:00.123457+02:00',
      }).success,
    ).toBe(true);
    for (const to of ['2026-10-12T12:00:00.123456+02:00', '2026-10-12T12:00:00.123455+02:00'])
      expect(
        accountingReportRequestSchema.safeParse({
          ...report,
          from: '2026-10-12T10:00:00.123456Z',
          to,
        }).success,
      ).toBe(false);
    expect(accountingReportRequestSchema.safeParse({ ...report, from: 'invalid' }).success).toBe(
      false,
    );
  });

  it('requires bounded revision and explicit fresh-price and FX source policies', () => {
    expect(
      accountingReportRequestSchema.parse({ ...report, sourceRevision: '2147483647' })
        .sourceRevision,
    ).toBe('2147483647');
    for (const value of [
      { ...report, sourceRevision: '2147483648' },
      { ...report, sourceRevision: 1 },
      { ...report, fxPolicy: { ...report.fxPolicy, sourcePriority: [] } },
      { ...report, fxPolicy: { ...report.fxPolicy, sourcePriority: ['manual', ' manual '] } },
      { ...report, fxPolicy: { ...report.fxPolicy, maxAgeMilliseconds: -1 } },
      { ...report, priceMaxAgeMilliseconds: 0.5 },
      { ...report, priceSourcePriority: ['manual', 'manual'] },
      { ...report, priceSourcePriority: undefined },
      { ...report, fxPolicy: { ...report.fxPolicy, rate: '1' } },
    ])
      expect(accountingReportRequestSchema.safeParse(value).success).toBe(false);
  });

  it('bounds lexical cursor paging and reads cash transfers at explicit economic boundaries', () => {
    expect(portfolioListQuerySchema.parse({})).toEqual({ limit: 25, includeArchived: false });
    expect(
      portfolioVersionsQuerySchema.parse({ limit: '100', cursor: accountId.toUpperCase() }),
    ).toEqual({ limit: 100, cursor: accountId });
    expect(cashTransferListQuerySchema.parse({ asOf: economicAt })).toEqual({
      limit: 25,
      asOf: economicAt,
    });
    for (const limit of ['0', '01', '101', '1e2', ' 25 ', 25])
      expect(portfolioListQuerySchema.safeParse({ limit }).success).toBe(false);
    expect(portfolioListQuerySchema.safeParse({ includeArchived: true }).success).toBe(false);
    expect(cashTransferListQuerySchema.safeParse({ asOf: '2026-10-12' }).success).toBe(false);
  });
});

describe('strict accounting report response contracts', () => {
  it('represents a genuinely known zero independently of a missing monetary result', () => {
    expect(accountingMetricSchema.parse(metric)).toEqual(metric);
    const partial = {
      ...metric,
      state: 'partial',
      value: null,
      knownSubtotal: '10.50',
      reasons: ['Missing FX'],
      missingReferences: ['fx:USD/EUR'],
    };
    expect(accountingMetricSchema.parse(partial)).toEqual(partial);
    expect(
      accountingMetricSchema.parse({ ...partial, state: 'unavailable', knownSubtotal: '0' }).value,
    ).toBeNull();
    for (const value of [
      { ...metric, value: null },
      { ...metric, value: '1' },
      { ...metric, reasons: ['Missing mark'] },
      { ...metric, missingReferences: ['price:missing'] },
      { ...partial, value: '10.50' },
      { ...partial, reasons: [] },
      { ...metric, knownSubtotal: 0 },
      { ...metric, sourceAmount: '1' },
    ])
      expect(accountingMetricSchema.safeParse(value).success).toBe(false);
  });

  it('validates immutable source revisions and the complete report without allowing internal fields', () => {
    const response = reportResponse();
    expect(accountingReportResponseSchema.parse(JSON.parse(JSON.stringify(response)))).toEqual(
      response,
    );
    expect(
      accountingReportResponseSchema.safeParse({
        ...response,
        context: { ...response.context, databaseUrl: 'private' },
      }).success,
    ).toBe(false);
    expect(
      accountingReportResponseSchema.safeParse({
        ...response,
        closing: { ...response.closing, equity: { ...metric, value: 0 } },
      }).success,
    ).toBe(false);
    expect(
      accountingReportResponseSchema.safeParse({
        ...response,
        reconciliation: { ...response.reconciliation, unexplainedAsFx: '1' },
      }).success,
    ).toBe(false);
  });

  it('requires explicit reconciliation variance and separate expenses, taxes, income, fees and capital flows', () => {
    const response = reportResponse();
    for (const field of [
      'income',
      'fees',
      'expenses',
      'taxes',
      'externalCashFlows',
      'boundaryTransfers',
      'openingAdjustments',
      'cashFx',
      'transitFx',
    ]) {
      const breakdown = { ...response.breakdown };
      Reflect.deleteProperty(breakdown, field);
      expect(accountingReportResponseSchema.safeParse({ ...response, breakdown }).success).toBe(
        false,
      );
    }
    const { variance: _variance, ...withoutVariance } = response.reconciliation;
    expect(
      accountingReportResponseSchema.safeParse({ ...response, reconciliation: withoutVariance })
        .success,
    ).toBe(false);
  });

  it('requires versioned portfolio identity and a persisted command identity in mutation responses', () => {
    const mutation = {
      id: randomUUID(),
      commandId: randomUUID(),
      sourceRevision: '10',
      versionId: randomUUID(),
      version: 1,
    };
    expect(portfolioMutationResponseSchema.parse(mutation)).toEqual(mutation);
    expect(portfolioMutationResponseSchema.safeParse({ ...mutation, version: 0 }).success).toBe(
      false,
    );
    const currentVersion = {
      ...portfolio,
      description: '',
      id: mutation.versionId,
      portfolioId: mutation.id,
      version: 1,
      archived: false,
      reason: 'Initial version',
      sourceRevision: '10',
      commandId: mutation.commandId,
      createdAt: economicAt,
    };
    const value = {
      id: mutation.id,
      workspaceId: randomUUID(),
      createdAt: economicAt,
      currentVersion,
    };
    expect(portfolioResponseSchema.parse(value)).toEqual(value);
    expect(
      portfolioResponseSchema.safeParse({
        ...value,
        currentVersion: { ...currentVersion, accountIds: [accountId, accountId] },
      }).success,
    ).toBe(false);
    expect(portfolioResponseSchema.safeParse({ ...value, id: randomUUID() }).success).toBe(false);
  });

  it('binds snapshots, reporting metrics and immutable portfolio metadata to their declared context', () => {
    const response = reportResponse();
    const portfolioContext = {
      ...response.context,
      portfolioVersionId: randomUUID(),
      portfolioId: randomUUID(),
      portfolioVersion: 1,
    };
    expect(
      accountingReportResponseSchema.safeParse({ ...response, context: portfolioContext }).success,
    ).toBe(true);
    for (const context of [
      { ...response.context, portfolioId: randomUUID() },
      { ...portfolioContext, portfolioVersion: null },
      { ...portfolioContext, portfolioId: null },
    ])
      expect(accountingReportResponseSchema.safeParse({ ...response, context }).success).toBe(
        false,
      );
    expect(
      accountingReportResponseSchema.safeParse({
        ...response,
        closing: { ...response.closing, asOf: report.from },
      }).success,
    ).toBe(false);
    expect(
      accountingReportResponseSchema.safeParse({
        ...response,
        breakdown: { ...response.breakdown, cashFx: { ...metric, currencyId: randomUUID() } },
      }).success,
    ).toBe(false);
    expect(
      accountingReportResponseSchema.safeParse({
        ...response,
        native: { ...response.native, realizedGross: [{ currencyId: randomUUID(), metric }] },
      }).success,
    ).toBe(false);
  });

  it('requires matching transfer status and dated receipt evidence without permitting self-transfers', () => {
    const source = {
      ...transfer,
      id: randomUUID(),
      commandId: randomUUID(),
      sourceRevision: '1',
      sourceAccountId: accountId,
      destinationAccountId: randomUUID(),
      currencyId,
      status: 'pending',
      receipt: null,
    };
    expect(cashTransferResponseSchema.parse(source)).toEqual(source);
    const receipt = {
      id: randomUUID(),
      commandId: randomUUID(),
      sourceRevision: '2',
      ...economic,
      economicAt: '2026-10-13T10:00:00Z',
    };
    expect(
      cashTransferResponseSchema.safeParse({ ...source, status: 'received', receipt }).success,
    ).toBe(true);
    for (const value of [
      { ...source, status: 'received' },
      { ...source, receipt },
      { ...source, destinationAccountId: accountId },
      {
        ...source,
        status: 'received',
        receipt: { ...receipt, economicAt: '2026-10-12T10:00:00.123455Z' },
      },
    ])
      expect(cashTransferResponseSchema.safeParse(value).success).toBe(false);
  });
});

describe('accounting source-pinned FX provenance', () => {
  it('accepts the validated manual rate route and retains its reviewed source context', () => {
    const response = reportResponse();
    const selection = {
      state: 'available',
      value: {
        baseCurrencyId: randomUUID(),
        quoteCurrencyId: currencyId,
        rate: '0.9',
        requestedAt: report.from,
        observationIds: [randomUUID()],
        route: 'manual-direct',
        policyId: 'source-pinned-v1',
        reviewedContextId: 'financial-source:original-execution',
      },
    };
    expect(
      accountingReportResponseSchema.parse({
        ...response,
        dependencies: {
          ...response.dependencies,
          fx: [{ componentId: 'original-execution', selection }],
        },
      }).dependencies.fx[0]!.selection,
    ).toEqual(selection);
  });
});
