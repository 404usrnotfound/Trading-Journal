import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createPersonalWorkspace,
  eq,
  listOwnWorkspaces,
  sql,
  withActorTransaction,
  withTenantTransaction,
  type Database,
  type WorkspaceSummary,
} from '@journal/database';
import { migrateDatabase, verifyDatabaseSchema } from '@journal/database/migrate';
import {
  auditEvents,
  user,
  userPreferences,
  workspaces,
  workspaceMemberships,
} from '@journal/database/schema';
import { loadEnvironment } from '../../scripts/environment.js';

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
});
