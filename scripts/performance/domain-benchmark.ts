import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  INVENTORY_CALCULATION_MANIFEST,
  replayInventory,
  valueInventory,
  type InventoryFill,
  type InventoryReplayInput,
  type InventoryValuationInput,
} from '../../packages/domain/src/index.js';

/** No database, HTTP, UI, writes, or import-throughput claims arise from this pure-kernel run. */
export const DOMAIN_FIXTURE_VERSION = 'phase-15-domain-v1';
export const DOMAIN_DATASETS = [
  { name: '1000-trades-2000-executions', trades: 1_000, executions: 2_000 },
  { name: '10000-trades-20000-executions', trades: 10_000, executions: 20_000 },
  { name: '10000-trades-100000-executions', trades: 10_000, executions: 100_000 },
] as const;
export type DomainDistribution = 'concentrated' | 'distributed';
type Dataset = Readonly<{ name: string; trades: number; executions: number }>;
type Book = Readonly<{ input: InventoryReplayInput; valuation: InventoryValuationInput }>;
const USD = 'benchmark-currency-usd';
const EUR = 'benchmark-currency-eur';
const PINNED_INSTANT = '2026-01-02T12:00:00.000001Z';

/** Integer arithmetic constructs source decimals without a binary floating-point money step. */
function fixed(units: bigint, scale: number): string {
  const negative = units < 0n;
  const absolute = (negative ? -units : units).toString().padStart(scale + 1, '0');
  return `${negative ? '-' : ''}${absolute.slice(0, -scale)}.${absolute.slice(-scale)}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current !== null && typeof current === 'object' && !Array.isArray(current))
      return Object.fromEntries(
        Object.entries(current).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
    return current;
  });
}

export function createDomainFixture(
  dataset: Dataset,
  distribution: DomainDistribution,
  seed = 15_202_610,
): readonly Book[] {
  if (
    !Number.isSafeInteger(dataset.trades) ||
    !Number.isSafeInteger(dataset.executions) ||
    dataset.trades < 1 ||
    dataset.executions % (dataset.trades * 2) !== 0
  )
    throw new Error('The fixture requires equal positive integral entry/exit fill counts.');
  let randomState = seed >>> 0;
  const random = () => (randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0);
  const fillsPerSide = dataset.executions / dataset.trades / 2;
  const books = new Map<
    string,
    { input: InventoryReplayInput; valuation: InventoryValuationInput }
  >();
  for (let trade = 0; trade < dataset.trades; trade++) {
    const account = distribution === 'distributed' ? trade % Math.min(100, dataset.trades) : 0;
    const instrument = distribution === 'distributed' ? Math.floor(trade / 100) % 4 : 0;
    const key = `${account.toString().padStart(3, '0')}:${instrument}`;
    let book = books.get(key);
    if (!book) {
      book = {
        input: {
          scope: {
            workspaceId: 'benchmark-workspace',
            accountId: `benchmark-account-${account}`,
            instrumentId: `benchmark-instrument-${instrument}`,
            instrumentVersionId: `benchmark-instrument-${instrument}-version-1`,
            unitVersionId: `benchmark-instrument-${instrument}-unit-version-1`,
            settlementCurrencyId: USD,
          },
          manifest: INVENTORY_CALCULATION_MANIFEST,
          policy: 'fifo',
          capability: {
            subtype: 'ordinary-share',
            nativeInventory: true,
            shortSupported: true,
            averageCostSupported: true,
          },
          sources: [],
          sourceRevision: String(dataset.executions),
        },
        valuation: {
          mark: {
            id: `benchmark-mark-${instrument}`,
            instant: '2026-01-03T00:00:00.000001Z',
            price: '125.25',
            multiplier: '1',
          },
          reportingCurrencyId: EUR,
          markReportingFx: {
            observationId: 'benchmark-mark-usd-eur',
            baseCurrencyId: USD,
            quoteCurrencyId: EUR,
            rate: '0.91',
          },
        },
      };
      books.set(key, book);
    }
    const quantityUnits = BigInt(1_250 + (random() % 9_000));
    const entryCents = BigInt(8_000 + (random() % 24_000));
    const exitCents = entryCents + (trade % 3 === 0 ? 500n : trade % 3 === 1 ? -300n : 0n);
    const short = trade % 7 === 0;
    for (let fill = 0; fill < fillsPerSide * 2; fill++) {
      const closing = fill >= fillsPerSide;
      const executionIndex = trade * fillsPerSide * 2 + fill;
      const sequence = String(executionIndex + 1);
      const id = `benchmark-execution-${executionIndex.toString().padStart(6, '0')}`;
      const priceCents = closing ? exitCents : entryCents;
      const euroFee = executionIndex % 5 === 0;
      const feeRate = closing ? '0.92' : '0.90';
      const source: InventoryFill = {
        id,
        effectId: `effect-${id}`,
        kind: 'fill',
        sourceRevision: sequence,
        economicOrder: { instant: PINNED_INSTANT, sequence },
        side: closing === short ? 'buy' : 'sell',
        closeOnly: closing,
        quantity: fixed(quantityUnits, 4),
        multiplier: '1',
        price: fixed(priceCents, 2),
        bookedPrincipal: fixed(quantityUnits * priceCents, 6),
        costsComplete: true,
        basisReportingFx: {
          observationId: `benchmark-${closing ? 'closing' : 'opening'}-usd-eur`,
          baseCurrencyId: USD,
          quoteCurrencyId: EUR,
          rate: feeRate,
        },
        costs: [
          {
            id: `fee-${id}`,
            amount: executionIndex % 19 === 0 ? '-0.0015' : '0.0125',
            currencyId: euroFee ? EUR : USD,
            chargedAt: PINNED_INSTANT,
            ...(euroFee
              ? {
                  nativeFx: {
                    observationId: 'benchmark-fee-eur-usd',
                    baseCurrencyId: EUR,
                    quoteCurrencyId: USD,
                    rate: '1.10',
                  },
                }
              : {
                  reportingFx: {
                    observationId: `benchmark-fee-${closing ? 'closing' : 'opening'}-usd-eur`,
                    baseCurrencyId: USD,
                    quoteCurrencyId: EUR,
                    rate: feeRate,
                  },
                }),
          },
        ],
      };
      (book.input.sources as InventoryFill[]).push(source);
    }
  }
  return [...books.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, book]) => book);
}

type Memory = Readonly<{ heapUsed: number; heapTotal: number; rss: number; external: number }>;
function memory(): Memory {
  const { heapUsed, heapTotal, rss, external } = process.memoryUsage();
  return { heapUsed, heapTotal, rss, external };
}
function maximumMemory(left: Memory, right: Memory): Memory {
  return {
    heapUsed: Math.max(left.heapUsed, right.heapUsed),
    heapTotal: Math.max(left.heapTotal, right.heapTotal),
    rss: Math.max(left.rss, right.rss),
    external: Math.max(left.external, right.external),
  };
}
type Sample = Readonly<{
  replayMs: number;
  valuationMs: number;
  operationMs: number;
  operationCpuMs: number;
  serializationAndHashMs: number;
  loopWallMs: number;
  payloadBytes: number;
  outputSha256: string;
  lots: number;
  matches: number;
  originalCosts: number;
  memoryBefore: Memory;
  memoryAfter: Memory;
  observedBoundaryPeak: Memory;
}>;

function runFixture(books: readonly Book[]): Sample {
  const memoryBefore = memory();
  let peak = memoryBefore;
  const hash = createHash('sha256').update('[');
  let payloadBytes = 2;
  let replayMs = 0;
  let valuationMs = 0;
  let operationCpuMs = 0;
  let serializationAndHashMs = 0;
  let lots = 0;
  let matches = 0;
  let originalCosts = 0;
  const wallStart = performance.now();
  for (const [index, book] of books.entries()) {
    const cpuBefore = process.cpuUsage();
    const replayStart = performance.now();
    const inventory = replayInventory(book.input);
    const valuationStart = performance.now();
    replayMs += valuationStart - replayStart;
    const valuation = valueInventory(inventory, book.valuation);
    const operationEnd = performance.now();
    const cpu = process.cpuUsage(cpuBefore);
    operationCpuMs += (cpu.user + cpu.system) / 1_000;
    valuationMs += operationEnd - valuationStart;
    if (
      inventory.status !== 'available' ||
      inventory.openQuantity.value !== '0' ||
      valuation.realizedReportingNet.status !== 'available'
    )
      throw new Error(
        'The complete fixture must produce closed, available native and reporting results.',
      );
    lots += inventory.lots.length;
    matches += inventory.matches.length;
    originalCosts += inventory.originalCosts.length;
    const serialized = canonicalJson({ inventory, valuation });
    if (index > 0) hash.update(',');
    hash.update(serialized);
    payloadBytes += Buffer.byteLength(serialized) + (index > 0 ? 1 : 0);
    serializationAndHashMs += performance.now() - operationEnd;
    peak = maximumMemory(peak, memory());
  }
  hash.update(']');
  return {
    replayMs,
    valuationMs,
    operationMs: replayMs + valuationMs,
    operationCpuMs,
    serializationAndHashMs,
    loopWallMs: performance.now() - wallStart,
    payloadBytes,
    outputSha256: hash.digest('hex'),
    lots,
    matches,
    originalCosts,
    memoryBefore,
    memoryAfter: memory(),
    observedBoundaryPeak: peak,
  };
}

function statistics(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    min: sorted[0]!,
    median: sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!,
    p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!,
    max: sorted.at(-1)!,
    mean: values.reduce((total, value) => total + value, 0) / values.length,
  };
}

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return (
    process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback
  );
}
function integerOption(name: string, fallback: number, minimum: number): number {
  const value = Number(option(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid --${name} option.`);
  return value;
}

async function fixtureForRun(dataset: Dataset, distribution: DomainDistribution, seed: number) {
  const fixtureDirectory = option('fixture-dir', '');
  if (!fixtureDirectory)
    return {
      books: createDomainFixture(dataset, distribution, seed),
      fixturePath: null,
      fixtureSource: 'deterministically-regenerated',
    };
  const fixturePath = resolve(
    fixtureDirectory,
    `${DOMAIN_FIXTURE_VERSION}-${seed}-${dataset.name}-${distribution}.json`,
  );
  try {
    return {
      books: JSON.parse(await readFile(fixturePath, 'utf8')) as readonly Book[],
      fixturePath,
      fixtureSource: 'read-persisted-inputs',
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const books = createDomainFixture(dataset, distribution, seed);
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(books), { flag: 'wx' });
  return { books, fixturePath, fixtureSource: 'created-persisted-inputs' };
}

async function boundedMatrix(deadlineMs: number) {
  const output = option('output', `work/performance/domain-${option('label', 'unlabeled')}.json`);
  const datasets = option(
    'datasets',
    DOMAIN_DATASETS.map((dataset) => dataset.name).join(','),
  ).split(',');
  const distributions = option('distributions', 'concentrated,distributed').split(',');
  const result = {
    formatVersion: 1,
    fixtureVersion: DOMAIN_FIXTURE_VERSION,
    label: option('label', 'unlabeled'),
    recordedAt: new Date().toISOString(),
    deadlineMsPerScenario: deadlineMs,
    scenarios: [] as Record<string, unknown>[],
  };
  await mkdir(`${output}.scenarios`, { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  for (const dataset of datasets) {
    for (const distribution of distributions) {
      const id = `${dataset}/${distribution}`;
      const childOutput = `${output}.scenarios/${dataset}-${distribution}.json`;
      const forwarded = process.argv
        .slice(2)
        .filter(
          (argument) =>
            !['deadline-ms', 'datasets', 'distributions', 'output'].some((name) =>
              argument.startsWith(`--${name}=`),
            ),
        );
      const started = performance.now();
      let timedOut = false;
      const child = spawn(
        process.execPath,
        [
          ...process.execArgv,
          fileURLToPath(import.meta.url),
          ...forwarded,
          '--deadline-ms=0',
          `--datasets=${dataset}`,
          `--distributions=${distribution}`,
          `--output=${childOutput}`,
        ],
        { stdio: 'inherit' },
      );
      let interrupted = false;
      const interrupt = () => {
        interrupted = true;
        child.kill('SIGTERM');
      };
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      const deadline = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, deadlineMs);
      const code = await new Promise<number | null>((resolveExit, reject) => {
        child.once('error', reject);
        child.once('exit', resolveExit);
      });
      clearTimeout(deadline);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      if (interrupted) throw new Error(`Domain matrix interrupted during ${id}.`);
      if (timedOut) {
        const fixture = JSON.parse(await readFile(`${childOutput}.fixture.json`, 'utf8')) as Record<
          string,
          unknown
        >;
        result.scenarios.push({
          ...fixture,
          id,
          status: 'timed-out',
          deadlineMs,
          processWallMs: performance.now() - started,
          samples: [],
          limitation:
            'No complete financial output or duration exists for this scenario; deadline includes preparation and warmups.',
        });
        console.error(`${id}: explicit scenario deadline ${deadlineMs} ms exceeded.`);
      } else if (code !== 0) {
        throw new Error(`Domain scenario ${id} exited with code ${String(code)}.`);
      } else {
        const completed = JSON.parse(await readFile(childOutput, 'utf8')) as {
          scenarios: Record<string, unknown>[];
        };
        result.scenarios.push({
          ...completed.scenarios[0],
          status: 'completed',
          processWallMs: performance.now() - started,
          resultFile: childOutput,
        });
      }
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    }
  }
  console.log(`Wrote checkpointed matrix ${output}`);
}

async function main() {
  const deadlineMs = integerOption('deadline-ms', 0, 0);
  if (deadlineMs > 0) return boundedMatrix(deadlineMs);
  const names = option('datasets', DOMAIN_DATASETS.map((dataset) => dataset.name).join(',')).split(
    ',',
  );
  const distributions = option('distributions', 'concentrated,distributed').split(',');
  if (names.some((name) => !DOMAIN_DATASETS.some((dataset) => dataset.name === name)))
    throw new Error('Unknown --datasets value.');
  if (distributions.some((value) => !['concentrated', 'distributed'].includes(value)))
    throw new Error('Unknown --distributions value.');
  const warmups = integerOption('warmups', 1, 0);
  const repetitions = integerOption('repetitions', 3, 1);
  const seed = integerOption('seed', 15_202_610, 0);
  if (seed > 0xffff_ffff) throw new Error('Fixture seed must fit an unsigned32-bit integer.');
  const label = option('label', 'unlabeled');
  const comparePath = option('compare', '');
  const comparison = comparePath
    ? (JSON.parse(await readFile(comparePath, 'utf8')) as {
        scenarios: { id: string; inputSha256: string; samples: Sample[] }[];
      })
    : undefined;
  const scenarios = [];
  for (const dataset of DOMAIN_DATASETS.filter((candidate) => names.includes(candidate.name))) {
    for (const distribution of distributions as DomainDistribution[]) {
      const setupStart = performance.now();
      const { books, fixturePath, fixtureSource } = await fixtureForRun(
        dataset,
        distribution,
        seed,
      );
      const setupMs = performance.now() - setupStart;
      const inputHash = createHash('sha256').update('[');
      for (const [index, book] of books.entries()) {
        if (index > 0) inputHash.update(',');
        inputHash.update(canonicalJson(book));
      }
      const inputSha256 = inputHash.update(']').digest('hex');
      const id = `${dataset.name}/${distribution}`;
      const accountCounts = new Map<string, number>();
      const bookExecutions = books.map((book) => {
        accountCounts.set(
          book.input.scope.accountId,
          (accountCounts.get(book.input.scope.accountId) ?? 0) + book.input.sources.length,
        );
        return book.input.sources.length;
      });
      if (bookExecutions.reduce((total, count) => total + count, 0) !== dataset.executions)
        throw new Error('Fixture execution count mismatch.');
      const output = option('output', `work/performance/domain-${label}.json`);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(
        `${output}.fixture.json`,
        `${JSON.stringify({ id, dataset, distribution, setupMs, inputSha256, seed, warmups, repetitions, fixturePath, fixtureSource, accounts: accountCounts.size, instruments: new Set(books.map((book) => book.input.scope.instrumentId)).size, books: books.length, executionsPerBook: statistics(bookExecutions), executionsPerAccount: statistics([...accountCounts.values()]) }, null, 2)}\n`,
        { flag: 'wx' },
      );
      console.error(
        `${label}: ${id}, ${books.length} books, ${dataset.executions} source executions`,
      );
      for (let warmup = 0; warmup < warmups; warmup++) {
        global.gc?.();
        runFixture(books);
      }
      const samples: Sample[] = [];
      for (let repetition = 0; repetition < repetitions; repetition++) {
        global.gc?.();
        const sample = runFixture(books);
        samples.push(sample);
        console.error(
          `${id} repetition ${repetition + 1}: ${sample.operationMs.toFixed(1)} ms, ${sample.outputSha256}`,
        );
      }
      if (samples.some((sample) => sample.outputSha256 !== samples[0]!.outputSha256))
        throw new Error('Repeated exact full financial outputs differed.');
      const before = comparison?.scenarios.find((scenario) => scenario.id === id);
      if (
        comparison &&
        (!before ||
          before.inputSha256 !== inputSha256 ||
          before.samples.some((sample) => sample.outputSha256 !== samples[0]!.outputSha256))
      )
        throw new Error(`Exact fixture/financial-output comparison failed for ${id}.`);
      scenarios.push({
        id,
        dataset,
        distribution,
        setupMs,
        inputSha256,
        fixturePath,
        fixtureSource,
        accounts: accountCounts.size,
        instruments: new Set(books.map((book) => book.input.scope.instrumentId)).size,
        books: books.length,
        executionsPerBook: statistics(bookExecutions),
        executionsPerAccount: statistics([...accountCounts.values()]),
        summary: {
          operationMs: statistics(samples.map((sample) => sample.operationMs)),
          operationCpuMs: statistics(samples.map((sample) => sample.operationCpuMs)),
          replayMs: statistics(samples.map((sample) => sample.replayMs)),
          valuationMs: statistics(samples.map((sample) => sample.valuationMs)),
        },
        exactComparison: before
          ? before.samples.length
            ? 'passed-full-output-and-input-sha256'
            : 'passed-input-sha256-only-baseline-had-no-complete-output'
          : 'not-requested',
        samples,
      });
    }
  }
  const [cpuMax, memoryMax] = await Promise.all(
    ['/sys/fs/cgroup/cpu.max', '/sys/fs/cgroup/memory.max'].map(async (path) => {
      try {
        return (await readFile(path, 'utf8')).trim();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }),
  );
  const result = {
    formatVersion: 1,
    fixtureVersion: DOMAIN_FIXTURE_VERSION,
    label,
    seed,
    warmups,
    repetitions,
    concurrency: 1,
    garbageCollectionBeforeEachRun: typeof global.gc === 'function',
    hardware: {
      platform: process.platform,
      architecture: process.arch,
      cpus: cpus().map((cpu) => cpu.model),
      totalMemoryBytes: totalmem(),
      cgroupV2: { cpuMax, memoryMax },
    },
    software: { node: process.version, versions: process.versions, execArgv: process.execArgv },
    recordedAt: new Date().toISOString(),
    limitations: [
      'Pure inventory replay and reporting valuation only; no SQL, HTTP, React, ledger, write, or import throughput is measured.',
      'Trades are deterministic round-trip fixture groups; source execution counts and account/book distribution are checked in memory, not SQL.',
      'Synchronous replay has boundary heap/RSS samples only; transient peaks within a book are not observed. processMaxRssBytes is a whole-process high-water mark.',
      'Input preparation, canonical serialization/hashing, and optional forced GC are excluded from operationMs. Full output retains all economic and provenance fields; no fields are removed.',
      'The fixture omits open positions, transfers, source corrections, policy transitions, late cost attribution, orders, ledger postings, and database projections.',
      'All source instants are one pinned microsecond instant with verified economic sequences; temporal/date-filter performance is not exercised.',
      'Inputs are deterministically regenerated unless --fixture-dir selects persisted inputs. Repeated samples use a warm process; no operating-system cache flush or concurrency is applied.',
    ],
    processMaxRssBytes: process.resourceUsage().maxRSS * 1024,
    scenarios,
  };
  const output = option('output', `work/performance/domain-${label}.json`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(`Wrote ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
