import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_DIMENSIONS,
  calculateAnalytics,
  FinancialArithmeticError,
  type AnalyticsCampaign,
  type AnalyticsInput,
  type AnalyticsSourceMetric,
} from '../../packages/domain/src/index.js';

const known = (value: string): AnalyticsSourceMetric => ({
  state: 'available',
  value,
  reasons: [],
  missingReferences: [],
});
const unknown = (reason = 'missing_fees'): AnalyticsSourceMetric => ({
  state: 'unavailable',
  value: null,
  reasons: [reason],
  missingReferences: ['source:missing'],
});
const from = '2026-01-01T00:00:00.000000Z';
const asOf = '2026-02-01T00:00:00.000000Z';
function campaign(
  id: string,
  net: string,
  overrides: Partial<AnalyticsCampaign> = {},
): AnalyticsCampaign {
  return {
    id,
    status: 'completed',
    entryAt: '2026-01-01T01:00:00.000000Z',
    closedAt: `2026-01-${String(Number(id.replace(/\D/g, '')) + 2).padStart(2, '0')}T00:00:00.000000Z`,
    grossPnl: known(net),
    netPnl: known(net),
    realizedPnl: known(net),
    unrealizedPnl: known('0'),
    fees: known('0'),
    rMultiple: unknown('missing_original_risk'),
    dimensions: {},
    exclusionReasons: [],
    ...overrides,
  };
}
function analyze(campaigns: readonly AnalyticsCampaign[], overrides: Partial<AnalyticsInput> = {}) {
  return calculateAnalytics({ campaigns, reportingCurrencyId: 'USD', from, asOf, ...overrides });
}

describe('independent campaign analytics definitions', () => {
  it('calculates the five-outcome dictionary fixture with breakevens in denominators', () => {
    const records = ['100', '-50', '0', '150', '-25'].map((value, index) =>
      campaign(String(index), value, { rMultiple: known(['1', '-1', '0', '3', '-0.5'][index]!) }),
    );
    const result = analyze(records).summary;
    expect(result.counts).toMatchObject({
      selected: 5,
      completed: 5,
      eligibleOutcomes: 5,
      wins: 2,
      losses: 2,
      breakevens: 1,
      eligibleR: 5,
    });
    const expected = {
      grossPnl: '175',
      netPnl: '175',
      realizedPnl: '175',
      unrealizedPnl: '0',
      fees: '0',
      winRate: '0.4',
      lossRate: '0.4',
      averageWinner: '125',
      averageLoser: '37.5',
      payoffRatio: '3.333333333333333333333333333333333333',
      profitFactor: '3.333333333333333333333333333333333333',
      expectancy: '35',
      expectancyR: '0.5',
      averageR: '0.5',
      cumulativeR: '2.5',
      maximumDrawdown: '50',
      currentDrawdown: '25',
      longestWinStreak: '1',
      longestLossStreak: '1',
      currentWinStreak: '0',
      currentLossStreak: '1',
    };
    for (const [name, value] of Object.entries(expected))
      expect(result.metrics[name as keyof typeof result.metrics]).toMatchObject({
        state: 'available',
        value,
        knownSubtotal: value,
      });
    expect(result.curve.points.map((point) => point.cumulativePnl)).toEqual([
      '0',
      '100',
      '50',
      '50',
      '200',
      '175',
    ]);
    expect(result.recovery).toMatchObject({
      state: 'recovered',
      peakCampaignId: '0',
      troughCampaignId: '1',
      recoveredCampaignId: '3',
      durationSeconds: '259200',
      tradesToRecovery: 3,
      elapsedSeconds: null,
    });
    expect(result.metrics.winRate.eligibleIds).toEqual(['0', '1', '2', '3', '4']);
    expect(result.metrics.averageLoser.eligibleIds).toEqual(['1', '4']);
  });

  it('keeps full lifetime as-of open money separate from completed outcomes', () => {
    const result = analyze([
      campaign('0', '18', { grossPnl: known('20'), fees: known('2') }),
      campaign('1', '-8', {
        status: 'open',
        closedAt: null,
        grossPnl: known('-5'),
        realizedPnl: known('2'),
        unrealizedPnl: known('-10'),
        fees: known('3'),
        rMultiple: known('999'),
      }),
    ]);
    expect(result.summary.metrics.netPnl.value).toBe('10');
    expect(result.summary.metrics.grossPnl.value).toBe('15');
    expect(result.summary.metrics.realizedPnl.value).toBe('20');
    expect(result.summary.metrics.unrealizedPnl.value).toBe('-10');
    expect(result.summary.metrics.fees.value).toBe('5');
    expect(result.summary.metrics.expectancy).toMatchObject({
      value: '18',
      sampleSize: 1,
      excludedIds: ['1'],
    });
    expect(result.summary.metrics.averageR.value).toBeNull();
    expect(result.completedOnly.metrics.netPnl.value).toBe('18');
    expect(result.openOnly.metrics.netPnl.value).toBe('-8');
    expect(result.openOnly.curve.state).toBe('unavailable');
  });

  it('retains independently known gross and exact partial subtotals without inventing net profit', () => {
    const result = analyze([
      campaign('0', '10'),
      campaign('1', '20', { netPnl: unknown() }),
    ]).summary;
    expect(result.metrics.grossPnl).toMatchObject({ state: 'available', value: '30' });
    expect(result.metrics.netPnl).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '10',
      sampleSize: 1,
      eligibleIds: ['0'],
      excludedIds: ['1'],
      reasons: ['missing_fees'],
      missingReferences: ['source:missing'],
    });
    expect(result.metrics.winRate).toMatchObject({
      state: 'available',
      value: '1',
      sampleSize: 1,
      excludedIds: ['1'],
    });
    expect(result.counts.eligibleDuration).toBe(2);
    expect(result.curve).toMatchObject({ state: 'unavailable', points: [], excludedIds: ['1'] });
  });

  it('gates invalid source decimals instead of coercing numbers or source precision', () => {
    for (const value of ['NaN', 'Infinity', '1e2', '0.0000000000000000000000000000000000001']) {
      const result = analyze([campaign('0', value)]).summary;
      expect(result.metrics.netPnl).toMatchObject({
        state: 'unavailable',
        value: null,
        reasons: ['invalid_source_metric'],
      });
      expect(result.metrics.winRate.value).toBeNull();
    }
  });

  it('treats genuine exact zero as breakeven even below displayed rounding scales', () => {
    const result = analyze([
      campaign('0', '0.000000000000000000000000000000000001'),
      campaign('1', '-0.000000000000000000000000000000000001'),
      campaign('2', '-0.000'),
    ]).summary;
    expect(result.counts).toMatchObject({ wins: 1, losses: 1, breakevens: 1 });
    expect(result.metrics.netPnl.value).toBe('0');
    expect(result.metrics.profitFactor.value).toBe('1');
  });

  it('sums large fractional authoritative amounts beyond binary floating point precision', () => {
    const result = analyze([campaign('0', '9007199254740993.01'), campaign('1', '0.02')]).summary;
    expect(result.metrics.netPnl.value).toBe('9007199254740993.03');
    expect(result.metrics.expectancy.value).toBe('4503599627370496.515');
  });

  it('reports numeric overflow without disguising it as an infinite ratio', () => {
    const huge = '999999999999999999999999999999999999999999';
    const result = analyze([campaign('0', huge), campaign('1', huge)]).summary;
    expect(result.metrics.netPnl).toMatchObject({
      state: 'unavailable',
      value: null,
      knownSubtotal: null,
      reasons: ['numeric_overflow'],
    });
    expect(result.metrics.expectancy.value).toBe(huge);
    expect(result.curve).toMatchObject({ state: 'unavailable', reasons: ['numeric_overflow'] });
    const ratio = analyze([
      campaign('0', huge),
      campaign('1', '-0.000000000000000000000000000000000001'),
    ]).summary.metrics.profitFactor;
    expect(ratio).toMatchObject({
      state: 'unavailable',
      value: null,
      reasons: ['numeric_overflow'],
    });
  });

  it('preserves actual fee rebates with their signed cost effect', () => {
    const result = analyze([
      campaign('0', '12', { grossPnl: known('10'), fees: known('-2') }),
    ]).summary;
    expect(result.metrics.grossPnl.value).toBe('10');
    expect(result.metrics.netPnl.value).toBe('12');
    expect(result.metrics.fees.value).toBe('-2');
  });
});

describe('ratio and sample eligibility edge cases', () => {
  it('declares positive gains and no losses explicitly infinite', () => {
    const result = analyze([campaign('0', '1'), campaign('1', '0')]).summary;
    expect(result.metrics.profitFactor).toMatchObject({
      state: 'infinite',
      value: null,
      knownSubtotal: null,
      reasons: ['zero_loss_denominator'],
    });
    expect(result.metrics.payoffRatio.state).toBe('unavailable');
    expect(result.metrics.averageLoser.value).toBeNull();
    expect(result.metrics.winRate.value).toBe('0.5');
  });
  it('returns profit factor zero for only losses and unavailable average winner', () => {
    const result = analyze([campaign('0', '-1'), campaign('1', '-3')]).summary;
    expect(result.metrics.profitFactor).toMatchObject({ state: 'available', value: '0' });
    expect(result.metrics.averageLoser.value).toBe('2');
    expect(result.metrics.averageWinner.value).toBeNull();
    expect(result.metrics.lossRate.value).toBe('1');
  });
  it('keeps all breakevens distinct from empty or unavailable populations', () => {
    const result = analyze([campaign('0', '0')]).summary;
    expect(result.metrics.winRate.value).toBe('0');
    expect(result.metrics.lossRate.value).toBe('0');
    expect(result.metrics.expectancy.value).toBe('0');
    expect(result.metrics.profitFactor).toMatchObject({
      state: 'unavailable',
      value: null,
      reasons: ['no_gains_or_losses'],
    });
    expect(result.metrics.maximumDrawdown.value).toBe('0');
    expect(result.recovery.state).toBe('no-drawdown');
  });
  it('returns known empty monetary sums and unavailable rates, means, R and drawdown', () => {
    const result = analyze([]).summary;
    expect(result.metrics.netPnl).toMatchObject({ state: 'available', value: '0', sampleSize: 0 });
    for (const name of [
      'winRate',
      'lossRate',
      'expectancy',
      'averageWinner',
      'averageLoser',
      'averageR',
      'cumulativeR',
      'maximumDrawdown',
    ] as const)
      expect(result.metrics[name].value).toBeNull();
    expect(result.counts.selected).toBe(0);
  });
  it('never labels an explicitly excluded-only population as a complete zero sum', () => {
    const result = analyze([
      campaign('0', '99', { status: 'excluded', exclusionReasons: ['partial_campaign_scope'] }),
    ]).summary;
    expect(result.metrics.netPnl).toMatchObject({
      state: 'unavailable',
      value: null,
      knownSubtotal: '0',
      sampleSize: 0,
      excludedIds: ['0'],
    });
    expect(result.counts.excluded).toBe(1);
    expect(result.curve.state).toBe('unavailable');
  });
  it('keeps excluded closed-cohort evidence in completed-only totals instead of inventing zero', () => {
    const result = analyze([
      campaign('0', '99', {
        status: 'excluded',
        exclusionReasons: ['partial_campaign_scope'],
      }),
    ]);
    expect(result.completedOnly.population).toMatchObject({
      campaignIds: ['0'],
      completedIds: [],
      excludedIds: ['0'],
    });
    expect(result.completedOnly.counts).toMatchObject({
      selected: 1,
      completed: 0,
      excluded: 1,
      eligibleOutcomes: 0,
    });
    expect(result.completedOnly.metrics.netPnl).toMatchObject({
      state: 'unavailable',
      value: null,
      knownSubtotal: '0',
      eligibleIds: [],
      excludedIds: ['0'],
      reasons: ['excluded_campaign', 'partial_campaign_scope'],
    });
    expect(result.completedOnly.curve).toMatchObject({
      state: 'unavailable',
      points: [],
      excludedIds: ['0'],
    });
  });
  it('uses only validated original-risk R inputs and discloses the smaller sample', () => {
    const result = analyze([
      campaign('0', '10', { rMultiple: known('2') }),
      campaign('1', '20', { rMultiple: unknown('retrospective_original_plan') }),
      campaign('2', '-5', { rMultiple: known('-1') }),
    ]).summary;
    expect(result.metrics.averageR).toMatchObject({
      state: 'available',
      value: '0.5',
      eligibleIds: ['0', '2'],
      excludedIds: ['1'],
      reasons: ['retrospective_original_plan'],
      currencyId: null,
    });
    expect(result.metrics.expectancyR.value).toBe('0.5');
    expect(result.metrics.cumulativeR).toMatchObject({
      state: 'available',
      value: '1',
      sampleSize: 2,
    });
    expect(result.metrics.expectancy.value).toBe('8.333333333333333333333333333333333333');
  });
  it('keeps an eligible R result when the requested money currency is unavailable', () => {
    const result = analyze([
      campaign('0', '10', { netPnl: unknown('missing_reporting_fx'), rMultiple: known('2') }),
    ]).summary;
    expect(result.metrics.averageR.value).toBe('2');
    expect(result.metrics.expectancy.value).toBeNull();
  });
  it('does not invent zero cumulative R when every original-risk result is unavailable', () => {
    const result = analyze([
      campaign('0', '10'),
      campaign('1', '-5', { rMultiple: unknown('retrospective_original_plan') }),
    ]).summary;
    expect(result.metrics.cumulativeR).toMatchObject({
      state: 'unavailable',
      value: null,
      knownSubtotal: null,
      sampleSize: 0,
      eligibleIds: [],
      excludedIds: ['0', '1'],
      reasons: [
        'empty_eligible_population',
        'missing_original_risk',
        'retrospective_original_plan',
      ],
    });
    expect(result.metrics.averageR.value).toBeNull();
    expect(result.metrics.netPnl.value).toBe('5');
  });
});

describe('drawdown, recovery, streak and duration chronology', () => {
  it('uses deterministic close-time then ID ordering regardless of input order', () => {
    const close = '2026-01-03T00:00:00.000001Z';
    const a = campaign('0', '10', { closedAt: close });
    const b = campaign('1', '-10', { closedAt: close });
    const result = analyze([b, a]).summary;
    expect(result.curve.points.map((point) => point.campaignId)).toEqual([null, '0', '1']);
    expect(result.metrics.maximumDrawdown.value).toBe('10');
    expect(analyze([a, b])).toEqual(analyze([b, a]));
  });
  it('records unrecovered peak/trough and elapsed time without inventing a recovery', () => {
    const result = analyze([campaign('0', '10'), campaign('1', '-5')]).summary;
    expect(result.recovery).toMatchObject({
      state: 'unrecovered',
      peakCampaignId: '0',
      troughCampaignId: '1',
      recoveredAt: null,
      durationSeconds: null,
      elapsedSeconds: '2592000',
      tradesToRecovery: null,
    });
  });
  it('permits negative cumulative money with a zero anchor and recovers to that anchor', () => {
    const result = analyze([campaign('0', '-10'), campaign('1', '10')]).summary;
    expect(result.metrics.maximumDrawdown.value).toBe('10');
    expect(result.recovery).toMatchObject({
      state: 'recovered',
      peakCampaignId: null,
      recoveredCampaignId: '1',
      durationSeconds: '172800',
      tradesToRecovery: 2,
    });
  });
  it('uses the latest equal peak before descent and earliest maximum trough', () => {
    const result = analyze([
      campaign('0', '10'),
      campaign('1', '0'),
      campaign('2', '-5'),
      campaign('3', '0'),
      campaign('4', '5'),
    ]).summary;
    expect(result.recovery).toMatchObject({
      peakCampaignId: '1',
      troughCampaignId: '2',
      recoveredCampaignId: '4',
      durationSeconds: '259200',
      tradesToRecovery: 3,
    });
  });
  it('preserves the earliest equal maximum episode and its original recovery', () => {
    const result = analyze([
      campaign('0', '10'),
      campaign('1', '-5'),
      campaign('2', '5'),
      campaign('3', '-5'),
    ]).summary;
    expect(result.recovery).toMatchObject({
      state: 'recovered',
      peakCampaignId: '0',
      troughCampaignId: '1',
      recoveredCampaignId: '2',
    });
  });
  it('breaks directional streaks at breakevens and never joins across unknown outcomes', () => {
    const result = analyze([
      campaign('0', '1'),
      campaign('1', '1'),
      campaign('2', '0'),
      campaign('3', '-1'),
      campaign('4', '-1'),
    ]).summary;
    expect(result.metrics.longestWinStreak.value).toBe('2');
    expect(result.metrics.longestLossStreak.value).toBe('2');
    expect(result.metrics.currentLossStreak.value).toBe('2');
    const missing = analyze([
      campaign('0', '1'),
      campaign('1', '99', { netPnl: unknown() }),
      campaign('2', '1'),
    ]).summary;
    expect(missing.metrics.longestWinStreak).toMatchObject({
      state: 'unavailable',
      value: null,
      knownSubtotal: '1',
      excludedIds: ['1'],
    });
    expect(missing.metrics.currentWinStreak.value).toBeNull();
    expect(missing.curve.points).toEqual([]);
  });
  it('uses microsecond lifecycle duration without confirmation dates or rounded milliseconds', () => {
    const result = analyze([
      campaign('0', '1', {
        entryAt: '2026-01-02T00:00:00.000001Z',
        closedAt: '2026-01-02T00:00:00.000006Z',
      }),
    ]).summary;
    expect(result.metrics.averageHoldingDuration).toMatchObject({
      state: 'available',
      value: '0.000005',
      unit: 'seconds',
      currencyId: null,
    });
  });
  it('averages exact microsecond holding durations without truncating the sub-microsecond mean', () => {
    const result = analyze([
      campaign('0', '1', {
        entryAt: '2026-01-02T00:00:00.000001Z',
        closedAt: '2026-01-02T00:00:00.000002Z',
      }),
      campaign('1', '-1', {
        entryAt: '2026-01-03T00:00:00.000001Z',
        closedAt: '2026-01-03T00:00:00.000003Z',
      }),
    ]).summary;
    expect(result.metrics.averageHoldingDuration).toMatchObject({
      state: 'available',
      value: '0.0000015',
      sampleSize: 2,
      eligibleIds: ['0', '1'],
    });
  });
  it('retains a timed excluded gap rather than joining known winning outcomes across it', () => {
    const result = analyze([
      campaign('0', '1'),
      campaign('1', '2', {
        status: 'excluded',
        exclusionReasons: ['stale_closure'],
      }),
      campaign('2', '3'),
    ]).summary;
    expect(result.metrics.longestWinStreak).toMatchObject({
      state: 'unavailable',
      value: null,
      knownSubtotal: '1',
      eligibleIds: ['0', '2'],
      excludedIds: ['1'],
    });
    expect(result.curve).toMatchObject({ state: 'unavailable', points: [], excludedIds: ['1'] });
  });
  it('does not claim a known streak subtotal when an outcome has ambiguous close chronology', () => {
    const records = [
      campaign('0', '1', { closedAt: '2026-01-04T00:00:00.000001Z' }),
      campaign('1', '2', { closedAt: null }),
      campaign('2', '3', { closedAt: '2026-01-02T00:00:00.000001Z' }),
    ];
    const result = analyze(records).summary;
    for (const name of [
      'longestWinStreak',
      'longestLossStreak',
      'currentWinStreak',
      'currentLossStreak',
    ] as const)
      expect(result.metrics[name]).toMatchObject({
        state: 'unavailable',
        value: null,
        knownSubtotal: null,
        excludedIds: ['1'],
        reasons: ['missing_or_invalid_close_chronology'],
      });
    expect(analyze([...records].reverse()).summary).toEqual(result);
  });
  it('blocks complete chronology when an excluded campaign has no provable close boundary', () => {
    const records = [
      campaign('0', '10'),
      campaign('1', '99', {
        status: 'excluded',
        closedAt: null,
        netPnl: unknown('missing_campaign_opening'),
        exclusionReasons: ['incomplete_campaign_inventory'],
      }),
    ];
    const result = analyze(records);
    for (const summary of [result.summary, result.completedOnly]) {
      expect(summary.metrics.netPnl).toMatchObject({
        state: 'partial',
        value: null,
        knownSubtotal: '10',
        eligibleIds: ['0'],
        excludedIds: ['1'],
        reasons: ['excluded_campaign', 'incomplete_campaign_inventory', 'missing_campaign_opening'],
        missingReferences: ['source:missing'],
      });
      expect(summary.curve).toMatchObject({
        state: 'unavailable',
        points: [],
        excludedIds: ['1'],
        reasons: [
          'incomplete_campaign_inventory',
          'incomplete_completed_outcome',
          'missing_campaign_opening',
          'missing_or_invalid_close_chronology',
        ],
      });
      expect(summary.metrics.maximumDrawdown.value).toBeNull();
      expect(summary.recovery.state).toBe('unavailable');
      for (const name of [
        'longestWinStreak',
        'longestLossStreak',
        'currentWinStreak',
        'currentLossStreak',
      ] as const)
        expect(summary.metrics[name]).toMatchObject({
          state: 'unavailable',
          value: null,
          knownSubtotal: null,
          excludedIds: ['1'],
        });
    }
    expect(result.completedOnly.counts.completed).toBe(1);
    expect(result.completedOnly.counts.excluded).toBe(1);
    expect(analyze([...records].reverse())).toEqual(result);
  });
  it('allows same-instant analytical recovery with exact zero elapsed seconds', () => {
    const close = '2026-01-03T00:00:00.000001Z';
    const result = analyze([
      campaign('0', '10', { closedAt: close }),
      campaign('1', '-5', { closedAt: close }),
      campaign('2', '5', { closedAt: close }),
    ]).summary;
    expect(result.metrics.maximumDrawdown.value).toBe('5');
    expect(result.recovery).toMatchObject({
      state: 'recovered',
      peakCampaignId: '0',
      troughCampaignId: '1',
      recoveredCampaignId: '2',
      durationSeconds: '0',
      tradesToRecovery: 2,
    });
  });
  it.each([
    { entryAt: null },
    { closedAt: null },
    { entryAt: '2026-03-01T00:00:00.000000Z' },
    { closedAt: '2026-01-01T00:00:00.000000Z' },
  ])('exposes unavailable exact duration/chronology when boundaries are %s', (overrides) => {
    const result = analyze([campaign('0', '1', overrides)]).summary;
    expect(result.metrics.averageHoldingDuration.value).toBeNull();
    if (overrides.closedAt !== undefined) expect(result.curve.state).toBe('unavailable');
  });
});

describe('whole-campaign group conservation and resource limits', () => {
  it('preserves strategy-version pins and routes multileg identities to a single mixed bucket', () => {
    const records = [
      campaign('0', '10', {
        dimensions: {
          strategy: [{ key: 'A', label: 'Strategy A' }],
          strategyVersion: [{ key: 'v1', label: 'A v1' }],
          asset: [
            { key: 'stock', label: 'Stock' },
            { key: 'bond', label: 'Bond' },
          ],
        },
      }),
      campaign('1', '20', {
        dimensions: {
          strategy: [{ key: 'A', label: 'Strategy A' }],
          strategyVersion: [{ key: 'v2', label: 'A v2' }],
          asset: [{ key: 'stock', label: 'Stock' }],
        },
      }),
      campaign('2', '-5'),
    ];
    const result = analyze(records, { groupBy: ['strategy', 'strategyVersion', 'asset'] });
    expect(
      result.groups
        .filter((group) => group.dimension === 'strategyVersion')
        .map((group) => [group.key, group.summary.metrics.netPnl.value]),
    ).toEqual([
      ['unknown', '-5'],
      ['value:v1', '10'],
      ['value:v2', '20'],
    ]);
    const mixed = result.groups.find(
      (group) => group.dimension === 'asset' && group.kind === 'mixed',
    )!;
    expect(mixed).toMatchObject({ key: 'mixed', memberKeys: ['bond', 'stock'], additive: true });
    expect(mixed.summary.counts.selected).toBe(1);
    expect(mixed.summary.metrics.netPnl.value).toBe('10');
    expect(
      result.groups
        .filter((group) => group.dimension === 'asset')
        .reduce((count, group) => count + group.summary.counts.selected, 0),
    ).toBe(3);
  });
  it('marks tag cohorts nonadditive and deduplicates membership within each tag', () => {
    const result = analyze(
      [
        campaign('0', '10', {
          dimensions: {
            tag: [
              { key: 'x', label: 'x' },
              { key: 'x', label: 'x' },
              { key: 'y', label: 'y' },
            ],
          },
        }),
        campaign('1', '-5'),
      ],
      { groupBy: ['tag'] },
    );
    expect(
      result.groups.map((group) => [group.key, group.summary.metrics.netPnl.value, group.additive]),
    ).toEqual([
      ['unknown', '-5', false],
      ['value:x', '10', false],
      ['value:y', '10', false],
    ]);
    expect(result.groups.find((group) => group.key === 'value:x')!.summary.counts.selected).toBe(1);
    expect(result.summary.metrics.netPnl.value).toBe('5');
  });
  it('keeps grouping deterministic when a stable identity has multiple historical labels', () => {
    const records = [
      campaign('0', '10', {
        dimensions: {
          asset: [
            { key: 'instrument', label: 'Former symbol' },
            { key: 'instrument', label: 'Current symbol' },
          ],
        },
      }),
      campaign('1', '-5', {
        dimensions: { asset: [{ key: 'instrument', label: 'Current symbol' }] },
      }),
    ];
    const result = analyze(records, { groupBy: ['asset'] });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      key: 'value:instrument',
      label: 'Current symbol',
      memberKeys: ['instrument'],
    });
    expect(result.groups[0]!.summary.metrics.netPnl.value).toBe('5');
    const reordered = records.map((record) => ({
      ...record,
      dimensions: { asset: [...record.dimensions.asset!].reverse() },
    }));
    expect(analyze(reordered.reverse(), { groupBy: ['asset'] })).toEqual(result);
  });
  it('provides unknown buckets for all fourteen requested dimensions without dropping campaigns', () => {
    const result = analyze([campaign('0', '10')], { groupBy: ANALYTICS_DIMENSIONS });
    expect(result.groups).toHaveLength(14);
    for (const group of result.groups) expect(group.summary.metrics.netPnl.value).toBe('10');
  });
  it('keeps manual keys named mixed/unknown separate from reserved classification buckets', () => {
    const result = analyze(
      [
        campaign('0', '1', { dimensions: { tag: [{ key: 'unknown', label: 'unknown' }] } }),
        campaign('1', '2'),
      ],
      { groupBy: ['tag'] },
    );
    expect(result.groups.map((group) => group.key)).toEqual(['unknown', 'value:unknown']);
  });
  it('rejects excessive grouping before running summaries instead of truncating values', () => {
    const records = Array.from({ length: 6 }, (_, index) =>
      campaign(String(index), '1', {
        dimensions: {
          tag: Array.from({ length: 100 }, (_, label) => ({
            key: `${index}:${label}`,
            label: `${index}:${label}`,
          })),
        },
      }),
    );
    expect(() => analyze(records, { groupBy: ['tag'] })).toThrow('500-group limit');
  });
  it('rejects duplicated campaigns, dimensions, unsupported dimensions and oversized populations', () => {
    expect(() => analyze([campaign('0', '1'), campaign('0', '2')])).toThrow(
      FinancialArithmeticError,
    );
    expect(() => analyze([], { groupBy: ['tag', 'tag'] })).toThrow(FinancialArithmeticError);
    expect(() => analyze([], { groupBy: ['invalid' as never] })).toThrow(FinancialArithmeticError);
    expect(() =>
      analyze(Array.from({ length: 1001 }, (_, index) => campaign(String(index), '1'))),
    ).toThrow(FinancialArithmeticError);
    expect(() => analyze([], { from: asOf })).toThrow(FinancialArithmeticError);
  });
});
