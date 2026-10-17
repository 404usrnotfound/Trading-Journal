import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@journal/server/config';
import { createDatabase, type Database } from '@journal/database';
import { migrateDatabase, provisionRuntimeRoles } from '@journal/database/migrate';
import { migrateJobs } from '@journal/worker/migrate';
import { databasePassword, loadEnvironment, testDatabaseUrls } from '../../scripts/environment.js';
import {
  inspectRuntimeRole,
  productionPreflight,
} from '../../scripts/operations/production-preflight.js';

loadEnvironment();

describe('real PostgreSQL production preflight', () => {
  it('inspects all three restricted roles and schema, and labels local unencrypted transport honestly', async () => {
    const urls = testDatabaseUrls();
    const directory = await mkdtemp(join(tmpdir(), 'journal-production-preflight-'));
    const config = parseServerConfig({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://journal.example.test',
      DATABASE_URL: urls.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: urls.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: urls.TEST_JOB_DATABASE_URL,
      BETTER_AUTH_SECRET: 'production-preflight-test-secret-only',
      STORAGE_ROOT: directory,
    });
    try {
      const result = await productionPreflight(config, { allowLocalPlaintext: true });
      expect(result).toMatchObject({
        status: 'checks-passed',
        sameObservedDatabase: true,
        databaseTransportMode: 'explicit-local-plaintext-test',
        deploymentTransportApprovalRequired: true,
        roles: [
          { role: 'journal_app', encryptedConnection: false },
          { role: 'journal_auth', encryptedConnection: false },
          { role: 'journal_jobs', encryptedConnection: false },
        ],
      });
      expect(await readdir(directory)).toEqual([]);
      await expect(productionPreflight(config)).rejects.toMatchObject({
        code: 'DATABASE_TLS_REQUIRED',
        binding: 'DATABASE_URL',
      });
      await expect(
        productionPreflight(
          { ...config, authDatabaseUrl: config.databaseUrl },
          { allowLocalPlaintext: true },
        ),
      ).rejects.toMatchObject({ code: 'RUNTIME_ROLE_UNSAFE', binding: 'AUTH_DATABASE_URL' });
      await expect(
        productionPreflight(
          { ...config, databaseUrl: urls.TEST_DATABASE_URL },
          { allowLocalPlaintext: true },
        ),
      ).rejects.toMatchObject({ code: 'RUNTIME_ROLE_UNSAFE', binding: 'DATABASE_URL' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects column-only and non-DML foreign grants independently in a fresh owned database', async () => {
    const urls = testDatabaseUrls();
    const name = `journal_preflight_${randomUUID().replaceAll('-', '')}_test`;
    const target = (value: string) => {
      const url = new URL(value);
      url.pathname = `/${name}`;
      return url.toString();
    };
    const admin = createDatabase(urls.TEST_DATABASE_URL, { max: 1 });
    let fixture: Database | undefined;
    let runtime: Database | undefined;
    let created = false;
    const directory = await mkdtemp(join(tmpdir(), 'journal-production-grants-'));
    try {
      await admin.pool.query(`CREATE DATABASE "${name}"`);
      created = true;
      const adminUrl = target(urls.TEST_DATABASE_URL);
      await migrateDatabase(adminUrl);
      await migrateJobs(adminUrl);
      await provisionRuntimeRoles(adminUrl, {
        appPassword: databasePassword(urls.TEST_APP_DATABASE_URL),
        authPassword: databasePassword(urls.TEST_AUTH_DATABASE_URL),
        jobsPassword: databasePassword(urls.TEST_JOB_DATABASE_URL),
      });
      fixture = createDatabase(adminUrl, { max: 1 });
      runtime = createDatabase(target(urls.TEST_APP_DATABASE_URL), { max: 1 });
      const config = parseServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://journal.example.test',
        DATABASE_URL: target(urls.TEST_APP_DATABASE_URL),
        AUTH_DATABASE_URL: target(urls.TEST_AUTH_DATABASE_URL),
        JOB_DATABASE_URL: target(urls.TEST_JOB_DATABASE_URL),
        BETTER_AUTH_SECRET: 'isolated-preflight-test-secret-only',
        STORAGE_ROOT: directory,
      });
      expect((await inspectRuntimeRole(runtime, 'journal_app')).foreign_access).toBe(false);
      // Static reviewed SQL privileges only; no shared existing tables or role attributes are changed.
      for (const privilege of [
        'SELECT (token)',
        'INSERT (token)',
        'UPDATE (token)',
        'REFERENCES (token)',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        await fixture.pool.query(`GRANT ${privilege} ON auth.session TO journal_app`);
        try {
          expect((await inspectRuntimeRole(runtime, 'journal_app')).foreign_access).toBe(true);
          await expect(
            productionPreflight(config, { allowLocalPlaintext: true }),
          ).rejects.toMatchObject({ code: 'RUNTIME_ROLE_UNSAFE', binding: 'DATABASE_URL' });
        } finally {
          await fixture.pool.query(`REVOKE ${privilege} ON auth.session FROM journal_app`);
        }
        expect((await inspectRuntimeRole(runtime, 'journal_app')).foreign_access).toBe(false);
      }
    } finally {
      await runtime?.close();
      await fixture?.close();
      if (created) await admin.pool.query(`DROP DATABASE "${name}"`);
      await admin.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
