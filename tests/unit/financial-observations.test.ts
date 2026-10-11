import { describe, expect, it } from 'vitest';
import { calculateNav, decimal, selectFxRate } from '@journal/domain';
import { canonicalFinancialInstant } from '../../packages/server/src/financial/observations.js';

describe('financial observation boundaries', () => {
  it('normalizes offsets without losing microsecond chronology', () => {
    expect(canonicalFinancialInstant('2025-03-01T01:30:00.000001+01:30')).toBe(
      '2025-03-01T00:00:00.000001Z',
    );
    expect(canonicalFinancialInstant('2025-02-28T23:00:00.999999-01:00')).toBe(
      '2025-03-01T00:00:00.999999Z',
    );
    expect(canonicalFinancialInstant('1969-12-31T23:59:59.999999Z')).toBe(
      '1969-12-31T23:59:59.999999Z',
    );
    expect(canonicalFinancialInstant('2025-03-01T00:00:00Z')).toBe('2025-03-01T00:00:00.000000Z');
  });

  it('rejects invalid calendar values and source precision beyond PostgreSQL microseconds', () => {
    for (const invalid of [
      '2025-02-29T00:00:00Z',
      '2025-03-01T00:00:00.0000001Z',
      '2025-03-01',
      '2025-03-01T00:00:00',
    ])
      expect(() => canonicalFinancialInstant(invalid)).toThrow();
  });

  it('retains unsupported coverage rather than inventing a missing mark', () => {
    const asOf = '2025-03-01T00:00:00Z';
    const rate = selectFxRate(
      'EUR',
      'EUR',
      asOf,
      { id: 'identity-v1', maxAgeMilliseconds: 0, sourcePriority: ['manual'] },
      [],
    );
    const result = calculateNav({
      reportingCurrencyId: 'EUR',
      asOf,
      sourceRevision: '4',
      components: [
        { id: 'cash', kind: 'cash', currencyId: 'EUR', amount: decimal('50'), rate },
        {
          id: 'manual-derivative',
          kind: 'holding',
          currencyId: 'EUR',
          unavailableReasons: ['unsupported'],
          missingReferences: ['validated-module'],
          rate,
        },
      ],
    });
    expect(result.state).toBe('partial');
    if (result.state !== 'partial') throw new Error('Expected partial NAV');
    expect(result.availableSubtotal.amount).toBe('50');
    expect(result.reasons).toEqual(['unsupported']);
    expect(result.missingReferences).toEqual(['manual-derivative', 'validated-module']);
  });

  it('retains unknown manual currency conventions alongside the available cash subtotal', () => {
    const asOf = '2025-03-01T00:00:00Z';
    const result = calculateNav({
      reportingCurrencyId: 'EUR',
      asOf,
      sourceRevision: '5',
      components: [
        {
          id: 'cash',
          kind: 'cash',
          currencyId: 'EUR',
          amount: '50',
          rate: selectFxRate(
            'EUR',
            'EUR',
            asOf,
            {
              id: 'identity-v1',
              maxAgeMilliseconds: 0,
              sourcePriority: ['manual'],
            },
            [],
          ),
        },
        {
          id: 'unknown-manual-derivative',
          kind: 'holding',
          currencyId: null,
          unavailableReasons: ['unsupported', 'incompatible_currency'],
          missingReferences: ['unknown-settlement-convention'],
          rate: {
            state: 'unavailable',
            reasons: ['incompatible_currency'],
            missingReferences: ['unknown-settlement-convention'],
          },
        },
      ],
    });
    expect(result).toMatchObject({
      state: 'partial',
      availableSubtotal: { currencyId: 'EUR', amount: '50' },
      reasons: ['unsupported', 'incompatible_currency'],
      missingReferences: ['unknown-manual-derivative', 'unknown-settlement-convention'],
    });
  });
});
