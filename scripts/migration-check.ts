import { migrateDatabase, verifyDatabaseSchema } from '@journal/database/migrate';
import { loadEnvironment, testDatabaseUrls, reportToolFailure } from './environment.js';

loadEnvironment();
try {
  const url = testDatabaseUrls().TEST_DATABASE_URL;
  await migrateDatabase(url);
  await migrateDatabase(url);
  await verifyDatabaseSchema(url);
  console.log('Isolated test database migrations and repeatability checks passed.');
} catch (error) {
  reportToolFailure('Migration check', error);
}
