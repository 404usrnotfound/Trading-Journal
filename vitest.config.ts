import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const requireWeb = createRequire(new URL('./apps/web/package.json', import.meta.url));

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      'next/navigation': requireWeb.resolve('next/navigation'),
      '@tanstack/react-query': requireWeb.resolve('@tanstack/react-query'),
      recharts: requireWeb.resolve('recharts'),
    },
  },
  test: {
    // Bound concurrent parser/DOM startup on shared cloud/CI CPUs; keep every case enabled.
    maxWorkers: 2,
    // Linter/process initialization and dense financial oracles are correctness checks,
    // not five-second latency benchmarks on a shared runner.
    testTimeout: 30_000,
    passWithNoTests: false,
    coverage: { provider: 'v8', include: ['packages/**/src/**/*.ts'] },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.tsx'],
          setupFiles: ['tests/ui/setup.ts'],
        },
      },
    ],
  },
});
