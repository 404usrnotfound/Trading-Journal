import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  INVENTORY_CALCULATION_MANIFEST,
  prepareHoldingTransfer,
  replayInventory,
  sumDecimals,
  valueInventory,
  type InventoryFill,
  type InventoryOpening,
  type InventoryReplayInput,
  type InventorySource,
} from '../../packages/domain/src/index.js';

const at = (sequence: string) => ({
  instant: `2026-01-01T12:00:${sequence.padStart(2, '0')}.000001Z`,
  sequence: null,
});
const scope = {
  workspaceId: 'workspace',
  accountId: 'A',
  instrumentId: 'share',
  instrumentVersionId: 'metadata/1',
  unitVersionId: 'unit/1',
  settlementCurrencyId: 'EUR',
};
const destinationScope = { ...scope, accountId: 'B' };
function fill(
  id: string,
  sequence: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  principal: string,
  cost = '0',
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
    costs:
      cost === '0'
        ? []
        : [{ id: `fee:${id}`, currencyId: 'EUR', amount: cost, chargedAt: at(sequence).instant }],
  };
}
function input(sources: readonly InventorySource[], accountId = 'A'): InventoryReplayInput {
  return {
    scope: { ...scope, accountId },
    manifest: INVENTORY_CALCULATION_MANIFEST,
    policy: 'fifo',
    capability: {
      subtype: 'ordinary-share',
      nativeInventory: true,
      shortSupported: true,
      averageCostSupported: true,
    },
    sources,
    sourceRevision: '99',
  };
}
function transfer(sources: readonly InventorySource[], quantity = '4') {
  return prepareHoldingTransfer(replayInventory(input(sources)), {
    transferId: 'transfer',
    departureId: 'departure',
    receiptId: 'receipt',
    destinationScope,
    sourceRevision: '2',
    destinationSourceRevision: '2',
    economicOrder: at('2'),
    selections: [{ lotId: sources[0]!.id, quantity, destinationLotId: 'B-carried-lot' }],
  });
}
const mark = { id: 'mark', price: '25', multiplier: '1', instant: '2026-01-01T13:00:00Z' };

describe('holding transfer lineage independent fixture F-07', () => {
  it('fully departs and closes carried lots before subsequent independent inventory', () => {
    const purchase = fill('A-purchase', '1', 'buy', '10', '20', '200', '2');
    const pair = transfer([purchase], '10');
    const accountA = replayInventory(
      input([purchase, pair.departure, fill('A-new-short', '3', 'sell', '1', '25', '25')]),
    );
    expect(accountA.lots.map((lot) => [lot.id, lot.remainingQuantity])).toEqual([
      ['A-purchase', '0'],
      ['A-new-short', '1'],
    ]);
    expect(accountA.matches).toEqual([]);
    expect(accountA.openQuantity.value).toBe('-1');
    expect(accountA.grossBasis.value).toBe('-25');
    expect(accountA.transferredCosts[0]!.amount).toBe('2');

    const accountB = replayInventory(
      input(
        [
          pair.receipt,
          fill('B-close', '3', 'sell', '10', '25', '250', '1'),
          fill('B-new-buy', '4', 'buy', '0.5', '30', '15'),
        ],
        'B',
      ),
    );
    expect(accountB.lots.map((lot) => [lot.id, lot.remainingQuantity])).toEqual([
      ['B-carried-lot', '0'],
      ['B-new-buy', '0.5'],
    ]);
    expect(accountB.matches[0]!.openingSourceId).toBe('A-purchase');
    expect(accountB.realizedGross.value).toBe('50');
    expect(accountB.realizedNet.value).toBe('47');
    expect(accountB.openQuantity.value).toBe('0.5');
    expect(accountB.grossBasis.value).toBe('15');
  });

  it('carries exact basis and original fee without creating a disposal or purchase', () => {
    const purchase = fill('A-purchase', '1', 'buy', '10', '20', '200', '2');
    const pair = transfer([purchase]);
    const accountA = replayInventory(input([purchase, pair.departure]));
    const saleB = fill('B-sale', '3', 'sell', '2', '25', '50', '1');
    const accountB = replayInventory(input([pair.receipt, saleB], 'B'));
    expect(pair.departure.slices).toEqual(pair.receipt.slices);
    expect(pair.receipt.slices[0]).toMatchObject({
      parentLotId: 'A-purchase',
      sourceId: 'A-purchase',
      economicOrder: purchase.economicOrder,
      bookedPrincipal: '80',
      costs: [{ id: 'fee:A-purchase', currencyId: 'EUR', amount: '0.8' }],
    });
    expect(accountA.matches).toEqual([]);
    expect(accountA.realizedGross.value).toBe('0');
    expect(accountA.realizedNet.value).toBe('0');
    expect(accountA.openQuantity.value).toBe('6');
    expect(accountB.openQuantity.value).toBe('2');
    expect(accountA.grossBasis.value).toBe('120');
    expect(accountB.grossBasis.value).toBe('40');
    expect(accountA.lots[0]!.costs[0]!.amount).toBe('1.2');
    expect(accountA.transferredCosts[0]!.amount).toBe('0.8');
    expect(accountB.lots[0]!.costs[0]!.amount).toBe('0.4');
    expect(accountB.realizedGross.value).toBe('10');
    expect(accountB.realizedNet.value).toBe('8.6');
    expect(accountB.matches[0]!.openingSourceId).toBe('A-purchase');
    const valuedA = valueInventory(accountA, { mark });
    const valuedB = valueInventory(accountB, { mark });
    expect(valuedA.markedValue.value).toBe('150');
    expect(valuedB.markedValue.value).toBe('50');
    expect(valuedA.unrealizedGross.value).toBe('30');
    expect(valuedB.unrealizedGross.value).toBe('10');
    expect(valuedA.unrealizedNet.value).toBe('28.8');
    expect(valuedB.unrealizedNet.value).toBe('9.6');
    expect(
      sumDecimals([
        accountB.realizedNet.value!,
        valuedA.unrealizedNet.value!,
        valuedB.unrealizedNet.value!,
      ]),
    ).toBe('47');
    expect(
      sumDecimals(
        [
          ...accountA.lots.flatMap((lot) => lot.costs),
          ...accountB.lots.flatMap((lot) => lot.costs),
          ...accountB.matches.flatMap((match) => match.entryCosts),
        ].map((cost) => cost.amount),
      ),
    ).toBe('2');
  });
  it('uses original acquisition chronology before an earlier-arriving destination acquisition', () => {
    const purchaseA = fill('old-origin', '1', 'buy', '10', '20', '200');
    const pair = prepareHoldingTransfer(replayInventory(input([purchaseA])), {
      transferId: 'transfer',
      departureId: 'departure',
      receiptId: 'receipt',
      destinationScope,
      sourceRevision: '3',
      destinationSourceRevision: '3',
      economicOrder: at('3'),
      selections: [{ lotId: 'old-origin', quantity: '4', destinationLotId: 'old-carried-lot' }],
    });
    const newerPurchaseB = fill('newer-B', '2', 'buy', '2', '30', '60');
    const accountB = replayInventory(
      input([newerPurchaseB, pair.receipt, fill('sale-B', '4', 'sell', '2', '40', '80')], 'B'),
    );
    expect(accountB.matches[0]!.openingSourceId).toBe('old-origin');
    expect(accountB.realizedGross.value).toBe('40');
    expect(accountB.grossBasis.value).toBe('100');
  });
  it('preserves unknown basis and fee completeness instead of resetting basis at receipt', () => {
    const opening: InventoryOpening = {
      kind: 'opening',
      id: 'unknown-opening',
      effectId: 'unknown-effect',
      sourceRevision: '1',
      economicOrder: at('1'),
      direction: 'long',
      quantity: '5',
      multiplier: '1',
      entryPrice: null,
      bookedPrincipal: null,
      costs: [],
      costsComplete: false,
    };
    const pair = transfer([opening], '3');
    const accountA = replayInventory(input([opening, pair.departure]));
    const accountB = replayInventory(
      input([pair.receipt, fill('sale', '3', 'sell', '1', '25', '25')], 'B'),
    );
    expect(accountA.openQuantity.value).toBe('2');
    expect(accountB.openQuantity.value).toBe('2');
    expect(accountB.lots[0]!.remainingPrincipal).toBeNull();
    expect(accountB.lots[0]!.entryPrice).toBeNull();
    expect(accountB.lots[0]!.costsComplete).toBe(false);
    expect(accountB.realizedGross.reasons).toEqual(['unknown_basis']);
    expect(valueInventory(accountB, { mark }).markedValue.value).toBe('50');
    expect(valueInventory(accountB, { mark }).unrealizedGross.reasons).toEqual(['unknown_basis']);
  });
  it('retains historical basis and third-currency charge rates through destination disposal', () => {
    const original = {
      ...fill('origin', '1', 'buy', '10', '20', '200'),
      basisReportingFx: {
        observationId: 'EUR-USD-entry',
        rate: '1.2',
        baseCurrencyId: 'EUR',
        quoteCurrencyId: 'USD',
      },
      costs: [
        {
          id: 'GBP-entry-fee',
          amount: '2',
          currencyId: 'GBP',
          chargedAt: at('1').instant,
          nativeFx: {
            observationId: 'GBP-EUR-entry',
            rate: '1.5',
            baseCurrencyId: 'GBP',
            quoteCurrencyId: 'EUR',
          },
          reportingFx: {
            observationId: 'GBP-USD-entry',
            rate: '1.8',
            baseCurrencyId: 'GBP',
            quoteCurrencyId: 'USD',
          },
        },
      ],
    };
    const pair = transfer([original]);
    const sale = {
      ...fill('sale', '3', 'sell', '2', '25', '50'),
      basisReportingFx: {
        observationId: 'EUR-USD-exit',
        rate: '1.3',
        baseCurrencyId: 'EUR',
        quoteCurrencyId: 'USD',
      },
    };
    const accountB = replayInventory(input([pair.receipt, sale], 'B'));
    const valuation = valueInventory(accountB, {
      mark,
      reportingCurrencyId: 'USD',
      markReportingFx: {
        observationId: 'EUR-USD-mark',
        rate: '1.4',
        baseCurrencyId: 'EUR',
        quoteCurrencyId: 'USD',
      },
    });
    expect(accountB.realizedNet.value).toBe('9.4');
    expect(valuation.realizedReportingTradingGross.value).toBe('13');
    expect(valuation.realizedHoldingFx.value).toBe('4');
    expect(valuation.realizedReportingNet.value).toBe('16.28');
    expect(valuation.unrealizedHoldingFx.value).toBe('8');
    expect(valuation.observationIds).toEqual(
      expect.arrayContaining(['EUR-USD-entry', 'GBP-EUR-entry', 'GBP-USD-entry']),
    );
  });
  it('supports carried short basis without creating a long holding or another liability', () => {
    const short = fill('short-origin', '1', 'sell', '10', '20', '200', '2');
    const pair = transfer([short]);
    const accountB = replayInventory(
      input([pair.receipt, fill('cover', '3', 'buy', '2', '15', '30', '1')], 'B'),
    );
    expect(accountB.openQuantity.value).toBe('-2');
    expect(accountB.grossBasis.value).toBe('-40');
    expect(accountB.realizedGross.value).toBe('10');
    expect(accountB.realizedNet.value).toBe('8.6');
    expect(valueInventory(accountB, { mark: { ...mark, price: '15' } }).markedValue.value).toBe(
      '-30',
    );
  });
  it('rejects overconsumption, incompatible units, duplicated selections and forged carried basis', () => {
    const purchase = fill('origin', '1', 'buy', '10', '20', '200', '2');
    expect(() => transfer([purchase], '11')).toThrow('inventory_conflict');
    const base = {
      transferId: 'transfer',
      departureId: 'departure',
      receiptId: 'receipt',
      destinationScope,
      sourceRevision: '2',
      destinationSourceRevision: '2',
      economicOrder: at('2'),
      selections: [{ lotId: 'origin', quantity: '4', destinationLotId: 'destination' }],
    };
    const before = replayInventory(input([purchase]));
    expect(() =>
      prepareHoldingTransfer(before, {
        ...base,
        destinationScope: { ...destinationScope, unitVersionId: 'changed-unit' },
      }),
    ).toThrow('incompatible_holding_transfer');
    expect(() => prepareHoldingTransfer(before, { ...base, destinationScope: scope })).toThrow(
      'same_account_holding_transfer',
    );
    expect(() =>
      prepareHoldingTransfer(before, {
        ...base,
        selections: [...base.selections, ...base.selections],
      }),
    ).toThrow('duplicate_holding_transfer_selection');
    const pair = transfer([purchase]);
    const corrupted = {
      ...pair.departure,
      slices: [{ ...pair.departure.slices[0]!, bookedPrincipal: '81' }],
    };
    expect(() => replayInventory(input([purchase, corrupted]))).toThrow(
      'holding_transfer_lineage_conflict',
    );
    expect(() =>
      replayInventory(input([fill('opposite', '1', 'sell', '1', '20', '20'), pair.receipt], 'B')),
    ).toThrow('holding_transfer_direction_conflict');
  });
  it('accepts JSON object key reordering without weakening carried-value checks', () => {
    const purchase = fill('origin', '1', 'buy', '10', '20', '200', '2');
    const pair = transfer([purchase]);
    const reordered = JSON.parse(
      JSON.stringify(pair.departure, (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([left], [right]) => right.localeCompare(left)),
            )
          : value,
      ),
    ) as typeof pair.departure;
    expect(replayInventory(input([purchase, reordered]))).toEqual(
      replayInventory(input([purchase, pair.departure])),
    );
  });
  it('conserves principal and indivisible scale-36 charge pieces under arbitrary partial transfers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }),
        fc.integer({ min: 1, max: 999 }),
        (quantity, candidate) => {
          const take = Math.min(candidate, quantity - 1);
          const purchase = fill(
            'origin',
            '1',
            'buy',
            String(quantity),
            '3',
            String(BigInt(quantity) * 3n),
            '0.000000000000000000000000000000000007',
          );
          const pair = transfer([purchase], String(take));
          const accountA = replayInventory(input([purchase, pair.departure]));
          const accountB = replayInventory(input([pair.receipt], 'B'));
          expect(sumDecimals([accountA.openQuantity.value!, accountB.openQuantity.value!])).toBe(
            String(quantity),
          );
          expect(sumDecimals([accountA.grossBasis.value!, accountB.grossBasis.value!])).toBe(
            String(BigInt(quantity) * 3n),
          );
          expect(
            sumDecimals(
              [...accountA.lots, ...accountB.lots].flatMap((lot) =>
                lot.costs.map((cost) => cost.amount),
              ),
            ),
          ).toBe('0.000000000000000000000000000000000007');
          expect(accountA.realizedGross.value).toBe('0');
          expect(accountB.realizedGross.value).toBe('0');
        },
      ),
      { numRuns: 120, seed: 20261012 },
    );
  });
});
