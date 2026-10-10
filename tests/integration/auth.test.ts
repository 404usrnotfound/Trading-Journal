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
const additionalOwners: Array<Awaited<ReturnType<ServerServices['bootstrapOwner']>>> = [];
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
    const owners = [first, second, ...additionalOwners].filter(Boolean);
    const userIds = owners.map((owner) => owner.user.id);
    await administrator.pool.query(
      'DELETE FROM app.workspaces WHERE created_by = ANY($1::text[])',
      [userIds],
    );
    await administrator.pool.query('DELETE FROM auth."user" WHERE id = ANY($1::text[])', [userIds]);
    await administrator.pool.query(
      'DELETE FROM auth.security_events WHERE subject_user_id = ANY($1::text[])',
      [userIds],
    );
    await administrator.pool.query('DELETE FROM auth.rate_limit');
    await administrator.close();
  }
  if (services) await services.close();
});

async function isolatedOwner() {
  const owner = await services.bootstrapOwner({
    email: `auth-case-${randomUUID()}@example.test`,
    name: 'Isolated test owner',
    password,
  });
  additionalOwners.push(owner);
  return owner;
}

async function signIn(email: string, suppliedPassword = password) {
  const response = await services.handleAuthRequest(
    request('/api/auth/sign-in/email', 'POST', { email, password: suppliedPassword }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  return { cookies: cookiesFrom(response), response };
}

async function csrfProof(cookies: string): Promise<string> {
  const response = await services.handleAuthRequest(
    request('/api/auth/session', 'GET', undefined, cookies),
  );
  return response.headers.get('x-csrf-token')!;
}

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

  it('stores reviewed Argon2id hashes and enforces hard expiry without session refresh', async () => {
    const owner = await isolatedOwner();
    const login = await signIn(owner.user.email);
    const stored = await administrator.pool.query<{ password: string }>(
      'SELECT password FROM auth.account WHERE user_id=$1',
      [owner.user.id],
    );
    expect(stored.rows[0]?.password).toMatch(/^\$argon2id\$v=19\$m=32768,t=3,p=1\$/);
    const original = await administrator.pool.query<{ expires_at: Date }>(
      'SELECT expires_at FROM auth.session WHERE user_id=$1',
      [owner.user.id],
    );
    await services.getSafeSession(request('/api/auth/session', 'GET', undefined, login.cookies));
    const reread = await administrator.pool.query<{ expires_at: Date }>(
      'SELECT expires_at FROM auth.session WHERE user_id=$1',
      [owner.user.id],
    );
    expect(reread.rows[0]?.expires_at).toEqual(original.rows[0]?.expires_at);
    await administrator.pool.query(
      "UPDATE auth.session SET expires_at=now()-interval '1 second' WHERE user_id=$1",
      [owner.user.id],
    );
    expect(
      await services.getSafeSession(request('/api/auth/session', 'GET', undefined, login.cookies)),
    ).toBeNull();
  });

  it('repairs interrupted owner bootstrap without duplicate workspaces or changed credentials', async () => {
    const owner = await isolatedOwner();
    const repeated = await services.bootstrapOwner({
      email: owner.user.email,
      name: 'Ignored retry name',
      password,
    });
    expect(repeated).toEqual(owner);
    await expect(
      services.bootstrapOwner({
        email: owner.user.email,
        name: 'Retry',
        password: 'incorrect-existing-password',
      }),
    ).rejects.toMatchObject({ status: 401 });
    await administrator.pool.query('DELETE FROM app.workspaces WHERE id=$1', [owner.workspace.id]);
    const repaired = await services.bootstrapOwner({
      email: owner.user.email,
      name: 'Retry',
      password,
    });
    expect(repaired.user).toEqual(owner.user);
    expect(repaired.workspace.role).toBe('owner');
    expect(repaired.workspace.id).not.toBe(owner.workspace.id);
    await signIn(owner.user.email);
  });

  it('preserves committed auth success and every issued cookie when audit storage fails', async () => {
    const owner = await isolatedOwner();
    const original = await signIn(owner.user.email);
    const proof = await csrfProof(original.cookies);
    const constraint = `auth_audit_test_${randomUUID().replaceAll('-', '')}`;
    const ddl = await administrator.pool.query<{ statement: string }>(
      "SELECT format('ALTER TABLE auth.security_events ADD CONSTRAINT %I CHECK(subject_user_id <> %L) NOT VALID', $1::text, $2::text) AS statement",
      [constraint, owner.user.id],
    );
    await administrator.pool.query(ddl.rows[0]!.statement);
    try {
      const changed = await services.handleAuthRequest(
        request(
          '/api/auth/change-password',
          'POST',
          { currentPassword: password, newPassword: 'audit-failure-integration-new-password' },
          original.cookies,
          { 'x-csrf-token': proof },
        ),
      );
      expect(changed.status).toBe(200);
      expect(await changed.json()).toEqual({ ok: true });
      expect(changed.headers.getSetCookie()).not.toHaveLength(0);
      expect(
        await services.getSafeSession(
          request('/api/auth/session', 'GET', undefined, cookiesFrom(changed)),
        ),
      ).toMatchObject({ user: owner.user });
      expect(
        await services.getSafeSession(
          request('/api/auth/session', 'GET', undefined, original.cookies),
        ),
      ).toBeNull();
    } finally {
      const drop = await administrator.pool.query<{ statement: string }>(
        "SELECT format('ALTER TABLE auth.security_events DROP CONSTRAINT %I', $1::text) AS statement",
        [constraint],
      );
      await administrator.pool.query(drop.rows[0]!.statement);
    }
  });

  it('lists safe session IDs, checks ownership and revokes immediately without exposing tokens', async () => {
    const owner = await isolatedOwner();
    const current = await signIn(owner.user.email);
    const other = await signIn(owner.user.email);
    const listed = await services.handleAuthRequest(
      request('/api/auth/sessions', 'GET', undefined, current.cookies),
    );
    const body = await listed.json();
    expect(body.sessions).toHaveLength(2);
    for (const item of body.sessions)
      expect(Object.keys(item).sort()).toEqual(['createdAt', 'current', 'expiresAt', 'id']);
    expect(JSON.stringify(body)).not.toMatch(/token|ipAddress|userAgent/);
    const otherSession = body.sessions.find((item: { current: boolean }) => !item.current);
    const proof = await csrfProof(current.cookies);
    const foreign = await administrator.pool.query<{ id: string }>(
      'SELECT id FROM auth.session WHERE user_id=$1 LIMIT 1',
      [second.user.id],
    );
    const foreignResponse = await services.handleAuthRequest(
      request(
        '/api/auth/revoke-session',
        'POST',
        { sessionId: foreign.rows[0]?.id },
        current.cookies,
        { 'x-csrf-token': proof },
      ),
    );
    expect(foreignResponse.status).toBe(404);
    expect(
      await services.getSafeSession(request('/api/auth/session', 'GET', undefined, secondCookies)),
    ).not.toBeNull();
    const missingCsrf = await services.handleAuthRequest(
      request('/api/auth/revoke-session', 'POST', { sessionId: otherSession.id }, current.cookies),
    );
    expect(missingCsrf.status).toBe(403);
    const revoked = await services.handleAuthRequest(
      request('/api/auth/revoke-session', 'POST', { sessionId: otherSession.id }, current.cookies, {
        'x-csrf-token': proof,
      }),
    );
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ ok: true });
    expect(
      await services.getSafeSession(request('/api/auth/session', 'GET', undefined, other.cookies)),
    ).toBeNull();
    const selfSession = body.sessions.find((item: { current: boolean }) => item.current);
    const self = await services.handleAuthRequest(
      request('/api/auth/revoke-session', 'POST', { sessionId: selfSession.id }, current.cookies, {
        'x-csrf-token': proof,
      }),
    );
    expect(self.headers.getSetCookie().some((cookie) => /max-age=0/i.test(cookie))).toBe(true);
    expect(
      await services.getSafeSession(
        request('/api/auth/session', 'GET', undefined, current.cookies),
      ),
    ).toBeNull();
  });

  it('changes passwords through the gateway, replaces cookies and revokes all previous sessions', async () => {
    const owner = await isolatedOwner();
    const current = await signIn(owner.user.email);
    const other = await signIn(owner.user.email);
    const proof = await csrfProof(current.cookies);
    const nextPassword = 'changed-integration-only-passphrase-42';
    const changed = await services.handleAuthRequest(
      request(
        '/api/auth/change-password',
        'POST',
        { currentPassword: password, newPassword: nextPassword },
        current.cookies,
        { 'x-csrf-token': proof },
      ),
    );
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ ok: true });
    expect(
      changed.headers.getSetCookie().some((cookie) => cookie.startsWith('journal.session_token=')),
    ).toBe(true);
    for (const old of [current, other])
      expect(
        await services.getSafeSession(request('/api/auth/session', 'GET', undefined, old.cookies)),
      ).toBeNull();
    expect(
      await services.getSafeSession(
        request('/api/auth/session', 'GET', undefined, cookiesFrom(changed)),
      ),
    ).not.toBeNull();
    await signIn(owner.user.email, nextPassword);
    const rejected = await services.handleAuthRequest(
      request('/api/auth/sign-in/email', 'POST', { email: owner.user.email, password }),
    );
    expect(rejected.status).toBe(401);
    expect(JSON.stringify(await rejected.json())).not.toContain(nextPassword);
  });

  it('requires recent authentication for security operations', async () => {
    const owner = await isolatedOwner();
    const login = await signIn(owner.user.email);
    const proof = await csrfProof(login.cookies);
    await administrator.pool.query(
      "UPDATE auth.session SET created_at=now()-interval '6 minutes' WHERE user_id=$1",
      [owner.user.id],
    );
    const response = await services.handleAuthRequest(
      request(
        '/api/auth/change-password',
        'POST',
        { currentPassword: password, newPassword: 'never-changed-integration-password' },
        login.cookies,
        { 'x-csrf-token': proof },
      ),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'REAUTHENTICATION_REQUIRED' });
  });

  it('uses host-only Secure production cookies and the configured HTTPS origin', async () => {
    const owner = await isolatedOwner();
    const productionOrigin = 'https://journal.example.test';
    const production = createServerServices(
      parseServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: productionOrigin,
        DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
        AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
        JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL,
        BETTER_AUTH_SECRET: 'integration-test-secret-of-at-least-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    try {
      const response = await production.handleAuthRequest(
        new Request(`${productionOrigin}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { origin: productionOrigin, 'content-type': 'application/json' },
          body: JSON.stringify({ email: owner.user.email, password }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const cookies = response.headers.getSetCookie();
      expect(cookies).not.toHaveLength(0);
      for (const cookie of cookies) {
        expect(cookie.toLowerCase()).toContain('secure');
        expect(cookie.toLowerCase()).toContain('httponly');
        expect(cookie.toLowerCase()).toContain('samesite=lax');
        expect(cookie.toLowerCase()).not.toContain('domain=');
      }
      expect(
        await production.getSafeSession(
          new Request(`${productionOrigin}/api/auth/session`, {
            headers: { cookie: cookiesFrom(response) },
          }),
        ),
      ).toMatchObject({ user: owner.user });
    } finally {
      await production.close();
    }
  });

  it('accepts legacy library hashes and upgrades them during password change', async () => {
    const owner = await isolatedOwner();
    const legacyPassword = 'legacy-unit-only-password';
    const legacyHash =
      '93a745d202877bce8c9df46ae02c0919:41a73a8fea1d7770e6e53a32d8f4bddc3cfdf0b805362d5e642e633d1181c6dde0a82de35146588edca0bcf93a302b1eeb36ba3263a59e1d5123a5178d34711e';
    await administrator.pool.query('UPDATE auth.account SET password=$1 WHERE user_id=$2', [
      legacyHash,
      owner.user.id,
    ]);
    const login = await signIn(owner.user.email, legacyPassword);
    const proof = await csrfProof(login.cookies);
    const changed = await services.handleAuthRequest(
      request(
        '/api/auth/change-password',
        'POST',
        { currentPassword: legacyPassword, newPassword: password },
        login.cookies,
        { 'x-csrf-token': proof },
      ),
    );
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ ok: true });
    const stored = await administrator.pool.query<{ password: string }>(
      'SELECT password FROM auth.account WHERE user_id=$1',
      [owner.user.id],
    );
    expect(stored.rows[0]?.password).toMatch(/^\$argon2id\$/);
  });

  it('recovers an owner offline with supported APIs and revokes every prior session', async () => {
    const owner = await isolatedOwner();
    const old = await signIn(owner.user.email);
    const nextPassword = 'operator-reset-integration-only-password';
    await expect(
      services.recoverOwnerPassword({ email: owner.user.email, password: nextPassword }),
    ).resolves.toEqual({ ok: true });
    expect(
      await services.getSafeSession(request('/api/auth/session', 'GET', undefined, old.cookies)),
    ).toBeNull();
    await signIn(owner.user.email, nextPassword);
    const verifications = await administrator.pool.query(
      'SELECT identifier,value FROM auth.verification WHERE value=$1',
      [owner.user.id],
    );
    expect(verifications.rows).toHaveLength(0);
    for (const path of ['/api/auth/reset-password', '/api/auth/operator-password-reset'])
      expect(
        (
          await services.handleAuthRequest(
            request(path, 'POST', { email: owner.user.email, password: nextPassword }),
          )
        ).status,
      ).toBe(404);
    const audits = await administrator.pool.query<{ action: string }>(
      'SELECT action FROM auth.security_events WHERE subject_user_id=$1',
      [owner.user.id],
    );
    expect(audits.rows.map((row) => row.action)).toContain('auth.operator-password-reset');
  });

  it('persists owner preferences atomically with revision checks and denies editor/viewer/cross-workspace writes', async () => {
    const owner = await isolatedOwner();
    const login = await signIn(owner.user.email);
    const proof = await csrfProof(login.cookies);
    const changed = await services.updateWorkspacePreferences(
      request(
        `/api/v1/workspaces/${owner.workspace.id}`,
        'PATCH',
        { timezone: 'Europe/Madrid', reportingCurrency: 'EUR', expectedRevision: 1 },
        login.cookies,
        { 'x-csrf-token': proof },
      ),
      owner.workspace.id,
    );
    expect(changed).toMatchObject({
      timezone: 'Europe/Madrid',
      reportingCurrency: 'EUR',
      revision: 2,
    });
    await expect(
      services.updateWorkspacePreferences(
        request(
          `/api/v1/workspaces/${owner.workspace.id}`,
          'PATCH',
          { timezone: 'UTC', expectedRevision: 1 },
          login.cookies,
          { 'x-csrf-token': proof },
        ),
        owner.workspace.id,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'STALE_REVISION' });
    const races = await Promise.allSettled(
      ['UTC', 'America/New_York'].map((timezone) =>
        services.updateWorkspacePreferences(
          request(
            `/api/v1/workspaces/${owner.workspace.id}`,
            'PATCH',
            { timezone, expectedRevision: 2 },
            login.cookies,
            { 'x-csrf-token': proof },
          ),
          owner.workspace.id,
        ),
      ),
    );
    expect(races.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      races.filter((result) => result.status === 'rejected' && result.reason.status === 409),
    ).toHaveLength(1);
    await expect(
      services.updateWorkspacePreferences(
        request(
          `/api/v1/workspaces/${second.workspace.id}`,
          'PATCH',
          { timezone: 'UTC', expectedRevision: 1 },
          login.cookies,
          { 'x-csrf-token': proof },
        ),
        second.workspace.id,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      services.updateWorkspacePreferences(
        request(
          `/api/v1/workspaces/${owner.workspace.id}`,
          'PATCH',
          { timezone: 'UTC', expectedRevision: 3 },
          login.cookies,
        ),
        owner.workspace.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    for (const role of ['editor', 'viewer']) {
      await administrator.pool.query(
        'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role',
        [owner.workspace.id, second.user.id, role],
      );
      await expect(
        services.updateWorkspacePreferences(
          request(
            `/api/v1/workspaces/${owner.workspace.id}`,
            'PATCH',
            { timezone: 'UTC', expectedRevision: 3 },
            secondCookies,
            { 'x-csrf-token': await csrfProof(secondCookies) },
          ),
          owner.workspace.id,
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    const audit = await administrator.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM app.audit_events WHERE workspace_id=$1 AND action=$2',
      [owner.workspace.id, 'workspace.preferences-updated'],
    );
    expect(audit.rows[0]?.count).toBe(2);
    const restarted = createServerServices(
      parseServerConfig({
        NODE_ENV: 'test',
        APP_ORIGIN: origin,
        DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
        AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
        JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL,
        BETTER_AUTH_SECRET: 'integration-test-secret-of-at-least-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    try {
      expect(
        await restarted.getWorkspace(
          request('/api/v1/workspaces', 'GET', undefined, login.cookies),
          owner.workspace.id,
        ),
      ).toMatchObject({ revision: 3, reportingCurrency: 'EUR' });
    } finally {
      await restarted.close();
    }
  });

  it('preserves logout cookie clearing and immediately revokes the old database session', async () => {
    await administrator.pool.query(
      "UPDATE auth.session SET created_at=now()-interval '6 minutes' WHERE user_id=$1",
      [first.user.id],
    );
    const proof = await csrfProof(firstCookies);
    expect(
      (await services.handleAuthRequest(request('/api/auth/sign-out', 'POST', {}, firstCookies)))
        .status,
    ).toBe(403);
    expect(
      (
        await services.handleAuthRequest(
          request('/api/auth/sign-out', 'POST', {}, firstCookies, {
            'x-csrf-token': 'incorrect-proof',
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      await services.getSafeSession(request('/api/auth/session', 'GET', undefined, firstCookies)),
    ).not.toBeNull();
    const response = await services.handleAuthRequest(
      request('/api/auth/sign-out', 'POST', {}, firstCookies, { 'x-csrf-token': proof }),
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
    const unknownEmail = `missing-${randomUUID()}@example.test`;
    for (let index = 0; index < 11; index += 1) {
      responses.push(
        await services.handleAuthRequest(
          request('/api/auth/sign-in/email', 'POST', { email: unknownEmail, password }, undefined, {
            'x-forwarded-for': `192.0.2.${index + 1}`,
            'x-journal-client-ip': `192.0.2.${index + 1}`,
          }),
        ),
      );
    }
    expect(responses[10]?.status).toBe(429);
    expect(responses[10]?.headers.get('retry-after')).toBeTruthy();
    const stored = await administrator.pool.query(
      'SELECT count(*)::int AS count FROM auth.rate_limit',
    );
    expect(stored.rows[0]?.count).toBeGreaterThan(0);
    await signIn(second.user.email);
    const replica = createServerServices(
      parseServerConfig({
        NODE_ENV: 'test',
        APP_ORIGIN: origin,
        DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
        AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
        JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL,
        BETTER_AUTH_SECRET: 'integration-test-secret-of-at-least-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    try {
      expect(
        (
          await replica.handleAuthRequest(
            request('/api/auth/sign-in/email', 'POST', { email: unknownEmail, password }),
          )
        ).status,
      ).toBe(429);
    } finally {
      await replica.close();
    }
  }, 60_000);

  it('checks persisted ingress limits before allocating varied-email buckets and bounds expiry cleanup', async () => {
    await administrator.pool.query('DELETE FROM auth.rate_limit');
    await administrator.pool.query(
      'INSERT INTO auth.rate_limit(id,key,count,last_request) VALUES ($1,$2,100,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)',
      [randomUUID(), 'journal:login:ingress'],
    );
    for (let index = 0; index < 5; index += 1) {
      const response = await services.handleAuthRequest(
        request('/api/auth/sign-in/email', 'POST', {
          email: `spray-${randomUUID()}@example.test`,
          password,
        }),
      );
      expect(response.status).toBe(429);
    }
    const rejectedRows = await administrator.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM auth.rate_limit',
    );
    expect(rejectedRows.rows[0]?.count).toBe(1);
    await administrator.pool.query(
      "UPDATE auth.rate_limit SET last_request=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-900001 WHERE key='journal:login:ingress'",
    );
    for (let index = 0; index < 3; index += 1)
      await administrator.pool.query(
        'INSERT INTO auth.rate_limit(id,key,count,last_request) VALUES ($1,$2,1,floor(extract(epoch FROM clock_timestamp())*1000)::bigint-900001)',
        [randomUUID(), `journal:login:expired-${index}`],
      );
    await signIn(second.user.email);
    const expired = await administrator.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM auth.rate_limit WHERE key LIKE 'journal:login:expired-%'",
    );
    expect(expired.rows[0]?.count).toBe(0);
  });
});
