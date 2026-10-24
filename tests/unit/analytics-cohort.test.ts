import { describe, expect, it } from 'vitest';
import { analyticsCohort } from '../../packages/server/src/analytics/cohort.js';

const from = '2030-02-01T00:00:00Z';
const old = '2030-01-01T00:00:00Z';
const recent = '2030-02-02T00:00:00Z';
const leg = (overrides = {}) => ({
  id: 'leg',
  trade_id: 'trade',
  direction: 'long' as const,
  closure_id: 'closed',
  ...overrides,
});
const fill = (side: 'buy' | 'sell', quantity = '1', at = old) => ({
  leg_id: 'leg',
  side,
  allocated_quantity: quantity,
  economic_at: at,
});

describe('analytics temporal cohort proof', () => {
  it('drops only a fully closed historical native population before expensive replay', () => {
    expect([
      ...analyticsCohort([leg()], [fill('buy', '0.25'), fill('sell', '0.25')], from, () => true),
    ]).toEqual([]);
    for (const fills of [
      [fill('buy')],
      [fill('buy'), fill('sell', '1', recent)],
      [fill('sell'), fill('buy')],
      [fill('buy'), fill('sell', '2'), fill('buy')],
      [fill('buy', 'invalid'), fill('sell')],
    ])
      expect([...analyticsCohort([leg()], fills, from, () => true)]).toEqual(['trade']);
    expect([
      ...analyticsCohort(
        [leg({ closure_id: null })],
        [fill('buy'), fill('sell')],
        from,
        () => true,
      ),
    ]).toEqual(['trade']);
    expect([...analyticsCohort([leg()], [fill('buy'), fill('sell')], from, () => false)]).toEqual([
      'trade',
    ]);
  });
  it('retains every leg when another leg is open or has unsupported conventions, including an empty leg', () => {
    const legs = [leg(), leg({ id: 'second' })];
    const closed = [fill('buy'), fill('sell')];
    expect([...analyticsCohort(legs, closed, from, (item) => item.id !== 'second')]).toEqual([
      'trade',
    ]);
    expect([
      ...analyticsCohort(legs, [...closed, { ...fill('buy'), leg_id: 'second' }], from, () => true),
    ]).toEqual(['trade']);
    expect([
      ...analyticsCohort(
        [leg({ direction: 'short' })],
        [fill('sell'), fill('buy')],
        from,
        () => true,
      ),
    ]).toEqual([]);
  });
});
