import { defineConfig } from 'drizzle-kit';

// Candidate generation only. Reviewed SQL is applied by the controlled runner.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['app', 'auth'],
});
