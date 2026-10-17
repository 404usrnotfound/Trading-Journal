/**
 * Real authenticated browser measurements against one persisted performance fixture.
 * Build the application first, start it with loadPerformanceBindings(manifest), then run:
 * corepack pnpm exec tsx scripts/performance/frontend-benchmark.ts --origin http://localhost:3002 \
 *   --manifest .private/performance/example.manifest.json --output .data/performance/browser.json
 * No credentials, cookies, SQL bindings, financial payloads or browser traces are emitted.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { chromium, errors, type Response } from '@playwright/test';
import { loadPerformanceBindings, type PerformanceManifest } from './dataset.js';
import { compareFinancialEvidence, financialHash, sampleStatistics } from './instrument.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type BrowserEvidence = {
  globalReactCommits: number;
  reactRenderers: number;
  longTasks: { startTime: number; duration: number }[];
  chartDomMutations: number;
};
type EvidenceWindow = Window & {
  __performanceEvidence?: BrowserEvidence;
  __performanceAbortReports?: () => void;
};
type NetworkEntry = {
  operation: string;
  method: string;
  type: string;
  status: number | null;
  encodedDataLength: number;
  started: number;
  finished: number | null;
  failed: boolean;
};
type ApiSnapshot = {
  operation: string;
  requestHash: string | null;
  status: number;
  jsonBytes: number;
  canonicalHash: string | null;
  problemCode: string | null;
};
type BrowserSnapshot = {
  timeOrigin: number;
  documentTime: number;
  evidence: BrowserEvidence;
  elements: number;
  chartTableRows: number;
  collapsedChartTableRows: number;
  exactValueTablesOpen: number;
  browserMetrics: Record<string, number>;
  domCounters: { documents: number; nodes: number; jsEventListeners: number };
  resourceBytes: { transferSize: number; encodedBodySize: number; decodedBodySize: number };
};

const { values } = parseArgs({
  options: {
    origin: { type: 'string', default: process.env.PERFORMANCE_ORIGIN },
    manifest: { type: 'string', default: process.env.PERFORMANCE_MANIFEST },
    output: { type: 'string', default: process.env.PERFORMANCE_OUTPUT },
    repetitions: { type: 'string', default: '3' },
    warmups: { type: 'string', default: '1' },
    scope: { type: 'string', default: 'bounded-account' },
    compare: { type: 'string' },
  },
});
if (!values.origin || !values.manifest || !values.output)
  throw new Error('--origin, --manifest and --output are required.');
const origin = new URL(values.origin);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
  throw new Error('Use an HTTP(S) application origin without embedded credentials.');
if (origin.pathname !== '/' || origin.search || origin.hash)
  throw new Error('The application origin must not contain a path, query or fragment.');
const repetitions = Number(values.repetitions),
  warmups = Number(values.warmups);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 30)
  throw new Error('Choose between one and thirty repetitions.');
if (!Number.isInteger(warmups) || warmups < 0 || warmups > 10)
  throw new Error('Choose between zero and ten warmups.');
const manifest = JSON.parse(
  await readFile(resolve(values.manifest), 'utf8'),
) as PerformanceManifest;
if (manifest.schemaVersion !== 1 || !manifest.tradeIds[0] || !manifest.boundedAccountId)
  throw new Error('A version-one persisted performance fixture manifest is required.');
const bindings = await loadPerformanceBindings(manifest);
if (!['bounded-account', 'intraday'].includes(values.scope))
  throw new Error('Choose --scope bounded-account or intraday.');
const queryFrom = values.scope === 'intraday' ? '2030-01-01T01:00:00.000000Z' : manifest.from;
const queryTo = values.scope === 'intraday' ? '2030-01-01T01:00:00.000001Z' : manifest.to;
const prefix = `/api/v1/workspaces/${manifest.workspaceId}`;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function operation(url: string): string {
  return new URL(url).pathname.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu,
    ':id',
  );
}
function problemCode(value: Json): string | null {
  if (value && !Array.isArray(value) && typeof value === 'object') {
    const code = value.code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
let failureEvidence: Record<string, unknown> = {
  schemaVersion: 1,
  fixture: {
    databaseName: manifest.databaseName,
    seed: manifest.seed,
    trades: manifest.trades,
    executions: manifest.executions,
  },
  scope: {
    accountId: manifest.boundedAccountId,
    from: queryFrom,
    to: queryTo,
    sourceRevision: manifest.sourceRevision,
    metadataAsOf: manifest.metadataAsOf,
  },
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const evidence: BrowserEvidence = {
      globalReactCommits: 0,
      reactRenderers: 0,
      longTasks: [],
      chartDomMutations: 0,
    };
    (window as EvidenceWindow).__performanceEvidence = evidence;
    // Count root commits only. Tree traversal would not establish component render counts.
    const hook = {
      supportsFiber: true,
      renderers: new Map<number, unknown>(),
      inject(renderer: unknown) {
        const id = ++evidence.reactRenderers;
        this.renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot() {
        evidence.globalReactCommits++;
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
    };
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: hook });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          evidence.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    new MutationObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target instanceof Element ? entry.target : entry.target.parentElement;
        if (element?.closest('.dashboard-chart')) evidence.chartDomMutations++;
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  const requests: NetworkEntry[] = [];
  const active = new Map<string, NetworkEntry>();
  cdp.on('Network.requestWillBeSent', (event) => {
    if (!event.request.url.startsWith(origin.origin)) return;
    const entry: NetworkEntry = {
      operation: operation(event.request.url),
      method: event.request.method,
      type: event.type ?? 'Other',
      status: null,
      encodedDataLength: 0,
      started: performance.now(),
      finished: null,
      failed: false,
    };
    active.set(event.requestId, entry);
    requests.push(entry);
  });
  cdp.on('Network.responseReceived', (event) => {
    const entry = active.get(event.requestId);
    if (entry) entry.status = event.response.status;
  });
  cdp.on('Network.loadingFinished', (event) => {
    const entry = active.get(event.requestId);
    if (entry) {
      entry.encodedDataLength = event.encodedDataLength;
      entry.finished = performance.now();
      active.delete(event.requestId);
    }
  });
  cdp.on('Network.loadingFailed', (event) => {
    const entry = active.get(event.requestId);
    if (entry) {
      entry.failed = true;
      entry.finished = performance.now();
      active.delete(event.requestId);
    }
  });

  // Playwright routing disables the HTTP cache. This narrow fetch wrapper retains caching,
  // credentials, signals and server validation while pinning the fixture's financial context.
  await page.addInitScript(
    ({ endpoint, journalPrefix, pinned }) => {
      const fetch = window.fetch;
      const controllers = new Set<AbortController>();
      (window as EvidenceWindow).__performanceAbortReports = () => {
        for (const controller of controllers) controller.abort();
      };
      window.fetch = (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const selectedUrl = new URL(url, location.href);
        const report =
          selectedUrl.href === endpoint && init?.method === 'POST' && typeof init.body === 'string';
        const journal =
          selectedUrl.href.startsWith(journalPrefix) && (init?.method ?? 'GET') === 'GET';
        if (report || journal) {
          const controller = new AbortController();
          controllers.add(controller);
          return fetch
            .call(window, input, {
              ...init,
              signal: init?.signal
                ? AbortSignal.any([init.signal, controller.signal])
                : controller.signal,
              ...(report
                ? { body: JSON.stringify({ ...JSON.parse(init!.body as string), ...pinned }) }
                : {}),
            })
            .then(async (response) => {
              // The product throws on failed reads without consuming their body. Drain a clone
              // so CDP can report the bounded error payload/finished request consistently.
              if (!response.ok) await response.clone().arrayBuffer();
              return response;
            })
            .finally(() => controllers.delete(controller));
        }
        return fetch.call(window, input, init);
      };
    },
    {
      endpoint: `${origin.origin}${prefix}/dashboard/reports`,
      journalPrefix: `${origin.origin}${prefix}/journals`,
      pinned: {
        from: queryFrom,
        to: queryTo,
        sourceRevision: manifest.sourceRevision,
        metadataAsOf: manifest.metadataAsOf,
        fxPolicy: manifest.fxPolicy,
        priceSourcePriority: manifest.priceSourcePriority,
        priceMaxAgeMilliseconds: manifest.priceMaxAgeMilliseconds,
      },
    },
  );
  const responses: ApiSnapshot[] = [];
  const responseTasks = new Set<Promise<void>>();
  async function recordResponse(response: Response) {
    const url = new URL(response.url());
    if (
      !url.pathname.startsWith(prefix) ||
      !/\/(?:dashboard\/reports|journals(?:\/|$))/u.test(url.pathname)
    )
      return;
    const body = await response.body();
    let json: Json;
    try {
      json = JSON.parse(body.toString('utf8')) as Json;
    } catch {
      throw new Error('A measured financial endpoint did not return JSON.');
    }
    responses.push({
      operation: operation(response.url()),
      requestHash: hash(
        `${response.request().method()}:${url.pathname}${url.search}:${response.request().postData() ?? ''}`,
      ),
      status: response.status(),
      jsonBytes: body.byteLength,
      canonicalHash: response.ok() ? financialHash(json, ['/analytics/context/recordedAt']) : null,
      problemCode: response.ok() ? null : problemCode(json),
    });
  }
  const responseFailures: string[] = [];
  page.on('response', (response) => {
    const task = recordResponse(response).catch(() => {
      responseFailures.push(operation(response.url()));
    });
    responseTasks.add(task);
    void task.finally(() => responseTasks.delete(task));
  });
  try {
    await page.goto(`${origin.origin}/sign-in`);
    await page.getByLabel('Email address').fill(bindings.email);
    await page.getByLabel('Password', { exact: true }).fill(bindings.password);
    await page.getByLabel('Password', { exact: true }).press('Enter');
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  } catch {
    // Playwright's fill call logs may include the supplied value on failure.
    throw new Error(
      'The benchmark owner could not sign in. Verify the fixture server and private bindings.',
    );
  }

  async function snapshot(): Promise<BrowserSnapshot> {
    const [metrics, domCounters, document] = await Promise.all([
      cdp.send('Performance.getMetrics'),
      cdp.send('Memory.getDOMCounters'),
      page.evaluate(() => ({
        timeOrigin: performance.timeOrigin,
        documentTime: performance.now(),
        evidence: (window as EvidenceWindow).__performanceEvidence!,
        elements: window.document.querySelectorAll('*').length,
        chartTableRows: window.document.querySelectorAll('.dashboard-chart-table tbody tr').length,
        collapsedChartTableRows: window.document.querySelectorAll(
          '.dashboard-chart-table:not([open]) tbody tr',
        ).length,
        exactValueTablesOpen: window.document.querySelectorAll('.dashboard-chart-table[open]')
          .length,
        resourceBytes: performance.getEntriesByType('resource').reduce(
          (total, entry) => {
            const resource = entry as PerformanceResourceTiming;
            total.transferSize += resource.transferSize;
            total.encodedBodySize += resource.encodedBodySize;
            total.decodedBodySize += resource.decodedBodySize;
            return total;
          },
          { transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 },
        ),
      })),
    ]);
    const selected = new Set([
      'JSHeapUsedSize',
      'JSHeapTotalSize',
      'TaskDuration',
      'ScriptDuration',
      'LayoutDuration',
      'RecalcStyleDuration',
      'LayoutCount',
      'RecalcStyleCount',
    ]);
    return {
      ...document,
      browserMetrics: Object.fromEntries(
        metrics.metrics
          .filter((metric) => selected.has(metric.name))
          .map((metric) => [metric.name, metric.value]),
      ),
      domCounters,
    };
  }
  async function paint() {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
  }
  async function settleRequests() {
    const deadline = performance.now() + 60_000;
    let diagnosticReported = false;
    let quietSince = performance.now();
    while (performance.now() < deadline) {
      if ([...active.values()].some((request) => request.operation.startsWith('/api/')))
        quietSince = performance.now();
      else if (performance.now() - quietSince >= 100) {
        await Promise.all([...responseTasks]);
        return;
      }
      if (!diagnosticReported && performance.now() > deadline - 50_000) {
        diagnosticReported = true;
        console.log(
          JSON.stringify({
            event: 'browser-network-drain-pending',
            pending: [...active.values()]
              .filter((request) => request.operation.startsWith('/api/'))
              .map(({ operation, method, status }) => ({ operation, method, status })),
          }),
        );
      }
      await new Promise<void>((done) => setTimeout(done, 20));
    }
    console.log(
      JSON.stringify({
        event: 'browser-network-drain-timeout',
        pending: [...active.values()]
          .filter((request) => request.operation.startsWith('/api/'))
          .map(({ operation, method, status }) => ({ operation, method, status })),
      }),
    );
    throw new Error('Measured browser API requests did not settle within sixty seconds.');
  }
  const measurements: {
    name: string;
    repetition: number;
    warmup: boolean;
    milliseconds: number;
    outcome: string;
    observed: {
      sameDocument: boolean;
      globalReactRootCommits: number;
      chartDomMutations: number;
      longTaskCount: number;
      longTaskMilliseconds: number;
      taskMilliseconds: number;
      scriptMilliseconds: number;
    };
    requests: Omit<NetworkEntry, 'started' | 'finished'>[];
    api: ApiSnapshot[];
    before: BrowserSnapshot;
    after: BrowserSnapshot;
  }[] = [];
  let stoppedAfterReportTimeout = false;
  let failedInteraction = false;
  failureEvidence = { ...failureEvidence, measurements, requests, responses, responseFailures };
  async function measure(name: string, repetition: number, action: () => Promise<string | void>) {
    await settleRequests();
    const before = await snapshot();
    const responseStart = responses.length;
    const start = performance.now();
    let outcome: string;
    try {
      outcome = (await action()) ?? 'available';
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      const financialRead = [
        'dashboard-navigation',
        'journal-navigation',
        'journal-select-trade',
        'journal-search',
      ].includes(name);
      outcome = financialRead ? 'client-readiness-timeout-60000ms' : 'interaction-timeout-60000ms';
      failedInteraction ||= !financialRead;
      stoppedAfterReportTimeout = true;
      await page.evaluate(() => (window as EvidenceWindow).__performanceAbortReports?.());
    }
    await paint();
    const milliseconds = performance.now() - start;
    await settleRequests();
    const after = await snapshot();
    const sameDocument = before.timeOrigin === after.timeOrigin;
    const tasks = after.evidence.longTasks.filter(
      (task) => task.startTime >= (sameDocument ? before.documentTime : 0),
    );
    measurements.push({
      name,
      repetition,
      warmup: repetition < 0,
      milliseconds,
      outcome,
      observed: {
        sameDocument,
        globalReactRootCommits:
          after.evidence.globalReactCommits -
          (sameDocument ? before.evidence.globalReactCommits : 0),
        chartDomMutations:
          after.evidence.chartDomMutations - (sameDocument ? before.evidence.chartDomMutations : 0),
        longTaskCount: tasks.length,
        longTaskMilliseconds: tasks.reduce((sum, task) => sum + task.duration, 0),
        taskMilliseconds:
          ((after.browserMetrics.TaskDuration ?? 0) -
            (sameDocument ? (before.browserMetrics.TaskDuration ?? 0) : 0)) *
          1000,
        scriptMilliseconds:
          ((after.browserMetrics.ScriptDuration ?? 0) -
            (sameDocument ? (before.browserMetrics.ScriptDuration ?? 0) : 0)) *
          1000,
      },
      requests: requests
        .filter((request) => request.started >= start)
        .map(({ started: _started, finished: _finished, ...request }) => request),
      api: responses.slice(responseStart),
      before,
      after,
    });
  }
  const dates = { from: queryFrom.slice(0, 10), to: queryTo.slice(0, 10) };
  const dashboardUrl = new URL('/dashboard', origin);
  dashboardUrl.search = new URLSearchParams({
    workspace: manifest.workspaceId,
    ...dates,
    accountIds: manifest.boundedAccountId,
    currency: manifest.reportingCurrencyId,
    environment: 'paper',
  }).toString();
  const journalUrl = new URL('/journal', origin);
  journalUrl.search = new URLSearchParams({
    workspace: manifest.workspaceId,
    accountId: manifest.boundedAccountId,
  }).toString();
  repetitionsLoop: for (let repetition = -warmups; repetition < repetitions; repetition++) {
    // The first measured navigation disables the browser cache. PostgreSQL remains warm.
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: repetition === 0 });
    let dashboardAvailable = false;
    await measure('dashboard-navigation', repetition, async () => {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`${prefix}/dashboard/reports`) &&
          response.request().method() === 'POST',
      );
      await page.goto(dashboardUrl.href);
      const response = await responsePromise;
      dashboardAvailable = response.ok();
      if (!response.ok()) return `rejected-http-${response.status()}`;
      await page.getByLabel('Search supporting trades').waitFor();
    });
    if (stoppedAfterReportTimeout) {
      console.log(
        JSON.stringify({
          event: 'browser-readiness-timeout',
          repetition,
          deadlineMilliseconds: 60_000,
        }),
      );
      break;
    }
    if (dashboardAvailable) {
      await measure('dashboard-local-search', repetition, async () => {
        await page.getByLabel('Search supporting trades').fill('0');
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
      await measure('dashboard-clear-search', repetition, async () => {
        await page.getByLabel('Search supporting trades').fill('');
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
      await measure('dashboard-draft-filter-edit', repetition, async () => {
        const from = page.getByLabel('From', { exact: true });
        const next = new Date(Date.parse(`${dates.from}T12:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10);
        await from.fill(next);
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
      await page.getByLabel('From', { exact: true }).fill(dates.from);
      await measure('dashboard-next-page', repetition, async () => {
        const next = page.getByRole('button', { name: 'Next', exact: true });
        if (!(await next.isEnabled())) return 'unavailable-no-next-page';
        await next.click();
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
      await measure('dashboard-open-exact-values', repetition, async () => {
        const table = page.locator('.dashboard-chart-table').first();
        await table.locator('summary').click();
        await table.locator('table').waitFor({ state: 'visible' });
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
      await measure('dashboard-close-exact-values', repetition, async () => {
        const table = page.locator('.dashboard-chart-table').first();
        await table.locator('summary').click();
        await table.locator('table').waitFor({ state: 'hidden' });
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
      await measure('dashboard-reopen-exact-values-keyboard', repetition, async () => {
        const table = page.locator('.dashboard-chart-table').first();
        const summary = table.locator('summary');
        await summary.focus();
        await summary.press('Enter');
        await table.locator('table').waitFor({ state: 'visible' });
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
      await measure('dashboard-distributions-tab', repetition, async () => {
        await page.getByRole('tab', { name: 'Distributions' }).click();
        await page.getByRole('heading', { name: 'P&L distribution', exact: true }).waitFor();
      });
      if (stoppedAfterReportTimeout) break repetitionsLoop;
    }
    let journalAvailable = false,
      detailAvailable = false;
    await measure('journal-navigation', repetition, async () => {
      const responsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === `${prefix}/journals`,
      );
      await page.goto(journalUrl.href);
      const response = await responsePromise;
      await page.locator('.journal-trade-list[aria-busy="false"]').waitFor();
      if (await page.getByRole('button', { name: 'Retry trade list', exact: true }).isVisible())
        return `rejected-ui-after-initial-http-${response.status()}`;
      await page.locator('.journal-trade-card').first().waitFor();
      journalAvailable = true;
    });
    if (stoppedAfterReportTimeout) break;
    if (!journalAvailable) continue;
    await measure('journal-select-trade', repetition, async () => {
      const responsePromise = page.waitForResponse((response) => {
        const path = new URL(response.url()).pathname;
        return (
          path.startsWith(`${prefix}/journals/`) &&
          /^[0-9a-f-]{36}$/iu.test(path.slice(`${prefix}/journals/`.length))
        );
      });
      await page.locator('.journal-trade-card').first().click();
      const response = await responsePromise;
      const financial = page.locator('.journal-financial');
      await financial
        .or(page.getByRole('button', { name: 'Retry trade detail', exact: true }))
        .first()
        .waitFor();
      if (!(await financial.isVisible()))
        return `rejected-ui-after-initial-http-${response.status()}`;
      detailAvailable = true;
    });
    if (stoppedAfterReportTimeout) break;
    if (detailAvailable)
      await measure('journal-open-history', repetition, async () => {
        await page.locator('.journal-history > summary').click();
        await page.getByRole('heading', { name: 'Immutable history', exact: true }).waitFor();
      });
    if (stoppedAfterReportTimeout) break;
    await measure('journal-search', repetition, async () => {
      const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `${prefix}/journals` && url.searchParams.get('search') === '0';
      });
      await page.getByLabel('Find a trade').fill('0');
      const response = await responsePromise;
      await page.locator('.journal-trade-list[aria-busy="false"]').waitFor();
      if (await page.getByRole('button', { name: 'Retry trade list', exact: true }).isVisible())
        return `rejected-ui-after-initial-http-${response.status()}`;
    });
    if (stoppedAfterReportTimeout) break;
    console.log(JSON.stringify({ event: 'browser-repetition-complete', repetition }));
  }
  await Promise.all([...responseTasks]);
  const measured = measurements.filter((measurement) => !measurement.warmup);
  const names = [...new Set(measured.map((measurement) => measurement.name))];
  const result = {
    schemaVersion: 1,
    fixture: {
      seed: manifest.seed,
      databaseName: manifest.databaseName,
      trades: manifest.trades,
      executions: manifest.executions,
      distribution: manifest.distribution,
      sourceRevision: manifest.sourceRevision,
      metadataAsOf: manifest.metadataAsOf,
      from: queryFrom,
      to: queryTo,
      scope: values.scope === 'intraday' ? 'bounded-account-intraday' : 'bounded-account',
      accountId: manifest.boundedAccountId,
    },
    scopeContext: {
      accountIds: [manifest.boundedAccountId],
      from: queryFrom,
      to: queryTo,
      sourceRevision: manifest.sourceRevision,
      metadataAsOf: manifest.metadataAsOf,
      reportingCurrencyId: manifest.reportingCurrencyId,
      timezone: manifest.timezone,
      environment: 'paper',
      samples: 7,
      fxPolicy: manifest.fxPolicy,
      priceSourcePriority: manifest.priceSourcePriority,
      priceMaxAgeMilliseconds: manifest.priceMaxAgeMilliseconds,
    },
    environment: {
      browserVersion: browser.version(),
      nodeVersion: process.version,
      nextBuildId: (await readFile('apps/web/.next/BUILD_ID', 'utf8')).trim(),
      viewport: { width: 1440, height: 1000 },
      concurrency: 1,
      build: 'normal-production-assets; local HTTP runtime as documented in README',
    },
    methodology: {
      repetitions,
      warmups,
      timing: 'Playwright action/readiness plus two animation frames; milliseconds',
      cache:
        'First measured repetition browser cache disabled; later repetitions browser cache enabled; database warm after fixture preparation and warmup',
      heap: 'Natural V8 heap snapshots from CDP; no forced garbage collection; browser process RSS not measured',
      commits: 'Global React root commit census only; no component render duration claim',
      taskDurations:
        'CDP TaskDuration/ScriptDuration/LayoutDuration/RecalcStyleDuration are cumulative seconds for the current document',
      bytes:
        'CDP encodedDataLength is received encoded response traffic; ResourceTiming encoded/decoded body bytes are reported separately',
      canonicalHash: 'SHA-256 of sorted-key exact JSON; only /analytics/context/recordedAt omitted',
      requestPinning:
        'Benchmark-only browser fetch wrapper pins selected scope boundaries and manifest sourceRevision, metadataAsOf and price/FX policies on dashboard requests; no response interception',
      security: 'Real UI authentication and current server membership/RLS; no response mocking',
      readinessDeadline:
        'Financial-read readiness timeouts use a client sixty-second deadline, not a PostgreSQL timeout. Abort benchmark-owned reads, persist partial evidence and skip remaining interactions/repetitions. HTTP rejections skip dependent panels; no computed-result or successful-interaction claim.',
      errorBodies:
        'The benchmark fetch wrapper drains a clone of bounded failed dashboard/journal response bodies so CDP can finish payload accounting. Successful response bodies and product security/validation remain unchanged.',
      timeoutCleanup:
        'After a client timeout, stop the separately launched benchmark-owned server process group and confirm its database work has ended before measuring another scope. This browser script does not own or terminate an external server.',
    },
    summary: Object.fromEntries(
      names.map((name) => [
        name,
        sampleStatistics(
          measured
            .filter((measurement) => measurement.name === name)
            .map((measurement) => measurement.milliseconds),
        ),
      ]),
    ),
    measurements,
    stoppedAfterReportTimeout,
    failedInteraction,
    responseFailures,
  };
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  if (failedInteraction)
    throw new Error('A measured UI interaction timed out. Partial evidence was saved.');
  if (responseFailures.length)
    throw new Error(
      'Some financial response measurements could not be captured. Inspect the output operation names.',
    );
  type Observation = Parameters<typeof compareFinancialEvidence>[0][number];
  type EvidenceGroup = {
    name: string;
    operation: string;
    requestHash: string | null;
    samples: Map<number, Observation[]>;
  };
  function evidenceGroups(report: typeof result) {
    const groups = new Map<string, EvidenceGroup>();
    const samples = report.measurements.some((measurement) => !measurement.warmup)
      ? report.measurements.filter((measurement) => !measurement.warmup)
      : report.measurements;
    for (const measurement of samples) {
      const evidence = measurement.api.length
        ? measurement.api
        : measurement.name === 'dashboard-navigation'
          ? [
              {
                operation: `${prefix}/dashboard/reports`.replace(manifest.workspaceId, ':id'),
                requestHash: null,
                status: 0,
                canonicalHash: null,
                problemCode: measurement.outcome,
              },
            ]
          : [];
      for (const api of evidence) {
        // A missing/timeout report has no request hash; match it to the endpoint generation.
        const key = `${measurement.name}:${api.operation}`;
        const group = groups.get(key) ?? {
          name: measurement.name,
          operation: api.operation,
          requestHash: api.requestHash,
          samples: new Map<number, Observation[]>(),
        };
        if (group.requestHash && api.requestHash && group.requestHash !== api.requestHash)
          throw new Error('A browser operation changed request scope between repetitions.');
        const observations = group.samples.get(measurement.repetition) ?? [];
        observations.push(
          api.canonicalHash && api.status >= 200 && api.status < 300
            ? { state: 'computed', financialHash: api.canonicalHash }
            : {
                state: 'rejected',
                error: { code: api.problemCode ?? `HTTP_${api.status}`, status: api.status },
              },
        );
        group.samples.set(measurement.repetition, observations);
        groups.set(key, group);
      }
    }
    return groups;
  }
  let comparison:
    | Array<{
        name: string;
        operation: string;
        financialEquivalence: string;
        beforeOutcomes?: string[];
        afterOutcomes?: string[];
        failure?: string;
      }>
    | undefined;
  if (values.compare) {
    const baseline = JSON.parse(await readFile(resolve(values.compare), 'utf8')) as typeof result;
    if (JSON.stringify(baseline.fixture) !== JSON.stringify(result.fixture))
      throw new Error(
        'Browser comparison requires the same persisted fixture and financial context.',
      );
    const previous = evidenceGroups(baseline),
      current = evidenceGroups(result);
    comparison = [...new Set([...previous.keys(), ...current.keys()])].map((key) => {
      const before = previous.get(key),
        after = current.get(key),
        group = before ?? after!;
      const observations = (
        value: EvidenceGroup | undefined,
        report: typeof result,
      ): Observation[] => {
        if (!value) return [{ state: 'rejected', error: { code: 'NOT_OBSERVED', status: 0 } }];
        if (![...value.samples.keys()].some((repetition) => repetition >= 0))
          return [...value.samples.values()].flat();
        return Array.from<unknown, Observation[]>(
          { length: report.methodology.repetitions },
          (_, repetition) =>
            value.samples.get(repetition) ?? [
              {
                state: 'rejected',
                error: { code: 'NOT_OBSERVED', status: 0 },
              },
            ],
        ).flat();
      };
      try {
        if (before?.requestHash && after?.requestHash && before.requestHash !== after.requestHash)
          throw new Error('Browser request scope differs from baseline.');
        return {
          name: group.name,
          operation: group.operation,
          ...compareFinancialEvidence(observations(before, baseline), observations(after, result)),
        };
      } catch (error) {
        return {
          name: group.name,
          operation: group.operation,
          financialEquivalence: 'failed',
          failure: error instanceof Error ? error.message : 'Financial comparison failed',
        };
      }
    });
    await writeFile(output, `${JSON.stringify({ ...result, comparison }, null, 2)}\n`, {
      mode: 0o600,
    });
    if (comparison.some((row) => row.financialEquivalence === 'failed'))
      throw new Error(
        'Browser financial comparison failed. The output retains comparison evidence.',
      );
  }
  console.log(
    JSON.stringify({
      output,
      measurements: measured.length,
      financialComparison: values.compare
        ? 'passed-for-comparable-computed-dtos'
        : 'baseline-captured',
      comparableComputedRequests: comparison?.filter(
        (row) => row.financialEquivalence === 'identical-computed-dtos',
      ).length,
      notComparableRequests: comparison?.filter(
        (row) => row.financialEquivalence !== 'identical-computed-dtos',
      ).length,
    }),
  );
} catch (error) {
  const failedOutput = `${resolve(values.output)}.failed.json`;
  await mkdir(dirname(failedOutput), { recursive: true });
  await writeFile(
    failedOutput,
    `${JSON.stringify({ ...failureEvidence, complete: false, failureKind: error instanceof Error ? error.name : 'unknown' }, null, 2)}\n`,
    { mode: 0o600 },
  );
  throw error;
} finally {
  await browser.close();
}
