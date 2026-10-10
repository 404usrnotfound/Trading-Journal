import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createPersonalWorkspace,
  ensurePersonalWorkspace,
  eq,
  listOwnWorkspaces,
  sql,
  withActorTransaction,
  withTenantTransaction,
  type Database,
  type WorkspaceSummary,
} from '@journal/database';
import {
  DATABASE_SCHEMA_VERSION,
  migrateDatabase,
  migrationsFolder,
  provisionRuntimeRoles,
  readMigrationFiles,
  verifyDatabaseSchema,
} from '@journal/database/migrate';
import {
  auditEvents,
  authSecurityEvents,
  session,
  user,
  userPreferences,
  workspaces,
  workspaceMemberships,
} from '@journal/database/schema';
import { databasePassword, loadEnvironment } from '../../scripts/environment.js';

loadEnvironment();

function testUrl(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for real PostgreSQL integration tests`);
  const parsed = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.pathname.endsWith('_test')
  ) {
    throw new Error('Database integration tests require a dedicated _test database');
  }
  return value;
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? postgresCode(error.cause) : undefined;
}

async function expectPostgresFailure(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error('The database unexpectedly accepted a forbidden operation');
  } catch (error) {
    expect(postgresCode(error)).toBe(code);
  }
}

// These generated databases are on the isolated integration PostgreSQL instance.
// The operator test credential needs CREATEDB; no shared/development database is reset.
async function withIsolatedMigrationDatabase(
  callback: (database: Database, connectionString: string) => Promise<void>,
): Promise<void> {
  const operator = createDatabase(testUrl('TEST_DATABASE_URL'), { max: 1 });
  const name = `journal_migration_${randomUUID().replaceAll('-', '')}_test`;
  const url = new URL(testUrl('TEST_DATABASE_URL'));
  url.pathname = `/${name}`;
  let database: Database | undefined;
  let created = false;
  try {
    // Identifiers consist only of the fixed prefix and generated hexadecimal UUID.
    await operator.pool.query(`CREATE DATABASE "${name}"`);
    created = true;
    database = createDatabase(url.toString(), { max: 1 });
    await callback(database, url.toString());
  } finally {
    await database?.close();
    try {
      if (created) await operator.pool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await operator.close();
    }
  }
}

async function applyOriginalPlatformMigration(database: Database): Promise<void> {
  const original = readMigrationFiles({ migrationsFolder })[0];
  if (!original) throw new Error('Original reviewed platform migration is missing');
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    for (const statement of original.sql) await client.query(statement);
    await client.query('CREATE SCHEMA migrations');
    await client.query(
      'CREATE TABLE migrations.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint NOT NULL)',
    );
    await client.query(
      'INSERT INTO migrations.__drizzle_migrations(hash, created_at) VALUES ($1, $2)',
      [original.hash, original.folderMillis],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('PostgreSQL platform foundation with actual runtime roles', () => {
  const ownerA = `database-test-${randomUUID()}`;
  const ownerB = `database-test-${randomUUID()}`;
  const editor = `database-test-${randomUUID()}`;
  const viewer = `database-test-${randomUUID()}`;
  const fixtureUsers = [ownerA, ownerB, editor, viewer];
  let admin: Database;
  let application: Database;
  let authentication: Database;
  let jobs: Database;
  let workspaceA: WorkspaceSummary;
  let workspaceB: WorkspaceSummary;
  let demo: WorkspaceSummary;

  beforeAll(async () => {
    admin = createDatabase(testUrl('TEST_DATABASE_URL'));
    // max=1 makes pooled-context checks exercise the same reused connection.
    application = createDatabase(testUrl('TEST_APP_DATABASE_URL'), { max: 1 });
    authentication = createDatabase(testUrl('TEST_AUTH_DATABASE_URL'));
    jobs = createDatabase(testUrl('TEST_JOB_DATABASE_URL'));
    await verifyDatabaseSchema(admin);
    await admin.db.insert(user).values(
      fixtureUsers.map((id) => ({
        id,
        name: 'Database integration fixture',
        email: `${id}@example.invalid`,
        emailVerified: false,
      })),
    );
    workspaceA = await createPersonalWorkspace(application, ownerA, { name: 'Isolated fixture A' });
    workspaceB = await createPersonalWorkspace(application, ownerB, { name: 'Isolated fixture B' });
    demo = await createPersonalWorkspace(application, ownerA, {
      name: 'Isolated demo fixture',
      isDemo: true,
    });
    await admin.db.insert(workspaceMemberships).values([
      { workspaceId: workspaceA.id, userId: editor, role: 'editor' },
      { workspaceId: workspaceA.id, userId: viewer, role: 'viewer' },
    ]);
  });

  afterAll(async () => {
    try {
      if (admin) {
        // Exact generated fixture identities only; no table truncation/schema drop.
        await admin.pool.query('DELETE FROM app.workspaces WHERE created_by = ANY($1::text[])', [
          fixtureUsers,
        ]);
        await admin.pool.query('DELETE FROM auth."user" WHERE id = ANY($1::text[])', [
          fixtureUsers,
        ]);
        await admin.pool.query(
          'DELETE FROM auth.security_events WHERE subject_user_id = ANY($1::text[])',
          [fixtureUsers],
        );
      }
    } finally {
      await Promise.all(
        [admin, application, authentication, jobs]
          .filter(Boolean)
          .map((database) => database.close()),
      );
    }
  });

  it('uses non-owner, non-superuser, non-bypass runtime roles with separate privileges', async () => {
    for (const [database, expectedRole] of [
      [application, 'journal_app'],
      [authentication, 'journal_auth'],
      [jobs, 'journal_jobs'],
    ] as const) {
      const result = await database.pool.query<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        privileged_member: boolean;
      }>(
        "SELECT rolname, rolsuper, rolbypassrls, pg_has_role(current_user, 'journal_migrator', 'MEMBER') AS privileged_member FROM pg_roles WHERE rolname = current_user",
      );
      expect(result.rows[0]).toEqual({
        rolname: expectedRole,
        rolsuper: false,
        rolbypassrls: false,
        privileged_member: false,
      });
    }
    await expectPostgresFailure(application.pool.query('SELECT token FROM auth.session'), '42501');
    await expectPostgresFailure(authentication.pool.query('SELECT * FROM app.workspaces'), '42501');
    await expectPostgresFailure(jobs.pool.query('SELECT * FROM auth.account'), '42501');
    await expectPostgresFailure(jobs.pool.query('SELECT * FROM app.workspaces'), '42501');
    await expectPostgresFailure(application.pool.query('SET ROLE journal_migrator'), '42501');
    await expectPostgresFailure(
      application.pool.query('CREATE TABLE app.forbidden_table(id integer)'),
      '42501',
    );
    const authRead = await authentication.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM auth."user"',
    );
    expect(Number(authRead.rows[0]?.count)).toBeGreaterThanOrEqual(4);
  });

  it('denies tenant data when actor/workspace context is absent', async () => {
    expect(await application.db.select().from(workspaces)).toEqual([]);
    expect(await application.db.select().from(workspaceMemberships)).toEqual([]);
    expect(await application.db.select().from(userPreferences)).toEqual([]);
    expect(await application.db.select().from(auditEvents)).toEqual([]);
    await expectPostgresFailure(
      application.pool.query('SELECT * FROM app.create_personal_workspace($1, $2::uuid, false)', [
        'Forbidden',
        randomUUID(),
      ]),
      '42501',
    );
  });

  it('protects queue migration metadata while allowing only the required runtime cadence write', async () => {
    for (let repeat = 0; repeat < 2; repeat += 1)
      await provisionRuntimeRoles(testUrl('TEST_DATABASE_URL'), {
        appPassword: databasePassword(testUrl('TEST_APP_DATABASE_URL')),
        authPassword: databasePassword(testUrl('TEST_AUTH_DATABASE_URL')),
        jobsPassword: databasePassword(testUrl('TEST_JOB_DATABASE_URL')),
      });
    for (const statement of [
      'UPDATE queue.version SET version = version',
      'UPDATE queue.version SET bam_on = bam_on',
      'UPDATE queue.version SET cron_on = cron_on',
      'DELETE FROM queue.version WHERE false',
      'INSERT INTO queue.version(version) SELECT version FROM queue.version WHERE false',
      'UPDATE queue.bam SET status = status WHERE false',
      'DELETE FROM queue.bam WHERE false',
      "INSERT INTO queue.bam(name, version, table_name, command) SELECT 'fixture', 1, 'job', 'SELECT 1' WHERE false",
      "SELECT queue.create_queue('forbidden-runtime-queue', '{}'::jsonb)",
      "SELECT queue.delete_queue('forbidden-runtime-queue')",
      "SELECT queue.job_table_run('SELECT 1', NULL, NULL)",
      "SELECT queue.job_table_run_async('fixture', 1, 'SELECT 1', NULL, NULL)",
    ]) {
      await expectPostgresFailure(jobs.pool.query(statement), '42501');
    }
    const before = await jobs.pool.query('SELECT version FROM queue.version');
    await jobs.pool.query('UPDATE queue.version SET flow_on = flow_on');
    expect((await jobs.pool.query('SELECT version FROM queue.version')).rows).toEqual(before.rows);
    expect(
      (await jobs.pool.query('SELECT queue.job_now() AS clock')).rows[0]?.clock,
    ).toBeInstanceOf(Date);
  });

  it('bootstraps only the verified actor memberships and lists real/demo isolation', async () => {
    const memberships = await withActorTransaction(application, ownerA, (transaction) =>
      transaction.select().from(workspaceMemberships),
    );
    expect(memberships).toHaveLength(2);
    expect(memberships.every((membership) => membership.userId === ownerA)).toBe(true);
    expect(
      await withActorTransaction(application, ownerA, (transaction) =>
        transaction.select().from(workspaces),
      ),
    ).toEqual([]);
    const own = await listOwnWorkspaces(application, ownerA);
    expect(own.map((workspace) => workspace.id).sort()).toEqual([workspaceA.id, demo.id].sort());
    expect(own.find((workspace) => workspace.id === demo.id)?.isDemo).toBe(true);
    expect((await listOwnWorkspaces(application, ownerB)).map((workspace) => workspace.id)).toEqual(
      [workspaceB.id],
    );
  });

  it('enforces selected workspace plus live membership across direct IDs and unscoped lists', async () => {
    const allowed = await withTenantTransaction(
      application,
      { actorId: ownerA, workspaceId: workspaceA.id },
      (transaction) => transaction.select().from(workspaces),
    );
    expect(allowed.map((workspace) => workspace.id)).toEqual([workspaceA.id]);
    const directForeign = await withTenantTransaction(
      application,
      { actorId: ownerA, workspaceId: workspaceA.id },
      (transaction) =>
        transaction.select().from(workspaces).where(eq(workspaces.id, workspaceB.id)),
    );
    expect(directForeign).toEqual([]);
    expect(
      await withTenantTransaction(
        application,
        { actorId: ownerA, workspaceId: workspaceB.id },
        (transaction) => transaction.select().from(workspaces),
      ),
    ).toEqual([]);
    expect(
      await withTenantTransaction(
        application,
        { actorId: ownerB, workspaceId: workspaceA.id },
        (transaction) => transaction.select().from(workspaces),
      ),
    ).toEqual([]);
    await expectPostgresFailure(
      withTenantTransaction(
        application,
        { actorId: ownerA, workspaceId: workspaceA.id },
        (transaction) =>
          transaction
            .insert(userPreferences)
            .values({ workspaceId: workspaceB.id, userId: ownerA }),
      ),
      '42501',
    );
  });

  it('cannot create an owner membership or workspace through direct runtime writes', async () => {
    await expectPostgresFailure(
      withTenantTransaction(
        application,
        { actorId: ownerA, workspaceId: workspaceA.id },
        (transaction) =>
          transaction
            .insert(workspaceMemberships)
            .values({ workspaceId: workspaceB.id, userId: ownerA, role: 'owner' }),
      ),
      '42501',
    );
    await expectPostgresFailure(
      application.db
        .insert(workspaces)
        .values({ name: 'Forbidden direct workspace', createdBy: ownerA }),
      '42501',
    );
  });

  it('permits owner settings but denies viewer/editor settings changes and allows self preferences', async () => {
    for (const actorId of [viewer, editor]) {
      const changed = await withTenantTransaction(
        application,
        { actorId, workspaceId: workspaceA.id },
        (transaction) =>
          transaction
            .update(workspaces)
            .set({ name: 'Forbidden rename' })
            .where(eq(workspaces.id, workspaceA.id))
            .returning(),
      );
      expect(changed).toEqual([]);
    }
    const changed = await withTenantTransaction(
      application,
      { actorId: ownerA, workspaceId: workspaceA.id },
      (transaction) =>
        transaction
          .update(workspaces)
          .set({ name: 'Owner-reviewed fixture name' })
          .where(eq(workspaces.id, workspaceA.id))
          .returning(),
    );
    expect(changed[0]?.name).toBe('Owner-reviewed fixture name');
    await withTenantTransaction(
      application,
      { actorId: viewer, workspaceId: workspaceA.id },
      (transaction) =>
        transaction
          .insert(userPreferences)
          .values({ workspaceId: workspaceA.id, userId: viewer, theme: 'dark' }),
    );
    const preferences = await withTenantTransaction(
      application,
      { actorId: viewer, workspaceId: workspaceA.id },
      (transaction) => transaction.select().from(userPreferences),
    );
    expect(preferences).toHaveLength(1);
    expect(preferences[0]?.theme).toBe('dark');
    expect(
      await withTenantTransaction(
        application,
        { actorId: editor, workspaceId: workspaceA.id },
        (transaction) => transaction.select().from(userPreferences),
      ),
    ).toEqual([]);
  });

  it('uses composite foreign keys to reject cross-workspace membership references even with privileged fixture writes', async () => {
    await expectPostgresFailure(
      admin.db.insert(userPreferences).values({ workspaceId: workspaceA.id, userId: ownerB }),
      '23503',
    );
  });

  it('enforces UUIDv4 tenant identities at SQL boundaries, including privileged fixture writes', async () => {
    const invalidId = '00000000-0000-1000-8000-000000000000';
    await expectPostgresFailure(
      withActorTransaction(application, ownerA, (transaction) =>
        transaction.execute(
          sql`SELECT * FROM app.create_personal_workspace('Invalid UUID fixture', ${invalidId}::uuid, true)`,
        ),
      ),
      '23514',
    );
    await expectPostgresFailure(
      admin.db.insert(userPreferences).values({
        workspaceId: workspaceA.id,
        id: invalidId,
        userId: ownerA,
      }),
      '23514',
    );
    await expectPostgresFailure(
      admin.db.insert(auditEvents).values({
        workspaceId: workspaceA.id,
        id: invalidId,
        actorId: ownerA,
        action: 'platform.invalid-identity',
      }),
      '23514',
    );
    expect(await admin.db.select().from(workspaces).where(eq(workspaces.id, invalidId))).toEqual(
      [],
    );
  });

  it('keeps audit records actor-scoped and append-only under runtime privileges', async () => {
    const id = randomUUID();
    await withTenantTransaction(
      application,
      { actorId: ownerA, workspaceId: workspaceA.id },
      (transaction) =>
        transaction
          .insert(auditEvents)
          .values({ workspaceId: workspaceA.id, id, actorId: ownerA, action: 'platform.test' }),
    );
    await expectPostgresFailure(
      withTenantTransaction(
        application,
        { actorId: ownerA, workspaceId: workspaceA.id },
        (transaction) =>
          transaction
            .insert(auditEvents)
            .values({ workspaceId: workspaceA.id, actorId: ownerB, action: 'platform.test' }),
      ),
      '42501',
    );
    await expectPostgresFailure(
      withTenantTransaction(
        application,
        { actorId: ownerA, workspaceId: workspaceA.id },
        (transaction) =>
          transaction
            .update(auditEvents)
            .set({ action: 'forbidden' })
            .where(eq(auditEvents.id, id)),
      ),
      '42501',
    );
    await expectPostgresFailure(
      withTenantTransaction(
        application,
        { actorId: ownerA, workspaceId: workspaceA.id },
        (transaction) => transaction.delete(auditEvents).where(eq(auditEvents.id, id)),
      ),
      '42501',
    );
  });

  it('keeps global authentication audit append-only and unavailable to tenant/queue roles', async () => {
    const id = randomUUID();
    await authentication.db.insert(authSecurityEvents).values({
      id,
      actorId: ownerA,
      subjectUserId: ownerA,
      action: 'auth.fixture',
    });
    await expectPostgresFailure(
      authentication.db
        .update(authSecurityEvents)
        .set({ action: 'forbidden' })
        .where(eq(authSecurityEvents.id, id)),
      '42501',
    );
    await expectPostgresFailure(
      authentication.db.delete(authSecurityEvents).where(eq(authSecurityEvents.id, id)),
      '42501',
    );
    for (const database of [application, jobs]) {
      await expectPostgresFailure(
        database.pool.query('SELECT * FROM auth.security_events'),
        '42501',
      );
    }
    const stored = await authentication.db
      .select()
      .from(authSecurityEvents)
      .where(eq(authSecurityEvents.id, id));
    expect(stored[0]).toMatchObject({
      actorId: ownerA,
      subjectUserId: ownerA,
      action: 'auth.fixture',
    });
  });

  it('clears context on pooled commit/rollback and rolls back dependent writes', async () => {
    const id = randomUUID();
    await expect(
      withTenantTransaction(
        application,
        { actorId: ownerA, workspaceId: workspaceA.id },
        async (transaction) => {
          await transaction.insert(auditEvents).values({
            workspaceId: workspaceA.id,
            id,
            actorId: ownerA,
            action: 'rollback.fixture',
          });
          throw new Error('intentional fixture rollback');
        },
      ),
    ).rejects.toThrow('intentional fixture rollback');
    expect(await application.db.select().from(workspaces)).toEqual([]);
    const result = await application.pool.query<{ actor: string | null; workspace: string | null }>(
      "SELECT nullif(current_setting('app.user_id', true), '') AS actor, nullif(current_setting('app.workspace_id', true), '') AS workspace",
    );
    expect(result.rows[0]).toEqual({ actor: null, workspace: null });
    const rolledBack = await withTenantTransaction(
      application,
      { actorId: ownerA, workspaceId: workspaceA.id },
      (transaction) => transaction.select().from(auditEvents).where(eq(auditEvents.id, id)),
    );
    expect(rolledBack).toEqual([]);
    await withTenantTransaction(
      application,
      { actorId: ownerB, workspaceId: workspaceB.id },
      (transaction) => transaction.execute(sql`SELECT 1`),
    );
    expect(await application.db.select().from(workspaces)).toEqual([]);
  });

  it('revokes read access immediately when membership is removed', async () => {
    await admin.db
      .delete(workspaceMemberships)
      .where(
        sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${viewer}`,
      );
    try {
      expect(
        await withTenantTransaction(
          application,
          { actorId: viewer, workspaceId: workspaceA.id },
          (transaction) => transaction.select().from(workspaces),
        ),
      ).toEqual([]);
      expect(await listOwnWorkspaces(application, viewer)).toEqual([]);
    } finally {
      await admin.db
        .insert(workspaceMemberships)
        .values({ workspaceId: workspaceA.id, userId: viewer, role: 'viewer' });
    }
  });

  it('restores tenant context after a nested savepoint rollback', async () => {
    await withTenantTransaction(
      application,
      { actorId: ownerA, workspaceId: workspaceA.id },
      async (transaction) => {
        await expect(
          transaction.transaction(async (nested) => {
            await nested.execute(
              sql`SELECT set_config('app.workspace_id', ${workspaceB.id}, true)`,
            );
            expect(await nested.select().from(workspaces)).toEqual([]);
            throw new Error('intentional savepoint rollback');
          }),
        ).rejects.toThrow('intentional savepoint rollback');
        const visible = await transaction.select().from(workspaces);
        expect(visible.map((workspace) => workspace.id)).toEqual([workspaceA.id]);
      },
    );
  });

  it('preserves an owner at transaction completion while allowing atomic ownership replacement', async () => {
    await expectPostgresFailure(
      admin.db.transaction(async (transaction) => {
        await transaction
          .update(workspaceMemberships)
          .set({ role: 'viewer' })
          .where(
            sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${ownerA}`,
          );
      }),
      '23514',
    );
    const membership = await admin.db
      .select()
      .from(workspaceMemberships)
      .where(
        sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${ownerA}`,
      );
    expect(membership[0]?.role).toBe('owner');
    await admin.db.transaction(async (transaction) => {
      await transaction
        .update(workspaceMemberships)
        .set({ role: 'editor' })
        .where(
          sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${ownerA}`,
        );
      await transaction
        .update(workspaceMemberships)
        .set({ role: 'owner' })
        .where(
          sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${editor}`,
        );
    });
    await admin.db.transaction(async (transaction) => {
      await transaction
        .update(workspaceMemberships)
        .set({ role: 'owner' })
        .where(
          sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${ownerA}`,
        );
      await transaction
        .update(workspaceMemberships)
        .set({ role: 'editor' })
        .where(
          sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${editor}`,
        );
    });
  });

  it('creates no partial workspace when a duplicate real workspace is rejected', async () => {
    const id = randomUUID();
    await expectPostgresFailure(
      createPersonalWorkspace(application, ownerA, { name: 'Rejected duplicate', id }),
      '23505',
    );
    const result = await admin.db.select().from(workspaces).where(eq(workspaces.id, id));
    expect(result).toEqual([]);
    expect(
      (await listOwnWorkspaces(application, ownerA)).filter((workspace) => !workspace.isDemo),
    ).toHaveLength(1);
  });

  it('retries and concurrently bootstraps creator-owned real/demo workspaces without reusing other owners records', async () => {
    const actorId = `bootstrap-test-${randomUUID()}`;
    const concurrent = createDatabase(testUrl('TEST_APP_DATABASE_URL'), { max: 4 });
    await admin.db.insert(user).values({
      id: actorId,
      name: 'Bootstrap retry fixture',
      email: `${actorId}@example.invalid`,
    });
    // An owner role in another creator's workspace is not a personal bootstrap record.
    await admin.db.insert(workspaceMemberships).values({
      workspaceId: workspaceA.id,
      userId: actorId,
      role: 'owner',
    });
    try {
      const real = await Promise.all(
        Array.from({ length: 6 }, () =>
          ensurePersonalWorkspace(concurrent, actorId, { name: 'Bootstrap personal fixture' }),
        ),
      );
      expect(new Set(real.map((workspace) => workspace.id)).size).toBe(1);
      expect(real[0]?.id).not.toBe(workspaceA.id);
      const personalId = real[0]!.id;
      await withTenantTransaction(concurrent, { actorId, workspaceId: personalId }, (transaction) =>
        transaction.update(workspaces).set({ name: 'Renamed personal fixture' }),
      );
      expect(
        (await ensurePersonalWorkspace(concurrent, actorId, { name: 'Bootstrap personal fixture' }))
          .id,
      ).toBe(personalId);
      const demos = await Promise.all(
        Array.from({ length: 6 }, () =>
          ensurePersonalWorkspace(concurrent, actorId, {
            name: 'Bootstrap demo fixture',
            isDemo: true,
          }),
        ),
      );
      expect(new Set(demos.map((workspace) => workspace.id)).size).toBe(1);
      const anotherDemo = await ensurePersonalWorkspace(concurrent, actorId, {
        name: 'Another permitted demo fixture',
        isDemo: true,
      });
      expect(anotherDemo.id).not.toBe(demos[0]?.id);
      const bootstrapAudit = await admin.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM app.audit_events WHERE actor_id = $1 AND action = 'workspace.created'",
        [actorId],
      );
      expect(bootstrapAudit.rows[0]?.count).toBe('3');
    } finally {
      await concurrent.close();
      await admin.pool.query('DELETE FROM app.workspaces WHERE created_by = $1', [actorId]);
      await admin.pool.query('DELETE FROM app.workspace_memberships WHERE user_id = $1', [actorId]);
      await admin.pool.query('DELETE FROM auth."user" WHERE id = $1', [actorId]);
    }
  });

  it('cannot remove both owners through concurrent transactions', async () => {
    await admin.db
      .update(workspaceMemberships)
      .set({ role: 'owner' })
      .where(
        sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${editor}`,
      );
    try {
      const outcomes = await Promise.allSettled(
        [ownerA, editor].map((actorId) =>
          admin.db.transaction(async (transaction) => {
            await transaction
              .update(workspaceMemberships)
              .set({ role: 'editor' })
              .where(
                sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${actorId}`,
              );
          }),
        ),
      );
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      expect(rejected?.status === 'rejected' ? postgresCode(rejected.reason) : undefined).toBe(
        '23514',
      );
      const owners = await admin.db
        .select()
        .from(workspaceMemberships)
        .where(
          sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.role} = 'owner'`,
        );
      expect(owners).toHaveLength(1);
    } finally {
      await admin.db.transaction(async (transaction) => {
        await transaction
          .update(workspaceMemberships)
          .set({ role: 'owner' })
          .where(
            sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${ownerA}`,
          );
        await transaction
          .update(workspaceMemberships)
          .set({ role: 'editor' })
          .where(
            sql`${workspaceMemberships.workspaceId} = ${workspaceA.id} AND ${workspaceMemberships.userId} = ${editor}`,
          );
      });
    }
  });

  it('reapplies reviewed migrations without changing migration history or tenant records', async () => {
    const before = await admin.pool.query(
      'SELECT hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
    );
    await migrateDatabase(testUrl('TEST_DATABASE_URL'));
    const after = await admin.pool.query(
      'SELECT hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
    );
    expect(after.rows).toEqual(before.rows);
    await verifyDatabaseSchema(application);
    expect(
      (await listOwnWorkspaces(application, ownerA)).map((workspace) => workspace.id).sort(),
    ).toEqual([workspaceA.id, demo.id].sort());
  });

  it('serializes concurrent migration runners without duplicate history entries', async () => {
    const before = await admin.pool.query(
      'SELECT hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
    );
    await Promise.all([
      migrateDatabase(testUrl('TEST_DATABASE_URL')),
      migrateDatabase(testUrl('TEST_DATABASE_URL')),
    ]);
    const after = await admin.pool.query(
      'SELECT hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
    );
    expect(after.rows).toEqual(before.rows);
  });
});

describe('reviewed platform migration creation and upgrades', () => {
  it('creates an empty database and applies every reviewed migration exactly once', async () => {
    await withIsolatedMigrationDatabase(async (database, url) => {
      await migrateDatabase(url);
      await migrateDatabase(url);
      await verifyDatabaseSchema(database);
      const expected = readMigrationFiles({ migrationsFolder }).map((migration) => ({
        hash: migration.hash,
        created_at: String(migration.folderMillis),
      }));
      const applied = await database.pool.query(
        'SELECT hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
      );
      expect(applied.rows).toEqual(expected);
      expect(await database.db.select().from(workspaces)).toEqual([]);
    });
  });

  it('upgrades the original platform release without changing historical rows or permissions', async () => {
    await withIsolatedMigrationDatabase(async (database, url) => {
      await applyOriginalPlatformMigration(database);
      const actor = `migration-upgrade-${randomUUID()}`;
      await database.db.insert(user).values({
        id: actor,
        name: 'Migration fixture',
        email: `${actor}@example.invalid`,
      });
      const workspace = await createPersonalWorkspace(database, actor, {
        name: 'Preserved migration fixture',
      });
      await database.db.insert(userPreferences).values({
        workspaceId: workspace.id,
        userId: actor,
        theme: 'dark',
      });
      await database.db.insert(session).values({
        id: `migration-session-${randomUUID()}`,
        token: `fixture-token-${randomUUID()}`,
        userId: actor,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      });
      const records = async () => ({
        users: await database.db.select().from(user),
        sessions: await database.db.select().from(session),
        workspaces: (
          await database.pool.query(
            'SELECT id, name, created_by, is_demo, timezone, reporting_currency, created_at, updated_at FROM app.workspaces ORDER BY id',
          )
        ).rows,
        memberships: await database.db.select().from(workspaceMemberships),
        preferences: await database.db.select().from(userPreferences),
        audit: await database.db.select().from(auditEvents),
      });
      const before = await records();
      await expect(verifyDatabaseSchema(database)).rejects.toThrow('incompatible');
      await migrateDatabase(url);
      await verifyDatabaseSchema(database);
      expect(await records()).toEqual(before);
      const version = await database.pool.query('SELECT version FROM app.schema_metadata');
      expect(version.rows).toEqual([{ version: DATABASE_SCHEMA_VERSION }]);
      const rls = await database.pool.query(
        "SELECT relname, relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid IN ('app.workspaces'::regclass, 'app.workspace_memberships'::regclass, 'app.user_preferences'::regclass, 'app.audit_events'::regclass) ORDER BY relname",
      );
      expect(rls.rows).toHaveLength(4);
      for (const row of rls.rows) {
        expect(row).toMatchObject({
          relrowsecurity: true,
          relforcerowsecurity: true,
          owner: 'journal_migrator',
        });
      }
      await migrateDatabase(url);
      expect(await records()).toEqual(before);
    });
  });

  it('rejects changed, missing, duplicate, and unknown applied migration history before mutation', async () => {
    await withIsolatedMigrationDatabase(async (database, url) => {
      await migrateDatabase(url);
      const original = await database.pool.query<{ id: number; hash: string; created_at: string }>(
        'SELECT id, hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
      );
      const first = original.rows[0]!;
      const restore = async () => {
        await database.pool.query('DELETE FROM migrations.__drizzle_migrations');
        for (const row of original.rows)
          await database.pool.query(
            'INSERT INTO migrations.__drizzle_migrations(id, hash, created_at) VALUES ($1, $2, $3)',
            [row.id, row.hash, row.created_at],
          );
      };
      const mutations = [
        () =>
          database.pool.query(
            "UPDATE migrations.__drizzle_migrations SET hash = 'changed-fixture-hash' WHERE id = $1",
            [first.id],
          ),
        () =>
          database.pool.query('DELETE FROM migrations.__drizzle_migrations WHERE id = $1', [
            first.id,
          ]),
        () =>
          database.pool.query(
            'INSERT INTO migrations.__drizzle_migrations(hash, created_at) VALUES ($1, $2)',
            [first.hash, first.created_at],
          ),
        () =>
          database.pool.query(
            "INSERT INTO migrations.__drizzle_migrations(hash, created_at) VALUES ('unknown-fixture-hash', 9999999999999)",
          ),
      ];
      for (const mutate of mutations) {
        await mutate();
        const tampered = await database.pool.query(
          'SELECT id, hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at, id',
        );
        await expect(migrateDatabase(url)).rejects.toThrow('history differs');
        expect(
          (
            await database.pool.query(
              'SELECT id, hash, created_at FROM migrations.__drizzle_migrations ORDER BY created_at, id',
            )
          ).rows,
        ).toEqual(tampered.rows);
        await verifyDatabaseSchema(database);
        await restore();
      }
      await migrateDatabase(url);
    });
  });

  it('rolls back a failed upgrade atomically without rewriting invalid historical identifiers', async () => {
    await withIsolatedMigrationDatabase(async (database, url) => {
      await applyOriginalPlatformMigration(database);
      const actor = `migration-invalid-${randomUUID()}`;
      await database.db.insert(user).values({
        id: actor,
        name: 'Invalid historical identity fixture',
        email: `${actor}@example.invalid`,
      });
      const invalidId = '00000000-0000-1000-8000-000000000000';
      await withActorTransaction(database, actor, (transaction) =>
        transaction.execute(
          sql`SELECT * FROM app.create_personal_workspace('Historical UUID fixture', ${invalidId}::uuid, false)`,
        ),
      );
      await expectPostgresFailure(migrateDatabase(url), '23514');
      const version = await database.pool.query('SELECT version FROM app.schema_metadata');
      expect(version.rows).toEqual([{ version: 1 }]);
      const history = await database.pool.query('SELECT hash FROM migrations.__drizzle_migrations');
      expect(history.rows).toHaveLength(1);
      const preserved = await database.pool.query<{ id: string }>('SELECT id FROM app.workspaces');
      expect(preserved.rows.map((workspace) => workspace.id)).toEqual([invalidId]);
      const constraint = await database.pool.query(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'app.workspaces'::regclass AND conname = 'workspace_id_uuid_v4'",
      );
      expect(constraint.rows).toEqual([]);
    });
  });
});
