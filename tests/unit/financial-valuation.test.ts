import { describe, expect, it } from 'vitest';
import {
  selectFxRate,
  instantNanoseconds,
  translateAmount,
  calculateNav,
  holdingFx,
  cashFx,
  conversionDifference,
  makeCashMovementPostings,
  makeSettlementPostings,
  assertBalancedPostings,
  cashBalances,
  reversePostings,
} from '@journal/domain';
import type { FxRateSelection, FxObservation, FinancialPosting } from '@journal/domain';

const policy = {
  id: 'explicit-fixture-policy/1',
  maxAgeMilliseconds: 30 * 60 * 1000,
  sourcePriority: ['trusted', 'secondary'],
};
const at = '2026-01-01T10:00:00Z';
const observations: FxObservation[] = [
  {
    id: 'historical',
    baseCurrencyId: 'USD',
    quoteCurrencyId: 'EUR',
    rate: '0.8',
    observedAt: '2026-01-01T09:00:00Z',
    source: 'trusted',
  },
  {
    id: 'future',
    baseCurrencyId: 'USD',
    quoteCurrencyId: 'EUR',
    rate: '0.9',
    observedAt: '2026-01-01T10:01:00Z',
    source: 'trusted',
  },
];
function fx(base: string, quote: string, rate: string, requestedAt = at): FxRateSelection {
  return selectFxRate(
    base,
    quote,
    requestedAt,
    policy,
    base === quote
      ? []
      : [
          {
            id: `rate-${base}-${quote}-${requestedAt}`,
            baseCurrencyId: base,
            quoteCurrencyId: quote,
            rate,
            observedAt: requestedAt,
            source: 'trusted',
          },
        ],
  );
}
const unavailable: FxRateSelection = {
  state: 'unavailable',
  reasons: ['missing_fx'],
  missingReferences: ['GBP->USD'],
};

describe('context-bound FX selection and availability (F-13)', () => {
  it('gives a reviewed context-bound override precedence without permitting future observations', () => {
    const override = {
      contextId: 'review-17',
      requestedAt: at,
      allowStale: true,
      observation: {
        id: 'reviewed-inverse',
        baseCurrencyId: 'EUR',
        quoteCurrencyId: 'USD',
        rate: '1.25',
        observedAt: '2026-01-01T09:00:00Z',
        source: 'manual',
      },
    };
    const direct: FxObservation = {
      id: 'fresh-direct',
      baseCurrencyId: 'USD',
      quoteCurrencyId: 'EUR',
      rate: '0.9',
      observedAt: at,
      source: 'trusted',
    };
    expect(selectFxRate('USD', 'EUR', at, policy, [direct], override)).toMatchObject({
      state: 'available',
      value: { rate: '0.8', route: 'manual-inverse', reviewedContextId: 'review-17' },
    });
    expect(
      selectFxRate('USD', 'EUR', at, policy, [direct], { ...override, allowStale: false }),
    ).toMatchObject({ state: 'unavailable', reasons: ['stale_fx'] });
    expect(
      selectFxRate('USD', 'EUR', at, policy, [direct], {
        ...override,
        observation: { ...override.observation, observedAt: '2026-01-01T10:00:00.000000001Z' },
      }),
    ).toMatchObject({ state: 'unavailable', reasons: ['missing_fx'] });
    expect(() =>
      selectFxRate('USD', 'EUR', at, policy, [direct], {
        ...override,
        requestedAt: '2026-01-01T10:01:00Z',
      }),
    ).toThrow('context');
  });
  it('rejects stale/future observations and enables only a newly supplied eligible context', () => {
    expect(selectFxRate('USD', 'EUR', at, policy, observations).state).toBe('unavailable');
    expect(
      selectFxRate('USD', 'EUR', at, policy, [
        ...observations,
        {
          id: 'reviewed',
          baseCurrencyId: 'USD',
          quoteCurrencyId: 'EUR',
          rate: '0.85',
          observedAt: '2026-01-01T09:59:00Z',
          source: 'trusted',
        },
      ]),
    ).toMatchObject({ state: 'available', value: { rate: '0.85', observationIds: ['reviewed'] } });
    expect(
      translateAmount({ currencyId: 'GBP', amount: '0.01' }, 'USD', unavailable),
    ).toMatchObject({ state: 'unavailable', reasons: ['missing_fx'] });
  });
  it('uses explicit identity and records the direct or inverse observation route', () => {
    expect(fx('EUR', 'EUR', '1')).toMatchObject({
      state: 'available',
      value: { rate: '1', route: 'identity', observationIds: [] },
    });
    expect(fx('USD', 'EUR', '0.8')).toMatchObject({
      state: 'available',
      value: { rate: '0.8', route: 'direct' },
    });
    const inverse: FxObservation = {
      id: 'inverse',
      baseCurrencyId: 'EUR',
      quoteCurrencyId: 'USD',
      rate: '1.25',
      observedAt: at,
      source: 'trusted',
    };
    expect(selectFxRate('USD', 'EUR', at, policy, [inverse])).toMatchObject({
      state: 'available',
      value: { rate: '0.8', route: 'inverse', observationIds: ['inverse'] },
    });
    expect(
      selectFxRate('EUR', 'JPY', at, policy, [
        inverse,
        {
          id: 'yen',
          baseCurrencyId: 'USD',
          quoteCurrencyId: 'JPY',
          rate: '160',
          observedAt: at,
          source: 'trusted',
        },
      ]).state,
    ).toBe('unavailable');
  });
  it('chooses direct first, then configured source priority, latest eligible time and stable ID', () => {
    const row = (id: string, rate: string, source: string, observedAt: string): FxObservation => ({
      id,
      rate,
      source,
      observedAt,
      baseCurrencyId: 'USD',
      quoteCurrencyId: 'EUR',
    });
    const inputs = [
      row('b', '0.81', 'trusted', at),
      row('a', '0.82', 'trusted', at),
      row('secondary', '0.9', 'secondary', at),
      row('older', '0.7', 'trusted', '2026-01-01T09:59:00Z'),
      {
        id: 'inverse',
        baseCurrencyId: 'EUR',
        quoteCurrencyId: 'USD',
        rate: '1.2',
        observedAt: at,
        source: 'trusted',
      },
    ];
    expect(selectFxRate('USD', 'EUR', at, policy, inputs)).toMatchObject({
      state: 'available',
      value: { rate: '0.82', observationIds: ['a'] },
    });
    expect(selectFxRate('USD', 'EUR', at, policy, [...inputs].reverse())).toEqual(
      selectFxRate('USD', 'EUR', at, policy, inputs),
    );
  });
  it('preserves sub-microsecond ordering, exact freshness boundaries and invalid-calendar rejection', () => {
    const requested = '2026-01-01T10:00:00.000000500Z';
    const before: FxObservation = {
      id: 'before',
      baseCurrencyId: 'USD',
      quoteCurrencyId: 'EUR',
      rate: '0.8',
      observedAt: '2026-01-01T10:00:00.000000499Z',
      source: 'trusted',
    };
    const future: FxObservation = {
      ...before,
      id: 'future',
      rate: '0.9',
      observedAt: '2026-01-01T10:00:00.000000501Z',
    };
    expect(selectFxRate('USD', 'EUR', requested, policy, [future, before])).toMatchObject({
      state: 'available',
      value: { rate: '0.8', observationIds: ['before'] },
    });
    expect(instantNanoseconds(future.observedAt) - instantNanoseconds(before.observedAt)).toBe(2n);
    expect(
      selectFxRate('USD', 'EUR', at, { ...policy, maxAgeMilliseconds: 0 }, [
        { ...before, observedAt: at },
      ]).state,
    ).toBe('available');
    for (const invalid of [
      '2026-02-30T10:00:00Z',
      '2026-01-01',
      '2026-01-01T10:00:00+01:00',
      '2026-01-01T25:00:00Z',
    ])
      expect(() => instantNanoseconds(invalid)).toThrow();
  });
  it('rejects nonpositive/binary rates, duplicate observations and mismatched units', () => {
    for (const rate of ['0', '-1', 'NaN']) expect(() => fx('USD', 'EUR', rate)).toThrow();
    expect(() =>
      selectFxRate('USD', 'EUR', at, policy, [observations[0]!, observations[0]!]),
    ).toThrow('identities');
    expect(() =>
      translateAmount({ currencyId: 'USD', amount: '1' }, 'EUR', fx('EUR', 'USD', '1.25')),
    ).toThrow('direction');
    expect(() =>
      selectFxRate('USD', 'EUR', at, { ...policy, sourcePriority: ['trusted', 'trusted'] }, []),
    ).toThrow();
  });
});

describe('native balanced cash, settlement and exact correction replay', () => {
  const movement = (
    id: string,
    amount: string,
    accountId = 'A',
    currencyId = 'EUR',
    bucket: 'settled' | 'unsettled' = 'settled',
  ) =>
    makeCashMovementPostings({
      eventId: id,
      accountId,
      currencyId,
      economicAt: at,
      amount,
      bucketId: `${accountId}-${currencyId}-${bucket}`,
      bucket,
      classification: 'fixture',
    });
  it('keeps per-account/currency balances and excludes all control counterparts', () => {
    const entries = [
      ...movement('fund', '1000'),
      ...movement('buy', '-100', 'A', 'EUR', 'unsettled'),
      ...movement('fee', '-1', 'A', 'EUR', 'unsettled'),
      ...movement('other-account', '250', 'B'),
      ...movement('usd', '3', 'A', 'USD'),
    ];
    assertBalancedPostings(entries);
    expect(cashBalances(entries, { accountIds: ['A'] })).toEqual([
      {
        accountId: 'A',
        currencyId: 'EUR',
        bucketId: 'A-EUR-settled',
        bucket: 'settled',
        amount: '1000',
      },
      {
        accountId: 'A',
        currencyId: 'EUR',
        bucketId: 'A-EUR-unsettled',
        bucket: 'unsettled',
        amount: '-101',
      },
      {
        accountId: 'A',
        currencyId: 'USD',
        bucketId: 'A-USD-settled',
        bucket: 'settled',
        amount: '3',
      },
    ]);
    const settlement = makeSettlementPostings({
      eventId: 'settle',
      accountId: 'A',
      currencyId: 'EUR',
      economicAt: at,
      amount: '101',
      from: { bucketId: 'A-EUR-settled', bucket: 'settled' },
      to: { bucketId: 'A-EUR-unsettled', bucket: 'unsettled' },
    });
    expect(cashBalances([...entries, ...settlement], { accountIds: ['A'] })).toEqual([
      {
        accountId: 'A',
        currencyId: 'EUR',
        bucketId: 'A-EUR-settled',
        bucket: 'settled',
        amount: '899',
      },
      {
        accountId: 'A',
        currencyId: 'EUR',
        bucketId: 'A-EUR-unsettled',
        bucket: 'unsettled',
        amount: '0',
      },
      {
        accountId: 'A',
        currencyId: 'USD',
        bucketId: 'A-USD-settled',
        bucket: 'settled',
        amount: '3',
      },
    ]);
  });
  it('includes the original, its exact reversal and replacement in cash without a phantom extra refund', () => {
    const original = movement('original', '-1000');
    const reversed = reversePostings(original, 'reversal');
    const replacement = movement('replacement', '-900');
    expect(reversed.map((p) => p.amount)).toEqual(['1000', '-1000']);
    expect(cashBalances([...original, ...reversed, ...replacement])[0]?.amount).toBe('-900');
    expect(() => reversePostings(original, 'original')).toThrow();
    expect(() => cashBalances([...original, ...original])).toThrow('duplicate');
  });
  it('cannot balance currencies against each other or accept unbalanced/isolated effects', () => {
    const invalid: FinancialPosting[] = [
      movement('event', '100')[0]!,
      { ...movement('event', '-100', 'A', 'USD')[0]!, id: 'usd-leg' },
    ];
    expect(() => assertBalancedPostings(invalid)).toThrow('balance');
    expect(() => assertBalancedPostings([movement('single', '100')[0]!])).toThrow('balance');
    expect(() =>
      assertBalancedPostings([
        ...movement('x', '100'),
        { ...movement('x', '100')[1]!, id: 'another' },
      ]),
    ).toThrow('balance');
  });
  it('supports one FX event with distinct original-currency legs and a separate third-currency fee', () => {
    const entries = [
      ...movement('fx-event', '-1000', 'A', 'EUR'),
      ...movement('fx-event', '1250', 'A', 'USD'),
      ...movement('fx-event', '-0.01', 'A', 'GBP'),
    ];
    expect(() => assertBalancedPostings(entries)).not.toThrow();
    expect(cashBalances(entries).map(({ currencyId, amount }) => ({ currencyId, amount }))).toEqual(
      [
        { currencyId: 'EUR', amount: '-1000' },
        { currencyId: 'GBP', amount: '-0.01' },
        { currencyId: 'USD', amount: '1250' },
      ],
    );
  });
});

describe('signed valuation and nonduplicated cost/NAV accounting (F-11/F-16)', () => {
  it('values known cash and gross marked holdings without deducting carried fees twice', () => {
    const result = calculateNav({
      reportingCurrencyId: 'USD',
      sourceRevision: '7',
      asOf: at,
      components: [
        {
          id: 'cash',
          kind: 'cash',
          currencyId: 'USD',
          amount: '-3.34',
          rate: fx('USD', 'USD', '1'),
        },
        {
          id: 'holding',
          kind: 'holding',
          currencyId: 'USD',
          amount: '3.9996',
          rate: fx('USD', 'USD', '1'),
        },
      ],
    });
    expect(result).toMatchObject({
      state: 'available',
      value: { currencyId: 'USD', amount: '0.6596' },
      roundingResidual: '0',
      sourceRevision: '7',
    });
  });
  it('produces a disclosed partial subtotal when marks or third-currency FX are missing', () => {
    const result = calculateNav({
      reportingCurrencyId: 'EUR',
      sourceRevision: '8',
      asOf: at,
      components: [
        {
          id: 'known',
          kind: 'cash',
          currencyId: 'EUR',
          amount: '497',
          rate: fx('EUR', 'EUR', '1'),
        },
        { id: 'missing-mark', kind: 'holding', currencyId: 'USD', rate: fx('USD', 'EUR', '0.95') },
        { id: 'missing-rate', kind: 'cash', currencyId: 'GBP', amount: '2', rate: unavailable },
      ],
    });
    expect(result).toMatchObject({
      state: 'partial',
      availableSubtotal: { amount: '497' },
      reasons: ['missing_mark', 'missing_fx'],
    });
    expect(result).not.toHaveProperty('value');
    expect(() =>
      calculateNav({
        reportingCurrencyId: 'EUR',
        sourceRevision: '1',
        asOf: at,
        components: [
          {
            id: 'bad',
            kind: 'cash',
            currencyId: 'USD',
            amount: '1',
            rate: fx('USD', 'EUR', '0.8', '2026-01-01T09:00:00Z'),
          },
        ],
      }),
    ).toThrow('instants');
  });
  it('retains the correct signed short holding FX and separately owned short proceeds', () => {
    const startAt = '2026-01-01T08:00:00Z',
      openAt = '2026-01-01T09:00:00Z';
    expect(
      holdingFx({
        nativeCurrencyId: 'USD',
        reportingCurrencyId: 'EUR',
        signedBasis: '-1000',
        signedValue: '-900',
        basisRate: fx('USD', 'EUR', '0.8', openAt),
        endRate: fx('USD', 'EUR', '0.9'),
      }),
    ).toMatchObject({
      state: 'available',
      value: {
        nativeGross: '100',
        reportingTrading: '90',
        holdingFx: '-100',
        totalReportingGross: '-10',
      },
    });
    expect(
      cashFx({
        currencyId: 'USD',
        reportingCurrencyId: 'EUR',
        startAt,
        endAt: at,
        openingBalance: '0',
        endingBalance: '1000',
        openingRate: fx('USD', 'EUR', '0.8', startAt),
        endingRate: fx('USD', 'EUR', '0.9'),
        movements: [
          {
            id: 'short-proceeds',
            amount: '1000',
            economicAt: openAt,
            rate: fx('USD', 'EUR', '0.8', openAt),
          },
        ],
        complete: true,
      }),
    ).toMatchObject({ state: 'available', value: { amount: '100' } });
    expect(
      calculateNav({
        reportingCurrencyId: 'EUR',
        asOf: at,
        sourceRevision: '9',
        components: [
          {
            id: 'proceeds',
            kind: 'cash',
            currencyId: 'USD',
            amount: '1000',
            rate: fx('USD', 'EUR', '0.9'),
          },
          {
            id: 'short-liability',
            kind: 'holding',
            currencyId: 'USD',
            amount: '-900',
            rate: fx('USD', 'EUR', '0.9'),
          },
        ],
      }),
    ).toMatchObject({ state: 'available', value: { amount: '90' } });
  });
  it('computes negative monetary cash FX and refuses incomplete movement coverage', () => {
    const startAt = '2026-01-01T08:00:00Z',
      fundAt = '2026-01-01T09:00:00Z';
    const input = {
      currencyId: 'USD',
      reportingCurrencyId: 'EUR',
      startAt,
      endAt: at,
      openingBalance: '-100',
      endingBalance: '-60',
      openingRate: fx('USD', 'EUR', '0.8', startAt),
      endingRate: fx('USD', 'EUR', '1'),
      movements: [
        {
          id: 'external-funding',
          amount: '40',
          economicAt: fundAt,
          rate: fx('USD', 'EUR', '0.9', fundAt),
        },
      ],
      complete: true,
    };
    expect(cashFx(input)).toMatchObject({ state: 'available', value: { amount: '-16' } });
    expect(cashFx({ ...input, movements: [] })).toMatchObject({
      state: 'unavailable',
      reasons: ['incomplete_cash'],
    });
    expect(cashFx({ ...input, complete: false })).toMatchObject({
      state: 'unavailable',
      reasons: ['incomplete_cash'],
    });
    expect(() => cashFx({ ...input, movements: [...input.movements, ...input.movements] })).toThrow(
      'Duplicate',
    );
    expect(
      cashFx({ ...input, movements: [{ ...input.movements[0]!, rate: unavailable }] }),
    ).toMatchObject({ state: 'unavailable', reasons: ['missing_fx'] });
  });
  it('keeps the actual exchange rate separate from reference-rate execution difference', () => {
    expect(
      conversionDifference({
        sourceCurrencyId: 'EUR',
        destinationCurrencyId: 'USD',
        sourceAmount: '500',
        destinationAmount: '650',
        reportingCurrencyId: 'EUR',
        sourceRate: fx('EUR', 'EUR', '1'),
        destinationRate: fx('USD', 'EUR', '0.75'),
      }),
    ).toMatchObject({
      state: 'available',
      value: {
        impliedActualRate: '1.3',
        executionDifference: { currencyId: 'EUR', amount: '-12.5' },
      },
    });
    expect(() =>
      conversionDifference({
        sourceCurrencyId: 'EUR',
        destinationCurrencyId: 'USD',
        sourceAmount: '0',
        destinationAmount: '650',
        reportingCurrencyId: 'EUR',
        sourceRate: fx('EUR', 'EUR', '1'),
        destinationRate: fx('USD', 'EUR', '0.75'),
      }),
    ).toThrow();
  });
  it('keeps cross-component output rounding as a named residual rather than market P&L', () => {
    const components = [
      {
        id: 'a',
        kind: 'cash' as const,
        currencyId: 'USD',
        amount: '0.000000000000000000000000000000000001',
        rate: fx('USD', 'EUR', '0.5'),
      },
      {
        id: 'b',
        kind: 'cash' as const,
        currencyId: 'USD',
        amount: '0.000000000000000000000000000000000001',
        rate: fx('USD', 'EUR', '0.5'),
      },
    ];
    expect(
      calculateNav({ reportingCurrencyId: 'EUR', asOf: at, sourceRevision: '1', components }),
    ).toMatchObject({
      state: 'available',
      value: { amount: '0.000000000000000000000000000000000001' },
      roundingResidual: '0.000000000000000000000000000000000001',
    });
  });
});
