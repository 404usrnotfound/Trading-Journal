import { describe, expect, it } from 'vitest';
import {
  INVENTORY_CALCULATION_MANIFEST,
  allocateCampaignExecution,
  reconcileCampaignInventory,
  replayCampaignInventory,
  replayInventory,
  sumDecimals,
  valueInventory,
  type InventoryCampaignAllocation,
  type InventoryFill,
  type InventoryReplayInput,
  type InventorySource,
} from '../../packages/domain/src/index.js';

const scope = {
  workspaceId: 'workspace',
  accountId: 'account',
  instrumentId: 'share',
  instrumentVersionId: 'metadata/1',
  unitVersionId: 'unit/1',
  settlementCurrencyId: 'USD',
};
const at = (sequence: string) => ({
  instant: `2026-01-01T12:00:${sequence.padStart(2, '0')}Z`,
  sequence: null,
});
const capability = {
  subtype: 'ordinary-share',
  nativeInventory: true,
  shortSupported: true,
  averageCostSupported: true,
};
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
        : [{ id: `fee:${id}`, amount: cost, currencyId: 'USD', chargedAt: at(sequence).instant }],
  };
}
function account(sources: readonly InventorySource[]): InventoryReplayInput {
  return {
    scope,
    manifest: INVENTORY_CALCULATION_MANIFEST,
    policy: 'fifo',
    capability,
    sources,
    sourceRevision: '99',
  };
}
function campaign(allocations: readonly InventoryCampaignAllocation[], legId: string | null) {
  return replayCampaignInventory({
    scope,
    manifest: INVENTORY_CALCULATION_MANIFEST,
    capability,
    sourceRevision: '99',
    allocations: allocations.filter((allocation) => allocation.legId === legId),
  });
}
const mark = { id: 'mark', price: '12', multiplier: '1', instant: '2026-01-01T13:00:00Z' };

describe('campaign attributed-flow FIFO independent fixture F-06', () => {
  it('partitions one fill across ideas without doubling quantity or original charges', () => {
    const buy = fill('buy', '1', 'buy', '100', '10', '1000', '1');
    const sale = fill('sale', '2', 'sell', '60', '12', '720');
    const allocated = [
      ...allocateCampaignExecution(buy, [
        { id: 'X-entry', legId: 'X', role: 'open', direction: 'long', quantity: '60' },
        { id: 'Y-entry', legId: 'Y', role: 'open', direction: 'long', quantity: '40' },
      ]),
      ...allocateCampaignExecution(sale, [
        { id: 'X-close', legId: 'X', role: 'close', direction: 'long', quantity: '20' },
        { id: 'Y-close', legId: 'Y', role: 'close', direction: 'long', quantity: '40' },
      ]),
    ];
    expect(allocated[0]!.costs[0]!.amount).toBe('0.6');
    expect(allocated[1]!.costs[0]!.amount).toBe('0.4');
    const actual = replayInventory(account([buy, sale]));
    const X = campaign(allocated, 'X');
    const Y = campaign(allocated, 'Y');
    expect(actual.population).toBe('account-inventory');
    expect(X.population).toBe('campaign-attribution');
    expect(X.policyVersion).toBe('campaign-attributed-fifo/1');
    expect(actual.openQuantity.value).toBe('40');
    expect(X.openQuantity.value).toBe('40');
    expect(Y.openQuantity.value).toBe('0');
    expect(actual.realizedGross.value).toBe('120');
    expect(X.realizedGross.value).toBe('40');
    expect(Y.realizedGross.value).toBe('80');
    expect(X.realizedNet.value).toBe('39.8');
    expect(Y.realizedNet.value).toBe('79.6');
    const valuedX = valueInventory(X, { mark });
    expect(valuedX.unrealizedGross.value).toBe('80');
    expect(valuedX.unrealizedNet.value).toBe('79.6');
    expect(
      sumDecimals([X.realizedNet.value!, Y.realizedNet.value!, valuedX.unrealizedNet.value!]),
    ).toBe('199');
    const bridge = reconcileCampaignInventory(actual, [X, Y]);
    expect(bridge.quantityDifference.value).toBe('0');
    expect(bridge.grossBasisDifference.value).toBe('0');
    expect(bridge.realizedGrossDifference.value).toBe('0');
    expect(bridge.reconciliationResidual.value).toBe('0');
    expect(bridge.ownership).toBe('attribution-only');
    expect(bridge.opposingClaims).toBe(false);
    expect(bridge.accountSourceIds).toEqual(['buy', 'sale']);
    expect(bridge.attributedSourceIds).toEqual(['buy', 'sale']);
  });
  it('names the actual-FIFO versus campaign-basis timing difference and remaining counterpart', () => {
    const buyX = fill('X-buy', '1', 'buy', '100', '10', '1000');
    const buyY = fill('Y-buy', '2', 'buy', '100', '20', '2000');
    const saleY = fill('Y-sale', '3', 'sell', '100', '30', '3000');
    const allocated = [
      ...allocateCampaignExecution(buyX, [
        { id: 'X-entry', legId: 'X', role: 'open', direction: 'long', quantity: '100' },
      ]),
      ...allocateCampaignExecution(buyY, [
        { id: 'Y-entry', legId: 'Y', role: 'open', direction: 'long', quantity: '100' },
      ]),
      ...allocateCampaignExecution(saleY, [
        { id: 'Y-close', legId: 'Y', role: 'close', direction: 'long', quantity: '100' },
      ]),
    ];
    const actual = replayInventory(account([buyX, buyY, saleY]));
    const X = campaign(allocated, 'X');
    const Y = campaign(allocated, 'Y');
    expect(actual.realizedGross.value).toBe('2000');
    expect(actual.grossBasis.value).toBe('2000');
    expect(X.grossBasis.value).toBe('1000');
    expect(Y.realizedGross.value).toBe('1000');
    const priced = { ...mark, price: '30' };
    expect(valueInventory(actual, { mark: priced }).unrealizedGross.value).toBe('1000');
    expect(valueInventory(X, { mark: priced }).unrealizedGross.value).toBe('2000');
    const bridge = reconcileCampaignInventory(actual, [X, Y]);
    expect(bridge.quantityDifference.value).toBe('0');
    expect(bridge.basisAttributionDifference.value).toBe('1000');
    expect(bridge.grossBasisDifference.value).toBe('1000');
    expect(bridge.remainingCounterpart.value).toBe('-1000');
    expect(bridge.reconciliationResidual.value).toBe('0');
    expect(actual.openQuantity.value).toBe('100');
    expect(sumDecimals([X.openQuantity.value!, Y.openQuantity.value!])).toBe('100');
  });
  it('requires unassigned activity to reconcile and preserves its original fee pieces', () => {
    const buy = fill('buy', '1', 'buy', '100', '10', '1000', '1');
    const allocated = allocateCampaignExecution(buy, [
      { id: 'X-entry', legId: 'X', role: 'open', direction: 'long', quantity: '80' },
      { id: 'unassigned-entry', legId: null, role: 'open', direction: 'long', quantity: '20' },
    ]);
    const actual = replayInventory(account([buy]));
    const X = campaign(allocated, 'X');
    const unassigned = campaign(allocated, null);
    expect(unassigned.openQuantity.value).toBe('20');
    expect(unassigned.lots[0]!.costs[0]!.amount).toBe('0.2');
    expect(reconcileCampaignInventory(actual, [X]).quantityDifference.value).toBe('20');
    expect(reconcileCampaignInventory(actual, [X, unassigned]).quantityDifference.value).toBe('0');
  });
  it('retains a valid zero allocation residual without creating a zero-quantity execution', () => {
    const buy = fill('buy', '1', 'buy', '1', '10', '10', '0.01');
    const allocated = allocateCampaignExecution(buy, [
      { id: 'assigned', legId: 'leg', role: 'open', direction: 'long', quantity: '1' },
      { id: 'unassigned', legId: null, role: 'open', direction: 'long', quantity: '0' },
    ]);
    expect(allocated[1]!.bookedPrincipal).toBe('0');
    expect(allocated[1]!.costs[0]!.amount).toBe('0');
    expect(campaign(allocated, null).openQuantity.value).toBe('0');
    expect(campaign(allocated, null).lots).toEqual([]);
  });
  it('records missing campaign opening as unavailable instead of borrowing account basis or opening a short', () => {
    const sale = fill('imported-sale', '2', 'sell', '5', '30', '150', '1');
    const allocated = allocateCampaignExecution(sale, [
      { id: 'Y-close', legId: 'Y', role: 'close', direction: 'long', quantity: '5' },
    ]);
    const Y = campaign(allocated, 'Y');
    expect(Y.status).toBe('unavailable');
    expect(Y.reasons).toEqual(['missing_campaign_opening']);
    expect(Y.realizedGross.value).toBeNull();
    expect(Y.openQuantity.value).toBeNull();
    expect(Y.lots).toEqual([]);
    expect(Y.matches).toEqual([]);
    expect(valueInventory(Y, { mark }).markedValue).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: ['missing_campaign_opening'],
    });
  });
  it('partitions zero crossing into explicit close and new opposite-direction roles', () => {
    const buy = fill('buy', '1', 'buy', '10', '10', '100', '1');
    const crossing = fill('crossing', '2', 'sell', '15', '12', '180', '1.5');
    const allocated = [
      ...allocateCampaignExecution(buy, [
        { id: 'long-entry', legId: 'long', role: 'open', direction: 'long', quantity: '10' },
      ]),
      ...allocateCampaignExecution(crossing, [
        { id: 'long-close', legId: 'long', role: 'close', direction: 'long', quantity: '10' },
        { id: 'short-entry', legId: 'short', role: 'open', direction: 'short', quantity: '5' },
      ]),
    ];
    const actual = replayInventory(account([buy, crossing]));
    const long = campaign(allocated, 'long');
    const short = campaign(allocated, 'short');
    expect(long.realizedNet.value).toBe('18');
    expect(long.openQuantity.value).toBe('0');
    expect(short.openQuantity.value).toBe('-5');
    expect(short.grossBasis.value).toBe('-60');
    expect(short.lots[0]!.costs[0]!.amount).toBe('0.5');
    const bridge = reconcileCampaignInventory(actual, [long, short]);
    expect(bridge.quantityDifference.value).toBe('0');
    expect(bridge.reconciliationResidual.value).toBe('0');
  });
  it('labels opposing idea claims while actual netted account ownership remains zero', () => {
    const buy = fill('buy', '1', 'buy', '100', '10', '1000');
    const sell = fill('sell', '2', 'sell', '100', '20', '2000');
    const allocated = [
      ...allocateCampaignExecution(buy, [
        { id: 'long-entry', legId: 'long', role: 'open', direction: 'long', quantity: '100' },
      ]),
      ...allocateCampaignExecution(sell, [
        { id: 'short-entry', legId: 'short', role: 'open', direction: 'short', quantity: '100' },
      ]),
    ];
    const actual = replayInventory(account([buy, sell]));
    const long = campaign(allocated, 'long');
    const short = campaign(allocated, 'short');
    const bridge = reconcileCampaignInventory(actual, [long, short]);
    expect(actual.openQuantity.value).toBe('0');
    expect(actual.lots.every((lot) => lot.remainingQuantity === '0')).toBe(true);
    expect(bridge.opposingClaims).toBe(true);
    expect(bridge.attributedLongQuantity.value).toBe('100');
    expect(bridge.attributedShortQuantity.value).toBe('100');
    expect(bridge.quantityDifference.value).toBe('0');
    expect(bridge.basisAttributionDifference.value).toBe('1000');
    expect(bridge.remainingCounterpart.value).toBe('-1000');
    expect(bridge.reconciliationResidual.value).toBe('0');
    expect(bridge.ownership).toBe('attribution-only');
  });
  it('rejects incompatible populations, revision mismatches and nonconserved/direction-conflicting allocation', () => {
    const buy = fill('buy', '1', 'buy', '100', '10', '1000');
    expect(() =>
      allocateCampaignExecution(buy, [
        { id: 'allocation', legId: 'leg', role: 'open', direction: 'long', quantity: '99' },
      ]),
    ).toThrow('campaign_quantity_conservation');
    expect(() =>
      allocateCampaignExecution(buy, [
        { id: 'allocation', legId: 'leg', role: 'close', direction: 'long', quantity: '100' },
      ]),
    ).toThrow('campaign_direction_review_required');
    const allocated = allocateCampaignExecution(buy, [
      { id: 'allocation', legId: 'leg', role: 'open', direction: 'long', quantity: '100' },
    ]);
    const actual = replayInventory(account([buy]));
    const attributed = campaign(allocated, 'leg');
    expect(() =>
      reconcileCampaignInventory(actual, [
        { ...attributed, scope: { ...scope, accountId: 'other' } },
      ]),
    ).toThrow('incompatible_campaign_population');
    expect(() =>
      reconcileCampaignInventory(actual, [{ ...attributed, sourceRevision: '98' }]),
    ).toThrow('incompatible_campaign_revision');
    expect(() => reconcileCampaignInventory(actual, [actual])).toThrow(
      'invalid_campaign_inventory_population',
    );
  });
});
