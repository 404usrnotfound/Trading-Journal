import Decimal from 'decimal.js';
import type { DecimalString } from './index.js';

/** Isolated from Decimal.js's process-wide defaults; never configured by callers. */
const FinancialDecimal = Decimal.clone({ precision: 160, rounding: Decimal.ROUND_HALF_EVEN });
export const FINANCIAL_SCALE = 36;
export const MAX_DECIMAL_TEXT_LENGTH = 512;
const fixedFactor = 10n ** 36n;

export class FinancialArithmeticError extends Error {
  constructor(
    public readonly code:
      'invalid_decimal' | 'numeric_overflow' | 'division_by_zero' | 'invalid_allocation',
    message: string,
  ) {
    super(message);
    this.name = 'FinancialArithmeticError';
  }
}

/** Dot-decimal normalization only. Callers retain source text/convention in provenance. */
export function decimal(input: unknown): DecimalString {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > MAX_DECIMAL_TEXT_LENGTH ||
    !/^-?\d+(?:\.\d+)?$/u.test(input)
  ) {
    throw new FinancialArithmeticError('invalid_decimal', 'Expected bounded dot-decimal text.');
  }
  const negative = input.startsWith('-');
  const magnitude = negative ? input.slice(1) : input;
  const [integralText = '', fractionalText = ''] = magnitude.split('.');
  const integral = integralText.replace(/^0+/u, '') || '0';
  const fractional = fractionalText.replace(/0+$/u, '');
  if (integral.length > 42 || fractional.length > FINANCIAL_SCALE) {
    throw new FinancialArithmeticError('numeric_overflow', 'Decimal exceeds NUMERIC(78,36).');
  }
  const nonzero = integral !== '0' || fractional !== '';
  return `${negative && nonzero ? '-' : ''}${integral}${fractional ? `.${fractional}` : ''}` as DecimalString;
}

export function decimalValue(input: unknown): Decimal {
  return new FinancialDecimal(decimal(input));
}

/** Named derived/booking boundary; accepted source scalars are never silently rounded. */
export function quantizeDecimal(
  input: string | Decimal,
  scale: number = FINANCIAL_SCALE,
): DecimalString {
  if (!Number.isInteger(scale) || scale < 0 || scale > FINANCIAL_SCALE)
    throw new FinancialArithmeticError('invalid_decimal', 'Invalid quantization scale.');
  // Strings here are working results, not source inputs, and may exceed storage precision.
  if (typeof input === 'string' && (input.length > 512 || !/^-?\d+(?:\.\d+)?$/u.test(input)))
    throw new FinancialArithmeticError('invalid_decimal', 'Invalid derived decimal.');
  if (typeof input !== 'string' && !Decimal.isDecimal(input))
    throw new FinancialArithmeticError(
      'invalid_decimal',
      'Expected decimal text or working decimal.',
    );
  const value = new FinancialDecimal(input);
  if (!value.isFinite())
    throw new FinancialArithmeticError('invalid_decimal', 'Non-finite financial value.');
  // Check before toFixed to bound output allocation even for a malicious working exponent.
  if (value.abs().gte('1000000000000000000000000000000000000000000'))
    throw new FinancialArithmeticError('numeric_overflow', 'Derived integral overflow.');
  return decimal(value.toFixed(scale, FinancialDecimal.ROUND_HALF_EVEN));
}

export function addDecimal(a: string, b: string): DecimalString {
  return quantizeDecimal(decimalValue(a).plus(decimalValue(b)));
}
export function subtractDecimal(a: string, b: string): DecimalString {
  return quantizeDecimal(decimalValue(a).minus(decimalValue(b)));
}
export function multiplyDecimal(a: string, b: string): DecimalString {
  return quantizeDecimal(decimalValue(a).times(decimalValue(b)));
}
export function divideDecimal(a: string, b: string): DecimalString {
  const denominator = decimalValue(b);
  if (denominator.isZero())
    throw new FinancialArithmeticError('division_by_zero', 'Financial division by zero.');
  return quantizeDecimal(decimalValue(a).div(denominator));
}
export function sumDecimals(values: readonly string[]): DecimalString {
  return quantizeDecimal(
    values.reduce((total, value) => total.plus(decimalValue(value)), new FinancialDecimal('0')),
  );
}

function toFixedInteger(input: string): bigint {
  const normalized = decimal(input);
  const sign = normalized.startsWith('-') ? -1n : 1n;
  const [integral = '0', fraction = ''] = normalized.replace(/^-/, '').split('.');
  return sign * (BigInt(integral) * fixedFactor + BigInt(fraction.padEnd(FINANCIAL_SCALE, '0')));
}
function fromFixedInteger(input: bigint): DecimalString {
  const sign = input < 0n ? '-' : '';
  const magnitude = input < 0n ? -input : input;
  return decimal(
    `${sign}${magnitude / fixedFactor}.${(magnitude % fixedFactor).toString().padStart(FINANCIAL_SCALE, '0')}`,
  );
}

export type DecimalAllocationWeight = Readonly<{ id: string; weight: string }>;
export type DecimalAllocation = Readonly<{ id: string; amount: DecimalString }>;

/** Exact scale-36 largest remainder, bounded by allocation count rather than source amount. */
export function allocateDecimal(
  source: string,
  weights: readonly DecimalAllocationWeight[],
): DecimalAllocation[] {
  if (weights.length === 0 || weights.length > 10_000)
    throw new FinancialArithmeticError('invalid_allocation', 'Invalid allocation population.');
  const ids = new Set<string>();
  const prepared = weights.map(({ id, weight }, index) => {
    if (id.length === 0 || id.length > 128 || ids.has(id))
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'Allocation IDs must be unique and bounded.',
      );
    ids.add(id);
    const fixedWeight = toFixedInteger(weight);
    if (fixedWeight < 0n)
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'Allocation weights cannot be negative.',
      );
    return { id, index, weight: fixedWeight, remainder: 0n, piece: 0n };
  });
  const weightTotal = prepared.reduce((total, item) => total + item.weight, 0n);
  if (weightTotal === 0n)
    throw new FinancialArithmeticError(
      'invalid_allocation',
      'Allocation requires a positive total weight.',
    );
  const fixedSource = toFixedInteger(source);
  const absoluteSource = fixedSource < 0n ? -fixedSource : fixedSource;
  for (const item of prepared) {
    const numerator = absoluteSource * item.weight;
    item.piece = numerator / weightTotal;
    item.remainder = numerator % weightTotal;
  }
  let remaining = absoluteSource - prepared.reduce((total, item) => total + item.piece, 0n);
  const ranked = [...prepared].sort((a, b) =>
    a.remainder > b.remainder
      ? -1
      : a.remainder < b.remainder
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
  );
  for (const item of ranked) {
    if (remaining === 0n) break;
    item.piece += 1n;
    remaining -= 1n;
  }
  if (remaining !== 0n)
    throw new FinancialArithmeticError('invalid_allocation', 'Allocation conservation failure.');
  return prepared.map(({ id, piece }) => ({
    id,
    amount: fromFixedInteger(fixedSource < 0n ? -piece : piece),
  }));
}

export const FINANCIAL_CALCULATION_MANIFEST = Object.freeze({
  kernel: 'journal-financial-kernel/1',
  ordinaryLinear: 'cash-paid-ordinary-linear/1',
  lotMatching: 'fifo-average-specific/1',
  allocation: 'largest-remainder-scale36-stable-id/1',
  fxSelection: 'explicit-direct-inverse-no-future/1',
  precision: 'decimal160-half-even-numeric78-36/1',
  schema: 'financial-ledger/1',
});
