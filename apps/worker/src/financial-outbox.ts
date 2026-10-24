import { z } from 'zod';
import { nativeFinancialSnapshotSchema } from '@journal/contracts';
import type { PgBoss } from 'pg-boss';

export const FINANCIAL_OUTBOX_QUEUE = 'financial.native-snapshot';
export const financialOutboxPayloadSchema = z.strictObject({
  workspaceId: z.uuidv4(),
  eventId: z.uuidv4(),
  leaseToken: z.uuidv4(),
  sourceRevision: z.number().int().positive(),
});
type SqlPort = Pick<ReturnType<PgBoss['getDb']>, 'executeSql'>;

/** Only this system-native projection uses current-owner authority. Future
 * exports/user jobs must retain their own current requester authorization. */
export async function processFinancialOutbox(
  db: SqlPort,
  value: unknown,
): Promise<{ status: string }> {
  const job = financialOutboxPayloadSchema.parse(value);
  try {
    const prepared = await db.executeSql(
      'SELECT queue.prepare_native_financial_snapshot($1::uuid,$2::uuid) AS result',
      [job.workspaceId, job.leaseToken],
    );
    const result = z
      .object({
        status: z.enum(['ready', 'stale', 'blocked', 'unavailable']),
        reason: z.literal('scope-too-large').optional(),
        snapshot: nativeFinancialSnapshotSchema.optional(),
      })
      .parse(prepared.rows[0]?.result);
    if (result.status === 'stale') return { status: 'stale' };
    if (result.status !== 'ready') {
      await db.executeSql('SELECT queue.fail_financial_outbox($1::uuid,$2::uuid,$3)', [
        job.workspaceId,
        job.leaseToken,
        result.status === 'blocked' ? 'owner-unavailable' : 'scope-too-large',
      ]);
      return { status: result.status };
    }
    if (!result.snapshot || result.snapshot.sourceRevision !== String(job.sourceRevision))
      throw new Error('Snapshot source generation differs from the leased command');
    const published = await db.executeSql(
      'SELECT queue.publish_native_financial_snapshot($1::uuid,$2::uuid) AS status',
      [job.workspaceId, job.leaseToken],
    );
    const status = z.enum(['published', 'stale', 'blocked']).parse(published.rows[0]?.status);
    if (status === 'blocked')
      await db.executeSql('SELECT queue.fail_financial_outbox($1::uuid,$2::uuid,$3)', [
        job.workspaceId,
        job.leaseToken,
        'owner-unavailable',
      ]);
    return { status };
  } catch {
    await db
      .executeSql('SELECT queue.fail_financial_outbox($1::uuid,$2::uuid,$3)', [
        job.workspaceId,
        job.leaseToken,
        'processing-failed',
      ])
      .catch(() => undefined);
    throw new Error('Financial projection processing failed');
  }
}

export async function startFinancialOutbox(boss: PgBoss, onFailure: () => void) {
  const db = boss.getDb();
  await boss.work(
    FINANCIAL_OUTBOX_QUEUE,
    { pollingIntervalSeconds: 0.5, localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) await processFinancialOutbox(db, job.data);
      return { status: 'processed' };
    },
  );
  let stopping = false;
  let running: Promise<void> | undefined;
  async function dispatch() {
    if (stopping || running) return running;
    running = (async () => {
      const claimed = await db.executeSql('SELECT * FROM queue.claim_financial_outbox($1)', [2]);
      for (const row of claimed.rows) {
        const payload = financialOutboxPayloadSchema.parse({
          workspaceId: row.workspace_id,
          eventId: row.event_id,
          leaseToken: row.lease_token,
          sourceRevision: row.source_revision,
        });
        // Stable per-lease queue identity makes retries after send/ack uncertainty safe.
        await boss.send(FINANCIAL_OUTBOX_QUEUE, payload, { id: payload.leaseToken });
      }
    })()
      .catch(onFailure)
      .finally(() => {
        running = undefined;
      });
    return running;
  }
  await dispatch();
  const interval = setInterval(() => void dispatch(), 1000);
  return {
    async stop() {
      stopping = true;
      clearInterval(interval);
      await running;
    },
  };
}
