import { parseArgs } from 'node:util';
import { createDatabase } from '@journal/database';
import { getServerConfig, seedDemoWorkspace } from '@journal/server';
import { loadEnvironment, reportToolFailure } from './environment.js';

loadEnvironment();
const { values } = parseArgs({ options: { email: { type: 'string' } } });
try {
  if (!values.email) throw new Error('An existing owner --email is required.');
  const database = createDatabase(getServerConfig().authDatabaseUrl);
  let actorId: string | undefined;
  try {
    const result = await database.pool.query<{ id: string }>(
      'SELECT id FROM auth."user" WHERE email = $1',
      [values.email.toLowerCase()],
    );
    actorId = result.rows[0]?.id;
  } finally {
    await database.close();
  }
  if (!actorId) throw new Error('Create the owner before seeding.');
  await seedDemoWorkspace(actorId);
  console.log(
    'Demo workspace is ready. It is labeled and empty; no financial records were seeded.',
  );
} catch (error) {
  reportToolFailure('Demo seed', error);
}
