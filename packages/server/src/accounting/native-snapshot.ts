import { sql } from '@journal/database';
import { nativeSnapshotRefreshRequestSchema, nativeSnapshotStatusSchema } from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import {
  executeFinancialCommand,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';

export function createNativeSnapshotServices(platform: FinancialPlatform) {
  async function status(context: AuthorizationContext) {
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const [row] = await queryRows<{
          latest: string;
          processed: string | null;
          status: string | null;
          attempts: number | null;
          error: string | null;
          payload: unknown;
        }>(
          tx,
          sql`
        SELECT coalesce(f.revision,0)::text AS latest,j.processed_revision::text AS processed,j.status,j.attempts,j.last_error_code AS error,n.payload
        FROM app.workspaces w LEFT JOIN app.financial_state f ON f.workspace_id=w.id
        LEFT JOIN app.outbox_dispatch_state j ON j.workspace_id=w.id
        LEFT JOIN app.native_financial_snapshots n ON n.workspace_id=w.id
        WHERE w.id=${context.workspaceId}::uuid`,
        );
        if (!row) throw inaccessible();
        const snapshot = row.payload as { sourceRevision: string } | null;
        const state =
          snapshot?.sourceRevision === row.latest
            ? 'current'
            : row.status === 'failed' || row.status === 'blocked'
              ? 'unavailable'
              : snapshot
                ? 'stale'
                : row.latest === '0'
                  ? 'empty'
                  : 'pending';
        return nativeSnapshotStatusSchema.parse({
          state,
          latestSourceRevision: row.latest,
          processedSourceRevision: row.processed ?? '0',
          jobStatus: row.status,
          attempts: row.attempts ?? 0,
          lastErrorCode: row.error,
          snapshot: row.payload ?? null,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async function refresh(context: AuthorizationContext, value: unknown, commandId: string) {
    const payload = nativeSnapshotRefreshRequestSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'projection.refresh-requested', payload },
      async (_tx, state) => ({ id: commandId, commandId, sourceRevision: state.revision }),
    );
  }
  return { status, refresh };
}
