import { cp, lstat, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Next standalone output needs static/public assets copied alongside server.js. */
export async function copyStandaloneAssets(repositoryRoot: string): Promise<void> {
  const web = resolve(repositoryRoot, 'apps/web');
  const standalone = resolve(web, '.next/standalone/apps/web');
  await mkdir(resolve(standalone, '.next'), { recursive: true });
  await cp(resolve(web, '.next/static'), resolve(standalone, '.next/static'), {
    recursive: true,
  });

  const publicDirectory = resolve(web, 'public');
  const metadata = await lstat(publicDirectory).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw new Error('Unable to inspect public assets.');
  });
  if (metadata === null) return;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('Public assets must be a directory.');
  }
  await cp(publicDirectory, resolve(standalone, 'public'), { recursive: true });
}
