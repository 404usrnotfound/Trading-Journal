import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { sql, type DbTransaction } from '@journal/database';
import type { AuthorizationContext, ServerServices } from '../../packages/server/src/services.js';

type Platform = Pick<ServerServices, 'withWorkspaceContext'>;
type Statement = Parameters<DbTransaction['execute']>[0];
type QuerySample = {
  fingerprint: string;
  shape: string;
  milliseconds: number;
  rows: number;
  failed: boolean;
};

export type QuerySummary = {
  fingerprint: string;
  shape: string;
  count: number;
  failures: number;
  rows: number;
  totalMilliseconds: number;
  maximumMilliseconds: number;
};

/** No bind values enter the report. String constants in SQL/plan expressions are redacted too. */
export function redactSql(value: string): string {
  return value
    .replace(/\$([A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$\1\$/g, '?')
    .replace(/'(?:''|[^'])*'/g, '?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizePlan(value: unknown): unknown {
  if (typeof value === 'string') return redactSql(value);
  if (Array.isArray(value)) return value.map(sanitizePlan);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, sanitizePlan(child)]),
    );
  return value;
}

/** Only request-time observation clocks reviewed in the service DTOs are omitted. */
export function canonicalFinancialJson(
  value: unknown,
  volatilePaths: readonly string[] = [],
): string {
  const omitted = new Set(volatilePaths);
  function encode(child: unknown, path: string): string {
    if (child === null || typeof child !== 'object') {
      const encoded = JSON.stringify(child);
      if (encoded === undefined) throw new Error('Benchmark DTO must contain JSON values');
      return encoded;
    }
    if (Array.isArray(child))
      return `[${child.map((item, index) => encode(item, `${path}/${index}`)).join(',')}]`;
    return `{${Object.entries(child)
      .filter(([key, item]) => item !== undefined && !omitted.has(`${path}/${key}`))
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${encode(item, `${path}/${key}`)}`)
      .join(',')}}`;
  }
  return encode(value, '');
}

export function financialHash(value: unknown, volatilePaths: readonly string[] = []): string {
  return createHash('sha256').update(canonicalFinancialJson(value, volatilePaths)).digest('hex');
}

type FinancialObservation = {
  state: 'computed' | 'rejected';
  financialHash?: string;
  error?: { code: string; status: number };
};

/** A rejected request has no financial DTO against which a new result can be compared. */
export function compareFinancialEvidence(
  before: readonly FinancialObservation[],
  after: readonly FinancialObservation[],
) {
  if (!before.length || !after.length)
    throw new Error('Financial comparison requires observations');
  if ([...before, ...after].some((sample) => sample.state === 'computed' && !sample.financialHash))
    throw new Error('Computed observation is missing its financial DTO hash');
  const hashes = (samples: readonly FinancialObservation[]) =>
    [
      ...new Set(
        samples.flatMap((sample) =>
          sample.state === 'computed' && sample.financialHash ? [sample.financialHash] : [],
        ),
      ),
    ].sort();
  const previous = hashes(before);
  const current = hashes(after);
  if (previous.length && after.some((sample) => sample.state === 'rejected'))
    throw new Error('Previously computed financial scope is now rejected');
  if (previous.length && financialHash(previous) !== financialHash(current))
    throw new Error('Financial DTO hashes differ');
  const outcomes = (samples: readonly FinancialObservation[]) =>
    [
      ...new Set(
        samples.map((sample) =>
          sample.state === 'computed'
            ? 'computed'
            : `${sample.error?.status}:${sample.error?.code}`,
        ),
      ),
    ].sort();
  return {
    financialEquivalence: previous.length
      ? 'identical-computed-dtos'
      : current.length
        ? 'not-comparable-before-rejected'
        : 'not-comparable-rejected',
    beforeOutcomes: outcomes(before),
    afterOutcomes: outcomes(after),
  };
}

export function sampleStatistics(samples: readonly number[]) {
  if (!samples.length) throw new Error('Benchmark statistics require samples');
  const ordered = [...samples].sort((left, right) => left - right);
  const quantile = (fraction: number) =>
    ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)]!;
  return {
    count: samples.length,
    minimum: ordered[0]!,
    median: quantile(0.5),
    p95: quantile(0.95),
    maximum: ordered.at(-1)!,
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
  };
}

/**
 * Benchmark-only instrumentation. The underlying platform still authenticates the context,
 * rechecks membership, sets transaction-local tenant settings and receives unchanged options.
 * Counts cover tx.execute inside the business callback, excluding context/membership setup.
 * SQL wall times include driver transfer/decoding; EXPLAIN separately measures server execution.
 */
export function instrumentPlatform(platform: Platform) {
  let active: QuerySample[] = [];
  let peak = process.memoryUsage();
  const candidates = new Map<string, { statement: Statement; summary: QuerySummary }>();
  const instrumented: Platform = {
    withWorkspaceContext: (context, callback, options) =>
      platform.withWorkspaceContext(
        context,
        async (transaction) => {
          const execute = transaction.execute.bind(transaction);
          const proxy = new Proxy(transaction, {
            get(target, property, receiver) {
              if (property !== 'execute') return Reflect.get(target, property, receiver);
              return async (statement: Statement) => {
                // Drizzle 0.45's dialect compiler is used by execute itself. We retain
                // the SQL object privately for EXPLAIN; compiled params are never retained.
                const compiler = target as unknown as {
                  dialect: { sqlToQuery: (query: unknown) => { sql: string } };
                };
                const compiled = compiler.dialect.sqlToQuery(
                  typeof statement === 'string' ? sql.raw(statement) : statement.getSQL(),
                );
                const shape = redactSql(compiled.sql);
                const fingerprint = createHash('sha256').update(shape).digest('hex').slice(0, 16);
                const started = performance.now();
                let rows = 0;
                let failed = false;
                try {
                  const result = await execute(statement);
                  rows = result.rowCount ?? result.rows.length;
                  return result;
                } catch (error) {
                  failed = true;
                  throw error;
                } finally {
                  const milliseconds = performance.now() - started;
                  active.push({ fingerprint, shape, milliseconds, rows, failed });
                  const existing = candidates.get(fingerprint);
                  const summary = existing?.summary ?? {
                    fingerprint,
                    shape,
                    count: 0,
                    failures: 0,
                    rows: 0,
                    totalMilliseconds: 0,
                    maximumMilliseconds: 0,
                  };
                  summary.count++;
                  summary.failures += Number(failed);
                  summary.rows += rows;
                  summary.totalMilliseconds += milliseconds;
                  summary.maximumMilliseconds = Math.max(summary.maximumMilliseconds, milliseconds);
                  if (!existing) candidates.set(fingerprint, { statement, summary });
                  if (active.length % 20 === 0) {
                    const memory = process.memoryUsage();
                    if (memory.heapUsed > peak.heapUsed)
                      peak = { ...peak, heapUsed: memory.heapUsed };
                    if (memory.rss > peak.rss) peak = { ...peak, rss: memory.rss };
                  }
                }
              };
            },
          });
          return callback(proxy);
        },
        options,
      ),
  };
  return {
    platform: instrumented,
    reset() {
      active = [];
      peak = process.memoryUsage();
    },
    snapshot() {
      const memory = process.memoryUsage();
      const grouped = new Map<string, QuerySummary>();
      for (const sample of active) {
        const summary = grouped.get(sample.fingerprint) ?? {
          fingerprint: sample.fingerprint,
          shape: sample.shape,
          count: 0,
          failures: 0,
          rows: 0,
          totalMilliseconds: 0,
          maximumMilliseconds: 0,
        };
        summary.count++;
        summary.failures += Number(sample.failed);
        summary.rows += sample.rows;
        summary.totalMilliseconds += sample.milliseconds;
        summary.maximumMilliseconds = Math.max(summary.maximumMilliseconds, sample.milliseconds);
        grouped.set(sample.fingerprint, summary);
      }
      return {
        businessQueries: active.length,
        sqlMilliseconds: active.reduce((sum, query) => sum + query.milliseconds, 0),
        rows: active.reduce((sum, query) => sum + query.rows, 0),
        peakSampledHeapBytes: Math.max(peak.heapUsed, memory.heapUsed),
        peakSampledRssBytes: Math.max(peak.rss, memory.rss),
        queries: [...grouped.values()].sort(
          (left, right) => right.totalMilliseconds - left.totalMilliseconds,
        ),
      };
    },
    async explain(context: AuthorizationContext, maximum = 5) {
      const selected = [...candidates.values()]
        .filter((candidate) => /^\s*(SELECT|WITH)\b/i.test(candidate.summary.shape))
        .sort((left, right) => right.summary.totalMilliseconds - left.summary.totalMilliseconds)
        .slice(0, maximum);
      const plans = [];
      for (const candidate of selected) {
        try {
          const result = await platform.withWorkspaceContext(
            context,
            (transaction) =>
              transaction.execute(
                sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${typeof candidate.statement === 'string' ? sql.raw(candidate.statement) : candidate.statement.getSQL()}`,
              ),
            { isolationLevel: 'repeatable read', accessMode: 'read only' },
          );
          plans.push({ ...candidate.summary, state: 'available', plan: sanitizePlan(result.rows) });
        } catch (error) {
          // Driver messages can contain SQL/bind values. Publish only SQLSTATE.
          const code =
            (error as { cause?: { code?: unknown }; code?: unknown })?.cause?.code ??
            (error as { code?: unknown })?.code;
          plans.push({
            ...candidate.summary,
            state: 'unavailable',
            code: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'PLAN_FAILED',
          });
        }
      }
      return plans;
    },
  };
}
