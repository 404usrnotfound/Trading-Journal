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
} from 'drizzle-orm/pg-core';
import { workspaces } from './platform-schema.js';
import { accounts } from './financial-schema.js';
import { strategies } from './strategy-schema.js';
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
export const riskPolicies = app
  .table(
    'risk_policies',
    { ...common(), accountId: uuid('account_id'), strategyId: uuid('strategy_id') },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.id] }),
      check('risk_policies_scope', sql`(${t.accountId} IS NULL) <> (${t.strategyId} IS NULL)`),
      foreignKey({
        columns: [t.workspaceId, t.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      foreignKey({
        columns: [t.workspaceId, t.strategyId],
        foreignColumns: [strategies.workspaceId, strategies.id],
      }),
      index('risk_policies_account').on(t.workspaceId, t.accountId),
      index('risk_policies_strategy').on(t.workspaceId, t.strategyId),
    ],
  )
  .enableRLS();
export const riskPolicyVersions = app
  .table(
    'risk_policy_versions',
    {
      ...common(),
      policyId: uuid('policy_id').notNull(),
      version: integer('version').notNull(),
      effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
      definition: jsonb('definition').notNull(),
      reason: text('reason').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.id] }),
      unique('risk_policy_versions_number').on(t.workspaceId, t.policyId, t.version),
      foreignKey({
        columns: [t.workspaceId, t.policyId],
        foreignColumns: [riskPolicies.workspaceId, riskPolicies.id],
      }),
      check('risk_policy_versions_positive', sql`${t.version} > 0`),
      index('risk_policy_versions_effective').on(t.workspaceId, t.policyId, t.effectiveAt),
    ],
  )
  .enableRLS();
export const riskCommands = app
  .table(
    'risk_commands',
    { ...common(), requestHash: text('request_hash').notNull(), result: jsonb('result').notNull() },
    (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
  )
  .enableRLS();
export const riskAssessments = app
  .table(
    'risk_assessments',
    {
      ...common(),
      accountId: uuid('account_id').notNull(),
      sourceRevision: integer('source_revision').notNull(),
      asOf: timestamp('as_of', { withTimezone: true }).notNull(),
      result: jsonb('result').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.id] }),
      foreignKey({
        columns: [t.workspaceId, t.accountId],
        foreignColumns: [accounts.workspaceId, accounts.id],
      }),
      index('risk_assessments_account').on(t.workspaceId, t.accountId, t.id),
    ],
  )
  .enableRLS();
export const riskAssessmentPolicies = app
  .table(
    'risk_assessment_policies',
    {
      workspaceId: uuid('workspace_id').notNull(),
      assessmentId: uuid('assessment_id').notNull(),
      policyVersionId: uuid('policy_version_id').notNull(),
      actorId: text('actor_id')
        .notNull()
        .default(sql`app.current_actor_id()`),
    },
    (t) => [
      primaryKey({ columns: [t.workspaceId, t.assessmentId, t.policyVersionId] }),
      foreignKey({
        columns: [t.workspaceId, t.assessmentId],
        foreignColumns: [riskAssessments.workspaceId, riskAssessments.id],
      }),
      foreignKey({
        columns: [t.workspaceId, t.policyVersionId],
        foreignColumns: [riskPolicyVersions.workspaceId, riskPolicyVersions.id],
      }),
    ],
  )
  .enableRLS();
export const riskSchema = {
  riskPolicies,
  riskPolicyVersions,
  riskCommands,
  riskAssessments,
  riskAssessmentPolicies,
};
