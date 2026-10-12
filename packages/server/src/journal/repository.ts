import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import { financialIdSchema } from '@journal/contracts';
import type { AuthorizationContext, ServerServices } from '../services.js';
import { ApplicationError } from '../errors.js';
import { financialFingerprint, queryRows } from '../financial/repository.js';
import { lockStrategyWorkspace } from '../strategies/repository.js';

export type JournalPlatform = Pick<ServerServices, 'withWorkspaceContext'>;
/** Preserve PostgreSQL microseconds; Date conversion can invert plan/execution ordering. */
export const journalInstant = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);
export function journalConflict(code: string, detail: string) {
  return new ApplicationError(409, code, 'Journal change rejected', detail);
}
export function journalInvalid(detail: string) {
  return new ApplicationError(
    422,
    'INVALID_JOURNAL_REFERENCE',
    'Invalid journal reference',
    detail,
  );
}

/** Financial state is locked for a coherent source boundary, never incremented by review writes. */
export async function executeJournalCommand<Result>(
  platform: JournalPlatform,
  context: AuthorizationContext,
  command: { commandId: string; kind: string; payload: unknown },
  callback: (tx: DbTransaction, commandId: string) => Promise<Result>,
): Promise<Result> {
  if (context.role === 'viewer' || context.requiredRole === 'viewer')
    throw new ApplicationError(
      403,
      'FORBIDDEN',
      'Action not permitted',
      'Editor access is required.',
    );
  const id = financialIdSchema.parse(command.commandId).toLowerCase();
  const hash = financialFingerprint({ kind: command.kind, payload: command.payload });
  return platform.withWorkspaceContext(context, async (tx) => {
    await tx.execute(sql`INSERT INTO app.financial_state(workspace_id,revision)
      VALUES (${context.workspaceId},0) ON CONFLICT(workspace_id) DO NOTHING`);
    await tx.execute(sql`SELECT revision FROM app.financial_state
      WHERE workspace_id=${context.workspaceId} FOR UPDATE`);
    await lockStrategyWorkspace(tx, context.workspaceId);
    const [previous] = await queryRows<{ request_hash: string; result: Result }>(
      tx,
      sql`SELECT request_hash,result FROM app.journal_commands
        WHERE workspace_id=${context.workspaceId} AND id=${id}`,
    );
    if (previous) {
      if (previous.request_hash !== hash)
        throw journalConflict(
          'IDEMPOTENCY_CONFLICT',
          'This command identity has different contents.',
        );
      return previous.result;
    }
    const result = await callback(tx, id);
    const auditId = randomUUID();
    await tx.execute(sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action,request_id)
      VALUES (${context.workspaceId},${auditId},${context.actorId},${`journal.${command.kind}`},${context.requestId})`);
    await tx.execute(sql`INSERT INTO app.journal_commands
      (workspace_id,id,idempotency_key,kind,request_hash,result,actor_id,audit_event_id)
      VALUES (${context.workspaceId},${id},${id},${command.kind},${hash},${JSON.stringify(result)}::jsonb,
      ${context.actorId},${auditId})`);
    return result;
  });
}
