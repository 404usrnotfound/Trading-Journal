import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@journal/server/config';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://app:private@localhost:5432/journal',
  AUTH_DATABASE_URL: 'postgresql://auth:private@localhost:5432/journal',
  JOB_DATABASE_URL: 'postgresql://jobs:private@localhost:5432/journal',
  BETTER_AUTH_SECRET: 'a-test-only-secret-with-at-least-32-characters',
  APP_ORIGIN: 'http://localhost:3000',
};

describe('server configuration boundary', () => {
  it('keeps migration credentials and unrelated bindings out of runtime config', () => {
    const result = parseServerConfig({
      ...valid,
      MIGRATION_DATABASE_URL: 'postgresql://postgres:tool-secret@localhost/journal',
      UNRELATED_TOKEN: 'unrelated-secret',
    });
    expect(result.appOrigin).toBe('http://localhost:3000');
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('tool-secret');
    expect(JSON.stringify(result)).not.toContain('unrelated-secret');
  });

  it('fails closed for production HTTP, short secrets and non-PostgreSQL URLs without printing their values', () => {
    const invalid = {
      ...valid,
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'secret-to-hide',
      AUTH_DATABASE_URL: 'https://user:credential-to-hide@example.com/database',
    };
    let failure: Error | undefined;
    try {
      parseServerConfig(invalid);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure?.message).toContain('BETTER_AUTH_SECRET');
    expect(failure?.message).not.toContain('secret-to-hide');
    expect(failure?.message).not.toContain('credential-to-hide');
    expect(() => parseServerConfig({ ...valid, NODE_ENV: 'production' })).toThrow('APP_ORIGIN');
  });

  it.each([
    'http://remote.example',
    'http://localhost:3000/callback',
    'http://person:password@localhost:3000',
    'http://localhost:3000?token=secret',
    'ftp://localhost:3000',
  ])('rejects an unsafe or non-local development origin %s', (APP_ORIGIN) => {
    expect(() => parseServerConfig({ ...valid, APP_ORIGIN })).toThrow('APP_ORIGIN');
  });

  it('accepts a production HTTPS origin and rejects missing runtime credentials', () => {
    expect(
      parseServerConfig({ ...valid, NODE_ENV: 'production', APP_ORIGIN: 'https://journal.example' })
        .appOrigin,
    ).toBe('https://journal.example');
    expect(() => parseServerConfig({})).toThrow('DATABASE_URL');
  });

  it('reports only the binding name for an invalid URL, without raw URL/parser input', () => {
    const input = 'not-a-url-containing-secret-value';
    let failure: unknown;
    try {
      parseServerConfig({ ...valid, APP_ORIGIN: input });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ name: 'ServerConfigurationError', fields: ['APP_ORIGIN'] });
    expect((failure as Error).message).toContain('APP_ORIGIN');
    expect(JSON.stringify(failure)).not.toContain(input);
    expect((failure as Error).message).not.toContain(input);
  });

  it('rejects blank secrets and invalid private storage paths', () => {
    expect(() => parseServerConfig({ ...valid, BETTER_AUTH_SECRET: ' '.repeat(64) })).toThrow(
      'BETTER_AUTH_SECRET',
    );
    expect(() => parseServerConfig({ ...valid, STORAGE_ROOT: ' ' })).toThrow('STORAGE_ROOT');
    expect(() => parseServerConfig({ ...valid, STORAGE_ROOT: 'private\0invalid' })).toThrow(
      'STORAGE_ROOT',
    );
    expect(() => parseServerConfig({ ...valid, STORAGE_ROOT: '/' })).toThrow('STORAGE_ROOT');
    for (const directory of ['.next', 'dist', 'build'])
      expect(() =>
        parseServerConfig({ ...valid, STORAGE_ROOT: `apps/web/${directory}/private` }),
      ).toThrow('STORAGE_ROOT');
    expect(() => parseServerConfig({ ...valid, STORAGE_ROOT: 'apps/web/public/private' })).toThrow(
      'STORAGE_ROOT',
    );
  });
});
