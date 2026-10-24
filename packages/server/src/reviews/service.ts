import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import {
  financialIdSchema,
  periodReviewHistorySchema,
  periodReviewListQuerySchema,
  periodReviewListSchema,
  periodReviewSummarySchema,
  periodReviewTemplateListSchema,
  periodReviewTemplateVersionSchema,
  periodReviewTemplateWriteSchema,
  periodReviewVersionSchema,
  periodReviewWriteSchema,
  validatePeriodReviewAnswers,
  type PeriodReviewVersion,
} from '@journal/contracts';
import { summarizePeriodReview } from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import {
  financialConflict,
  financialFingerprint,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';

const instant = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);
const templateProjection = sql`jsonb_build_object('id',t.id,'templateId',t.template_id,'version',t.version,'actorId',t.actor_id,'createdAt',${instant('t.created_at')},'reason',t.reason,'definition',t.definition)`;
const reviewProjection = sql`jsonb_build_object('id',v.id,'entryId',v.entry_id,'version',v.version,'actorId',v.actor_id,'createdAt',${instant('v.created_at')},'reason',v.reason,'definition',v.definition,'template',CASE WHEN t.id IS NULL THEN NULL ELSE ${templateProjection} END)`;
const searchPattern = (value = '') =>
  `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
export function createPeriodReviewServices(platform: FinancialPlatform) {
  async function command<T>(
    context: AuthorizationContext,
    commandId: string,
    payload: unknown,
    run: (tx: DbTransaction) => Promise<T>,
  ) {
    if (context.role === 'viewer' || context.requiredRole === 'viewer')
      throw new ApplicationError(
        403,
        'FORBIDDEN',
        'Action not permitted',
        'Editor access is required to save a review or template.',
      );
    const id = financialIdSchema.parse(commandId),
      hash = financialFingerprint(payload);
    return platform.withWorkspaceContext(context, async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(1791763204,hashtext(${context.workspaceId}))`,
      );
      const [previous] = await queryRows<{ request_hash: string; result: T }>(
        tx,
        sql`SELECT request_hash,result FROM app.period_review_commands WHERE workspace_id=${context.workspaceId} AND id=${id}`,
      );
      if (previous) {
        if (previous.request_hash !== hash)
          throw financialConflict(
            'IDEMPOTENCY_CONFLICT',
            'This review command identity has different contents.',
          );
        return previous.result;
      }
      const result = await run(tx);
      if (Buffer.byteLength(JSON.stringify(result)) > 250000)
        throw financialConflict(
          'REVIEW_SNAPSHOT_TOO_LARGE',
          'Reduce the combined review/template evidence before saving this snapshot.',
        );
      await tx.execute(
        sql`INSERT INTO app.period_review_commands(workspace_id,id,request_hash,result) VALUES(${context.workspaceId},${id},${hash},${JSON.stringify(result)}::jsonb)`,
      );
      await tx.execute(
        sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action,request_id) VALUES(${context.workspaceId},${randomUUID()},${context.actorId},'review.version-saved',${context.requestId})`,
      );
      return result;
    });
  }
  async function readTemplate(tx: DbTransaction, context: AuthorizationContext, versionId: string) {
    const [row] = await queryRows<{ data: unknown }>(
      tx,
      sql`SELECT ${templateProjection} AS data FROM app.period_review_template_versions t WHERE t.workspace_id=${context.workspaceId} AND t.id=${versionId}`,
    );
    if (!row) throw inaccessible();
    return periodReviewTemplateVersionSchema.parse(row.data);
  }
  async function readEntry(
    tx: DbTransaction,
    context: AuthorizationContext,
    entryId: string,
    versionId?: string,
  ): Promise<PeriodReviewVersion> {
    const [row] = await queryRows<{ data: unknown }>(
      tx,
      sql`SELECT ${reviewProjection} AS data FROM app.period_review_versions v LEFT JOIN app.period_review_template_versions t ON t.workspace_id=v.workspace_id AND t.id=v.template_version_id WHERE v.workspace_id=${context.workspaceId} AND v.entry_id=${entryId} AND (${versionId ?? null}::uuid IS NULL OR v.id=${versionId ?? null}::uuid) ORDER BY v.version DESC LIMIT 1`,
    );
    if (!row) throw inaccessible();
    return periodReviewVersionSchema.parse(row.data);
  }
  async function saveTemplate(
    context: AuthorizationContext,
    templateId: string | null,
    value: unknown,
    commandId: string,
  ) {
    const input = periodReviewTemplateWriteSchema.parse(value);
    if (templateId) financialIdSchema.parse(templateId);
    return command(context, commandId, { kind: 'template', templateId, ...input }, async (tx) => {
      const identity = templateId ?? randomUUID();
      if (templateId) {
        const [row] = await queryRows<{ version: number }>(
          tx,
          sql`SELECT version FROM app.period_review_template_versions WHERE workspace_id=${context.workspaceId} AND template_id=${templateId} ORDER BY version DESC LIMIT 1`,
        );
        if (!row) throw inaccessible();
        if (row.version !== input.expectedVersion)
          throw financialConflict(
            'STALE_REVIEW_VERSION',
            'The template changed. Reload its current version; your unsaved fields remain available.',
          );
      } else {
        if (input.expectedVersion !== 0)
          throw financialInvalid('A new review template starts at expected version zero.');
        await tx.execute(
          sql`INSERT INTO app.period_review_templates(workspace_id,id) VALUES(${context.workspaceId},${identity})`,
        );
      }
      const id = randomUUID();
      await tx.execute(
        sql`INSERT INTO app.period_review_template_versions(workspace_id,id,template_id,version,definition,reason) VALUES(${context.workspaceId},${id},${identity},${input.expectedVersion + 1},${JSON.stringify(input.definition)}::jsonb,${input.reason})`,
      );
      return readTemplate(tx, context, id);
    });
  }
  async function saveEntry(
    context: AuthorizationContext,
    entryId: string | null,
    value: unknown,
    commandId: string,
  ) {
    const input = periodReviewWriteSchema.parse(value);
    if (entryId) financialIdSchema.parse(entryId);
    return command(context, commandId, { kind: 'entry', entryId, ...input }, async (tx) => {
      const identity = entryId ?? randomUUID();
      const previous = entryId ? await readEntry(tx, context, entryId) : null;
      if (previous && previous.version !== input.expectedVersion)
        throw financialConflict(
          'STALE_REVIEW_VERSION',
          'This review changed in another session. Reload its current version or copy your unsaved text before choosing how to continue.',
        );
      if (!previous && input.expectedVersion !== 0)
        throw financialInvalid('A new review starts at expected version zero.');
      const pinned = input.definition.templateVersionId
        ? await readTemplate(tx, context, input.definition.templateVersionId)
        : null;
      if (pinned && previous?.definition.templateVersionId !== pinned.id) {
        const [current] = await queryRows<{ status: string }>(
          tx,
          sql`SELECT definition->>'status' AS status FROM app.period_review_template_versions WHERE workspace_id=${context.workspaceId} AND template_id=${pinned.templateId} ORDER BY version DESC LIMIT 1`,
        );
        if (current?.status === 'archived')
          throw financialInvalid(
            'An archived template cannot be selected for a new review. Existing historical pins remain readable.',
          );
      }
      try {
        validatePeriodReviewAnswers(input.definition, pinned?.definition ?? null);
      } catch (error) {
        throw financialInvalid(
          error instanceof Error ? error.message : 'The template answers are invalid.',
        );
      }
      for (const [table, ids] of [
        ['trades', input.definition.tradeIds],
        ['strategy_versions', input.definition.strategyVersionIds],
      ] as const) {
        if (ids.length) {
          const rows = await queryRows(
            tx,
            sql`SELECT id FROM ${sql.identifier('app')}.${sql.identifier(table)} WHERE workspace_id=${context.workspaceId} AND id=ANY(${`{${ids.join(',')}}`}::uuid[])`,
          );
          if (rows.length !== ids.length) throw inaccessible();
        }
      }
      if (!previous)
        await tx.execute(
          sql`INSERT INTO app.period_review_entries(workspace_id,id) VALUES(${context.workspaceId},${identity})`,
        );
      const id = randomUUID();
      await tx.execute(
        sql`INSERT INTO app.period_review_versions(workspace_id,id,entry_id,version,template_version_id,definition,reason) VALUES(${context.workspaceId},${id},${identity},${input.expectedVersion + 1},${input.definition.templateVersionId},${JSON.stringify(input.definition)}::jsonb,${input.reason})`,
      );
      for (const tradeId of input.definition.tradeIds)
        await tx.execute(
          sql`INSERT INTO app.period_review_trades(workspace_id,review_version_id,trade_id) VALUES(${context.workspaceId},${id},${tradeId})`,
        );
      for (const strategyId of input.definition.strategyVersionIds)
        await tx.execute(
          sql`INSERT INTO app.period_review_strategies(workspace_id,review_version_id,strategy_version_id) VALUES(${context.workspaceId},${id},${strategyId})`,
        );
      return readEntry(tx, context, identity, id);
    });
  }
  async function entries(context: AuthorizationContext, value: unknown = {}) {
    const input = periodReviewListQuerySchema.parse(value);
    return platform.withWorkspaceContext(context, async (tx) => {
      const rows = await queryRows<{ data: unknown; entry_id: string }>(
        tx,
        sql`SELECT ${reviewProjection} AS data,v.entry_id FROM app.period_review_entries e JOIN LATERAL(SELECT * FROM app.period_review_versions v WHERE v.workspace_id=e.workspace_id AND v.entry_id=e.id ORDER BY version DESC LIMIT 1) v ON true LEFT JOIN app.period_review_template_versions t ON t.workspace_id=v.workspace_id AND t.id=v.template_version_id WHERE e.workspace_id=${context.workspaceId} AND (${input.after ?? null}::uuid IS NULL OR e.id>${input.after ?? null}::uuid) AND v.definition->>'title' ILIKE ${searchPattern(input.search)} AND (${input.kind ?? null}::text IS NULL OR v.definition->>'kind'=${input.kind ?? null}) AND (${input.status ?? null}::text IS NULL OR v.definition->>'status'=${input.status ?? null}) ORDER BY e.id LIMIT 11`,
      );
      return periodReviewListSchema.parse({
        entries: rows.slice(0, 10).map((row) => row.data),
        nextCursor: rows.length > 10 ? rows[9]!.entry_id : null,
      });
    });
  }
  async function templates(context: AuthorizationContext, after?: string) {
    if (after) financialIdSchema.parse(after);
    return platform.withWorkspaceContext(context, async (tx) => {
      const rows = await queryRows<{ data: unknown; template_id: string }>(
        tx,
        sql`SELECT ${templateProjection} AS data,t.template_id FROM app.period_review_templates p JOIN LATERAL(SELECT * FROM app.period_review_template_versions t WHERE t.workspace_id=p.workspace_id AND t.template_id=p.id ORDER BY version DESC LIMIT 1) t ON true WHERE p.workspace_id=${context.workspaceId} AND (${after ?? null}::uuid IS NULL OR p.id>${after ?? null}::uuid) ORDER BY p.id LIMIT 11`,
      );
      return periodReviewTemplateListSchema.parse({
        templates: rows.slice(0, 10).map((row) => row.data),
        nextCursor: rows.length > 10 ? rows[9]!.template_id : null,
      });
    });
  }
  const entry = (context: AuthorizationContext, entryId: string) => {
    financialIdSchema.parse(entryId);
    return platform.withWorkspaceContext(context, (tx) => readEntry(tx, context, entryId));
  };
  async function history(context: AuthorizationContext, entryId: string, after?: string) {
    financialIdSchema.parse(entryId);
    if (after) financialIdSchema.parse(after);
    return platform.withWorkspaceContext(context, async (tx) => {
      await readEntry(tx, context, entryId);
      let cursor = 2_147_483_647;
      if (after) {
        const [row] = await queryRows<{ version: number }>(
          tx,
          sql`SELECT version FROM app.period_review_versions WHERE workspace_id=${context.workspaceId} AND entry_id=${entryId} AND id=${after}`,
        );
        if (!row) throw inaccessible();
        cursor = row.version;
      }
      const rows = await queryRows<{ data: unknown; id: string }>(
        tx,
        sql`SELECT ${reviewProjection} AS data,v.id FROM app.period_review_versions v LEFT JOIN app.period_review_template_versions t ON t.workspace_id=v.workspace_id AND t.id=v.template_version_id WHERE v.workspace_id=${context.workspaceId} AND v.entry_id=${entryId} AND v.version<${cursor} ORDER BY v.version DESC LIMIT 11`,
      );
      return periodReviewHistorySchema.parse({
        versions: rows.slice(0, 10).map((row) => row.data),
        nextCursor: rows.length > 10 ? rows[9]!.id : null,
      });
    });
  }
  async function summary(context: AuthorizationContext, entryId: string) {
    financialIdSchema.parse(entryId);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const review = await readEntry(tx, context, entryId);
        const rows = await queryRows<{
          id: string;
          journal_revision_id: string | null;
          status: string;
          reviewed: boolean;
          mistakes: string[];
        }>(
          tx,
          sql`SELECT t.id,r.id AS journal_revision_id,t.status,coalesce(length(btrim(r.document->'review'->>'postTradeReview'))>0,false) AS reviewed,coalesce(r.document->'review'->'mistakes','[]'::jsonb) AS mistakes FROM app.period_review_trades l JOIN app.trades t ON t.workspace_id=l.workspace_id AND t.id=l.trade_id LEFT JOIN LATERAL(SELECT id,document FROM app.journal_revisions r WHERE r.workspace_id=t.workspace_id AND r.trade_id=t.id ORDER BY revision DESC LIMIT 1) r ON true WHERE l.workspace_id=${context.workspaceId} AND l.review_version_id=${review.id} ORDER BY t.id`,
        );
        const [state] = await queryRows<{ revision: number; at: string }>(
          tx,
          sql`SELECT coalesce((SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}),0)::integer AS revision,${instant('clock_timestamp()')} AS at`,
        );
        return periodReviewSummarySchema.parse({
          entryVersionId: review.id,
          sourceRevision: String(state!.revision),
          generatedAt: state!.at,
          sourceRecords: rows.map((row) => ({
            tradeId: row.id,
            journalRevisionId: row.journal_revision_id,
            status: row.status,
          })),
          ...summarizePeriodReview({
            trades: rows,
            goalCount: review.definition.goals.length,
            openActionCount: review.definition.improvementActions.filter((a) => a.status === 'open')
              .length,
          }),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async function catalog(
    context: AuthorizationContext,
    collection: 'trades' | 'strategy-versions',
    after?: string,
    search?: string,
  ) {
    if (after) financialIdSchema.parse(after);
    return platform.withWorkspaceContext(context, async (tx) => {
      let query: ReturnType<typeof sql>;
      if (collection === 'trades')
        query = sql`SELECT id,title AS label FROM app.trades WHERE workspace_id=${context.workspaceId} AND (${after ?? null}::uuid IS NULL OR id>${after ?? null}::uuid) AND title ILIKE ${searchPattern(search)} ORDER BY id LIMIT 51`;
      else
        query = sql`SELECT id,definition->>'name'||' · v'||version AS label FROM app.strategy_versions WHERE workspace_id=${context.workspaceId} AND (${after ?? null}::uuid IS NULL OR id>${after ?? null}::uuid) AND definition->>'name' ILIKE ${searchPattern(search)} ORDER BY id LIMIT 51`;
      const rows = await queryRows<{ id: string; label: string }>(tx, query);
      return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
    });
  }
  return { saveTemplate, saveEntry, entries, templates, entry, history, summary, catalog };
}
