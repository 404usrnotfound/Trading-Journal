import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sql, type DbTransaction, type TenantTransactionOptions } from '@journal/database';
import type { AuthorizationContext, ServerServices } from '../../packages/server/src/services.js';
import { runBackendBenchmark } from '../../scripts/performance/backend-benchmark.js';
import {
  canonicalFinancialJson,
  compareFinancialEvidence,
  financialHash,
  instrumentPlatform,
  redactSql,
  sampleStatistics,
  sanitizePlan,
} from '../../scripts/performance/instrument.js';

describe('performance evidence instrumentation', () => {
  it('preserves an existing benchmark before reading configuration or running work', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'journal-performance-evidence-'));
    const outputPath = join(directory, 'before.json');
    try {
      await writeFile(outputPath, 'original verified evidence');
      await expect(
        runBackendBenchmark({
          manifestPath: join(directory, 'missing-manifest.json'),
          outputPath,
          label: 'test',
          repetitions: 1,
          warmups: 0,
          explain: 0,
        }),
      ).rejects.toThrow('already exists');
      expect(await readFile(outputPath, 'utf8')).toBe('original verified evidence');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('omits only explicitly reviewed observation paths while retaining economic and source clocks', () => {
    const initial = {
      context: { recordedAt: 'clock-a', sourceRevision: '42', metadataAsOf: 'metadata-clock' },
      records: [
        { recordedAt: 'source-clock', economicAt: '2030-01-01T00:00:00.000001Z', amount: '1.0001' },
      ],
    };
    const volatile = ['/context/recordedAt'];
    expect(financialHash(initial, volatile)).toBe(
      financialHash(
        { ...initial, context: { ...initial.context, recordedAt: 'clock-b' } },
        volatile,
      ),
    );
    for (const mutation of [
      { ...initial, context: { ...initial.context, sourceRevision: '43' } },
      { ...initial, context: { ...initial.context, metadataAsOf: 'later-metadata' } },
      { ...initial, records: [{ ...initial.records[0], recordedAt: 'different-source-clock' }] },
      {
        ...initial,
        records: [{ ...initial.records[0], economicAt: '2030-01-01T00:00:00.000002Z' }],
      },
      { ...initial, records: [{ ...initial.records[0], amount: '1.0002' }] },
    ])
      expect(financialHash(mutation, volatile)).not.toBe(financialHash(initial, volatile));
    expect(canonicalFinancialJson({ b: '1', a: ['2', '3'] })).toBe(
      canonicalFinancialJson({ a: ['2', '3'], b: '1' }),
    );
    expect(financialHash(['1', '2'])).not.toBe(financialHash(['2', '1']));
  });

  it('redacts SQL literals and plan expressions without losing measured plan numbers', () => {
    const secret = 'private-bind-value';
    expect(
      redactSql(`SELECT * FROM app.trades WHERE title='${secret}' AND id=$1 LIMIT 50`),
    ).not.toContain(secret);
    expect(redactSql(`SELECT $$${secret}$$, $tag$${secret}$tag$`)).not.toContain(secret);
    const plan = sanitizePlan({
      Plan: {
        'Node Type': 'Index Scan',
        Filter: `(title = '${secret}'::text)`,
        'Actual Rows': 50,
        'Actual Total Time': 1.25,
      },
    });
    expect(JSON.stringify(plan)).not.toContain(secret);
    expect(plan).toMatchObject({
      Plan: { 'Node Type': 'Index Scan', 'Actual Rows': 50, 'Actual Total Time': 1.25 },
    });
  });

  it('preserves platform context/options and counts successful and rejected business SQL', async () => {
    const context = {
      actorId: 'fixture-actor',
      workspaceId: 'fixture-workspace',
    } as AuthorizationContext;
    const options: TenantTransactionOptions = {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    };
    let calls = 0;
    const transaction = {
      dialect: {
        sqlToQuery: () => ({ sql: 'SELECT * FROM app.executions WHERE workspace_id=$1' }),
      },
      execute: async () => {
        calls++;
        if (calls === 2) throw new Error('simulated statement failure');
        return { rows: [{ id: 'one' }, { id: 'two' }], rowCount: 2 };
      },
    } as unknown as DbTransaction;
    const platform: Pick<ServerServices, 'withWorkspaceContext'> = {
      withWorkspaceContext: async (actualContext, callback, actualOptions) => {
        expect(actualContext).toBe(context);
        expect(actualOptions).toBe(options);
        return callback(transaction);
      },
    };
    const instrumentation = instrumentPlatform(platform);
    await instrumentation.platform.withWorkspaceContext(
      context,
      async (tx) => {
        expect((await tx.execute(sql`SELECT 1`)).rows).toHaveLength(2);
        await expect(tx.execute(sql`SELECT 2`)).rejects.toThrow('simulated statement failure');
      },
      options,
    );
    const measured = instrumentation.snapshot();
    expect(measured).toMatchObject({ businessQueries: 2, rows: 2 });
    expect(measured.queries).toHaveLength(1);
    expect(measured.queries[0]).toMatchObject({ count: 2, failures: 1, rows: 2 });
    instrumentation.reset();
    expect(instrumentation.snapshot().businessQueries).toBe(0);
  });

  it('uses a declared nearest-rank p95 and rejects empty statistics', () => {
    expect(sampleStatistics([3, 1, 2])).toMatchObject({
      count: 3,
      minimum: 1,
      median: 2,
      p95: 3,
      maximum: 3,
      mean: 2,
    });
    expect(() => sampleStatistics([])).toThrow();
  });

  it('compares computed finances exactly and never calls a rejected baseline financially equivalent', () => {
    const computed = [{ state: 'computed' as const, financialHash: 'exact-financial-hash' }];
    const rejected = [
      { state: 'rejected' as const, error: { status: 500, code: 'DATABASE_STATEMENT_TIMEOUT' } },
    ];
    expect(compareFinancialEvidence(computed, computed).financialEquivalence).toBe(
      'identical-computed-dtos',
    );
    expect(compareFinancialEvidence(rejected, computed).financialEquivalence).toBe(
      'not-comparable-before-rejected',
    );
    expect(compareFinancialEvidence(rejected, rejected).financialEquivalence).toBe(
      'not-comparable-rejected',
    );
    expect(() => compareFinancialEvidence(computed, rejected)).toThrow('now rejected');
    expect(() => compareFinancialEvidence(computed, [...computed, ...rejected])).toThrow(
      'now rejected',
    );
    expect(() =>
      compareFinancialEvidence(computed, [
        { state: 'computed', financialHash: 'changed-finances' },
      ]),
    ).toThrow('hashes differ');
    expect(() => compareFinancialEvidence([{ state: 'computed' }], computed)).toThrow('missing');
    expect(() => compareFinancialEvidence([], computed)).toThrow('requires observations');
  });
});
