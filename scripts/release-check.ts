import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Fingerprint = { path: string; sha256: string; bytes: number };
type PackageManifest = {
  name: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
type Journal = {
  dialect: string;
  entries: { idx: number; tag: string; when: number }[];
};

export class ReleaseCheckError extends Error {}

async function requiredFile(root: string, path: string): Promise<Buffer> {
  try {
    const location = resolve(root, path);
    if (!(await stat(location)).isFile()) throw new Error();
    const content = await readFile(location);
    if (content.byteLength === 0) throw new Error();
    return content;
  } catch {
    throw new ReleaseCheckError(`Required release file is missing or empty: ${path}`);
  }
}

async function jsonFile<T>(root: string, path: string): Promise<T> {
  const content = await requiredFile(root, path);
  try {
    return JSON.parse(content.toString()) as T;
  } catch {
    throw new ReleaseCheckError(`Release JSON is invalid: ${path}`);
  }
}

const digest = (content: Buffer | string): string =>
  createHash('sha256').update(content).digest('hex');

async function fingerprint(root: string, path: string): Promise<Fingerprint> {
  const content = await requiredFile(root, path);
  return { path, sha256: digest(content), bytes: content.byteLength };
}

const excluded = new Set(['node_modules', '.next', 'dist']);
async function filesUnder(root: string, path: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.endsWith('.tsbuildinfo')) continue;
    const child = `${path}/${entry.name}`;
    if (entry.isSymbolicLink())
      throw new ReleaseCheckError(`Source tree contains a symbolic link: ${child}`);
    if (entry.isDirectory()) files.push(...(await filesUnder(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

export async function inspectReleaseSources(
  root: string,
  toolchain: { nodeVersion: string; pnpmVersion: string },
) {
  const nodePin = (await requiredFile(root, '.node-version')).toString().trim();
  const nvmPin = (await requiredFile(root, '.nvmrc')).toString().trim();
  const manifest = await jsonFile<PackageManifest>(root, 'package.json');
  if (
    nodePin !== nvmPin ||
    toolchain.nodeVersion !== nodePin ||
    manifest.packageManager !== `pnpm@${toolchain.pnpmVersion}`
  )
    throw new ReleaseCheckError(
      'The running Node/pnpm versions must exactly match the release pins.',
    );

  const sources = [
    '.node-version',
    '.nvmrc',
    '.npmrc',
    '.gitignore',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'tsconfig.base.json',
    ...(await filesUnder(root, 'apps')),
    ...(await filesUnder(root, 'packages')),
    ...(await filesUnder(root, 'scripts')),
  ].sort();
  for (const path of sources.filter(
    (path) => path.endsWith('/package.json') || path === 'package.json',
  )) {
    const pkg = await jsonFile<PackageManifest>(root, path);
    for (const dependencies of [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.optionalDependencies,
      pkg.peerDependencies,
    ])
      for (const version of Object.values(dependencies ?? {})) {
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) && version !== 'workspace:*')
          throw new ReleaseCheckError(`Package dependency is not exactly pinned: ${path}`);
      }
  }
  // The frozen installation is a separate executed release gate. This records
  // its inputs; it does not pretend a lockfile hash proves an install succeeded.
  const lockfile = await fingerprint(root, 'pnpm-lock.yaml');
  const journalPath = 'packages/database/migrations/meta/_journal.json';
  const journal = await jsonFile<Journal>(root, journalPath);
  if (
    !Array.isArray(journal.entries) ||
    journal.entries.length === 0 ||
    journal.dialect !== 'postgresql'
  )
    throw new ReleaseCheckError('Reviewed PostgreSQL migration journal is invalid.');
  let previousTime = -1;
  const tags = new Set<string>();
  const migrations: Fingerprint[] = [];
  for (const [index, entry] of journal.entries.entries()) {
    if (
      entry.idx !== index ||
      !/^\d{4}_[a-z0-9_]+$/.test(entry.tag) ||
      tags.has(entry.tag) ||
      !Number.isSafeInteger(entry.when) ||
      entry.when <= previousTime
    )
      throw new ReleaseCheckError('Reviewed migration order or journal identity is invalid.');
    previousTime = entry.when;
    tags.add(entry.tag);
    migrations.push(await fingerprint(root, `packages/database/migrations/${entry.tag}.sql`));
  }
  const sqlFiles = sources.filter((path) =>
    /^packages\/database\/migrations\/[^/]+\.sql$/.test(path),
  );
  if (
    JSON.stringify(sqlFiles.sort()) !== JSON.stringify(migrations.map((file) => file.path).sort())
  )
    throw new ReleaseCheckError('SQL migration files and the reviewed journal differ.');
  for (const path of [
    'scripts/run.ts',
    'scripts/processes.ts',
    'scripts/environment.ts',
    'scripts/standalone-assets.ts',
    'scripts/migrate.ts',
    'packages/database/src/migrate.ts',
    'apps/worker/src/migrate.ts',
  ])
    await requiredFile(root, path);
  const fingerprints = await Promise.all(sources.map((path) => fingerprint(root, path)));
  return {
    toolchain,
    lockfile,
    migrationJournal: await fingerprint(root, journalPath),
    migrations,
    sourceScope:
      'Root toolchain configuration and apps/, packages/, scripts/; excludes generated outputs and dependencies.',
    sourceSha256: digest(JSON.stringify(fingerprints)),
    sourceFiles: fingerprints,
  };
}

async function inspectJavaScriptClosure(root: string, entry: string, seen = new Set<string>()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const content = (await requiredFile(root, entry)).toString();
  for (const match of content.matchAll(/(?:from\s*|import\s*)["'](\.\.?\/[^"']+\.js)["']/g)) {
    const target = relative(root, resolve(root, entry, '..', match[1]!))
      .split(sep)
      .join('/');
    if (target.startsWith('../') || isAbsolute(target))
      throw new ReleaseCheckError('Compiled JavaScript refers outside the release.');
    await inspectJavaScriptClosure(root, target, seen);
  }
  const map = /\/\/# sourceMappingURL=([^\s]+)/.exec(content)?.[1];
  if (map) {
    const target = relative(root, resolve(root, entry, '..', map))
      .split(sep)
      .join('/');
    if (target.startsWith('../') || isAbsolute(target))
      throw new ReleaseCheckError('Source map refers outside the release.');
    await requiredFile(root, target);
    seen.add(target);
  }
  return seen;
}

export async function inspectReleaseArtifacts(root: string) {
  if (process.env.NAPI_RS_NATIVE_LIBRARY_PATH || process.env.NAPI_RS_FORCE_WASI)
    throw new ReleaseCheckError(
      'Native dependency overrides are unsupported during release verification.',
    );
  const standalone = 'apps/web/.next/standalone';
  const serverPath = `${standalone}/apps/web/server.js`;
  const webFiles = [
    'apps/web/.next/BUILD_ID',
    'apps/web/.next/build-manifest.json',
    'apps/web/.next/routes-manifest.json',
    'apps/web/.next/required-server-files.json',
    'apps/web/.next/server/app-paths-manifest.json',
    `${standalone}/package.json`,
    serverPath,
  ];
  const artifacts: Fingerprint[] = [];
  for (const path of webFiles) artifacts.push(await fingerprint(root, path));
  const appPaths = await jsonFile<Record<string, string>>(
    root,
    'apps/web/.next/server/app-paths-manifest.json',
  );
  const staticFiles = await filesUnder(root, 'apps/web/.next/static');
  if (staticFiles.length === 0) throw new ReleaseCheckError('Next static assets are missing.');
  const requireStandalone = createRequire(resolve(root, serverPath));
  const standaloneRoot = await realpath(resolve(root, standalone));
  const requireNext = createRequire(requireStandalone.resolve('next'));
  for (const [dependency, resolver] of [
    ['next', requireStandalone],
    ['react', requireNext],
    ['react-dom', requireNext],
    ['@node-rs/argon2', requireStandalone],
  ] as const) {
    let resolved: string;
    try {
      resolved = await realpath(resolver.resolve(dependency));
    } catch {
      throw new ReleaseCheckError(`Standalone dependency is missing: ${dependency}`);
    }
    const path = relative(standaloneRoot, resolved);
    if (path.startsWith(`..${sep}`) || isAbsolute(path))
      throw new ReleaseCheckError(`Standalone dependency escapes its artifact: ${dependency}`);
  }
  // Loading this trusted native dependency verifies the binary matches the
  // build host. Releases still need a smoke check on the deployment OS/CPU/libc.
  try {
    requireStandalone('@node-rs/argon2');
  } catch {
    throw new ReleaseCheckError('Standalone native Argon2 dependency cannot load on this host.');
  }
  const loaded = [requireStandalone.cache[requireStandalone.resolve('@node-rs/argon2')]];
  const visited = new Set<string>();
  const nativeAddons: string[] = [];
  while (loaded.length > 0) {
    const module = loaded.pop();
    if (!module || visited.has(module.filename)) continue;
    visited.add(module.filename);
    loaded.push(...module.children);
    if (!module.filename.endsWith('.node')) continue;
    const location = await realpath(module.filename);
    const path = relative(standaloneRoot, location);
    if (path.startsWith(`..${sep}`) || isAbsolute(path))
      throw new ReleaseCheckError(
        'Loaded native Argon2 dependency escapes its standalone artifact.',
      );
    nativeAddons.push(relative(root, location).split(sep).join('/'));
  }
  if (nativeAddons.length === 0)
    throw new ReleaseCheckError('No standalone native Argon2 binary was loaded.');
  for (const path of nativeAddons.sort()) artifacts.push(await fingerprint(root, path));
  const compiled = new Set<string>();
  for (const entry of [
    'packages/domain/dist/index.js',
    'apps/worker/dist/index.js',
    'apps/worker/dist/migrate.js',
  ])
    for (const path of await inspectJavaScriptClosure(root, entry)) compiled.add(path);
  for (const path of [...compiled].sort()) artifacts.push(await fingerprint(root, path));
  artifacts.push(await fingerprint(root, 'packages/domain/dist/index.d.ts'));
  for (const [entry, dependencies] of [
    ['apps/worker/dist/index.js', ['pg-boss', 'pino', 'zod']],
    ['packages/domain/dist/index.js', ['decimal.js']],
  ] as const) {
    const requireEntry = createRequire(resolve(root, entry));
    for (const dependency of dependencies) {
      try {
        requireEntry.resolve(dependency);
      } catch {
        throw new ReleaseCheckError(`Full-checkout runtime dependency is missing: ${dependency}`);
      }
    }
  }
  return {
    buildId: (await requiredFile(root, 'apps/web/.next/BUILD_ID')).toString().trim(),
    appRoutes: Object.keys(appPaths).sort(),
    staticAssetFiles: staticFiles.length,
    nativeArgon2Loaded: true,
    nativeAddonFiles: nativeAddons,
    artifacts,
    limitation:
      'Run immediately after the approved frozen install/build. Completeness and current-host dependency checks do not attest that existing outputs were built from these inputs, or prove byte-identical builds, database migration success, HTTPS, or deployment-host startup.',
  };
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pnpmVersion = /(?:^|\s)pnpm\/([^\s]+)/.exec(process.env.npm_config_user_agent ?? '')?.[1];
  if (!pnpmVersion)
    throw new ReleaseCheckError(
      'Invoke this check through the pinned corepack pnpm release:check command.',
    );
  const sources = await inspectReleaseSources(root, {
    nodeVersion: process.versions.node,
    pnpmVersion,
  });
  const artifacts = await inspectReleaseArtifacts(root);
  console.log(JSON.stringify({ schemaVersion: 1, ...sources, ...artifacts }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof ReleaseCheckError ? error.message : 'Release artifact check failed.',
    );
    process.exitCode = 1;
  });
}
