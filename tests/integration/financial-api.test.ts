import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as contract from '@journal/contracts';
import { createDatabase, type Database } from '@journal/database';
import {
  createFinancialApi,
  createServerServices,
  parseServerConfig,
  toProblemResponse,
  type ServerServices,
} from '@journal/server';

const origin = 'http://localhost:3000';
const initial = '2025-01-01T00:00:00.000001Z';
const at = (day: number) => `2025-04-${String(day).padStart(2, '0')}T12:00:00.000001Z`;
const password = 'financial-api-isolated-fixture-passphrase-42';
type Person = Awaited<ReturnType<ServerServices['bootstrapOwner']>>;
type Actor = { person: Person; cookie: string; csrf: string };
type ResponseSchema<Value> = { parse(input: unknown): Value };
type RequestOptions = {
  actor?: Actor | null;
  workspaceId?: string;
  commandId?: string;
  csrf?: string | null;
  requestOrigin?: string;
  contentType?: string;
};

describe('financial HTTP contracts with real sessions, CSRF and restricted PostgreSQL roles', () => {
  let admin: Database;
  let services: ServerServices;
  let api: ReturnType<typeof createFinancialApi>;
  let owner: Actor;
  let editor: Actor;
  let viewer: Actor;
  let outsider: Actor;
  let usd: ReturnType<typeof contract.currencyResponseSchema.parse>;
  let eur: ReturnType<typeof contract.currencyResponseSchema.parse>;
  let foreignUsd: ReturnType<typeof contract.currencyResponseSchema.parse>;
  let broker: ReturnType<typeof contract.brokerResponseSchema.parse>;

  async function authenticate(person: Person): Promise<Actor> {
    const login = await services.handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: person.user.email, password }),
      }),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const session = await services.handleAuthRequest(
      new Request(`${origin}/api/auth/session`, {
        headers: { cookie, origin },
      }),
    );
    expect(session.status).toBe(200);
    const csrf = session.headers.get('x-csrf-token');
    if (!csrf) throw new Error('The authenticated fixture needs a session-bound CSRF proof');
    return { person, cookie, csrf };
  }

  async function request(
    resource: string,
    method = 'GET',
    body?: unknown,
    options: RequestOptions = {},
  ) {
    const actor = options.actor === undefined ? owner : options.actor;
    const workspaceId = options.workspaceId ?? owner.person.workspace.id;
    const headers = new Headers({ origin: options.requestOrigin ?? origin });
    if (actor) headers.set('cookie', actor.cookie);
    if (method !== 'GET') {
      if (body !== undefined)
        headers.set('content-type', options.contentType ?? 'application/json');
      headers.set('idempotency-key', options.commandId ?? randomUUID());
      const csrf = options.csrf === undefined ? actor?.csrf : options.csrf;
      if (csrf) headers.set('x-csrf-token', csrf);
    }
    const raw = new Request(`${origin}/api/v1/workspaces/${workspaceId}/financial/${resource}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    try {
      return await api(raw, workspaceId, resource.split('?')[0]!.split('/'));
    } catch (error) {
      // Production's route converts these same errors into safe Problem Details.
      return toProblemResponse(error, 'financial-api-fixture');
    }
  }

  async function post<Value>(
    resource: string,
    body: unknown,
    schema: ResponseSchema<Value>,
    options?: RequestOptions,
  ): Promise<Value> {
    const response = await request(resource, 'POST', body, options);
    const value: unknown = await response.json();
    expect(response.status, JSON.stringify(value)).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    return schema.parse(value);
  }

  async function get<Value>(
    resource: string,
    schema: ResponseSchema<Value>,
    options?: RequestOptions,
  ): Promise<Value> {
    const response = await request(resource, 'GET', undefined, options);
    const value: unknown = await response.json();
    expect(response.status, JSON.stringify(value)).toBe(200);
    return schema.parse(value);
  }

  async function snapshot(workspaceId = owner.person.workspace.id) {
    const result = await admin.pool.query<Record<string, string>>(
      `SELECT
      coalesce((SELECT revision::text FROM app.financial_state WHERE workspace_id=$1),'0') AS revision,
      (SELECT count(*)::text FROM app.financial_commands WHERE workspace_id=$1) AS commands,
      (SELECT count(*)::text FROM app.executions WHERE workspace_id=$1) AS executions,
      (SELECT count(*)::text FROM app.cash_movements WHERE workspace_id=$1) AS movements,
      (SELECT count(*)::text FROM app.fees WHERE workspace_id=$1) AS fees,
      (SELECT count(*)::text FROM app.postings WHERE workspace_id=$1) AS postings,
      (SELECT count(*)::text FROM app.outbox_events WHERE workspace_id=$1) AS outbox,
      (SELECT count(*)::text FROM app.audit_events WHERE workspace_id=$1) AS audit`,
      [workspaceId],
    );
    return result.rows[0];
  }

  async function createAccount(name = `API account ${randomUUID()}`) {
    return post(
      'accounts',
      {
        name,
        brokerId: broker.id,
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd.id,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt: initial,
      },
      contract.accountResponseSchema,
    );
  }

  async function fixture(manual = false) {
    const source = `api-fixture:${randomUUID()}`;
    const account = await createAccount();
    const instrument = await post(
      'instruments',
      {
        name: source,
        family: manual ? 'futures' : 'stock',
        subtype: manual ? 'linear-future' : 'ordinary-share',
        economicIdentity: source,
        quantityUnit: manual ? 'contract' : 'share',
        quoteCurrencyId: usd.id,
        settlementCurrencyId: usd.id,
        multiplier: manual ? '50' : '1',
        quantityIncrement: '0.0001',
        priceIncrement: '0.000001',
        capability: manual ? 'manual' : 'native-linear',
        effectiveAt: initial,
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: manual ? 'manual' : 'delivered',
        },
      },
      contract.instrumentResponseSchema,
    );
    const usdBucket = await post(
      'cash-buckets',
      { accountId: account.id, currencyId: usd.id, kind: 'settled' },
      contract.cashBucketResponseSchema,
    );
    const eurBucket = await post(
      'cash-buckets',
      { accountId: account.id, currencyId: eur.id, kind: 'settled' },
      contract.cashBucketResponseSchema,
    );
    return { source, account, instrument, usdBucket, eurBucket };
  }

  function deposit(f: Awaited<ReturnType<typeof fixture>>, amount = '1000') {
    return {
      accountId: f.account.id,
      cashBucketId: f.usdBucket.id,
      currencyId: usd.id,
      amount,
      kind: 'deposit',
      economicAt: at(1),
      orderingKey: '1',
    };
  }

  function fill(
    f: Awaited<ReturnType<typeof fixture>>,
    side: 'buy' | 'sell',
    quantity: string,
    price: string,
    day: number,
    fee?: string,
  ) {
    return {
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side,
      quantity,
      price,
      cashBucketId: f.usdBucket.id,
      economicAt: at(day),
      orderingKey: '1',
      costsComplete: true,
      ...(fee === undefined
        ? {}
        : {
            fees: [
              { cashBucketId: f.usdBucket.id, currencyId: usd.id, amount: fee, kind: 'commission' },
            ],
          }),
    };
  }

  function valuationQuery(
    f: Awaited<ReturnType<typeof fixture>>,
    reportingCurrencyId = usd.id,
    instant = at(20),
  ) {
    return `valuation?${new URLSearchParams({
      accountIds: f.account.id,
      reportingCurrencyId,
      asOf: instant,
      fxPolicyId: 'api-explicit-source/1',
      fxMaxAgeMilliseconds: '2678400000',
      fxSourcePriority: f.source,
      priceMaxAgeMilliseconds: '2678400000',
      priceSourcePriority: f.source,
    })}`;
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated test PostgreSQL is required');
    admin = createDatabase(process.env.TEST_DATABASE_URL);
    services = createServerServices(
      parseServerConfig({
        NODE_ENV: 'test',
        APP_ORIGIN: origin,
        DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
        AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
        JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL,
        BETTER_AUTH_SECRET: 'financial-api-fixture-secret-with-at-least-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    api = createFinancialApi(services);
    const actors = [];
    for (const name of ['owner', 'editor', 'viewer', 'outsider']) {
      const person = await services.bootstrapOwner({
        email: `api-${name}-${randomUUID()}@example.test`,
        name: `Financial API ${name}`,
        password,
      });
      actors.push(await authenticate(person));
    }
    [owner, editor, viewer, outsider] = actors as [Actor, Actor, Actor, Actor];
    await admin.pool.query(
      'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3),($1,$4,$5)',
      [owner.person.workspace.id, editor.person.user.id, 'editor', viewer.person.user.id, 'viewer'],
    );
    for (const code of ['USD', 'EUR']) {
      const currency = await post(
        'currencies',
        {
          namespace: 'iso:4217',
          code,
          kind: 'fiat',
          unitIdentity: `iso:${code}`,
          name: code,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        contract.currencyResponseSchema,
      );
      if (code === 'USD') usd = currency;
      else eur = currency;
    }
    broker = await post(
      'brokers',
      { name: 'API fixture broker', sourceNamespace: `broker:${randomUUID()}` },
      contract.brokerResponseSchema,
    );
    foreignUsd = await post(
      'currencies',
      {
        namespace: 'iso:4217',
        code: 'USD',
        kind: 'fiat',
        unitIdentity: 'iso:USD',
        name: 'Foreign USD',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt: initial,
      },
      contract.currencyResponseSchema,
      { actor: outsider, workspaceId: outsider.person.workspace.id },
    );
  });

  afterAll(async () => {
    // Unique fixtures stay only in the guarded disposable test database. Runtime
    // credentials never cascade-delete immutable financial history for cleanup.
    await Promise.all([services?.close(), admin?.close()]);
  });

  it('creates broker/account/reference DTOs without manufacturing opening money or holdings', async () => {
    const f = await fixture();
    expect(f.account.brokerId).toBe(broker.id);
    expect(f.account.environment).toBe('live');
    expect(f.instrument.capability).toBe('native-linear');
    expect(
      await get(
        `cash-balances?accountId=${f.account.id}`,
        contract.cashBalanceResponseSchema.array(),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cashBucketId: f.usdBucket.id, amount: '0' }),
        expect.objectContaining({ cashBucketId: f.eurBucket.id, amount: '0' }),
      ]),
    );
    expect(
      await get(`positions?accountId=${f.account.id}`, contract.positionResponseSchema.array()),
    ).toEqual([]);
    expect(await get(`accounts/${f.account.id}`, contract.accountResponseSchema)).toEqual(
      f.account,
    );
  });

  it('returns parseable order, partial/late fill, position and valuation responses after committed economics', async () => {
    const f = await fixture();
    await post('cash-movements', deposit(f, '2000'), contract.financialMutationResponseSchema);
    const order = await post(
      'orders',
      {
        accountId: f.account.id,
        kind: 'single',
        legs: [{ instrumentVersionId: f.instrument.versionId, side: 'buy', ratio: '1' }],
        instruction: {
          status: 'working',
          quantity: '2',
          orderType: 'limit',
          limitPrice: '80',
          timeInForce: 'day',
        },
        economicAt: at(1),
      },
      contract.orderResponseSchema,
    );
    const first = await post(
      'executions',
      { ...fill(f, 'buy', '1.25', '80', 2, '0.50'), orderLegId: order.legs[0]!.id },
      contract.executionResponseSchema,
    );
    expect(first.bookedPrincipal).toBe('100');
    expect(first.payload.sourceInput.fees?.[0]?.amount).toBe('0.50');
    expect(first.payload.sourceInput).not.toHaveProperty('bookedPrincipal');
    expect(first.payload.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const partial = await get(`orders/${order.id}`, contract.orderResponseSchema);
    expect(partial.fillStatus).toBe('partially_filled');
    expect(partial.legs[0]?.remainingQuantity).toBe('0.75');
    await post(
      `orders/${order.id}/amendments`,
      {
        expectedRevision: order.revision,
        instruction: { ...order.instruction, status: 'canceled' },
        economicAt: at(3),
        reason: 'Actual cancellation evidence',
      },
      contract.orderResponseSchema,
    );
    await post(
      'executions',
      { ...fill(f, 'buy', '0.75', '120', 4, '0.30'), orderLegId: order.legs[0]!.id },
      contract.executionResponseSchema,
    );
    const filled = await get(`orders/${order.id}`, contract.orderResponseSchema);
    expect(filled.instruction.status).toBe('canceled');
    expect(filled.fillStatus).toBe('filled');
    expect(filled.legs[0]?.filledQuantity).toBe('2');
    expect(filled.legs[0]?.lateFillCount).toBe(1);
    expect(filled.discrepancies).toContain('fill-after-terminal-intent');
    await post(
      'executions',
      fill(f, 'sell', '1', '130', 5, '0.40'),
      contract.executionResponseSchema,
    );
    const [position] = await get(
      `positions?accountId=${f.account.id}`,
      contract.positionResponseSchema.array(),
    );
    expect(position?.inventory.openQuantity.value).toBe('1');
    expect(position?.inventory.averageEntryPrice.value).toBe('110');
    expect(position?.inventory.grossBasis.value).toBe('110');
    expect(position?.inventory.realizedNet.value).toBe('49.2');
    expect(position?.inventory.transferredCosts).toEqual([]);
    await post(
      'price-observations',
      {
        instrumentVersionId: f.instrument.versionId,
        currencyId: usd.id,
        price: '125',
        observedAt: at(6),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    // The fixture includes an EUR custody bucket. Its reporting dependency is
    // explicit even when this particular scenario has no EUR cash activity.
    await post(
      'fx-observations',
      {
        baseCurrencyId: eur.id,
        quoteCurrencyId: usd.id,
        rate: '1',
        observedAt: at(6),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    const view = await get(
      valuationQuery(f, usd.id, at(6)),
      contract.financialValuationResponseSchema,
    );
    expect(view.positions[0]?.valuation?.unrealizedNet.value).toBe('14.6');
    expect(view.nav).toMatchObject({
      state: 'available',
      value: { currencyId: usd.id, amount: '2063.8' },
    });
    const recorded = await get(
      `executions?accountId=${f.account.id}`,
      contract.executionResponseSchema.array(),
    );
    expect(recorded).toHaveLength(3);
    expect(recorded.map((execution) => execution.quantity)).toEqual(['1.25', '0.75', '1']);
  });

  it('rejects JSON numbers, source overprecision and client-calculated fields without financial writes', async () => {
    const f = await fixture();
    const invalid = [
      ['cash-movements', { ...deposit(f), amount: 0.1 }],
      ['cash-movements', { ...deposit(f), amount: '0.0000000000000000000000000000000000001' }],
      ['cash-movements', { ...deposit(f), amount: 'NaN' }],
      ['executions', { ...fill(f, 'buy', '1', '10', 2), averageEntryPrice: '10' }],
      [
        'executions',
        { ...fill(f, 'buy', '1', '10', 2), quantity: '0.0000000000000000000000000000000000001' },
      ],
      ['executions', { ...fill(f, 'buy', '1', '10', 2), price: 10 }],
      ['cash-movements', { ...deposit(f), workspaceId: outsider.person.workspace.id }],
    ] as const;
    for (const [resource, body] of invalid) {
      const before = await snapshot();
      const response = await request(resource, 'POST', body);
      expect(response.status).toBe(400);
      expect(await snapshot()).toEqual(before);
      const problem = await response.json();
      expect(problem).toMatchObject({ code: 'INVALID_REQUEST' });
      expect(JSON.stringify(problem)).not.toContain('INSERT');
    }
    const amount = '0.000000000000000000000000000000000001';
    await post('cash-movements', deposit(f, amount), contract.financialMutationResponseSchema);
    expect(
      await get(
        `cash-balances?accountId=${f.account.id}`,
        contract.cashBalanceResponseSchema.array(),
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ cashBucketId: f.usdBucket.id, amount })]),
    );
  });

  it('enforces current roles, tenant-owned references and a session-bound CSRF proof before mutations', async () => {
    const f = await fixture();
    const before = await snapshot();
    for (const options of [
      { actor: null },
      { csrf: null },
      { requestOrigin: 'https://attacker.example' },
      { actor: viewer },
      { csrf: viewer.csrf },
    ] satisfies RequestOptions[]) {
      const response = await request('cash-movements', 'POST', deposit(f), options);
      expect([401, 403]).toContain(response.status);
      expect(await snapshot()).toEqual(before);
    }
    expect((await request('accounts', 'GET', undefined, { actor: null })).status).toBe(401);
    expect((await request('accounts', 'GET', undefined, { actor: outsider })).status).toBe(404);
    expect(
      await get(`accounts/${f.account.id}`, contract.accountResponseSchema, { actor: viewer }),
    ).toMatchObject({ id: f.account.id });
    const crossTenant = await request('cash-buckets', 'POST', {
      accountId: f.account.id,
      currencyId: foreignUsd.id,
      kind: 'settled',
    });
    expect([404, 422]).toContain(crossTenant.status);
    expect(await snapshot()).toEqual(before);
    const edited = await post(
      'brokers',
      { name: 'Editor accepted broker', sourceNamespace: `editor:${randomUUID()}` },
      contract.brokerResponseSchema,
      { actor: editor },
    );
    expect(edited.name).toBe('Editor accepted broker');
    await admin.pool.query(
      "UPDATE app.workspace_memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
      [owner.person.workspace.id, editor.person.user.id],
    );
    const after = await snapshot();
    expect((await request('cash-movements', 'POST', deposit(f), { actor: editor })).status).toBe(
      403,
    );
    expect(await snapshot()).toEqual(after);
  });

  it('returns the original committed idempotent result and conflicts on altered economics', async () => {
    const f = await fixture();
    const commandId = randomUUID();
    const body = {
      ...deposit(f, '1.20'),
      sourceIdentity: { namespace: 'api:cash-statement', id: randomUUID() },
    };
    const first = await post('cash-movements', body, contract.financialMutationResponseSchema, {
      commandId,
    });
    const committed = await snapshot();
    expect(
      await post('cash-movements', body, contract.financialMutationResponseSchema, { commandId }),
    ).toEqual(first);
    expect(await snapshot()).toEqual(committed);
    const changed = await request(
      'cash-movements',
      'POST',
      { ...body, amount: '1.21' },
      { commandId },
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await snapshot()).toEqual(committed);
    expect(await post('cash-movements', body, contract.financialMutationResponseSchema)).toEqual(
      first,
    );
    expect(await snapshot()).toEqual(committed);
    expect(
      await get(
        `cash-balances?accountId=${f.account.id}`,
        contract.cashBalanceResponseSchema.array(),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cashBucketId: f.usdBucket.id, amount: '1.2' }),
      ]),
    );
  });

  it('reports missing marks and FX as partial coverage rather than a fabricated complete total', async () => {
    const f = await fixture();
    await post('cash-movements', deposit(f), contract.financialMutationResponseSchema);
    await post('executions', fill(f, 'buy', '2', '50', 2, '1'), contract.executionResponseSchema);
    const missingMark = await get(valuationQuery(f), contract.financialValuationResponseSchema);
    expect(missingMark.nav).toMatchObject({
      state: 'partial',
      availableSubtotal: { amount: '899' },
      reasons: expect.arrayContaining(['missing_mark']),
    });
    await post(
      'price-observations',
      {
        instrumentVersionId: f.instrument.versionId,
        currencyId: usd.id,
        price: '50',
        observedAt: at(3),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    const missingFx = await get(
      valuationQuery(f, eur.id),
      contract.financialValuationResponseSchema,
    );
    expect(missingFx.nav).toMatchObject({
      state: 'partial',
      reasons: expect.arrayContaining(['missing_fx']),
    });
    await post(
      'fx-observations',
      {
        baseCurrencyId: usd.id,
        quoteCurrencyId: eur.id,
        rate: '0.9',
        observedAt: at(3),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    const complete = await get(
      valuationQuery(f, eur.id),
      contract.financialValuationResponseSchema,
    );
    expect(complete.nav).toMatchObject({
      state: 'available',
      value: { currencyId: eur.id, amount: '899.1' },
    });
  });

  it('preserves actual FX amounts and charged-date fee rates in a typed multi-currency view', async () => {
    const f = await fixture();
    const entryRate = await post(
      'fx-observations',
      {
        baseCurrencyId: usd.id,
        quoteCurrencyId: eur.id,
        rate: '0.8',
        observedAt: at(1),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    await post(
      'cash-movements',
      { ...deposit(f), cashBucketId: f.eurBucket.id, currencyId: eur.id },
      contract.financialMutationResponseSchema,
    );
    const conversion = await post(
      'fx-conversions',
      {
        sourceBucketId: f.eurBucket.id,
        destinationBucketId: f.usdBucket.id,
        sourceAmount: '1000',
        destinationAmount: '1250',
        rate: '1.25',
        economicAt: at(2),
        orderingKey: '1',
        fees: [
          { cashBucketId: f.eurBucket.id, currencyId: eur.id, amount: '1', kind: 'conversion' },
        ],
      },
      contract.fxConversionResponseSchema,
    );
    expect(conversion.actualRate).toBe('1.25');
    await post(
      'executions',
      {
        ...fill(f, 'buy', '2', '100', 3, '0.50'),
        basisReportingFx: { observationId: entryRate.id, rate: '0.8' },
        fees: [
          {
            cashBucketId: f.usdBucket.id,
            currencyId: usd.id,
            amount: '0.50',
            kind: 'commission',
            reportingFx: { observationId: entryRate.id, rate: '0.8' },
          },
        ],
      },
      contract.executionResponseSchema,
    );
    const exitRate = await post(
      'fx-observations',
      {
        baseCurrencyId: usd.id,
        quoteCurrencyId: eur.id,
        rate: '0.9',
        observedAt: at(4),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    await post(
      'executions',
      {
        ...fill(f, 'sell', '1', '120', 4, '0.25'),
        basisReportingFx: { observationId: exitRate.id, rate: '0.9' },
        fees: [
          {
            cashBucketId: f.usdBucket.id,
            currencyId: usd.id,
            amount: '0.25',
            kind: 'commission',
            reportingFx: { observationId: exitRate.id, rate: '0.9' },
          },
        ],
      },
      contract.executionResponseSchema,
    );
    const endRate = await post(
      'fx-observations',
      {
        baseCurrencyId: usd.id,
        quoteCurrencyId: eur.id,
        rate: '1',
        observedAt: at(5),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    await post(
      'price-observations',
      {
        instrumentVersionId: f.instrument.versionId,
        currencyId: usd.id,
        price: '110',
        observedAt: at(5),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    const view = await get(
      valuationQuery(f, eur.id, at(5)),
      contract.financialValuationResponseSchema,
    );
    expect(view.nav).toMatchObject({
      state: 'available',
      value: { currencyId: eur.id, amount: '1278.25' },
    });
    const valued = view.positions[0]?.valuation;
    expect(valued?.realizedReportingNet.value).toBe('27.575');
    expect(valued?.unrealizedReportingNet.value).toBe('29.8');
    expect(valued?.observationIds).toEqual(
      expect.arrayContaining([entryRate.id, exitRate.id, endRate.id]),
    );
    expect(
      await get(`fees?accountId=${f.account.id}`, contract.currencyAmountResponseSchema.array()),
    ).toEqual(
      expect.arrayContaining([
        { currencyId: usd.id, amount: '0.75' },
        { currencyId: eur.id, amount: '1' },
      ]),
    );
  });

  it('records multiple supplied derivative cash effects without charging the futures notional', async () => {
    const f = await fixture(true);
    const execution = await post(
      'executions',
      {
        ...fill(f, 'buy', '2', '4000', 2, '1'),
        manualCashEffects: [
          { cashBucketId: f.usdBucket.id, currencyId: usd.id, amount: '1000' },
          { cashBucketId: f.eurBucket.id, currencyId: eur.id, amount: '-5' },
        ],
      },
      contract.executionResponseSchema,
    );
    expect(execution.bookedPrincipal).toBeNull();
    expect(execution.principalCurrencyId).toBeNull();
    const balances = await get(
      `cash-balances?accountId=${f.account.id}`,
      contract.cashBalanceResponseSchema.array(),
    );
    expect(balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currencyId: usd.id, amount: '999' }),
        expect.objectContaining({ currencyId: eur.id, amount: '-5' }),
      ]),
    );
    const [position] = await get(
      `positions?accountId=${f.account.id}`,
      contract.positionResponseSchema.array(),
    );
    expect(position?.inventory.openQuantity.value).toBe('2');
    expect(position?.inventory.grossBasis).toMatchObject({ status: 'unsupported', value: null });
    expect(position?.inventory.reasons).toContain('unsupported_inventory_module');
    await post(
      'fx-observations',
      {
        baseCurrencyId: usd.id,
        quoteCurrencyId: eur.id,
        rate: '0.8',
        observedAt: at(3),
        source: f.source,
      },
      contract.financialMutationResponseSchema,
    );
    const value = await get(valuationQuery(f, eur.id), contract.financialValuationResponseSchema);
    expect(value.nav).toMatchObject({
      state: 'partial',
      availableSubtotal: { amount: '794.2' },
      reasons: expect.arrayContaining(['unsupported']),
    });
    expect(
      await get(`executions?accountId=${f.account.id}`, contract.executionResponseSchema.array()),
    ).toEqual([execution]);
  });

  it('returns campaign and transferred-lot lineage fields without duplicating physical holdings or fees', async () => {
    const f = await fixture();
    await post('cash-movements', deposit(f), contract.financialMutationResponseSchema);
    const opening = await post(
      'executions',
      fill(f, 'buy', '10', '20', 2, '2'),
      contract.executionResponseSchema,
    );
    const trade = await post(
      'trades',
      { title: 'One economic idea', classification: 'active-trading' },
      contract.tradeResponseSchema,
    );
    const leg = await post(
      'trade-legs',
      {
        tradeId: trade.id,
        expectedRevision: trade.revision,
        accountId: f.account.id,
        instrumentVersionId: f.instrument.versionId,
        direction: 'long',
        label: 'Initial leg',
      },
      contract.tradeLegResponseSchema,
    );
    await post(
      'execution-allocations',
      {
        executionId: opening.id,
        expectedVersion: 1,
        reason: 'Reviewed campaign allocation',
        allocations: [{ tradeLegId: leg.id, quantity: '10' }],
      },
      contract.allocationMutationResponseSchema,
    );
    const attribution = await get(
      `campaign-inventory?accountId=${f.account.id}`,
      contract.campaignInventoryResponseSchema,
    );
    expect(attribution.populations).toHaveLength(1);
    expect(attribution.populations[0]?.inventory.population).toBe('campaign-attribution');
    expect(attribution.populations[0]?.inventory.openQuantity.value).toBe('10');
    expect(attribution.bridges[0]?.quantityDifference.value).toBe('0');
    const destination = await createAccount('Destination custody account');
    const destinationBucket = await post(
      'cash-buckets',
      { accountId: destination.id, currencyId: usd.id, kind: 'settled' },
      contract.cashBucketResponseSchema,
    );
    const transfer = await post(
      'holding-transfers',
      {
        sourceAccountId: f.account.id,
        destinationAccountId: destination.id,
        instrumentVersionId: f.instrument.versionId,
        selections: [{ lotId: opening.id, quantity: '4' }],
        reason: 'Confirmed same-owner custody arrival',
        economicAt: at(3),
        orderingKey: '1',
      },
      contract.financialMutationResponseSchema,
    );
    await post(
      'executions',
      {
        ...fill(f, 'sell', '2', '25', 4, '1'),
        accountId: destination.id,
        cashBucketId: destinationBucket.id,
        fees: [
          {
            cashBucketId: destinationBucket.id,
            currencyId: usd.id,
            amount: '1',
            kind: 'commission',
          },
        ],
      },
      contract.executionResponseSchema,
    );
    const [sourcePosition] = await get(
      `positions?accountId=${f.account.id}`,
      contract.positionResponseSchema.array(),
    );
    const [destinationPosition] = await get(
      `positions?accountId=${destination.id}`,
      contract.positionResponseSchema.array(),
    );
    expect(sourcePosition?.inventory.openQuantity.value).toBe('6');
    expect(destinationPosition?.inventory.openQuantity.value).toBe('2');
    expect(destinationPosition?.inventory.realizedNet.value).toBe('8.6');
    expect(destinationPosition?.inventory.lots[0]?.parentLotId).toBe(opening.id);
    expect(destinationPosition?.inventory.lots[0]?.transferId).toBe(transfer.id);
    expect(sourcePosition?.inventory.transferredCosts[0]?.amount).toBe('0.8');
    expect(destinationPosition?.inventory.lots[0]?.costs[0]?.amount).toBe('0.4');
  });
});
