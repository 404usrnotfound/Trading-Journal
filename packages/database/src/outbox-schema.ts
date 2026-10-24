import { sql } from 'drizzle-orm';
import { integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
const app = pgSchema('app');

/** Mutable, derived worker state; canonical financial events remain immutable. */
export const outboxDispatchState = app
  .table('outbox_dispatch_state', {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    processedRevision: integer('processed_revision').notNull().default(0),
    targetRevision: integer('target_revision').notNull().default(0),
    eventId: uuid('event_id'),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    status: text('status').notNull().default('idle'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    lastErrorCode: text('last_error_code'),
    candidate: jsonb('candidate'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  })
  .enableRLS();
export const nativeFinancialSnapshots = app
  .table('native_financial_snapshots', {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sourceRevision: integer('source_revision').notNull(),
    eventId: uuid('event_id').notNull(),
    authorizedOwnerId: text('authorized_owner_id').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    payload: jsonb('payload').notNull(),
  })
  .enableRLS();
export const outboxTables = { outboxDispatchState, nativeFinancialSnapshots };
