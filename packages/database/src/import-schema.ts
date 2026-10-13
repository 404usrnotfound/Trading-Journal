import { sql } from 'drizzle-orm';
import {
  pgSchema,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
import { accounts, financialCommands } from './financial-schema.js';
const app = pgSchema('app');
const base = () => ({
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  actorId: text('actor_id')
    .notNull()
    .default(sql`app.current_actor_id()`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`),
});
export const importTemplateVersions = app
  .table(
    'import_template_versions',
    {
      ...base(),
      templateId: uuid('template_id').notNull(),
      version: integer('version').notNull(),
      name: text('name').notNull(),
      requestHash: text('request_hash').notNull(),
      mapping: jsonb('mapping').notNull(),
      archived: boolean('archived').notNull().default(false),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      foreignKey({ columns: [table.workspaceId], foreignColumns: [workspaces.id] }),
      unique().on(table.workspaceId, table.templateId, table.version),
    ],
  )
  .enableRLS();
export const importBatches = app
  .table(
    'import_batches',
    {
      ...base(),
      accountId: uuid('account_id').notNull(),
      namespace: text('namespace').notNull(),
      filename: text('filename').notNull(),
      sourceText: text('source_text').notNull(),
      fileHash: text('file_hash').notNull(),
      mapping: jsonb('mapping').notNull(),
      templateVersionId: uuid('template_version_id'),
      adapterId: text('adapter_id').notNull(),
      adapterVersion: text('adapter_version').notNull(),
      revision: integer('revision').notNull().default(1),
      state: text('state').notNull().default('staged'),
      rowCount: integer('row_count').notNull(),
      preview: jsonb('preview'),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      foreignKey({ columns: [table.workspaceId], foreignColumns: [workspaces.id] }),
      foreignKey({
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        columns: [table.workspaceId, table.templateVersionId],
        foreignColumns: [importTemplateVersions.workspaceId, importTemplateVersions.id],
      }),
    ],
  )
  .enableRLS();
export const importRows = app
  .table(
    'import_rows',
    {
      ...base(),
      batchId: uuid('batch_id').notNull(),
      rowNumber: integer('row_number').notNull(),
      sourceKey: text('source_key').notNull(),
      groupKey: text('group_key').notNull(),
      sourceId: text('source_id'),
      recordKind: text('record_kind'),
      identityKey: text('identity_key'),
      payloadHash: text('payload_hash'),
      payload: jsonb('payload'),
      rawFields: jsonb('raw_fields').notNull(),
      errors: jsonb('errors').notNull().default([]),
      warnings: jsonb('warnings').notNull().default([]),
      status: text('status').notNull(),
      result: jsonb('result'),
      recordedCommandId: uuid('recorded_command_id'),
      commandId: uuid('command_id').notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      foreignKey({
        columns: [table.workspaceId, table.batchId],
        foreignColumns: [importBatches.workspaceId, importBatches.id],
      }),
      unique().on(table.workspaceId, table.batchId, table.rowNumber),
      unique().on(table.workspaceId, table.commandId),
      foreignKey({
        columns: [table.workspaceId, table.recordedCommandId],
        foreignColumns: [financialCommands.workspaceId, financialCommands.id],
      }),
    ],
  )
  .enableRLS();
export const importOperations = app
  .table(
    'import_operations',
    {
      ...base(),
      batchId: uuid('batch_id').notNull(),
      action: text('action').notNull(),
      idempotencyKey: uuid('idempotency_key'),
      requestHash: text('request_hash'),
      details: jsonb('details').notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      foreignKey({
        columns: [table.workspaceId, table.batchId],
        foreignColumns: [importBatches.workspaceId, importBatches.id],
      }),
      unique().on(table.workspaceId, table.idempotencyKey),
    ],
  )
  .enableRLS();
export const importSources = app
  .table(
    'import_sources',
    {
      workspaceId: uuid('workspace_id').notNull(),
      accountId: uuid('account_id').notNull(),
      namespace: text('namespace').notNull(),
      recordKind: text('record_kind').notNull(),
      identityKey: text('identity_key').notNull(),
      payloadHash: text('payload_hash').notNull(),
      currentRowId: uuid('current_row_id').notNull(),
      result: jsonb('result').notNull(),
      state: text('state').notNull().default('active'),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql`clock_timestamp()`),
    },
    (table) => [
      primaryKey({
        columns: [
          table.workspaceId,
          table.accountId,
          table.namespace,
          table.recordKind,
          table.identityKey,
        ],
      }),
      foreignKey({
        columns: [table.workspaceId, table.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        columns: [table.workspaceId, table.currentRowId],
        foreignColumns: [importRows.workspaceId, importRows.id],
      }),
    ],
  )
  .enableRLS();
export const importSourceHistory = app
  .table(
    'import_source_history',
    {
      ...base(),
      operationId: uuid('operation_id').notNull(),
      rowId: uuid('row_id').notNull(),
      action: text('action').notNull(),
      payloadHash: text('payload_hash').notNull(),
      result: jsonb('result').notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      foreignKey({
        columns: [table.workspaceId, table.operationId],
        foreignColumns: [importOperations.workspaceId, importOperations.id],
      }),
      foreignKey({
        columns: [table.workspaceId, table.rowId],
        foreignColumns: [importRows.workspaceId, importRows.id],
      }),
    ],
  )
  .enableRLS();
export const importSchema = {
  importTemplateVersions,
  importBatches,
  importRows,
  importOperations,
  importSources,
  importSourceHistory,
};
