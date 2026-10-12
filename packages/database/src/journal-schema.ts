// Journaling is interpretation beside the ledger. Revisions, published plans,
// original commitments and risk supplements are append-only tenant-scoped facts.
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { auditEvents, workspaces } from './platform-schema.js';
import { currencies, trades } from './financial-schema.js';
import { strategyAttachments } from './strategy-schema.js';

const app = pgSchema('app');
const createdAt = () =>
  timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`);
const actorId = () =>
  text('actor_id')
    .notNull()
    .default(sql`app.current_actor_id()`);
const workspaceId = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id);
const uuid4 = (column: string) =>
  sql.raw(
    `${column}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
  );

export const journalCommands = app
  .table(
    'journal_commands',
    {
      workspaceId: workspaceId(),
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
      primaryKey({ name: 'journal_commands_pkey', columns: [table.workspaceId, table.id] }),
      check('journal_commands_id_check', uuid4('id')),
      check('journal_commands_key_check', uuid4('idempotency_key')),
      check('journal_commands_hash_check', sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
      check(
        'journal_commands_kind_check',
        sql`char_length(btrim(${table.kind})) BETWEEN 1 AND 120`,
      ),
      check('journal_commands_result_check', sql`jsonb_typeof(${table.result}) = 'object'`),
      unique('journal_commands_idempotency_key').on(table.workspaceId, table.idempotencyKey),
      unique('journal_commands_audit_key').on(table.workspaceId, table.auditEventId),
      foreignKey({
        name: 'journal_commands_audit_fkey',
        columns: [table.workspaceId, table.auditEventId],
        foreignColumns: [auditEvents.workspaceId, auditEvents.id],
      }),
    ],
  )
  .enableRLS();

export const journalEntries = app
  .table(
    'journal_entries',
    {
      workspaceId: workspaceId(),
      tradeId: uuid('trade_id').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
      currentRevisionId: uuid('current_revision_id'),
      revision: integer('revision').notNull().default(0),
      updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .default(sql`clock_timestamp()`),
      updatedBy: text('updated_by')
        .notNull()
        .default(sql`app.current_actor_id()`),
    },
    (table): PgTableExtraConfigValue[] => [
      primaryKey({ name: 'journal_entries_pkey', columns: [table.workspaceId, table.tradeId] }),
      check('journal_entries_revision_check', sql`${table.revision} >= 0`),
      check(
        'journal_entries_pointer_check',
        sql`(${table.revision} = 0 AND ${table.currentRevisionId} IS NULL) OR (${table.revision} > 0 AND ${table.currentRevisionId} IS NOT NULL)`,
      ),
      check('journal_entries_updated_at_check', sql`${table.updatedAt} >= ${table.createdAt}`),
      foreignKey({
        name: 'journal_entries_trade_fkey',
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [trades.workspaceId, trades.id],
      }),
      foreignKey({
        name: 'journal_entries_current_revision_fkey',
        columns: [table.workspaceId, table.tradeId, table.currentRevisionId],
        foreignColumns: [
          journalRevisions.workspaceId,
          journalRevisions.tradeId,
          journalRevisions.id,
        ],
      }),
    ],
  )
  .enableRLS();

export const journalRevisions = app
  .table(
    'journal_revisions',
    {
      workspaceId: workspaceId(),
      id: uuid('id').notNull().defaultRandom(),
      tradeId: uuid('trade_id').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      revision: integer('revision').notNull(),
      document: jsonb('document').notNull(),
      documentHash: text('document_hash').notNull(),
      changeReason: text('change_reason').notNull(),
    },
    (table) => [
      primaryKey({ name: 'journal_revisions_pkey', columns: [table.workspaceId, table.id] }),
      check('journal_revisions_id_check', uuid4('id')),
      check('journal_revisions_revision_check', sql`${table.revision} > 0`),
      check('journal_revisions_hash_check', sql`${table.documentHash} ~ '^[0-9a-f]{64}$'`),
      check(
        'journal_revisions_reason_check',
        sql`app.journal_text_length(btrim(${table.changeReason})) BETWEEN 1 AND 2000`,
      ),
      check('journal_revisions_document_check', sql`app.valid_journal_document(${table.document})`),
      check(
        'journal_revisions_labels_check',
        sql`app.valid_journal_document_labels(${table.document})`,
      ),
      check(
        'journal_revisions_reason_nonblank_check',
        sql`app.journal_text_length(app.journal_trim(${table.changeReason})) BETWEEN 1 AND 2000`,
      ),
      check(
        'journal_revisions_document_size_check',
        sql`app.strategy_json_bytes(${table.document}) <= 131072`,
      ),
      unique('journal_revisions_trade_revision_key').on(
        table.workspaceId,
        table.tradeId,
        table.revision,
      ),
      unique('journal_revisions_trade_identity_key').on(table.workspaceId, table.tradeId, table.id),
      unique('journal_revisions_command_key').on(table.workspaceId, table.commandId),
      foreignKey({
        name: 'journal_revisions_entry_fkey',
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [journalEntries.workspaceId, journalEntries.tradeId],
      }),
      foreignKey({
        name: 'journal_revisions_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [journalCommands.workspaceId, journalCommands.id],
      }),
      index('journal_revisions_history_idx').on(table.workspaceId, table.tradeId, table.revision),
    ],
  )
  .enableRLS();

export const journalPlanVersions = app
  .table(
    'journal_plan_versions',
    {
      workspaceId: workspaceId(),
      id: uuid('id').notNull().defaultRandom(),
      tradeId: uuid('trade_id').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      version: integer('version').notNull(),
      definition: jsonb('definition').notNull(),
      definitionHash: text('definition_hash').notNull(),
      changeReason: text('change_reason').notNull(),
    },
    (table) => [
      primaryKey({ name: 'journal_plan_versions_pkey', columns: [table.workspaceId, table.id] }),
      check('journal_plan_versions_id_check', uuid4('id')),
      check('journal_plan_versions_version_check', sql`${table.version} > 0`),
      check('journal_plan_versions_hash_check', sql`${table.definitionHash} ~ '^[0-9a-f]{64}$'`),
      check(
        'journal_plan_versions_reason_check',
        sql`app.journal_text_length(btrim(${table.changeReason})) BETWEEN 1 AND 2000`,
      ),
      check(
        'journal_plan_versions_definition_check',
        sql`app.valid_journal_plan(${table.definition})`,
      ),
      check(
        'journal_plan_versions_labels_check',
        sql`app.valid_journal_plan_labels(${table.definition})`,
      ),
      check(
        'journal_plan_versions_reason_nonblank_check',
        sql`app.journal_text_length(app.journal_trim(${table.changeReason})) BETWEEN 1 AND 2000`,
      ),
      check(
        'journal_plan_versions_definition_size_check',
        sql`app.strategy_json_bytes(${table.definition}) <= 131072`,
      ),
      unique('journal_plan_versions_trade_version_key').on(
        table.workspaceId,
        table.tradeId,
        table.version,
      ),
      unique('journal_plan_versions_trade_identity_key').on(
        table.workspaceId,
        table.tradeId,
        table.id,
      ),
      unique('journal_plan_versions_command_key').on(table.workspaceId, table.commandId),
      foreignKey({
        name: 'journal_plan_versions_trade_fkey',
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [trades.workspaceId, trades.id],
      }),
      foreignKey({
        name: 'journal_plan_versions_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [journalCommands.workspaceId, journalCommands.id],
      }),
    ],
  )
  .enableRLS();

export const journalPlanCommitments = app
  .table(
    'journal_plan_commitments',
    {
      workspaceId: workspaceId(),
      tradeId: uuid('trade_id').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      originalPlanId: uuid('original_plan_id').notNull(),
      committedAt: timestamp('committed_at', { withTimezone: true })
        .notNull()
        .default(sql`clock_timestamp()`),
      financialSourceRevision: integer('financial_source_revision').notNull(),
      timing: text('timing').notNull(),
    },
    (table) => [
      primaryKey({
        name: 'journal_plan_commitments_pkey',
        columns: [table.workspaceId, table.tradeId],
      }),
      check('journal_plan_commitments_revision_check', sql`${table.financialSourceRevision} >= 0`),
      check(
        'journal_plan_commitments_timing_check',
        sql`${table.timing} IN ('pre-trade','retrospective')`,
      ),
      foreignKey({
        name: 'journal_plan_commitments_plan_fkey',
        columns: [table.workspaceId, table.tradeId, table.originalPlanId],
        foreignColumns: [
          journalPlanVersions.workspaceId,
          journalPlanVersions.tradeId,
          journalPlanVersions.id,
        ],
      }),
      foreignKey({
        name: 'journal_plan_commitments_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [journalCommands.workspaceId, journalCommands.id],
      }),
    ],
  )
  .enableRLS();

export const journalRiskAdditions = app
  .table(
    'journal_risk_additions',
    {
      workspaceId: workspaceId(),
      id: uuid('id').notNull().defaultRandom(),
      tradeId: uuid('trade_id').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
      commandId: uuid('command_id').notNull(),
      amountRaw: text('amount_raw').notNull(),
      amount: numeric('amount').generatedAlwaysAs(sql`app.strategy_decimal(amount_raw)`),
      currencyId: uuid('currency_id').notNull(),
      method: text('method').notNull(),
      methodNotes: text('method_notes').notNull(),
      reason: text('reason').notNull(),
    },
    (table) => [
      primaryKey({ name: 'journal_risk_additions_pkey', columns: [table.workspaceId, table.id] }),
      check('journal_risk_additions_id_check', uuid4('id')),
      check('journal_risk_additions_amount_check', sql`${table.amount} > 0`),
      check(
        'journal_risk_additions_method_check',
        sql`app.journal_text_length(btrim(${table.method})) BETWEEN 1 AND 160`,
      ),
      check(
        'journal_risk_additions_method_nonblank_check',
        sql`app.journal_text_length(app.journal_trim(${table.method})) BETWEEN 1 AND 160`,
      ),
      check(
        'journal_risk_additions_notes_check',
        sql`app.journal_text_length(${table.methodNotes}) <= 20000`,
      ),
      check(
        'journal_risk_additions_reason_check',
        sql`app.journal_text_length(btrim(${table.reason})) BETWEEN 1 AND 2000`,
      ),
      check(
        'journal_risk_additions_reason_nonblank_check',
        sql`app.journal_text_length(app.journal_trim(${table.reason})) BETWEEN 1 AND 2000`,
      ),
      unique('journal_risk_additions_command_key').on(table.workspaceId, table.commandId),
      foreignKey({
        name: 'journal_risk_additions_commitment_fkey',
        columns: [table.workspaceId, table.tradeId],
        foreignColumns: [journalPlanCommitments.workspaceId, journalPlanCommitments.tradeId],
      }),
      foreignKey({
        name: 'journal_risk_additions_currency_fkey',
        columns: [table.workspaceId, table.currencyId],
        foreignColumns: [currencies.workspaceId, currencies.id],
      }),
      foreignKey({
        name: 'journal_risk_additions_command_fkey',
        columns: [table.workspaceId, table.commandId],
        foreignColumns: [journalCommands.workspaceId, journalCommands.id],
      }),
      index('journal_risk_additions_trade_idx').on(table.workspaceId, table.tradeId, table.id),
    ],
  )
  .enableRLS();

export const journalRevisionAttachments = app
  .table(
    'journal_revision_attachments',
    {
      workspaceId: workspaceId(),
      revisionId: uuid('revision_id').notNull(),
      attachmentId: uuid('attachment_id').notNull(),
      phase: text('phase').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
    },
    (table) => [
      primaryKey({
        name: 'journal_revision_attachments_pkey',
        columns: [table.workspaceId, table.revisionId, table.attachmentId, table.phase],
      }),
      check(
        'journal_revision_attachments_phase_check',
        sql`${table.phase} IN ('planning','before','during','after')`,
      ),
      foreignKey({
        name: 'journal_revision_attachments_revision_fkey',
        columns: [table.workspaceId, table.revisionId],
        foreignColumns: [journalRevisions.workspaceId, journalRevisions.id],
      }),
      foreignKey({
        name: 'journal_revision_attachments_attachment_fkey',
        columns: [table.workspaceId, table.attachmentId],
        foreignColumns: [strategyAttachments.workspaceId, strategyAttachments.id],
      }),
      index('journal_revision_attachments_file_idx').on(table.workspaceId, table.attachmentId),
    ],
  )
  .enableRLS();

export const journalPlanAttachments = app
  .table(
    'journal_plan_attachments',
    {
      workspaceId: workspaceId(),
      planVersionId: uuid('plan_version_id').notNull(),
      attachmentId: uuid('attachment_id').notNull(),
      actorId: actorId(),
      createdAt: createdAt(),
    },
    (table) => [
      primaryKey({
        name: 'journal_plan_attachments_pkey',
        columns: [table.workspaceId, table.planVersionId, table.attachmentId],
      }),
      foreignKey({
        name: 'journal_plan_attachments_plan_fkey',
        columns: [table.workspaceId, table.planVersionId],
        foreignColumns: [journalPlanVersions.workspaceId, journalPlanVersions.id],
      }),
      foreignKey({
        name: 'journal_plan_attachments_attachment_fkey',
        columns: [table.workspaceId, table.attachmentId],
        foreignColumns: [strategyAttachments.workspaceId, strategyAttachments.id],
      }),
      index('journal_plan_attachments_file_idx').on(table.workspaceId, table.attachmentId),
    ],
  )
  .enableRLS();

export const journalSchema = {
  journalCommands,
  journalEntries,
  journalRevisions,
  journalPlanVersions,
  journalPlanCommitments,
  journalRiskAdditions,
  journalRevisionAttachments,
  journalPlanAttachments,
};
