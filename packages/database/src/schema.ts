import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const authSchema = pgSchema('auth');
export const appSchema = pgSchema('app');

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// Better Auth owns password hashing and session behavior. These property names
// are its documented Drizzle model contract; SQL names remain explicit.
export const user = authSchema.table('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = authSchema.table(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

export const account = authSchema.table(
  'account',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('account_user_idx').on(table.userId),
    uniqueIndex('account_provider_identity_idx').on(table.providerId, table.accountId),
  ],
);

export const verification = authSchema.table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const rateLimit = authSchema.table(
  'rate_limit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [
    check('rate_limit_count_nonnegative', sql`${table.count} >= 0`),
    check(
      'rate_limit_milliseconds_safe',
      sql`${table.lastRequest} >= 0 AND ${table.lastRequest} <= 9007199254740991`,
    ),
  ],
);

// Global authentication lifecycle audit: deliberately excludes credentials,
// cookie values, request payloads, and mutable user-profile data.
export const authSecurityEvents = authSchema.table(
  'security_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: text('actor_id'),
    subjectUserId: text('subject_user_id').notNull(),
    action: text('action').notNull(),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'security_event_id_uuid_v4',
      sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check('security_event_action_length', sql`char_length(${table.action}) BETWEEN 1 AND 120`),
    check(
      'security_event_subject_length',
      sql`char_length(${table.subjectUserId}) BETWEEN 1 AND 128`,
    ),
    index('security_event_subject_time_idx').on(table.subjectUserId, table.createdAt, table.id),
  ],
);

export const membershipRole = appSchema.enum('membership_role', ['owner', 'editor', 'viewer']);

export const workspaces = appSchema
  .table(
    'workspaces',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      name: text('name').notNull(),
      createdBy: text('created_by')
        .notNull()
        .references(() => user.id),
      isDemo: boolean('is_demo').notNull().default(false),
      timezone: text('timezone').notNull().default('UTC'),
      reportingCurrency: text('reporting_currency'),
      revision: integer('revision').notNull().default(1),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (table) => [
      check(
        'workspace_id_uuid_v4',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      check('workspace_name_length', sql`char_length(btrim(${table.name})) BETWEEN 1 AND 120`),
      check('workspace_positive_revision', sql`${table.revision} >= 1`),
      uniqueIndex('one_personal_workspace_per_creator')
        .on(table.createdBy)
        .where(sql`NOT ${table.isDemo}`),
    ],
  )
  .enableRLS();

export const workspaceMemberships = appSchema
  .table(
    'workspace_memberships',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id, { onDelete: 'cascade' }),
      userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
      role: membershipRole('role').notNull(),
      createdAt: createdAt(),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.userId] }),
      index('membership_user_idx').on(table.userId, table.workspaceId),
    ],
  )
  .enableRLS();

export const userPreferences = appSchema
  .table(
    'user_preferences',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id, { onDelete: 'cascade' }),
      id: uuid('id').notNull().defaultRandom(),
      userId: text('user_id').notNull(),
      theme: text('theme').notNull().default('system'),
      timezone: text('timezone'),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      check(
        'preference_id_uuid_v4',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      uniqueIndex('preference_member_idx').on(table.workspaceId, table.userId),
      foreignKey({
        name: 'preference_membership_fk',
        columns: [table.workspaceId, table.userId],
        foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
      }).onDelete('cascade'),
      check('preference_theme_values', sql`${table.theme} IN ('system', 'light', 'dark')`),
    ],
  )
  .enableRLS();

export const auditEvents = appSchema
  .table(
    'audit_events',
    {
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id, { onDelete: 'cascade' }),
      id: uuid('id').notNull().defaultRandom(),
      actorId: text('actor_id').notNull(),
      action: text('action').notNull(),
      requestId: text('request_id'),
      createdAt: createdAt(),
    },
    (table) => [
      primaryKey({ columns: [table.workspaceId, table.id] }),
      check(
        'audit_id_uuid_v4',
        sql`${table.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
      ),
      index('audit_workspace_time_idx').on(table.workspaceId, table.createdAt, table.id),
      check('audit_action_length', sql`char_length(${table.action}) BETWEEN 1 AND 120`),
    ],
  )
  .enableRLS();

export const schemaMetadata = appSchema.table(
  'schema_metadata',
  {
    singleton: boolean('singleton').primaryKey().default(true),
    version: integer('version').notNull(),
  },
  (table) => [
    check('schema_metadata_singleton', sql`${table.singleton}`),
    check('schema_metadata_positive_version', sql`${table.version} > 0`),
  ],
);

export const authModels = { user, session, account, verification, rateLimit };
export const databaseSchema = {
  ...authModels,
  authSecurityEvents,
  workspaces,
  workspaceMemberships,
  userPreferences,
  auditEvents,
  schemaMetadata,
};
