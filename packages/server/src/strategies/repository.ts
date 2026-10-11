import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import {
  financialIdSchema,
  strategyVersionResponseSchema,
  type StrategyVersionResponse,
} from '@journal/contracts';
import type { AuthorizationContext, ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { financialFingerprint, queryRows } from '../financial/repository.js';

export type StrategyPlatform = Pick<ServerServices, 'withWorkspaceContext'>;

export function strategyConflict(code: string, detail: string): ApplicationError {
  return new ApplicationError(409, code, 'Strategy change rejected', detail);
}

/** Shared with attachment changes. Hash collisions only serialize unrelated workspaces. */
export async function lockStrategyWorkspace(tx: DbTransaction, workspaceId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(1791763200,hashtext(${workspaceId}::text))`);
}

/** Strategy edits have their own command history; they do not revise financial source facts. */
export async function executeStrategyCommand<Result>(
  platform: StrategyPlatform,
  context: AuthorizationContext,
  command: { commandId: string; kind: string; payload: unknown },
  callback: (tx: DbTransaction) => Promise<Result>,
): Promise<Result> {
  if (context.role === 'viewer' || context.requiredRole === 'viewer')
    throw new ApplicationError(
      403,
      'FORBIDDEN',
      'Action not permitted',
      'Editor access is required.',
    );
  const id = financialIdSchema.parse(command.commandId);
  const hash = financialFingerprint({ kind: command.kind, payload: command.payload });
  return platform.withWorkspaceContext(context, async (tx) => {
    await lockStrategyWorkspace(tx, context.workspaceId);
    const [previous] = await queryRows<{ request_hash: string; result: Result }>(
      tx,
      sql`SELECT request_hash,result FROM app.strategy_commands
        WHERE workspace_id=${context.workspaceId} AND id=${id}`,
    );
    if (previous) {
      if (previous.request_hash !== hash)
        throw strategyConflict(
          'IDEMPOTENCY_CONFLICT',
          'This command identity has different contents.',
        );
      return previous.result;
    }
    const result = await callback(tx);
    const auditId = randomUUID();
    await tx.execute(sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action,request_id)
      VALUES (${context.workspaceId},${auditId},${context.actorId},${`strategy.${command.kind}`},${context.requestId})`);
    await tx.execute(sql`INSERT INTO app.strategy_commands
      (workspace_id,id,idempotency_key,kind,request_hash,result,actor_id,audit_event_id)
      VALUES (${context.workspaceId},${id},${id},${command.kind},${hash},${JSON.stringify(result)}::jsonb,
        ${context.actorId},${auditId})`);
    return result;
  });
}

export async function readStrategyVersion(
  tx: DbTransaction,
  workspaceId: string,
  versionId: string,
): Promise<StrategyVersionResponse> {
  const [row] = await queryRows<{ data: unknown }>(
    tx,
    sql`SELECT jsonb_build_object('id',id,'workspaceId',workspace_id,'strategyId',strategy_id,
      'version',version,'effectiveAt',to_char(effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'definition',definition,'definitionHash',definition_hash,'changeReason',change_reason,
      'actorId',actor_id,'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS data
      FROM app.strategy_versions WHERE workspace_id=${workspaceId} AND id=${versionId}`,
  );
  if (!row) throw inaccessible();
  return strategyVersionResponseSchema.parse(row.data);
}

/** Lock the identity so archiving and accepting a new version pin cannot race. */
export async function requireSelectableStrategyVersion(
  tx: DbTransaction,
  workspaceId: string,
  versionId: string,
) {
  const [row] = await queryRows<{ strategy_id: string; archived_at: string | null }>(
    tx,
    sql`SELECT s.id AS strategy_id,s.archived_at::text FROM app.strategy_versions v
      JOIN app.strategies s ON s.workspace_id=v.workspace_id AND s.id=v.strategy_id
      WHERE v.workspace_id=${workspaceId} AND v.id=${versionId} FOR UPDATE OF s`,
  );
  if (!row) throw inaccessible();
  if (row.archived_at)
    throw strategyConflict(
      'STRATEGY_ARCHIVED',
      'An archived strategy cannot receive new trade links.',
    );
  return row.strategy_id;
}

export async function insertTradeStrategyLink(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: {
    tradeId: string;
    strategyId: string;
    strategyVersionId: string;
    timing: 'recorded-with-trade' | 'retrospective';
    reason: string;
  },
) {
  await tx.execute(sql`INSERT INTO app.trade_strategy_links
    (workspace_id,trade_id,strategy_id,strategy_version_id,timing,reason,actor_id)
    VALUES (${context.workspaceId},${input.tradeId},${input.strategyId},${input.strategyVersionId},
      ${input.timing},${input.reason},${context.actorId})`);
}
