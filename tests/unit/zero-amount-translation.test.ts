import { describe, expect, it } from 'vitest';
import { decimal, translateAmount, type FxRateSelection } from '@journal/domain';

const missing: FxRateSelection = {
  state: 'unavailable',
  reasons: ['missing_fx'],
  missingReferences: ['EUR->USD'],
};
const available: FxRateSelection = {
  state: 'available',
  value: {
    baseCurrencyId: 'EUR',
    quoteCurrencyId: 'USD',
    rate: decimal('1.25'),
    requestedAt: '2030-01-01T00:00:00Z',
    observationIds: ['reviewed-rate'],
    route: 'direct',
    policyId: 'zero-translation/1',
  },
};

describe('evidenced zero translation preserves monetary availability', () => {
  it.each(['0', '-0.000000000000000000000000000000000000'])(
    'translates known %s without FX while nonzero exposure retains the missing dependency',
    (amount) => {
      expect(translateAmount({ currencyId: 'EUR', amount }, 'USD', missing)).toEqual({
        state: 'available',
        value: { currencyId: 'USD', amount: '0' },
      });
      expect(translateAmount({ currencyId: 'EUR', amount: '1' }, 'USD', missing)).toEqual(missing);
      expect(translateAmount({ currencyId: 'EUR', amount: '-1' }, 'USD', missing)).toEqual(missing);
    },
  );

  it('does not require a stale quote for zero and retains the known target unit', () => {
    expect(
      translateAmount({ currencyId: 'EUR', amount: '0' }, 'USD', {
        state: 'unavailable',
        reasons: ['stale_fx'],
        missingReferences: ['outdated-rate'],
      }),
    ).toEqual({ state: 'available', value: { currencyId: 'USD', amount: '0' } });
    expect(translateAmount({ currencyId: '', amount: '0' }, 'USD', missing)).toEqual(missing);
    expect(translateAmount({ currencyId: 'EUR', amount: '0' }, '', missing)).toEqual(missing);
  });

  it('still validates a supplied available FX direction and rate for zero', () => {
    expect(translateAmount({ currencyId: 'EUR', amount: '0' }, 'USD', available)).toEqual({
      state: 'available',
      value: { currencyId: 'USD', amount: '0' },
    });
    expect(() => translateAmount({ currencyId: 'USD', amount: '0' }, 'EUR', available)).toThrow(
      /direction/u,
    );
    if (available.state !== 'available') throw new Error('Available test context required');
    expect(() =>
      translateAmount({ currencyId: 'EUR', amount: '0' }, 'USD', {
        ...available,
        value: { ...available.value, rate: decimal('0') },
      }),
    ).toThrow();
    expect(() =>
      translateAmount({ currencyId: 'EUR', amount: '0' }, 'USD', {
        ...available,
        value: { ...available.value, route: 'identity' },
      }),
    ).toThrow(/identity/u);
  });
});
