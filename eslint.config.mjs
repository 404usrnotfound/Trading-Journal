import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const boundaries = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    let client = context.filename.includes('/packages/ui/');
    return {
      Program(node) {
        client ||= node.body.some((statement) => statement.directive === 'use client');
      },
      ImportDeclaration(node) {
        if (client && /^(?:@journal\/(?:server|database)|node:)/u.test(node.source.value)) {
          context.report({
            node,
            message: 'Client code cannot import server, database or Node modules.',
          });
        }
      },
    };
  },
};
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'packages/contracts/src/generated/**',
      'playwright-report/**',
      'test-results/**',
      '.cache/**',
      '.private/**',
      '.data/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    ...reactHooks.configs.flat.recommended,
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { architecture: { rules: { 'client-boundary': boundaries } } },
    rules: {
      'architecture/client-boundary': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', '@journal/server*', '@journal/database*', 'react', 'next*', 'pg'] },
      ],
    },
  },
);
