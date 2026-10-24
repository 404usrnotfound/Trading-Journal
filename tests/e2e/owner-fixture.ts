import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import { testDatabaseUrls } from '../../scripts/environment.js';

/** Independent journeys cannot consume another test owner's identity throttle. */
export async function createBrowserOwner(origin: string) {
  const urls = testDatabaseUrls();
  const email = `release-browser-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  await bootstrapOwner(
    { email, password, name: 'Release browser owner' },
    parseServerConfig({
      ...process.env,
      DATABASE_URL: urls.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: urls.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: urls.TEST_JOB_DATABASE_URL,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
    }),
  );
  return { email, password };
}
