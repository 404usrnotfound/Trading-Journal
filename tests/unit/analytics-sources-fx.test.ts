import { describe, expect, it } from 'vitest';
import { selectFxRate, type FxObservation, type FxSelectionPolicy } from '@journal/domain';
import { createAnalyticsFxSelector } from '../../packages/server/src/analytics/fx.js';

const policy: FxSelectionPolicy = {
  id: 'analytics-index-equivalence/1',
  maxAgeMilliseconds: 30000,
  sourcePriority: ['trusted', 'secondary'],
};
function observation(id: string, overrides: Partial<FxObservation> = {}): FxObservation {
  return {
    id,
    baseCurrencyId: 'USD',
    quoteCurrencyId: 'EUR',
    rate: '0.8',
    observedAt: '2025-01-01T00:00:00.000001Z',
    source: 'trusted',
    ...overrides,
  };
}

describe('bounded analytics FX index preserves canonical selection', () => {
  it('matches complete dense histories for direct/inverse routes, priorities and temporal cutoffs', () => {
    const history = Array.from({ length: 10000 }, (_, index) =>
      observation(`dense-${String(index).padStart(5, '0')}`, {
        baseCurrencyId: index % 2 ? 'EUR' : 'USD',
        quoteCurrencyId: index % 2 ? 'USD' : 'EUR',
        rate: `1.${String(index).padStart(5, '0')}`,
        source: index % 3 ? 'trusted' : 'secondary',
        observedAt: new Date(Date.UTC(2025, 0, 1) + index * 1000).toISOString(),
      }),
    );
    for (const sourcePriority of [
      ['trusted', 'secondary'],
      ['secondary', 'trusted'],
    ] as const) {
      const selectedPolicy = { ...policy, sourcePriority };
      const indexed = createAnalyticsFxSelector([...history].reverse(), selectedPolicy);
      for (const at of [
        '2024-12-31T23:59:59Z',
        '2025-01-01T00:00:02.000001Z',
        '2025-01-01T01:00:00Z',
        '2025-01-01T02:47:10Z',
      ])
        for (const [base, quote] of [
          ['USD', 'EUR'],
          ['EUR', 'USD'],
          ['USD', 'USD'],
          ['JPY', 'EUR'],
        ] as const)
          expect(indexed(base, quote, at)).toEqual(
            selectFxRate(base, quote, at, selectedPolicy, history),
          );
    }
  });

  it('selects the lexical first ID at an exactly tied observation instant independently of input order', () => {
    const rows = [observation('z-last', { rate: '0.9' }), observation('a-first', { rate: '0.7' })];
    const at = '2025-01-01T00:00:00.000001Z';
    expect(createAnalyticsFxSelector(rows, policy)('USD', 'EUR', at)).toEqual(
      selectFxRate('USD', 'EUR', at, policy, rows),
    );
    expect(createAnalyticsFxSelector([...rows].reverse(), policy)('USD', 'EUR', at)).toMatchObject({
      state: 'available',
      value: { rate: '0.7', observationIds: ['a-first'] },
    });
  });

  it('retains stale past evidence while omitting future-only observations', () => {
    const at = '2025-01-01T00:01:00Z';
    const stale = [
      observation('old'),
      observation('future', { observedAt: '2025-01-01T00:02:00Z' }),
    ];
    expect(createAnalyticsFxSelector(stale, policy)('USD', 'EUR', at)).toEqual(
      selectFxRate('USD', 'EUR', at, policy, stale),
    );
    expect(createAnalyticsFxSelector(stale, policy)('USD', 'EUR', at)).toMatchObject({
      state: 'unavailable',
      reasons: ['stale_fx'],
    });
    const future = [stale[1]!];
    expect(createAnalyticsFxSelector(future, policy)('USD', 'EUR', at)).toEqual(
      selectFxRate('USD', 'EUR', at, policy, future),
    );
    expect(createAnalyticsFxSelector(future, policy)('USD', 'EUR', at)).toMatchObject({
      state: 'unavailable',
      reasons: ['missing_fx'],
    });
  });

  it('allows a fresh secondary source when the primary source is stale and preserves inverse arithmetic', () => {
    const at = '2025-01-01T00:01:00Z';
    const rows = [
      observation('stale-primary'),
      observation('fresh-inverse', {
        baseCurrencyId: 'EUR',
        quoteCurrencyId: 'USD',
        rate: '1.25',
        source: 'secondary',
        observedAt: at,
      }),
    ];
    expect(createAnalyticsFxSelector(rows, policy)('USD', 'EUR', at)).toEqual(
      selectFxRate('USD', 'EUR', at, policy, rows),
    );
    expect(createAnalyticsFxSelector(rows, policy)('USD', 'EUR', at)).toMatchObject({
      state: 'available',
      value: { rate: '0.8', route: 'inverse', observationIds: ['fresh-inverse'] },
    });
  });

  it('retains nanosecond chronology and the exact freshness boundary', () => {
    const rows = [observation('nano', { observedAt: '2025-01-01T00:00:00.000000001Z' })];
    const exact = { ...policy, maxAgeMilliseconds: 0 };
    const indexed = createAnalyticsFxSelector(rows, exact);
    for (const at of [
      '2025-01-01T00:00:00.000000000Z',
      '2025-01-01T00:00:00.000000001Z',
      '2025-01-01T00:00:00.000000002Z',
    ])
      expect(indexed('USD', 'EUR', at)).toEqual(selectFxRate('USD', 'EUR', at, exact, rows));
  });

  it('covers all 64 configured sources without dropping direct or inverse candidates', () => {
    const sourcePriority = Array.from({ length: 64 }, (_, index) => `source-${index}`);
    const selectedPolicy = { ...policy, sourcePriority };
    const rows = sourcePriority.flatMap((source, index) => [
      observation(`direct-${index}`, { source }),
      observation(`inverse-${index}`, {
        source,
        baseCurrencyId: 'EUR',
        quoteCurrencyId: 'USD',
        rate: '1.25',
      }),
    ]);
    const at = '2025-01-01T00:00:00.000001Z';
    expect(createAnalyticsFxSelector(rows, selectedPolicy)('USD', 'EUR', at)).toEqual(
      selectFxRate('USD', 'EUR', at, selectedPolicy, rows),
    );
  });

  it('validates bounded immutable evidence and policy before building an index', () => {
    expect(() =>
      createAnalyticsFxSelector([observation('same'), observation('same')], policy),
    ).toThrow();
    expect(() =>
      createAnalyticsFxSelector([observation('invalid', { rate: '0' })], policy),
    ).toThrow();
    expect(() =>
      createAnalyticsFxSelector([], { ...policy, sourcePriority: ['trusted', 'trusted'] }),
    ).toThrow();
    expect(() => createAnalyticsFxSelector([], { ...policy, maxAgeMilliseconds: -1 })).toThrow();
    expect(() =>
      createAnalyticsFxSelector(
        Array.from({ length: 10001 }, (_, index) => observation(`over-${index}`)),
        policy,
      ),
    ).toThrow();
    expect(() =>
      createAnalyticsFxSelector([], {
        ...policy,
        sourcePriority: Array.from({ length: 65 }, (_, index) => `source-${index}`),
      }),
    ).toThrow();
  });
});
