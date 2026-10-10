import { parse, resolve, sep } from 'node:path';
import { z } from 'zod';

const databaseUrl = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
        parsed.hostname.length > 0 &&
        parsed.pathname.length > 1
      );
    } catch {
      return false;
    }
  }, 'Must be a PostgreSQL connection URL');

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: databaseUrl,
    AUTH_DATABASE_URL: databaseUrl,
    JOB_DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: z
      .string()
      .min(32)
      .refine((value) => value.trim().length >= 32),
    APP_ORIGIN: z.url().default('http://localhost:3000'),
    STORAGE_ROOT: z
      .string()
      .trim()
      .min(1)
      .refine((value) => !value.includes('\0'))
      .default('.data/private'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((value, context) => {
    const storagePath = resolve(value.STORAGE_ROOT);
    if (
      storagePath === parse(storagePath).root ||
      storagePath
        .split(sep)
        .some((part) => ['public', '.next', 'dist', 'build'].includes(part.toLowerCase()))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_ROOT'],
        message: 'Private storage cannot be a filesystem root or public directory',
      });
    }
    let origin: URL;
    try {
      origin = new URL(value.APP_ORIGIN);
    } catch {
      // The URL schema already reports APP_ORIGIN; never throw its raw input.
      return;
    }
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'Must be an origin without credentials, path, query, or fragment',
      });
    }
    if (value.NODE_ENV === 'production') {
      if (origin.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: ['APP_ORIGIN'],
          message: 'Production requires HTTPS',
        });
      }
    } else if (
      !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
      !['http:', 'https:'].includes(origin.protocol)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'Non-production authentication must use a loopback HTTP(S) origin',
      });
    }
  });

export type ServerConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  authDatabaseUrl: string;
  jobDatabaseUrl: string;
  betterAuthSecret: string;
  appOrigin: string;
  storageRoot: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}>;

export class ServerConfigurationError extends Error {
  readonly code = 'INVALID_SERVER_CONFIGURATION';
  constructor(public readonly fields: readonly string[]) {
    super(`Invalid server configuration: ${fields.join(', ')}`);
    this.name = 'ServerConfigurationError';
  }
}

/** Parse only declared bindings. Never include environment values in diagnostics. */
export function parseServerConfig(environment: Record<string, string | undefined>): ServerConfig {
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'configuration'))),
    ];
    throw new ServerConfigurationError(fields);
  }
  return Object.freeze({
    nodeEnv: parsed.data.NODE_ENV,
    databaseUrl: parsed.data.DATABASE_URL,
    authDatabaseUrl: parsed.data.AUTH_DATABASE_URL,
    jobDatabaseUrl: parsed.data.JOB_DATABASE_URL,
    betterAuthSecret: parsed.data.BETTER_AUTH_SECRET,
    appOrigin: new URL(parsed.data.APP_ORIGIN).origin,
    storageRoot: resolve(parsed.data.STORAGE_ROOT),
    logLevel: parsed.data.LOG_LEVEL,
  });
}

let cachedConfig: ServerConfig | undefined;

/** Lazy on purpose: importing server modules during a build never needs secrets. */
export function getServerConfig(): ServerConfig {
  cachedConfig ??= parseServerConfig(process.env);
  return cachedConfig;
}
