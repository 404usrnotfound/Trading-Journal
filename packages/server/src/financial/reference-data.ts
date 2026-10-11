import { sql, type DbTransaction } from '@journal/database';
import { decimal, decimalValue } from '@journal/domain';
import { z } from 'zod';
import { ApplicationError, inaccessible } from '../errors.js';
import type {
  AccountReference,
  InstrumentMetadataInput,
  InstrumentVersionReference,
  KnownNativeInstrumentMetadata,
  OrderLegReference,
} from './catalog-types.js';

export const financialUuid = z.uuidv4().transform((value) => value.toLowerCase());
export const financialLabel = z.string().trim().min(1).max(160);
/** Microseconds survive ordering; JavaScript Date is used only for whole-second calendar validation. */
export function financialInstantMicros(value: string): bigint {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) throw new Error('An unambiguous microsecond timestamp is required');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHours = Number(match[10] ?? 0);
  const offsetMinutes = Number(match[11] ?? 0);
  if (year < 1 || hour > 23 || minute > 59 || second > 59 || offsetHours > 23 || offsetMinutes > 59)
    throw new Error('Invalid timestamp calendar fields');
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    throw new Error('Invalid timestamp calendar date');
  const offsetSeconds = (offsetHours * 60 + offsetMinutes) * 60 * (match[9] === '-' ? -1 : 1);
  return (
    BigInt(date.getTime()) * 1_000n -
    BigInt(offsetSeconds) * 1_000_000n +
    BigInt((match[7] ?? '').padEnd(6, '0'))
  );
}
export const financialTimestamp = z.string().refine((value) => {
  try {
    financialInstantMicros(value);
    return true;
  } catch {
    return false;
  }
}, 'An unambiguous valid timestamp with at most six fractional digits is required');
export const financialPositiveDecimal = z.unknown().transform((value, context) => {
  try {
    const canonical = decimal(value);
    if (!decimalValue(canonical).gt('0')) throw new Error('Positive decimal required');
    return canonical;
  } catch {
    context.addIssue({ code: 'custom', message: 'A positive representable decimal is required' });
    return z.NEVER;
  }
});

export function staleCatalogRevision(): ApplicationError {
  return new ApplicationError(
    409,
    'STALE_REVISION',
    'Record changed',
    'Reload the record and retry with its current revision.',
  );
}

export function invalidFinancialReference(detail: string): ApplicationError {
  return new ApplicationError(
    422,
    'INVALID_FINANCIAL_REFERENCE',
    'Invalid financial reference',
    detail,
  );
}

export async function requireCurrency(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
  forNewSelection = true,
): Promise<void> {
  const value = financialUuid.parse(id);
  const result = await tx.execute<{ archived_at: string | null }>(
    sql`SELECT archived_at::text FROM app.currencies WHERE workspace_id=${workspaceId} AND id=${value}`,
  );
  if (!result.rows[0]) throw inaccessible();
  if (forNewSelection && result.rows[0].archived_at !== null)
    throw invalidFinancialReference(
      'An archived currency cannot be selected for a new definition.',
    );
}

export async function requireAccount(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
  forNewSelection = true,
  economicAt?: string,
): Promise<AccountReference> {
  const value = financialUuid.parse(id);
  const result = await tx.execute<{
    id: string;
    environment: AccountReference['environment'];
    account_type: AccountReference['accountType'];
    status: string;
    archived_at: string | null;
    settings_id: string;
    settings_version: number;
    base_currency_id: string;
    inventory_method: AccountReference['inventoryMethod'];
    allow_short: boolean;
    holding_mode: AccountReference['holdingMode'];
  }>(sql`SELECT a.id,a.environment,a.account_type,a.status,a.archived_at::text,
      s.id AS settings_id,s.version AS settings_version,s.base_currency_id,
      s.inventory_method,s.allow_short,s.holding_mode
    FROM app.accounts a
    JOIN LATERAL (SELECT * FROM app.account_settings_versions
      WHERE workspace_id=a.workspace_id AND account_id=a.id
        AND (${economicAt ?? null}::timestamptz IS NULL OR effective_at<=${economicAt ?? null}::timestamptz)
      ORDER BY effective_at DESC,version DESC LIMIT 1) s ON true
    WHERE a.workspace_id=${workspaceId} AND a.id=${value}`);
  const row = result.rows[0];
  if (!row) throw inaccessible();
  if (forNewSelection && (row.archived_at !== null || row.status !== 'active'))
    throw invalidFinancialReference('New instructions require an active account.');
  return {
    id: row.id,
    environment: row.environment,
    accountType: row.account_type,
    status: row.status,
    archivedAt: row.archived_at,
    settingsId: row.settings_id,
    settingsVersion: row.settings_version,
    baseCurrencyId: row.base_currency_id,
    inventoryMethod: row.inventory_method,
    allowShort: row.allow_short,
    holdingMode: row.holding_mode,
  };
}

export async function requireCurrencyConvention(
  tx: DbTransaction,
  workspaceId: string,
  currencyId: string,
  economicAt: string,
): Promise<{
  id: string;
  currencyId: string;
  version: number;
  settlementIncrement: string;
  rounding: 'HALF_EVEN';
}> {
  const id = financialUuid.parse(currencyId);
  financialTimestamp.parse(economicAt);
  const result = await tx.execute<{
    id: string;
    version: number;
    settlement_increment_raw: string;
    rounding: 'HALF_EVEN';
  }>(
    sql`SELECT id,version,settlement_increment_raw,rounding FROM app.currency_convention_versions
      WHERE workspace_id=${workspaceId} AND currency_id=${id} AND effective_at<=${economicAt}::timestamptz
      ORDER BY effective_at DESC,version DESC LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) throw invalidFinancialReference('No currency convention covers this economic instant.');
  return {
    id: row.id,
    currencyId: id,
    version: row.version,
    settlementIncrement: row.settlement_increment_raw,
    rounding: row.rounding,
  };
}

export async function requireInstrumentVersion(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
  forNewSelection = true,
): Promise<InstrumentVersionReference> {
  const value = financialUuid.parse(id);
  const result = await tx.execute<{
    id: string;
    instrument_id: string;
    version: number;
    family: string;
    subtype: string;
    economic_identity: string;
    archived_at: string | null;
    quantity_unit: string;
    quote_currency_id: string | null;
    settlement_currency_id: string | null;
    multiplier_raw: string | null;
    quantity_increment_raw: string | null;
    price_increment_raw: string | null;
    capability: InstrumentVersionReference['capability'];
    effective_at: string;
    payload: Record<string, unknown>;
  }>(sql`SELECT v.id,v.instrument_id,v.version,i.family,i.subtype,i.economic_identity,
      i.archived_at::text,v.quantity_unit,v.quote_currency_id,v.settlement_currency_id,
      v.multiplier_raw,v.quantity_increment_raw,v.price_increment_raw,v.capability,
      to_char(v.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS effective_at,v.payload
    FROM app.instrument_versions v JOIN app.instruments i
      ON i.workspace_id=v.workspace_id AND i.id=v.instrument_id
    WHERE v.workspace_id=${workspaceId} AND v.id=${value}`);
  const row = result.rows[0];
  if (!row) throw inaccessible();
  if (forNewSelection && row.archived_at !== null)
    throw invalidFinancialReference(
      'An archived instrument cannot be selected for a new instruction.',
    );
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    version: row.version,
    family: row.family,
    subtype: row.subtype,
    economicIdentity: row.economic_identity,
    archivedAt: row.archived_at,
    quantityUnit: row.quantity_unit,
    quoteCurrencyId: row.quote_currency_id,
    settlementCurrencyId: row.settlement_currency_id,
    multiplier: row.multiplier_raw,
    quantityIncrement: row.quantity_increment_raw,
    priceIncrement: row.price_increment_raw,
    capability: row.capability,
    effectiveAt: row.effective_at,
    metadata: row.payload,
  };
}

export async function requireOrderLeg(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<OrderLegReference> {
  const value = financialUuid.parse(id);
  const result = await tx.execute<{
    id: string;
    order_id: string;
    account_id: string;
    instrument_version_id: string;
    side: 'buy' | 'sell';
    ratio_raw: string;
    status: OrderLegReference['status'];
    payload: { instruction: { quantity: string } };
  }>(sql`SELECT l.id,l.order_id,o.account_id,l.instrument_version_id,l.side,l.ratio_raw,r.status,r.payload
    FROM app.order_legs l JOIN app.orders o ON o.workspace_id=l.workspace_id AND o.id=l.order_id
    JOIN LATERAL (SELECT status,payload FROM app.order_revisions
      WHERE workspace_id=o.workspace_id AND order_id=o.id ORDER BY revision DESC LIMIT 1) r ON true
    WHERE l.workspace_id=${workspaceId} AND l.id=${value}`);
  const row = result.rows[0];
  if (!row) throw inaccessible();
  return {
    id: row.id,
    orderId: row.order_id,
    accountId: row.account_id,
    instrumentVersionId: row.instrument_version_id,
    side: row.side,
    ratio: row.ratio_raw,
    status: row.status,
    quantity: row.payload.instruction.quantity,
  };
}

/** Capability is determined by vetted metadata, never granted by a broker or family label alone. */
export function validateNativeInstrumentMetadata(
  family: string,
  subtype: string,
  value: InstrumentMetadataInput,
): void {
  if (value.capability === 'manual') return;
  assertNativeInstrumentMetadata(family, subtype, value);
}

/** Spot eligibility alone does not establish the economics of borrowed short delivery. */
export function supportsNativeShortInventory(
  family: string,
  metadata: InstrumentMetadataInput['metadata'],
): boolean {
  return (
    (family === 'stock' || family === 'etf') &&
    metadata?.['shortConvention'] === 'borrowed-delivery' &&
    metadata['carryCostPolicy'] === 'explicit-source-charges'
  );
}

export function assertNativeInstrumentMetadata(
  family: string,
  subtype: string,
  value: InstrumentMetadataInput,
): asserts value is KnownNativeInstrumentMetadata {
  const supported =
    (family === 'stock' && subtype === 'ordinary-share') ||
    (family === 'etf' && subtype === 'ordinary-etf') ||
    (family === 'crypto_spot' && subtype === 'non-rebasing-spot');
  if (
    value.capability !== 'native-linear' ||
    !supported ||
    value.quoteCurrencyId === null ||
    value.settlementCurrencyId === null ||
    value.multiplier === null ||
    value.quantityIncrement === null ||
    value.priceIncrement === null ||
    ((family === 'stock' || family === 'etf') && value.quantityUnit !== 'share') ||
    !decimalValue(value.multiplier).eq('1') ||
    value.quoteCurrencyId !== value.settlementCurrencyId ||
    value.metadata?.['priceConvention'] !== 'unit-price' ||
    value.metadata['settlementStyle'] !== 'delivered' ||
    (family === 'crypto_spot' && value.metadata['rebasing'] !== false)
  )
    throw new ApplicationError(
      422,
      'UNSUPPORTED_OPERATION',
      'Unsupported automatic convention',
      'Select manual recording or provide a validated ordinary delivered-share, ETF or non-rebasing spot convention.',
    );
}
