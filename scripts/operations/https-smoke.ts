/** Actual production-mode standalone app behind an isolated, trusted local TLS proxy. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingHttpHeaders,
} from 'node:http';
import { Agent, createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { createServer as createPortProbe, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TLSSocket } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { createDatabase } from '@journal/database';
import { migrateDatabase, provisionRuntimeRoles } from '@journal/database/migrate';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import { migrateJobs } from '@journal/worker/migrate';
import {
  databasePassword,
  loadEnvironment,
  repositoryRoot,
  testDatabaseUrls,
} from '../environment.js';
import { runtimeEnvironment, spawnServiceProcess, stopProcessGroups } from '../processes.js';
import { productionPreflight } from './production-preflight.js';

const execute = promisify(execFile);

async function freePort(): Promise<number> {
  const server = createPortProbe();
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  return port;
}

async function certificates(directory: string) {
  const caKey = join(directory, 'ca.key');
  const ca = join(directory, 'ca.pem');
  const key = join(directory, 'server.key');
  const csr = join(directory, 'server.csr');
  const cert = join(directory, 'server.pem');
  const wrongCa = join(directory, 'wrong-ca.pem');
  const extensions = join(directory, 'server.ext');
  await writeFile(
    extensions,
    'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n',
    { mode: 0o600 },
  );
  for (const args of [
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      caKey,
      '-out',
      ca,
      '-subj',
      '/CN=Journal Readiness Test CA',
    ],
    ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', '/CN=localhost'],
    [
      'x509',
      '-req',
      '-days',
      '1',
      '-in',
      csr,
      '-CA',
      ca,
      '-CAkey',
      caKey,
      '-CAcreateserial',
      '-out',
      cert,
      '-extfile',
      extensions,
    ],
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      join(directory, 'wrong-ca.key'),
      '-out',
      wrongCa,
      '-subj',
      '/CN=Untrusted Readiness Test CA',
    ],
  ])
    await execute('openssl', args, { cwd: directory, timeout: 15_000 });
  return {
    ca: await readFile(ca),
    wrongCa: await readFile(wrongCa),
    key: await readFile(key),
    cert: await readFile(cert),
  };
}

type Reply = { status: number; headers: IncomingHttpHeaders; body: Buffer; authorized: boolean };

function singleHeader(reply: Reply, name: string): string {
  const value = reply.headers[name];
  // Security headers must be present and singular; joining an array could hide
  // conflicting policies or an ambiguous CSRF value.
  assert.ok(typeof value === 'string', 'SMOKE_SINGLE_HEADER_REQUIRED');
  return value;
}

function request(
  port: number,
  agent: Agent,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<Reply> {
  return new Promise((done, reject) => {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const outgoing = httpsRequest(
      {
        hostname: 'localhost',
        family: 4,
        port,
        path,
        agent,
        method: options.method ?? 'GET',
        signal: AbortSignal.timeout(15_000),
        headers: {
          ...(body
            ? {
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(body)),
              }
            : {}),
          ...options.headers,
        },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let length = 0;
        const authorized = incoming.socket instanceof TLSSocket && incoming.socket.authorized;
        incoming.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > 2 * 1024 * 1024) incoming.destroy(new Error('SMOKE_RESPONSE_LIMIT'));
          else chunks.push(chunk);
        });
        incoming.once('error', reject);
        incoming.once('end', () =>
          done({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks),
            authorized,
          }),
        );
      },
    );
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

export async function runHttpsSmoke() {
  loadEnvironment();
  const urls = testDatabaseUrls();
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    throw new Error('TLS_VERIFICATION_REQUIRED');
  const standaloneEntry = resolve(repositoryRoot, 'apps/web/.next/standalone/apps/web/server.js');
  await access(standaloneEntry);
  const applicationBuildId = (
    await readFile(resolve(repositoryRoot, 'apps/web/.next/BUILD_ID'), 'utf8')
  ).trim();
  assert.match(applicationBuildId, /^[A-Za-z0-9_-]+$/);
  const standaloneServerSha256 = createHash('sha256')
    .update(await readFile(standaloneEntry))
    .digest('hex');
  const launcherSha256 = createHash('sha256')
    .update(await readFile(resolve(repositoryRoot, 'scripts/run.ts')))
    .digest('hex');
  const directory = await mkdtemp(join(tmpdir(), 'journal-production-https-'));
  const databaseName = `journal_https_${randomUUID().replaceAll('-', '')}_test`;
  const fixtureUrl = (value: string) => {
    const url = new URL(value);
    url.pathname = `/${databaseName}`;
    return url.toString();
  };
  const admin = createDatabase(urls.TEST_DATABASE_URL, { max: 1 });
  let created = false;
  let child: ReturnType<typeof spawnServiceProcess> | undefined;
  let proxy: ReturnType<typeof createHttpsServer> | undefined;
  let redirect: ReturnType<typeof createHttpServer> | undefined;
  const agents: Agent[] = [];
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const previousMask = process.umask(0o077);
  let cleanupFailed = false;
  try {
    const material = await certificates(directory);
    const backendPort = await freePort();
    proxy = createHttpsServer(
      { key: material.key, cert: material.cert, minVersion: 'TLSv1.2' },
      (incoming, outgoing) => {
        const upstream = httpRequest(
          {
            hostname: '127.0.0.1',
            port: backendPort,
            path: incoming.url ?? '/',
            method: incoming.method,
            headers: {
              ...incoming.headers,
              host: `localhost:${(proxy!.address() as AddressInfo).port}`,
              'x-forwarded-proto': 'https',
              'x-forwarded-host': `localhost:${(proxy!.address() as AddressInfo).port}`,
            },
          },
          (reply) => {
            outgoing.writeHead(reply.statusCode ?? 502, reply.headers);
            reply.pipe(outgoing);
          },
        );
        upstream.once('error', () => {
          if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'text/plain' });
          outgoing.end('Unavailable');
        });
        outgoing.once('close', () => upstream.destroy());
        incoming.pipe(upstream);
      },
    );
    // Failed certificate handshakes are intentional test observations, not raw log input.
    proxy.on('tlsClientError', () => undefined);
    await new Promise<void>((done, reject) => {
      proxy!.once('error', reject);
      proxy!.listen(0, '127.0.0.1', done);
    });
    const port = (proxy.address() as AddressInfo).port;
    const origin = `https://localhost:${port}`;
    redirect = createHttpServer((incoming, outgoing) => {
      outgoing.writeHead(308, { location: `${origin}${incoming.url ?? '/'}` });
      outgoing.end();
    });
    await new Promise<void>((done, reject) => {
      redirect!.once('error', reject);
      redirect!.listen(0, '127.0.0.1', done);
    });
    await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const adminUrl = fixtureUrl(urls.TEST_DATABASE_URL);
    await migrateDatabase(adminUrl);
    await migrateJobs(adminUrl);
    await provisionRuntimeRoles(adminUrl, {
      appPassword: databasePassword(urls.TEST_APP_DATABASE_URL),
      authPassword: databasePassword(urls.TEST_AUTH_DATABASE_URL),
      jobsPassword: databasePassword(urls.TEST_JOB_DATABASE_URL),
    });
    const storage = join(directory, 'storage');
    await mkdir(storage, { mode: 0o700 });
    const source = {
      ...process.env,
      NODE_ENV: 'production',
      APP_ORIGIN: origin,
      PORT: String(backendPort),
      WEB_HOST: '127.0.0.1',
      DATABASE_URL: fixtureUrl(urls.TEST_APP_DATABASE_URL),
      AUTH_DATABASE_URL: fixtureUrl(urls.TEST_AUTH_DATABASE_URL),
      JOB_DATABASE_URL: fixtureUrl(urls.TEST_JOB_DATABASE_URL),
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      STORAGE_ROOT: storage,
      LOG_LEVEL: 'error',
    };
    const config = parseServerConfig(source);
    const preflight = await productionPreflight(config, { allowLocalPlaintext: true });
    const owner = {
      email: `https-${randomUUID()}@example.test`,
      name: 'Production HTTPS smoke',
      password: randomBytes(32).toString('hex'),
    };
    const provisioned = await bootstrapOwner(owner, config);
    child = spawnServiceProcess(
      process.execPath,
      [resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'), 'scripts/run.ts', 'web-start'],
      runtimeEnvironment(false, source),
    );
    let childFailed = false;
    child.once('error', () => {
      childFailed = true;
    });
    const trusted = new Agent({ ca: material.ca, rejectUnauthorized: true, keepAlive: false });
    const wrongCa = new Agent({ ca: material.wrongCa, rejectUnauthorized: true, keepAlive: false });
    const wrongHostname = new Agent({
      ca: material.ca,
      servername: 'untrusted-host.example.test',
      rejectUnauthorized: true,
      keepAlive: false,
    });
    agents.push(trusted, wrongCa, wrongHostname);
    const deadline = Date.now() + 120_000;
    for (;;) {
      if (
        interrupted ||
        childFailed ||
        child.exitCode !== null ||
        child.signalCode !== null ||
        Date.now() >= deadline
      )
        throw new Error('PRODUCTION_STARTUP_FAILED');
      try {
        const ready = await request(port, trusted, '/api/v1/health/live');
        if (ready.status === 200 && ready.authorized) break;
      } catch {
        /* bounded startup retry */
      }
      await delay(100);
    }
    for (const [agent, expectedCode] of [
      [wrongCa, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
      [wrongHostname, 'ERR_TLS_CERT_ALTNAME_INVALID'],
    ] as const) {
      let rejected = false;
      try {
        await request(port, agent, '/api/v1/health/live');
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        rejected =
          code === expectedCode || (agent === wrongCa && code === 'SELF_SIGNED_CERT_IN_CHAIN');
      }
      assert.equal(rejected, true);
    }
    const document = await request(port, trusted, '/sign-in');
    assert.equal(document.status, 200);
    assert.equal(document.authorized, true);
    assert.equal(document.headers['strict-transport-security'], 'max-age=31536000');
    assert.equal(document.headers['x-frame-options'], 'DENY');
    assert.equal(document.headers['x-content-type-options'], 'nosniff');
    assert.match(document.headers['cache-control'] ?? '', /no-store/);
    const policy = singleHeader(document, 'content-security-policy');
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce);
    assert.ok(policy.includes('upgrade-insecure-requests'));
    assert.ok(!policy.includes('unsafe-eval'));
    assert.ok(document.body.toString().includes(`nonce="${nonce}"`));
    const nextDocument = await request(port, trusted, '/sign-in');
    assert.ok(!singleHeader(nextDocument, 'content-security-policy').includes(nonce));
    const asset = document.body.toString().match(/src="(\/_next\/static\/[^"<>]+)"/)?.[1];
    assert.ok(asset);
    assert.equal((await request(port, trusted, asset)).status, 200);
    const unauthenticated = await request(port, trusted, '/api/v1/health/ready');
    assert.equal(unauthenticated.status, 401);
    const denied = await request(port, trusted, '/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: 'https://attacker.example.test' },
      body: { email: owner.email, password: owner.password },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers['set-cookie'], undefined);
    const signedIn = await request(port, trusted, '/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin },
      body: { email: owner.email, password: owner.password },
    });
    assert.equal(signedIn.status, 200);
    assert.deepEqual(JSON.parse(signedIn.body.toString()), { ok: true });
    const cookies = signedIn.headers['set-cookie'];
    assert.ok(cookies?.length);
    for (const value of cookies) {
      assert.match(value, /;\s*Secure(?:;|$)/i);
      assert.match(value, /;\s*HttpOnly(?:;|$)/i);
      assert.match(value, /;\s*SameSite=Lax(?:;|$)/i);
      assert.ok(!/;\s*Domain=/i.test(value));
    }
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const session = await request(port, trusted, '/api/auth/session', { headers: { cookie } });
    assert.equal(session.status, 200);
    assert.ok(JSON.parse(session.body.toString())?.user?.id);
    assert.ok(!session.body.toString().includes('token'));
    const csrf = singleHeader(session, 'x-csrf-token');
    const ready = await request(port, trusted, '/api/v1/health/ready', { headers: { cookie } });
    assert.equal(ready.status, 200);
    assert.equal(JSON.parse(ready.body.toString()).status, 'ready');
    assert.match(singleHeader(ready, 'content-security-policy'), /default-src 'none'; sandbox/);
    const workspacePath = `/api/v1/workspaces/${provisioned.workspace.id}`;
    const preferences = {
      timezone: provisioned.workspace.timezone,
      expectedRevision: provisioned.workspace.revision,
    };
    assert.equal(
      (
        await request(port, trusted, workspacePath, {
          method: 'PATCH',
          headers: { cookie, origin },
          body: preferences,
        })
      ).status,
      403,
    );
    const saved = await request(port, trusted, workspacePath, {
      method: 'PATCH',
      headers: { cookie, origin, 'x-csrf-token': csrf },
      body: preferences,
    });
    assert.equal(saved.status, 200);
    assert.equal(JSON.parse(saved.body.toString()).revision, preferences.expectedRevision + 1);
    const logout = await request(port, trusted, '/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie, origin, 'x-csrf-token': csrf },
      body: {},
    });
    assert.equal(logout.status, 200);
    assert.ok(logout.headers['set-cookie']?.some((value) => /max-age=0/i.test(value)));
    const revoked = await request(port, trusted, '/api/auth/session', { headers: { cookie } });
    assert.equal(revoked.status, 200);
    assert.equal(JSON.parse(revoked.body.toString()), null);
    assert.equal(
      (await request(port, trusted, '/api/v1/health/ready', { headers: { cookie } })).status,
      401,
    );
    const redirectPort = (redirect.address() as AddressInfo).port;
    const location = await new Promise<string | undefined>((done, reject) => {
      const outgoing = httpRequest(
        { hostname: '127.0.0.1', port: redirectPort, path: '/sign-in' },
        (reply) => {
          assert.equal(reply.statusCode, 308);
          reply.resume();
          reply.once('end', () => done(reply.headers.location));
        },
      );
      outgoing.once('error', reject);
      outgoing.end();
    });
    assert.equal(location, `${origin}/sign-in`);
    return {
      status: 'passed',
      nodeEnvironment: 'production',
      applicationBuildId,
      standaloneServerSha256,
      launcherSha256,
      checks: [
        'trusted-local-CA-and-hostname',
        'untrusted-CA-rejected',
        'wrong-hostname-rejected',
        'production-standalone-launcher',
        'standalone-static-asset',
        'HSTS-and-unique-nonce-CSP',
        'secure-host-only-HttpOnly-SameSite-cookie',
        'safe-session-DTO',
        'exact-origin-and-session-CSRF',
        'authenticated-readiness',
        'logout-revokes-session',
        'test-proxy-HTTP-redirect',
        'restricted-runtime-role-and-private-storage-preflight',
      ],
      databaseTransport: preflight.databaseTransportMode,
      restrictedRuntimePreflight: preflight,
      productionDeploymentVerified: false,
    };
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    try {
      if (child) await stopProcessGroups([child], 30_000);
    } catch {
      cleanupFailed = true;
    }
    for (const agent of agents) agent.destroy();
    for (const server of [proxy, redirect])
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
      }
    try {
      if (created) await admin.pool.query(`DROP DATABASE "${databaseName}"`);
    } catch {
      cleanupFailed = true;
    }
    await admin.close().catch(() => {
      cleanupFailed = true;
    });
    await rm(directory, { recursive: true, force: true }).catch(() => {
      cleanupFailed = true;
    });
    process.umask(previousMask);
    if (cleanupFailed) throw new Error('HTTPS_SMOKE_CLEANUP_FAILED');
  }
}

async function main() {
  try {
    const { values } = parseArgs({ options: { output: { type: 'string' } } });
    const result = await runHttpsSmoke();
    if (values.output)
      await writeFile(resolve(values.output), `${JSON.stringify(result, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error(
      'Production HTTPS smoke failed. Inspect the documented prerequisites; no private diagnostics were emitted.',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
