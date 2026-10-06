import pino, {
  type DestinationStream,
  type Logger,
  type LevelWithSilent,
  type LoggerOptions,
} from 'pino';

const sensitivePaths = [
  'password',
  'token',
  'secret',
  'cookie',
  'authorization',
  'headers.cookie',
  'headers.authorization',
  'req.headers.cookie',
  'req.headers.authorization',
  'req.body',
  'body',
  'source',
  'notes',
  'file',
  'res.headers.set-cookie',
  'databaseUrl',
  'authDatabaseUrl',
  'jobDatabaseUrl',
  'betterAuthSecret',
  'DATABASE_URL',
  'AUTH_DATABASE_URL',
  'JOB_DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'BETTER_AUTH_SECRET',
  '*.password',
  '*.token',
  '*.secret',
  '*.cookie',
  '*.authorization',
  '*.databaseUrl',
  '*.authDatabaseUrl',
];

/** Log error classification only: raw messages/stacks can embed SQL or credentials. */
function safeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const result: Record<string, unknown> = {
      type: /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name) ? error.name : 'Error',
    };
    if ('code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)) {
      result.code = error.code;
    }
    if ('fields' in error && Array.isArray(error.fields)) {
      result.fields = error.fields
        .filter(
          (field): field is string =>
            typeof field === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(field),
        )
        .slice(0, 20);
    }
    return result;
  }
  return { type: 'UnknownError' };
}

export function createLogger(
  options: { level?: LevelWithSilent; destination?: DestinationStream } = {},
): Logger {
  const settings: LoggerOptions = {
    level: options.level ?? 'info',
    base: null,
    redact: { paths: sensitivePaths, censor: '[REDACTED]' },
    serializers: { err: safeError, error: safeError },
    hooks: {
      logMethod(args, method) {
        const first = args[0];
        if (
          args.length === 1 &&
          (first instanceof Error ||
            (typeof first === 'object' && first !== null && ('err' in first || 'error' in first)))
        ) {
          // Pino otherwise derives msg from the raw Error.message before serializers.
          method.call(this, first instanceof Error ? { err: first } : first, 'Operation failed');
          return;
        }
        method.apply(this, args);
      },
    },
    formatters: {
      log(value: Record<string, unknown>) {
        const allowed = new Set([
          'event',
          'operation',
          'requestId',
          'jobId',
          'correlationId',
          'actorId',
          'workspaceId',
          'durationMs',
          'count',
          'recordCount',
          'sourceRevision',
          'calculationVersion',
          'retryCount',
          'status',
          'service',
          'code',
          'err',
          'error',
          'fields',
        ]);
        const safe = Object.fromEntries(Object.entries(value).filter(([key]) => allowed.has(key)));
        if ('fields' in safe) {
          safe.fields = Array.isArray(safe.fields)
            ? safe.fields
                .filter(
                  (field): field is string =>
                    typeof field === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(field),
                )
                .slice(0, 20)
            : [];
        }
        return safe;
      },
    },
  };
  return options.destination ? pino(settings, options.destination) : pino(settings);
}

let logger: Logger | undefined;

export function getLogger(): Logger {
  const level = process.env.LOG_LEVEL;
  logger ??= createLogger({
    level: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(level ?? '')
      ? (level as LevelWithSilent)
      : 'info',
  });
  return logger;
}
