import { defineConfig } from '@playwright/test';
import { loadEnvironment, testDatabaseUrls } from './scripts/environment.js';

loadEnvironment();
const port = Number(process.env.E2E_PORT ?? '3002');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid E2E_PORT.');
const origin = `http://localhost:${port}`;
const urls = testDatabaseUrls();
process.env.DATABASE_URL = urls.TEST_APP_DATABASE_URL;
process.env.AUTH_DATABASE_URL = urls.TEST_AUTH_DATABASE_URL;
process.env.JOB_DATABASE_URL = urls.TEST_JOB_DATABASE_URL;
process.env.APP_ORIGIN = origin;
process.env.NODE_ENV = 'test';
process.env.PORT = String(port);

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: 'corepack pnpm start:web',
    url: `${origin}/api/v1/health/live`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
