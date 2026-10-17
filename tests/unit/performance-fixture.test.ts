import { describe, expect, it } from 'vitest';
import { replayInventory, valueInventory } from '../../packages/domain/src/index.js';
import { createDomainFixture } from '../../scripts/performance/domain-benchmark.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadPerformanceBindings,
  type PerformanceManifest,
} from '../../scripts/performance/dataset.js';

describe('performance fixture financial and population checks', () => {
  it.each([
    { executions: 2, lots: 1, gross: '-4.8455', net: '-4.85635', reporting: '-10.54372936' },
    { executions: 10, lots: 5, gross: '-24.2275', net: '-24.3396', reporting: '-52.7706468' },
  ])(
    'keeps fractional short fills, fee rebates, and historical FX exact at $executions executions',
    ({ executions, lots, gross, net, reporting }) => {
      const fixture = createDomainFixture(
        { name: 'independent-oracle', trades: 1, executions },
        'concentrated',
      );
      const { input, valuation } = fixture[0]!;
      const result = replayInventory(input);
      const valued = valueInventory(result, valuation);
      // Seed 15202610: q=0.9691, short at 313.48 and cover at 318.48.
      // Native gross per matched fill is -4.8455. The first fee is a EUR 0.0015 rebate
      // at 1.10 USD/EUR; other USD/EUR charges retain their own pinned 0.90/0.92 rates.
      // The one-fill reporting bridge is -4.8455*.92 - 303.793468*.02 - .0100.
      expect(result.status).toBe('available');
      expect(result.effectiveSourceIds).toHaveLength(executions);
      expect(result.lots).toHaveLength(lots);
      expect(result.matches).toHaveLength(lots);
      expect(result.openQuantity.value).toBe('0');
      expect(result.realizedGross.value).toBe(gross);
      expect(result.realizedNet.value).toBe(net);
      expect(valued.realizedReportingNet.status).toBe('available');
      expect(valued.realizedReportingNet.value).toBe(reporting);
      expect(result.originalCosts).toHaveLength(executions);
      expect(input.sources[0]!.economicOrder.instant).toBe('2026-01-02T12:00:00.000001Z');
      expect(fixture).toEqual(
        createDomainFixture({ name: 'independent-oracle', trades: 1, executions }, 'concentrated'),
      );
    },
  );

  it('distributes complete source populations over 100 accounts and four instruments', () => {
    const fixture = createDomainFixture(
      { name: 'distribution', trades: 1_000, executions: 2_000 },
      'distributed',
    );
    expect(fixture).toHaveLength(400);
    expect(new Set(fixture.map((book) => book.input.scope.accountId)).size).toBe(100);
    expect(new Set(fixture.map((book) => book.input.scope.instrumentId)).size).toBe(4);
    expect(fixture.reduce((count, book) => count + book.input.sources.length, 0)).toBe(2_000);
    const ids = fixture.flatMap((book) => book.input.sources.map((source) => source.id));
    expect(new Set(ids).size).toBe(2_000);
    for (const book of fixture) {
      expect(book.input.sources.length % 2).toBe(0);
    }
  });
});

describe('private performance binding failure redaction', () => {
  const secret = 'PERFORMANCE_PRIVATE_BINDING_SECRET_42';
  const databaseName = `journal_perf_${'a'.repeat(32)}_test`;
  const valid = {
    DATABASE_URL: `postgresql://journal_app:${secret}@localhost:5433/${databaseName}`,
    AUTH_DATABASE_URL: `postgresql://journal_auth:${secret}@localhost:5433/${databaseName}`,
    JOB_DATABASE_URL: `postgresql://journal_jobs:${secret}@localhost:5433/${databaseName}`,
    MIGRATION_DATABASE_URL: `postgresql://operator:${secret}@localhost:5433/${databaseName}`,
    password: secret,
    email: 'isolated-performance-owner@example.test',
    APP_ORIGIN: 'http://localhost:3000',
    BETTER_AUTH_SECRET: secret,
  };

  it.each([
    ['invalid JSON', `{\"DATABASE_URL\":\"${valid.DATABASE_URL}\",\"broken\":${secret}}`],
    ['invalid URL', JSON.stringify({ ...valid, DATABASE_URL: `invalid://${secret} invalid` })],
    [
      'wrong database',
      JSON.stringify({
        ...valid,
        DATABASE_URL: `postgresql://journal_app:${secret}@localhost:5433/shared_database`,
      }),
    ],
    [
      'credential-bearing origin',
      JSON.stringify({ ...valid, APP_ORIGIN: `http://user:${secret}@localhost:3000` }),
    ],
  ])('removes private input from %s errors and stacks', async (_name, contents) => {
    const directory = await mkdtemp(join(tmpdir(), 'journal-performance-bindings-'));
    try {
      const path = join(directory, 'private-bindings.json');
      await writeFile(path, contents, { mode: 0o600 });
      const manifest = {
        schemaVersion: 1,
        databaseName,
        privateBindingsPath: path,
      } as PerformanceManifest;
      const error: unknown = await loadPerformanceBindings(manifest).then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw new Error('Expected a redacted binding failure');
      expect(error.message).toBe('Performance private bindings are invalid or inaccessible');
      expect(error.stack).not.toContain(secret);
      expect(error).not.toHaveProperty('cause');
      expect(error).not.toHaveProperty('input');
      expect(
        JSON.stringify(
          Object.getOwnPropertyNames(error).map((key) => [key, Reflect.get(error, key)]),
        ),
      ).not.toContain(secret);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
