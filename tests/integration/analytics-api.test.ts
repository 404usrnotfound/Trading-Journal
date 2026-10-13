import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyticsReportResponseSchema } from '@journal/contracts';
import {
  createAnalyticsApi,
  createCatalogServices,
  createFinancialLedger,
  toProblemResponse,
} from '@journal/server';
import {
  createAccountingFixture,
  accountingTestOrigin as origin,
  type AccountingTestActor,
} from './accounting-fixture.js';

const initial = '2025-01-01T00:00:00.000001Z';
describe('authenticated read-only analytics HTTP queries', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let api: ReturnType<typeof createAnalyticsApi>;
  let accountId: string;
  let currencyId: string;
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    api = createAnalyticsApi(fixture.services);
    const catalog = createCatalogServices(fixture.services);
    const ledger = createFinancialLedger(fixture.services);
    currencyId = (
      await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso',
          code: 'EUR',
          kind: 'fiat',
          unitIdentity: 'iso:EUR',
          name: 'Euro',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        randomUUID(),
      )
    ).id;
    accountId = (
      await catalog.createAccount(
        fixture.owner.context,
        {
          name: 'Analytics API account',
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: currencyId,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt: initial,
        },
        randomUUID(),
      )
    ).id;
    const bucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId,
      currencyId,
      kind: 'settled',
    });
    await ledger.recordCashMovement(fixture.owner.context, {
      commandId: randomUUID(),
      accountId,
      currencyId,
      cashBucketId: bucket.id,
      amount: '1000',
      kind: 'deposit',
      economicAt: '2025-02-01T00:00:00.000001Z',
      orderingKey: '0',
    });
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });
  const input = () => ({
    accountIds: [accountId],
    reportingCurrencyId: currencyId,
    from: '2025-01-01T00:00:00.000001Z',
    to: '2030-12-31T23:59:59.999999Z',
    timezone: 'Europe/Madrid',
    fxPolicy: {
      id: 'explicit-manual-v1',
      maxAgeMilliseconds: 86400000,
      sourcePriority: ['manual'],
    },
    priceMaxAgeMilliseconds: 86400000,
    priceSourcePriority: ['manual'],
    groupBy: ['strategy', 'strategyVersion', 'account', 'tag'],
  });
  async function request(
    body: unknown = input(),
    options: {
      actor?: AccountingTestActor | null;
      workspaceId?: string;
      method?: string;
      path?: string;
      contentType?: string;
      rawBody?: string;
    } = {},
  ) {
    const actor = options.actor === undefined ? fixture.owner : options.actor;
    const workspaceId = options.workspaceId ?? fixture.owner.context.workspaceId;
    const method = options.method ?? 'POST';
    const path = options.path ?? 'reports';
    const headers = new Headers({ 'content-type': options.contentType ?? 'application/json' });
    if (actor) headers.set('cookie', actor.cookie);
    const raw = new Request(`${origin}/api/v1/workspaces/${workspaceId}/analytics/${path}`, {
      method,
      headers,
      ...(method === 'GET' ? {} : { body: options.rawBody ?? JSON.stringify(body) }),
    });
    try {
      return await api(raw, workspaceId, path.split('/'));
    } catch (error) {
      return toProblemResponse(error, 'analytics-api-test');
    }
  }
  it('returns unavailable empty outcome ratios and excludes funding from campaign P&L', async () => {
    const response = await request();
    const raw: unknown = await response.json();
    expect(response.status, JSON.stringify(raw)).toBe(200);
    const result = analyticsReportResponseSchema.parse(raw);
    expect(result.summary.counts.eligibleOutcomes).toBe(0);
    expect(result.summary.metrics.netPnl.value).toBe('0');
    expect(result.summary.metrics.grossPnl.value).toBe('0');
    expect(result.summary.metrics.winRate).toMatchObject({ state: 'unavailable', value: null });
    expect(result.summary.metrics.profitFactor.value).toBeNull();
    expect(result.context.timezone).toBe('Europe/Madrid');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('permits current viewers without mutation CSRF and changes no financial command, audit or revision', async () => {
    const state = async () =>
      (
        await fixture.admin.pool.query(
          `SELECT (SELECT revision FROM app.financial_state WHERE workspace_id=$1) AS revision,
        (SELECT count(*)::text FROM app.financial_commands WHERE workspace_id=$1) AS commands,
        (SELECT count(*)::text FROM app.audit_events WHERE workspace_id=$1) AS audits,
        (SELECT count(*)::text FROM app.outbox_events WHERE workspace_id=$1) AS outbox`,
          [fixture.owner.context.workspaceId],
        )
      ).rows;
    const before = await state();
    expect((await request(input(), { actor: fixture.viewer })).status).toBe(200);
    expect(await state()).toEqual(before);
  });
  it('denies anonymous, cross-workspace and cross-tenant account queries', async () => {
    expect((await request(input(), { actor: null })).status).toBe(401);
    expect((await request(input(), { actor: fixture.outsider })).status).toBe(404);
    expect((await request({ ...input(), accountIds: [randomUUID()] })).status).toBe(404);
  });
  it.each([
    ['financial revision', () => ({ ...input(), sourceRevision: '2147483647' })],
    ['metadata generation', () => ({ ...input(), metadataAsOf: '2099-01-01T00:00:00Z' })],
  ])('rejects a future %s without leaking internal facts', async (_, body) => {
    const response = await request(body());
    expect(response.status).toBe(422);
    expect(await response.text()).not.toMatch(
      /postgres|SELECT\s+\*|\bFROM\s+app\.|password|stack/iu,
    );
  });
  it('keeps live and paper accounts in separate analytics populations', async () => {
    const paper = await createCatalogServices(fixture.services).createAccount(
      fixture.owner.context,
      {
        name: 'Analytics paper population',
        environment: 'paper',
        accountType: 'cash',
        baseCurrencyId: currencyId,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt: initial,
      },
      randomUUID(),
    );
    const response = await request({ ...input(), accountIds: [accountId, paper.id] });
    expect(response.status).toBe(422);
    const separate = await request({ ...input(), accountIds: [paper.id] });
    expect(separate.status).toBe(200);
    expect(analyticsReportResponseSchema.parse(await separate.json()).context.environment).toBe(
      'paper',
    );
  });
  it.each([
    [
      'duplicate accounts',
      () => ({ ...input(), accountIds: [accountId, accountId.toUpperCase()] }),
    ],
    ['reverse interval', () => ({ ...input(), from: input().to, to: input().from })],
    ['unknown timezone', () => ({ ...input(), timezone: 'Invalid/Timezone' })],
    ['duplicate dimensions', () => ({ ...input(), groupBy: ['account', 'account'] })],
    ['unrecognized dimension', () => ({ ...input(), groupBy: ['secret'] })],
    ['binary numeric reporting input', () => ({ ...input(), sourceRevision: 5 })],
    ['unbounded source revision', () => ({ ...input(), sourceRevision: '2147483648' })],
    ['unexpected executable parameter', () => ({ ...input(), formula: 'return 1' })],
  ])('rejects %s', async (_, body) => {
    const response = await request(body());
    expect(response.status).toBe(400);
    expect(await response.text()).not.toMatch(/postgres|SELECT |password|stack/iu);
  });
  it('bounds request bytes, validates media type and parses JSON safely', async () => {
    expect((await request(input(), { rawBody: 'x'.repeat(262145) })).status).toBe(413);
    expect((await request(input(), { contentType: 'text/plain' })).status).toBe(415);
    expect((await request(input(), { rawBody: '{invalid' })).status).toBe(400);
  });
  it('rejects unsupported methods and unknown resources', async () => {
    expect((await request(input(), { method: 'GET' })).status).toBe(405);
    expect((await request(input(), { path: 'missing' })).status).toBe(404);
  });
});
