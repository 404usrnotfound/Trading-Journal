import { describe, expect, it } from 'vitest';
import {
  advancedOperations,
  buildAdvancedRecord,
  type AdvancedRows,
} from '../../apps/web/src/components/record/advanced-record-model.js';
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const economic = { economicAt: '2026-01-01T12:00:00+01:00', orderingKey: '1' };
const empty = (): AdvancedRows => ({ fees: [], lots: [], allocations: [], legs: [], effects: [] });
describe('advanced source financial entry', () => {
  it('preserves multiple charged currencies and selected lot quantities without Number money conversion', () => {
    const rows = empty();
    rows.fees = [
      {
        cashBucketId: id(4),
        currencyId: id(5),
        amount: '0.000000000000000001',
        kind: 'commission',
      },
      { cashBucketId: id(6), currencyId: id(7), amount: '2.99', kind: 'exchange' },
    ];
    rows.lots = [{ lotId: 'original-source-slice', quantity: '0.000000000000000001' }];
    expect(
      buildAdvancedRecord(
        'executions',
        {
          ...economic,
          accountId: id(1),
          instrumentVersionId: id(2),
          cashBucketId: id(3),
          side: 'sell',
          quantity: '0.000000000000000001',
          price: '999.123456789123456789',
          costsComplete: 'true',
          closeOnly: 'true',
        },
        rows,
      ),
    ).toMatchObject({
      price: '999.123456789123456789',
      quantity: '0.000000000000000001',
      fees: rows.fees,
      specificLots: rows.lots,
      costsComplete: true,
      closeOnly: true,
    });
  });
  it('submits split allocations with explicit concurrency version and no second execution/cash payload', () => {
    const rows = empty();
    rows.allocations = [
      { tradeLegId: id(2), quantity: '0.3' },
      { tradeLegId: id(3), quantity: '0.7' },
    ];
    expect(
      buildAdvancedRecord(
        'execution-allocations',
        { executionId: id(1), expectedVersion: '4', reason: 'Split actual shared source fill' },
        rows,
      ),
    ).toEqual({
      executionId: id(1),
      expectedVersion: 4,
      reason: 'Split actual shared source fill',
      allocations: rows.allocations,
    });
  });
  it('keeps package-order intention separate from source fill and monetary effects', () => {
    const rows = empty();
    rows.legs = [
      { instrumentVersionId: id(2), side: 'buy', ratio: '1' },
      { instrumentVersionId: id(3), side: 'sell', ratio: '2' },
    ];
    expect(
      buildAdvancedRecord(
        'orders',
        {
          accountId: id(1),
          kind: 'package',
          economicAt: economic.economicAt,
          status: 'working',
          quantity: '3',
          orderType: 'limit',
          limitPrice: '4',
          stopPrice: '',
          timeInForce: 'day',
        },
        rows,
      ),
    ).toEqual({
      accountId: id(1),
      kind: 'package',
      economicAt: economic.economicAt,
      legs: rows.legs,
      instruction: {
        status: 'working',
        quantity: '3',
        orderType: 'limit',
        limitPrice: '4',
        timeInForce: 'day',
      },
    });
  });
  it('retains explicitly unknown opening basis rather than inventing historical profit', () => {
    expect(
      buildAdvancedRecord(
        'opening-lots',
        {
          ...economic,
          accountId: id(1),
          instrumentVersionId: id(2),
          direction: 'long',
          quantity: '10',
          reason: 'Historical source has no cost basis',
        },
        empty(),
      ),
    ).toEqual({
      ...economic,
      accountId: id(1),
      instrumentVersionId: id(2),
      direction: 'long',
      quantity: '10',
      reason: 'Historical source has no cost basis',
      costsComplete: false,
    });
  });
  it('validates conversions with original amounts and multi-currency actual costs', () => {
    const rows = empty();
    rows.fees = [{ currencyId: id(3), cashBucketId: id(1), amount: '0.01', kind: 'conversion' }];
    expect(
      buildAdvancedRecord(
        'fx-conversions',
        {
          ...economic,
          sourceBucketId: id(1),
          destinationBucketId: id(2),
          sourceAmount: '100',
          destinationAmount: '109.999999999999999999',
        },
        rows,
      ),
    ).toEqual({
      ...economic,
      sourceBucketId: id(1),
      destinationBucketId: id(2),
      sourceAmount: '100',
      destinationAmount: '109.999999999999999999',
      fees: rows.fees,
    });
  });
  it('rejects malformed monetary source text and unconfirmed manual cash', () => {
    expect(() =>
      buildAdvancedRecord(
        'cash-movements',
        {
          ...economic,
          accountId: id(1),
          cashBucketId: id(2),
          currencyId: id(3),
          amount: '=SUM(1)',
          kind: 'deposit',
        },
        empty(),
      ),
    ).toThrow();
    const rows = empty();
    rows.effects = [{ cashBucketId: id(1), currencyId: id(2), amount: '-100' }];
    expect(() =>
      buildAdvancedRecord(
        'executions',
        {
          ...economic,
          accountId: id(1),
          instrumentVersionId: id(2),
          quantity: '1',
          price: '100',
          side: 'buy',
        },
        rows,
      ),
    ).toThrow('Confirm explicit supplied cash effects');
  });
  it('exposes every required financial setup and actual source command through a typed form', () => {
    for (const resource of [
      'brokers',
      'cash-buckets',
      'cash-movements',
      'fx-conversions',
      'opening-lots',
      'executions',
      'orders',
      'execution-allocations',
    ])
      expect(advancedOperations[resource]).toBeDefined();
  });
});
