import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, sql, withTenantTransaction } from '@journal/database';
import * as c from '@journal/contracts';
import {
  createCatalogServices,
  createFinancialLedger,
  createFinancialObservations,
  createJournalServices,
  createStrategyServices,
  createStrategyAttachmentServices,
  createImportServices,
} from '@journal/server';
import { createPrivateFileStore } from '@journal/server/storage';
import { createPortabilityServices } from '../../packages/server/src/portability/service.js';
import { createPortabilityApi } from '../../packages/server/src/portability/api.js';
import {
  portableHash,
  rebindWorkspace,
  stablePortableJson,
} from '../../packages/server/src/portability/integrity.js';
import { createAccountingFixture, accountingTestOrigin as origin } from './accounting-fixture.js';

const at = '2025-01-01T00:00:00.000001Z',
  entryAt = '2025-02-01T00:00:00.000001Z',
  exitAt = '2025-02-02T00:00:00.000002Z';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVYAAAAASUVORK5CYII=',
  'base64',
);
describe('portable workspace and typed exports on restricted PostgreSQL roles', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>,
    root: string,
    store: ReturnType<typeof createPrivateFileStore>,
    portable: ReturnType<typeof createPortabilityServices>,
    api: ReturnType<typeof createPortabilityApi>,
    archive: c.PortableArchive;
  let accountId: string, usdId: string, tradeId: string, attachmentId: string;
  let restoredWorkspaceId: string;
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    root = await mkdtemp(join(tmpdir(), 'journal-portability-'));
    store = createPrivateFileStore(root, { maximumBytes: 10 * 1024 * 1024 });
    portable = createPortabilityServices(fixture.services, store);
    api = createPortabilityApi(fixture.services, { store });
    const owner = fixture.owner.context,
      catalog = createCatalogServices(fixture.services),
      ledger = createFinancialLedger(fixture.services),
      observations = createFinancialObservations(fixture.services),
      journals = createJournalServices(fixture.services),
      strategies = createStrategyServices(fixture.services);
    const usd = await catalog.createCurrency(
      owner,
      {
        namespace: 'iso',
        code: 'USD',
        kind: 'fiat',
        unitIdentity: 'iso:USD',
        name: 'US Dollar',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt: at,
      },
      randomUUID(),
    );
    usdId = usd.id;
    const account = await catalog.createAccount(
      owner,
      {
        name: 'Portable cash account',
        environment: 'paper',
        accountType: 'cash',
        baseCurrencyId: usd.id,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt: at,
      },
      randomUUID(),
    );
    accountId = account.id;
    const instrument = await catalog.createInstrument(
      owner,
      {
        name: 'Portable ordinary share',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `portable:${randomUUID()}`,
        quantityUnit: 'share',
        quoteCurrencyId: usd.id,
        settlementCurrencyId: usd.id,
        multiplier: '1',
        quantityIncrement: '0.001',
        priceIncrement: '0.01',
        capability: 'native-linear',
        metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        effectiveAt: at,
      },
      randomUUID(),
    );
    const cash = await ledger.createCashBucket(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: usd.id,
      kind: 'settled',
    });
    await ledger.recordCashMovement(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      currencyId: usd.id,
      cashBucketId: cash.id,
      amount: '1000.123456789123456789',
      kind: 'deposit',
      economicAt: entryAt,
      orderingKey: '0',
      sourceIdentity: { namespace: 'portable-fixture', id: 'source-deposit' },
    });
    const uploaded = await createStrategyAttachmentServices(fixture.services, store).upload(owner, {
      commandId: randomUUID(),
      name: 'evidence.png',
      mediaType: 'image/png',
      bytes: png,
    });
    attachmentId = uploaded.id;
    const first = await strategies.create(
      owner,
      c.strategyCreateSchema.parse({
        effectiveAt: at,
        definition: { name: 'Portable strategy', attachmentIds: [attachmentId] },
      }),
      randomUUID(),
    );
    await strategies.update(
      owner,
      first.id,
      c.strategyUpdateSchema.parse({
        effectiveAt: entryAt,
        expectedRevision: first.revision,
        changeReason: 'Retain an immutable old version',
        definition: { ...first.currentVersion.definition, name: 'Portable strategy v2' },
      }),
      randomUUID(),
    );
    const trade = await journals.create(
      owner,
      c.journalCreateSchema.parse({
        title: '=HYPERLINK("https://example.test","untrusted")',
        classification: 'active-trading',
        strategyVersionId: first.currentVersionId,
        legs: [
          {
            accountId: account.id,
            instrumentVersionId: instrument.versionId,
            direction: 'long',
            label: 'Portable leg',
          },
        ],
      }),
      randomUUID(),
    );
    tradeId = trade.trade.id;
    const leg = (await catalog.listTradeLegs(owner, tradeId))[0]!;
    await journals.save(
      owner,
      tradeId,
      c.journalSaveSchema.parse({
        expectedRevision: 0,
        document: {
          review: {
            customNotes: 'Original review',
            attachments: [{ attachmentId, phase: 'before' }],
          },
        },
      }),
      randomUUID(),
    );
    await journals.save(
      owner,
      tradeId,
      c.journalSaveSchema.parse({
        expectedRevision: 1,
        document: { review: { customNotes: 'Second review preserves prior history' } },
      }),
      randomUUID(),
    );
    const buy = await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy',
      quantity: '2.5',
      price: '10',
      cashBucketId: cash.id,
      economicAt: entryAt,
      orderingKey: '1',
      costsComplete: true,
      sourceIdentity: { namespace: 'portable-fixture', id: 'source-fill' },
    });
    await ledger.allocateExecution(owner, {
      commandId: randomUUID(),
      executionId: buy.id,
      expectedVersion: 1,
      reason: 'Portable campaign allocation',
      allocations: [{ tradeLegId: leg.id, quantity: '2.5' }],
    });
    const sold = await ledger.recordExecution(owner, {
      commandId: randomUUID(),
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'sell',
      quantity: '1',
      price: '12',
      cashBucketId: cash.id,
      economicAt: exitAt,
      orderingKey: '1',
      costsComplete: true,
    });
    await ledger.allocateExecution(owner, {
      commandId: randomUUID(),
      executionId: sold.id,
      expectedVersion: 1,
      reason: 'Portable campaign close',
      allocations: [{ tradeLegId: leg.id, quantity: '1' }],
    });
    await observations.recordPriceObservation(owner, {
      commandId: randomUUID(),
      instrumentVersionId: instrument.versionId,
      currencyId: usd.id,
      price: '13',
      observedAt: exitAt,
      source: 'portable-fixture',
    });
    await createImportServices(fixture.services).stage(
      owner,
      {
        accountId: account.id,
        namespace: 'portable-source',
        filename: 'evidence.csv',
        content: 'ID,Key,Kind,Group,Payload\noriginal,original,cash_movement,original,"{}"\n',
        mapping: c.importMappingSchema.parse({
          adapterId: 'canonical-csv',
          adapterVersion: '1',
          kind: 'cash_movement',
          fields: [],
          conventions: {
            delimiter: ',',
            decimalSeparator: '.',
            thousandsSeparator: 'none',
            dateFormat: 'iso',
            timezone: 'UTC',
          },
        }),
      },
      randomUUID(),
    );
    archive = await portable.backup(owner);
  }, 60000);
  afterAll(async () => {
    // Unique workspaces remain exclusively inside the disposable TEST database;
    // owner/session teardown must not delete preserved restored financial history.
    await Promise.all([fixture?.services.close(), fixture?.admin.close()]);
    if (root) await rm(root, { recursive: true, force: true });
  });
  function request(
    actor: typeof fixture.owner,
    workspace: string,
    path: string,
    body?: unknown,
    key = randomUUID(),
  ) {
    return api(
      new Request(`${origin}/api/v1/workspaces/${workspace}/portability/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          cookie: actor.cookie,
          origin,
          'content-type': 'application/json',
          'x-csrf-token': actor.csrf,
          'idempotency-key': key,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      workspace,
      [path],
    );
  }
  function reseal(value: c.PortableArchive) {
    for (const table of value.tables) table.sha256 = portableHash(table.rows);
    const { sha256: _, ...body } = value;
    value.sha256 = portableHash(body);
    return value;
  }

  it('exports canonical sources, history, original actors, precision and hash-verified private media without auth or permissions', () => {
    expect(archive.media).toEqual([
      {
        objectId: attachmentId,
        size: png.length,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        contentBase64: png.toString('base64'),
      },
    ]);
    expect(
      archive.tables.some((table) =>
        [
          'workspace_memberships',
          'user_preferences',
          'user',
          'session',
          'account',
          'rate_limit',
        ].includes(table.name),
      ),
    ).toBe(false);
    expect(
      archive.tables.find((table) => table.name === 'cash_movements')!.rows[0]!.amount_raw,
    ).toBe('1000.123456789123456789');
    expect(archive.tables.find((table) => table.name === 'journal_revisions')!.rows).toHaveLength(
      2,
    );
    expect(archive.tables.find((table) => table.name === 'strategy_versions')!.rows).toHaveLength(
      2,
    );
    expect(
      archive.tables.find((table) => table.name === 'import_batches')!.rows[0]!.source_text,
    ).toContain('original,original,cash_movement');
  });
  it('restores into a fresh namespace under another owner and independently reproduces exact cash, inventory, marks and every source row', async () => {
    const key = randomUUID(),
      body = { name: 'Portable round trip', archive };
    const response = await request(
      fixture.outsider,
      fixture.outsider.context.workspaceId,
      'restore',
      body,
      key,
    );
    expect(response.status).toBe(201);
    const result = c.portableRestoreResponseSchema.parse(await response.json());
    restoredWorkspaceId = result.workspaceId;
    expect(restoredWorkspaceId).not.toBe(archive.sourceWorkspace.id);
    const current = await fixture.services.authorizeWorkspace(
      new Request(origin, { headers: { cookie: fixture.outsider.cookie } }),
      restoredWorkspaceId,
      'owner',
    );
    const copied = await portable.backup(current);
    const rebound = rebindWorkspace(
      archive.verification,
      archive.sourceWorkspace.id,
      restoredWorkspaceId,
    );
    expect(copied.verification).toEqual(rebound);
    for (const table of archive.tables) {
      const restored = copied.tables.find((candidate) => candidate.name === table.name)!;
      const actual = new Set(restored.rows.map(stablePortableJson));
      for (const row of table.rows) {
        const expected = rebindWorkspace(
          row,
          archive.sourceWorkspace.id,
          restoredWorkspaceId,
        ) as typeof row;
        // The storage port scopes by workspace separately; the persisted object
        // key must remain the attachment UUID (the published SQL constraint).
        if (table.name === 'strategy_attachments') expect(expected.storage_key).toBe(row.id);
        expect(actual.has(stablePortableJson(expected)), `retained ${table.name}`).toBe(true);
      }
      if (!['audit_events', 'portable_restore_history'].includes(table.name))
        expect(restored.rows).toHaveLength(table.rows.length);
    }
    expect(await store.read({ workspaceId: restoredWorkspaceId, objectId: attachmentId })).toEqual(
      png,
    );
    const observations = createFinancialObservations(fixture.services),
      query = {
        accountIds: [accountId],
        reportingCurrencyId: usdId,
        asOf: exitAt,
        fxPolicy: { id: 'portable', maxAgeMilliseconds: 0, sourcePriority: ['portable-fixture'] },
        priceMaxAgeMilliseconds: 0,
        priceSourcePriority: ['portable-fixture'],
      };
    const before = await observations.valuation(fixture.owner.context, query),
      after = await observations.valuation(current, query);
    expect(after.nav).toEqual(before.nav);
    expect(after.nav).toMatchObject({
      state: 'available',
      value: { amount: '1006.623456789123456789' },
    });
    expect(
      (await request(fixture.outsider, fixture.outsider.context.workspaceId, 'restore', body, key))
        .status,
    ).toBe(201);
    await expect(
      fixture.services.authorizeWorkspace(
        new Request(origin, { headers: { cookie: fixture.owner.cookie } }),
        restoredWorkspaceId,
        'viewer',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const members = await fixture.admin.pool.query(
      'SELECT user_id,role FROM app.workspace_memberships WHERE workspace_id=$1',
      [restoredWorkspaceId],
    );
    expect(members.rows).toEqual([{ user_id: fixture.outsider.context.actorId, role: 'owner' }]);
    expect(copied.tables.find((table) => table.name === 'executions')!.rows[0]!.actor_id).toBe(
      fixture.owner.context.actorId,
    );
  });
  it('rejects corrupt media, incompatible code, invalid relationships and changed verification without exposing a new workspace', async () => {
    const before = await fixture.services.getWorkspaces(
      new Request(origin, { headers: { cookie: fixture.outsider.cookie } }),
    );
    const corrupt = structuredClone(archive);
    corrupt.media[0]!.contentBase64 = Buffer.from('bad').toString('base64');
    reseal(corrupt);
    await expect(
      portable.restore(
        fixture.outsider.context,
        { name: 'Invalid media', archive: corrupt },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WORKSPACE_ARCHIVE' });
    const missingCode = structuredClone(archive);
    missingCode.calculationManifest.kernel = 'unknown/99';
    reseal(missingCode);
    await expect(
      portable.restore(
        fixture.outsider.context,
        { name: 'Missing code', archive: missingCode },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INCOMPATIBLE_WORKSPACE_ARCHIVE' });
    const wrongTotals = structuredClone(archive);
    wrongTotals.verification = { unexpected: 'changed' };
    reseal(wrongTotals);
    await expect(
      portable.restore(
        fixture.outsider.context,
        { name: 'Wrong totals', archive: wrongTotals },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_FIDELITY_MISMATCH' });
    const badReference = structuredClone(archive);
    badReference.tables.find((table) => table.name === 'executions')!.rows[0]!.account_id =
      randomUUID();
    reseal(badReference);
    await expect(
      portable.restore(
        fixture.outsider.context,
        { name: 'Bad relationship', archive: badReference },
        randomUUID(),
      ),
    ).rejects.toBeDefined();
    const after = await fixture.services.getWorkspaces(
      new Request(origin, { headers: { cookie: fixture.outsider.cookie } }),
    );
    expect(after).toEqual(before);
  });
  it('enforces tenant read isolation, restore owner access and CSRF before accepting a backup', async () => {
    await expect(
      request(fixture.outsider, fixture.owner.context.workspaceId, 'backup'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      request(fixture.viewer, fixture.owner.context.workspaceId, 'backup'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      request(fixture.editor, fixture.owner.context.workspaceId, 'backup'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(portable.backup(fixture.viewer.context)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(
      (
        await request(fixture.viewer, fixture.owner.context.workspaceId, 'export', {
          kind: 'trades',
          format: 'json',
        })
      ).status,
    ).toBe(200);
    await expect(
      request(fixture.editor, fixture.owner.context.workspaceId, 'restore', {
        name: 'Denied',
        archive,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      api(
        new Request(`${origin}/restore`, {
          method: 'POST',
          headers: { cookie: fixture.owner.cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'No CSRF', archive }),
        }),
        fixture.owner.context.workspaceId,
        ['restore'],
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('cannot forge the restore flag to bypass ordinary lifecycle validation or invoke the definer without membership', async () => {
    await expect(
      fixture.services.withWorkspaceContext(fixture.owner.context, async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.portable_restore_workspace',${fixture.owner.context.workspaceId},true)`,
        );
        await tx.execute(
          sql`INSERT INTO app.strategies(workspace_id,id,current_version_id,revision,actor_id) VALUES(${fixture.owner.context.workspaceId}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,2,${fixture.owner.context.actorId})`,
        );
      }),
    ).rejects.toBeDefined();
    const runtime = createDatabase(process.env.TEST_APP_DATABASE_URL!);
    try {
      for (const workspaceId of [fixture.owner.context.workspaceId, randomUUID()]) {
        await expect(
          withTenantTransaction(
            runtime,
            { actorId: fixture.outsider.context.actorId, workspaceId },
            (tx) =>
              tx.execute(
                sql`SELECT app.restore_portable_workspace(${randomUUID()}::uuid,'Denied direct call',${randomUUID()}::uuid,${archive.sha256},${JSON.stringify(archive)}::jsonb)`,
              ),
          ),
        ).rejects.toMatchObject({ cause: { code: '42501' } });
      }
    } finally {
      await runtime.close();
    }
  });
  it('fails closed on malformed direct SQL envelopes, detached checksums and existing target namespaces', async () => {
    const run = (document: unknown, hash = archive.sha256, target: string = randomUUID()) =>
      fixture.services.withWorkspaceContext(fixture.owner.context, (tx) =>
        tx.execute(
          sql`SELECT app.restore_portable_workspace(${target}::uuid,'Denied malformed envelope',${randomUUID()}::uuid,${hash},${JSON.stringify(document)}::jsonb)`,
        ),
      );
    const nullName = structuredClone(archive) as unknown as {
      tables: Array<{ name: string | null; rows?: unknown[] }>;
    };
    nullName.tables[0]!.name = null;
    await expect(run(nullName)).rejects.toMatchObject({ cause: { code: '22023' } });
    const missingRows = structuredClone(archive) as unknown as {
      tables: Array<{ name: string; rows?: unknown[] }>;
    };
    delete missingRows.tables[0]!.rows;
    await expect(run(missingRows)).rejects.toMatchObject({ cause: { code: '22023' } });
    await expect(run({ ...archive, format: null })).rejects.toMatchObject({
      cause: { code: '22023' },
    });
    await expect(run(archive, 'f'.repeat(64))).rejects.toMatchObject({ cause: { code: '22023' } });
    await expect(
      run(archive, archive.sha256, fixture.owner.context.workspaceId),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      run(archive, archive.sha256, fixture.outsider.context.workspaceId),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });
  it('exports all required record categories with native decimals and spreadsheet-safe cells, and honors account/identity/time filters', async () => {
    const trades = await request(fixture.owner, fixture.owner.context.workspaceId, 'export', {
      kind: 'trades',
      format: 'csv',
      ids: [tradeId],
    });
    expect(await trades.text()).toContain('"\'=HYPERLINK(');
    const json = await (
      await request(fixture.owner, fixture.owner.context.workspaceId, 'export', {
        kind: 'trades',
        format: 'json',
        ids: [tradeId],
      })
    ).json();
    expect(json.rows[0].title).toMatch(/^=HYPERLINK/u);
    for (const kind of ['executions', 'cash', 'strategies', 'reviews'] as const) {
      const result = await request(fixture.owner, fixture.owner.context.workspaceId, 'export', {
        kind,
        format: 'json',
      });
      expect((await result.json()).rows.length).toBeGreaterThan(0);
    }
    const filtered = await request(fixture.owner, fixture.owner.context.workspaceId, 'export', {
      kind: 'executions',
      format: 'json',
      accountIds: [accountId],
      from: exitAt,
      to: '2025-02-03T00:00:00Z',
    });
    expect((await filtered.json()).rows).toHaveLength(1);
    const analytics = {
      accountIds: [accountId],
      reportingCurrencyId: usdId,
      from: at,
      to: '2030-01-01T00:00:00Z',
      fxPolicy: {
        id: 'portable',
        maxAgeMilliseconds: 365 * 86400000,
        sourcePriority: ['portable-fixture'],
      },
      priceMaxAgeMilliseconds: 365 * 86400000,
      priceSourcePriority: ['portable-fixture'],
    };
    const analyticsExport = await request(
      fixture.owner,
      fixture.owner.context.workspaceId,
      'export',
      { kind: 'analytics', format: 'json', analytics },
    );
    expect((await analyticsExport.json()).rows[0].context.population).toBe('campaign-attribution');
  });
});
