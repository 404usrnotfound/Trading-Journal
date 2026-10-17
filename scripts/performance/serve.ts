/** Run previously built web assets against one isolated performance fixture. */
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseServerConfig } from '@journal/server';
import { loadEnvironment, repositoryRoot } from '../environment.js';
import { runtimeEnvironment, spawnServiceProcess, stopProcessGroups } from '../processes.js';
import { loadPerformanceBindings, type PerformanceManifest } from './dataset.js';

const { values } = parseArgs({
  options: {
    manifest: { type: 'string', default: process.env.PERFORMANCE_MANIFEST },
    origin: { type: 'string', default: process.env.PERFORMANCE_ORIGIN ?? 'http://localhost:3002' },
  },
});
if (!values.manifest) throw new Error('--manifest is required.');
const origin = new URL(values.origin);
if (
  origin.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(origin.hostname) ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error(
    'The benchmark server requires a loopback HTTP origin without credentials or path.',
  );
const port = Number(origin.port || '80');
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose an unprivileged benchmark port.');
await access(resolve(repositoryRoot, 'apps/web/.next/BUILD_ID'));
const manifest = JSON.parse(
  await readFile(resolve(values.manifest), 'utf8'),
) as PerformanceManifest;
if (manifest.schemaVersion !== 1) throw new Error('A version-one fixture manifest is required.');
const bindings = await loadPerformanceBindings(manifest);
loadEnvironment();
const source: NodeJS.ProcessEnv = {
  ...process.env,
  ...bindings,
  NODE_ENV: 'test',
  APP_ORIGIN: origin.origin,
  PORT: String(port),
  WEB_HOST: '127.0.0.1',
};
parseServerConfig(source);
// Preserve existing services: verify the selected port is free before spawning anything.
await new Promise<void>((done, reject) => {
  const probe = createServer();
  probe.once('error', (error: NodeJS.ErrnoException) =>
    reject(new Error(`The benchmark port probe failed (${error.code ?? 'UNKNOWN'}).`)),
  );
  probe.listen(port, '127.0.0.1', () => probe.close((error) => (error ? reject(error) : done())));
});
const child = spawnServiceProcess(
  process.execPath,
  [resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'), 'scripts/run.ts', 'web-start'],
  // The allowlist excludes the operator URL and generated owner password.
  runtimeEnvironment(false, source),
);
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  await stopProcessGroups([child], 10_000);
}
process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));
child.once('error', () => void stop(1));
child.once('exit', () => {
  if (!stopping) void stop(1);
});
const deadline = Date.now() + 120_000;
while (!stopping && Date.now() < deadline) {
  try {
    const response = await fetch(`${origin.origin}/api/v1/health/live`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (response.ok) {
      console.log(
        JSON.stringify({
          event: 'performance-server-ready',
          pid: process.pid,
          origin: origin.origin,
          databaseName: manifest.databaseName,
        }),
      );
      break;
    }
  } catch {
    // Readiness retries contain no request credentials or response bodies.
  }
  await new Promise<void>((done) => setTimeout(done, 100));
}
if (!stopping && Date.now() >= deadline) {
  await stop(1);
  throw new Error('The isolated benchmark server did not become ready.');
}
