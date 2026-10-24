import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
import {
  accounts,
  currencies,
  financialCommands,
  instrumentVersions,
  trades,
} from './financial-schema.js';
const app = pgSchema('app');
export const suppliedComponents = app
  .table(
    'supplied_components',
    {
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
      basisRevision: integer('basis_revision').notNull(),
      kind: text('kind').notNull(),
      accountId: uuid('account_id'),
      instrumentVersionId: uuid('instrument_version_id'),
      tradeId: uuid('trade_id'),
      currencyId: uuid('currency_id').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal(amount_raw)`,
      ),
      quantityRaw: text('quantity_raw'),
      quantity: numeric('quantity', { precision: 78, scale: 36 }).generatedAlwaysAs(
        sql`app.financial_decimal(quantity_raw)`,
      ),
      observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
      definitionVersion: text('definition_version').notNull(),
      source: text('source').notNull(),
      payload: jsonb('payload').notNull(),
      supersedesId: uuid('supersedes_id'),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      unique().on(table.workspaceId, table.commandId),
      unique().on(table.workspaceId, table.supersedesId),
      foreignKey({
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        columns: [table.workspaceId, table.instrumentVersionId],
        foreignColumns: [instrumentVersions.workspaceId, instrumentVersions.id],
      }),
      foreignKey({
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [trades.workspaceId, trades.id],
      }),
      foreignKey({
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
    ],
  )
  .enableRLS();
export const suppliedSchema = { suppliedComponents };
