import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createAccountingFixture, accountingTestOrigin as origin } from './accounting-fixture.js';
import {
  createCatalogServices,
  createFinancialLedger,
  createImportServices,
  createImportTemplates,
  createImportApi,
  toProblemResponse,
} from '@journal/server';
import * as c from '@journal/contracts';

describe('persisted imports against the real ledger', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>,
    service: ReturnType<typeof createImportServices>,
    catalog: ReturnType<typeof createCatalogServices>,
    ledger: ReturnType<typeof createFinancialLedger>;
  let currency: string, eur: string, instrument: string, account: string;
  const time = '2030-01-01T12:00:00Z',
    effective = '2025-01-01T00:00:00Z';
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    service = createImportServices(fixture.services);
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    currency = (
      await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso',
          code: 'USD',
          kind: 'fiat',
          unitIdentity: 'iso:USD',
          name: 'US dollar',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: effective,
        },
        randomUUID(),
      )
    ).id;
    eur = (
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
          effectiveAt: effective,
        },
        randomUUID(),
      )
    ).id;
    instrument = (
      await catalog.createInstrument(
        fixture.owner.context,
        {
          name: 'Import shares',
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: 'import-stock',
          quantityUnit: 'share',
          quoteCurrencyId: currency,
          settlementCurrencyId: currency,
          multiplier: '1',
          quantityIncrement: '0.001',
          priceIncrement: '0.01',
          capability: 'native-linear',
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
          effectiveAt: effective,
        },
        randomUUID(),
      )
    ).versionId;
  });
  beforeEach(async () => {
    account = (
      await catalog.createAccount(
        fixture.owner.context,
        {
          name: `Import account ${randomUUID()}`,
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: currency,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt: effective,
        },
        randomUUID(),
      )
    ).id;
  });
  afterAll(async () => fixture?.cleanup());
  const cash = (amount = '100', kind = 'deposit') => ({
    amount,
    kind,
    currencyId: currency,
    economicAt: time,
    orderingKey: '1',
  });
  const map = () =>
    c.importMappingSchema.parse({ adapterId: 'canonical-csv', kind: 'cash_movement', fields: [] });
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  async function stage(
    rows: { id?: string; kind: c.ImportKind; payload: unknown; group?: string; key?: string }[],
    key = randomUUID(),
    extra: Record<string, unknown> = {},
  ) {
    const content =
      'ID,Key,Kind,Group,Payload\r\n' +
      rows
        .map((row, index) =>
          [
            row.id ?? '',
            row.key ?? `${row.kind}:${row.id ?? index}`,
            row.kind,
            row.group ?? row.id ?? `group-${index}`,
            JSON.stringify(row.payload),
          ]
            .map(quote)
            .join(','),
        )
        .join('\r\n');
    return service.stage(
      fixture.owner.context,
      {
        accountId: account,
        namespace: 'documented-broker',
        filename: 'statement.csv',
        content,
        mapping: map(),
        ...extra,
      },
      key,
    );
  }
  async function preview(
    batch: zBatch,
    groups?: string[],
    corrections: Record<string, string> = {},
  ) {
    const detail = await service.detail(fixture.owner.context, batch.id);
    return service.preview(fixture.owner.context, batch.id, {
      expectedRevision: detail.batch.revision,
      groups: groups ?? detail.groups.map((group) => group.key),
      corrections,
    });
  }
  type zBatch = c.ImportPreviewResponse extends never
    ? never
    : ReturnType<typeof c.importBatchResponseSchema.parse>;
  async function commit(batch: zBatch, review: c.ImportPreviewResponse, key = randomUUID()) {
    return service.commit(
      fixture.owner.context,
      batch.id,
      { expectedRevision: review.batchRevision, previewId: review.id, acceptWarnings: true },
      key,
    );
  }
  async function balance(currencyId = currency) {
    const rows = await ledger.cashBalances(fixture.owner.context, { accountIds: [account] });
    return rows.filter((row) => row.currencyId === currencyId).map((row) => row.amount);
  }
  const ctx = () => fixture.owner.context;
  async function counts() {
    return (
      await fixture.admin.pool.query(
        'SELECT (SELECT count(*) FROM app.financial_commands WHERE workspace_id=$1) AS commands,(SELECT count(*) FROM app.ledger_events WHERE workspace_id=$1) AS events,(SELECT count(*) FROM app.import_sources WHERE workspace_id=$1) AS sources',
        [ctx().workspaceId],
      )
    ).rows;
  }
  it('preserves original bytes/rows, creates no money during staging/preview, then commits exact cash', async () => {
    const before = await counts(),
      batch = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]);
    expect(await counts()).toEqual(before);
    expect((await service.source(ctx(), batch.id)).content).toContain('D1');
    const review = await preview(batch);
    expect(review.committable).toBe(true);
    expect(await counts()).toEqual(before);
    expect(await balance()).toEqual([]);
    const result = await commit(batch, review);
    expect(result.state).toBe('committed');
    expect(await balance()).toEqual(['100']);
    const records = await fixture.admin.pool.query(
      'SELECT origin FROM app.cash_movements WHERE workspace_id=$1 AND account_id=$2',
      [ctx().workspaceId, account],
    );
    expect(records.rows).toEqual([{ origin: 'import' }]);
  });
  it('uses scoped stable IDs and exact-once retries, with duplicate-only reimports changing no ledger facts', async () => {
    const batch = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]),
      review = await preview(batch),
      key = randomUUID();
    const result = await commit(batch, review, key),
      before = await counts();
    expect(await commit(batch, review, key)).toEqual(result);
    expect(await counts()).toEqual(before);
    const second = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]),
      again = await preview(second);
    expect(again.rows[0]?.status).toBe('duplicate');
    await commit(second, again);
    expect(await counts()).toEqual(before);
    expect(await balance()).toEqual(['100']);
  });
  it('requires re-preview after unrelated financial changes and rejects altered commit retries', async () => {
    const batch = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]),
      review = await preview(batch);
    await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: account,
      currencyId: eur,
      kind: 'settled',
    });
    await expect(commit(batch, review)).rejects.toMatchObject({ code: 'STALE_IMPORT_PREVIEW' });
    const fresh = await preview(batch),
      key = randomUUID();
    await commit(batch, fresh, key);
    await expect(
      service.commit(
        ctx(),
        batch.id,
        { expectedRevision: fresh.batchRevision, previewId: fresh.id, acceptWarnings: false },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('blocks a whole invalid dependency group and permits an explicitly reviewed valid subset', async () => {
    const batch = await stage([
        { id: 'A', kind: 'cash_movement', payload: cash(), group: 'bad' },
        { id: 'B', kind: 'cash_movement', payload: cash('-1'), group: 'bad' },
        { id: 'C', kind: 'cash_movement', payload: cash('5'), group: 'good' },
      ]),
      before = await counts(),
      review = await preview(batch);
    expect(review.committable).toBe(false);
    expect(
      review.rows.filter((row) => row.groupKey === 'bad').every((row) => row.status === 'invalid'),
    ).toBe(true);
    expect(await counts()).toEqual(before);
    await expect(commit(batch, review)).rejects.toMatchObject({ code: 'IMPORT_VALIDATION_FAILED' });
    const subset = await preview(batch, ['good']);
    expect((await commit(batch, subset)).state).toBe('partial');
    expect(await balance()).toEqual(['5']);
  });
  it('requires explicit review for changed IDs and appends a cash correction without double booking', async () => {
    const original = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]);
    await commit(original, await preview(original));
    const changed = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash('125') }]),
      review = await preview(changed);
    expect(review.rows[0]?.status).toBe('correction');
    expect(review.committable).toBe(false);
    expect(await balance()).toEqual(['100']);
    const row = (await service.detail(ctx(), changed.id)).rows[0]!,
      corrected = await preview(changed, undefined, {
        [row.id]: 'Correct broker statement amount',
      });
    expect(corrected.committable).toBe(true);
    await commit(changed, corrected);
    expect(await balance()).toEqual(['125']);
    const duplicate = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash('125') }]);
    expect((await preview(duplicate)).rows[0]?.status).toBe('duplicate');
  });
  it('reverses independent cash through exact ledger postings, is retry-safe and never resurrects reversed sources', async () => {
    const batch = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]),
      committed = await commit(batch, await preview(batch)),
      key = randomUUID(),
      body = { expectedRevision: committed.revision, reason: 'Wrong statement' };
    const result = await service.reverse(ctx(), batch.id, body, key);
    expect(result.state).toBe('reversed');
    expect(await balance()).toEqual(['0']);
    expect(await service.reverse(ctx(), batch.id, body, key)).toEqual(result);
    const again = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]);
    expect((await preview(again)).committable).toBe(false);
  });
  it('blocks reversal when later financial activity creates potential dependencies', async () => {
    const batch = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]),
      committed = await commit(batch, await preview(batch));
    await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: account,
      currencyId: eur,
      kind: 'settled',
    });
    await expect(
      service.reverse(
        ctx(),
        batch.id,
        { expectedRevision: committed.revision, reason: 'Review' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_REVERSAL_DEPENDENCIES' });
    expect(await balance()).toEqual(['100']);
  });
  it('imports fractional fills and fees then reconciles linked fill-cash rows without another posting', async () => {
    const bucket = await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: account,
      currencyId: currency,
      kind: 'settled',
    });
    const buy = {
      instrumentVersionId: instrument,
      side: 'buy',
      quantity: '0.5',
      price: '20.5',
      economicAt: time,
      orderingKey: '2',
      cashBucketId: bucket.id,
      costsComplete: true,
      fees: [{ amount: '0.05', currencyId: currency, cashBucketId: bucket.id, kind: 'commission' }],
    };
    const batch = await stage([
      {
        id: 'cash-link',
        kind: 'execution_cash',
        group: 'fills',
        payload: {
          executionSourceId: 'BUY1',
          currencyId: currency,
          amount: '-10.30',
          economicAt: time,
          scope: 'net',
        },
      },
      { id: 'DEP', kind: 'cash_movement', payload: cash() },
      { id: 'BUY1', kind: 'execution', group: 'fills', payload: buy },
      {
        id: 'SELL1',
        kind: 'execution',
        group: 'fills',
        payload: {
          ...buy,
          side: 'sell',
          quantity: '0.25',
          price: '30',
          economicAt: '2030-01-02T12:00:00Z',
          orderingKey: '3',
        },
      },
    ]);
    const review = await preview(batch);
    expect(review.committable).toBe(true);
    expect(review.rows.find((row) => row.kind === 'execution_cash')?.status).toBe('reconciled');
    await commit(batch, review);
    expect(await balance()).toEqual(['97.15']);
    expect((await ledger.executions(ctx(), { accountId: account })).length).toBe(2);
    const result = await service.detail(ctx(), batch.id);
    expect(result.rows.find((row) => row.kind === 'execution_cash')?.result).toMatchObject({
      actual: '-10.3',
      state: 'reconciled',
    });
  });
  it('blocks cash variances and rolls back a tentative execution in the same group', async () => {
    const batch = await stage([
      {
        id: 'BUY1',
        kind: 'execution',
        group: 'atomic',
        payload: {
          instrumentVersionId: instrument,
          side: 'buy',
          quantity: '1',
          price: '10',
          economicAt: time,
          orderingKey: '1',
          costsComplete: true,
        },
      },
      {
        id: 'CASH1',
        kind: 'execution_cash',
        group: 'atomic',
        payload: {
          executionSourceId: 'BUY1',
          currencyId: currency,
          amount: '-9',
          economicAt: time,
          scope: 'net',
        },
      },
    ]);
    const before = await counts(),
      review = await preview(batch);
    expect(review.committable).toBe(false);
    expect(
      review.rows.every((row) => row.errors.some((issue) => issue.code === 'FILL_CASH_VARIANCE')),
    ).toBe(true);
    expect(await counts()).toEqual(before);
  });
  it('rejects ambiguous identical no-ID rows, while fingerprints remain stable across file reorder', async () => {
    const batch = await stage([
      { kind: 'cash_movement', payload: cash() },
      { kind: 'cash_movement', payload: cash() },
    ]);
    expect(
      (await service.detail(ctx(), batch.id)).rows.every((row) => row.status === 'ambiguous'),
    ).toBe(true);
    expect((await preview(batch)).committable).toBe(false);
    const first = await stage([
      { kind: 'cash_movement', payload: cash('3') },
      { kind: 'cash_movement', payload: cash('4') },
    ]);
    await commit(first, await preview(first));
    const second = await stage([
      { kind: 'cash_movement', payload: cash('4') },
      { kind: 'cash_movement', payload: cash('3') },
    ]);
    expect((await preview(second)).rows.every((row) => row.status === 'duplicate')).toBe(true);
    expect(await balance()).toEqual(['7']);
  });
  it('keeps account and namespace identity scopes independent', async () => {
    const one = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]);
    await commit(one, await preview(one));
    const two = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }], randomUUID(), {
      namespace: 'another-broker',
    });
    expect((await preview(two)).rows[0]?.status).toBe('new');
    await commit(two, await preview(two));
    expect(await balance()).toEqual(['200']);
  });
  it('retains template versions and rejects stale edits, foreign batches, viewers and missing CSRF', async () => {
    const templates = createImportTemplates(fixture.services, service.registry),
      command = randomUUID();
    const v1 = await templates.save(ctx(), { name: 'Statement', mapping: map() }, command);
    expect(await templates.save(ctx(), { name: 'Statement', mapping: map() }, command)).toEqual(v1);
    const v2 = await templates.save(
      ctx(),
      { name: 'Statement v2', mapping: map(), expectedVersion: 1 },
      randomUUID(),
      v1.templateId,
    );
    expect(v2.version).toBe(2);
    await expect(
      templates.save(
        ctx(),
        { name: 'Stale', mapping: map(), expectedVersion: 1 },
        randomUUID(),
        v1.templateId,
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_TEMPLATE_REVISION_CONFLICT' });
    const batch = await stage([{ id: 'D1', kind: 'cash_movement', payload: cash() }]);
    await expect(service.detail(fixture.outsider.context, batch.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.preview(fixture.viewer.context, batch.id, { expectedRevision: 1, groups: ['D1'] }),
    ).rejects.toMatchObject({ status: 403 });
    const api = createImportApi(fixture.services);
    try {
      await api(
        new Request(`${origin}/api/v1/workspaces/${ctx().workspaceId}/imports/batches`, {
          method: 'POST',
          headers: {
            cookie: fixture.owner.cookie,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: '{}',
        }),
        ctx().workspaceId,
        ['batches'],
      );
      throw new Error('Expected CSRF failure');
    } catch (error) {
      expect(toProblemResponse(error).status).toBe(403);
    }
  });
  it('handles actual FX conversions and fee currencies independently', async () => {
    const usd = await ledger.createCashBucket(ctx(), {
        commandId: randomUUID(),
        accountId: account,
        currencyId: currency,
        kind: 'settled',
      }),
      euro = await ledger.createCashBucket(ctx(), {
        commandId: randomUUID(),
        accountId: account,
        currencyId: eur,
        kind: 'settled',
      });
    const batch = await stage([
      { id: 'D', kind: 'cash_movement', payload: cash('100') },
      {
        id: 'FX',
        kind: 'fx_conversion',
        payload: {
          sourceBucketId: usd.id,
          destinationBucketId: euro.id,
          sourceAmount: '10',
          destinationAmount: '9',
          rate: '0.9',
          economicAt: time,
          orderingKey: '2',
          fees: [{ cashBucketId: euro.id, currencyId: eur, amount: '1', kind: 'conversion-fee' }],
        },
      },
    ]);
    const review = await preview(batch);
    expect(review.committable).toBe(true);
    await commit(batch, review);
    expect(await balance()).toEqual(['90']);
    expect(await balance(eur)).toEqual(['8']);
  });
  it('imports reviewed opening holdings with unknown basis instead of inventing fills', async () => {
    const batch = await stage([
      {
        id: 'OPEN',
        kind: 'opening_lot',
        payload: {
          instrumentVersionId: instrument,
          direction: 'long',
          quantity: '1.25',
          reason: 'Opening snapshot; historical acquisition basis unavailable',
          economicAt: time,
          orderingKey: '1',
        },
      },
    ]);
    const review = await preview(batch);
    expect(review.committable).toBe(true);
    await commit(batch, review);
    expect(await ledger.executions(ctx(), { accountId: account })).toEqual([]);
    const rows = await fixture.admin.pool.query(
      'SELECT quantity_raw,principal_raw FROM app.opening_lots WHERE workspace_id=$1 AND account_id=$2',
      [ctx().workspaceId, account],
    );
    expect(rows.rows).toEqual([{ quantity_raw: '1.25', principal_raw: null }]);
  });
  it('resolves instrument declarations before dependent fills across complete groups', async () => {
    const batch = await stage([
      {
        id: 'BUY',
        kind: 'execution',
        group: 'fill',
        payload: {
          instrumentVersionId: { $row: 'instrument:NEW', path: 'versionId' },
          side: 'buy',
          quantity: '1',
          price: '10',
          economicAt: time,
          orderingKey: '1',
          costsComplete: true,
        },
      },
      {
        id: 'NEW',
        kind: 'instrument',
        group: 'asset',
        payload: {
          name: 'Declared import instrument',
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: `new:${randomUUID()}`,
          quantityUnit: 'share',
          quoteCurrencyId: currency,
          settlementCurrencyId: currency,
          multiplier: '1',
          quantityIncrement: '1',
          priceIncrement: '0.01',
          capability: 'native-linear',
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
          effectiveAt: effective,
        },
      },
    ]);
    const review = await preview(batch);
    expect(review.committable).toBe(true);
    await commit(batch, review);
    expect((await ledger.executions(ctx(), { accountId: account })).length).toBe(1);
  });
  it('adopts an equivalent previously booked broker cash ID without a second monetary event', async () => {
    const bucket = await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: account,
      currencyId: currency,
      kind: 'settled',
    });
    await ledger.recordCashMovement(ctx(), {
      ...cash('100.00'),
      kind: 'deposit',
      commandId: randomUUID(),
      accountId: account,
      cashBucketId: bucket.id,
      sourceIdentity: { namespace: 'documented-broker', id: 'OLD' },
    });
    const batch = await stage([{ id: 'OLD', kind: 'cash_movement', payload: cash('100') }]),
      before = await counts(),
      review = await preview(batch);
    expect(review.rows[0]?.status).toBe('duplicate');
    await commit(batch, review);
    expect((await counts())[0]?.events).toBe(before[0]?.events);
    expect(await balance()).toEqual(['100']);
  });
  it('does not let no-op recommits hide downstream dependencies or erase original reversal ownership', async () => {
    const batch = await stage([{ id: 'D', kind: 'cash_movement', payload: cash() }]);
    await commit(batch, await preview(batch));
    await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: account,
      currencyId: eur,
      kind: 'settled',
    });
    const recommitted = await commit(batch, await preview(batch));
    expect((await service.detail(ctx(), batch.id)).rows[0]?.status).toBe('committed');
    await expect(
      service.reverse(
        ctx(),
        batch.id,
        { expectedRevision: recommitted.revision, reason: 'Review' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_REVERSAL_DEPENDENCIES' });
    expect(await balance()).toEqual(['100']);
  });
  it('blocks interleaved financial activity even if the last partial commit belongs to the batch', async () => {
    const batch = await stage([
      { id: 'A', kind: 'cash_movement', group: 'first', payload: cash('10') },
      { id: 'B', kind: 'cash_movement', group: 'second', payload: cash('20') },
    ]);
    await commit(batch, await preview(batch, ['first']));
    await ledger.createCashBucket(ctx(), {
      commandId: randomUUID(),
      accountId: account,
      currencyId: eur,
      kind: 'settled',
    });
    const final = await commit(batch, await preview(batch, ['second']));
    await expect(
      service.reverse(
        ctx(),
        batch.id,
        { expectedRevision: final.revision, reason: 'Review' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_REVERSAL_DEPENDENCIES' });
    expect(await balance()).toEqual(['30']);
  });
});
