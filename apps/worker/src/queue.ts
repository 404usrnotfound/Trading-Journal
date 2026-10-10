import { randomUUID } from 'node:crypto';

import { PgBoss } from 'pg-boss';
import { z } from 'zod';

export const JOB_SCHEMA = 'queue';
export const HEALTH_PROBE_QUEUE = 'platform.health-probe';

export const healthProbePayloadSchema = z.object({ probeId: z.uuid() }).strict();

/** Runtime connections can consume jobs but must never install queue objects. */
export function createRuntimeQueue(databaseUrl: string): PgBoss {
  return new PgBoss({
    connectionString: databaseUrl,
    schema: JOB_SCHEMA,
    application_name: 'journal-worker',
    migrate: false,
    createSchema: false,
    schedule: false,
    supervise: true,
    reindex: false,
    monitorVacuum: false,
    persistQueueStats: false,
    connectionTimeoutMillis: 5_000,
    options: '-c statement_timeout=5000 -c lock_timeout=5000',
    max: 4,
    instanceName: 'journal-worker',
    instanceHeartbeatSeconds: 10,
  });
}

/** The probe is an infrastructure check, not an application job or financial event. */
export async function verifyQueueRoundTrip(boss: PgBoss): Promise<void> {
  const jobId = await boss.send(HEALTH_PROBE_QUEUE, {
    probeId: randomUUID(),
  });
  if (jobId === null) {
    throw new Error('QUEUE_PROBE_NOT_ENQUEUED');
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const jobs = await boss.findJobs(HEALTH_PROBE_QUEUE, { id: jobId });
    const job = jobs[0];
    if (job?.state === 'completed') {
      return;
    }
    if (job?.state === 'failed' || job?.state === 'cancelled') {
      throw new Error('QUEUE_PROBE_FAILED');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('QUEUE_PROBE_TIMED_OUT');
}
