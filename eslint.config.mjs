import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';

const nodeModules = new Set(builtinModules.map((name) => name.replace(/^node:/u, '')));
const infrastructurePackages =
  /^(?:@journal\/(?:server|database|worker)(?:\/|$)|better-auth(?:\/|$)|drizzle-orm(?:\/|$)|pg(?:\/|$)|pg-boss(?:\/|$)|pino(?:\/|$)|dotenv(?:\/|$)|server-only$)/u;

function moduleSpecifier(node) {
  if (typeof node?.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked;
  return undefined;
}

function importsInfrastructure(source, filename) {
  if (typeof source !== 'string') return false;
  if (source.startsWith('node:') || nodeModules.has(source) || infrastructurePackages.test(source))
    return true;
  if (source.startsWith('.')) {
    const target = resolve(dirname(filename), source).replaceAll('\\', '/');
    return /\/(?:packages\/(?:server|database)|apps\/worker|scripts)(?:\/|$)/u.test(target);
  }
  return false;
}

const boundaries = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    let client = filename.includes('/packages/ui/');
    const domain = filename.includes('/packages/domain/src/');
    function check(node, source) {
      if (
        ((client || domain) && typeof source !== 'string') ||
        (client && importsInfrastructure(source, filename)) ||
        (domain &&
          (importsInfrastructure(source, filename) ||
            /^(?:@journal\/(?:contracts|ui)(?:\/|$)|react(?:\/|$)|react-dom(?:\/|$)|next(?:\/|$))/u.test(
              source ?? '',
            )))
      )
        context.report({
          node,
          message: client
            ? 'Client code cannot import server infrastructure or Node modules.'
            : 'Domain code cannot import transport, framework or infrastructure modules.',
        });
    }
    return {
      Program(node) {
        client ||= node.body.some((statement) => statement.directive === 'use client');
      },
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        check(node, moduleSpecifier(node.source));
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require')
          check(node, moduleSpecifier(node.arguments[0]));
      },
      TSExternalModuleReference(node) {
        check(node, node.expression.value);
      },
      TSImportType(node) {
        check(node, moduleSpecifier(node.source));
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
    files: ['**/*.{js,mjs,ts,tsx}'],
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
