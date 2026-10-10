import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from '../../scripts/environment.js';

const eslint = new ESLint({ cwd: repositoryRoot });

async function architectureErrors(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath });
  if (!result) throw new Error('ESLint did not inspect the boundary fixture.');
  return result.messages.filter((message) => message.ruleId === 'architecture/client-boundary');
}

describe('enforced package boundaries', () => {
  it.each([
    "import { createDatabase } from '@journal/database';",
    "export * from '@journal/server';",
    "export { createDatabase } from '@journal/database';",
    "const load = () => import('@journal/server');",
    'const load = () => import(`@journal/server`);',
    'const load = (moduleName: string) => import(moduleName);',
    "type ServerModule = typeof import('@journal/server');",
    "import { readFile } from 'fs/promises';",
    "import { readFile } from 'node:fs/promises';",
    "import { createDatabase } from '../../../packages/database/src/index.js';",
    "const load = () => import('../../../packages/server/src/config.js');",
    "import { betterAuth } from 'better-auth';",
  ])('blocks server infrastructure from browser modules: %s', async (source) => {
    expect(
      await architectureErrors(`'use client';\n${source}`, 'apps/web/components/fixture.ts'),
    ).toHaveLength(1);
  });

  it('treats the shared UI package as browser code without requiring a directive', async () => {
    expect(
      await architectureErrors("import pg from 'pg';", 'packages/ui/src/fixture.ts'),
    ).toHaveLength(1);
  });

  it.each([
    "import { createDatabase } from '@journal/database';",
    "const load = () => import('node:crypto');",
    "export * from '@journal/contracts';",
    "import React from 'react';",
  ])('keeps domain independent of transport and infrastructure: %s', async (source) => {
    expect(await architectureErrors(source, 'packages/domain/src/fixture.ts')).toHaveLength(1);
  });

  it('permits public contracts in browser modules and server composition imports', async () => {
    expect(
      await architectureErrors(
        "'use client';\nimport { signInSchema } from '@journal/contracts';",
        'apps/web/components/fixture.ts',
      ),
    ).toEqual([]);
    expect(
      await architectureErrors(
        "import { createDatabase } from '@journal/database';",
        'apps/web/lib/server.ts',
      ),
    ).toEqual([]);
  });
});
