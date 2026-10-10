import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { databaseSchema } from './schema.js';

export { verifyDatabaseSchema } from './readiness.js';
export { eq, sql } from 'drizzle-orm';

export type Database = {
  pool: Pool;
  db: NodePgDatabase<typeof databaseSchema>;
  close: () => Promise<void>;
};

export type DbTransaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0];
export type TenantContext = Readonly<{ actorId: string; workspaceId: string }>;
export type WorkspaceRole = 'owner' | 'editor' | 'viewer';
export type WorkspaceSummary = {
  id: string;
  name: string;
  isDemo: boolean;
  role: WorkspaceRole;
  timezone: string;
  reportingCurrency: string | null;
  revision: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateActorId(actorId: string): void {
  if (!actorId || actorId.length > 128 || actorId.includes('\0')) {
    throw new Error('Invalid actor context');
  }
}

export function createDatabase(connectionString: string, options: { max?: number } = {}): Database {
  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: 'trading-journal',
  });
  return { pool, db: drizzle(pool, { schema: databaseSchema }), close: () => pool.end() };
}

// Context always lives inside this transaction and expires on commit/rollback.
// Actor IDs must come from a server-verified session, never a browser body.
export async function withActorTransaction<T>(
  database: Database,
  actorId: string,
  callback: (transaction: DbTransaction) => Promise<T>,
): Promise<T> {
  validateActorId(actorId);
  return database.db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT set_config('app.user_id', ${actorId}, true), set_config('app.workspace_id', '', true)`,
    );
    return callback(transaction);
  });
}

export async function withTenantTransaction<T>(
  database: Database,
  context: TenantContext,
  callback: (transaction: DbTransaction) => Promise<T>,
): Promise<T> {
  validateActorId(context.actorId);
  if (!uuidPattern.test(context.workspaceId)) throw new Error('Invalid workspace context');
  return database.db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT set_config('app.user_id', ${context.actorId}, true), set_config('app.workspace_id', ${context.workspaceId.toLowerCase()}, true)`,
    );
    return callback(transaction);
  });
}

type WorkspaceFunctionRow = {
  id: string;
  name: string;
  is_demo: boolean;
  membership_role: WorkspaceRole;
  timezone: string;
  reporting_currency: string | null;
  revision: number;
};

function workspaceSummary(row: WorkspaceFunctionRow): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    isDemo: row.is_demo,
    role: row.membership_role,
    timezone: row.timezone,
    reportingCurrency: row.reporting_currency,
    revision: row.revision,
  };
}

export async function listOwnWorkspaces(
  database: Database,
  actorId: string,
): Promise<WorkspaceSummary[]> {
  return withActorTransaction(database, actorId, async (transaction) => {
    const result = await transaction.execute<WorkspaceFunctionRow>(
      sql`SELECT * FROM app.list_own_workspaces()`,
    );
    return result.rows.map(workspaceSummary);
  });
}

export async function createPersonalWorkspace(
  database: Database,
  actorId: string,
  input: { name: string; id?: string; isDemo?: boolean },
): Promise<WorkspaceSummary> {
  const id = input.id ?? randomUUID();
  if (!uuidPattern.test(id)) throw new Error('Invalid workspace identity');
  if (!input.name.trim() || input.name.trim().length > 120)
    throw new Error('Invalid workspace name');
  return withActorTransaction(database, actorId, async (transaction) => {
    const result = await transaction.execute<WorkspaceFunctionRow>(
      sql`SELECT * FROM app.create_personal_workspace(${input.name.trim()}, ${id}::uuid, ${input.isDemo ?? false})`,
    );
    const row = result.rows[0];
    if (!row) throw new Error('Workspace creation did not produce a record');
    return workspaceSummary(row);
  });
}

/**
 * Operator bootstrap/seed only: serialize retries by verified creator and
 * environment, and reuse only a workspace still owned and created by that actor.
 * A demo label identifies that seed workflow without restricting future demos.
 */
export async function ensurePersonalWorkspace(
  database: Database,
  actorId: string,
  input: { name: string; isDemo?: boolean },
): Promise<WorkspaceSummary> {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error('Invalid workspace name');
  const isDemo = input.isDemo ?? false;
  return withActorTransaction(database, actorId, async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(1791590401, hashtext(${`${actorId}|${isDemo}`}))`,
    );
    const candidates = await transaction.execute<WorkspaceFunctionRow>(
      sql`SELECT * FROM app.list_own_workspaces()`,
    );
    for (const candidate of candidates.rows) {
      if (
        candidate.membership_role !== 'owner' ||
        candidate.is_demo !== isDemo ||
        (isDemo && candidate.name !== name)
      )
        continue;
      await transaction.execute(sql`SELECT set_config('app.workspace_id', ${candidate.id}, true)`);
      const own = await transaction.execute<WorkspaceFunctionRow>(sql`
        SELECT id, name, is_demo, 'owner'::app.membership_role AS membership_role,
               timezone, reporting_currency, revision
        FROM app.workspaces
        WHERE id = ${candidate.id}::uuid AND created_by = ${actorId}
          AND app.actor_role(id) = 'owner'
      `);
      const row = own.rows[0];
      if (row) return workspaceSummary(row);
    }
    await transaction.execute(sql`SELECT set_config('app.workspace_id', '', true)`);
    const result = await transaction.execute<WorkspaceFunctionRow>(
      sql`SELECT * FROM app.create_personal_workspace(${name}, ${randomUUID()}::uuid, ${isDemo})`,
    );
    const row = result.rows[0];
    if (!row) throw new Error('Workspace creation did not produce a record');
    return workspaceSummary(row);
  });
}
