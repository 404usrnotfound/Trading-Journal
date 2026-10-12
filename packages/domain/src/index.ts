/**
 * Framework-independent vocabulary and the deterministic financial kernel.
 * Values acquire branded types only after a trusted boundary validates them.
 */
declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type EntityId<Entity extends string> = Brand<string, `id:${Entity}`>;
export type UserId = EntityId<'user'>;
export type WorkspaceId = EntityId<'workspace'>;

/** Canonical decimal text, never an authoritative JavaScript number. */
export type DecimalString = Brand<string, 'decimal'>;
export type CurrencyCode = Brand<string, 'currency-code'>;
export type IanaTimezone = Brand<string, 'iana-timezone'>;
export type InstantString = Brand<string, 'utc-instant'>;

/** A unit travels with its value; no conversion or arithmetic is implied. */
export type UnitValue<Unit extends string> = Readonly<{
  value: DecimalString;
  unit: Unit;
}>;

export * from './decimal.js';
export * from './money.js';
export * from './postings.js';
export * from './valuation.js';
export * from './inventory.js';
export * from './inventory-types.js';
export * from './journal.js';
