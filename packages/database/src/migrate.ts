import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Pool, type PoolClient } from 'pg';
import { verifySchemaOnConnection } from './readiness.js';

export { DATABASE_SCHEMA_VERSION, verifyDatabaseSchema } from './readiness.js';
export { readMigrationFiles } from 'drizzle-orm/migrator';
export const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

const migrationOptions = {
  migrationsFolder,
  migrationsSchema: 'migrations',
  migrationsTable: '__drizzle_migrations',
};

/** Tooling only: caller supplies the migration credential, never runtime auth. */
export async function migrateDatabase(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const version = await client.query<{ server_version_num: string }>('SHOW server_version_num');
    const numericVersion = Number(version.rows[0]?.server_version_num);
    if (numericVersion < 170000 || numericVersion >= 180000) {
      throw new Error('The supported database is PostgreSQL 17');
    }
    // A stalled release must not leave another migration process waiting forever.
    await client.query("SET lock_timeout = '30s'");
    await client.query('SELECT pg_advisory_lock(1791244800)');
    const existing = await client.query<{ present: string | null }>(
      "SELECT to_regclass('migrations.__drizzle_migrations')::text AS present",
    );
    if (existing.rows[0]?.present) {
      const applied = await client.query<{ hash: string; created_at: string }>(
        'SELECT hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at, id',
      );
      const expected = readMigrationFiles(migrationOptions);
      // Drizzle advances from the latest journal time. Accept only an exact
      // prefix, so a missing earlier entry cannot cause unapplied SQL to be skipped.
      for (const [index, migration] of applied.rows.entries()) {
        const reviewed = expected[index];
        if (
          !reviewed ||
          String(reviewed.folderMillis) !== String(migration.created_at) ||
          reviewed.hash !== migration.hash
        ) {
          throw new Error('Applied migration history differs from the reviewed migration files');
        }
      }
    }
    await migrate(drizzle(client), migrationOptions);
    await verifySchemaOnConnection(client);
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock(1791244800)').catch(() => undefined);
      client.release();
    }
    await pool.end();
  }
}

export type RuntimeRolePasswords = {
  appPassword: string;
  authPassword: string;
  jobsPassword: string;
};

/**
 * Operator-only setup. SQL values are quoted by PostgreSQL itself, not shell or
 * template interpolation. Never return/log the generated ALTER ROLE statement.
 */
export async function provisionRuntimeRoles(
  adminUrl: string,
  passwords: RuntimeRolePasswords,
): Promise<void> {
  const pool = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 5_000 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL password_encryption = 'scram-sha-256'");
    for (const [role, password] of [
      ['journal_app', passwords.appPassword],
      ['journal_auth', passwords.authPassword],
      ['journal_jobs', passwords.jobsPassword],
    ] as const) {
      if (password.length < 24 || password.includes('\0'))
        throw new Error('A strong generated runtime password is required');
      const statement = await client.query<{ statement: string }>(
        "SELECT format('ALTER ROLE %I WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', $1::text, $2::text) AS statement",
        [role, password],
      );
      await client.query(statement.rows[0]!.statement);
    }
    // The queue migration is independently controlled. Defaults cover objects
    // created by either reviewed migration owner, including after provisioning.
    await client.query('GRANT USAGE ON SCHEMA queue TO journal_jobs');
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA queue TO journal_jobs',
    );
    // pg-boss stores runtime flow cadence beside its schema version. Preserve
    // only that required column write, never schema-version or async-DDL writes.
    await client.query('REVOKE ALL ON queue.version, queue.bam FROM journal_jobs');
    await client.query('GRANT SELECT ON queue.version, queue.bam TO journal_jobs');
    await client.query('GRANT UPDATE (flow_on) ON queue.version TO journal_jobs');
    await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA queue TO journal_jobs');
    await client.query('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA queue FROM PUBLIC, journal_jobs');
    await client.query('GRANT EXECUTE ON FUNCTION queue.job_now() TO journal_jobs');
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA queue GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO journal_jobs',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA queue GRANT USAGE, SELECT ON SEQUENCES TO journal_jobs',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA queue REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, journal_jobs',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES FOR ROLE journal_migrator IN SCHEMA queue GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO journal_jobs',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES FOR ROLE journal_migrator IN SCHEMA queue GRANT USAGE, SELECT ON SEQUENCES TO journal_jobs',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES FOR ROLE journal_migrator IN SCHEMA queue REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, journal_jobs',
    );
    await client.query('COMMIT');
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    // Suppress query details because an ALTER ROLE contains the generated value.
    throw new Error('Runtime role provisioning failed; check operator configuration');
  } finally {
    client?.release();
    await pool.end();
  }
}
