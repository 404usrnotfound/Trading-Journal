import { z } from 'zod';
import { accountingFxPolicySchema } from './accounting.js';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialRevisionSchema,
  financialSchemaComponents,
  financialSourceRevisionSchema,
  nonnegativeFinancialDecimalSchema,
} from './financial.js';

const id = financialIdSchema.transform((value) => value.toLowerCase());
const accountIds = id
  .array()
  .min(1)
  .max(100)
  .refine((value) => new Set(value).size === value.length, 'Account identities must be unique.');

export const analyticsDimensionSchema = z.enum([
  'strategy',
  'strategyVersion',
  'asset',
  'assetClass',
  'broker',
  'account',
  'currency',
  'direction',
  'weekday',
  'hour',
  'timeframe',
  'setup',
  'tag',
  'marketCondition',
]);

const timezone = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/u, 'Use an IANA timezone.')
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Use an IANA timezone.');

/** Compare economic instants without truncating PostgreSQL's microseconds. */
function instantMicroseconds(value: string): bigint {
  const fraction = value.match(/\.(\d+)/u)?.[1] ?? '';
  return BigInt(Date.parse(value.replace(/\.\d+/u, ''))) * 1_000n + BigInt(fraction.padEnd(6, '0'));
}

/** Campaign analytics is a bounded read, with explicit financial and metadata clocks. */
export const analyticsReportRequestSchema = z
  .strictObject({
    accountIds,
    reportingCurrencyId: id,
    from: financialInstantSchema,
    to: financialInstantSchema,
    sourceRevision: financialSourceRevisionSchema.optional(),
    metadataAsOf: financialInstantSchema.optional(),
    timezone: timezone.optional(),
    fxPolicy: accountingFxPolicySchema,
    priceMaxAgeMilliseconds: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    priceSourcePriority: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .array()
      .min(1)
      .max(64)
      .refine((value) => new Set(value).size === value.length, 'Source priorities must be unique.'),
    groupBy: analyticsDimensionSchema
      .array()
      .max(14)
      .refine((value) => new Set(value).size === value.length, 'Group dimensions must be unique.')
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      financialInstantSchema.safeParse(value.from).success &&
      financialInstantSchema.safeParse(value.to).success &&
      instantMicroseconds(value.from) >= instantMicroseconds(value.to)
    )
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The analytics interval must end after its opening boundary.',
      });
  });

export type AnalyticsReportRequest = z.infer<typeof analyticsReportRequestSchema>;
export type AnalyticsDimension = z.infer<typeof analyticsDimensionSchema>;

const ids = id.array();
const reasons = z.string().min(1).array();
// Explicit unions preserve nullability when referenced schemas are registered with OpenAPI.
const nullableId = z.union([id, z.null()]);
const nullableInstant = z.union([financialInstantSchema, z.null()]);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const nullableDecimal = z.union([financialDecimalSchema, z.null()]);
const nullableNonnegativeDecimal = z.union([nonnegativeFinancialDecimalSchema, z.null()]);

/** Complete results, explicit sample exclusions, and partial subtotals are separate states. */
export const analyticsMetricSchema = z
  .strictObject({
    state: z.enum(['available', 'partial', 'unavailable', 'infinite']),
    value: nullableDecimal,
    knownSubtotal: nullableDecimal,
    unit: z.enum(['money', 'ratio', 'R', 'seconds', 'count']),
    currencyId: nullableId,
    definitionId: z.string().min(1),
    sampleSize: count,
    eligibleIds: ids,
    excludedIds: ids,
    reasons,
    missingReferences: reasons,
  })
  .superRefine((value, context) => {
    if (
      value.state === 'available' &&
      (value.value === null || value.knownSubtotal !== value.value)
    )
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'An available metric requires its complete value and matching subtotal.',
      });
    if (value.state !== 'available' && (value.value !== null || value.reasons.length === 0))
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'An incomplete or infinite metric requires a null value and explanation.',
      });
    if (value.state === 'infinite' && value.knownSubtotal !== null)
      context.addIssue({
        code: 'custom',
        path: ['knownSubtotal'],
        message: 'An infinite metric cannot expose a finite subtotal.',
      });
    if ((value.unit === 'money') !== (value.currencyId !== null))
      context.addIssue({
        code: 'custom',
        path: ['currencyId'],
        message: 'Money requires a currency; dimensionless, count and duration metrics have none.',
      });
  });

export const analyticsSourceMetricSchema = z
  .strictObject({
    state: z.enum(['available', 'unavailable']),
    value: nullableDecimal,
    reasons,
    missingReferences: reasons,
  })
  .superRefine((value, context) => {
    if (value.state === 'available' && value.value === null)
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'An available source metric requires a financial decimal.',
      });
    if (value.state === 'unavailable' && (value.value !== null || value.reasons.length === 0))
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'An unavailable source metric requires null and a missing-evidence reason.',
      });
  });

const dimensionValue = z.strictObject({ key: z.string().min(1), label: z.string().min(1) });
const hash = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .nullable();
const provenance = z.strictObject({
  originalPlanId: nullableId,
  originalPlanHash: hash,
  metadataPlanId: nullableId,
  metadataPlanHash: hash,
  metadataPlanSource: z.enum(['original-commitment', 'latest-published']).nullable(),
  journalRevisionId: nullableId,
  journalRevisionHash: hash,
  strategyId: nullableId,
  strategyVersionId: nullableId,
  strategyVersionHash: hash,
  strategyLinkTiming: z.enum(['recorded-with-trade', 'retrospective']).nullable(),
  closureId: nullableId,
  legIds: ids,
  effectiveExecutionIds: ids,
  allocationSetIds: ids,
  feeIds: ids,
  instrumentVersionIds: ids,
  markIds: ids,
  fxObservationIds: ids,
});
export const analyticsCampaignSchema = z.strictObject({
  id,
  status: z.enum(['completed', 'open', 'excluded']),
  entryAt: nullableInstant,
  closedAt: nullableInstant,
  grossPnl: analyticsSourceMetricSchema,
  netPnl: analyticsSourceMetricSchema,
  realizedPnl: analyticsSourceMetricSchema,
  unrealizedPnl: analyticsSourceMetricSchema,
  fees: analyticsSourceMetricSchema,
  rMultiple: analyticsSourceMetricSchema,
  dimensions: z.partialRecord(analyticsDimensionSchema, dimensionValue.array()),
  exclusionReasons: reasons,
  originalPlanId: nullableId,
  title: z.string(),
  provenance,
});

const metricUnits = {
  grossPnl: 'money',
  netPnl: 'money',
  realizedPnl: 'money',
  unrealizedPnl: 'money',
  fees: 'money',
  winRate: 'ratio',
  lossRate: 'ratio',
  averageWinner: 'money',
  averageLoser: 'money',
  payoffRatio: 'ratio',
  profitFactor: 'ratio',
  expectancy: 'money',
  expectancyR: 'R',
  averageR: 'R',
  cumulativeR: 'R',
  averageHoldingDuration: 'seconds',
  maximumDrawdown: 'money',
  currentDrawdown: 'money',
  longestWinStreak: 'count',
  longestLossStreak: 'count',
  currentWinStreak: 'count',
  currentLossStreak: 'count',
} as const;
const metrics = z
  .strictObject(
    Object.fromEntries(Object.keys(metricUnits).map((key) => [key, analyticsMetricSchema])) as {
      [Key in keyof typeof metricUnits]: typeof analyticsMetricSchema;
    },
  )
  .superRefine((value, context) => {
    for (const key of Object.keys(metricUnits) as (keyof typeof metricUnits)[]) {
      if (value[key].unit !== metricUnits[key])
        context.addIssue({
          code: 'custom',
          path: [key, 'unit'],
          message: 'The metric must use its documented mathematical unit.',
        });
      if (value[key].definitionId !== `campaign-analytics/${key}/1`)
        context.addIssue({
          code: 'custom',
          path: [key, 'definitionId'],
          message: 'The metric must identify its versioned mathematical definition.',
        });
    }
  });
export const analyticsCurveSchema = z
  .strictObject({
    state: z.enum(['available', 'unavailable']),
    currencyId: id,
    definitionId: z.literal('campaign-cumulative-net-pnl/1'),
    points: z
      .strictObject({
        campaignId: nullableId,
        economicAt: financialInstantSchema,
        cumulativePnl: financialDecimalSchema,
        peak: nonnegativeFinancialDecimalSchema,
        drawdown: nonnegativeFinancialDecimalSchema,
      })
      .array(),
    reasons,
    excludedIds: ids,
  })
  .superRefine((value, context) => {
    if (value.state === 'unavailable' && (value.points.length > 0 || value.reasons.length === 0))
      context.addIssue({
        code: 'custom',
        path: ['points'],
        message: 'An unavailable drawdown curve has no invented points and explains its gap.',
      });
    if (value.state === 'available' && value.points.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['points'],
        message: 'An available cumulative curve requires its explicit zero anchor.',
      });
  });
export const analyticsRecoverySchema = z
  .strictObject({
    state: z.enum(['recovered', 'unrecovered', 'no-drawdown', 'unavailable']),
    peakAt: nullableInstant,
    troughAt: nullableInstant,
    recoveredAt: nullableInstant,
    peakCampaignId: nullableId,
    troughCampaignId: nullableId,
    recoveredCampaignId: nullableId,
    durationSeconds: nullableNonnegativeDecimal,
    elapsedSeconds: nullableNonnegativeDecimal,
    tradesToRecovery: count.nullable(),
    reasons,
  })
  .superRefine((value, context) => {
    if (
      value.state === 'recovered' &&
      (value.peakAt === null ||
        value.troughAt === null ||
        value.recoveredAt === null ||
        value.durationSeconds === null ||
        value.tradesToRecovery === null)
    )
      context.addIssue({
        code: 'custom',
        path: ['state'],
        message: 'A recovered drawdown requires observed peak, trough and recovery evidence.',
      });
    if (
      value.state !== 'recovered' &&
      (value.recoveredAt !== null ||
        value.recoveredCampaignId !== null ||
        value.durationSeconds !== null ||
        value.tradesToRecovery !== null)
    )
      context.addIssue({
        code: 'custom',
        path: ['recoveredAt'],
        message: 'An unresolved or absent drawdown cannot claim recovery.',
      });
    if (value.state === 'unavailable' && value.reasons.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['reasons'],
        message: 'Unavailable recovery requires a missing-evidence explanation.',
      });
  });
export const analyticsSummarySchema = z.strictObject({
  population: z.strictObject({
    campaignIds: ids,
    completedIds: ids,
    openIds: ids,
    excludedIds: ids,
    eligibleOutcomeIds: ids,
    eligibleRIds: ids,
    eligibleDurationIds: ids,
  }),
  metrics,
  counts: z.strictObject({
    selected: count,
    completed: count,
    open: count,
    excluded: count,
    eligibleOutcomes: count,
    wins: count,
    losses: count,
    breakevens: count,
    eligibleR: count,
    eligibleDuration: count,
  }),
  curve: analyticsCurveSchema,
  recovery: analyticsRecoverySchema,
});
export const analyticsGroupSchema = z.strictObject({
  dimension: analyticsDimensionSchema,
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['value', 'mixed', 'unknown']),
  memberKeys: z.string().min(1).array(),
  additive: z.boolean(),
  summary: analyticsSummarySchema,
});
export const analyticsReportResponseSchema = z
  .strictObject({
    context: z.strictObject({
      accountIds,
      reportingCurrencyId: id,
      from: financialInstantSchema,
      to: financialInstantSchema,
      sourceRevision: financialSourceRevisionSchema,
      recordedAt: financialInstantSchema,
      metadataAsOf: financialInstantSchema,
      timezone,
      workspaceRevision: financialRevisionSchema,
      environment: z.enum(['live', 'paper']),
      fxPolicy: accountingFxPolicySchema,
      priceMaxAgeMilliseconds: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      priceSourcePriority: analyticsReportRequestSchema.shape.priceSourcePriority,
      population: z.literal('campaign-attribution'),
      moneyPopulation: z.literal('selected-completed-and-open-lifetime-asof'),
      manifest: financialSchemaComponents.InventoryManifest,
    }),
    records: analyticsCampaignSchema.array(),
    summary: analyticsSummarySchema,
    completedOnly: analyticsSummarySchema,
    openOnly: analyticsSummarySchema,
    groups: analyticsGroupSchema.array(),
    definitionVersion: z.literal('campaign-analytics/1'),
  })
  .superRefine((value, context) => {
    if (
      financialInstantSchema.safeParse(value.context.from).success &&
      financialInstantSchema.safeParse(value.context.to).success &&
      instantMicroseconds(value.context.from) >= instantMicroseconds(value.context.to)
    )
      context.addIssue({
        code: 'custom',
        path: ['context', 'to'],
        message: 'The report interval must end after its opening boundary.',
      });
    if (
      financialInstantSchema.safeParse(value.context.metadataAsOf).success &&
      financialInstantSchema.safeParse(value.context.recordedAt).success &&
      instantMicroseconds(value.context.metadataAsOf) >
        instantMicroseconds(value.context.recordedAt)
    )
      context.addIssue({
        code: 'custom',
        path: ['context', 'metadataAsOf'],
        message: 'Metadata cannot come from after the coherent report read.',
      });
    const summaries: [string | number, typeof value.summary][] = [
      ['summary', value.summary],
      ['completedOnly', value.completedOnly],
      ['openOnly', value.openOnly],
      ...value.groups.map(
        (group, index) => [index, group.summary] as [number, typeof value.summary],
      ),
    ];
    for (const [key, summary] of summaries) {
      const prefix = typeof key === 'number' ? ['groups', key, 'summary'] : [key];
      for (const [metricKey, metric] of Object.entries(summary.metrics))
        if (metric.unit === 'money' && metric.currencyId !== value.context.reportingCurrencyId)
          context.addIssue({
            code: 'custom',
            path: [...prefix, 'metrics', metricKey, 'currencyId'],
            message: 'A monetary metric must use the declared report currency.',
          });
      if (summary.curve.currencyId !== value.context.reportingCurrencyId)
        context.addIssue({
          code: 'custom',
          path: [...prefix, 'curve', 'currencyId'],
          message: 'The cumulative curve must use the declared report currency.',
        });
    }
    for (const [index, group] of value.groups.entries())
      if (group.additive !== (group.dimension !== 'tag'))
        context.addIssue({
          code: 'custom',
          path: ['groups', index, 'additive'],
          message: 'Tag groups overlap; each other grouping assigns a whole campaign once.',
        });
  });

export type AnalyticsReportResponse = z.infer<typeof analyticsReportResponseSchema>;
export const analyticsSchemaComponents = {
  AnalyticsMetric: analyticsMetricSchema,
  AnalyticsSourceMetric: analyticsSourceMetricSchema,
  AnalyticsDimensionValue: dimensionValue,
  AnalyticsProvenance: provenance,
  AnalyticsCampaign: analyticsCampaignSchema,
  AnalyticsCurve: analyticsCurveSchema,
  AnalyticsRecovery: analyticsRecoverySchema,
  AnalyticsSummary: analyticsSummarySchema,
  AnalyticsGroup: analyticsGroupSchema,
};
