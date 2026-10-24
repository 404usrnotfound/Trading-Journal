import { z } from 'zod';
import { suppliedReferenceSchema } from './supplied-reference.js';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialOrderingKeySchema,
  financialRevisionSchema,
  financialSchemaComponents,
  financialSourceRevisionSchema,
  nonnegativeFinancialDecimalSchema,
  positiveFinancialDecimalSchema,
} from './financial.js';

const id = financialIdSchema.transform((value) => value.toLowerCase());
const nullableId = z.union([id, z.null()]);
const label = z.string().trim().min(1).max(160);
const narrative = z.string().max(4_000);
const reason = z.string().trim().min(1).max(2_000);
const environment = z.enum(['live', 'paper']);
const economic = {
  economicAt: financialInstantSchema,
  orderingKey: financialOrderingKeySchema,
};
const nonzeroDecimal = financialDecimalSchema.refine(
  (value) => /[1-9]/u.test(value),
  'Use a nonzero decimal string.',
);
const accountIds = id
  .array()
  .min(1)
  .max(100)
  .refine((value) => new Set(value).size === value.length, 'Account identities must be unique.');
const portfolioDefinition = {
  name: label,
  description: narrative.default(''),
  environment,
  accountIds,
};

/** A version stores a complete, immutable scope; edits never reinterpret historical reports. */
export const createPortfolioRequestSchema = z.strictObject(portfolioDefinition);
export const updatePortfolioRequestSchema = z.strictObject({
  ...portfolioDefinition,
  expectedVersion: financialRevisionSchema,
  reason,
});
export const archivePortfolioRequestSchema = z.strictObject({
  expectedVersion: financialRevisionSchema,
  reason,
});
export const recordIncomeRequestSchema = z.strictObject({
  ...economic,
  accountId: id,
  cashBucketId: id,
  currencyId: id,
  kind: z.enum(['dividend', 'interest']),
  amount: positiveFinancialDecimalSchema,
  withholding: nonnegativeFinancialDecimalSchema.optional(),
  description: narrative.optional(),
});
export const recordTaxRequestSchema = z.strictObject({
  ...economic,
  accountId: id,
  cashBucketId: id,
  currencyId: id,
  amount: nonzeroDecimal,
  description: narrative,
  relatedIncomeId: id.optional(),
});
export const recordExpenseRequestSchema = z.strictObject({
  ...economic,
  accountId: id,
  cashBucketId: id,
  currencyId: id,
  amount: nonzeroDecimal,
  kind: z.enum(['financing', 'interest', 'other']),
  description: narrative,
});

/** Financial timestamps retain PostgreSQL's microseconds when comparing economic boundaries. */
function instantMicroseconds(value: string): bigint {
  const fraction = value.match(/\.(\d+)/u)?.[1] ?? '';
  const wholeSeconds = Date.parse(value.replace(/\.\d+/u, ''));
  return BigInt(wholeSeconds) * 1_000n + BigInt(fraction.padEnd(6, '0'));
}

export const createCashTransferRequestSchema = z
  .strictObject({
    ...economic,
    sourceBucketId: id,
    destinationBucketId: id,
    amount: positiveFinancialDecimalSchema,
    description: narrative,
    receiptAt: financialInstantSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.sourceBucketId === value.destinationBucketId)
      context.addIssue({
        code: 'custom',
        path: ['destinationBucketId'],
        message: 'An owned-account transfer requires distinct cash buckets.',
      });
    if (
      value.receiptAt !== undefined &&
      financialInstantSchema.safeParse(value.economicAt).success &&
      financialInstantSchema.safeParse(value.receiptAt).success &&
      instantMicroseconds(value.receiptAt) !== instantMicroseconds(value.economicAt)
    )
      context.addIssue({
        code: 'custom',
        path: ['receiptAt'],
        message:
          'An immediate receipt must have the departure instant; record a later receipt separately.',
      });
  });
export const receiveCashTransferRequestSchema = z.strictObject(economic);

/** Correct an erroneous historical fact; a genuine later refund remains a new source fact. */
export const reverseAccountingSourceRequestSchema = z.strictObject({
  sourceType: z.enum(['cash-event', 'transfer']),
  expectedSourceRevision: financialSourceRevisionSchema,
  reason,
});
export const accountingCorrectionSourcesQuerySchema = z.strictObject({
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const accountingCorrectionSourcesResponseSchema = z.strictObject({
  sourceRevision: financialSourceRevisionSchema,
  items: z
    .strictObject({
      id,
      sourceType: z.enum(['cash-event', 'transfer']),
      kind: z.string().min(1),
      description: narrative,
      economicAt: financialInstantSchema,
      currencyId: id,
      amount: financialDecimalSchema,
      reversed: z.boolean(),
    })
    .array()
    .max(100),
  nextCursor: nullableId,
});

const priority = label
  .array()
  .min(1)
  .max(64)
  .refine((value) => new Set(value).size === value.length, 'Source priorities must be unique.');
const maximumAge = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const accountingFxPolicySchema = z.strictObject({
  id: label,
  maxAgeMilliseconds: maximumAge,
  sourcePriority: priority,
});
export const accountingPricePolicySchema = accountingFxPolicySchema.omit({ id: true });
export const accountingReportRequestSchema = z
  .strictObject({
    suppliedPositionIds: id.array().max(100).optional(),
    accountIds: accountIds.optional(),
    portfolioVersionId: id.optional(),
    reportingCurrencyId: id,
    from: financialInstantSchema,
    to: financialInstantSchema,
    sourceRevision: financialSourceRevisionSchema.optional(),
    fxPolicy: accountingFxPolicySchema,
    priceMaxAgeMilliseconds: maximumAge,
    priceSourcePriority: priority,
    detail: z.enum(['full', 'summary']).optional(),
    dependencyPage: z
      .strictObject({
        kind: z.enum(['fx', 'prices', 'sourceIds']),
        offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        limit: z.number().int().min(1).max(200),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.dependencyPage && (value.detail !== 'summary' || value.sourceRevision === undefined))
      context.addIssue({
        code: 'custom',
        path: ['dependencyPage'],
        message: 'Dependency pages require summary detail and a pinned source revision.',
      });
    if ((value.accountIds === undefined) === (value.portfolioVersionId === undefined))
      context.addIssue({
        code: 'custom',
        path: ['accountIds'],
        message: 'Select exactly one account scope or immutable portfolio version.',
      });
    if (
      financialInstantSchema.safeParse(value.from).success &&
      financialInstantSchema.safeParse(value.to).success &&
      instantMicroseconds(value.from) >= instantMicroseconds(value.to)
    )
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The reporting period must end after its opening boundary.',
      });
  });

export const accountingMutationResponseSchema = z.strictObject({
  id,
  commandId: id,
  sourceRevision: financialSourceRevisionSchema,
});

export const accountPerformanceRequestSchema = accountingReportRequestSchema.safeExtend({
  /** Optional display samples; the server always includes every economic capital-flow instant. */
  checkpoints: financialInstantSchema.array().max(24).optional(),
});
const returnMetric = z
  .strictObject({
    state: z.enum(['available', 'unavailable']),
    value: financialDecimalSchema.nullable(),
    reasons: z.string().min(1).array(),
  })
  .superRefine((value, context) => {
    if (
      (value.state === 'available') !== (value.value !== null) ||
      (value.state === 'available' ? value.reasons.length !== 0 : value.reasons.length === 0)
    )
      context.addIssue({
        code: 'custom',
        message: 'Return availability requires complete evidence or explicit reasons.',
      });
  });
export const accountPerformanceResponseSchema = z.strictObject({
  accountIds,
  reportingCurrencyId: id,
  sourceRevision: financialSourceRevisionSchema,
  from: financialInstantSchema,
  to: financialInstantSchema,
  method: z.literal('exact-flow-boundaries/act-365/1'),
  valuationPolicy: z.literal('report-price-and-fx-policy'),
  twr: returnMetric,
  mwr: returnMetric,
  maximumDrawdown: returnMetric,
  recoveryDurationMilliseconds: z
    .string()
    .regex(/^(0|[1-9]\d*)$/u)
    .nullable(),
  series: z
    .strictObject({
      at: financialInstantSchema,
      nav: financialDecimalSchema.nullable(),
      capitalFlow: financialDecimalSchema.nullable(),
      unitIndex: financialDecimalSchema.nullable(),
      drawdown: financialDecimalSchema.nullable(),
      reasons: z.string().array(),
    })
    .array()
    .min(2)
    .max(33),
});
export const portfolioMutationResponseSchema = accountingMutationResponseSchema.extend({
  versionId: id,
  version: financialRevisionSchema,
});
export const portfolioVersionResponseSchema = z.strictObject({
  id,
  portfolioId: id,
  version: financialRevisionSchema,
  name: label,
  description: narrative,
  environment,
  accountIds,
  archived: z.boolean(),
  reason,
  sourceRevision: financialSourceRevisionSchema,
  commandId: id,
  createdAt: financialInstantSchema,
});
export const portfolioResponseSchema = z
  .strictObject({
    id,
    workspaceId: id,
    createdAt: financialInstantSchema,
    currentVersion: portfolioVersionResponseSchema,
  })
  .refine((value) => value.id === value.currentVersion.portfolioId, {
    path: ['currentVersion', 'portfolioId'],
    message: 'The current version must belong to this portfolio identity.',
  });
export const portfolioListResponseSchema = z.strictObject({
  items: portfolioResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const portfolioVersionListResponseSchema = z.strictObject({
  items: portfolioVersionResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const cashTransferReceiptResponseSchema = accountingMutationResponseSchema.extend(economic);
export const cashTransferResponseSchema = accountingMutationResponseSchema
  .extend({
    sourceAccountId: id,
    destinationAccountId: id,
    sourceBucketId: id,
    destinationBucketId: id,
    currencyId: id,
    amount: positiveFinancialDecimalSchema,
    ...economic,
    description: narrative,
    status: z.enum(['pending', 'received']),
    receipt: z.union([cashTransferReceiptResponseSchema, z.null()]),
  })
  .superRefine((value, context) => {
    if ((value.status === 'received') !== (value.receipt !== null))
      context.addIssue({
        code: 'custom',
        path: ['receipt'],
        message: 'A received transfer requires receipt evidence; a pending transfer has none.',
      });
    if (
      value.sourceAccountId === value.destinationAccountId ||
      value.sourceBucketId === value.destinationBucketId
    )
      context.addIssue({
        code: 'custom',
        path: ['destinationAccountId'],
        message: 'An owned-account transfer requires distinct accounts and cash buckets.',
      });
    if (
      value.receipt !== null &&
      financialInstantSchema.safeParse(value.economicAt).success &&
      financialInstantSchema.safeParse(value.receipt.economicAt).success &&
      instantMicroseconds(value.receipt.economicAt) < instantMicroseconds(value.economicAt)
    )
      context.addIssue({
        code: 'custom',
        path: ['receipt', 'economicAt'],
        message: 'A receipt cannot economically precede departure.',
      });
  });
export const cashTransferListResponseSchema = z.strictObject({
  items: cashTransferResponseSchema.array().max(100),
  nextCursor: nullableId,
});
const pageQuery = {
  cursor: id.optional(),
  limit: z
    .string()
    .regex(/^(?:[1-9]\d?|100)$/u)
    .default('25')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(100)),
};
export const portfolioListQuerySchema = z.strictObject({
  ...pageQuery,
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export const portfolioVersionsQuerySchema = z.strictObject(pageQuery);
export const cashTransferListQuerySchema = z.strictObject({
  ...pageQuery,
  asOf: financialInstantSchema.optional(),
});

/** A known subtotal remains distinct from a complete monetary result. */
export const accountingMetricSchema = z
  .strictObject({
    state: z.enum(['available', 'partial', 'unavailable']),
    value: z.union([financialDecimalSchema, z.null()]),
    knownSubtotal: financialDecimalSchema,
    currencyId: id,
    reasons: z.string().min(1).array(),
    missingReferences: z.string().min(1).array(),
  })
  .superRefine((value, context) => {
    if (
      value.state === 'available' &&
      (value.value === null ||
        value.value !== value.knownSubtotal ||
        value.reasons.length > 0 ||
        value.missingReferences.length > 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message:
          'An available metric must equal its complete subtotal and have no missing evidence.',
      });
    if (value.state !== 'available' && (value.value !== null || value.reasons.length === 0))
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'An incomplete metric requires null and an explanation.',
      });
  });
const currencyMetric = z
  .strictObject({ currencyId: id, metric: accountingMetricSchema })
  .refine((value) => value.currencyId === value.metric.currencyId, {
    path: ['metric', 'currencyId'],
    message: 'The native metric must use its declared currency.',
  });
export const accountingSnapshotSchema = z.strictObject({
  asOf: financialInstantSchema,
  cashByCurrency: z
    .strictObject({
      currencyId: id,
      amount: financialDecimalSchema.nullable(),
      reasons: z.string().array(),
    })
    .array(),
  cash: accountingMetricSchema,
  holdings: accountingMetricSchema,
  transit: accountingMetricSchema,
  equity: accountingMetricSchema,
  netLiquidationValue: accountingMetricSchema,
  unrealizedGrossByCurrency: currencyMetric.array(),
});
export const accountingReportResponseSchema = z
  .strictObject({
    context: z.strictObject({
      suppliedPositionIds: id.array().max(100).optional(),
      accountIds,
      portfolioVersionId: id.optional(),
      portfolioId: nullableId,
      portfolioVersion: z.union([financialRevisionSchema, z.null()]),
      environment,
      reportingCurrencyId: id,
      sourceRevision: financialSourceRevisionSchema,
      from: financialInstantSchema,
      to: financialInstantSchema,
      fxPolicy: accountingFxPolicySchema,
      pricePolicy: accountingPricePolicySchema,
      manifest: financialSchemaComponents.FinancialNavManifest,
      accountingVersion: z.literal('portfolio-accounting-v1'),
    }),
    opening: accountingSnapshotSchema,
    closing: accountingSnapshotSchema,
    breakdown: z.strictObject({
      realizedTradingPnl: accountingMetricSchema,
      unrealizedTradingPnlChange: accountingMetricSchema,
      tradingPnl: accountingMetricSchema,
      holdingFx: accountingMetricSchema,
      cashFx: accountingMetricSchema,
      transitFx: accountingMetricSchema,
      conversionEffects: accountingMetricSchema,
      income: accountingMetricSchema,
      fees: accountingMetricSchema,
      expenses: accountingMetricSchema,
      taxes: accountingMetricSchema,
      externalCashFlows: accountingMetricSchema,
      boundaryTransfers: accountingMetricSchema,
      openingAdjustments: accountingMetricSchema,
    }),
    native: z.strictObject({
      realizedGross: currencyMetric.array(),
      unrealizedGross: currencyMetric.array(),
    }),
    reconciliation: z.strictObject({
      navChange: accountingMetricSchema,
      netCapitalFlows: accountingMetricSchema,
      performance: accountingMetricSchema,
      explainedChange: accountingMetricSchema,
      variance: accountingMetricSchema,
      roundingResidual: accountingMetricSchema,
    }),
    dependencies: z.strictObject({
      suppliedValues: suppliedReferenceSchema
        .extend({
          kind: z.literal('position-equity'),
          definitionVersion: z.literal('residual-position-equity/1'),
          signedQuantity: financialDecimalSchema,
          cashExcluded: z.literal(true),
          collateralExcluded: z.literal(true),
          settledPnlExcluded: z.literal(true),
          unsettledCashExcluded: z.literal(true),
        })
        .array()
        .optional(),
      coverage: z
        .strictObject({
          mode: z.enum(['summary', 'page']),
          fxCount: z.number().int().min(0),
          priceCount: z.number().int().min(0),
          sourceIdCount: z.number().int().min(0),
          page: z
            .strictObject({
              kind: z.enum(['fx', 'prices', 'sourceIds']),
              offset: z.number().int().min(0),
              limit: z.number().int().min(1).max(200),
              nextOffset: z.number().int().min(0).nullable(),
            })
            .nullable(),
        })
        .optional(),
      fx: z
        .strictObject({
          componentId: z.string().min(1),
          selection: financialSchemaComponents.FxRateSelection,
        })
        .array(),
      prices: z
        .strictObject({
          componentId: z.string().min(1),
          observationId: id,
          observedAt: financialInstantSchema,
        })
        .array(),
      sourceIds: z.string().min(1).array(),
    }),
  })
  .superRefine((value, context) => {
    const scope = value.context;
    const evidence = value.dependencies;
    const coverage = evidence.coverage;
    if (coverage) {
      const counts = {
        fx: coverage.fxCount,
        prices: coverage.priceCount,
        sourceIds: coverage.sourceIdCount,
      };
      const page = coverage.page;
      if ((coverage.mode === 'page') !== (page !== null))
        context.addIssue({
          code: 'custom',
          path: ['dependencies', 'coverage'],
          message: 'Evidence coverage must identify its summary or bounded page.',
        });
      for (const kind of ['fx', 'prices', 'sourceIds'] as const) {
        const expected =
          page?.kind === kind ? Math.min(page.limit, Math.max(0, counts[kind] - page.offset)) : 0;
        if (evidence[kind].length !== expected)
          context.addIssue({
            code: 'custom',
            path: ['dependencies', kind],
            message: 'Evidence arrays must match their declared coverage and page.',
          });
      }
      if (
        page &&
        page.nextOffset !==
          (page.offset + page.limit < counts[page.kind] ? page.offset + page.limit : null)
      )
        context.addIssue({
          code: 'custom',
          path: ['dependencies', 'coverage', 'page', 'nextOffset'],
          message: 'The next page must follow the pinned evidence population.',
        });
    }
    const hasPortfolio = scope.portfolioVersionId !== undefined;
    if (
      hasPortfolio !== (scope.portfolioId !== null) ||
      hasPortfolio !== (scope.portfolioVersion !== null)
    )
      context.addIssue({
        code: 'custom',
        path: ['context', 'portfolioVersionId'],
        message: 'A portfolio report requires its complete immutable scope identity and version.',
      });
    for (const [boundary, instant] of [
      ['opening', scope.from],
      ['closing', scope.to],
    ] as const) {
      const snapshot = value[boundary];
      if (
        financialInstantSchema.safeParse(snapshot.asOf).success &&
        financialInstantSchema.safeParse(instant).success &&
        instantMicroseconds(snapshot.asOf) !== instantMicroseconds(instant)
      )
        context.addIssue({
          code: 'custom',
          path: [boundary, 'asOf'],
          message: 'The snapshot must use its declared report boundary.',
        });
      for (const key of ['cash', 'holdings', 'transit', 'equity', 'netLiquidationValue'] as const)
        if (snapshot[key].currencyId !== scope.reportingCurrencyId)
          context.addIssue({
            code: 'custom',
            path: [boundary, key, 'currencyId'],
            message: 'The reporting metric must use the report currency.',
          });
    }
    for (const section of ['breakdown', 'reconciliation'] as const)
      for (const [key, metric] of Object.entries(value[section]))
        if (metric.currencyId !== scope.reportingCurrencyId)
          context.addIssue({
            code: 'custom',
            path: [section, key, 'currencyId'],
            message: 'The reporting metric must use the report currency.',
          });
  });

export type CreatePortfolioRequest = z.infer<typeof createPortfolioRequestSchema>;
export type UpdatePortfolioRequest = z.infer<typeof updatePortfolioRequestSchema>;
export type ArchivePortfolioRequest = z.infer<typeof archivePortfolioRequestSchema>;
export type RecordIncomeRequest = z.infer<typeof recordIncomeRequestSchema>;
export type RecordTaxRequest = z.infer<typeof recordTaxRequestSchema>;
export type RecordExpenseRequest = z.infer<typeof recordExpenseRequestSchema>;
export type CreateCashTransferRequest = z.infer<typeof createCashTransferRequestSchema>;
export type ReceiveCashTransferRequest = z.infer<typeof receiveCashTransferRequestSchema>;
export type AccountingReportRequest = z.infer<typeof accountingReportRequestSchema>;
export type AccountingMutationResponse = z.infer<typeof accountingMutationResponseSchema>;
export type PortfolioMutationResponse = z.infer<typeof portfolioMutationResponseSchema>;
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;
export type PortfolioVersionResponse = z.infer<typeof portfolioVersionResponseSchema>;
export type PortfolioListResponse = z.infer<typeof portfolioListResponseSchema>;
export type PortfolioVersionListResponse = z.infer<typeof portfolioVersionListResponseSchema>;
export type CashTransferResponse = z.infer<typeof cashTransferResponseSchema>;
export type CashTransferListResponse = z.infer<typeof cashTransferListResponseSchema>;
export type PortfolioListQuery = z.infer<typeof portfolioListQuerySchema>;
export type PortfolioVersionsQuery = z.infer<typeof portfolioVersionsQuerySchema>;
export type CashTransferListQuery = z.infer<typeof cashTransferListQuerySchema>;
export type AccountingReportResponse = z.infer<typeof accountingReportResponseSchema>;

export const accountingSchemaComponents = {
  AccountingMetric: accountingMetricSchema,
  AccountingCurrencyMetric: currencyMetric,
  AccountingSnapshot: accountingSnapshotSchema,
  AccountingFxPolicy: accountingFxPolicySchema,
  AccountingPricePolicy: accountingPricePolicySchema,
  PortfolioVersion: portfolioVersionResponseSchema,
  CashTransferReceipt: cashTransferReceiptResponseSchema,
};
