import { expect, it } from 'vitest';
import {
  calculateAnalytics,
  type AnalyticsCampaign,
  type AnalyticsSourceMetric,
} from '../../packages/domain/src/index.js';

const known = (value: string): AnalyticsSourceMetric => ({
  state: 'available',
  value,
  reasons: [],
  missingReferences: [],
});
function fixedCents(value: bigint) {
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`;
}
/** Independent integer rational oracle, including scale-36 half-even ties. */
function rational(numerator: bigint, denominator: bigint) {
  const scale = 10n ** 36n;
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const scaled = magnitude * scale;
  let quotient = scaled / denominator;
  const remainder = scaled % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n !== 0n))
    quotient += 1n;
  const fraction = (quotient % scale).toString().padStart(36, '0').replace(/0+$/u, '');
  return `${negative && quotient !== 0n ? '-' : ''}${quotient / scale}${fraction ? `.${fraction}` : ''}`;
}
function record(
  index: number,
  cents: bigint,
  overrides: Partial<AnalyticsCampaign> = {},
): AnalyticsCampaign {
  const value = fixedCents(cents);
  return {
    id: index.toString().padStart(2, '0'),
    status: 'completed',
    entryAt: '2026-01-01T00:00:00.000001Z',
    closedAt: `2026-01-${String(index + 2).padStart(2, '0')}T00:00:00.000001Z`,
    grossPnl: known(value),
    netPnl: known(value),
    realizedPnl: known(value),
    unrealizedPnl: known('0'),
    fees: known('0'),
    rMultiple: known(value),
    dimensions: { account: [{ key: `account-${index % 3}`, label: `Account ${index % 3}` }] },
    exclusionReasons: [],
    ...overrides,
  };
}
let state = 804_172;
function nextInteger() {
  state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  return state;
}

it(
  'proves exact totals, rates, means, drawdown and group conservation against 200 seeded BigInt models',
  { timeout: 60_000 },
  () => {
    state = 804_172;
    for (let trial = 0; trial < 200; trial += 1) {
      const count = 1 + (nextInteger() % 20);
      const cents = Array.from({ length: count }, () => BigInt(nextInteger() % 20_001) - 10_000n);
      const records = cents.map((value, index) => record(index, value));
      const input = {
        campaigns: records,
        reportingCurrencyId: 'USD',
        from: '2026-01-01T00:00:00.000000Z',
        asOf: '2026-02-01T00:00:00.000000Z',
        groupBy: ['account'] as const,
      };
      const result = calculateAnalytics(input);
      const metrics = result.summary.metrics;
      const total = cents.reduce((sum, value) => sum + value, 0n);
      const wins = cents.filter((value) => value > 0n);
      const losses = cents.filter((value) => value < 0n);
      expect(metrics.netPnl.value).toBe(rational(total, 100n));
      expect(metrics.expectancy.value).toBe(rational(total, BigInt(count) * 100n));
      expect(metrics.winRate.value).toBe(rational(BigInt(wins.length), BigInt(count)));
      expect(metrics.lossRate.value).toBe(rational(BigInt(losses.length), BigInt(count)));
      expect(metrics.averageR.value).toBe(rational(total, BigInt(count) * 100n));
      expect(metrics.cumulativeR.value).toBe(rational(total, 100n));
      if (wins.length)
        expect(metrics.averageWinner.value).toBe(
          rational(
            wins.reduce((sum, value) => sum + value, 0n),
            BigInt(wins.length) * 100n,
          ),
        );
      if (losses.length) {
        const lossMagnitude = -losses.reduce((sum, value) => sum + value, 0n);
        expect(metrics.averageLoser.value).toBe(
          rational(lossMagnitude, BigInt(losses.length) * 100n),
        );
        expect(metrics.profitFactor.value).toBe(
          rational(
            wins.reduce((sum, value) => sum + value, 0n),
            lossMagnitude,
          ),
        );
        if (wins.length)
          expect(metrics.payoffRatio.value).toBe(
            rational(
              wins.reduce((sum, value) => sum + value, 0n) * BigInt(losses.length),
              lossMagnitude * BigInt(wins.length),
            ),
          );
      }
      let cumulative = 0n;
      let peak = 0n;
      let maximum = 0n;
      let current = 0n;
      let currentWins = 0;
      let currentLosses = 0;
      let longestWins = 0;
      let longestLosses = 0;
      for (const value of cents) {
        cumulative += value;
        if (cumulative > peak) peak = cumulative;
        current = peak - cumulative;
        if (current > maximum) maximum = current;
        currentWins = value > 0n ? currentWins + 1 : 0;
        currentLosses = value < 0n ? currentLosses + 1 : 0;
        longestWins = Math.max(longestWins, currentWins);
        longestLosses = Math.max(longestLosses, currentLosses);
      }
      expect(metrics.maximumDrawdown.value).toBe(rational(maximum, 100n));
      expect(metrics.currentDrawdown.value).toBe(rational(current, 100n));
      expect(metrics.currentWinStreak.value).toBe(String(currentWins));
      expect(metrics.currentLossStreak.value).toBe(String(currentLosses));
      expect(metrics.longestWinStreak.value).toBe(String(longestWins));
      expect(metrics.longestLossStreak.value).toBe(String(longestLosses));
      expect(result.groups.reduce((sum, group) => sum + group.summary.counts.selected, 0)).toBe(
        count,
      );
      for (const group of result.groups) {
        const selected = records
          .map((candidate, index) => ({ candidate, cents: cents[index]! }))
          .filter(({ candidate }) =>
            group.memberKeys.includes(candidate.dimensions.account![0]!.key),
          );
        expect(group.summary.metrics.netPnl.value).toBe(
          rational(
            selected.reduce((sum, item) => sum + item.cents, 0n),
            100n,
          ),
        );
      }
      expect(calculateAnalytics({ ...input, campaigns: [...records].reverse() })).toEqual(result);
    }
  },
);

it('preserves signed costs and eligible-only R against 100 independent integer models', () => {
  state = 97_433;
  for (let trial = 0; trial < 100; trial += 1) {
    const cents = Array.from({ length: 10 }, () => BigInt(nextInteger() % 20_001) - 10_000n);
    const fees = Array.from({ length: 10 }, () => BigInt(nextInteger() % 101) - 50n);
    const campaigns = cents.map((value, index) =>
      record(index, value, {
        grossPnl: known(fixedCents(value + fees[index]!)),
        fees: known(fixedCents(fees[index]!)),
        rMultiple:
          index % 3 === 0
            ? {
                state: 'unavailable',
                value: null,
                reasons: ['missing_original_risk'],
                missingReferences: [`risk:${index}`],
              }
            : known(fixedCents(value)),
      }),
    );
    const result = calculateAnalytics({
      campaigns,
      reportingCurrencyId: 'USD',
      from: '2026-01-01T00:00:00.000000Z',
      asOf: '2026-02-01T00:00:00.000000Z',
    });
    const totalNet = cents.reduce((sum, value) => sum + value, 0n);
    const totalFees = fees.reduce((sum, value) => sum + value, 0n);
    const validR = cents.filter((_, index) => index % 3 !== 0);
    const totalR = validR.reduce((sum, value) => sum + value, 0n);
    expect(result.summary.metrics.grossPnl.value).toBe(rational(totalNet + totalFees, 100n));
    expect(result.summary.metrics.netPnl.value).toBe(rational(totalNet, 100n));
    expect(result.summary.metrics.fees.value).toBe(rational(totalFees, 100n));
    expect(result.summary.metrics.cumulativeR).toMatchObject({
      state: 'available',
      value: rational(totalR, 100n),
      sampleSize: validR.length,
      eligibleIds: ['01', '02', '04', '05', '07', '08'],
      excludedIds: ['00', '03', '06', '09'],
      reasons: ['missing_original_risk'],
    });
    expect(result.summary.metrics.averageR.value).toBe(
      rational(totalR, BigInt(validR.length) * 100n),
    );
    expect(result.summary.metrics.expectancyR.value).toBe(result.summary.metrics.averageR.value);
    expect(result.summary.counts.eligibleOutcomes).toBe(cents.length);
    expect(result.summary.counts.eligibleR).toBe(validR.length);
  }
});

it('keeps complete + open monetary conservation while excluding open outcomes across 100 seeded models', () => {
  state = 71_299;
  for (let trial = 0; trial < 100; trial += 1) {
    const cents = Array.from({ length: 10 }, () => BigInt(nextInteger() % 20_001) - 10_000n);
    const campaigns = cents.map((value, index) =>
      record(index, value, index % 2 ? { status: 'open', closedAt: null } : {}),
    );
    const result = calculateAnalytics({
      campaigns,
      reportingCurrencyId: 'EUR',
      from: '2026-01-01T00:00:00.000000Z',
      asOf: '2026-02-01T00:00:00.000000Z',
    });
    const closed = cents.filter((_, index) => index % 2 === 0);
    const open = cents.filter((_, index) => index % 2 === 1);
    expect(result.summary.metrics.netPnl.value).toBe(
      rational(
        cents.reduce((sum, value) => sum + value, 0n),
        100n,
      ),
    );
    expect(result.completedOnly.metrics.netPnl.value).toBe(
      rational(
        closed.reduce((sum, value) => sum + value, 0n),
        100n,
      ),
    );
    expect(result.openOnly.metrics.netPnl.value).toBe(
      rational(
        open.reduce((sum, value) => sum + value, 0n),
        100n,
      ),
    );
    expect(result.summary.metrics.expectancy.value).toBe(
      rational(
        closed.reduce((sum, value) => sum + value, 0n),
        500n,
      ),
    );
    expect(result.summary.counts.eligibleOutcomes).toBe(5);
    expect(result.summary.counts.eligibleR).toBe(5);
    expect(result.summary.metrics.netPnl.currencyId).toBe('EUR');
    expect(result.summary.metrics.averageR.currencyId).toBeNull();
  }
});
