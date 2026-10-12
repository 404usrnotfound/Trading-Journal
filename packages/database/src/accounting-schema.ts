// Accounting definitions and typed cash evidence are immutable workspace facts.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
import { accounts, cashBuckets, currencies, financialCommands } from './financial-schema.js';
const app = pgSchema('app');
const common = () => ({
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  id: uuid('id').notNull().defaultRandom(),
  actorId: text('actor_id')
    .notNull()
    .default(sql`app.current_actor_id()`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`),
  commandId: uuid('command_id').notNull(),
  sourceRevision: integer('source_revision').notNull(),
});
const uuid4 = (column: string) =>
  sql.raw(
    `${column}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
  );

export const portfolios = app
  .table('portfolios', common(), (table) => [
    primaryKey({ name: 'portfolios_pkey', columns: [table.workspaceId, table.id] }),
    check('portfolios_id_check', uuid4('id')),
    check('portfolios_source_revision_check', sql`${table.sourceRevision} > 0`),
    foreignKey({
      name: 'portfolios_command_fkey',
      columns: [table.workspaceId, table.commandId],
      foreignColumns: [financialCommands.workspaceId, financialCommands.id],
    }),
    unique('portfolios_command_key').on(table.workspaceId, table.commandId),
  ])
  .enableRLS();

export const portfolioVersions = app
  .table(
    'portfolio_versions',
    {
      ...common(),
      portfolioId: uuid('portfolio_id').notNull(),
      version: integer('version').notNull(),
      name: text('name').notNull(),
      description: text('description').notNull().default(''),
      environment: text('environment').notNull(),
      archived: boolean('archived').notNull().default(false),
      reason: text('reason').notNull().default('Created'),
    },
    (table) => [
      primaryKey({ name: 'portfolio_versions_pkey', columns: [table.workspaceId, table.id] }),
      check('portfolio_versions_id_check', uuid4('id')),
      check('portfolio_versions_source_revision_check', sql`${table.sourceRevision} > 0`),
      check('portfolio_versions_version_check', sql`${table.version} > 0`),
      check(
        'portfolio_versions_name_check',
        sql`app.journal_text_length(app.journal_trim(${table.name})) BETWEEN 1 AND 160`,
      ),
      check(
        'portfolio_versions_description_check',
        sql`app.journal_text_length(${table.description}) <= 4000`,
      ),
      check(
        'portfolio_versions_reason_check',
        sql`app.journal_text_length(app.journal_trim(${table.reason})) BETWEEN 1 AND 2000`,
      ),
      check('portfolio_versions_environment_check', sql`${table.environment} IN ('live','paper')`),
      foreignKey({
        name: 'portfolio_versions_portfolio_fkey',
        columns: [table.workspaceId, table.portfolioId],
        foreignColumns: [portfolios.workspaceId, portfolios.id],
      }),
      foreignKey({
        name: 'portfolio_versions_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      unique('portfolio_versions_version_key').on(
        table.workspaceId,
        table.portfolioId,
        table.version,
      ),
      unique('portfolio_versions_command_key').on(table.workspaceId, table.commandId),
      index('portfolio_versions_history_idx').on(
        table.workspaceId,
        table.portfolioId,
        table.version,
      ),
    ],
  )
  .enableRLS();

export const portfolioVersionAccounts = app
  .table(
    'portfolio_version_accounts',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      versionId: uuid('version_id').notNull(),
      accountId: uuid('account_id').notNull(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql`clock_timestamp()`),
    },
    (table) => [
      primaryKey({
        name: 'portfolio_version_accounts_pkey',
        columns: [table.workspaceId, table.versionId, table.accountId],
      }),
      foreignKey({
        name: 'portfolio_version_accounts_version_fkey',
        columns: [table.workspaceId, table.versionId],
        foreignColumns: [portfolioVersions.workspaceId, portfolioVersions.id],
      }),
      foreignKey({
        name: 'portfolio_version_accounts_account_fkey',
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
    ],
  )
  .enableRLS();

export const accountCashEvents = app
  .table(
    'account_cash_events',
    {
      ...common(),
      accountId: uuid('account_id').notNull(),
      cashBucketId: uuid('cash_bucket_id').notNull(),
      currencyId: uuid('currency_id').notNull(),
      kind: text('kind').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("amount_raw")`,
      ),
      relatedIncomeId: uuid('related_income_id'),
      description: text('description').notNull().default(''),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      orderingKey: text('ordering_key').notNull(),
    },
    (table) => [
      primaryKey({ name: 'account_cash_events_pkey', columns: [table.workspaceId, table.id] }),
      check('account_cash_events_id_check', uuid4('id')),
      check('account_cash_events_source_revision_check', sql`${table.sourceRevision} > 0`),
      check(
        'account_cash_events_kind_check',
        sql`${table.kind} IN ('dividend','interest','tax','financing','interest-expense','other-expense')`,
      ),
      check(
        'account_cash_events_amount_check',
        sql`${table.amount} <> 0 AND (${table.kind} NOT IN ('dividend','interest') OR ${table.amount} > 0)`,
      ),
      check(
        'account_cash_events_related_income_check',
        sql`${table.relatedIncomeId} IS NULL OR ${table.kind} = 'tax'`,
      ),
      check(
        'account_cash_events_description_check',
        sql`app.journal_text_length(${table.description}) <= 4000`,
      ),
      check(
        'account_cash_events_ordering_key_check',
        sql`${table.orderingKey} ~ '^(0|[1-9][0-9]*)$' AND char_length(${table.orderingKey}) <= 80`,
      ),
      foreignKey({
        name: 'account_cash_events_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'account_cash_events_bucket_fkey',
        columns: [table.workspaceId, table.cashBucketId, table.accountId, table.currencyId],
        foreignColumns: [
          cashBuckets.workspaceId,
          cashBuckets.id,
          cashBuckets.accountId,
          cashBuckets.currencyId,
        ],
      }),
      foreignKey({
        name: 'account_cash_events_related_income_fkey',
        columns: [table.workspaceId, table.relatedIncomeId],
        foreignColumns: [table.workspaceId, table.id],
      }),
      index('account_cash_events_account_time_idx').on(
        table.workspaceId,
        table.accountId,
        table.economicAt,
        table.id,
      ),
    ],
  )
  .enableRLS();

export const cashTransfers = app
  .table(
    'cash_transfers',
    {
      ...common(),
      sourceAccountId: uuid('source_account_id').notNull(),
      destinationAccountId: uuid('destination_account_id').notNull(),
      sourceBucketId: uuid('source_bucket_id').notNull(),
      destinationBucketId: uuid('destination_bucket_id').notNull(),
      currencyId: uuid('currency_id').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal("amount_raw")`,
      ),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      orderingKey: text('ordering_key').notNull(),
      description: text('description').notNull(),
    },
    (table) => [
      primaryKey({ name: 'cash_transfers_pkey', columns: [table.workspaceId, table.id] }),
      check('cash_transfers_id_check', uuid4('id')),
      check('cash_transfers_source_revision_check', sql`${table.sourceRevision} > 0`),
      check('cash_transfers_amount_check', sql`${table.amount} > 0`),
      check(
        'cash_transfers_accounts_check',
        sql`${table.sourceAccountId} <> ${table.destinationAccountId}`,
      ),
      check(
        'cash_transfers_description_check',
        sql`app.journal_text_length(app.journal_trim(${table.description})) BETWEEN 1 AND 4000`,
      ),
      check(
        'cash_transfers_ordering_key_check',
        sql`${table.orderingKey} ~ '^(0|[1-9][0-9]*)$' AND char_length(${table.orderingKey}) <= 80`,
      ),
      foreignKey({
        name: 'cash_transfers_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'cash_transfers_source_bucket_fkey',
        columns: [table.workspaceId, table.sourceBucketId, table.sourceAccountId, table.currencyId],
        foreignColumns: [
          cashBuckets.workspaceId,
          cashBuckets.id,
          cashBuckets.accountId,
          cashBuckets.currencyId,
        ],
      }),
      foreignKey({
        name: 'cash_transfers_destination_bucket_fkey',
        columns: [
          table.workspaceId,
          table.destinationBucketId,
          table.destinationAccountId,
          table.currencyId,
        ],
        foreignColumns: [
          cashBuckets.workspaceId,
          cashBuckets.id,
          cashBuckets.accountId,
          cashBuckets.currencyId,
        ],
      }),
      foreignKey({
        name: 'cash_transfers_currency_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      unique('cash_transfers_command_key').on(table.workspaceId, table.commandId),
      index('cash_transfers_time_idx').on(table.workspaceId, table.economicAt, table.id),
    ],
  )
  .enableRLS();

export const cashTransferReceipts = app
  .table(
    'cash_transfer_receipts',
    {
      ...common(),
      transferId: uuid('transfer_id').notNull(),
      economicAt: timestamp('economic_at', { withTimezone: true }).notNull(),
      orderingKey: text('ordering_key').notNull(),
    },
    (table) => [
      primaryKey({ name: 'cash_transfer_receipts_pkey', columns: [table.workspaceId, table.id] }),
      check('cash_transfer_receipts_id_check', uuid4('id')),
      check('cash_transfer_receipts_source_revision_check', sql`${table.sourceRevision} > 0`),
      check(
        'cash_transfer_receipts_ordering_key_check',
        sql`${table.orderingKey} ~ '^(0|[1-9][0-9]*)$' AND char_length(${table.orderingKey}) <= 80`,
      ),
      foreignKey({
        name: 'cash_transfer_receipts_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        name: 'cash_transfer_receipts_transfer_fkey',
        columns: [table.workspaceId, table.transferId],
        foreignColumns: [cashTransfers.workspaceId, cashTransfers.id],
      }),
      unique('cash_transfer_receipts_transfer_key').on(table.workspaceId, table.transferId),
      unique('cash_transfer_receipts_command_key').on(table.workspaceId, table.commandId),
      index('cash_transfer_receipts_time_idx').on(table.workspaceId, table.economicAt, table.id),
    ],
  )
  .enableRLS();
export const accountingSchema = {
  portfolios,
  portfolioVersions,
  portfolioVersionAccounts,
  accountCashEvents,
  cashTransfers,
  cashTransferReceipts,
};
