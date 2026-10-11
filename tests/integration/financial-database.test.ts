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

const economicAt = '2025-03-20T12:13:14.123456Z';
const sourceTables = [
  'executions',
  'opening_lots',
  'fees',
  'cash_movements',
  'fx_conversions',
  'ledger_events',
  'postings',
  'allocation_sets',
  'allocation_items',
  'cost_attribution_sets',
  'cost_allocations',
  'execution_supersessions',
  'holding_transfers',
  'inventory_events',
  'trade_closures',
  'financial_commands',
  'outbox_events',
  'instrument_versions',
  'account_settings_versions',
  'currency_convention_versions',
  'fx_observations',
  'price_observations',
  'account_valuation_observations',
] as const;
const cleanupTables = [
  'cost_allocations',
  'cost_attribution_sets',
  'allocation_items',
  'allocation_sets',
  'lot_matches',
  'lots',
  'positions',
  'holding_transfers',
  'inventory_events',
  'holding_books',
  'postings',
  'ledger_events',
  'execution_supersessions',
  'fees',
  'cash_movements',
  'fx_conversions',
  'executions',
  'opening_lots',
  'trade_closures',
  'trade_legs',
  'trades',
  'order_revisions',
  'order_legs',
  'orders',
  'account_valuation_observations',
  'price_observations',
  'fx_observations',
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
] as const;

function code(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? code(error.cause) : undefined;
}

async function rejected(operation: Promise<unknown>, expectedCode: string): Promise<void> {
  try {
    await operation;
    throw new Error('An invalid financial transaction was accepted');
  } catch (error) {
    expect(code(error)).toBe(expectedCode);
  }
}

type Command = { id: string; revision: number; auditId: string };

describe('financial persistence independently enforces invariants on PostgreSQL 17', () => {
  let admin: Database;
  let app: Database;
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const workspaces = [randomUUID(), randomUUID()];
  const owner: TenantContext = { actorId: users[0]!, workspaceId: workspaces[0]! };
  const outsider: TenantContext = { actorId: users[1]!, workspaceId: workspaces[1]! };
  const viewer: TenantContext = { actorId: users[2]!, workspaceId: workspaces[0]! };
  const usd = randomUUID();
  const eur = randomUUID();
  const otherCurrency = randomUUID();
  const account = randomUUID();
  const bucket = randomUUID();
  const eurBucket = randomUUID();
  const instrument = randomUUID();
  const version = randomUUID();
  const trade = randomUUID();
  const leg = randomUUID();

  async function rows<Row>(tx: DbTransaction, query: ReturnType<typeof sql<Row>>) {
    return (await tx.execute<Row & Record<string, unknown>>(query)).rows;
  }

  async function command(
    effect: (tx: DbTransaction, state: Command) => Promise<void>,
    options: { omitAudit?: boolean; omitOutbox?: boolean; hash?: string; key?: string } = {},
  ): Promise<Command> {
    return withTenantTransaction(app, owner, async (tx) => {
      const [current] = await rows<{ revision: number }>(
        tx,
        sql`SELECT revision FROM app.financial_state WHERE workspace_id=${owner.workspaceId}::uuid FOR UPDATE`,
      );
      if (!current) throw new Error('Fixture financial state is missing');
      const state = { id: randomUUID(), auditId: randomUUID(), revision: current.revision + 1 };
      await tx.execute(
        sql`UPDATE app.financial_state SET revision=${state.revision} WHERE workspace_id=${owner.workspaceId}::uuid`,
      );
      await effect(tx, state);
      const hash = options.hash ?? createHash('sha256').update(state.id).digest('hex');
      await tx.execute(sql`INSERT INTO app.financial_commands(workspace_id,id,audit_event_id,idempotency_key,request_hash,kind,result,source_revision)
        VALUES (${owner.workspaceId}::uuid,${state.id}::uuid,${state.auditId}::uuid,${options.key ?? state.id},${hash},'database-fixture','{}'::jsonb,${state.revision})`);
      if (!options.omitAudit)
        await tx.execute(
          sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action) VALUES (${owner.workspaceId}::uuid,${state.auditId}::uuid,${owner.actorId},'financial.database-fixture')`,
        );
      if (!options.omitOutbox)
        await tx.execute(sql`INSERT INTO app.outbox_events(workspace_id,id,command_id,source_revision,event_kind,payload)
        VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${state.id}::uuid,${state.revision},'financial.database-fixture','{}'::jsonb)`);
      return state;
    });
  }

  async function event(
    tx: DbTransaction,
    state: Command,
    amount: string,
    counterpart: string,
    links: { cash?: string; fee?: string; execution?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at,cash_movement_id,fee_id,execution_id)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${id},${usd}::uuid,'database-fixture',${economicAt}::timestamptz,${links.cash ?? null}::uuid,${links.fee ?? null}::uuid,${links.execution ?? null}::uuid)`);
    await tx.execute(sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,cash_bucket_id,amount_raw)
      VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${usd}::uuid,${bucket}::uuid,${amount})`);
    await tx.execute(sql`INSERT INTO app.postings(workspace_id,id,ledger_event_id,currency_id,control_key,amount_raw)
      VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${usd}::uuid,'external_contribution',${counterpart})`);
    return id;
  }

  async function cash(
    tx: DbTransaction,
    state: Command,
    amount: string,
    posted: string,
    counterpart: string,
    sourceRevision = state.revision,
  ): Promise<string> {
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO app.cash_movements(workspace_id,id,command_id,source_revision,account_id,cash_bucket_id,currency_id,amount_raw,kind,economic_at)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${sourceRevision},${account}::uuid,${bucket}::uuid,${usd}::uuid,${amount},'deposit',${economicAt}::timestamptz)`);
    await event(tx, state, posted, counterpart, { cash: id });
    return id;
  }

  async function execution(tx: DbTransaction, state: Command): Promise<string> {
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO app.executions(workspace_id,id,command_id,source_revision,account_id,instrument_version_id,side,quantity_raw,price_raw,economic_at,ordering_key)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${version}::uuid,'buy','1','100',${economicAt}::timestamptz,'1')`);
    return id;
  }

  async function allocation(
    tx: DbTransaction,
    state: Command,
    executionId: string,
    residual: string,
    assigned?: string,
  ) {
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO app.allocation_sets(workspace_id,id,command_id,source_revision,execution_id,version,reason)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${executionId}::uuid,1,'independent database fixture')`);
    await tx.execute(sql`INSERT INTO app.allocation_items(workspace_id,id,allocation_set_id,quantity_raw)
      VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${residual})`);
    if (assigned !== undefined)
      await tx.execute(sql`INSERT INTO app.allocation_items(workspace_id,id,allocation_set_id,trade_leg_id,quantity_raw)
      VALUES (${owner.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${leg}::uuid,${assigned})`);
  }

  async function unsupportedShortBook(): Promise<string> {
    const instrumentId = randomUUID();
    const versionId = randomUUID();
    const bookId = randomUUID();
    const openingId = randomUUID();
    const lotId = randomUUID();
    const fillId = randomUUID();
    await withTenantTransaction(app, owner, async (tx) => {
      await tx.execute(sql`INSERT INTO app.instruments(workspace_id,id,name,family,subtype,economic_identity)
        VALUES (${owner.workspaceId}::uuid,${instrumentId}::uuid,'Unreviewed short stock','stock','ordinary-share',${instrumentId})`);
      await tx.execute(sql`INSERT INTO app.instrument_versions(workspace_id,id,instrument_id,version,quantity_unit,quote_currency_id,settlement_currency_id,multiplier_raw,quantity_increment_raw,price_increment_raw,capability,effective_at)
        VALUES (${owner.workspaceId}::uuid,${versionId}::uuid,${instrumentId}::uuid,1,'share',${usd}::uuid,${usd}::uuid,'1','0.001','0.01','native-linear',${economicAt}::timestamptz)`);
    });
    const available = (value: string) => ({ status: 'available', value, reasons: [] });
    const blocked = {
      status: 'unsupported',
      value: null,
      reasons: ['unsupported_short_inventory'],
    };
    await command(async (tx, state) => {
      await tx.execute(sql`INSERT INTO app.opening_lots(workspace_id,id,command_id,source_revision,account_id,instrument_version_id,quantity_raw,direction,price_raw,principal_raw,economic_at,ordering_key)
        VALUES (${owner.workspaceId}::uuid,${openingId}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${versionId}::uuid,'2','long','10','20',${economicAt}::timestamptz,'1')`);
      const lot = { originalQuantity: '2', remainingQuantity: '2', direction: 'long' };
      const initial = {
        status: 'available',
        reasons: [],
        lots: [lot],
        matches: [],
        transferredCosts: [],
        openQuantity: available('2'),
        longQuantity: available('2'),
        shortQuantity: available('0'),
        averageEntryPrice: available('10'),
        grossBasis: available('20'),
        netBasis: available('20'),
        realizedGross: available('0'),
        realizedNet: available('0'),
      };
      await tx.execute(sql`INSERT INTO app.holding_books(workspace_id,id,account_id,instrument_id,instrument_version_id,inventory_method,source_revision,state)
        VALUES (${owner.workspaceId}::uuid,${bookId}::uuid,${account}::uuid,${instrumentId}::uuid,${versionId}::uuid,'fifo',${state.revision},${JSON.stringify(initial)}::jsonb)`);
      await tx.execute(sql`INSERT INTO app.positions(workspace_id,id,holding_book_id,quantity_raw,basis_raw,source_revision,state)
        VALUES (${owner.workspaceId}::uuid,${bookId}::uuid,${bookId}::uuid,'2','20',${state.revision},${JSON.stringify(initial)}::jsonb)`);
      await tx.execute(sql`INSERT INTO app.lots(workspace_id,id,holding_book_id,opening_lot_id,direction,remaining_quantity_raw,source_revision,state)
        VALUES (${owner.workspaceId}::uuid,${lotId}::uuid,${bookId}::uuid,${openingId}::uuid,'long','2',${state.revision},${JSON.stringify(lot)}::jsonb)`);
    });
    await command(async (tx, state) => {
      const eventId = randomUUID();
      await tx.execute(sql`INSERT INTO app.executions(workspace_id,id,command_id,source_revision,account_id,instrument_version_id,side,quantity_raw,price_raw,principal_raw,principal_currency_id,economic_at,ordering_key)
        VALUES (${owner.workspaceId}::uuid,${fillId}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${versionId}::uuid,'sell','3','10','30',${usd}::uuid,${economicAt}::timestamptz,'2')`);
      await tx.execute(sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at,execution_id)
        VALUES (${owner.workspaceId}::uuid,${eventId}::uuid,${state.id}::uuid,${state.revision},${eventId},${usd}::uuid,'execution-principal',${economicAt}::timestamptz,${fillId}::uuid)`);
      await tx.execute(sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,cash_bucket_id,control_key,amount_raw) VALUES
        (${owner.workspaceId}::uuid,${eventId}::uuid,${usd}::uuid,${bucket}::uuid,NULL,'30'),
        (${owner.workspaceId}::uuid,${eventId}::uuid,${usd}::uuid,NULL,'native-principal','-30')`);
      await allocation(tx, state, fillId, '3');
      const unsupported = {
        status: 'unsupported',
        reasons: ['unsupported_short_inventory'],
        lots: [],
        matches: [],
        transferredCosts: [],
        openQuantity: available('-1'),
        longQuantity: available('0'),
        shortQuantity: available('1'),
        averageEntryPrice: blocked,
        grossBasis: blocked,
        netBasis: blocked,
        realizedGross: blocked,
        realizedNet: blocked,
      };
      await tx.execute(sql`UPDATE app.lots SET remaining_quantity_raw='0',source_revision=${state.revision},state=jsonb_set(state,'{remainingQuantity}','"0"'::jsonb)
        WHERE workspace_id=${owner.workspaceId}::uuid AND holding_book_id=${bookId}::uuid`);
      await tx.execute(sql`UPDATE app.holding_books SET source_revision=${state.revision},state=${JSON.stringify(unsupported)}::jsonb
        WHERE workspace_id=${owner.workspaceId}::uuid AND id=${bookId}::uuid`);
      await tx.execute(sql`UPDATE app.positions SET quantity_raw='-1',basis_raw=NULL,source_revision=${state.revision},state=${JSON.stringify(unsupported)}::jsonb
        WHERE workspace_id=${owner.workspaceId}::uuid AND holding_book_id=${bookId}::uuid`);
    });
    return bookId;
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || !process.env.TEST_APP_DATABASE_URL)
      throw new Error('Dedicated PostgreSQL integration URLs are required');
    admin = createDatabase(process.env.TEST_DATABASE_URL);
    app = createDatabase(process.env.TEST_APP_DATABASE_URL);
    for (const [index, id] of users.entries())
      await admin.pool.query('INSERT INTO auth."user"(id,name,email) VALUES ($1,$2,$3)', [
        id,
        `Financial DB fixture ${index}`,
        `${id}@example.test`,
      ]);
    for (const [index, id] of workspaces.entries()) {
      await admin.pool.query('INSERT INTO app.workspaces(id,name,created_by) VALUES ($1,$2,$3)', [
        id,
        `Financial DB workspace ${index}`,
        users[index],
      ]);
      await admin.pool.query(
        'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
        [id, users[index], 'owner'],
      );
    }
    await admin.pool.query(
      'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
      [owner.workspaceId, viewer.actorId, 'viewer'],
    );
    await withTenantTransaction(app, owner, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.financial_state(workspace_id,revision) VALUES (${owner.workspaceId}::uuid,0)`,
      );
      await tx.execute(sql`INSERT INTO app.currencies(workspace_id,id,namespace,code,kind,unit_identity,name) VALUES
        (${owner.workspaceId}::uuid,${usd}::uuid,'iso','USD','fiat','iso:USD','US dollar'),
        (${owner.workspaceId}::uuid,${eur}::uuid,'iso','EUR','fiat','iso:EUR','Euro')`);
      await tx.execute(
        sql`INSERT INTO app.accounts(workspace_id,id,name,environment,account_type) VALUES (${owner.workspaceId}::uuid,${account}::uuid,'Account','live','cash')`,
      );
      await tx.execute(sql`INSERT INTO app.cash_buckets(workspace_id,id,account_id,currency_id,category) VALUES
        (${owner.workspaceId}::uuid,${bucket}::uuid,${account}::uuid,${usd}::uuid,'settled'),
        (${owner.workspaceId}::uuid,${eurBucket}::uuid,${account}::uuid,${eur}::uuid,'settled')`);
      await tx.execute(
        sql`INSERT INTO app.instruments(workspace_id,id,name,family,subtype,economic_identity) VALUES (${owner.workspaceId}::uuid,${instrument}::uuid,'Share','stock','ordinary-share','fixture:independent-db')`,
      );
      await tx.execute(sql`INSERT INTO app.instrument_versions(workspace_id,id,instrument_id,version,quantity_unit,quote_currency_id,settlement_currency_id,multiplier_raw,quantity_increment_raw,price_increment_raw,capability,effective_at)
        VALUES (${owner.workspaceId}::uuid,${version}::uuid,${instrument}::uuid,1,'share',${usd}::uuid,${usd}::uuid,'1','0.001','0.01','native-linear',${economicAt}::timestamptz)`);
      await tx.execute(
        sql`INSERT INTO app.trades(workspace_id,id,title,classification) VALUES (${owner.workspaceId}::uuid,${trade}::uuid,'Idea','active-trading')`,
      );
      await tx.execute(
        sql`INSERT INTO app.trade_legs(workspace_id,id,trade_id,account_id,instrument_version_id,direction,label) VALUES (${owner.workspaceId}::uuid,${leg}::uuid,${trade}::uuid,${account}::uuid,${version}::uuid,'long','Share leg')`,
      );
    });
    await withTenantTransaction(app, outsider, async (tx) => {
      await tx.execute(
        sql`INSERT INTO app.currencies(workspace_id,id,namespace,code,kind,unit_identity,name) VALUES (${outsider.workspaceId}::uuid,${otherCurrency}::uuid,'iso','USD','fiat','iso:USD','Other dollar')`,
      );
    });
  });

  afterAll(async () => {
    try {
      if (admin) {
        await admin.db.transaction(async (tx) => {
          for (const table of cleanupTables)
            await tx.execute(
              sql`DELETE FROM ${sql.identifier('app')}.${sql.identifier(table)} WHERE workspace_id=ANY(${sql.param(workspaces)}::uuid[])`,
            );
          await tx.execute(
            sql`DELETE FROM app.workspaces WHERE id=ANY(${sql.param(workspaces)}::uuid[])`,
          );
          await tx.execute(sql`DELETE FROM auth."user" WHERE id=ANY(${sql.param(users)}::text[])`);
        });
      }
    } finally {
      await Promise.all([admin, app].filter(Boolean).map((database) => database.close()));
    }
  });

  it('uses a non-owner application role and forces tenant RLS on all financial tables', async () => {
    const role = await app.pool.query(
      'SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
    );
    expect(role.rows).toEqual([{ name: 'journal_app', rolsuper: false, rolbypassrls: false }]);
    const tables = await admin.pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      owner: string;
    }>(
      "SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relnamespace='app'::regnamespace AND relname=ANY($1::text[])",
      [cleanupTables],
    );
    expect(tables.rows).toHaveLength(cleanupTables.length);
    expect(
      tables.rows.every(
        (table) =>
          table.relrowsecurity && table.relforcerowsecurity && table.owner === 'journal_migrator',
      ),
    ).toBe(true);
  });

  it('keeps accepted financial sources and metadata versions append-only', async () => {
    for (const table of sourceTables) {
      const rights = await admin.pool.query(
        'SELECT has_table_privilege($1,$2,$3) AS permitted,has_table_privilege($1,$2,$4) AS deletable',
        ['journal_app', `app.${table}`, 'UPDATE', 'DELETE'],
      );
      expect(rights.rows).toEqual([{ permitted: false, deletable: false }]);
    }
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(
          sql`UPDATE app.instrument_versions SET multiplier_raw='2' WHERE workspace_id=${owner.workspaceId}::uuid`,
        ),
      ),
      '42501',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`DELETE FROM app.currencies WHERE workspace_id=${owner.workspaceId}::uuid`),
      ),
      '42501',
    );
  });

  it('denies absent, wrong and leaked tenant context while permitting viewer reads', async () => {
    expect((await app.pool.query('SELECT id FROM app.currencies')).rows).toEqual([]);
    expect(
      await withTenantTransaction(
        app,
        { actorId: owner.actorId, workspaceId: outsider.workspaceId },
        (tx) => rows<{ id: string }>(tx, sql`SELECT id FROM app.currencies`),
      ),
    ).toEqual([]);
    expect(
      await withTenantTransaction(app, viewer, (tx) =>
        rows<{ id: string }>(tx, sql`SELECT id FROM app.currencies`),
      ),
    ).toHaveLength(2);
    expect((await app.pool.query('SELECT id FROM app.currencies')).rows).toEqual([]);
    await rejected(
      withTenantTransaction(app, viewer, (tx) =>
        tx.execute(
          sql`INSERT INTO app.brokers(workspace_id,name,source_namespace) VALUES (${owner.workspaceId}::uuid,'Forbidden','forbidden:viewer')`,
        ),
      ),
      '42501',
    );
  });

  it.each([
    '0.1234567890123456789012345678901234567',
    '1000000000000000000000000000000000000000000',
    '1e-4',
    'NaN',
    'Infinity',
    '01',
    '-0',
    '1.0',
  ])('rejects raw precision or noncanonical source %s before PostgreSQL coercion', async (raw) => {
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`INSERT INTO app.fx_observations(workspace_id,base_currency_id,quote_currency_id,rate_raw,observed_at,source)
      VALUES (${owner.workspaceId}::uuid,${usd}::uuid,${eur}::uuid,${raw},${economicAt}::timestamptz,'invalid source')`),
      ),
      '22003',
    );
  });

  it('round-trips the full 42 integral and 36 fractional source envelope without a binary intermediate', async () => {
    const amount = `${'9'.repeat(42)}.${'1'.repeat(36)}`;
    const result = await withTenantTransaction(app, owner, (tx) =>
      rows<{ rate_raw: string; rate: string }>(
        tx,
        sql`INSERT INTO app.fx_observations(workspace_id,base_currency_id,quote_currency_id,rate_raw,observed_at,source)
      VALUES (${owner.workspaceId}::uuid,${usd}::uuid,${eur}::uuid,${amount},${economicAt}::timestamptz,'exact envelope') RETURNING rate_raw,rate::text AS rate`,
      ),
    );
    expect(result).toEqual([{ rate_raw: amount, rate: amount }]);
  });

  it('does not permit direct numeric insertion to bypass raw validation', async () => {
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`INSERT INTO app.fx_observations(workspace_id,base_currency_id,quote_currency_id,rate_raw,rate,observed_at,source)
      VALUES (${owner.workspaceId}::uuid,${usd}::uuid,${eur}::uuid,'1',1.1234567890123456789012345678901234567,${economicAt}::timestamptz,'bypass')`),
      ),
      '428C9',
    );
  });

  it('rejects a composite currency reference from another workspace and non-v4 identity', async () => {
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`INSERT INTO app.fx_observations(workspace_id,base_currency_id,quote_currency_id,rate_raw,observed_at,source)
      VALUES (${owner.workspaceId}::uuid,${usd}::uuid,${otherCurrency}::uuid,'1',${economicAt}::timestamptz,'cross tenant')`),
      ),
      '23503',
    );
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`INSERT INTO app.fx_observations(workspace_id,id,base_currency_id,quote_currency_id,rate_raw,observed_at,source)
      VALUES (${owner.workspaceId}::uuid,'12345678-1234-5234-8234-123456789012'::uuid,${usd}::uuid,${eur}::uuid,'1',${economicAt}::timestamptz,'wrong identity')`),
      ),
      '23514',
    );
  });

  it('rejects unbalanced postings only at commit and rolls back all dependent facts and revision', async () => {
    const before = (
      await admin.pool.query('SELECT revision FROM app.financial_state WHERE workspace_id=$1', [
        owner.workspaceId,
      ])
    ).rows;
    const countsBefore = (
      await admin.pool.query(
        'SELECT (SELECT count(*) FROM app.financial_commands WHERE workspace_id=$1) AS commands,(SELECT count(*) FROM app.outbox_events WHERE workspace_id=$1) AS outbox,(SELECT count(*) FROM app.audit_events WHERE workspace_id=$1) AS audit',
        [owner.workspaceId],
      )
    ).rows;
    let inserted = false;
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, '10', '10', '-9');
        inserted = true;
      }),
      '23514',
    );
    expect(inserted).toBe(true);
    expect(
      (
        await admin.pool.query('SELECT revision FROM app.financial_state WHERE workspace_id=$1', [
          owner.workspaceId,
        ])
      ).rows,
    ).toEqual(before);
    expect(
      (
        await admin.pool.query(
          'SELECT (SELECT count(*) FROM app.financial_commands WHERE workspace_id=$1) AS commands,(SELECT count(*) FROM app.outbox_events WHERE workspace_id=$1) AS outbox,(SELECT count(*) FROM app.audit_events WHERE workspace_id=$1) AS audit',
          [owner.workspaceId],
        )
      ).rows,
    ).toEqual(countsBefore);
    expect(
      (
        await admin.pool.query('SELECT id FROM app.cash_movements WHERE workspace_id=$1', [
          owner.workspaceId,
        ])
      ).rows,
    ).toEqual([]);
  });

  it('stores sub-display fees and booked cash exactly while controls stay outside cash', async () => {
    let sourceId = '';
    await command(async (tx, state) => {
      sourceId = await cash(
        tx,
        state,
        '10.000000000000000000000000000000000001',
        '10.000000000000000000000000000000000001',
        '-10.000000000000000000000000000000000001',
      );
    });
    const source = await admin.pool.query(
      'SELECT amount_raw,to_char(economic_at AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS economic_at FROM app.cash_movements WHERE workspace_id=$1 AND id=$2',
      [owner.workspaceId, sourceId],
    );
    expect(source.rows).toEqual([
      { amount_raw: '10.000000000000000000000000000000000001', economic_at: economicAt },
    ]);
    const native = await admin.pool.query(
      'SELECT sum(amount)::text AS amount FROM app.postings WHERE workspace_id=$1 AND cash_bucket_id=$2',
      [owner.workspaceId, bucket],
    );
    expect(native.rows).toEqual([{ amount: '10.000000000000000000000000000000000001' }]);
    expect(
      (
        await admin.pool.query(
          'SELECT sum(amount)::text AS amount FROM app.postings WHERE workspace_id=$1',
          [owner.workspaceId],
        )
      ).rows,
    ).toEqual([{ amount: '0.000000000000000000000000000000000000' }]);
  });

  it('requires posted cash to match actual source amount even when bookkeeping balances', async () => {
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, '10', '9', '-9');
      }),
      '23514',
    );
  });

  it('cannot balance a USD event using an EUR bucket or an EUR posting', async () => {
    await rejected(
      command(async (tx, state) => {
        const id = randomUUID();
        await tx.execute(
          sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${id},${usd}::uuid,'invalid mixed currency',${economicAt}::timestamptz)`,
        );
        await tx.execute(
          sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,cash_bucket_id,amount_raw) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${usd}::uuid,${eurBucket}::uuid,'10')`,
        );
      }),
      '23503',
    );
    await rejected(
      command(async (tx, state) => {
        const id = await event(tx, state, '10', '-10');
        await tx.execute(
          sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,control_key,amount_raw) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${eur}::uuid,'misleading FX offset','0')`,
        );
      }),
      '23503',
    );
  });

  it('requires exactly one residual and exact execution allocation magnitude', async () => {
    await rejected(
      command(async (tx, state) => {
        await allocation(tx, state, await execution(tx, state), '0.4', '0.7');
      }),
      '23514',
    );
    await rejected(
      command(async (tx, state) => {
        await allocation(tx, state, await execution(tx, state), '-0.2', '1.2');
      }),
      '23514',
    );
    await command(async (tx, state) => {
      await allocation(tx, state, await execution(tx, state), '0.4', '0.6');
    });
  });

  it('conserves each original fee currency and attribution axis including explicit residual', async () => {
    await rejected(
      command(async (tx, state) => {
        const feeId = randomUUID();
        const setId = randomUUID();
        await tx.execute(
          sql`INSERT INTO app.fees(workspace_id,id,command_id,source_revision,account_id,currency_id,amount_raw,kind,economic_at) VALUES (${owner.workspaceId}::uuid,${feeId}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${usd}::uuid,'0.0012345','commission',${economicAt}::timestamptz)`,
        );
        await event(tx, state, '-0.0012345', '0.0012345', { fee: feeId });
        await tx.execute(
          sql`INSERT INTO app.cost_attribution_sets(workspace_id,id,command_id,source_revision,fee_id,axis,version,reason) VALUES (${owner.workspaceId}::uuid,${setId}::uuid,${state.id}::uuid,${state.revision},${feeId}::uuid,'campaign',1,'independent fee allocation')`,
        );
        await tx.execute(
          sql`INSERT INTO app.cost_allocations(workspace_id,attribution_set_id,currency_id,amount_raw) VALUES (${owner.workspaceId}::uuid,${setId}::uuid,${usd}::uuid,'0.0012')`,
        );
      }),
      '23514',
    );
  });

  it('requires audit, durable outbox, source revision agreement and a valid request hash atomically', async () => {
    await rejected(
      command(async () => {}, { omitOutbox: true }),
      '23514',
    );
    await rejected(
      command(async () => {}, { omitAudit: true }),
      '23503',
    );
    await rejected(
      command(async (tx, state) => {
        await cash(tx, state, '1', '1', '-1', state.revision + 1);
      }),
      '23514',
    );
    await rejected(
      command(async () => {}, { hash: 'invalid' }),
      '23514',
    );
  });

  it('does not let a committed command acquire more source effects or impersonate another actor', async () => {
    const accepted = await command(async () => {});
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`INSERT INTO app.fees(workspace_id,command_id,source_revision,account_id,currency_id,amount_raw,kind,economic_at)
      VALUES (${owner.workspaceId}::uuid,${accepted.id}::uuid,${accepted.revision},${account}::uuid,${usd}::uuid,'1','commission',${economicAt}::timestamptz)`),
      ),
      '23514',
    );
    await rejected(
      command((tx, state) =>
        tx
          .execute(
            sql`INSERT INTO app.fees(workspace_id,actor_id,command_id,source_revision,account_id,currency_id,amount_raw,kind,economic_at)
      VALUES (${owner.workspaceId}::uuid,${outsider.actorId},${state.id}::uuid,${state.revision},${account}::uuid,${usd}::uuid,'1','commission',${economicAt}::timestamptz)`,
          )
          .then(() => undefined),
      ),
      '42501',
    );
  });

  it('does not allow duplicate scoped idempotency identities even under different command IDs', async () => {
    const key = randomUUID();
    await command(async () => {}, { key });
    await rejected(
      command(async () => {}, { key }),
      '23505',
    );
  });

  it('retains unknown manual metadata as null while native metadata must be completely known', async () => {
    const id = randomUUID();
    await withTenantTransaction(app, owner, async (tx) => {
      await tx.execute(sql`INSERT INTO app.instruments(workspace_id,id,name,family,subtype,economic_identity)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,'Unknown custom contract','custom','manual',${`fixture:unknown:${id}`})`);
      const result = await rows<{
        multiplier_raw: string | null;
        multiplier: string | null;
        quote_currency_id: string | null;
      }>(
        tx,
        sql`INSERT INTO app.instrument_versions(workspace_id,instrument_id,version,quantity_unit,capability,effective_at)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,1,'contract','manual',${economicAt}::timestamptz)
        RETURNING multiplier_raw,multiplier::text AS multiplier,quote_currency_id`,
      );
      expect(result).toEqual([{ multiplier_raw: null, multiplier: null, quote_currency_id: null }]);
    });
    await rejected(
      withTenantTransaction(app, owner, (tx) =>
        tx.execute(sql`INSERT INTO app.instrument_versions(workspace_id,instrument_id,version,quantity_unit,capability,effective_at)
      VALUES (${owner.workspaceId}::uuid,${id}::uuid,2,'contract','native-linear',${economicAt}::timestamptz)`),
      ),
      '23514',
    );
  });

  it.each([null, '10000'])(
    'records distinct manual settlement legs without manufacturing instrument notional cash (quote %s)',
    async (price) => {
      const manualInstrument = randomUUID();
      const manualVersion = randomUUID();
      await withTenantTransaction(app, owner, async (tx) => {
        await tx.execute(
          sql`INSERT INTO app.instruments(workspace_id,id,name,family,subtype,economic_identity) VALUES (${owner.workspaceId}::uuid,${manualInstrument}::uuid,'Manual future','future','manual',${`fixture:future:${manualInstrument}`})`,
        );
        await tx.execute(
          sql`INSERT INTO app.instrument_versions(workspace_id,id,instrument_id,version,quantity_unit,capability,effective_at) VALUES (${owner.workspaceId}::uuid,${manualVersion}::uuid,${manualInstrument}::uuid,1,'contract','manual',${economicAt}::timestamptz)`,
        );
      });
      const effects = [
        { cashBucketId: bucket, currencyId: usd, amount: '-5' },
        { cashBucketId: eurBucket, currencyId: eur, amount: '3' },
      ];
      let executionId = '';
      await command(async (tx, state) => {
        executionId = randomUUID();
        await tx.execute(sql`INSERT INTO app.executions(workspace_id,id,command_id,source_revision,account_id,instrument_version_id,side,quantity_raw,price_raw,economic_at,ordering_key,payload)
        VALUES (${owner.workspaceId}::uuid,${executionId}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${manualVersion}::uuid,'buy','1',${price},${economicAt}::timestamptz,'1',${JSON.stringify({ manualCashEffects: effects })}::jsonb)`);
        for (const [index, effect] of effects.entries()) {
          const id = randomUUID();
          await tx.execute(sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at,execution_id)
          VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${`execution:${executionId}:manual:${index}`},${effect.currencyId}::uuid,'manual-settlement',${economicAt}::timestamptz,${executionId}::uuid)`);
          await tx.execute(
            sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,cash_bucket_id,amount_raw) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${effect.currencyId}::uuid,${effect.cashBucketId}::uuid,${effect.amount})`,
          );
          await tx.execute(
            sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,control_key,amount_raw) VALUES (${owner.workspaceId}::uuid,${id}::uuid,${effect.currencyId}::uuid,'manual-instrument-settlement',${index === 0 ? '5' : '-3'})`,
          );
        }
        await allocation(tx, state, executionId, '1');
      });
      const stored = await admin.pool.query(
        'SELECT e.principal_raw,count(p.id)::text AS cash_effects FROM app.executions e JOIN app.ledger_events le ON le.workspace_id=e.workspace_id AND le.execution_id=e.id JOIN app.postings p ON p.workspace_id=le.workspace_id AND p.ledger_event_id=le.id AND p.cash_bucket_id IS NOT NULL WHERE e.workspace_id=$1 AND e.id=$2 GROUP BY e.principal_raw',
        [owner.workspaceId, executionId],
      );
      expect(stored.rows).toEqual([{ principal_raw: null, cash_effects: '2' }]);
    },
  );

  it('F10 preserves typed execution provenance and rejects duplicate or backdated obligation consumption', async () => {
    const unsettled = randomUUID();
    const executionId = randomUUID();
    const feeId = randomUUID();
    const at = (day: number) => `2025-04-${String(day).padStart(2, '0')}T12:00:00.123456Z`;
    await withTenantTransaction(app, owner, (tx) =>
      tx.execute(sql`INSERT INTO app.cash_buckets(workspace_id,id,account_id,currency_id,category)
      VALUES (${owner.workspaceId}::uuid,${unsettled}::uuid,${account}::uuid,${usd}::uuid,'unsettled')`),
    );
    async function post(
      tx: DbTransaction,
      state: Command,
      kind: string,
      eventAt: string,
      debit: string,
      credit: string,
      originalFee?: string,
    ) {
      const id = randomUUID();
      await tx.execute(sql`INSERT INTO app.ledger_events(workspace_id,id,command_id,source_revision,effect_key,currency_id,kind,economic_at,execution_id,fee_id)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${id},${usd}::uuid,${kind},${eventAt}::timestamptz,${originalFee ? null : executionId}::uuid,${originalFee ?? null}::uuid)`);
      await tx.execute(sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,cash_bucket_id,amount_raw)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${usd}::uuid,${unsettled}::uuid,${debit})`);
      if (kind === 'settlement')
        await tx.execute(sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,cash_bucket_id,amount_raw)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${usd}::uuid,${bucket}::uuid,${credit})`);
      else
        await tx.execute(sql`INSERT INTO app.postings(workspace_id,ledger_event_id,currency_id,control_key,amount_raw)
        VALUES (${owner.workspaceId}::uuid,${id}::uuid,${usd}::uuid,'sourced-principal-or-fee',${credit})`);
    }
    await command(async (tx, state) => {
      await tx.execute(sql`INSERT INTO app.executions(workspace_id,id,command_id,source_revision,account_id,instrument_version_id,side,quantity_raw,price_raw,principal_raw,principal_currency_id,economic_at,ordering_key)
        VALUES (${owner.workspaceId}::uuid,${executionId}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${version}::uuid,'buy','2','50','100',${usd}::uuid,${at(1)}::timestamptz,'1')`);
      await tx.execute(sql`INSERT INTO app.fees(workspace_id,id,command_id,source_revision,account_id,execution_id,currency_id,amount_raw,kind,economic_at)
        VALUES (${owner.workspaceId}::uuid,${feeId}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${executionId}::uuid,${usd}::uuid,'1','commission',${at(1)}::timestamptz)`);
      await post(tx, state, 'execution-principal', at(1), '-100', '100');
      await post(tx, state, 'commission', at(1), '-1', '1', feeId);
      await allocation(tx, state, executionId, '2');
    });
    await rejected(
      command((tx, state) => post(tx, state, 'settlement', at(2), '102', '-102')),
      '23514',
    );
    await command((tx, state) => post(tx, state, 'settlement', at(2), '40', '-40'));
    await command((tx, state) => post(tx, state, 'settlement', at(4), '61', '-61'));
    await rejected(
      command((tx, state) => post(tx, state, 'settlement', at(5), '1', '-1')),
      '23514',
    );
    // The proposed earlier 61 would be valid in isolation but would make the
    // already accepted later 61 consume the same source twice.
    await rejected(
      command((tx, state) => post(tx, state, 'settlement', at(3), '61', '-61')),
      '23514',
    );
    const totals = await admin.pool.query(
      `SELECT b.category,sum(p.amount)::text AS amount
      FROM app.postings p JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
      JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
      LEFT JOIN app.fees f ON f.workspace_id=e.workspace_id AND f.id=e.fee_id
      WHERE p.workspace_id=$1 AND (e.execution_id=$2 OR f.execution_id=$2) GROUP BY b.category ORDER BY b.category`,
      [owner.workspaceId, executionId],
    );
    expect(totals.rows).toEqual([
      { category: 'settled', amount: '-101.000000000000000000000000000000000000' },
      { category: 'unsettled', amount: '0.000000000000000000000000000000000000' },
    ]);
  });

  it('accepts signed rebate partitions on separate axes while booking the original once', async () => {
    let feeId = '';
    await command(async (tx, state) => {
      feeId = randomUUID();
      await tx.execute(sql`INSERT INTO app.fees(workspace_id,id,command_id,source_revision,account_id,currency_id,amount_raw,kind,economic_at)
        VALUES (${owner.workspaceId}::uuid,${feeId}::uuid,${state.id}::uuid,${state.revision},${account}::uuid,${usd}::uuid,'-0.00012345','rebate',${economicAt}::timestamptz)`);
      await event(tx, state, '0.00012345', '-0.00012345', { fee: feeId });
      for (const axis of ['campaign', 'inventory']) {
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.cost_attribution_sets(workspace_id,id,command_id,source_revision,fee_id,axis,version,reason)
          VALUES (${owner.workspaceId}::uuid,${id}::uuid,${state.id}::uuid,${state.revision},${feeId}::uuid,${axis},1,'independent axis')`);
        await tx.execute(sql`INSERT INTO app.cost_allocations(workspace_id,attribution_set_id,currency_id,amount_raw,payload)
          VALUES (${owner.workspaceId}::uuid,${id}::uuid,${usd}::uuid,'-0.00012345','{"target":"unassigned"}'::jsonb)`);
      }
    });
    const charge = await admin.pool.query(
      'SELECT count(DISTINCT e.id)::text AS events,sum(p.amount)::text AS amount FROM app.ledger_events e JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id AND p.cash_bucket_id IS NOT NULL WHERE e.workspace_id=$1 AND e.fee_id=$2',
      [owner.workspaceId, feeId],
    );
    expect(charge.rows).toEqual([
      { events: '1', amount: '0.000123450000000000000000000000000000' },
    ]);
  });

  it('conserves known signed source quantity when native long inventory crosses into an unsupported short', async () => {
    const bookId = await unsupportedShortBook();
    const stored = await admin.pool.query(
      `SELECT p.quantity_raw,p.basis_raw,p.state->>'status' AS status,
       (SELECT count(*)::text FROM app.lots l WHERE l.workspace_id=p.workspace_id AND l.holding_book_id=p.holding_book_id AND l.remaining_quantity<>0) AS active_lots
       FROM app.positions p WHERE p.workspace_id=$1 AND p.holding_book_id=$2`,
      [owner.workspaceId, bookId],
    );
    expect(stored.rows).toEqual([
      { quantity_raw: '-1', basis_raw: null, status: 'unsupported', active_lots: '0' },
    ]);
  });

  it('rejects synchronized unsupported projections that invent signed source quantity', async () => {
    const bookId = await unsupportedShortBook();
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const state = sql`jsonb_set(jsonb_set(state,'{openQuantity,value}','"-2"'::jsonb),'{shortQuantity,value}','"2"'::jsonb)`;
        await tx.execute(
          sql`UPDATE app.holding_books SET state=${state} WHERE workspace_id=${owner.workspaceId}::uuid AND id=${bookId}::uuid`,
        );
        await tx.execute(
          sql`UPDATE app.positions SET quantity_raw='-2',state=${state} WHERE workspace_id=${owner.workspaceId}::uuid AND holding_book_id=${bookId}::uuid`,
        );
      }),
      '23514',
    );
  });

  it('rejects invented basis and P&L even when unsupported source quantity remains correct', async () => {
    const bookId = await unsupportedShortBook();
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const state = sql`jsonb_set(state,'{grossBasis}','{"status":"available","value":"10","reasons":[]}'::jsonb)`;
        await tx.execute(
          sql`UPDATE app.holding_books SET state=${state} WHERE workspace_id=${owner.workspaceId}::uuid AND id=${bookId}::uuid`,
        );
        await tx.execute(
          sql`UPDATE app.positions SET basis_raw='10',state=${state} WHERE workspace_id=${owner.workspaceId}::uuid AND holding_book_id=${bookId}::uuid`,
        );
      }),
      '23514',
    );
    await rejected(
      withTenantTransaction(app, owner, async (tx) => {
        const state = sql`jsonb_set(state,'{realizedNet}','{"status":"available","value":"10","reasons":[]}'::jsonb)`;
        await tx.execute(
          sql`UPDATE app.holding_books SET state=${state} WHERE workspace_id=${owner.workspaceId}::uuid AND id=${bookId}::uuid`,
        );
        await tx.execute(
          sql`UPDATE app.positions SET state=${state} WHERE workspace_id=${owner.workspaceId}::uuid AND holding_book_id=${bookId}::uuid`,
        );
      }),
      '23514',
    );
  });
});
