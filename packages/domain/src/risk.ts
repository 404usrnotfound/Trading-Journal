import { decimal, decimalValue, quantizeDecimal } from './decimal.js';
import type {
  RiskFact,
  RiskLimit,
  RiskLimitAssessment,
  RiskSizingInput,
  RiskSizingResult,
} from './risk-types.js';

/** Every applicable restriction is evaluated: a strategy can never erase an account breach. */
export function assessRiskLimit(
  policyVersionId: string,
  limit: RiskLimit,
  fact: RiskFact,
): RiskLimitAssessment {
  const unit =
    limit.kind === 'positions'
      ? 'count'
      : limit.kind === 'overnight' || limit.kind === 'prohibited'
        ? 'boolean'
        : limit.kind === 'concentration' ||
            (limit.kind === 'trade-risk' && limit.measure === 'equity-ratio') ||
            (limit.kind === 'exposure' && limit.denominator === 'equity')
          ? 'ratio'
          : 'money';
  const currencyId = unit === 'money' && 'currencyId' in limit ? limit.currencyId : null;
  if (
    fact.value === null ||
    fact.reasons.length ||
    fact.unit !== unit ||
    fact.currencyId !== currencyId
  ) {
    return {
      policyVersionId,
      limit,
      fact,
      state: 'unknown',
      explanation:
        fact.reasons.join('; ') ||
        'Missing compatible evidence. Review the units, currency and source coverage.',
    };
  }
  const threshold = 'maximum' in limit ? String(limit.maximum) : '0';
  const breached = decimalValue(fact.value).gt(threshold);
  return {
    policyVersionId,
    limit,
    fact,
    state: breached ? 'breached' : 'passed',
    explanation: breached
      ? `Observed ${fact.value} exceeds configured maximum ${threshold}. Reduce proposed risk/exposure or review the activity and policy.`
      : `Observed ${fact.value} is within configured maximum ${threshold}.`,
  };
}

export function riskAssessmentState(
  results: readonly RiskLimitAssessment[],
): 'passed' | 'breached' | 'unknown' | 'unconfigured' {
  return results.some((item) => item.state === 'breached')
    ? 'breached'
    : results.some((item) => item.state === 'unknown')
      ? 'unknown'
      : results.length
        ? 'passed'
        : 'unconfigured';
}

/** Greatest lot increment fitting a verified linear stop scenario; no monetary Number arithmetic. */
export function sizeLinearRisk(input: RiskSizingInput): RiskSizingResult {
  const base = { budget: decimal(input.budget), currencyId: input.currencyId };
  const unknown = (reason: string): RiskSizingResult => ({
    ...base,
    state: 'unknown',
    quantity: null,
    plannedRisk: null,
    riskPerUnit: null,
    reasons: [reason],
  });
  if (!input.nativeLinear) return unknown('unsupported_linear_sizing_use_explicit_manual_risk');
  const budget = decimalValue(input.budget),
    multiplier = decimalValue(input.multiplier),
    increment = decimalValue(input.quantityIncrement),
    rate = decimalValue(input.quoteToRiskRate);
  const fixed = decimalValue(input.fixedCosts),
    variable = decimalValue(input.perUnitCosts);
  if (
    !budget.gt(0) ||
    !multiplier.gt(0) ||
    !increment.gt(0) ||
    !rate.gt(0) ||
    fixed.isNegative() ||
    variable.isNegative()
  )
    return unknown('invalid_positive_budget_units_or_costs');
  const distance =
    input.side === 'long'
      ? decimalValue(input.entry).minus(input.stop)
      : decimalValue(input.stop).minus(input.entry);
  if (!distance.gt(0)) return unknown('stop_must_be_on_adverse_side_of_entry');
  const riskPerUnit = distance.times(multiplier).times(rate).plus(variable);
  if (quantizeDecimal(riskPerUnit) === '0')
    return unknown('risk_per_unit_below_supported_decimal_quantum');
  if (fixed.gte(budget))
    return {
      ...base,
      state: 'available',
      quantity: '0',
      plannedRisk: '0',
      riskPerUnit: quantizeDecimal(riskPerUnit),
      reasons: ['budget_cannot_fund_a_positive_quantity'],
    };
  const quantity = budget.minus(fixed).div(riskPerUnit).div(increment).floor().times(increment);
  // The multiplication uses the unrounded intermediate; rounding can never create another lot.
  const plannedRisk = quantity.isZero()
    ? decimalValue('0')
    : quantity.times(riskPerUnit).plus(fixed);
  return {
    ...base,
    state: 'available',
    quantity: quantizeDecimal(quantity),
    plannedRisk: quantizeDecimal(plannedRisk),
    riskPerUnit: quantizeDecimal(riskPerUnit),
    reasons: quantity.isZero() ? ['budget_cannot_fund_a_positive_quantity'] : [],
  };
}

function dateParts(at: Date, timezone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}
/** Local calendar boundary with DST support. A nonexistent/ambiguous boundary stays unknown. */
export function riskLocalBoundary(day: string, timezone: string, hour = 0): string | null {
  const [year, month, date] = day.split('-').map(Number);
  const desired = Date.UTC(year!, month! - 1, date!, hour);
  let candidate = desired;
  for (let index = 0; index < 5; index++) {
    const p = dateParts(new Date(candidate), timezone);
    const actual = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
    const next = candidate + desired - actual;
    if (next === candidate) break;
    candidate = next;
  }
  const p = dateParts(new Date(candidate), timezone);
  if (Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) !== desired)
    return null;
  // DST folds can have two instants for the configured wall time.
  for (const shift of [-3_600_000, 3_600_000]) {
    const other = dateParts(new Date(candidate + shift), timezone);
    if (
      Date.UTC(
        other.year!,
        other.month! - 1,
        other.day!,
        other.hour!,
        other.minute!,
        other.second!,
      ) === desired
    )
      return null;
  }
  return new Date(candidate).toISOString();
}
export function riskPeriodStart(asOf: string, timezone: string, weekly: boolean): string | null {
  const p = dateParts(new Date(asOf), timezone);
  const day = new Date(Date.UTC(p.year!, p.month! - 1, p.day!));
  if (weekly) day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return riskLocalBoundary(day.toISOString().slice(0, 10), timezone);
}
export function riskCrossesBoundary(
  from: string,
  to: string,
  timezone: string,
  hour: number,
): boolean | null {
  if (new Date(to).getTime() < new Date(from).getTime()) return null;
  const p = dateParts(new Date(from), timezone);
  const day = new Date(Date.UTC(p.year!, p.month! - 1, p.day!));
  let boundary = riskLocalBoundary(day.toISOString().slice(0, 10), timezone, hour);
  if (!boundary) return null;
  if (new Date(boundary).getTime() <= new Date(from).getTime()) {
    day.setUTCDate(day.getUTCDate() + 1);
    boundary = riskLocalBoundary(day.toISOString().slice(0, 10), timezone, hour);
  }
  return boundary === null ? null : new Date(boundary).getTime() <= new Date(to).getTime();
}
