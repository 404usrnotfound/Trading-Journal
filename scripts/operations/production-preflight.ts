import { createHash, randomUUID } from 'node:crypto';
import { lstat, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createDatabase, type Database } from '@journal/database';
import { DATABASE_SCHEMA_VERSION, verifyDatabaseSchema } from '@journal/database/migrate';
import { parseServerConfig, type ServerConfig } from '@journal/server/config';
import { createPrivateFileStore } from '@journal/server/storage';
import { loadEnvironment } from '../environment.js';

const bindings = [
  ['DATABASE_URL', 'journal_app'],
  ['AUTH_DATABASE_URL', 'journal_auth'],
  ['JOB_DATABASE_URL', 'journal_jobs'],
] as const;
type Binding = (typeof bindings)[number][0];
type RuntimeRole = (typeof bindings)[number][1];

/** Fixed classifications only: never retain a driver error, URL or filesystem path. */
export class ProductionPreflightError extends Error {
  constructor(
    readonly code:
      | 'PRODUCTION_CONFIGURATION_REQUIRED'
      | 'DATABASE_PROBE_FAILED'
      | 'RUNTIME_ROLE_UNSAFE'
      | 'DATABASE_TARGET_MISMATCH'
      | 'DATABASE_TLS_REQUIRED'
      | 'PRIVATE_STORAGE_PROBE_FAILED',
    readonly binding?: Binding,
  ) {
    super(`Production preflight failed: ${code}${binding ? ` (${binding})` : ''}`);
    this.name = 'ProductionPreflightError';
  }
}

export type RuntimeRoleFacts = {
  role: string;
  session_role: string;
  server_version: number;
  database_identity: string;
  ssl: boolean;
  can_login: boolean;
  inherits: boolean;
  superuser: boolean;
  bypass_rls: boolean;
  create_database: boolean;
  create_role: boolean;
  replication: boolean;
  privileged_membership: boolean;
  owns_objects: boolean;
  can_create: boolean;
  expected_access: boolean;
  foreign_access: boolean;
};

/** Exported for negative-case tests; the caller obtains these facts from PostgreSQL. */
export function assertSafeRuntimeRole(
  facts: RuntimeRoleFacts,
  role: RuntimeRole,
  binding: Binding,
) {
  if (
    facts.role !== role ||
    facts.session_role !== role ||
    facts.server_version < 170000 ||
    facts.server_version >= 180000 ||
    !facts.database_identity ||
    !facts.can_login ||
    facts.inherits ||
    facts.superuser ||
    facts.bypass_rls ||
    facts.create_database ||
    facts.create_role ||
    facts.replication ||
    facts.privileged_membership ||
    facts.owns_objects ||
    facts.can_create ||
    !facts.expected_access ||
    facts.foreign_access
  ) {
    throw new ProductionPreflightError('RUNTIME_ROLE_UNSAFE', binding);
  }
}

export function assertDatabaseTransportPolicy(
  urls: readonly string[],
  allowLocalPlaintext: boolean,
  unsafeTlsOverride: string | undefined = process.env.NODE_TLS_REJECT_UNAUTHORIZED,
): void {
  for (const [index, url] of urls.entries()) {
    const binding = bindings[index]![0];
    const parsed = new URL(url);
    const keys = [...parsed.searchParams.keys()];
    const allowed = allowLocalPlaintext
      ? ['sslmode']
      : ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'application_name', 'connect_timeout'];
    if (
      unsafeTlsOverride === '0' ||
      keys.some((key) => !allowed.includes(key) || parsed.searchParams.getAll(key).length !== 1) ||
      (allowLocalPlaintext
        ? !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
          ![null, 'disable'].includes(parsed.searchParams.get('sslmode'))
        : parsed.searchParams.get('sslmode') !== 'verify-full')
    )
      throw new ProductionPreflightError('DATABASE_TLS_REQUIRED', binding);
  }
}

const expectedAccess: Record<RuntimeRole, string> = {
  journal_app: `has_table_privilege('app.workspaces', 'SELECT')
    AND has_column_privilege('app.workspaces', 'revision', 'UPDATE')
    AND has_table_privilege('app.accounts', 'SELECT')
    AND has_table_privilege('app.accounts', 'INSERT')
    AND NOT has_table_privilege('app.workspaces', 'INSERT')
    AND NOT has_table_privilege('app.workspaces', 'DELETE')
    AND NOT has_table_privilege('app.accounts', 'DELETE')`,
  journal_auth: `has_table_privilege('auth.session', 'SELECT')
    AND has_table_privilege('auth.session', 'INSERT')
    AND has_table_privilege('auth.session', 'UPDATE')
    AND has_table_privilege('auth.session', 'DELETE')`,
  journal_jobs: `has_table_privilege('queue.job', 'SELECT')
    AND has_table_privilege('queue.job', 'INSERT')
    AND has_table_privilege('queue.job', 'UPDATE')
    AND has_table_privilege('queue.job', 'DELETE')
    AND has_table_privilege('queue.version', 'SELECT')`,
};

export async function inspectRuntimeRole(
  database: Database,
  role: RuntimeRole,
): Promise<RuntimeRoleFacts> {
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = await client.query<{ role: string; session_role: string }>(
      'SELECT current_user::text AS role, session_user::text AS session_role',
    );
    if (identity.rows[0]?.role !== role || identity.rows[0]?.session_role !== role)
      throw new ProductionPreflightError(
        'RUNTIME_ROLE_UNSAFE',
        bindings.find((binding) => binding[1] === role)![0],
      );
    // Fixed table/role allowlists above; no environment/user value selects SQL text.
    const result = await client.query<RuntimeRoleFacts>(`SELECT
      current_user::text AS role, session_user::text AS session_role,
      current_setting('server_version_num')::int AS server_version,
      json_build_array(current_database(), (SELECT oid FROM pg_database WHERE datname=current_database()),
        inet_server_addr()::text, inet_server_port(), pg_postmaster_start_time()::text)::text AS database_identity,
      COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()), false) AS ssl,
      r.rolcanlogin AS can_login, r.rolinherit AS inherits, r.rolsuper AS superuser,
      r.rolbypassrls AS bypass_rls, r.rolcreatedb AS create_database,
      r.rolcreaterole AS create_role, r.rolreplication AS replication,
      -- NOINHERIT does not prevent SET ROLE. Reviewed runtime identities have
      -- no membership in any other role, including another runtime identity.
      EXISTS (SELECT 1 FROM pg_roles p WHERE p.rolname<>current_user
        AND pg_has_role(current_user,p.oid,'MEMBER')) AS privileged_membership,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('app','auth','queue','migrations')
          AND pg_has_role(current_user,c.relowner,'MEMBER'))
        OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('app','auth','queue','migrations')
          AND pg_has_role(current_user,n.nspowner,'MEMBER'))
        OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname IN ('app','auth','queue','migrations')
            AND pg_has_role(current_user,p.proowner,'MEMBER')) AS owns_objects,
      has_database_privilege(current_database(),'CREATE')
        OR EXISTS (SELECT 1 FROM pg_namespace n
          WHERE n.nspname IN ('public','app','auth','queue','migrations')
          AND has_schema_privilege(current_user,n.oid,'CREATE')) AS can_create,
      (${expectedAccess[role]}) AS expected_access,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p','v','m','f')
          AND n.nspname IN (${role === 'journal_app' ? "'auth','queue'" : role === 'journal_auth' ? "'app','queue'" : "'app','auth'"})
          AND (has_table_privilege(current_user,c.oid,'SELECT')
            OR has_table_privilege(current_user,c.oid,'INSERT')
            OR has_table_privilege(current_user,c.oid,'UPDATE')
            OR has_table_privilege(current_user,c.oid,'DELETE')
            OR has_table_privilege(current_user,c.oid,'TRUNCATE')
            OR has_table_privilege(current_user,c.oid,'REFERENCES')
            OR has_table_privilege(current_user,c.oid,'TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS foreign_access
      FROM pg_roles r WHERE r.rolname=current_user`);
    if (result.rows.length !== 1) throw new Error('Missing role facts');
    return result.rows[0]!;
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

export async function probePrivateStorage(root: string): Promise<void> {
  const key = { workspaceId: randomUUID(), objectId: randomUUID() };
  let store: ReturnType<typeof createPrivateFileStore> | undefined;
  const bytes = Buffer.from(`journal-production-preflight:${randomUUID()}`);
  const workspace = join(resolve(root), key.workspaceId);
  let published = false;
  let failed = false;
  try {
    store = createPrivateFileStore(root);
    // An absent mount must fail rather than silently creating a new storage root.
    const metadata = await lstat(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0)
      throw new Error('Unsafe root');
    const stored = await store.write(key, bytes);
    published = true;
    const recovered = await store.read(key);
    if (
      !Buffer.from(recovered).equals(bytes) ||
      stored.sha256 !== createHash('sha256').update(bytes).digest('hex') ||
      stored.size !== bytes.byteLength
    )
      throw new Error('Storage integrity check failed');
  } catch {
    failed = true;
  } finally {
    try {
      if (published) await store!.delete(key);
      // Non-recursive removal of this probe's unique namespace only. Unknown
      // contents prevent removal; never erase another process's files.
      for (const path of [join(workspace, '.staging'), workspace]) {
        try {
          await rmdir(path);
        } catch (error) {
          if (!(typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT'))
            throw error;
        }
      }
    } catch {
      failed = true;
    }
  }
  if (failed) throw new ProductionPreflightError('PRIVATE_STORAGE_PROBE_FAILED');
}

export type ProductionPreflightResult = Readonly<{
  status: 'checks-passed';
  nodeEnvironment: 'production';
  schemaVersion: number;
  sameObservedDatabase: true;
  roles: ReadonlyArray<{ role: RuntimeRole; serverVersion: number; encryptedConnection: boolean }>;
  privateStorage: 'write-read-sha256-delete-verified';
  databaseTransportMode: 'verified-tls' | 'explicit-local-plaintext-test';
  deploymentTransportApprovalRequired: boolean;
}>;

/** Database queries are read-only; storage creates and removes one unique probe. */
export async function productionPreflight(
  config: ServerConfig,
  options: { allowLocalPlaintext?: boolean } = {},
): Promise<ProductionPreflightResult> {
  if (config.nodeEnv !== 'production')
    throw new ProductionPreflightError('PRODUCTION_CONFIGURATION_REQUIRED');
  const urls = [config.databaseUrl, config.authDatabaseUrl, config.jobDatabaseUrl];
  assertDatabaseTransportPolicy(urls, options.allowLocalPlaintext ?? false);
  const results: Array<{ role: RuntimeRole; serverVersion: number; encryptedConnection: boolean }> =
    [];
  let identity: string | undefined;
  for (const [index, [binding, role]] of bindings.entries()) {
    const database = createDatabase(urls[index]!, { max: 1 });
    try {
      const facts = await inspectRuntimeRole(database, role);
      assertSafeRuntimeRole(facts, role, binding);
      if (!options.allowLocalPlaintext && !facts.ssl)
        throw new ProductionPreflightError('DATABASE_TLS_REQUIRED', binding);
      if (identity && facts.database_identity !== identity)
        throw new ProductionPreflightError('DATABASE_TARGET_MISMATCH', binding);
      identity = facts.database_identity;
      if (role === 'journal_app') await verifyDatabaseSchema(database);
      results.push({ role, serverVersion: facts.server_version, encryptedConnection: facts.ssl });
    } catch (error) {
      if (error instanceof ProductionPreflightError) throw error;
      throw new ProductionPreflightError('DATABASE_PROBE_FAILED', binding);
    } finally {
      await database.close().catch(() => undefined);
    }
  }
  await probePrivateStorage(config.storageRoot);
  return {
    status: 'checks-passed',
    nodeEnvironment: 'production',
    schemaVersion: DATABASE_SCHEMA_VERSION,
    sameObservedDatabase: true,
    roles: results,
    privateStorage: 'write-read-sha256-delete-verified',
    databaseTransportMode: options.allowLocalPlaintext
      ? 'explicit-local-plaintext-test'
      : 'verified-tls',
    deploymentTransportApprovalRequired: results.some((result) => !result.encryptedConnection),
  };
}

async function main() {
  loadEnvironment();
  try {
    const { values } = parseArgs({
      options: {
        'require-tls': { type: 'boolean', default: false },
        'allow-local-plaintext': { type: 'boolean', default: false },
      },
    });
    if (values['require-tls'] && values['allow-local-plaintext']) throw new Error('Invalid mode');
    const result = await productionPreflight(parseServerConfig(process.env), {
      allowLocalPlaintext: values['allow-local-plaintext'],
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof ProductionPreflightError
        ? error.message
        : 'Production preflight failed: INVALID_CONFIGURATION',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
