import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { repositoryRoot } from './environment.js';

const detachedChildren = new WeakSet<ChildProcess>();

const systemBindings = new Set([
  'PATH',
  'HOME',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'SYSTEMROOT',
  'SystemRoot',
  'COMSPEC',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'TERM',
  'COLORTERM',
  'FORCE_COLOR',
  'NO_COLOR',
  'CI',
  'COREPACK_HOME',
  'COREPACK_ENABLE_NETWORK',
  'COREPACK_ENABLE_DOWNLOAD_PROMPT',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'npm_config_cache',
  'PLAYWRIGHT_BROWSERS_PATH',
  'NEXT_TELEMETRY_DISABLED',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
]);
const webBindings = new Set([
  'NODE_ENV',
  'PORT',
  'WEB_HOST',
  'DATABASE_URL',
  'AUTH_DATABASE_URL',
  'JOB_DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'APP_ORIGIN',
  'STORAGE_ROOT',
  'LOG_LEVEL',
]);
const workerBindings = new Set([
  'NODE_ENV',
  'JOB_DATABASE_URL',
  'WORKER_HEALTH_HOST',
  'WORKER_HEALTH_PORT',
  'LOG_LEVEL',
]);

/** Pass declared service bindings, never the operator's full credential set. */
export function runtimeEnvironment(
  worker = false,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const bindings = worker ? workerBindings : webBindings;
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (systemBindings.has(name) || name.startsWith('LC_') || bindings.has(name)) {
      environment[name] = value;
    }
  }
  if (environment.STORAGE_ROOT)
    environment.STORAGE_ROOT = resolve(repositoryRoot, environment.STORAGE_ROOT);
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
