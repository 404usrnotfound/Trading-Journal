import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strategyDefinitionSchema, type StrategyDefinition } from '@journal/contracts';
import {
  createDatabase,
  createPersonalWorkspace,
  sql,
  withTenantTransaction,
  type Database,
  type DbTransaction,
  type TenantContext,
} from '@journal/database';
import {
  DATABASE_SCHEMA_VERSION,
  migrateDatabase,
  migrationsFolder,
  readMigrationFiles,
} from '@journal/database/migrate';

const tables = [
  'strategy_version_attachments',
  'trade_strategy_links',
  'strategy_commands',
  'strategy_versions',
  'strategies',
  'strategy_attachments',
] as const;
const instant = '2025-06-03T10:00:00.123456Z';
const hash = (input: string) => createHash('sha256').update(input).digest('hex');
const definition = (changes: Partial<StrategyDefinition> = {}) =>
  strategyDefinitionSchema.parse({
    name: 'RSI reversal',
    status: 'active',
    description: 'Explicit playbook, independent of broker and account.',
    assetClasses: ['stock', 'ETF'],
    markets: ['US'],
    timeframes: ['1h'],
    direction: 'long',
    entryRules: 'RSI crosses 30',
    riskRules: 'Use the separately recorded risk policy.',
    ...changes,
  });

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? postgresCode(error.cause) : undefined;
}

async function rejected(operation: Promise<unknown>, expectedCode: string): Promise<void> {
  try {
    await operation;
    throw new Error('An invalid strategy transaction was accepted');
  } catch (error) {
    expect(postgresCode(error)).toBe(expectedCode);
  }
}

describe('strategy publications and trade pins independently enforce PostgreSQL integrity', () => {
  let admin: Database;
  let app: Database;
  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const workspaces = [randomUUID(), randomUUID()];
  const owner: TenantContext = { actorId: users[0]!, workspaceId: workspaces[0]! };
  const outsider: TenantContext = { actorId: users[1]!, workspaceId: workspaces[1]! };
  const viewer: TenantContext = { actorId: users[2]!, workspaceId: workspaces[0]! };
  const editor: TenantContext = { actorId: users[3]!, workspaceId: workspaces[0]! };
  let strategy: { id: string; versionId: string };
  let otherStrategy: { id: string; versionId: string };
  const oldTrade = randomUUID();

  async function version(
    tx: DbTransaction,
    context: TenantContext,
    strategyId: string,
    versionId: string,
    number: number,
    snapshot: unknown = definition(),
  ): Promise<void> {
    await tx.execute(sql`INSERT INTO app.strategy_versions
      (workspace_id,id,strategy_id,version,effective_at,definition,definition_hash,change_reason)
      VALUES (${context.workspaceId}::uuid,${versionId}::uuid,${strategyId}::uuid,${number},${instant}::timestamptz,
      ${JSON.stringify(snapshot)}::jsonb,${hash(JSON.stringify(snapshot))},'Reviewed publication')`);
  }

  async function create(
    context: TenantContext = owner,
    snapshot: unknown = definition(),
  ): Promise<{ id: string; versionId: string }> {
    const identity = { id: randomUUID(), versionId: randomUUID() };
    await withTenantTransaction(app, context, async (tx) => {
      await tx.execute(sql`INSERT INTO app.strategies(workspace_id,id,current_version_id)
        VALUES (${context.workspaceId}::uuid,${identity.id}::uuid,${identity.versionId}::uuid)`);
      await version(tx, context, identity.id, identity.versionId, 1, snapshot);
    });
    return identity;
  }

  async function next(strategyId: string, snapshot = definition()): Promise<string> {
    const id = randomUUID();
    await withTenantTransaction(app, editor, async (tx) => {
      const current = await tx.execute<{ revision: number }>(sql`SELECT revision FROM app.strategies
        WHERE workspace_id=${owner.workspaceId}::uuid AND id=${strategyId}::uuid FOR UPDATE`);
      const revision = current.rows[0]!.revision + 1;
      await version(tx, editor, strategyId, id, revision, snapshot);
      await tx.execute(sql`UPDATE app.strategies SET current_version_id=${id}::uuid,revision=${revision},updated_at=now()
        WHERE workspace_id=${owner.workspaceId}::uuid AND id=${strategyId}::uuid`);
    });
    return id;
  }

  async function link(
    tx: DbTransaction,
    tradeId: string,
    selected = strategy,
    timing = 'retrospective',
  ) {
    await tx.execute(sql`INSERT INTO app.trade_strategy_links(workspace_id,trade_id,strategy_id,strategy_version_id,timing,reason)
      VALUES (${owner.workspaceId}::uuid,${tradeId}::uuid,${selected.id}::uuid,${selected.versionId}::uuid,${timing},'Explicit historical classification')`);
  }

  async function attachment(): Promise<string> {
    const id = randomUUID();
    await withTenantTransaction(app, editor, async (tx) => {
      await tx.execute(sql`INSERT INTO app.strategy_attachments(workspace_id,id,command_id,payload_sha256,name,media_type,size,sha256,storage_key)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${randomUUID()}::uuid,${hash(id)},'Setup.png','image/png',100,${hash('bytes')},${id})`);
    });
    return id;
  }

  async function ready(id: string) {
    await withTenantTransaction(app, editor, (tx) =>
      tx.execute(sql`UPDATE app.strategy_attachments SET state='ready',ready_at=now()
        WHERE workspace_id=${owner.workspaceId}::uuid AND id=${id}::uuid`),
    );
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || !process.env.TEST_APP_DATABASE_URL)
      throw new Error('Dedicated PostgreSQL integration URLs are required');
    admin = createDatabase(process.env.TEST_DATABASE_URL);
    app = createDatabase(process.env.TEST_APP_DATABASE_URL);
    for (const id of users)
      await admin.pool.query('INSERT INTO auth."user"(id,name,email) VALUES ($1,$2,$3)', [
        id,
        'Strategy database fixture',
        `${id}@example.test`,
      ]);
    for (const [index, id] of workspaces.entries()) {
      await admin.pool.query('INSERT INTO app.workspaces(id,name,created_by) VALUES ($1,$2,$3)', [
        id,
        'Strategy database workspace',
        users[index],
      ]);
      await admin.pool.query(
        'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
        [id, users[index], 'owner'],
      );
    }
    for (const context of [viewer, editor])
      await admin.pool.query(
        'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
        [context.workspaceId, context.actorId, context === viewer ? 'viewer' : 'editor'],
      );
    await withTenantTransaction(app, owner, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.financial_state(workspace_id,revision) VALUES (${owner.workspaceId}::uuid,0)`,
      );
      await tx.execute(sql`INSERT INTO app.trades(workspace_id,id,title,classification)
        VALUES (${owner.workspaceId}::uuid,${oldTrade}::uuid,'Existing unclassified trade','active-trading')`);
    });
    strategy = await create();
    otherStrategy = await create(outsider);
  });

  afterAll(async () => {
    try {
      if (admin)
        await admin.db.transaction(async (tx) => {
          // Test-operator-only cleanup bypasses immutable history in this scoped fixture.
          // Runtime roles cannot set this session option; it expires on rollback/commit.
          await tx.execute(sql`SET LOCAL session_replication_role = replica`);
          for (const table of [
            ...tables,
            'trades',
            'financial_state',
            'audit_events',
            'workspace_memberships',
          ])
            await tx.execute(
              sql`DELETE FROM ${sql.identifier('app')}.${sql.identifier(table)} WHERE workspace_id=ANY(${sql.param(workspaces)}::uuid[])`,
            );
          await tx.execute(
            sql`DELETE FROM app.workspaces WHERE id=ANY(${sql.param(workspaces)}::uuid[])`,
          );
          await tx.execute(sql`DELETE FROM auth."user" WHERE id=ANY(${sql.param(users)}::text[])`);
        });
    } finally {
      await Promise.all([admin, app].filter(Boolean).map((database) => database.close()));
    }
  });

  it('forces tenant RLS and uses a nonowner runtime role on all six strategy tables', async () => {
    const role = await app.pool.query(
      'SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
    );
    expect(role.rows).toEqual([{ name: 'journal_app', rolsuper: false, rolbypassrls: false }]);
    const rows = await admin.pool.query(
      "SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relnamespace='app'::regnamespace AND relname=ANY($1::text[])",
      [tables],
    );
    expect(rows.rows).toHaveLength(6);
    expect(
      rows.rows.every(
        (row) => row.relrowsecurity && row.relforcerowsecurity && row.owner === 'journal_migrator',
      ),
    ).toBe(true);
  });

  it('allows viewer reads while blocking viewer writes and actor spoofing', async () => {
    const rows = await withTenantTransaction(app, viewer, (tx) =>
      tx.execute(sql`SELECT id FROM app.strategies WHERE id=${strategy.id}::uuid`),
    );
    expect(rows.rows).toHaveLength(1);
    await rejected(create(viewer), '42501');
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`INSERT INTO app.strategies(workspace_id,id,current_version_id,actor_id) VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,${outsider.actorId})`,
        ),
      ),
      '42501',
    );
    await rejected(app.pool.query('SET session_replication_role = replica'), '42501');
  });

  it('does not expose another workspace identity or allow a foreign current-version pointer', async () => {
    const rows = await withTenantTransaction(app, owner, (tx) =>
      tx.execute(sql`SELECT id FROM app.strategies WHERE id=${otherStrategy.id}::uuid`),
    );
    expect(rows.rows).toEqual([]);
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const id = randomUUID();
        await tx.execute(
          sql`INSERT INTO app.strategies(workspace_id,id,current_version_id) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${otherStrategy.versionId}::uuid)`,
        );
        await version(tx, owner, id, randomUUID(), 1);
      }),
      '23503',
    );
  });

  it('lets editors publish a complete new snapshot while retaining the original RSI rule', async () => {
    const revised = await next(strategy.id, definition({ entryRules: 'RSI crosses 35' }));
    const rows = await admin.pool.query(
      'SELECT id,version,definition FROM app.strategy_versions WHERE workspace_id=$1 AND strategy_id=$2 ORDER BY version',
      [owner.workspaceId, strategy.id],
    );
    expect(rows.rows.map((row) => [row.version, row.definition.entryRules])).toEqual([
      [1, 'RSI crosses 30'],
      [2, 'RSI crosses 35'],
    ]);
    const current = await admin.pool.query(
      'SELECT current_version_id,revision FROM app.strategies WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, strategy.id],
    );
    expect(current.rows).toEqual([{ current_version_id: revised, revision: 2 }]);
  });

  it('rejects published version mutation independently even for the test operator', async () => {
    await rejected(
      admin.pool.query(
        'UPDATE app.strategy_versions SET definition=definition || \'{"entryRules":"rewritten"}\'::jsonb WHERE workspace_id=$1 AND id=$2',
        [owner.workspaceId, strategy.versionId],
      ),
      '55000',
    );
    await rejected(
      admin.pool.query('DELETE FROM app.strategy_versions WHERE workspace_id=$1 AND id=$2', [
        owner.workspaceId,
        strategy.versionId,
      ]),
      '55000',
    );
    const rights = await admin.pool.query(
      "SELECT has_table_privilege('journal_app','app.strategy_versions','UPDATE') AS editable,has_table_privilege('journal_app','app.strategy_versions','DELETE') AS removable",
    );
    expect(rights.rows).toEqual([{ editable: false, removable: false }]);
  });

  it('rejects skipped/duplicate version numbers and incomplete publication transactions', async () => {
    await rejected(
      withTenantTransaction(app, owner, (tx) => version(tx, owner, strategy.id, randomUUID(), 4)),
      '23514',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) => version(tx, owner, strategy.id, randomUUID(), 2)),
      '23514',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) => version(tx, owner, strategy.id, randomUUID(), 3)),
      '23514',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.strategies SET current_version_id=${strategy.versionId}::uuid,revision=revision+1 WHERE workspace_id=${owner.workspaceId}::uuid AND id=${strategy.id}::uuid`,
        ),
      ),
      '23514',
    );
  });

  it('rejects malformed snapshots, binary-number decimal parameters, and invalid checklist references directly in SQL', async () => {
    const invalid = [
      { name: 'Missing fields' },
      { ...definition(), name: ' ' },
      {
        ...definition(),
        parameters: [
          {
            id: randomUUID(),
            name: 'RSI',
            description: '',
            type: 'decimal',
            value: 30.5,
            minimum: null,
            maximum: null,
            unit: null,
          },
        ],
      },
      {
        ...definition(),
        setups: [
          {
            id: randomUUID(),
            name: 'Invalid checklist reference',
            description: '',
            conditions: '',
            checklistItemIds: [randomUUID()],
          },
        ],
      },
      { ...definition(), tags: ['duplicate', 'duplicate'] },
      { ...definition(), attachmentIds: ['not-a-uuid'] },
    ];
    for (const snapshot of invalid) await rejected(create(owner, snapshot), '23514');
  });

  it('preserves exact decimal parameter bounds and refuses an out-of-range value', async () => {
    const parameter = {
      id: randomUUID(),
      name: 'Threshold',
      description: '',
      type: 'decimal' as const,
      value: '0.100000000000000000000000000000000001',
      minimum: '0.1',
      maximum: '0.100000000000000000000000000000000002',
      unit: null,
    };
    const snapshot = definition({ parameters: [parameter] });
    const accepted = await create(owner, snapshot);
    const rows = await admin.pool.query(
      'SELECT definition FROM app.strategy_versions WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, accepted.versionId],
    );
    expect(rows.rows[0].definition.parameters[0]).toEqual(parameter);
    await rejected(
      create(owner, {
        ...snapshot,
        parameters: [{ ...parameter, value: '0.100000000000000000000000000000000003' }],
      }),
      '23514',
    );
  });

  it('preserves accepted decimal source text including negative zero and insignificant trailing zeros', async () => {
    const sourceValues = ['0.1000', '-0', '1.000', `0.${'0'.repeat(510)}`, `0.1${'0'.repeat(509)}`];
    const parameters = sourceValues.map((value, index) => ({
      id: randomUUID(),
      name: `Source decimal ${index}`,
      description: '',
      type: 'decimal' as const,
      value,
      minimum: '-0',
      maximum: '1.000',
      unit: null,
    }));
    const snapshot = definition({ parameters });
    const accepted = await create(owner, snapshot);
    const rows = await admin.pool.query(
      'SELECT definition FROM app.strategy_versions WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, accepted.versionId],
    );
    expect(rows.rows[0].definition.parameters).toEqual(parameters);
  });

  it('rejects scientific notation and material decimal overprecision directly in SQL before numeric comparison', async () => {
    const parameter = {
      id: randomUUID(),
      name: 'Threshold',
      description: '',
      type: 'decimal' as const,
      value: '0.1',
      minimum: null,
      maximum: null,
      unit: null,
    };
    const snapshot = definition({ parameters: [parameter] });
    for (const value of [
      '1e-3',
      'NaN',
      '00.1',
      `0.${'0'.repeat(36)}1`,
      '1'.repeat(43),
      `0.${'0'.repeat(511)}`,
    ]) {
      const invalid = { ...snapshot, parameters: [{ ...parameter, value }] };
      expect(strategyDefinitionSchema.safeParse(invalid).success).toBe(false);
      await rejected(create(owner, invalid), '23514');
    }
  });

  it('rejects a total strategy definition larger than the shared compact UTF-8 byte bound directly in SQL', async () => {
    const fields = [
      'description',
      'setupConditions',
      'entryRules',
      'confirmationRules',
      'invalidationRules',
      'stopLossMethodology',
      'takeProfitMethodology',
      'riskRules',
      'positionSizingRules',
      'exitRules',
      'notes',
    ];
    const oversized = {
      ...definition(),
      ...Object.fromEntries(fields.map((field) => [field, 'x'.repeat(20_000)])),
    };
    expect(new TextEncoder().encode(JSON.stringify(oversized)).byteLength).toBeGreaterThan(196_608);
    expect(strategyDefinitionSchema.safeParse(oversized).success).toBe(false);
    await rejected(create(owner, oversized), '23514');
  });

  it('counts exact compact UTF-8 bytes at the boundary without stripping delimiter-like text inside strings', async () => {
    const fields = [
      'description',
      'setupConditions',
      'entryRules',
      'confirmationRules',
      'invalidationRules',
      'stopLossMethodology',
      'takeProfitMethodology',
      'riskRules',
      'positionSizingRules',
      'exitRules',
      'notes',
    ] as const;
    const snapshot = definition({
      ...Object.fromEntries(fields.map((field) => [field, ''])),
      name: 'Reversal, region: Europe ☕',
      tags: ['Comma, space', 'Colon: space'],
      checklist: [{ id: randomUUID(), label: 'Quote " and slash \\', required: true }],
      parameters: [
        {
          id: randomUUID(),
          name: 'Enabled',
          description: 'Unicode é and newline\n',
          type: 'boolean',
          value: true,
        },
      ],
    });
    let remaining = 196_608 - new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    for (const field of fields) {
      const length = Math.min(20_000, remaining);
      snapshot[field] = ', : '.repeat(Math.ceil(length / 4)).slice(0, length);
      remaining -= length;
    }
    expect(remaining).toBe(0);
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength).toBe(196_608);
    expect(strategyDefinitionSchema.safeParse(snapshot).success).toBe(true);
    const accepted = await create(owner, snapshot);
    const rows = await admin.pool.query(
      'SELECT definition,app.strategy_json_bytes(definition) AS compact_bytes,octet_length(definition::text) AS postgres_bytes FROM app.strategy_versions WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, accepted.versionId],
    );
    expect(rows.rows[0]).toMatchObject({ definition: snapshot, compact_bytes: 196_608 });
    expect(rows.rows[0].postgres_bytes).toBeGreaterThan(196_608);
    const tooLarge = { ...snapshot, notes: `${snapshot.notes}x` };
    expect(strategyDefinitionSchema.safeParse(tooLarge).success).toBe(false);
    await rejected(create(owner, tooLarge), '23514');
  });

  it('rejects unknown nested fields so every accepted snapshot remains readable by the strict contract', async () => {
    const snapshots = [
      definition({ checklist: [{ id: randomUUID(), label: 'Confirm setup', required: true }] }),
      definition({
        setups: [
          {
            id: randomUUID(),
            name: 'Reversal',
            description: '',
            conditions: '',
            checklistItemIds: [],
          },
        ],
      }),
      definition({
        parameters: [
          {
            id: randomUUID(),
            name: 'Threshold',
            description: '',
            type: 'decimal',
            value: '30',
            minimum: null,
            maximum: null,
            unit: null,
          },
        ],
      }),
      definition({
        parameters: [
          { id: randomUUID(), name: 'Confirm', description: '', type: 'boolean', value: true },
        ],
      }),
      definition({
        parameters: [
          { id: randomUUID(), name: 'Session', description: '', type: 'text', value: 'US' },
        ],
      }),
      definition({
        parameters: [
          {
            id: randomUUID(),
            name: 'Direction',
            description: '',
            type: 'enum',
            value: 'long',
            options: ['long', 'short'],
          },
        ],
      }),
    ];
    for (const snapshot of snapshots) {
      const key = snapshot.checklist.length
        ? 'checklist'
        : snapshot.setups.length
          ? 'setups'
          : 'parameters';
      const invalid = {
        ...snapshot,
        [key]: [{ ...snapshot[key][0], unexpected: 'Unreadable metadata' }],
      };
      expect(strategyDefinitionSchema.safeParse(invalid).success).toBe(false);
      await rejected(create(owner, invalid), '23514');
    }
  });

  it('keeps retrospective trade assignment pinned to v1 after v2 is published', async () => {
    await withTenantTransaction(app, owner, (tx) => link(tx, oldTrade));
    const rows = await admin.pool.query(
      'SELECT l.strategy_version_id,l.timing,v.version,v.definition FROM app.trade_strategy_links l JOIN app.strategy_versions v ON (v.workspace_id,v.id)=(l.workspace_id,l.strategy_version_id) WHERE l.workspace_id=$1 AND l.trade_id=$2',
      [owner.workspaceId, oldTrade],
    );
    expect(rows.rows[0]).toMatchObject({
      strategy_version_id: strategy.versionId,
      timing: 'retrospective',
      version: 1,
      definition: { entryRules: 'RSI crosses 30' },
    });
    await rejected(
      withTenantTransaction(app, owner, (tx) => link(tx, oldTrade)),
      '23505',
    );
    await rejected(
      admin.pool.query(
        "UPDATE app.trade_strategy_links SET reason='rewrite' WHERE workspace_id=$1 AND trade_id=$2",
        [owner.workspaceId, oldTrade],
      ),
      '55000',
    );
    await rejected(
      admin.pool.query(
        'DELETE FROM app.trade_strategy_links WHERE workspace_id=$1 AND trade_id=$2',
        [owner.workspaceId, oldTrade],
      ),
      '55000',
    );
  });

  it('marks a late assignment retrospective and supports a pin in the trade-creation transaction', async () => {
    const old = randomUUID();
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`INSERT INTO app.trades(workspace_id,id,title,classification) VALUES (${owner.workspaceId}::uuid,${old}::uuid,'Older idea','investing')`,
      ),
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) => link(tx, old, strategy, 'recorded-with-trade')),
      '23514',
    );
    await withTenantTransaction(app, owner, (tx) => link(tx, old));
    const fresh = randomUUID();
    await withTenantTransaction(app, owner, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.trades(workspace_id,id,title,classification) VALUES (${owner.workspaceId}::uuid,${fresh}::uuid,'New idea','active-trading')`,
      );
      await link(tx, fresh, strategy, 'recorded-with-trade');
    });
    expect(
      (
        await admin.pool.query(
          'SELECT timing FROM app.trade_strategy_links WHERE workspace_id=$1 AND trade_id=$2',
          [owner.workspaceId, fresh],
        )
      ).rows,
    ).toEqual([{ timing: 'recorded-with-trade' }]);
  });

  it('rejects a trade pin whose strategy identity does not match the selected version', async () => {
    const second = await create();
    const tradeId = randomUUID();
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        await tx.execute(
          sql`INSERT INTO app.trades(workspace_id,id,title,classification) VALUES (${owner.workspaceId}::uuid,${tradeId}::uuid,'Mismatch','investing')`,
        );
        await link(
          tx,
          tradeId,
          { id: second.id, versionId: strategy.versionId },
          'recorded-with-trade',
        );
      }),
      '23503',
    );
  });

  it('rejects direct SQL assignment to an archived trade without creating a historical pin', async () => {
    const tradeId = randomUUID();
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`INSERT INTO app.trades(workspace_id,id,title,classification,archived_at) VALUES (${owner.workspaceId}::uuid,${tradeId}::uuid,'Archived campaign','investing',now())`,
      ),
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) => link(tx, tradeId)),
      '23514',
    );
    expect(
      (
        await admin.pool.query(
          'SELECT * FROM app.trade_strategy_links WHERE workspace_id=$1 AND trade_id=$2',
          [owner.workspaceId, tradeId],
        )
      ).rows,
    ).toEqual([]);
  });

  it('requires ready files and an exact immutable reference set before a version commits', async () => {
    const attachmentId = await attachment();
    await rejected(create(owner, definition({ attachmentIds: [attachmentId] })), '23514');
    const candidate = { id: randomUUID(), versionId: randomUUID() };
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        await tx.execute(
          sql`INSERT INTO app.strategies(workspace_id,id,current_version_id) VALUES (${owner.workspaceId}::uuid,${candidate.id}::uuid,${candidate.versionId}::uuid)`,
        );
        await version(
          tx,
          owner,
          candidate.id,
          candidate.versionId,
          1,
          definition({ attachmentIds: [attachmentId] }),
        );
        await tx.execute(
          sql`INSERT INTO app.strategy_version_attachments(workspace_id,strategy_version_id,attachment_id) VALUES (${owner.workspaceId}::uuid,${candidate.versionId}::uuid,${attachmentId}::uuid)`,
        );
      }),
      '23514',
    );
    await ready(attachmentId);
    await withTenantTransaction(app, owner, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.strategies(workspace_id,id,current_version_id) VALUES (${owner.workspaceId}::uuid,${candidate.id}::uuid,${candidate.versionId}::uuid)`,
      );
      await version(
        tx,
        owner,
        candidate.id,
        candidate.versionId,
        1,
        definition({ attachmentIds: [attachmentId] }),
      );
      await tx.execute(
        sql`INSERT INTO app.strategy_version_attachments(workspace_id,strategy_version_id,attachment_id) VALUES (${owner.workspaceId}::uuid,${candidate.versionId}::uuid,${attachmentId}::uuid)`,
      );
    });
    await next(
      candidate.id,
      definition({ notes: 'Removed from current rules; v1 still retains its screenshot.' }),
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.strategy_attachments SET state='removed',removed_at=now() WHERE workspace_id=${owner.workspaceId}::uuid AND id=${attachmentId}::uuid`,
        ),
      ),
      '23514',
    );
    await rejected(
      admin.pool.query(
        'DELETE FROM app.strategy_version_attachments WHERE workspace_id=$1 AND strategy_version_id=$2',
        [owner.workspaceId, candidate.versionId],
      ),
      '55000',
    );
  });

  it('rejects cross-workspace and undeclared attachment references', async () => {
    const attachmentId = await attachment();
    await ready(attachmentId);
    await rejected(
      withTenantTransaction(app, outsider, (tx) =>
        tx.execute(
          sql`INSERT INTO app.strategy_version_attachments(workspace_id,strategy_version_id,attachment_id) VALUES (${outsider.workspaceId}::uuid,${otherStrategy.versionId}::uuid,${attachmentId}::uuid)`,
        ),
      ),
      '23503',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`INSERT INTO app.strategy_version_attachments(workspace_id,strategy_version_id,attachment_id) VALUES (${owner.workspaceId}::uuid,${strategy.versionId}::uuid,${attachmentId}::uuid)`,
        ),
      ),
      '23514',
    );
  });

  it('preserves payload metadata and restricts ready/removed lifecycle transitions', async () => {
    const id = await attachment();
    await rejected(
      admin.pool.query(
        "UPDATE app.strategy_attachments SET sha256=repeat('a',64) WHERE workspace_id=$1 AND id=$2",
        [owner.workspaceId, id],
      ),
      '23514',
    );
    await ready(id);
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`UPDATE app.strategy_attachments SET state='removed',removed_at=now() WHERE workspace_id=${owner.workspaceId}::uuid AND id=${id}::uuid`,
      ),
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.strategy_attachments SET state='ready',removed_at=NULL WHERE workspace_id=${owner.workspaceId}::uuid AND id=${id}::uuid`,
        ),
      ),
      '23514',
    );
    await rejected(
      admin.pool.query('DELETE FROM app.strategy_attachments WHERE workspace_id=$1 AND id=$2', [
        owner.workspaceId,
        id,
      ]),
      '55000',
    );
  });

  it('archives identity without deleting versions or historical trade references', async () => {
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.strategies SET archived_at=now(),revision=revision+1 WHERE workspace_id=${owner.workspaceId}::uuid AND id=${strategy.id}::uuid`,
        ),
      ),
      '23514',
    );
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`UPDATE app.strategies SET archived_at=now(),archive_reason='Superseded playbook',revision=revision+1,updated_at=now() WHERE workspace_id=${owner.workspaceId}::uuid AND id=${strategy.id}::uuid`,
      ),
    );
    expect(
      (
        await admin.pool.query(
          'SELECT strategy_version_id FROM app.trade_strategy_links WHERE workspace_id=$1 AND trade_id=$2',
          [owner.workspaceId, oldTrade],
        )
      ).rows,
    ).toEqual([{ strategy_version_id: strategy.versionId }]);
    await rejected(
      withTenantTransaction(app, owner, (tx) => version(tx, owner, strategy.id, randomUUID(), 3)),
      '23514',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.strategies SET archived_at=NULL,archive_reason=NULL,revision=revision+1 WHERE workspace_id=${owner.workspaceId}::uuid AND id=${strategy.id}::uuid`,
        ),
      ),
      '23514',
    );
    await rejected(
      admin.pool.query('DELETE FROM app.strategies WHERE workspace_id=$1 AND id=$2', [
        owner.workspaceId,
        strategy.id,
      ]),
      '55000',
    );
  });

  it('records immutable idempotency results with an audit FK without changing ledger revision', async () => {
    const id = randomUUID();
    const auditId = randomUUID();
    const key = randomUUID();
    await withTenantTransaction(app, editor, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.strategy_commands(workspace_id,id,idempotency_key,request_hash,kind,result,audit_event_id) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${key}::uuid,${hash('request')},'strategy.fixture','{"version":1}'::jsonb,${auditId}::uuid)`,
      );
      await tx.execute(
        sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action) VALUES (${owner.workspaceId}::uuid,${auditId}::uuid,${editor.actorId},'strategy.fixture')`,
      );
    });
    expect(
      (
        await admin.pool.query('SELECT revision FROM app.financial_state WHERE workspace_id=$1', [
          owner.workspaceId,
        ])
      ).rows,
    ).toEqual([{ revision: 0 }]);
    await rejected(
      withTenantTransaction(app, editor, (tx) =>
        tx.execute(
          sql`INSERT INTO app.strategy_commands(workspace_id,id,idempotency_key,request_hash,kind,result,audit_event_id) VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${key}::uuid,${hash('changed')},'strategy.fixture','{}'::jsonb,${randomUUID()}::uuid)`,
        ),
      ),
      '23505',
    );
    await rejected(
      withTenantTransaction(app, editor, (tx) =>
        tx.execute(
          sql`INSERT INTO app.strategy_commands(workspace_id,id,idempotency_key,request_hash,kind,result,audit_event_id) VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,${hash('request')},'strategy.fixture','{}'::jsonb,${randomUUID()}::uuid)`,
        ),
      ),
      '23503',
    );
    await rejected(
      admin.pool.query(
        "UPDATE app.strategy_commands SET result='{}'::jsonb WHERE workspace_id=$1 AND id=$2",
        [owner.workspaceId, id],
      ),
      '55000',
    );
  });

  it('serializes concurrent publications and leaves contiguous immutable history', async () => {
    const concurrent = await create();
    await Promise.all([
      next(concurrent.id, definition({ entryRules: 'Threshold 31' })),
      next(concurrent.id, definition({ entryRules: 'Threshold 32' })),
    ]);
    const versions = await admin.pool.query(
      'SELECT version FROM app.strategy_versions WHERE workspace_id=$1 AND strategy_id=$2 ORDER BY version',
      [owner.workspaceId, concurrent.id],
    );
    expect(versions.rows).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
  });
});

describe('additive Phase 5 upgrade preserves the published Phase 4 financial ledger', () => {
  it('applies additive strategy migrations to an exact 0000–0002 prefix without rewriting source data or classifying old trades', async () => {
    const operatorUrl = process.env.TEST_DATABASE_URL;
    if (!operatorUrl) throw new Error('Dedicated operator URL required');
    const operator = createDatabase(operatorUrl, { max: 1 });
    const databaseName = `journal_strategy_upgrade_${randomUUID().replaceAll('-', '')}_test`;
    const url = new URL(operatorUrl);
    url.pathname = `/${databaseName}`;
    let database: Database | undefined;
    let created = false;
    try {
      await operator.pool.query(`CREATE DATABASE "${databaseName}"`);
      created = true;
      database = createDatabase(url.toString(), { max: 1 });
      const reviewed = readMigrationFiles({ migrationsFolder });
      expect(reviewed).toHaveLength(DATABASE_SCHEMA_VERSION);
      await database.db.transaction(async (tx) => {
        for (const migration of reviewed.slice(0, 3))
          for (const statement of migration.sql) await tx.execute(sql.raw(statement));
        await tx.execute(sql`CREATE SCHEMA migrations`);
        await tx.execute(
          sql`CREATE TABLE migrations.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)`,
        );
        for (const migration of reviewed.slice(0, 3))
          await tx.execute(
            sql`INSERT INTO migrations.__drizzle_migrations(hash,created_at) VALUES (${migration.hash},${migration.folderMillis})`,
          );
      });
      const actor = randomUUID();
      await database.pool.query('INSERT INTO auth."user"(id,name,email) VALUES ($1,$2,$3)', [
        actor,
        'Phase 4 preserved owner',
        `${actor}@example.test`,
      ]);
      const workspace = await createPersonalWorkspace(database, actor, {
        name: 'Preserved financial history',
      });
      const context = { actorId: actor, workspaceId: workspace.id };
      const currency = randomUUID();
      const account = randomUUID();
      const bucket = randomUUID();
      const tradeId = randomUUID();
      const commandId = randomUUID();
      const auditId = randomUUID();
      const cashId = randomUUID();
      const eventId = randomUUID();
      await withTenantTransaction(database, context, async (tx) => {
        await tx.execute(
          sql`INSERT INTO app.financial_state(workspace_id,revision) VALUES (${workspace.id}::uuid,0)`,
        );
        await tx.execute(
          sql`INSERT INTO app.currencies(workspace_id,id,namespace,code,kind,unit_identity,name) VALUES (${workspace.id}::uuid,${currency}::uuid,'iso','USD','fiat','iso:USD','US dollar')`,
        );
        await tx.execute(
          sql`INSERT INTO app.accounts(workspace_id,id,name,environment,account_type) VALUES (${workspace.id}::uuid,${account}::uuid,'Existing broker-independent account','live','cash')`,
        );
        await tx.execute(
          sql`INSERT INTO app.cash_buckets(workspace_id,id,account_id,currency_id,category) VALUES (${workspace.id}::uuid,${bucket}::uuid,${account}::uuid,${currency}::uuid,'settled')`,
        );
        await tx.execute(
          sql`INSERT INTO app.trades(workspace_id,id,title,classification) VALUES (${workspace.id}::uuid,${tradeId}::uuid,'Pre-strategy unclassified trade','active-trading')`,
        );
      });
      await withTenantTransaction(database, context, async (tx) => {
        await tx.execute(
          sql`UPDATE app.financial_state SET revision=1 WHERE workspace_id=${workspace.id}::uuid`,
        );
        await tx.execute(
          sql`INSERT INTO app.cash_movements(workspace_id,id,command_id,source_revision,account_id,cash_bucket_id,currency_id,amount_raw,kind,economic_at) VALUES (${workspace.id}::uuid,${cashId}::uuid,${commandId}::uuid,1,${account}::uuid,${bucket}::uuid,${currency}::uuid,'10.25','deposit',${instant}::timestamptz)`,
        );
        await tx.execute(
          sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at,cash_movement_id) VALUES (${workspace.id}::uuid,${eventId}::uuid,${commandId}::uuid,1,${eventId},${currency}::uuid,'deposit',${instant}::timestamptz,${cashId}::uuid)`,
        );
        await tx.execute(
          sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,cash_bucket_id,amount_raw) VALUES (${workspace.id}::uuid,${randomUUID()}::uuid,${eventId}::uuid,${currency}::uuid,${bucket}::uuid,'10.25')`,
        );
        await tx.execute(
          sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,control_key,amount_raw) VALUES (${workspace.id}::uuid,${randomUUID()}::uuid,${eventId}::uuid,${currency}::uuid,'external_contribution','-10.25')`,
        );
        await tx.execute(
          sql`INSERT INTO app.financial_commands(workspace_id,id,audit_event_id,idempotency_key,request_hash,kind,result,source_revision) VALUES (${workspace.id}::uuid,${commandId}::uuid,${auditId}::uuid,${commandId},${hash(commandId)},'upgrade-fixture','{}'::jsonb,1)`,
        );
        await tx.execute(
          sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action) VALUES (${workspace.id}::uuid,${auditId}::uuid,${actor},'financial.upgrade-fixture')`,
        );
        await tx.execute(
          sql`INSERT INTO app.outbox_events(workspace_id,id,command_id,source_revision,event_kind,payload) VALUES (${workspace.id}::uuid,${randomUUID()}::uuid,${commandId}::uuid,1,'financial.upgrade-fixture','{}'::jsonb)`,
        );
      });
      const priorTables = await database.pool.query<{ schema_name: string; table_name: string }>(
        "SELECT table_schema AS schema_name,table_name FROM information_schema.tables WHERE table_schema IN ('app','auth') AND table_name<>'schema_metadata' ORDER BY table_schema,table_name",
      );
      const previousColumns = await database.pool.query<{
        table_schema: string;
        table_name: string;
        column_name: string;
      }>(
        "SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema IN ('app','auth') ORDER BY table_schema,table_name,ordinal_position",
      );
      const records = async () => {
        const values: Record<string, unknown> = {};
        for (const table of priorTables.rows) {
          const columns = previousColumns.rows
            .filter(
              (column) =>
                column.table_schema === table.schema_name && column.table_name === table.table_name,
            )
            .map((column) => column.column_name);
          if (!columns.length || columns.some((column) => !/^[a-zA-Z0-9_]+$/u.test(column)))
            throw new Error('Unexpected original migration column metadata');
          // Additive nullable columns are permitted. Compare every original column,
          // including its null values, rather than conflating schema growth with data rewrites.
          const binding = `{${columns.join(',')}}`;
          const rows = await database!.db.execute(
            sql`SELECT COALESCE(jsonb_agg(original_record ORDER BY original_record::text),'[]'::jsonb) AS records
              FROM (SELECT (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(source))
                WHERE key=ANY(${binding}::text[])) AS original_record
                FROM ${sql.identifier(table.schema_name)}.${sql.identifier(table.table_name)} AS source) AS original_columns`,
          );
          values[`${table.schema_name}.${table.table_name}`] = rows.rows[0]!.records;
        }
        return values;
      };
      const before = await records();
      const history = await database.pool.query(
        'SELECT hash,created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
      );
      expect(history.rows).toEqual(
        reviewed.slice(0, 3).map((migration) => ({
          hash: migration.hash,
          created_at: String(migration.folderMillis),
        })),
      );
      await migrateDatabase(url.toString());
      await migrateDatabase(url.toString());
      expect(await records()).toEqual(before);
      expect(
        (
          await database.pool.query(
            'SELECT account_cash_event_id,cash_transfer_id,cash_transfer_receipt_id FROM app.ledger_events',
          )
        ).rows,
      ).toEqual([
        { account_cash_event_id: null, cash_transfer_id: null, cash_transfer_receipt_id: null },
      ]);
      expect(
        (
          await database.pool.query(
            'SELECT hash,created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
          )
        ).rows,
      ).toEqual(
        reviewed.map((migration) => ({
          hash: migration.hash,
          created_at: String(migration.folderMillis),
        })),
      );
      expect((await database.pool.query('SELECT version FROM app.schema_metadata')).rows).toEqual([
        { version: DATABASE_SCHEMA_VERSION },
      ]);
      expect(
        (
          await database.pool.query(
            'SELECT * FROM app.trade_strategy_links WHERE workspace_id=$1 AND trade_id=$2',
            [workspace.id, tradeId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await database.pool.query(
            'SELECT amount_raw,amount::text FROM app.cash_movements WHERE workspace_id=$1 AND id=$2',
            [workspace.id, cashId],
          )
        ).rows[0],
      ).toMatchObject({ amount_raw: '10.25', amount: '10.250000000000000000000000000000000000' });
    } finally {
      await database?.close();
      try {
        // Close every owned connection before dropping; forced termination can race pg's
        // closing sockets and turn successful verification into an unhandled pool error.
        if (created) await operator.pool.query(`DROP DATABASE "${databaseName}"`);
      } finally {
        await operator.close();
      }
    }
  });
});
