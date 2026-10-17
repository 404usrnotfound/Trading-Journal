import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { repositoryRoot } from '../../scripts/environment.js';

const requireWeb = createRequire(join(repositoryRoot, 'apps/web/postcss.config.mjs'));
const requireTailwind = createRequire(requireWeb.resolve('@tailwindcss/postcss'));
const postcss = requireTailwind('postcss');
const tailwind = requireWeb('@tailwindcss/postcss');
let fixture: string | undefined;

afterEach(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
  fixture = undefined;
});

it('builds web and shared UI utilities without scanning dependencies or generated output in a source-only release', async () => {
  fixture = await mkdtemp(join(tmpdir(), 'journal-css-sources-'));
  const files = {
    'apps/web/src/app/page.tsx': '<div className="bg-red-500" />',
    'packages/ui/src/button.tsx': '<button className="text-blue-500" />',
    'apps/web/.next/generated.tsx': '<div className="bg-purple-500" />',
    'apps/web/dependency-sentinel.tsx': '<div className="text-green-500" />',
  };
  for (const [path, content] of Object.entries(files)) {
    const target = join(fixture, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await symlink(
    join(repositoryRoot, 'apps/web/node_modules'),
    join(fixture, 'apps/web/node_modules'),
    'dir',
  );
  const globals = await readFile(join(repositoryRoot, 'apps/web/src/app/globals.css'), 'utf8');
  const sourceConfiguration = globals
    .split('\n')
    .filter((line) => /^@import ['"]tailwindcss['"]|^@source\s/.test(line))
    .join('\n');
  const result = await postcss([tailwind({ base: join(fixture, 'apps/web') })]).process(
    sourceConfiguration,
    { from: join(fixture, 'apps/web/src/app/globals.css') },
  );
  expect(result.css).toContain('.bg-red-500');
  expect(result.css).toContain('.text-blue-500');
  expect(result.css).not.toContain('.bg-purple-500');
  expect(result.css).not.toContain('.text-green-500');
  expect(result.css).not.toContain('.bg-purple-50');
});
