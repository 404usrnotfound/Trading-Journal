import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assertBalancedPostings,
  allocateCampaignExecution,
  calculateNav,
  cashBalances,
  cashFx,
  conversionDifference,
  INVENTORY_CALCULATION_MANIFEST,
  makeCashMovementPostings,
  makeSettlementPostings,
  prepareHoldingTransfer,
  reconcileCampaignInventory,
  replayCampaignInventory,
  replayInventory,
  reversePostings,
  selectFxRate,
  sumDecimals,
  valueInventory,
  type FinancialPosting,
  type FinancialResult,
  type FxRateSelection,
  type InventoryFill,
  type InventoryCampaignAllocation,
  type InventoryReplayInput,
  type InventoryOpening,
  type InventoryPolicyTransition,
  type InventorySource,
} from '../../packages/domain/src/index.js';

// Expectations are transcribed from the independently worked Phase 2 fixtures.
// They deliberately cross cash, inventory and valuation boundaries; none is
// calculated by the implementation under test to manufacture an expected value.
const workspaceId = 'workspace-fixture';
const USD = 'currency-USD';
const EUR = 'currency-EUR';
const GBP = 'currency-GBP';
const accountA = 'account-A';
const accountB = 'account-B';
const firstInstant = '2026-01-01T10:00:00.000000001Z';
const secondInstant = '2026-01-01T10:00:00.000000002Z';
const endingInstant = '2026-01-01T11:00:00Z';
const openingInstant = '2026-01-01T09:00:00Z';

function rateAt(rate: string, instant: string, currencyId: string = USD): FxRateSelection {
  return selectFxRate(
    currencyId,
    EUR,
    instant,
    {
      id: 'independent-fixture-FX/1',
      maxAgeMilliseconds: 3_600_000,
      sourcePriority: ['reviewed-manual'],
    },
    currencyId === EUR
      ? []
      : [
          {
            id: `${currencyId}:${instant}:${rate}`,
            baseCurrencyId: currencyId,
            quoteCurrencyId: EUR,
            rate,
            observedAt: instant,
            source: 'reviewed-manual',
          },
        ],
  );
}

function available<T>(result: FinancialResult<T>): T {
  expect(result.state).toBe('available');
  if (result.state !== 'available')
    throw new Error(`Fixture unexpectedly unavailable: ${result.reasons.join(',')}`);
  return result.value;
}

function inventoryInput(sources: readonly InventorySource[]): InventoryReplayInput {
  return {
    scope: {
      workspaceId,
      accountId: accountA,
      instrumentId: 'instrument-ordinary-share',
      instrumentVersionId: 'metadata-v1',
      unitVersionId: 'share-unit-v1',
      settlementCurrencyId: USD,
    },
    manifest: {
      ...INVENTORY_CALCULATION_MANIFEST,
      lotPolicyVersion: 'fifo/1',
    },
    policy: 'fifo',
    capability: {
      subtype: 'ordinary-share',
      nativeInventory: true,
      shortSupported: true,
      averageCostSupported: true,
    },
    sources,
    sourceRevision: '2',
  };
}

function fill(input: {
  id: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  principal: string;
  instant: string;
  sequence?: string | null;
  fee?: string;
  feeCurrency?: string;
  reportingRate?: string;
}): InventoryFill {
  const reportingFx = input.reportingRate
    ? {
        observationId: `${input.id}-reporting-rate`,
        rate: input.reportingRate,
        baseCurrencyId: USD,
        quoteCurrencyId: EUR,
      }
    : undefined;
  return {
    id: input.id,
    effectId: `${input.id}-effect`,
    sourceRevision: '1',
    kind: 'fill',
    economicOrder: { instant: input.instant, sequence: input.sequence ?? null },
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    multiplier: '1',
    bookedPrincipal: input.principal,
    costs: input.fee
      ? [
          {
            id: `${input.id}-fee`,
            currencyId: input.feeCurrency ?? USD,
            amount: input.fee,
            chargedAt: input.instant,
            ...(reportingFx ? { reportingFx } : {}),
          },
        ]
      : [],
    ...(reportingFx ? { basisReportingFx: reportingFx } : {}),
  };
}

function moneyEffect(input: {
  id: string;
  amount: string;
  currencyId?: string;
  accountId?: string;
  bucket?: 'settled' | 'unsettled';
  classification: string;
  economicAt?: string;
}): FinancialPosting[] {
  const accountId = input.accountId ?? accountA;
  const currencyId = input.currencyId ?? EUR;
  const bucket = input.bucket ?? 'settled';
  return makeCashMovementPostings({
    eventId: input.id,
    accountId,
    currencyId,
    economicAt: input.economicAt ?? firstInstant,
    amount: input.amount,
    bucketId: `${accountId}:${currencyId}:${bucket}`,
    bucket,
    classification: input.classification,
  });
}

// Independent fixed-unit oracle for conservation properties. Integer division
// and source text stay outside the financial implementation under test.
function fixed36Text(units: bigint): string {
  const sign = units < 0n ? '-' : '';
  const magnitude = units < 0n ? -units : units;
  const denominator = 10n ** 36n;
  const fraction = (magnitude % denominator).toString().padStart(36, '0').replace(/0+$/u, '');
  return `${sign}${magnitude / denominator}${fraction ? `.${fraction}` : ''}`;
}

function attributedInventory(allocations: readonly InventoryCampaignAllocation[]) {
  const template = inventoryInput([]);
  return replayCampaignInventory({
    scope: template.scope,
    manifest: template.manifest,
    capability: template.capability,
    sourceRevision: template.sourceRevision,
    allocations,
  });
}

describe('independent financial acceptance fixtures across subsystem boundaries', () => {
  it('F-05 preserves actual FX amounts, cash and fee-inclusive partial-fill results', () => {
    const postings = [
      ...moneyEffect({ id: 'funding', amount: '10000', classification: 'external-contribution' }),
      ...moneyEffect({ id: 'conversion-1-EUR', amount: '-1000', classification: 'fx-principal' }),
      ...moneyEffect({
        id: 'conversion-1-USD',
        amount: '1250',
        currencyId: USD,
        classification: 'fx-principal',
      }),
      ...moneyEffect({ id: 'conversion-1-fee', amount: '-2', classification: 'fx-cost' }),
      ...moneyEffect({
        id: 'purchase-principal',
        amount: '-1050',
        currencyId: USD,
        classification: 'trade-principal',
      }),
      ...moneyEffect({
        id: 'purchase-fee',
        amount: '-2.10',
        currencyId: USD,
        classification: 'commission',
      }),
      ...moneyEffect({ id: 'conversion-2-EUR', amount: '-500', classification: 'fx-principal' }),
      ...moneyEffect({
        id: 'conversion-2-USD',
        amount: '650',
        currencyId: USD,
        classification: 'fx-principal',
      }),
      ...moneyEffect({ id: 'conversion-2-fee', amount: '-1', classification: 'fx-cost' }),
      ...moneyEffect({
        id: 'sale-principal',
        amount: '540',
        currencyId: USD,
        classification: 'trade-principal',
      }),
      ...moneyEffect({
        id: 'sale-fee',
        amount: '-1.08',
        currencyId: USD,
        classification: 'commission',
      }),
    ];
    assertBalancedPostings(postings);
    expect(cashBalances(postings)).toEqual([
      expect.objectContaining({ accountId: accountA, currencyId: EUR, amount: '8497' }),
      expect.objectContaining({ accountId: accountA, currencyId: USD, amount: '1386.82' }),
    ]);

    const sources = [
      fill({
        id: 'purchase',
        side: 'buy',
        quantity: '10.5',
        price: '100',
        principal: '1050',
        fee: '2.10',
        instant: firstInstant,
        reportingRate: '0.8',
      }),
      fill({
        id: 'sale',
        side: 'sell',
        quantity: '4.5',
        price: '120',
        principal: '540',
        fee: '1.08',
        instant: secondInstant,
        reportingRate: '0.75',
      }),
    ];
    const inventory = replayInventory(inventoryInput(sources));
    expect(inventory.openQuantity.value).toBe('6');
    expect(inventory.averageEntryPrice.value).toBe('100');
    expect(inventory.grossBasis.value).toBe('600');
    expect(inventory.realizedGross.value).toBe('90');
    expect(inventory.realizedNet.value).toBe('88.02');
    expect(inventory.lots.flatMap((lot) => lot.costs).map((cost) => cost.amount)).toEqual(['1.2']);

    const marked = valueInventory(inventory, {
      mark: { id: 'end-mark', price: '130', multiplier: '1', instant: endingInstant },
      reportingCurrencyId: EUR,
      markReportingFx: {
        observationId: 'end-rate',
        rate: '0.7',
        baseCurrencyId: USD,
        quoteCurrencyId: EUR,
      },
    });
    expect(marked.markedValue.value).toBe('780');
    expect(marked.reportingMarkedValue.value).toBe('546');
    expect(marked.unrealizedGross.value).toBe('180');
    expect(marked.unrealizedNet.value).toBe('178.8');
    expect(marked.realizedReportingTradingGross.value).toBe('67.5');
    expect(marked.realizedHoldingFx.value).toBe('-22.5');
    expect(marked.realizedReportingTradingNet.value).toBe('65.97');
    expect(marked.unrealizedReportingTradingGross.value).toBe('126');
    expect(marked.unrealizedHoldingFx.value).toBe('-60');
    expect(marked.unrealizedReportingTradingNet.value).toBe('125.04');

    const nativeCashFx = available(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt: endingInstant,
        openingBalance: '0',
        endingBalance: '1386.82',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('0.7', endingInstant),
        complete: true,
        movements: [
          {
            id: 'conversion-1',
            amount: '1250',
            economicAt: firstInstant,
            rate: rateAt('0.8', firstInstant),
          },
          {
            id: 'buy-principal',
            amount: '-1050',
            economicAt: firstInstant,
            rate: rateAt('0.8', firstInstant),
          },
          {
            id: 'buy-charge',
            amount: '-2.10',
            economicAt: firstInstant,
            rate: rateAt('0.8', firstInstant),
          },
          {
            id: 'conversion-2',
            amount: '650',
            economicAt: secondInstant,
            rate: rateAt('0.75', secondInstant),
          },
          {
            id: 'sell-principal',
            amount: '540',
            economicAt: secondInstant,
            rate: rateAt('0.75', secondInstant),
          },
          {
            id: 'sell-charge',
            amount: '-1.08',
            economicAt: secondInstant,
            rate: rateAt('0.75', secondInstant),
          },
        ],
      }),
    );
    expect(nativeCashFx).toEqual({ currencyId: EUR, amount: '-79.236' });
    const conversion1 = available(
      conversionDifference({
        sourceCurrencyId: EUR,
        destinationCurrencyId: USD,
        sourceAmount: '1000',
        destinationAmount: '1250',
        reportingCurrencyId: EUR,
        sourceRate: rateAt('1', firstInstant, EUR),
        destinationRate: rateAt('0.8', firstInstant),
      }),
    );
    const conversion2 = available(
      conversionDifference({
        sourceCurrencyId: EUR,
        destinationCurrencyId: USD,
        sourceAmount: '500',
        destinationAmount: '650',
        reportingCurrencyId: EUR,
        sourceRate: rateAt('1', secondInstant, EUR),
        destinationRate: rateAt('0.75', secondInstant),
      }),
    );
    expect(conversion1).toEqual({
      impliedActualRate: '1.25',
      executionDifference: { currencyId: EUR, amount: '0' },
    });
    expect(conversion2).toEqual({
      impliedActualRate: '1.3',
      executionDifference: { currencyId: EUR, amount: '-12.5' },
    });

    const nav = calculateNav({
      reportingCurrencyId: EUR,
      asOf: endingInstant,
      sourceRevision: '2',
      components: [
        {
          id: 'EUR-cash',
          kind: 'cash',
          currencyId: EUR,
          amount: '8497',
          rate: rateAt('1', endingInstant, EUR),
        },
        {
          id: 'USD-cash',
          kind: 'cash',
          currencyId: USD,
          amount: '1386.82',
          rate: rateAt('0.7', endingInstant),
        },
        {
          id: 'open-share-value',
          kind: 'holding',
          currencyId: USD,
          amount: marked.markedValue.value ?? 'invalid',
          rate: rateAt('0.7', endingInstant),
        },
      ],
    });
    expect(nav).toMatchObject({
      state: 'available',
      value: { currencyId: EUR, amount: '10013.774' },
      roundingResidual: '0',
    });
    expect(
      sumDecimals([
        marked.realizedReportingTradingNet.value ?? 'invalid',
        marked.unrealizedReportingTradingNet.value ?? 'invalid',
        marked.realizedHoldingFx.value ?? 'invalid',
        marked.unrealizedHoldingFx.value ?? 'invalid',
        nativeCashFx.amount,
        conversion2.executionDifference.amount,
        '-3',
      ]),
    ).toBe('13.774');

    // A new current observation changes the view; dated source fees/rates persist.
    expect(
      calculateNav({
        reportingCurrencyId: EUR,
        asOf: endingInstant,
        sourceRevision: '2',
        components: [
          {
            id: 'EUR-cash',
            kind: 'cash',
            currencyId: EUR,
            amount: '8497',
            rate: rateAt('1', endingInstant, EUR),
          },
          {
            id: 'USD-cash',
            kind: 'cash',
            currencyId: USD,
            amount: '1386.82',
            rate: rateAt('0.9', endingInstant),
          },
          {
            id: 'open-share-value',
            kind: 'holding',
            currencyId: USD,
            amount: '780',
            rate: rateAt('0.9', endingInstant),
          },
        ],
      }),
    ).toMatchObject({ state: 'available', value: { amount: '10447.138' } });
    expect(
      valueInventory(inventory, {
        mark: { id: 'end-mark', price: '130', multiplier: '1', instant: endingInstant },
        reportingCurrencyId: EUR,
        markReportingFx: {
          observationId: 'new-end-rate',
          rate: '0.9',
          baseCurrencyId: USD,
          quoteCurrencyId: EUR,
        },
      }).realizedReportingTradingNet.value,
    ).toBe('65.97');
    expect(replayInventory(JSON.parse(JSON.stringify(inventoryInput(sources))))).toEqual(inventory);
  });

  it('F-10 settlement moves buckets without posting a second principal or fee', () => {
    const preSettlement = [
      ...moneyEffect({ id: 'opening', amount: '1000', classification: 'opening' }),
      ...moneyEffect({
        id: 'buy',
        amount: '-100',
        bucket: 'unsettled',
        classification: 'trade-principal',
      }),
      ...moneyEffect({
        id: 'buy-fee',
        amount: '-1',
        bucket: 'unsettled',
        classification: 'commission',
      }),
    ];
    const settled = [
      ...preSettlement,
      ...makeSettlementPostings({
        eventId: 'actual-settlement',
        accountId: accountA,
        currencyId: EUR,
        economicAt: secondInstant,
        amount: '101',
        from: { bucketId: `${accountA}:${EUR}:settled`, bucket: 'settled' },
        to: { bucketId: `${accountA}:${EUR}:unsettled`, bucket: 'unsettled' },
      }),
    ];
    assertBalancedPostings(settled);
    expect(cashBalances(preSettlement)).toEqual([
      expect.objectContaining({ bucket: 'settled', amount: '1000' }),
      expect.objectContaining({ bucket: 'unsettled', amount: '-101' }),
    ]);
    expect(cashBalances(settled)).toEqual([
      expect.objectContaining({ bucket: 'settled', amount: '899' }),
      expect.objectContaining({ bucket: 'unsettled', amount: '0' }),
    ]);
    expect(sumDecimals(cashBalances(preSettlement).map((balance) => balance.amount))).toBe('899');
    expect(sumDecimals(cashBalances(settled).map((balance) => balance.amount))).toBe('899');
    expect(cashBalances(settled, { asOf: firstInstant })).toEqual(cashBalances(preSettlement));
  });

  it('F-07 keeps separate account balances and excludes transfer controls from cash', () => {
    const postings = [
      ...moneyEffect({ id: 'A-funding', amount: '1000', classification: 'external-contribution' }),
      ...moneyEffect({ id: 'A-purchase', amount: '-200', classification: 'trade-principal' }),
      ...moneyEffect({ id: 'A-purchase-fee', amount: '-2', classification: 'commission' }),
      ...moneyEffect({ id: 'transfer-A', amount: '-100', classification: 'internal-transfer' }),
      ...moneyEffect({
        id: 'transfer-B',
        amount: '100',
        accountId: accountB,
        classification: 'internal-transfer',
      }),
      ...moneyEffect({
        id: 'B-sale',
        amount: '50',
        accountId: accountB,
        classification: 'trade-principal',
      }),
      ...moneyEffect({
        id: 'B-sale-fee',
        amount: '-1',
        accountId: accountB,
        classification: 'commission',
      }),
    ];
    expect(cashBalances(postings)).toEqual([
      expect.objectContaining({ accountId: accountA, amount: '698' }),
      expect.objectContaining({ accountId: accountB, amount: '149' }),
    ]);
    expect(cashBalances(postings, { accountIds: [accountB] })).toEqual([
      expect.objectContaining({ accountId: accountB, amount: '149' }),
    ]);
    expect(sumDecimals(cashBalances(postings).map((balance) => balance.amount))).toBe('847');
    expect(cashBalances([...postings].reverse())).toEqual(cashBalances(postings));

    const purchase = fill({
      id: 'A-holding-acquisition',
      side: 'buy',
      quantity: '10',
      price: '20',
      principal: '200',
      fee: '2',
      feeCurrency: EUR,
      instant: firstInstant,
    });
    const sourceInput: InventoryReplayInput = {
      ...inventoryInput([purchase]),
      scope: { ...inventoryInput([]).scope, settlementCurrencyId: EUR },
      sourceRevision: '3',
    };
    const destinationScope = { ...sourceInput.scope, accountId: accountB };
    const pair = prepareHoldingTransfer(replayInventory(sourceInput), {
      transferId: 'holding-transfer-A-B',
      departureId: 'holding-departure-A',
      receiptId: 'holding-receipt-B',
      sourceRevision: '2',
      destinationSourceRevision: '2',
      destinationScope,
      economicOrder: { instant: secondInstant, sequence: null },
      selections: [
        { lotId: purchase.id, quantity: '4', destinationLotId: 'B-transferred-acquisition' },
      ],
    });
    const afterA = replayInventory({ ...sourceInput, sources: [purchase, pair.departure] });
    const afterB = replayInventory({
      ...sourceInput,
      scope: destinationScope,
      sources: [
        pair.receipt,
        {
          ...fill({
            id: 'B-sale-holding',
            side: 'sell',
            quantity: '2',
            price: '25',
            principal: '50',
            fee: '1',
            feeCurrency: EUR,
            instant: endingInstant,
          }),
          sourceRevision: '3',
        },
      ],
    });
    const mark = {
      id: 'consolidated-share-mark',
      price: '25',
      multiplier: '1',
      instant: '2026-01-01T12:00:00Z',
    };
    const valuationA = valueInventory(afterA, { mark });
    const valuationB = valueInventory(afterB, { mark });
    expect(afterA.openQuantity.value).toBe('6');
    expect(afterB.openQuantity.value).toBe('2');
    expect(afterA.grossBasis.value).toBe('120');
    expect(afterB.grossBasis.value).toBe('40');
    expect(afterB.realizedNet.value).toBe('8.6');
    expect(valuationA.unrealizedNet.value).toBe('28.8');
    expect(valuationB.unrealizedNet.value).toBe('9.6');
    expect(afterA.matches).toHaveLength(0);
    expect(afterB.matches[0]?.openingSourceId).toBe(purchase.id);
    expect(afterB.lots[0]?.economicOrder).toEqual(purchase.economicOrder);
    expect(sumDecimals([valuationA.markedValue.value!, valuationB.markedValue.value!, '847'])).toBe(
      '1047',
    );
    expect(
      sumDecimals([
        afterA.realizedNet.value!,
        afterB.realizedNet.value!,
        valuationA.unrealizedNet.value!,
        valuationB.unrealizedNet.value!,
      ]),
    ).toBe('47');
    expect(
      sumDecimals([
        ...afterA.lots
          .flatMap((lot) => lot.costs)
          .filter((cost) => cost.id === `${purchase.id}-fee`)
          .map((cost) => cost.amount),
        ...afterB.lots
          .flatMap((lot) => lot.costs)
          .filter((cost) => cost.id === `${purchase.id}-fee`)
          .map((cost) => cost.amount),
        ...afterB.matches
          .flatMap((match) => match.entryCosts)
          .filter((cost) => cost.id === `${purchase.id}-fee`)
          .map((cost) => cost.amount),
      ]),
    ).toBe('2');
  });

  it.each(['fifo', 'average', 'specific'] as const)(
    'F-03 reconciles fractional scaling under %s to one cash/NAV population',
    (policy) => {
      const buyA = fill({
        id: 'fractional-buy-A',
        side: 'buy',
        quantity: '1.25',
        price: '80',
        principal: '100',
        fee: '0.50',
        instant: firstInstant,
      });
      const buyB = fill({
        id: 'fractional-buy-B',
        side: 'buy',
        quantity: '0.75',
        price: '120',
        principal: '90',
        fee: '0.30',
        instant: secondInstant,
      });
      const sale: InventoryFill = {
        ...fill({
          id: 'fractional-scale-out',
          side: 'sell',
          quantity: '1',
          price: '130',
          principal: '130',
          fee: '0.40',
          instant: endingInstant,
        }),
        ...(policy === 'specific'
          ? {
              specificLots: [
                { lotId: buyB.id, quantity: '0.75' },
                { lotId: buyA.id, quantity: '0.25' },
              ],
            }
          : {}),
      };
      const cash = [
        ...moneyEffect({
          id: 'fractional-cash-A',
          amount: '-100',
          currencyId: USD,
          classification: 'trade-principal',
        }),
        ...moneyEffect({
          id: 'fractional-fee-A',
          amount: '-0.50',
          currencyId: USD,
          classification: 'commission',
        }),
        ...moneyEffect({
          id: 'fractional-cash-B',
          amount: '-90',
          currencyId: USD,
          classification: 'trade-principal',
        }),
        ...moneyEffect({
          id: 'fractional-fee-B',
          amount: '-0.30',
          currencyId: USD,
          classification: 'commission',
        }),
        ...moneyEffect({
          id: 'fractional-cash-sale',
          amount: '130',
          currencyId: USD,
          classification: 'trade-principal',
        }),
        ...moneyEffect({
          id: 'fractional-fee-sale',
          amount: '-0.40',
          currencyId: USD,
          classification: 'commission',
        }),
      ];
      const input = { ...inventoryInput([sale, buyB, buyA]), policy };
      const inventory = replayInventory(input);
      const marked = valueInventory(inventory, {
        mark: {
          id: 'fractional-mark',
          price: '125',
          multiplier: '1',
          instant: '2026-01-01T12:00:00Z',
        },
      });
      expect(inventory.openQuantity.value).toBe('1');
      expect(cashBalances(cash)[0]?.amount).toBe('-61.2');
      expect(sumDecimals([inventory.realizedNet.value!, marked.unrealizedNet.value!])).toBe('63.8');
      expect(sumDecimals([cashBalances(cash)[0]!.amount, marked.markedValue.value!])).toBe('63.8');
      const finalFill: InventoryFill = {
        ...fill({
          id: 'fractional-final-sale',
          side: 'sell',
          quantity: '1',
          price: '125',
          principal: '125',
          fee: '0.50',
          instant: '2026-01-01T12:00:00Z',
        }),
        ...(policy === 'specific' ? { specificLots: [{ lotId: buyA.id, quantity: '1' }] } : {}),
      };
      const final = replayInventory({ ...input, sources: [...input.sources, finalFill] });
      const finalCash = cashBalances([
        ...cash,
        ...moneyEffect({
          id: 'fractional-final-cash',
          amount: '125',
          currencyId: USD,
          classification: 'trade-principal',
        }),
        ...moneyEffect({
          id: 'fractional-final-fee',
          amount: '-0.50',
          currencyId: USD,
          classification: 'commission',
        }),
      ]);
      expect(final.openQuantity.value).toBe('0');
      expect(final.grossBasis.value).toBe('0');
      expect(final.realizedNet.value).toBe('63.3');
      expect(finalCash[0]?.amount).toBe('63.3');
    },
  );

  it('F-09 permits an observed NAV change while unknown opening basis keeps lifetime P&L unavailable', () => {
    const opening: InventoryOpening = {
      kind: 'opening',
      id: 'unknown-opening',
      effectId: 'unknown-opening-effect',
      sourceRevision: '1',
      economicOrder: { instant: firstInstant, sequence: null },
      direction: 'long',
      quantity: '5',
      multiplier: '1',
      entryPrice: null,
      bookedPrincipal: null,
      costs: [],
    };
    const openingInventory = replayInventory(inventoryInput([opening]));
    const openingValue = valueInventory(openingInventory, {
      mark: { id: 'opening-known-mark', price: '12', multiplier: '1', instant: firstInstant },
    });
    expect(openingValue.markedValue.value).toBe('60');
    const sold = replayInventory(
      inventoryInput([
        opening,
        fill({
          id: 'unknown-basis-sale',
          side: 'sell',
          quantity: '2',
          price: '15',
          principal: '30',
          fee: '1',
          instant: secondInstant,
        }),
      ]),
    );
    const endingValue = valueInventory(sold, {
      mark: { id: 'ending-known-mark', price: '12', multiplier: '1', instant: endingInstant },
    });
    const balances = cashBalances([
      ...moneyEffect({
        id: 'unknown-basis-opening-cash',
        amount: '100',
        currencyId: USD,
        classification: 'opening',
      }),
      ...moneyEffect({
        id: 'unknown-basis-proceeds',
        amount: '30',
        currencyId: USD,
        classification: 'trade-principal',
      }),
      ...moneyEffect({
        id: 'unknown-basis-fee',
        amount: '-1',
        currencyId: USD,
        classification: 'commission',
      }),
    ]);
    expect(balances[0]?.amount).toBe('129');
    expect(sold.openQuantity.value).toBe('3');
    expect(endingValue.markedValue.value).toBe('36');
    expect(sumDecimals([balances[0]!.amount, endingValue.markedValue.value!])).toBe('165');
    for (const metric of [
      sold.grossBasis,
      sold.realizedGross,
      sold.realizedNet,
      endingValue.unrealizedGross,
      endingValue.unrealizedNet,
    ])
      expect(metric).toMatchObject({
        status: 'unavailable',
        value: null,
        reasons: ['unknown_basis'],
      });
    expect(sold.averageEntryPrice.value).toBeNull();
  });

  it('F-11 keeps quoted entry price separate from actual rounded principal and recognizes each adjustment once', () => {
    const purchase = fill({
      id: 'rounded-purchase',
      side: 'buy',
      quantity: '0.3333',
      price: '10',
      principal: '3.33',
      fee: '0.01',
      instant: firstInstant,
    });
    const open = replayInventory(inventoryInput([purchase]));
    const marked = valueInventory(open, {
      mark: { id: 'unrounded-market-value', price: '12', multiplier: '1', instant: secondInstant },
    });
    expect(open.averageEntryPrice.value).toBe('10');
    expect(open.grossBasis.value).toBe('3.33');
    expect(open.netBasis.value).toBe('3.34');
    expect(marked.markedValue.value).toBe('3.9996');
    expect(marked.unrealizedGross.value).toBe('0.6696');
    expect(marked.unrealizedNet.value).toBe('0.6596');
    expect(sumDecimals(['-3.34', marked.markedValue.value!])).toBe('0.6596');
    const closed = replayInventory(
      inventoryInput([
        purchase,
        fill({
          id: 'rounded-sale',
          side: 'sell',
          quantity: '0.3333',
          price: '12',
          principal: '4',
          fee: '0.01',
          instant: secondInstant,
        }),
      ]),
    );
    expect(closed.matches[0]?.quotePricePnl.value).toBe('0.6666');
    expect(closed.matches[0]?.settlementRoundingPnl.value).toBe('0.0034');
    expect(closed.realizedGross.value).toBe('0.67');
    expect(closed.realizedNet.value).toBe('0.65');
    expect(sumDecimals(['-3.34', '4', '-0.01'])).toBe('0.65');
  });

  it('F-06 partitions one source fill across campaigns without multiplying holdings or recognizing a fee twice', () => {
    const purchase = fill({
      id: 'shared-purchase',
      side: 'buy',
      quantity: '100',
      price: '10',
      principal: '1000',
      fee: '1',
      instant: firstInstant,
    });
    const sale = fill({
      id: 'shared-sale',
      side: 'sell',
      quantity: '60',
      price: '12',
      principal: '720',
      instant: secondInstant,
    });
    const opening = allocateCampaignExecution(purchase, [
      {
        id: 'shared-X-entry',
        legId: 'campaign-X',
        quantity: '60',
        role: 'open',
        direction: 'long',
      },
      {
        id: 'shared-Y-entry',
        legId: 'campaign-Y',
        quantity: '40',
        role: 'open',
        direction: 'long',
      },
    ]);
    const closing = allocateCampaignExecution(sale, [
      {
        id: 'shared-X-close',
        legId: 'campaign-X',
        quantity: '20',
        role: 'close',
        direction: 'long',
      },
      {
        id: 'shared-Y-close',
        legId: 'campaign-Y',
        quantity: '40',
        role: 'close',
        direction: 'long',
      },
    ]);
    const account = replayInventory(inventoryInput([purchase, sale]));
    const X = attributedInventory(
      [...opening, ...closing].filter((allocation) => allocation.legId === 'campaign-X'),
    );
    const Y = attributedInventory(
      [...opening, ...closing].filter((allocation) => allocation.legId === 'campaign-Y'),
    );
    const mark = { id: 'shared-fill-mark', price: '12', multiplier: '1', instant: endingInstant };
    expect(account.openQuantity.value).toBe('40');
    expect(account.grossBasis.value).toBe('400');
    expect(account.realizedNet.value).toBe('119.4');
    expect(X.realizedNet.value).toBe('39.8');
    expect(Y.realizedNet.value).toBe('79.6');
    expect(X.openQuantity.value).toBe('40');
    expect(Y.openQuantity.value).toBe('0');
    expect(valueInventory(X, { mark }).unrealizedNet.value).toBe('79.6');
    expect(
      sumDecimals([
        X.realizedNet.value!,
        Y.realizedNet.value!,
        valueInventory(X, { mark }).unrealizedNet.value!,
      ]),
    ).toBe('199');
    expect(
      sumDecimals(['-1001', '720', valueInventory(account, { mark }).markedValue.value!]),
    ).toBe('199');
    const bridge = reconcileCampaignInventory(account, [X, Y]);
    for (const metric of [
      bridge.quantityDifference,
      bridge.grossBasisDifference,
      bridge.realizedGrossDifference,
      bridge.reconciliationResidual,
    ])
      expect(metric.value).toBe('0');
    expect(bridge.ownership).toBe('attribution-only');
    expect(
      sumDecimals(
        [...opening].flatMap((allocation) => allocation.costs).map((cost) => cost.amount),
      ),
    ).toBe('1');
    expect(() =>
      allocateCampaignExecution(purchase, [
        {
          id: 'concealed-positive',
          legId: 'campaign-X',
          quantity: '120',
          role: 'open',
          direction: 'long',
        },
        {
          id: 'concealed-negative',
          legId: 'campaign-Y',
          quantity: '-20',
          role: 'open',
          direction: 'short',
        },
      ]),
    ).toThrow();
  });

  it('F-06 exposes the basis-timing bridge when campaign realization differs from actual FIFO', () => {
    const entryX = fill({
      id: 'actual-X-purchase',
      side: 'buy',
      quantity: '100',
      price: '10',
      principal: '1000',
      instant: firstInstant,
    });
    const entryY = fill({
      id: 'actual-Y-purchase',
      side: 'buy',
      quantity: '100',
      price: '20',
      principal: '2000',
      instant: secondInstant,
    });
    const exitY = fill({
      id: 'attributed-Y-sale',
      side: 'sell',
      quantity: '100',
      price: '30',
      principal: '3000',
      instant: endingInstant,
    });
    const account = replayInventory(inventoryInput([entryX, entryY, exitY]));
    const X = attributedInventory(
      allocateCampaignExecution(entryX, [
        {
          id: 'X-attributed-opening',
          legId: 'X',
          role: 'open',
          direction: 'long',
          quantity: '100',
        },
      ]),
    );
    const Y = attributedInventory([
      ...allocateCampaignExecution(entryY, [
        {
          id: 'Y-attributed-opening',
          legId: 'Y',
          role: 'open',
          direction: 'long',
          quantity: '100',
        },
      ]),
      ...allocateCampaignExecution(exitY, [
        { id: 'Y-attributed-close', legId: 'Y', role: 'close', direction: 'long', quantity: '100' },
      ]),
    ]);
    const mark = {
      id: 'basis-bridge-mark',
      price: '30',
      multiplier: '1',
      instant: '2026-01-01T12:00:00Z',
    };
    expect(account.realizedGross.value).toBe('2000');
    expect(account.grossBasis.value).toBe('2000');
    expect(valueInventory(account, { mark }).unrealizedGross.value).toBe('1000');
    expect(Y.realizedGross.value).toBe('1000');
    expect(X.grossBasis.value).toBe('1000');
    expect(valueInventory(X, { mark }).unrealizedGross.value).toBe('2000');
    const bridge = reconcileCampaignInventory(account, [X, Y]);
    expect(bridge.quantityDifference.value).toBe('0');
    expect(bridge.basisAttributionDifference.value).toBe('1000');
    expect(bridge.grossBasisDifference.value).toBe('1000');
    expect(bridge.remainingCounterpart.value).toBe('-1000');
    expect(bridge.reconciliationResidual.value).toBe('0');
    expect(bridge.attributedSourceIds).toEqual([
      'actual-X-purchase',
      'actual-Y-purchase',
      'attributed-Y-sale',
    ]);
    const missingOpening = attributedInventory(
      allocateCampaignExecution(exitY, [
        {
          id: 'missing-source-opening',
          legId: 'missing-leg',
          role: 'close',
          direction: 'long',
          quantity: '100',
        },
      ]),
    );
    expect(missingOpening.realizedGross).toMatchObject({ status: 'unavailable', value: null });
    expect(missingOpening.reasons).toContain('missing_campaign_opening');
  });

  it('F-04 reconciles an actual borrowing charge between realized/open attribution and one cash debit', () => {
    const short = fill({
      id: 'borrowed-short',
      side: 'sell',
      quantity: '2.5',
      price: '40',
      principal: '100',
      fee: '0.50',
      instant: firstInstant,
    });
    const cover = fill({
      id: 'partial-cover',
      side: 'buy',
      quantity: '1',
      price: '30',
      principal: '30',
      fee: '0.20',
      instant: secondInstant,
    });
    const borrowing: InventorySource = {
      kind: 'cost-attribution',
      id: 'borrow-event',
      effectId: 'borrow-effect',
      sourceRevision: '2',
      economicOrder: { instant: endingInstant, sequence: null },
      cost: {
        id: 'actual-borrow-charge',
        currencyId: USD,
        amount: '0.30',
        chargedAt: endingInstant,
      },
      allocations: [
        { target: 'match', targetId: 'partial-cover:borrowed-short', amount: '0.12' },
        { target: 'lot', targetId: 'borrowed-short', amount: '0.18' },
      ],
    };
    const inventory = replayInventory(inventoryInput([short, cover, borrowing]));
    const marked = valueInventory(inventory, {
      mark: {
        id: 'borrowed-short-mark',
        price: '35',
        multiplier: '1',
        instant: '2026-01-01T12:00:00Z',
      },
    });
    const cash = cashBalances([
      ...moneyEffect({
        id: 'short-cash',
        amount: '100',
        currencyId: USD,
        classification: 'trade-principal',
      }),
      ...moneyEffect({
        id: 'short-charge',
        amount: '-0.50',
        currencyId: USD,
        classification: 'commission',
      }),
      ...moneyEffect({
        id: 'cover-cash',
        amount: '-30',
        currencyId: USD,
        classification: 'trade-principal',
      }),
      ...moneyEffect({
        id: 'cover-charge',
        amount: '-0.20',
        currencyId: USD,
        classification: 'commission',
      }),
      ...moneyEffect({
        id: 'one-borrow-charge',
        amount: '-0.30',
        currencyId: USD,
        classification: 'borrowing',
      }),
    ]);
    expect(cash[0]?.amount).toBe('69');
    expect(inventory.realizedNet.value).toBe('9.48');
    expect(marked.unrealizedNet.value).toBe('7.02');
    expect(marked.markedValue.value).toBe('-52.5');
    expect(sumDecimals([cash[0]!.amount, marked.markedValue.value!])).toBe('16.5');
    expect(sumDecimals([inventory.realizedNet.value!, marked.unrealizedNet.value!])).toBe('16.5');
    expect(
      inventory.originalCosts.filter((cost) => cost.id === 'actual-borrow-charge'),
    ).toHaveLength(1);
    expect(
      sumDecimals([
        ...inventory.matches
          .flatMap((match) => match.carryingCosts)
          .filter((cost) => cost.id === 'actual-borrow-charge')
          .map((cost) => cost.amount),
        ...inventory.lots
          .flatMap((lot) => lot.costs)
          .filter((cost) => cost.id === 'actual-borrow-charge')
          .map((cost) => cost.amount),
      ]),
    ).toBe('0.3');
  });

  it('F-19 preserves historical source-rate vectors through a prospective policy conversion and full NAV bridge', () => {
    const first = fill({
      id: 'F19-L1',
      side: 'buy',
      quantity: '2',
      price: '10',
      principal: '20',
      fee: '2',
      instant: firstInstant,
      reportingRate: '0.8',
    });
    const second = fill({
      id: 'F19-L2',
      side: 'buy',
      quantity: '2',
      price: '20',
      principal: '40',
      fee: '2',
      instant: secondInstant,
      reportingRate: '0.9',
    });
    const transition: InventoryPolicyTransition = {
      kind: 'policy-transition',
      id: 'reviewed-pool-conversion',
      effectId: 'reviewed-pool-conversion-effect',
      sourceRevision: '2',
      economicOrder: { instant: '2026-01-01T10:30:00Z', sequence: null },
      fromPolicy: 'fifo',
      toPolicy: 'average',
      fromPolicyVersion: 'fifo/1',
      toPolicyVersion: 'average/2',
      reviewed: true,
      contributions: [
        {
          lotId: first.id,
          quantity: '2',
          bookedPrincipal: '20',
          quoteNotional: '20',
          costs: [{ costId: `${first.id}-fee`, currencyId: USD, amount: '2' }],
          basisReportingFx: first.basisReportingFx!,
        },
        {
          lotId: second.id,
          quantity: '2',
          bookedPrincipal: '40',
          quoteNotional: '40',
          costs: [{ costId: `${second.id}-fee`, currencyId: USD, amount: '2' }],
          basisReportingFx: second.basisReportingFx!,
        },
      ],
    };
    const sale = fill({
      id: 'F19-sale',
      side: 'sell',
      quantity: '2',
      price: '30',
      principal: '60',
      fee: '1',
      instant: endingInstant,
      reportingRate: '1',
    });
    const inventory = replayInventory(inventoryInput([sale, transition, second, first]));
    const endAt = '2026-01-01T12:00:00Z';
    const valuation = valueInventory(inventory, {
      mark: { id: 'F19-mark', price: '25', multiplier: '1', instant: endAt },
      reportingCurrencyId: EUR,
      markReportingFx: {
        observationId: 'F19-end-rate',
        rate: '1.1',
        baseCurrencyId: USD,
        quoteCurrencyId: EUR,
      },
    });
    const cashCurrencyFx = available(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt,
        openingBalance: '100',
        endingBalance: '95',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('1.1', endAt),
        complete: true,
        movements: [
          {
            id: 'F19-buy-1-and-charge',
            amount: '-22',
            economicAt: firstInstant,
            rate: rateAt('0.8', firstInstant),
          },
          {
            id: 'F19-buy-2-and-charge',
            amount: '-42',
            economicAt: secondInstant,
            rate: rateAt('0.9', secondInstant),
          },
          {
            id: 'F19-sale-and-charge',
            amount: '59',
            economicAt: endingInstant,
            rate: rateAt('1', endingInstant),
          },
        ],
      }),
    );
    expect(inventory.policy).toBe('average');
    expect(inventory.grossBasis.value).toBe('30');
    expect(valuation.realizedReportingNet.value).toBe('31.3');
    expect(valuation.unrealizedReportingNet.value).toBe('27.3');
    expect(cashCurrencyFx.amount).toBe('20.9');
    expect(
      sumDecimals([
        valuation.realizedReportingNet.value!,
        valuation.unrealizedReportingNet.value!,
        cashCurrencyFx.amount,
      ]),
    ).toBe('79.5');
    expect(
      calculateNav({
        reportingCurrencyId: EUR,
        asOf: endAt,
        sourceRevision: '2',
        components: [
          {
            id: 'F19-cash',
            kind: 'cash',
            currencyId: USD,
            amount: '95',
            rate: rateAt('1.1', endAt),
          },
          {
            id: 'F19-holding',
            kind: 'holding',
            currencyId: USD,
            amount: '50',
            rate: rateAt('1.1', endAt),
          },
        ],
      }),
    ).toMatchObject({ state: 'available', value: { amount: '159.5' } });
    expect(
      replayInventory(
        JSON.parse(JSON.stringify(inventoryInput([first, second, transition, sale]))),
      ),
    ).toEqual(inventory);
  });

  it('property: zero-crossing round trips conserve tiny signed fees by original identity and equal exact cash loss', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 100n }),
        fc.bigInt({ min: 1n, max: 100n }),
        fc.bigInt({ min: -100_000_000n, max: 100_000_000n }),
        fc.bigInt({ min: -100_000_000n, max: 100_000_000n }),
        fc.bigInt({ min: -100_000_000n, max: 100_000_000n }),
        (shortQuantity, remainingLong, openingFee, crossingFee, finalFee) => {
          const sources = [
            fill({
              id: 'property-short',
              side: 'sell',
              quantity: String(shortQuantity),
              price: '17',
              principal: String(shortQuantity * 17n),
              fee: fixed36Text(openingFee),
              instant: firstInstant,
            }),
            fill({
              id: 'property-cross',
              side: 'buy',
              quantity: String(shortQuantity + remainingLong),
              price: '17',
              principal: String((shortQuantity + remainingLong) * 17n),
              fee: fixed36Text(crossingFee),
              instant: secondInstant,
            }),
            fill({
              id: 'property-flat',
              side: 'sell',
              quantity: String(remainingLong),
              price: '17',
              principal: String(remainingLong * 17n),
              fee: fixed36Text(finalFee),
              instant: endingInstant,
            }),
          ];
          const replayed = replayInventory(inventoryInput(sources));
          const expectedNet = fixed36Text(-(openingFee + crossingFee + finalFee));
          expect(replayed.openQuantity.value).toBe('0');
          expect(replayed.grossBasis.value).toBe('0');
          expect(replayed.realizedGross.value).toBe('0');
          expect(replayed.realizedNet.value).toBe(expectedNet);
          const postings = sources.flatMap((source) => [
            ...moneyEffect({
              id: `${source.id}-principal`,
              amount: `${source.side === 'buy' ? '-' : ''}${source.bookedPrincipal}`,
              currencyId: USD,
              classification: 'trade-principal',
            }),
            ...moneyEffect({
              id: `${source.id}-cost-cash`,
              amount: fixed36Text(
                -(source.id === 'property-short'
                  ? openingFee
                  : source.id === 'property-cross'
                    ? crossingFee
                    : finalFee),
              ),
              currencyId: USD,
              classification: 'commission-or-rebate',
            }),
          ]);
          expect(cashBalances(postings)[0]?.amount).toBe(expectedNet);
          for (const original of replayed.originalCosts) {
            const pieces = replayed.matches
              .flatMap((match) => [...match.entryCosts, ...match.exitCosts, ...match.carryingCosts])
              .filter((cost) => cost.id === original.id && cost.currencyId === original.currencyId);
            expect(sumDecimals(pieces.map((cost) => cost.amount))).toBe(original.amount);
          }
          expect(
            sumDecimals(replayed.lots.flatMap((lot) => lot.costs).map((cost) => cost.amount)),
          ).toBe('0');
          expect(replayInventory(inventoryInput([...sources].reverse()))).toEqual(replayed);
        },
      ),
      { numRuns: 200, seed: 404 },
    );
  });

  it('F-02/F-13 retains gross results and exact GBP fees while scalar native net is unavailable', () => {
    const inventory = replayInventory(
      inventoryInput([
        fill({
          id: 'GBP-fee-buy',
          side: 'buy',
          quantity: '2',
          price: '10',
          principal: '20',
          fee: '0.01',
          feeCurrency: GBP,
          instant: firstInstant,
        }),
        fill({
          id: 'GBP-fee-sale',
          side: 'sell',
          quantity: '1',
          price: '12',
          principal: '12',
          instant: secondInstant,
        }),
      ]),
    );
    expect(inventory.realizedGross).toMatchObject({ status: 'available', value: '2' });
    expect(inventory.realizedNet).toMatchObject({ status: 'unavailable', value: null });
    expect(inventory.realizedNet.reasons).toContain('missing_charged_currency_fx');
    expect(inventory.grossBasis).toMatchObject({ status: 'available', value: '10' });
    expect(inventory.netBasis).toMatchObject({ status: 'unavailable', value: null });
    expect(inventory.matches[0]?.entryCosts).toEqual([
      expect.objectContaining({ currencyId: GBP, amount: '0.005' }),
    ]);
    expect(inventory.lots[0]?.costs).toEqual([
      expect.objectContaining({ currencyId: GBP, amount: '0.005' }),
    ]);
    const marked = valueInventory(inventory, {
      mark: { id: 'mark-with-no-fee-FX', price: '12', multiplier: '1', instant: endingInstant },
    });
    expect(marked.unrealizedGross).toMatchObject({ status: 'available', value: '2' });
    expect(marked.unrealizedNet).toMatchObject({ status: 'unavailable', value: null });
    expect(marked.unrealizedNet.reasons).toContain('missing_charged_currency_fx');
  });

  it('F-13 retains economically significant sub-microsecond ordering instead of array or UUID order', () => {
    const buy = fill({
      id: 'z-buy',
      side: 'buy',
      quantity: '1',
      price: '10',
      principal: '10',
      instant: firstInstant,
    });
    const sell = fill({
      id: 'a-sell',
      side: 'sell',
      quantity: '1',
      price: '12',
      principal: '12',
      instant: secondInstant,
    });
    const inventory = replayInventory(inventoryInput([sell, buy]));
    expect(inventory.openQuantity.value).toBe('0');
    expect(inventory.realizedGross.value).toBe('2');
    expect(inventory.matches[0]).toMatchObject({
      openingSourceId: 'z-buy',
      closingSourceId: 'a-sell',
      direction: 'long',
    });
    expect(replayInventory(inventoryInput([buy, sell]))).toEqual(inventory);
  });

  it('F-13 blocks equal-time, order-sensitive inventory without an ordinal instead of guessing', () => {
    const buy = fill({
      id: 'unsequenced-buy',
      side: 'buy',
      quantity: '1',
      price: '10',
      principal: '10',
      instant: firstInstant,
    });
    const sell = fill({
      id: 'unsequenced-sell',
      side: 'sell',
      quantity: '1',
      price: '12',
      principal: '12',
      instant: firstInstant,
    });
    const blocked = replayInventory(inventoryInput([buy, sell]));
    expect(blocked).toMatchObject({
      status: 'unavailable',
      reasons: ['ambiguous_chronology'],
      lots: [],
      matches: [],
    });
    expect(blocked.realizedGross.value).toBeNull();
    expect(blocked.openQuantity.value).toBe('0');
    const reviewed = replayInventory(
      inventoryInput([
        { ...sell, economicOrder: { instant: firstInstant, sequence: '2' } },
        { ...buy, economicOrder: { instant: firstInstant, sequence: '1' } },
      ]),
    );
    expect(reviewed.realizedGross.value).toBe('2');
    expect(reviewed.matches[0]).toMatchObject({ direction: 'long' });
  });

  it('F-02/F-04 conserves each source fee through nonterminating zero-crossing partitions and final consumption', () => {
    const short = fill({
      id: 'source-short',
      side: 'sell',
      quantity: '2',
      price: '1',
      principal: '2',
      fee: '0.01',
      instant: firstInstant,
      sequence: '1',
    });
    const crossing = fill({
      id: 'source-crossing',
      side: 'buy',
      quantity: '3',
      price: '1',
      principal: '3',
      fee: '0.01',
      instant: secondInstant,
      sequence: '2',
    });
    const crossed = replayInventory(inventoryInput([short, crossing]));
    expect(crossed.matches[0]?.exitCosts).toEqual([
      expect.objectContaining({
        id: 'source-crossing-fee',
        currencyId: USD,
        amount: '0.006666666666666666666666666666666667',
      }),
    ]);
    expect(crossed.lots.find((lot) => lot.id === 'source-crossing')?.costs).toEqual([
      expect.objectContaining({
        id: 'source-crossing-fee',
        currencyId: USD,
        amount: '0.003333333333333333333333333333333333',
      }),
    ]);
    for (const original of crossed.originalCosts) {
      const allPieces = [
        ...crossed.lots.flatMap((lot) => lot.costs),
        ...crossed.matches.flatMap((match) => [
          ...match.entryCosts,
          ...match.exitCosts,
          ...match.carryingCosts,
        ]),
        ...crossed.unassignedCosts,
      ].filter((cost) => cost.id === original.id && cost.currencyId === original.currencyId);
      expect(sumDecimals(allPieces.map((cost) => cost.amount))).toBe(original.amount);
    }
    const finalSale = fill({
      id: 'final-flat-sale',
      side: 'sell',
      quantity: '1',
      price: '1',
      principal: '1',
      instant: endingInstant,
      sequence: '3',
    });
    const flat = replayInventory(inventoryInput([short, crossing, finalSale]));
    expect(flat.openQuantity.value).toBe('0');
    expect(flat.grossBasis.value).toBe('0');
    expect(flat.realizedNet.value).toBe('-0.02');
    expect(sumDecimals(flat.lots.flatMap((lot) => lot.costs).map((cost) => cost.amount))).toBe('0');
    for (const original of flat.originalCosts) {
      const closedPieces = flat.matches
        .flatMap((match) => [...match.entryCosts, ...match.exitCosts, ...match.carryingCosts])
        .filter((cost) => cost.id === original.id && cost.currencyId === original.currencyId);
      expect(sumDecimals(closedPieces.map((cost) => cost.amount))).toBe(original.amount);
    }
  });

  it('F-16 counts short proceeds and the signed holding liability exactly once', () => {
    const inventory = replayInventory(
      inventoryInput([
        fill({
          id: 'short-open',
          side: 'sell',
          quantity: '10',
          price: '100',
          principal: '1000',
          instant: firstInstant,
          reportingRate: '0.8',
        }),
      ]),
    );
    expect(inventory.openQuantity.value).toBe('-10');
    expect(inventory.grossBasis.value).toBe('-1000');
    const marked = valueInventory(inventory, {
      mark: { id: 'short-mark', price: '90', multiplier: '1', instant: endingInstant },
      reportingCurrencyId: EUR,
      markReportingFx: {
        observationId: 'short-end-rate',
        rate: '0.9',
        baseCurrencyId: USD,
        quoteCurrencyId: EUR,
      },
    });
    expect(marked.markedValue.value).toBe('-900');
    expect(marked.unrealizedGross.value).toBe('100');
    expect(marked.unrealizedReportingTradingGross.value).toBe('90');
    expect(marked.unrealizedHoldingFx.value).toBe('-100');
    const monetaryFx = available(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt: endingInstant,
        openingBalance: '0',
        endingBalance: '1000',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('0.9', endingInstant),
        complete: true,
        movements: [
          {
            id: 'actual-short-proceeds',
            amount: '1000',
            economicAt: firstInstant,
            rate: rateAt('0.8', firstInstant),
          },
        ],
      }),
    );
    expect(monetaryFx.amount).toBe('100');
    const nav = calculateNav({
      reportingCurrencyId: EUR,
      asOf: endingInstant,
      sourceRevision: '2',
      components: [
        {
          id: 'short-proceeds-cash',
          kind: 'cash',
          currencyId: USD,
          amount: '1000',
          rate: rateAt('0.9', endingInstant),
        },
        {
          id: 'short-signed-holding',
          kind: 'holding',
          currencyId: USD,
          amount: marked.markedValue.value ?? 'invalid',
          rate: rateAt('0.9', endingInstant),
        },
      ],
    });
    expect(nav).toMatchObject({ state: 'available', value: { amount: '90' } });
    expect(
      sumDecimals([
        marked.unrealizedReportingTradingGross.value ?? 'invalid',
        marked.unrealizedHoldingFx.value ?? 'invalid',
        monetaryFx.amount,
      ]),
    ).toBe('90');
  });

  it('F-08 corrects effective inventory separately from original/reversal/replacement cash', () => {
    const original = fill({
      id: 'original-buy',
      side: 'buy',
      quantity: '5',
      price: '10',
      principal: '50',
      fee: '1',
      instant: firstInstant,
    });
    const sale = fill({
      id: 'retained-sale',
      side: 'sell',
      quantity: '3',
      price: '15',
      principal: '45',
      fee: '0.60',
      instant: secondInstant,
    });
    const replacement: InventoryFill = {
      ...fill({
        id: 'corrected-buy',
        side: 'buy',
        quantity: '5',
        price: '12',
        principal: '60',
        fee: '1.50',
        instant: firstInstant,
      }),
      effectId: original.effectId,
      sourceRevision: '2',
      supersedesId: original.id,
    };
    const reversal: InventorySource = {
      id: 'bookkeeping-reversal',
      effectId: 'correction-cash-reversal-effect',
      sourceRevision: '2',
      kind: 'bookkeeping-reversal',
      reversesId: original.id,
      economicOrder: { instant: firstInstant, sequence: null },
    };
    const input = inventoryInput([sale, reversal, replacement, original]);
    const revised = replayInventory(input);
    expect(revised.effectiveSourceIds).toEqual(['corrected-buy', 'retained-sale']);
    expect(revised.openQuantity.value).toBe('2');
    expect(revised.grossBasis.value).toBe('24');
    expect(revised.realizedNet.value).toBe('7.5');
    expect(revised.matches).toHaveLength(1);
    expect(revised.matches[0]).toMatchObject({
      openingSourceId: 'corrected-buy',
      closingSourceId: 'retained-sale',
    });
    const revisedMarked = valueInventory(revised, {
      mark: { id: 'retained-mark', price: '20', multiplier: '1', instant: endingInstant },
    });
    expect(revisedMarked.unrealizedNet.value).toBe('15.4');

    const purchaseCash = moneyEffect({
      id: 'original-purchase-cash',
      amount: '-51',
      currencyId: USD,
      classification: 'trade-and-cost',
    });
    const cash = cashBalances([
      ...purchaseCash,
      ...moneyEffect({
        id: 'actual-sale-cash',
        amount: '44.40',
        currencyId: USD,
        classification: 'trade-and-cost',
      }),
      ...reversePostings(purchaseCash, 'cash-reversal'),
      ...moneyEffect({
        id: 'replacement-purchase-cash',
        amount: '-61.50',
        currencyId: USD,
        classification: 'trade-and-cost',
      }),
    ]);
    expect(cash).toEqual([expect.objectContaining({ currencyId: USD, amount: '-17.1' })]);
    expect(
      sumDecimals([cash[0]?.amount ?? 'invalid', revisedMarked.markedValue.value ?? 'invalid']),
    ).toBe('22.9');
    expect(
      sumDecimals([
        revised.realizedNet.value ?? 'invalid',
        revisedMarked.unrealizedNet.value ?? 'invalid',
      ]),
    ).toBe('22.9');
    const oldView = replayInventory({ ...input, sourceRevision: '1' });
    expect(oldView.realizedNet.value).toBe('13.8');
    expect(oldView.grossBasis.value).toBe('20');
    expect(replayInventory(JSON.parse(JSON.stringify(input)))).toEqual(revised);
  });

  it('F-18 tracks cash and evidenced transit ownership as separate monetary populations', () => {
    const departureAt = firstInstant;
    const intermediateAt = '2026-01-01T10:30:00Z';
    const receiptAt = endingInstant;
    const cashMovementDeparture = {
      id: 'depart-cash',
      amount: '-40',
      economicAt: departureAt,
      rate: rateAt('0.8', departureAt),
    };
    const cashMovementReceipt = {
      id: 'receive-cash',
      amount: '40',
      economicAt: receiptAt,
      rate: rateAt('1', receiptAt),
    };
    const transitMovementDeparture = {
      id: 'depart-transit',
      amount: '40',
      economicAt: departureAt,
      rate: rateAt('0.8', departureAt),
    };
    const transitMovementReceipt = {
      id: 'receive-transit',
      amount: '-40',
      economicAt: receiptAt,
      rate: rateAt('1', receiptAt),
    };
    const endingCashFx = available(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt: receiptAt,
        openingBalance: '100',
        endingBalance: '100',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('1', receiptAt),
        movements: [cashMovementDeparture, cashMovementReceipt],
        complete: true,
      }),
    );
    const endingTransitFx = available(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt: receiptAt,
        openingBalance: '0',
        endingBalance: '0',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('1', receiptAt),
        movements: [transitMovementDeparture, transitMovementReceipt],
        complete: true,
      }),
    );
    expect(endingCashFx.amount).toBe('12');
    expect(endingTransitFx.amount).toBe('8');
    expect(sumDecimals([endingCashFx.amount, endingTransitFx.amount])).toBe('20');

    const intermediateCashFx = available(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt: intermediateAt,
        openingBalance: '100',
        endingBalance: '60',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('0.9', intermediateAt),
        movements: [cashMovementDeparture],
        complete: true,
      }),
    );
    const intermediateTransitFx = available(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt: intermediateAt,
        openingBalance: '0',
        endingBalance: '40',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('0.9', intermediateAt),
        movements: [transitMovementDeparture],
        complete: true,
      }),
    );
    expect(intermediateCashFx.amount).toBe('6');
    expect(intermediateTransitFx.amount).toBe('4');
    expect(
      calculateNav({
        reportingCurrencyId: EUR,
        asOf: intermediateAt,
        sourceRevision: '2',
        components: [
          {
            id: 'A-cash',
            kind: 'cash',
            currencyId: USD,
            amount: '60',
            rate: rateAt('0.9', intermediateAt),
          },
          {
            id: 'owned-transit-claim',
            kind: 'asset',
            currencyId: USD,
            amount: '40',
            rate: rateAt('0.9', intermediateAt),
          },
        ],
      }),
    ).toMatchObject({ state: 'available', value: { amount: '90' } });
    expect(
      calculateNav({
        reportingCurrencyId: EUR,
        asOf: intermediateAt,
        sourceRevision: '2',
        components: [
          {
            id: 'A-cash',
            kind: 'cash',
            currencyId: USD,
            amount: '60',
            rate: rateAt('0.9', intermediateAt),
          },
          {
            id: 'unevidenced-transit-claim',
            kind: 'asset',
            currencyId: USD,
            rate: rateAt('0.9', intermediateAt),
          },
        ],
      }),
    ).toMatchObject({
      state: 'partial',
      availableSubtotal: { amount: '54' },
      missingReferences: ['unevidenced-transit-claim'],
    });
    expect(
      cashFx({
        currencyId: USD,
        reportingCurrencyId: EUR,
        startAt: openingInstant,
        endAt: receiptAt,
        openingBalance: '0',
        endingBalance: '0',
        openingRate: rateAt('0.8', openingInstant),
        endingRate: rateAt('1', receiptAt),
        movements: [transitMovementDeparture, transitMovementReceipt],
        complete: false,
      }),
    ).toMatchObject({ state: 'unavailable', reasons: ['incomplete_cash'] });
  });
});
