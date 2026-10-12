import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as contract from '@journal/contracts';
import {
  createAccountingApi,
  createCatalogServices,
  createFinancialLedger,
  toProblemResponse,
} from '@journal/server';
import { createJournalFinancialFixture } from './journal-financial-fixture.js';
import { strategyTestOrigin as origin, type StrategyTestActor } from './strategy-fixture.js';

const at = '2025-01-01T00:00:00.000001Z';
const from = '2025-02-01T00:00:00.000001Z';
const economicAt = '2025-02-02T00:00:00.000001Z';
const to = '2025-02-03T00:00:00.000001Z';

describe('accounting HTTP boundaries and immutable portfolio definitions', () => {
  let fixture: Awaited<ReturnType<typeof createJournalFinancialFixture>>;
  let api: ReturnType<typeof createAccountingApi>;
  let accountId: string;
  let cashBucketId: string;
  let currencyId: string;
  beforeAll(async () => {
    fixture = await createJournalFinancialFixture();
    api = createAccountingApi(fixture.services);
    const catalog = createCatalogServices(fixture.services);
    const ledger = createFinancialLedger(fixture.services);
    currencyId = (
      await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso:4217',
          code: 'EUR',
          kind: 'fiat',
          unitIdentity: 'iso:EUR',
          name: 'Euro',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: at,
        },
        randomUUID(),
      )
    ).id;
    accountId = (
      await catalog.createAccount(
        fixture.owner.context,
        {
          name: 'Accounting HTTP account',
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: currencyId,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt: at,
        },
        randomUUID(),
      )
    ).id;
    cashBucketId = (
      await ledger.createCashBucket(fixture.owner.context, {
        commandId: randomUUID(),
        accountId,
        currencyId,
        kind: 'settled',
      })
    ).id;
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    options: {
      actor?: StrategyTestActor | null;
      csrf?: string | null;
      commandId?: string | null;
      requestOrigin?: string;
      contentType?: string;
      workspaceId?: string;
    } = {},
  ) {
    const actor = options.actor === undefined ? fixture.owner : options.actor;
    const workspaceId = options.workspaceId ?? fixture.owner.context.workspaceId;
    const headers = new Headers({ origin: options.requestOrigin ?? origin });
    if (actor) headers.set('cookie', actor.cookie);
    if (method !== 'GET') {
      headers.set('content-type', options.contentType ?? 'application/json');
      const id = options.commandId === undefined ? randomUUID() : options.commandId;
      if (id) headers.set('idempotency-key', id);
      const csrf = options.csrf === undefined ? actor?.csrf : options.csrf;
      if (csrf) headers.set('x-csrf-token', csrf);
    }
    const raw = new Request(`${origin}/api/v1/workspaces/${workspaceId}/accounting/${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    try {
      return await api(raw, workspaceId, path.split('?')[0]!.split('/'));
    } catch (error) {
      return toProblemResponse(error, 'accounting-api-fixture');
    }
  }
  const income = () => ({
    accountId,
    cashBucketId,
    currencyId,
    amount: '25',
    kind: 'dividend',
    withholding: '5',
    economicAt,
    orderingKey: '0',
    description: 'Gross dividend with withholding',
  });
  const report = () => ({
    accountIds: [accountId],
    reportingCurrencyId: currencyId,
    from,
    to,
    fxPolicy: { id: 'http-explicit-policy', maxAgeMilliseconds: 0, sourcePriority: ['manual'] },
    priceMaxAgeMilliseconds: 0,
    priceSourcePriority: ['manual'],
  });

  it('round trips versioned portfolios and replays the exact mutation response', async () => {
    const id = randomUUID();
    const input = {
      name: 'Long-term capital',
      description: 'Explicit account scope',
      environment: 'live',
      accountIds: [accountId],
    };
    const response = await request('portfolios', 'POST', input, { commandId: id });
    const raw: unknown = await response.json();
    expect(response.status, JSON.stringify(raw)).toBe(200);
    const created = contract.portfolioMutationResponseSchema.parse(raw);
    expect(await (await request('portfolios', 'POST', input, { commandId: id })).json()).toEqual(
      raw,
    );
    const detail = await request(`portfolios/${created.id}`);
    expect(detail.status).toBe(200);
    const portfolio = contract.portfolioResponseSchema.parse(await detail.json());
    expect(portfolio.currentVersion.accountIds).toEqual([accountId]);
    const changed = await request(`portfolios/${created.id}`, 'POST', {
      ...input,
      name: 'Renamed capital',
      expectedVersion: 1,
      reason: 'Rename only',
    });
    expect(changed.status).toBe(200);
    const history = contract.portfolioVersionListResponseSchema.parse(
      await (await request(`portfolios/${created.id}/versions`)).json(),
    );
    expect(history.items.map((value) => value.name).sort()).toEqual([
      'Long-term capital',
      'Renamed capital',
    ]);
    const stale = await request(`portfolios/${created.id}/archive`, 'POST', {
      expectedVersion: 1,
      reason: 'Stale archive',
    });
    expect(stale.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns a fully typed read-only report to a viewer without mutating the source revision', async () => {
    const before = await fixture.admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [fixture.owner.context.workspaceId],
    );
    const response = await request('reports', 'POST', report(), {
      actor: fixture.viewer,
      csrf: null,
      commandId: null,
    });
    const raw: unknown = await response.json();
    expect(response.status, JSON.stringify(raw)).toBe(200);
    const parsed = contract.accountingReportResponseSchema.parse(raw);
    expect(parsed.context.accountIds).toEqual([accountId]);
    const after = await fixture.admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [fixture.owner.context.workspaceId],
    );
    expect(after.rows).toEqual(before.rows);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('posts gross dividend and withholding once and returns an accounting bridge', async () => {
    const id = randomUUID();
    const posted = await request('income', 'POST', income(), { commandId: id });
    expect(posted.status, JSON.stringify(await posted.clone().json())).toBe(200);
    const replay = await request('income', 'POST', income(), { commandId: id });
    expect(await replay.json()).toEqual(await posted.json());
    const response = await request('reports', 'POST', report());
    const parsed = contract.accountingReportResponseSchema.parse(await response.json());
    expect(parsed.breakdown.income.value).toBe('25');
    expect(parsed.breakdown.taxes.value).toBe('5');
    expect(parsed.closing.cash.value).toBe('20');
    expect(parsed.reconciliation.variance.value).toBe('0');
  });

  it.each([
    ['unauthenticated', { actor: null }, 401],
    ['viewer write', { actor: null as StrategyTestActor | null }, 403],
    ['missing CSRF', { csrf: null }, 403],
    ['untrusted origin', { requestOrigin: 'https://outside.example.test' }, 403],
    ['missing command identity', { commandId: null }, 400],
    ['wrong content type', { contentType: 'text/plain' }, 415],
  ])('rejects %s for cash mutations', async (label, options, status) => {
    const actual = label === 'viewer write' ? { actor: fixture.viewer } : options;
    const response = await request('income', 'POST', income(), actual);
    expect(response.status).toBe(status);
    const problem = await response.text();
    expect(problem).not.toMatch(/postgres|SELECT |journal_app|stack/i);
  });

  it('denies cross-tenant reports and unauthenticated reads', async () => {
    expect((await request('reports', 'POST', report(), { actor: fixture.outsider })).status).toBe(
      404,
    );
    expect((await request('portfolios', 'GET', undefined, { actor: null })).status).toBe(401);
  });

  it('rejects floats, invalid intervals, ambiguous scopes, and unknown resources', async () => {
    expect((await request('income', 'POST', { ...income(), amount: 25 })).status).toBe(400);
    expect((await request('reports', 'POST', { ...report(), from: to, to: from })).status).toBe(
      400,
    );
    expect(
      (await request('reports', 'POST', { ...report(), portfolioVersionId: randomUUID() })).status,
    ).toBe(400);
    expect((await request('missing-resource')).status).toBe(404);
    expect((await request('portfolios', 'DELETE')).status).toBe(405);
  });
});
