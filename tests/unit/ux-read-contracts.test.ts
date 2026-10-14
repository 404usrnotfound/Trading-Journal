import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { executionAllocationResponseSchema, journalListQuerySchema } from '@journal/contracts';

const from = '2026-10-14T00:00:00.000001Z';
const to = '2026-10-14T00:00:00.000002Z';

describe('UX read contracts preserve exact activity boundaries and attribution evidence', () => {
  it('accepts paired boundaries one microsecond apart without rounding them to milliseconds', () => {
    const accountId = randomUUID();
    expect(journalListQuerySchema.parse({ from, to, accountId, limit: '1' })).toEqual({
      from,
      to,
      accountId,
      limit: 1,
      includeArchived: false,
    });
  });

  it('compares offset-aware instants rather than their lexical order', () => {
    expect(
      journalListQuerySchema.safeParse({
        from: '2026-10-14T02:00:00.000001+02:00',
        to,
      }).success,
    ).toBe(true);
    expect(
      journalListQuerySchema.safeParse({
        from,
        to: '2026-10-14T02:00:00.000001+02:00',
      }).success,
    ).toBe(false);
    expect(
      journalListQuerySchema.safeParse({
        from: '2026-10-13T22:00:00.000002-02:00',
        to,
      }).success,
    ).toBe(false);
  });

  it('rejects missing, reversed, equal and unsupported boundaries through validation', () => {
    for (const query of [
      { from },
      { to },
      { from, to: from },
      { from: to, to: from },
      { from: 'not-a-date', to },
      { from: '2026-02-30T00:00:00Z', to },
      { from: '2026-10-14T00:00:00', to },
      { from: '2026-10-14T00:00:00.0000001Z', to },
      { from: '2026-10-14T00:00:00+99:99', to },
      { from: '0000-01-01T00:00:00Z', to },
    ]) {
      // Invalid source text must produce a validation result, never a BigInt/Date exception.
      expect(() => journalListQuerySchema.safeParse(query)).not.toThrow();
      expect(journalListQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it('normalizes account IDs and rejects unsupported filter fields', () => {
    const accountId = randomUUID();
    expect(journalListQuerySchema.parse({ accountId: accountId.toUpperCase() }).accountId).toBe(
      accountId,
    );
    for (const query of [{ accountId: 'other-account' }, { accountId: 5 }, { timezone: 'UTC' }])
      expect(journalListQuerySchema.safeParse(query).success).toBe(false);
  });

  it('retains unassigned and explicit zero remainder rows without fabricating trade attribution', () => {
    const executionId = randomUUID();
    const tradeLegId = randomUUID();
    const response = {
      executionId,
      version: 2,
      allocations: [
        { tradeLegId, quantity: '0.333333333333333333333333333333333333' },
        { tradeLegId: null, quantity: '0' },
      ],
    };
    expect(executionAllocationResponseSchema.parse(response)).toEqual(response);
    for (const changed of [
      { ...response, executionId: 'invalid' },
      { ...response, version: 0 },
      { ...response, version: 2_147_483_648 },
      { ...response, allocations: [{ tradeLegId, quantity: -0.1 }] },
      { ...response, allocations: [{ tradeLegId, quantity: '-0.1' }] },
      { ...response, allocations: [{ tradeLegId: 'invalid', quantity: '1' }] },
      { ...response, sourceRevision: '1' },
    ])
      expect(executionAllocationResponseSchema.safeParse(changed).success).toBe(false);
  });

  it('bounds the allocation response including its mandatory unassigned remainder', () => {
    const response = {
      executionId: randomUUID(),
      version: 1,
      allocations: Array.from({ length: 1000 }, () => ({
        tradeLegId: randomUUID(),
        quantity: '1',
      })),
    };
    expect(
      executionAllocationResponseSchema.safeParse({
        ...response,
        allocations: [...response.allocations, { tradeLegId: null, quantity: '0' }],
      }).success,
    ).toBe(true);
    expect(
      executionAllocationResponseSchema.safeParse({
        ...response,
        allocations: [
          ...response.allocations,
          { tradeLegId: null, quantity: '0' },
          { tradeLegId: randomUUID(), quantity: '1' },
        ],
      }).success,
    ).toBe(false);
  });
});
