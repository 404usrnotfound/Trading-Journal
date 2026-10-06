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
};

function workspaceSummary(row: WorkspaceFunctionRow): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    isDemo: row.is_demo,
    role: row.membership_role,
    timezone: row.timezone,
    reportingCurrency: row.reporting_currency,
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
