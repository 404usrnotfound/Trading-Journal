import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccountingFixture, accountingTestOrigin } from './accounting-fixture.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { createAccountingReports } from '../../packages/server/src/accounting/report.js';
import { createReconciliationServices } from '../../packages/server/src/reconciliation/service.js';
import { createReconciliationApi } from '../../packages/server/src/reconciliation/api.js';
import { createStatementRequestSchema, type StatementDocument } from '@journal/contracts';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
const at = (day: number) => `2030-04-${String(day).padStart(2, '0')}T12:00:00.000001Z`;
const valuationPolicy = {
  fxPolicy: {
    id: 'reconciliation-test/1',
    maxAgeMilliseconds: 86400000,
    sourcePriority: ['manual'],
  },
  pricePolicy: { maxAgeMilliseconds: 86400000, sourcePriority: ['manual'] },
};

describe('independent statement reconciliation with immutable PostgreSQL evidence', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let services: ReturnType<typeof createReconciliationServices>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let usd: string, eur: string, versionId: string;
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    services = createReconciliationServices(fixture.services);
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    observations = createFinancialObservations(fixture.services);
    for (const code of ['USD', 'EUR']) {
      const currency = await catalog.createCurrency(
        fixture.owner.context,
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
      );
      if (code === 'USD') usd = currency.id;
      else eur = currency.id;
    }
    versionId = (
      await catalog.createInstrument(
        fixture.owner.context,
        {
          name: 'Reconciliation share',
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: `reconciliation:${randomUUID()}`,
          quantityUnit: 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
          multiplier: '1',
          quantityIncrement: '0.001',
          priceIncrement: '0.01',
          capability: 'native-linear',
          effectiveAt,
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        },
        randomUUID(),
      )
    ).versionId;
  });
  afterAll(async () => {
    if (!fixture) return;
    // Only these new fixture workspaces are removed; immutable application evidence is never edited.
    const workspaceIds = [fixture.owner, fixture.viewer, fixture.editor, fixture.outsider].map(
      (actor) => actor.person.workspace.id,
    );
    const client = await fixture.admin.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role=replica');
      await client.query(
        'DELETE FROM app.statement_reconciliations WHERE workspace_id=ANY($1::uuid[])',
        [workspaceIds],
      );
      await client.query('DELETE FROM app.source_statements WHERE workspace_id=ANY($1::uuid[])', [
        workspaceIds,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await fixture.cleanup();
  });
  async function scope() {
    const account = await catalog.createAccount(
      fixture.owner.context,
      {
        name: `Statement account ${randomUUID()}`,
        environment: 'live',
        accountType: 'cash',
        baseCurrencyId: usd,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: usd,
      kind: 'settled',
    });
    await ledger.recordCashMovement(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.id,
      cashBucketId: bucket.id,
      currencyId: usd,
      kind: 'deposit',
      amount: '1000',
      economicAt: at(1),
      orderingKey: '1',
    });
    return { accountId: account.id, bucketId: bucket.id };
  }
  const document = (accountId: string, overrides: Partial<StatementDocument> = {}) =>
    createStatementRequestSchema.parse({
      accountId,
      asOf: at(4),
      sourceName: 'Independent broker statement',
      sourceReference: `statement:${randomUUID()}`,
      cashDefinition: 'all-owned-cash/1',
      holdingsDefinition: 'netted-account-inventory/1',
      completeCash: true,
      completeHoldings: true,
      cash: [{ currencyId: usd, amount: '1000', tolerance: '0' }],
      holdings: [],
      ...overrides,
    });

  it('detects independent cash, quantity and equity disagreements despite a balanced internal bridge', async () => {
    const account = await scope();
    await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.accountId,
      instrumentVersionId: versionId,
      side: 'buy',
      quantity: '2',
      price: '10',
      cashBucketId: account.bucketId,
      economicAt: at(2),
      orderingKey: '1',
      costsComplete: true,
    });
    await observations.recordPriceObservation(fixture.owner.context, {
      commandId: randomUUID(),
      instrumentVersionId: versionId,
      currencyId: usd,
      price: '12',
      observedAt: at(4),
      source: 'manual',
    });
    const bridge = await createAccountingReports(fixture.services).report(fixture.owner.context, {
      accountIds: [account.accountId],
      reportingCurrencyId: usd,
      from: at(1),
      to: at(4),
      fxPolicy: valuationPolicy.fxPolicy,
      priceMaxAgeMilliseconds: valuationPolicy.pricePolicy.maxAgeMilliseconds,
      priceSourcePriority: ['manual'],
    });
    expect(bridge.reconciliation.variance.value).toBe('0');
    const statement = await services.create(
      fixture.owner.context,
      document(account.accountId, {
        cash: [{ currencyId: usd, amount: '975', tolerance: '0' }],
        holdings: [{ instrumentVersionId: versionId, quantity: '3', tolerance: '0' }],
        equity: {
          currencyId: usd,
          amount: '1003',
          tolerance: '0',
          definition: 'owned-cash-plus-signed-holdings/1',
        },
      }),
      randomUUID(),
    );
    const result = await services.evaluate(
      fixture.owner.context,
      statement.id,
      {
        valuationPolicy,
        accept: false,
        reviewNote: 'Compare independently supplied statement totals',
      },
      randomUUID(),
    );
    expect(result.status).toBe('variance');
    expect(result.accepted).toBe(false);
    expect(result.stale).toBe(false);
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'cash',
          expected: '975',
          actual: '980',
          variance: '5',
          state: 'variance',
        }),
        expect.objectContaining({
          kind: 'holding',
          expected: '3',
          actual: '2',
          variance: '-1',
          state: 'variance',
        }),
        expect.objectContaining({
          kind: 'equity',
          expected: '1003',
          actual: '1004',
          variance: '1',
          state: 'variance',
        }),
      ]),
    );
    await expect(
      services.evaluate(
        fixture.owner.context,
        statement.id,
        { valuationPolicy, accept: true, reviewNote: 'Attempt to accept unresolved differences' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_NOT_MATCHED' });
  });

  it('retains exact variance at the explicit tolerance boundary and stales accepted evidence after correction', async () => {
    const account = await scope();
    const statement = await services.create(
      fixture.owner.context,
      document(account.accountId, {
        cash: [{ currencyId: usd, amount: '999.99', tolerance: '0.01' }],
      }),
      randomUUID(),
    );
    const commandId = randomUUID();
    const input = { accept: true, reviewNote: 'Reviewed one-cent source rounding tolerance' };
    const result = await services.evaluate(fixture.owner.context, statement.id, input, commandId);
    expect(result).toMatchObject({ status: 'matched', accepted: true, stale: false });
    expect(result.rows.find((row) => row.kind === 'cash')).toMatchObject({
      actual: '1000',
      variance: '0.01',
      tolerance: '0.01',
    });
    expect(
      (await services.evaluate(fixture.owner.context, statement.id, input, commandId)).id,
    ).toBe(result.id);
    const correction = await ledger.recordCashMovement(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.accountId,
      cashBucketId: account.bucketId,
      currencyId: usd,
      kind: 'income',
      amount: '1',
      economicAt: at(3),
      orderingKey: '2',
    });
    const stale = await services.evaluation(fixture.viewer.context, result.id);
    expect(stale).toMatchObject({
      accepted: true,
      stale: true,
      status: 'matched',
      comparedRevision: result.comparedRevision,
    });
    expect(stale.currentRevision).toBe(correction.sourceRevision);
    const current = await services.evaluate(
      fixture.owner.context,
      statement.id,
      { accept: false, reviewNote: 'Reassess revised facts without rewriting original statement' },
      randomUUID(),
    );
    expect(current).toMatchObject({ status: 'variance', stale: false });
    expect(current.rows.find((row) => row.kind === 'cash')?.variance).toBe('1.01');
    expect(
      (await services.get(fixture.viewer.context, statement.id)).document.cash[0]!.amount,
    ).toBe('999.99');
    expect((await services.evaluations(fixture.viewer.context, statement.id)).items).toHaveLength(
      2,
    );
  });

  it('checks all declared currencies and detects omitted holdings without inventing exchange rates', async () => {
    const account = await scope();
    const foreign = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.accountId,
      currencyId: eur,
      kind: 'settled',
    });
    await ledger.recordCashMovement(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.accountId,
      cashBucketId: foreign.id,
      currencyId: eur,
      kind: 'deposit',
      amount: '50',
      economicAt: at(2),
      orderingKey: '1',
    });
    await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.accountId,
      instrumentVersionId: versionId,
      side: 'buy',
      quantity: '1.25',
      price: '10',
      cashBucketId: account.bucketId,
      economicAt: at(2),
      orderingKey: '2',
      costsComplete: true,
    });
    const statement = await services.create(
      fixture.owner.context,
      document(account.accountId, { cash: [{ currencyId: usd, amount: '987.5', tolerance: '0' }] }),
      randomUUID(),
    );
    const result = await services.evaluate(
      fixture.owner.context,
      statement.id,
      {
        accept: false,
        reviewNote: 'Complete statement must include actual foreign cash and holdings',
      },
      randomUUID(),
    );
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'cash',
          referenceId: eur,
          expected: '0',
          actual: '50',
          variance: '50',
        }),
        expect.objectContaining({
          kind: 'holding',
          expected: '0',
          actual: '1.25',
          variance: '1.25',
        }),
      ]),
    );
  });

  it('keeps equity unavailable with missing marks, enforces current access and makes API reads inert', async () => {
    const account = await scope();
    await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: account.accountId,
      instrumentVersionId: versionId,
      side: 'buy',
      quantity: '1',
      price: '10',
      cashBucketId: account.bucketId,
      economicAt: at(2),
      orderingKey: '1',
      costsComplete: true,
    });
    const statement = await services.create(
      fixture.owner.context,
      document(account.accountId, {
        cash: [{ currencyId: usd, amount: '990', tolerance: '0' }],
        holdings: [{ instrumentVersionId: versionId, quantity: '1', tolerance: '0' }],
        equity: {
          currencyId: usd,
          amount: '1000',
          tolerance: '0',
          definition: 'owned-cash-plus-signed-holdings/1',
        },
      }),
      randomUUID(),
    );
    const policy = {
      ...valuationPolicy,
      pricePolicy: { ...valuationPolicy.pricePolicy, sourcePriority: ['absent'] },
    };
    const result = await services.evaluate(
      fixture.owner.context,
      statement.id,
      { valuationPolicy: policy, reviewNote: 'Missing compatible independent mark' },
      randomUUID(),
    );
    expect(result.status).toBe('unavailable');
    await expect(
      services.evaluate(
        fixture.owner.context,
        statement.id,
        {
          valuationPolicy: policy,
          accept: true,
          reviewNote: 'Unavailable equity cannot establish source agreement',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_NOT_MATCHED' });
    await expect(
      fixture.admin.pool.query(
        'UPDATE app.source_statements SET document=document||\'{"notes":"rewrite"}\'::jsonb WHERE workspace_id=$1 AND id=$2',
        [fixture.owner.context.workspaceId, statement.id],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      fixture.admin.pool.query(
        'DELETE FROM app.statement_reconciliations WHERE workspace_id=$1 AND id=$2',
        [fixture.owner.context.workspaceId, result.id],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    expect(result.rows.find((row) => row.kind === 'equity')?.actual).toBeNull();
    await expect(
      services.create(fixture.viewer.context, document(account.accountId), randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(services.get(fixture.outsider.context, statement.id)).rejects.toBeDefined();
    const api = createReconciliationApi(fixture.services);
    const response = await api(
      new Request(
        `${accountingTestOrigin}/api/v1/workspaces/${fixture.owner.context.workspaceId}/reconciliation/statements/${statement.id}`,
        { headers: { cookie: fixture.viewer.cookie } },
      ),
      fixture.owner.context.workspaceId,
      ['statements', statement.id],
    );
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(statement.id);
    const denied = new Request(
      `${accountingTestOrigin}/api/v1/workspaces/${fixture.owner.context.workspaceId}/reconciliation/statements`,
      {
        method: 'POST',
        headers: {
          cookie: fixture.viewer.cookie,
          origin: accountingTestOrigin,
          'x-csrf-token': fixture.viewer.csrf,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify(document(account.accountId)),
      },
    );
    await expect(
      api(denied, fixture.owner.context.workspaceId, ['statements']),
    ).rejects.toBeDefined();
  });
});
