/** Isolated SQL + private-media recovery drill; never an application restore endpoint. */
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, open, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, type Database } from '@journal/database';
import { verifyDatabaseSchema } from '@journal/database/migrate';
import {
  createJournalServices,
  createServerServices,
  createStrategyAttachmentServices,
  parseServerConfig,
  type ServerServices,
} from '@journal/server';
import { createPrivateFileStore } from '@journal/server/storage';
import { createRuntimeQueue, HEALTH_PROBE_QUEUE } from '../../apps/worker/src/queue.js';
import {
  createPerformanceDataset,
  loadPerformanceBindings,
  type PerformanceBindings,
  type PerformanceManifest,
} from '../performance/dataset.js';
import { loadEnvironment, repositoryRoot, testDatabaseUrls } from '../environment.js';
import {
  assertOwnedRecoveryDatabase,
  compareRecoverySnapshots,
  recoveryComposeProjectName,
  recoveryDigest,
  validateRecoveryRoles,
  type RecoveryRole,
} from './recovery-safety.js';
import {
  assertSafeRuntimeRole,
  inspectRuntimeRole,
  ProductionPreflightError,
} from './production-preflight.js';

const dockerEnvironment = { ...process.env };
for (const name of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete dockerEnvironment[name];
const dockerPrefix = ['--host=unix:///var/run/docker.sock'];

async function command(
  binary: string,
  args: string[],
  files: { input?: string; output?: string } = {},
) {
  return new Promise<string>((accept, reject) => {
    const child = spawn(binary, args, { env: dockerEnvironment, stdio: ['pipe', 'pipe', 'pipe'] });
    const output: Buffer[] = [];
    let size = 0;
    if (files.input) {
      const input = createReadStream(files.input);
      input.once('error', () => {
        child.kill();
        reject(new Error('Recovery archive could not be read'));
      });
      input.pipe(child.stdin);
    } else child.stdin.end();
    let destinationFinished = Promise.resolve();
    if (files.output) {
      const destination = createWriteStream(files.output, { flags: 'wx', mode: 0o600 });
      child.stdout.pipe(destination);
      destinationFinished = new Promise<void>((done, fail) => {
        destination.once('finish', done);
        destination.once('error', () => {
          child.kill();
          fail(new Error('Recovery archive could not be written'));
        });
      });
      void destinationFinished.catch(reject);
    } else {
      child.stdout.on('data', (data: Buffer) => {
        size += data.length;
        if (size > 1024 * 1024) child.kill();
        else output.push(data);
      });
    }
    // PostgreSQL stderr can contain SQL or connection details. Do not forward it.
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.once('error', () => reject(new Error('Recovery subprocess could not start')));
    child.once('close', (code) => {
      if (code !== 0)
        reject(new Error('Recovery subprocess failed; no private command output was logged'));
      else
        void destinationFinished.then(() => accept(Buffer.concat(output).toString('utf8')), reject);
    });
  });
}

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
const schemas = "('app','auth','queue','migrations')";

async function databaseSnapshot(database: Database) {
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const tables = await client.query<{ schema_name: string; table_name: string }>(
      `SELECT n.nspname AS schema_name,c.relname AS table_name FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ${schemas} AND c.relkind IN ('r','p') ORDER BY 1,2`,
    );
    const rows = [];
    for (const table of tables.rows) {
      const result = await client.query<{ count: string; canonical: string }>(
        `SELECT count(*)::text AS count,COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'') AS canonical
         FROM ${quoted(table.schema_name)}.${quoted(table.table_name)} t`,
      );
      rows.push({
        table: `${table.schema_name}.${table.table_name}`,
        count: result.rows[0]!.count,
        sha256: recoveryDigest(result.rows[0]!.canonical),
      });
    }
    const sequences = await client.query<{ schema_name: string; sequence_name: string }>(
      `SELECT n.nspname AS schema_name,c.relname AS sequence_name FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND c.relkind='S' ORDER BY 1,2`,
    );
    const sequenceState = [];
    for (const sequence of sequences.rows) {
      const state = await client.query<{ last_value: string; is_called: boolean }>(
        `SELECT last_value::text,is_called FROM ${quoted(sequence.schema_name)}.${quoted(sequence.sequence_name)}`,
      );
      sequenceState.push({
        sequence: `${sequence.schema_name}.${sequence.sequence_name}`,
        ...state.rows[0]!,
      });
    }
    const security = await client.query<{ canonical: string }>(`
      WITH objects AS (
        SELECT 'relation' AS kind,n.nspname||'.'||c.relname AS name,
          jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
            'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) AS value
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas}
        UNION ALL SELECT 'column-acl',n.nspname||'.'||c.relname||'.'||a.attname,
          jsonb_build_object('acl',a.attacl::text)
          FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ${schemas} AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
        UNION ALL SELECT 'index',n.nspname||'.'||c.relname,
          jsonb_build_object('definition',pg_get_indexdef(c.oid))
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND c.relkind IN ('i','I')
        UNION ALL SELECT 'schema',nspname,jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text)
          FROM pg_namespace WHERE nspname IN ${schemas}
        UNION ALL SELECT 'policy',n.nspname||'.'||c.relname||'.'||p.polname,
          jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
            'roles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE oid=ANY(p.polroles)),
            'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
          FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas}
        UNION ALL SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
          jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,
            'securityDefiner',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid))
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ${schemas} AND p.prokind IN ('f','p')
        UNION ALL SELECT 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
          jsonb_build_object('enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ${schemas} AND NOT t.tgisinternal
        UNION ALL SELECT 'constraint',n.nspname||'.'||c.relname||'.'||k.conname,
          jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)
          FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas}
        UNION ALL SELECT 'default-acl',n.nspname||'.'||pg_get_userbyid(a.defaclrole)||'.'||a.defaclobjtype::text,
          jsonb_build_object('acl',a.defaclacl::text)
          FROM pg_default_acl a JOIN pg_namespace n ON n.oid=a.defaclnamespace WHERE n.nspname IN ${schemas}
      ) SELECT COALESCE(string_agg(kind||':'||name||':'||value::text,E'\\n' ORDER BY kind,name),'') AS canonical FROM objects`);
    const roles = await client.query<RecoveryRole>(
      "SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolreplication FROM pg_roles WHERE rolname IN ('journal_migrator','journal_app','journal_auth','journal_jobs') ORDER BY rolname",
    );
    const memberships = await client.query(
      `SELECT r.rolname AS role,m.rolname AS member,g.rolname AS grantor,a.admin_option,a.inherit_option,a.set_option
       FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
       JOIN pg_roles g ON g.oid=a.grantor
       WHERE r.rolname IN ('journal_migrator','journal_app','journal_auth','journal_jobs')
          OR m.rolname IN ('journal_migrator','journal_app','journal_auth','journal_jobs') ORDER BY 1,2,3`,
    );
    validateRecoveryRoles(roles.rows, memberships.rows.length);
    await client.query('COMMIT');
    return {
      tables: rows,
      sequences: sequenceState,
      securitySha256: recoveryDigest(security.rows[0]!.canonical),
      roles: roles.rows,
      memberships: memberships.rows,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function services(bindings: PerformanceBindings, storageRoot: string): ServerServices {
  return createServerServices(
    parseServerConfig({
      ...bindings,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      STORAGE_ROOT: storageRoot,
    }),
  );
}

async function login(platform: ServerServices, bindings: PerformanceBindings) {
  const response = await platform.handleAuthRequest(
    new Request(`${bindings.APP_ORIGIN}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin: bindings.APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ email: bindings.email, password: bindings.password }),
    }),
  );
  if (!response.ok) throw new Error('Recovery owner login failed');
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function journalSnapshot(
  platform: ServerServices,
  bindings: PerformanceBindings,
  manifest: PerformanceManifest,
  cookie: string,
) {
  const request = new Request(`${bindings.APP_ORIGIN}/api/workspaces`, { headers: { cookie } });
  const context = await platform.authorizeWorkspace(request, manifest.workspaceId, 'editor');
  const journal = createJournalServices(platform);
  const records = [];
  for (const id of manifest.tradeIds) records.push(await journal.get(context, id));
  return { context, records };
}

export async function runRecoveryDrill(outputPath?: string) {
  loadEnvironment();
  const test = testDatabaseUrls();
  const configured = new URL(test.TEST_DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname))
    throw new Error('The recovery drill requires the local isolated Compose test service');
  const generated = new Set<string>();
  const composeProject = recoveryComposeProjectName(process.env.COMPOSE_PROJECT_NAME);
  const container = (
    await command('docker', [
      ...dockerPrefix,
      'ps',
      '--filter',
      `label=com.docker.compose.project=${composeProject}`,
      '--filter',
      'label=com.docker.compose.service=postgres-test',
      '--format',
      '{{.ID}}',
    ])
  ).trim();
  if (!/^[0-9a-f]{12,64}$/.test(container))
    throw new Error('Exactly one isolated test PostgreSQL container is required');
  const ports = JSON.parse(
    await command('docker', [
      ...dockerPrefix,
      'inspect',
      '--format',
      '{{json .NetworkSettings.Ports}}',
      container,
    ]),
  ) as Record<string, { HostIp: string; HostPort: string }[]>;
  if (
    !ports['5432/tcp']?.some(
      (port) => port.HostIp === '127.0.0.1' && port.HostPort === (configured.port || '5432'),
    )
  )
    throw new Error('The private test binding does not match the local Compose test service');
  if (outputPath) {
    const reserve = await open(resolve(outputPath), 'wx', 0o600);
    await reserve.close();
  }
  const started = performance.now();
  await mkdir(join(repositoryRoot, 'work'), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(repositoryRoot, 'work', 'recovery-'));
  await chmod(directory, 0o700);
  const sourceMedia = join(directory, 'source-media');
  const restoredMedia = join(directory, 'restored-media');
  const archiveMedia = join(directory, 'media.tar');
  const archiveSql = join(directory, 'database.dump');
  const manifest = await createPerformanceDataset({
    trades: 3,
    executions: 6,
    distribution: 'concentrated',
    seed: 'phase-16-recovery-v1',
  });
  generated.add(manifest.databaseName);
  const bindings = await loadPerformanceBindings(manifest);
  const source = services(bindings, sourceMedia);
  let cookie: string;
  let financialBefore: unknown;
  let attachment: Awaited<
    ReturnType<ReturnType<typeof createStrategyAttachmentServices>['upload']>
  >;
  let queueId: string;
  try {
    cookie = await login(source, bindings);
    const snapshot = await journalSnapshot(source, bindings, manifest, cookie);
    financialBefore = snapshot.records;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVYAAAAASUVORK5CYII=',
      'base64',
    );
    attachment = await createStrategyAttachmentServices(
      source,
      createPrivateFileStore(sourceMedia),
    ).upload(snapshot.context, {
      commandId: randomUUID(),
      name: 'recovery-proof.png',
      mediaType: 'image/png',
      bytes: png,
    });
    const queue = createRuntimeQueue(bindings.JOB_DATABASE_URL);
    queue.on('error', () => undefined);
    try {
      await queue.start();
      const sent = await queue.send(HEALTH_PROBE_QUEUE, { probeId: randomUUID() });
      if (!sent) throw new Error('Recovery pending job could not be queued');
      queueId = sent;
    } finally {
      await queue.stop({ graceful: true, timeout: 5000 });
    }
  } finally {
    await source.close();
  }

  // The fixture has no other writers. All owned app/queue handles are closed.
  const sourceAdmin = createDatabase(bindings.MIGRATION_DATABASE_URL, { max: 1 });
  let before: Awaited<ReturnType<typeof databaseSnapshot>>;
  try {
    const writers = await sourceAdmin.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()',
    );
    if (writers.rows[0]!.count !== '0') throw new Error('Recovery fixture is not quiesced');
    before = await databaseSnapshot(sourceAdmin);
  } finally {
    await sourceAdmin.close();
  }
  const backupStart = performance.now();
  await command(
    'docker',
    [
      ...dockerPrefix,
      'exec',
      container,
      'pg_dump',
      '-U',
      'postgres',
      '--format=custom',
      '--dbname',
      manifest.databaseName,
    ],
    { output: archiveSql },
  );
  await command('tar', ['--create', '--file', archiveMedia, '--directory', sourceMedia, '.']);
  await chmod(archiveMedia, 0o600);
  const backupMilliseconds = performance.now() - backupStart;
  const targetName = `journal_recovery_${randomUUID().replaceAll('-', '')}_test`;
  const recoveryStart = performance.now();
  generated.add(targetName);
  assertOwnedRecoveryDatabase(targetName, generated);
  const targetContainer = `journal-recovery-${randomUUID().replaceAll('-', '')}`;
  const targetPassword = randomBytes(48).toString('base64url');
  const targetEnv = join(directory, 'restore-postgres.env');
  await writeFile(targetEnv, `POSTGRES_PASSWORD=${targetPassword}\n`, { mode: 0o600, flag: 'wx' });
  const image =
    'postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826';
  await command('docker', [
    ...dockerPrefix,
    'run',
    '--detach',
    '--pull=never',
    '--name',
    targetContainer,
    '--label',
    'trading-journal.recovery-drill=phase-16',
    '--env-file',
    targetEnv,
    '--publish',
    '127.0.0.1::5432',
    '--tmpfs',
    '/var/lib/postgresql/data',
    image,
  ]);
  let available = false;
  const startupDeadline = Date.now() + 30000;
  while (Date.now() < startupDeadline) {
    try {
      await command('docker', [
        ...dockerPrefix,
        'exec',
        targetContainer,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ]);
      available = true;
      break;
    } catch {
      await new Promise<void>((done) => setTimeout(done, 250));
    }
  }
  if (!available) throw new Error('The isolated restore cluster did not become ready');
  const targetPorts = JSON.parse(
    await command('docker', [
      ...dockerPrefix,
      'inspect',
      '--format',
      '{{json .NetworkSettings.Ports}}',
      targetContainer,
    ]),
  ) as Record<string, { HostIp: string; HostPort: string }[]>;
  const targetPort = targetPorts['5432/tcp']?.find((port) => port.HostIp === '127.0.0.1')?.HostPort;
  if (!targetPort || !/^\d+$/.test(targetPort))
    throw new Error('The restore cluster loopback port is unavailable');
  const targetOperatorUrl = new URL('postgresql://postgres@127.0.0.1/postgres');
  targetOperatorUrl.password = targetPassword;
  targetOperatorUrl.port = targetPort;
  const targetOperator = createDatabase(targetOperatorUrl.toString(), { max: 1 });
  try {
    // pg_dump is per database and does not create cluster-global roles. Only the
    // new isolated cluster receives these reviewed role attributes/passwords.
    for (const role of before.roles) {
      const roleName = String(role.rolname);
      if (!['journal_migrator', 'journal_app', 'journal_auth', 'journal_jobs'].includes(roleName))
        throw new Error('Unexpected recovery role');
      const flags = [
        role.rolcanlogin ? 'LOGIN' : 'NOLOGIN',
        role.rolinherit ? 'INHERIT' : 'NOINHERIT',
        role.rolsuper ? 'SUPERUSER' : 'NOSUPERUSER',
        role.rolcreatedb ? 'CREATEDB' : 'NOCREATEDB',
        role.rolcreaterole ? 'CREATEROLE' : 'NOCREATEROLE',
        role.rolbypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS',
        'NOREPLICATION',
      ].join(' ');
      await targetOperator.pool.query(`CREATE ROLE ${quoted(roleName)} ${flags}`);
      const bindingName =
        roleName === 'journal_app'
          ? 'DATABASE_URL'
          : roleName === 'journal_auth'
            ? 'AUTH_DATABASE_URL'
            : roleName === 'journal_jobs'
              ? 'JOB_DATABASE_URL'
              : undefined;
      if (bindingName) {
        const password = decodeURIComponent(new URL(bindings[bindingName]).password);
        const sql = await targetOperator.pool.query<{ statement: string }>(
          "SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) AS statement",
          [roleName, password],
        );
        await targetOperator.pool.query(sql.rows[0]!.statement);
      }
    }
    await targetOperator.pool.query(`CREATE DATABASE ${quoted(targetName)}`);
  } finally {
    await targetOperator.close();
  }
  const targetBindings = { ...bindings };
  for (const name of [
    'DATABASE_URL',
    'AUTH_DATABASE_URL',
    'JOB_DATABASE_URL',
    'MIGRATION_DATABASE_URL',
  ] as const) {
    const url =
      name === 'MIGRATION_DATABASE_URL' ? new URL(targetOperatorUrl) : new URL(bindings[name]);
    url.hostname = '127.0.0.1';
    url.port = targetPort;
    url.pathname = `/${targetName}`;
    targetBindings[name] = url.toString();
  }
  const restoreStart = performance.now();
  await command(
    'docker',
    [
      ...dockerPrefix,
      'exec',
      '-i',
      targetContainer,
      'pg_restore',
      '-U',
      'postgres',
      '--single-transaction',
      '--exit-on-error',
      '--dbname',
      targetName,
    ],
    { input: archiveSql },
  );
  await mkdir(restoredMedia, { mode: 0o700 });
  await command('tar', [
    '--extract',
    '--file',
    archiveMedia,
    '--directory',
    restoredMedia,
    '--no-same-owner',
  ]);
  const restoreMilliseconds = performance.now() - restoreStart;
  const restoredAdmin = createDatabase(targetBindings.MIGRATION_DATABASE_URL, { max: 1 });
  let after: Awaited<ReturnType<typeof databaseSnapshot>>;
  try {
    after = await databaseSnapshot(restoredAdmin);
    compareRecoverySnapshots(before, after);
  } finally {
    await restoredAdmin.close();
  }
  const runtime = createDatabase(targetBindings.DATABASE_URL, { max: 1 });
  try {
    // Only this invocation's fresh target cluster receives the temporary grant.
    // NOINHERIT still permits SET ROLE: prove that the production preflight
    // rejects this cross-runtime membership, then restore the exact snapshot.
    assertOwnedRecoveryDatabase(targetName, generated);
    const grantOperator = createDatabase(targetBindings.MIGRATION_DATABASE_URL, { max: 1 });
    try {
      await grantOperator.pool.query('GRANT journal_auth TO journal_app');
      const escalationClient = await runtime.pool.connect();
      try {
        await escalationClient.query('SET ROLE journal_auth');
        const escalated = await escalationClient.query<{ role: string }>(
          'SELECT current_user::text AS role',
        );
        if (escalated.rows[0]?.role !== 'journal_auth')
          throw new Error('The isolated SET ROLE negative case was not exercised');
      } finally {
        try {
          await escalationClient.query('RESET ROLE');
        } finally {
          escalationClient.release();
        }
      }
      const facts = await inspectRuntimeRole(runtime, 'journal_app');
      if (!facts.privileged_membership)
        throw new Error('Production preflight missed a cross-runtime role membership');
      let rejected = false;
      try {
        assertSafeRuntimeRole(facts, 'journal_app', 'DATABASE_URL');
      } catch (error) {
        if (
          !(error instanceof ProductionPreflightError) ||
          error.code !== 'RUNTIME_ROLE_UNSAFE' ||
          error.binding !== 'DATABASE_URL'
        )
          throw error;
        rejected = true;
      }
      if (!rejected) throw new Error('Production preflight accepted SET ROLE escalation');
    } finally {
      try {
        await grantOperator.pool.query('REVOKE journal_auth FROM journal_app');
        compareRecoverySnapshots(before, await databaseSnapshot(grantOperator));
      } finally {
        await grantOperator.close();
      }
    }
    assertSafeRuntimeRole(
      await inspectRuntimeRole(runtime, 'journal_app'),
      'journal_app',
      'DATABASE_URL',
    );
    await verifyDatabaseSchema(runtime);
    const role = await runtime.pool.query<{
      role: string;
      super: boolean;
      bypass: boolean;
      replication: boolean;
      owner: boolean;
    }>(
      "SELECT current_user AS role,rolsuper AS super,rolbypassrls AS bypass,rolreplication AS replication,(SELECT pg_get_userbyid(relowner)=current_user FROM pg_class WHERE oid='app.trades'::regclass) AS owner FROM pg_roles WHERE rolname=current_user",
    );
    if (
      role.rows[0]?.role !== 'journal_app' ||
      role.rows[0].super ||
      role.rows[0].bypass ||
      role.rows[0].replication ||
      role.rows[0].owner
    )
      throw new Error('Restored runtime role is not restricted');
    const denied = await runtime.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM app.trades',
    );
    if (denied.rows[0]!.count !== '0')
      throw new Error('Restored RLS exposed context-free trade data');
    const client = await runtime.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
        [manifest.actorId, randomUUID()],
      );
      const wrong = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM app.trades',
      );
      if (wrong.rows[0]!.count !== '0')
        throw new Error('Restored RLS exposed a different workspace');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await runtime.close();
  }
  const restored = services(targetBindings, restoredMedia);
  try {
    // Same cookie + unchanged auth secret proves restored session continuity.
    const snapshot = await journalSnapshot(restored, targetBindings, manifest, cookie);
    compareRecoverySnapshots(financialBefore, snapshot.records);
    const freshCookie = await login(restored, targetBindings);
    const freshSnapshot = await journalSnapshot(restored, targetBindings, manifest, freshCookie);
    compareRecoverySnapshots(financialBefore, freshSnapshot.records);
    const download = await createStrategyAttachmentServices(
      restored,
      createPrivateFileStore(restoredMedia),
    ).download(snapshot.context, attachment.id);
    if (
      download.attachment.sha256 !== attachment.sha256 ||
      recoveryDigest(download.bytes) !== attachment.sha256
    )
      throw new Error('Restored attachment checksum differs');
  } finally {
    await restored.close();
  }
  const queue = createRuntimeQueue(targetBindings.JOB_DATABASE_URL);
  queue.on('error', () => undefined);
  let restoredJobCompleted = false;
  try {
    await queue.start();
    await queue.work(HEALTH_PROBE_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      if (jobs.some((job) => job.id === queueId)) restoredJobCompleted = true;
    });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const jobs = await queue.findJobs(HEALTH_PROBE_QUEUE, { id: queueId });
      if (jobs[0]?.state === 'completed') break;
      await new Promise<void>((accept) => setTimeout(accept, 100));
    }
    const jobs = await queue.findJobs(HEALTH_PROBE_QUEUE, { id: queueId });
    if (!restoredJobCompleted || jobs[0]?.state !== 'completed')
      throw new Error('Restored pending queue job did not complete');
  } finally {
    await queue.stop({ graceful: true, timeout: 5000 });
  }
  const report = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    status: 'passed',
    method:
      'Quiesced isolated SQL custom-format dump and coordinated private local media, restored into a fresh PostgreSQL17 cluster with explicit role bootstrap',
    software: {
      node: process.versions.node,
      postgresTools: (
        await command('docker', [...dockerPrefix, 'exec', container, 'pg_dump', '--version'])
      ).trim(),
    },
    dataset: {
      trades: manifest.trades,
      executions: manifest.executions,
      counts: manifest.counts,
      financialOracle: manifest.validation,
    },
    durations: {
      fixtureMilliseconds: manifest.setupMilliseconds,
      backupMilliseconds,
      restoreMilliseconds,
      restoreBootstrapAndVerificationMilliseconds: performance.now() - recoveryStart,
      totalMilliseconds: performance.now() - started,
    },
    archives: {
      sql: {
        bytes: (await stat(archiveSql)).size,
        sha256: recoveryDigest(await readFile(archiveSql)),
      },
      media: {
        bytes: (await stat(archiveMedia)).size,
        sha256: recoveryDigest(await readFile(archiveMedia)),
      },
    },
    comparison: {
      allTables: before.tables,
      sequenceState: before.sequences,
      securitySha256: before.securitySha256,
      roles: before.roles,
      memberships: before.memberships,
      financialDtoSha256: recoveryDigest(JSON.stringify(financialBefore)),
      attachmentSha256: attachment.sha256,
    },
    verified: {
      freshClusterRoleBootstrap: true,
      allSchemaDataExact: true,
      sequenceStateExact: true,
      ownersGrantsPoliciesFunctionsTriggersConstraintsExact: true,
      schemaReadiness: true,
      runtimeNonOwnerNoSuperuserNoBypassRlsNoReplication: true,
      zeroMembershipPreflightRejectsSetRoleEscalation: true,
      missingAndWrongTenantDenied: true,
      existingSessionAndFinancialDtos: true,
      freshPasswordLoginAndFinancialDtos: true,
      privateAttachmentHash: true,
      restoredPendingQueueJobCompleted: true,
    },
    limitations: [
      'Tiny synthetic isolated fixture, not a production-scale RTO test.',
      'Synthetic local trust/socket backup access; production backup-role/network/TLS authorization is not exercised.',
      'No offsite transfer, encryption/key recovery, scheduled retention, physical backup or PITR is exercised.',
      'No restore-to-public-deployment or end-user workspace export/import is implemented.',
    ],
  };
  await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  if (outputPath)
    await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  // Exact names are generated by this invocation; no forced database drop or
  // Docker volume deletion is used. Only this invocation's tmpfs container is removed.
  const cleanup = createDatabase(test.TEST_DATABASE_URL, { max: 1 });
  try {
    assertOwnedRecoveryDatabase(manifest.databaseName, generated);
    await cleanup.pool.query(`DROP DATABASE ${quoted(manifest.databaseName)}`);
  } finally {
    await cleanup.close();
  }
  await command('docker', [...dockerPrefix, 'rm', '--force', targetContainer]);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--output'))
      throw new Error('Use only --output <new-report-path>');
    if (args[1]) await mkdir(dirname(resolve(args[1])), { recursive: true });
    const report = await runRecoveryDrill(args[1]);
    console.log(
      JSON.stringify({
        event: 'operations.recovery-drill.passed',
        verified: report.verified,
        durations: report.durations,
      }),
    );
  } catch {
    console.error(
      JSON.stringify({
        event: 'operations.recovery-drill.failed',
        message:
          'Isolated artifacts retained for private diagnosis; no connection or SQL details logged.',
      }),
    );
    process.exitCode = 1;
  }
}
