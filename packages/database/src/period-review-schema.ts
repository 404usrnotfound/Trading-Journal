import { sql } from 'drizzle-orm';
import {
  foreignKey,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
import { trades } from './financial-schema.js';
import { strategyVersions } from './strategy-schema.js';
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
});
export const periodReviewTemplates = app
  .table('period_review_templates', common(), (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
  ])
  .enableRLS();
export const periodReviewTemplateVersions = app
  .table(
    'period_review_template_versions',
    {
      ...common(),
      templateId: uuid('template_id').notNull(),
      version: integer('version').notNull(),
      definition: jsonb('definition').notNull(),
      reason: text('reason').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.id] }),
      unique('period_review_template_versions_number').on(t.workspaceId, t.templateId, t.version),
      foreignKey({
        columns: [t.workspaceId, t.templateId],
        foreignColumns: [periodReviewTemplates.workspaceId, periodReviewTemplates.id],
      }),
    ],
  )
  .enableRLS();
export const periodReviewEntries = app
  .table('period_review_entries', common(), (t) => [primaryKey({ columns: [t.workspaceId, t.id] })])
  .enableRLS();
export const periodReviewVersions = app
  .table(
    'period_review_versions',
    {
      ...common(),
      entryId: uuid('entry_id').notNull(),
      version: integer('version').notNull(),
      templateVersionId: uuid('template_version_id'),
      definition: jsonb('definition').notNull(),
      reason: text('reason').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.id] }),
      unique('period_review_versions_number').on(t.workspaceId, t.entryId, t.version),
      foreignKey({
        columns: [t.workspaceId, t.entryId],
        foreignColumns: [periodReviewEntries.workspaceId, periodReviewEntries.id],
      }),
      foreignKey({
        columns: [t.workspaceId, t.templateVersionId],
        foreignColumns: [periodReviewTemplateVersions.workspaceId, periodReviewTemplateVersions.id],
      }),
    ],
  )
  .enableRLS();
export const periodReviewCommands = app
  .table(
    'period_review_commands',
    { ...common(), requestHash: text('request_hash').notNull(), result: jsonb('result').notNull() },
    (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
  )
  .enableRLS();
const linkCommon = () => ({
  workspaceId: uuid('workspace_id').notNull(),
  reviewVersionId: uuid('review_version_id').notNull(),
  actorId: text('actor_id')
    .notNull()
    .default(sql`app.current_actor_id()`),
});
export const periodReviewTrades = app
  .table('period_review_trades', { ...linkCommon(), tradeId: uuid('trade_id').notNull() }, (t) => [
    primaryKey({ columns: [t.workspaceId, t.reviewVersionId, t.tradeId] }),
    foreignKey({
      columns: [t.workspaceId, t.reviewVersionId],
      foreignColumns: [periodReviewVersions.workspaceId, periodReviewVersions.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.tradeId],
      foreignColumns: [trades.workspaceId, trades.id],
    }),
  ])
  .enableRLS();
export const periodReviewStrategies = app
  .table(
    'period_review_strategies',
    { ...linkCommon(), strategyVersionId: uuid('strategy_version_id').notNull() },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.reviewVersionId, t.strategyVersionId] }),
      foreignKey({
        columns: [t.workspaceId, t.reviewVersionId],
        foreignColumns: [periodReviewVersions.workspaceId, periodReviewVersions.id],
      }),
      foreignKey({
        columns: [t.workspaceId, t.strategyVersionId],
        foreignColumns: [strategyVersions.workspaceId, strategyVersions.id],
      }),
    ],
  )
  .enableRLS();
export const periodReviewSchema = {
  periodReviewTemplates,
  periodReviewTemplateVersions,
  periodReviewEntries,
  periodReviewVersions,
  periodReviewCommands,
  periodReviewTrades,
  periodReviewStrategies,
};
