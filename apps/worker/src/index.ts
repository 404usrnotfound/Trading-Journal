import { createServer } from 'node:http';

import { createLogger } from '@journal/server/logging';

import { readWorkerConfiguration, WorkerConfigurationError } from './config';
import {
  createRuntimeQueue,
  HEALTH_PROBE_QUEUE,
  healthProbePayloadSchema,
  verifyQueueRoundTrip,
} from './queue';

async function main(): Promise<void> {
  const config = readWorkerConfiguration(process.env);
  const logger = createLogger({ level: config.LOG_LEVEL });
  const boss = createRuntimeQueue(config.JOB_DATABASE_URL);
  let ready = false;
  let stopping = false;
  let probing = false;

  const healthServer = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end(JSON.stringify({ status: 'method-not-allowed' }));
      return;
    }
    if (request.url === '/health/live') {
      response.writeHead(stopping ? 503 : 200);
      response.end(JSON.stringify({ status: stopping ? 'unavailable' : 'ok' }));
      return;
    }
    if (request.url === '/health/ready') {
      response.writeHead(ready && !stopping ? 200 : 503);
      response.end(JSON.stringify({ status: ready && !stopping ? 'ok' : 'unavailable' }));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ status: 'not-found' }));
  });

  boss.on('error', () => {
    ready = false;
    logger.error({ event: 'worker.queue.error' });
  });
  boss.on('warning', () => logger.warn({ event: 'worker.queue.warning' }));

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    ready = false;
    if (heartbeat) clearInterval(heartbeat);
    logger.info({ event: 'worker.stopping' });
    await Promise.allSettled([
      new Promise<void>((resolve) => healthServer.close(() => resolve())),
      boss.stop({ graceful: true, timeout: 10_000 }),
    ]);
  }

  try {
    await boss.start();
    await boss.work(HEALTH_PROBE_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      for (const job of jobs) healthProbePayloadSchema.parse(job.data);
      return { status: 'ok' };
    });
    await verifyQueueRoundTrip(boss);
    ready = true;

    await new Promise<void>((resolve, reject) => {
      healthServer.once('error', reject);
      healthServer.listen(config.WORKER_HEALTH_PORT, config.WORKER_HEALTH_HOST, resolve);
    });

    heartbeat = setInterval(() => {
      if (probing || stopping) return;
      probing = true;
      void verifyQueueRoundTrip(boss)
        .then(() => {
          if (!stopping) ready = true;
          logger.info({ event: 'worker.heartbeat' });
        })
        .catch(() => {
          ready = false;
          logger.error({ event: 'worker.heartbeat.failed' });
        })
        .finally(() => {
          probing = false;
        });
    }, 30_000);

    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
    logger.info({ event: 'worker.ready' });
  } catch (error) {
    await shutdown();
    throw error;
  }
}

void main().catch((error: unknown) => {
  // This logger does not need configuration; its error serializer omits raw
  // PostgreSQL messages, connection strings and other unsafe exception text.
  const logger = createLogger();
  logger.fatal(
    {
      event: 'worker.startup.failed',
      err: error,
      ...(error instanceof WorkerConfigurationError ? { fields: error.fields } : {}),
    },
    'Worker startup failed; check required configuration and queue migrations.',
  );
  process.exitCode = 1;
});
