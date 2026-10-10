import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import type { FullConfig } from '@playwright/test';
import { testDatabaseUrls } from '../../scripts/environment.js';
import setupDatabase from '../integration/global-setup.js';

export default async function setup(config: FullConfig) {
  await setupDatabase();
  const urls = testDatabaseUrls();
  const origin = config.projects[0]?.use.baseURL;
  if (!origin) throw new Error('The browser-test application origin is required.');
  const email = `browser-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  await bootstrapOwner(
    { email, password, name: 'Browser test owner' },
    parseServerConfig({
      ...process.env,
      DATABASE_URL: urls.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: urls.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: urls.TEST_JOB_DATABASE_URL,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
    }),
  );
  process.env.TEST_OWNER_EMAIL = email;
  process.env.TEST_OWNER_PASSWORD = password;
}
