import { sql, type DbTransaction } from '@journal/database';
import { decimalValue, instantNanoseconds, type InventoryReplayResult } from '@journal/domain';
import {
  suppliedComponentResponseSchema,
  suppliedReferenceSchema,
  type SuppliedComponent,
} from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import { financialConflict, financialInvalid, queryRows } from '../financial/repository.js';

export async function readComponentRows(
  tx: DbTransaction,
  context: AuthorizationContext,
  ids: readonly string[],
): Promise<SuppliedComponent[]> {
  if (!ids.length) return [];
  const rows = await queryRows<Record<string, unknown>>(
    tx,
    sql`SELECT c.*,v.instrument_id,u.code AS currency_code,CASE WHEN c.kind='position-equity' THEN a.name||' · '||i.name ELSE t.title END AS scope_label,to_char(c.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_time FROM app.supplied_components c LEFT JOIN app.instrument_versions v ON v.workspace_id=c.workspace_id AND v.id=c.instrument_version_id LEFT JOIN app.accounts a ON a.workspace_id=c.workspace_id AND a.id=c.account_id LEFT JOIN app.instruments i ON i.workspace_id=v.workspace_id AND i.id=v.instrument_id LEFT JOIN app.trades t ON t.workspace_id=c.workspace_id AND t.id=c.trade_id JOIN app.currencies u ON u.workspace_id=c.workspace_id AND u.id=c.currency_id WHERE c.workspace_id=${context.workspaceId}::uuid AND c.id=ANY(${`{${ids.join(',')}}`}::uuid[]) ORDER BY c.id`,
  );
  if (rows.length !== new Set(ids).size) throw inaccessible();
  return rows.map((row) => {
    const input = row.payload as Record<string, unknown>;
    return suppliedComponentResponseSchema.parse({
      id: row.id,
      kind: row.kind,
      amount: row.amount_raw,
      currencyId: row.currency_id,
      observedAt: row.observed_time,
      source: row.source,
      scopeLabel: row.scope_label,
      currencyCode: row.currency_code,
      sourceReference: input.sourceReference,
      quality: input.quality,
      definitionVersion: row.definition_version,
      basisRevision: String(row.basis_revision),
      sourceRevision: String(row.source_revision),
      accountId: row.account_id,
      instrumentVersionId: row.instrument_version_id,
      instrumentId: row.instrument_id ?? null,
      tradeId: row.trade_id,
      signedQuantity: row.quantity_raw,
      supersedesId: row.supersedes_id,
      sourceInput: input,
    });
  });
}
/** A selected source is an explicit alternative, never an automatic fallback or second cash effect. */
export async function selectComponents(
  tx: DbTransaction,
  context: AuthorizationContext,
  ids: readonly string[] | undefined,
  sourceRevision: string,
  kind: SuppliedComponent['kind'],
) {
  const rows = await readComponentRows(tx, context, ids ?? []);
  for (const row of rows) {
    if (row.kind !== kind || BigInt(row.sourceRevision) > BigInt(sourceRevision))
      throw financialInvalid(
        'A supplied component must match this calculation kind and recorded revision.',
      );
    const [changed] = await queryRows<{ id: string }>(
      tx,
      sql`SELECT id FROM app.financial_commands WHERE workspace_id=${context.workspaceId}::uuid AND source_revision>${row.basisRevision}::integer AND source_revision<=${sourceRevision}::integer
      AND kind NOT IN('supplied-component.recorded','price-observation','fx-observation','account-valuation-observation','projection.refresh-requested') LIMIT 1`,
    );
    if (changed)
      throw financialConflict(
        'STALE_SUPPLIED_COMPONENT',
        'Source financial facts changed after this supplied component was reviewed. Record a new reviewed observation.',
      );
    const [superseded] = await queryRows<{ id: string }>(
      tx,
      sql`SELECT id FROM app.supplied_components WHERE workspace_id=${context.workspaceId}::uuid AND supersedes_id=${row.id}::uuid AND source_revision<=${sourceRevision}::integer LIMIT 1`,
    );
    if (superseded)
      throw financialConflict(
        'SUPERSEDED_SUPPLIED_COMPONENT',
        'Select the current supplied observation or pin an earlier source revision.',
      );
  }
  return rows;
}
export function choosePositionComponent(
  rows: readonly SuppliedComponent[],
  scope: {
    accountId: string;
    instrumentId: string;
    inventory: InventoryReplayResult;
    capability: string;
    asOf: string;
    maxAgeMilliseconds: number;
  },
) {
  const matches = rows.filter(
    (row) =>
      row.accountId === scope.accountId &&
      row.instrumentId === scope.instrumentId &&
      instantNanoseconds(row.observedAt) <= instantNanoseconds(scope.asOf),
  );
  if (!matches.length) return undefined;
  if (scope.capability !== 'manual')
    throw financialInvalid(
      'A supplied value cannot replace a validated native position calculation.',
    );
  matches.sort((a, b) =>
    instantNanoseconds(a.observedAt) === instantNanoseconds(b.observedAt)
      ? a.id.localeCompare(b.id)
      : instantNanoseconds(a.observedAt) > instantNanoseconds(b.observedAt)
        ? -1
        : 1,
  );
  const chosen = matches[0]!;
  if (
    matches[1] &&
    instantNanoseconds(matches[1].observedAt) === instantNanoseconds(chosen.observedAt)
  )
    throw financialInvalid('Select one supplied value for each position and observation boundary.');
  if (
    instantNanoseconds(scope.asOf) - instantNanoseconds(chosen.observedAt) >
    BigInt(scope.maxAgeMilliseconds) * 1_000_000n
  )
    throw financialConflict(
      'STALE_SUPPLIED_COMPONENT',
      'The selected supplied observation is older than this calculation freshness policy.',
    );
  if (
    scope.inventory.openQuantity.value === null ||
    chosen.signedQuantity === null ||
    !decimalValue(chosen.signedQuantity).eq(scope.inventory.openQuantity.value)
  )
    throw financialConflict(
      'SUPPLIED_QUANTITY_MISMATCH',
      'The supplied observation quantity differs from source inventory at this boundary.',
    );
  return chosen;
}
export const componentReference = (value: SuppliedComponent) =>
  suppliedReferenceSchema.strip().parse(value);
