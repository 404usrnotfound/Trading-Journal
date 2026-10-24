import { sql } from '@journal/database';

/**
 * Quotes may cross metadata versions only within the same economic price unit.
 * Tick/quantity increments and editorial/version provenance do not change that
 * unit. Keep the observation's original version in the valuation dependencies.
 */
export function compatiblePriceConventions(
  candidateAlias: string,
  referenceAlias: string,
): ReturnType<typeof sql> {
  const candidate = (field: string) =>
    sql`${sql.identifier(candidateAlias)}.${sql.identifier(field)}`;
  const reference = (field: string) =>
    sql`${sql.identifier(referenceAlias)}.${sql.identifier(field)}`;
  const metadata = [
    'priceConvention',
    'settlementStyle',
    'shortConvention',
    'carryCostPolicy',
    'rebasing',
  ].map(
    (key) =>
      sql`(${candidate('payload')}->${key}) IS NOT DISTINCT FROM (${reference('payload')}->${key})`,
  );
  return sql`(
    ${candidate('workspace_id')}=${reference('workspace_id')}
    AND ${candidate('instrument_id')}=${reference('instrument_id')}
    AND ${candidate('quantity_unit')}=${reference('quantity_unit')}
    AND ${candidate('quote_currency_id')} IS NOT DISTINCT FROM ${reference('quote_currency_id')}
    AND ${candidate('settlement_currency_id')} IS NOT DISTINCT FROM ${reference('settlement_currency_id')}
    AND ${candidate('multiplier')} IS NOT DISTINCT FROM ${reference('multiplier')}
    AND ${candidate('capability')}=${reference('capability')}
    AND ${sql.join(metadata, sql` AND `)}
  )`;
}
