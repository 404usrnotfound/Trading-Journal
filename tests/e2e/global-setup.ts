import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import setupDatabase from '../integration/global-setup.js';

export default async function setup() {
  await setupDatabase();
  const email = `browser-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  await bootstrapOwner(
    { email, password, name: 'Browser test owner' },
    parseServerConfig(process.env),
  );
  process.env.TEST_OWNER_EMAIL = email;
  process.env.TEST_OWNER_PASSWORD = password;
}
