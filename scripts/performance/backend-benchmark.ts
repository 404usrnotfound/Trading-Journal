import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sql } from '@journal/database';
import {
  analyticsReportRequestSchema,
  dashboardRequestSchema,
  accountingReportRequestSchema,
} from '@journal/contracts';
import { createServerServices } from '../../packages/server/src/services.js';
import { parseServerConfig } from '../../packages/server/src/config.js';
import { toProblemResponse } from '../../packages/server/src/errors.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createAnalyticsServices } from '../../packages/server/src/analytics/service.js';
import { createDashboardServices } from '../../packages/server/src/dashboard/service.js';
import { createAccountingReports } from '../../packages/server/src/accounting/report.js';
import { loadPerformanceBindings, type PerformanceManifest } from './dataset.js';
import {
  compareFinancialEvidence,
  financialHash,
  instrumentPlatform,
  sampleStatistics,
} from './instrument.js';

type BenchmarkOptions = {
  manifestPath: string;
  outputPath: string;
  label: string;
  repetitions: number;
  warmups: number;
  explain: number;
  operations?: readonly string[];
  comparePath?: string;
};

type Operation = {
  name: string;
  scope:
    | 'whole-dataset'
    | 'bounded-account'
    | 'single-trade'
    | 'bounded-account-intraday'
    | 'bounded-account-recent';
  run: () => Promise<unknown>;
  volatilePaths: readonly string[];
  scopeContext?: Readonly<{ accountIds: readonly string[]; from: string; to: string }>;
  supplemental?: boolean;
};

type Observation = {
  serviceMilliseconds: number;
  serializationMilliseconds: number;
  heapBeforeBytes: number;
  heapAfterBytes: number;
  rssBeforeBytes: number;
  rssAfterBytes: number;
  businessQueries: number;
  sqlMilliseconds: number;
  rows: number;
  peakSampledHeapBytes: number;
  peakSampledRssBytes: number;
  queries: ReturnType<ReturnType<typeof instrumentPlatform>['snapshot']>['queries'];
  state: 'computed' | 'rejected';
  error?: { code: string; status: number };
  financialHash?: string;
  jsonBytes?: number;
  gzipBytes?: number;
  responseCounts?: Record<string, number>;
};

// Returned populations are telemetry only. Read lengths without changing the DTO
// used for exact financial hashing or the measured service/serialization windows.
function responseCounts(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  const object = (item: unknown): Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  const result = object(value);
  const length = (name: string, items: unknown) => {
    if (Array.isArray(items)) counts[name] = items.length;
  };
  length('trades', result.trades);
  length('campaignRecords', result.records ?? object(result.analytics).records);
  length('accountCurvePoints', object(result.accountView).points);
  length('journalLegs', object(result.financial).legs);
  length('journalTimelineEvents', object(result.financial).timeline);
  length('accountingAccounts', object(result.context).accountIds);
  const dependencies = object(result.dependencies);
  length('accountingSourceIds', dependencies.sourceIds);
  length('accountingFxSelections', dependencies.fx);
  length('accountingPriceSelections', dependencies.prices);
  return counts;
}

async function optionalFile(path: string) {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function sourceIdentity() {
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const execute = promisify(execFile);
  const [head, files, rootPackage, webPackage] = await Promise.all([
    execute('git', ['rev-parse', 'HEAD'], { cwd: repository }),
    execute(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        'packages/domain/src',
        'packages/server/src',
        'packages/contracts/src',
        'packages/database/src',
      ],
      { cwd: repository },
    ),
    readFile(resolve(repository, 'package.json'), 'utf8'),
    readFile(resolve(repository, 'apps/web/package.json'), 'utf8'),
  ]);
  const digest = createHash('sha256');
  for (const file of files.stdout.trim().split('\n').sort()) {
    digest
      .update(file)
      .update('\0')
      .update(await readFile(resolve(repository, file)))
      .update('\0');
  }
  const root = JSON.parse(rootPackage) as { packageManager: string };
  const web = JSON.parse(webPackage) as { dependencies: Record<string, string> };
  return {
    gitCommit: head.stdout.trim(),
    productionSourceSha256: digest.digest('hex'),
    packageManager: root.packageManager,
    next: web.dependencies.next,
    react: web.dependencies.react,
  };
}

export async function runBackendBenchmark(options: BenchmarkOptions) {
  if (
    !Number.isInteger(options.repetitions) ||
    options.repetitions < 1 ||
    options.repetitions > 100
  )
    throw new Error('Repetitions must be an integer between 1 and 100');
  if (!Number.isInteger(options.warmups) || options.warmups < 0 || options.warmups > 20)
    throw new Error('Warmups must be an integer between 0 and 20');
  // Refuse an existing target before authentication or expensive measurements.
  // The final wx write also closes the race with another concurrent writer.
  try {
    await access(options.outputPath);
    throw new Error('Benchmark output already exists; choose a fresh output path');
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ENOENT') throw error;
  }
  const manifest = JSON.parse(await readFile(options.manifestPath, 'utf8')) as PerformanceManifest;
  const source = await sourceIdentity();
  const bindings = await loadPerformanceBindings(manifest);
  const config = parseServerConfig({ ...bindings, NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  const services = createServerServices(config);
  try {
    // Obtain the same branded context as the application. Per-request session ingress
    // is outside this service benchmark; membership/RLS are checked on every operation.
    const login = await services.handleAuthRequest(
      new Request(`${config.appOrigin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin: config.appOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: bindings.email, password: bindings.password }),
      }),
    );
    if (login.status !== 200) throw new Error('Performance fixture authentication failed');
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const context = await services.authorizeWorkspace(
      new Request(`${config.appOrigin}/api/v1/workspaces`, { headers: { cookie } }),
      manifest.workspaceId,
      'viewer',
    );
    const runtime = await services.withWorkspaceContext(
      context,
      async (transaction) => {
        const result =
          await transaction.execute(sql`SELECT current_user AS role,session_user AS session_role,
        r.rolsuper,r.rolbypassrls,current_setting('row_security') AS row_security,
        current_setting('statement_timeout') AS statement_timeout,
        current_setting('work_mem') AS work_mem,current_setting('shared_buffers') AS shared_buffers,
        version() AS postgres_version,
        current_setting('app.user_id')=${manifest.actorId} AS actor_matches,
        current_setting('app.workspace_id')=${manifest.workspaceId} AS workspace_matches,
        EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='app' AND tableowner=current_user) AS owns_app_tables
        FROM pg_roles r WHERE r.rolname=current_user`);
        const row = result.rows[0];
        if (
          !row ||
          row.rolsuper ||
          row.rolbypassrls ||
          row.owns_app_tables ||
          row.row_security !== 'on' ||
          !row.actor_matches ||
          !row.workspace_matches
        )
          throw new Error('Benchmark requires restricted runtime role and matching tenant context');
        return row;
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    const instrumentation = instrumentPlatform(services);
    const journal = createJournalServices(instrumentation.platform);
    const analytics = createAnalyticsServices(instrumentation.platform);
    const dashboard = createDashboardServices(instrumentation.platform);
    const accounting = createAccountingReports(instrumentation.platform);
    const policies = {
      reportingCurrencyId: manifest.reportingCurrencyId,
      from: manifest.from,
      to: manifest.to,
      sourceRevision: manifest.sourceRevision,
      fxPolicy: manifest.fxPolicy,
      priceMaxAgeMilliseconds: manifest.priceMaxAgeMilliseconds,
      priceSourcePriority: manifest.priceSourcePriority,
    };
    const operations: Operation[] = [];
    for (const [name, accountIds, scope] of [
      ['all', manifest.accountIds, 'whole-dataset'],
      ['bounded', [manifest.boundedAccountId], 'bounded-account'],
    ] as const) {
      const analyticsQuery = analyticsReportRequestSchema.parse({
        ...policies,
        accountIds,
        metadataAsOf: manifest.metadataAsOf,
        timezone: manifest.timezone,
        groupBy: ['account', 'asset', 'strategy', 'tag'],
      });
      const dashboardQuery = dashboardRequestSchema.parse({
        ...policies,
        metadataAsOf: manifest.metadataAsOf,
        timezone: manifest.timezone,
        environment: 'paper',
        filters: { accountIds },
        samples: 7,
      });
      const accountingQuery = accountingReportRequestSchema.parse({ ...policies, accountIds });
      operations.push(
        {
          name: `journal.list.${name}`,
          scope,
          run: () =>
            journal.list(context, {
              limit: 50,
              ...(name === 'bounded' ? { accountId: manifest.boundedAccountId } : {}),
            }),
          volatilePaths: [],
        },
        {
          name: `analytics.${name}`,
          scope,
          run: () => analytics.report(context, analyticsQuery),
          volatilePaths: ['/context/recordedAt'],
        },
        {
          name: `dashboard.${name}`,
          scope,
          run: () => dashboard.report(context, dashboardQuery),
          volatilePaths: ['/analytics/context/recordedAt'],
        },
        {
          name: `accounting.${name}`,
          scope,
          run: () => accounting.report(context, accountingQuery),
          volatilePaths: [],
        },
      );
    }
    for (const [index, tradeId] of manifest.tradeIds.slice(0, 2).entries())
      operations.push({
        name: `journal.detail.${index + 1}`,
        scope: 'single-trade',
        run: () => journal.get(context, tradeId),
        volatilePaths: [],
      });
    // These narrow scopes are additional observations, never substitutes for the
    // full-dataset/full-account attempts. The intraday interval contains the exact
    // first fill and fee, excluding the earlier deposit. Recent cohorts still read
    // their original account history before the engine's final date-cohort filter.
    const supplementalScopes = [
      {
        suffix: 'intraday',
        scope: 'bounded-account-intraday' as const,
        from: '2030-01-01T01:00:00.000000Z',
        to: '2030-01-01T01:00:00.000001Z',
      },
      ...(manifest.trades >= 10000
        ? [
            {
              suffix: 'recent',
              scope: 'bounded-account-recent' as const,
              from: '2030-05-05T23:59:59.999999Z',
              to: manifest.to,
            },
          ]
        : []),
    ];
    for (const supplemental of supplementalScopes) {
      const accountIds = [manifest.boundedAccountId];
      const scopeContext = { accountIds, from: supplemental.from, to: supplemental.to };
      const query = { ...policies, ...scopeContext };
      const accountingQuery = accountingReportRequestSchema.parse(query);
      const dashboardQuery = dashboardRequestSchema.parse({
        ...policies,
        from: supplemental.from,
        to: supplemental.to,
        metadataAsOf: manifest.metadataAsOf,
        timezone: manifest.timezone,
        environment: 'paper',
        filters: { accountIds },
        samples: 7,
      });
      // accountIds belongs in dashboard.filters, not its strict top-level contract.
      operations.push({
        name: `accounting.${supplemental.suffix}`,
        scope: supplemental.scope,
        scopeContext,
        supplemental: true,
        run: () => accounting.report(context, accountingQuery),
        volatilePaths: [],
      });
      operations.push({
        name: `dashboard.${supplemental.suffix}`,
        scope: supplemental.scope,
        scopeContext,
        supplemental: true,
        run: () => dashboard.report(context, dashboardQuery),
        volatilePaths: ['/analytics/context/recordedAt'],
      });
      if (supplemental.suffix === 'recent') {
        const analyticsQuery = analyticsReportRequestSchema.parse({
          ...query,
          metadataAsOf: manifest.metadataAsOf,
          timezone: manifest.timezone,
          groupBy: ['account', 'asset', 'strategy', 'tag'],
        });
        operations.push({
          name: 'analytics.recent',
          scope: supplemental.scope,
          scopeContext,
          supplemental: true,
          run: () => analytics.report(context, analyticsQuery),
          volatilePaths: ['/context/recordedAt'],
        });
      }
    }
    if (
      options.operations?.some((name) => !operations.some((operation) => operation.name === name))
    )
      throw new Error('Unknown benchmark operation');
    const selected = operations.filter((operation) =>
      options.operations ? options.operations.includes(operation.name) : !operation.supplemental,
    );
    const results = [];
    for (const operation of selected) {
      const observations: Observation[] = [];
      const warmupObservations: Observation[] = [];
      const repetitions = options.repetitions;
      const warmups = options.warmups;
      for (let repetition = -warmups; repetition < repetitions; repetition++) {
        instrumentation.reset();
        const before = process.memoryUsage();
        const started = performance.now();
        let value: unknown;
        let rejection: { code: string; status: number } | undefined;
        try {
          value = await operation.run();
        } catch (error) {
          const response = toProblemResponse(error, 'performance-benchmark');
          const problem = (await response.json()) as { code: string; status: number };
          rejection = { code: problem.code, status: problem.status };
          // A 10-second SQL timeout is a capacity observation, not an opaque 500.
          const sqlstate =
            (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
            (error as { code?: string })?.code;
          if (sqlstate === '57014') rejection = { code: 'DATABASE_STATEMENT_TIMEOUT', status: 500 };
        }
        const serviceMilliseconds = performance.now() - started;
        const serializedAt = performance.now();
        const json = rejection ? undefined : JSON.stringify(value);
        const serializationMilliseconds = performance.now() - serializedAt;
        const after = process.memoryUsage();
        const sample: Observation = {
          serviceMilliseconds,
          serializationMilliseconds,
          heapBeforeBytes: before.heapUsed,
          heapAfterBytes: after.heapUsed,
          rssBeforeBytes: before.rss,
          rssAfterBytes: after.rss,
          ...instrumentation.snapshot(),
          state: rejection ? 'rejected' : 'computed',
          ...(rejection
            ? { error: rejection }
            : {
                financialHash: financialHash(value, operation.volatilePaths),
                jsonBytes: Buffer.byteLength(json!),
                gzipBytes: gzipSync(json!).byteLength,
                responseCounts: responseCounts(value),
              }),
        };
        if (repetition >= 0) observations.push(sample);
        else warmupObservations.push(sample);
        process.stdout.write(
          JSON.stringify({
            operation: operation.name,
            sample: repetition,
            state: sample.state,
            milliseconds: serviceMilliseconds,
            businessQueries: sample.businessQueries,
            ...(rejection ? { error: rejection.code } : {}),
          }) + '\n',
        );
      }
      const hashes = new Set(
        observations.flatMap((sample) => (sample.financialHash ? [sample.financialHash] : [])),
      );
      if (hashes.size > 1)
        throw new Error(`Financial DTO changed across repeated ${operation.name} reads`);
      const computedTimes = observations
        .filter((sample) => sample.state === 'computed')
        .map((sample) => sample.serviceMilliseconds);
      const rejectedTimes = observations
        .filter((sample) => sample.state === 'rejected')
        .map((sample) => sample.serviceMilliseconds);
      results.push({
        name: operation.name,
        scope: operation.scope,
        repetitions,
        warmups,
        ...(operation.scopeContext ? { scopeContext: operation.scopeContext } : {}),
        volatilePaths: operation.volatilePaths,
        stableWithinRun: hashes.size <= 1,
        timingMilliseconds: sampleStatistics(
          observations.map((sample) => sample.serviceMilliseconds),
        ),
        outcomeCounts: { computed: computedTimes.length, rejected: rejectedTimes.length },
        computedTimingMilliseconds: computedTimes.length ? sampleStatistics(computedTimes) : null,
        rejectedTimingMilliseconds: rejectedTimes.length ? sampleStatistics(rejectedTimes) : null,
        queryCount: sampleStatistics(observations.map((sample) => sample.businessQueries)),
        sqlMilliseconds: sampleStatistics(observations.map((sample) => sample.sqlMilliseconds)),
        warmupObservations,
        observations,
      });
    }
    const plans =
      options.explain > 0 ? await instrumentation.explain(context, options.explain) : [];
    const hardware = await Promise.all([
      optionalFile('/sys/fs/cgroup/cpu.max'),
      optionalFile('/sys/fs/cgroup/memory.max'),
    ]);
    const report = {
      schemaVersion: 1,
      label: options.label,
      recordedAt: new Date().toISOString(),
      fixture: {
        databaseName: manifest.databaseName,
        seed: manifest.seed,
        distribution: manifest.distribution,
        trades: manifest.trades,
        executions: manifest.executions,
        counts: manifest.counts,
        validation: manifest.validation,
        preparationOnlyIndexes: manifest.preparationOnlyIndexes,
        distributionCounts: manifest.distributionCounts,
        omissions: manifest.omissions,
        setupMilliseconds: manifest.setupMilliseconds,
      },
      context: {
        sourceRevision: manifest.sourceRevision,
        metadataAsOf: manifest.metadataAsOf,
        from: manifest.from,
        to: manifest.to,
        policies,
        manifestHash: financialHash(manifest),
      },
      methodology: {
        workload:
          'Direct TypeScript service reads; production domain/service implementation, without Next.js HTTP/session ingress. DTO serialization measured separately.',
        concurrency: 1,
        warmupsPerOperation: options.warmups,
        repetitions: options.repetitions,
        cacheState:
          'Persisted fixture; no OS/PostgreSQL cache flush. Warmup observations are retained separately; measured samples follow the configured warmups. No cold-cache claim.',
        sqlTiming:
          'Client wall time for business callback tx.execute including transfer/decoding; excludes transaction/context/membership SQL. Service time includes these security checks.',
        payload:
          'UTF-8 JSON and local gzip bytes; actual HTTP transferred bytes are measured separately by the frontend benchmark.',
        memory:
          'Node process heap/RSS at operation boundaries and every 20 business queries; sampled peaks can miss brief allocations. No forced GC; figures include instrumentation/serialization overhead.',
        plans:
          'EXPLAIN ANALYZE BUFFERS FORMAT JSON under the same restricted runtime role and tenant; first captured instance of each selected SQL shape, separate from timed samples. Literal/bind values redacted.',
        equivalence:
          'Canonical object-key order; array order, financial decimals, all economic/provenance/revision fields retained. Only operation-listed recordedAt observation clocks omitted.',
      },
      environment: {
        node: process.version,
        platform: platform(),
        release: release(),
        cpuModel: cpus()[0]?.model,
        logicalCpus: cpus().length,
        hostMemoryBytes: totalmem(),
        freeHostMemoryBytes: freemem(),
        cgroupCpuMax: hardware[0],
        cgroupMemoryMax: hardware[1],
        source,
        runtime,
      },
      results,
      plans,
    };
    let comparison:
      | Array<{
          name: string;
          financialEquivalence: string;
          beforeOutcomes: string[];
          afterOutcomes: string[];
          beforeMedianMilliseconds: number;
          afterMedianMilliseconds: number;
          beforeQueryCount: number;
          afterQueryCount: number;
        }>
      | undefined;
    let comparisonFailed = false;
    let comparisonFailure: unknown;
    try {
      if (options.comparePath) {
        const baseline = JSON.parse(await readFile(options.comparePath, 'utf8')) as typeof report;
        if (
          baseline.context.manifestHash !== report.context.manifestHash ||
          financialHash(baseline.context) !== financialHash(report.context)
        )
          throw new Error('Comparison requires the identical persisted fixture and pinned context');
        comparison = report.results.map((current) => {
          const previous = baseline.results.find((candidate) => candidate.name === current.name);
          if (!previous) throw new Error('Comparison operation missing in baseline');
          if (
            financialHash(previous.volatilePaths) !== financialHash(current.volatilePaths) ||
            financialHash(previous.scopeContext ?? null) !==
              financialHash(current.scopeContext ?? null)
          )
            throw new Error('Comparison requires identical scope and reviewed volatile paths');
          const evidence = compareFinancialEvidence(previous.observations, current.observations);
          return {
            name: current.name,
            ...evidence,
            beforeMedianMilliseconds: previous.timingMilliseconds.median,
            afterMedianMilliseconds: current.timingMilliseconds.median,
            beforeQueryCount: previous.queryCount.median,
            afterQueryCount: current.queryCount.median,
          };
        });
      }
    } catch (error) {
      comparisonFailed = true;
      comparisonFailure = error;
    }
    // Preserve measured evidence even when comparison fails, while refusing to
    // replace an earlier run. Only one final write creates this report exclusively.
    await mkdir(dirname(resolve(options.outputPath)), { recursive: true });
    await writeFile(
      options.outputPath,
      JSON.stringify(
        {
          ...report,
          ...(comparison ? { comparison } : {}),
          ...(comparisonFailed ? { comparisonStatus: 'failed' } : {}),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    if (comparisonFailed) throw comparisonFailure;
    process.stdout.write(
      JSON.stringify({
        output: options.outputPath,
        operations: results.length,
        ...(comparison
          ? {
              financialEquivalence: 'passed-for-comparable-computed-dtos',
              comparableComputedOperations: comparison.filter(
                (row) => row.financialEquivalence === 'identical-computed-dtos',
              ).length,
              notComparableOperations: comparison.filter(
                (row) => row.financialEquivalence !== 'identical-computed-dtos',
              ).length,
            }
          : {}),
      }) + '\n',
    );
    return report;
  } finally {
    await services.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (name: string) => {
    const position = process.argv.indexOf(name);
    return position < 0 ? undefined : process.argv[position + 1];
  };
  const manifestPath = argument('--manifest');
  if (!manifestPath) {
    process.stderr.write(
      'Usage: tsx scripts/performance/backend-benchmark.ts --manifest work/performance/fixture.json --output work/performance/baseline.json [--repetitions 3] [--warmups 1] [--explain 5] [--operations journal.list.all,analytics.bounded] [--compare work/performance/baseline.json]\n',
    );
    process.exitCode = 1;
  } else {
    runBackendBenchmark({
      manifestPath,
      outputPath: argument('--output') ?? 'work/performance/backend.json',
      label: argument('--label') ?? 'baseline',
      repetitions: Number(argument('--repetitions') ?? 3),
      warmups: Number(argument('--warmups') ?? 1),
      explain: Number(argument('--explain') ?? 5),
      ...(argument('--operations') ? { operations: argument('--operations')!.split(',') } : {}),
      ...(argument('--compare') ? { comparePath: argument('--compare')! } : {}),
    }).catch(() => {
      // Never print database/auth errors, stacks or environment bindings.
      process.stderr.write(
        'Backend performance benchmark failed; check fixture readiness and benchmark arguments.\n',
      );
      process.exitCode = 1;
    });
  }
}
