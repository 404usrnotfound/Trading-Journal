import { formatDashboardValue } from '../../apps/web/src/components/dashboard/dashboard-format.js';
import { describe, it, expect } from 'vitest';
import {
  calculateDashboardViews,
  dashboardHistogram,
  filterDashboardCampaigns,
  type AnalyticsCampaign,
} from '@journal/domain';
import { dashboardRequestSchema } from '@journal/contracts';
import {
  inclusiveDateRange,
  localDayBoundary,
} from '../../apps/web/src/components/dashboard/dashboard-time.js';
const metric = (value: string | null) => ({
  state: value === null ? ('unavailable' as const) : ('available' as const),
  value,
  reasons: value === null ? ['missing_fees'] : [],
  missingReferences: [],
});
function campaign(
  id: string,
  value: string | null,
  extra: Partial<AnalyticsCampaign> = {},
): AnalyticsCampaign {
  return {
    id,
    status: 'completed',
    entryAt: '2026-10-01T12:00:00Z',
    closedAt: '2026-10-02T23:00:00Z',
    grossPnl: metric(value),
    netPnl: metric(value),
    realizedPnl: metric(value),
    unrealizedPnl: metric('0'),
    fees: metric('0'),
    rMultiple: metric(value),
    dimensions: {
      strategy: [{ key: 's1', label: 'First' }],
      strategyVersion: [{ key: 'v1', label: 'v1' }],
      asset: [
        { key: 'asset1', label: 'First' },
        { key: 'asset2', label: 'Second' },
      ],
      assetClass: [{ key: 'stock', label: 'Stock' }],
      tag: [
        { key: 'review', label: 'Review' },
        { key: 'overlap', label: 'Overlap' },
      ],
    },
    exclusionReasons: [],
    ...extra,
  };
}
const filters = {
  strategyIds: [],
  strategyVersionIds: [],
  assetIds: [],
  assetClasses: [],
  tags: [],
};
describe('dashboard financial populations', () => {
  it('uses OR within dimensions, AND across dimensions and retains the whole mixed campaign exactly once', () => {
    const rows = [
      campaign('1', '10'),
      campaign('2', '20', {
        dimensions: {
          strategy: [{ key: 's2', label: 'Second' }],
          asset: [{ key: 'asset3', label: 'Third' }],
          tag: [{ key: 'review', label: 'Review' }],
        },
      }),
    ];
    expect(
      filterDashboardCampaigns(rows, {
        ...filters,
        strategyIds: ['s1', 's2'],
        assetIds: ['asset2'],
        tags: ['review'],
      }),
    ).toEqual([rows[0]]);
    expect(filterDashboardCampaigns(rows, { ...filters, strategyVersionIds: ['v2'] })).toEqual([]);
  });
  it('reconciles calendar/month buckets to exact closed net outcomes and excludes open gains', () => {
    const result = calculateDashboardViews(
      [
        campaign('1', '100'),
        campaign('2', '-25'),
        campaign('3', '0'),
        campaign('4', '1000', { status: 'open', closedAt: null }),
      ],
      'Europe/Madrid',
    );
    expect(result.calendar).toEqual([
      {
        key: '2026-10-03',
        state: 'available',
        value: '75',
        knownSubtotal: '75',
        campaignIds: ['1', '2', '3'],
        excludedIds: [],
      },
    ]);
    expect(result.periods[0]?.value).toBe('75');
    expect(result.pnlDistribution.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    expect(result.pnlDistribution.excludedIds).toEqual(['4']);
  });
  it('never presents partial day totals or unknown close chronology as complete', () => {
    const result = calculateDashboardViews(
      [
        campaign('1', '10'),
        campaign('2', null),
        campaign('3', null, { status: 'excluded', closedAt: null }),
      ],
      'UTC',
    );
    expect(result.calendar[0]).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '10',
      excludedIds: ['2'],
    });
    expect(result.unknownChronologyIds).toEqual(['3']);
    expect(result.pnlDistribution.excludedIds).toEqual(['2', '3']);
  });
  it('conserves each outcome once in six bins with included final upper bound and exact all-equal bin', () => {
    const rows = ['-3', '-2', '-1', '0', '1', '2', '3'].map((value, index) =>
      campaign(String(index), value),
    );
    const hist = dashboardHistogram(rows, 'netPnl');
    expect(hist.bins.map((bin) => bin.count)).toEqual([1, 1, 1, 1, 1, 2]);
    expect(hist.bins.flatMap((bin) => bin.campaignIds)).toHaveLength(7);
    expect(dashboardHistogram([campaign('1', '0'), campaign('2', '0')], 'rMultiple').bins).toEqual([
      { key: 'exact:0', lower: '0', upper: '0', count: 2, campaignIds: ['1', '2'] },
    ]);
  });
  it('retains source precision and reports empty samples without fake bins', () => {
    expect(dashboardHistogram([], 'netPnl')).toEqual({ bins: [], excludedIds: [] });
    const result = calculateDashboardViews(
      [
        campaign('1', '0.000000000000000000000000000000000001'),
        campaign('2', '0.000000000000000000000000000000000002'),
      ],
      'UTC',
    );
    expect(result.calendar[0]?.value).toBe('0.000000000000000000000000000000000003');
    expect(result.pnlDistribution.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(2);
  });
});
describe('inclusive local dashboard dates', () => {
  it('retains 23-hour and 25-hour Madrid days instead of assuming UTC days', () => {
    expect(localDayBoundary('2026-03-29', 'Europe/Madrid')).toBe('2026-03-28T23:00:00.000Z');
    expect(inclusiveDateRange('2026-03-29', '2026-03-29', 'Europe/Madrid')).toEqual({
      from: '2026-03-28T22:59:59.999999Z',
      to: '2026-03-29T21:59:59.999999Z',
    });
    expect(inclusiveDateRange('2026-10-25', '2026-10-25', 'Europe/Madrid')).toEqual({
      from: '2026-10-24T21:59:59.999999Z',
      to: '2026-10-25T22:59:59.999999Z',
    });
  });
  it('rejects invalid dates rather than normalizing them into another month', () => {
    expect(() => localDayBoundary('2026-02-30', 'UTC')).toThrow();
  });
  it('bounds sampling and rejects reversed, excessive and executable query fields', () => {
    const query = {
      reportingCurrencyId: '00000000-0000-4000-8000-000000000001',
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
      filters: {},
      fxPolicy: { id: 'test', sourcePriority: ['manual'], maxAgeMilliseconds: 0 },
      priceSourcePriority: ['manual'],
      priceMaxAgeMilliseconds: 0,
    };
    expect(dashboardRequestSchema.safeParse(query).success).toBe(true);
    for (const change of [
      { to: query.from },
      { from: '2024-01-01T00:00:00Z' },
      { samples: 14 },
      { formula: 'eval' },
    ])
      expect(dashboardRequestSchema.safeParse({ ...query, ...change }).success).toBe(false);
  });
});

describe('dashboard monetary presentation', () => {
  it('preserves tiny nonzero profits and losses, ordinary values and unavailable states', () => {
    expect(formatDashboardValue('0.00000001', 'BTC')).toBe('0.00000001 BTC');
    expect(formatDashboardValue('-0.00000001', 'BTC')).toBe('-0.00000001 BTC');
    expect(formatDashboardValue('18', 'EUR')).toBe('18 EUR');
    expect(formatDashboardValue(null, 'EUR')).toBe('Unavailable');
  });
});
