import { randomUUID } from 'node:crypto';

import { createDatabase } from '@journal/database';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createRuntimeQueue,
  HEALTH_PROBE_QUEUE,
  healthProbePayloadSchema,
  verifyQueueRoundTrip,
} from '../../apps/worker/src/queue';
import { loadEnvironment, required } from '../../scripts/environment';

const connections: ReturnType<typeof createRuntimeQueue>[] = [];
let unexpectedQueueErrors = 0;

function connect() {
  const boss = createRuntimeQueue(required('TEST_JOB_DATABASE_URL'));
  boss.on('error', () => {
    unexpectedQueueErrors += 1;
  });
  connections.push(boss);
  return boss;
}

beforeAll(() => loadEnvironment());
beforeEach(() => {
  unexpectedQueueErrors = 0;
});

afterEach(async () => {
  await Promise.all(connections.splice(0).map((boss) => boss.stop()));
  expect(unexpectedQueueErrors).toBe(0);
});

describe('durable worker infrastructure', () => {
  it('runs with queue-only credentials without migration or tenant privileges', async () => {
    const boss = connect();
    await boss.start();
    const permissions = await boss.getDb().executeSql(`
      SELECT
        current_user AS role_name,
        rolsuper AS superuser,
        rolbypassrls AS bypass_rls,
        has_schema_privilege(current_user, 'queue', 'CREATE') AS queue_create,
        has_schema_privilege(current_user, 'auth', 'USAGE') AS auth_usage,
        has_schema_privilege(current_user, 'app', 'USAGE') AS tenant_usage
      FROM pg_roles WHERE rolname = current_user
    `);
    expect(permissions.rows[0]).toMatchObject({
      role_name: 'journal_jobs',
      superuser: false,
      bypass_rls: false,
      queue_create: false,
      auth_usage: false,
      tenant_usage: false,
    });

    const timeouts = await boss.getDb().executeSql(`
      SELECT current_setting('statement_timeout') AS statement_timeout,
             current_setting('lock_timeout') AS lock_timeout
    `);
    expect(timeouts.rows[0]).toEqual({ statement_timeout: '5s', lock_timeout: '5s' });

    await expect(
      boss.getDb().executeSql('SELECT 1 FROM auth."user" LIMIT 1'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      boss.getDb().executeSql('SELECT 1 FROM app.workspaces LIMIT 1'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      boss.getDb().executeSql('CREATE TABLE queue.forbidden_runtime_ddl (id integer)'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      boss.getDb().executeSql('UPDATE queue.version SET version = version + 1'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('persists queued work across restart and records a completed round trip', async () => {
    const producer = connect();
    await producer.start();
    const id = await producer.send(HEALTH_PROBE_QUEUE, { probeId: randomUUID() });
    expect(id).not.toBeNull();
    if (id === null) throw new Error('Infrastructure probe was not enqueued');
    await producer.stop();

    const worker = connect();
    await worker.start();
    const before = await worker.findJobs(HEALTH_PROBE_QUEUE, { id });
    expect(before[0]?.state).toBe('created');

    await worker.work(HEALTH_PROBE_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      for (const job of jobs) healthProbePayloadSchema.parse(job.data);
      return { status: 'ok' };
    });
    await verifyQueueRoundTrip(worker);
    const completed = await worker.findJobs(HEALTH_PROBE_QUEUE, { id });
    expect(completed[0]).toMatchObject({ state: 'completed', output: { status: 'ok' } });
    await worker.stop();

    const restarted = connect();
    await restarted.start();
    const persisted = await restarted.findJobs(HEALTH_PROBE_QUEUE, { id });
    expect(persisted[0]).toMatchObject({ state: 'completed', output: { status: 'ok' } });
  });

  it('refuses an incompatible queue schema instead of migrating it at runtime', async () => {
    const operatorDatabase = createDatabase(required('TEST_DATABASE_URL'), { max: 1 });
    const operator = operatorDatabase.pool;
    const inspector = connect();
    await inspector.start();
    const current = await inspector.getDb().executeSql('SELECT version FROM queue.version');
    const version: unknown = current.rows[0]?.version;
    if (typeof version !== 'number') throw new Error('Missing queue schema version');
    try {
      await operator.query('UPDATE queue.version SET version = $1', [version + 1]);
      const incompatible = connect();
      await expect(incompatible.start()).rejects.toThrow('requires migrations');
      const preserved = await inspector.getDb().executeSql('SELECT version FROM queue.version');
      expect(preserved.rows[0]?.version).toBe(version + 1);
    } finally {
      try {
        await operator.query('UPDATE queue.version SET version = $1', [version]);
      } finally {
        await operatorDatabase.close();
      }
    }
  });
});
