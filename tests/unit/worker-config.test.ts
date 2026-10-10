import { describe, expect, it } from 'vitest';

import { readWorkerConfiguration, WorkerConfigurationError } from '../../apps/worker/src/config.js';

describe('worker startup configuration', () => {
  it('does not require authentication, tenant or migration credentials', () => {
    expect(
      readWorkerConfiguration({
        JOB_DATABASE_URL: 'postgresql://journal_jobs:hidden@localhost/journal',
        MIGRATION_DATABASE_URL: 'must-never-be-used',
      }),
    ).toEqual({
      JOB_DATABASE_URL: 'postgresql://journal_jobs:hidden@localhost/journal',
      WORKER_HEALTH_HOST: '127.0.0.1',
      WORKER_HEALTH_PORT: 3101,
      LOG_LEVEL: 'info',
    });
  });

  it.each([
    'https://journal_jobs:hidden@example.com/journal',
    'postgresql://journal_jobs:hidden@localhost/',
    'postgresql://localhost/journal',
    'hidden-invalid-connection-string',
  ])('fails closed for an unusable queue binding (%s)', (databaseUrl) => {
    let failure: unknown;
    try {
      readWorkerConfiguration({ JOB_DATABASE_URL: databaseUrl });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(WorkerConfigurationError);
    expect(failure).toMatchObject({ fields: ['JOB_DATABASE_URL'] });
    expect(String(failure)).not.toContain('hidden');
  });

  it('reports only field names for invalid health ports and logging levels', () => {
    expect(() =>
      readWorkerConfiguration({
        JOB_DATABASE_URL: 'postgresql://journal_jobs:hidden@localhost/journal',
        WORKER_HEALTH_PORT: '99999',
        LOG_LEVEL: 'hidden-invalid-level',
      }),
    ).toThrow('INVALID_WORKER_CONFIGURATION');
  });
});
