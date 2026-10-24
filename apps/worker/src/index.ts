import { createServer } from 'node:http';

import { createLogger } from '@journal/server/logging';

import { readWorkerConfiguration, WorkerConfigurationError } from './config';
import { startFinancialOutbox } from './financial-outbox';
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
  const probeController = new AbortController();

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
  let outbox: Awaited<ReturnType<typeof startFinancialOutbox>> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    ready = false;
    probeController.abort();
    if (heartbeat) clearInterval(heartbeat);
    logger.info({ event: 'worker.stopping' });
    shutdownPromise = (async () => {
      await outbox?.stop();
      return Promise.allSettled([
        new Promise<void>((resolve) => healthServer.close(() => resolve())),
        boss.stop({ graceful: true, timeout: 10_000 }),
      ]);
    })().then((results) => {
      if (results.some((result) => result.status === 'rejected')) {
        process.exitCode = 1;
        logger.error({ event: 'worker.shutdown.failed' });
      } else {
        logger.info({ event: 'worker.stopped' });
      }
    });
    return shutdownPromise;
  }

  // Handle termination while connecting/checking schema as well as after readiness.
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  logger.info({ event: 'worker.starting' });
  try {
    await boss.start();
    if (stopping) return void (await shutdown());
    await boss.work(HEALTH_PROBE_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      for (const job of jobs) healthProbePayloadSchema.parse(job.data);
      return { status: 'ok' };
    });
    outbox = await startFinancialOutbox(boss, () =>
      logger.error({ event: 'worker.outbox.dispatch.failed' }),
    );
    if (stopping) {
      await outbox.stop();
      return void (await shutdown());
    }
    if (stopping) return void (await shutdown());
    await verifyQueueRoundTrip(boss, probeController.signal);
    if (stopping) return void (await shutdown());
    ready = true;

    await new Promise<void>((resolve, reject) => {
      healthServer.once('error', reject);
      healthServer.listen(config.WORKER_HEALTH_PORT, config.WORKER_HEALTH_HOST, resolve);
    });
    if (stopping) return void (await shutdown());

    heartbeat = setInterval(() => {
      if (probing || stopping) return;
      probing = true;
      void verifyQueueRoundTrip(boss, probeController.signal)
        .then(() => {
          if (!stopping) ready = true;
          logger.info({ event: 'worker.heartbeat' });
        })
        .catch(() => {
          ready = false;
          if (!stopping) logger.error({ event: 'worker.heartbeat.failed' });
        })
        .finally(() => {
          probing = false;
        });
    }, 30_000);

    logger.info({ event: 'worker.ready' });
  } catch (error) {
    const interrupted = stopping;
    await shutdown();
    if (interrupted) return;
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
