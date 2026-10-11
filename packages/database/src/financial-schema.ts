// Financial source values enter through canonical text. Numeric columns are
// generated only after the immutable SQL validator checks precision.
import { sql } from 'drizzle-orm';
import { auditEvents, workspaces } from './platform-schema.js';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const app = pgSchema('app');
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const financialState = app
  .table(
    'financial_state',
    {
      workspaceId: uuid('workspace_id')
        .primaryKey()
        .references(() => workspaces.id),
      revision: integer('revision').notNull().default(0),
    },
    (table) => [check('financial_state_revision_check', sql`${table.revision} >= 0`)],
  )
  .enableRLS();

export const currencies = app
  .table(
    'currencies',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      namespace: text('namespace').notNull(),
      code: text('code').notNull(),
      kind: text('kind').notNull(),
      unitIdentity: text('unit_identity').notNull(),
      name: text('name').notNull(),
      revision: integer('revision').notNull().default(1),
      archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ name: 'currencies_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'currencies_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'currencies_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('currencies_kind_check', sql.raw("kind IN ('fiat','digital','custom')")),
      check('currencies_revision_check', sql.raw('revision > 0')),
      unique('currencies_workspace_id_namespace_code_key').on(
        table.workspaceId,
        table.namespace,
        table.code,
      ),
      unique('currencies_workspace_id_unit_identity_key').on(table.workspaceId, table.unitIdentity),
    ],
  )
  .enableRLS();

export const currencyConventionVersions = app
  .table(
    'currency_convention_versions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      currencyId: uuid('currency_id').notNull(),
      version: integer('version').notNull(),
      displayScale: integer('display_scale').notNull(),
      settlementIncrementRaw: text('settlement_increment_raw').notNull(),
      settlementIncrement: numeric('settlement_increment', {
        precision: 78,
        scale: 36,
      }).generatedAlwaysAs(sql`app.financial_decimal("settlement_increment_raw")`),
      rounding: text('rounding').notNull().default('HALF_EVEN'),
      effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({
        name: 'currency_convention_versions_pkey',
        columns: [table.workspaceId, table.id],
      }),
      check(
        'currency_convention_versions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'currency_convention_versions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('currency_convention_versions_version_check', sql.raw('version > 0')),
      check(
        'currency_convention_versions_display_scale_check',
        sql.raw('display_scale BETWEEN 0 AND 36'),
      ),
      check(
        'currency_convention_versions_settlement_increment_check',
        sql.raw('settlement_increment > 0'),
      ),
      check('currency_convention_versions_rounding_check', sql.raw("rounding = 'HALF_EVEN'")),
      foreignKey({
        name: 'currency_convention_versions_workspace_id_currency_id_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      unique('currency_convention_versions_workspace_id_currency_id_version_key').on(
        table.workspaceId,
        table.currencyId,
        table.version,
      ),
    ],
  )
  .enableRLS();

export const brokers = app
  .table(
    'brokers',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      name: text('name').notNull(),
      sourceNamespace: text('source_namespace').notNull(),
      revision: integer('revision').notNull().default(1),
      archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ name: 'brokers_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'brokers_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'brokers_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('brokers_revision_check', sql.raw('revision > 0')),
      unique('brokers_workspace_id_source_namespace_key').on(
        table.workspaceId,
        table.sourceNamespace,
      ),
    ],
  )
  .enableRLS();

export const accounts = app
  .table(
    'accounts',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      brokerId: uuid('broker_id'),
      name: text('name').notNull(),
      environment: text('environment').notNull(),
      accountType: text('account_type').notNull(),
      status: text('status').notNull().default('active'),
      revision: integer('revision').notNull().default(1),
      archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ name: 'accounts_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'accounts_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'accounts_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('accounts_environment_check', sql.raw("environment IN ('live','paper')")),
      check('accounts_account_type_check', sql.raw("account_type IN ('cash','margin','other')")),
      check('accounts_status_check', sql.raw("status IN ('active','closed','historical')")),
      check('accounts_revision_check', sql.raw('revision > 0')),
      foreignKey({
        name: 'accounts_workspace_id_broker_id_fkey',
        columns: [table.workspaceId, table.brokerId],
        foreignColumns: [brokers.workspaceId, brokers.id],
      }),
    ],
  )
  .enableRLS();

export const accountSettingsVersions = app
  .table(
    'account_settings_versions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      accountId: uuid('account_id').notNull(),
      version: integer('version').notNull(),
      baseCurrencyId: uuid('base_currency_id').notNull(),
      inventoryMethod: text('inventory_method').notNull(),
      allowShort: boolean('allow_short').notNull().default(false),
      holdingMode: text('holding_mode').notNull().default('netted'),
      effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({
        name: 'account_settings_versions_pkey',
        columns: [table.workspaceId, table.id],
      }),
      check(
        'account_settings_versions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'account_settings_versions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('account_settings_versions_version_check', sql.raw('version > 0')),
      check(
        'account_settings_versions_inventory_method_check',
        sql.raw("inventory_method IN ('fifo','average','specific')"),
      ),
      check(
        'account_settings_versions_holding_mode_check',
        sql.raw("holding_mode IN ('netted','segregated')"),
      ),
      foreignKey({
        name: 'account_settings_versions_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'account_settings_versions_workspace_id_base_currency_id_fkey',
        columns: [table.workspaceId, table.baseCurrencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      unique('account_settings_versions_workspace_id_account_id_version_key').on(
        table.workspaceId,
        table.accountId,
        table.version,
      ),
    ],
  )
  .enableRLS();

export const cashBuckets = app
  .table(
    'cash_buckets',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      accountId: uuid('account_id').notNull(),
      currencyId: uuid('currency_id').notNull(),
      custodyKey: text('custody_key').notNull().default('default'),
      category: text('category').notNull(),
      archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ name: 'cash_buckets_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'cash_buckets_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'cash_buckets_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check(
        'cash_buckets_category_check',
        sql.raw("category IN ('settled','unsettled','restricted','collateral_cash')"),
      ),
      foreignKey({
        name: 'cash_buckets_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'cash_buckets_workspace_id_currency_id_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      unique('cash_buckets_workspace_id_account_id_currency_id_custody_key_category_key').on(
        table.workspaceId,
        table.accountId,
        table.currencyId,
        table.custodyKey,
        table.category,
      ),
      unique('cash_buckets_workspace_id_id_currency_id_key').on(
        table.workspaceId,
        table.id,
        table.currencyId,
      ),
      unique('cash_buckets_workspace_id_id_account_id_currency_id_key').on(
        table.workspaceId,
        table.id,
        table.accountId,
        table.currencyId,
      ),
    ],
  )
  .enableRLS();

export const instruments = app
  .table(
    'instruments',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      name: text('name').notNull(),
      family: text('family').notNull(),
      subtype: text('subtype').notNull(),
      economicIdentity: text('economic_identity').notNull(),
      revision: integer('revision').notNull().default(1),
      archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ name: 'instruments_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'instruments_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'instruments_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('instruments_revision_check', sql.raw('revision > 0')),
      unique('instruments_workspace_id_economic_identity_key').on(
        table.workspaceId,
        table.economicIdentity,
      ),
    ],
  )
  .enableRLS();

export const instrumentVersions = app
  .table(
    'instrument_versions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      instrumentId: uuid('instrument_id').notNull(),
      version: integer('version').notNull(),
      quantityUnit: text('quantity_unit').notNull(),
      quoteCurrencyId: uuid('quote_currency_id'),
      settlementCurrencyId: uuid('settlement_currency_id'),
      multiplierRaw: text('multiplier_raw'),
      multiplier: numeric('multiplier', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("multiplier_raw")`,
      ),
      quantityIncrementRaw: text('quantity_increment_raw'),
      quantityIncrement: numeric('quantity_increment', {
        precision: 78,
        scale: 36,
      }).generatedAlwaysAs(sql`app.financial_decimal("quantity_increment_raw")`),
      priceIncrementRaw: text('price_increment_raw'),
      priceIncrement: numeric('price_increment', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("price_increment_raw")`,
      ),
      capability: text('capability').notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
      effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    },
    (table) => [
      primaryKey({ name: 'instrument_versions_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'instrument_versions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'instrument_versions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('instrument_versions_version_check', sql.raw('version > 0')),
      check(
        'instrument_versions_native_metadata_known',
        sql.raw(
          "capability <> 'native-linear' OR num_nonnulls(quote_currency_id,settlement_currency_id,multiplier_raw,quantity_increment_raw,price_increment_raw)=5",
        ),
      ),
      check('instrument_versions_multiplier_check', sql.raw('multiplier > 0')),
      check('instrument_versions_quantity_increment_check', sql.raw('quantity_increment > 0')),
      check('instrument_versions_price_increment_check', sql.raw('price_increment > 0')),
      check(
        'instrument_versions_capability_check',
        sql.raw("capability IN ('native-linear','manual')"),
      ),
      foreignKey({
        name: 'instrument_versions_workspace_id_instrument_id_fkey',
        columns: [table.workspaceId, table.instrumentId],
        foreignColumns: [instruments.workspaceId, instruments.id],
      }),
      foreignKey({
        name: 'instrument_versions_workspace_id_quote_currency_id_fkey',
        columns: [table.workspaceId, table.quoteCurrencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'instrument_versions_workspace_id_settlement_currency_id_fkey',
        columns: [table.workspaceId, table.settlementCurrencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      unique('instrument_versions_workspace_id_instrument_id_version_key').on(
        table.workspaceId,
        table.instrumentId,
        table.version,
      ),
      unique('instrument_versions_workspace_id_id_instrument_id_key').on(
        table.workspaceId,
        table.id,
        table.instrumentId,
      ),
    ],
  )
  .enableRLS();

export const trades = app
  .table(
    'trades',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      title: text('title').notNull(),
      classification: text('classification').notNull(),
      status: text('status').notNull().default('draft'),
      revision: integer('revision').notNull().default(1),
      archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ name: 'trades_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'trades_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'trades_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check(
        'trades_classification_check',
        sql.raw("classification IN ('active-trading','investing')"),
      ),
      check(
        'trades_status_check',
        sql.raw(
          "status IN ('draft','planned','open','partially_closed','pending_completion','closed','canceled')",
        ),
      ),
      check('trades_revision_check', sql.raw('revision > 0')),
    ],
  )
  .enableRLS();

export const tradeLegs = app
  .table(
    'trade_legs',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      tradeId: uuid('trade_id').notNull(),
      accountId: uuid('account_id').notNull(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      direction: text('direction').notNull(),
      label: text('label').notNull().default(''),
    },
    (table) => [
      primaryKey({ name: 'trade_legs_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'trade_legs_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'trade_legs_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('trade_legs_direction_check', sql.raw("direction IN ('long','short','neutral')")),
      foreignKey({
        name: 'trade_legs_workspace_id_trade_id_fkey',
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [trades.workspaceId, trades.id],
      }),
      foreignKey({
        name: 'trade_legs_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'trade_legs_workspace_id_instrument_version_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
    ],
  )
  .enableRLS();

export const orders = app
  .table(
    'orders',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      accountId: uuid('account_id').notNull(),
      kind: text('kind').notNull(),
      sourceNamespace: text('source_namespace'),
      sourceId: text('source_id'),
    },
    (table) => [
      primaryKey({ name: 'orders_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'orders_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'orders_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('orders_kind_check', sql.raw("kind IN ('single','package')")),
      foreignKey({
        name: 'orders_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      unique('orders_workspace_id_account_id_source_namespace_source_id_key').on(
        table.workspaceId,
        table.accountId,
        table.sourceNamespace,
        table.sourceId,
      ),
      check('orders_invariant_2', sql.raw('(source_namespace IS NULL) = (source_id IS NULL)')),
    ],
  )
  .enableRLS();

export const orderLegs = app
  .table(
    'order_legs',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      orderId: uuid('order_id').notNull(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      side: text('side').notNull(),
      ratioRaw: text('ratio_raw').notNull(),
      ratio: numeric('ratio', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("ratio_raw")`,
      ),
    },
    (table) => [
      primaryKey({ name: 'order_legs_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'order_legs_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'order_legs_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('order_legs_side_check', sql.raw("side IN ('buy','sell')")),
      check('order_legs_ratio_check', sql.raw('ratio > 0')),
      foreignKey({
        name: 'order_legs_workspace_id_order_id_fkey',
        columns: [table.workspaceId, table.orderId],
        foreignColumns: [orders.workspaceId, orders.id],
      }),
      foreignKey({
        name: 'order_legs_workspace_id_instrument_version_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
    ],
  )
  .enableRLS();

export const orderRevisions = app
  .table(
    'order_revisions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      orderId: uuid('order_id').notNull(),
      revision: integer('revision').notNull(),
      status: text('status').notNull(),
      payload: jsonb('payload').notNull(),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
    },
    (table) => [
      primaryKey({ name: 'order_revisions_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'order_revisions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'order_revisions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('order_revisions_revision_check', sql.raw('revision > 0')),
      check(
        'order_revisions_status_check',
        sql.raw(
          "status IN ('recorded','pending','working','partially_filled','filled','canceled','rejected','expired')",
        ),
      ),
      foreignKey({
        name: 'order_revisions_workspace_id_order_id_fkey',
        columns: [table.workspaceId, table.orderId],
        foreignColumns: [orders.workspaceId, orders.id],
      }),
      unique('order_revisions_workspace_id_order_id_revision_key').on(
        table.workspaceId,
        table.orderId,
        table.revision,
      ),
    ],
  )
  .enableRLS();

export const financialCommands = app
  .table(
    'financial_commands',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      idempotencyKey: text('idempotency_key').notNull(),
      auditEventId: uuid('audit_event_id').notNull(),
      requestId: text('request_id'),
      requestHash: text('request_hash').notNull(),
      kind: text('kind').notNull(),
      result: jsonb('result').notNull(),
      sourceRevision: integer('source_revision').notNull(),
    },
    (table) => [
      primaryKey({ name: 'financial_commands_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'financial_commands_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'financial_commands_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check(
        'financial_commands_idempotency_key_check',
        sql.raw('char_length(idempotency_key) BETWEEN 1 AND 200'),
      ),
      check('financial_commands_request_hash_check', sql.raw("request_hash ~ '^[0-9a-f]{64}$'")),
      foreignKey({
        name: 'financial_commands_workspace_id_audit_event_id_fkey',
        columns: [table.workspaceId, table.auditEventId],
        foreignColumns: [auditEvents.workspaceId, auditEvents.id],
      }),
      check('financial_commands_source_revision_check', sql.raw('source_revision > 0')),
      unique('financial_commands_workspace_id_idempotency_key_key').on(
        table.workspaceId,
        table.idempotencyKey,
      ),
      unique('financial_commands_workspace_id_source_revision_key').on(
        table.workspaceId,
        table.sourceRevision,
      ),
    ],
  )
  .enableRLS();

export const executions = app
  .table(
    'executions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      accountId: uuid('account_id').notNull(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      orderLegId: uuid('order_leg_id'),
      side: text('side').notNull(),
      quantityRaw: text('quantity_raw').notNull(),
      quantity: numeric('quantity', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("quantity_raw")`,
      ),
      priceRaw: text('price_raw'),
      price: numeric('price', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("price_raw")`,
      ),
      principalRaw: text('principal_raw'),
      principal: numeric('principal', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("principal_raw")`,
      ),
      principalCurrencyId: uuid('principal_currency_id'),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      orderingKey: text('ordering_key').notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
      supersedesId: uuid('supersedes_id'),
      sourceNamespace: text('source_namespace'),
      sourceId: text('source_id'),
    },
    (table) => [
      primaryKey({ name: 'executions_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'executions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'executions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('executions_source_revision_check', sql.raw('source_revision > 0')),
      check('executions_side_check', sql.raw("side IN ('buy','sell')")),
      check('executions_quantity_check', sql.raw('quantity > 0')),
      check('executions_price_check', sql.raw('price >= 0')),
      check('executions_principal_check', sql.raw('principal >= 0')),
      foreignKey({
        name: 'executions_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'executions_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'executions_workspace_id_instrument_version_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
      foreignKey({
        name: 'executions_workspace_id_order_leg_id_fkey',
        columns: [table.workspaceId, table.orderLegId],
        foreignColumns: [orderLegs.workspaceId, orderLegs.id],
      }),
      foreignKey({
        name: 'executions_workspace_id_principal_currency_id_fkey',
        columns: [table.workspaceId, table.principalCurrencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'executions_workspace_id_supersedes_id_fkey',
        columns: [table.workspaceId, table.supersedesId],
        foreignColumns: [table.workspaceId, table.id],
      }),
      check(
        'executions_invariant_6',
        sql.raw('(principal_raw IS NULL) = (principal_currency_id IS NULL)'),
      ),
      check('executions_invariant_7', sql.raw('(source_namespace IS NULL) = (source_id IS NULL)')),
      unique('executions_workspace_id_account_id_source_namespace_source_id_key').on(
        table.workspaceId,
        table.accountId,
        table.sourceNamespace,
        table.sourceId,
      ),
    ],
  )
  .enableRLS();

export const openingLots = app
  .table(
    'opening_lots',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      accountId: uuid('account_id').notNull(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      quantityRaw: text('quantity_raw').notNull(),
      quantity: numeric('quantity', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("quantity_raw")`,
      ),
      direction: text('direction').notNull(),
      priceRaw: text('price_raw'),
      price: numeric('price', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("price_raw")`,
      ),
      principalRaw: text('principal_raw'),
      principal: numeric('principal', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("principal_raw")`,
      ),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      orderingKey: text('ordering_key').notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'opening_lots_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'opening_lots_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'opening_lots_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('opening_lots_source_revision_check', sql.raw('source_revision > 0')),
      check('opening_lots_quantity_check', sql.raw('quantity > 0')),
      check('opening_lots_direction_check', sql.raw("direction IN ('long','short')")),
      check('opening_lots_price_check', sql.raw('price >= 0')),
      check('opening_lots_principal_check', sql.raw('principal >= 0')),
      foreignKey({
        name: 'opening_lots_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'opening_lots_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'opening_lots_workspace_id_instrument_version_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
    ],
  )
  .enableRLS();

export const fees = app
  .table(
    'fees',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      accountId: uuid('account_id').notNull(),
      executionId: uuid('execution_id'),
      currencyId: uuid('currency_id').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("amount_raw")`,
      ),
      kind: text('kind').notNull(),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'fees_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'fees_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'fees_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('fees_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'fees_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'fees_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'fees_workspace_id_execution_id_fkey',
        columns: [table.workspaceId, table.executionId],
        foreignColumns: [executions.workspaceId, executions.id],
      }),
      foreignKey({
        name: 'fees_workspace_id_currency_id_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
    ],
  )
  .enableRLS();

export const cashMovements = app
  .table(
    'cash_movements',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      accountId: uuid('account_id').notNull(),
      cashBucketId: uuid('cash_bucket_id').notNull(),
      currencyId: uuid('currency_id').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("amount_raw")`,
      ),
      kind: text('kind').notNull(),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'cash_movements_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'cash_movements_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'cash_movements_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('cash_movements_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'cash_movements_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'cash_movements_workspace_id_cash_bucket_id_account_id_currency_id_fkey',
        columns: [table.workspaceId, table.cashBucketId, table.accountId, table.currencyId],
        foreignColumns: [
          cashBuckets.workspaceId,
          cashBuckets.id,
          cashBuckets.accountId,
          cashBuckets.currencyId,
        ],
      }),
    ],
  )
  .enableRLS();

export const fxConversions = app
  .table(
    'fx_conversions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      sourceBucketId: uuid('source_bucket_id').notNull(),
      destinationBucketId: uuid('destination_bucket_id').notNull(),
      sourceAmountRaw: text('source_amount_raw').notNull(),
      sourceAmount: numeric('source_amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("source_amount_raw")`,
      ),
      destinationAmountRaw: text('destination_amount_raw').notNull(),
      destinationAmount: numeric('destination_amount', {
        precision: 78,
        scale: 36,
      }).generatedAlwaysAs(sql`app.financial_decimal("destination_amount_raw")`),
      rateRaw: text('rate_raw'),
      rate: numeric('rate', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("rate_raw")`,
      ),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'fx_conversions_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'fx_conversions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'fx_conversions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('fx_conversions_source_revision_check', sql.raw('source_revision > 0')),
      check('fx_conversions_source_amount_check', sql.raw('source_amount > 0')),
      check('fx_conversions_destination_amount_check', sql.raw('destination_amount > 0')),
      check('fx_conversions_rate_check', sql.raw('rate > 0')),
      foreignKey({
        name: 'fx_conversions_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'fx_conversions_workspace_id_source_bucket_id_fkey',
        columns: [table.workspaceId, table.sourceBucketId],
        foreignColumns: [cashBuckets.workspaceId, cashBuckets.id],
      }),
      foreignKey({
        name: 'fx_conversions_workspace_id_destination_bucket_id_fkey',
        columns: [table.workspaceId, table.destinationBucketId],
        foreignColumns: [cashBuckets.workspaceId, cashBuckets.id],
      }),
      check('fx_conversions_invariant_3', sql.raw('source_bucket_id <> destination_bucket_id')),
    ],
  )
  .enableRLS();

export const ledgerEvents = app
  .table(
    'ledger_events',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      effectKey: text('effect_key').notNull(),
      currencyId: uuid('currency_id').notNull(),
      kind: text('kind').notNull(),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      reversalOfId: uuid('reversal_of_id'),
      executionId: uuid('execution_id'),
      feeId: uuid('fee_id'),
      cashMovementId: uuid('cash_movement_id'),
      fxConversionId: uuid('fx_conversion_id'),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'ledger_events_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'ledger_events_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'ledger_events_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('ledger_events_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'ledger_events_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'ledger_events_workspace_id_currency_id_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'ledger_events_workspace_id_reversal_of_id_fkey',
        columns: [table.workspaceId, table.reversalOfId],
        foreignColumns: [table.workspaceId, table.id],
      }),
      foreignKey({
        name: 'ledger_events_workspace_id_execution_id_fkey',
        columns: [table.workspaceId, table.executionId],
        foreignColumns: [executions.workspaceId, executions.id],
      }),
      foreignKey({
        name: 'ledger_events_workspace_id_fee_id_fkey',
        columns: [table.workspaceId, table.feeId],
        foreignColumns: [fees.workspaceId, fees.id],
      }),
      foreignKey({
        name: 'ledger_events_workspace_id_cash_movement_id_fkey',
        columns: [table.workspaceId, table.cashMovementId],
        foreignColumns: [cashMovements.workspaceId, cashMovements.id],
      }),
      foreignKey({
        name: 'ledger_events_workspace_id_fx_conversion_id_fkey',
        columns: [table.workspaceId, table.fxConversionId],
        foreignColumns: [fxConversions.workspaceId, fxConversions.id],
      }),
      check(
        'ledger_events_execution_effect_kind',
        sql.raw(
          "execution_id IS NULL OR kind IN ('execution-principal','manual-settlement','settlement')",
        ),
      ),
      check(
        'ledger_events_source_exclusive',
        sql.raw(
          'num_nonnulls(execution_id,fee_id,cash_movement_id,fx_conversion_id,reversal_of_id) <= 1',
        ),
      ),
      uniqueIndex('ledger_events_native_principal_idx')
        .on(table.workspaceId, table.executionId)
        .where(sql`${table.kind}='execution-principal'`),
      unique('ledger_events_workspace_id_fee_id_key').on(table.workspaceId, table.feeId),
      unique('ledger_events_workspace_id_cash_movement_id_key').on(
        table.workspaceId,
        table.cashMovementId,
      ),
      unique('ledger_events_workspace_id_effect_key_key').on(table.workspaceId, table.effectKey),
      unique('ledger_events_workspace_id_reversal_of_id_key').on(
        table.workspaceId,
        table.reversalOfId,
      ),
      unique('ledger_events_workspace_id_id_currency_id_key').on(
        table.workspaceId,
        table.id,
        table.currencyId,
      ),
    ],
  )
  .enableRLS();

export const postings = app
  .table(
    'postings',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      ledgerEventId: uuid('ledger_event_id').notNull(),
      currencyId: uuid('currency_id').notNull(),
      cashBucketId: uuid('cash_bucket_id'),
      controlKey: text('control_key'),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("amount_raw")`,
      ),
    },
    (table) => [
      primaryKey({ name: 'postings_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'postings_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'postings_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      foreignKey({
        name: 'postings_workspace_id_ledger_event_id_currency_id_fkey',
        columns: [table.workspaceId, table.ledgerEventId, table.currencyId],
        foreignColumns: [ledgerEvents.workspaceId, ledgerEvents.id, ledgerEvents.currencyId],
      }),
      foreignKey({
        name: 'postings_workspace_id_cash_bucket_id_currency_id_fkey',
        columns: [table.workspaceId, table.cashBucketId, table.currencyId],
        foreignColumns: [cashBuckets.workspaceId, cashBuckets.id, cashBuckets.currencyId],
      }),
      check('postings_invariant_2', sql.raw('(cash_bucket_id IS NULL) <> (control_key IS NULL)')),
      check(
        'postings_invariant_3',
        sql.raw('control_key IS NULL OR char_length(btrim(control_key)) BETWEEN 1 AND 120'),
      ),
    ],
  )
  .enableRLS();

export const holdingBooks = app
  .table(
    'holding_books',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      accountId: uuid('account_id').notNull(),
      instrumentId: uuid('instrument_id').notNull(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      inventoryMethod: text('inventory_method').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      state: jsonb('state')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'holding_books_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'holding_books_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'holding_books_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check(
        'holding_books_inventory_method_check',
        sql.raw("inventory_method IN ('fifo','average','specific')"),
      ),
      check('holding_books_source_revision_check', sql.raw('source_revision >= 0')),
      foreignKey({
        name: 'holding_books_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'holding_books_workspace_id_instrument_id_fkey',
        columns: [table.workspaceId, table.instrumentId],
        foreignColumns: [instruments.workspaceId, instruments.id],
      }),
      foreignKey({
        name: 'holding_books_workspace_id_instrument_version_id_instrument_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId, table.instrumentId],
        foreignColumns: [
          instrumentVersions.workspaceId,
          instrumentVersions.id,
          instrumentVersions.instrumentId,
        ],
      }),
      unique('holding_books_workspace_id_account_id_instrument_id_key').on(
        table.workspaceId,
        table.accountId,
        table.instrumentId,
      ),
    ],
  )
  .enableRLS();

export const positions = app
  .table(
    'positions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      holdingBookId: uuid('holding_book_id').notNull(),
      quantityRaw: text('quantity_raw'),
      quantity: numeric('quantity', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("quantity_raw")`,
      ),
      basisRaw: text('basis_raw'),
      basis: numeric('basis', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("basis_raw")`,
      ),
      sourceRevision: integer('source_revision').notNull(),
      state: jsonb('state').notNull(),
    },
    (table) => [
      primaryKey({ name: 'positions_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'positions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'positions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('positions_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'positions_workspace_id_holding_book_id_fkey',
        columns: [table.workspaceId, table.holdingBookId],
        foreignColumns: [holdingBooks.workspaceId, holdingBooks.id],
      }),
      unique('positions_workspace_id_holding_book_id_key').on(
        table.workspaceId,
        table.holdingBookId,
      ),
    ],
  )
  .enableRLS();

export const lots = app
  .table(
    'lots',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      holdingBookId: uuid('holding_book_id').notNull(),
      executionId: uuid('execution_id'),
      holdingTransferId: uuid('holding_transfer_id'),
      direction: text('direction').notNull(),
      openingLotId: uuid('opening_lot_id'),
      remainingQuantityRaw: text('remaining_quantity_raw').notNull(),
      remainingQuantity: numeric('remaining_quantity', {
        precision: 78,
        scale: 36,
      }).generatedAlwaysAs(sql`app.financial_decimal("remaining_quantity_raw")`),
      sourceRevision: integer('source_revision').notNull(),
      state: jsonb('state').notNull(),
    },
    (table) => [
      primaryKey({ name: 'lots_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'lots_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'lots_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('lots_direction_check', sql.raw("direction IN ('long','short')")),
      check('lots_remaining_quantity_check', sql.raw('remaining_quantity >= 0')),
      check('lots_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'lots_workspace_id_holding_book_id_fkey',
        columns: [table.workspaceId, table.holdingBookId],
        foreignColumns: [holdingBooks.workspaceId, holdingBooks.id],
      }),
      foreignKey({
        name: 'lots_workspace_id_execution_id_fkey',
        columns: [table.workspaceId, table.executionId],
        foreignColumns: [executions.workspaceId, executions.id],
      }),
      foreignKey({
        name: 'lots_workspace_id_opening_lot_id_fkey',
        columns: [table.workspaceId, table.openingLotId],
        foreignColumns: [openingLots.workspaceId, openingLots.id],
      }),
      foreignKey({
        name: 'lots_workspace_id_holding_transfer_id_fkey',
        columns: [table.workspaceId, table.holdingTransferId],
        foreignColumns: [holdingTransfers.workspaceId, holdingTransfers.id],
      }),
      check(
        'lots_invariant_3',
        sql.raw(
          'num_nonnulls(execution_id,opening_lot_id) <= 1 AND num_nonnulls(execution_id,opening_lot_id,holding_transfer_id) >= 1',
        ),
      ),
    ],
  )
  .enableRLS();

export const lotMatches = app
  .table(
    'lot_matches',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      holdingBookId: uuid('holding_book_id').notNull(),
      openingLotId: uuid('opening_lot_id'),
      closingExecutionId: uuid('closing_execution_id').notNull(),
      quantityRaw: text('quantity_raw').notNull(),
      quantity: numeric('quantity', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("quantity_raw")`,
      ),
      sourceRevision: integer('source_revision').notNull(),
      payload: jsonb('payload').notNull(),
    },
    (table) => [
      primaryKey({ name: 'lot_matches_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'lot_matches_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'lot_matches_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('lot_matches_quantity_check', sql.raw('quantity > 0')),
      check('lot_matches_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'lot_matches_workspace_id_holding_book_id_fkey',
        columns: [table.workspaceId, table.holdingBookId],
        foreignColumns: [holdingBooks.workspaceId, holdingBooks.id],
      }),
      foreignKey({
        name: 'lot_matches_workspace_id_opening_lot_id_fkey',
        columns: [table.workspaceId, table.openingLotId],
        foreignColumns: [lots.workspaceId, lots.id],
      }),
      foreignKey({
        name: 'lot_matches_workspace_id_closing_execution_id_fkey',
        columns: [table.workspaceId, table.closingExecutionId],
        foreignColumns: [executions.workspaceId, executions.id],
      }),
    ],
  )
  .enableRLS();

export const allocationSets = app
  .table(
    'allocation_sets',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      executionId: uuid('execution_id').notNull(),
      version: integer('version').notNull(),
      reason: text('reason').notNull(),
    },
    (table) => [
      primaryKey({ name: 'allocation_sets_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'allocation_sets_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'allocation_sets_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('allocation_sets_source_revision_check', sql.raw('source_revision > 0')),
      check('allocation_sets_version_check', sql.raw('version > 0')),
      foreignKey({
        name: 'allocation_sets_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'allocation_sets_workspace_id_execution_id_fkey',
        columns: [table.workspaceId, table.executionId],
        foreignColumns: [executions.workspaceId, executions.id],
      }),
      unique('allocation_sets_workspace_id_execution_id_version_key').on(
        table.workspaceId,
        table.executionId,
        table.version,
      ),
    ],
  )
  .enableRLS();

export const allocationItems = app
  .table(
    'allocation_items',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      allocationSetId: uuid('allocation_set_id').notNull(),
      tradeLegId: uuid('trade_leg_id'),
      quantityRaw: text('quantity_raw').notNull(),
      quantity: numeric('quantity', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("quantity_raw")`,
      ),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'allocation_items_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'allocation_items_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'allocation_items_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('allocation_items_quantity_check', sql.raw('quantity >= 0')),
      foreignKey({
        name: 'allocation_items_workspace_id_allocation_set_id_fkey',
        columns: [table.workspaceId, table.allocationSetId],
        foreignColumns: [allocationSets.workspaceId, allocationSets.id],
      }),
      foreignKey({
        name: 'allocation_items_workspace_id_trade_leg_id_fkey',
        columns: [table.workspaceId, table.tradeLegId],
        foreignColumns: [tradeLegs.workspaceId, tradeLegs.id],
      }),
    ],
  )
  .enableRLS();

export const costAttributionSets = app
  .table(
    'cost_attribution_sets',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      feeId: uuid('fee_id').notNull(),
      axis: text('axis').notNull(),
      version: integer('version').notNull(),
      reason: text('reason').notNull(),
    },
    (table) => [
      primaryKey({ name: 'cost_attribution_sets_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'cost_attribution_sets_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'cost_attribution_sets_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('cost_attribution_sets_source_revision_check', sql.raw('source_revision > 0')),
      check('cost_attribution_sets_axis_check', sql.raw("axis IN ('campaign','inventory')")),
      check('cost_attribution_sets_version_check', sql.raw('version > 0')),
      foreignKey({
        name: 'cost_attribution_sets_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'cost_attribution_sets_workspace_id_fee_id_fkey',
        columns: [table.workspaceId, table.feeId],
        foreignColumns: [fees.workspaceId, fees.id],
      }),
      unique('cost_attribution_sets_workspace_id_fee_id_axis_version_key').on(
        table.workspaceId,
        table.feeId,
        table.axis,
        table.version,
      ),
    ],
  )
  .enableRLS();

export const costAllocations = app
  .table(
    'cost_allocations',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      attributionSetId: uuid('attribution_set_id').notNull(),
      tradeLegId: uuid('trade_leg_id'),
      lotId: uuid('lot_id'),
      currencyId: uuid('currency_id').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("amount_raw")`,
      ),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'cost_allocations_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'cost_allocations_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'cost_allocations_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      foreignKey({
        name: 'cost_allocations_workspace_id_attribution_set_id_fkey',
        columns: [table.workspaceId, table.attributionSetId],
        foreignColumns: [costAttributionSets.workspaceId, costAttributionSets.id],
      }),
      foreignKey({
        name: 'cost_allocations_workspace_id_trade_leg_id_fkey',
        columns: [table.workspaceId, table.tradeLegId],
        foreignColumns: [tradeLegs.workspaceId, tradeLegs.id],
      }),
      foreignKey({
        name: 'cost_allocations_workspace_id_lot_id_fkey',
        columns: [table.workspaceId, table.lotId],
        foreignColumns: [lots.workspaceId, lots.id],
      }),
      foreignKey({
        name: 'cost_allocations_workspace_id_currency_id_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      check('cost_allocations_invariant_4', sql.raw('trade_leg_id IS NULL OR lot_id IS NULL')),
    ],
  )
  .enableRLS();

export const executionSupersessions = app
  .table(
    'execution_supersessions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      originalExecutionId: uuid('original_execution_id').notNull(),
      replacementExecutionId: uuid('replacement_execution_id').notNull(),
      reason: text('reason').notNull(),
    },
    (table) => [
      primaryKey({ name: 'execution_supersessions_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'execution_supersessions_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'execution_supersessions_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('execution_supersessions_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'execution_supersessions_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'execution_supersessions_workspace_id_original_execution_id_fkey',
        columns: [table.workspaceId, table.originalExecutionId],
        foreignColumns: [executions.workspaceId, executions.id],
      }),
      foreignKey({
        name: 'execution_supersessions_workspace_id_replacement_execution_id_fkey',
        columns: [table.workspaceId, table.replacementExecutionId],
        foreignColumns: [executions.workspaceId, executions.id],
      }),
      unique('execution_supersessions_workspace_id_original_execution_id_key').on(
        table.workspaceId,
        table.originalExecutionId,
      ),
      unique('execution_supersessions_workspace_id_replacement_execution_id_key').on(
        table.workspaceId,
        table.replacementExecutionId,
      ),
      check(
        'execution_supersessions_invariant_5',
        sql.raw('original_execution_id <> replacement_execution_id'),
      ),
    ],
  )
  .enableRLS();

export const fxObservations = app
  .table(
    'fx_observations',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      baseCurrencyId: uuid('base_currency_id').notNull(),
      quoteCurrencyId: uuid('quote_currency_id').notNull(),
      rateRaw: text('rate_raw').notNull(),
      rate: numeric('rate', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("rate_raw")`,
      ),
      observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
      source: text('source').notNull(),
      supersedesId: uuid('supersedes_id'),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'fx_observations_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'fx_observations_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'fx_observations_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('fx_observations_rate_check', sql.raw('rate > 0')),
      foreignKey({
        name: 'fx_observations_workspace_id_base_currency_id_fkey',
        columns: [table.workspaceId, table.baseCurrencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'fx_observations_workspace_id_quote_currency_id_fkey',
        columns: [table.workspaceId, table.quoteCurrencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'fx_observations_workspace_id_supersedes_id_fkey',
        columns: [table.workspaceId, table.supersedesId],
        foreignColumns: [table.workspaceId, table.id],
      }),
      check('fx_observations_invariant_3', sql.raw('base_currency_id <> quote_currency_id')),
    ],
  )
  .enableRLS();

export const priceObservations = app
  .table(
    'price_observations',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      currencyId: uuid('currency_id').notNull(),
      priceRaw: text('price_raw').notNull(),
      price: numeric('price', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("price_raw")`,
      ),
      observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
      source: text('source').notNull(),
      supersedesId: uuid('supersedes_id'),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({ name: 'price_observations_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'price_observations_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'price_observations_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('price_observations_price_check', sql.raw('price >= 0')),
      foreignKey({
        name: 'price_observations_workspace_id_instrument_version_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
      foreignKey({
        name: 'price_observations_workspace_id_currency_id_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'price_observations_workspace_id_supersedes_id_fkey',
        columns: [table.workspaceId, table.supersedesId],
        foreignColumns: [table.workspaceId, table.id],
      }),
    ],
  )
  .enableRLS();

export const outboxEvents = app
  .table(
    'outbox_events',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      eventKind: text('event_kind').notNull(),
      payload: jsonb('payload').notNull(),
    },
    (table) => [
      primaryKey({ name: 'outbox_events_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'outbox_events_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'outbox_events_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('outbox_events_source_revision_check', sql.raw('source_revision > 0')),
      foreignKey({
        name: 'outbox_events_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
    ],
  )
  .enableRLS();

export const holdingTransfers = app
  .table(
    'holding_transfers',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      sourceAccountId: uuid('source_account_id').notNull(),
      destinationAccountId: uuid('destination_account_id').notNull(),
      sourceHoldingBookId: uuid('source_holding_book_id').notNull(),
      destinationHoldingBookId: uuid('destination_holding_book_id').notNull(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      quantityRaw: text('quantity_raw').notNull(),
      quantity: numeric('quantity', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("quantity_raw")`,
      ),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      orderingKey: text('ordering_key').notNull(),
      payload: jsonb('payload').notNull(),
    },
    (table) => [
      primaryKey({ name: 'holding_transfers_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'holding_transfers_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'holding_transfers_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('holding_transfers_quantity_check', sql`${table.quantity} > 0`),
      check('holding_transfers_revision_check', sql`${table.sourceRevision} > 0`),
      check(
        'holding_transfers_distinct_books',
        sql`${table.sourceAccountId} <> ${table.destinationAccountId} AND ${table.sourceHoldingBookId} <> ${table.destinationHoldingBookId}`,
      ),
      foreignKey({
        name: 'holding_transfers_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'holding_transfers_workspace_id_source_account_id_fkey',
        columns: [table.workspaceId, table.sourceAccountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'holding_transfers_workspace_id_destination_account_id_fkey',
        columns: [table.workspaceId, table.destinationAccountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'holding_transfers_workspace_id_source_holding_book_id_fkey',
        columns: [table.workspaceId, table.sourceHoldingBookId],
        foreignColumns: [holdingBooks.workspaceId, holdingBooks.id],
      }),
      foreignKey({
        name: 'holding_transfers_workspace_id_destination_holding_book_id_fkey',
        columns: [table.workspaceId, table.destinationHoldingBookId],
        foreignColumns: [holdingBooks.workspaceId, holdingBooks.id],
      }),
      foreignKey({
        name: 'holding_transfers_workspace_id_instrument_version_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
    ],
  )
  .enableRLS();

export const inventoryEvents = app
  .table(
    'inventory_events',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      accountId: uuid('account_id').notNull(),
      instrumentVersionId: uuid('instrument_version_id').notNull(),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      orderingKey: text('ordering_key').notNull(),
      kind: text('kind').notNull(),
      payload: jsonb('payload').notNull(),
    },
    (table) => [
      primaryKey({ name: 'inventory_events_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'inventory_events_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'inventory_events_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('inventory_events_revision_check', sql`${table.sourceRevision} > 0`),
      check(
        'inventory_events_kind_check',
        sql`${table.kind} IN ('policy-transition','cost-attribution')`,
      ),
      foreignKey({
        name: 'inventory_events_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'inventory_events_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'inventory_events_workspace_id_instrument_version_id_fkey',
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
    ],
  )
  .enableRLS();

export const tradeClosures = app
  .table(
    'trade_closures',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      tradeId: uuid('trade_id').notNull(),
      definitionVersion: text('definition_version').notNull(),
      confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull(),
      payload: jsonb('payload').notNull(),
    },
    (table) => [
      primaryKey({ name: 'trade_closures_pkey', columns: [table.workspaceId, table.id] }),
      check(
        'trade_closures_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'trade_closures_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check('trade_closures_revision_check', sql`${table.sourceRevision} > 0`),
      check(
        'trade_closures_definition_check',
        sql`char_length(${table.definitionVersion}) BETWEEN 1 AND 120`,
      ),
      foreignKey({
        name: 'trade_closures_workspace_id_command_id_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'trade_closures_workspace_id_trade_id_fkey',
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [trades.workspaceId, trades.id],
      }),
    ],
  )
  .enableRLS();

export const accountValuationObservations = app
  .table(
    'account_valuation_observations',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      origin: text('origin').notNull().default('manual'),
      createdAt: createdAt(),
      accountId: uuid('account_id').notNull(),
      currencyId: uuid('currency_id').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("amount_raw")`,
      ),
      observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
      definition: text('definition').notNull(),
      source: text('source').notNull(),
      supersedesId: uuid('supersedes_id'),
      payload: jsonb('payload')
        .notNull()
        .default(sql`'{}'::jsonb`),
    },
    (table) => [
      primaryKey({
        name: 'account_valuation_observations_pkey',
        columns: [table.workspaceId, table.id],
      }),
      check(
        'account_valuation_observations_id_check',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check(
        'account_valuation_observations_origin_check',
        sql`${table.origin} IN ('manual','import','broker','provider','calculated')`,
      ),
      check(
        'account_valuation_observations_definition_check',
        sql`char_length(${table.definition}) BETWEEN 1 AND 160`,
      ),
      check(
        'account_valuation_observations_source_check',
        sql`char_length(${table.source}) BETWEEN 1 AND 200`,
      ),
      foreignKey({
        name: 'account_valuation_observations_workspace_id_account_id_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        name: 'account_valuation_observations_workspace_id_currency_id_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'account_valuation_observations_workspace_id_supersedes_id_fkey',
        columns: [table.workspaceId, table.supersedesId],
        foreignColumns: [table.workspaceId, table.id],
      }),
    ],
  )
  .enableRLS();

export const financialSchema = {
  accountValuationObservations,
  inventoryEvents,
  tradeClosures,
  holdingTransfers,
  financialState,
  currencies,
  currencyConventionVersions,
  brokers,
  accounts,
  accountSettingsVersions,
  cashBuckets,
  instruments,
  instrumentVersions,
  trades,
  tradeLegs,
  orders,
  orderLegs,
  orderRevisions,
  financialCommands,
  executions,
  openingLots,
  fees,
  cashMovements,
  fxConversions,
  ledgerEvents,
  postings,
  holdingBooks,
  positions,
  lots,
  lotMatches,
  allocationSets,
  allocationItems,
  costAttributionSets,
  costAllocations,
  executionSupersessions,
  fxObservations,
  priceObservations,
  outboxEvents,
};
