import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  sessionResponseSchema,
  workspaceResponseSchema,
  signInSchema,
  type SessionResponse,
  type WorkspaceResponse,
} from '@journal/contracts';
import {
  createDatabase,
  createPersonalWorkspace,
  listOwnWorkspaces,
  verifyDatabaseSchema,
  withTenantTransaction,
  type DbTransaction,
} from '@journal/database';
import { workspaceMemberships, workspaces } from '@journal/database/schema';
import { createAuthentication } from './auth.js';
import { getServerConfig, type ServerConfig } from './config.js';
import { ApplicationError, inaccessible, toProblemResponse, unauthenticated } from './errors.js';
import { getLogger } from './logging.js';
import {
  assertApplicationMutation,
  assertTrustedOrigin,
  createCsrfToken,
  readBoundedJson,
} from './security.js';

export type SafeSession = NonNullable<SessionResponse>;
export type WorkspaceRole = WorkspaceResponse['role'];
const authorizationBrand = Symbol('server-authorized-context');
export type AuthorizationContext = Readonly<{
  actorId: string;
  workspaceId: string;
  role: WorkspaceRole;
  requiredRole: WorkspaceRole;
  [authorizationBrand]: true;
}>;

const roleRank: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, owner: 3 };
const provisionInput = z
  .object({
    email: z.email(),
    name: z.string().trim().min(1).max(80),
    password: z.string().min(12).max(128),
  })
  .strict();

function safeSession(
  value: { user: { id: string; name: string; email: string }; session: { expiresAt: Date } } | null,
): SafeSession | null {
  return sessionResponseSchema.parse(
    value
      ? {
          user: { id: value.user.id, name: value.user.name, email: value.user.email },
          expiresAt: value.session.expiresAt.toISOString(),
        }
      : null,
  );
}

function safeWorkspace(value: WorkspaceResponse): WorkspaceResponse {
  return workspaceResponseSchema.parse({
    id: value.id,
    name: value.name,
    role: value.role,
    isDemo: value.isDemo,
  });
}

function responseHeaders(source?: Headers): Headers {
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
  });
  if (source) {
    for (const name of [
      'location',
      'retry-after',
      'x-retry-after',
      'www-authenticate',
      'content-security-policy',
      'referrer-policy',
    ]) {
      const value = source.get(name);
      if (value) headers.set(name, value);
    }
    const retryAfter = source.get('retry-after') ?? source.get('x-retry-after');
    if (retryAfter && /^\d+$/.test(retryAfter)) headers.set('retry-after', retryAfter);
    for (const cookie of source.getSetCookie()) headers.append('set-cookie', cookie);
  }
  return headers;
}

export function createServerServices(config: ServerConfig) {
  const tenantDatabase = createDatabase(config.databaseUrl);
  const authDatabase = createDatabase(config.authDatabaseUrl);
  const auth = createAuthentication(config, authDatabase);

  async function getInternalSession(request: Request) {
    return auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  }

  async function getSafeSession(request: Request): Promise<SafeSession | null> {
    return safeSession(await getInternalSession(request));
  }

  async function requireSession(request: Request) {
    const resolved = await getInternalSession(request);
    if (!resolved) throw unauthenticated();
    return resolved;
  }

  async function requireMutationSession(request: Request): Promise<SafeSession> {
    const resolved = await requireSession(request);
    assertApplicationMutation(request, resolved.session.token, config);
    return safeSession(resolved)!;
  }

  async function getWorkspaces(request: Request): Promise<WorkspaceResponse[]> {
    const resolved = await requireSession(request);
    return (await listOwnWorkspaces(tenantDatabase, resolved.user.id)).map(safeWorkspace);
  }

  async function authorizeWorkspace(
    request: Request,
    workspaceId: string,
    requiredRole: WorkspaceRole = 'viewer',
  ): Promise<AuthorizationContext> {
    if (!z.uuid().safeParse(workspaceId).success) throw inaccessible();
    const resolved = await requireSession(request);
    const membership = (await listOwnWorkspaces(tenantDatabase, resolved.user.id)).find(
      (workspace) => workspace.id === workspaceId,
    );
    if (!membership) throw inaccessible();
    if (roleRank[membership.role] < roleRank[requiredRole]) {
      throw new ApplicationError(
        403,
        'FORBIDDEN',
        'Action not permitted',
        'Your workspace role does not permit this action.',
      );
    }
    return Object.freeze({
      actorId: resolved.user.id,
      workspaceId,
      role: membership.role,
      requiredRole,
      [authorizationBrand]: true as const,
    });
  }

  async function withWorkspaceContext<T>(
    context: AuthorizationContext,
    callback: (tx: DbTransaction) => Promise<T>,
  ): Promise<T> {
    if (!context[authorizationBrand]) throw inaccessible();
    return withTenantTransaction(
      tenantDatabase,
      { actorId: context.actorId, workspaceId: context.workspaceId },
      async (tx) => {
        const memberships = await tx
          .select({ role: workspaceMemberships.role })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, context.workspaceId),
              eq(workspaceMemberships.userId, context.actorId),
            ),
          );
        const current = memberships[0];
        if (!current || roleRank[current.role] < roleRank[context.requiredRole])
          throw inaccessible();
        return callback(tx);
      },
    );
  }

  async function getWorkspace(request: Request, workspaceId: string): Promise<WorkspaceResponse> {
    const context = await authorizeWorkspace(request, workspaceId);
    return withWorkspaceContext(context, async (tx) => {
      const rows = await tx
        .select({
          id: workspaces.id,
          name: workspaces.name,
          isDemo: workspaces.isDemo,
          role: workspaceMemberships.role,
        })
        .from(workspaces)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, workspaces.id),
            eq(workspaceMemberships.userId, context.actorId),
          ),
        )
        .where(eq(workspaces.id, workspaceId));
      const workspace = rows[0];
      if (!workspace) throw inaccessible();
      return safeWorkspace(workspace);
    });
  }

  async function handleAuthRequest(request: Request): Promise<Response> {
    const requestId = randomUUID();
    try {
      const path = new URL(request.url).pathname;
      if (path === '/api/auth/session' && request.method === 'GET') {
        const resolved = await getInternalSession(request);
        const headers = responseHeaders();
        if (resolved) headers.set('x-csrf-token', createCsrfToken(resolved.session.token, config));
        return new Response(JSON.stringify(safeSession(resolved)), { headers });
      }
      if (
        !['/api/auth/sign-in/email', '/api/auth/sign-out'].includes(path) ||
        request.method !== 'POST'
      )
        throw inaccessible();
      assertTrustedOrigin(request, config);
      const body = await readBoundedJson(request);
      const validatedBody = path.endsWith('sign-in/email')
        ? signInSchema.parse(body)
        : z.object({}).strict().parse(body);
      const headers = new Headers(request.headers);
      for (const name of [
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip',
        'forwarded',
        'x-journal-client-ip',
      ])
        headers.delete(name);
      // Foundation default: one conservative gateway bucket, never trust arbitrary forwarded client IPs.
      headers.set('x-journal-client-ip', '127.0.0.1');
      headers.set('content-type', 'application/json');
      headers.delete('content-length');
      const libraryResponse = await auth.handler(
        new Request(request.url, { method: 'POST', headers, body: JSON.stringify(validatedBody) }),
      );
      const shapedHeaders = responseHeaders(libraryResponse.headers);
      if (!libraryResponse.ok) {
        const error = new ApplicationError(
          libraryResponse.status,
          libraryResponse.status === 429 ? 'RATE_LIMITED' : 'AUTH_FAILED',
          libraryResponse.status === 429 ? 'Too many requests' : 'Authentication failed',
          libraryResponse.status === 429
            ? 'Wait before trying again.'
            : 'The request could not be authenticated.',
        );
        const problem = toProblemResponse(error, requestId);
        shapedHeaders.set('content-type', 'application/problem+json');
        return new Response(await problem.text(), {
          status: libraryResponse.status,
          headers: shapedHeaders,
        });
      }
      // Never relay the library JSON: standard sign-in includes the opaque session token.
      return new Response(JSON.stringify({ ok: true }), {
        status: libraryResponse.status,
        headers: shapedHeaders,
      });
    } catch (error) {
      getLogger().error(
        { err: error, requestId, operation: 'auth.gateway' },
        'Authentication request rejected',
      );
      return toProblemResponse(error, requestId);
    }
  }

  async function bootstrapOwner(input: { email: string; password: string; name: string }) {
    const body = provisionInput.parse(input);
    const offlineAuth = createAuthentication(config, authDatabase, true);
    const created = await offlineAuth.api.signUpEmail({ body });
    const workspace = await createPersonalWorkspace(tenantDatabase, created.user.id, {
      name: 'Personal workspace',
    });
    return {
      user: { id: created.user.id, email: created.user.email, name: created.user.name },
      workspace: safeWorkspace(workspace),
    };
  }

  async function seedDemoWorkspace(actorId: string) {
    const existing = (await listOwnWorkspaces(tenantDatabase, actorId)).find(
      (workspace) => workspace.isDemo,
    );
    if (existing) return safeWorkspace(existing);
    return safeWorkspace(
      await createPersonalWorkspace(tenantDatabase, actorId, {
        id: randomUUID(),
        name: 'Demo workspace',
        isDemo: true,
      }),
    );
  }

  async function verifyReadiness() {
    try {
      await verifyDatabaseSchema(tenantDatabase);
      await authDatabase.pool.query('SELECT 1');
      return {
        status: 'ready' as const,
        database: 'connected' as const,
        schema: 'current' as const,
      };
    } catch {
      throw new ApplicationError(
        503,
        'NOT_READY',
        'Service unavailable',
        'The service is not ready.',
      );
    }
  }

  return {
    getSafeSession,
    requireMutationSession,
    getWorkspaces,
    getWorkspace,
    authorizeWorkspace,
    withWorkspaceContext,
    handleAuthRequest,
    bootstrapOwner,
    seedDemoWorkspace,
    verifyReadiness,
    close: () => Promise.all([tenantDatabase.close(), authDatabase.close()]),
  };
}

export type ServerServices = ReturnType<typeof createServerServices>;
let services: ServerServices | undefined;
function defaultServices(): ServerServices {
  services ??= createServerServices(getServerConfig());
  return services;
}

export const getSafeSession = (request: Request) => defaultServices().getSafeSession(request);
export const requireMutationSession = (request: Request) =>
  defaultServices().requireMutationSession(request);
export const getWorkspaces = (request: Request) => defaultServices().getWorkspaces(request);
export const getWorkspace = (request: Request, workspaceId: string) =>
  defaultServices().getWorkspace(request, workspaceId);
export const authorizeWorkspace = (
  request: Request,
  workspaceId: string,
  requiredRole?: WorkspaceRole,
) => defaultServices().authorizeWorkspace(request, workspaceId, requiredRole);
export const withWorkspaceContext = <T>(
  context: AuthorizationContext,
  callback: (tx: DbTransaction) => Promise<T>,
) => defaultServices().withWorkspaceContext(context, callback);
export const handleAuthRequest = (request: Request) => defaultServices().handleAuthRequest(request);
export const verifyReadiness = () => defaultServices().verifyReadiness();
export async function bootstrapOwner(
  input: { email: string; password: string; name: string },
  config?: ServerConfig,
) {
  const temporary = createServerServices(config ?? getServerConfig());
  try {
    return await temporary.bootstrapOwner(input);
  } finally {
    await temporary.close();
  }
}
export async function seedDemoWorkspace(actorId: string, config?: ServerConfig) {
  const temporary = createServerServices(config ?? getServerConfig());
  try {
    return await temporary.seedDemoWorkspace(actorId);
  } finally {
    await temporary.close();
  }
}
