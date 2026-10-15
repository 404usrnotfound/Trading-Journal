import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  INVENTORY_CALCULATION_MANIFEST,
  replayInventory,
  valueInventory,
  type InventoryFill,
  type InventoryReplayInput,
} from '@journal/domain';
import { FINANCIAL_CAMPAIGN as campaign, campaignAt } from '../helpers/financial-campaign.js';

// Independent integer/rational oracle. Amounts never pass through Number or any
// production monetary helper. Division uses the documented scale-36 HALF_EVEN.
const scale = 10n ** 36n;
function rational(numerator: bigint, denominator = 1n): string {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  let quotient = (absolute * scale) / denominator;
  const remainder = (absolute * scale) % denominator;
  if (2n * remainder > denominator || (2n * remainder === denominator && quotient % 2n !== 0n))
    quotient++;
  const fraction = (quotient % scale).toString().padStart(36, '0').replace(/0+$/u, '');
  return `${negative && quotient !== 0n ? '-' : ''}${quotient / scale}${fraction ? `.${fraction}` : ''}`;
}
function scaled(text: string): bigint {
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  return (negative ? -1n : 1n) * (BigInt(whole!) * scale + BigInt(fraction.padEnd(36, '0')));
}
function replay(sources: readonly InventoryFill[]) {
  const input: InventoryReplayInput = {
    scope: {
      workspaceId: 'campaign-workspace',
      accountId: 'campaign-account',
      instrumentId: 'ordinary-share',
      instrumentVersionId: 'share/v1',
      unitVersionId: 'share/unit1',
      settlementCurrencyId: 'USD',
    },
    manifest: INVENTORY_CALCULATION_MANIFEST,
    policy: 'fifo',
    capability: {
      subtype: 'ordinary-share',
      nativeInventory: true,
      shortSupported: true,
      averageCostSupported: true,
    },
    sources,
    sourceRevision: '999999',
  };
  return replayInventory(input);
}
function expectCostConservation(
  actual: ReturnType<typeof replay>,
  sources: readonly InventoryFill[],
) {
  const pieces = [
    ...actual.lots.flatMap((lot) => lot.costs),
    ...actual.matches.flatMap((match) => [...match.entryCosts, ...match.exitCosts]),
  ];
  for (const source of sources)
    for (const cost of source.costs)
      expect(
        pieces
          .filter((piece) => piece.id === cost.id)
          .reduce((sum, piece) => sum + scaled(piece.amount), 0n),
      ).toBe(scaled(cost.amount));
}
function integerFill(
  id: string,
  sequence: number,
  side: 'buy' | 'sell',
  quantityUnits: bigint,
  priceCents: bigint,
  feeCentsPerShare: bigint,
): InventoryFill {
  const instant = campaignAt('03');
  const charge = quantityUnits * feeCentsPerShare;
  return {
    kind: 'fill',
    id,
    effectId: `effect:${id}`,
    sourceRevision: String(sequence),
    economicOrder: { instant, sequence: String(sequence) },
    side,
    quantity: rational(quantityUnits, 10_000n),
    price: rational(priceCents, 100n),
    multiplier: '1',
    bookedPrincipal: rational(quantityUnits * priceCents, 1_000_000n),
    costsComplete: true,
    costs:
      charge === 0n
        ? []
        : [
            {
              id: `fee:${id}`,
              amount: rational(charge, 1_000_000n),
              currencyId: 'USD',
              chargedAt: instant,
            },
          ],
  };
}
const marked = (price: string) => ({
  id: 'verified-mark',
  price,
  multiplier: '1',
  instant: campaignAt('10'),
});

describe('Phase 14 independent financial correctness campaign', () => {
  it('preserves exact fractional FIFO basis, matched fees and historical FX in the complete trading leg', () => {
    const fills: InventoryFill[] = campaign.fills.map((source, index) => ({
      kind: 'fill',
      id: `fill:${index}`,
      effectId: `effect:${index}`,
      sourceRevision: String(index + 1),
      economicOrder: { instant: campaignAt(source.day), sequence: '2' },
      side: source.side,
      quantity: source.quantity,
      price: source.price,
      multiplier: '1',
      bookedPrincipal: source.principal,
      costsComplete: true,
      basisReportingFx: {
        observationId: `fx:${index}`,
        rate: source.rate,
        baseCurrencyId: 'USD',
        quoteCurrencyId: 'EUR',
      },
      costs: [
        {
          id: `commission:${index}`,
          amount: source.fee,
          currencyId: 'USD',
          chargedAt: campaignAt(source.day),
          reportingFx: {
            observationId: `fx:${index}`,
            rate: source.rate,
            baseCurrencyId: 'USD',
            quoteCurrencyId: 'EUR',
          },
        },
        ...(index === 3
          ? [
              {
                id: 'late-execution-fee',
                amount: campaign.lateExecutionFee,
                currencyId: 'USD',
                chargedAt: campaignAt('08'),
                reportingFx: {
                  observationId: 'dividend-rate',
                  rate: campaign.dividend.rate,
                  baseCurrencyId: 'USD',
                  quoteCurrencyId: 'EUR',
                },
              },
            ]
          : []),
      ],
    }));
    // Input order does not authorize a different economic chronology.
    const inventory = replay([...fills].reverse());
    for (const key of [
      'openQuantity',
      'averageEntryPrice',
      'grossBasis',
      'netBasis',
      'realizedGross',
      'realizedNet',
    ] as const)
      expect(inventory[key]).toMatchObject({
        status: 'available',
        value: campaign.expected[key],
        reasons: [],
      });
    expect(inventory.matches).toHaveLength(2);
    expect(
      inventory.matches.map((match) => ({
        source: match.openingSourceId,
        quantity: match.quantity,
        principal: match.consumedPrincipal,
        entryCosts: match.entryCosts.map((cost) => cost.amount),
        net: match.netPnl.value,
      })),
    ).toEqual([
      {
        source: 'fill:0',
        quantity: '2.5',
        principal: '250',
        entryCosts: ['1'],
        net: '46.5',
      },
      {
        source: 'fill:1',
        quantity: '0.5',
        principal: '51',
        entryCosts: ['0.1875'],
        net: '8.3125',
      },
    ]);
    const valuation = valueInventory(inventory, {
      mark: marked(campaign.mark),
      reportingCurrencyId: 'EUR',
      markReportingFx: {
        observationId: 'end-rate',
        rate: campaign.finalRate,
        baseCurrencyId: 'USD',
        quoteCurrencyId: 'EUR',
      },
    });
    expect(valuation.unrealizedGross).toMatchObject({
      status: 'available',
      value: campaign.expected.unrealizedGross,
    });
    expect(valuation.unrealizedNet).toMatchObject({
      status: 'available',
      value: campaign.expected.unrealizedNet,
    });
    for (const [key, value] of [
      ['realizedReportingTradingGross', '55.46'],
      ['realizedHoldingFx', '11.53'],
      ['unrealizedReportingTradingGross', '121.6'],
      ['unrealizedHoldingFx', '19.23'],
      ['realizedReportingNet', '63.079375'],
      ['unrealizedReportingNet', '138.945625'],
    ] as const)
      expect(valuation[key]).toMatchObject({ status: 'available', value });

    const final = campaign.finalSale;
    const closed = replay([
      ...fills,
      {
        kind: 'fill',
        id: 'final-sale',
        effectId: 'final-sale-effect',
        sourceRevision: '5',
        economicOrder: { instant: campaignAt(final.day), sequence: '2' },
        side: final.side,
        quantity: final.quantity,
        price: final.price,
        multiplier: '1',
        bookedPrincipal: final.principal,
        costsComplete: true,
        basisReportingFx: {
          observationId: 'final-sale-rate',
          rate: final.rate,
          baseCurrencyId: 'USD',
          quoteCurrencyId: 'EUR',
        },
        costs: [
          {
            id: 'final-sale-fee',
            amount: final.fee,
            currencyId: 'USD',
            chargedAt: campaignAt(final.day),
            reportingFx: {
              observationId: 'final-sale-rate',
              rate: final.rate,
              baseCurrencyId: 'USD',
              quoteCurrencyId: 'EUR',
            },
          },
        ],
      },
    ]);
    for (const key of [
      'openQuantity',
      'grossBasis',
      'netBasis',
      'realizedGross',
      'realizedNet',
    ] as const)
      expect(closed[key]).toMatchObject({
        status: 'available',
        value: campaign.finalExpected[key],
      });
    expect(closed.averageEntryPrice.value).toBeNull();
    const closedValuation = valueInventory(closed, { mark: null, reportingCurrencyId: 'EUR' });
    expect(closedValuation.unrealizedGross).toMatchObject({ status: 'available', value: '0' });
    expect(closedValuation.unrealizedNet).toMatchObject({ status: 'available', value: '0' });
    expect(closedValuation.realizedReportingTradingGross.value).toBe('226.34');
    expect(closedValuation.realizedHoldingFx.value).toBe('35.98');
    expect(closedValuation.realizedReportingNet.value).toBe('255.325');
  });

  for (const direction of [1n, -1n])
    it(`matches an independent fractional multi-lot ${direction === 1n ? 'long' : 'short'} FIFO oracle and conserves every source fee`, () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              units: fc.integer({ min: 1, max: 9000 }),
              price: fc.integer({ min: 1, max: 100000 }),
              fee: fc.integer({ min: -25, max: 25 }),
            }),
            { minLength: 2, maxLength: 5 },
          ),
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 1, max: 100000 }),
          fc.integer({ min: -25, max: 25 }),
          (raw, takeSeed, exitCents, exitFeeCents) => {
            const lots = raw.map((lot) => ({
              q: BigInt(lot.units) * 4n + 1n,
              p: BigInt(lot.price),
              f: BigInt(lot.fee),
            }));
            const total = lots.reduce((sum, lot) => sum + lot.q, 0n);
            const close = lots[0]!.q + 1n + (BigInt(takeSeed) % (total - lots[0]!.q - 1n));
            let needed = close,
              consumed = 0n,
              consumedFees = 0n,
              basis = 0n,
              remainingFees = 0n;
            const expectedLots = lots.map((lot) => {
              const take = lot.q < needed ? lot.q : needed;
              needed -= take;
              consumed += take * lot.p;
              consumedFees += take * lot.f;
              basis += (lot.q - take) * lot.p;
              remainingFees += (lot.q - take) * lot.f;
              return {
                quantity: rational(lot.q - take, 10_000n),
                principal: rational((lot.q - take) * lot.p, 1_000_000n),
              };
            });
            const sources = lots.map((lot, index) =>
              integerFill(
                `open:${index}`,
                index + 1,
                direction === 1n ? 'buy' : 'sell',
                lot.q,
                lot.p,
                lot.f,
              ),
            );
            const closing = integerFill(
              'partial',
              lots.length + 1,
              direction === 1n ? 'sell' : 'buy',
              close,
              BigInt(exitCents),
              BigInt(exitFeeCents),
            );
            const actual = replay([closing, ...sources].reverse());
            const remaining = total - close;
            const gross = direction * (close * BigInt(exitCents) - consumed);
            const exitFees = close * BigInt(exitFeeCents);
            expect(actual.openQuantity.value).toBe(rational(direction * remaining, 10_000n));
            expect(actual.grossBasis.value).toBe(rational(direction * basis, 1_000_000n));
            expect(actual.averageEntryPrice.value).toBe(rational(basis, remaining * 100n));
            expect(actual.realizedGross).toMatchObject({
              status: 'available',
              value: rational(gross, 1_000_000n),
            });
            expect(actual.realizedNet).toMatchObject({
              status: 'available',
              value: rational(gross - consumedFees - exitFees, 1_000_000n),
            });
            expect(
              actual.lots.map((lot) => ({
                quantity: lot.remainingQuantity,
                principal: lot.remainingPrincipal,
              })),
            ).toEqual(expectedLots);
            const valued = valueInventory(actual, {
              mark: marked(rational(BigInt(exitCents), 100n)),
            });
            const unrealized = direction * (remaining * BigInt(exitCents) - basis);
            expect(valued.unrealizedGross.value).toBe(rational(unrealized, 1_000_000n));
            expect(valued.unrealizedNet.value).toBe(
              rational(unrealized - remainingFees, 1_000_000n),
            );
            expectCostConservation(actual, [...sources, closing]);
            const finalFill = integerFill(
              'final',
              lots.length + 2,
              closing.side,
              remaining,
              BigInt(exitCents),
              5n,
            );
            const finalSources = [...sources, closing, finalFill];
            const final = replay(finalSources);
            expect(final.openQuantity.value).toBe('0');
            expect(final.grossBasis.value).toBe('0');
            expect(final.netBasis.value).toBe('0');
            expect(final.realizedNet.value).toBe(
              rational(
                gross + unrealized - consumedFees - remainingFees - exitFees - remaining * 5n,
                1_000_000n,
              ),
            );
            expect(
              final.lots.every(
                (lot) =>
                  lot.remainingQuantity === '0' && lot.costs.every((cost) => cost.amount === '0'),
              ),
            ).toBe(true);
            expectCostConservation(final, finalSources);
          },
        ),
        { seed: 14012030, numRuns: 100 },
      );
    });

  it('keeps equal-price fractional fill partitioning financially invariant', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 100000 }),
        (leftSeed, rightSeed, cents) => {
          const left = BigInt(leftSeed) * 3n + 1n,
            right = BigInt(rightSeed) * 3n + 1n;
          const combined = integerFill('one', 1, 'buy', left + right, BigInt(cents), 3n);
          const a = integerFill('left', 1, 'buy', left, BigInt(cents), 3n);
          const b = integerFill('right', 2, 'buy', right, BigInt(cents), 3n);
          const exit = integerFill('exit', 3, 'sell', left + 1n, BigInt(cents) + 137n, 2n);
          const one = replay([combined, exit]),
            split = replay([a, b, exit]);
          for (const key of [
            'openQuantity',
            'grossBasis',
            'netBasis',
            'averageEntryPrice',
            'realizedGross',
            'realizedNet',
          ] as const)
            expect(split[key]).toEqual(one[key]);
          const mark = marked(rational(BigInt(cents) + 237n, 100n));
          expect(valueInventory(split, { mark }).unrealizedNet).toEqual(
            valueInventory(one, { mark }).unrealizedNet,
          );
        },
      ),
      { seed: 14022030, numRuns: 100 },
    );
  });
});
