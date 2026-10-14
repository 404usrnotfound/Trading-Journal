import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  journalDocumentSchema,
  journalPlanDefinitionSchema,
  strategyDefinitionSchema,
  type JournalDocument,
  type JournalPlanDefinition,
} from '@journal/contracts';
import {
  createDatabase,
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
  'journal_commands',
  'journal_entries',
  'journal_plan_attachments',
  'journal_plan_commitments',
  'journal_plan_versions',
  'journal_revision_attachments',
  'journal_revisions',
  'journal_risk_additions',
];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty = () => journalDocumentSchema.parse({});
function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? postgresCode(error.cause) : undefined;
}
async function rejected(operation: Promise<unknown>, codes: string | string[] = '23514') {
  try {
    await operation;
    throw new Error('Invalid journal history was accepted');
  } catch (error) {
    expect(Array.isArray(codes) ? codes : [codes]).toContain(postgresCode(error));
  }
}

async function waitForMigrationDatabaseDisconnect(operator: Database, name: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const result = await operator.pool.query<{ connected: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = $1) AS connected',
      [name],
    );
    if (result.rows[0]?.connected === false) return;
    if (Date.now() >= deadline)
      throw new Error(
        'The isolated migration database still has connections after closing its pools',
      );
    await delay(25);
  }
}

describe('journal snapshots, original commitments and evidence enforce PostgreSQL integrity', () => {
  let admin: Database;
  let app: Database;
  const actorIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const workspaceIds = [randomUUID(), randomUUID()];
  const owner: TenantContext = { actorId: actorIds[0]!, workspaceId: workspaceIds[0]! };
  const outsider: TenantContext = { actorId: actorIds[1]!, workspaceId: workspaceIds[1]! };
  const viewer: TenantContext = { actorId: actorIds[2]!, workspaceId: workspaceIds[0]! };
  const editor: TenantContext = { actorId: actorIds[3]!, workspaceId: workspaceIds[0]! };
  const currencyId = randomUUID();
  let seedTrade: string;

  async function trade(context = owner): Promise<string> {
    const id = randomUUID();
    await withTenantTransaction(app, context, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.trades(workspace_id,id,title,classification) VALUES (${context.workspaceId}::uuid,${id}::uuid,'Journal database campaign','active-trading')`,
      );
      await tx.execute(
        sql`INSERT INTO app.journal_entries(workspace_id,trade_id) VALUES (${context.workspaceId}::uuid,${id}::uuid)`,
      );
    });
    return id;
  }
  async function command(
    tx: DbTransaction,
    context: TenantContext,
    id: string,
    kind = 'saved',
    options: { auditActor?: string; auditAction?: string; skipAudit?: boolean } = {},
  ) {
    const auditId = randomUUID();
    if (!options.skipAudit)
      await tx.execute(sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action)
      VALUES (${context.workspaceId}::uuid,${auditId}::uuid,${options.auditActor ?? context.actorId},${options.auditAction ?? `journal.${kind}`})`);
    await tx.execute(sql`INSERT INTO app.journal_commands(workspace_id,id,idempotency_key,kind,request_hash,result,audit_event_id)
      VALUES (${context.workspaceId}::uuid,${id}::uuid,${id}::uuid,${kind},${hash(id)},'{}'::jsonb,${auditId}::uuid)`);
  }
  async function revision(
    tx: DbTransaction,
    context: TenantContext,
    tradeId: string,
    commandId: string,
    document: unknown = empty(),
    options: {
      number?: number;
      skipPointer?: boolean;
      skipReferences?: boolean;
      changeReason?: string;
    } = {},
  ) {
    const id = randomUUID();
    const result = await tx.execute<{ revision: number }>(
      sql`SELECT revision FROM app.journal_entries WHERE workspace_id=${context.workspaceId}::uuid AND trade_id=${tradeId}::uuid FOR UPDATE`,
    );
    const number = options.number ?? result.rows[0]!.revision + 1;
    await tx.execute(sql`INSERT INTO app.journal_revisions(workspace_id,id,trade_id,command_id,revision,document,document_hash,change_reason)
      VALUES (${context.workspaceId}::uuid,${id}::uuid,${tradeId}::uuid,${commandId}::uuid,${number},${JSON.stringify(document)}::jsonb,${hash(document)},${options.changeReason ?? 'Reviewed draft'})`);
    if (!options.skipReferences) {
      const typed = document as JournalDocument;
      for (const attachmentId of typed.plan.attachmentIds)
        await tx.execute(sql`INSERT INTO app.journal_revision_attachments(workspace_id,revision_id,attachment_id,phase)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${attachmentId}::uuid,'planning')`);
      for (const file of typed.review.attachments)
        await tx.execute(sql`INSERT INTO app.journal_revision_attachments(workspace_id,revision_id,attachment_id,phase)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${file.attachmentId}::uuid,${file.phase})`);
    }
    if (!options.skipPointer)
      await tx.execute(sql`UPDATE app.journal_entries SET revision=${number},current_revision_id=${id}::uuid,updated_at=clock_timestamp(),updated_by=${context.actorId}
      WHERE workspace_id=${context.workspaceId}::uuid AND trade_id=${tradeId}::uuid`);
    return id;
  }
  async function save(
    tradeId: string,
    document: unknown = empty(),
    context = owner,
  ): Promise<{ id: string; commandId: string }> {
    const commandId = randomUUID();
    const id = await withTenantTransaction(app, context, async (tx) => {
      const revisionId = await revision(tx, context, tradeId, commandId, document);
      await command(tx, context, commandId);
      return revisionId;
    });
    return { id, commandId };
  }
  async function publish(
    tradeId: string,
    plan: JournalPlanDefinition = journalPlanDefinitionSchema.parse({}),
    options: {
      version?: number;
      skipCommitment?: boolean;
      sourceRevision?: number;
      committedAt?: string;
      skipReferences?: boolean;
      changeReason?: string;
    } = {},
  ) {
    const id = randomUUID();
    const commandId = randomUUID();
    await withTenantTransaction(app, owner, async (tx) => {
      const row = await tx.execute<{ version: number }>(
        sql`SELECT COALESCE(max(version),0)::integer AS version FROM app.journal_plan_versions WHERE workspace_id=${owner.workspaceId}::uuid AND trade_id=${tradeId}::uuid`,
      );
      const version = options.version ?? row.rows[0]!.version + 1;
      const document = empty();
      document.plan = plan;
      await revision(tx, owner, tradeId, commandId, document);
      await tx.execute(sql`INSERT INTO app.journal_plan_versions(workspace_id,id,trade_id,command_id,version,definition,definition_hash,change_reason)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${tradeId}::uuid,${commandId}::uuid,${version},${JSON.stringify(plan)}::jsonb,${hash(plan)},${options.changeReason ?? 'Plan publication'})`);
      if (!options.skipReferences)
        for (const attachmentId of plan.attachmentIds)
          await tx.execute(sql`INSERT INTO app.journal_plan_attachments(workspace_id,plan_version_id,attachment_id)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${attachmentId}::uuid)`);
      if (version === 1 && !options.skipCommitment)
        await tx.execute(sql`INSERT INTO app.journal_plan_commitments(workspace_id,trade_id,command_id,original_plan_id,financial_source_revision,timing,committed_at)
        VALUES (${owner.workspaceId}::uuid,${tradeId}::uuid,${commandId}::uuid,${id}::uuid,${options.sourceRevision ?? 0},'pre-trade',${options.committedAt ?? '1900-01-01T00:00:00Z'}::timestamptz)`);
      await command(tx, owner, commandId, 'plan-published');
    });
    return id;
  }
  async function attachment(context = owner, ready = true) {
    const id = randomUUID();
    await withTenantTransaction(app, context, async (tx) => {
      await tx.execute(sql`INSERT INTO app.strategy_attachments(workspace_id,id,command_id,payload_sha256,name,media_type,size,sha256,storage_key)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${randomUUID()}::uuid,${hash(id)},'Journal evidence.png','image/png',100,${hash('pixels')},${id})`);
      if (ready)
        await tx.execute(
          sql`UPDATE app.strategy_attachments SET state='ready',ready_at=clock_timestamp() WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
        );
    });
    return id;
  }
  async function strategy(context = owner) {
    const id = randomUUID(),
      versionId = randomUUID(),
      setupId = randomUUID(),
      checklistItemId = randomUUID();
    const definition = strategyDefinitionSchema.parse({
      name: 'Journal strategy',
      status: 'active',
      checklist: [{ id: checklistItemId, label: 'Entry confirmed', required: true }],
      setups: [{ id: setupId, name: 'Reversal', checklistItemIds: [checklistItemId] }],
    });
    await withTenantTransaction(app, context, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.strategies(workspace_id,id,current_version_id) VALUES (${context.workspaceId}::uuid,${id}::uuid,${versionId}::uuid)`,
      );
      await tx.execute(sql`INSERT INTO app.strategy_versions(workspace_id,id,strategy_id,version,effective_at,definition,definition_hash,change_reason)
        VALUES (${context.workspaceId}::uuid,${versionId}::uuid,${id}::uuid,1,clock_timestamp(),${JSON.stringify(definition)}::jsonb,${hash(definition)},'Reviewed strategy')`);
    });
    return { id, versionId, setupId, checklistItemId };
  }
  async function pin(tradeId: string, selected: Awaited<ReturnType<typeof strategy>>) {
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(sql`INSERT INTO app.trade_strategy_links(workspace_id,trade_id,strategy_id,strategy_version_id,timing,reason)
      VALUES (${owner.workspaceId}::uuid,${tradeId}::uuid,${selected.id}::uuid,${selected.versionId}::uuid,'retrospective','Reviewed classification')`),
    );
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || !process.env.TEST_APP_DATABASE_URL)
      throw new Error('Dedicated test PostgreSQL is required');
    admin = createDatabase(process.env.TEST_DATABASE_URL);
    app = createDatabase(process.env.TEST_APP_DATABASE_URL);
    for (const id of actorIds)
      await admin.pool.query('INSERT INTO auth."user"(id,name,email) VALUES ($1,$2,$3)', [
        id,
        'Journal SQL fixture',
        `${id}@example.test`,
      ]);
    for (const [i, id] of workspaceIds.entries()) {
      await admin.pool.query('INSERT INTO app.workspaces(id,name,created_by) VALUES ($1,$2,$3)', [
        id,
        'Journal SQL workspace',
        actorIds[i],
      ]);
      await admin.pool.query(
        'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
        [id, actorIds[i], 'owner'],
      );
      await admin.pool.query(
        'INSERT INTO app.financial_state(workspace_id,revision) VALUES ($1,0)',
        [id],
      );
    }
    for (const [context, role] of [
      [viewer, 'viewer'],
      [editor, 'editor'],
    ] as const)
      await admin.pool.query(
        'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
        [context.workspaceId, context.actorId, role],
      );
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(sql`INSERT INTO app.currencies(workspace_id,id,namespace,code,kind,unit_identity,name)
      VALUES (${owner.workspaceId}::uuid,${currencyId}::uuid,'iso','USD','fiat','iso:USD','US dollar')`),
    );
    seedTrade = await trade();
  });
  afterAll(async () => {
    try {
      if (admin) {
        const client = await admin.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL session_replication_role=replica');
          for (const table of [
            'journal_revision_attachments',
            'journal_plan_attachments',
            'journal_risk_additions',
            'journal_plan_commitments',
            'journal_plan_versions',
            'journal_revisions',
            'journal_entries',
            'journal_commands',
            'strategy_version_attachments',
            'trade_strategy_links',
            'strategy_versions',
            'strategies',
            'strategy_attachments',
            'trades',
            'currencies',
            'financial_state',
            'audit_events',
          ])
            await client.query(`DELETE FROM app.${table} WHERE workspace_id=ANY($1::uuid[])`, [
              workspaceIds,
            ]);
          await client.query('SET LOCAL session_replication_role=origin');
          await client.query('DELETE FROM app.workspaces WHERE id=ANY($1::uuid[])', [workspaceIds]);
          await client.query('DELETE FROM auth."user" WHERE id=ANY($1::text[])', [actorIds]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } finally {
      await Promise.all([app?.close(), admin?.close()]);
    }
  });

  it('forces RLS, separates ownership and grants no history mutation or cross-role access', async () => {
    const result = await admin.pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      owner: string;
    }>(
      `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=ANY($1::text[])`,
      [tables],
    );
    expect(result.rows).toHaveLength(tables.length);
    expect(
      result.rows.every(
        (row) => row.relrowsecurity && row.relforcerowsecurity && row.owner === 'journal_migrator',
      ),
    ).toBe(true);
    for (const table of tables) {
      const permissions = await admin.pool.query(
        `SELECT has_table_privilege('journal_app',$1,'DELETE') AS can_delete,has_table_privilege('journal_auth',$1,'SELECT') AS auth_read,has_table_privilege('journal_jobs',$1,'SELECT') AS jobs_read`,
        [`app.${table}`],
      );
      expect(permissions.rows[0]).toEqual({
        can_delete: false,
        auth_read: false,
        jobs_read: false,
      });
    }
  });
  it('hides journals without tenant context and from another workspace', async () => {
    expect((await app.pool.query('SELECT * FROM app.journal_entries')).rows).toEqual([]);
    const rows = await withTenantTransaction(app, outsider, (tx) =>
      tx.execute(sql`SELECT * FROM app.journal_entries WHERE trade_id=${seedTrade}::uuid`),
    );
    expect(rows.rows).toEqual([]);
  });
  it('permits viewer reads and editor revisions while rejecting viewer writes and forged actors', async () => {
    expect(
      (
        await withTenantTransaction(app, viewer, (tx) =>
          tx.execute(sql`SELECT * FROM app.journal_entries WHERE trade_id=${seedTrade}::uuid`),
        )
      ).rows,
    ).toHaveLength(1);
    await rejected(
      withTenantTransaction(app, viewer, (tx) =>
        tx.execute(
          sql`INSERT INTO app.journal_commands(workspace_id,idempotency_key,kind,request_hash,result,audit_event_id) VALUES (${viewer.workspaceId}::uuid,${randomUUID()}::uuid,'saved',${hash('viewer write')},'{}'::jsonb,${randomUUID()}::uuid)`,
        ),
      ),
      '42501',
    );
    await save(seedTrade, empty(), editor);
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`INSERT INTO app.journal_commands(workspace_id,idempotency_key,kind,request_hash,result,audit_event_id,actor_id)
      VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,'saved',${hash('forge')},'{}'::jsonb,${randomUUID()}::uuid,${viewer.actorId})`),
      ),
      '42501',
    );
  });
  it('rejects cross-workspace composite trade references', async () => {
    const foreignTrade = await trade(outsider);
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`INSERT INTO app.journal_entries(workspace_id,trade_id) VALUES (${owner.workspaceId}::uuid,${foreignTrade}::uuid)`,
        ),
      ),
      '23503',
    );
  });
  it('does not allow identities to start at a fabricated saved revision', async () => {
    const id = randomUUID();
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`INSERT INTO app.trades(workspace_id,id,title,classification)VALUES (${owner.workspaceId}::uuid,${id}::uuid,'Fabricated revision','investing')`,
      ),
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`INSERT INTO app.journal_entries(workspace_id,trade_id,revision,current_revision_id)VALUES (${owner.workspaceId}::uuid,${id}::uuid,1,${randomUUID()}::uuid)`,
        ),
      ),
    );
  });
  it('requires contiguous revisions and a pointer to the newest complete snapshot', async () => {
    const id = await trade();
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const commandId = randomUUID();
        await revision(tx, owner, id, commandId, empty(), { number: 2 });
        await command(tx, owner, commandId);
      }),
    );
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const commandId = randomUUID();
        await revision(tx, owner, id, commandId, empty(), { skipPointer: true });
        await command(tx, owner, commandId);
      }),
    );
    expect(
      (
        await admin.pool.query(
          'SELECT revision FROM app.journal_entries WHERE workspace_id=$1 AND trade_id=$2',
          [owner.workspaceId, id],
        )
      ).rows,
    ).toEqual([{ revision: 0 }]);
  });
  it('requires the journal mutation, command and matching actor/action audit to be atomic', async () => {
    const id = await trade();
    await rejected(withTenantTransaction(app, owner, (tx) => command(tx, owner, randomUUID())));
    for (const options of [
      { skipAudit: true },
      { auditActor: viewer.actorId },
      { auditAction: 'journal.unrelated' },
    ])
      await rejected(
        withTenantTransaction(app, owner, async (tx) => {
          const commandId = randomUUID();
          await revision(tx, owner, id, commandId);
          await command(tx, owner, commandId, 'saved', options);
        }),
        ['23503', '23514', '42501'],
      );
  });
  it('stores complete immutable revisions and keeps the financial source revision unchanged', async () => {
    const id = await trade();
    const document = empty();
    document.plan.thesis = 'Hypothesis before execution';
    document.review.customNotes = 'Review only';
    const first = await save(id, document);
    document.review.customNotes = 'Reviewed after execution';
    await save(id, document);
    const revisions = await admin.pool.query(
      'SELECT revision,document FROM app.journal_revisions WHERE workspace_id=$1 AND trade_id=$2 ORDER BY revision',
      [owner.workspaceId, id],
    );
    expect(revisions.rows.map((row) => row.document.review.customNotes)).toEqual([
      'Review only',
      'Reviewed after execution',
    ]);
    await rejected(
      admin.pool.query(
        "UPDATE app.journal_revisions SET change_reason='rewrite' WHERE workspace_id=$1 AND id=$2",
        [owner.workspaceId, first.id],
      ),
      '55000',
    );
    await rejected(
      admin.pool.query('DELETE FROM app.journal_revisions WHERE workspace_id=$1 AND id=$2', [
        owner.workspaceId,
        first.id,
      ]),
      '55000',
    );
    expect(
      (
        await admin.pool.query('SELECT revision FROM app.financial_state WHERE workspace_id=$1', [
          owner.workspaceId,
        ])
      ).rows,
    ).toEqual([{ revision: 0 }]);
  });
  it.each([
    ['unknown top-level field', (doc: JournalDocument) => ({ ...doc, untrusted: true })],
    [
      'missing required review field',
      (doc: JournalDocument) => ({ ...doc, review: { ...doc.review, confidence: undefined } }),
    ],
    [
      'unknown plan nested field',
      (doc: JournalDocument) => ({
        ...doc,
        plan: {
          ...doc.plan,
          initialRisk: {
            amount: '1',
            currencyId,
            method: 'fixed',
            methodNotes: '',
            untrusted: true,
          },
        },
      }),
    ],
    [
      'duplicate labels',
      (doc: JournalDocument) => ({ ...doc, review: { ...doc.review, customTags: ['RSI', 'RSI'] } }),
    ],
    [
      'automatic assessment claims',
      (doc: JournalDocument) => ({
        ...doc,
        review: {
          ...doc.review,
          ruleAssessments: [
            { checklistItemId: randomUUID(), outcome: 'passed', evidence: '', source: 'automatic' },
          ],
        },
      }),
    ],
    [
      'negative monetary risk',
      (doc: JournalDocument) => ({
        ...doc,
        plan: {
          ...doc.plan,
          initialRisk: { amount: '-1', currencyId, method: 'fixed', methodNotes: '' },
        },
      }),
    ],
    [
      'exponent monetary risk',
      (doc: JournalDocument) => ({
        ...doc,
        plan: {
          ...doc.plan,
          initialRisk: { amount: '1e2', currencyId, method: 'fixed', methodNotes: '' },
        },
      }),
    ],
    [
      'overprecision monetary risk',
      (doc: JournalDocument) => ({
        ...doc,
        plan: {
          ...doc.plan,
          initialRisk: {
            amount: `1.${'1'.repeat(37)}`,
            currencyId,
            method: 'fixed',
            methodNotes: '',
          },
        },
      }),
    ],
  ])('rejects %s independently of API validation', async (_label, change) => {
    await rejected(save(await trade(), change(empty())));
  });
  it('enforces shared Unicode character limits and the exact compact UTF-8 document boundary', async () => {
    const invalid = empty();
    invalid.plan.thesis = '😀'.repeat(20_001);
    expect(journalDocumentSchema.safeParse(invalid).success).toBe(false);
    await rejected(save(await trade(), invalid));
    const document = empty();
    document.plan.thesis = 'a'.repeat(20_000);
    document.plan.marketConditions = 'a'.repeat(20_000);
    document.review.marketConditions = 'a'.repeat(20_000);
    document.review.lessonsLearned = 'a'.repeat(20_000);
    document.review.postTradeReview = 'a'.repeat(20_000);
    document.review.customNotes = 'a'.repeat(20_000);
    document.review.exitReason = 'a'.repeat(131_072 - Buffer.byteLength(JSON.stringify(document)));
    expect(Buffer.byteLength(JSON.stringify(document))).toBe(131_072);
    expect(journalDocumentSchema.safeParse(document).success).toBe(true);
    await save(await trade(), document);
    document.review.exitReason += 'a';
    await rejected(save(await trade(), document));
  });
  it('retains valid exact decimal source spelling and rejects missing trade-leg/currency references', async () => {
    const document = empty();
    document.plan.initialRisk = {
      amount: '1.2500000000000000000000000000000000000000000000',
      currencyId,
      method: 'fixed risk',
      methodNotes: '',
    };
    const id = await trade();
    await save(id, document);
    expect(
      (
        await admin.pool.query(
          "SELECT document->'plan'->'initialRisk'->>'amount' AS amount FROM app.journal_revisions WHERE workspace_id=$1 AND trade_id=$2",
          [owner.workspaceId, id],
        )
      ).rows[0].amount,
    ).toBe(document.plan.initialRisk.amount);
    document.plan.initialRisk.currencyId = randomUUID();
    await rejected(save(await trade(), document), '23503');
    const wrongLeg = empty();
    wrongLeg.plan.legs = [
      {
        legId: randomUUID(),
        plannedEntry: '100',
        plannedStop: '90',
        plannedTargets: ['110'],
        plannedQuantity: '0.5',
        estimatedCosts: '0',
      },
    ];
    await rejected(save(await trade(), wrongLeg), '23503');
  });
  it('requires setup and rule assessment identifiers from the exact immutable strategy snapshot', async () => {
    const selected = await strategy();
    const id = await trade();
    await pin(id, selected);
    const document = empty();
    document.plan.strategyVersionId = selected.versionId;
    document.plan.setupId = selected.setupId;
    document.review.ruleAssessments = [
      {
        checklistItemId: selected.checklistItemId,
        outcome: 'unknown',
        evidence: 'No automatic market data',
        source: 'manual',
      },
    ];
    await save(id, document);
    const other = await strategy();
    document.plan.strategyVersionId = other.versionId;
    await rejected(save(id, document));
    document.plan.strategyVersionId = selected.versionId;
    document.plan.setupId = randomUUID();
    await rejected(save(id, document));
    document.plan.setupId = selected.setupId;
    document.review.ruleAssessments[0]!.checklistItemId = randomUUID();
    await rejected(save(id, document));
    const foreign = await strategy(outsider);
    const foreignDoc = empty();
    foreignDoc.plan.strategyVersionId = foreign.versionId;
    await rejected(save(await trade(), foreignDoc), '23503');
  });
  it('freezes the original first plan, uses the server commitment time and preserves risk across later plans', async () => {
    const id = await trade();
    const plan = journalPlanDefinitionSchema.parse({
      initialRisk: { amount: '100.00', currencyId, method: 'Stop distance' },
      thesis: 'Original hypothesis',
    });
    const before = Date.now();
    const first = await publish(id, plan);
    plan.initialRisk!.amount = '250.00';
    plan.thesis = 'Changed after entry';
    await publish(id, plan);
    const commitment = await admin.pool.query(
      'SELECT original_plan_id,committed_at,timing,financial_source_revision FROM app.journal_plan_commitments WHERE workspace_id=$1 AND trade_id=$2',
      [owner.workspaceId, id],
    );
    expect(commitment.rows[0]).toMatchObject({
      original_plan_id: first,
      timing: 'pre-trade',
      financial_source_revision: 0,
    });
    expect(commitment.rows[0].committed_at.getTime()).toBeGreaterThanOrEqual(before);
    const original = await admin.pool.query(
      "SELECT definition->'initialRisk'->>'amount' AS amount FROM app.journal_plan_versions WHERE workspace_id=$1 AND id=$2",
      [owner.workspaceId, first],
    );
    expect(original.rows[0].amount).toBe('100.00');
    await rejected(
      admin.pool.query(
        'UPDATE app.journal_plan_commitments SET original_plan_id=$3 WHERE workspace_id=$1 AND trade_id=$2',
        [owner.workspaceId, id, randomUUID()],
      ),
      '55000',
    );
    await rejected(
      admin.pool.query('DELETE FROM app.journal_plan_versions WHERE workspace_id=$1 AND id=$2', [
        owner.workspaceId,
        first,
      ]),
      '55000',
    );
  });
  it('requires a first-plan commitment and the current locked financial source revision', async () => {
    await rejected(
      publish(await trade(), journalPlanDefinitionSchema.parse({}), { skipCommitment: true }),
    );
    await rejected(
      publish(await trade(), journalPlanDefinitionSchema.parse({}), { sourceRevision: 1 }),
    );
    await rejected(publish(await trade(), journalPlanDefinitionSchema.parse({}), { version: 2 }));
  });
  it('rejects journal facts appended to an already committed command', async () => {
    const id = await trade();
    const previous = await save(id);
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const commandId = randomUUID();
        await revision(tx, owner, id, commandId);
        await command(tx, owner, commandId);
        const plan = journalPlanDefinitionSchema.parse({});
        await tx.execute(sql`INSERT INTO app.journal_plan_versions(workspace_id,trade_id,command_id,version,definition,definition_hash,change_reason)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${previous.commandId}::uuid,1,${JSON.stringify(plan)}::jsonb,${hash(plan)},'Forged effect after command')`);
      }),
    );
  });
  it('allows closed-trade reviews and blocks new plans for closed or archived trades', async () => {
    const id = await trade();
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`UPDATE app.trades SET status='closed',revision=revision+1 WHERE workspace_id=${owner.workspaceId}::uuid AND id=${id}::uuid`,
      ),
    );
    await save(id);
    await rejected(publish(id));
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`UPDATE app.trades SET archived_at=clock_timestamp(),revision=revision+1 WHERE workspace_id=${owner.workspaceId}::uuid AND id=${id}::uuid`,
      ),
    );
    await rejected(publish(id));
    await save(id);
  });
  it('requires ready evidence and a complete exact typed attachment set', async () => {
    const pending = await attachment(owner, false);
    const doc = empty();
    doc.review.attachments = [{ attachmentId: pending, phase: 'before' }];
    await rejected(save(await trade(), doc));
    const ready = await attachment();
    doc.review.attachments = [{ attachmentId: ready, phase: 'during' }];
    const id = await trade();
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const commandId = randomUUID();
        await revision(tx, owner, id, commandId, doc, { skipReferences: true });
        await command(tx, owner, commandId);
      }),
    );
    const accepted = await save(id, doc);
    expect(
      (
        await admin.pool.query(
          'SELECT phase FROM app.journal_revision_attachments WHERE workspace_id=$1 AND revision_id=$2',
          [owner.workspaceId, accepted.id],
        )
      ).rows,
    ).toEqual([{ phase: 'during' }]);
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`INSERT INTO app.journal_revision_attachments(workspace_id,revision_id,attachment_id,phase) VALUES (${owner.workspaceId}::uuid,${accepted.id}::uuid,${ready}::uuid,'after')`,
        ),
      ),
    );
    const foreign = await attachment(outsider);
    doc.review.attachments = [{ attachmentId: foreign, phase: 'after' }];
    await rejected(save(await trade(), doc), '23503');
  });
  it('protects all historical before/during/after evidence and plan files from removal', async () => {
    const id = await trade();
    const files = await Promise.all(['before', 'during', 'after'].map(() => attachment()));
    const planned = await attachment();
    const doc = empty();
    doc.plan.attachmentIds = [planned];
    doc.review.attachments = files.map((attachmentId, i) => ({
      attachmentId,
      phase: (['before', 'during', 'after'] as const)[i]!,
    }));
    await save(id, doc);
    await publish(id, doc.plan);
    await save(id, empty());
    for (const file of [...files, planned])
      await rejected(
        withTenantTransaction(app, owner, (tx) =>
          tx.execute(
            sql`UPDATE app.strategy_attachments SET state='removed',removed_at=clock_timestamp() WHERE workspace_id=${owner.workspaceId}::uuid AND id=${file}::uuid`,
          ),
        ),
      );
    const plan = journalPlanDefinitionSchema.parse({ attachmentIds: [await attachment()] });
    await rejected(publish(await trade(), plan, { skipReferences: true }));
  });
  it('requires risk supplements to have an original commitment and their own matching command', async () => {
    const id = await trade();
    const add = async (tradeId: string, kind = 'risk-added') =>
      withTenantTransaction(app, owner, async (tx) => {
        const commandId = randomUUID();
        await revision(tx, owner, tradeId, commandId);
        await tx.execute(sql`INSERT INTO app.journal_risk_additions(workspace_id,trade_id,command_id,amount_raw,currency_id,method,method_notes,reason)
        VALUES (${owner.workspaceId}::uuid,${tradeId}::uuid,${commandId}::uuid,'25.00',${currencyId}::uuid,'Increased position','Explicit manual supplement','Scaled in')`);
        await command(tx, owner, commandId, kind);
      });
    await rejected(add(id), '23503');
    await publish(
      id,
      journalPlanDefinitionSchema.parse({
        initialRisk: { amount: '100', currencyId, method: 'Original' },
      }),
    );
    await add(id);
    expect(
      (
        await admin.pool.query(
          'SELECT amount_raw FROM app.journal_risk_additions WHERE workspace_id=$1 AND trade_id=$2',
          [owner.workspaceId, id],
        )
      ).rows,
    ).toEqual([{ amount_raw: '25.00' }]);
    await rejected(add(id, 'saved'));
    await rejected(
      admin.pool.query(
        "UPDATE app.journal_risk_additions SET amount_raw='250' WHERE workspace_id=$1 AND trade_id=$2",
        [owner.workspaceId, id],
      ),
      '55000',
    );
  });

  it.each(['closed', 'canceled'])(
    'blocks direct plan and risk publication for %s campaigns',
    async (status) => {
      const id = await trade();
      await publish(id);
      await withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.trades SET status=${status},revision=revision+1 WHERE workspace_id=${owner.workspaceId}::uuid AND id=${id}::uuid`,
        ),
      );
      await rejected(publish(id));
      await rejected(
        withTenantTransaction(app, owner, async (tx) => {
          const commandId = randomUUID();
          await revision(tx, owner, id, commandId);
          await tx.execute(
            sql`INSERT INTO app.journal_risk_additions(workspace_id,trade_id,command_id,amount_raw,currency_id,method,method_notes,reason) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${commandId}::uuid,'5',${currencyId}::uuid,'Supplement','','Late risk')`,
          );
          await command(tx, owner, commandId, 'risk-added');
        }),
      );
      await save(id);
    },
  );

  it('uses the exact ECMAScript trim set instead of locale-dependent whitespace rules', async () => {
    const codePoints = [
      0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
      0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
      0xfeff, 0x85, 0x180e, 0x200b, 0x2060,
    ];
    for (const point of codePoints) {
      const value = `${String.fromCodePoint(point)}label${String.fromCodePoint(point)}`;
      const result = await withTenantTransaction(app, owner, (tx) =>
        tx.execute<{ trimmed: string }>(sql`SELECT app.journal_trim(${value}) AS trimmed`),
      );
      expect(result.rows[0]!.trimmed).toBe(value.trim());
    }
    const permissions = await admin.pool.query(
      "SELECT p.prosecdef,r.rolname AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.proname='journal_trim'",
    );
    expect(permissions.rows).toEqual([{ prosecdef: false, owner: 'journal_migrator' }]);
  });
  it.each(['\t', '\u00a0', '\ufeff', '\u2007\u202f\u3000', ' \t\u00a0\ufeff '])(
    'rejects Unicode-blank flat journal reasons and risk labels (%j)',
    async (blank) => {
      const id = await trade();
      await publish(id);
      await rejected(
        withTenantTransaction(app, owner, async (tx) => {
          const commandId = randomUUID();
          await revision(tx, owner, id, commandId, empty(), { changeReason: blank });
          await command(tx, owner, commandId);
        }),
      );
      await rejected(publish(id, journalPlanDefinitionSchema.parse({}), { changeReason: blank }));
      for (const field of ['method', 'reason'] as const)
        await rejected(
          withTenantTransaction(app, owner, async (tx) => {
            const commandId = randomUUID();
            await revision(tx, owner, id, commandId);
            await tx.execute(
              sql`INSERT INTO app.journal_risk_additions(workspace_id,trade_id,command_id,amount_raw,currency_id,method,method_notes,reason) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${commandId}::uuid,'5',${currencyId}::uuid,${field === 'method' ? blank : 'Manual supplement'},'',${field === 'reason' ? blank : 'Added risk'})`,
            );
            await command(tx, owner, commandId, 'risk-added');
          }),
        );
    },
  );
  it.each(['mistakes', 'emotions', 'customTags'] as const)(
    'rejects blank and normalized duplicate %s labels in direct-runtime JSON',
    async (field) => {
      for (const values of [['\u00a0\ufeff'], ['reviewed', '\u00a0reviewed\ufeff']]) {
        const document = empty();
        document.review[field] = values;
        expect(journalDocumentSchema.safeParse(document).success).toBe(false);
        await rejected(save(await trade(), document));
      }
    },
  );
  it('rejects Unicode-blank risk-method labels in both journal revisions and plan snapshots', async () => {
    for (const blank of ['\t', '\u00a0', '\ufeff', '\u2007\u202f\u3000']) {
      const document = empty();
      document.plan.initialRisk = { amount: '100', currencyId, method: blank, methodNotes: '' };
      expect(journalDocumentSchema.safeParse(document).success).toBe(false);
      await rejected(save(await trade(), document));
      await rejected(publish(await trade(), document.plan));
    }
  });
  it('keeps valid Unicode-padded persisted labels readable by shared service response contracts', async () => {
    const document = empty();
    document.plan.initialRisk = {
      amount: '100.00',
      currencyId,
      method: '\u00a0Stop distance\ufeff',
      methodNotes: 'Source notes',
    };
    document.review.mistakes = ['\u00a0Early entry\ufeff'];
    document.review.emotions = ['\u00a0Calm\ufeff'];
    document.review.customTags = ['\u00a0Reviewed\ufeff'];
    document.review.customNotes = '\u00a0Narrative whitespace remains source text\ufeff';
    const id = await trade();
    const saved = await save(id, document);
    const published = await publish(id, document.plan);
    const rows = await admin.pool.query(
      'SELECT document FROM app.journal_revisions WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, saved.id],
    );
    const decoded = journalDocumentSchema.parse(rows.rows[0].document);
    expect(decoded.plan.initialRisk!.method).toBe('Stop distance');
    expect(decoded.review.customTags).toEqual(['Reviewed']);
    expect(decoded.review.customNotes).toBe(document.review.customNotes);
    const plans = await admin.pool.query(
      'SELECT definition FROM app.journal_plan_versions WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, published],
    );
    expect(journalPlanDefinitionSchema.parse(plans.rows[0].definition).initialRisk!.method).toBe(
      'Stop distance',
    );
  });

  it.each([false, true])(
    'upgrades existing Phase 6 journal history or atomically rejects incompatible blank labels (invalid=%s)',
    async (invalid) => {
      const operator = createDatabase(process.env.TEST_DATABASE_URL!, { max: 1 });
      const databaseName = `journal_label_upgrade_${randomUUID().replaceAll('-', '')}_test`;
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      let database: Database | undefined;
      let created = false;
      try {
        await operator.pool.query(`CREATE DATABASE "${databaseName}"`);
        created = true;
        database = createDatabase(url.toString(), { max: 1 });
        const reviewed = readMigrationFiles({ migrationsFolder });
        await database.db.transaction(async (tx) => {
          for (const migration of reviewed.slice(0, 6))
            for (const statement of migration.sql) await tx.execute(sql.raw(statement));
          await tx.execute(sql`CREATE SCHEMA migrations`);
          await tx.execute(
            sql`CREATE TABLE migrations.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)`,
          );
          for (const migration of reviewed.slice(0, 6))
            await tx.execute(
              sql`INSERT INTO migrations.__drizzle_migrations(hash,created_at) VALUES (${migration.hash},${migration.folderMillis})`,
            );
        });
        const actor = randomUUID(),
          workspace = randomUUID(),
          tradeId = randomUUID();
        const context = { actorId: actor, workspaceId: workspace };
        await database.pool.query('INSERT INTO auth."user"(id,name,email) VALUES ($1,$2,$3)', [
          actor,
          'Journal integrity upgrade fixture',
          `${actor}@example.test`,
        ]);
        await database.pool.query(
          'INSERT INTO app.workspaces(id,name,created_by) VALUES ($1,$2,$3)',
          [workspace, 'Journal integrity upgrade workspace', actor],
        );
        await database.pool.query(
          'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
          [workspace, actor, 'owner'],
        );
        await withTenantTransaction(database, context, async (tx) => {
          await tx.execute(
            sql`INSERT INTO app.financial_state(workspace_id,revision) VALUES (${workspace}::uuid,0)`,
          );
          await tx.execute(
            sql`INSERT INTO app.trades(workspace_id,id,title,classification) VALUES (${workspace}::uuid,${tradeId}::uuid,'Existing journal campaign','active-trading')`,
          );
          await tx.execute(
            sql`INSERT INTO app.journal_entries(workspace_id,trade_id) VALUES (${workspace}::uuid,${tradeId}::uuid)`,
          );
          const commandId = randomUUID();
          await revision(tx, context, tradeId, commandId, empty(), {
            changeReason: invalid ? '\u00a0\ufeff' : 'Reviewed before integrity upgrade',
          });
          await command(tx, context, commandId);
        });
        const records = async () =>
          database!.pool.query(
            'SELECT to_jsonb(r) AS record FROM app.journal_revisions r ORDER BY revision',
          );
        const before = (await records()).rows;
        if (invalid) {
          await rejected(migrateDatabase(url.toString()));
          expect(
            (await database.pool.query('SELECT version FROM app.schema_metadata')).rows,
          ).toEqual([{ version: 6 }]);
          expect(
            (
              await database.pool.query(
                "SELECT to_regprocedure('app.journal_trim(text)') AS helper",
              )
            ).rows,
          ).toEqual([{ helper: null }]);
          expect(
            (
              await database.pool.query(
                'SELECT count(*)::integer AS count FROM migrations.__drizzle_migrations',
              )
            ).rows,
          ).toEqual([{ count: 6 }]);
        } else {
          await migrateDatabase(url.toString());
          await migrateDatabase(url.toString());
          expect(
            (await database.pool.query('SELECT version FROM app.schema_metadata')).rows,
          ).toEqual([{ version: DATABASE_SCHEMA_VERSION }]);
          expect(journalDocumentSchema.safeParse(before[0].record.document).success).toBe(true);
        }
        expect((await records()).rows).toEqual(before);
      } finally {
        try {
          await database?.close();
          if (created) {
            // Pool shutdown can precede PostgreSQL observing the socket disconnect.
            // Wait only for this generated fixture; FORCE can kill a closing client.
            await waitForMigrationDatabaseDisconnect(operator, databaseName);
            await operator.pool.query(`DROP DATABASE "${databaseName}"`);
          }
        } finally {
          await operator.close();
        }
      }
    },
  );

  it('upgrades a populated exact Phase 5 prefix without rewriting financial, strategy or attachment history', async () => {
    const operator = createDatabase(process.env.TEST_DATABASE_URL!, { max: 1 });
    const databaseName = `journal_phase6_upgrade_${randomUUID().replaceAll('-', '')}_test`;
    const url = new URL(process.env.TEST_DATABASE_URL!);
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
        for (const migration of reviewed.slice(0, 5))
          for (const statement of migration.sql) await tx.execute(sql.raw(statement));
        await tx.execute(sql`CREATE SCHEMA migrations`);
        await tx.execute(
          sql`CREATE TABLE migrations.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)`,
        );
        for (const migration of reviewed.slice(0, 5))
          await tx.execute(
            sql`INSERT INTO migrations.__drizzle_migrations(hash,created_at)VALUES (${migration.hash},${migration.folderMillis})`,
          );
      });
      const actor = randomUUID(),
        workspace = randomUUID(),
        tradeId = randomUUID(),
        strategyId = randomUUID(),
        versionId = randomUUID(),
        fileId = randomUUID(),
        preservedCurrency = randomUUID(),
        accountId = randomUUID(),
        bucketId = randomUUID();
      await database.pool.query('INSERT INTO auth."user"(id,name,email)VALUES($1,$2,$3)', [
        actor,
        'Preserved Phase 5 owner',
        `${actor}@example.test`,
      ]);
      await database.pool.query('INSERT INTO app.workspaces(id,name,created_by)VALUES($1,$2,$3)', [
        workspace,
        'Preserved Phase 5 workspace',
        actor,
      ]);
      await database.pool.query(
        'INSERT INTO app.workspace_memberships(workspace_id,user_id,role)VALUES($1,$2,$3)',
        [workspace, actor, 'owner'],
      );
      const context = { actorId: actor, workspaceId: workspace };
      const snapshot = strategyDefinitionSchema.parse({
        name: 'Preserved historical strategy',
        entryRules: 'RSI below 30',
        attachmentIds: [fileId],
      });
      await withTenantTransaction(database, context, async (tx) => {
        await tx.execute(
          sql`INSERT INTO app.financial_state(workspace_id,revision)VALUES(${workspace}::uuid,0)`,
        );
        await tx.execute(
          sql`INSERT INTO app.currencies(workspace_id,id,namespace,code,kind,unit_identity,name)VALUES(${workspace}::uuid,${preservedCurrency}::uuid,'iso','USD','fiat','iso:USD','US dollar')`,
        );
        await tx.execute(
          sql`INSERT INTO app.trades(workspace_id,id,title,classification)VALUES(${workspace}::uuid,${tradeId}::uuid,'Existing pinned campaign','active-trading')`,
        );
        await tx.execute(
          sql`INSERT INTO app.strategy_attachments(workspace_id,id,command_id,payload_sha256,name,media_type,size,sha256,storage_key)VALUES(${workspace}::uuid,${fileId}::uuid,${randomUUID()}::uuid,${hash(fileId)},'Preserved.png','image/png',100,${hash('pixels')},${fileId})`,
        );
        await tx.execute(
          sql`UPDATE app.strategy_attachments SET state='ready',ready_at=now()WHERE workspace_id=${workspace}::uuid AND id=${fileId}::uuid`,
        );
        await tx.execute(
          sql`INSERT INTO app.strategies(workspace_id,id,current_version_id)VALUES(${workspace}::uuid,${strategyId}::uuid,${versionId}::uuid)`,
        );
        await tx.execute(
          sql`INSERT INTO app.strategy_versions(workspace_id,id,strategy_id,version,effective_at,definition,definition_hash,change_reason)VALUES(${workspace}::uuid,${versionId}::uuid,${strategyId}::uuid,1,now(),${JSON.stringify(snapshot)}::jsonb,${hash(snapshot)},'Historical version')`,
        );
        await tx.execute(
          sql`INSERT INTO app.strategy_version_attachments(workspace_id,strategy_version_id,attachment_id)VALUES(${workspace}::uuid,${versionId}::uuid,${fileId}::uuid)`,
        );
        await tx.execute(
          sql`INSERT INTO app.trade_strategy_links(workspace_id,trade_id,strategy_id,strategy_version_id,timing,reason)VALUES(${workspace}::uuid,${tradeId}::uuid,${strategyId}::uuid,${versionId}::uuid,'recorded-with-trade','Original strategy association')`,
        );
        await tx.execute(
          sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action)VALUES(${workspace}::uuid,${randomUUID()}::uuid,${actor},'historical.seed')`,
        );
      });
      const financialCommand = randomUUID(),
        auditId = randomUUID(),
        cashId = randomUUID(),
        eventId = randomUUID();
      await withTenantTransaction(database, context, async (tx) => {
        await tx.execute(
          sql`INSERT INTO app.accounts(workspace_id,id,name,environment,account_type) VALUES (${workspace}::uuid,${accountId}::uuid,'Existing account','live','cash')`,
        );
        await tx.execute(
          sql`INSERT INTO app.cash_buckets(workspace_id,id,account_id,currency_id,category) VALUES (${workspace}::uuid,${bucketId}::uuid,${accountId}::uuid,${preservedCurrency}::uuid,'settled')`,
        );
        await tx.execute(
          sql`UPDATE app.financial_state SET revision=1 WHERE workspace_id=${workspace}::uuid`,
        );
        await tx.execute(
          sql`INSERT INTO app.cash_movements(workspace_id,id,command_id,source_revision,account_id,cash_bucket_id,currency_id,amount_raw,kind,economic_at) VALUES (${workspace}::uuid,${cashId}::uuid,${financialCommand}::uuid,1,${accountId}::uuid,${bucketId}::uuid,${preservedCurrency}::uuid,'10.25','deposit','2025-06-03T10:00:00.123456Z'::timestamptz)`,
        );
        await tx.execute(
          sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at,cash_movement_id) VALUES (${workspace}::uuid,${eventId}::uuid,${financialCommand}::uuid,1,${eventId},${preservedCurrency}::uuid,'deposit','2025-06-03T10:00:00.123456Z'::timestamptz,${cashId}::uuid)`,
        );
        await tx.execute(
          sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,cash_bucket_id,amount_raw) VALUES (${workspace}::uuid,${randomUUID()}::uuid,${eventId}::uuid,${preservedCurrency}::uuid,${bucketId}::uuid,'10.25')`,
        );
        await tx.execute(
          sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,control_key,amount_raw) VALUES (${workspace}::uuid,${randomUUID()}::uuid,${eventId}::uuid,${preservedCurrency}::uuid,'external_contribution','-10.25')`,
        );
        await tx.execute(
          sql`INSERT INTO app.financial_commands(workspace_id,id,audit_event_id,idempotency_key,request_hash,kind,result,source_revision) VALUES (${workspace}::uuid,${financialCommand}::uuid,${auditId}::uuid,${financialCommand},${hash(financialCommand)},'upgrade-fixture','{}'::jsonb,1)`,
        );
        await tx.execute(
          sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action) VALUES (${workspace}::uuid,${auditId}::uuid,${actor},'financial.upgrade-fixture')`,
        );
        await tx.execute(
          sql`INSERT INTO app.outbox_events(workspace_id,id,command_id,source_revision,event_kind,payload) VALUES (${workspace}::uuid,${randomUUID()}::uuid,${financialCommand}::uuid,1,'financial.upgrade-fixture','{}'::jsonb)`,
        );
      });
      const previousTables = await database.pool.query<{
        table_schema: string;
        table_name: string;
      }>(
        "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('app','auth')AND table_name<>'schema_metadata'ORDER BY table_schema,table_name",
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
        for (const table of previousTables.rows) {
          const columns = previousColumns.rows
            .filter(
              (column) =>
                column.table_schema === table.table_schema &&
                column.table_name === table.table_name,
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
                FROM ${sql.identifier(table.table_schema)}.${sql.identifier(table.table_name)} AS source) AS original_columns`,
          );
          values[`${table.table_schema}.${table.table_name}`] = rows.rows[0]!.records;
        }
        return values;
      };
      const before = await records();
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
      expect((await database.pool.query('SELECT version FROM app.schema_metadata')).rows).toEqual([
        { version: DATABASE_SCHEMA_VERSION },
      ]);
      expect((await database.pool.query('SELECT * FROM app.journal_entries')).rows).toEqual([]);
      const applied = await database.pool.query(
        'SELECT hash,created_at FROM migrations.__drizzle_migrations ORDER BY created_at',
      );
      expect(applied.rows).toEqual(
        reviewed.map((migration) => ({
          hash: migration.hash,
          created_at: String(migration.folderMillis),
        })),
      );
    } finally {
      try {
        await database?.close();
        if (created) {
          // Observe completion of owned connections before dropping the fixture.
          await waitForMigrationDatabaseDisconnect(operator, databaseName);
          await operator.pool.query(`DROP DATABASE "${databaseName}"`);
        }
      } finally {
        await operator.close();
      }
    }
  });
});
