import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStatementRequestSchema, evaluateStatementRequestSchema } from '@journal/contracts';

const currencyId = randomUUID();
const document = {
  accountId: randomUUID(),
  asOf: '2030-04-04T12:00:00.000001+02:00',
  sourceName: 'Independent statement',
  sourceReference: 'Source file page 2',
  cashDefinition: 'all-owned-cash/1',
  holdingsDefinition: 'netted-account-inventory/1',
  completeCash: false,
  completeHoldings: false,
  cash: [{ currencyId, amount: '-0.000000000000000000000000000000000001' }],
  holdings: [],
};

describe('independent statement evidence boundaries', () => {
  it('retains exact signed source units and defaults only explicit tolerances', () => {
    const result = createStatementRequestSchema.parse(document);
    expect(result.cash[0]).toEqual({
      currencyId,
      amount: document.cash[0]!.amount,
      tolerance: '0',
    });
    expect(result.asOf).toBe(document.asOf);
    expect(
      createStatementRequestSchema.safeParse({ ...document, cash: [{ currencyId, amount: 1 }] })
        .success,
    ).toBe(false);
    expect(
      createStatementRequestSchema.safeParse({
        ...document,
        cash: [{ currencyId, amount: '1', tolerance: '-0.01' }],
      }).success,
    ).toBe(false);
  });

  it('rejects ambiguous duplicate units, undefined evidence scopes and incompatible equity definitions', () => {
    const values = [
      {
        ...document,
        cash: [...document.cash, { currencyId: currencyId.toUpperCase(), amount: '1' }],
      },
      { ...document, cash: [], holdings: [] },
      { ...document, holdingsDefinition: 'gross-long-plus-short-notional' },
      { ...document, equity: { currencyId, amount: '100', definition: 'broker-buying-power' } },
      { ...document, sourceHash: 'not-a-sha256' },
      {
        ...document,
        cash: Array.from({ length: 101 }, () => ({ currencyId: randomUUID(), amount: '1' })),
      },
    ];
    for (const value of values)
      expect(createStatementRequestSchema.safeParse(value).success).toBe(false);
    expect(
      createStatementRequestSchema.safeParse({ ...document, cash: [], completeCash: true }).success,
    ).toBe(true);
  });

  it('requires a review note, exact financial revision and bounded deterministic source policies', () => {
    expect(
      evaluateStatementRequestSchema.parse({ reviewNote: 'Reviewed original source evidence' }),
    ).toEqual({ accept: false, reviewNote: 'Reviewed original source evidence' });
    for (const value of [
      { reviewNote: '' },
      { reviewNote: 'Reviewed', sourceRevision: 1 },
      {
        reviewNote: 'Reviewed',
        valuationPolicy: {
          fxPolicy: { id: 'p', maxAgeMilliseconds: -1, sourcePriority: ['source'] },
          pricePolicy: { maxAgeMilliseconds: 1000, sourcePriority: ['source'] },
        },
      },
      { reviewNote: 'Reviewed', overrideLedger: true },
    ])
      expect(evaluateStatementRequestSchema.safeParse(value).success).toBe(false);
  });
});
