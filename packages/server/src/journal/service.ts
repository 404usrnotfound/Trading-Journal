import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql, type DbTransaction } from '@journal/database';
import * as contract from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import { readTrade } from '../financial/catalog.js';
import type { TradeDto } from '../financial/catalog-types.js';
import {
  executeFinancialCommand,
  financialFingerprint,
  queryRows,
} from '../financial/repository.js';
import {
  requireAccount,
  requireCurrency,
  requireInstrumentVersion,
} from '../financial/reference-data.js';
import {
  insertTradeStrategyLink,
  lockStrategyWorkspace,
  readStrategyVersion,
  requireSelectableStrategyVersion,
} from '../strategies/repository.js';
import {
  executeJournalCommand,
  journalConflict,
  journalInstant,
  journalInvalid,
  type JournalPlatform,
} from './repository.js';
import { readJournalFinancialSnapshot } from './financial.js';

const identity = (value: string) => contract.financialIdSchema.parse(value).toLowerCase();
const pageSchema = z.strictObject({
  cursor: contract.financialIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
const listSchema = pageSchema.extend({
  includeArchived: z.boolean().default(false),
  status: z.enum(['planned', 'open', 'partially_closed', 'closed', 'canceled']).optional(),
  search: z.string().trim().min(1).max(160).optional(),
});
type Page = z.input<typeof pageSchema>;

type EntryRow = {
  revision: number;
  document: contract.JournalDocument | null;
  updated_at: string;
  updated_by: string;
};

async function readEntry(
  tx: DbTransaction,
  workspaceId: string,
  tradeId: string,
  strategyVersionId: string | null,
): Promise<contract.JournalEntryResponse> {
  const [row] = await queryRows<EntryRow>(
    tx,
    sql`SELECT e.revision,r.document,${journalInstant('e.updated_at')} AS updated_at,e.updated_by
    FROM app.journal_entries e LEFT JOIN app.journal_revisions r ON r.workspace_id=e.workspace_id AND r.id=e.current_revision_id
    WHERE e.workspace_id=${workspaceId} AND e.trade_id=${tradeId}`,
  );
  return contract.journalEntryResponseSchema.parse({
    tradeId,
    revision: row?.revision ?? 0,
    document:
      row?.document ?? contract.journalDocumentSchema.parse({ plan: { strategyVersionId } }),
    updatedAt: row && row.revision > 0 ? row.updated_at : null,
    updatedBy: row && row.revision > 0 ? row.updated_by : null,
  });
}

async function lockTrade(tx: DbTransaction, workspaceId: string, tradeId: string) {
  const [row] = await queryRows<{ id: string }>(
    tx,
    sql`SELECT id FROM app.trades WHERE workspace_id=${workspaceId} AND id=${tradeId} FOR UPDATE`,
  );
  if (!row) throw inaccessible();
}

async function readPlan(
  tx: DbTransaction,
  workspaceId: string,
  tradeId: string,
  planId: string,
): Promise<contract.JournalPlanVersionResponse> {
  const [row] = await queryRows<{ data: unknown }>(
    tx,
    sql`SELECT jsonb_build_object('id',id,'tradeId',trade_id,'version',version,
    'definition',definition,'definitionHash',definition_hash,'createdAt',${journalInstant('created_at')},'createdBy',actor_id,'changeReason',change_reason) AS data
    FROM app.journal_plan_versions WHERE workspace_id=${workspaceId} AND trade_id=${tradeId} AND id=${planId}`,
  );
  if (!row) throw inaccessible();
  return contract.journalPlanVersionResponseSchema.parse(row.data);
}

async function readRevision(
  tx: DbTransaction,
  workspaceId: string,
  tradeId: string,
  revisionId: string,
): Promise<contract.JournalRevisionResponse> {
  const [row] = await queryRows<{ data: unknown }>(
    tx,
    sql`SELECT jsonb_build_object('id',id,'tradeId',trade_id,'revision',revision,
    'document',document,'documentHash',document_hash,'createdAt',${journalInstant('created_at')},'createdBy',actor_id,'changeReason',change_reason) AS data
    FROM app.journal_revisions WHERE workspace_id=${workspaceId} AND trade_id=${tradeId} AND id=${revisionId}`,
  );
  if (!row) throw inaccessible();
  return contract.journalRevisionResponseSchema.parse(row.data);
}

async function readRisk(
  tx: DbTransaction,
  workspaceId: string,
  tradeId: string,
  riskId: string,
): Promise<contract.JournalRiskAdditionResponse> {
  const [row] = await queryRows<{ data: unknown }>(
    tx,
    sql`SELECT jsonb_build_object('id',id,'tradeId',trade_id,'amount',amount_raw,
    'currencyId',currency_id,'method',method,'methodNotes',method_notes,'reason',reason,'createdAt',${journalInstant('created_at')},'createdBy',actor_id) AS data
    FROM app.journal_risk_additions WHERE workspace_id=${workspaceId} AND trade_id=${tradeId} AND id=${riskId}`,
  );
  if (!row) throw inaccessible();
  return contract.journalRiskAdditionResponseSchema.parse(row.data);
}

async function readCommitment(
  tx: DbTransaction,
  workspaceId: string,
  tradeId: string,
): Promise<contract.JournalCommitmentResponse | null> {
  const [row] = await queryRows<{ data: unknown }>(
    tx,
    sql`SELECT jsonb_build_object('originalPlanId',original_plan_id,'committedAt',${journalInstant('committed_at')},
    'financialSourceRevision',financial_source_revision::text,'timing',timing,'createdBy',actor_id) AS data
    FROM app.journal_plan_commitments WHERE workspace_id=${workspaceId} AND trade_id=${tradeId}`,
  );
  return row ? contract.journalCommitmentResponseSchema.parse(row.data) : null;
}

async function readDetail(
  tx: DbTransaction,
  context: AuthorizationContext,
  tradeId: string,
): Promise<contract.JournalDetailResponse> {
  const trade = await readTrade(tx, context.workspaceId, tradeId);
  const journal = await readEntry(tx, context.workspaceId, tradeId, trade.strategyVersionId);
  const commitment = await readCommitment(tx, context.workspaceId, tradeId);
  const [latest] = await queryRows<{ id: string }>(
    tx,
    sql`SELECT id FROM app.journal_plan_versions WHERE workspace_id=${context.workspaceId} AND trade_id=${tradeId} ORDER BY version DESC LIMIT 1`,
  );
  const originalPlan = commitment
    ? await readPlan(tx, context.workspaceId, tradeId, commitment.originalPlanId)
    : null;
  const currentPlan = latest ? await readPlan(tx, context.workspaceId, tradeId, latest.id) : null;
  const selectedStrategyVersionId =
    trade.strategyVersionId ?? journal.document.plan.strategyVersionId;
  const strategy = selectedStrategyVersionId
    ? await readStrategyVersion(tx, context.workspaceId, selectedStrategyVersionId)
    : null;
  const [state] = await queryRows<{ revision: number }>(
    tx,
    sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}`,
  );
  const sourceRevision = String(state?.revision ?? 0);
  const financial = await readJournalFinancialSnapshot(tx, context, {
    trade,
    originalPlan,
    commitment,
    sourceRevision,
  });
  const history = await queryRows<{
    id: string;
    revision: number;
    createdAt: string;
    createdBy: string;
    changeReason: string;
  }>(
    tx,
    sql`SELECT id,revision,
    ${journalInstant('created_at')} AS "createdAt",actor_id AS "createdBy",change_reason AS "changeReason" FROM app.journal_revisions
    WHERE workspace_id=${context.workspaceId} AND trade_id=${tradeId} ORDER BY revision DESC LIMIT 20`,
  );
  return contract.journalDetailResponseSchema.parse({
    trade,
    journal,
    strategy,
    originalPlan,
    currentPlan,
    commitment,
    financial,
    recentHistory: history,
  });
}

async function validateReferences(
  tx: DbTransaction,
  context: AuthorizationContext,
  trade: TradeDto,
  document: contract.JournalDocument,
) {
  const selected = document.plan.strategyVersionId;
  if (trade.strategyVersionId && selected !== trade.strategyVersionId)
    throw journalConflict(
      'TRADE_STRATEGY_ALREADY_PINNED',
      'The trade must keep its original strategy version.',
    );
  const strategy = selected ? await readStrategyVersion(tx, context.workspaceId, selected) : null;
  if (selected && !trade.strategyVersionId)
    await requireSelectableStrategyVersion(tx, context.workspaceId, selected);
  if (
    document.plan.setupId &&
    !strategy?.definition.setups.some((setup) => setup.id.toLowerCase() === document.plan.setupId)
  )
    throw journalInvalid('The setup must belong to the selected strategy version.');
  const checklist = new Set(
    strategy?.definition.checklist.map((item) => item.id.toLowerCase()) ?? [],
  );
  if (
    document.review.ruleAssessments.some((assessment) => !checklist.has(assessment.checklistItemId))
  )
    throw journalInvalid('Every rule assessment must identify an item in this strategy version.');
  const legs = await queryRows<{ id: string }>(
    tx,
    sql`SELECT id FROM app.trade_legs WHERE workspace_id=${context.workspaceId} AND trade_id=${trade.id}`,
  );
  const legIds = new Set(legs.map((leg) => leg.id));
  if (
    [...document.plan.legs, ...document.review.actualObservations].some(
      (leg) => !legIds.has(leg.legId),
    )
  )
    throw journalInvalid('Every planned or observed leg must belong to this trade.');
  if (document.plan.initialRisk)
    await requireCurrency(tx, context.workspaceId, document.plan.initialRisk.currencyId, false);
  const attachmentIds = new Set([
    ...document.plan.attachmentIds,
    ...document.review.attachments.map((attachment) => attachment.attachmentId),
  ]);
  for (const attachmentId of [...attachmentIds].sort()) {
    const [attachment] = await queryRows<{ state: string }>(
      tx,
      sql`SELECT state FROM app.strategy_attachments WHERE workspace_id=${context.workspaceId} AND id=${attachmentId} FOR UPDATE`,
    );
    if (!attachment) throw inaccessible();
    if (attachment.state !== 'ready')
      throw journalConflict(
        'ATTACHMENT_NOT_READY',
        'Finish uploading every attachment before saving the journal.',
      );
  }
}

async function appendRevision(
  tx: DbTransaction,
  context: AuthorizationContext,
  tradeId: string,
  commandId: string,
  current: contract.JournalEntryResponse,
  document: contract.JournalDocument,
  reason: string,
) {
  if (current.revision >= 2_147_483_647)
    throw journalConflict('JOURNAL_REVISION_LIMIT', 'The journal revision limit has been reached.');
  await tx.execute(
    sql`INSERT INTO app.journal_entries(workspace_id,trade_id,actor_id) VALUES (${context.workspaceId},${tradeId},${context.actorId}) ON CONFLICT(workspace_id,trade_id) DO NOTHING`,
  );
  const revisionId = randomUUID();
  await tx.execute(sql`INSERT INTO app.journal_revisions(workspace_id,id,trade_id,command_id,revision,document,document_hash,change_reason,actor_id)
    VALUES (${context.workspaceId},${revisionId},${tradeId},${commandId},${current.revision + 1},${JSON.stringify(document)}::jsonb,${financialFingerprint(document)},${reason},${context.actorId})`);
  for (const attachmentId of document.plan.attachmentIds)
    await tx.execute(
      sql`INSERT INTO app.journal_revision_attachments(workspace_id,revision_id,attachment_id,phase,actor_id) VALUES (${context.workspaceId},${revisionId},${attachmentId},'planning',${context.actorId})`,
    );
  for (const attachment of document.review.attachments)
    await tx.execute(
      sql`INSERT INTO app.journal_revision_attachments(workspace_id,revision_id,attachment_id,phase,actor_id) VALUES (${context.workspaceId},${revisionId},${attachment.attachmentId},${attachment.phase},${context.actorId})`,
    );
  await tx.execute(sql`UPDATE app.journal_entries SET current_revision_id=${revisionId},revision=${current.revision + 1},updated_at=clock_timestamp(),updated_by=${context.actorId}
    WHERE workspace_id=${context.workspaceId} AND trade_id=${tradeId} AND revision=${current.revision}`);
}
function checkRevision(current: contract.JournalEntryResponse, expected: number) {
  if (current.revision !== expected)
    throw journalConflict(
      'STALE_JOURNAL_REVISION',
      'The journal changed. Reload it before saving; keep your draft for comparison.',
    );
}

/** Manual interpretation is append-only history alongside, never a replacement for, ledger facts. */
export function createJournalServices(platform: JournalPlatform) {
  async function create(
    context: AuthorizationContext,
    value: contract.JournalCreateInput,
    commandId: string,
  ): Promise<contract.JournalDetailResponse> {
    const input = contract.journalCreateSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'journal.created', payload: input },
      async (tx) => {
        await lockStrategyWorkspace(tx, context.workspaceId);
        const strategyId = input.strategyVersionId
          ? await requireSelectableStrategyVersion(tx, context.workspaceId, input.strategyVersionId)
          : null;
        for (const leg of input.legs) {
          await requireAccount(tx, context.workspaceId, leg.accountId);
          await requireInstrumentVersion(tx, context.workspaceId, leg.instrumentVersionId);
        }
        const id = randomUUID();
        await tx.execute(
          sql`INSERT INTO app.trades(workspace_id,id,title,classification,status,revision,actor_id) VALUES (${context.workspaceId},${id},${input.title},${input.classification},'planned',1,${context.actorId})`,
        );
        if (strategyId && input.strategyVersionId)
          await insertTradeStrategyLink(tx, context, {
            tradeId: id,
            strategyId,
            strategyVersionId: input.strategyVersionId,
            timing: 'recorded-with-trade',
            reason: 'Strategy version recorded when this journal trade was created.',
          });
        for (const leg of input.legs)
          await tx.execute(sql`INSERT INTO app.trade_legs(workspace_id,id,trade_id,account_id,instrument_version_id,direction,label,actor_id)
        VALUES (${context.workspaceId},${randomUUID()},${id},${leg.accountId},${leg.instrumentVersionId},${leg.direction},${leg.label},${context.actorId})`);
        await tx.execute(
          sql`INSERT INTO app.journal_entries(workspace_id,trade_id,actor_id) VALUES (${context.workspaceId},${id},${context.actorId})`,
        );
        return readDetail(tx, context, id);
      },
    );
  }
  async function save(
    context: AuthorizationContext,
    tradeId: string,
    value: contract.JournalSaveInput,
    commandId: string,
  ): Promise<contract.JournalEntryResponse> {
    const id = identity(tradeId),
      input = contract.journalSaveSchema.parse(value);
    return executeJournalCommand(
      platform,
      context,
      { commandId, kind: 'saved', payload: { id, ...input } },
      async (tx, command) => {
        await lockTrade(tx, context.workspaceId, id);
        const trade = await readTrade(tx, context.workspaceId, id);
        const current = await readEntry(tx, context.workspaceId, id, trade.strategyVersionId);
        checkRevision(current, input.expectedRevision);
        const document =
          trade.strategyVersionId && input.document.plan.strategyVersionId === null
            ? {
                ...input.document,
                plan: { ...input.document.plan, strategyVersionId: trade.strategyVersionId },
              }
            : input.document;
        await validateReferences(tx, context, trade, document);
        await appendRevision(tx, context, id, command, current, document, 'Journal draft saved.');
        return readEntry(tx, context.workspaceId, id, trade.strategyVersionId);
      },
    );
  }
  async function publishPlan(
    context: AuthorizationContext,
    tradeId: string,
    value: contract.JournalPublishPlanInput,
    commandId: string,
  ): Promise<contract.JournalPlanVersionResponse> {
    const id = identity(tradeId),
      input = contract.journalPublishPlanSchema.parse(value);
    return executeJournalCommand(
      platform,
      context,
      { commandId, kind: 'plan-published', payload: { id, ...input } },
      async (tx, command) => {
        // Acquire strategy identity before the trade when publication will pin a draft selection.
        const preliminary = await readTrade(tx, context.workspaceId, id);
        const preliminaryEntry = await readEntry(
          tx,
          context.workspaceId,
          id,
          preliminary.strategyVersionId,
        );
        const selected = preliminaryEntry.document.plan.strategyVersionId;
        const strategyId =
          selected && !preliminary.strategyVersionId
            ? await requireSelectableStrategyVersion(tx, context.workspaceId, selected)
            : null;
        await lockTrade(tx, context.workspaceId, id);
        const trade = await readTrade(tx, context.workspaceId, id),
          current = await readEntry(tx, context.workspaceId, id, trade.strategyVersionId);
        checkRevision(current, input.expectedRevision);
        if (trade.revision !== input.expectedTradeRevision)
          throw journalConflict(
            'STALE_TRADE_REVISION',
            'The trade changed. Reload it before publishing a plan.',
          );
        if (trade.archivedAt || trade.status === 'canceled' || trade.status === 'closed')
          throw journalConflict(
            'TRADE_NOT_ACTIVE',
            'Only an active, unarchived trade can receive a new plan.',
          );
        await validateReferences(tx, context, trade, current.document);
        if (strategyId && selected) {
          await insertTradeStrategyLink(tx, context, {
            tradeId: id,
            strategyId,
            strategyVersionId: selected,
            timing: 'retrospective',
            reason: input.reason,
          });
          await tx.execute(
            sql`UPDATE app.trades SET revision=revision+1 WHERE workspace_id=${context.workspaceId} AND id=${id}`,
          );
        }
        const [latest] = await queryRows<{ version: number }>(
          tx,
          sql`SELECT version FROM app.journal_plan_versions WHERE workspace_id=${context.workspaceId} AND trade_id=${id} ORDER BY version DESC LIMIT 1`,
        );
        const planId = randomUUID(),
          version = (latest?.version ?? 0) + 1;
        await tx.execute(sql`INSERT INTO app.journal_plan_versions(workspace_id,id,trade_id,command_id,version,definition,definition_hash,change_reason,actor_id)
        VALUES (${context.workspaceId},${planId},${id},${command},${version},${JSON.stringify(current.document.plan)}::jsonb,${financialFingerprint(current.document.plan)},${input.reason},${context.actorId})`);
        for (const attachmentId of current.document.plan.attachmentIds)
          await tx.execute(
            sql`INSERT INTO app.journal_plan_attachments(workspace_id,plan_version_id,attachment_id,actor_id) VALUES (${context.workspaceId},${planId},${attachmentId},${context.actorId})`,
          );
        if (version === 1) {
          const [state] = await queryRows<{ revision: number }>(
            tx,
            sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}`,
          );
          const [activity] = await queryRows<{ exists: boolean }>(
            tx,
            sql`SELECT EXISTS(SELECT 1 FROM app.trade_legs l
          JOIN app.allocation_items i ON i.workspace_id=l.workspace_id AND i.trade_leg_id=l.id AND i.quantity>0
          JOIN app.allocation_sets s ON s.workspace_id=i.workspace_id AND s.id=i.allocation_set_id
          JOIN app.executions e ON e.workspace_id=s.workspace_id AND e.id=s.execution_id
          WHERE l.workspace_id=${context.workspaceId} AND l.trade_id=${id}
          AND NOT EXISTS(SELECT 1 FROM app.allocation_sets newer WHERE newer.workspace_id=s.workspace_id AND newer.execution_id=s.execution_id AND newer.version>s.version)
          AND NOT EXISTS(SELECT 1 FROM app.execution_supersessions supersession WHERE supersession.workspace_id=e.workspace_id AND supersession.original_execution_id=e.id)) AS exists`,
          );
          await tx.execute(sql`INSERT INTO app.journal_plan_commitments(workspace_id,trade_id,command_id,original_plan_id,financial_source_revision,timing,actor_id)
          VALUES (${context.workspaceId},${id},${command},${planId},${state?.revision ?? 0},${activity?.exists ? 'retrospective' : 'pre-trade'},${context.actorId})`);
        }
        await appendRevision(tx, context, id, command, current, current.document, input.reason);
        return readPlan(tx, context.workspaceId, id, planId);
      },
    );
  }
  async function addRisk(
    context: AuthorizationContext,
    tradeId: string,
    value: contract.JournalRiskAdditionInput,
    commandId: string,
  ): Promise<contract.JournalRiskAdditionResponse> {
    const id = identity(tradeId),
      input = contract.journalRiskAdditionSchema.parse(value);
    return executeJournalCommand(
      platform,
      context,
      { commandId, kind: 'risk-added', payload: { id, ...input } },
      async (tx, command) => {
        await lockTrade(tx, context.workspaceId, id);
        const trade = await readTrade(tx, context.workspaceId, id),
          current = await readEntry(tx, context.workspaceId, id, trade.strategyVersionId);
        checkRevision(current, input.expectedRevision);
        if (!(await readCommitment(tx, context.workspaceId, id)))
          throw journalConflict(
            'ORIGINAL_PLAN_REQUIRED',
            'Publish an original plan before recording supplemental risk.',
          );
        if (trade.archivedAt || trade.status === 'canceled' || trade.status === 'closed')
          throw journalConflict(
            'TRADE_NOT_ACTIVE',
            'Only an active, unarchived trade can receive supplemental risk.',
          );
        await requireCurrency(tx, context.workspaceId, input.currencyId);
        const riskId = randomUUID();
        await tx.execute(sql`INSERT INTO app.journal_risk_additions(workspace_id,id,trade_id,command_id,amount_raw,currency_id,method,method_notes,reason,actor_id)
        VALUES (${context.workspaceId},${riskId},${id},${command},${input.amount},${input.currencyId},${input.method},${input.methodNotes},${input.reason},${context.actorId})`);
        await appendRevision(tx, context, id, command, current, current.document, input.reason);
        return readRisk(tx, context.workspaceId, id, riskId);
      },
    );
  }
  const get = (context: AuthorizationContext, tradeId: string) =>
    platform.withWorkspaceContext(context, (tx) => readDetail(tx, context, identity(tradeId)), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  const list = (
    context: AuthorizationContext,
    value: z.input<typeof listSchema> = {},
  ): Promise<contract.JournalListResponse> => {
    const filter = listSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.trades WHERE workspace_id=${context.workspaceId}
        AND (${filter.includeArchived} OR archived_at IS NULL) AND (${filter.status ?? null}::text IS NULL OR status=${filter.status ?? null})
        AND (${filter.search ?? null}::text IS NULL OR strpos(lower(title),lower(${filter.search ?? null}))>0)
        AND (${filter.cursor ?? null}::uuid IS NULL OR id>${filter.cursor ?? null}::uuid) ORDER BY id LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit),
          trades = [];
        for (const row of page) trades.push(await readTrade(tx, context.workspaceId, row.id));
        return contract.journalListResponseSchema.parse({
          trades,
          nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };
  const plans = (
    context: AuthorizationContext,
    tradeId: string,
    value: Page = {},
  ): Promise<contract.JournalPlansResponse> => {
    const id = identity(tradeId),
      filter = pageSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await readTrade(tx, context.workspaceId, id);
        const cursor = filter.cursor
          ? await readPlan(tx, context.workspaceId, id, identity(filter.cursor))
          : null;
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.journal_plan_versions WHERE workspace_id=${context.workspaceId} AND trade_id=${id}
        AND (${cursor?.version ?? null}::integer IS NULL OR version<${cursor?.version ?? null}::integer) ORDER BY version DESC LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit),
          plans = [];
        for (const row of page) plans.push(await readPlan(tx, context.workspaceId, id, row.id));
        return contract.journalPlansResponseSchema.parse({
          plans,
          nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };
  const revisions = (
    context: AuthorizationContext,
    tradeId: string,
    value: Page = {},
  ): Promise<contract.JournalRevisionsResponse> => {
    const id = identity(tradeId),
      filter = pageSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await readTrade(tx, context.workspaceId, id);
        const cursor = filter.cursor
          ? await readRevision(tx, context.workspaceId, id, identity(filter.cursor))
          : null;
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.journal_revisions WHERE workspace_id=${context.workspaceId} AND trade_id=${id}
        AND (${cursor?.revision ?? null}::integer IS NULL OR revision<${cursor?.revision ?? null}::integer) ORDER BY revision DESC LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit),
          revisions = [];
        for (const row of page)
          revisions.push(await readRevision(tx, context.workspaceId, id, row.id));
        return contract.journalRevisionsResponseSchema.parse({
          revisions,
          nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };
  const getRevision = (context: AuthorizationContext, tradeId: string, revisionId: string) =>
    platform.withWorkspaceContext(
      context,
      (tx) => readRevision(tx, context.workspaceId, identity(tradeId), identity(revisionId)),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  const riskAdditions = (
    context: AuthorizationContext,
    tradeId: string,
    value: Page = {},
  ): Promise<contract.JournalRiskAdditionsResponse> => {
    const id = identity(tradeId),
      filter = pageSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await readTrade(tx, context.workspaceId, id);
        if (filter.cursor) await readRisk(tx, context.workspaceId, id, identity(filter.cursor));
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.journal_risk_additions WHERE workspace_id=${context.workspaceId} AND trade_id=${id}
        AND (${filter.cursor ?? null}::uuid IS NULL OR id>${filter.cursor ?? null}::uuid) ORDER BY id LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit),
          riskAdditions = [];
        for (const row of page)
          riskAdditions.push(await readRisk(tx, context.workspaceId, id, row.id));
        return contract.journalRiskAdditionsResponseSchema.parse({
          riskAdditions,
          nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };
  return {
    create,
    save,
    publishPlan,
    addRisk,
    get,
    list,
    plans,
    revisions,
    getRevision,
    riskAdditions,
  };
}
