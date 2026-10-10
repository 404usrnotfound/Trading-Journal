import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const secret = () => randomBytes(32).toString('hex');
const admin = secret();
const app = secret();
const auth = secret();
const jobs = secret();
let origin: URL;
try {
  origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000');
} catch {
  throw new Error('APP_ORIGIN must be a local HTTP(S) origin.');
}
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
  !['http:', 'https:'].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('APP_ORIGIN must be a local HTTP(S) origin.');
const mainPort = Number(process.env.POSTGRES_PORT ?? '5432');
const testPort = Number(process.env.TEST_POSTGRES_PORT ?? '5433');
const workerPort = Number(process.env.WORKER_HEALTH_PORT ?? '3101');
for (const port of [mainPort, testPort, workerPort]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid local database port.');
}
if (mainPort === testPort) throw new Error('Development and test database ports must differ.');
const projectName = process.env.COMPOSE_PROJECT_NAME ?? 'trading-journal-foundation';
if (!/^[a-z0-9][a-z0-9_-]*$/.test(projectName)) {
  throw new Error('COMPOSE_PROJECT_NAME must be a valid local Compose project name.');
}
const url = (role: string, password: string, port: number, database: string) =>
  `postgresql://${role}:${password}@127.0.0.1:${port}/${database}`;
const values = {
  NODE_ENV: 'development',
  COMPOSE_PROJECT_NAME: projectName,
  APP_ORIGIN: origin.origin,
  WEB_HOST: process.env.WEB_HOST ?? '127.0.0.1',
  PORT: origin.port || (origin.protocol === 'https:' ? '443' : '80'),
  POSTGRES_PASSWORD: admin,
  POSTGRES_PORT: String(mainPort),
  TEST_POSTGRES_PORT: String(testPort),
  MIGRATION_DATABASE_URL: url('postgres', admin, mainPort, 'trading_journal'),
  DATABASE_URL: url('journal_app', app, mainPort, 'trading_journal'),
  AUTH_DATABASE_URL: url('journal_auth', auth, mainPort, 'trading_journal'),
  JOB_DATABASE_URL: url('journal_jobs', jobs, mainPort, 'trading_journal'),
  TEST_DATABASE_URL: url('postgres', admin, testPort, 'trading_journal_test'),
  TEST_APP_DATABASE_URL: url('journal_app', app, testPort, 'trading_journal_test'),
  TEST_AUTH_DATABASE_URL: url('journal_auth', auth, testPort, 'trading_journal_test'),
  TEST_JOB_DATABASE_URL: url('journal_jobs', jobs, testPort, 'trading_journal_test'),
  BETTER_AUTH_SECRET: secret(),
  STORAGE_ROOT: '.private/storage',
  WORKER_HEALTH_HOST: process.env.WORKER_HEALTH_HOST ?? '127.0.0.1',
  WORKER_HEALTH_PORT: String(workerPort),
  LOG_LEVEL: 'info',
};
try {
  await writeFile(
    fileURLToPath(new URL('../.env', import.meta.url)),
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  await mkdir(fileURLToPath(new URL('../.private/storage', import.meta.url)), {
    recursive: true,
    mode: 0o700,
  });
  console.log(
    'Created ignored local .env with unique credentials. Existing configuration is never overwritten.',
  );
} catch (error) {
  if (typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST') {
    console.log('.env already exists; preserved it.');
  } else throw error;
}
