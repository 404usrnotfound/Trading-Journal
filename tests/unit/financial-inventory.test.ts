import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  INVENTORY_CALCULATION_MANIFEST,
  InventoryError,
  replayInventory,
  selectEffectiveInventorySources,
  sumDecimals,
  valueInventory,
  type InventoryContributionSnapshot,
  type InventoryCost,
  type InventoryFill,
  type InventoryMetric,
  type InventoryOpening,
  type InventoryPolicy,
  type InventoryPolicyTransition,
  type InventoryReplayInput,
  type InventorySource,
} from '../../packages/domain/src/index.js';

const USD = 'USD-unit';
const GBP = 'GBP-unit';
const EUR = 'EUR-unit';
const at = (sequence: string) => ({ instant: '2026-01-01T12:00:00.000001Z', sequence });
const scope = {
  workspaceId: 'workspace',
  accountId: 'account',
  instrumentId: 'share',
  instrumentVersionId: 'share-metadata/1',
  unitVersionId: 'share-unit/1',
  settlementCurrencyId: USD,
};
const fx = (observationId: string, rate: string) => ({
  observationId,
  rate,
  baseCurrencyId: USD,
  quoteCurrencyId: EUR,
});
function fee(id: string, amount: string, currencyId = USD): InventoryCost {
  return { id, amount, currencyId, chargedAt: '2026-01-01T12:00:00.000001Z' };
}
function fill(
  id: string,
  sequence: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  principal: string,
  feeAmount = '0',
): InventoryFill {
  return {
    kind: 'fill',
    id,
    effectId: `effect:${id}`,
    sourceRevision: sequence,
    economicOrder: at(sequence),
    side,
    quantity,
    price,
    multiplier: '1',
    bookedPrincipal: principal,
    costs: feeAmount === '0' ? [] : [fee(`fee:${id}`, feeAmount)],
  };
}
function input(
  sources: readonly InventorySource[],
  policy: InventoryPolicy = 'fifo',
): InventoryReplayInput {
  return {
    scope,
    manifest: INVENTORY_CALCULATION_MANIFEST,
    policy,
    capability: {
      subtype: 'ordinary-share',
      nativeInventory: true,
      shortSupported: true,
      averageCostSupported: true,
    },
    sources,
    sourceRevision: '999',
  };
}
function value(metric: InventoryMetric): string {
  expect(metric.status).toBe('available');
  expect(metric.reasons).toEqual([]);
  return metric.value!;
}
function mark(price: string) {
  return { id: 'mark', price, multiplier: '1', instant: '2026-01-01T13:00:00Z' };
}
function frozen<Value>(value: Value): Value {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) frozen(child);
  }
  return value;
}

describe('ordinary linear inventory independent fixture F-03', () => {
  const buyA = fill('A', '1', 'buy', '1.25', '80', '100', '0.50');
  const buyB = fill('B', '2', 'buy', '0.75', '120', '90', '0.30');
  const sale = fill('C', '3', 'sell', '1', '130', '130', '0.40');
  const cases = [
    {
      policy: 'fifo',
      basis: '110',
      average: '110',
      gross: '50',
      net: '49.2',
      unrealized: '15',
      unrealizedNet: '14.6',
      finalNet: '14.1',
    },
    {
      policy: 'average',
      basis: '95',
      average: '95',
      gross: '35',
      net: '34.2',
      unrealized: '30',
      unrealizedNet: '29.6',
      finalNet: '29.1',
    },
    {
      policy: 'specific',
      basis: '80',
      average: '80',
      gross: '20',
      net: '19.2',
      unrealized: '45',
      unrealizedNet: '44.6',
      finalNet: '44.1',
    },
  ] as const;
  it('uses only fills, retaining the fractional scale-in price independently of costs', () => {
    const first = replayInventory(input([buyA]));
    expect(value(first.openQuantity)).toBe('1.25');
    expect(value(first.averageEntryPrice)).toBe('80');
    const bought = replayInventory(input([buyA, buyB]));
    expect(value(bought.openQuantity)).toBe('2');
    expect(value(bought.averageEntryPrice)).toBe('95');
    expect(value(bought.grossBasis)).toBe('190');
    expect(value(bought.netBasis)).toBe('190.8');
  });
  for (const expected of cases) {
    it(`matches ${expected.policy} and consumes all final costs without residues`, () => {
      const close =
        expected.policy === 'specific'
          ? {
              ...sale,
              specificLots: [
                { lotId: 'B', quantity: '0.75' },
                { lotId: 'A', quantity: '0.25' },
              ],
            }
          : sale;
      const result = replayInventory(frozen(input([close, buyB, buyA], expected.policy)));
      expect(value(result.openQuantity)).toBe('1');
      expect(value(result.grossBasis)).toBe(expected.basis);
      expect(value(result.averageEntryPrice)).toBe(expected.average);
      expect(value(result.realizedGross)).toBe(expected.gross);
      expect(value(result.realizedNet)).toBe(expected.net);
      const valued = valueInventory(result, { mark: mark('125') });
      expect(value(valued.unrealizedGross)).toBe(expected.unrealized);
      expect(value(valued.unrealizedNet)).toBe(expected.unrealizedNet);
      expect(sumDecimals([result.realizedNet.value!, valued.unrealizedNet.value!])).toBe('63.8');
      const finalFill = fill('D', '4', 'sell', '1', '125', '125', '0.50');
      const final = replayInventory(
        input(
          [
            buyA,
            buyB,
            close,
            expected.policy === 'specific'
              ? { ...finalFill, specificLots: [{ lotId: 'A', quantity: '1' }] }
              : finalFill,
          ],
          expected.policy,
        ),
      );
      expect(value(final.openQuantity)).toBe('0');
      expect(value(final.grossBasis)).toBe('0');
      expect(value(final.netBasis)).toBe('0');
      expect(value(final.realizedNet)).toBe('63.3');
      expect(
        sumDecimals(
          final.matches
            .filter((matched) => matched.closingSourceId === 'D')
            .map((matched) => matched.netPnl.value!),
        ),
      ).toBe(expected.finalNet);
      expect(final.lots).toHaveLength(2);
      expect(
        final.lots.every(
          (lot) =>
            lot.remainingQuantity === '0' &&
            lot.remainingPrincipal === '0' &&
            lot.costs.every((cost) => cost.amount === '0'),
        ),
      ).toBe(true);
      expect(final.averageEntryPrice).toMatchObject({
        status: 'unavailable',
        value: null,
        reasons: ['closed_position'],
      });
    });
  }
});

describe('shorts and zero crossings independent fixture F-04', () => {
  it('keeps short liability basis and explicitly attributed actual borrow costs', () => {
    const short = fill('short', '1', 'sell', '2.5', '40', '100', '0.50');
    const cover = fill('cover', '2', 'buy', '1', '30', '30', '0.20');
    const borrowing: InventorySource = {
      kind: 'cost-attribution',
      id: 'borrowing',
      effectId: 'borrow-effect',
      sourceRevision: '3',
      economicOrder: at('3'),
      cost: fee('borrow-cost', '0.30'),
      allocations: [
        { target: 'match', targetId: 'cover:short', amount: '0.12' },
        { target: 'lot', targetId: 'short', amount: '0.18' },
      ],
    };
    const result = replayInventory(input([short, cover, borrowing]));
    expect(value(result.openQuantity)).toBe('-1.5');
    expect(value(result.longQuantity)).toBe('0');
    expect(value(result.shortQuantity)).toBe('1.5');
    expect(value(result.grossBasis)).toBe('-60');
    expect(value(result.averageEntryPrice)).toBe('40');
    expect(value(result.realizedGross)).toBe('10');
    expect(value(result.realizedNet)).toBe('9.48');
    const valued = valueInventory(result, { mark: mark('35') });
    expect(value(valued.markedValue)).toBe('-52.5');
    expect(value(valued.unrealizedGross)).toBe('7.5');
    expect(value(valued.unrealizedNet)).toBe('7.02');
    expect(sumDecimals([result.realizedNet.value!, valued.unrealizedNet.value!])).toBe('16.5');
    const final = replayInventory(
      input([short, cover, borrowing, fill('final', '4', 'buy', '1.5', '35', '52.5', '0.30')]),
    );
    expect(value(final.openQuantity)).toBe('0');
    expect(value(final.realizedNet)).toBe('16.2');
  });
  it.each([
    {
      firstSide: 'sell',
      firstPrice: '40',
      firstPrincipal: '100',
      crossingSide: 'buy',
      crossingPrice: '30',
      crossingPrincipal: '90',
      mark: '32',
      open: '0.5',
      basis: '15',
      marked: '16',
      unrealized: '1',
      net: '0.9',
    },
    {
      firstSide: 'buy',
      firstPrice: '30',
      firstPrincipal: '75',
      crossingSide: 'sell',
      crossingPrice: '40',
      crossingPrincipal: '120',
      mark: '35',
      open: '-0.5',
      basis: '-20',
      marked: '-17.5',
      unrealized: '2.5',
      net: '2.4',
    },
  ] as const)(
    'partitions one $crossingSide execution between close and new exposure',
    (expected) => {
      const first = fill(
        'first',
        '1',
        expected.firstSide,
        '2.5',
        expected.firstPrice,
        expected.firstPrincipal,
        '0.50',
      );
      const crossing = fill(
        'crossing',
        '2',
        expected.crossingSide,
        '3',
        expected.crossingPrice,
        expected.crossingPrincipal,
        '0.60',
      );
      const result = replayInventory(input([first, crossing]));
      expect(result.matches).toHaveLength(1);
      expect(value(result.openQuantity)).toBe(expected.open);
      expect(value(result.grossBasis)).toBe(expected.basis);
      expect(value(result.realizedGross)).toBe('25');
      expect(value(result.realizedNet)).toBe('24');
      expect(result.matches[0]!.exitCosts[0]!.amount).toBe('0.5');
      expect(result.lots.find((lot) => lot.id === 'crossing')!.costs[0]!.amount).toBe('0.1');
      const valuation = valueInventory(result, { mark: mark(expected.mark) });
      expect(value(valuation.markedValue)).toBe(expected.marked);
      expect(value(valuation.unrealizedGross)).toBe(expected.unrealized);
      expect(value(valuation.unrealizedNet)).toBe(expected.net);
    },
  );
});

describe('quantity, booked principal and unknown opening basis', () => {
  it('F-11 retains the source price independently of cent-booked principal', () => {
    const buy = fill('buy', '1', 'buy', '10.3', '100.123', '1031.27', '2.06');
    const sale = fill('sale', '2', 'sell', '4.5', '120.127', '540.57', '1.08');
    const result = replayInventory(input([buy, sale]));
    expect(value(result.averageEntryPrice)).toBe('100.123');
    expect(value(result.openQuantity)).toBe('5.8');
    expect(sumDecimals(result.matches.map((matched) => matched.consumedPrincipal!))).toBe(
      '450.55485436893203883495145631067961165',
    );
    expect(value(result.grossBasis)).toBe('580.71514563106796116504854368932038835');
    expect(value(result.realizedGross)).toBe('90.01514563106796116504854368932038835');
    expect(value(result.matches[0]!.quotePricePnl)).toBe('90.018');
    expect(
      sumDecimals([
        result.matches[0]!.quotePricePnl.value!,
        result.matches[0]!.settlementRoundingPnl.value!,
      ]),
    ).toBe(result.realizedGross.value);
    expect(
      sumDecimals([result.lots[0]!.remainingPrincipal!, result.matches[0]!.consumedPrincipal!]),
    ).toBe('1031.27');
  });
  it.each(['fifo', 'average', 'specific'] as const)(
    'F-09 keeps unknown basis unknown under %s while quantities and marks remain usable',
    (policy) => {
      const opening: InventoryOpening = {
        kind: 'opening',
        id: 'opening',
        effectId: 'opening-effect',
        sourceRevision: '1',
        economicOrder: at('1'),
        direction: 'long',
        quantity: '5',
        multiplier: '1',
        entryPrice: null,
        bookedPrincipal: null,
        costs: [],
      };
      const sale = fill('sale', '2', 'sell', '2', '15', '30', '1');
      const result = replayInventory(
        input(
          [
            opening,
            policy === 'specific'
              ? { ...sale, specificLots: [{ lotId: 'opening', quantity: '2' }] }
              : sale,
          ],
          policy,
        ),
      );
      const valuation = valueInventory(result, { mark: mark('12') });
      expect(value(result.openQuantity)).toBe('3');
      expect(value(valuation.markedValue)).toBe('36');
      for (const metric of [
        result.grossBasis,
        result.realizedGross,
        result.realizedNet,
        valuation.unrealizedGross,
        valuation.unrealizedNet,
      ])
        expect(metric).toMatchObject({
          status: 'unavailable',
          value: null,
          reasons: ['unknown_basis'],
        });
      expect(result.averageEntryPrice.reasons).toEqual(['unknown_entry_price']);
    },
  );
  it('known basis does not manufacture an unknown original execution price', () => {
    const opening: InventoryOpening = {
      kind: 'opening',
      id: 'opening',
      effectId: 'opening-effect',
      sourceRevision: '1',
      economicOrder: at('1'),
      direction: 'long',
      quantity: '2',
      multiplier: '1',
      entryPrice: null,
      bookedPrincipal: '20',
      costs: [],
    };
    const result = replayInventory(input([opening]));
    expect(value(result.grossBasis)).toBe('20');
    expect(result.averageEntryPrice.status).toBe('unavailable');
    expect(value(valueInventory(result, { mark: mark('15') }).unrealizedGross)).toBe('10');
  });
  it('F-06 account FIFO remains separate from campaign naming/attribution', () => {
    const result = replayInventory(
      input([
        fill('X', '1', 'buy', '100', '10', '1000'),
        fill('Y', '2', 'buy', '100', '20', '2000'),
        fill('Y-close', '3', 'sell', '100', '30', '3000'),
      ]),
    );
    expect(value(result.realizedGross)).toBe('2000');
    expect(value(result.grossBasis)).toBe('2000');
    expect(value(result.openQuantity)).toBe('100');
    expect(value(valueInventory(result, { mark: mark('30') }).unrealizedGross)).toBe('1000');
    expect(result.matches[0]!.openingSourceId).toBe('X');
  });
});

describe('cost currency, charge dates, and conservative availability', () => {
  it('retains each original fee identity and charged currency, with explicit FX required for net', () => {
    const buy = {
      ...fill('buy', '1', 'buy', '2', '10', '20'),
      costs: [fee('USD-entry', '1'), fee('GBP-entry', '2', GBP)],
    };
    const sale = fill('sale', '2', 'sell', '1', '15', '15', '0.50');
    const result = replayInventory(input([buy, sale]));
    expect(value(result.realizedGross)).toBe('5');
    expect(result.realizedNet).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: ['missing_charged_currency_fx'],
    });
    expect(result.netBasis.status).toBe('unavailable');
    expect(result.matches[0]!.entryCosts.find((cost) => cost.id === 'GBP-entry')).toMatchObject({
      currencyId: GBP,
      amount: '1',
    });
    expect(result.lots[0]!.costs.find((cost) => cost.id === 'GBP-entry')).toMatchObject({
      currencyId: GBP,
      amount: '1',
    });
    const reviewed = {
      ...buy,
      costs: buy.costs.map((cost) =>
        cost.currencyId === GBP
          ? {
              ...cost,
              nativeFx: {
                observationId: 'GBP-USD-at-entry',
                rate: '1.25',
                baseCurrencyId: GBP,
                quoteCurrencyId: USD,
              },
            }
          : cost,
      ),
    };
    const translated = replayInventory(input([reviewed, sale]));
    expect(value(translated.realizedNet)).toBe('2.75');
    expect(value(translated.netBasis)).toBe('11.75');
    expect(value(valueInventory(translated, { mark: mark('15') }).unrealizedNet)).toBe('3.25');
  });
  it('incomplete costs leave gross calculations available without claiming net completeness', () => {
    const result = replayInventory(
      input([
        { ...fill('buy', '1', 'buy', '2', '10', '20'), costsComplete: false },
        fill('sale', '2', 'sell', '1', '15', '15'),
      ]),
    );
    expect(value(result.realizedGross)).toBe('5');
    expect(result.realizedNet.reasons).toEqual(['incomplete_costs']);
    expect(result.netBasis.reasons).toEqual(['incomplete_costs']);
  });
  it('retains rebates as signed costs and avoids a second cash/fee recognition', () => {
    const result = replayInventory(
      input([
        { ...fill('buy', '1', 'buy', '1', '10', '10'), costs: [fee('rebate', '-0.10')] },
        fill('sale', '2', 'sell', '1', '11', '11'),
      ]),
    );
    expect(value(result.realizedNet)).toBe('1.1');
    expect(result.originalCosts).toHaveLength(1);
  });
});

describe('reviewed prospective policy transition independent fixture F-19', () => {
  const first = {
    ...fill('L1', '1', 'buy', '2', '10', '20', '2'),
    basisReportingFx: fx('basis-L1', '0.8'),
    costs: [{ ...fee('fee:L1', '2'), reportingFx: fx('cost-L1', '0.8') }],
  };
  const second = {
    ...fill('L2', '2', 'buy', '2', '20', '40', '2'),
    basisReportingFx: fx('basis-L2', '0.9'),
    costs: [{ ...fee('fee:L2', '2'), reportingFx: fx('cost-L2', '0.9') }],
  };
  const snapshots: InventoryContributionSnapshot[] = [
    {
      lotId: 'L1',
      quantity: '2',
      bookedPrincipal: '20',
      quoteNotional: '20',
      costs: [{ costId: 'fee:L1', currencyId: USD, amount: '2' }],
      basisReportingFx: fx('basis-L1', '0.8'),
    },
    {
      lotId: 'L2',
      quantity: '2',
      bookedPrincipal: '40',
      quoteNotional: '40',
      costs: [{ costId: 'fee:L2', currencyId: USD, amount: '2' }],
      basisReportingFx: fx('basis-L2', '0.9'),
    },
  ];
  const transition: InventoryPolicyTransition = {
    kind: 'policy-transition',
    id: 'transition',
    effectId: 'transition-effect',
    sourceRevision: '3',
    economicOrder: at('3'),
    fromPolicy: 'fifo',
    toPolicy: 'average',
    fromPolicyVersion: INVENTORY_CALCULATION_MANIFEST.lotPolicyVersion,
    toPolicyVersion: 'average-policy/2',
    reviewed: true,
    contributions: snapshots,
  };
  const sale = {
    ...fill('sale', '4', 'sell', '2', '30', '60', '1'),
    basisReportingFx: fx('exit-rate', '1'),
    costs: [{ ...fee('fee:sale', '1'), reportingFx: fx('exit-cost-rate', '1') }],
  };
  it('conserves each historical principal/FX/cost contribution through average disposal', () => {
    const before = replayInventory(input([first, second]));
    const converted = replayInventory(input([first, second, transition]));
    expect(value(converted.grossBasis)).toBe(value(before.grossBasis));
    expect(value(converted.netBasis)).toBe('64');
    expect(value(converted.averageEntryPrice)).toBe('15');
    expect(converted.matches).toHaveLength(0);
    const result = replayInventory(input([first, second, transition, sale]));
    expect(value(result.realizedGross)).toBe('30');
    expect(value(result.realizedNet)).toBe('27');
    expect(value(result.openQuantity)).toBe('2');
    expect(value(result.grossBasis)).toBe('30');
    expect(value(result.averageEntryPrice)).toBe('15');
    expect(
      result.matches.map((matched) => [
        matched.openingSourceId,
        matched.quantity,
        matched.consumedPrincipal,
        matched.basisReportingFx?.rate,
      ]),
    ).toEqual([
      ['L1', '1', '10', '0.8'],
      ['L2', '1', '20', '0.9'],
    ]);
    const valuation = valueInventory(result, {
      mark: mark('25'),
      reportingCurrencyId: EUR,
      markReportingFx: fx('ending-rate', '1.1'),
    });
    expect(value(valuation.markedValue)).toBe('50');
    expect(value(valuation.unrealizedGross)).toBe('20');
    expect(value(valuation.unrealizedNet)).toBe('18');
    expect(value(valuation.realizedReportingTradingGross)).toBe('30');
    expect(value(valuation.realizedHoldingFx)).toBe('4');
    expect(value(valuation.realizedReportingNet)).toBe('31.3');
    expect(value(valuation.unrealizedReportingTradingGross)).toBe('22');
    expect(value(valuation.unrealizedHoldingFx)).toBe('7');
    expect(value(valuation.unrealizedReportingNet)).toBe('27.3');
    expect(valuation.observationIds).toEqual(
      expect.arrayContaining(['basis-L1', 'basis-L2', 'cost-L1', 'cost-L2', 'ending-rate']),
    );
  });
  it('rejects an unreviewed toggle and a snapshot that loses basis/cost/FX lineage', () => {
    expect(() =>
      replayInventory(input([first, second, { ...transition, reviewed: false }])),
    ).toThrow('policy_transition_review_required');
    expect(() =>
      replayInventory(
        input([
          first,
          second,
          {
            ...transition,
            contributions: [{ ...snapshots[0]!, quantity: '4', bookedPrincipal: '60' }],
          },
        ]),
      ),
    ).toThrow('policy_transition_conservation');
    expect(() =>
      replayInventory(
        input([
          first,
          second,
          {
            ...transition,
            contributions: [
              { ...snapshots[0]!, basisReportingFx: fx('altered-rate', '0.85') },
              snapshots[1]!,
            ],
          },
        ]),
      ),
    ).toThrow('policy_transition_conservation');
  });
});

describe('replay corrections, economic ordering and invariant guards', () => {
  it('F-08 selects the effective acquisition and ignores bookkeeping reversals', () => {
    const original = fill('old-buy', '1', 'buy', '5', '10', '50', '1');
    const sale = fill('sale', '2', 'sell', '3', '15', '45', '0.60');
    const replacement: InventoryFill = {
      ...fill('new-buy', '3', 'buy', '5', '12', '60', '1.50'),
      effectId: original.effectId,
      supersedesId: original.id,
      economicOrder: original.economicOrder,
    };
    const reversal: InventorySource = {
      kind: 'bookkeeping-reversal',
      id: 'reversal',
      effectId: 'reverse-effect',
      sourceRevision: '3',
      economicOrder: at('3'),
      reversesId: original.id,
    };
    const sources = [original, sale, reversal, replacement];
    const old = replayInventory({ ...input(sources), sourceRevision: '2' });
    const restated = replayInventory(input(sources));
    expect(value(old.realizedNet)).toBe('13.8');
    expect(value(restated.realizedNet)).toBe('7.5');
    expect(value(restated.grossBasis)).toBe('24');
    expect(value(valueInventory(restated, { mark: mark('20') }).unrealizedNet)).toBe('15.4');
    expect(restated.effectiveSourceIds).toEqual(['new-buy', 'sale']);
    expect(restated.matches).toHaveLength(1);
    expect(restated.matches[0]!.closingSourceId).toBe('sale');
    expect(selectEffectiveInventorySources(sources, '2').map((source) => source.id)).toEqual([
      'old-buy',
      'sale',
    ]);
  });
  it('a fee-only source correction changes no quantity or fictitious sale', () => {
    const original = fill('original', '1', 'buy', '5', '10', '50', '1');
    const sale = fill('sale', '2', 'sell', '5', '15', '75', '1');
    const replacement = {
      ...fill('replacement', '3', 'buy', '5', '10', '50', '1.50'),
      supersedesId: 'original',
      effectId: original.effectId,
      economicOrder: original.economicOrder,
    };
    const result = replayInventory(input([original, sale, replacement]));
    expect(value(result.openQuantity)).toBe('0');
    expect(value(result.realizedNet)).toBe('22.5');
    expect(result.matches).toHaveLength(1);
  });
  it('rejects competing correction successors and duplicate effective cost identities', () => {
    const original = fill('original', '1', 'buy', '1', '10', '10');
    const replacement = {
      ...fill('replacement', '2', 'buy', '1', '11', '11'),
      supersedesId: original.id,
      effectId: original.effectId,
    };
    const fork = {
      ...fill('fork', '3', 'buy', '1', '12', '12'),
      supersedesId: original.id,
      effectId: original.effectId,
    };
    expect(() => replayInventory(input([original, replacement, fork]))).toThrow(
      'conflicting_inventory_correction',
    );
    expect(() =>
      replayInventory(
        input([
          { ...original, costs: [fee('same-cost', '1')] },
          { ...fill('another', '2', 'buy', '1', '10', '10'), costs: [fee('same-cost', '1')] },
        ]),
      ),
    ).toThrow('duplicate_inventory_cost');
  });
  it('date-only/missing chronology and equal instant/sequence do not invent UUID ordering', () => {
    const first = fill('Z', '1', 'buy', '1', '10', '10');
    const second = {
      ...fill('A', '2', 'sell', '1', '15', '15'),
      economicOrder: first.economicOrder,
    };
    const tied = replayInventory(input([second, first]));
    expect(tied.status).toBe('unavailable');
    expect(tied.reasons).toEqual(['ambiguous_chronology']);
    expect(tied.realizedGross.value).toBeNull();
    const missing = replayInventory(
      input([{ ...first, economicOrder: { instant: null, sequence: '1' } }]),
    );
    expect(missing.reasons).toEqual(['ambiguous_chronology']);
    expect(value(missing.openQuantity)).toBe('1');
  });
  it('compares source microseconds/offsets exactly instead of losing them in JavaScript Date', () => {
    const buy = {
      ...fill('Z-buy', '1', 'buy', '1', '10', '10'),
      economicOrder: { instant: '2026-01-01T13:00:00.000000001+01:00', sequence: '9' },
    };
    const sale = {
      ...fill('A-sell', '2', 'sell', '1', '15', '15'),
      economicOrder: { instant: '2026-01-01T12:00:00.000000002Z', sequence: '0' },
    };
    const result = replayInventory(input([sale, buy]));
    expect(value(result.realizedGross)).toBe('5');
    expect(result.matches[0]!.openingSourceId).toBe('Z-buy');
    expect(result.effectiveSourceIds).toEqual(['Z-buy', 'A-sell']);
  });
  it('does not require a source sequence when precise instants establish chronology', () => {
    const buy = {
      ...fill('buy', '1', 'buy', '1', '10', '10'),
      economicOrder: { instant: '2026-01-01T12:00:00.000001Z', sequence: null },
    };
    const sale = {
      ...fill('sale', '2', 'sell', '1', '15', '15'),
      economicOrder: { instant: '2026-01-01T12:00:00.000002Z', sequence: null },
    };
    const result = replayInventory(input([sale, buy]));
    expect(result.realizedGross.value).toBe('5');
    expect(result.effectiveSourceIds).toEqual(['buy', 'sale']);
    expect(
      replayInventory(input([buy, { ...sale, economicOrder: buy.economicOrder }])).reasons,
    ).toEqual(['ambiguous_chronology']);
  });
  it('rejects explicit overconsumption, incompatible multipliers and invalid scalar sources', () => {
    const buy = fill('buy', '1', 'buy', '1', '10', '10');
    expect(() =>
      replayInventory(
        input([buy, { ...fill('close', '2', 'sell', '2', '15', '30'), closeOnly: true }]),
      ),
    ).toThrow('inventory_conflict');
    expect(() =>
      replayInventory(
        input([buy, { ...fill('other', '2', 'buy', '1', '10', '20'), multiplier: '2' }]),
      ),
    ).toThrow('incompatible_inventory_multiplier');
    expect(() => replayInventory(input([{ ...buy, quantity: '0' }]))).toThrow(InventoryError);
    expect(() =>
      replayInventory(input([{ ...buy, quantity: 0.1 as unknown as string }])),
    ).toThrow();
  });
  it('keeps actual advanced/unsupported short facts recordable without a guessed stock calculation', () => {
    const base = input([fill('sell', '1', 'sell', '2', '10', '20')]);
    const advanced = replayInventory({
      ...base,
      capability: { ...base.capability, subtype: 'inverse-perpetual', nativeInventory: true },
    });
    expect(value(advanced.openQuantity)).toBe('-2');
    expect(advanced.grossBasis.status).toBe('unsupported');
    expect(advanced.lots).toEqual([]);
    const noShort = replayInventory({
      ...base,
      capability: { ...base.capability, shortSupported: false },
    });
    expect(noShort.reasons).toEqual(['unsupported_short_inventory']);
    const oldEngine = replayInventory({
      ...base,
      manifest: { ...base.manifest, kernelVersion: 'missing-historical-engine/0' },
    });
    expect(oldEngine.reasons).toEqual(['unsupported_calculation_manifest']);
  });
  it('a missing or stale mark has explicit availability and cannot become zero P&L', () => {
    const result = replayInventory(input([fill('buy', '1', 'buy', '1', '10', '10')]));
    expect(valueInventory(result, { mark: null }).markedValue.reasons).toEqual(['missing_mark']);
    expect(
      valueInventory(result, { mark: { ...mark('15'), eligible: false } }).unrealizedGross.reasons,
    ).toEqual(['stale_price']);
    expect(() => valueInventory(result, { mark: { ...mark('15'), multiplier: '2' } })).toThrow(
      'incompatible_mark_multiplier',
    );
  });
  it('a genuine zero quote mark is an available zero asset value and complete loss', () => {
    const result = replayInventory(input([fill('buy', '1', 'buy', '1', '10', '10', '1')]));
    const valuation = valueInventory(result, { mark: mark('0') });
    expect(value(valuation.markedValue)).toBe('0');
    expect(value(valuation.unrealizedGross)).toBe('-10');
    expect(value(valuation.unrealizedNet)).toBe('-11');
  });
  it("a separate account scope cannot borrow this account's lot source", () => {
    const accountA = replayInventory(input([fill('buy-A', '1', 'buy', '1', '10', '10')]));
    const accountB = replayInventory({
      ...input([fill('sell-B', '2', 'sell', '1', '15', '15')]),
      scope: { ...scope, accountId: 'B' },
    });
    expect(value(accountA.openQuantity)).toBe('1');
    expect(value(accountB.openQuantity)).toBe('-1');
    expect(accountB.matches).toHaveLength(0);
    expect(value(accountB.realizedGross)).toBe('0');
  });
});

describe('inventory conservation properties', () => {
  it('replay is immutable and independent of payload order, with exact principal/cost conservation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 100 }),
        (units, entry, exit, charge) => {
          const quantity = BigInt(units);
          const source = frozen(
            input([
              fill(
                'buy',
                '1',
                'buy',
                String(units),
                String(entry),
                String(quantity * BigInt(entry)),
                String(charge),
              ),
              fill(
                'sell',
                '2',
                'sell',
                String(units),
                String(exit),
                String(quantity * BigInt(exit)),
                String(charge),
              ),
            ]),
          );
          const result = replayInventory(source);
          const restored = replayInventory(
            JSON.parse(JSON.stringify(source)) as InventoryReplayInput,
          );
          const reversed = replayInventory({ ...source, sources: [...source.sources].reverse() });
          expect(result).toEqual(restored);
          expect(result).toEqual(reversed);
          expect(value(result.openQuantity)).toBe('0');
          expect(value(result.grossBasis)).toBe('0');
          expect(value(result.realizedNet)).toBe(
            String(quantity * (BigInt(exit) - BigInt(entry)) - 2n * BigInt(charge)),
          );
          expect(sumDecimals(result.matches.map((matched) => matched.consumedPrincipal!))).toBe(
            String(quantity * BigInt(entry)),
          );
        },
      ),
      { numRuns: 150, seed: 20261010 },
    );
  });
  it('arbitrary fractional partials preserve every original cost and end with no residual basis', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }),
        fc.integer({ min: 1, max: 999 }),
        (total, candidate) => {
          const take = Math.min(candidate, total - 1);
          const remaining = total - take;
          const result = replayInventory(
            input([
              fill('buy', '1', 'buy', String(total), '1', String(total), '0.01'),
              fill('partial', '2', 'sell', String(take), '2', String(BigInt(take) * 2n), '0.01'),
              fill(
                'final',
                '3',
                'sell',
                String(remaining),
                '2',
                String(BigInt(remaining) * 2n),
                '0.01',
              ),
            ]),
          );
          expect(
            sumDecimals(
              result.matches.flatMap((matched) => matched.entryCosts.map((cost) => cost.amount)),
            ),
          ).toBe('0.01');
          expect(sumDecimals(result.matches.map((matched) => matched.consumedPrincipal!))).toBe(
            String(total),
          );
          expect(value(result.grossBasis)).toBe('0');
          expect(result.lots[0]!.costs[0]!.amount).toBe('0');
        },
      ),
      { numRuns: 150, seed: 20261011 },
    );
  });
});
