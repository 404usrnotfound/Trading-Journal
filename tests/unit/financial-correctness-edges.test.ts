import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { importMappingSchema, type CanonicalImportDraft } from '@journal/contracts';
import {
  calculateNav,
  divideDecimal,
  FinancialArithmeticError,
  INVENTORY_CALCULATION_MANIFEST,
  multiplyDecimal,
  replayInventory,
  selectFxRate,
  valueInventory,
  type FxRateSelection,
  type InventoryFill,
  type NavComponent,
  type SelectedFxRate,
} from '@journal/domain';
import { canonicalCsvAdapter } from '../../packages/server/src/imports/adapters/registry.js';
import { importIdentity, validateDraft } from '../../packages/server/src/imports/normalize.js';

// The oracle works in integer units of 10^-36. It never calls the production
// decimal parser, formatter, allocator or quantizer to manufacture expectations.
const quantum = 10n ** 36n;
const maximumUnits = 10n ** 78n - 1n;
function fixed(units: bigint): string {
  const magnitude = units < 0n ? -units : units;
  const fraction = (magnitude % quantum).toString().padStart(36, '0').replace(/0+$/u, '');
  return `${units < 0n ? '-' : ''}${magnitude / quantum}${fraction ? `.${fraction}` : ''}`;
}
function halfEvenHalf(units: bigint): bigint {
  const magnitude = units < 0n ? -units : units;
  const whole = magnitude / 2n;
  const rounded = magnitude % 2n !== 0n && whole % 2n !== 0n ? whole + 1n : whole;
  return units < 0n ? -rounded : rounded;
}

describe('Phase 14 high-precision financial boundaries', () => {
  it('rounds signed half-quantum ties at scale 36 against an independent full-envelope BigInt oracle', () => {
    // Include both tie parities, exact quotients and the storage endpoints even
    // if generated samples do not land on these particular values.
    const boundaries = [0n, 1n, -1n, 3n, -3n, 5n, -5n, 7n, -7n, maximumUnits, -maximumUnits];
    for (const units of boundaries) {
      const expected = fixed(halfEvenHalf(units));
      expect(multiplyDecimal(fixed(units), '0.5')).toBe(expected);
      expect(divideDecimal(fixed(units), '2')).toBe(expected);
    }
    fc.assert(
      fc.property(fc.bigInt({ min: -maximumUnits, max: maximumUnits }), (units) => {
        const expected = fixed(halfEvenHalf(units));
        expect(multiplyDecimal(fixed(units), '0.5')).toBe(expected);
        expect(divideDecimal(fixed(units), '2')).toBe(expected);
      }),
      { seed: 14032030, numRuns: 200 },
    );
  });
});

const accountId = '00000000-0000-4000-8000-000000000001';
const instrumentVersionId = '00000000-0000-4000-8000-000000000002';
const firstAt = '2030-01-01T12:00:00.000001Z';
const secondAt = '2030-01-02T12:00:00.000001Z';
const markAt = '2030-01-03T12:00:00.000001Z';
function inventoryFill(
  id: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  principal: string,
  fee: string,
): InventoryFill {
  const instant = side === 'buy' ? firstAt : secondAt;
  return {
    kind: 'fill',
    id,
    effectId: `effect:${id}`,
    sourceRevision: side === 'buy' ? '1' : '2',
    economicOrder: { instant, sequence: '1' },
    side,
    quantity,
    price,
    multiplier: '1',
    bookedPrincipal: principal,
    costsComplete: true,
    costs: [{ id: `fee:${id}`, amount: fee, currencyId: 'USD', chargedAt: instant }],
  };
}
function partlyRealizedInventory() {
  return replayInventory({
    scope: {
      workspaceId: 'workspace',
      accountId,
      instrumentId: 'ordinary-share',
      instrumentVersionId,
      unitVersionId: 'share/unit-v1',
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
    sources: [
      inventoryFill('purchase', 'buy', '1', '100', '100', '2'),
      inventoryFill('partial-sale', 'sell', '0.5', '120', '60', '1'),
    ],
    sourceRevision: '2',
  });
}

describe('Phase 14 historical realization and current-price availability', () => {
  it('retains realized gains after a partial sale while a missing mark leaves current P&L unavailable', () => {
    const inventory = partlyRealizedInventory();
    const valued = valueInventory(inventory, { mark: null, reportingCurrencyId: 'USD' });
    expect(inventory.realizedNet).toMatchObject({ status: 'available', value: '8' });
    expect(valued.realizedReportingTradingGross).toMatchObject({
      status: 'available',
      value: '10',
    });
    expect(valued.realizedReportingNet).toMatchObject({ status: 'available', value: '8' });
    expect(valued.realizedHoldingFx).toMatchObject({ status: 'available', value: '0' });
    for (const metric of [
      valued.markedValue,
      valued.unrealizedGross,
      valued.unrealizedNet,
      valued.reportingMarkedValue,
      valued.unrealizedReportingNet,
    ]) {
      expect(metric.status).toBe('unavailable');
      expect(metric.value).toBeNull();
      expect(metric.reasons).toContain('missing_mark');
    }
  });

  it('accepts a genuine zero mark after the same partial sale without erasing realized history or double charging fees', () => {
    const inventory = partlyRealizedInventory();
    const valued = valueInventory(inventory, {
      mark: { id: 'zero-mark', price: '0', multiplier: '1', instant: markAt },
      reportingCurrencyId: 'USD',
    });
    expect(valued.markedValue).toMatchObject({ status: 'available', value: '0' });
    expect(valued.unrealizedGross).toMatchObject({ status: 'available', value: '-50' });
    expect(valued.unrealizedNet).toMatchObject({ status: 'available', value: '-51' });
    expect(valued.unrealizedReportingNet).toMatchObject({ status: 'available', value: '-51' });
    expect(valued.realizedReportingNet).toMatchObject({ status: 'available', value: '8' });
    // Sale60 - acquisition100 - entryfee2 - exitfee1 = -43 USD.
    // The source fee allocation charges one dollar to each half of the holding.
    expect(
      BigInt(valued.realizedReportingNet.value!) + BigInt(valued.unrealizedReportingNet.value!),
    ).toBe(-43n);
    expect(() =>
      valueInventory(inventory, {
        mark: { id: 'negative-mark', price: '-0.01', multiplier: '1', instant: markAt },
      }),
    ).toThrow('negative_inventory_value');
    expect(inventory.realizedNet.value).toBe('8');
  });
});

const navPolicy = {
  id: 'zero-exposure-regression/1',
  maxAgeMilliseconds: 86_400_000,
  sourcePriority: ['reviewed-manual'],
};
function unavailableFx(reason: 'missing_fx' | 'stale_fx' = 'missing_fx'): FxRateSelection {
  return { state: 'unavailable', reasons: [reason], missingReferences: ['USD->EUR'] };
}
function euroCash(): NavComponent {
  return {
    id: 'known-EUR-cash',
    kind: 'cash',
    currencyId: 'EUR',
    amount: '125.5',
    rate: selectFxRate('EUR', 'EUR', markAt, navPolicy, []),
  };
}
function nav(components: readonly NavComponent[]) {
  return calculateNav({
    reportingCurrencyId: 'EUR',
    asOf: markAt,
    sourceRevision: '25',
    components,
  });
}

describe('Phase 14 fully closed foreign exposure without unnecessary FX', () => {
  it.each(['missing_fx', 'stale_fx'] as const)(
    'values proven zero foreign cash and holdings with %s without hiding known EUR capital',
    (reason) => {
      const result = nav([
        euroCash(),
        {
          id: 'zero-USD-cash',
          kind: 'cash',
          currencyId: 'USD',
          amount: '0',
          rate: unavailableFx(reason),
        },
        {
          id: 'closed-USD-holding',
          kind: 'holding',
          currencyId: 'USD',
          amount: '-0.0000',
          rate: unavailableFx(reason),
        },
        {
          id: 'zero-USD-liability',
          kind: 'liability',
          currencyId: 'USD',
          amount: '0',
          rate: unavailableFx(reason),
        },
      ]);
      expect(result).toMatchObject({
        state: 'available',
        value: { currencyId: 'EUR', amount: '125.5' },
        roundingResidual: '0',
        components: [
          { id: 'known-EUR-cash', currencyId: 'EUR', amount: '125.5' },
          { id: 'zero-USD-cash', currencyId: 'EUR', amount: '0' },
          { id: 'closed-USD-holding', currencyId: 'EUR', amount: '0' },
          { id: 'zero-USD-liability', currencyId: 'EUR', amount: '0' },
        ],
      });
      expect(result).not.toHaveProperty('missingReferences');
    },
  );

  it.each(['0.01', '0.000000000000000000000000000000000001'])(
    'keeps mixed zero and %s foreign exposure partial when the nonzero component lacks FX',
    (amount) => {
      const result = nav([
        euroCash(),
        { id: 'zero', kind: 'cash', currencyId: 'USD', amount: '0', rate: unavailableFx() },
        { id: 'exposed', kind: 'cash', currencyId: 'USD', amount, rate: unavailableFx() },
      ]);
      expect(result).toMatchObject({
        state: 'partial',
        availableSubtotal: { currencyId: 'EUR', amount: '125.5' },
        availableComponents: [
          { id: 'known-EUR-cash', currencyId: 'EUR', amount: '125.5' },
          { id: 'zero', currencyId: 'EUR', amount: '0' },
        ],
        missingReferences: ['exposed', 'USD->EUR'],
        reasons: ['missing_fx'],
      });
      expect(result).not.toHaveProperty('value');
    },
  );

  it('rejects a negative explicit liability even when FX is unavailable', () => {
    expect(() =>
      nav([
        {
          id: 'negative-liability',
          kind: 'liability',
          currencyId: 'USD',
          amount: '-0.01',
          rate: unavailableFx(),
        },
      ]),
    ).toThrow('Explicit liabilities use a positive magnitude.');
  });

  it('never turns an unknown amount or unknown currency into monetary zero', () => {
    const result = nav([
      euroCash(),
      { id: 'unknown-cash', kind: 'cash', currencyId: 'USD', rate: unavailableFx() },
      { id: 'unpriced-holding', kind: 'holding', currencyId: 'USD', rate: unavailableFx() },
      { id: 'unknown-unit', kind: 'holding', currencyId: null, amount: '0', rate: unavailableFx() },
      { id: 'empty-unit', kind: 'holding', currencyId: '', amount: '0', rate: unavailableFx() },
    ]);
    expect(result).toMatchObject({
      state: 'partial',
      availableSubtotal: { currencyId: 'EUR', amount: '125.5' },
      availableComponents: [{ id: 'known-EUR-cash', currencyId: 'EUR', amount: '125.5' }],
    });
    if (result.state !== 'partial') throw new Error('Unknown exposure must remain incomplete.');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'incomplete_cash',
        'missing_mark',
        'incompatible_currency',
        'missing_fx',
      ]),
    );
    expect(result.missingReferences).toEqual(
      expect.arrayContaining(['unknown-cash', 'unpriced-holding', 'unknown-unit', 'empty-unit']),
    );
    expect(result).not.toHaveProperty('value');
  });

  it.each([null, 0, false, ''])(
    'does not coerce invalid runtime amount %s to zero when FX is unavailable',
    (amount) => {
      expect(() =>
        nav([
          {
            id: 'malformed-amount',
            kind: 'cash',
            currencyId: 'USD',
            // Deliberately exercise malformed runtime data outside the static
            // contract. Unknown/invalid source evidence cannot prove zero.
            amount: amount as unknown as string,
            rate: unavailableFx(),
          },
        ]),
      ).toThrow(FinancialArithmeticError);
    },
  );

  it('still validates every supplied available FX context even for an exactly zero amount', () => {
    const selection = selectFxRate('USD', 'EUR', markAt, navPolicy, [
      {
        id: 'reviewed-rate',
        baseCurrencyId: 'USD',
        quoteCurrencyId: 'EUR',
        rate: '0.95',
        observedAt: markAt,
        source: 'reviewed-manual',
      },
    ]);
    if (selection.state !== 'available') throw new Error('The valid control rate must exist.');
    const forgedContexts: readonly SelectedFxRate[] = [
      { ...selection.value, requestedAt: firstAt },
      { ...selection.value, baseCurrencyId: 'GBP' },
      { ...selection.value, quoteCurrencyId: 'JPY' },
      { ...selection.value, route: 'identity' },
      { ...selection.value, rate: '0' as SelectedFxRate['rate'] },
      { ...selection.value, rate: '-0.95' as SelectedFxRate['rate'] },
    ];
    for (const context of forgedContexts)
      expect(() =>
        nav([
          {
            id: 'zero-with-invalid-context',
            kind: 'cash',
            currencyId: 'USD',
            amount: '0',
            rate: { state: 'available', value: context },
          },
        ]),
      ).toThrow(FinancialArithmeticError);
  });

  it('keeps zero-valued component identities unique instead of bypassing population validation', () => {
    expect(() =>
      nav([
        { id: 'duplicate', kind: 'cash', currencyId: 'USD', amount: '0', rate: unavailableFx() },
        { id: 'duplicate', kind: 'holding', currencyId: 'USD', amount: '0', rate: unavailableFx() },
      ]),
    ).toThrow('unique identities');
  });
});

const canonicalMapping = importMappingSchema.parse({
  adapterId: 'canonical-csv',
  kind: 'execution',
  fields: [],
});
const executionPayload = {
  instrumentVersionId,
  side: 'buy',
  quantity: '0.5',
  price: '10',
  economicAt: firstAt,
  orderingKey: '1',
  costsComplete: true,
};
function csvQuote(text: string): string {
  return `"${text.replaceAll('"', '""')}"`;
}
function canonicalExecution(payload: string) {
  const [row] = canonicalCsvAdapter.parse(
    `ID,Kind,Payload\nsource-fill,execution,${csvQuote(payload)}`,
    canonicalMapping,
  );
  expect(row?.errors).toEqual([]);
  expect(row?.raw.Payload).toBe(payload);
  expect(row?.draft).not.toBeNull();
  return row!.draft!;
}

describe('Phase 14 untrusted imported monetary values', () => {
  it.each([
    ['fractional JSON quantity', 'quantity', '0.1'],
    ['integer JSON quantity', 'quantity', '1'],
    ['JSON price beyond binary integer precision', 'price', '9007199254740993.01'],
    ['exponent JSON price', 'price', '1e-8'],
  ])(
    'rejects %s instead of coercing the parsed number into authoritative decimal text',
    (_label, field, literal) => {
      const payload = JSON.stringify(executionPayload).replace(
        `"${field}":"${executionPayload[field as 'quantity' | 'price']}"`,
        `"${field}":${literal}`,
      );
      const draft = canonicalExecution(payload);
      expect(typeof draft.payload[field]).toBe('number');
      expect(() => validateDraft(draft, accountId)).toThrow();
      // Rejecting the number must not repair, round, mutate or erase the raw fact.
      expect(typeof draft.payload[field]).toBe('number');
    },
  );

  it('retains all 36 fractional digits and gives neighboring high-precision executions distinct economic fingerprints', () => {
    const left = '9007199254740993.123456789012345678901234567890123456';
    const right = '9007199254740993.123456789012345678901234567890123457';
    const first = validateDraft(
      canonicalExecution(JSON.stringify({ ...executionPayload, price: left })),
      accountId,
    );
    const next = validateDraft(
      canonicalExecution(JSON.stringify({ ...executionPayload, price: right })),
      accountId,
    );
    expect(first.payload.price).toBe(left);
    expect(next.payload.price).toBe(right);
    expect(importIdentity(first).identityKey).toBe(importIdentity(next).identityKey);
    expect(importIdentity(first).payloadHash).not.toBe(importIdentity(next).payloadHash);
    expect(
      importIdentity(
        validateDraft({ ...first, payload: { ...first.payload, price: `${left}000` } }, accountId),
      ),
    ).toEqual(importIdentity(first));
  });

  it.each([
    ['zero quantity', { quantity: '0' }],
    ['negative quantity', { quantity: '-0.5' }],
    ['negative price', { price: '-10' }],
    ['excess fractional precision', { price: `0.${'0'.repeat(36)}1` }],
    ['exponent text', { price: '1e-8' }],
  ])('rejects %s without corrupting an adjacent valid imported row', (_label, patch) => {
    const invalid = JSON.stringify({ ...executionPayload, ...patch });
    const valid = JSON.stringify(executionPayload);
    const rows = canonicalCsvAdapter.parse(
      `ID,Kind,Payload\ninvalid,execution,${csvQuote(invalid)}\nvalid,execution,${csvQuote(valid)}`,
      canonicalMapping,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.raw.Payload).toBe(invalid);
    expect(rows[1]?.raw.Payload).toBe(valid);
    expect(() => validateDraft(rows[0]!.draft!, accountId)).toThrow();
    const accepted: CanonicalImportDraft = validateDraft(rows[1]!.draft!, accountId);
    expect(accepted.payload).toMatchObject({ ...executionPayload, accountId });
    expect(accepted.sourceId).toBe('valid');
    expect(rows[1]?.draft?.payload).not.toHaveProperty('accountId');
  });
});
