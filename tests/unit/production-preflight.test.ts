import { chmod, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertSafeRuntimeRole,
  assertDatabaseTransportPolicy,
  probePrivateStorage,
  productionPreflight,
  ProductionPreflightError,
  type RuntimeRoleFacts,
} from '../../scripts/operations/production-preflight.js';
import { parseServerConfig } from '@journal/server/config';

const facts: RuntimeRoleFacts = {
  role: 'journal_app',
  session_role: 'journal_app',
  server_version: 170011,
  database_identity: 'private-database-identity',
  ssl: false,
  can_login: true,
  inherits: false,
  superuser: false,
  bypass_rls: false,
  create_database: false,
  create_role: false,
  replication: false,
  privileged_membership: false,
  owns_objects: false,
  can_create: false,
  expected_access: true,
  foreign_access: false,
};

describe('production preflight safety gates', () => {
  it('requires an explicit verify-full URL policy without allowing hidden overrides', () => {
    const url = 'postgresql://journal_app:private@db.example/journal';
    expect(() =>
      assertDatabaseTransportPolicy(
        [`${url}?sslmode=verify-full&sslrootcert=/run/secrets/ca.pem`],
        false,
      ),
    ).not.toThrow();
    for (const suffix of [
      '',
      '?sslmode=require',
      '?sslmode=no-verify',
      '?sslmode=disable',
      '?sslmode=verify-full&sslmode=no-verify',
      '?sslmode=verify-full&ssl=false',
      '?sslmode=verify-full&uselibpqcompat=true',
      '?sslmode=verify-full&host=unreviewed.example',
    ])
      expect(() => assertDatabaseTransportPolicy([`${url}${suffix}`], false)).toThrow(
        ProductionPreflightError,
      );
    expect(() => assertDatabaseTransportPolicy([`${url}?sslmode=verify-full`], false, '0')).toThrow(
      ProductionPreflightError,
    );
  });

  it('keeps the explicit plaintext test exception on loopback and rejects connection overrides', () => {
    expect(() =>
      assertDatabaseTransportPolicy(
        ['postgresql://journal_app:private@127.0.0.1/journal_test'],
        true,
      ),
    ).not.toThrow();
    for (const url of [
      'postgresql://journal_app:private@remote.example/journal_test',
      'postgresql://journal_app:private@127.0.0.1/journal_test?host=remote.example',
      'postgresql://journal_app:private@127.0.0.1/journal_test?sslmode=no-verify',
    ])
      expect(() => assertDatabaseTransportPolicy([url], true)).toThrow(ProductionPreflightError);
  });

  it('accepts the expected safe role without treating an unencrypted channel as TLS evidence', () => {
    expect(() => assertSafeRuntimeRole(facts, 'journal_app', 'DATABASE_URL')).not.toThrow();
  });

  it.each([
    ['role', 'postgres'],
    ['session_role', 'postgres'],
    ['server_version', 160000],
    ['server_version', 180000],
    ['database_identity', ''],
    ['can_login', false],
    ['inherits', true],
    ['superuser', true],
    ['bypass_rls', true],
    ['create_database', true],
    ['create_role', true],
    ['replication', true],
    ['privileged_membership', true],
    ['owns_objects', true],
    ['can_create', true],
    ['expected_access', false],
    ['foreign_access', true],
  ])('rejects an unsafe live role fact %s=%s', (field, value) => {
    expect(() =>
      assertSafeRuntimeRole({ ...facts, [field]: value }, 'journal_app', 'DATABASE_URL'),
    ).toThrow(ProductionPreflightError);
  });

  it('reports only fixed classifications and binding names, excluding private observations', () => {
    let failure: unknown;
    try {
      assertSafeRuntimeRole(
        { ...facts, role: 'private-credential-and-database-name' },
        'journal_app',
        'DATABASE_URL',
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: 'RUNTIME_ROLE_UNSAFE', binding: 'DATABASE_URL' });
    expect(JSON.stringify(failure)).not.toContain('private-credential');
    expect((failure as Error).message).not.toContain('private-credential');
    expect(failure).not.toHaveProperty('cause');
  });

  it('rejects non-production configuration before opening database connections', async () => {
    const config = parseServerConfig({
      NODE_ENV: 'test',
      APP_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://journal_app:unused@localhost/journal_test',
      AUTH_DATABASE_URL: 'postgresql://journal_auth:unused@localhost/journal_test',
      JOB_DATABASE_URL: 'postgresql://journal_jobs:unused@localhost/journal_test',
      BETTER_AUTH_SECRET: 'test-only-secret-that-is-long-enough',
    });
    await expect(productionPreflight(config)).rejects.toMatchObject({
      code: 'PRODUCTION_CONFIGURATION_REQUIRED',
    });
  });
});

describe('owned private storage preflight', () => {
  it('verifies real immutable bytes and removes only its probe, preserving existing private files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'journal-storage-preflight-'));
    const sentinel = join(directory, 'existing-private-file');
    try {
      await writeFile(sentinel, 'do not delete', { mode: 0o600 });
      await probePrivateStorage(directory);
      expect(await readdir(directory)).toEqual(['existing-private-file']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not create an absent mount or follow a symlink or permissive storage directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'journal-storage-preflight-'));
    try {
      await mkdir(join(directory, 'public-permissions'), { mode: 0o755 });
      await chmod(join(directory, 'public-permissions'), 0o755);
      await symlink(directory, join(directory, 'symlink'));
      for (const name of ['missing', 'symlink', 'public-permissions']) {
        await expect(probePrivateStorage(join(directory, name))).rejects.toMatchObject({
          code: 'PRIVATE_STORAGE_PROBE_FAILED',
        });
      }
      expect((await readdir(directory)).sort()).toEqual(['public-permissions', 'symlink']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
