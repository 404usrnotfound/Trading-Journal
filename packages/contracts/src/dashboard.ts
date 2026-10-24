import { z } from 'zod';
import { analyticsReportRequestSchema, analyticsReportResponseSchema } from './analytics.js';
import {
  accountingMetricSchema,
  accountingReportRequestSchema,
  accountingReportResponseSchema,
} from './accounting.js';
import { financialDecimalSchema, financialIdSchema, financialInstantSchema } from './financial.js';

const ids = financialIdSchema
  .transform((value) => value.toLowerCase())
  .array()
  .max(100)
  .refine((value) => new Set(value).size === value.length, 'Selections must be unique.');
const labels = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .array()
  .max(100)
  .refine((value) => new Set(value).size === value.length, 'Selections must be unique.');
export const dashboardFiltersSchema = z.strictObject({
  portfolioVersionId: financialIdSchema.optional(),
  accountIds: ids.default([]),
  brokerIds: ids.default([]),
  strategyIds: ids.default([]),
  strategyVersionIds: ids.default([]),
  assetIds: ids.default([]),
  assetClasses: labels.default([]),
  tags: labels.default([]),
});
const base = analyticsReportRequestSchema.shape;
export const dashboardRequestSchema = z
  .strictObject({
    suppliedCampaignResultIds: base.suppliedCampaignResultIds,
    reportingCurrencyId: base.reportingCurrencyId,
    from: base.from,
    to: base.to,
    sourceRevision: base.sourceRevision,
    metadataAsOf: base.metadataAsOf,
    timezone: base.timezone,
    fxPolicy: base.fxPolicy,
    priceMaxAgeMilliseconds: base.priceMaxAgeMilliseconds,
    priceSourcePriority: base.priceSourcePriority,
    environment: z.enum(['live', 'paper']).default('live'),
    filters: dashboardFiltersSchema,
    samples: z.number().int().min(2).max(13).default(7),
  })
  .superRefine((value, ctx) => {
    const micros = (instant: string) =>
      BigInt(Date.parse(instant.replace(/\.\d+/u, ''))) * 1000n +
      BigInt((instant.match(/\.(\d+)/u)?.[1] ?? '').padEnd(6, '0'));
    if (
      financialInstantSchema.safeParse(value.from).success &&
      financialInstantSchema.safeParse(value.to).success &&
      micros(value.from) >= micros(value.to)
    )
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'The interval must increase.' });
    if (Date.parse(value.to) - Date.parse(value.from) > 367 * 86_400_000)
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Choose a period of at most one year.',
      });
  });
export type DashboardRequest = z.infer<typeof dashboardRequestSchema>;
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
const option = z.strictObject({
  id: financialIdSchema,
  label: z.string(),
  parentId: financialIdSchema.nullable(),
});
export const dashboardCatalogResources = [
  'accounts',
  'brokers',
  'currencies',
  'portfolios',
  'strategies',
  'strategyVersions',
  'assets',
  'tags',
  'priceSources',
  'fxSources',
] as const;
export const dashboardCatalogQuerySchema = z.strictObject({
  resource: z.enum(dashboardCatalogResources).optional(),
  afterId: z.string().min(1).max(256).optional(),
  search: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});
export type DashboardCatalogQuery = z.input<typeof dashboardCatalogQuerySchema>;
export const dashboardCatalogSchema = z.strictObject({
  accountChoicesComplete: z.boolean().optional(),
  accounts: option
    .extend({ environment: z.enum(['live', 'paper']) })
    .array()
    .max(500),
  brokers: option.array().max(500),
  currencies: option.extend({ code: z.string() }).array().max(500),
  portfolios: option
    .extend({
      accountIds: ids,
      environment: z.enum(['live', 'paper']),
      version: z.number().int().positive(),
    })
    .array()
    .max(500),
  strategies: option.array().max(500),
  strategyVersions: option.array().max(500),
  assets: option.extend({ assetClass: z.string() }).array().max(500),
  tags: z.string().array().max(500),
  priceSources: z.string().array().max(64),
  fxSources: z.string().array().max(64),
  pageCursors: z.partialRecord(z.enum(dashboardCatalogResources), z.string().nullable()).optional(),
});
const bucket = z.strictObject({
  key: z.string(),
  value: financialDecimalSchema.nullable(),
  state: z.enum(['available', 'partial', 'unavailable']),
  knownSubtotal: financialDecimalSchema.nullable(),
  campaignIds: ids,
  excludedIds: ids,
});
// Campaign IDs can exceed selection sizes; outputs remain bounded by the engine's 1,000-campaign limit.
const campaignIds = financialIdSchema.array().max(1000);
const outputBucket = bucket.extend({ campaignIds, excludedIds: campaignIds });
const bin = z.strictObject({
  key: z.string(),
  lower: financialDecimalSchema.nullable(),
  upper: financialDecimalSchema.nullable(),
  count: z.number().int().nonnegative(),
  campaignIds,
});
const distribution = z.strictObject({ bins: bin.array().max(6), excludedIds: campaignIds });
export const dashboardResponseSchema = z.strictObject({
  filters: dashboardFiltersSchema,
  analytics: analyticsReportResponseSchema.nullable(),
  views: z.strictObject({
    calendar: outputBucket.array().max(1000),
    periods: outputBucket.array().max(1000),
    pnlDistribution: distribution,
    rDistribution: distribution,
    unknownChronologyIds: campaignIds,
  }),
  accountView: z.strictObject({
    state: z.enum(['available', 'unavailable']),
    reason: z.string().nullable(),
    points: z
      .strictObject({
        at: financialInstantSchema,
        equity: accountingMetricSchema,
        performance: accountingMetricSchema,
        sourceIds: z.string().array(),
        priceObservationIds: financialIdSchema.array(),
        fxObservationIds: financialIdSchema.array(),
        dependencyCoverage: accountingReportResponseSchema.shape.dependencies.shape.coverage,
        dependencyReport: accountingReportRequestSchema.optional(),
      })
      .array()
      .max(13),
    allocation: z
      .strictObject({ id: z.string(), label: z.string(), equity: accountingMetricSchema })
      .array()
      .max(11),
  }),
});
export type DashboardCatalog = z.infer<typeof dashboardCatalogSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
