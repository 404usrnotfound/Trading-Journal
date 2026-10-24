import { decimalValue, quantizeDecimal, FinancialArithmeticError } from './decimal.js';
import { instantNanoseconds } from './valuation.js';

export type AccountPerformancePoint = Readonly<{
  at: string;
  nav: string | null;
  capitalFlow: string | null;
  reasons: readonly string[];
}>;
type ReturnMetric = { state: 'available' | 'unavailable'; value: string | null; reasons: string[] };
const unavailable = (...reasons: string[]): ReturnMetric => ({
  state: 'unavailable',
  value: null,
  reasons: [...new Set(reasons)],
});
const available = (value: string): ReturnMetric => ({ state: 'available', value, reasons: [] });
const yearNanoseconds = 365n * 86_400n * 1_000_000_000n;

/** Monetary operands remain decimals. Only economic instants determine ACT/365 exponents. */
function solveMoneyWeighted(points: readonly AccountPerformancePoint[]): ReturnMetric {
  if (
    points[0]!.nav === null ||
    points.at(-1)!.nav === null ||
    points.some((point) => point.capitalFlow === null)
  )
    return unavailable('incomplete_valuation_or_capital_flow');
  const first = points[0]!;
  const last = points.at(-1)!;
  const opening = decimalValue(first.nav);
  if (!opening.gt(0)) return unavailable('nonpositive_opening_capital');
  const origin = instantNanoseconds(first.at);
  const cash = new Map<bigint, ReturnType<typeof decimalValue>>([[origin, opening.negated()]]);
  for (const point of points.slice(1)) {
    const instant = instantNanoseconds(point.at);
    cash.set(
      instant,
      (cash.get(instant) ?? decimalValue('0')).minus(decimalValue(point.capitalFlow)),
    );
  }
  const end = instantNanoseconds(last.at);
  cash.set(end, (cash.get(end) ?? decimalValue('0')).plus(decimalValue(last.nav)));
  const flows = [...cash.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .filter(([, amount]) => !amount.isZero());
  let changes = 0;
  for (let index = 1; index < flows.length; index++)
    if (flows[index - 1]![1].isPositive() !== flows[index]![1].isPositive()) changes++;
  // One sign change proves a unique positive discount factor. Do not pick an arbitrary root.
  if (changes !== 1)
    return unavailable(
      changes > 1 ? 'mwr_root_uniqueness_not_established' : 'mwr_no_valid_solution',
    );
  const annualFlows = flows.map(([at, amount]) => ({
    amount,
    years: decimalValue((at - origin).toString()).div(yearNanoseconds.toString()),
  }));
  const npv = (logGrowth: ReturnType<typeof decimalValue>) =>
    annualFlows.reduce(
      (sum, flow) => sum.plus(flow.amount.times(logGrowth.times(flow.years).negated().exp())),
      decimalValue('0'),
    );
  let low = decimalValue('-80');
  let high = decimalValue('80');
  const lowValue = npv(low);
  const highValue = npv(high);
  if (lowValue.isPositive() === highValue.isPositive())
    return unavailable('mwr_solution_outside_supported_range');
  for (let iteration = 0; iteration < 256; iteration++) {
    const middle = low.plus(high).div(2);
    const value = npv(middle);
    if (value.isZero()) {
      low = middle;
      high = middle;
      break;
    }
    if (value.isPositive() === lowValue.isPositive()) low = middle;
    else high = middle;
  }
  const logGrowth = low.plus(high).div(2);
  const residual = npv(logGrowth).abs();
  const scale = annualFlows.reduce((sum, flow) => sum.plus(flow.amount.abs()), decimalValue('0'));
  if (residual.gt(scale.times('0.000000000000000000000001')))
    return unavailable('mwr_solver_did_not_converge');
  return available(quantizeDecimal(logGrowth.exp().minus(1)));
}

function moneyWeighted(points: readonly AccountPerformancePoint[]): ReturnMetric {
  try {
    return solveMoneyWeighted(points);
  } catch (error) {
    if (!(error instanceof FinancialArithmeticError)) throw error;
    return unavailable('numeric_overflow');
  }
}

/** Every capital flow must be represented exactly once at a post-flow NAV checkpoint. */
function performance(points: readonly AccountPerformancePoint[]) {
  if (points.length < 2 || points.length > 33)
    throw new Error('Account performance requires two to thirty-three bounded checkpoints.');
  for (let index = 1; index < points.length; index++)
    if (instantNanoseconds(points[index]!.at) <= instantNanoseconds(points[index - 1]!.at))
      throw new Error('Account performance checkpoints must be strictly increasing.');
  let index = decimalValue('100');
  let peak = index;
  let maximum = decimalValue('0');
  let blocked = points[0]!.nav === null || points[0]!.reasons.length > 0;
  let reasons: string[] = blocked ? ['incomplete_valuation_or_capital_flow'] : [];
  if (!blocked && !decimalValue(points[0]!.nav).gt(0)) {
    blocked = true;
    reasons = ['nonpositive_opening_capital'];
  }
  let underwaterAt: bigint | null = null;
  let longest = 0n;
  const series = points.map((point, position) => {
    if (position > 0 && !blocked) {
      const previous = points[position - 1]!;
      if (
        point.nav === null ||
        point.capitalFlow === null ||
        point.reasons.length ||
        previous.nav === null
      ) {
        blocked = true;
        reasons = ['incomplete_valuation_or_capital_flow'];
      } else {
        const base = decimalValue(previous.nav);
        const preFlow = decimalValue(point.nav).minus(decimalValue(point.capitalFlow));
        if (!base.gt(0) || !preFlow.gt(0)) {
          blocked = true;
          reasons = ['nonpositive_subperiod_capital'];
        } else index = index.times(preFlow.div(base));
      }
    }
    if (blocked)
      return {
        ...point,
        reasons: [...new Set([...point.reasons, ...reasons])],
        unitIndex: null,
        drawdown: null,
      };
    const at = instantNanoseconds(point.at);
    if (index.gte(peak)) {
      if (underwaterAt !== null) {
        const duration = at - underwaterAt;
        if (duration > longest) longest = duration;
      }
      peak = index;
      underwaterAt = null;
    } else if (underwaterAt === null)
      underwaterAt = instantNanoseconds(points[Math.max(0, position - 1)]!.at);
    const drawdown = index.div(peak).minus(1);
    if (drawdown.lt(maximum)) maximum = drawdown;
    return {
      ...point,
      reasons: [],
      unitIndex: quantizeDecimal(index),
      drawdown: quantizeDecimal(drawdown),
    };
  });
  return {
    twr: blocked ? unavailable(...reasons) : available(quantizeDecimal(index.div(100).minus(1))),
    mwr: moneyWeighted(points),
    maximumDrawdown: blocked ? unavailable(...reasons) : available(quantizeDecimal(maximum)),
    // Null distinguishes an unrecovered drawdown from an observed completed recovery duration.
    recoveryDurationMilliseconds:
      blocked || underwaterAt !== null ? null : (longest / 1_000_000n).toString(),
    series,
  };
}

/** Output-envelope overflow is unavailable evidence, never a fabricated finite result or HTTP 500. */
export function calculateAccountPerformance(
  points: readonly AccountPerformancePoint[],
): ReturnType<typeof performance> {
  try {
    return performance(points);
  } catch (error) {
    if (!(error instanceof FinancialArithmeticError)) throw error;
    return {
      twr: unavailable('numeric_overflow'),
      mwr: unavailable('numeric_overflow'),
      maximumDrawdown: unavailable('numeric_overflow'),
      recoveryDurationMilliseconds: null,
      series: points.map((point) => ({
        ...point,
        reasons: [...new Set([...point.reasons, 'numeric_overflow'])],
        unitIndex: null,
        drawdown: null,
      })),
    };
  }
}
