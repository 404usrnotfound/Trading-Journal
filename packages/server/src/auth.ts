import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Database } from '@journal/database';
import { user, session, account, verification, rateLimit } from '@journal/database/schema';
import type { ServerConfig } from './config.js';
import { passwordHashing } from './credentials.js';

/** Public and offline-provisioning instances share mechanisms, never endpoint policy. */
export function createAuthentication(
  config: ServerConfig,
  database: Database,
  allowSignUp = false,
  receiveRecoveryToken?: (token: string) => void,
) {
  return betterAuth({
    appName: 'Trading Journal',
    baseURL: config.appOrigin,
    basePath: '/api/auth',
    secret: config.betterAuthSecret,
    trustedOrigins: [config.appOrigin],
    database: drizzleAdapter(database.db, {
      provider: 'pg',
      schema: { user, session, account, verification, rateLimit },
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignUp,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: passwordHashing,
      revokeSessionsOnPasswordReset: true,
      ...(receiveRecoveryToken
        ? { sendResetPassword: async ({ token }: { token: string }) => receiveRecoveryToken(token) }
        : {}),
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      disableSessionRefresh: true,
      freshAge: 5 * 60,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: 'journal',
      useSecureCookies: config.appOrigin.startsWith('https:'),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.appOrigin.startsWith('https:'),
        path: '/',
      },
      ipAddress: { ipAddressHeaders: ['x-journal-client-ip'] },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 100,
      // The gateway adds a separate persisted per-account limit. With no trusted
      // proxy configured, this ceiling deliberately applies to the shared ingress.
      customRules: { '/sign-in/email': { window: 15 * 60, max: 100 } },
    },
    logger: { disabled: true },
  });
}

export type Authentication = ReturnType<typeof createAuthentication>;
