import { describe, expect, it } from 'vitest';
import {
  assertBalancedPostings,
  calculateNav,
  cashBalances,
  conversionDifference,
  INVENTORY_CALCULATION_MANIFEST,
  makeCashMovementPostings,
  makeSettlementPostings,
  originalRiskR,
  replayInventory,
  selectFxRate,
  sumDecimals,
  unavailableJournalMetric,
  valueInventory,
  type FinancialPosting,
  type FxRateSelection,
  type InventoryFill,
  type InventoryMetric,
  type InventoryReplayInput,
  type InventorySource,
  type NavComponent,
} from '../../packages/domain/src/index.js';
import { createInstrumentInputSchema } from '../../packages/server/src/financial/catalog.js';
import type { CreateInstrumentInput } from '../../packages/server/src/financial/catalog-types.js';
import {
  supportsNativeShortInventory,
  validateNativeInstrumentMetadata,
} from '../../packages/server/src/financial/reference-data.js';

const USD = '00000000-0000-4000-8000-000000000001';
const EUR = '00000000-0000-4000-8000-000000000002';
const ACCOUNT = '00000000-0000-4000-8000-000000000003';
const WORKSPACE = '00000000-0000-4000-8000-000000000004';
const INSTRUMENT = '00000000-0000-4000-8000-000000000005';
const VERSION = '00000000-0000-4000-8000-000000000006';
const AT = '2026-01-02T12:00:00.000001Z';
const MARK_AT = '2026-01-02T13:00:00.000001Z';
const FX_POLICY = { id: 'asset-fixture-fx/1', maxAgeMilliseconds: 0, sourcePriority: ['fixture'] };

function instrument(changes: Partial<CreateInstrumentInput> = {}): CreateInstrumentInput {
  return createInstrumentInputSchema.parse({
    name: 'Independently identified fixture instrument',
    family: 'stock',
    subtype: 'ordinary-share',
    economicIdentity: 'fixture:ordinary-share',
    quantityUnit: 'share',
    quoteCurrencyId: USD,
    settlementCurrencyId: USD,
    multiplier: '1',
    quantityIncrement: '0.0001',
    priceIncrement: '0.000001',
    capability: 'native-linear',
    effectiveAt: AT,
    metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
    ...changes,
  });
}

function fill(
  id: string,
  sequence: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  bookedPrincipal: string | null,
  fee: string,
  multiplier = '1',
): InventoryFill {
  return {
    kind: 'fill',
    id,
    effectId: `effect:${id}`,
    sourceRevision: sequence,
    economicOrder: { instant: AT, sequence },
    side,
    quantity,
    price,
    multiplier,
    bookedPrincipal,
    costs: fee === '0' ? [] : [{ id: `fee:${id}`, currencyId: USD, amount: fee, chargedAt: AT }],
    costsComplete: true,
  };
}

function inventoryInput(
  metadata: CreateInstrumentInput,
  sources: readonly InventorySource[],
  nativeInventory = metadata.capability === 'native-linear',
): InventoryReplayInput {
  validateNativeInstrumentMetadata(metadata.family, metadata.subtype, metadata);
  return {
    scope: {
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      instrumentId: INSTRUMENT,
      instrumentVersionId: VERSION,
      unitVersionId: VERSION,
      settlementCurrencyId: metadata.settlementCurrencyId,
    },
    manifest: INVENTORY_CALCULATION_MANIFEST,
    policy: 'fifo',
    capability: {
      subtype: metadata.subtype,
      nativeInventory,
      shortSupported: supportsNativeShortInventory(metadata.family, metadata.metadata),
      averageCostSupported: nativeInventory,
    },
    sources,
    sourceRevision: '100',
  };
}

function metricValue(metric: InventoryMetric): string {
  expect(metric.status).toBe('available');
  expect(metric.reasons).toEqual([]);
  expect(metric.value).not.toBeNull();
  return metric.value!;
}

function cash(id: string, amount: string, currencyId = USD, classification = 'actual-cash') {
  return makeCashMovementPostings({
    eventId: id,
    accountId: ACCOUNT,
    currencyId,
    economicAt: AT,
    amount,
    bucketId: `settled:${currencyId}`,
    bucket: 'settled',
    classification,
  });
}

function fx(currencyId: string): FxRateSelection {
  return selectFxRate(currencyId, USD, MARK_AT, FX_POLICY, [
    {
      id: 'fixture:eur-usd',
      baseCurrencyId: EUR,
      quoteCurrencyId: USD,
      rate: '1.25',
      observedAt: MARK_AT,
      source: 'fixture',
    },
  ]);
}

function cashNav(postings: readonly FinancialPosting[], additional: readonly NavComponent[] = []) {
  assertBalancedPostings(postings);
  return calculateNav({
    reportingCurrencyId: USD,
    asOf: MARK_AT,
    sourceRevision: '100',
    components: [
      ...cashBalances(postings).map((balance) => ({
        id: balance.bucketId,
        kind: 'cash' as const,
        currencyId: balance.currencyId,
        amount: balance.amount,
        rate: fx(balance.currencyId),
      })),
      ...additional,
    ],
  });
}

describe('independently calculated delivered asset examples', () => {
  it('stocks: fractional shares conserve actual cash, FIFO basis, fees and marked equity', () => {
    const result = replayInventory(
      inventoryInput(instrument(), [
        fill('share-buy', '1', 'buy', '1.25', '80', '100', '0.5'),
        fill('share-sale', '2', 'sell', '0.5', '100', '50', '0.2'),
      ]),
    );
    // Sell 0.5/1.25 of the $100 principal and $0.50 entry fee:
    // realized = $50 - $40 - $0.20 - $0.20 = $9.60.
    expect(metricValue(result.openQuantity)).toBe('0.75');
    expect(metricValue(result.averageEntryPrice)).toBe('80');
    expect(metricValue(result.grossBasis)).toBe('60');
    expect(metricValue(result.netBasis)).toBe('60.3');
    expect(metricValue(result.realizedGross)).toBe('10');
    expect(metricValue(result.realizedNet)).toBe('9.6');
    const marked = valueInventory(result, {
      mark: { id: 'share-mark', price: '90', multiplier: '1', instant: MARK_AT },
    });
    expect(metricValue(marked.markedValue)).toBe('67.5');
    expect(metricValue(marked.unrealizedGross)).toBe('7.5');
    expect(metricValue(marked.unrealizedNet)).toBe('7.2');
    const postings = [
      ...cash('share-deposit', '500', USD, 'external-deposit'),
      ...cash('share-buy-principal', '-100'),
      ...cash('share-buy-fee', '-0.5', USD, 'fee'),
      ...cash('share-sale-principal', '50'),
      ...cash('share-sale-fee', '-0.2', USD, 'fee'),
    ];
    expect(cashBalances(postings)[0]!.amount).toBe('449.3');
    expect(
      cashNav(postings, [
        {
          id: 'share-holding',
          kind: 'holding',
          currencyId: USD,
          amount: metricValue(marked.markedValue),
          rate: fx(USD),
        },
      ]),
    ).toMatchObject({ state: 'available', value: { amount: '516.8', currencyId: USD } });
    expect(sumDecimals([result.realizedNet.value!, marked.unrealizedNet.value!])).toBe('16.8');
  });

  it('ETFs: share accounting does not create additional ownership of underlying holdings', () => {
    const etf = instrument({
      family: 'etf',
      subtype: 'ordinary-etf',
      economicIdentity: 'fixture:fund-share',
    });
    const result = replayInventory(
      inventoryInput(etf, [
        fill('etf-buy-a', '1', 'buy', '2.4', '125', '300', '1.2'),
        fill('etf-buy-b', '2', 'buy', '1.6', '150', '240', '0.8'),
        fill('etf-sale', '3', 'sell', '3', '160', '480', '1.5'),
      ]),
    );
    // FIFO consumes $300 + 0.6*$150 = $390. Fees attributed to
    // the sale are $1.20 + $0.30 + $1.50 = $3; $0.50 stays open.
    expect(metricValue(result.openQuantity)).toBe('1');
    expect(metricValue(result.grossBasis)).toBe('150');
    expect(metricValue(result.averageEntryPrice)).toBe('150');
    expect(metricValue(result.realizedGross)).toBe('90');
    expect(metricValue(result.realizedNet)).toBe('87');
    const marked = valueInventory(result, {
      mark: { id: 'etf-mark', price: '155', multiplier: '1', instant: MARK_AT },
    });
    expect(metricValue(marked.unrealizedGross)).toBe('5');
    expect(metricValue(marked.unrealizedNet)).toBe('4.5');
    const postings = [
      ...cash('etf-deposit', '1000', USD, 'external-deposit'),
      ...cash('etf-buy-a-principal', '-300'),
      ...cash('etf-buy-a-fee', '-1.2', USD, 'fee'),
      ...cash('etf-buy-b-principal', '-240'),
      ...cash('etf-buy-b-fee', '-0.8', USD, 'fee'),
      ...cash('etf-sale-principal', '480'),
      ...cash('etf-sale-fee', '-1.5', USD, 'fee'),
    ];
    const nav = cashNav(postings, [
      {
        id: 'etf-share-holding',
        kind: 'holding',
        currencyId: USD,
        amount: metricValue(marked.markedValue),
        rate: fx(USD),
      },
    ]);
    expect(cashBalances(postings)[0]!.amount).toBe('936.5');
    expect(nav).toMatchObject({ state: 'available', value: { amount: '1091.5' } });
    if (nav.state !== 'available') throw new Error('Expected complete ETF fixture NAV');
    expect(nav.components.map((component) => component.id)).toEqual([
      `settled:${USD}`,
      'etf-share-holding',
    ]);
    expect(sumDecimals([result.realizedNet.value!, marked.unrealizedNet.value!])).toBe('91.5');
  });

  it('crypto: 18-place token inventory retains exact quantities and independently booked fees', () => {
    const token = instrument({
      family: 'crypto_spot',
      subtype: 'non-rebasing-spot',
      economicIdentity: 'fixture:chain:token',
      quantityUnit: 'token',
      quantityIncrement: '0.000000000000000001',
      priceIncrement: '1',
      metadata: {
        priceConvention: 'unit-price',
        settlementStyle: 'delivered',
        rebasing: false,
        network: 'fixture-chain',
        contractAddress: 'fixture-token',
      },
    });
    const result = replayInventory(
      inventoryInput(token, [
        fill('token-buy', '1', 'buy', '0.000000000000000003', '1000000000000000000', '3', '0.03'),
        fill('token-sale', '2', 'sell', '0.000000000000000001', '2000000000000000000', '2', '0.01'),
      ]),
    );
    // Source scalars deliberately make each atomic token unit worth $1 on
    // entry and $2 on sale. This is a precision fixture, not a market sample.
    expect(metricValue(result.openQuantity)).toBe('0.000000000000000002');
    expect(metricValue(result.averageEntryPrice)).toBe('1000000000000000000');
    expect(metricValue(result.grossBasis)).toBe('2');
    expect(metricValue(result.realizedGross)).toBe('1');
    expect(metricValue(result.realizedNet)).toBe('0.98');
    const marked = valueInventory(result, {
      mark: { id: 'token-mark', price: '1500000000000000000', multiplier: '1', instant: MARK_AT },
    });
    expect(metricValue(marked.markedValue)).toBe('3');
    expect(metricValue(marked.unrealizedNet)).toBe('0.98');
    const postings = [
      ...cash('token-deposit', '10', USD, 'external-deposit'),
      ...cash('token-buy-principal', '-3'),
      ...cash('token-buy-fee', '-0.03', USD, 'fee'),
      ...cash('token-sale-principal', '2'),
      ...cash('token-sale-fee', '-0.01', USD, 'fee'),
    ];
    expect(cashBalances(postings)[0]!.amount).toBe('8.96');
    expect(
      cashNav(postings, [
        {
          id: 'token-inventory',
          kind: 'holding',
          currencyId: USD,
          amount: metricValue(marked.markedValue),
          rate: fx(USD),
        },
      ]),
    ).toMatchObject({
      state: 'available',
      value: { amount: '11.96' },
    });
    expect(sumDecimals([result.realizedNet.value!, marked.unrealizedNet.value!])).toBe('1.96');
    expect(supportsNativeShortInventory(token.family, token.metadata)).toBe(false);
  });

  it('forex: a delivered exchange creates two cash legs, an explicit fee, and no additional pair NAV', () => {
    const postings = [
      ...cash('fx-deposit', '1000', USD, 'external-deposit'),
      ...cash('fx-deliver-usd', '-125', USD, 'conversion-principal'),
      ...cash('fx-receive-eur', '100', EUR, 'conversion-principal'),
      ...cash('fx-fee', '-1', USD, 'fee'),
    ];
    assertBalancedPostings(postings);
    const balances = cashBalances(postings);
    expect(balances.find((balance) => balance.currencyId === USD)!.amount).toBe('874');
    expect(balances.find((balance) => balance.currencyId === EUR)!.amount).toBe('100');
    // Actual conversion rate is EUR per USD, 100/125 = 0.8.
    // The mark convention is USD per EUR, 1.25: exchanged value is $125
    // on both sides. Only the separately charged $1 reduces equity.
    expect(
      conversionDifference({
        sourceCurrencyId: USD,
        destinationCurrencyId: EUR,
        sourceAmount: '125',
        destinationAmount: '100',
        reportingCurrencyId: USD,
        sourceRate: fx(USD),
        destinationRate: fx(EUR),
      }),
    ).toMatchObject({
      state: 'available',
      value: { impliedActualRate: '0.8', executionDifference: { currencyId: USD, amount: '0' } },
    });
    const nav = cashNav(postings);
    expect(nav).toMatchObject({ state: 'available', value: { currencyId: USD, amount: '999' } });
    if (nav.state !== 'available') throw new Error('Expected complete delivered FX fixture NAV');
    expect(nav.components).toHaveLength(2);
    expect(nav.components.map((component) => component.id)).toEqual([
      `settled:${USD}`,
      `settled:${EUR}`,
    ]);
    const pair = instrument({
      family: 'forex',
      subtype: 'delivered-spot',
      quantityUnit: 'base-currency',
      capability: 'manual',
      multiplier: null,
      metadata: {
        baseCurrencyId: EUR,
        quoteCurrencyId: USD,
        priceConvention: 'quote-per-base',
        settlementStyle: 'delivered',
      },
    });
    expect(() =>
      validateNativeInstrumentMetadata(pair.family, pair.subtype, {
        ...pair,
        capability: 'native-linear',
        multiplier: '1',
      }),
    ).toThrow('Unsupported automatic convention');
  });
});

const MANUAL_FIXTURES = [
  {
    family: 'option',
    subtype: 'equity-option',
    quantityUnit: 'contract',
    multiplier: '100',
    metadata: {
      option: {
        putCall: 'call',
        strike: '50',
        expiry: '2026-06-19',
        exerciseStyle: 'american',
        settlementStyle: 'physical',
        deliverable: { instrumentIdentity: 'fixture:ordinary-share', quantity: '100' },
      },
      priceConvention: 'premium-per-underlying-unit',
      settlementStyle: 'premium',
    },
    sources: [
      fill('option-buy', '1', 'buy', '2', '1.5', '300', '2', '100'),
      fill('option-sale', '2', 'sell', '1', '2', '200', '1', '100'),
    ],
    cashMovements: [
      cash('option-deposit', '1000', USD, 'external-deposit'),
      cash('option-premium-paid', '-300', USD, 'actual-premium'),
      cash('option-buy-fee', '-2', USD, 'fee'),
      cash('option-premium-received', '200', USD, 'actual-premium'),
      cash('option-sale-fee', '-1', USD, 'fee'),
    ],
    quantity: '1',
    cashTotal: '897',
    markPrice: '2',
  },
  {
    family: 'future',
    subtype: 'linear-future',
    quantityUnit: 'contract',
    multiplier: '50',
    metadata: {
      future: {
        expiry: '2026-06-19',
        tickSize: '0.25',
        tickValue: '12.5',
        variationMargin: 'daily-cash',
        collateralCurrencyId: USD,
      },
      priceConvention: 'points',
      settlementStyle: 'variation-margin',
    },
    sources: [fill('future-open', '1', 'buy', '2', '5000', null, '5', '50')],
    cashMovements: [
      cash('future-deposit', '10000', USD, 'external-deposit'),
      makeSettlementPostings({
        eventId: 'future-margin-lock',
        accountId: ACCOUNT,
        currencyId: USD,
        economicAt: AT,
        amount: '5000',
        from: { bucketId: `settled:${USD}`, bucket: 'settled' },
        to: { bucketId: 'future-collateral', bucket: 'collateral' },
      }),
      cash('future-variation-margin', '1500', USD, 'actual-variation-margin'),
      cash('future-fee', '-5', USD, 'fee'),
    ],
    quantity: '2',
    cashTotal: '11495',
    markPrice: '5015',
  },
  {
    family: 'bond',
    subtype: 'fixed-rate-bond',
    quantityUnit: 'face-value',
    multiplier: '0.01',
    metadata: {
      bond: {
        faceCurrencyId: USD,
        couponRate: '0.05',
        maturity: '2030-06-19',
        dayCount: 'actual/actual',
        accruedInterest: '12',
        quotedPrice: 'clean',
      },
      priceConvention: 'percent-of-face',
      settlementStyle: 'dirty-price',
    },
    sources: [fill('bond-buy', '1', 'buy', '1000', '98.5', '997', '3', '0.01')],
    // $1,000 face at 98.5% is $985 clean; supplied accrued interest is
    // $12, so actual dirty principal is $997. A $3 fee and $25 coupon
    // with $5 withholding remain separately identified actual cash facts.
    cashMovements: [
      cash('bond-deposit', '2000', USD, 'external-deposit'),
      cash('bond-dirty-principal', '-997'),
      cash('bond-fee', '-3', USD, 'fee'),
      cash('bond-coupon', '25', USD, 'income'),
      cash('bond-withholding', '-5', USD, 'tax'),
    ],
    quantity: '1000',
    cashTotal: '1020',
    markPrice: '99',
  },
] satisfies readonly {
  family: string;
  subtype: string;
  quantityUnit: string;
  multiplier: string;
  metadata: NonNullable<CreateInstrumentInput['metadata']>;
  sources: readonly InventoryFill[];
  cashMovements: readonly FinancialPosting[][];
  quantity: string;
  cashTotal: string;
  markPrice: string;
}[];

describe('record-only examples never inherit delivered-share monetary accounting', () => {
  it.each(MANUAL_FIXTURES)(
    '$family: actual cash and quantity remain distinct from unavailable basis, P&L, valuation and R',
    (example) => {
      const metadata = instrument({
        family: example.family,
        subtype: example.subtype,
        economicIdentity: `fixture:${example.subtype}`,
        quantityUnit: example.quantityUnit,
        multiplier: example.multiplier,
        capability: 'manual',
        metadata: example.metadata,
      });
      const sourcesBefore = structuredClone(example.sources);
      const result = replayInventory(inventoryInput(metadata, example.sources));
      expect(metricValue(result.openQuantity)).toBe(example.quantity);
      for (const metric of [
        result.averageEntryPrice,
        result.grossBasis,
        result.netBasis,
        result.realizedGross,
        result.realizedNet,
      ]) {
        expect(metric).toMatchObject({
          status: 'unsupported',
          value: null,
          reasons: ['unsupported_inventory_module'],
        });
      }
      const marked = valueInventory(result, {
        mark: {
          id: `${example.family}:mark`,
          price: example.markPrice,
          multiplier: example.multiplier,
          instant: MARK_AT,
        },
      });
      for (const metric of [marked.markedValue, marked.unrealizedGross, marked.unrealizedNet]) {
        expect(metric).toMatchObject({
          status: 'unsupported',
          value: null,
          reasons: ['unsupported_inventory_module'],
        });
      }
      expect(example.sources).toEqual(sourcesBefore);
      const postings = example.cashMovements.flat();
      assertBalancedPostings(postings);
      expect(sumDecimals(cashBalances(postings).map((balance) => balance.amount))).toBe(
        example.cashTotal,
      );
      expect(
        cashNav(postings, [
          {
            id: `${example.family}:open-contract`,
            kind: 'holding',
            currencyId: USD,
            rate: fx(USD),
            unavailableReasons: ['unsupported'],
          },
        ]),
      ).toMatchObject({
        state: 'partial',
        availableSubtotal: { currencyId: USD, amount: example.cashTotal },
        missingReferences: [`${example.family}:open-contract`],
        reasons: ['unsupported'],
      });
      // Even a committed supplied risk and an explicit campaign closure cannot
      // turn unknown contract accounting into a calculated R performance value.
      expect(
        originalRiskR({
          originalRisk: { originalPlanId: 'fixture:original-plan', amount: '100', currencyId: USD },
          commitment: { timing: 'pre-trade', committedAtMicros: '1' },
          earliestExecutionMicros: '2',
          completed: true,
          closureReviewRequired: false,
          legResults: [unavailableJournalMetric(result.realizedNet.reasons, 'money', USD)],
          coverageReasons: [],
          financialSourceRevision: '100',
        }),
      ).toMatchObject({
        status: 'unavailable',
        value: null,
        reasons: ['unsupported_inventory_module'],
      });
      expect(() =>
        validateNativeInstrumentMetadata(metadata.family, metadata.subtype, {
          ...metadata,
          capability: 'native-linear',
        }),
      ).toThrow('Unsupported automatic convention');
      // A caller attempting to enable the generic module cannot bypass its
      // own subtype gate for these recorded contract quantities.
      expect(replayInventory(inventoryInput(metadata, example.sources, true))).toMatchObject({
        status: 'unsupported',
        reasons: ['unsupported_inventory_module'],
      });
    },
  );

  it('futures collateral stays owned cash, and no full-notional purchase is manufactured', () => {
    const example = MANUAL_FIXTURES[1]!;
    const balances = cashBalances(example.cashMovements.flat());
    expect(balances.find((balance) => balance.bucket === 'collateral')!.amount).toBe('5000');
    expect(balances.find((balance) => balance.bucket === 'settled')!.amount).toBe('6495');
    expect(example.sources[0]!.bookedPrincipal).toBeNull();
    // Notional would be 2 * 5000 * 50 = $500,000. It is exposure,
    // neither an actual cash debit nor an automatically owned asset.
    expect(sumDecimals(balances.map((balance) => balance.amount))).toBe('11495');
  });
});

describe('automatic unit/convention validation', () => {
  it.each([
    ['contract quantity', { quantityUnit: 'contract' }],
    ['non-unit multiplier', { multiplier: '100' }],
    [
      'percentage quote',
      { metadata: { priceConvention: 'percent-of-face', settlementStyle: 'delivered' } },
    ],
    [
      'reciprocal quote',
      { metadata: { priceConvention: 'reciprocal-price', settlementStyle: 'delivered' } },
    ],
    [
      'variation-margin settlement',
      { metadata: { priceConvention: 'unit-price', settlementStyle: 'variation-margin' } },
    ],
    ['different settlement currency', { settlementCurrencyId: EUR }],
  ] satisfies readonly (readonly [string, Partial<CreateInstrumentInput>])[])(
    'refuses %s before enabling a delivered-share formula',
    (_name, changes) => {
      const invalid = instrument(changes);
      expect(() =>
        validateNativeInstrumentMetadata(invalid.family, invalid.subtype, invalid),
      ).toThrow('Unsupported automatic convention');
    },
  );

  it.each([undefined, true])(
    'does not infer non-rebasing spot economics from a crypto family (%s)',
    (rebasing) => {
      const token = instrument({
        family: 'crypto_spot',
        subtype: 'non-rebasing-spot',
        quantityUnit: 'token',
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'delivered',
          ...(rebasing === undefined ? {} : { rebasing }),
        },
      });
      expect(() => validateNativeInstrumentMetadata(token.family, token.subtype, token)).toThrow(
        'Unsupported automatic convention',
      );
    },
  );
});
