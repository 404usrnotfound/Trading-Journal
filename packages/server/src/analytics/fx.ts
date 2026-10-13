import {
  FinancialArithmeticError,
  instantNanoseconds,
  positiveDecimal,
  selectFxRate,
  type FxObservation,
  type FxSelectionPolicy,
} from '@journal/domain';

type IndexedObservation = { observation: FxObservation; instant: bigint };

/** Index evidence once; the existing financial selector still decides routes, policy and rounding. */
export function createAnalyticsFxSelector(
  observations: readonly FxObservation[],
  policy: FxSelectionPolicy,
) {
  if (observations.length > 10000 || policy.sourcePriority.length > 64)
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'Analytics FX evidence exceeds its bound.',
    );
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
