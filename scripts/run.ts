import { loadEnvironment } from './environment.js';
import {
  runtimeEnvironment,
  spawnPnpm,
  spawnServiceProcess,
  stopProcessGroups,
} from './processes.js';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot } from './environment.js';

loadEnvironment();
const commands: Record<string, string[]> = {
  'worker-dev': ['--filter', '@journal/worker', 'dev'],
  'worker-start': ['--filter', '@journal/worker', 'start'],
  'web-start': ['--filter', '@journal/web', 'start'],
};
const command = commands[process.argv[2] ?? ''];
if (!command) throw new Error('Unknown service command.');
// Next's generated standalone server forces NODE_ENV=production. Keep the local
// HTTP smoke/test runner in its configured environment; deployments use HTTPS.
const webStart = process.argv[2] === 'web-start' && process.env.NODE_ENV === 'production';
if (webStart) {
  const destination = resolve(repositoryRoot, 'apps/web/.next/standalone/apps/web/.next');
  await mkdir(destination, { recursive: true });
  await cp(resolve(repositoryRoot, 'apps/web/.next/static'), resolve(destination, 'static'), {
    recursive: true,
  });
}
const child = webStart
  ? spawnServiceProcess(
      process.execPath,
      [resolve(repositoryRoot, 'apps/web/.next/standalone/apps/web/server.js')],
      { ...runtimeEnvironment(), HOSTNAME: '0.0.0.0' },
    )
  : spawnPnpm(command);
let stopping = false;
async function stop(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  try {
    await stopProcessGroups([child]);
  } catch {
    console.error('Unable to stop the managed service cleanly.');
    process.exitCode = 1;
  }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void stop(0));
child.once('error', () => void stop(1));
child.once('exit', () => {
  if (!stopping) void stop(1);
});
