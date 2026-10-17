import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyQueueRoundTrip, type createRuntimeQueue } from '../../apps/worker/src/queue.js';
import { copyStandaloneAssets } from '../../scripts/standalone-assets.js';
import { repositoryRoot } from '../../scripts/environment.js';

describe('standalone release assets', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  async function fixture() {
    directory = await mkdtemp(join(tmpdir(), 'journal-standalone-'));
    await mkdir(join(directory, 'apps/web/.next/static'), { recursive: true });
    await writeFile(join(directory, 'apps/web/.next/static/chunk.js'), 'release-static');
    await mkdir(join(directory, '.private/storage'), { recursive: true });
    await writeFile(join(directory, '.private/storage/private-object'), 'must-not-copy');
    return directory;
  }

  it('copies required static assets when the release has no public directory', async () => {
    const root = await fixture();
    await copyStandaloneAssets(root);
    expect(
      await readFile(
        join(root, 'apps/web/.next/standalone/apps/web/.next/static/chunk.js'),
        'utf8',
      ),
    ).toBe('release-static');
    await expect(
      readFile(join(root, 'apps/web/.next/standalone/.private/storage/private-object')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('copies optional public assets alongside the standalone server', async () => {
    const root = await fixture();
    await mkdir(join(root, 'apps/web/public'));
    await writeFile(join(root, 'apps/web/public/robots.txt'), 'public-release-asset');
    await copyStandaloneAssets(root);
    expect(
      await readFile(join(root, 'apps/web/.next/standalone/apps/web/public/robots.txt'), 'utf8'),
    ).toBe('public-release-asset');
  });

  it('refuses a public root that links to private storage', async () => {
    const root = await fixture();
    await symlink(join(root, '.private/storage'), join(root, 'apps/web/public'));
    await expect(copyStandaloneAssets(root)).rejects.toThrow('Public assets must be a directory.');
  });
});

describe('worker probe shutdown', () => {
  const boss = () => {
    const send = vi.fn().mockResolvedValue('probe-job');
    const findJobs = vi.fn().mockResolvedValue([{ state: 'created' }]);
    return {
      send,
      findJobs,
      queue: { send, findJobs } as unknown as ReturnType<typeof createRuntimeQueue>,
    };
  };

  it('does not enqueue after shutdown has begun', async () => {
    const controller = new AbortController();
    controller.abort();
    const fixture = boss();
    await expect(verifyQueueRoundTrip(fixture.queue, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('interrupts polling without waiting for the fifteen-second readiness deadline', async () => {
    const controller = new AbortController();
    const fixture = boss();
    const probe = verifyQueueRoundTrip(fixture.queue, controller.signal);
    const rejected = expect(probe).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fixture.findJobs).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    expect(fixture.findJobs).toHaveBeenCalledOnce();
  });

  it('does not publish success if termination arrives during an in-flight query', async () => {
    const controller = new AbortController();
    const fixture = boss();
    fixture.findJobs.mockImplementation(async () => {
      controller.abort();
      return [{ state: 'completed' }];
    });
    await expect(verifyQueueRoundTrip(fixture.queue, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('service launcher drain budget', () => {
  it('allows an owned worker child to finish a drain longer than five seconds', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'journal-drain-'));
    const stub = join(directory, 'worker-stub.mjs');
    await writeFile(
      stub,
      `
      const keepAlive = setInterval(() => {}, 1000);
      process.once('SIGTERM', () => {
        setTimeout(() => {
          clearInterval(keepAlive);
          process.stdout.write('fixture-drained\\n');
        }, 6000);
      });
      process.stdout.write('fixture-ready:' + process.pid + '\\n');
    `,
    );
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(repositoryRoot, 'scripts/run.ts'), 'worker-start'],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          npm_execpath: stub,
          NODE_ENV: 'test',
          JOB_DATABASE_URL: 'postgresql://journal_jobs:fixture-only@localhost/not-used',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.resume();
    child.on('error', () => undefined);
    try {
      await vi.waitFor(() => expect(output.includes('fixture-ready:')).toBe(true), {
        timeout: 5_000,
      });
      child.kill('SIGTERM');
      await vi.waitFor(
        () => expect(child.exitCode !== null || child.signalCode !== null).toBe(true),
        { timeout: 12_000 },
      );
      expect(output.includes('fixture-drained')).toBe(true);
      expect(child.exitCode).toBe(0);
      expect(child.signalCode).toBeNull();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        const stubPid = Number(/fixture-ready:(\d+)/.exec(output)?.[1]);
        if (Number.isSafeInteger(stubPid) && stubPid > 0) {
          try {
            process.kill(-stubPid, 'SIGKILL');
          } catch {
            /* Owned process group already exited. */
          }
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
