import { z } from 'zod';

const postgresUrl = z
  .url()
  .refine(
    (value) =>
      URL.canParse(value) && ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
  );

const workerEnvironmentSchema = z.object({
  JOB_DATABASE_URL: postgresUrl,
  WORKER_HEALTH_HOST: z.string().min(1).default('127.0.0.1'),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3_101),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

export type WorkerConfiguration = z.infer<typeof workerEnvironmentSchema>;

export class WorkerConfigurationError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super('INVALID_WORKER_CONFIGURATION');
    this.name = 'WorkerConfigurationError';
    this.fields = fields;
  }
}

/** Report names of invalid bindings, never their values. */
export function readWorkerConfiguration(environment: NodeJS.ProcessEnv): WorkerConfiguration {
  const result = workerEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new WorkerConfigurationError(fields);
  }
  return result.data;
}
