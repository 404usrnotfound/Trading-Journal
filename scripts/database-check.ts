import { createDatabase } from '@journal/database';
import { verifyDatabaseSchema } from '@journal/database/migrate';
import { loadEnvironment, required, reportToolFailure } from './environment.js';

loadEnvironment();
const database = createDatabase(required('DATABASE_URL'));
try {
  await database.pool.query('SELECT 1');
  await verifyDatabaseSchema(database);
  console.log('Runtime application role connects successfully; database schema is current.');
} catch (error) {
  reportToolFailure('Database readiness', error);
} finally {
  await database.close();
}
