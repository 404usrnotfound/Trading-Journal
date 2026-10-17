import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { inspectReleaseArtifacts, inspectReleaseSources } from '../../scripts/release-check';

const roots: string[] = [];
const toolchain = { nodeVersion: '24.19.0', pnpmVersion: '10.34.6' };

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'journal-release-check-'));
  roots.push(root);
  const files: Record<string, string> = {
    '.node-version': '24.19.0\n',
    '.nvmrc': '24.19.0\n',
    '.npmrc': 'engine-strict=true\n',
    '.gitignore': 'node_modules/\n.next/\ndist/\n',
    'package.json': JSON.stringify({ name: 'fixture', packageManager: 'pnpm@10.34.6' }),
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'pnpm-workspace.yaml': 'packages: [apps/*, packages/*]\n',
    'tsconfig.json': '{}',
    'tsconfig.base.json': '{}',
    'apps/worker/src/migrate.ts': 'export {};',
    'packages/database/src/migrate.ts': 'export {};',
    'packages/database/migrations/meta/_journal.json': JSON.stringify({
      dialect: 'postgresql',
      entries: [{ idx: 0, when: 1, tag: '0000_fixture' }],
    }),
    'packages/database/migrations/0000_fixture.sql': 'SELECT 1;\n',
    'scripts/run.ts': 'export {};',
    'scripts/processes.ts': 'export {};',
    'scripts/environment.ts': 'export {};',
    'scripts/standalone-assets.ts': 'export {};',
    'scripts/migrate.ts': 'export {};',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(resolve(root, path, '..'), { recursive: true });
    await writeFile(resolve(root, path), content);
  }
  return root;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('release input and artifact gates', () => {
  it('records reproducible source and exact SQL fingerprints without modifying inputs', async () => {
    const root = await fixture();
    const before = await readFile(resolve(root, 'pnpm-lock.yaml'));
    const first = await inspectReleaseSources(root, toolchain);
    const repeated = await inspectReleaseSources(root, toolchain);
    expect(first).toEqual(repeated);
    expect(first.migrations).toEqual([
      {
        path: 'packages/database/migrations/0000_fixture.sql',
        bytes: 10,
        sha256: createHash('sha256').update('SELECT 1;\n').digest('hex'),
      },
    ]);
    expect(await readFile(resolve(root, 'pnpm-lock.yaml'))).toEqual(before);
    await writeFile(resolve(root, 'packages/database/migrations/0000_fixture.sql'), 'SELECT 2;\n');
    expect((await inspectReleaseSources(root, toolchain)).sourceSha256).not.toBe(
      first.sourceSha256,
    );
  });

  it('rejects a missing reviewed SQL file and an unjournaled SQL file', async () => {
    const root = await fixture();
    await rm(resolve(root, 'packages/database/migrations/0000_fixture.sql'));
    await expect(inspectReleaseSources(root, toolchain)).rejects.toThrow('0000_fixture.sql');
    await writeFile(resolve(root, 'packages/database/migrations/0000_fixture.sql'), 'SELECT 1;');
    await writeFile(resolve(root, 'packages/database/migrations/0001_unreviewed.sql'), 'SELECT 2;');
    await expect(inspectReleaseSources(root, toolchain)).rejects.toThrow('reviewed journal differ');
  });

  it('requires and fingerprints release ignore rules alongside the build inputs', async () => {
    const root = await fixture();
    const before = await inspectReleaseSources(root, toolchain);
    expect(before.sourceFiles.some((file) => file.path === '.gitignore')).toBe(true);
    await writeFile(resolve(root, '.gitignore'), 'node_modules/\n.next/\ndist/\nwork/\n');
    expect((await inspectReleaseSources(root, toolchain)).sourceSha256).not.toBe(
      before.sourceSha256,
    );
    await rm(resolve(root, '.gitignore'));
    await expect(inspectReleaseSources(root, toolchain)).rejects.toThrow('.gitignore');
  });

  it('rejects reordered or traversing migration journal entries before reading them', async () => {
    const root = await fixture();
    for (const entry of [
      { idx: 1, when: 1, tag: '0000_fixture' },
      { idx: 0, when: 1, tag: '../../private' },
    ]) {
      await writeFile(
        resolve(root, 'packages/database/migrations/meta/_journal.json'),
        JSON.stringify({ dialect: 'postgresql', entries: [entry] }),
      );
      await expect(inspectReleaseSources(root, toolchain)).rejects.toThrow('journal identity');
    }
  });

  it('rejects duplicate journal tags even when the SQL file count happens to match', async () => {
    const root = await fixture();
    await writeFile(resolve(root, 'packages/database/migrations/0001_orphan.sql'), 'SELECT 2;');
    await writeFile(
      resolve(root, 'packages/database/migrations/meta/_journal.json'),
      JSON.stringify({
        dialect: 'postgresql',
        entries: [
          { idx: 0, when: 1, tag: '0000_fixture' },
          { idx: 1, when: 2, tag: '0000_fixture' },
        ],
      }),
    );
    await expect(inspectReleaseSources(root, toolchain)).rejects.toThrow('journal identity');
  });

  it('rejects native library overrides without exposing their values', async () => {
    const root = await fixture();
    const privatePath = '/private/example-credential';
    vi.stubEnv('NAPI_RS_NATIVE_LIBRARY_PATH', privatePath);
    await expect(inspectReleaseArtifacts(root)).rejects.toThrow(
      'Native dependency overrides are unsupported during release verification.',
    );
    try {
      await inspectReleaseArtifacts(root);
    } catch (error) {
      expect(String(error)).not.toContain(privatePath);
    }
  });

  it('rejects toolchain drift and non-exact dependency declarations', async () => {
    const root = await fixture();
    await expect(
      inspectReleaseSources(root, { ...toolchain, nodeVersion: '24.20.0' }),
    ).rejects.toThrow('exactly match');
    await expect(
      inspectReleaseSources(root, { ...toolchain, pnpmVersion: '10.35.0' }),
    ).rejects.toThrow('exactly match');
    await writeFile(
      resolve(root, 'apps/worker/package.json'),
      JSON.stringify({ name: 'fixture', dependencies: { example: '^1.0.0' } }),
    );
    await expect(inspectReleaseSources(root, toolchain)).rejects.toThrow('not exactly pinned');
  });

  it('does not let development pins hide a production range, or ignore peer/optional ranges', async () => {
    const root = await fixture();
    for (const fields of [
      { dependencies: { example: '^1.0.0' }, devDependencies: { example: '1.0.0' } },
      { peerDependencies: { example: '^1.0.0' } },
      { optionalDependencies: { example: '^1.0.0' } },
    ]) {
      await writeFile(
        resolve(root, 'apps/worker/package.json'),
        JSON.stringify({ name: 'fixture', ...fields }),
      );
      await expect(inspectReleaseSources(root, toolchain)).rejects.toThrow('not exactly pinned');
    }
  });

  it('fails an unbuilt or incomplete release rather than accepting source presence', async () => {
    const root = await fixture();
    await expect(inspectReleaseArtifacts(root)).rejects.toThrow('apps/web/.next/BUILD_ID');
  });
});
