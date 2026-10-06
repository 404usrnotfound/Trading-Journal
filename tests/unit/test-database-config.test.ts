import { describe, expect, it } from 'vitest';
import { testDatabaseUrls } from '../../scripts/environment.js';

const environment = {
  TEST_DATABASE_URL: 'postgresql://postgres:test@localhost:5433/journal_test',
  TEST_APP_DATABASE_URL: 'postgresql://app:test@localhost:5433/journal_test',
  TEST_AUTH_DATABASE_URL: 'postgresql://auth:test@localhost:5433/journal_test',
  TEST_JOB_DATABASE_URL: 'postgresql://jobs:test@localhost:5433/journal_test',
  MIGRATION_DATABASE_URL: 'postgresql://postgres:test@localhost:5432/journal',
};
describe('isolated test database guard', () => {
  it('accepts separate roles on the same dedicated database', () => {
    expect(testDatabaseUrls(environment)).toHaveProperty(
      'TEST_AUTH_DATABASE_URL',
      environment.TEST_AUTH_DATABASE_URL,
    );
  });
  it('rejects a runtime fixture binding pointing at user data or a different instance', () => {
    expect(() =>
      testDatabaseUrls({
        ...environment,
        TEST_AUTH_DATABASE_URL: 'postgresql://auth:hidden@localhost:5432/journal',
      }),
    ).toThrow('TEST_AUTH_DATABASE_URL');
    expect(() =>
      testDatabaseUrls({
        ...environment,
        TEST_JOB_DATABASE_URL: 'postgresql://jobs:hidden@localhost:5432/journal_test',
      }),
    ).toThrow('TEST_JOB_DATABASE_URL');
  });
  it('rejects a test target that is also the development migration target', () => {
    expect(() =>
      testDatabaseUrls({ ...environment, MIGRATION_DATABASE_URL: environment.TEST_DATABASE_URL }),
    ).toThrow('must differ');
  });
});
