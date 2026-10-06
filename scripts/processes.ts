import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { repositoryRoot } from './environment.js';

const detachedChildren = new WeakSet<ChildProcess>();

export function runtimeEnvironment(worker = false): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  if (environment.STORAGE_ROOT)
    environment.STORAGE_ROOT = resolve(repositoryRoot, environment.STORAGE_ROOT);
  for (const name of Object.keys(environment)) {
    if (
      name === 'MIGRATION_DATABASE_URL' ||
      name === 'POSTGRES_PASSWORD' ||
      name.startsWith('TEST_') ||
      name === 'BOOTSTRAP_PASSWORD'
    )
      delete environment[name];
    if (worker && ['DATABASE_URL', 'AUTH_DATABASE_URL', 'BETTER_AUTH_SECRET'].includes(name))
      delete environment[name];
  }
  return environment;
}

export function spawnPnpm(args: string[]): ChildProcess {
  const cli = process.env.npm_execpath;
  const environment = runtimeEnvironment(args.includes('@journal/worker'));
  return cli
    ? spawnServiceProcess(process.execPath, [cli, ...args], environment)
    : spawnServiceProcess('corepack', ['pnpm', ...args], environment);
}

export function spawnServiceProcess(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv = runtimeEnvironment(),
): ChildProcess {
  const detached = process.platform !== 'win32';
  const child = spawn(executable, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
    detached,
  });
  if (detached) detachedChildren.add(child);
  return child;
}

function groupAlive(child: ChildProcess): boolean {
  if (!child.pid) return false;
  if (!detachedChildren.has(child)) return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ESRCH')
      return false;
    return true;
  }
}

function signalGroup(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (!child.pid) return;
  try {
    // Signal only detached groups created by this module, never the caller's
    // inherited group or an arbitrary PID supplied by another application.
    if (detachedChildren.has(child)) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (!(typeof error === 'object' && error && 'code' in error && error.code === 'ESRCH')) {
      throw new Error('Unable to stop a managed service process');
    }
  }
}

async function stopWindowsTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  // Windows lacks POSIX process-group signals; taskkill's tree option prevents
  // grandchildren from surviving. Linux production gets graceful SIGTERM first.
  await new Promise<void>((resolve) => {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {
      if (groupAlive(child)) child.kill('SIGTERM');
      resolve();
    });
  });
}

export async function stopProcessGroups(
  children: readonly ChildProcess[],
  gracePeriodMs = 5_000,
): Promise<void> {
  if (process.platform === 'win32') {
    await Promise.all(children.map(stopWindowsTree));
    return;
  }
  for (const child of children) signalGroup(child, 'SIGTERM');
  const deadline = Date.now() + gracePeriodMs;
  while (children.some(groupAlive) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  for (const child of children.filter(groupAlive)) signalGroup(child, 'SIGKILL');
}
