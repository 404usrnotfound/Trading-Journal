import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@journal/database';
import { parseServerConfig } from '@journal/server/config';
import type { Authentication } from '../../packages/server/src/auth.js';
import { createAuthGateway } from '../../packages/server/src/auth-gateway.js';
import { createCsrfToken } from '../../packages/server/src/security.js';

const config = parseServerConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://app:test@localhost/journal',
  AUTH_DATABASE_URL: 'postgres://auth:test@localhost/journal',
  JOB_DATABASE_URL: 'postgres://jobs:test@localhost/journal',
  BETTER_AUTH_SECRET: 'credential-admission-only-secret-at-least-32-characters',
  APP_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
});
const user = { id: 'credential-admission-owner', name: 'Test owner', email: 'owner@example.test' };
const session = {
  id: 'credential-admission-session',
  token: 'server-only-credential-admission-token',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture(handler: (request: Request) => Promise<Response>) {
  const query = vi.fn(async () => ({ rows: [{ count: 1 }] }));
  const values = vi.fn(async () => undefined);
  const database = {
    pool: { query },
    db: { insert: () => ({ values }) },
  } as unknown as Database;
  const auth = {
    handler: vi.fn(handler),
    api: { getSession: vi.fn(async () => ({ user, session })) },
  } as unknown as Authentication;
  return { handle: createAuthGateway(auth, database, config), query, handler: auth.handler };
}

function request(path: string, body: unknown, index = 0) {
  return new Request(`${config.appOrigin}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      origin: config.appOrigin,
      'content-type': 'application/json',
      'x-csrf-token': createCsrfToken(session.token, config),
    },
    body: JSON.stringify(
      path === 'sign-in/email'
        ? { email: `missing-${index}@example.test`, password: 'bounded-test-password' }
        : body,
    ),
  });
}

function successfulLogin() {
  return new Response(JSON.stringify({ user, token: session.token }), {
    headers: { 'content-type': 'application/json' },
  });
}

describe('credential-work admission', () => {
  it('bounds simultaneous sign-in and password-change work across gateway instances', async () => {
    const started = deferred<void>();
    const finish = deferred<Response>();
    let active = 0;
    let peak = 0;
    let invocations = 0;
    const handler = async (input: Request) => {
      if (new URL(input.url).pathname.endsWith('sign-out')) {
        return new Response(JSON.stringify({ ok: true }));
      }
      active += 1;
      peak = Math.max(peak, active);
      invocations += 1;
      if (invocations === 4) started.resolve();
      try {
        return await finish.promise.then((response) => response.clone());
      } finally {
        active -= 1;
      }
    };
    const first = fixture(handler);
    const second = fixture(handler);
    const admitted = [
      first.handle(request('sign-in/email', null, 0)),
      second.handle(
        request('change-password', {
          currentPassword: 'bounded-test-password',
          newPassword: 'new-bounded-test-password',
        }),
      ),
      first.handle(request('sign-in/email', null, 1)),
      second.handle(request('sign-in/email', null, 2)),
    ];
    try {
      await started.promise;
      const blockedLogin = await second.handle(request('sign-in/email', null, 3));
      const blockedChange = await first.handle(
        request('change-password', {
          currentPassword: 'bounded-test-password',
          newPassword: 'new-bounded-test-password',
        }),
      );
      for (const response of [blockedLogin, blockedChange]) {
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('1');
        expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' });
        expect(response.headers.getSetCookie()).toHaveLength(0);
      }
      expect(invocations).toBe(4);
      expect(peak).toBe(4);
      // Saturated credential workers do not occupy session reads or logout.
      const read = await first.handle(new Request(`${config.appOrigin}/api/auth/session`));
      expect(await read.json()).toMatchObject({ user });
      const logout = await second.handle(request('sign-out', {}));
      expect(logout.status).toBe(200);
    } finally {
      finish.resolve(successfulLogin());
      await Promise.all(admitted);
    }
    const retry = await first.handle(request('sign-in/email', null, 4));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true });
    expect(active).toBe(0);
  });

  it('releases admitted work after library failures and thrown exceptions', async () => {
    const started = deferred<void>();
    const completions = Array.from({ length: 4 }, () => deferred<Response>());
    let invocations = 0;
    const gateway = fixture(async () => {
      const current = invocations;
      invocations += 1;
      if (invocations === 4) started.resolve();
      return current < 4 ? completions[current]!.promise : successfulLogin();
    });
    const admitted = completions.map((_value, index) =>
      gateway.handle(request('sign-in/email', null, index)),
    );
    try {
      await started.promise;
      const blocked = await gateway.handle(request('sign-in/email', null, 5));
      expect(blocked.status).toBe(429);
      completions[0]!.reject(new Error('credential worker failed'));
      completions[1]!.resolve(new Response('{}', { status: 401 }));
      completions[2]!.resolve(new Response('{}', { status: 429 }));
      completions[3]!.resolve(successfulLogin());
      expect((await Promise.all(admitted)).map((response) => response.status)).toEqual([
        500, 401, 429, 200,
      ]);
      const retries = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          gateway.handle(request('sign-in/email', null, index + 6)),
        ),
      );
      expect(retries.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    } finally {
      for (const completion of completions) completion.resolve(successfulLogin());
      await Promise.all(admitted);
    }
  });

  it('validates hostile requests before consuming credential capacity', async () => {
    const gateway = fixture(async () => successfulLogin());
    const untrusted = new Request(request('sign-in/email', null), {
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    });
    expect((await gateway.handle(untrusted)).status).toBe(403);
    const invalid = new Request(`${config.appOrigin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin: config.appOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', password: 'x' }),
    });
    expect((await gateway.handle(invalid)).status).toBe(400);
    expect(gateway.handler).not.toHaveBeenCalled();
    expect(gateway.query).not.toHaveBeenCalled();
  });

  it('does not reserve credential work while an untrusted request body is incomplete', async () => {
    const reading = deferred<void>();
    const started = deferred<void>();
    const finish = deferred<Response>();
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    let bodyClosed = false;
    let invocations = 0;
    const gateway = fixture(async () => {
      invocations += 1;
      if (invocations === 4) started.resolve();
      return finish.promise.then((response) => response.clone());
    });
    const incomplete = new Request(`${config.appOrigin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin: config.appOrigin, 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>(
        {
          start(controller) {
            bodyController = controller;
          },
          pull() {
            reading.resolve();
          },
        },
        { highWaterMark: 0 },
      ),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const pendingBody = gateway.handle(incomplete);
    await reading.promise;
    const admitted = Array.from({ length: 4 }, (_, index) =>
      gateway.handle(request('sign-in/email', null, index)),
    );
    try {
      await started.promise;
      expect(invocations).toBe(4);
      bodyController.enqueue(
        new TextEncoder().encode(
          JSON.stringify({ email: 'slow@example.test', password: 'bounded-test-password' }),
        ),
      );
      bodyController.close();
      bodyClosed = true;
      const response = await pendingBody;
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('1');
      expect(invocations).toBe(4);
    } finally {
      if (!bodyClosed) bodyController.error(new Error('test body closed'));
      finish.resolve(successfulLogin());
      await Promise.all([...admitted, pendingBody]);
    }
  });
});
