import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
import { accounts, financialCommands } from './financial-schema.js';
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
  accountId: uuid('account_id').notNull(),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(),
});
export const sourceStatements = app
  .table(
    'source_statements',
    {
      ...common(),
      document: jsonb('document').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.id] }),
      foreignKey({
        columns: [t.workspaceId, t.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        columns: [t.workspaceId, t.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      index('source_statements_account_time_idx').on(t.workspaceId, t.accountId, t.asOf, t.id),
    ],
  )
  .enableRLS();
export const statementReconciliations = app
  .table(
    'statement_reconciliations',
    {
      ...common(),
      statementId: uuid('statement_id').notNull(),
      comparedRevision: integer('compared_revision').notNull(),
      status: text('status').notNull(),
      accepted: boolean('accepted').notNull(),
      result: jsonb('result').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.id] }),
      foreignKey({
        columns: [t.workspaceId, t.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        columns: [t.workspaceId, t.commandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
      foreignKey({
        columns: [t.workspaceId, t.statementId],
        foreignColumns: [sourceStatements.workspaceId, sourceStatements.id],
      }),
      index('statement_reconciliations_history_idx').on(
        t.workspaceId,
        t.statementId,
        t.createdAt,
        t.id,
      ),
    ],
  )
  .enableRLS();
export const reconciliationSchema = { sourceStatements, statementReconciliations };
