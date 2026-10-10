import { createHmac, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  changePasswordSchema,
  revokeSessionSchema,
  safeSessionListResponseSchema,
  sessionResponseSchema,
  signInSchema,
} from '@journal/contracts';
import type { Database } from '@journal/database';
import { authSecurityEvents, session } from '@journal/database/schema';
import type { Authentication } from './auth.js';
import type { ServerConfig } from './config.js';
import { ApplicationError, inaccessible, toProblemResponse, unauthenticated } from './errors.js';
import { createLogger } from './logging.js';
import {
  assertApplicationMutation,
  assertTrustedOrigin,
  createCsrfToken,
  readBoundedJson,
} from './security.js';

/** Preserve individual cookie headers; public JSON never inherits library credentials. */
export function authResponseHeaders(source?: Headers): Headers {
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

export function createAuthAuditor(database: Database, config: ServerConfig) {
  const logger = createLogger({ level: config.logLevel });
  return async (
    subjectUserId: string,
    action: string,
    requestId: string = randomUUID(),
    actorId: string | null = subjectUserId,
  ): Promise<void> => {
    try {
      await database.db
        .insert(authSecurityEvents)
        .values({ subjectUserId, actorId, action, requestId });
    } catch (error) {
      // Authentication already committed in the library's transaction. Preserve
      // usable cookies/success and emit a safe signal for the missing audit entry.
      logger.error(
        {
          event: 'auth.audit-write-failed',
          err: error,
          actorId: subjectUserId,
          requestId,
          operation: 'auth.audit',
        },
        'Authentication audit write failed',
      );
    }
  };
}

export function createAuthGateway(auth: Authentication, database: Database, config: ServerConfig) {
  const logger = createLogger({ level: config.logLevel });
  const audit = createAuthAuditor(database, config);
  async function resolveSession(request: Request) {
    return auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  }

  async function consumeLoginBucket(key: string, maximum: number): Promise<boolean> {
    // One SQL upsert serializes bounded fixed-window counters across replicas.
    const result = await database.pool.query<{ count: number }>(
      `INSERT INTO auth.rate_limit(id,key,count,last_request)
       VALUES ($1,$2,1,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN auth.rate_limit.last_request <= floor(extract(epoch FROM clock_timestamp())*1000)::bigint-900000 THEN 1 ELSE LEAST(auth.rate_limit.count+1,$3+1) END,
         last_request = CASE WHEN auth.rate_limit.last_request <= floor(extract(epoch FROM clock_timestamp())*1000)::bigint-900000 THEN floor(extract(epoch FROM clock_timestamp())*1000)::bigint ELSE auth.rate_limit.last_request END
       RETURNING count`,
      [randomUUID(), key, maximum],
    );
    return (result.rows[0]?.count ?? maximum + 1) <= maximum;
  }

  async function consumeLoginLimits(email: string): Promise<boolean> {
    // Check shared ingress before creating any attacker-chosen account bucket.
    if (!(await consumeLoginBucket('journal:login:ingress', 100))) return false;
    await database.pool.query(`WITH expired AS (
      SELECT id FROM auth.rate_limit WHERE key LIKE 'journal:login:%'
      AND last_request <= floor(extract(epoch FROM clock_timestamp())*1000)::bigint-900000
      ORDER BY last_request LIMIT 100
    ) DELETE FROM auth.rate_limit USING expired WHERE auth.rate_limit.id=expired.id`);
    const key = `journal:login:account:${createHmac('sha256', config.betterAuthSecret).update(email.toLowerCase()).digest('hex')}`;
    return consumeLoginBucket(key, 10);
  }

  return async function handleAuthRequest(request: Request): Promise<Response> {
    const requestId = randomUUID();
    try {
      const path = new URL(request.url).pathname;
      if (path === '/api/auth/session' && request.method === 'GET') {
        const resolved = await resolveSession(request);
        const headers = authResponseHeaders();
        if (resolved) headers.set('x-csrf-token', createCsrfToken(resolved.session.token, config));
        const dto = sessionResponseSchema.parse(
          resolved
            ? {
                user: {
                  id: resolved.user.id,
                  name: resolved.user.name,
                  email: resolved.user.email,
                },
                expiresAt: resolved.session.expiresAt.toISOString(),
              }
            : null,
        );
        return new Response(JSON.stringify(dto), { headers });
      }

      const sessionRoute = path === '/api/auth/sessions' && request.method === 'GET';
      const mutationRoute =
        [
          '/api/auth/sign-in/email',
          '/api/auth/sign-out',
          '/api/auth/change-password',
          '/api/auth/revoke-session',
        ].includes(path) && request.method === 'POST';
      if (!sessionRoute && !mutationRoute) throw inaccessible();
      if (mutationRoute) assertTrustedOrigin(request, config);
      let resolved = null;
      if (
        sessionRoute ||
        path.endsWith('change-password') ||
        path.endsWith('revoke-session') ||
        path.endsWith('sign-out')
      ) {
        resolved = await resolveSession(request);
        if (!resolved) throw unauthenticated();
        if (
          !path.endsWith('sign-out') &&
          Date.now() - resolved.session.createdAt.getTime() >= 5 * 60_000
        ) {
          throw new ApplicationError(
            403,
            'REAUTHENTICATION_REQUIRED',
            'Sign in again',
            'A recent sign-in is required for account security changes.',
          );
        }
        if (mutationRoute) assertApplicationMutation(request, resolved.session.token, config);
      }
      if (sessionRoute) {
        const libraryResponse = await auth.api.listSessions({
          headers: request.headers,
          asResponse: true,
        });
        if (!libraryResponse.ok) throw unauthenticated();
        const values = (await libraryResponse.json()) as Array<{
          id: string;
          createdAt: string;
          expiresAt: string;
        }>;
        return new Response(
          JSON.stringify(
            safeSessionListResponseSchema.parse({
              sessions: values.map((value) => ({
                id: value.id,
                createdAt: value.createdAt,
                expiresAt: value.expiresAt,
                current: value.id === resolved!.session.id,
              })),
            }),
          ),
          { headers: authResponseHeaders(libraryResponse.headers) },
        );
      }

      const body = await readBoundedJson(request);
      let libraryBody: unknown;
      let libraryPath = path;
      if (path.endsWith('sign-in/email')) {
        const credentials = signInSchema.parse(body);
        if (!(await consumeLoginLimits(credentials.email))) {
          const limited = toProblemResponse(
            new ApplicationError(
              429,
              'RATE_LIMITED',
              'Too many requests',
              'Wait before trying again.',
            ),
            requestId,
          );
          limited.headers.set('retry-after', '900');
          return limited;
        }
        libraryBody = credentials;
      } else if (path.endsWith('change-password')) {
        libraryBody = { ...changePasswordSchema.parse(body), revokeOtherSessions: true };
      } else if (path.endsWith('revoke-session')) {
        const { sessionId } = revokeSessionSchema.parse(body);
        const [owned] = await database.db
          .select({ token: session.token })
          .from(session)
          .where(and(eq(session.id, sessionId), eq(session.userId, resolved!.user.id)));
        if (!owned) throw inaccessible();
        if (sessionId === resolved!.session.id) {
          libraryPath = '/api/auth/sign-out';
          libraryBody = {};
        } else libraryBody = { token: owned.token };
      } else {
        libraryBody = z.strictObject({}).parse(body);
      }

      const headers = new Headers(request.headers);
      for (const name of [
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip',
        'forwarded',
        'x-journal-client-ip',
      ])
        headers.delete(name);
      // Until a reviewed proxy integration exists, client-supplied IP claims are discarded.
      headers.set('x-journal-client-ip', '127.0.0.1');
      headers.set('content-type', 'application/json');
      headers.delete('content-length');
      const target = new URL(request.url);
      target.pathname = libraryPath;
      const libraryResponse = await auth.handler(
        new Request(target, { method: 'POST', headers, body: JSON.stringify(libraryBody) }),
      );
      const shapedHeaders = authResponseHeaders(libraryResponse.headers);
      shapedHeaders.set('x-request-id', requestId);
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
      let subject = resolved?.user.id;
      if (path.endsWith('sign-in/email')) {
        // This response remains server-only, even though the library includes a token.
        const result = (await libraryResponse.json()) as { user: { id: string } };
        subject = result.user.id;
      }
      if (subject)
        await audit(
          subject,
          `auth.${path.split('/').at(-1) === 'email' ? 'sign-in' : path.split('/').at(-1)}`,
          requestId,
        );
      return new Response(JSON.stringify({ ok: true }), {
        status: libraryResponse.status,
        headers: shapedHeaders,
      });
    } catch (error) {
      logger.error(
        { err: error, requestId, operation: 'auth.gateway' },
        'Authentication request rejected',
      );
      return toProblemResponse(error, requestId);
    }
  };
}
