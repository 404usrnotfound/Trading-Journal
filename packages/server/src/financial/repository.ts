import { createHash, randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import type { AuthorizationContext, ServerServices } from '../services.js';
import { ApplicationError } from '../errors.js';
import { z } from 'zod';

export type FinancialPlatform = Pick<ServerServices, 'withWorkspaceContext'>;
export type CommandState = Readonly<{
  revision: string;
  eventId: string;
  recordedAt: string;
}>;
export type FinancialCommand = Readonly<{
  commandId: string;
  idempotencyKey?: string;
  kind: string;
  payload: unknown;
}>;

class FinancialNoop<Result> extends Error {
  constructor(readonly result: Result) {
    super('Identical source already recorded');
  }
}

export function financialNoop<Result>(result: Result): never {
  throw new FinancialNoop(result);
}

/** Object order is not an economic input; array order and decimal source text are. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error('A command must contain JSON values');
    return result;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}

export function financialConflict(code: string, detail: string): ApplicationError {
  return new ApplicationError(409, code, 'Financial command rejected', detail);
}

export function financialFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function financialInvalid(detail: string): ApplicationError {
  return new ApplicationError(422, 'INVALID_FINANCIAL_INPUT', 'Invalid financial input', detail);
}

export async function queryRows<Row extends Record<string, unknown>>(
  tx: DbTransaction,
  query: Parameters<DbTransaction['execute']>[0],
): Promise<Row[]> {
  const result = await tx.execute<Row>(query);
  return result.rows as Row[];
}

/**
 * Serializing one workspace's source revision is deliberately conservative.
 * It also orders multi-account mutations without advisory-lock hash collisions.
 * Financial facts, the response, audit intent, and outbox intent commit together.
 */
export async function executeFinancialCommand<Result>(
  platform: FinancialPlatform,
  context: AuthorizationContext,
  command: FinancialCommand,
  callback: (tx: DbTransaction, state: CommandState) => Promise<Result>,
): Promise<Result> {
  if (context.role === 'viewer' || context.requiredRole === 'viewer') {
    throw new ApplicationError(
      403,
      'FORBIDDEN',
      'Action not permitted',
      'Editor access is required.',
    );
  }
  const commandId = z.uuidv4().parse(command.commandId).toLowerCase();
  const key = z
    .uuidv4()
    .parse(command.idempotencyKey ?? commandId)
    .toLowerCase();
  if (key !== commandId) throw financialInvalid('The idempotency key must identify this command.');
  const hash = financialFingerprint({ kind: command.kind, payload: command.payload });
  try {
    return await platform.withWorkspaceContext(context, async (tx) => {
      await tx.execute(sql`INSERT INTO app.financial_state (workspace_id, revision)
      VALUES (${context.workspaceId}::uuid, 0) ON CONFLICT (workspace_id) DO NOTHING`);
      const [state] = await queryRows<{ revision: number }>(
        tx,
        sql`SELECT revision FROM app.financial_state
        WHERE workspace_id=${context.workspaceId}::uuid FOR UPDATE`,
      );
      if (!state)
        throw financialConflict('MISSING_FINANCIAL_STATE', 'Workspace state is unavailable.');
      const [previous] = await queryRows<{ request_hash: string; result: Result; id: string }>(
        tx,
        sql`SELECT id, request_hash, result FROM app.financial_commands
        WHERE workspace_id=${context.workspaceId}::uuid
          AND (idempotency_key=${key} OR id=${commandId}::uuid)`,
      );
      if (previous) {
        if (previous.request_hash !== hash) {
          throw financialConflict(
            'IDEMPOTENCY_CONFLICT',
            'This command identity has different contents.',
          );
        }
        return previous.result;
      }
      const revision = String(state.revision + 1);
      const recordedAt = new Date().toISOString();
      const auditId = randomUUID();
      await tx.execute(sql`UPDATE app.financial_state SET revision=${revision}::integer
      WHERE workspace_id=${context.workspaceId}::uuid`);
      const result = await callback(tx, { revision, eventId: commandId, recordedAt });
      await tx.execute(sql`INSERT INTO app.financial_commands
      (workspace_id,id,idempotency_key,kind,request_hash,result,source_revision,actor_id,audit_event_id,request_id)
      VALUES (${context.workspaceId}::uuid,${commandId}::uuid,${key},${command.kind},
        ${hash},${JSON.stringify(result)}::jsonb,${revision}::integer,${context.actorId},${auditId}::uuid,${context.requestId})`);
      await tx.execute(sql`INSERT INTO app.audit_events (workspace_id,id,actor_id,action,request_id)
      VALUES (${context.workspaceId}::uuid,${auditId}::uuid,${context.actorId},${`financial.${command.kind}`},${context.requestId})`);
      await tx.execute(sql`INSERT INTO app.outbox_events
      (workspace_id,id,command_id,source_revision,event_kind,payload)
      VALUES (${context.workspaceId}::uuid,gen_random_uuid(),${commandId}::uuid,
        ${revision}::integer,${`financial.${command.kind}`},
        ${JSON.stringify({ commandId: command.commandId, sourceRevision: revision })}::jsonb)`);
      return result;
    });
  } catch (error) {
    // Throwing inside the transaction rolls back the tentative revision as well.
    if (error instanceof FinancialNoop) return error.result as Result;
    throw error;
  }
}
