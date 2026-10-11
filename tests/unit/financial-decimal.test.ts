import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'node:module';
import {
  decimal,
  decimalValue,
  quantizeDecimal,
  addDecimal,
  subtractDecimal,
  multiplyDecimal,
  divideDecimal,
  allocateDecimal,
  assertIncrement,
  feeTotals,
  FinancialArithmeticError,
  FINANCIAL_CALCULATION_MANIFEST,
} from '@journal/domain';

describe('financial source precision and canonical round trips (F-01)', () => {
  it.each([
    ['0001.2300', '1.23'],
    ['-0000.000', '0'],
    ['-0.1000', '-0.1'],
    ['0.000000000000000000000000000000000001', '0.000000000000000000000000000000000001'],
    ['1.0000000000000000000000000000000000000000', '1'],
    ['999999999999999999999999999999999999999999', '999999999999999999999999999999999999999999'],
  ])('normalizes dot-decimal %s without changing its value', (source, canonical) => {
    expect(decimal(source)).toBe(canonical);
    expect(decimal(JSON.parse(JSON.stringify(decimal(source))))).toBe(canonical);
  });
  it.each([
    0.1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    null,
    undefined,
    {},
    '',
    ' ',
    'NaN',
    'Infinity',
    '1e-3',
    '+1',
    '.5',
    '1.',
    '1,234',
    '1 234.56',
    '1_000',
    '12.34.56',
    '0.0000000000000000000000000000000000001',
    '1000000000000000000000000000000000000000000',
    '0'.repeat(513),
  ])('rejects malformed, ambiguous, binary, or nonrepresentable source %s', (source) => {
    expect(() => decimal(source)).toThrow(FinancialArithmeticError);
  });
  it('has exact decimal addition and rejects derived storage overflow', () => {
    expect(addDecimal('0.1', '0.2')).toBe('0.3');
    expect(subtractDecimal('0.3', '0.1')).toBe('0.2');
    expect(() => addDecimal('999999999999999999999999999999999999999999', '1')).toThrow('overflow');
    expect(() =>
      multiplyDecimal('1000000000000000000000000000000', '1000000000000000000000000000000'),
    ).toThrow('overflow');
    expect(() => divideDecimal('1', '0')).toThrow('division by zero');
    expect(divideDecimal('1', '3')).toBe('0.333333333333333333333333333333333333');
  });
  it.each([
    ['0.005', '0'],
    ['0.015', '0.02'],
    ['-0.005', '0'],
    ['-0.015', '-0.02'],
  ])('books half-even cents %s -> %s only at the named boundary', (source, expected) => {
    expect(quantizeDecimal(source, 2)).toBe(expected);
    expect(decimal(source)).toBe(source);
  });
  it('isolates global Decimal defaults and quantizes after working aggregation', () => {
    const requireDomain = createRequire(
      new URL('../../packages/domain/package.json', import.meta.url),
    );
    const external = requireDomain('decimal.js') as {
      precision: number;
      rounding: number;
      set(value: { precision: number; rounding: number }): void;
    };
    const prior = { precision: external.precision, rounding: external.rounding };
    try {
      external.set({ precision: 2, rounding: 3 });
      expect(divideDecimal('1', '3')).toBe('0.333333333333333333333333333333333333');
      const third = decimalValue('1').div(decimalValue('3'));
      expect(quantizeDecimal(third.plus(third).plus(third))).toBe('1');
    } finally {
      external.set(prior);
    }
  });
  it('keeps booking increments independent from storage and display scale', () => {
    expect(() => assertIncrement('0.000000000000000000000000000000000001', '0.01')).toThrow();
    expect(() => assertIncrement('0.3333', '0.0001')).not.toThrow();
    expect(() => assertIncrement('3.333', '0.01')).toThrow();
    expect(() => assertIncrement('3.33', '0.01')).not.toThrow();
    expect(() => assertIncrement('1', '0')).toThrow();
    expect(Object.isFrozen(FINANCIAL_CALCULATION_MANIFEST)).toBe(true);
  });
});

describe('exact original-identity fee partitioning (F-02)', () => {
  const weights = [
    { id: 'A', weight: '3.5' },
    { id: 'B', weight: '3.5' },
    { id: 'C', weight: '3.5' },
  ];
  it('conserves independently booked USD and GBP charges at attribution precision', () => {
    expect(allocateDecimal('0.05', weights)).toEqual([
      { id: 'A', amount: '0.016666666666666666666666666666666667' },
      { id: 'B', amount: '0.016666666666666666666666666666666667' },
      { id: 'C', amount: '0.016666666666666666666666666666666666' },
    ]);
    expect(allocateDecimal('0.01', weights)).toEqual([
      { id: 'A', amount: '0.003333333333333333333333333333333334' },
      { id: 'B', amount: '0.003333333333333333333333333333333333' },
      { id: 'C', amount: '0.003333333333333333333333333333333333' },
    ]);
    expect(
      allocateDecimal('2.10', [
        { id: 'A', weight: '6' },
        { id: 'B', weight: '3' },
        { id: 'unallocated', weight: '1.5' },
      ]),
    ).toEqual([
      { id: 'A', amount: '1.2' },
      { id: 'B', amount: '0.6' },
      { id: 'unallocated', amount: '0.3' },
    ]);
  });
  it('reapplies refund signs, leaves zero weights empty, and ignores payload permutation for ties', () => {
    const original = allocateDecimal('-0.01', weights);
    expect(original[0]?.amount).toBe('-0.003333333333333333333333333333333334');
    expect(
      allocateDecimal('-0.01', [weights[2]!, weights[0]!, weights[1]!]).sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    ).toEqual(original);
    expect(
      allocateDecimal('0.01', [
        { id: 'empty', weight: '0' },
        { id: 'full', weight: '1' },
      ]),
    ).toEqual([
      { id: 'empty', amount: '0' },
      { id: 'full', amount: '0.01' },
    ]);
    expect(allocateDecimal('0', weights).every(({ amount }) => amount === '0')).toBe(true);
  });
  it('rejects duplicate/invalid weights, identities, and unbounded work', () => {
    for (const input of [
      [],
      [{ id: 'A', weight: '0' }],
      [{ id: 'A', weight: '-1' }],
      [
        { id: 'A', weight: '1' },
        { id: 'A', weight: '2' },
      ],
      [{ id: '', weight: '1' }],
    ])
      expect(() => allocateDecimal('1', input)).toThrow();
    expect(() =>
      allocateDecimal(
        '1',
        Array.from({ length: 10_001 }, (_, index) => ({ id: `id-${index}`, weight: '1' })),
      ),
    ).toThrow();
  });
  it('retains signed original-currency fee vectors and rejects duplicate charge identities', () => {
    const charges = [
      { id: 'fee1', currencyId: 'USD', amount: '2', chargedAt: '2026-01-01T00:00:00Z' },
      { id: 'refund', currencyId: 'USD', amount: '-0.5', chargedAt: '2026-01-02T00:00:00Z' },
      { id: 'fee2', currencyId: 'GBP', amount: '0.01', chargedAt: '2026-01-01T00:00:00Z' },
    ];
    expect(feeTotals(charges)).toEqual([
      { currencyId: 'GBP', amount: '0.01' },
      { currencyId: 'USD', amount: '1.5' },
    ]);
    expect(() => feeTotals([...charges, charges[0]!])).toThrow('identity');
  });
  it('conserves signed fixed units across random inputs and ordering without amount-sized loops', () => {
    const units = (value: string): bigint => {
      const sign = value.startsWith('-') ? -1n : 1n;
      const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
      return sign * BigInt(`${whole}${fraction.padEnd(36, '0')}`);
    };
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 41n), max: 10n ** 41n }),
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 20n }), { minLength: 1, maxLength: 30 }),
        (source, rawWeights) => {
          const allocationWeights = rawWeights.map((weight, index) => ({
            id: `allocation-${index.toString().padStart(2, '0')}`,
            weight: (weight + 1n).toString(),
          }));
          const pieces = allocateDecimal(source.toString(), allocationWeights);
          expect(pieces.reduce((sum, piece) => sum + units(piece.amount), 0n)).toBe(
            source * 10n ** 36n,
          );
          expect(
            allocateDecimal(source.toString(), [...allocationWeights].reverse()).sort((a, b) =>
              a.id.localeCompare(b.id),
            ),
          ).toEqual(pieces);
          expect(
            pieces.every(({ amount }) => (source < 0n ? units(amount) <= 0n : units(amount) >= 0n)),
          ).toBe(true);
        },
      ),
      { numRuns: 200, seed: 20261010 },
    );
  });
});
