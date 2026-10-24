import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, sql, type Database } from '@journal/database';
import { financialValuationResponseSchema } from '@journal/contracts';
import {
  createCatalogServices,
  createFinancialLedger,
  createFinancialObservations,
  createServerServices,
  parseServerConfig,
  type AuthorizationContext,
  type ServerServices,
} from '@journal/server';
import type { CurrencyDto } from '../../packages/server/src/financial/catalog-types.js';
import type { FinancialValuationQuery } from '../../packages/server/src/financial/observations.js';
import { createAccountingReports } from '../../packages/server/src/accounting/report.js';
import { createAccountingServices } from '../../packages/server/src/accounting/service.js';
import { createAccountingCorrections } from '../../packages/server/src/accounting/corrections.js';
import { INVENTORY_CALCULATION_MANIFEST, replayInventory } from '@journal/domain';

const origin = 'http://localhost:3000';
const effectiveAt = '2025-01-01T00:00:00.000001Z';
const observedAt = '2025-03-01T00:00:00.000001Z';
const asOf = '2025-03-01T00:01:00.000001Z';
const fixturePassword = 'financial-observation-test-passphrase-42';

describe('financial observations and coherent multi-currency views on actual PostgreSQL', () => {
  let admin: Database;
  let services: ServerServices;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let owner: AuthorizationContext;
  let viewer: AuthorizationContext;
  let other: AuthorizationContext;
  let usd: CurrencyDto;
  let eur: CurrencyDto;
  let gbp: CurrencyDto;

  async function contextFor(
    person: Awaited<ReturnType<ServerServices['bootstrapOwner']>>,
    workspaceId: string,
    role: 'viewer' | 'editor',
  ) {
    const response = await services.handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: person.user.email, password: fixturePassword }),
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    return services.authorizeWorkspace(
      new Request(`${origin}/api/v1/workspaces`, { headers: { cookie } }),
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
        BETTER_AUTH_SECRET: 'financial-observation-fixture-secret-with-at-least-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    catalog = createCatalogServices(services);
    ledger = createFinancialLedger(services);
    observations = createFinancialObservations(services);
    const first = await services.bootstrapOwner({
      email: `observations-${randomUUID()}@example.test`,
      name: 'Observation owner',
      password: fixturePassword,
    });
    const second = await services.bootstrapOwner({
      email: `observations-${randomUUID()}@example.test`,
      name: 'Observation viewer',
      password: fixturePassword,
    });
    await admin.pool.query(
      'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
      [first.workspace.id, second.user.id, 'viewer'],
    );
    owner = await contextFor(first, first.workspace.id, 'editor');
    viewer = await contextFor(second, first.workspace.id, 'viewer');
    other = await contextFor(second, second.workspace.id, 'editor');
    const currencies = [];
    for (const code of ['USD', 'EUR', 'GBP'])
      currencies.push(
        await catalog.createCurrency(
          owner,
          {
            namespace: 'iso:4217',
            code,
            kind: 'fiat',
            unitIdentity: `iso:${code}`,
            name: code,
            displayScale: 2,
            settlementIncrement: '0.01',
            effectiveAt,
          },
          randomUUID(),
        ),
      );
    [usd, eur, gbp] = currencies as [CurrencyDto, CurrencyDto, CurrencyDto];
  });

  afterAll(async () => {
    // Fixture workspaces are unique and remain only in the guarded disposable test database.
    // Financial history is not cascade-deleted through application runtime credentials.
    await Promise.all([services?.close(), admin?.close()]);
  });

  async function fixture(environment: 'live' | 'paper' = 'live', manual = false) {
    const source = `fixture:${randomUUID()}`;
    const account = await catalog.createAccount(
      owner,
      {
        name: source,
        environment,
        accountType: 'margin',
        baseCurrencyId: eur.id,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const instrument = await catalog.createInstrument(
      owner,
      {
        name: source,
        family: manual ? 'option' : 'stock',
        subtype: manual ? 'listed-option' : 'ordinary-share',
        economicIdentity: source,
        quantityUnit: manual ? 'contract' : 'share',
        quoteCurrencyId: usd.id,
        settlementCurrencyId: usd.id,
        multiplier: manual ? '100' : '1',
        quantityIncrement: '0.001',
        priceIncrement: '0.00001',
        capability: manual ? 'manual' : 'native-linear',
        effectiveAt,
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: manual ? 'manual' : 'delivered',
        },
      },
      randomUUID(),
    );
    const eurBucket = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: eur.id,
      kind: 'settled',
    });
    const usdBucket = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: usd.id,
      kind: 'settled',
    });
    return { source, account, instrument, eurBucket, usdBucket };
  }

  function query(accountIds: string[], source: string, instant = asOf): FinancialValuationQuery {
    return {
      accountIds,
      reportingCurrencyId: eur.id,
      asOf: instant,
      fxPolicy: {
        id: 'fixture-direct-inverse-v1',
        maxAgeMilliseconds: 86_400_000,
        sourcePriority: [source],
      },
      priceMaxAgeMilliseconds: 86_400_000,
      priceSourcePriority: [source],
    };
  }

  async function fund(
    accountId: string,
    cashBucketId: string,
    currencyId: string,
    amount: string,
    economicAt = observedAt,
  ) {
    return ledger.recordCashMovement(owner, {
      commandId: randomUUID(),
      accountId,
      cashBucketId,
      currencyId,
      amount,
      kind: 'deposit',
      economicAt,
      orderingKey: '1',
    });
  }

  it('keeps once-counted owned cash in transit in the retained NAV through receipt and historical restatement', async () => {
    const source = await fixture();
    const destination = await fixture();
    await fund(source.account.id, source.usdBucket.id, usd.id, '100', '2025-03-01T00:00:00Z');
    const accounting = createAccountingServices(services);
    const transfer = await accounting.createCashTransfer(owner, {
      commandId: randomUUID(),
      sourceBucketId: source.usdBucket.id,
      destinationBucketId: destination.usdBucket.id,
      amount: '100',
      economicAt: '2025-03-01T00:00:01Z',
      orderingKey: '1',
      description: 'Owned money remains in transit',
    });
    const q = {
      ...query([source.account.id, destination.account.id], source.source, '2025-03-01T00:00:02Z'),
      reportingCurrencyId: usd.id,
    };
    const pending = await observations.valuation(owner, q);
    expect(pending.nav).toMatchObject({ state: 'available', value: { amount: '100' } });
    expect(
      pending.nav.state === 'available' &&
        pending.nav.components.filter((component) => component.id === transfer.id),
    ).toHaveLength(1);
    const report = await createAccountingReports(services).report(owner, {
      accountIds: [...q.accountIds],
      reportingCurrencyId: usd.id,
      from: '2025-03-01T00:00:00Z',
      to: q.asOf,
      fxPolicy: { ...q.fxPolicy, sourcePriority: [...q.fxPolicy.sourcePriority] },
      priceMaxAgeMilliseconds: q.priceMaxAgeMilliseconds,
      priceSourcePriority: [...q.priceSourcePriority],
    });
    expect(report.closing.equity.value).toBe('100');
    await accounting.receiveCashTransfer(owner, transfer.id, {
      commandId: randomUUID(),
      economicAt: '2025-03-01T00:00:03Z',
      orderingKey: '1',
    });
    const received = await observations.valuation(owner, { ...q, asOf: '2025-03-01T00:00:03Z' });
    expect(received.nav).toMatchObject({ state: 'available', value: { amount: '100' } });
    expect(
      received.nav.state === 'available' &&
        received.nav.components.some((component) => component.id === transfer.id),
    ).toBe(false);
    expect((await observations.valuation(owner, q)).nav).toMatchObject({
      state: 'available',
      value: { amount: '100' },
    });
    expect(
      (await observations.valuation(owner, { ...q, reportingCurrencyId: eur.id })).nav.state,
    ).toBe('partial');
  });

  it('removes reversed pending transit from current NAV while the pinned prior accounting revision retains its owned asset', async () => {
    const source = await fixture();
    const destination = await fixture();
    await fund(source.account.id, source.usdBucket.id, usd.id, '100', '2025-03-01T00:00:00Z');
    const transfer = await createAccountingServices(services).createCashTransfer(owner, {
      commandId: randomUUID(),
      sourceBucketId: source.usdBucket.id,
      destinationBucketId: destination.usdBucket.id,
      amount: '100',
      economicAt: '2025-03-01T00:00:01Z',
      orderingKey: '1',
      description: 'Pending transfer whose source evidence is corrected',
    });
    const q = {
      ...query([source.account.id, destination.account.id], source.source, '2025-03-01T00:00:02Z'),
      reportingCurrencyId: usd.id,
    };
    const before = await observations.valuation(owner, q);
    expect(before.nav).toMatchObject({ state: 'available', value: { amount: '100' } });
    expect(
      before.nav.state === 'available' && before.nav.components.some((c) => c.id === transfer.id),
    ).toBe(true);
    await createAccountingCorrections(services).reverse(owner, transfer.id, {
      commandId: randomUUID(),
      expectedSourceRevision: before.sourceRevision,
      sourceType: 'transfer',
      reason: 'Historical evidence shows no owned transfer occurred',
    });
    const after = await observations.valuation(owner, q);
    expect(after.nav).toMatchObject({ state: 'available', value: { amount: '100' } });
    expect(
      after.nav.state === 'available' && after.nav.components.some((c) => c.id === transfer.id),
    ).toBe(false);
    const pinned = await createAccountingReports(services).report(owner, {
      accountIds: [...q.accountIds],
      reportingCurrencyId: usd.id,
      from: '2025-03-01T00:00:00Z',
      to: q.asOf,
      sourceRevision: before.sourceRevision,
      fxPolicy: { ...q.fxPolicy, sourcePriority: [...q.fxPolicy.sourcePriority] },
      priceMaxAgeMilliseconds: q.priceMaxAgeMilliseconds,
      priceSourcePriority: [...q.priceSourcePriority],
    });
    expect(pinned.closing.transit).toMatchObject({ state: 'available', value: '100' });
    expect(pinned.closing.equity).toMatchObject({ state: 'available', value: '100' });
  });

  it('rejects future-effective source conventions and retains signed manual futures quotes without automatic P&L', async () => {
    const f = await fixture();
    const boundary = '2025-03-01T00:00:00.000001Z';
    const before = '2025-03-01T00:00:00.000000Z';
    const future = await catalog.createInstrument(
      owner,
      {
        name: 'Signed source future ' + randomUUID(),
        family: 'future',
        subtype: 'source-settled-future',
        economicIdentity: randomUUID(),
        quantityUnit: 'contract',
        quoteCurrencyId: usd.id,
        settlementCurrencyId: usd.id,
        multiplier: '1000',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'manual',
        effectiveAt: boundary,
        metadata: { priceConvention: 'unit-price', settlementStyle: 'explicit-source-settlement' },
      },
      randomUUID(),
    );
    const fill = {
      accountId: f.account.id,
      instrumentVersionId: future.versionId,
      side: 'buy' as const,
      quantity: '1',
      price: '-37.63',
      orderingKey: '1',
      costsComplete: true,
      manualCashEffects: [],
    };
    await expect(
      ledger.recordExecution(owner, { ...fill, commandId: randomUUID(), economicAt: before }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      ledger.recordOpeningLot(owner, {
        commandId: randomUUID(),
        accountId: f.account.id,
        instrumentVersionId: future.versionId,
        direction: 'long',
        quantity: '1',
        entryPrice: '-37.63',
        economicAt: before,
        orderingKey: '1',
        reason: 'Source convention is not yet effective',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      observations.recordPriceObservation(owner, {
        commandId: randomUUID(),
        instrumentVersionId: future.versionId,
        currencyId: usd.id,
        price: '-37.63',
        observedAt: before,
        source: f.source,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    const execution = await ledger.recordExecution(owner, {
      ...fill,
      commandId: randomUUID(),
      economicAt: boundary,
    });
    expect(execution.price).toBe('-37.63');
    const opening = await ledger.recordOpeningLot(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: future.versionId,
      direction: 'long',
      quantity: '1',
      entryPrice: '-37.63',
      economicAt: boundary,
      orderingKey: '2',
      reason: 'Retain the signed source entry quote without inferred basis',
    });
    expect(
      (
        await admin.pool.query(
          'SELECT price_raw FROM app.opening_lots WHERE workspace_id=$1 AND id=$2',
          [owner.workspaceId, opening.id],
        )
      ).rows[0]?.price_raw,
    ).toBe('-37.63');
    const mark = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: future.versionId,
      currencyId: usd.id,
      price: '-37.63',
      observedAt: boundary,
      source: f.source,
    });
    expect(
      (
        await admin.pool.query(
          'SELECT price_raw FROM app.price_observations WHERE workspace_id=$1 AND id=$2',
          [owner.workspaceId, mark.id],
        )
      ).rows[0]?.price_raw,
    ).toBe('-37.63');
    const valuation = await observations.valuation(owner, {
      ...query([f.account.id], f.source, boundary),
      reportingCurrencyId: usd.id,
    });
    expect(valuation.positions[0]?.inventory.status).toBe('unsupported');
    expect(valuation.positions[0]?.valuation.markedValue.status).toBe('unsupported');
    expect(valuation.nav.state).toBe('partial');
    await expect(
      ledger.recordExecution(owner, {
        ...fill,
        commandId: randomUUID(),
        instrumentVersionId: f.instrument.versionId,
        price: '-1',
        economicAt: boundary,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      observations.recordPriceObservation(owner, {
        commandId: randomUUID(),
        instrumentVersionId: f.instrument.versionId,
        currencyId: usd.id,
        price: '-1',
        observedAt: boundary,
        source: f.source,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      ledger.recordOpeningLot(owner, {
        commandId: randomUUID(),
        accountId: f.account.id,
        instrumentVersionId: f.instrument.versionId,
        direction: 'long',
        quantity: '1',
        entryPrice: '-1',
        economicAt: boundary,
        orderingKey: '3',
        reason: 'Native delivered prices must remain positive',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      admin.pool.query(
        `INSERT INTO app.price_observations(workspace_id,id,instrument_version_id,currency_id,price_raw,observed_at,source,actor_id)
      VALUES($1,$2,$3,$4,'1',$5,'direct-guard',$6)`,
        [owner.workspaceId, randomUUID(), future.versionId, usd.id, before, owner.actorId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      admin.pool.query(
        `INSERT INTO app.price_observations(workspace_id,id,instrument_version_id,currency_id,price_raw,observed_at,source,actor_id)
      VALUES($1,$2,$3,$4,'-1',$5,'direct-guard',$6)`,
        [owner.workspaceId, randomUUID(), f.instrument.versionId, usd.id, boundary, owner.actorId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('fails explicitly at 501 books and scopes a late-sorting campaign before applying its book limit', async () => {
    const f = await fixture();
    const prefix = 'scope-' + randomUUID();
    const entries = Array.from({ length: 501 }, () => ({
      id: randomUUID(),
      version: randomUUID(),
      book: randomUUID(),
    })).sort((a, b) => a.id.localeCompare(b.id));
    await admin.pool.query(
      `INSERT INTO app.instruments(workspace_id,id,name,family,subtype,economic_identity,actor_id)
      SELECT $1,x.id,$2||x.id,'custom','scope-test',$2||x.id,$3 FROM jsonb_to_recordset($4::jsonb) AS x(id uuid)`,
      [owner.workspaceId, prefix, owner.actorId, JSON.stringify(entries)],
    );
    await admin.pool.query(
      `INSERT INTO app.instrument_versions(workspace_id,id,instrument_id,version,quantity_unit,capability,effective_at,actor_id)
      SELECT $1,x.version,x.id,1,'unit','manual',$2,$3 FROM jsonb_to_recordset($4::jsonb) AS x(id uuid,version uuid)`,
      [owner.workspaceId, effectiveAt, owner.actorId, JSON.stringify(entries)],
    );
    const [{ revision }] = (
      await admin.pool.query('SELECT revision FROM app.financial_state WHERE workspace_id=$1', [
        owner.workspaceId,
      ])
    ).rows;
    const bookRows = entries.map((item) => ({
      ...item,
      state: replayInventory({
        scope: {
          workspaceId: owner.workspaceId,
          accountId: f.account.id,
          instrumentId: item.id,
          instrumentVersionId: item.version,
          unitVersionId: 'unit',
          settlementCurrencyId: null,
        },
        manifest: INVENTORY_CALCULATION_MANIFEST,
        policy: 'fifo',
        capability: {
          subtype: 'scope-test',
          nativeInventory: false,
          shortSupported: false,
          averageCostSupported: false,
        },
        sources: [],
        sourceRevision: String(revision),
      }),
    }));
    const insert = async (rows: typeof bookRows) => {
      const client = await admin.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO app.holding_books(workspace_id,id,account_id,instrument_id,instrument_version_id,inventory_method,source_revision,state,actor_id)
      SELECT $1,x.book,$2,x.id,x.version,'fifo',$3,x.state,$5 FROM jsonb_to_recordset($4::jsonb) AS x(id uuid,version uuid,book uuid,state jsonb)`,
          [owner.workspaceId, f.account.id, revision, JSON.stringify(rows), owner.actorId],
        );
        await client.query(
          `INSERT INTO app.positions(workspace_id,id,holding_book_id,source_revision,state,quantity_raw,basis_raw,actor_id)
      SELECT $1,x.book,x.book,$2,x.state,x.state->'openQuantity'->>'value',x.state->'grossBasis'->>'value',$4
      FROM jsonb_to_recordset($3::jsonb) AS x(book uuid,state jsonb)`,
          [owner.workspaceId, revision, JSON.stringify(rows), owner.actorId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    await insert(bookRows.slice(0, 500));
    expect(await ledger.positions(owner, { accountId: f.account.id })).toHaveLength(500);
    await insert(bookRows.slice(500));
    await expect(ledger.positions(owner, { accountId: f.account.id })).rejects.toMatchObject({
      code: 'INVENTORY_SCOPE_TOO_LARGE',
    });
    await expect(
      ledger.campaignInventory(owner, { accountId: f.account.id }),
    ).rejects.toMatchObject({ code: 'INVENTORY_SCOPE_TOO_LARGE' });
    const trade = await catalog.createTrade(
      owner,
      { title: prefix, classification: 'investing' },
      randomUUID(),
    );
    await catalog.addTradeLeg(
      owner,
      {
        tradeId: trade.id,
        expectedRevision: trade.revision,
        accountId: f.account.id,
        instrumentVersionId: entries[500]!.version,
        direction: 'long',
        label: 'Last sorted book',
      },
      randomUUID(),
    );
    const late = await ledger.campaignInventory(owner, { tradeId: trade.id });
    expect(late.bridges).toHaveLength(1);
    expect(
      await ledger.positions(owner, { accountId: f.account.id, instrumentId: entries[500]!.id }),
    ).toHaveLength(1);
  });

  it('values compatible metadata versions using eligible marks and preserves historical source revisions', async () => {
    const f = await fixture();
    const time = (second: string) => `2025-03-01T00:00:${second}.000001Z`;
    await fund(f.account.id, f.usdBucket.id, usd.id, '100', time('00'));
    const buy = (instrumentVersionId: string, price: string, economicAt: string) =>
      ledger.recordExecution(owner, {
        commandId: randomUUID(),
        accountId: f.account.id,
        instrumentVersionId,
        side: 'buy',
        quantity: '1',
        price,
        cashBucketId: f.usdBucket.id,
        economicAt,
        orderingKey: '1',
        costsComplete: true,
      });
    const mark = (instrumentVersionId: string, price: string, instant: string) =>
      observations.recordPriceObservation(owner, {
        commandId: randomUUID(),
        instrumentVersionId,
        currencyId: usd.id,
        price,
        observedAt: instant,
        source: f.source,
      });
    await buy(f.instrument.versionId, '10', time('01'));
    const firstMark = await mark(f.instrument.versionId, '10', time('02'));
    const version = (expectedRevision: number, effective: string, priceIncrement: string) => ({
      expectedRevision,
      quantityUnit: 'share',
      quoteCurrencyId: usd.id,
      settlementCurrencyId: usd.id,
      multiplier: '1',
      quantityIncrement: '0.001',
      priceIncrement,
      capability: 'native-linear' as const,
      effectiveAt: effective,
      reason: 'Reviewed prospective tick-size change',
      metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
    });
    const second = await catalog.appendInstrumentVersion(
      owner,
      f.instrument.id,
      version(f.instrument.revision, time('03'), '0.000001'),
      randomUUID(),
    );
    await buy(second.versionId, '20', time('04'));
    const secondMark = await mark(second.versionId, '25', time('05'));
    const currentQuery = {
      ...query([f.account.id], f.source, time('07')),
      reportingCurrencyId: usd.id,
    };
    const current = await observations.valuation(owner, currentQuery);
    expect(current.nav).toMatchObject({ state: 'available', value: { amount: '120' } });
    expect(current.positions[0]?.valuation.markedValue).toMatchObject({ value: '50' });
    expect(current.priceDependencies).toEqual([
      expect.objectContaining({ id: secondMark.id, instrumentVersionId: second.versionId }),
    ]);
    const position = (await ledger.positions(owner, { accountId: f.account.id }))[0]!;
    expect(position.instrumentVersionId).toBe(position.inventory.scope.instrumentVersionId);

    // Publishing a compatible convention does not require a fabricated new fill
    // before a quote under that convention can value the existing holding.
    const third = await catalog.appendInstrumentVersion(
      owner,
      f.instrument.id,
      version(second.revision, time('05').replace('000001', '500001'), '0.0000001'),
      randomUUID(),
    );
    const thirdMark = await mark(third.versionId, '30', time('06'));
    await mark(third.versionId, '999', time('08'));
    const unrelated = await fixture();
    await mark(unrelated.instrument.versionId, '9999', time('06'));
    const noNewFill = await observations.valuation(owner, currentQuery);
    expect(noNewFill.nav).toMatchObject({ state: 'available', value: { amount: '130' } });
    expect(noNewFill.priceDependencies[0]).toMatchObject({
      id: thirdMark.id,
      instrumentVersionId: third.versionId,
    });
    const historical = await observations.valuation(owner, {
      ...currentQuery,
      asOf: time('02'),
    });
    expect(historical.nav).toMatchObject({ state: 'available', value: { amount: '100' } });
    expect(historical.priceDependencies[0]?.id).toBe(firstMark.id);

    // A later convention may declare different borrowing economics. It is not
    // interchangeable merely because it belongs to the same instrument.
    const changed = await catalog.appendInstrumentVersion(
      owner,
      f.instrument.id,
      {
        ...version(third.revision, time('06').replace('000001', '500001'), '0.00000001'),
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'delivered',
          shortConvention: 'borrowed-delivery',
          carryCostPolicy: 'explicit-source-charges',
        },
      },
      randomUUID(),
    );
    await mark(changed.versionId, '999', time('06').replace('000001', '750001'));
    expect((await observations.valuation(owner, currentQuery)).priceDependencies[0]?.id).toBe(
      thirdMark.id,
    );

    const reports = createAccountingReports(services);
    const reportQuery = {
      accountIds: [f.account.id],
      reportingCurrencyId: usd.id,
      from: time('00'),
      to: time('07'),
      fxPolicy: {
        ...currentQuery.fxPolicy,
        sourcePriority: [...currentQuery.fxPolicy.sourcePriority],
      },
      priceMaxAgeMilliseconds: currentQuery.priceMaxAgeMilliseconds,
      priceSourcePriority: [...currentQuery.priceSourcePriority],
    };
    const report = await reports.report(owner, reportQuery);
    expect(report.closing.equity).toMatchObject({ state: 'available', value: '130' });
    expect(report.dependencies.prices).toContainEqual(
      expect.objectContaining({ observationId: thirdMark.id }),
    );
    const pinned = await reports.report(owner, {
      ...reportQuery,
      sourceRevision: firstMark.sourceRevision,
    });
    expect(pinned.closing.equity).toMatchObject({ state: 'available', value: '100' });
    expect(pinned.dependencies.prices).toContainEqual(
      expect.objectContaining({ observationId: firstMark.id }),
    );
    expect(pinned.dependencies.prices.some((row) => row.observationId === thirdMark.id)).toBe(
      false,
    );

    const corrected = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: third.versionId,
      currencyId: usd.id,
      price: '31',
      observedAt: time('06'),
      source: f.source,
      supersedesId: thirdMark.id,
      reason: 'Correct the statement quote without rewriting its prior revision',
    });
    expect((await reports.report(owner, reportQuery)).closing.equity).toMatchObject({
      state: 'available',
      value: '132',
    });
    const beforeCorrection = await reports.report(owner, {
      ...reportQuery,
      sourceRevision: thirdMark.sourceRevision,
    });
    expect(beforeCorrection.closing.equity).toMatchObject({ state: 'available', value: '130' });
    expect(
      beforeCorrection.dependencies.prices.some((row) => row.observationId === corrected.id),
    ).toBe(false);
  });

  it('reproduces F-05 with actual exchange amounts, fractional fills, original fee rates and historical/current NAV', async () => {
    const f = await fixture();
    const time = (second: string) => `2025-03-01T00:00:${second}.000001Z`;
    const entryFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt: time('01'),
      source: f.source,
    });
    await fund(f.account.id, f.eurBucket.id, eur.id, '10000', time('00'));
    await ledger.recordFxConversion(owner, {
      commandId: randomUUID(),
      sourceBucketId: f.eurBucket.id,
      destinationBucketId: f.usdBucket.id,
      sourceAmount: '1000',
      destinationAmount: '1250',
      rate: '1.25',
      economicAt: time('02'),
      orderingKey: '2',
      fees: [{ cashBucketId: f.eurBucket.id, currencyId: eur.id, amount: '2', kind: 'conversion' }],
    });
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'buy',
      quantity: '10.5',
      price: '100',
      cashBucketId: f.usdBucket.id,
      economicAt: time('03'),
      orderingKey: '3',
      costsComplete: true,
      basisReportingFx: { observationId: entryFx.id, rate: '0.8' },
      fees: [
        {
          cashBucketId: f.usdBucket.id,
          currencyId: usd.id,
          amount: '2.10',
          kind: 'commission',
          reportingFx: { observationId: entryFx.id, rate: '0.8' },
        },
      ],
    });
    const exitFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.75',
      observedAt: time('04'),
      source: f.source,
    });
    await ledger.recordFxConversion(owner, {
      commandId: randomUUID(),
      sourceBucketId: f.eurBucket.id,
      destinationBucketId: f.usdBucket.id,
      sourceAmount: '500',
      destinationAmount: '650',
      rate: '1.3',
      economicAt: time('05'),
      orderingKey: '4',
      fees: [{ cashBucketId: f.eurBucket.id, currencyId: eur.id, amount: '1', kind: 'conversion' }],
    });
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'sell',
      quantity: '4.5',
      price: '120',
      cashBucketId: f.usdBucket.id,
      economicAt: time('06'),
      orderingKey: '5',
      costsComplete: true,
      basisReportingFx: { observationId: exitFx.id, rate: '0.75' },
      fees: [
        {
          cashBucketId: f.usdBucket.id,
          currencyId: usd.id,
          amount: '1.08',
          kind: 'commission',
          reportingFx: { observationId: exitFx.id, rate: '0.75' },
        },
      ],
    });
    const endFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.7',
      observedAt: time('07'),
      source: f.source,
    });
    const price = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '130',
      observedAt: time('07'),
      source: f.source,
    });
    const historicalQuery = query([f.account.id], f.source, time('08'));
    const historical = financialValuationResponseSchema.parse(
      await observations.valuation(owner, historicalQuery),
    );
    expect(historical.sourceRevision).toBe(price.sourceRevision);
    expect(historical.nav.state).toBe('available');
    if (historical.nav.state !== 'available') throw new Error('Expected complete F-05 NAV');
    expect(historical.nav.value.amount).toBe('10013.774');
    const position = historical.positions[0]!;
    expect(position.inventory.openQuantity.value).toBe('6');
    expect(position.inventory.grossBasis.value).toBe('600');
    expect(position.inventory.averageEntryPrice.value).toBe('100');
    expect(position.inventory.realizedGross.value).toBe('90');
    expect(position.inventory.realizedNet.value).toBe('88.02');
    expect(position.valuation!.unrealizedGross.value).toBe('180');
    expect(position.valuation!.unrealizedNet.value).toBe('178.8');
    expect(position.valuation!.realizedReportingTradingGross.value).toBe('67.5');
    expect(position.valuation!.realizedReportingTradingNet.value).toBe('65.97');
    expect(position.valuation!.realizedHoldingFx.value).toBe('-22.5');
    expect(position.valuation!.unrealizedReportingTradingNet.value).toBe('125.04');
    expect(position.valuation!.unrealizedHoldingFx.value).toBe('-60');
    expect(position.inventory.originalCosts).toHaveLength(2);
    expect(position.inventory.originalCosts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currencyId: usd.id,
          amount: '2.1',
          reportingFx: expect.objectContaining({ observationId: entryFx.id, rate: '0.8' }),
        }),
        expect.objectContaining({
          currencyId: usd.id,
          amount: '1.08',
          reportingFx: expect.objectContaining({ observationId: exitFx.id, rate: '0.75' }),
        }),
      ]),
    );
    expect(historical.priceDependencies[0]).toMatchObject({
      id: price.id,
      observed_at: time('07'),
    });
    expect(
      historical.fxDependencies.find((dependency) => dependency.componentId === position.id)
        ?.selection,
    ).toMatchObject({
      state: 'available',
      value: { observationIds: [endFx.id], rate: '0.7', route: 'direct' },
    });
    const balances = await ledger.cashBalances(owner, { accountIds: [f.account.id] });
    expect(balances.find((balance) => balance.currencyId === eur.id)?.amount).toBe('8497');
    expect(balances.find((balance) => balance.currencyId === usd.id)?.amount).toBe('1386.82');
    const currentFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.9',
      observedAt: time('09'),
      source: f.source,
    });
    const current = await observations.valuation(
      owner,
      query([f.account.id], f.source, time('10')),
    );
    expect(current.sourceRevision).toBe(currentFx.sourceRevision);
    expect(current.nav.state).toBe('available');
    if (current.nav.state !== 'available') throw new Error('Expected current NAV');
    expect(current.nav.value.amount).toBe('10447.138');
    expect(current.positions[0]!.valuation.realizedReportingTradingNet.value).toBe('65.97');
    expect(current.positions[0]!.inventory.originalCosts).toEqual(position.inventory.originalCosts);
    const historicalAgain = await observations.valuation(owner, historicalQuery);
    if (historicalAgain.nav.state !== 'available') throw new Error('Expected historical NAV');
    expect(historicalAgain.nav.value.amount).toBe('10013.774');
    expect(historicalAgain.positions[0]!.valuation.unrealizedReportingTradingNet.value).toBe(
      '125.04',
    );
  });

  it('values evidenced opening holdings with unknown basis while lifetime P&L remains unavailable', async () => {
    const f = await fixture();
    await fund(f.account.id, f.eurBucket.id, eur.id, '50');
    await ledger.recordOpeningLot(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      direction: 'long',
      quantity: '5',
      reason: 'Evidenced custody transfer with missing acquisition statement',
      economicAt: observedAt,
      orderingKey: '2',
      costsComplete: true,
    });
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '10',
      observedAt,
      source: f.source,
    });
    const result = await observations.valuation(owner, query([f.account.id], f.source));
    expect(result.nav.state).toBe('available');
    if (result.nav.state !== 'available') throw new Error('Expected evidenced NAV');
    expect(result.nav.value.amount).toBe('90');
    expect(result.positions[0]!.inventory.openQuantity.value).toBe('5');
    expect(result.positions[0]!.inventory.grossBasis).toMatchObject({
      status: 'unavailable',
      reasons: ['unknown_basis'],
    });
    expect(result.positions[0]!.valuation.unrealizedGross.status).toBe('unavailable');
  });

  it('reports a known subtotal when a third currency lacks FX and rejects live/paper consolidation', async () => {
    const f = await fixture();
    const paper = await fixture('paper');
    await fund(f.account.id, f.eurBucket.id, eur.id, '50');
    const gbpBucket = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      currencyId: gbp.id,
      kind: 'settled',
    });
    await fund(f.account.id, gbpBucket.id, gbp.id, '10');
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    const result = await observations.valuation(owner, query([f.account.id], f.source));
    expect(result.nav.state).toBe('partial');
    if (result.nav.state !== 'partial') throw new Error('Expected missing-GBP partial NAV');
    expect(result.nav.availableSubtotal.amount).toBe('50');
    expect(result.nav.reasons).toContain('missing_fx');
    expect(result.nav.missingReferences).toContain(gbpBucket.id);
    await expect(
      observations.valuation(owner, query([f.account.id, paper.account.id], f.source)),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      observations.valuation(owner, query([f.account.id, f.account.id], f.source)),
    ).rejects.toThrow();
  });

  it('selects eligible inverse FX with pinned provenance and never consumes future observations', async () => {
    const f = await fixture();
    await fund(f.account.id, f.usdBucket.id, usd.id, '100');
    const inverse = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: eur.id,
      quoteCurrencyId: usd.id,
      rate: '2',
      observedAt,
      source: f.source,
    });
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '9',
      observedAt: '2025-03-02T00:00:00.000001Z',
      source: f.source,
    });
    const result = await observations.valuation(owner, query([f.account.id], f.source));
    expect(result.nav.state).toBe('available');
    if (result.nav.state !== 'available') throw new Error('Expected inverse NAV');
    expect(result.nav.value.amount).toBe('50');
    expect(
      result.fxDependencies.find((dependency) => dependency.componentId === f.usdBucket.id)
        ?.selection,
    ).toMatchObject({
      state: 'available',
      value: { route: 'inverse', rate: '0.5', observationIds: [inverse.id], requestedAt: asOf },
    });
    const stale = await observations.valuation(owner, {
      ...query([f.account.id], f.source),
      fxPolicy: { id: 'strict-age-v1', maxAgeMilliseconds: 1, sourcePriority: [f.source] },
    });
    expect(stale.nav.state).toBe('partial');
    if (stale.nav.state !== 'partial') throw new Error('Expected stale partial NAV');
    expect(stale.nav.reasons).toContain('stale_fx');
  });

  it('retains source microseconds/offsets, actor and revision while corrections remain immutable and idempotent', async () => {
    const f = await fixture();
    const commandId = randomUUID();
    const input = {
      commandId,
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.800000000000000000000000000000000001',
      observedAt: '2025-03-01T01:00:00.000009+01:00',
      source: f.source,
    };
    const original = await observations.recordFxObservation(owner, input);
    expect(await observations.recordFxObservation(owner, input)).toEqual(original);
    await expect(
      observations.recordFxObservation(owner, { ...input, rate: '0.9' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const corrected = await observations.recordFxObservation(owner, {
      ...input,
      commandId: randomUUID(),
      rate: '0.81',
      supersedesId: original.id,
      reason: 'Correct source transcription',
    });
    await expect(
      observations.recordFxObservation(owner, {
        ...input,
        commandId: randomUUID(),
        rate: '0.82',
        supersedesId: original.id,
        reason: 'Competing correction',
      }),
    ).rejects.toMatchObject({ code: 'OBSERVATION_ALREADY_SUPERSEDED' });
    await expect(
      observations.recordFxObservation(owner, {
        ...input,
        commandId: randomUUID(),
        supersedesId: corrected.id,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      observations.recordFxObservation(owner, {
        ...input,
        commandId: randomUUID(),
        baseCurrencyId: eur.id,
        quoteCurrencyId: usd.id,
        supersedesId: corrected.id,
        reason: 'Wrong direction',
      }),
    ).rejects.toMatchObject({ status: 422 });
    const persisted = await admin.pool.query(
      'SELECT actor_id,origin,rate_raw,payload,to_char(observed_at AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS observed_at FROM app.fx_observations WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, original.id],
    );
    expect(persisted.rows[0]).toMatchObject({
      actor_id: owner.actorId,
      origin: 'manual',
      rate_raw: input.rate,
      observed_at: '2025-03-01T00:00:00.000009Z',
      payload: {
        observedAt: input.observedAt,
        sourceRevision: original.sourceRevision,
        sourceInput: input,
      },
    });
    const state = await admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [owner.workspaceId],
    );
    expect(String(state.rows[0].revision)).toBe(corrected.sourceRevision);
  });

  it('allows an available zero mark and identifies unsupported manual holdings explicitly', async () => {
    const f = await fixture();
    await ledger.recordOpeningLot(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      direction: 'long',
      quantity: '2',
      entryPrice: '10',
      bookedPrincipal: '20',
      reason: 'Evidenced opening holding',
      economicAt: observedAt,
      orderingKey: '1',
      costsComplete: true,
    });
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    const price = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '0.0000',
      observedAt,
      source: f.source,
    });
    const result = await observations.valuation(owner, query([f.account.id], f.source));
    expect(result.nav.state).toBe('available');
    if (result.nav.state !== 'available') throw new Error('Expected zero NAV');
    expect(result.nav.value.amount).toBe('0');
    expect(result.positions[0]!.valuation.markedValue).toMatchObject({
      status: 'available',
      value: '0',
    });
    expect(result.priceDependencies[0]?.id).toBe(price.id);
    const zeroSource = await admin.pool.query(
      'SELECT price_raw,payload FROM app.price_observations WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, price.id],
    );
    expect(zeroSource.rows[0]).toMatchObject({
      price_raw: '0',
      payload: { sourceInput: { price: '0.0000' } },
    });
    const manual = await fixture('live', true);
    await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: manual.account.id,
      instrumentVersionId: manual.instrument.versionId,
      side: 'buy',
      quantity: '1',
      price: '3',
      economicAt: observedAt,
      orderingKey: '1',
      costsComplete: true,
    });
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: manual.source,
    });
    const unsupported = await observations.valuation(
      owner,
      query([manual.account.id], manual.source),
    );
    expect(unsupported.nav.state).toBe('partial');
    if (unsupported.nav.state !== 'partial') throw new Error('Expected unsupported coverage');
    expect(unsupported.nav.reasons).toContain('unsupported');
    expect(unsupported.nav.reasons).not.toContain('missing_mark');
  });

  it('allows viewers to read coherent valuations while blocking observation writes and cross-workspace references', async () => {
    const f = await fixture();
    await fund(f.account.id, f.eurBucket.id, eur.id, '25');
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    const result = await observations.valuation(viewer, query([f.account.id], f.source));
    expect(result.sourceRevision).not.toBe('0');
    expect(result.nav.state).toBe('available');
    if (result.nav.state !== 'available') throw new Error('Expected viewer NAV');
    expect(result.nav.value.amount).toBe('25');
    await expect(
      observations.recordFxObservation(viewer, {
        commandId: randomUUID(),
        baseCurrencyId: usd.id,
        quoteCurrencyId: eur.id,
        rate: '0.8',
        observedAt,
        source: f.source,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      observations.valuation(other, query([f.account.id], f.source)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      observations.valuation(owner, {
        ...query([f.account.id], f.source),
        fxPolicy: { id: 'invalid-policy', maxAgeMilliseconds: -1, sourcePriority: [f.source] },
      }),
    ).rejects.toThrow();
  });

  it('records manual holdings with unknown monetary conventions without inventing prices or NAV currencies', async () => {
    const f = await fixture();
    const instrument = await catalog.createInstrument(
      owner,
      {
        name: 'Undocumented custom claim',
        family: 'custom',
        subtype: 'manual-claim',
        economicIdentity: `unknown-conventions:${randomUUID()}`,
        quantityUnit: 'claim',
        quoteCurrencyId: null,
        settlementCurrencyId: null,
        multiplier: null,
        quantityIncrement: null,
        priceIncrement: null,
        capability: 'manual',
        effectiveAt,
        metadata: { unresolvedConvention: 'Custodian has not supplied monetary unit conventions' },
      },
      randomUUID(),
    );
    await fund(f.account.id, f.eurBucket.id, eur.id, '50');
    const execution = await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy',
      quantity: '2',
      price: '3',
      economicAt: observedAt,
      orderingKey: '2',
      costsComplete: true,
    });
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    await expect(
      observations.recordPriceObservation(owner, {
        commandId: randomUUID(),
        instrumentVersionId: instrument.versionId,
        currencyId: usd.id,
        price: '100',
        observedAt,
        source: f.source,
      }),
    ).rejects.toMatchObject({
      status: 422,
      detail: 'A price observation requires a published quote currency convention.',
    });
    const result = financialValuationResponseSchema.parse(
      await observations.valuation(viewer, query([f.account.id], f.source)),
    );
    expect(result.nav).toMatchObject({
      state: 'partial',
      availableSubtotal: { currencyId: eur.id, amount: '50' },
      reasons: ['unsupported', 'incompatible_currency'],
    });
    expect(result.positions[0]?.inventory.scope.settlementCurrencyId).toBeNull();
    expect(result.positions[0]?.valuation?.markedValue).toMatchObject({
      status: 'unsupported',
      value: null,
    });
    expect(result.positions[0]?.valuation?.markedValue.currencyId).toBeUndefined();
    expect(result.priceDependencies).toEqual([]);
    const persisted = await admin.pool.query(
      'SELECT principal_raw,principal_currency_id,payload FROM app.executions WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, execution.id],
    );
    expect(persisted.rows[0]).toMatchObject({
      principal_raw: null,
      principal_currency_id: null,
      payload: { quantity: '2', price: '3' },
    });
  });

  it('uses only current correction leaves and excludes future replacements in an as-of view at the current revision', async () => {
    const f = await fixture();
    await fund(f.account.id, f.usdBucket.id, usd.id, '100');
    await ledger.recordOpeningLot(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      direction: 'long',
      quantity: '1',
      reason: 'Observed holding',
      economicAt: observedAt,
      orderingKey: '2',
      costsComplete: true,
    });
    const originalFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    const originalPrice = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '10',
      observedAt,
      source: f.source,
    });
    const before = await observations.valuation(owner, query([f.account.id], f.source));
    if (before.nav.state !== 'available') throw new Error('Expected initial correction NAV');
    expect(before.nav.value.amount).toBe('88');
    const future = '2025-03-01T00:02:00.000001Z';
    const replacementPrice = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '20',
      observedAt: future,
      source: f.source,
      supersedesId: originalPrice.id,
      reason: 'Source timestamp and mark corrected',
    });
    const replacementFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.9',
      observedAt,
      source: f.source,
      supersedesId: originalFx.id,
      reason: 'Source exchange rate corrected',
    });
    const historical = await observations.valuation(owner, query([f.account.id], f.source));
    expect(historical.sourceRevision).toBe(replacementFx.sourceRevision);
    expect(historical.nav).toMatchObject({
      state: 'partial',
      availableSubtotal: { currencyId: eur.id, amount: '90' },
      reasons: ['missing_mark'],
    });
    expect(historical.priceDependencies).toEqual([]);
    expect(
      historical.fxDependencies.find((dependency) => dependency.componentId === f.usdBucket.id)
        ?.selection,
    ).toMatchObject({ state: 'available', value: { observationIds: [replacementFx.id] } });
    const current = await observations.valuation(owner, query([f.account.id], f.source, future));
    if (current.nav.state !== 'available') throw new Error('Expected corrected current NAV');
    expect(current.nav.value.amount).toBe('108');
    expect(current.priceDependencies[0]?.id).toBe(replacementPrice.id);
    await expect(
      observations.recordPriceObservation(owner, {
        commandId: randomUUID(),
        instrumentVersionId: f.instrument.versionId,
        currencyId: usd.id,
        price: '11',
        observedAt,
        source: f.source,
        supersedesId: originalPrice.id,
        reason: 'Competing corrected mark',
      }),
    ).rejects.toMatchObject({ code: 'OBSERVATION_ALREADY_SUPERSEDED' });
  });

  it('applies explicit source priority before recency and falls back only when preferred sources are stale', async () => {
    const f = await fixture();
    await fund(f.account.id, f.usdBucket.id, usd.id, '100');
    await ledger.recordOpeningLot(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      direction: 'long',
      quantity: '1',
      reason: 'Observed holding',
      economicAt: observedAt,
      orderingKey: '2',
      costsComplete: true,
    });
    const primary = `${f.source}:primary`;
    const fallback = `${f.source}:fallback`;
    const primaryFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: primary,
    });
    const primaryPrice = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '10',
      observedAt,
      source: primary,
    });
    const fallbackAt = '2025-03-01T00:00:30.000001Z';
    const fallbackFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.9',
      observedAt: fallbackAt,
      source: fallback,
    });
    const fallbackPrice = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '20',
      observedAt: fallbackAt,
      source: fallback,
    });
    const input = {
      ...query([f.account.id], primary),
      fxPolicy: {
        id: 'explicit-source-priority-v1',
        maxAgeMilliseconds: 86_400_000,
        sourcePriority: [primary, fallback],
      },
      priceSourcePriority: [primary, fallback],
    };
    const preferred = await observations.valuation(owner, input);
    if (preferred.nav.state !== 'available') throw new Error('Expected preferred-source NAV');
    expect(preferred.nav.value.amount).toBe('88');
    expect(preferred.priceDependencies[0]?.id).toBe(primaryPrice.id);
    expect(
      preferred.fxDependencies.find((dependency) => dependency.componentId === f.usdBucket.id)
        ?.selection,
    ).toMatchObject({ state: 'available', value: { observationIds: [primaryFx.id] } });
    const recent = await observations.valuation(owner, {
      ...input,
      fxPolicy: { ...input.fxPolicy, maxAgeMilliseconds: 30_000 },
      priceMaxAgeMilliseconds: 30_000,
    });
    if (recent.nav.state !== 'available') throw new Error('Expected fresh fallback-source NAV');
    expect(recent.nav.value.amount).toBe('108');
    expect(recent.priceDependencies[0]?.id).toBe(fallbackPrice.id);
    expect(
      recent.fxDependencies.find((dependency) => dependency.componentId === f.usdBucket.id)
        ?.selection,
    ).toMatchObject({ state: 'available', value: { observationIds: [fallbackFx.id] } });
  });

  it('preserves microsecond FX/mark selection and replays historical inventory before a future partial fill', async () => {
    const f = await fixture();
    const first = '2025-03-01T00:00:00.000001Z';
    const second = '2025-03-01T00:00:00.000002Z';
    const third = '2025-03-01T00:00:00.000003Z';
    await fund(f.account.id, f.usdBucket.id, usd.id, '100', first);
    await ledger.recordOpeningLot(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      direction: 'long',
      quantity: '1',
      entryPrice: '5',
      bookedPrincipal: '5',
      reason: 'Known historical holding',
      economicAt: first,
      orderingKey: '2',
      costsComplete: true,
    });
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.5',
      observedAt: first,
      source: f.source,
    });
    const selectedFx = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.6',
      observedAt: '2025-03-01T01:00:00.000002+01:00',
      source: f.source,
    });
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.7',
      observedAt: third,
      source: f.source,
    });
    await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '10',
      observedAt: first,
      source: f.source,
    });
    const selectedMark = await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '20',
      observedAt: second,
      source: f.source,
    });
    await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: f.instrument.versionId,
      currencyId: usd.id,
      price: '30',
      observedAt: third,
      source: f.source,
    });
    const fill = await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: f.account.id,
      instrumentVersionId: f.instrument.versionId,
      side: 'sell',
      quantity: '0.5',
      price: '30',
      cashBucketId: f.usdBucket.id,
      economicAt: third,
      orderingKey: '3',
      costsComplete: true,
    });
    const historical = await observations.valuation(owner, query([f.account.id], f.source, second));
    expect(historical.sourceRevision).toBe(fill.sourceRevision);
    expect(historical.positions[0]!.inventory.openQuantity.value).toBe('1');
    expect(historical.priceDependencies[0]).toMatchObject({
      id: selectedMark.id,
      observed_at: second,
    });
    expect(
      historical.fxDependencies.find((dependency) => dependency.componentId === f.usdBucket.id)
        ?.selection,
    ).toMatchObject({
      state: 'available',
      value: { observationIds: [selectedFx.id], rate: '0.6' },
    });
    if (historical.nav.state !== 'available')
      throw new Error('Expected microsecond historical NAV');
    expect(historical.nav.value.amount).toBe('72');
    const current = await observations.valuation(owner, query([f.account.id], f.source, third));
    expect(current.positions[0]!.inventory.openQuantity.value).toBe('0.5');
    if (current.nav.state !== 'available') throw new Error('Expected current partial-fill NAV');
    expect(current.nav.value.amount).toBe('91');
    const stale = await observations.valuation(owner, {
      ...query([f.account.id], f.source, asOf),
      priceMaxAgeMilliseconds: 0,
    });
    expect(stale.nav.state).toBe('partial');
    if (stale.nav.state !== 'partial') throw new Error('Expected stale-mark coverage');
    expect(stale.nav.reasons).toContain('stale_mark');
  });

  it('pins one read-only repeatable-read snapshot while an independent financial write commits', async () => {
    const f = await fixture();
    await fund(f.account.id, f.eurBucket.id, eur.id, '100');
    const last = await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    const coherent = createFinancialObservations({
      withWorkspaceContext: (context, callback, options) =>
        services.withWorkspaceContext(
          context,
          async (tx) => {
            expect(options).toEqual({ isolationLevel: 'repeatable read', accessMode: 'read only' });
            await tx.execute(
              sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
            );
            await fund(f.account.id, f.eurBucket.id, eur.id, '50');
            return callback(tx);
          },
          options,
        ),
    });
    const before = await coherent.valuation(viewer, query([f.account.id], f.source));
    expect(before.sourceRevision).toBe(last.sourceRevision);
    if (before.nav.state !== 'available') throw new Error('Expected coherent old NAV');
    expect(before.nav.value.amount).toBe('100');
    const after = await observations.valuation(viewer, query([f.account.id], f.source));
    expect(after.sourceRevision).not.toBe(before.sourceRevision);
    if (after.nav.state !== 'available') throw new Error('Expected coherent new NAV');
    expect(after.nav.value.amount).toBe('150');
  });

  it('keeps signed broker/manual valuation observations separate from internal NAV and immutable correction chains', async () => {
    const f = await fixture();
    await fund(f.account.id, f.eurBucket.id, eur.id, '50');
    await observations.recordFxObservation(owner, {
      commandId: randomUUID(),
      baseCurrencyId: usd.id,
      quoteCurrencyId: eur.id,
      rate: '0.8',
      observedAt,
      source: f.source,
    });
    const input = {
      commandId: randomUUID(),
      accountId: f.account.id,
      currencyId: eur.id,
      amount: '-20.000000000000000000000000000000000001',
      observedAt: '2025-03-01T01:00:00.000009+01:00',
      definition: 'broker-net-liquidation-value-including-fees',
      source: f.source,
    };
    const original = await observations.recordAccountValuationObservation(owner, input);
    expect(await observations.recordAccountValuationObservation(owner, input)).toEqual(original);
    const corrected = await observations.recordAccountValuationObservation(owner, {
      ...input,
      commandId: randomUUID(),
      amount: '-19.5',
      supersedesId: original.id,
      reason: 'Correct supplied broker observation',
    });
    const current = await observations.accountValuationObservations(viewer, {
      accountId: f.account.id,
    });
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({
      id: corrected.id,
      accountId: f.account.id,
      amount: '-19.5',
      observedAt: '2025-03-01T00:00:00.000009Z',
      definition: input.definition,
      source: f.source,
      actorId: owner.actorId,
      origin: 'manual',
      supersedesId: original.id,
      payload: { observedAt: input.observedAt, sourceRevision: corrected.sourceRevision },
    });
    expect(
      await observations.accountValuationObservations(viewer, {
        accountId: f.account.id,
        includeSuperseded: true,
      }),
    ).toHaveLength(2);
    expect(
      await observations.accountValuationObservations(viewer, {
        accountId: f.account.id,
        asOf: observedAt,
      }),
    ).toEqual([]);
    await expect(
      observations.recordAccountValuationObservation(owner, {
        ...input,
        commandId: randomUUID(),
        supersedesId: original.id,
        reason: 'Competing correction',
      }),
    ).rejects.toMatchObject({ code: 'OBSERVATION_ALREADY_SUPERSEDED' });
    await expect(
      observations.recordAccountValuationObservation(viewer, { ...input, commandId: randomUUID() }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      observations.accountValuationObservations(other, { accountId: f.account.id }),
    ).rejects.toMatchObject({ status: 404 });
    const internal = await observations.valuation(owner, query([f.account.id], f.source));
    if (internal.nav.state !== 'available') throw new Error('Expected internal NAV');
    expect(internal.nav.value.amount).toBe('50');
  });
});
