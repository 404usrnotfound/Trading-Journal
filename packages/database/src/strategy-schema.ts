// Strategy identity is mutable only through revisioned publication/archive.
// Rules, attachment references and trade assignments are immutable snapshots.
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { auditEvents, workspaces } from './platform-schema.js';
import { trades } from './financial-schema.js';

const app = pgSchema('app');
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const actorId = () =>
  text('actor_id')
    .notNull()
    .default(sql`app.current_actor_id()`);
const uuid4 = (column: string) =>
  sql.raw(
    `${column}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
  );

export const strategies = app
  .table(
    'strategies',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: actorId(),
      createdAt: createdAt(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      currentVersionId: uuid('current_version_id').notNull(),
      revision: integer('revision').notNull().default(1),
      archivedAt: timestamp('archived_at', { withTimezone: true }),
      archiveReason: text('archive_reason'),
    },
    (table): PgTableExtraConfigValue[] => [
      primaryKey({ name: 'strategies_pkey', columns: [table.workspaceId, table.id] }),
      check('strategies_id_check', uuid4('id')),
      check('strategies_current_version_id_check', uuid4('current_version_id')),
      check('strategies_revision_check', sql`${table.revision} > 0`),
      check('strategies_updated_at_check', sql`${table.updatedAt} >= ${table.createdAt}`),
      check(
        'strategies_archive_check',
        sql`(${table.archivedAt} IS NULL AND ${table.archiveReason} IS NULL) OR (${table.archivedAt} IS NOT NULL AND ${table.archiveReason} IS NOT NULL AND char_length(btrim(${table.archiveReason})) BETWEEN 1 AND 2000)`,
      ),
      index('strategies_workspace_archive_id_idx').on(
        table.workspaceId,
        table.archivedAt,
        table.id,
      ),
      foreignKey({
        name: 'strategies_current_version_fkey',
        columns: [table.workspaceId, table.id, table.currentVersionId],
        foreignColumns: [
          strategyVersions.workspaceId,
          strategyVersions.strategyId,
          strategyVersions.id,
        ],
      }),
    ],
  )
  .enableRLS();

export const strategyVersions = app
  .table(
    'strategy_versions',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: actorId(),
      createdAt: createdAt(),
      strategyId: uuid('strategy_id').notNull(),
      version: integer('version').notNull(),
      effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
      definition: jsonb('definition').notNull(),
      definitionHash: text('definition_hash').notNull(),
      changeReason: text('change_reason').notNull(),
    },
    (table) => [
      primaryKey({ name: 'strategy_versions_pkey', columns: [table.workspaceId, table.id] }),
      check('strategy_versions_id_check', uuid4('id')),
      check('strategy_versions_version_check', sql`${table.version} > 0`),
      check('strategy_versions_hash_check', sql`${table.definitionHash} ~ '^[0-9a-f]{64}$'`),
      check(
        'strategy_versions_reason_check',
        sql`char_length(btrim(${table.changeReason})) BETWEEN 1 AND 2000`,
      ),
      check(
        'strategy_versions_definition_check',
        sql`app.valid_strategy_definition(${table.definition})`,
      ),
      check(
        'strategy_versions_definition_size_check',
        sql`app.strategy_json_bytes(${table.definition}) <= 196608`,
      ),
      foreignKey({
        name: 'strategy_versions_strategy_fkey',
        columns: [table.workspaceId, table.strategyId],
        foreignColumns: [strategies.workspaceId, strategies.id],
      }),
      unique('strategy_versions_strategy_version_key').on(
        table.workspaceId,
        table.strategyId,
        table.version,
      ),
      unique('strategy_versions_strategy_identity_key').on(
        table.workspaceId,
        table.strategyId,
        table.id,
      ),
    ],
  )
  .enableRLS();

export const strategyCommands = app
  .table(
    'strategy_commands',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: actorId(),
      createdAt: createdAt(),
      idempotencyKey: uuid('idempotency_key').notNull(),
      requestHash: text('request_hash').notNull(),
      kind: text('kind').notNull(),
      result: jsonb('result').notNull(),
      auditEventId: uuid('audit_event_id').notNull(),
    },
    (table) => [
      primaryKey({ name: 'strategy_commands_pkey', columns: [table.workspaceId, table.id] }),
      check('strategy_commands_id_check', uuid4('id')),
      check('strategy_commands_key_check', uuid4('idempotency_key')),
      check('strategy_commands_hash_check', sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
      check('strategy_commands_kind_check', sql`char_length(${table.kind}) BETWEEN 1 AND 120`),
      check('strategy_commands_result_check', sql`jsonb_typeof(${table.result}) = 'object'`),
      foreignKey({
        name: 'strategy_commands_audit_fkey',
        columns: [table.workspaceId, table.auditEventId],
        foreignColumns: [auditEvents.workspaceId, auditEvents.id],
      }),
      unique('strategy_commands_idempotency_key').on(table.workspaceId, table.idempotencyKey),
      unique('strategy_commands_audit_key').on(table.workspaceId, table.auditEventId),
    ],
  )
  .enableRLS();

export const tradeStrategyLinks = app
  .table(
    'trade_strategy_links',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      tradeId: uuid('trade_id').notNull(),
      strategyId: uuid('strategy_id').notNull(),
      strategyVersionId: uuid('strategy_version_id').notNull(),
      timing: text('timing').notNull(),
      reason: text('reason').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
    },
    (table) => [
      primaryKey({
        name: 'trade_strategy_links_pkey',
        columns: [table.workspaceId, table.tradeId],
      }),
      check(
        'trade_strategy_links_timing_check',
        sql`${table.timing} IN ('recorded-with-trade','retrospective')`,
      ),
      check(
        'trade_strategy_links_reason_check',
        sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 2000`,
      ),
      foreignKey({
        name: 'trade_strategy_links_trade_fkey',
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [trades.workspaceId, trades.id],
      }),
      foreignKey({
        name: 'trade_strategy_links_version_fkey',
        columns: [table.workspaceId, table.strategyId, table.strategyVersionId],
        foreignColumns: [
          strategyVersions.workspaceId,
          strategyVersions.strategyId,
          strategyVersions.id,
        ],
      }),
      index('trade_strategy_links_version_idx').on(
        table.workspaceId,
        table.strategyId,
        table.strategyVersionId,
      ),
    ],
  )
  .enableRLS();

export const strategyAttachments = app
  .table(
    'strategy_attachments',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      id: uuid('id').notNull().defaultRandom(),
      actorId: actorId(),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      payloadSha256: text('payload_sha256').notNull(),
      name: text('name').notNull(),
      mediaType: text('media_type').notNull(),
      size: integer('size').notNull(),
      sha256: text('sha256').notNull(),
      storageKey: text('storage_key').notNull(),
      state: text('state').notNull().default('pending'),
      readyAt: timestamp('ready_at', { withTimezone: true }),
      removedAt: timestamp('removed_at', { withTimezone: true }),
    },
    (table) => [
      primaryKey({ name: 'strategy_attachments_pkey', columns: [table.workspaceId, table.id] }),
      check('strategy_attachments_id_check', uuid4('id')),
      check('strategy_attachments_command_id_check', uuid4('command_id')),
      check(
        'strategy_attachments_payload_hash_check',
        sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`,
      ),
      check('strategy_attachments_hash_check', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
      check(
        'strategy_attachments_name_check',
        sql`char_length(btrim(${table.name})) BETWEEN 1 AND 255`,
      ),
      check(
        'strategy_attachments_media_check',
        sql`${table.mediaType} IN ('image/png','image/jpeg','image/webp','application/pdf')`,
      ),
      check('strategy_attachments_size_check', sql`${table.size} BETWEEN 1 AND 10485760`),
      check('strategy_attachments_storage_key_check', sql`${table.storageKey} = ${table.id}::text`),
      check(
        'strategy_attachments_state_check',
        sql`${table.state} IN ('pending','ready','removed')`,
      ),
      check(
        'strategy_attachments_timestamps_check',
        sql`(${table.state} = 'pending' AND ${table.readyAt} IS NULL AND ${table.removedAt} IS NULL) OR (${table.state} = 'ready' AND ${table.readyAt} IS NOT NULL AND ${table.removedAt} IS NULL) OR (${table.state} = 'removed' AND ${table.removedAt} IS NOT NULL)`,
      ),
      unique('strategy_attachments_command_key').on(table.workspaceId, table.commandId),
    ],
  )
  .enableRLS();

export const strategyVersionAttachments = app
  .table(
    'strategy_version_attachments',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      strategyVersionId: uuid('strategy_version_id').notNull(),
      attachmentId: uuid('attachment_id').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
    },
    (table) => [
      primaryKey({
        name: 'strategy_version_attachments_pkey',
        columns: [table.workspaceId, table.strategyVersionId, table.attachmentId],
      }),
      foreignKey({
        name: 'strategy_version_attachments_version_fkey',
        columns: [table.workspaceId, table.strategyVersionId],
        foreignColumns: [strategyVersions.workspaceId, strategyVersions.id],
      }),
      foreignKey({
        name: 'strategy_version_attachments_attachment_fkey',
        columns: [table.workspaceId, table.attachmentId],
        foreignColumns: [strategyAttachments.workspaceId, strategyAttachments.id],
      }),
      index('strategy_version_attachments_attachment_idx').on(
        table.workspaceId,
        table.attachmentId,
      ),
    ],
  )
  .enableRLS();

export const strategySchema = {
  strategies,
  strategyVersions,
  strategyCommands,
  tradeStrategyLinks,
  strategyAttachments,
  strategyVersionAttachments,
};
