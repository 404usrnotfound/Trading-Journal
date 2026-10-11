import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createAccountInputSchema,
  createCurrencyInputSchema,
  createInstrumentInputSchema,
  createOrderInputSchema,
} from '../../packages/server/src/financial/catalog.js';
import {
  financialInstantMicros,
  financialTimestamp,
  supportsNativeShortInventory,
  validateNativeInstrumentMetadata,
} from '../../packages/server/src/financial/reference-data.js';
import type { CreateInstrumentInput } from '../../packages/server/src/financial/catalog-types.js';

const currencyId = randomUUID();
const effectiveAt = '2026-01-01T00:00:00.000001Z';
const instrument: CreateInstrumentInput = {
  name: 'Ordinary independently identified share',
  family: 'stock',
  subtype: 'ordinary-share',
  economicIdentity: 'fixture:ordinary-share',
  quantityUnit: 'share',
  quoteCurrencyId: currencyId,
  settlementCurrencyId: currencyId,
  multiplier: '1',
  quantityIncrement: '0.0001',
  priceIncrement: '0.000001',
  capability: 'native-linear',
  effectiveAt,
  metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
};

describe('catalog economic-unit and immutable convention boundaries', () => {
  it('allows specifically identified currencies beyond a fiat-code enum and preserves settlement precision', () => {
    expect(
      createCurrencyInputSchema.parse({
        namespace: 'chain:example',
        code: 'TOKEN',
        kind: 'digital',
        unitIdentity: 'chain:contract:123',
        name: 'Example settlement token',
        displayScale: 8,
        settlementIncrement: '0.000000000000000001',
        effectiveAt,
      }).settlementIncrement,
    ).toBe('0.000000000000000001');
  });

  it.each([0.01, 1, '1e-8', 'NaN', '0', '-1', '0.0000000000000000000000000000000000001'])(
    'rejects invalid authoritative increment %s',
    (settlementIncrement) => {
      expect(
        createCurrencyInputSchema.safeParse({
          namespace: 'iso',
          code: 'USD',
          kind: 'fiat',
          unitIdentity: 'iso:USD',
          name: 'US dollar',
          displayScale: 2,
          settlementIncrement,
          effectiveAt,
        }).success,
      ).toBe(false);
    },
  );

  it('requires explicit paper/live scope and does not accept caller-supplied identity or financial values', () => {
    const account = {
      name: 'Account',
      environment: 'paper',
      accountType: 'cash',
      baseCurrencyId: currencyId,
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt,
    };
    expect(createAccountInputSchema.safeParse(account).success).toBe(true);
    expect(createAccountInputSchema.safeParse({ ...account, environment: undefined }).success).toBe(
      false,
    );
    expect(
      createAccountInputSchema.safeParse({ ...account, id: randomUUID(), cashBalance: '10000' })
        .success,
    ).toBe(false);
  });

  it.each([
    'future',
    'inverse-perpetual',
    'option',
    'bond',
    'warrant',
    'turbo',
    'structured',
    'commodity',
    'custom',
  ])('records %s as a manual convention without activating a linear formula', (family) => {
    const value = createInstrumentInputSchema.parse({
      ...instrument,
      family,
      subtype: 'explicit-source-convention',
      capability: 'manual',
      multiplier: '100',
      metadata: { termSheet: 'reviewed-reference' },
    });
    expect(() => validateNativeInstrumentMetadata(family, value.subtype, value)).not.toThrow();
    expect(() =>
      validateNativeInstrumentMetadata(family, value.subtype, {
        ...value,
        capability: 'native-linear',
      }),
    ).toThrow('Unsupported automatic convention');
  });

  it('validates ordinary delivered shares while refusing derivative-shaped consideration and unknown settlement conventions', () => {
    expect(() =>
      validateNativeInstrumentMetadata(instrument.family, instrument.subtype, instrument),
    ).not.toThrow();
    for (const changed of [
      { ...instrument, multiplier: '100' },
      { ...instrument, quantityUnit: 'contract' },
      { ...instrument, settlementCurrencyId: randomUUID() },
      {
        ...instrument,
        metadata: { priceConvention: 'percent-of-face', settlementStyle: 'delivered' },
      },
      {
        ...instrument,
        metadata: { priceConvention: 'unit-price', settlementStyle: 'variation-margin' },
      },
    ])
      expect(() =>
        validateNativeInstrumentMetadata(changed.family, changed.subtype, changed),
      ).toThrow('Unsupported automatic convention');
  });

  it('requires non-rebasing provenance before enabling native crypto spot inventory', () => {
    const crypto = { ...instrument, family: 'crypto_spot', subtype: 'non-rebasing-spot' };
    expect(() => validateNativeInstrumentMetadata(crypto.family, crypto.subtype, crypto)).toThrow();
    expect(() =>
      validateNativeInstrumentMetadata(crypto.family, crypto.subtype, {
        ...crypto,
        metadata: { ...crypto.metadata, rebasing: false },
      }),
    ).not.toThrow();
  });

  it('requires vetted borrowed-delivery and explicit carrying-charge conventions for share shorts', () => {
    const declared = {
      shortConvention: 'borrowed-delivery',
      carryCostPolicy: 'explicit-source-charges',
    };
    for (const family of ['stock', 'etf']) {
      expect(supportsNativeShortInventory(family, undefined)).toBe(false);
      expect(supportsNativeShortInventory(family, { shortConvention: 'borrowed-delivery' })).toBe(
        false,
      );
      expect(
        supportsNativeShortInventory(family, { ...declared, shortConvention: 'unknown' }),
      ).toBe(false);
      expect(supportsNativeShortInventory(family, declared)).toBe(true);
    }
    expect(supportsNativeShortInventory('crypto_spot', { ...declared, rebasing: false })).toBe(
      false,
    );
  });

  it('does not manufacture leg prices from a package price or accept a missing limit/stop instruction operand', () => {
    const order = {
      accountId: randomUUID(),
      kind: 'single',
      legs: [{ instrumentVersionId: randomUUID(), side: 'buy', ratio: '1' }],
      instruction: { status: 'working', quantity: '0.25', orderType: 'limit', timeInForce: 'day' },
      economicAt: effectiveAt,
    };
    expect(createOrderInputSchema.safeParse(order).success).toBe(false);
    expect(
      createOrderInputSchema.safeParse({
        ...order,
        instruction: { ...order.instruction, limitPrice: '10.00001' },
      }).success,
    ).toBe(true);
    expect(
      createOrderInputSchema.safeParse({
        ...order,
        instruction: { ...order.instruction, orderType: 'stop_limit', limitPrice: '10' },
      }).success,
    ).toBe(false);
    expect(
      createOrderInputSchema.safeParse({
        ...order,
        legs: [...order.legs, ...order.legs],
        instruction: { ...order.instruction, limitPrice: '10' },
      }).success,
    ).toBe(false);
    expect(
      createOrderInputSchema.safeParse({
        ...order,
        instruction: {
          ...order.instruction,
          quantity: '0.000000000000000000000000000000000001',
          limitPrice: '10',
        },
        legs: [{ ...order.legs[0], ratio: '0.000000000000000000000000000000000001' }],
      }).success,
    ).toBe(false);
  });
});

describe('economic timestamp precision', () => {
  it('preserves single microsecond ordering and equivalent original offsets', () => {
    expect(
      financialInstantMicros('2026-01-01T00:00:00.000002Z') - financialInstantMicros(effectiveAt),
    ).toBe(1n);
    expect(financialInstantMicros('2026-01-01T02:00:00.000001+02:00')).toBe(
      financialInstantMicros(effectiveAt),
    );
    expect(financialInstantMicros('2025-12-31T22:00:00.000001-02:00')).toBe(
      financialInstantMicros(effectiveAt),
    );
  });
  it.each([
    '2026-02-30T00:00:00Z',
    '2026-01-01',
    '2026-01-01T00:00:00',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:00:00.0000001Z',
    '2026-01-01T00:00:00+25:00',
  ])('rejects ambiguous or silently normalized time %s', (value) => {
    expect(financialTimestamp.safeParse(value).success).toBe(false);
  });
});
