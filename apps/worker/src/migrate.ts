import { PgBoss } from 'pg-boss';

import { HEALTH_PROBE_QUEUE, JOB_SCHEMA } from './queue';

/** Only the explicit one-shot migration command may use a migration connection. */
export async function migrateJobs(databaseUrl: string): Promise<void> {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: JOB_SCHEMA,
    application_name: 'journal-queue-migration',
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
    registerInstance: false,
    connectionTimeoutMillis: 5_000,
  });

  // A handled emitter error still rejects the operation; never print connection
  // details or raw PostgreSQL messages through EventEmitter's default handler.
  boss.on('error', () => undefined);
  try {
    await boss.start();
    await boss.createQueue(HEALTH_PROBE_QUEUE, {
      retryLimit: 2,
      retryDelay: 1,
      retryBackoff: true,
      expireInSeconds: 30,
      retentionSeconds: 3_600,
      deleteAfterSeconds: 300,
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 5_000 });
  }
}
