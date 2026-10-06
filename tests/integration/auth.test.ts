import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@journal/database';
import { createServerServices, parseServerConfig, type ServerServices } from '@journal/server';

const password = 'integration-only-passphrase-42';
let services: ServerServices;
let administrator: Database;
let first: Awaited<ReturnType<ServerServices['bootstrapOwner']>>;
let second: Awaited<ReturnType<ServerServices['bootstrapOwner']>>;
let firstCookies: string;
let secondCookies: string;
const origin = 'http://localhost:3000';

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookies?: string,
  extraHeaders: Record<string, string> = {},
) {
  const headers = new Headers({ origin, ...extraHeaders });
  if (cookies) headers.set('cookie', cookies);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`${origin}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

beforeAll(async () => {
  const config = parseServerConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: origin,
    DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
    AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
    JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL ?? process.env.TEST_DATABASE_URL,
    BETTER_AUTH_SECRET: 'integration-test-secret-of-at-least-32-characters',
    LOG_LEVEL: 'silent',
  });
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('TEST_DATABASE_URL is required for real-PostgreSQL integration tests');
  administrator = createDatabase(process.env.TEST_DATABASE_URL);
  await administrator.pool.query('DELETE FROM auth.rate_limit');
  services = createServerServices(config);
  first = await services.bootstrapOwner({
    email: `first-${randomUUID()}@example.test`,
    name: 'First owner',
    password,
  });
  second = await services.bootstrapOwner({
    email: `second-${randomUUID()}@example.test`,
    name: 'Second owner',
    password,
  });
  for (const owner of [first, second]) {
    const response = await services.handleAuthRequest(
      request('/api/auth/sign-in/email', 'POST', { email: owner.user.email, password }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    if (owner === first) firstCookies = cookiesFrom(response);
    else secondCookies = cookiesFrom(response);
  }
}, 60_000);

afterAll(async () => {
  if (administrator) {
    const workspaceIds = [first?.workspace.id, second?.workspace.id].filter(Boolean);
    const userIds = [first?.user.id, second?.user.id].filter(Boolean);
    await administrator.pool.query('DELETE FROM app.workspaces WHERE id = ANY($1::uuid[])', [
      workspaceIds,
    ]);
    await administrator.pool.query('DELETE FROM auth."user" WHERE id = ANY($1::text[])', [userIds]);
    await administrator.pool.query('DELETE FROM auth.rate_limit');
    await administrator.close();
  }
  if (services) await services.close();
});

describe('real database authentication and tenant boundaries', () => {
  it('uses opaque HttpOnly cookies and returns only safe session DTOs', async () => {
    expect(firstCookies).toContain('journal.session_token=');
    const response = await services.handleAuthRequest(
      request('/api/auth/sign-in/email', 'POST', { email: first.user.email, password }),
    );
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith('journal.session_token='));
    expect(cookie?.toLowerCase()).toContain('httponly');
    expect(cookie?.toLowerCase()).toContain('samesite=lax');
    expect(response.headers.getSetCookie().some((value) => value.includes('session_data'))).toBe(
      false,
    );
    const status = await services.handleAuthRequest(
      request('/api/auth/session', 'GET', undefined, firstCookies),
    );
    expect(status.status).toBe(200);
    const value = await status.json();
    expect(Object.keys(value).sort()).toEqual(['expiresAt', 'user']);
    expect(Object.keys(value.user).sort()).toEqual(['email', 'id', 'name']);
    expect(JSON.stringify(value)).not.toContain('token');
    expect(status.headers.get('x-csrf-token')).toBeTruthy();
  });

  it('denies public signup, raw session routes, recovery stubs and unsafe origins', async () => {
    for (const path of [
      '/api/auth/sign-up/email',
      '/api/auth/get-session',
      '/api/auth/list-sessions',
      '/api/auth/request-password-reset',
    ]) {
      expect(
        (
          await services.handleAuthRequest(
            request(
              path,
              path.includes('session') ? 'GET' : 'POST',
              path.includes('session') ? undefined : { email: 'uncreated@example.test', password },
            ),
          )
        ).status,
      ).toBe(404);
    }
    const rejected = await services.handleAuthRequest(
      request('/api/auth/sign-in/email', 'POST', { email: first.user.email, password }, undefined, {
        origin: 'https://attacker.example',
      }),
    );
    expect(rejected.status).toBe(403);
    expect(JSON.stringify(await rejected.json())).not.toContain(password);
  });

  it("discovers only current memberships and hides another owner's workspace", async () => {
    const firstRequest = request('/api/v1/workspaces', 'GET', undefined, firstCookies);
    expect(await services.getWorkspaces(firstRequest)).toEqual([first.workspace]);
    expect(await services.getWorkspace(firstRequest, first.workspace.id)).toEqual(first.workspace);
    await expect(services.getWorkspace(firstRequest, second.workspace.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(services.getWorkspaces(request('/api/v1/workspaces'))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rechecks membership/role rather than trusting an earlier authorization context', async () => {
    await administrator.pool.query(
      "INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,'editor')",
      [first.workspace.id, second.user.id],
    );
    const secondRequest = request('/api/v1/workspaces', 'GET', undefined, secondCookies);
    const context = await services.authorizeWorkspace(secondRequest, first.workspace.id, 'editor');
    await administrator.pool.query(
      "UPDATE app.workspace_memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
      [first.workspace.id, second.user.id],
    );
    await expect(services.withWorkspaceContext(context, async () => true)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      services.authorizeWorkspace(secondRequest, first.workspace.id, 'editor'),
    ).rejects.toMatchObject({ status: 403 });
    await administrator.pool.query(
      'DELETE FROM app.workspace_memberships WHERE workspace_id=$1 AND user_id=$2',
      [first.workspace.id, second.user.id],
    );
    await expect(services.getWorkspace(secondRequest, first.workspace.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('requires a session-bound CSRF proof for application mutation helpers', async () => {
    const sessionResponse = await services.handleAuthRequest(
      request('/api/auth/session', 'GET', undefined, firstCookies),
    );
    const proof = sessionResponse.headers.get('x-csrf-token')!;
    await expect(
      services.requireMutationSession(
        request('/api/v1/future', 'POST', {}, firstCookies, { 'x-csrf-token': proof }),
      ),
    ).resolves.toMatchObject({ user: first.user });
    await expect(
      services.requireMutationSession(
        request('/api/v1/future', 'POST', {}, secondCookies, { 'x-csrf-token': proof }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('preserves logout cookie clearing and immediately revokes the old database session', async () => {
    const response = await services.handleAuthRequest(
      request('/api/auth/sign-out', 'POST', {}, firstCookies),
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().some((cookie) => /max-age=0/i.test(cookie))).toBe(true);
    expect(
      await services.getSafeSession(request('/api/v1/session', 'GET', undefined, firstCookies)),
    ).toBeNull();
  });

  it('persists shared gateway rate limits and ignores spoofed forwarded IP headers', async () => {
    await administrator.pool.query('DELETE FROM auth.rate_limit');
    const responses: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(
        await services.handleAuthRequest(
          request(
            '/api/auth/sign-in/email',
            'POST',
            { email: `missing-${randomUUID()}@example.test`, password },
            undefined,
            {
              'x-forwarded-for': `192.0.2.${index + 1}`,
              'x-journal-client-ip': `192.0.2.${index + 1}`,
            },
          ),
        ),
      );
    }
    expect(responses[10]?.status).toBe(429);
    expect(responses[10]?.headers.get('retry-after')).toBeTruthy();
    const stored = await administrator.pool.query(
      'SELECT count(*)::int AS count FROM auth.rate_limit',
    );
    expect(stored.rows[0]?.count).toBeGreaterThan(0);
  }, 60_000);
});
