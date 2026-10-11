import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import {
  financialIdSchema,
  strategyArchiveSchema,
  strategyCreateSchema,
  strategyResponseSchema,
  strategyTradeLinkCreateSchema,
  strategyUpdateSchema,
  type StrategyArchiveInput,
  type StrategyCreateInput,
  type StrategyDefinition,
  type StrategyListResponse,
  type StrategyResponse,
  type StrategyTradeLinkCreateInput,
  type StrategyTradesResponse,
  type StrategyUpdateInput,
  type StrategyVersionListResponse,
} from '@journal/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import { readTrade } from '../financial/catalog.js';
import { financialFingerprint, queryRows } from '../financial/repository.js';
import {
  executeStrategyCommand,
  insertTradeStrategyLink,
  readStrategyVersion,
  requireSelectableStrategyVersion,
  strategyConflict,
  type StrategyPlatform,
} from './repository.js';

const pageFilterSchema = z.strictObject({
  cursor: financialIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
const listFilterSchema = pageFilterSchema.extend({
  includeArchived: z.boolean().default(false),
  status: z.enum(['draft', 'active', 'paused', 'retired']).optional(),
  search: z.string().trim().min(1).max(160).optional(),
});
type PageFilter = z.input<typeof pageFilterSchema>;
type ListFilter = z.input<typeof listFilterSchema>;

async function lockIdentity(tx: DbTransaction, workspaceId: string, strategyId: string) {
  const [row] = await queryRows<{ id: string }>(
    tx,
    sql`SELECT id FROM app.strategies WHERE workspace_id=${workspaceId} AND id=${strategyId} FOR UPDATE`,
  );
  if (!row) throw inaccessible();
}

async function readStrategy(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<StrategyResponse> {
  const [row] = await queryRows<{ data: Omit<StrategyResponse, 'currentVersion'> }>(
    tx,
    sql`SELECT jsonb_build_object('id',id,'workspaceId',workspace_id,'revision',revision,
      'currentVersionId',current_version_id,
      'archivedAt',to_char(archived_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'archiveReason',archive_reason,
      'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS data
      FROM app.strategies WHERE workspace_id=${workspaceId} AND id=${id}`,
  );
  if (!row) throw inaccessible();
  return strategyResponseSchema.parse({
    ...row.data,
    currentVersion: await readStrategyVersion(tx, workspaceId, row.data.currentVersionId),
  });
}

async function validateDefinitionReferences(
  tx: DbTransaction,
  workspaceId: string,
  definition: StrategyDefinition,
) {
  // Old versions retain their references after archive. A new snapshot selects live references.
  for (const instrumentId of definition.eligibleInstruments) {
    const [instrument] = await queryRows<{ archived_at: string | null }>(
      tx,
      sql`SELECT archived_at::text FROM app.instruments WHERE workspace_id=${workspaceId} AND id=${instrumentId} FOR SHARE`,
    );
    if (!instrument) throw inaccessible();
    if (instrument.archived_at)
      throw strategyConflict(
        'INSTRUMENT_ARCHIVED',
        'An archived instrument cannot be selected in a new strategy version.',
      );
  }
  for (const attachmentId of [...definition.attachmentIds].sort()) {
    const [attachment] = await queryRows<{ state: string }>(
      tx,
      sql`SELECT state FROM app.strategy_attachments WHERE workspace_id=${workspaceId} AND id=${attachmentId} FOR UPDATE`,
    );
    if (!attachment) throw inaccessible();
    if (attachment.state !== 'ready')
      throw strategyConflict(
        'ATTACHMENT_NOT_READY',
        'Every strategy attachment must be available before publishing a version.',
      );
  }
}

async function insertVersion(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: {
    strategyId: string;
    versionId: string;
    version: number;
    definition: StrategyDefinition;
    effectiveAt: string;
    changeReason: string;
  },
) {
  await tx.execute(sql`INSERT INTO app.strategy_versions
    (workspace_id,id,strategy_id,version,effective_at,definition,definition_hash,change_reason,actor_id)
    VALUES (${context.workspaceId},${input.versionId},${input.strategyId},${input.version},
      ${input.effectiveAt}::timestamptz,${JSON.stringify(input.definition)}::jsonb,
      ${financialFingerprint(input.definition)},${input.changeReason},${context.actorId})`);
  for (const attachmentId of input.definition.attachmentIds)
    await tx.execute(sql`INSERT INTO app.strategy_version_attachments(workspace_id,strategy_version_id,attachment_id)
      VALUES (${context.workspaceId},${input.versionId},${attachmentId})`);
}

/** Published definitions are complete immutable snapshots; updates append rather than edit. */
export function createStrategyServices(platform: StrategyPlatform) {
  async function create(
    context: AuthorizationContext,
    value: StrategyCreateInput,
    commandId: string,
  ): Promise<StrategyResponse> {
    const input = strategyCreateSchema.parse(value);
    return executeStrategyCommand(
      platform,
      context,
      { commandId, kind: 'created', payload: input },
      async (tx) => {
        await validateDefinitionReferences(tx, context.workspaceId, input.definition);
        const id = randomUUID();
        const versionId = randomUUID();
        await tx.execute(sql`INSERT INTO app.strategies(workspace_id,id,current_version_id,actor_id)
        VALUES (${context.workspaceId},${id},${versionId},${context.actorId})`);
        await insertVersion(tx, context, { ...input, strategyId: id, versionId, version: 1 });
        return readStrategy(tx, context.workspaceId, id);
      },
    );
  }

  async function update(
    context: AuthorizationContext,
    strategyId: string,
    value: StrategyUpdateInput,
    commandId: string,
  ): Promise<StrategyResponse> {
    const id = financialIdSchema.parse(strategyId).toLowerCase();
    const input = strategyUpdateSchema.parse(value);
    return executeStrategyCommand(
      platform,
      context,
      { commandId, kind: 'version-created', payload: { id, ...input } },
      async (tx) => {
        await lockIdentity(tx, context.workspaceId, id);
        const current = await readStrategy(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision)
          throw strategyConflict(
            'STALE_STRATEGY_REVISION',
            'The strategy changed. Reload its current revision before editing.',
          );
        if (current.archivedAt)
          throw strategyConflict(
            'STRATEGY_ARCHIVED',
            'An archived strategy cannot receive new versions.',
          );
        await validateDefinitionReferences(tx, context.workspaceId, input.definition);
        const versionId = randomUUID();
        await insertVersion(tx, context, {
          ...input,
          strategyId: id,
          versionId,
          version: current.currentVersion.version + 1,
        });
        await tx.execute(sql`UPDATE app.strategies SET current_version_id=${versionId},revision=revision+1,updated_at=clock_timestamp()
        WHERE workspace_id=${context.workspaceId} AND id=${id} AND revision=${input.expectedRevision}`);
        return readStrategy(tx, context.workspaceId, id);
      },
    );
  }

  async function archive(
    context: AuthorizationContext,
    strategyId: string,
    value: StrategyArchiveInput,
    commandId: string,
  ): Promise<StrategyResponse> {
    const id = financialIdSchema.parse(strategyId).toLowerCase();
    const input = strategyArchiveSchema.parse(value);
    return executeStrategyCommand(
      platform,
      context,
      { commandId, kind: 'archived', payload: { id, ...input } },
      async (tx) => {
        await lockIdentity(tx, context.workspaceId, id);
        const current = await readStrategy(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision)
          throw strategyConflict(
            'STALE_STRATEGY_REVISION',
            'The strategy changed. Reload its current revision before archiving.',
          );
        if (current.archivedAt)
          throw strategyConflict('STRATEGY_ARCHIVED', 'The strategy is already archived.');
        await tx.execute(sql`UPDATE app.strategies SET archived_at=clock_timestamp(),archive_reason=${input.reason},
        revision=revision+1,updated_at=clock_timestamp()
        WHERE workspace_id=${context.workspaceId} AND id=${id} AND revision=${input.expectedRevision}`);
        return readStrategy(tx, context.workspaceId, id);
      },
    );
  }

  async function linkTrade(
    context: AuthorizationContext,
    strategyId: string,
    value: StrategyTradeLinkCreateInput,
    commandId: string,
  ) {
    const id = financialIdSchema.parse(strategyId).toLowerCase();
    const input = strategyTradeLinkCreateSchema.parse(value);
    return executeStrategyCommand(
      platform,
      context,
      { commandId, kind: 'trade-linked', payload: { id, ...input } },
      async (tx) => {
        // Trade revisions share the existing financial catalog lock, without adding an economic revision.
        await tx.execute(
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId} FOR UPDATE`,
        );
        const actualStrategyId = await requireSelectableStrategyVersion(
          tx,
          context.workspaceId,
          input.versionId,
        );
        if (actualStrategyId !== id) throw inaccessible();
        const [trade] = await queryRows<{
          revision: number;
          archived_at: string | null;
          strategy_version_id: string | null;
        }>(
          tx,
          sql`SELECT t.revision,t.archived_at::text,l.strategy_version_id FROM app.trades t
          LEFT JOIN app.trade_strategy_links l ON l.workspace_id=t.workspace_id AND l.trade_id=t.id
          WHERE t.workspace_id=${context.workspaceId} AND t.id=${input.tradeId} FOR UPDATE OF t`,
        );
        if (!trade) throw inaccessible();
        if (trade.revision !== input.expectedTradeRevision)
          throw strategyConflict(
            'STALE_TRADE_REVISION',
            'The trade changed. Reload its current revision before linking.',
          );
        if (trade.archived_at)
          throw strategyConflict(
            'TRADE_ARCHIVED',
            'An archived trade cannot receive a new strategy link.',
          );
        if (trade.strategy_version_id)
          throw strategyConflict(
            'TRADE_STRATEGY_ALREADY_PINNED',
            'The trade already has an immutable strategy version.',
          );
        await insertTradeStrategyLink(tx, context, {
          tradeId: input.tradeId,
          strategyId: id,
          strategyVersionId: input.versionId,
          timing: 'retrospective',
          reason: input.reason,
        });
        await tx.execute(sql`UPDATE app.trades SET revision=revision+1
        WHERE workspace_id=${context.workspaceId} AND id=${input.tradeId} AND revision=${input.expectedTradeRevision}`);
        return readTrade(tx, context.workspaceId, input.tradeId);
      },
    );
  }

  const get = (context: AuthorizationContext, id: string) =>
    platform.withWorkspaceContext(
      context,
      (tx) => readStrategy(tx, context.workspaceId, financialIdSchema.parse(id).toLowerCase()),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

  const list = (
    context: AuthorizationContext,
    value: ListFilter = {},
  ): Promise<StrategyListResponse> => {
    const filter = listFilterSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT s.id FROM app.strategies s JOIN app.strategy_versions v
          ON v.workspace_id=s.workspace_id AND v.id=s.current_version_id
          WHERE s.workspace_id=${context.workspaceId}
          AND (${filter.includeArchived} OR s.archived_at IS NULL)
          AND (${filter.status ?? null}::text IS NULL OR v.definition->>'status'=${filter.status ?? null})
          AND (${filter.search ?? null}::text IS NULL OR strpos(lower(v.definition->>'name'),lower(${filter.search ?? null}))>0)
          AND (${filter.cursor ?? null}::uuid IS NULL OR s.id>${filter.cursor ?? null}::uuid)
          ORDER BY s.id LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit);
        const strategies = [];
        for (const row of page)
          strategies.push(await readStrategy(tx, context.workspaceId, row.id));
        return { strategies, nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };

  const versions = (
    context: AuthorizationContext,
    strategyId: string,
    value: PageFilter = {},
  ): Promise<StrategyVersionListResponse> => {
    const id = financialIdSchema.parse(strategyId).toLowerCase();
    const filter = pageFilterSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await readStrategy(tx, context.workspaceId, id);
        const cursorVersion = filter.cursor
          ? await readStrategyVersion(tx, context.workspaceId, filter.cursor)
          : null;
        if (cursorVersion && cursorVersion.strategyId !== id) throw inaccessible();
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.strategy_versions WHERE workspace_id=${context.workspaceId} AND strategy_id=${id}
          AND (${cursorVersion?.version ?? null}::integer IS NULL OR version<${cursorVersion?.version ?? null}::integer)
          ORDER BY version DESC LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit);
        const versions = [];
        for (const row of page)
          versions.push(await readStrategyVersion(tx, context.workspaceId, row.id));
        return { versions, nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };

  const getVersion = (context: AuthorizationContext, strategyId: string, versionId: string) =>
    platform.withWorkspaceContext(context, async (tx) => {
      const version = await readStrategyVersion(
        tx,
        context.workspaceId,
        financialIdSchema.parse(versionId).toLowerCase(),
      );
      if (version.strategyId !== financialIdSchema.parse(strategyId).toLowerCase())
        throw inaccessible();
      return version;
    });

  const linkedTrades = (
    context: AuthorizationContext,
    strategyId: string,
    value: PageFilter = {},
  ): Promise<StrategyTradesResponse> => {
    const id = financialIdSchema.parse(strategyId).toLowerCase();
    const filter = pageFilterSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await readStrategy(tx, context.workspaceId, id);
        const rows = await queryRows<{ trade_id: string }>(
          tx,
          sql`SELECT trade_id FROM app.trade_strategy_links WHERE workspace_id=${context.workspaceId} AND strategy_id=${id}
          AND (${filter.cursor ?? null}::uuid IS NULL OR trade_id>${filter.cursor ?? null}::uuid)
          ORDER BY trade_id LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit);
        const trades = [];
        for (const row of page) trades.push(await readTrade(tx, context.workspaceId, row.trade_id));
        return { trades, nextCursor: rows.length > filter.limit ? page.at(-1)!.trade_id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  };

  return { create, update, archive, get, list, versions, getVersion, linkedTrades, linkTrade };
}
