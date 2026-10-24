import { sql } from 'drizzle-orm';
import { jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
const app = pgSchema('app');
export const portableRestoreHistory = app.table(
  'portable_restore_history',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    id: uuid('id').notNull().defaultRandom(),
    sourceWorkspaceId: uuid('source_workspace_id').notNull(),
    archiveSha256: text('archive_sha256').notNull(),
    sourceManifest: jsonb('source_manifest').notNull(),
    actorId: text('actor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);
export const portableRestoreRequests = app.table(
  'portable_restore_requests',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    commandId: uuid('command_id').notNull(),
    actorId: text('actor_id').notNull(),
    archiveSha256: text('archive_sha256').notNull(),
    targetWorkspaceId: uuid('target_workspace_id')
      .notNull()
      .references(() => workspaces.id),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.commandId] })],
);
export const portabilitySchema = { portableRestoreHistory, portableRestoreRequests };
