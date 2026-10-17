import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createDatabase } from '@journal/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment, repositoryRoot, required } from '../../scripts/environment.js';
import { runtimeEnvironment } from '../../scripts/processes.js';

const children: ChildProcess[] = [];
let operator: ReturnType<typeof createDatabase>;

async function waitFor(check: () => boolean | Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing owned probe port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function startWorker(port: number) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', resolve(repositoryRoot, 'apps/worker/src/index.ts')],
    {
      cwd: repositoryRoot,
      env: runtimeEnvironment(true, {
        ...process.env,
        NODE_ENV: 'test',
        JOB_DATABASE_URL: required('TEST_JOB_DATABASE_URL'),
        WORKER_HEALTH_HOST: '127.0.0.1',
        WORKER_HEALTH_PORT: String(port),
        LOG_LEVEL: 'info',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.on('error', () => undefined);
  return {
    child,
    hasEvent: (event: string) => output.includes(`"event":"${event}"`),
    containsConnectionString: () =>
      output.includes('postgresql://') || output.includes('postgres://'),
  };
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await waitFor(
    () => child.exitCode !== null || child.signalCode !== null,
    'Owned worker did not exit',
  );
}

beforeAll(() => {
  loadEnvironment();
  operator = createDatabase(required('TEST_DATABASE_URL'), { max: 2 });
});
afterAll(async () => {
  await Promise.all(children.map(stop));
  await operator.close();
});

describe('worker process lifecycle', () => {
  it('serves private health and exits cleanly on SIGTERM after readiness', async () => {
    const port = await unusedPort();
    const worker = startWorker(port);
    const origin = `http://127.0.0.1:${port}`;
    try {
      await waitFor(() => worker.hasEvent('worker.ready'), 'Owned worker did not become ready');
      expect((await fetch(`${origin}/health/live`)).status).toBe(200);
      const ready = await fetch(`${origin}/health/ready`);
      expect(ready.status).toBe(200);
      expect(ready.headers.get('cache-control')).toBe('no-store');
      expect(await ready.json()).toEqual({ status: 'ok' });
      expect((await fetch(`${origin}/health/ready`, { method: 'POST' })).status).toBe(405);
      expect((await fetch(`${origin}/not-found`)).status).toBe(404);
      worker.child.kill('SIGTERM');
      await waitFor(
        () => worker.child.exitCode !== null || worker.child.signalCode !== null,
        'Ready worker did not drain',
      );
      expect(worker.child.exitCode).toBe(0);
      expect(worker.child.signalCode).toBeNull();
      expect(worker.hasEvent('worker.stopping')).toBe(true);
      expect(worker.hasEvent('worker.stopped')).toBe(true);
      expect(worker.hasEvent('worker.startup.failed')).toBe(false);
      expect(worker.containsConnectionString()).toBe(false);
      await expect(
        fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(1_000) }),
      ).rejects.toThrow();
    } finally {
      await stop(worker.child);
    }
  });

  it('handles SIGTERM during a blocked schema check without opening readiness or retaining a pool', async () => {
    const lock = await operator.pool.connect();
    const before = await operator.pool.query<{ pid: number }>(
      "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name='journal-worker'",
    );
    const previousPids = before.rows.map((row) => row.pid);
    let worker: ReturnType<typeof startWorker> | undefined;
    try {
      await lock.query('BEGIN');
      await lock.query('LOCK TABLE queue.version IN ACCESS EXCLUSIVE MODE');
      worker = startWorker(await unusedPort());
      await waitFor(async () => {
        const waiting = await operator.pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE datname=current_database() AND application_name='journal-worker'
             AND NOT (pid=ANY($1::int[])) AND wait_event_type='Lock'`,
          [previousPids],
        );
        return waiting.rows[0]?.count === 1;
      }, 'Owned worker did not reach the blocked schema check');
      worker.child.kill('SIGTERM');
      await waitFor(
        () => worker!.hasEvent('worker.stopping'),
        'Starting worker did not handle SIGTERM',
      );
      await lock.query('ROLLBACK');
      await waitFor(
        () => worker!.child.exitCode !== null || worker!.child.signalCode !== null,
        'Starting worker did not drain',
      );
      expect(worker.child.exitCode).toBe(0);
      expect(worker.child.signalCode).toBeNull();
      expect(worker.hasEvent('worker.ready')).toBe(false);
      expect(worker.hasEvent('worker.stopped')).toBe(true);
      expect(worker.hasEvent('worker.startup.failed')).toBe(false);
      expect(worker.containsConnectionString()).toBe(false);
      await waitFor(async () => {
        const remaining = await operator.pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE datname=current_database() AND application_name='journal-worker'
             AND NOT (pid=ANY($1::int[]))`,
          [previousPids],
        );
        return remaining.rows[0]?.count === 0;
      }, 'Starting worker retained a database connection');
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
      if (worker) await stop(worker.child);
    }
  });
});
