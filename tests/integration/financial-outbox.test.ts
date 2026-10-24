import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@journal/database';
import { migrateDatabase, provisionRuntimeRoles } from '@journal/database/migrate';
import { databasePassword, repositoryRoot, testDatabaseUrls } from '../../scripts/environment.js';
import { runtimeEnvironment } from '../../scripts/processes.js';
import { createAccountingFixture } from './accounting-fixture.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createNativeSnapshotServices } from '../../packages/server/src/accounting/native-snapshot.js';
import { createAccountingApi } from '../../packages/server/src/accounting/api.js';
import { createPortabilityServices } from '../../packages/server/src/portability/service.js';
import { createPrivateFileStore } from '../../packages/server/src/storage.js';
import { createRuntimeQueue } from '../../apps/worker/src/queue.js';
import { migrateJobs } from '../../apps/worker/src/migrate.js';
import {
  FINANCIAL_OUTBOX_QUEUE,
  processFinancialOutbox,
} from '../../apps/worker/src/financial-outbox.js';
import { decimalValue } from '@journal/domain';

describe('durable financial outbox and native projection under queue-only credentials', () => {
  const databaseName = `journal_outbox_${randomUUID().replaceAll('-', '')}_test`;
  let operator: Database;
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>> | undefined;
  let boss: ReturnType<typeof createRuntimeQueue>;
  let original: ReturnType<typeof testDatabaseUrls>;
  beforeAll(async () => {
    original = testDatabaseUrls();
    operator = createDatabase(original.TEST_DATABASE_URL, { max: 1 });
    await operator.pool.query(`CREATE DATABASE "${databaseName}"`);
    for (const [name, value] of Object.entries(original)) {
      const url = new URL(value);
      url.pathname = `/${databaseName}`;
      process.env[name] = url.toString();
    }
    const bindings = testDatabaseUrls();
    await migrateDatabase(bindings.TEST_DATABASE_URL);
    await migrateJobs(bindings.TEST_DATABASE_URL);
    await provisionRuntimeRoles(bindings.TEST_DATABASE_URL, {
      appPassword: databasePassword(bindings.TEST_APP_DATABASE_URL),
      authPassword: databasePassword(bindings.TEST_AUTH_DATABASE_URL),
      jobsPassword: databasePassword(bindings.TEST_JOB_DATABASE_URL),
    });
    boss = createRuntimeQueue(bindings.TEST_JOB_DATABASE_URL);
    boss.on('error', () => undefined);
    await boss.start();
  }, 60000);
  afterEach(async () => {
    await fixture?.cleanup();
    fixture = undefined;
  });
  afterAll(async () => {
    await boss?.stop();
    for (const [name, value] of Object.entries(original ?? {})) process.env[name] = value;
    if (operator) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const active = await operator.pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname=$1',
          [databaseName],
        );
        if (active.rows[0]?.count === '0') break;
        await delay(20);
      }
      await operator.pool.query(`DROP DATABASE "${databaseName}"`);
      await operator.close();
    }
  }, 30000);
  async function setup() {
    fixture = await createAccountingFixture();
    const context = fixture.owner.context;
    const catalog = createCatalogServices(fixture.services),
      ledger = createFinancialLedger(fixture.services);
    const currency = await catalog.createCurrency(
      context,
      {
        namespace: 'iso:4217',
        code: 'USD',
        kind: 'fiat',
        unitIdentity: 'iso:USD',
        name: 'USD',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt: '2025-01-01T00:00:00Z',
      },
      randomUUID(),
    );
    const account = await catalog.createAccount(
      context,
      {
        name: 'Outbox native account',
        environment: 'live',
        accountType: 'cash',
        baseCurrencyId: currency.id,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt: '2025-01-01T00:00:00Z',
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(context, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: currency.id,
      kind: 'settled',
    });
    const instrument = await catalog.createInstrument(
      context,
      {
        name: 'Outbox share',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `outbox:${randomUUID()}`,
        quantityUnit: 'share',
        quoteCurrencyId: currency.id,
        settlementCurrencyId: currency.id,
        multiplier: '1',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'native-linear',
        effectiveAt: '2025-01-01T00:00:00Z',
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'delivered',
          shortConvention: 'borrowed-delivery',
          carryCostPolicy: 'explicit-source-charges',
        },
      },
      randomUUID(),
    );
    const deposit = (amount: string) =>
      ledger.recordCashMovement(context, {
        commandId: randomUUID(),
        accountId: account.id,
        cashBucketId: bucket.id,
        currencyId: currency.id,
        amount,
        kind: 'deposit',
        economicAt: '2030-01-01T00:00:00Z',
        orderingKey: '1',
      });
    await deposit('100');
    await ledger.recordExecution(context, {
      commandId: randomUUID(),
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy',
      quantity: '2',
      price: '10',
      cashBucketId: bucket.id,
      economicAt: '2030-01-02T00:00:00Z',
      orderingKey: '1',
      costsComplete: true,
    });
    return {
      context,
      currency,
      account,
      bucket,
      instrument,
      deposit,
      snapshots: createNativeSnapshotServices(fixture.services),
    };
  }
  async function claim() {
    const result = await boss
      .getDb()
      .executeSql('SELECT * FROM queue.claim_financial_outbox($1)', [20]);
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      eventId: row.event_id,
      leaseToken: row.lease_token,
      sourceRevision: row.source_revision,
    }));
  }
  it('builds exact native balances/quantities, coalesces source revisions, is idempotent and exposes current/stale status', async () => {
    const f = await setup();
    const [job] = await claim();
    expect(job?.workspaceId).toBe(f.context.workspaceId);
    expect(await processFinancialOutbox(boss.getDb(), job)).toEqual({ status: 'published' });
    const current = await f.snapshots.status(fixture!.viewer.context);
    expect(current.state).toBe('current');
    expect(current.processedSourceRevision).toBe(current.latestSourceRevision);
    expect(current.snapshot?.economicScope).toBe('all-recorded-events');
    expect(decimalValue(current.snapshot!.cash[0]!.amount).eq('80')).toBe(true);
    expect(current.snapshot!.holdings[0]!.quantity).toMatchObject({
      status: 'available',
      value: '2',
    });
    expect(await processFinancialOutbox(boss.getDb(), job)).toEqual({ status: 'stale' });
    expect(await f.snapshots.status(fixture!.viewer.context)).toEqual(current);
    await f.deposit('5');
    expect((await f.snapshots.status(fixture!.viewer.context)).state).toBe('stale');
    const api = createAccountingApi(fixture!.services);
    const response = await api(
      new Request(`http://localhost:3000/api/accounting/native-snapshot`, {
        headers: { cookie: fixture!.viewer.cookie },
      }),
      f.context.workspaceId,
      ['native-snapshot'],
    );
    expect(response.status).toBe(200);
    expect((await response.json()).state).toBe('stale');
    await expect(
      api(
        new Request('http://localhost:3000/api/accounting/native-snapshot', {
          headers: { cookie: fixture!.outsider.cookie },
        }),
        f.context.workspaceId,
        ['native-snapshot'],
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      f.snapshots.refresh(
        fixture!.viewer.context,
        { reason: 'Viewer cannot enqueue repair' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(f.snapshots.status(fixture!.outsider.context)).resolves.toMatchObject({
      state: 'empty',
    });
  });
  it('rejects races both before preparation and before publication without publishing mixed generations', async () => {
    const f = await setup();
    const [first] = await claim();
    await f.deposit('5');
    expect(await processFinancialOutbox(boss.getDb(), first)).toEqual({ status: 'stale' });
    expect((await f.snapshots.status(fixture!.viewer.context)).snapshot).toBeNull();
    const [second] = await claim();
    const candidate = await boss
      .getDb()
      .executeSql('SELECT queue.prepare_native_financial_snapshot($1,$2) AS result', [
        second!.workspaceId,
        second!.leaseToken,
      ]);
    expect(candidate.rows[0]?.result.status).toBe('ready');
    await f.deposit('7');
    const stale = await boss
      .getDb()
      .executeSql('SELECT queue.publish_native_financial_snapshot($1,$2) AS result', [
        second!.workspaceId,
        second!.leaseToken,
      ]);
    expect(stale.rows[0]?.result).toBe('stale');
    expect((await f.snapshots.status(fixture!.viewer.context)).snapshot).toBeNull();
    const [third] = await claim();
    expect(await processFinancialOutbox(boss.getDb(), third)).toEqual({ status: 'published' });
    const current = await f.snapshots.status(fixture!.viewer.context);
    expect(decimalValue(current.snapshot!.cash[0]!.amount).eq('92')).toBe(true);
    const rows = await fixture!.admin.pool.query(
      'SELECT n.source_revision,e.source_revision AS event_revision FROM app.native_financial_snapshots n JOIN app.outbox_events e ON e.workspace_id=n.workspace_id AND e.id=n.event_id WHERE n.workspace_id=$1',
      [f.context.workspaceId],
    );
    expect(rows.rows[0].source_revision).toBe(rows.rows[0].event_revision);
  });
  it('uses current workspace-owner authority for system repair after the original source actor loses access', async () => {
    const f = await setup();
    await fixture!.admin.pool.query(
      "UPDATE app.workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",
      [f.context.workspaceId, fixture!.editor.person.user.id],
    );
    await fixture!.admin.pool.query(
      'DELETE FROM app.workspace_memberships WHERE workspace_id=$1 AND user_id=$2',
      [f.context.workspaceId, fixture!.owner.person.user.id],
    );
    const [job] = await claim();
    expect(await processFinancialOutbox(boss.getDb(), job)).toEqual({ status: 'published' });
    await expect(f.snapshots.status(f.context)).rejects.toMatchObject({ status: 404 });
    expect((await f.snapshots.status(fixture!.editor.context)).state).toBe('current');
    const owner = await fixture!.admin.pool.query(
      'SELECT authorized_owner_id FROM app.native_financial_snapshots WHERE workspace_id=$1',
      [f.context.workspaceId],
    );
    expect(owner.rows[0].authorized_owner_id).toBe(fixture!.editor.person.user.id);
  });
  it('enforces single leases, reclaims expired deliveries, caps retries and permits an authorized new refresh', async () => {
    const f = await setup();
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.flat()).toHaveLength(1);
    let job = claims.flat()[0]!;
    await fixture!.admin.pool.query(
      "UPDATE app.outbox_dispatch_state SET lease_until=clock_timestamp()-interval '1 second' WHERE workspace_id=$1",
      [f.context.workspaceId],
    );
    const [replacement] = await claim();
    expect(replacement!.leaseToken).not.toBe(job.leaseToken);
    expect(await processFinancialOutbox(boss.getDb(), job)).toEqual({ status: 'stale' });
    job = replacement!;
    for (let attempt = 2; attempt <= 5; attempt++) {
      await boss
        .getDb()
        .executeSql('SELECT queue.fail_financial_outbox($1,$2,$3)', [
          job.workspaceId,
          job.leaseToken,
          'processing-failed',
        ]);
      const row = await fixture!.admin.pool.query(
        'SELECT attempts,next_attempt_at>clock_timestamp() AS delayed FROM app.outbox_dispatch_state WHERE workspace_id=$1',
        [f.context.workspaceId],
      );
      expect(row.rows[0].delayed).toBe(true);
      if (attempt < 5) {
        await fixture!.admin.pool.query(
          "UPDATE app.outbox_dispatch_state SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE workspace_id=$1",
          [f.context.workspaceId],
        );
        const [nextJob] = await claim();
        expect(nextJob).toBeDefined();
        if (!nextJob) throw new Error('The scheduled retry must obtain a fresh lease.');
        job = nextJob;
      }
    }
    expect((await f.snapshots.status(fixture!.viewer.context)).jobStatus).toBe('failed');
    expect(await claim()).toEqual([]);
    const refresh = await f.snapshots.refresh(
      f.context,
      { reason: 'Retry system projection after operator recovery' },
      randomUUID(),
    );
    const [fresh] = await claim();
    expect(String(fresh!.sourceRevision)).toBe(refresh.sourceRevision);
    expect(await processFinancialOutbox(boss.getDb(), fresh)).toEqual({ status: 'published' });
  });
  it('retains queued work across restart and keeps tenant tables/privileged functions inaccessible to the wrong roles', async () => {
    const f = await setup();
    const [job] = await claim();
    const id = await boss.send(FINANCIAL_OUTBOX_QUEUE, job, { id: job!.leaseToken });
    expect(id).toBe(job!.leaseToken);
    await boss.stop();
    boss = createRuntimeQueue(process.env.TEST_JOB_DATABASE_URL!);
    boss.on('error', () => undefined);
    await boss.start();
    await boss.work(FINANCIAL_OUTBOX_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      for (const item of jobs) await processFinancialOutbox(boss.getDb(), item.data);
      return { status: 'processed' };
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await boss.findJobs(FINANCIAL_OUTBOX_QUEUE, { id: id! }))[0]?.state === 'completed')
        break;
      await delay(25);
    }
    expect((await boss.findJobs(FINANCIAL_OUTBOX_QUEUE, { id: id! }))[0]?.state).toBe('completed');
    expect((await f.snapshots.status(fixture!.viewer.context)).state).toBe('current');
    await expect(
      boss.getDb().executeSql('SELECT * FROM app.native_financial_snapshots'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(boss.getDb().executeSql('SELECT * FROM auth."user"')).rejects.toMatchObject({
      code: '42501',
    });
    const app = createDatabase(process.env.TEST_APP_DATABASE_URL!, { max: 1 });
    try {
      await expect(
        app.pool.query('SELECT * FROM queue.claim_financial_outbox(1)'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.close();
    }
  });
  it('runs the real worker process from committed outbox intent through a fresh native projection and graceful shutdown', async () => {
    const f = await setup();
    // Remove the preceding test's in-process consumer: only the launched worker
    // may dispatch/process this fixture's financial events.
    await boss.stop();
    boss = createRuntimeQueue(process.env.TEST_JOB_DATABASE_URL!);
    boss.on('error', () => undefined);
    await boss.start();
    const server = createServer();
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', accept);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Owned worker test port unavailable');
    const port = address.port;
    await new Promise<void>((accept) => server.close(() => accept()));
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', resolve(repositoryRoot, 'apps/worker/src/index.ts')],
      {
        cwd: repositoryRoot,
        env: runtimeEnvironment(true, {
          ...process.env,
          NODE_ENV: 'test',
          JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL!,
          WORKER_HEALTH_HOST: '127.0.0.1',
          WORKER_HEALTH_PORT: String(port),
          LOG_LEVEL: 'silent',
        }),
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((accept) =>
      child.once('exit', (code, signal) => accept({ code, signal })),
    );
    async function until(check: () => Promise<boolean>) {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await check()) return;
        await delay(50);
      }
      throw new Error('Owned worker did not finish the financial projection journey');
    }
    try {
      await until(async () => {
        try {
          return (await fetch(`http://127.0.0.1:${port}/health/ready`)).status === 200;
        } catch {
          return false;
        }
      });
      await until(
        async () => (await f.snapshots.status(fixture!.viewer.context)).state === 'current',
      );
      const changed = await f.deposit('7');
      await until(
        async () =>
          (await f.snapshots.status(fixture!.viewer.context)).snapshot?.sourceRevision ===
          changed.sourceRevision,
      );
      const current = await f.snapshots.status(fixture!.viewer.context);
      expect(decimalValue(current.snapshot!.cash[0]!.amount).eq('87')).toBe(true);
      expect(current.state).toBe('current');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const result = await Promise.race([
        exited,
        delay(15000).then(() => {
          child.kill('SIGKILL');
          throw new Error('Owned financial worker exceeded graceful shutdown budget');
        }),
      ]);
      expect(result).toEqual({ code: 0, signal: null });
    }
  }, 30000);
  it('repairs a restored workspace from its retained pending outbox under the rebound owner', async () => {
    const f = await setup();
    const directory = await mkdtemp(resolve(tmpdir(), 'journal-outbox-restore-'));
    try {
      const portable = createPortabilityServices(
        fixture!.services,
        createPrivateFileStore(directory),
      );
      const archive = await portable.backup(f.context);
      const restored = await portable.restore(
        fixture!.outsider.context,
        { name: 'Outbox restore regression', archive },
        randomUUID(),
      );
      const restoredContext = await fixture!.services.authorizeWorkspace(
        new Request('http://localhost:3000', { headers: { cookie: fixture!.outsider.cookie } }),
        restored.workspaceId,
        'owner',
      );
      const rows = await fixture!.admin.pool.query(
        'SELECT count(*)::integer AS count FROM app.outbox_events WHERE workspace_id=$1 AND actor_id=$2',
        [restored.workspaceId, f.context.actorId],
      );
      expect(rows.rows[0].count).toBeGreaterThan(0);
      const jobs = await claim();
      const restoredJob = jobs.find((job) => job.workspaceId === restored.workspaceId);
      expect(restoredJob).toBeDefined();
      expect(await processFinancialOutbox(boss.getDb(), restoredJob)).toEqual({
        status: 'published',
      });
      const result = await f.snapshots.status(restoredContext);
      expect(result.state).toBe('current');
      expect(decimalValue(result.snapshot!.cash[0]!.amount).eq('80')).toBe(true);
      expect(result.snapshot!.holdings[0]!.quantity).toMatchObject({
        status: 'available',
        value: '2',
      });
    } finally {
      // The restored namespace intentionally remains in this owned disposable
      // database; do not cascade-delete its owner or rewrite immutable sources.
      await Promise.all([fixture!.services.close(), fixture!.admin.close()]);
      fixture = undefined;
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
