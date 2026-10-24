import {
  decimal,
  decimalValue,
  FINANCIAL_CALCULATION_MANIFEST,
  FinancialArithmeticError,
  quantizeDecimal,
} from './decimal.js';
import { positiveDecimal } from './money.js';
import type { CurrencyAmount } from './money.js';
import type { DecimalString } from './index.js';

export type FinancialUnavailableReason =
  | 'missing_fx'
  | 'stale_fx'
  | 'missing_mark'
  | 'stale_mark'
  | 'unknown_basis'
  | 'incomplete_cash'
  | 'incomplete_inventory'
  | 'incompatible_currency'
  | 'numeric_overflow'
  | 'unsupported'
  | 'missing_fees';
export type FinancialResult<T> = Readonly<
  | { state: 'available'; value: T }
  | {
      state: 'unavailable';
      reasons: readonly FinancialUnavailableReason[];
      missingReferences: readonly string[];
    }
>;
export type FxObservation = Readonly<{
  id: string;
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate: string;
  observedAt: string;
  source: string;
}>;
export type FxSelectionPolicy = Readonly<{
  id: string;
  maxAgeMilliseconds: number;
  sourcePriority: readonly string[];
}>;
export type ReviewedFxOverride = Readonly<{
  contextId: string;
  requestedAt: string;
  observation: FxObservation;
  allowStale: boolean;
}>;
export type SelectedFxRate = Readonly<{
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate: DecimalString;
  requestedAt: string;
  observationIds: readonly string[];
  route: 'identity' | 'direct' | 'inverse' | 'manual-direct' | 'manual-inverse';
  policyId: string;
  reviewedContextId?: string;
}>;
export type FxRateSelection = FinancialResult<SelectedFxRate>;

/** Preserve nanosecond source ordering. Date is used only for whole-second calendar validation. */
export function instantNanoseconds(input: string): bigint {
  const matched = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(input);
  if (!matched?.[1])
    throw new FinancialArithmeticError('invalid_decimal', 'Expected an unambiguous UTC instant.');
  const secondText = `${matched[1]}Z`;
  const milliseconds = Date.parse(secondText);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 19) !== matched[1]
  )
    throw new FinancialArithmeticError('invalid_decimal', 'Invalid calendar instant.');
  return BigInt(milliseconds) * 1_000_000n + BigInt((matched[2] ?? '').padEnd(9, '0'));
}

function unavailable<T>(reason: FinancialUnavailableReason, reference: string): FinancialResult<T> {
  return { state: 'unavailable', reasons: [reason], missingReferences: [reference] };
}

/** Direct then inverse; source priorities/freshness are caller-supplied, with no provider or clock reads. */
export function selectFxRate(
  baseCurrencyId: string,
  quoteCurrencyId: string,
  requestedAt: string,
  policy: FxSelectionPolicy,
  observations: readonly FxObservation[],
  reviewedOverride?: ReviewedFxOverride,
): FxRateSelection {
  const requested = instantNanoseconds(requestedAt);
  if (
    !baseCurrencyId ||
    !quoteCurrencyId ||
    !policy.id ||
    !Number.isSafeInteger(policy.maxAgeMilliseconds) ||
    policy.maxAgeMilliseconds < 0 ||
    new Set(policy.sourcePriority).size !== policy.sourcePriority.length
  )
    throw new FinancialArithmeticError('invalid_decimal', 'Invalid explicit FX context.');
  if (baseCurrencyId === quoteCurrencyId)
    return {
      state: 'available',
      value: {
        baseCurrencyId,
        quoteCurrencyId,
        rate: decimal('1'),
        requestedAt,
        observationIds: [],
        route: 'identity',
        policyId: policy.id,
      },
    };
  if (observations.length > 10_000)
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'FX observation population exceeds the bounded selector.',
    );
  const ages = BigInt(policy.maxAgeMilliseconds) * 1_000_000n;
  if (reviewedOverride) {
    const observation = reviewedOverride.observation;
    const observed = instantNanoseconds(observation.observedAt);
    if (
      !reviewedOverride.contextId ||
      !observation.id ||
      instantNanoseconds(reviewedOverride.requestedAt) !== requested
    )
      throw new FinancialArithmeticError(
        'invalid_decimal',
        'Reviewed FX override must bind the requested context.',
      );
    const direct =
      observation.baseCurrencyId === baseCurrencyId &&
      observation.quoteCurrencyId === quoteCurrencyId;
    const inverse =
      observation.baseCurrencyId === quoteCurrencyId &&
      observation.quoteCurrencyId === baseCurrencyId;
    if (!direct && !inverse)
      throw new FinancialArithmeticError(
        'invalid_decimal',
        'Reviewed FX override has incompatible monetary units.',
      );
    const sourceRate = positiveDecimal(observation.rate);
    if (observed > requested) return unavailable('missing_fx', observation.id);
    if (!reviewedOverride.allowStale && requested - observed > ages)
      return unavailable('stale_fx', observation.id);
    try {
      const rate = direct
        ? sourceRate
        : quantizeDecimal(decimalValue('1').div(decimalValue(sourceRate)));
      if (decimalValue(rate).isZero()) return unavailable('numeric_overflow', observation.id);
      return {
        state: 'available',
        value: {
          baseCurrencyId,
          quoteCurrencyId,
          rate,
          requestedAt,
          observationIds: [observation.id],
          route: direct ? 'manual-direct' : 'manual-inverse',
          policyId: policy.id,
          reviewedContextId: reviewedOverride.contextId,
        },
      };
    } catch (error) {
      if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow')
        return unavailable('numeric_overflow', observation.id);
      throw error;
    }
  }
  const ids = new Set<string>();
  const relevant: {
    observation: FxObservation;
    instant: bigint;
    priority: number;
    route: 'direct' | 'inverse';
  }[] = [];
  let stale = false;
  for (const observation of observations) {
    if (!observation.id || ids.has(observation.id))
      throw new FinancialArithmeticError(
        'invalid_decimal',
        'FX observations require unique identities.',
      );
    ids.add(observation.id);
    positiveDecimal(observation.rate);
    const instant = instantNanoseconds(observation.observedAt);
    const route =
      observation.baseCurrencyId === baseCurrencyId &&
      observation.quoteCurrencyId === quoteCurrencyId
        ? 'direct'
        : observation.baseCurrencyId === quoteCurrencyId &&
            observation.quoteCurrencyId === baseCurrencyId
          ? 'inverse'
          : undefined;
    const priority = policy.sourcePriority.indexOf(observation.source);
    if (!route || priority < 0 || instant > requested) continue;
    if (requested - instant > ages) {
      stale = true;
      continue;
    }
    relevant.push({ observation, instant, priority, route });
  }
  relevant.sort((a, b) => {
    if (a.route !== b.route) return a.route === 'direct' ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.instant !== b.instant) return a.instant > b.instant ? -1 : 1;
    return a.observation.id < b.observation.id ? -1 : a.observation.id > b.observation.id ? 1 : 0;
  });
  const selected = relevant[0];
  if (!selected)
    return unavailable(
      stale ? 'stale_fx' : 'missing_fx',
      `${baseCurrencyId}->${quoteCurrencyId}@${requestedAt}`,
    );
  let rate: DecimalString;
  try {
    rate =
      selected.route === 'direct'
        ? decimal(selected.observation.rate)
        : quantizeDecimal(decimalValue('1').div(decimalValue(selected.observation.rate)));
  } catch (error) {
    if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow')
      return unavailable('numeric_overflow', selected.observation.id);
    throw error;
  }
  if (decimalValue(rate).isZero()) return unavailable('numeric_overflow', selected.observation.id);
  return {
    state: 'available',
    value: {
      baseCurrencyId,
      quoteCurrencyId,
      rate,
      requestedAt,
      observationIds: [selected.observation.id],
      route: selected.route,
      policyId: policy.id,
    },
  };
}

function rateValue(
  selection: FxRateSelection,
  base: string,
  quote: string,
): ReturnType<typeof decimalValue> | undefined {
  if (selection.state !== 'available') return undefined;
  if (selection.value.baseCurrencyId !== base || selection.value.quoteCurrencyId !== quote)
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'Pinned FX direction does not match monetary units.',
    );
  const rate = positiveDecimal(selection.value.rate);
  if (base === quote && (rate !== '1' || selection.value.route !== 'identity'))
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'Same-currency translation requires explicit identity.',
    );
  if (base !== quote && selection.value.route === 'identity')
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'Different currencies cannot use identity FX.',
    );
  return decimalValue(rate);
}

export function translateAmount(
  amount: Readonly<{ currencyId: string; amount: string }>,
  reportingCurrencyId: string,
  selection: FxRateSelection,
): FinancialResult<CurrencyAmount> {
  const value = decimalValue(amount.amount);
  const rate = rateValue(selection, amount.currencyId, reportingCurrencyId);
  if (!rate) {
    // Zero in a known unit has zero reporting value without a quote. An
    // available context is still validated above, including its direction.
    if (value.isZero() && amount.currencyId.length > 0 && reportingCurrencyId.length > 0)
      return {
        state: 'available',
        value: { currencyId: reportingCurrencyId, amount: decimal('0') },
      };
    return selection.state === 'unavailable'
      ? selection
      : unavailable('missing_fx', amount.currencyId);
  }
  try {
    return {
      state: 'available',
      value: { currencyId: reportingCurrencyId, amount: quantizeDecimal(value.times(rate)) },
    };
  } catch (error) {
    if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow')
      return unavailable('numeric_overflow', amount.currencyId);
    throw error;
  }
}

export type NavComponent = Readonly<{
  id: string;
  kind: 'cash' | 'holding' | 'asset' | 'liability';
  /** A recordable unsupported instrument can legitimately lack monetary conventions. */
  currencyId: string | null;
  amount?: string;
  rate: FxRateSelection;
  /** Missing amounts retain their known coverage reason instead of inferring a mark failure. */
  unavailableReasons?: readonly FinancialUnavailableReason[];
  missingReferences?: readonly string[];
}>;
export type NavInput = Readonly<{
  reportingCurrencyId: string;
  asOf: string;
  sourceRevision: string;
  components: readonly NavComponent[];
}>;
export type NavResult = Readonly<
  | {
      state: 'available';
      value: CurrencyAmount;
      components: readonly (CurrencyAmount & { id: string })[];
      roundingResidual: DecimalString;
      asOf: string;
      sourceRevision: string;
      manifest: typeof FINANCIAL_CALCULATION_MANIFEST;
    }
  | {
      state: 'partial';
      availableSubtotal: CurrencyAmount;
      availableComponents: readonly (CurrencyAmount & { id: string })[];
      missingReferences: readonly string[];
      reasons: readonly FinancialUnavailableReason[];
      asOf: string;
      sourceRevision: string;
      manifest: typeof FINANCIAL_CALCULATION_MANIFEST;
    }
  | {
      state: 'unavailable';
      reasons: readonly FinancialUnavailableReason[];
      missingReferences: readonly string[];
      asOf: string;
      sourceRevision: string;
      manifest: typeof FINANCIAL_CALCULATION_MANIFEST;
    }
>;

/** Gross holdings plus owned cash; source fees are already cash postings and never deducted again. */
export function calculateNav(input: NavInput): NavResult {
  instantNanoseconds(input.asOf);
  if (!input.reportingCurrencyId || !/^\d+$/u.test(input.sourceRevision))
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'NAV requires explicit source and currency context.',
    );
  const metadata = {
    asOf: input.asOf,
    sourceRevision: input.sourceRevision,
    manifest: FINANCIAL_CALCULATION_MANIFEST,
  };
  const ids = new Set<string>();
  const components: (CurrencyAmount & { id: string })[] = [];
  const missingReferences: string[] = [];
  const reasons: FinancialUnavailableReason[] = [];
  let total = decimalValue('0');
  for (const component of input.components) {
    if (!component.id || ids.has(component.id))
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'NAV components require unique identities.',
      );
    ids.add(component.id);
    if (component.amount === undefined) {
      missingReferences.push(component.id, ...(component.missingReferences ?? []));
      reasons.push(
        ...(component.unavailableReasons?.length
          ? component.unavailableReasons
          : ([component.kind === 'cash' ? 'incomplete_cash' : 'missing_mark'] as const)),
      );
      continue;
    }
    if (component.currencyId === null) {
      missingReferences.push(component.id, ...(component.missingReferences ?? []));
      reasons.push('incompatible_currency');
      continue;
    }
    const amount = decimalValue(component.amount);
    if (component.kind === 'liability' && amount.isNegative())
      throw new FinancialArithmeticError(
        'invalid_decimal',
        'Explicit liabilities use a positive magnitude.',
      );
    if (component.rate.state === 'unavailable') {
      // An evidenced zero in a known currency has zero reporting value. Keep
      // unavailable amounts/currencies and nonzero exposure incomplete, and
      // still validate every supplied available FX context below.
      if (amount.isZero() && component.currencyId.length > 0) {
        components.push({
          id: component.id,
          currencyId: input.reportingCurrencyId,
          amount: decimal('0'),
        });
        continue;
      }
      missingReferences.push(component.id, ...component.rate.missingReferences);
      reasons.push(...component.rate.reasons);
      continue;
    }
    if (instantNanoseconds(component.rate.value.requestedAt) !== instantNanoseconds(input.asOf))
      throw new FinancialArithmeticError('invalid_decimal', 'NAV cannot mix valuation instants.');
    const rate = rateValue(component.rate, component.currencyId, input.reportingCurrencyId);
    if (!rate) throw new FinancialArithmeticError('invalid_decimal', 'Invalid NAV FX context.');
    const signed = component.kind === 'liability' ? amount.negated() : amount;
    const working = signed.times(rate);
    try {
      components.push({
        id: component.id,
        currencyId: input.reportingCurrencyId,
        amount: quantizeDecimal(working),
      });
      total = total.plus(working);
    } catch (error) {
      if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow') {
        missingReferences.push(component.id);
        reasons.push('numeric_overflow');
        continue;
      }
      throw error;
    }
  }
  try {
    const amount = quantizeDecimal(total);
    if (missingReferences.length > 0)
      return {
        ...metadata,
        state: 'partial',
        availableSubtotal: { currencyId: input.reportingCurrencyId, amount },
        availableComponents: components,
        missingReferences,
        reasons: [...new Set(reasons)],
      };
    const persistedComponentTotal = components.reduce(
      (sum, component) => sum.plus(decimalValue(component.amount)),
      decimalValue('0'),
    );
    return {
      ...metadata,
      state: 'available',
      value: { currencyId: input.reportingCurrencyId, amount },
      components,
      roundingResidual: quantizeDecimal(decimalValue(amount).minus(persistedComponentTotal)),
    };
  } catch (error) {
    if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow')
      return {
        ...metadata,
        state: 'unavailable',
        reasons: ['numeric_overflow'],
        missingReferences: [input.reportingCurrencyId],
      };
    throw error;
  }
}

export function holdingFx(
  input: Readonly<{
    nativeCurrencyId: string;
    reportingCurrencyId: string;
    signedBasis: string;
    signedValue: string;
    basisRate: FxRateSelection;
    endRate: FxRateSelection;
  }>,
): FinancialResult<
  Readonly<{
    nativeGross: DecimalString;
    reportingTrading: DecimalString;
    holdingFx: DecimalString;
    totalReportingGross: DecimalString;
    roundingResidual: DecimalString;
  }>
> {
  const basis = decimalValue(input.signedBasis);
  const value = decimalValue(input.signedValue);
  const basisRate = rateValue(input.basisRate, input.nativeCurrencyId, input.reportingCurrencyId);
  const endRate = rateValue(input.endRate, input.nativeCurrencyId, input.reportingCurrencyId);
  if (!basisRate || !endRate)
    return unavailable('missing_fx', `${input.nativeCurrencyId}->${input.reportingCurrencyId}`);
  const nativeGrossWorking = value.minus(basis);
  const tradingWorking = nativeGrossWorking.times(endRate);
  const holdingWorking = basis.times(endRate.minus(basisRate));
  const totalWorking = value.times(endRate).minus(basis.times(basisRate));
  try {
    const reportingTrading = quantizeDecimal(tradingWorking);
    const fx = quantizeDecimal(holdingWorking);
    const totalReportingGross = quantizeDecimal(totalWorking);
    return {
      state: 'available',
      value: {
        nativeGross: quantizeDecimal(nativeGrossWorking),
        reportingTrading,
        holdingFx: fx,
        totalReportingGross,
        roundingResidual: quantizeDecimal(
          decimalValue(totalReportingGross)
            .minus(decimalValue(reportingTrading))
            .minus(decimalValue(fx)),
        ),
      },
    };
  } catch (error) {
    if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow')
      return unavailable('numeric_overflow', input.nativeCurrencyId);
    throw error;
  }
}

export type MonetaryFxInput = Readonly<{
  currencyId: string;
  reportingCurrencyId: string;
  startAt: string;
  endAt: string;
  openingBalance: string;
  endingBalance: string;
  openingRate: FxRateSelection;
  endingRate: FxRateSelection;
  movements: readonly Readonly<{
    id: string;
    amount: string;
    economicAt: string;
    rate: FxRateSelection;
  }>[];
  complete: boolean;
}>;

/** Signed movement identity, also valid for separately evidenced owned monetary claims in transit. */
export function cashFx(input: MonetaryFxInput): FinancialResult<CurrencyAmount> {
  const start = instantNanoseconds(input.startAt);
  const end = instantNanoseconds(input.endAt);
  if (end < start)
    throw new FinancialArithmeticError('invalid_decimal', 'Invalid monetary FX interval.');
  if (!input.complete) return unavailable('incomplete_cash', input.currencyId);
  const opening = decimalValue(input.openingBalance);
  const ending = decimalValue(input.endingBalance);
  const openingRate = rateValue(input.openingRate, input.currencyId, input.reportingCurrencyId);
  const endingRate = rateValue(input.endingRate, input.currencyId, input.reportingCurrencyId);
  if (!openingRate || !endingRate) return unavailable('missing_fx', input.currencyId);
  if (
    (input.openingRate.state === 'available' &&
      instantNanoseconds(input.openingRate.value.requestedAt) !== start) ||
    (input.endingRate.state === 'available' &&
      instantNanoseconds(input.endingRate.value.requestedAt) !== end)
  )
    throw new FinancialArithmeticError('invalid_decimal', 'Boundary FX context mismatch.');
  const ids = new Set<string>();
  let translatedMovements = decimalValue('0');
  let nativeMovements = decimalValue('0');
  for (const movement of input.movements) {
    const at = instantNanoseconds(movement.economicAt);
    if (!movement.id || ids.has(movement.id) || at <= start || at > end)
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'Duplicate or out-of-interval monetary movement.',
      );
    ids.add(movement.id);
    const rate = rateValue(movement.rate, input.currencyId, input.reportingCurrencyId);
    if (!rate) return unavailable('missing_fx', movement.id);
    if (
      movement.rate.state === 'available' &&
      instantNanoseconds(movement.rate.value.requestedAt) !== at
    )
      throw new FinancialArithmeticError('invalid_decimal', 'Movement FX context mismatch.');
    const amount = decimalValue(movement.amount);
    nativeMovements = nativeMovements.plus(amount);
    translatedMovements = translatedMovements.plus(amount.times(rate));
  }
  if (!opening.plus(nativeMovements).eq(ending))
    return unavailable('incomplete_cash', input.currencyId);
  try {
    return {
      state: 'available',
      value: {
        currencyId: input.reportingCurrencyId,
        amount: quantizeDecimal(
          ending.times(endingRate).minus(opening.times(openingRate)).minus(translatedMovements),
        ),
      },
    };
  } catch (error) {
    if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow')
      return unavailable('numeric_overflow', input.currencyId);
    throw error;
  }
}

/** Principal excludes separately charged fees; rounded supplied execution rates never replace actual amounts. */
export function conversionDifference(
  input: Readonly<{
    sourceCurrencyId: string;
    destinationCurrencyId: string;
    sourceAmount: string;
    destinationAmount: string;
    reportingCurrencyId: string;
    sourceRate: FxRateSelection;
    destinationRate: FxRateSelection;
  }>,
): FinancialResult<
  Readonly<{ impliedActualRate: DecimalString; executionDifference: CurrencyAmount }>
> {
  const source = decimalValue(positiveDecimal(input.sourceAmount));
  const destination = decimalValue(positiveDecimal(input.destinationAmount));
  if (input.sourceCurrencyId === input.destinationCurrencyId)
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'An actual conversion requires different monetary units.',
    );
  const sourceRate = rateValue(input.sourceRate, input.sourceCurrencyId, input.reportingCurrencyId);
  const destinationRate = rateValue(
    input.destinationRate,
    input.destinationCurrencyId,
    input.reportingCurrencyId,
  );
  if (!sourceRate || !destinationRate) return unavailable('missing_fx', input.reportingCurrencyId);
  if (
    input.sourceRate.state === 'available' &&
    input.destinationRate.state === 'available' &&
    instantNanoseconds(input.sourceRate.value.requestedAt) !==
      instantNanoseconds(input.destinationRate.value.requestedAt)
  )
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'Actual conversion valuation contexts must agree.',
    );
  try {
    return {
      state: 'available',
      value: {
        impliedActualRate: quantizeDecimal(destination.div(source)),
        executionDifference: {
          currencyId: input.reportingCurrencyId,
          amount: quantizeDecimal(
            destination.times(destinationRate).minus(source.times(sourceRate)),
          ),
        },
      },
    };
  } catch (error) {
    if (error instanceof FinancialArithmeticError && error.code === 'numeric_overflow')
      return unavailable('numeric_overflow', input.reportingCurrencyId);
    throw error;
  }
}

type IndexedObservation = { observation: FxObservation; instant: bigint };

/** Index evidence once; the existing financial selector still decides routes, policy and rounding. */
export function createFxRateSelector(
  observations: readonly FxObservation[],
  policy: FxSelectionPolicy,
) {
  if (observations.length > 10000 || policy.sourcePriority.length > 64)
    throw new FinancialArithmeticError('invalid_decimal', 'FX evidence exceeds its bound.');
  // Reuse the canonical validation for the caller's policy, including its integer age bound.
  selectFxRate('identity', 'identity', '1970-01-01T00:00:00Z', policy, []);
  const ids = new Set<string>();
  const pairs = new Map<string, Map<string, IndexedObservation[]>>();
  const pairKey = (base: string, quote: string) => JSON.stringify([base, quote]);
  for (const value of observations) {
    if (!value.id || ids.has(value.id))
      throw new FinancialArithmeticError(
        'invalid_decimal',
        'FX observations require unique identities.',
      );
    ids.add(value.id);
    positiveDecimal(value.rate);
    const instant = instantNanoseconds(value.observedAt);
    if (!policy.sourcePriority.includes(value.source)) continue;
    const key = pairKey(value.baseCurrencyId, value.quoteCurrencyId);
    const sources = pairs.get(key) ?? new Map<string, IndexedObservation[]>();
    const source = sources.get(value.source) ?? [];
    source.push({ observation: { ...value }, instant });
    sources.set(value.source, source);
    pairs.set(key, sources);
  }
  for (const sources of pairs.values())
    for (const history of sources.values())
      history.sort((left, right) =>
        left.instant < right.instant
          ? -1
          : left.instant > right.instant
            ? 1
            : left.observation.id > right.observation.id
              ? -1
              : left.observation.id < right.observation.id
                ? 1
                : 0,
      );

  return (base: string, quote: string, at: string) => {
    const requested = instantNanoseconds(at);
    const candidates: FxObservation[] = [];
    if (base !== quote)
      for (const key of [pairKey(base, quote), pairKey(quote, base)]) {
        const sources = pairs.get(key);
        if (!sources) continue;
        for (const source of policy.sourcePriority) {
          const history = sources.get(source);
          if (!history) continue;
          let lower = 0;
          let upper = history.length;
          while (lower < upper) {
            const middle = lower + Math.floor((upper - lower) / 2);
            if (history[middle]!.instant <= requested) lower = middle + 1;
            else upper = middle;
          }
          // Keep a stale latest past row: the canonical selector must distinguish stale from missing.
          if (lower) candidates.push(history[lower - 1]!.observation);
        }
      }
    return selectFxRate(base, quote, at, policy, candidates);
  };
}
