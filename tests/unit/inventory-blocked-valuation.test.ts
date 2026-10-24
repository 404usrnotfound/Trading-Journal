import { describe, expect, it } from 'vitest';
import {
  INVENTORY_CALCULATION_MANIFEST,
  replayInventory,
  valueInventory,
  type InventoryFill,
} from '@journal/domain';

const fill: InventoryFill = {
  kind: 'fill',
  id: 'buy',
  effectId: 'buy',
  sourceRevision: '1',
  economicOrder: { instant: '2025-01-01T00:00:00Z', sequence: '1' },
  side: 'buy',
  quantity: '10',
  price: '100',
  multiplier: '1',
  bookedPrincipal: '1000',
  costs: [],
  costsComplete: true,
};
const input = {
  scope: {
    workspaceId: 'workspace',
    accountId: 'account',
    instrumentId: 'instrument',
    instrumentVersionId: 'version',
    unitVersionId: 'share',
    settlementCurrencyId: 'USD',
  },
  manifest: INVENTORY_CALCULATION_MANIFEST,
  policy: 'fifo' as const,
  capability: {
    subtype: 'ordinary-share',
    nativeInventory: true,
    shortSupported: true,
    averageCostSupported: true,
  },
  sourceRevision: '2',
};
describe('blocked replay never establishes reporting zero', () => {
  it.each(['price', 'multiplier', 'bookedPrincipal'] as const)(
    'preserves missing %s across native and reporting outcomes',
    (missing) => {
      const replay = replayInventory({
        ...input,
        sources: [
          { ...fill, [missing]: null },
          {
            ...fill,
            id: 'sell',
            effectId: 'sell',
            sourceRevision: '2',
            economicOrder: { instant: '2025-01-02T00:00:00Z', sequence: '1' },
            side: 'sell',
            quantity: '5',
            price: '120',
            bookedPrincipal: '600',
          },
        ],
      });
      expect(replay.status).toBe('unavailable');
      const result = valueInventory(replay, {
        mark: { id: 'mark', price: '120', multiplier: '1', instant: '2025-01-03T00:00:00Z' },
        reportingCurrencyId: 'USD',
      });
      for (const metric of [
        result.realizedReportingTradingGross,
        result.realizedHoldingFx,
        result.realizedReportingTradingNet,
        result.realizedReportingNet,
        result.unrealizedReportingTradingGross,
        result.unrealizedHoldingFx,
        result.unrealizedReportingTradingNet,
        result.unrealizedReportingNet,
      ]) {
        expect(metric.status).toBe('unavailable');
        expect(metric.value).toBeNull();
        expect(metric.reasons).toEqual(replay.reasons);
      }
    },
  );
  it('keeps known marked value for a genuinely replayed unknown opening basis and available zero for a proven empty book', () => {
    const replay = replayInventory({
      ...input,
      sources: [
        {
          kind: 'opening',
          id: 'opening',
          effectId: 'opening',
          sourceRevision: '1',
          economicOrder: fill.economicOrder,
          direction: 'long',
          quantity: '10',
          multiplier: '1',
          entryPrice: null,
          bookedPrincipal: null,
          costs: [],
          costsComplete: true,
        },
      ],
    });
    const result = valueInventory(replay, {
      mark: { id: 'mark', price: '120', multiplier: '1', instant: '2025-01-03T00:00:00Z' },
      reportingCurrencyId: 'USD',
    });
    expect(result.reportingMarkedValue).toMatchObject({ status: 'available', value: '1200' });
    expect(result.unrealizedReportingNet.status).toBe('unavailable');
    const empty = valueInventory(replayInventory({ ...input, sources: [] }), {
      mark: null,
      reportingCurrencyId: 'USD',
    });
    expect(empty.realizedReportingNet).toMatchObject({ status: 'available', value: '0' });
    expect(empty.unrealizedReportingNet).toMatchObject({ status: 'available', value: '0' });
  });
});
