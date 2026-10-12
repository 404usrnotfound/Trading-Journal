import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  'portfolios',
  'portfolio_versions',
  'portfolio_version_accounts',
  'account_cash_events',
  'cash_transfers',
  'cash_transfer_receipts',
];
const economicAt = '2025-03-20T12:13:14.123456Z';
const negate = (value: string) => (value.startsWith('-') ? value.slice(1) : `-${value}`);
function code(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? code(error.cause) : undefined;
}
async function rejected(operation: Promise<unknown>, expected: string | string[] = '23514') {
  try {
    await operation;
    throw new Error('Invalid accounting evidence was accepted');
  } catch (error) {
    expect(Array.isArray(expected) ? expected : [expected]).toContain(code(error));
  }
}
type Command = { id: string; revision: number };
type CashOptions = {
  kind?: string;
  amount?: string;
  posted?: string;
  sourceRevision?: number;
  relatedIncomeId?: string;
  bucketId?: string;
  accountId?: string;
  actorId?: string;
  omitEvent?: boolean;
  eventKind?: string;
  eventTime?: string;
  eventRevision?: number;
  eventSourceId?: string;
  orderingKey?: string;
  extraCash?: boolean;
};

describe('portfolio definitions and typed accounting evidence enforce PostgreSQL integrity', () => {
  let admin: Database;
  let app: Database;
  const actors = [randomUUID(), randomUUID(), randomUUID()];
  const workspaces = [randomUUID(), randomUUID()];
  const owner: TenantContext = { actorId: actors[0]!, workspaceId: workspaces[0]! };
  const outsider: TenantContext = { actorId: actors[1]!, workspaceId: workspaces[1]! };
  const viewer: TenantContext = { actorId: actors[2]!, workspaceId: workspaces[0]! };
  const usd = randomUUID();
  const eur = randomUUID();
  const accounts = [randomUUID(), randomUUID(), randomUUID()];
  const buckets = [randomUUID(), randomUUID(), randomUUID()];
  let portfolioId: string;
  let versionId: string;
  let incomeId: string;
  let transferId: string;
  let seedCommand: Command;

  async function command(
    effect: (tx: DbTransaction, state: Command) => Promise<void>,
    options: { omitAudit?: boolean; omitOutbox?: boolean; kind?: string } = {},
  ) {
    return withTenantTransaction(app, owner, async (tx) => {
      const rows = await tx.execute<{ revision: number }>(
        sql`SELECT revision FROM app.financial_state WHERE workspace_id=${owner.workspaceId}::uuid FOR UPDATE`,
      );
      const state = { id: randomUUID(), revision: rows.rows[0]!.revision + 1 };
      const auditId = randomUUID();
      await tx.execute(
        sql`UPDATE app.financial_state SET revision=${state.revision} WHERE workspace_id=${owner.workspaceId}::uuid`,
      );
      await effect(tx, state);
      const classified = await tx.execute<{ kind: string }>(sql`SELECT CASE
        WHEN EXISTS(SELECT 1 FROM app.portfolios WHERE workspace_id=${owner.workspaceId}::uuid AND command_id=${state.id}::uuid) THEN 'portfolio-created'
        WHEN EXISTS(SELECT 1 FROM app.portfolio_versions WHERE workspace_id=${owner.workspaceId}::uuid AND command_id=${state.id}::uuid AND archived) THEN 'portfolio-archived'
        WHEN EXISTS(SELECT 1 FROM app.portfolio_versions WHERE workspace_id=${owner.workspaceId}::uuid AND command_id=${state.id}::uuid) THEN 'portfolio-version-created'
        WHEN EXISTS(SELECT 1 FROM app.cash_transfers WHERE workspace_id=${owner.workspaceId}::uuid AND command_id=${state.id}::uuid) THEN 'owned-cash-transfer-departed'
        WHEN EXISTS(SELECT 1 FROM app.cash_transfer_receipts WHERE workspace_id=${owner.workspaceId}::uuid AND command_id=${state.id}::uuid) THEN 'owned-cash-transfer-received'
        WHEN EXISTS(SELECT 1 FROM app.account_cash_events WHERE workspace_id=${owner.workspaceId}::uuid AND command_id=${state.id}::uuid AND kind IN ('dividend','interest')) THEN 'account-income-recorded'
        WHEN EXISTS(SELECT 1 FROM app.account_cash_events WHERE workspace_id=${owner.workspaceId}::uuid AND command_id=${state.id}::uuid AND kind='tax') THEN 'account-tax-recorded'
        ELSE 'account-expense-recorded' END AS kind`);
      const kind = options.kind ?? classified.rows[0]!.kind;
      await tx.execute(sql`INSERT INTO app.financial_commands(workspace_id,id,audit_event_id,idempotency_key,request_hash,kind,result,source_revision)
        VALUES (${owner.workspaceId}::uuid,${state.id}::uuid,${auditId}::uuid,${state.id},${createHash('sha256').update(state.id).digest('hex')},${kind},'{}'::jsonb,${state.revision})`);
      if (!options.omitAudit)
        await tx.execute(
          sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action) VALUES (${owner.workspaceId}::uuid,${auditId}::uuid,${owner.actorId},${`financial.${kind}`})`,
        );
      if (!options.omitOutbox)
        await tx.execute(sql`INSERT INTO app.outbox_events(workspace_id,id,command_id,source_revision,event_kind,payload)
        VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${state.id}::uuid,${state.revision},${`financial.${kind}`},'{}'::jsonb)`);
      return state;
    });
  }
  async function portfolio(
    tx: DbTransaction,
    state: Command,
    options: {
      id?: string;
      version?: number;
      members?: string[];
      environment?: string;
      archived?: boolean;
      name?: string;
      first?: boolean;
    } = {},
  ) {
    const id = options.id ?? randomUUID();
    const version = randomUUID();
    if (options.first ?? !options.id)
      await tx.execute(sql`INSERT INTO app.portfolios(workspace_id,id,command_id,source_revision)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision})`);
    await tx.execute(sql`INSERT INTO app.portfolio_versions(workspace_id,id,portfolio_id,command_id,source_revision,version,name,description,environment,archived,reason)
      VALUES (${owner.workspaceId}::uuid,${version}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${options.version ?? 1},${options.name ?? 'Core holdings'},'Reviewed scope',${options.environment ?? 'live'},${options.archived ?? false},'Reviewed membership')`);
    for (const accountId of options.members ?? [accounts[0]!])
      await tx.execute(sql`INSERT INTO app.portfolio_version_accounts(workspace_id,version_id,account_id)
      VALUES (${owner.workspaceId}::uuid,${version}::uuid,${accountId}::uuid)`);
    return { id, version };
  }
  async function event(
    tx: DbTransaction,
    state: Command,
    input: {
      kind: string;
      sourceId: string;
      link: 'account' | 'transfer' | 'receipt';
      bucketId: string;
      amount: string;
      time?: string | undefined;
      revision?: number | undefined;
      extraCash?: boolean | undefined;
    },
  ) {
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at,account_cash_event_id,cash_transfer_id,cash_transfer_receipt_id)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${input.revision ?? state.revision},${id},${usd}::uuid,${input.kind},${input.time ?? economicAt}::timestamptz,${input.link === 'account' ? input.sourceId : null}::uuid,${input.link === 'transfer' ? input.sourceId : null}::uuid,${input.link === 'receipt' ? input.sourceId : null}::uuid)`);
    await tx.execute(sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,cash_bucket_id,amount_raw)
      VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${usd}::uuid,${input.bucketId}::uuid,${input.amount})`);
    await tx.execute(sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,control_key,amount_raw)
      VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${usd}::uuid,'accounting-evidence',${negate(input.amount)})`);
    if (input.extraCash) {
      await tx.execute(sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,cash_bucket_id,amount_raw)
        VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${usd}::uuid,${buckets[1]}::uuid,'1')`);
      await tx.execute(sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,control_key,amount_raw)
        VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${usd}::uuid,'extra','-1')`);
    }
    return id;
  }
  async function cash(tx: DbTransaction, state: Command, options: CashOptions = {}) {
    const id = randomUUID();
    const kind = options.kind ?? 'dividend';
    const amount = options.amount ?? '10.125';
    await tx.execute(sql`INSERT INTO app.account_cash_events(workspace_id,id,actor_id,command_id,source_revision,account_id,cash_bucket_id,currency_id,kind,amount_raw,related_income_id,description,economic_at,ordering_key)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${options.actorId ?? owner.actorId},${state.id}::uuid,${options.sourceRevision ?? state.revision},${options.accountId ?? accounts[0]}::uuid,${options.bucketId ?? buckets[0]}::uuid,${usd}::uuid,${kind},${amount},${options.relatedIncomeId ?? null}::uuid,'Cash evidence',${economicAt}::timestamptz,${options.orderingKey ?? '1'})`);
    if (!options.omitEvent)
      await event(tx, state, {
        kind:
          options.eventKind ??
          (kind === 'tax'
            ? 'account-tax'
            : ['dividend', 'interest'].includes(kind)
              ? 'account-income'
              : 'account-expense'),
        sourceId: options.eventSourceId ?? id,
        link: 'account',
        bucketId: options.bucketId ?? buckets[0]!,
        amount:
          options.posted ?? (['dividend', 'interest'].includes(kind) ? amount : negate(amount)),
        time: options.eventTime,
        revision: options.eventRevision,
        extraCash: options.extraCash,
      });
    return id;
  }
  async function transfer(
    tx: DbTransaction,
    state: Command,
    options: { destination?: number; posted?: string; omitEvent?: boolean } = {},
  ) {
    const id = randomUUID();
    const destination = options.destination ?? 1;
    await tx.execute(sql`INSERT INTO app.cash_transfers(workspace_id,id,command_id,source_revision,source_account_id,destination_account_id,source_bucket_id,destination_bucket_id,currency_id,amount_raw,economic_at,ordering_key,description)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${accounts[0]}::uuid,${accounts[destination]}::uuid,${buckets[0]}::uuid,${buckets[destination]}::uuid,${usd}::uuid,'100.000000000000000000000000000000000001',${economicAt}::timestamptz,'2','Owned transfer')`);
    if (!options.omitEvent)
      await event(tx, state, {
        kind: 'cash-transfer-departure',
        sourceId: id,
        link: 'transfer',
        bucketId: buckets[0]!,
        amount: options.posted ?? '-100.000000000000000000000000000000000001',
      });
    return id;
  }
  async function receipt(
    tx: DbTransaction,
    state: Command,
    id: string,
    options: { time?: string; bucket?: string; amount?: string; orderingKey?: string } = {},
  ) {
    const receiptId = randomUUID();
    const time = options.time ?? '2025-03-21T12:13:14.123456Z';
    await tx.execute(sql`INSERT INTO app.cash_transfer_receipts(workspace_id,id,command_id,source_revision,transfer_id,economic_at,ordering_key)
      VALUES (${owner.workspaceId}::uuid,${receiptId}::uuid,${state.id}::uuid,${state.revision},${id}::uuid,${time}::timestamptz,${options.orderingKey ?? '3'})`);
    await event(tx, state, {
      kind: 'cash-transfer-receipt',
      sourceId: receiptId,
      link: 'receipt',
      bucketId: options.bucket ?? buckets[1]!,
      amount: options.amount ?? '100.000000000000000000000000000000000001',
      time,
    });
    return receiptId;
  }

  beforeAll(async () => {
    admin = createDatabase(process.env.TEST_DATABASE_URL!, { max: 1 });
    app = createDatabase(process.env.TEST_APP_DATABASE_URL!, { max: 2 });
    for (const actor of actors)
      await admin.pool.query('INSERT INTO auth."user"(id,name,email) VALUES ($1,$2,$3)', [
        actor,
        'Accounting database',
        `${actor}@accounting.test`,
      ]);
    for (let i = 0; i < workspaces.length; i++) {
      await admin.pool.query('INSERT INTO app.workspaces(id,name,created_by) VALUES ($1,$2,$3)', [
        workspaces[i],
        'Accounting evidence',
        actors[i],
      ]);
      await admin.pool.query(
        "INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,'owner')",
        [workspaces[i], actors[i]],
      );
      await admin.pool.query(
        'INSERT INTO app.financial_state(workspace_id,revision) VALUES ($1,0)',
        [workspaces[i]],
      );
    }
    await admin.pool.query(
      "INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,'viewer')",
      [owner.workspaceId, viewer.actorId],
    );
    await withTenantTransaction(app, owner, async (tx) => {
      for (const [id, currency] of [
        [usd, 'USD'],
        [eur, 'EUR'],
      ])
        await tx.execute(sql`INSERT INTO app.currencies(workspace_id,id,namespace,code,kind,unit_identity,name)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,'iso',${currency},'fiat',${`iso:${currency}`},${currency})`);
      for (let i = 0; i < accounts.length; i++) {
        await tx.execute(
          sql`INSERT INTO app.accounts(workspace_id,id,name,environment,account_type) VALUES (${owner.workspaceId}::uuid,${accounts[i]}::uuid,${`Account ${i}`},${i === 2 ? 'paper' : 'live'},'cash')`,
        );
        await tx.execute(
          sql`INSERT INTO app.cash_buckets(workspace_id,id,account_id,currency_id,category) VALUES (${owner.workspaceId}::uuid,${buckets[i]}::uuid,${accounts[i]}::uuid,${usd}::uuid,'settled')`,
        );
      }
    });
    seedCommand = await command(async (tx, state) => {
      const result = await portfolio(tx, state);
      portfolioId = result.id;
      versionId = result.version;
    });
    await command(async (tx, state) => {
      incomeId = await cash(tx, state);
    });
    await command(async (tx, state) => {
      transferId = await transfer(tx, state);
    });
  });
  afterAll(async () => {
    try {
      if (admin) {
        const client = await admin.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL session_replication_role=replica');
          for (const table of [
            'portfolio_version_accounts',
            'portfolio_versions',
            'portfolios',
            'postings',
            'ledger_events',
            'account_cash_events',
            'cash_transfer_receipts',
            'cash_transfers',
            'cash_buckets',
            'accounts',
            'currencies',
            'outbox_events',
            'financial_commands',
            'financial_state',
            'audit_events',
          ])
            await client.query(`DELETE FROM app.${table} WHERE workspace_id=ANY($1::uuid[])`, [
              workspaces,
            ]);
          await client.query('SET LOCAL session_replication_role=origin');
          await client.query('DELETE FROM app.workspaces WHERE id=ANY($1::uuid[])', [workspaces]);
          await client.query('DELETE FROM auth."user" WHERE id=ANY($1::text[])', [actors]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } finally {
      await app?.close();
      await admin?.close();
    }
  });

  it('installs the additive migration once and keeps schema readiness aligned', async () => {
    await migrateDatabase(process.env.TEST_DATABASE_URL!);
    const rows = await admin.pool.query(
      'SELECT version FROM app.schema_metadata WHERE singleton=true',
    );
    expect(rows.rows[0].version).toBe(DATABASE_SCHEMA_VERSION);
    const migrationRows = await admin.pool.query(
      'SELECT hash FROM migrations.__drizzle_migrations ORDER BY created_at,id',
    );
    expect(migrationRows.rows.map((row) => row.hash)).toEqual(
      readMigrationFiles({ migrationsFolder }).map((row) => row.hash),
    );
  });
  it('forces RLS, permits viewer reads and prevents cross-workspace disclosure for every new table', async () => {
    for (const table of tables) {
      const metadata = await admin.pool.query(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=('app.'||$1)::regclass",
        [table],
      );
      expect(metadata.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      const count = await withTenantTransaction(app, outsider, (tx) =>
        tx.execute(sql.raw(`SELECT * FROM app.${table}`)),
      );
      expect(count.rows).toHaveLength(0);
    }
    const viewed = await withTenantTransaction(app, viewer, (tx) =>
      tx.execute(sql`SELECT id FROM app.portfolios`),
    );
    expect(viewed.rows.map((row) => row.id)).toContain(portfolioId);
  });
  it('rejects viewer writes and forged source actors', async () => {
    await rejected(
      withTenantTransaction(app, viewer, (tx) =>
        tx.execute(
          sql`INSERT INTO app.portfolios(workspace_id,id,command_id,source_revision) VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,1)`,
        ),
      ),
      '42501',
    );
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, { actorId: viewer.actorId });
      }),
      '42501',
    );
  });
  it('rejects empty portfolio definitions and mixed live/paper membership', async () => {
    await rejected(
      command(async (tx, state) => {
        await portfolio(tx, state, { members: [] });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await portfolio(tx, state, { members: [accounts[0]!, accounts[2]!] });
      }),
    );
  });
  it('rejects duplicate account membership and skipped version numbers', async () => {
    await rejected(
      command(async (tx, state) => {
        await portfolio(tx, state, { members: [accounts[0]!, accounts[0]!] });
      }),
      '23505',
    );
    await rejected(
      command(async (tx, state) => {
        await portfolio(tx, state, { id: portfolioId, version: 3 });
      }),
    );
  });
  it('creates immutable scope histories and forbids appending members after commit', async () => {
    await command(async (tx, state) => {
      await portfolio(tx, state, {
        id: portfolioId,
        version: 2,
        members: [accounts[1]!],
        name: 'Revised holdings',
      });
    });
    const old = await withTenantTransaction(app, owner, (tx) =>
      tx.execute(
        sql`SELECT account_id FROM app.portfolio_version_accounts WHERE version_id=${versionId}::uuid`,
      ),
    );
    expect(old.rows.map((row) => row.account_id)).toEqual([accounts[0]]);
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`INSERT INTO app.portfolio_version_accounts(workspace_id,version_id,account_id) VALUES (${owner.workspaceId}::uuid,${versionId}::uuid,${accounts[1]}::uuid)`,
        ),
      ),
    );
  });
  it('rejects updating or deleting committed accounting history even through the operator role', async () => {
    await rejected(
      admin.pool.query(
        'UPDATE app.portfolio_versions SET name=$1 WHERE workspace_id=$2 AND id=$3',
        ['Rewritten', owner.workspaceId, versionId],
      ),
      '55000',
    );
    await rejected(
      admin.pool.query('DELETE FROM app.account_cash_events WHERE workspace_id=$1 AND id=$2', [
        owner.workspaceId,
        incomeId,
      ]),
      '55000',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.cash_transfers SET description='Rewritten' WHERE id=${transferId}::uuid`,
        ),
      ),
      '42501',
    );
  });
  it('archives as a new definition and forbids later versions', async () => {
    let archivedId = '';
    await command(async (tx, state) => {
      archivedId = (await portfolio(tx, state)).id;
    });
    await command(async (tx, state) => {
      await portfolio(tx, state, { id: archivedId, version: 2, archived: true });
    });
    await rejected(
      command(async (tx, state) => {
        await portfolio(tx, state, { id: archivedId, version: 3 });
      }),
    );
  });
  it('rejects new sources on committed commands', async () => {
    await rejected(withTenantTransaction(app, owner, (tx) => portfolio(tx, seedCommand)));
    await rejected(withTenantTransaction(app, owner, (tx) => cash(tx, seedCommand)));
  });
  it('requires atomic audit and outbox evidence', async () => {
    await rejected(
      command(
        async (tx, state) => {
          await cash(tx, state);
        },
        { omitOutbox: true },
      ),
    );
    await rejected(
      command(
        async (tx, state) => {
          await cash(tx, state);
        },
        { omitAudit: true },
      ),
      ['23514', '23503'],
    );
  });
  it('rejects source revision disagreement and mismatched bucket ownership', async () => {
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, { sourceRevision: state.revision + 1 });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, { accountId: accounts[1]! });
      }),
      '23503',
    );
  });
  it('requires exact posted cash for gross income and separate tax withholding', async () => {
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, { posted: '8' });
      }),
    );
    await command(async (tx, state) => {
      const income = await cash(tx, state, { amount: '10' });
      await cash(tx, state, { kind: 'tax', amount: '2', relatedIncomeId: income });
    });
    const rows = await withTenantTransaction(app, owner, (tx) =>
      tx.execute<{ kind: string; amount: string }>(
        sql`SELECT kind,amount_raw AS amount FROM app.account_cash_events WHERE related_income_id IS NOT NULL`,
      ),
    );
    expect(rows.rows).toContainEqual({ kind: 'tax', amount: '2' });
  });
  it('rejects tax references to expenses or another account', async () => {
    await rejected(
      command(async (tx, state) => {
        const expense = await cash(tx, state, { kind: 'financing' });
        await cash(tx, state, { kind: 'tax', relatedIncomeId: expense });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, {
          kind: 'tax',
          relatedIncomeId: incomeId,
          bucketId: buckets[1]!,
          accountId: accounts[1]!,
        });
      }),
    );
  });
  it('retains signed refunds but refuses zero or negative income and excessive precision', async () => {
    await command(async (tx, state) => {
      await cash(tx, state, { kind: 'tax', amount: '-0.125' });
    });
    await command(async (tx, state) => {
      await cash(tx, state, { kind: 'financing', amount: '-0.025' });
    });
    for (const amount of ['0', '-1'])
      await rejected(
        command(async (tx, state) => {
          await cash(tx, state, { amount });
        }),
      );
    // The canonical decimal parser rejects excessive source precision before
    // a generated NUMERIC value reaches the nonzero/positive-income constraint.
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, { amount: '0.0000000000000000000000000000000000001' });
      }),
      '22003',
    );
  });
  it('rejects missing source events, false classification and mismatched event times/revisions', async () => {
    for (const options of [
      { omitEvent: true },
      { eventKind: 'account-tax' },
      { eventTime: '2025-03-21T12:13:14Z' },
      { eventRevision: 999 },
    ] satisfies CashOptions[])
      await rejected(
        command(async (tx, state) => {
          await cash(tx, state, options);
        }),
      );
  });
  it('rejects balanced extra cash legs and dangling typed-source links', async () => {
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, { extraCash: true });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, { eventSourceId: randomUUID() });
      }),
      ['23514', '23503'],
    );
  });
  it('requires canonical economic sequence keys and correctly classified source commands', async () => {
    for (const orderingKey of ['01', '-1', '1.2', 'words', '1'.repeat(81)])
      await rejected(
        command(async (tx, state) => {
          await cash(tx, state, { orderingKey });
        }),
      );
    await rejected(
      command(
        async (tx, state) => {
          await cash(tx, state);
        },
        { kind: 'cash-movement-recorded' },
      ),
    );
  });

  it('rejects mixed environments and inexact cash transfer departures', async () => {
    await rejected(
      command(async (tx, state) => {
        await transfer(tx, state, { destination: 2 });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await transfer(tx, state, { posted: '-100' });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await transfer(tx, state, { omitEvent: true });
      }),
    );
  });
  it('rejects receipts before departure, to the wrong bucket or for an inexact amount', async () => {
    await rejected(
      command(async (tx, state) => {
        await receipt(tx, state, transferId, { time: '2025-03-19T12:13:14Z' });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await receipt(tx, state, transferId, { time: economicAt, orderingKey: '1' });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await receipt(tx, state, transferId, { bucket: buckets[0]! });
      }),
    );
    await rejected(
      command(async (tx, state) => {
        await receipt(tx, state, transferId, { amount: '100' });
      }),
    );
  });
  it('accepts one exact delayed receipt and rejects a competing receipt', async () => {
    await command(async (tx, state) => {
      await receipt(tx, state, transferId);
    });
    await rejected(
      command(async (tx, state) => {
        await receipt(tx, state, transferId);
      }),
      '23505',
    );
  });
  it('requires simultaneous departure and receipt when sharing a command', async () => {
    await rejected(
      command(async (tx, state) => {
        const id = await transfer(tx, state);
        await receipt(tx, state, id);
      }),
    );
    await command(async (tx, state) => {
      const id = await transfer(tx, state);
      await receipt(tx, state, id, { time: economicAt });
    });
  });
});
