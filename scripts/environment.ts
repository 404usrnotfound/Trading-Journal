import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export function loadEnvironment() {
  config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
}
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required configuration is missing: ${name}`);
  return value;
}
export function databasePassword(url: string): string {
  const password = decodeURIComponent(new URL(url).password);
  if (!password) throw new Error('Local database role password is missing.');
  return password;
}
export function testDatabaseUrls(environment: NodeJS.ProcessEnv = process.env) {
  const names = [
    'TEST_DATABASE_URL',
    'TEST_APP_DATABASE_URL',
    'TEST_AUTH_DATABASE_URL',
    'TEST_JOB_DATABASE_URL',
  ] as const;
  const urls = Object.fromEntries(
    names.map((name) => {
      try {
        const url = new URL(environment[name] ?? '');
        if (
          !['postgres:', 'postgresql:'].includes(url.protocol) ||
          !/^\/[A-Za-z0-9_]+_test$/.test(url.pathname)
        )
          throw new Error();
        return [name, url];
      } catch {
        throw new Error(`Invalid isolated test database binding: ${name}`);
      }
    }),
  ) as Record<(typeof names)[number], URL>;
  const target = (url: URL) => `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  for (const name of names)
    if (target(urls[name]) !== target(urls.TEST_DATABASE_URL))
      throw new Error(`Test database instance mismatch: ${name}`);
  if (
    environment.MIGRATION_DATABASE_URL &&
    target(new URL(environment.MIGRATION_DATABASE_URL)) === target(urls.TEST_DATABASE_URL)
  )
    throw new Error('Test database must differ from the development migration database.');
  return Object.fromEntries(names.map((name) => [name, environment[name]!])) as Record<
    (typeof names)[number],
    string
  >;
}
export function reportToolFailure(operation: string, error: unknown): never {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'ERROR';
  console.error(
    `${operation} failed (${code}). Check the documented configuration and database readiness.`,
  );
  process.exit(1);
}
