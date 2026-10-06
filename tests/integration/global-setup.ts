import { migrateDatabase, provisionRuntimeRoles } from '@journal/database/migrate';
import { migrateJobs } from '@journal/worker/migrate';
import { databasePassword, loadEnvironment, testDatabaseUrls } from '../../scripts/environment.js';

export default async function setup() {
  loadEnvironment();
  const urls = testDatabaseUrls();
  const url = urls.TEST_DATABASE_URL;
  await migrateDatabase(url);
  await migrateJobs(url);
  await provisionRuntimeRoles(url, {
    appPassword: databasePassword(urls.TEST_APP_DATABASE_URL),
    authPassword: databasePassword(urls.TEST_AUTH_DATABASE_URL),
    jobsPassword: databasePassword(urls.TEST_JOB_DATABASE_URL),
  });
}
