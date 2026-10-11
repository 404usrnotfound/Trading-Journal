import { decimal, decimalValue, FinancialArithmeticError, quantizeDecimal } from './decimal.js';
import type { DecimalString } from './index.js';

export type CurrencyAmount = Readonly<{ currencyId: string; amount: DecimalString }>;
export type ChargeComponent = Readonly<{
  id: string;
  currencyId: string;
  amount: string;
  chargedAt: string;
}>;

export function positiveDecimal(input: unknown): DecimalString {
  const value = decimal(input);
  if (!decimalValue(value).gt('0'))
    throw new FinancialArithmeticError('invalid_decimal', 'Expected a positive decimal.');
  return value;
}

/** Actual booking increments are independently supplied, never inferred from display scale. */
export function assertIncrement(amount: string, increment: string): void {
  const unit = decimalValue(positiveDecimal(increment));
  if (!decimalValue(amount).mod(unit).isZero())
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'Amount does not satisfy the declared increment.',
    );
}

/** Original cost identities remain separate; refunds are signed negative costs. */
export function feeTotals(charges: readonly ChargeComponent[]): CurrencyAmount[] {
  const ids = new Set<string>();
  const currencies = new Map<string, ReturnType<typeof decimalValue>>();
  for (const charge of charges) {
    if (!charge.id || ids.has(charge.id) || !charge.currencyId)
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'Duplicate or invalid cost identity.',
      );
    ids.add(charge.id);
    currencies.set(
      charge.currencyId,
      (currencies.get(charge.currencyId) ?? decimalValue('0')).plus(decimalValue(charge.amount)),
    );
  }
  return [...currencies.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currencyId, amount]) => ({ currencyId, amount: quantizeDecimal(amount) }));
}
