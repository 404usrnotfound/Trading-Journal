import { Pool, type PoolClient } from 'pg';
import type { Database } from './index.js';

export const DATABASE_SCHEMA_VERSION = 2;

/** Runtime readiness is read-only and imports no migration file/DDL tooling. */
export async function verifyDatabaseSchema(database: Database | string): Promise<void> {
  const ownsPool = typeof database === 'string';
  const pool = ownsPool
    ? new Pool({ connectionString: database, max: 1, connectionTimeoutMillis: 5_000 })
    : database.pool;
  try {
    await verifySchemaOnConnection(pool);
  } finally {
    if (ownsPool) await pool.end();
  }
}

export async function verifySchemaOnConnection(connection: Pool | PoolClient): Promise<void> {
  const result = await connection.query<{ version: number }>(
    'SELECT version FROM app.schema_metadata WHERE singleton = true',
  );
  if (result.rows.length !== 1 || result.rows[0]?.version !== DATABASE_SCHEMA_VERSION) {
    throw new Error('Database schema version is incompatible with this release');
  }
  const version = await connection.query<{ server_version_num: string }>('SHOW server_version_num');
  const numericVersion = Number(version.rows[0]?.server_version_num);
  if (numericVersion < 170000 || numericVersion >= 180000) {
    throw new Error('The supported database is PostgreSQL 17');
  }
}
