import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot, testDatabaseUrls } from '../../scripts/environment.js';
import { runtimeEnvironment } from '../../scripts/processes.js';

const environment = {
  PATH: '/toolchain/bin',
  HOME: '/operator',
  LC_ALL: 'en_US.UTF-8',
  COREPACK_HOME: '/workspace/.cache/corepack',
  XDG_CACHE_HOME: '/workspace/.cache',
  XDG_DATA_HOME: '/workspace/.local/share',
  npm_config_cache: '/workspace/.cache/npm',
  NODE_ENV: 'development',
  APP_ORIGIN: 'http://localhost:3000',
  WEB_HOST: '127.0.0.1',
  PORT: '3000',
  DATABASE_URL: 'postgresql://journal_app:hidden@localhost/journal',
  AUTH_DATABASE_URL: 'postgresql://journal_auth:hidden@localhost/journal',
  JOB_DATABASE_URL: 'postgresql://journal_jobs:hidden@localhost/journal',
  BETTER_AUTH_SECRET: 'hidden-auth-secret',
  STORAGE_ROOT: '.private/storage',
  WORKER_HEALTH_HOST: '127.0.0.1',
  WORKER_HEALTH_PORT: '3101',
  LOG_LEVEL: 'info',
  MIGRATION_DATABASE_URL: 'hidden-admin-credential',
  POSTGRES_PASSWORD: 'hidden-operator-secret',
  BOOTSTRAP_PASSWORD: 'hidden-bootstrap-secret',
  TEST_DATABASE_URL: 'hidden-test-credential',
  CLOUD_PROVIDER_TOKEN: 'hidden-unrelated-secret',
};

describe('service process environment', () => {
  it('gives the web its declared runtime bindings without operator or host secrets', () => {
    const child = runtimeEnvironment(false, environment);
    expect(child).toMatchObject({
      PATH: environment.PATH,
      HOME: environment.HOME,
      LC_ALL: environment.LC_ALL,
      COREPACK_HOME: environment.COREPACK_HOME,
      XDG_CACHE_HOME: environment.XDG_CACHE_HOME,
      XDG_DATA_HOME: environment.XDG_DATA_HOME,
      npm_config_cache: environment.npm_config_cache,
      DATABASE_URL: environment.DATABASE_URL,
      AUTH_DATABASE_URL: environment.AUTH_DATABASE_URL,
      JOB_DATABASE_URL: environment.JOB_DATABASE_URL,
      BETTER_AUTH_SECRET: environment.BETTER_AUTH_SECRET,
      STORAGE_ROOT: resolve(repositoryRoot, environment.STORAGE_ROOT),
      WEB_HOST: '127.0.0.1',
    });
    for (const name of [
      'MIGRATION_DATABASE_URL',
      'POSTGRES_PASSWORD',
      'BOOTSTRAP_PASSWORD',
      'TEST_DATABASE_URL',
      'CLOUD_PROVIDER_TOKEN',
      'WORKER_HEALTH_PORT',
    ]) {
      expect(child).not.toHaveProperty(name);
    }
    expect(environment.STORAGE_ROOT).toBe('.private/storage');
  });

  it('gives the worker only its queue credential and operational bindings', () => {
    expect(runtimeEnvironment(true, environment)).toEqual({
      PATH: environment.PATH,
      HOME: environment.HOME,
      LC_ALL: environment.LC_ALL,
      COREPACK_HOME: environment.COREPACK_HOME,
      XDG_CACHE_HOME: environment.XDG_CACHE_HOME,
      XDG_DATA_HOME: environment.XDG_DATA_HOME,
      npm_config_cache: environment.npm_config_cache,
      NODE_ENV: 'development',
      JOB_DATABASE_URL: environment.JOB_DATABASE_URL,
      WORKER_HEALTH_HOST: '127.0.0.1',
      WORKER_HEALTH_PORT: '3101',
      LOG_LEVEL: 'info',
    });
  });
});

describe('test target safety', () => {
  const bindings = {
    TEST_DATABASE_URL: 'postgresql://postgres:hidden@localhost:5433/journal_test',
    TEST_APP_DATABASE_URL: 'postgresql://app:hidden@localhost:5433/journal_test',
    TEST_AUTH_DATABASE_URL: 'postgresql://auth:hidden@localhost:5433/journal_test',
    TEST_JOB_DATABASE_URL: 'postgresql://jobs:hidden@localhost:5433/journal_test',
  };

  it('recognizes the same development database across loopback host aliases', () => {
    expect(() =>
      testDatabaseUrls({
        ...bindings,
        DATABASE_URL: 'postgresql://app:hidden@127.0.0.1:5433/journal_test',
      }),
    ).toThrow('must differ');
  });

  it('rejects connection overrides before the integration setup can modify a database', () => {
    expect(() =>
      testDatabaseUrls({
        ...bindings,
        TEST_DATABASE_URL: `${bindings.TEST_DATABASE_URL}?host=production`,
      }),
    ).toThrow('TEST_DATABASE_URL');
  });
});

describe('local environment initialization', () => {
  it('generates private unique credentials and preserves existing configuration on rerun', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'journal-environment-'));
    try {
      const scripts = join(directory, 'scripts');
      await mkdir(scripts);
      const initializer = join(scripts, 'env-init.ts');
      await copyFile(resolve(repositoryRoot, 'scripts/env-init.ts'), initializer);
      const localEnvironment = {
        APP_ORIGIN: 'http://localhost:3300',
        POSTGRES_PORT: '5440',
        TEST_POSTGRES_PORT: '5441',
        WORKER_HEALTH_PORT: '3310',
        COMPOSE_PROJECT_NAME: 'journal-environment-test',
      };
      const initialized = spawnSync(process.execPath, [initializer], {
        env: localEnvironment,
        encoding: 'utf8',
      });
      expect(initialized.status).toBe(0);
      const path = join(directory, '.env');
      const original = await readFile(path, 'utf8');
      const values = Object.fromEntries(
        original
          .trimEnd()
          .split('\n')
          .map((line) => line.split('=')),
      );
      expect(values).toMatchObject({
        COMPOSE_PROJECT_NAME: 'journal-environment-test',
        APP_ORIGIN: 'http://localhost:3300',
        WEB_HOST: '127.0.0.1',
        PORT: '3300',
        POSTGRES_PORT: '5440',
        TEST_POSTGRES_PORT: '5441',
        WORKER_HEALTH_PORT: '3310',
      });
      const credentials = [
        values.POSTGRES_PASSWORD,
        new URL(values.DATABASE_URL!).password,
        new URL(values.AUTH_DATABASE_URL!).password,
        new URL(values.JOB_DATABASE_URL!).password,
        values.BETTER_AUTH_SECRET,
      ];
      expect(new Set(credentials).size).toBe(5);
      for (const secret of credentials) {
        expect(secret).toMatch(/^[a-f0-9]{64}$/);
        expect(initialized.stdout).not.toContain(secret);
        expect(initialized.stderr).not.toContain(secret);
      }
      if (process.platform !== 'win32') {
        expect((await stat(path)).mode & 0o777).toBe(0o600);
        expect((await stat(join(directory, '.private/storage'))).mode & 0o777).toBe(0o700);
      }
      const repeated = spawnSync(process.execPath, [initializer], {
        env: { ...localEnvironment, APP_ORIGIN: 'http://localhost:4400' },
        encoding: 'utf8',
      });
      expect(repeated.status).toBe(0);
      expect(repeated.stdout).toContain('preserved');
      expect(await readFile(path, 'utf8')).toBe(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('direct service start configuration gates', () => {
  const invalidStart = (service: string, bindings: NodeJS.ProcessEnv) =>
    spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve(repositoryRoot, 'scripts/run.ts'), service],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          APP_ORIGIN: 'http://localhost:3000',
          DATABASE_URL: 'postgresql://journal_app:hidden@localhost/journal',
          AUTH_DATABASE_URL: 'postgresql://journal_auth:hidden@localhost/journal',
          JOB_DATABASE_URL: 'postgresql://journal_jobs:hidden@localhost/journal',
          BETTER_AUTH_SECRET: 'a'.repeat(64),
          ...bindings,
        },
        encoding: 'utf8',
        timeout: 5_000,
      },
    );

  it('rejects a missing web authentication secret before launching a server', () => {
    const started = invalidStart('web-start', { BETTER_AUTH_SECRET: '' });
    expect(started.status).toBe(1);
    expect(started.error).toBeUndefined();
    expect(started.stderr).toContain('BETTER_AUTH_SECRET');
    expect(started.stderr).not.toContain('postgresql://');
  });

  it('rejects a production HTTP origin before launching a built server', () => {
    const started = invalidStart('web-start', { NODE_ENV: 'production' });
    expect(started.status).toBe(1);
    expect(started.error).toBeUndefined();
    expect(started.stderr).toContain('APP_ORIGIN');
    expect(started.stderr).not.toContain('postgresql://');
  });

  it('rejects missing queue credentials before launching a worker', () => {
    const started = invalidStart('worker-start', { JOB_DATABASE_URL: '' });
    expect(started.status).toBe(1);
    expect(started.error).toBeUndefined();
    expect(started.stderr).toContain('JOB_DATABASE_URL');
    expect(started.stderr).not.toContain('postgresql://');
  });
});
