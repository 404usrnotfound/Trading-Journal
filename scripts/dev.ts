import { getServerConfig } from '@journal/server/config';
import { loadEnvironment } from './environment.js';
import { spawnPnpm, stopProcessGroups } from './processes.js';

loadEnvironment();
getServerConfig();
const production = process.argv.includes('--production');
const children = [
  spawnPnpm(production ? ['start:web'] : ['--filter', '@journal/web', 'dev']),
  spawnPnpm(['--filter', '@journal/worker', production ? 'start' : 'dev']),
];
let stopping = false;
async function stop(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  try {
    await stopProcessGroups(children, 10_000);
  } catch {
    console.error('Unable to stop every development service cleanly.');
    process.exitCode = 1;
  }
}
process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));
for (const child of children) {
  child.once('error', () => void stop(1));
  child.once('exit', () => {
    if (!stopping) void stop(1);
  });
}
