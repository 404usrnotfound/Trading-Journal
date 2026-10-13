import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyticsCurveSchema,
  analyticsDimensionSchema,
  analyticsMetricSchema,
  analyticsRecoverySchema,
  analyticsReportRequestSchema,
  analyticsReportResponseSchema,
  analyticsSourceMetricSchema,
} from '@journal/contracts';
import {
  calculateAnalytics,
  INVENTORY_CALCULATION_MANIFEST,
  type AnalyticsCampaign,
} from '@journal/domain';

const accountId = randomUUID();
const reportingCurrencyId = randomUUID();
const from = '2026-10-12T08:00:00.123455Z';
const to = '2026-10-12T08:00:00.123456Z';
const query = {
  accountIds: [accountId],
  reportingCurrencyId,
  from,
  to,
  fxPolicy: {
    id: 'reviewed-analytics-v1',
    maxAgeMilliseconds: 60_000,
    sourcePriority: ['manual'],
  },
  priceMaxAgeMilliseconds: 60_000,
  priceSourcePriority: ['manual'],
};
const metric = {
  state: 'available',
  value: '1.234567890123456789012345678901234567',
  knownSubtotal: '1.234567890123456789012345678901234567',
  unit: 'money',
  currencyId: reportingCurrencyId,
  definitionId: 'campaign-analytics/netPnl/1',
  sampleSize: 1,
  eligibleIds: [randomUUID()],
  excludedIds: [],
  reasons: [],
  missingReferences: [],
};
const source = (value: string) => ({
  state: 'available' as const,
  value,
  reasons: [],
  missingReferences: [],
});

function report() {
  const campaign: AnalyticsCampaign = {
    id: randomUUID(),
    status: 'completed',
    entryAt: '2026-10-12T07:00:00Z',
    closedAt: to,
    grossPnl: source('11'),
    netPnl: source('10'),
    realizedPnl: source('10'),
    unrealizedPnl: source('0'),
    fees: source('1'),
    rMultiple: source('0.5'),
    dimensions: { account: [{ key: accountId, label: 'Main account' }] },
    exclusionReasons: [],
    originalPlanId: null,
  };
  const result = calculateAnalytics({
    campaigns: [campaign],
    reportingCurrencyId,
    from,
    asOf: to,
    groupBy: ['account', 'tag'],
  });
  return {
    ...result,
    context: {
      accountIds: [accountId],
      reportingCurrencyId,
      from,
      to,
      sourceRevision: '1',
      recordedAt: '2026-10-12T10:00:00Z',
      metadataAsOf: '2026-10-12T10:00:00Z',
      timezone: 'Europe/Madrid',
      workspaceRevision: 1,
      environment: 'live',
      fxPolicy: query.fxPolicy,
      priceMaxAgeMilliseconds: query.priceMaxAgeMilliseconds,
      priceSourcePriority: query.priceSourcePriority,
      population: 'campaign-attribution',
      moneyPopulation: 'selected-completed-and-open-lifetime-asof',
      manifest: INVENTORY_CALCULATION_MANIFEST,
    },
    records: [
      {
        ...campaign,
        title: 'Reviewed campaign',
        provenance: {
          originalPlanId: null,
          originalPlanHash: null,
          metadataPlanId: null,
          metadataPlanHash: null,
          metadataPlanSource: null,
          journalRevisionId: null,
          journalRevisionHash: null,
          strategyId: null,
          strategyVersionId: null,
          strategyVersionHash: null,
          strategyLinkTiming: null,
          closureId: randomUUID(),
          legIds: [randomUUID()],
          effectiveExecutionIds: [randomUUID()],
          allocationSetIds: [randomUUID()],
          feeIds: [randomUUID()],
          instrumentVersionIds: [randomUUID()],
          markIds: [],
          fxObservationIds: [],
        },
      },
    ],
  };
}

describe('analytics query source boundaries', () => {
  it('requires a bounded, unique and case-normalized account population', () => {
    expect(
      analyticsReportRequestSchema.parse({ ...query, accountIds: [accountId.toUpperCase()] })
        .accountIds,
    ).toEqual([accountId]);
    for (const accountIds of [
      [],
      [accountId, accountId.toUpperCase()],
      Array.from({ length: 101 }, () => randomUUID()),
      ['not-a-uuid'],
    ])
      expect(analyticsReportRequestSchema.safeParse({ ...query, accountIds }).success).toBe(false);
    expect(
      analyticsReportRequestSchema.safeParse({ ...query, portfolioVersionId: randomUUID() })
        .success,
    ).toBe(false);
  });

  it('compares offset-equivalent boundaries at PostgreSQL microsecond precision', () => {
    expect(analyticsReportRequestSchema.safeParse(query).success).toBe(true);
    expect(
      analyticsReportRequestSchema.safeParse({
        ...query,
        from: '2026-10-12T10:00:00.123455+02:00',
      }).success,
    ).toBe(true);
    for (const to of [
      from,
      '2026-10-12T10:00:00.123455+02:00',
      '2026-10-12T08:00:00.123454Z',
      '2026-10-12T08:00:00.1234567Z',
      '2026-10-12T08:00:00',
      'not-an-instant',
    ])
      expect(analyticsReportRequestSchema.safeParse({ ...query, to }).success).toBe(false);
  });

  it('retains independent metadata and financial clocks without rounding source revisions', () => {
    expect(
      analyticsReportRequestSchema.parse({
        ...query,
        sourceRevision: '2147483647',
        metadataAsOf: '2026-10-01T00:00:00.000001Z',
      }),
    ).toMatchObject({ sourceRevision: '2147483647', metadataAsOf: '2026-10-01T00:00:00.000001Z' });
    for (const sourceRevision of ['2147483648', '-1', '01', '1.0', 1])
      expect(analyticsReportRequestSchema.safeParse({ ...query, sourceRevision }).success).toBe(
        false,
      );
  });

  it('validates real timezones and only the fourteen documented grouping dimensions', () => {
    for (const timezone of ['UTC', 'Europe/Madrid', 'America/New_York', 'Etc/GMT+2'])
      expect(analyticsReportRequestSchema.safeParse({ ...query, timezone }).success).toBe(true);
    for (const timezone of ['Europe/Imaginary', '+02:00', '', ' Europe/Madrid', 'UTC; secret'])
      expect(analyticsReportRequestSchema.safeParse({ ...query, timezone }).success).toBe(false);
    expect(analyticsDimensionSchema.options).toHaveLength(14);
    expect(
      analyticsReportRequestSchema.safeParse({
        ...query,
        groupBy: analyticsDimensionSchema.options,
      }).success,
    ).toBe(true);
    for (const groupBy of [['account', 'account'], ['profit'], Array(15).fill('tag')])
      expect(analyticsReportRequestSchema.safeParse({ ...query, groupBy }).success).toBe(false);
  });

  it('rejects unbounded, duplicate or ambiguous observation-selection policies', () => {
    for (const value of [
      { ...query, fxPolicy: { ...query.fxPolicy, maxAgeMilliseconds: -1 } },
      { ...query, fxPolicy: { ...query.fxPolicy, id: ' ' } },
      { ...query, fxPolicy: { ...query.fxPolicy, sourcePriority: ['manual', ' manual '] } },
      { ...query, priceSourcePriority: [] },
      { ...query, priceSourcePriority: ['manual', ' manual '] },
      { ...query, priceMaxAgeMilliseconds: 0.5 },
      { ...query, priceMaxAgeMilliseconds: Number.MAX_SAFE_INTEGER + 1 },
      { ...query, priceSourcePriority: Array(65).fill('manual') },
    ])
      expect(analyticsReportRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe('analytics mathematical result boundaries', () => {
  it('requires exact financial strings and keeps explanatory sample exclusions on available metrics', () => {
    expect(analyticsMetricSchema.parse(metric)).toEqual(metric);
    expect(
      analyticsMetricSchema.parse({
        ...metric,
        excludedIds: [randomUUID()],
        reasons: ['excluded_missing_outcome'],
      }).state,
    ).toBe('available');
    for (const value of [1.234, 'NaN', 'Infinity', '1e2', `0.${'0'.repeat(36)}1`, '1'.repeat(43)])
      expect(
        analyticsMetricSchema.safeParse({ ...metric, value, knownSubtotal: value }).success,
      ).toBe(false);
    expect(analyticsMetricSchema.safeParse({ ...metric, value: null }).success).toBe(false);
    expect(analyticsMetricSchema.safeParse({ ...metric, knownSubtotal: '999' }).success).toBe(
      false,
    );
  });

  it('keeps partial subtotals separate from complete values and represents infinity without a number', () => {
    expect(
      analyticsMetricSchema.parse({
        ...metric,
        state: 'partial',
        value: null,
        reasons: ['missing_fee_fx'],
      }),
    ).toMatchObject({ state: 'partial', value: null, knownSubtotal: metric.value });
    const infinite = {
      ...metric,
      state: 'infinite',
      value: null,
      knownSubtotal: null,
      unit: 'ratio',
      currencyId: null,
      definitionId: 'campaign-analytics/profitFactor/1',
      reasons: ['zero_loss_denominator'],
    };
    expect(analyticsMetricSchema.parse(infinite)).toEqual(infinite);
    for (const value of [
      { ...metric, state: 'partial' },
      { ...metric, state: 'unavailable', value: null },
      { ...infinite, value: '0' },
      { ...infinite, knownSubtotal: '0' },
    ])
      expect(analyticsMetricSchema.safeParse(value).success).toBe(false);
  });

  it('requires a currency only for monetary results and validates source-metric availability', () => {
    for (const unit of ['ratio', 'R', 'seconds', 'count']) {
      expect(analyticsMetricSchema.safeParse({ ...metric, unit, currencyId: null }).success).toBe(
        true,
      );
      expect(analyticsMetricSchema.safeParse({ ...metric, unit }).success).toBe(false);
    }
    expect(analyticsMetricSchema.safeParse({ ...metric, currencyId: null }).success).toBe(false);
    expect(analyticsSourceMetricSchema.parse(source('0')).value).toBe('0');
    expect(
      analyticsSourceMetricSchema.parse({
        state: 'unavailable',
        value: null,
        reasons: ['missing_original_risk'],
        missingReferences: ['original-plan'],
      }).value,
    ).toBeNull();
    for (const value of [
      { ...source('0'), value: 0 },
      { ...source('0'), value: null },
      { ...source('0'), state: 'unavailable' },
      { state: 'unavailable', value: null, reasons: [], missingReferences: [] },
    ])
      expect(analyticsSourceMetricSchema.safeParse(value).success).toBe(false);
  });

  it('accepts the pure calculation output with complete source provenance and explicit populations', () => {
    const result = report();
    expect(analyticsReportResponseSchema.parse(result)).toEqual(result);
    expect(result.summary.metrics.profitFactor.state).toBe('infinite');
    expect(result.groups.find((group) => group.dimension === 'tag')?.additive).toBe(false);
  });

  it('rejects invented units, definition versions and report currencies in any summary', () => {
    for (const section of ['summary', 'completedOnly', 'openOnly'] as const) {
      for (const change of [
        { unit: 'R', currencyId: null },
        { definitionId: 'campaign-analytics/netPnl/2' },
        { currencyId: randomUUID() },
      ]) {
        const result = report();
        Object.assign(result[section].metrics.netPnl, change);
        expect(analyticsReportResponseSchema.safeParse(result).success).toBe(false);
      }
    }
    const result = report();
    result.groups[0]!.summary.curve.currencyId = randomUUID();
    expect(analyticsReportResponseSchema.safeParse(result).success).toBe(false);
  });

  it('rejects future metadata, unsupported source facts and additive tag claims', () => {
    const metadata = report();
    metadata.context.metadataAsOf = '2026-10-12T10:00:00.000001Z';
    expect(analyticsReportResponseSchema.safeParse(metadata).success).toBe(false);
    const groups = report();
    groups.groups.find((group) => group.dimension === 'tag')!.additive = true;
    expect(analyticsReportResponseSchema.safeParse(groups).success).toBe(false);
    const unknown = { ...report(), accountReturn: '100' };
    expect(analyticsReportResponseSchema.safeParse(unknown).success).toBe(false);
    const provenance = report();
    provenance.records[0]!.provenance.originalPlanHash = 'fabricated' as never;
    expect(analyticsReportResponseSchema.safeParse(provenance).success).toBe(false);
  });

  it('never exposes fabricated drawdown points or recovery evidence when unavailable', () => {
    const curve = report().summary.curve;
    expect(analyticsCurveSchema.parse(curve)).toEqual(curve);
    expect(
      analyticsCurveSchema.safeParse({
        ...curve,
        state: 'unavailable',
        reasons: ['missing_outcome'],
      }).success,
    ).toBe(false);
    expect(analyticsCurveSchema.safeParse({ ...curve, points: [] }).success).toBe(false);
    const recovery = report().summary.recovery;
    expect(analyticsRecoverySchema.parse(recovery)).toEqual(recovery);
    expect(
      analyticsRecoverySchema.safeParse({ ...recovery, state: 'unavailable', reasons: [] }).success,
    ).toBe(false);
    expect(analyticsRecoverySchema.safeParse({ ...recovery, recoveredAt: to }).success).toBe(false);
  });

  it('publishes one authenticated read-only report operation and explicit reusable mathematical DTOs', () => {
    const document = JSON.parse(
      readFileSync(new URL('../../packages/contracts/openapi.json', import.meta.url), 'utf8'),
    ) as {
      paths: Record<
        string,
        Record<
          string,
          {
            security: unknown[];
            parameters?: { name: string }[];
            requestBody: unknown;
            responses: Record<string, unknown>;
          }
        >
      >;
      components: { schemas: Record<string, unknown> };
    };
    const operations = document.paths['/api/v1/workspaces/{workspaceId}/analytics/reports']!;
    expect(Object.keys(operations)).toEqual(['post']);
    const operation = operations['post']!;
    expect(operation.security).toEqual([{ sessionCookie: [] }]);
    expect(operation.parameters?.some((parameter) => parameter.name === 'X-CSRF-Token')).toBe(
      false,
    );
    expect(operation.responses['200']).toBeDefined();
    expect(operation.responses['413']).toBeDefined();
    for (const name of [
      'AnalyticsMetric',
      'AnalyticsCampaign',
      'AnalyticsSummary',
      'AnalyticsRecovery',
    ])
      expect(document.components.schemas[name]).toBeDefined();
  });
});
