import {
  decimal,
  decimalValue,
  divideDecimal,
  FinancialArithmeticError,
  quantizeDecimal,
  sumDecimals,
} from './decimal.js';

/** Read-only journal metrics keep manual observations outside the financial kernel. */
export type JournalLedgerMetric = {
  status: 'available' | 'unavailable';
  value: string | null;
  reasons: string[];
  unit: string;
  currencyId: string | null;
  source: 'calculated-ledger';
};

export function unavailableJournalMetric(
  reasons: readonly string[],
  unit: string,
  currencyId: string | null,
): JournalLedgerMetric {
  return {
    status: 'unavailable',
    value: null,
    reasons: [...new Set(reasons)].sort(),
    unit,
    currencyId,
    source: 'calculated-ledger',
  };
}

export function availableJournalMetric(
  value: string,
  unit: string,
  currencyId: string | null,
): JournalLedgerMetric {
  return {
    status: 'available',
    value: decimal(value),
    reasons: [],
    unit,
    currencyId,
    source: 'calculated-ledger',
  };
}

/** Lifetime fill-weighted price, distinct from the remaining inventory average. */
export function journalWeightedPrice(
  fills: readonly { quantity: string; price: string | null; compatible: boolean }[],
  unit: string,
  currencyId: string | null,
): JournalLedgerMetric {
  if (!fills.length) return unavailableJournalMetric(['no_effective_fills'], unit, currencyId);
  if (fills.some((fill) => !fill.compatible))
    return unavailableJournalMetric(['incompatible_price_units'], unit, currencyId);
  if (fills.some((fill) => fill.price === null))
    return unavailableJournalMetric(['missing_execution_price'], unit, currencyId);
  try {
    if (fills.some((fill) => !decimalValue(fill.quantity).gt('0')))
      return unavailableJournalMetric(['invalid_allocated_quantity'], unit, currencyId);
    const quantity = sumDecimals(fills.map((fill) => fill.quantity));
    const weighted = fills.reduce(
      (total, fill) => total.plus(decimalValue(fill.quantity).times(decimalValue(fill.price))),
      decimalValue('0'),
    );
    // Keep the weighted numerator at working precision until the final derived boundary.
    return availableJournalMetric(
      quantizeDecimal(weighted.div(decimalValue(quantity))),
      unit,
      currencyId,
    );
  } catch (error) {
    if (error instanceof FinancialArithmeticError)
      return unavailableJournalMetric([error.code], unit, currencyId);
    throw error;
  }
}

export type OriginalRiskRInput = {
  originalRisk: { originalPlanId: string; amount: string; currencyId: string } | null;
  commitment: { timing: 'pre-trade' | 'retrospective'; committedAtMicros: string } | null;
  earliestExecutionMicros: string | null;
  completed: boolean;
  closureReviewRequired: boolean;
  legResults: readonly JournalLedgerMetric[];
  coverageReasons: readonly string[];
  financialSourceRevision: string;
};

/** Supplements deliberately have no parameter: they cannot replace original committed risk. */
export function originalRiskR(input: OriginalRiskRInput): JournalLedgerMetric & {
  originalPlanId: string | null;
  definitionVersion: 'original-risk-r/1';
  financialSourceRevision: string;
} {
  const currency = input.originalRisk?.currencyId ?? null;
  const reasons = [...input.coverageReasons];
  if (!input.originalRisk) reasons.push('missing_original_risk');
  else {
    try {
      if (!decimalValue(input.originalRisk.amount).gt('0')) reasons.push('invalid_original_risk');
    } catch (error) {
      if (error instanceof FinancialArithmeticError) reasons.push('invalid_original_risk');
      else throw error;
    }
  }
  if (!input.commitment) reasons.push('missing_original_commitment');
  else if (input.commitment.timing !== 'pre-trade') reasons.push('retrospective_original_plan');
  if (input.earliestExecutionMicros === null) reasons.push('no_effective_fills');
  else if (input.commitment) {
    if (
      !/^-?\d+$/.test(input.commitment.committedAtMicros) ||
      !/^-?\d+$/.test(input.earliestExecutionMicros)
    )
      reasons.push('ambiguous_commitment_chronology');
    else if (BigInt(input.commitment.committedAtMicros) >= BigInt(input.earliestExecutionMicros))
      reasons.push('execution_not_after_original_commitment');
  }
  if (!input.completed) reasons.push('campaign_not_completed');
  if (input.closureReviewRequired) reasons.push('closure_review_required');
  if (!input.legResults.length) reasons.push('missing_campaign_population');
  for (const leg of input.legResults) {
    if (leg.status !== 'available' || leg.value === null)
      reasons.push(...(leg.reasons.length ? leg.reasons : ['incomplete_campaign_result']));
    if (currency !== null && leg.currencyId !== currency)
      reasons.push('incompatible_risk_currency');
  }
  let metric: JournalLedgerMetric;
  if (reasons.length) metric = unavailableJournalMetric(reasons, 'R', currency);
  else {
    try {
      metric = availableJournalMetric(
        divideDecimal(
          sumDecimals(input.legResults.map((leg) => leg.value!)),
          input.originalRisk!.amount,
        ),
        'R',
        currency,
      );
    } catch (error) {
      if (error instanceof FinancialArithmeticError)
        metric = unavailableJournalMetric([error.code], 'R', currency);
      else throw error;
    }
  }
  return {
    ...metric,
    originalPlanId: input.originalRisk?.originalPlanId ?? null,
    definitionVersion: 'original-risk-r/1',
    financialSourceRevision: input.financialSourceRevision,
  };
}
