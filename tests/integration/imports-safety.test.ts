import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as c from '@journal/contracts';
import { sql } from '@journal/database';
import {
  createCatalogServices,
  createFinancialLedger,
  createImportApi,
  createImportServices,
  toProblemResponse,
} from '@journal/server';
import {
  accountingTestOrigin as origin,
  createAccountingFixture,
  type AccountingTestActor,
} from './accounting-fixture.js';

describe('import concurrency, private sources and append-only financial safety', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let imports: ReturnType<typeof createImportServices>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let api: ReturnType<typeof createImportApi>;
  let currencyId: string, instrumentVersionId: string, accountId: string;
  const economicAt = '2030-01-01T12:00:00.000001Z';
  const effectiveAt = '2025-01-01T00:00:00Z';
  const namespace = 'safety-example-broker';
  const context = () => fixture.owner.context;

  beforeAll(async () => {
    fixture = await createAccountingFixture();
    imports = createImportServices(fixture.services);
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    api = createImportApi(fixture.services);
    currencyId = (
      await catalog.createCurrency(
        context(),
        {
          namespace: 'iso',
          code: 'USD',
          kind: 'fiat',
          unitIdentity: 'iso:USD',
          name: 'US dollar',
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt,
        },
        randomUUID(),
      )
    ).id;
    instrumentVersionId = (
      await catalog.createInstrument(
        context(),
        {
          name: 'Safety shares',
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: 'import-safety-stock',
          quantityUnit: 'share',
          quoteCurrencyId: currencyId,
          settlementCurrencyId: currencyId,
          multiplier: '1',
          quantityIncrement: '0.001',
          priceIncrement: '0.01',
          capability: 'native-linear',
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
          effectiveAt,
        },
        randomUUID(),
      )
    ).versionId;
  });
  beforeEach(async () => {
    accountId = (
      await catalog.createAccount(
        context(),
        {
          name: `Import safety ${randomUUID()}`,
          environment: 'live',
          accountType: 'cash',
          baseCurrencyId: currencyId,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      )
    ).id;
  });
  afterAll(async () => fixture?.cleanup());

  const cash = () => ({ amount: '10', currencyId, kind: 'deposit', economicAt, orderingKey: '1' });
  const execution = (price = '10') => ({
    instrumentVersionId,
    side: 'buy',
    quantity: '0.5',
    price,
    economicAt,
    orderingKey: '1',
  });
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const stageInput = (
    rows: { id?: string; kind: c.ImportKind; payload: unknown; key?: string }[],
  ) => ({
    accountId,
    namespace,
    filename: 'évidence "safety".csv',
    content:
      '\uFEFFID,Key,Kind,Group,Payload\r\n' +
      rows
        .map((row, index) =>
          [
            row.id ?? '',
            row.key ?? `${row.kind}:${row.id ?? index}`,
            row.kind,
            row.id ?? `group-${index}`,
            JSON.stringify(row.payload),
          ]
            .map(quote)
            .join(','),
        )
        .join('\r\n') +
      '\r\n',
    mapping: c.importMappingSchema.parse({
      adapterId: 'canonical-csv',
      kind: 'cash_movement',
      fields: [],
    }),
  });
  const stageCash = () =>
    imports.stage(
      context(),
      stageInput([{ id: 'CASH', kind: 'cash_movement', payload: cash() }]),
      randomUUID(),
    );
  async function preview(batch: c.ImportBatchResponse, corrections: Record<string, string> = {}) {
    const detail = await imports.detail(context(), batch.id);
    return imports.preview(context(), batch.id, {
      expectedRevision: detail.batch.revision,
      groups: detail.groups.map((group) => group.key),
      corrections,
    });
  }
  const commit = (
    batch: c.ImportBatchResponse,
    review: c.ImportPreviewResponse,
    key = randomUUID(),
  ) =>
    imports.commit(
      context(),
      batch.id,
      {
        expectedRevision: review.batchRevision,
        previewId: review.id,
        acceptWarnings: true,
      },
      key,
    );
  async function balance() {
    return (await ledger.cashBalances(context(), { accountIds: [accountId] })).map(
      (row) => row.amount,
    );
  }
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    options: {
      actor?: AccountingTestActor | null;
      workspaceId?: string;
      csrf?: string | null;
      idempotencyKey?: string | null;
      requestOrigin?: string;
    } = {},
  ) {
    const actor = options.actor === undefined ? fixture.owner : options.actor;
    const workspaceId = options.workspaceId ?? context().workspaceId;
    const headers = new Headers({ origin: options.requestOrigin ?? origin });
    if (actor) headers.set('cookie', actor.cookie);
    if (method !== 'GET') {
      headers.set('content-type', 'application/json');
      const csrf = options.csrf === undefined ? actor?.csrf : options.csrf;
      const key = options.idempotencyKey === undefined ? randomUUID() : options.idempotencyKey;
      if (csrf) headers.set('x-csrf-token', csrf);
      if (key) headers.set('idempotency-key', key);
    }
    try {
      return await api(
        new Request(`${origin}/api/v1/workspaces/${workspaceId}/imports/${path}`, {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        workspaceId,
        path.split('/'),
      );
    } catch (error) {
      return toProblemResponse(error, 'imports-safety-test');
    }
  }

  it('serializes concurrent identical staging retries to one immutable batch and operation', async () => {
    const input = stageInput([{ id: 'CASH', kind: 'cash_movement', payload: cash() }]);
    const key = randomUUID();
    const [first, second] = await Promise.all([
      imports.stage(context(), input, key),
      imports.stage(context(), input, key),
    ]);
    expect(first).toEqual(second);
    const counts = await fixture.admin.pool.query(
      'SELECT (SELECT count(*) FROM app.import_batches WHERE workspace_id=$1 AND id=$2) AS batches,(SELECT count(*) FROM app.import_operations WHERE workspace_id=$1 AND idempotency_key=$3) AS operations',
      [context().workspaceId, first.id, key],
    );
    expect(counts.rows).toEqual([{ batches: '1', operations: '1' }]);
    expect(await balance()).toEqual([]);
  });

  it('serializes overlapping import commits, requires the losing preview to refresh, and books money exactly once', async () => {
    const [first, second] = await Promise.all([stageCash(), stageCash()]);
    const [firstPreview, secondPreview] = await Promise.all([preview(first), preview(second)]);
    const results = await Promise.allSettled([
      commit(first, firstPreview),
      commit(second, secondPreview),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'STALE_IMPORT_PREVIEW' },
    });
    const losingBatch = results[0]?.status === 'rejected' ? first : second;
    const fresh = await preview(losingBatch);
    expect(fresh.rows[0]?.status).toBe('duplicate');
    await commit(losingBatch, fresh);
    expect(await balance()).toEqual(['10']);
    const facts = await fixture.admin.pool.query(
      'SELECT count(*) AS count FROM app.cash_movements WHERE workspace_id=$1 AND account_id=$2',
      [context().workspaceId, accountId],
    );
    expect(facts.rows).toEqual([{ count: '1' }]);
  });

  it('downloads exact original UTF-8 bytes only within the authorized workspace, with private attachment headers', async () => {
    const input = stageInput([{ id: 'CASH', kind: 'cash_movement', payload: cash() }]);
    const batch = await imports.stage(context(), input, randomUUID());
    for (const actor of [fixture.owner, fixture.editor, fixture.viewer]) {
      const response = await request(`batches/${batch.id}/source`, 'GET', undefined, { actor });
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(input.content, 'utf8'));
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-source-sha256')).toBe(
        createHash('sha256').update(input.content).digest('hex'),
      );
      expect(response.headers.get('content-disposition')).toBe(
        "attachment; filename*=UTF-8''%C3%A9vidence%20%22safety%22.csv",
      );
    }
    expect(
      (await request(`batches/${batch.id}/source`, 'GET', undefined, { actor: null })).status,
    ).toBe(401);
    for (const workspaceId of [context().workspaceId, fixture.outsider.context.workspaceId]) {
      const response = await request(`batches/${batch.id}/source`, 'GET', undefined, {
        actor: fixture.outsider,
        workspaceId,
      });
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(input.content);
    }
  });

  it('requires editors, same-origin CSRF proof and valid idempotency keys before staging', async () => {
    const input = stageInput([{ id: 'CASH', kind: 'cash_movement', payload: cash() }]);
    const denied = [
      { actor: fixture.viewer },
      { csrf: null },
      { csrf: 'not-a-session-proof' },
      { requestOrigin: 'https://untrusted.example' },
      { idempotencyKey: null },
      { idempotencyKey: 'not-a-uuid' },
    ];
    for (const options of denied) {
      const response = await request('batches', 'POST', input, options);
      expect(response.status).toBe(
        options.idempotencyKey === null || options.idempotencyKey === 'not-a-uuid' ? 400 : 403,
      );
    }
    expect((await request('batches', 'POST', input, { actor: fixture.editor })).status).toBe(200);
    expect(await balance()).toEqual([]);
  });

  it('replays identical API staging but rejects changed bodies for the same command key', async () => {
    const input = stageInput([{ id: 'CASH', kind: 'cash_movement', payload: cash() }]);
    const idempotencyKey = randomUUID();
    const first = await request('batches', 'POST', input, { idempotencyKey });
    const replay = await request('batches', 'POST', input, { idempotencyKey });
    expect(first.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    const conflict = await request(
      'batches',
      'POST',
      { ...input, filename: 'changed.csv' },
      { idempotencyKey },
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('enforces row-level isolation and denies runtime deletion of preserved source records', async () => {
    const batch = await stageCash();
    const visible = await fixture.services.withWorkspaceContext(
      fixture.outsider.context,
      async (tx) =>
        tx.execute(sql`SELECT source_text FROM app.import_batches WHERE id=${batch.id}::uuid`),
    );
    expect(visible.rows).toEqual([]);
    await expect(
      fixture.services.withWorkspaceContext(context(), async (tx) =>
        tx.execute(sql`DELETE FROM app.import_batches WHERE id=${batch.id}::uuid`),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect((await imports.source(context(), batch.id)).content).toContain('CASH');
  });

  it('guards original source bytes, mapping snapshots, row payloads and audit operations against SQL mutation', async () => {
    const batch = await stageCash();
    const row = (await imports.detail(context(), batch.id)).rows[0]!;
    const forbidden = [
      [
        "UPDATE app.import_batches SET source_text=$3,file_hash=encode(sha256(convert_to($3,'UTF8')),'hex') WHERE workspace_id=$1 AND id=$2",
        [context().workspaceId, batch.id, 'ID\nchanged'],
      ],
      [
        'UPDATE app.import_batches SET mapping=\'{"changed":true}\'::jsonb WHERE workspace_id=$1 AND id=$2',
        [context().workspaceId, batch.id],
      ],
      [
        'UPDATE app.import_rows SET payload=\'{"amount":"999"}\'::jsonb WHERE workspace_id=$1 AND id=$2',
        [context().workspaceId, row.id],
      ],
      [
        'UPDATE app.import_rows SET raw_fields=\'{"ID":"replacement"}\'::jsonb WHERE workspace_id=$1 AND id=$2',
        [context().workspaceId, row.id],
      ],
      [
        'UPDATE app.import_operations SET details=\'{"tampered":true}\'::jsonb WHERE workspace_id=$1 AND batch_id=$2',
        [context().workspaceId, batch.id],
      ],
    ] as const;
    for (const [query, parameters] of forbidden)
      await expect(fixture.admin.pool.query(query, [...parameters])).rejects.toMatchObject({
        code: '55000',
      });
    expect((await imports.detail(context(), batch.id)).rows[0]?.payload?.amount).toBe('10');
  });

  it('retains immutable command attribution, source identity and source history after commit', async () => {
    const batch = await stageCash();
    await commit(batch, await preview(batch));
    const row = (await imports.detail(context(), batch.id)).rows[0]!;
    await expect(
      fixture.admin.pool.query(
        'UPDATE app.import_rows SET recorded_command_id=NULL WHERE workspace_id=$1 AND id=$2',
        [context().workspaceId, row.id],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      fixture.admin.pool.query(
        "UPDATE app.import_sources SET identity_key='id:replacement' WHERE workspace_id=$1 AND account_id=$2",
        [context().workspaceId, accountId],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      fixture.admin.pool.query(
        "UPDATE app.import_source_history SET result='{}'::jsonb WHERE workspace_id=$1 AND row_id=$2",
        [context().workspaceId, row.id],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    expect(await balance()).toEqual(['10']);
  });

  it('preserves unknown fee completeness when broker fills and opening holdings omit it', async () => {
    const batch = await imports.stage(
      context(),
      stageInput([
        { id: 'BUY', kind: 'execution', payload: execution() },
        {
          id: 'OPEN',
          kind: 'opening_lot',
          payload: {
            instrumentVersionId,
            direction: 'long',
            quantity: '0.25',
            economicAt,
            orderingKey: '2',
            reason: 'Opening inventory without known acquisition costs',
          },
        },
      ]),
      randomUUID(),
    );
    const detail = await imports.detail(context(), batch.id);
    expect(detail.rows.map((row) => row.payload?.costsComplete)).toEqual([false, false]);
    await commit(batch, await preview(batch));
    const facts = await fixture.admin.pool.query(
      "SELECT payload->>'costsComplete' AS completeness FROM app.executions WHERE workspace_id=$1 AND account_id=$2 UNION ALL SELECT payload->>'costsComplete' AS completeness FROM app.opening_lots WHERE workspace_id=$1 AND account_id=$2",
      [context().workspaceId, accountId],
    );
    expect(facts.rows).toEqual([{ completeness: 'false' }, { completeness: 'false' }]);
    expect(await balance()).toEqual(['-5']);
  });

  it('requires a reviewed changed execution ID and replaces its economics without deleting the old fill', async () => {
    const first = await imports.stage(
      context(),
      stageInput([{ id: 'BUY', kind: 'execution', payload: execution() }]),
      randomUUID(),
    );
    await commit(first, await preview(first));
    const original = (await ledger.executions(context(), { accountId }))[0]!;
    const changed = await imports.stage(
      context(),
      stageInput([{ id: 'BUY', kind: 'execution', payload: execution('12') }]),
      randomUUID(),
    );
    const unreviewed = await preview(changed);
    expect(unreviewed.committable).toBe(false);
    expect(unreviewed.rows[0]?.status).toBe('correction');
    expect(await balance()).toEqual(['-5']);
    const row = (await imports.detail(context(), changed.id)).rows[0]!;
    const reviewed = await preview(changed, { [row.id]: 'Correct broker execution price' });
    expect(reviewed.committable).toBe(true);
    await commit(changed, reviewed);
    expect(await balance()).toEqual(['-6']);
    const supersession = await fixture.admin.pool.query(
      'SELECT original_execution_id,replacement_execution_id FROM app.execution_supersessions WHERE workspace_id=$1 AND original_execution_id=$2',
      [context().workspaceId, original.id],
    );
    expect(supersession.rows).toHaveLength(1);
    expect(supersession.rows[0]?.replacement_execution_id).not.toBe(original.id);
    const retained = await fixture.admin.pool.query(
      'SELECT count(*) AS count FROM app.executions WHERE workspace_id=$1 AND account_id=$2',
      [context().workspaceId, accountId],
    );
    expect(retained.rows).toEqual([{ count: '2' }]);
    const again = await imports.stage(
      context(),
      stageInput([{ id: 'BUY', kind: 'execution', payload: execution('12') }]),
      randomUUID(),
    );
    expect((await preview(again)).rows[0]?.status).toBe('duplicate');
  });

  it('rejects automatic reversal of an imported execution while retaining its original postings', async () => {
    const batch = await imports.stage(
      context(),
      stageInput([{ id: 'BUY', kind: 'execution', payload: execution() }]),
      randomUUID(),
    );
    const committed = await commit(batch, await preview(batch));
    await expect(
      imports.reverse(
        context(),
        batch.id,
        {
          expectedRevision: committed.revision,
          reason: 'Review fill reversal dependencies',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_REVERSAL_UNSUPPORTED' });
    expect(await balance()).toEqual(['-5']);
    expect((await imports.detail(context(), batch.id)).batch.state).toBe('committed');
  });

  it('adopts an unchanged previously booked broker execution without another command or cash posting', async () => {
    const original = await ledger.recordExecution(context(), {
      ...execution(),
      side: 'buy',
      commandId: randomUUID(),
      accountId,
      costsComplete: true,
      sourceIdentity: { namespace, id: 'OLD-BUY' },
    });
    const before = await fixture.admin.pool.query(
      'SELECT (SELECT count(*) FROM app.financial_commands WHERE workspace_id=$1) AS commands,(SELECT count(*) FROM app.ledger_events WHERE workspace_id=$1) AS events',
      [context().workspaceId],
    );
    const batch = await imports.stage(
      context(),
      stageInput([
        {
          id: 'OLD-BUY',
          kind: 'execution',
          payload: { ...execution(), costsComplete: true },
        },
      ]),
      randomUUID(),
    );
    const review = await preview(batch);
    expect(review.rows[0]?.status).toBe('duplicate');
    await commit(batch, review);
    const after = await fixture.admin.pool.query(
      'SELECT (SELECT count(*) FROM app.financial_commands WHERE workspace_id=$1) AS commands,(SELECT count(*) FROM app.ledger_events WHERE workspace_id=$1) AS events',
      [context().workspaceId],
    );
    expect(after.rows).toEqual(before.rows);
    expect((await imports.detail(context(), batch.id)).rows[0]?.result).toMatchObject({
      id: original.id,
    });
    expect(await balance()).toEqual(['-5']);
  });

  const instrumentDeclaration = (economicIdentity: string) => ({
    name: 'Declared safety shares',
    family: 'stock',
    subtype: 'ordinary-share',
    economicIdentity,
    quantityUnit: 'share',
    quoteCurrencyId: currencyId,
    settlementCurrencyId: currencyId,
    multiplier: '1',
    quantityIncrement: '0.001',
    priceIncrement: '0.01',
    capability: 'native-linear',
    metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
    effectiveAt,
  });

  it('adopts a legacy broker execution with unspecified fee completeness as the same unknown-cost facts', async () => {
    await ledger.recordExecution(context(), {
      ...execution(),
      side: 'buy',
      commandId: randomUUID(),
      accountId,
      sourceIdentity: { namespace, id: 'OLD-UNKNOWN-BUY' },
    });
    const before = await fixture.admin.pool.query(
      'SELECT count(*) AS count FROM app.financial_commands WHERE workspace_id=$1',
      [context().workspaceId],
    );
    const batch = await imports.stage(
      context(),
      stageInput([{ id: 'OLD-UNKNOWN-BUY', kind: 'execution', payload: execution() }]),
      randomUUID(),
    );
    const review = await preview(batch);
    expect(review.rows[0]?.status).toBe('duplicate');
    await commit(batch, review);
    expect(
      (
        await fixture.admin.pool.query(
          'SELECT count(*) AS count FROM app.financial_commands WHERE workspace_id=$1',
          [context().workspaceId],
        )
      ).rows,
    ).toEqual(before.rows);
    expect(await balance()).toEqual(['-5']);
  });

  it('keeps stable broker identities duplicate across reordered rows and renamed local instrument keys', async () => {
    const asset = instrumentDeclaration(`reference-safety:${randomUUID()}`);
    const first = await imports.stage(
      context(),
      stageInput([
        { id: 'ASSET', key: 'asset-original', kind: 'instrument', payload: asset },
        {
          id: 'BUY',
          kind: 'execution',
          payload: {
            ...execution(),
            instrumentVersionId: { $row: 'asset-original', path: 'versionId' },
          },
        },
      ]),
      randomUUID(),
    );
    await commit(first, await preview(first));
    const before = await fixture.admin.pool.query(
      'SELECT count(*) AS count FROM app.financial_commands WHERE workspace_id=$1',
      [context().workspaceId],
    );
    const reordered = await imports.stage(
      context(),
      stageInput([
        {
          id: 'BUY',
          kind: 'execution',
          payload: {
            ...execution(),
            instrumentVersionId: { $row: 'asset-renamed', path: 'versionId' },
          },
        },
        { id: 'ASSET', key: 'asset-renamed', kind: 'instrument', payload: asset },
      ]),
      randomUUID(),
    );
    const review = await preview(reordered);
    expect(review.committable).toBe(true);
    expect(review.rows.every((row) => row.status === 'duplicate')).toBe(true);
    await commit(reordered, review);
    expect(
      (
        await fixture.admin.pool.query(
          'SELECT count(*) AS count FROM app.financial_commands WHERE workspace_id=$1',
          [context().workspaceId],
        )
      ).rows,
    ).toEqual(before.rows);
    expect(await balance()).toEqual(['-5']);
  });

  it('blocks fingerprint-only dependent fills until a stable broker source ID is supplied', async () => {
    const batch = await imports.stage(
      context(),
      stageInput([
        {
          id: 'ASSET',
          key: 'asset',
          kind: 'instrument',
          payload: instrumentDeclaration(`missing-id:${randomUUID()}`),
        },
        {
          kind: 'execution',
          payload: { ...execution(), instrumentVersionId: { $row: 'asset', path: 'versionId' } },
        },
      ]),
      randomUUID(),
    );
    const fill = (await imports.detail(context(), batch.id)).rows.find(
      (row) => row.kind === 'execution',
    )!;
    expect(fill.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'STABLE_SOURCE_ID_REQUIRED' })]),
    );
    expect((await preview(batch)).committable).toBe(false);
    expect(await ledger.executions(context(), { accountId })).toEqual([]);
    expect(await balance()).toEqual([]);
  });

  it('never resolves a dependent fill through an ambiguous duplicate local source key', async () => {
    const batch = await imports.stage(
      context(),
      stageInput([
        {
          id: 'ASSET-ONE',
          key: 'ambiguous-asset',
          kind: 'instrument',
          payload: instrumentDeclaration(`ambiguous-one:${randomUUID()}`),
        },
        {
          id: 'ASSET-TWO',
          key: 'ambiguous-asset',
          kind: 'instrument',
          payload: instrumentDeclaration(`ambiguous-two:${randomUUID()}`),
        },
        {
          id: 'BUY',
          kind: 'execution',
          payload: {
            ...execution(),
            instrumentVersionId: { $row: 'ambiguous-asset', path: 'versionId' },
          },
        },
      ]),
      randomUUID(),
    );
    const review = await preview(batch);
    expect(review.committable).toBe(false);
    expect(review.rows.find((row) => row.kind === 'execution')?.status).toBe('invalid');
    expect(await ledger.executions(context(), { accountId })).toEqual([]);
    expect(await balance()).toEqual([]);
  });

  it('keeps no-ID cash fingerprints identical for upper/lowercase representations of the selected account', async () => {
    const input = stageInput([{ kind: 'cash_movement', payload: cash() }]);
    const first = await imports.stage(
      context(),
      { ...input, accountId: accountId.toUpperCase() },
      randomUUID(),
    );
    await commit(first, await preview(first));
    const second = await imports.stage(
      context(),
      stageInput([
        {
          kind: 'cash_movement',
          payload: { ...cash(), accountId },
        },
      ]),
      randomUUID(),
    );
    const review = await preview(second);
    expect(review.rows[0]?.status).toBe('duplicate');
    await commit(second, review);
    expect(await balance()).toEqual(['10']);
  });
});
