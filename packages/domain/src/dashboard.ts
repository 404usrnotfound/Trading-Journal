import { decimalValue, quantizeDecimal, FinancialArithmeticError } from './decimal.js';
import type { AnalyticsCampaign } from './analytics-types.js';

export type DashboardTradeFilters = {
  strategyIds: readonly string[];
  strategyVersionIds: readonly string[];
  assetIds: readonly string[];
  assetClasses: readonly string[];
  tags: readonly string[];
};
/** OR within a dimension, AND across dimensions; a campaign is never split into arbitrary legs. */
export function filterDashboardCampaigns<T extends AnalyticsCampaign>(
  records: readonly T[],
  filters: DashboardTradeFilters,
): T[] {
  const selections = [
    ['strategy', filters.strategyIds],
    ['strategyVersion', filters.strategyVersionIds],
    ['asset', filters.assetIds],
    ['assetClass', filters.assetClasses],
    ['tag', filters.tags],
  ] as const;
  return records.filter((record) =>
    selections.every(
      ([dimension, keys]) =>
        !keys.length ||
        (record.dimensions[dimension] ?? []).some((value) => keys.includes(value.key)),
    ),
  );
}

export type DashboardBucket = {
  key: string;
  value: string | null;
  state: 'available' | 'partial' | 'unavailable';
  knownSubtotal: string | null;
  campaignIds: string[];
  excludedIds: string[];
};
export type DashboardBin = {
  key: string;
  lower: string | null;
  upper: string | null;
  count: number;
  campaignIds: string[];
};
export function dashboardDateKey(at: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}

function buckets(
  records: readonly AnalyticsCampaign[],
  timezone: string,
  monthly: boolean,
): DashboardBucket[] {
  const map = new Map<string, AnalyticsCampaign[]>();
  for (const record of records) {
    if (record.status === 'open' || record.closedAt === null) continue;
    const day = dashboardDateKey(record.closedAt, timezone);
    const key = monthly ? day.slice(0, 7) : day;
    const group = map.get(key) ?? [];
    group.push(record);
    map.set(key, group);
  }
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => {
      const eligible = group.filter(
        (record) =>
          record.status === 'completed' &&
          record.netPnl.state === 'available' &&
          record.netPnl.value !== null,
      );
      const excluded = group.filter((record) => !eligible.includes(record));
      try {
        const sum = quantizeDecimal(
          eligible.reduce(
            (value, record) => value.plus(decimalValue(record.netPnl.value)),
            decimalValue('0'),
          ),
        );
        return {
          key,
          value: excluded.length ? null : sum,
          state: excluded.length
            ? eligible.length
              ? ('partial' as const)
              : ('unavailable' as const)
            : ('available' as const),
          knownSubtotal: sum,
          campaignIds: eligible.map((record) => record.id),
          excludedIds: excluded.map((record) => record.id),
        };
      } catch (error) {
        if (!(error instanceof FinancialArithmeticError)) throw error;
        return {
          key,
          value: null,
          state: 'unavailable' as const,
          knownSubtotal: null,
          campaignIds: [],
          excludedIds: group.map((record) => record.id),
        };
      }
    });
}

/** Equal-width money bins, exact Decimal boundaries; [lower,upper), final bin closed on the right. */
export function dashboardHistogram(
  records: readonly AnalyticsCampaign[],
  field: 'netPnl' | 'rMultiple',
): { bins: DashboardBin[]; excludedIds: string[] } {
  const eligible = records.filter(
    (record) =>
      record.status === 'completed' &&
      record[field].state === 'available' &&
      record[field].value !== null,
  );
  const excludedIds = records
    .filter((record) => !eligible.includes(record))
    .map((record) => record.id);
  if (!eligible.length) return { bins: [], excludedIds };
  const values = eligible.map((record) => decimalValue(record[field].value));
  const min = values.reduce((a, b) => (a.lte(b) ? a : b)),
    max = values.reduce((a, b) => (a.gte(b) ? a : b));
  if (min.eq(max))
    return {
      bins: [
        {
          key: `exact:${min.toFixed()}`,
          lower: min.toFixed(),
          upper: max.toFixed(),
          count: eligible.length,
          campaignIds: eligible.map((record) => record.id),
        },
      ],
      excludedIds,
    };
  const width = max.minus(min).div('6');
  const bins: DashboardBin[] = Array.from({ length: 6 }, (_, index) => ({
    key: String(index),
    lower: quantizeDecimal(min.plus(width.times(String(index)))),
    upper: quantizeDecimal(index === 5 ? max : min.plus(width.times(String(index + 1)))),
    count: 0,
    campaignIds: [],
  })).filter((bin) => decimalValue(bin.upper!).gt(bin.lower!));
  // Compare the published boundaries, so table and plot membership describe the same buckets.
  eligible.forEach((record) => {
    const value = decimalValue(record[field].value);
    const index = bins.findIndex(
      (bin, index) =>
        value.gte(bin.lower!) &&
        (index === bins.length - 1 ? value.lte(bin.upper!) : value.lt(bin.upper!)),
    );
    const bin = bins[index < 0 ? bins.length - 1 : index]!;
    bin.count++;
    bin.campaignIds.push(record.id);
  });
  return { bins, excludedIds };
}

export function calculateDashboardViews(records: readonly AnalyticsCampaign[], timezone: string) {
  return {
    calendar: buckets(records, timezone, false),
    periods: buckets(records, timezone, true),
    pnlDistribution: dashboardHistogram(records, 'netPnl'),
    rDistribution: dashboardHistogram(records, 'rMultiple'),
    unknownChronologyIds: records
      .filter((record) => record.status === 'excluded' && !record.closedAt)
      .map((record) => record.id),
  };
}
