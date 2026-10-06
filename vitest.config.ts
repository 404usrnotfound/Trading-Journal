import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: false,
    coverage: { provider: 'v8', include: ['packages/**/src/**/*.ts'] },
  },
});
