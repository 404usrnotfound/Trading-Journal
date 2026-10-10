import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  sessionResponseSchema,
  workspaceResponseSchema,
  workspacePreferencesUpdateSchema,
  type SessionResponse,
  type WorkspaceResponse,
} from '@journal/contracts';
import {
  createDatabase,
  ensurePersonalWorkspace,
  listOwnWorkspaces,
  verifyDatabaseSchema,
  withTenantTransaction,
  type DbTransaction,
} from '@journal/database';
import { sql } from 'drizzle-orm';
import { auditEvents, user, workspaceMemberships, workspaces } from '@journal/database/schema';
import { createAuthentication } from './auth.js';
import { createAuthGateway, createAuthAuditor } from './auth-gateway.js';
import { getServerConfig, type ServerConfig } from './config.js';
import { ApplicationError, inaccessible, unauthenticated } from './errors.js';
import { assertApplicationMutation, readBoundedJson } from './security.js';

export type SafeSession = NonNullable<SessionResponse>;
export type WorkspaceRole = WorkspaceResponse['role'];
const authorizationBrand = Symbol('server-authorized-context');
export type AuthorizationContext = Readonly<{
  actorId: string;
  workspaceId: string;
  role: WorkspaceRole;
  requiredRole: WorkspaceRole;
  requestId: string;
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
    timezone: value.timezone,
    reportingCurrency: value.reportingCurrency,
    revision: value.revision,
  });
}

export function createServerServices(config: ServerConfig) {
  const tenantDatabase = createDatabase(config.databaseUrl);
  const authDatabase = createDatabase(config.authDatabaseUrl);
  const auth = createAuthentication(config, authDatabase);
  const handleAuthRequest = createAuthGateway(auth, authDatabase, config);
  const auditAuth = createAuthAuditor(authDatabase, config);

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
      requestId: randomUUID(),
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
          timezone: workspaces.timezone,
          reportingCurrency: workspaces.reportingCurrency,
          revision: workspaces.revision,
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

  async function updateWorkspacePreferences(
    request: Request,
    workspaceId: string,
  ): Promise<WorkspaceResponse> {
    await requireMutationSession(request);
    const body = workspacePreferencesUpdateSchema.parse(await readBoundedJson(request));
    const context = await authorizeWorkspace(request, workspaceId, 'owner');
    return withWorkspaceContext(context, async (tx) => {
      const [updated] = await tx
        .update(workspaces)
        .set({
          ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
          ...(body.reportingCurrency !== undefined
            ? { reportingCurrency: body.reportingCurrency }
            : {}),
          revision: sql`${workspaces.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.revision, body.expectedRevision)))
        .returning();
      if (!updated)
        throw new ApplicationError(
          409,
          'STALE_REVISION',
          'Preferences changed',
          'Reload the workspace and retry with the current revision.',
        );
      await tx.insert(auditEvents).values({
        workspaceId,
        actorId: context.actorId,
        action: 'workspace.preferences-updated',
        requestId: context.requestId,
      });
      return safeWorkspace({ ...updated, role: 'owner' });
    });
  }

  async function recoverOwnerPassword(input: { email: string; password: string }) {
    const body = z
      .strictObject({ email: z.email(), password: z.string().min(12).max(128) })
      .parse(input);
    let recoveryToken: string | undefined;
    const offlineAuth = createAuthentication(config, authDatabase, false, (token) => {
      recoveryToken = token;
    });
    await offlineAuth.api.requestPasswordReset({ body: { email: body.email } });
    if (!recoveryToken)
      throw new ApplicationError(
        404,
        'NOT_FOUND',
        'Account not found',
        'No provisioned account matches that email.',
      );
    await offlineAuth.api.resetPassword({
      body: { newPassword: body.password, token: recoveryToken },
    });
    const result = await authDatabase.pool.query<{ id: string }>(
      'SELECT id FROM auth."user" WHERE email=$1',
      [body.email.toLowerCase()],
    );
    const subject = result.rows[0]?.id;
    if (subject) await auditAuth(subject, 'auth.operator-password-reset', undefined, null);
    recoveryToken = undefined;
    return { ok: true as const };
  }

  async function bootstrapOwner(input: { email: string; password: string; name: string }) {
    const body = provisionInput.parse(input);
    // Reject absent/incompatible tenant schema before creating a global identity.
    await verifyDatabaseSchema(tenantDatabase);
    const offlineAuth = createAuthentication(config, authDatabase, true);
    const [existing] = await authDatabase.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, body.email.toLowerCase()));
    let created: { user: { id: string; email: string; name: string } };
    if (existing) {
      // A retry repairs a previously interrupted workspace bootstrap, without
      // changing the existing password or accepting an unverified identity.
      const login = await offlineAuth.api.signInEmail({
        body: { email: body.email, password: body.password },
        asResponse: true,
      });
      if (!login.ok)
        throw new ApplicationError(
          401,
          'AUTH_FAILED',
          'Authentication failed',
          'The existing account could not be authenticated.',
        );
      created = (await login.json()) as typeof created;
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      await offlineAuth.api.signOut({ headers: new Headers({ cookie, origin: config.appOrigin }) });
    } else {
      created = await offlineAuth.api.signUpEmail({ body });
      await auditAuth(created.user.id, 'auth.operator-provisioned', undefined, null);
    }
    const workspace = safeWorkspace(
      await ensurePersonalWorkspace(tenantDatabase, created.user.id, {
        name: 'Personal workspace',
      }),
    );
    return {
      user: { id: created.user.id, email: created.user.email, name: created.user.name },
      workspace,
    };
  }

  async function seedDemoWorkspace(actorId: string) {
    return safeWorkspace(
      await ensurePersonalWorkspace(tenantDatabase, actorId, {
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
    recoverOwnerPassword,
    updateWorkspacePreferences,
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
export const updateWorkspacePreferences = (request: Request, workspaceId: string) =>
  defaultServices().updateWorkspacePreferences(request, workspaceId);
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

export async function recoverOwnerPassword(
  input: { email: string; password: string },
  config?: ServerConfig,
) {
  const temporary = createServerServices(config ?? getServerConfig());
  try {
    return await temporary.recoverOwnerPassword(input);
  } finally {
    await temporary.close();
  }
}
