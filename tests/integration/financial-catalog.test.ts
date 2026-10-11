import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, sql, type Database } from '@journal/database';
import {
  createServerServices,
  parseServerConfig,
  type AuthorizationContext,
  type ServerServices,
} from '@journal/server';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import {
  requireAccount,
  requireCurrencyConvention,
  requireInstrumentVersion,
} from '../../packages/server/src/financial/reference-data.js';
import type {
  AccountDto,
  CurrencyDto,
  InstrumentDto,
} from '../../packages/server/src/financial/catalog-types.js';

const origin = 'http://localhost:3000';
const effectiveAt = '2025-01-01T00:00:00.000001Z';
const fixturePassword = 'financial-catalog-test-passphrase-42';
type Owner = Awaited<ReturnType<ServerServices['bootstrapOwner']>>;

describe('financial catalog commands on actual PostgreSQL with restricted tenant roles', () => {
  let admin: Database;
  let services: ServerServices;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  const owners: Owner[] = [];
  let owner: AuthorizationContext;
  let other: AuthorizationContext;
  let editor: AuthorizationContext;
  let viewer: AuthorizationContext;
  let usd: CurrencyDto;
  let eur: CurrencyDto;
  let account: AccountDto;
  let paperAccount: AccountDto;
  let instrument: InstrumentDto;

  async function contextFor(
    person: Owner,
    workspaceId: string,
    role: 'viewer' | 'editor' | 'owner',
  ) {
    const login = await services.handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: person.user.email, password: fixturePassword }),
      }),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    return services.authorizeWorkspace(
      new Request(`${origin}/api/workspaces`, { headers: { cookie } }),
      workspaceId,
      role,
    );
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
        BETTER_AUTH_SECRET: 'financial-catalog-fixture-secret-with-at-least-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    catalog = createCatalogServices(services);
    ledger = createFinancialLedger(services);
    for (let index = 0; index < 3; index++) {
      owners.push(
        await services.bootstrapOwner({
          email: `catalog-${randomUUID()}@example.test`,
          name: `Catalog fixture ${index}`,
          password: fixturePassword,
        }),
      );
    }
    const first = owners[0]!;
    const second = owners[1]!;
    const third = owners[2]!;
    await admin.pool.query(
      'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3),($1,$4,$5)',
      [first.workspace.id, second.user.id, 'viewer', third.user.id, 'editor'],
    );
    owner = await contextFor(first, first.workspace.id, 'editor');
    other = await contextFor(second, second.workspace.id, 'editor');
    viewer = await contextFor(second, first.workspace.id, 'viewer');
    editor = await contextFor(third, first.workspace.id, 'editor');
    usd = await catalog.createCurrency(
      owner,
      {
        namespace: 'iso:4217',
        code: 'USD',
        kind: 'fiat',
        unitIdentity: 'iso:USD',
        name: 'US dollar',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt,
      },
      randomUUID(),
    );
    eur = await catalog.createCurrency(
      owner,
      {
        namespace: 'iso:4217',
        code: 'EUR',
        kind: 'fiat',
        unitIdentity: 'iso:EUR',
        name: 'Euro',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt,
      },
      randomUUID(),
    );
    const broker = await catalog.createBroker(
      owner,
      { name: 'Independent fixture broker', sourceNamespace: 'fixture:broker' },
      randomUUID(),
    );
    account = await catalog.createAccount(
      owner,
      {
        name: 'Live custody account',
        brokerId: broker.id,
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd.id,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    paperAccount = await catalog.createAccount(
      owner,
      {
        name: 'Paper account',
        environment: 'paper',
        accountType: 'cash',
        baseCurrencyId: usd.id,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    instrument = await catalog.createInstrument(
      owner,
      {
        name: 'Ordinary share fixture',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: 'fixture:share:class-a',
        quantityUnit: 'share',
        quoteCurrencyId: usd.id,
        settlementCurrencyId: usd.id,
        multiplier: '1',
        quantityIncrement: '0.001',
        priceIncrement: '0.00001',
        capability: 'native-linear',
        effectiveAt,
        metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
      },
      randomUUID(),
    );
  });

  afterAll(async () => {
    try {
      if (admin) {
        const client = await admin.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET CONSTRAINTS ALL DEFERRED');
          const workspaceIds = owners.map((value) => value.workspace.id);
          // Exact fixture workspaces only. Deferred conservation checks must see
          // the complete teardown, rather than an intermediate incomplete lot.
          for (const table of [
            'trade_closures',
            'inventory_events',
            'cost_allocations',
            'cost_attribution_sets',
            'allocation_items',
            'allocation_sets',
            'lot_matches',
            'lots',
            'positions',
            'holding_books',
            'postings',
            'ledger_events',
            'execution_supersessions',
            'fees',
            'executions',
            'opening_lots',
            'fx_conversions',
            'cash_movements',
            'order_revisions',
            'order_legs',
            'orders',
            'trade_legs',
            'trades',
            'instrument_versions',
            'instruments',
            'cash_buckets',
            'account_settings_versions',
            'accounts',
            'brokers',
            'currency_convention_versions',
            'currencies',
            'outbox_events',
            'financial_commands',
            'financial_state',
          ])
            await client.query(`DELETE FROM app.${table} WHERE workspace_id=ANY($1::uuid[])`, [
              workspaceIds,
            ]);
          await client.query('DELETE FROM app.workspaces WHERE id=ANY($1::uuid[])', [workspaceIds]);
          const userIds = owners.map((value) => value.user.id);
          await client.query('DELETE FROM auth."user" WHERE id=ANY($1::text[])', [userIds]);
          await client.query(
            'DELETE FROM auth.security_events WHERE subject_user_id=ANY($1::text[])',
            [userIds],
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } finally {
      await Promise.all([services?.close(), admin?.close()]);
    }
  });

  it('separates live/paper populations and does not create opening cash or inventory from an account definition', async () => {
    expect(
      (await catalog.listAccounts(owner, { environment: 'live' })).map((value) => value.id),
    ).toEqual([account.id]);
    expect(
      (await catalog.listAccounts(owner, { environment: 'paper' })).map((value) => value.id),
    ).toEqual([paperAccount.id]);
    const count = await admin.pool.query(
      'SELECT (SELECT count(*) FROM app.postings WHERE workspace_id=$1) AS postings,(SELECT count(*) FROM app.positions WHERE workspace_id=$1) AS positions',
      [owner.workspaceId],
    );
    expect(count.rows[0]).toEqual({ postings: '0', positions: '0' });
  });

  it('supports arbitrary uniquely identified digital units and forbids repurposing another currency identity', async () => {
    const token = await catalog.createCurrency(
      owner,
      {
        namespace: 'chain:fixture',
        code: 'USD',
        kind: 'digital',
        unitIdentity: 'chain:fixture:contract:usd',
        name: 'Specifically identified token',
        displayScale: 8,
        settlementIncrement: '0.000000000000000001',
        effectiveAt,
      },
      randomUUID(),
    );
    expect(token.id).not.toBe(usd.id);
    expect(token.settlementIncrement).toBe('0.000000000000000001');
    await expect(
      catalog.createCurrency(
        owner,
        {
          namespace: 'another',
          code: 'USD2',
          kind: 'custom',
          unitIdentity: 'iso:USD',
          name: 'Invalid repurposing',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt,
        },
        randomUUID(),
      ),
    ).rejects.toThrow();
  });

  it('retries the same accepted command once and rejects changed contents without another revision', async () => {
    const commandId = randomUUID();
    const input = { name: 'Idempotent broker', sourceNamespace: 'fixture:idempotent' };
    const first = await catalog.createBroker(owner, input, commandId);
    const result = await Promise.all([
      catalog.createBroker(owner, input, commandId),
      catalog.createBroker(owner, input, commandId),
    ]);
    expect(result).toEqual([first, first]);
    await expect(
      catalog.createBroker(owner, { ...input, name: 'Conflicting name' }, commandId),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const accepted = await admin.pool.query(
      'SELECT count(*)::text AS count FROM app.financial_commands WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, commandId],
    );
    expect(accepted.rows[0].count).toBe('1');
  });

  it('grants editor mutations, denies viewer writes, and enforces tenant boundaries on direct references', async () => {
    await expect(
      catalog.createBroker(
        editor,
        { name: 'Editor broker', sourceNamespace: 'fixture:editor' },
        randomUUID(),
      ),
    ).resolves.toMatchObject({ revision: 1 });
    await expect(
      catalog.createBroker(
        viewer,
        { name: 'Forbidden broker', sourceNamespace: 'fixture:viewer' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(catalog.getAccount(other, account.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      catalog.createAccount(
        other,
        {
          name: 'Cross-tenant reference',
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: usd.id,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await catalog.listCurrencies(other)).toEqual([]);
  });

  it('appends prospective account base-currency versions and keeps historical policy references intact', async () => {
    const revised = await catalog.appendAccountSettings(
      owner,
      account.id,
      {
        expectedRevision: 1,
        reason: 'Prospective reporting convention',
        baseCurrencyId: eur.id,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt: '2025-02-01T00:00:00.000001Z',
      },
      randomUUID(),
    );
    expect(revised).toMatchObject({ revision: 2, settingsVersion: 2, baseCurrencyId: eur.id });
    const original = await services.withWorkspaceContext(owner, (tx) =>
      requireAccount(tx, owner.workspaceId, account.id, false, '2025-01-15T00:00:00Z'),
    );
    expect(original.settingsId).toBe(account.settingsId);
    expect(original.baseCurrencyId).toBe(usd.id);
    await expect(
      catalog.appendAccountSettings(
        owner,
        account.id,
        {
          expectedRevision: 1,
          reason: 'Stale edit',
          baseCurrencyId: usd.id,
          inventoryMethod: 'fifo',
          allowShort: true,
          holdingMode: 'netted',
          effectiveAt: '2025-03-01T00:00:00Z',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
  });

  it('pins historical currency conventions and retains actual source precision rather than applying display scale', async () => {
    const next = await catalog.appendCurrencyConvention(
      owner,
      usd.id,
      {
        expectedRevision: 1,
        reason: 'Future estimate convention',
        displayScale: 4,
        settlementIncrement: '0.0001',
        effectiveAt: '2025-06-01T00:00:00.000001Z',
      },
      randomUUID(),
    );
    expect(next).toMatchObject({ version: 2, revision: 2, settlementIncrement: '0.0001' });
    const previous = await services.withWorkspaceContext(owner, (tx) =>
      requireCurrencyConvention(tx, owner.workspaceId, usd.id, '2025-02-01T00:00:00Z'),
    );
    expect(previous).toMatchObject({
      id: usd.conventionId,
      version: 1,
      settlementIncrement: '0.01',
    });
  });

  it('preserves immutable instrument versions at microsecond boundaries and rejects unit/multiplier reinterpretation', async () => {
    const revised = await catalog.appendInstrumentVersion(
      owner,
      instrument.id,
      {
        expectedRevision: 1,
        reason: 'Quote precision improvement',
        quantityUnit: 'share',
        quoteCurrencyId: usd.id,
        settlementCurrencyId: usd.id,
        multiplier: '1',
        quantityIncrement: '0.001',
        priceIncrement: '0.000001',
        capability: 'native-linear',
        effectiveAt: '2025-01-01T00:00:00.000002Z',
        metadata: instrument.metadata,
      },
      randomUUID(),
    );
    expect(revised.versionId).not.toBe(instrument.versionId);
    const original = await services.withWorkspaceContext(owner, (tx) =>
      requireInstrumentVersion(tx, owner.workspaceId, instrument.versionId),
    );
    expect(original.priceIncrement).toBe('0.00001');
    expect(original.effectiveAt).toBe(effectiveAt);
    await expect(
      catalog.appendInstrumentVersion(
        owner,
        instrument.id,
        {
          expectedRevision: 2,
          reason: 'Invalid unit rewrite',
          quantityUnit: 'bundle',
          quoteCurrencyId: usd.id,
          settlementCurrencyId: usd.id,
          multiplier: '1',
          quantityIncrement: '1',
          priceIncrement: '0.01',
          capability: 'manual',
          effectiveAt: '2025-02-01T00:00:00Z',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'UNIT_TRANSFORMATION_REQUIRED' });
  });

  it('records unsupported asset-family metadata without a derivative notional cash posting', async () => {
    for (const family of [
      'future',
      'option',
      'inverse-perpetual',
      'bond',
      'structured-product',
      'physical-commodity',
      'custom',
    ]) {
      const manual = await catalog.createInstrument(
        owner,
        {
          name: `Manual ${family}`,
          family,
          subtype: 'source-defined',
          economicIdentity: `fixture:manual:${family}`,
          quantityUnit: 'source-defined-unit',
          quoteCurrencyId: usd.id,
          settlementCurrencyId: eur.id,
          multiplier: '100',
          quantityIncrement: '1',
          priceIncrement: '0.0001',
          capability: 'manual',
          effectiveAt,
          metadata: { termSheet: `fixture:${family}` },
        },
        randomUUID(),
      );
      expect(manual.capability).toBe('manual');
    }
    const money = await admin.pool.query(
      'SELECT count(*)::text AS count FROM app.postings WHERE workspace_id=$1',
      [owner.workspaceId],
    );
    expect(money.rows[0].count).toBe('0');
  });

  it('keeps instructions and cancellation revisions separate from actual inventory and prices', async () => {
    const recorded = await catalog.createOrder(
      owner,
      {
        accountId: account.id,
        kind: 'single',
        legs: [{ instrumentVersionId: instrument.versionId, side: 'buy', ratio: '1' }],
        instruction: {
          status: 'working',
          quantity: '0.25',
          orderType: 'limit',
          limitPrice: '100.00001',
          timeInForce: 'day',
        },
        economicAt: '2025-02-01T00:00:00Z',
      },
      randomUUID(),
    );
    const canceled = await catalog.amendOrder(
      owner,
      recorded.id,
      {
        expectedRevision: 1,
        instruction: { ...recorded.instruction, status: 'canceled' },
        economicAt: '2025-02-01T00:00:01Z',
        reason: 'Broker cancellation evidence',
      },
      randomUUID(),
    );
    expect(canceled).toMatchObject({
      revision: 2,
      instruction: { status: 'canceled', quantity: '0.25', limitPrice: '100.00001' },
    });
    const count = await admin.pool.query(
      'SELECT count(*)::text AS count FROM app.executions WHERE workspace_id=$1',
      [owner.workspaceId],
    );
    expect(count.rows[0].count).toBe('0');
    expect((await catalog.listOrders(owner)).map((value) => value.id)).toContain(recorded.id);
    await expect(
      catalog.amendOrder(
        owner,
        recorded.id,
        {
          expectedRevision: 1,
          instruction: recorded.instruction,
          economicAt: '2025-02-01T00:00:02Z',
          reason: 'Stale edit',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
  });

  it('retains independent multi-leg package intent and campaign/account attribution legs', async () => {
    const campaign = await catalog.createTrade(
      owner,
      { title: 'Cross-account thesis', classification: 'active-trading' },
      randomUUID(),
    );
    const first = await catalog.addTradeLeg(
      owner,
      {
        tradeId: campaign.id,
        expectedRevision: 1,
        accountId: account.id,
        instrumentVersionId: instrument.versionId,
        direction: 'long',
        label: 'Live leg',
      },
      randomUUID(),
    );
    await catalog.addTradeLeg(
      owner,
      {
        tradeId: campaign.id,
        expectedRevision: 2,
        accountId: paperAccount.id,
        instrumentVersionId: instrument.versionId,
        direction: 'long',
        label: 'Paper comparison',
      },
      randomUUID(),
    );
    const legs = await catalog.listTradeLegs(owner, campaign.id);
    expect(legs).toHaveLength(2);
    expect(legs.some((value) => value.id === first.id)).toBe(true);
    expect(
      (await catalog.listTrades(owner)).find((value) => value.id === campaign.id),
    ).toMatchObject({ status: 'planned', revision: 3 });
    const order = await catalog.createOrder(
      owner,
      {
        accountId: account.id,
        kind: 'package',
        legs: [
          { instrumentVersionId: instrument.versionId, side: 'buy', ratio: '1' },
          { instrumentVersionId: instrument.versionId, side: 'sell', ratio: '2' },
        ],
        instruction: { status: 'recorded', quantity: '1', orderType: 'market', timeInForce: 'day' },
        economicAt: '2025-02-02T00:00:00Z',
      },
      randomUUID(),
    );
    expect(order.legs.map((value) => value.ratio).sort()).toEqual(['1', '2']);
    expect(order.legs.every((value) => !('price' in value))).toBe(true);
  });

  it('derives partial and excess fill quantities from effective facts while preserving terminal intent evidence', async () => {
    const fillAccount = await catalog.createAccount(
      owner,
      {
        name: 'Independent order-fill account',
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd.id,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const cash = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: fillAccount.id,
      currencyId: usd.id,
      kind: 'settled',
    });
    const order = await catalog.createOrder(
      owner,
      {
        accountId: fillAccount.id,
        kind: 'single',
        legs: [{ instrumentVersionId: instrument.versionId, side: 'buy', ratio: '1' }],
        instruction: { status: 'working', quantity: '1', orderType: 'market', timeInForce: 'day' },
        economicAt: '2025-03-01T00:00:00Z',
      },
      randomUUID(),
    );
    const input = {
      accountId: fillAccount.id,
      instrumentVersionId: instrument.versionId,
      orderLegId: order.legs[0]!.id,
      side: 'buy' as const,
      quantity: '0.25',
      price: '10',
      cashBucketId: cash.id,
      economicAt: '2025-03-01T00:00:01.000001Z',
      orderingKey: '1',
      costsComplete: true,
    };
    const original = await ledger.recordExecution(owner, { ...input, commandId: randomUUID() });
    expect(await catalog.getOrder(owner, order.id)).toMatchObject({
      instruction: { status: 'working' },
      fillStatus: 'partially_filled',
      discrepancies: [],
      legs: [
        {
          intendedQuantity: '1',
          filledQuantity: '0.25',
          remainingQuantity: '0.75',
          overfillQuantity: '0',
          executionCount: 1,
          lateFillCount: 0,
        },
      ],
    });
    await catalog.amendOrder(
      owner,
      order.id,
      {
        expectedRevision: 1,
        instruction: { ...order.instruction, status: 'canceled' },
        economicAt: '2025-03-01T00:00:02.000001Z',
        reason: 'Cancellation evidence arrived',
      },
      randomUUID(),
    );
    await ledger.recordExecution(owner, {
      ...input,
      commandId: randomUUID(),
      quantity: '1',
      economicAt: '2025-03-01T00:00:03.000001Z',
      orderingKey: '2',
    });
    expect(await catalog.getOrder(owner, order.id)).toMatchObject({
      revision: 2,
      instruction: { status: 'canceled' },
      fillStatus: 'overfilled',
      discrepancies: ['source-overfill', 'fill-after-terminal-intent'],
      legs: [
        {
          filledQuantity: '1.25',
          remainingQuantity: '0',
          overfillQuantity: '0.25',
          executionCount: 2,
          lateFillCount: 1,
        },
      ],
    });
    await ledger.correctExecution(owner, {
      commandId: randomUUID(),
      originalExecutionId: original.id,
      reason: 'Broker corrected first partial fill',
      replacement: { ...input, quantity: '0.5' },
    });
    expect(await catalog.getOrder(owner, order.id)).toMatchObject({
      revision: 2,
      instruction: { status: 'canceled' },
      fillStatus: 'overfilled',
      legs: [
        { filledQuantity: '1.5', overfillQuantity: '0.5', executionCount: 2, lateFillCount: 1 },
      ],
    });
  });

  it('requires explicit flat and settled closure, retains its history, and flags quantity corrections for review', async () => {
    const closureAccount = await catalog.createAccount(
      owner,
      {
        name: 'Closure fixture account',
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd.id,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const settled = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: closureAccount.id,
      currencyId: usd.id,
      kind: 'settled',
    });
    const unsettled = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: closureAccount.id,
      currencyId: usd.id,
      kind: 'unsettled',
    });
    const campaign = await catalog.createTrade(
      owner,
      { title: 'Closure fixture thesis', classification: 'active-trading' },
      randomUUID(),
    );
    const leg = await catalog.addTradeLeg(
      owner,
      {
        tradeId: campaign.id,
        expectedRevision: 1,
        accountId: closureAccount.id,
        instrumentVersionId: instrument.versionId,
        direction: 'long',
        label: 'Assigned exposure',
      },
      randomUUID(),
    );
    const closureInput = {
      expectedRevision: 2,
      reason: 'Reviewed closure',
      obligationEvidence: 'All actual settlements and capability-specific obligations discharged',
    };
    await expect(
      catalog.confirmTradeClosure(owner, campaign.id, closureInput, randomUUID()),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_HAS_NO_ACTIVITY' });
    const buyInput = {
      accountId: closureAccount.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy' as const,
      quantity: '1',
      price: '10',
      cashBucketId: unsettled.id,
      economicAt: '2025-04-01T00:00:00.000001Z',
      orderingKey: '1',
      costsComplete: true,
    };
    const buy = await ledger.recordExecution(owner, { ...buyInput, commandId: randomUUID() });
    await ledger.allocateExecution(owner, {
      commandId: randomUUID(),
      executionId: buy.id,
      reason: 'Entry attribution',
      expectedVersion: 1,
      allocations: [{ tradeLegId: leg.id, quantity: '1' }],
    });
    const open = await catalog.getTrade(owner, campaign.id);
    await expect(
      catalog.confirmTradeClosure(
        owner,
        campaign.id,
        { ...closureInput, expectedRevision: open.revision },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_HAS_OPEN_EXPOSURE' });
    const sell = await ledger.recordExecution(owner, {
      ...buyInput,
      commandId: randomUUID(),
      side: 'sell',
      price: '12',
      cashBucketId: settled.id,
      economicAt: '2025-04-02T00:00:00.000001Z',
      orderingKey: '2',
    });
    await ledger.allocateExecution(owner, {
      commandId: randomUUID(),
      executionId: sell.id,
      reason: 'Exit attribution',
      expectedVersion: 1,
      allocations: [{ tradeLegId: leg.id, quantity: '1' }],
    });
    const flat = await catalog.getTrade(owner, campaign.id);
    expect(flat.status).not.toBe('closed');
    await expect(
      catalog.confirmTradeClosure(
        owner,
        campaign.id,
        { ...closureInput, expectedRevision: flat.revision },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_HAS_UNSETTLED_OBLIGATIONS' });
    await ledger.moveCashBuckets(owner, {
      commandId: randomUUID(),
      sourceBucketId: unsettled.id,
      destinationBucketId: settled.id,
      amount: '10',
      kind: 'settlement',
      executionId: buy.id,
      economicAt: '2025-04-03T00:00:00.000001Z',
      orderingKey: '3',
    });
    const commandId = randomUUID();
    const confirmation = { ...closureInput, expectedRevision: flat.revision };
    const closed = await catalog.confirmTradeClosure(owner, campaign.id, confirmation, commandId);
    expect(closed).toMatchObject({
      status: 'closed',
      definitionVersion: 'campaign-closure/1',
      tradeId: campaign.id,
    });
    expect(await catalog.confirmTradeClosure(owner, campaign.id, confirmation, commandId)).toEqual(
      closed,
    );
    expect(await catalog.getTrade(owner, campaign.id)).toMatchObject({
      status: 'closed',
      closureReviewRequired: false,
    });
    await expect(
      catalog.addTradeLeg(
        owner,
        {
          tradeId: campaign.id,
          expectedRevision: closed.revision,
          accountId: closureAccount.id,
          instrumentVersionId: instrument.versionId,
          direction: 'long',
          label: 'Invalid reopening',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_REFERENCE' });
    async function closureFacts() {
      const metadata = await admin.pool.query(
        `SELECT revision::text,
          (SELECT count(*)::text FROM app.financial_commands WHERE workspace_id=$1) AS commands,
          (SELECT count(*)::text FROM app.execution_supersessions WHERE workspace_id=$1) AS supersessions,
          (SELECT count(*)::text FROM app.audit_events WHERE workspace_id=$1) AS audit,
          (SELECT count(*)::text FROM app.outbox_events WHERE workspace_id=$1) AS outbox
        FROM app.financial_state WHERE workspace_id=$1`,
        [owner.workspaceId],
      );
      return {
        metadata: metadata.rows,
        executions: await ledger.executions(owner, { accountId: closureAccount.id }),
        inventory: await ledger.positions(owner, { accountId: closureAccount.id }),
        cash: await ledger.cashBalances(owner, { accountIds: [closureAccount.id] }),
        trade: await catalog.getTrade(owner, campaign.id),
      };
    }
    const confirmedFacts = await closureFacts();
    await expect(
      ledger.correctExecution(owner, {
        commandId: randomUUID(),
        originalExecutionId: buy.id,
        reason: 'Historical purchase quantity correction needs settlement review',
        replacement: { ...buyInput, quantity: '0.5', cashBucketId: settled.id },
        replacementAllocations: [{ tradeLegId: leg.id, quantity: '0.5' }],
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENT_SETTLEMENT_REVIEW_REQUIRED' });
    expect(await closureFacts()).toEqual(confirmedFacts);

    // The sale was charged directly to settled cash and has no separate confirmed
    // settlement event. A reviewed actual quantity correction may restate it.
    const correction = {
      commandId: randomUUID(),
      originalExecutionId: sell.id,
      reason: 'Actual sale quantity corrected with reviewed campaign attribution',
      replacement: {
        ...buyInput,
        side: 'sell' as const,
        quantity: '0.5',
        price: '12',
        cashBucketId: settled.id,
        economicAt: '2025-04-02T00:00:00.000001Z',
        orderingKey: '2',
      },
      replacementAllocations: [{ tradeLegId: leg.id, quantity: '0.5' }],
    };
    const revised = await ledger.correctExecution(owner, correction);
    const revisedFacts = await closureFacts();
    expect(await ledger.correctExecution(owner, correction)).toEqual(revised);
    expect(await closureFacts()).toEqual(revisedFacts);
    expect(revisedFacts.inventory[0]?.inventory.openQuantity.value).toBe('0.5');
    expect(revisedFacts.cash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cashBucketId: settled.id, amount: '-4' }),
        expect.objectContaining({ cashBucketId: unsettled.id, amount: '0' }),
      ]),
    );
    expect(await catalog.getTrade(owner, campaign.id)).toMatchObject({
      status: 'closed',
      closureReviewRequired: true,
    });
    const history = await admin.pool.query(
      'SELECT count(*)::text AS count FROM app.trade_closures WHERE workspace_id=$1 AND trade_id=$2',
      [owner.workspaceId, campaign.id],
    );
    expect(history.rows[0].count).toBe('1');
  });

  it('accepts a reviewed prospective FIFO-to-average snapshot without rewriting earlier realization or cash', async () => {
    const policyAccount = await catalog.createAccount(
      owner,
      {
        name: 'Prospective policy fixture',
        environment: 'live',
        accountType: 'cash',
        baseCurrencyId: usd.id,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const cash = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: policyAccount.id,
      currencyId: usd.id,
      kind: 'settled',
    });
    for (const [price, economicAt, orderingKey] of [
      ['10', '2025-01-02T00:00:00.000001Z', '1'],
      ['20', '2025-01-03T00:00:00.000001Z', '2'],
    ] as const)
      await ledger.recordExecution(owner, {
        commandId: randomUUID(),
        accountId: policyAccount.id,
        instrumentVersionId: instrument.versionId,
        side: 'buy',
        quantity: '2',
        price,
        cashBucketId: cash.id,
        economicAt,
        orderingKey,
        costsComplete: true,
        fees: [{ cashBucketId: cash.id, currencyId: usd.id, amount: '2', kind: 'commission' }],
      });
    const cashBefore = await ledger.cashBalances(owner, { accountIds: [policyAccount.id] });
    const revised = await catalog.appendAccountSettings(
      owner,
      policyAccount.id,
      {
        expectedRevision: 1,
        reason: 'Reviewed eligible source-pool conversion',
        baseCurrencyId: usd.id,
        inventoryMethod: 'average',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt: '2025-01-04T00:00:00.000001Z',
      },
      randomUUID(),
    );
    expect(revised).toMatchObject({ revision: 2, inventoryMethod: 'average', settingsVersion: 2 });
    expect(await ledger.cashBalances(owner, { accountIds: [policyAccount.id] })).toEqual(
      cashBefore,
    );
    const converted = (await ledger.positions(owner, { accountId: policyAccount.id }))[0]!;
    expect(converted.inventory.policy).toBe('average');
    expect(converted.inventory.grossBasis.value).toBe('60');
    expect(converted.inventory.realizedGross.value).toBe('0');
    expect(converted.inventory.lots.filter((lot) => lot.remainingQuantity !== '0')).toHaveLength(2);
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: policyAccount.id,
      instrumentVersionId: instrument.versionId,
      side: 'sell',
      quantity: '2',
      price: '30',
      cashBucketId: cash.id,
      economicAt: '2025-01-05T00:00:00.000001Z',
      orderingKey: '3',
      costsComplete: true,
      fees: [{ cashBucketId: cash.id, currencyId: usd.id, amount: '1', kind: 'commission' }],
    });
    const disposed = (await ledger.positions(owner, { accountId: policyAccount.id }))[0]!;
    expect(disposed.inventory.realizedGross.value).toBe('30');
    expect(disposed.inventory.realizedNet.value).toBe('27');
    expect(disposed.inventory.grossBasis.value).toBe('30');
    await expect(
      catalog.appendAccountSettings(
        owner,
        policyAccount.id,
        {
          expectedRevision: 2,
          reason: 'Unreviewed reverse toggle',
          baseCurrencyId: usd.id,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt: '2025-01-06T00:00:00.000001Z',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'POLICY_TRANSITION_REQUIRED' });
  });

  it('archives reference identities without deleting history or allowing new selection', async () => {
    const temporary = await catalog.createCurrency(
      owner,
      {
        namespace: 'custom',
        code: 'OLD',
        kind: 'custom',
        unitIdentity: 'fixture:old-unit',
        name: 'Retired unit',
        displayScale: 3,
        settlementIncrement: '0.001',
        effectiveAt,
      },
      randomUUID(),
    );
    await catalog.archiveCatalog(
      owner,
      'currency',
      temporary.id,
      { expectedRevision: 1, reason: 'Retired reference data' },
      randomUUID(),
    );
    expect((await catalog.getCurrency(owner, temporary.id)).archivedAt).not.toBeNull();
    expect((await catalog.listCurrencies(owner)).some((value) => value.id === temporary.id)).toBe(
      false,
    );
    expect(
      (await catalog.listCurrencies(owner, { includeArchived: true })).some(
        (value) => value.id === temporary.id,
      ),
    ).toBe(true);
    await expect(
      catalog.createAccount(
        owner,
        {
          name: 'Invalid archived selection',
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: temporary.id,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_REFERENCE' });
  });

  it('rolls back failed dependent commands together with source revision, audit and outbox', async () => {
    const revision = await admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [owner.workspaceId],
    );
    const commandId = randomUUID();
    await expect(
      catalog.createAccount(
        owner,
        {
          name: 'Atomic invalid definition',
          brokerId: randomUUID(),
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: usd.id,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt,
        },
        commandId,
      ),
    ).rejects.toThrow();
    const unchanged = await admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [owner.workspaceId],
    );
    expect(unchanged.rows).toEqual(revision.rows);
    expect(
      (
        await admin.pool.query(
          'SELECT id FROM app.financial_commands WHERE workspace_id=$1 AND id=$2',
          [owner.workspaceId, commandId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await admin.pool.query(
          'SELECT id FROM app.outbox_events WHERE workspace_id=$1 AND command_id=$2',
          [owner.workspaceId, commandId],
        )
      ).rows,
    ).toEqual([]);
    const raw = await services.withWorkspaceContext(owner, (tx) =>
      tx.execute(
        sql`SELECT count(*)::text AS count FROM app.accounts WHERE workspace_id=${owner.workspaceId} AND name='Atomic invalid definition'`,
      ),
    );
    expect(raw.rows[0]?.['count']).toBe('0');
  });
});
