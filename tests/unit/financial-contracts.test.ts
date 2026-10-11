import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  financialDecimalSchema,
  positiveFinancialDecimalSchema,
  nonnegativeFinancialDecimalSchema,
  financialInstantSchema,
  financialIdSchema,
  executionCreateSchema,
  orderCreateSchema,
  financialValuationQuerySchema,
  financialSourceRevisionSchema,
  financialOrderingKeySchema,
} from '@journal/contracts';
import { FinancialArithmeticError, InventoryError } from '@journal/domain';
import { toProblemResponse } from '@journal/server';

describe('financial API source boundaries', () => {
  it.each([
    '0',
    '-0',
    '0.10',
    '-123.456',
    '9'.repeat(42),
    `0.${'0'.repeat(35)}1`,
    `1.${'0'.repeat(50)}`,
  ])('accepts lossless decimal text %s', (value) => {
    expect(financialDecimalSchema.parse(value)).toBe(value);
  });
  it.each([
    0.1,
    null,
    'NaN',
    'Infinity',
    '',
    '1e-7',
    '1,234',
    ' 1 ',
    '1'.repeat(43),
    `0.${'0'.repeat(36)}1`,
  ])('rejects nonrepresentable or ambiguous source %s', (value) => {
    expect(financialDecimalSchema.safeParse(value).success).toBe(false);
  });
  it('preserves positive quantities and legitimate zero marks as distinct contracts', () => {
    expect(positiveFinancialDecimalSchema.safeParse('0').success).toBe(false);
    expect(nonnegativeFinancialDecimalSchema.parse('0')).toBe('0');
    expect(nonnegativeFinancialDecimalSchema.safeParse('-0.01').success).toBe(false);
  });
  it('accepts explicit offsets and rejects unsupported timestamp precision', () => {
    expect(financialInstantSchema.parse('2026-10-10T08:00:00.123456+02:00')).toBe(
      '2026-10-10T08:00:00.123456+02:00',
    );
    expect(financialInstantSchema.safeParse('2026-10-10T08:00:00.1234567Z').success).toBe(false);
    expect(financialInstantSchema.safeParse('2026-10-10T08:00:00').success).toBe(false);
  });
  it('requires a UUIDv4 command identity', () => {
    expect(financialIdSchema.parse(randomUUID())).toHaveLength(36);
    expect(financialIdSchema.safeParse('00000000-0000-1000-8000-000000000000').success).toBe(false);
  });
  it('rejects overflowing source revisions while preserving independent economic sequences', () => {
    expect(financialSourceRevisionSchema.parse('2147483647')).toBe('2147483647');
    expect(financialSourceRevisionSchema.safeParse('2147483648').success).toBe(false);
    expect(financialSourceRevisionSchema.safeParse('9'.repeat(1000)).success).toBe(false);
    expect(financialSourceRevisionSchema.safeParse('invalid').success).toBe(false);
    expect(financialOrderingKeySchema.parse('2147483648')).toBe('2147483648');
  });
  it('rejects posted derived totals and binary quantities at the fill boundary', () => {
    const fill = {
      accountId: randomUUID(),
      instrumentVersionId: randomUUID(),
      side: 'buy',
      quantity: '0.3333',
      price: '10',
      economicAt: '2026-10-10T08:00:00Z',
      orderingKey: '1',
    };
    expect(executionCreateSchema.parse(fill).quantity).toBe('0.3333');
    expect(executionCreateSchema.safeParse({ ...fill, quantity: 0.3333 }).success).toBe(false);
    expect(executionCreateSchema.safeParse({ ...fill, realizedPnl: '999' }).success).toBe(false);
    expect(executionCreateSchema.safeParse({ ...fill, commandId: randomUUID() }).success).toBe(
      false,
    );
  });
  it('keeps single orders single and source namespace/id paired', () => {
    const order = {
      accountId: randomUUID(),
      kind: 'single',
      legs: [{ instrumentVersionId: randomUUID(), side: 'buy', ratio: '1' }],
      instruction: { status: 'working', quantity: '1', orderType: 'market', timeInForce: 'day' },
      economicAt: '2026-10-10T08:00:00Z',
    };
    expect(orderCreateSchema.safeParse(order).success).toBe(true);
    expect(
      orderCreateSchema.safeParse({ ...order, legs: [...order.legs, ...order.legs] }).success,
    ).toBe(false);
    expect(orderCreateSchema.safeParse({ ...order, sourceId: 'broker-order' }).success).toBe(false);
  });
  it('requires explicit accounts, source priorities and freshness for valuation', () => {
    const query = {
      accountIds: randomUUID(),
      reportingCurrencyId: randomUUID(),
      asOf: '2026-10-10T08:00:00Z',
      fxPolicyId: 'reviewed-v1',
      fxMaxAgeMilliseconds: '60000',
      fxSourcePriority: 'manual',
      priceMaxAgeMilliseconds: '60000',
      priceSourcePriority: 'manual',
    };
    expect(financialValuationQuerySchema.parse(query).fxMaxAgeMilliseconds).toBe(60000);
    expect(
      financialValuationQuerySchema.safeParse({ ...query, fxMaxAgeMilliseconds: undefined })
        .success,
    ).toBe(false);
    expect(financialValuationQuerySchema.safeParse({ ...query, accountIds: '' }).success).toBe(
      false,
    );
  });
  it.each([
    new FinancialArithmeticError('numeric_overflow', 'private source details'),
    new InventoryError('private lot id'),
  ])('returns safe financial problem details', async (error) => {
    const response = toProblemResponse(error);
    expect([409, 422]).toContain(response.status);
    expect(await response.text()).not.toContain('private');
  });
});
