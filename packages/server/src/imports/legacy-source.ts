import { sql, type DbTransaction } from '@journal/database';
import type { ImportKind } from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { financialFingerprint, queryRows } from '../financial/repository.js';
import { normalizeImportPayload } from './normalize.js';
/** Adopt an already-booked stable broker ID. Never infer duplicate trades from similar dates/prices. */
export async function legacyImportSource(
  tx: DbTransaction,
  context: AuthorizationContext,
  accountId: string,
  namespace: string,
  kind: ImportKind,
  sourceId: string | null,
  intent: unknown,
) {
  if (!sourceId || !['execution', 'cash_movement'].includes(kind)) return undefined;
  const [record] =
    kind === 'execution'
      ? await queryRows<{
          id: string;
          command_id: string;
          source_revision: number;
          payload: Record<string, unknown>;
        }>(
          tx,
          sql`SELECT id,command_id,source_revision,payload FROM app.executions WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${accountId}::uuid AND source_namespace=${namespace} AND source_id=${sourceId}`,
        )
      : await queryRows<{
          id: string;
          command_id: string;
          source_revision: number;
          payload: Record<string, unknown>;
        }>(
          tx,
          sql`SELECT id,command_id,source_revision,payload FROM app.cash_movements WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${accountId}::uuid AND payload->'sourceIdentity'->>'namespace'=${namespace} AND payload->'sourceIdentity'->>'id'=${sourceId}`,
        );
  if (!record) return undefined;
  if (kind === 'execution') {
    const superseded = await queryRows(
      tx,
      sql`SELECT id FROM app.execution_supersessions WHERE workspace_id=${context.workspaceId}::uuid AND original_execution_id=${record.id}::uuid`,
    );
    if (superseded.length) return undefined;
  }
  const sourceInput =
    kind === 'execution' &&
    record.payload.sourceInput !== null &&
    typeof record.payload.sourceInput === 'object'
      ? (record.payload.sourceInput as Record<string, unknown>)
      : record.payload;
  const original = Object.fromEntries(
    Object.entries(sourceInput).filter(
      ([key]) => !['sourceIdentity', 'sourceFingerprint'].includes(key),
    ),
  );
  const desired = { ...(intent as Record<string, unknown>) };
  // Missing completeness in older inputs is not evidence of changed monetary intent.
  // A duplicate retains the already-booked ledger facts and their cost metadata.
  if (kind === 'execution' && original.costsComplete === undefined) original.costsComplete = false;
  if (kind === 'cash_movement' && !desired.cashBucketId && typeof desired.currencyId === 'string') {
    const [bucket] = await queryRows<{ id: string }>(
      tx,
      sql`SELECT id FROM app.cash_buckets WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${accountId}::uuid AND currency_id=${desired.currencyId}::uuid AND category='settled' AND custody_key='default'`,
    );
    if (bucket) desired.cashBucketId = bucket.id;
  }
  const equal =
    financialFingerprint(normalizeImportPayload(original)) ===
    financialFingerprint(normalizeImportPayload(desired));
  return {
    payloadHash: equal ? 'same' : 'changed',
    currentRowId: 'legacy',
    state: 'active' as const,
    result: {
      id: record.id,
      commandId: record.command_id,
      sourceRevision: String(record.source_revision),
    },
  };
}
