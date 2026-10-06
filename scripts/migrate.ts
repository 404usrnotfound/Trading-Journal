import { migrateDatabase, provisionRuntimeRoles } from '@journal/database/migrate';
import { migrateJobs } from '@journal/worker/migrate';
import { databasePassword, loadEnvironment, reportToolFailure, required } from './environment.js';

loadEnvironment();
try {
  const url = required('MIGRATION_DATABASE_URL');
  await migrateDatabase(url);
  await migrateJobs(url);
  await provisionRuntimeRoles(url, {
    appPassword: databasePassword(required('DATABASE_URL')),
    authPassword: databasePassword(required('AUTH_DATABASE_URL')),
    jobsPassword: databasePassword(required('JOB_DATABASE_URL')),
  });
  console.log('Database and queue migrations applied; least-privilege runtime roles provisioned.');
} catch (error) {
  reportToolFailure('Migration', error);
}
