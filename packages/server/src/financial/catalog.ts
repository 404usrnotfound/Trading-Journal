import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import { decimal, decimalValue, multiplyDecimal, subtractDecimal } from '@journal/domain';
import { z } from 'zod';
import type { AuthorizationContext } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { executeFinancialCommand, queryRows, type FinancialPlatform } from './repository.js';
import { applyInventoryPolicyTransition } from './ledger.js';
import {
  insertTradeStrategyLink,
  requireSelectableStrategyVersion,
} from '../strategies/repository.js';
import {
  financialLabel,
  financialInstantMicros,
  financialPositiveDecimal,
  financialTimestamp,
  financialUuid,
  invalidFinancialReference,
  requireAccount,
  requireCurrency,
  requireInstrumentVersion,
  staleCatalogRevision,
  validateNativeInstrumentMetadata,
} from './reference-data.js';
import type {
  AccountDto,
  AccountSettingsInput,
  AddTradeLegInput,
  AmendOrderInput,
  ArchiveCatalogInput,
  BrokerDto,
  CreateAccountInput,
  CreateBrokerInput,
  CreateCurrencyInput,
  CreateInstrumentInput,
  CreateOrderInput,
  CreateTradeInput,
  CurrencyDto,
  CurrencyConventionInput,
  InstrumentDto,
  InstrumentVersionInput,
  InstrumentMetadataInput,
  OrderDto,
  QueryFilter,
  TradeDto,
  TradeLegDto,
  ConfirmTradeClosureInput,
  TradeClosureDto,
} from './catalog-types.js';

const revisionSchema = z.number().int().positive().max(2_147_483_647);
const metadataSchema = z
  .record(z.string().max(160), z.json())
  .refine(
    (value) => Buffer.byteLength(JSON.stringify(value)) <= 32_768,
    'Instrument metadata is too large',
  );
const settingsShape = {
  baseCurrencyId: financialUuid,
  inventoryMethod: z.enum(['fifo', 'specific', 'average']),
  allowShort: z.boolean(),
  holdingMode: z.enum(['netted', 'segregated']),
  effectiveAt: financialTimestamp,
};
const instrumentShape = {
  quantityUnit: financialLabel,
  quoteCurrencyId: financialUuid.nullable(),
  settlementCurrencyId: financialUuid.nullable(),
  multiplier: financialPositiveDecimal.nullable(),
  quantityIncrement: financialPositiveDecimal.nullable(),
  priceIncrement: financialPositiveDecimal.nullable(),
  capability: z.enum(['native-linear', 'manual']),
  effectiveAt: financialTimestamp,
  metadata: metadataSchema.optional(),
};
function requireKnownNativeMetadata(value: InstrumentMetadataInput, context: z.RefinementCtx) {
  if (value.capability !== 'native-linear') return;
  for (const field of [
    'quoteCurrencyId',
    'settlementCurrencyId',
    'multiplier',
    'quantityIncrement',
    'priceIncrement',
  ] as const)
    if (value[field] === null)
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'Native operations require a known validated economic convention.',
      });
}
export const createCurrencyInputSchema = z.strictObject({
  namespace: financialLabel,
  code: financialLabel,
  kind: z.enum(['fiat', 'digital', 'custom']),
  unitIdentity: financialLabel,
  name: financialLabel,
  displayScale: z.number().int().min(0).max(36),
  settlementIncrement: financialPositiveDecimal,
  effectiveAt: financialTimestamp,
});
export const createBrokerInputSchema = z.strictObject({
  name: financialLabel,
  sourceNamespace: financialLabel,
});
export const createAccountInputSchema = z.strictObject({
  name: financialLabel,
  brokerId: financialUuid.optional(),
  environment: z.enum(['live', 'paper']),
  accountType: z.enum(['cash', 'margin', 'other']),
  ...settingsShape,
});
export const accountSettingsInputSchema = z.strictObject({
  ...settingsShape,
  expectedRevision: revisionSchema,
  reason: financialLabel,
});
export const createInstrumentInputSchema = z
  .strictObject({
    name: financialLabel,
    family: financialLabel,
    subtype: financialLabel,
    economicIdentity: financialLabel,
    ...instrumentShape,
  })
  .superRefine(requireKnownNativeMetadata);
export const instrumentVersionInputSchema = z
  .strictObject({
    ...instrumentShape,
    expectedRevision: revisionSchema,
    reason: financialLabel,
  })
  .superRefine(requireKnownNativeMetadata);
export const orderInstructionSchema = z
  .strictObject({
    status: z.enum([
      'recorded',
      'working',
      'partially_filled',
      'filled',
      'canceled',
      'rejected',
      'expired',
    ]),
    quantity: financialPositiveDecimal,
    orderType: z.enum(['market', 'limit', 'stop', 'stop_limit']),
    limitPrice: financialPositiveDecimal.optional(),
    stopPrice: financialPositiveDecimal.optional(),
    timeInForce: financialLabel,
  })
  .superRefine((value, context) => {
    if ((value.orderType === 'limit' || value.orderType === 'stop_limit') && !value.limitPrice)
      context.addIssue({ code: 'custom', message: 'This instruction requires a limit price' });
    if ((value.orderType === 'stop' || value.orderType === 'stop_limit') && !value.stopPrice)
      context.addIssue({ code: 'custom', message: 'This instruction requires a stop price' });
  });
export const createOrderInputSchema = z
  .strictObject({
    accountId: financialUuid,
    kind: z.enum(['single', 'package']),
    sourceNamespace: financialLabel.optional(),
    sourceId: financialLabel.optional(),
    legs: z
      .array(
        z.strictObject({
          instrumentVersionId: financialUuid,
          side: z.enum(['buy', 'sell']),
          ratio: financialPositiveDecimal,
        }),
      )
      .min(1)
      .max(32),
    instruction: orderInstructionSchema,
    economicAt: financialTimestamp,
  })
  .superRefine((value, context) => {
    if (value.kind === 'single' && value.legs.length !== 1)
      context.addIssue({ code: 'custom', message: 'A single order requires exactly one leg' });
    if (Boolean(value.sourceNamespace) !== Boolean(value.sourceId))
      context.addIssue({
        code: 'custom',
        message: 'Source namespace and identity must be supplied together',
      });
    for (const leg of value.legs) {
      try {
        if (multiplyDecimal(value.instruction.quantity, leg.ratio) === '0')
          throw new Error('Quantity below the representable quantum');
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'Every intended leg quantity must be representable and positive',
        });
      }
    }
  });
export const amendOrderInputSchema = z.strictObject({
  expectedRevision: revisionSchema,
  instruction: orderInstructionSchema,
  economicAt: financialTimestamp,
  reason: financialLabel,
});
export const createTradeInputSchema = z.strictObject({
  title: financialLabel,
  classification: z.enum(['active-trading', 'investing']),
  strategyVersionId: financialUuid.optional(),
});
export const addTradeLegInputSchema = z.strictObject({
  tradeId: financialUuid,
  expectedRevision: revisionSchema,
  accountId: financialUuid,
  instrumentVersionId: financialUuid,
  direction: z.enum(['long', 'short']),
  label: financialLabel,
});
export const confirmTradeClosureInputSchema = z.strictObject({
  expectedRevision: revisionSchema,
  reason: financialLabel,
  obligationEvidence: z.string().trim().min(1).max(4_000),
});
const archiveInputSchema = z.strictObject({
  expectedRevision: revisionSchema,
  reason: financialLabel,
});
const queryFilterSchema = z.strictObject({
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

async function readCurrency(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<CurrencyDto> {
  const rows = await queryRows<{ data: CurrencyDto }>(
    tx,
    sql`SELECT jsonb_build_object(
      'id',c.id,'namespace',c.namespace,'code',c.code,'kind',c.kind,'unitIdentity',c.unit_identity,
      'name',c.name,'revision',c.revision,'archivedAt',c.archived_at,
      'conventionId',v.id,'version',v.version,'displayScale',v.display_scale,
      'settlementIncrement',v.settlement_increment_raw,
      'effectiveAt',to_char(v.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS data
    FROM app.currencies c JOIN LATERAL (SELECT * FROM app.currency_convention_versions
      WHERE workspace_id=c.workspace_id AND currency_id=c.id ORDER BY version DESC LIMIT 1) v ON true
    WHERE c.workspace_id=${workspaceId} AND c.id=${id}`,
  );
  if (!rows[0]) throw inaccessible();
  return rows[0].data;
}

async function readAccount(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<AccountDto> {
  const rows = await queryRows<{ data: AccountDto }>(
    tx,
    sql`SELECT jsonb_build_object(
      'id',a.id,'name',a.name,'brokerId',a.broker_id,'environment',a.environment,
      'accountType',a.account_type,'status',a.status,'revision',a.revision,'archivedAt',a.archived_at,
      'settingsId',v.id,'settingsVersion',v.version,'baseCurrencyId',v.base_currency_id,
      'inventoryMethod',v.inventory_method,'allowShort',v.allow_short,'holdingMode',v.holding_mode,
      'effectiveAt',to_char(v.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS data
    FROM app.accounts a JOIN LATERAL (SELECT * FROM app.account_settings_versions
      WHERE workspace_id=a.workspace_id AND account_id=a.id ORDER BY version DESC LIMIT 1) v ON true
    WHERE a.workspace_id=${workspaceId} AND a.id=${id}`,
  );
  if (!rows[0]) throw inaccessible();
  return rows[0].data;
}

async function readInstrument(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<InstrumentDto> {
  const rows = await queryRows<{ id: string; name: string; revision: number; version_id: string }>(
    tx,
    sql`SELECT i.id,i.name,i.revision,v.id AS version_id FROM app.instruments i
      JOIN LATERAL (SELECT id FROM app.instrument_versions WHERE workspace_id=i.workspace_id
        AND instrument_id=i.id ORDER BY version DESC LIMIT 1) v ON true
      WHERE i.workspace_id=${workspaceId} AND i.id=${id}`,
  );
  const row = rows[0];
  if (!row) throw inaccessible();
  const v = await requireInstrumentVersion(tx, workspaceId, row.version_id, false);
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    versionId: v.id,
    version: v.version,
    family: v.family,
    subtype: v.subtype,
    economicIdentity: v.economicIdentity,
    archivedAt: v.archivedAt,
    quantityUnit: v.quantityUnit,
    quoteCurrencyId: v.quoteCurrencyId,
    settlementCurrencyId: v.settlementCurrencyId,
    multiplier: v.multiplier,
    quantityIncrement: v.quantityIncrement,
    priceIncrement: v.priceIncrement,
    capability: v.capability,
    effectiveAt: v.effectiveAt,
    metadata: v.metadata ?? {},
  };
}

async function readOrder(tx: DbTransaction, workspaceId: string, id: string): Promise<OrderDto> {
  const rows = await queryRows<{ data: Omit<OrderDto, 'legs' | 'fillStatus' | 'discrepancies'> }>(
    tx,
    sql`SELECT jsonb_build_object(
      'id',o.id,'accountId',o.account_id,'kind',o.kind,'sourceNamespace',o.source_namespace,
      'sourceId',o.source_id,'revision',r.revision,'instruction',r.payload->'instruction',
      'economicAt',to_char(r.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS data
    FROM app.orders o JOIN LATERAL (SELECT * FROM app.order_revisions
      WHERE workspace_id=o.workspace_id AND order_id=o.id ORDER BY revision DESC LIMIT 1) r ON true
    WHERE o.workspace_id=${workspaceId} AND o.id=${id}`,
  );
  if (!rows[0]) throw inaccessible();
  const legs = await queryRows<{
    id: string;
    instrument_version_id: string;
    side: 'buy' | 'sell';
    ratio_raw: string;
    filled_quantity: string;
    execution_count: number;
    late_fill_count: number;
  }>(
    tx,
    sql`SELECT l.id,l.instrument_version_id,l.side,l.ratio_raw,
      COALESCE(f.filled_quantity,0)::text AS filled_quantity,
      COALESCE(f.execution_count,0)::integer AS execution_count,
      COALESCE(f.late_fill_count,0)::integer AS late_fill_count
    FROM app.order_legs l LEFT JOIN LATERAL (
      SELECT sum(e.quantity) AS filled_quantity,count(*) AS execution_count,
        count(*) FILTER (WHERE r.status IN ('canceled','rejected','expired')) AS late_fill_count
      FROM app.executions e LEFT JOIN LATERAL (
        SELECT status FROM app.order_revisions WHERE workspace_id=l.workspace_id AND order_id=l.order_id
          AND economic_at<=e.economic_at ORDER BY economic_at DESC,revision DESC LIMIT 1
      ) r ON true
      WHERE e.workspace_id=l.workspace_id AND e.order_leg_id=l.id
        AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions s
          WHERE s.workspace_id=e.workspace_id AND s.original_execution_id=e.id)
    ) f ON true
    WHERE l.workspace_id=${workspaceId} AND l.order_id=${id} ORDER BY l.id`,
  );
  const derived = legs.map((leg): OrderDto['legs'][number] => {
    const intendedQuantity = multiplyDecimal(rows[0]!.data.instruction.quantity, leg.ratio_raw);
    const filledQuantity = decimal(leg.filled_quantity);
    const difference = subtractDecimal(intendedQuantity, filledQuantity);
    return {
      id: leg.id,
      instrumentVersionId: leg.instrument_version_id,
      side: leg.side,
      ratio: leg.ratio_raw,
      intendedQuantity,
      filledQuantity,
      remainingQuantity: decimalValue(difference).gt('0') ? difference : '0',
      overfillQuantity: decimalValue(difference).lt('0')
        ? decimalValue(difference).neg().toFixed()
        : '0',
      executionCount: leg.execution_count,
      lateFillCount: leg.late_fill_count,
    };
  });
  const overfilled = derived.some((leg) => leg.overfillQuantity !== '0');
  const hasFills = derived.some((leg) => leg.executionCount > 0);
  const filled = derived.every((leg) => leg.remainingQuantity === '0');
  return {
    ...rows[0].data,
    legs: derived,
    fillStatus: overfilled
      ? 'overfilled'
      : filled
        ? 'filled'
        : hasFills
          ? 'partially_filled'
          : 'unfilled',
    discrepancies: [
      ...(overfilled ? (['source-overfill'] as const) : []),
      ...(derived.some((leg) => leg.lateFillCount > 0)
        ? (['fill-after-terminal-intent'] as const)
        : []),
    ],
  };
}

async function campaignClosureEligibility(tx: DbTransaction, workspaceId: string, tradeId: string) {
  const quantities = await queryRows<{ trade_leg_id: string; quantity: string; activity: number }>(
    tx,
    sql`
    SELECT l.id AS trade_leg_id,COALESCE(sum(CASE WHEN e.id IS NULL THEN 0 WHEN e.side='buy' THEN i.quantity ELSE -i.quantity END),0)::text AS quantity,
      count(e.id)::integer AS activity
    FROM app.trade_legs l LEFT JOIN app.allocation_items i ON i.workspace_id=l.workspace_id AND i.trade_leg_id=l.id
    LEFT JOIN app.allocation_sets s ON s.workspace_id=i.workspace_id AND s.id=i.allocation_set_id
    LEFT JOIN app.executions e ON e.workspace_id=s.workspace_id AND e.id=s.execution_id
      AND i.quantity>0
      AND NOT EXISTS (SELECT 1 FROM app.allocation_sets newer WHERE newer.workspace_id=s.workspace_id
        AND newer.execution_id=s.execution_id AND newer.version>s.version)
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions correction WHERE correction.workspace_id=e.workspace_id
        AND correction.original_execution_id=e.id)
    WHERE l.workspace_id=${workspaceId} AND l.trade_id=${tradeId}
    GROUP BY l.id ORDER BY l.id`,
  );
  const obligations = await queryRows<{
    execution_id: string;
    cash_bucket_id: string;
    amount: string;
  }>(
    tx,
    sql`
    WITH assigned AS (
      SELECT DISTINCT e.id FROM app.executions e
      JOIN LATERAL (SELECT id FROM app.allocation_sets WHERE workspace_id=e.workspace_id AND execution_id=e.id
        ORDER BY version DESC LIMIT 1) s ON true
      JOIN app.allocation_items i ON i.workspace_id=e.workspace_id AND i.allocation_set_id=s.id AND i.quantity>0
      JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
      WHERE e.workspace_id=${workspaceId} AND l.trade_id=${tradeId}
        AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions correction WHERE correction.workspace_id=e.workspace_id
          AND correction.original_execution_id=e.id)
    )
    SELECT a.id AS execution_id,p.cash_bucket_id,sum(p.amount)::text AS amount
    FROM assigned a JOIN app.ledger_events event ON event.workspace_id=${workspaceId}
    LEFT JOIN app.fees fee ON fee.workspace_id=event.workspace_id AND fee.id=event.fee_id
    JOIN app.postings p ON p.workspace_id=event.workspace_id AND p.ledger_event_id=event.id
    JOIN app.cash_buckets bucket ON bucket.workspace_id=p.workspace_id AND bucket.id=p.cash_bucket_id AND bucket.category='unsettled'
    WHERE event.execution_id=a.id OR fee.execution_id=a.id OR event.payload->>'executionId'=a.id::text
    GROUP BY a.id,p.cash_bucket_id HAVING sum(p.amount)<>0 ORDER BY a.id,p.cash_bucket_id`,
  );
  return {
    hasActivity: quantities.some((row) => row.activity > 0),
    quantities: quantities.map((row) => ({
      tradeLegId: row.trade_leg_id,
      quantity: decimal(row.quantity),
    })),
    obligations: obligations.map((row) => ({
      executionId: row.execution_id,
      cashBucketId: row.cash_bucket_id,
      amount: decimal(row.amount),
    })),
  };
}

/** Adapt pre-strategy responses without replacing immutable command history with current state. */
function normalizeTradeCommandResult(result: TradeDto): TradeDto {
  return {
    ...result,
    strategyId: result.strategyId ?? null,
    strategyVersionId: result.strategyVersionId ?? null,
    strategyLinkTiming: result.strategyLinkTiming ?? null,
  };
}

export async function readTrade(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<TradeDto> {
  const rows = await queryRows<{ data: Omit<TradeDto, 'closureReviewRequired'> }>(
    tx,
    sql`
    SELECT jsonb_build_object('id',t.id,'title',t.title,'classification',t.classification,'status',t.status,
      'revision',t.revision,'archivedAt',t.archived_at,'strategyId',l.strategy_id,
      'strategyVersionId',l.strategy_version_id,'strategyLinkTiming',l.timing) AS data
      FROM app.trades t LEFT JOIN app.trade_strategy_links l ON l.workspace_id=t.workspace_id AND l.trade_id=t.id
      WHERE t.workspace_id=${workspaceId} AND t.id=${id}`,
  );
  if (!rows[0]) throw inaccessible();
  if (rows[0].data.status !== 'closed') return { ...rows[0].data, closureReviewRequired: false };
  const eligibility = await campaignClosureEligibility(tx, workspaceId, id);
  return {
    ...rows[0].data,
    closureReviewRequired:
      !eligibility.hasActivity ||
      eligibility.obligations.length > 0 ||
      eligibility.quantities.some((leg) => leg.quantity !== '0'),
  };
}

/** Read a bounded page, including current closure evidence, in three business queries. */
export async function readTrades(
  tx: DbTransaction,
  workspaceId: string,
  ids: readonly string[],
): Promise<TradeDto[]> {
  if (!ids.length) return [];
  const rows = await queryRows<{ data: Omit<TradeDto, 'closureReviewRequired'> }>(
    tx,
    sql`SELECT jsonb_build_object('id',t.id,'title',t.title,'classification',t.classification,'status',t.status,
      'revision',t.revision,'archivedAt',t.archived_at,'strategyId',l.strategy_id,
      'strategyVersionId',l.strategy_version_id,'strategyLinkTiming',l.timing) AS data
      FROM app.trades t LEFT JOIN app.trade_strategy_links l ON l.workspace_id=t.workspace_id AND l.trade_id=t.id
      WHERE t.workspace_id=${workspaceId} AND t.id=ANY(ARRAY[${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}])`,
  );
  const byId = new Map(rows.map(({ data }) => [data.id, data]));
  if (ids.some((id) => !byId.has(id))) throw inaccessible();
  const closedIds = rows.filter(({ data }) => data.status === 'closed').map(({ data }) => data.id);
  const needsReview = new Set<string>();
  if (closedIds.length) {
    const quantities = await queryRows<{
      trade_id: string;
      quantity: string;
      activity: number;
    }>(
      tx,
      sql`SELECT l.trade_id,
        COALESCE(sum(CASE WHEN e.id IS NULL THEN 0 WHEN e.side='buy' THEN i.quantity ELSE -i.quantity END),0)::text AS quantity,
        count(e.id)::integer AS activity
      FROM app.trade_legs l LEFT JOIN app.allocation_items i ON i.workspace_id=l.workspace_id AND i.trade_leg_id=l.id
      LEFT JOIN app.allocation_sets s ON s.workspace_id=i.workspace_id AND s.id=i.allocation_set_id
      LEFT JOIN app.executions e ON e.workspace_id=s.workspace_id AND e.id=s.execution_id
        AND i.quantity>0
        AND NOT EXISTS (SELECT 1 FROM app.allocation_sets newer WHERE newer.workspace_id=s.workspace_id
          AND newer.execution_id=s.execution_id AND newer.version>s.version)
        AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions correction WHERE correction.workspace_id=e.workspace_id
          AND correction.original_execution_id=e.id)
      WHERE l.workspace_id=${workspaceId} AND l.trade_id=ANY(ARRAY[${sql.join(
        closedIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}])
      GROUP BY l.trade_id,l.id`,
    );
    const active = new Set(quantities.filter((row) => row.activity > 0).map((row) => row.trade_id));
    for (const id of closedIds) if (!active.has(id)) needsReview.add(id);
    for (const row of quantities) if (decimal(row.quantity) !== '0') needsReview.add(row.trade_id);
    const obligations = await queryRows<{ trade_id: string }>(
      tx,
      sql`WITH assigned AS (
        SELECT DISTINCT l.trade_id,e.id FROM app.executions e
        JOIN LATERAL (SELECT id FROM app.allocation_sets WHERE workspace_id=e.workspace_id AND execution_id=e.id
          ORDER BY version DESC LIMIT 1) s ON true
        JOIN app.allocation_items i ON i.workspace_id=e.workspace_id AND i.allocation_set_id=s.id AND i.quantity>0
        JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
        WHERE e.workspace_id=${workspaceId} AND l.trade_id=ANY(ARRAY[${sql.join(
          closedIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}])
          AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions correction WHERE correction.workspace_id=e.workspace_id
            AND correction.original_execution_id=e.id)
      )
      SELECT a.trade_id FROM assigned a JOIN app.ledger_events event ON event.workspace_id=${workspaceId}
      LEFT JOIN app.fees fee ON fee.workspace_id=event.workspace_id AND fee.id=event.fee_id
      JOIN app.postings p ON p.workspace_id=event.workspace_id AND p.ledger_event_id=event.id
      JOIN app.cash_buckets bucket ON bucket.workspace_id=p.workspace_id AND bucket.id=p.cash_bucket_id AND bucket.category='unsettled'
      WHERE event.execution_id=a.id OR fee.execution_id=a.id OR event.payload->>'executionId'=a.id::text
      GROUP BY a.trade_id,a.id,p.cash_bucket_id HAVING sum(p.amount)<>0`,
    );
    for (const row of obligations) needsReview.add(row.trade_id);
  }
  return ids.map((id) => ({ ...byId.get(id)!, closureReviewRequired: needsReview.has(id) }));
}

async function insertSettings(
  tx: DbTransaction,
  context: AuthorizationContext,
  accountId: string,
  version: number,
  input: Pick<
    CreateAccountInput,
    'baseCurrencyId' | 'inventoryMethod' | 'allowShort' | 'holdingMode' | 'effectiveAt'
  >,
  reason?: string,
): Promise<void> {
  await tx.execute(sql`INSERT INTO app.account_settings_versions
    (workspace_id,id,account_id,version,base_currency_id,inventory_method,allow_short,holding_mode,effective_at,payload,actor_id)
    VALUES (${context.workspaceId},${randomUUID()},${accountId},${version},${input.baseCurrencyId},
      ${input.inventoryMethod},${input.allowShort},${input.holdingMode},${input.effectiveAt}::timestamptz,
      ${JSON.stringify({ sourceEffectiveAt: input.effectiveAt, ...(reason ? { reason } : {}) })}::jsonb,${context.actorId})`);
}

async function insertInstrumentVersion(
  tx: DbTransaction,
  context: AuthorizationContext,
  instrumentId: string,
  version: number,
  input: CreateInstrumentInput | InstrumentVersionInput,
): Promise<void> {
  await tx.execute(sql`INSERT INTO app.instrument_versions
    (workspace_id,id,instrument_id,version,quantity_unit,quote_currency_id,settlement_currency_id,
      multiplier_raw,quantity_increment_raw,price_increment_raw,capability,payload,effective_at,actor_id)
    VALUES (${context.workspaceId},${randomUUID()},${instrumentId},${version},${input.quantityUnit},
      ${input.quoteCurrencyId},${input.settlementCurrencyId},${input.multiplier},${input.quantityIncrement},
      ${input.priceIncrement},${input.capability},${JSON.stringify({
        ...input.metadata,
        sourceEffectiveAt: input.effectiveAt,
        ...('reason' in input ? { versionReason: input.reason } : {}),
      })}::jsonb,
      ${input.effectiveAt}::timestamptz,${context.actorId})`);
}

/** Tenant-scoped catalog commands share the ledger's atomic idempotency/revision boundary. */
export function createCatalogServices(platform: FinancialPlatform) {
  async function createCurrency(
    context: AuthorizationContext,
    value: CreateCurrencyInput,
    commandId: string,
  ): Promise<CurrencyDto> {
    const input = createCurrencyInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'currency.created', payload: input },
      async (tx) => {
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.currencies (workspace_id,id,namespace,code,kind,unit_identity,name,actor_id)
        VALUES (${context.workspaceId},${id},${input.namespace},${input.code},${input.kind},${input.unitIdentity},${input.name},${context.actorId})`);
        await tx.execute(sql`INSERT INTO app.currency_convention_versions
        (workspace_id,id,currency_id,version,display_scale,settlement_increment_raw,rounding,effective_at,payload,actor_id)
        VALUES (${context.workspaceId},${randomUUID()},${id},1,${input.displayScale},${input.settlementIncrement},'HALF_EVEN',
          ${input.effectiveAt}::timestamptz,${JSON.stringify({ sourceEffectiveAt: input.effectiveAt })}::jsonb,${context.actorId})`);
        return readCurrency(tx, context.workspaceId, id);
      },
    );
  }

  async function createBroker(
    context: AuthorizationContext,
    value: CreateBrokerInput,
    commandId: string,
  ): Promise<BrokerDto> {
    const input = createBrokerInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'broker.created', payload: input },
      async (tx) => {
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.brokers (workspace_id,id,name,source_namespace,actor_id)
        VALUES (${context.workspaceId},${id},${input.name},${input.sourceNamespace},${context.actorId})`);
        return { ...input, id, revision: 1, archivedAt: null };
      },
    );
  }

  async function appendCurrencyConvention(
    context: AuthorizationContext,
    currencyId: string,
    value: CurrencyConventionInput,
    commandId: string,
  ): Promise<CurrencyDto> {
    const id = financialUuid.parse(currencyId);
    const input = z
      .strictObject({
        displayScale: z.number().int().min(0).max(36),
        settlementIncrement: financialPositiveDecimal,
        effectiveAt: financialTimestamp,
        expectedRevision: revisionSchema,
        reason: financialLabel,
      })
      .parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'currency.convention-versioned', payload: { id, ...input } },
      async (tx) => {
        const current = await readCurrency(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision) throw staleCatalogRevision();
        if (current.archivedAt)
          throw invalidFinancialReference('An archived currency cannot receive new conventions.');
        if (
          financialInstantMicros(input.effectiveAt) <= financialInstantMicros(current.effectiveAt)
        )
          throw invalidFinancialReference(
            'A convention must start after the previous effective instant.',
          );
        await tx.execute(sql`INSERT INTO app.currency_convention_versions
        (workspace_id,id,currency_id,version,display_scale,settlement_increment_raw,rounding,effective_at,payload,actor_id)
        VALUES (${context.workspaceId},${randomUUID()},${id},${current.version + 1},${input.displayScale},${input.settlementIncrement},'HALF_EVEN',
          ${input.effectiveAt}::timestamptz,${JSON.stringify({ sourceEffectiveAt: input.effectiveAt, reason: input.reason })}::jsonb,${context.actorId})`);
        await tx.execute(
          sql`UPDATE app.currencies SET revision=revision+1 WHERE workspace_id=${context.workspaceId} AND id=${id} AND revision=${input.expectedRevision}`,
        );
        return readCurrency(tx, context.workspaceId, id);
      },
    );
  }

  async function createAccount(
    context: AuthorizationContext,
    value: CreateAccountInput,
    commandId: string,
  ): Promise<AccountDto> {
    const input = createAccountInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'account.created', payload: input },
      async (tx) => {
        await requireCurrency(tx, context.workspaceId, input.baseCurrencyId);
        if (input.brokerId) {
          const broker = await queryRows<{ archived_at: string | null }>(
            tx,
            sql`SELECT archived_at::text FROM app.brokers WHERE workspace_id=${context.workspaceId} AND id=${input.brokerId}`,
          );
          if (!broker[0]) throw inaccessible();
          if (broker[0].archived_at !== null)
            throw invalidFinancialReference('An archived broker cannot be selected.');
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.accounts (workspace_id,id,broker_id,name,environment,account_type,status,actor_id)
        VALUES (${context.workspaceId},${id},${input.brokerId ?? null},${input.name},${input.environment},${input.accountType},'active',${context.actorId})`);
        await insertSettings(tx, context, id, 1, input);
        return readAccount(tx, context.workspaceId, id);
      },
    );
  }

  async function appendAccountSettings(
    context: AuthorizationContext,
    accountId: string,
    value: AccountSettingsInput,
    commandId: string,
  ): Promise<AccountDto> {
    const id = financialUuid.parse(accountId);
    const input = accountSettingsInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'account.settings-versioned', payload: { id, ...input } },
      async (tx, state) => {
        const current = await readAccount(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision) throw staleCatalogRevision();
        if (current.archivedAt)
          throw invalidFinancialReference('An archived account cannot receive new settings.');
        await requireCurrency(tx, context.workspaceId, input.baseCurrencyId);
        if (
          financialInstantMicros(input.effectiveAt) <= financialInstantMicros(current.effectiveAt)
        )
          throw invalidFinancialReference(
            'A settings version must start after the previous effective instant.',
          );
        if (
          current.inventoryMethod !== input.inventoryMethod ||
          current.holdingMode !== input.holdingMode
        ) {
          const activity = await queryRows<{ present: boolean }>(
            tx,
            sql`SELECT EXISTS(
          SELECT 1 FROM app.executions WHERE workspace_id=${context.workspaceId} AND account_id=${id}
          UNION ALL SELECT 1 FROM app.opening_lots WHERE workspace_id=${context.workspaceId} AND account_id=${id}
          UNION ALL SELECT 1 FROM app.holding_transfers WHERE workspace_id=${context.workspaceId}
            AND (source_account_id=${id} OR destination_account_id=${id})
          UNION ALL SELECT 1 FROM app.inventory_events WHERE workspace_id=${context.workspaceId} AND account_id=${id}) AS present`,
          );
          if (
            activity[0]?.present &&
            current.inventoryMethod === 'fifo' &&
            input.inventoryMethod === 'average' &&
            current.holdingMode === input.holdingMode &&
            input.holdingMode === 'netted'
          ) {
            const chronology = await queryRows<{ latest_at: string | null }>(
              tx,
              sql`SELECT
              to_char(max(economic_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS latest_at
              FROM (SELECT economic_at FROM app.executions WHERE workspace_id=${context.workspaceId} AND account_id=${id}
                UNION ALL SELECT economic_at FROM app.opening_lots WHERE workspace_id=${context.workspaceId} AND account_id=${id}
                UNION ALL SELECT economic_at FROM app.inventory_events WHERE workspace_id=${context.workspaceId} AND account_id=${id}
                UNION ALL SELECT economic_at FROM app.holding_transfers WHERE workspace_id=${context.workspaceId}
                  AND (source_account_id=${id} OR destination_account_id=${id})) facts`,
            );
            if (
              chronology[0]?.latest_at &&
              financialInstantMicros(input.effectiveAt) <=
                financialInstantMicros(chronology[0].latest_at)
            )
              throw invalidFinancialReference(
                'A prospective inventory transition must follow all accepted inventory activity.',
              );
            await applyInventoryPolicyTransition(tx, context, state, {
              accountId: id,
              economicAt: input.effectiveAt,
              toPolicy: 'average',
              reason: input.reason,
            });
          } else if (activity[0]?.present)
            throw new ApplicationError(
              409,
              'POLICY_TRANSITION_REQUIRED',
              'Explicit policy transition required',
              'Existing inventory history requires a reviewed transition before changing its matching or holding-book policy.',
            );
        }
        await tx.execute(sql`UPDATE app.accounts SET revision=revision+1 WHERE workspace_id=${context.workspaceId}
        AND id=${id} AND revision=${input.expectedRevision}`);
        await insertSettings(tx, context, id, current.settingsVersion + 1, input, input.reason);
        return readAccount(tx, context.workspaceId, id);
      },
    );
  }

  async function createInstrument(
    context: AuthorizationContext,
    value: CreateInstrumentInput,
    commandId: string,
  ): Promise<InstrumentDto> {
    const input = createInstrumentInputSchema.parse(value);
    validateNativeInstrumentMetadata(input.family, input.subtype, input);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'instrument.created', payload: input },
      async (tx) => {
        if (input.quoteCurrencyId !== null)
          await requireCurrency(tx, context.workspaceId, input.quoteCurrencyId);
        if (input.settlementCurrencyId !== null)
          await requireCurrency(tx, context.workspaceId, input.settlementCurrencyId);
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.instruments (workspace_id,id,name,family,subtype,economic_identity,actor_id)
        VALUES (${context.workspaceId},${id},${input.name},${input.family},${input.subtype},${input.economicIdentity},${context.actorId})`);
        await insertInstrumentVersion(tx, context, id, 1, input);
        return readInstrument(tx, context.workspaceId, id);
      },
    );
  }

  async function appendInstrumentVersion(
    context: AuthorizationContext,
    instrumentId: string,
    value: InstrumentVersionInput,
    commandId: string,
  ): Promise<InstrumentDto> {
    const id = financialUuid.parse(instrumentId);
    const input = instrumentVersionInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'instrument.versioned', payload: { id, ...input } },
      async (tx) => {
        const current = await readInstrument(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision) throw staleCatalogRevision();
        if (current.archivedAt)
          throw invalidFinancialReference('An archived instrument cannot receive new versions.');
        validateNativeInstrumentMetadata(current.family, current.subtype, input);
        if (input.quoteCurrencyId !== null)
          await requireCurrency(tx, context.workspaceId, input.quoteCurrencyId);
        if (input.settlementCurrencyId !== null)
          await requireCurrency(tx, context.workspaceId, input.settlementCurrencyId);
        if (
          financialInstantMicros(input.effectiveAt) <= financialInstantMicros(current.effectiveAt)
        )
          throw invalidFinancialReference(
            'An instrument version must start after the previous effective instant.',
          );
        if (
          current.quantityUnit !== input.quantityUnit ||
          (current.multiplier !== null && current.multiplier !== input.multiplier) ||
          (current.quoteCurrencyId !== null && current.quoteCurrencyId !== input.quoteCurrencyId) ||
          (current.settlementCurrencyId !== null &&
            current.settlementCurrencyId !== input.settlementCurrencyId)
        )
          throw new ApplicationError(
            409,
            'UNIT_TRANSFORMATION_REQUIRED',
            'Explicit unit transformation required',
            'Unit, multiplier or monetary-unit changes require a separately reviewed transformation or a new instrument identity.',
          );
        if (current.capability !== input.capability) {
          const used = await queryRows<{ present: boolean }>(
            tx,
            sql`SELECT EXISTS (
            SELECT 1 FROM app.executions WHERE workspace_id=${context.workspaceId} AND instrument_version_id IN
              (SELECT id FROM app.instrument_versions WHERE workspace_id=${context.workspaceId} AND instrument_id=${id})
            UNION ALL SELECT 1 FROM app.opening_lots WHERE workspace_id=${context.workspaceId} AND instrument_version_id IN
              (SELECT id FROM app.instrument_versions WHERE workspace_id=${context.workspaceId} AND instrument_id=${id})
          ) AS present`,
          );
          if (used[0]?.present)
            throw new ApplicationError(
              409,
              'CAPABILITY_TRANSFORMATION_REQUIRED',
              'Explicit capability transformation required',
              'Existing source history cannot be reinterpreted by changing its automatic financial convention.',
            );
        }
        await tx.execute(sql`UPDATE app.instruments SET revision=revision+1 WHERE workspace_id=${context.workspaceId}
        AND id=${id} AND revision=${input.expectedRevision}`);
        await insertInstrumentVersion(tx, context, id, current.version + 1, input);
        return readInstrument(tx, context.workspaceId, id);
      },
    );
  }

  async function createOrder(
    context: AuthorizationContext,
    value: CreateOrderInput,
    commandId: string,
  ): Promise<OrderDto> {
    const input = createOrderInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'order.created', payload: input },
      async (tx) => {
        await requireAccount(tx, context.workspaceId, input.accountId, true, input.economicAt);
        for (const leg of input.legs) {
          const instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            leg.instrumentVersionId,
          );
          if (
            financialInstantMicros(input.economicAt) <
            financialInstantMicros(instrument.effectiveAt)
          )
            throw invalidFinancialReference(
              'The selected instrument convention is not effective at the instruction instant.',
            );
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.orders (workspace_id,id,account_id,kind,source_namespace,source_id,actor_id)
        VALUES (${context.workspaceId},${id},${input.accountId},${input.kind},${input.sourceNamespace ?? null},${input.sourceId ?? null},${context.actorId})`);
        for (const leg of input.legs)
          await tx.execute(sql`INSERT INTO app.order_legs (workspace_id,id,order_id,instrument_version_id,side,ratio_raw,actor_id)
          VALUES (${context.workspaceId},${randomUUID()},${id},${leg.instrumentVersionId},${leg.side},${leg.ratio},${context.actorId})`);
        await tx.execute(sql`INSERT INTO app.order_revisions (workspace_id,id,order_id,revision,status,payload,economic_at,actor_id)
        VALUES (${context.workspaceId},${randomUUID()},${id},1,${input.instruction.status},
          ${JSON.stringify({ instruction: input.instruction, sourceEconomicAt: input.economicAt })}::jsonb,${input.economicAt}::timestamptz,${context.actorId})`);
        return readOrder(tx, context.workspaceId, id);
      },
    );
  }

  async function amendOrder(
    context: AuthorizationContext,
    orderId: string,
    value: AmendOrderInput,
    commandId: string,
  ): Promise<OrderDto> {
    const id = financialUuid.parse(orderId);
    const input = amendOrderInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'order.revised', payload: { id, ...input } },
      async (tx) => {
        const current = await readOrder(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision) throw staleCatalogRevision();
        if (financialInstantMicros(input.economicAt) < financialInstantMicros(current.economicAt))
          throw invalidFinancialReference(
            'A new instruction revision cannot precede its current economic status evidence.',
          );
        for (const leg of current.legs) {
          try {
            if (multiplyDecimal(input.instruction.quantity, leg.ratio) === '0')
              throw new Error('Quantity below storage quantum');
          } catch {
            throw invalidFinancialReference(
              'Every amended leg quantity must be representable and positive.',
            );
          }
        }
        // This is intent/status evidence. Fills and holdings are never changed by an amendment.
        await tx.execute(sql`INSERT INTO app.order_revisions (workspace_id,id,order_id,revision,status,payload,economic_at,actor_id)
        VALUES (${context.workspaceId},${randomUUID()},${id},${current.revision + 1},${input.instruction.status},
          ${JSON.stringify({ instruction: input.instruction, reason: input.reason, sourceEconomicAt: input.economicAt })}::jsonb,
          ${input.economicAt}::timestamptz,${context.actorId})`);
        return readOrder(tx, context.workspaceId, id);
      },
    );
  }

  async function createTrade(
    context: AuthorizationContext,
    value: CreateTradeInput,
    commandId: string,
  ): Promise<TradeDto> {
    const input = createTradeInputSchema.parse(value);
    const result = await executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'trade.created', payload: input },
      async (tx) => {
        const strategyId = input.strategyVersionId
          ? await requireSelectableStrategyVersion(tx, context.workspaceId, input.strategyVersionId)
          : null;
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.trades (workspace_id,id,title,classification,status,revision,actor_id)
        VALUES (${context.workspaceId},${id},${input.title},${input.classification},'planned',1,${context.actorId})`);
        if (strategyId && input.strategyVersionId)
          await insertTradeStrategyLink(tx, context, {
            tradeId: id,
            strategyId,
            strategyVersionId: input.strategyVersionId,
            timing: 'recorded-with-trade',
            reason: 'Strategy version recorded when this trade was created.',
          });
        return readTrade(tx, context.workspaceId, id);
      },
    );
    return normalizeTradeCommandResult(result);
  }

  async function addTradeLeg(
    context: AuthorizationContext,
    value: AddTradeLegInput,
    commandId: string,
  ): Promise<TradeLegDto> {
    const input = addTradeLegInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'trade.leg-added', payload: input },
      async (tx) => {
        const rows = await queryRows<{
          revision: number;
          status: string;
          archived_at: string | null;
        }>(
          tx,
          sql`SELECT revision,status,archived_at::text FROM app.trades WHERE workspace_id=${context.workspaceId} AND id=${input.tradeId}`,
        );
        if (!rows[0]) throw inaccessible();
        if (rows[0].revision !== input.expectedRevision) throw staleCatalogRevision();
        if (rows[0].archived_at || ['closed', 'canceled'].includes(rows[0].status))
          throw invalidFinancialReference(
            'A completed or archived campaign cannot receive new legs.',
          );
        await requireAccount(tx, context.workspaceId, input.accountId);
        await requireInstrumentVersion(tx, context.workspaceId, input.instrumentVersionId);
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.trade_legs
        (workspace_id,id,trade_id,account_id,instrument_version_id,direction,label,actor_id)
        VALUES (${context.workspaceId},${id},${input.tradeId},${input.accountId},${input.instrumentVersionId},${input.direction},${input.label},${context.actorId})`);
        await tx.execute(
          sql`UPDATE app.trades SET revision=revision+1 WHERE workspace_id=${context.workspaceId} AND id=${input.tradeId}`,
        );
        return {
          id,
          tradeId: input.tradeId,
          accountId: input.accountId,
          instrumentVersionId: input.instrumentVersionId,
          direction: input.direction,
          label: input.label,
        };
      },
    );
  }

  async function cancelTrade(
    context: AuthorizationContext,
    tradeId: string,
    value: ArchiveCatalogInput,
    commandId: string,
  ): Promise<TradeDto> {
    const id = financialUuid.parse(tradeId);
    const input = archiveInputSchema.parse(value);
    const result = await executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'trade.canceled', payload: { tradeId: id, ...input } },
      async (tx) => {
        const current = await readTrade(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision) throw staleCatalogRevision();
        if (current.archivedAt || current.status !== 'planned')
          throw invalidFinancialReference(
            'Only an active planned campaign without actual assigned activity can be canceled.',
          );
        const eligibility = await campaignClosureEligibility(tx, context.workspaceId, id);
        if (eligibility.hasActivity)
          throw invalidFinancialReference(
            'Actual assigned executions require the closure workflow.',
          );
        await tx.execute(sql`UPDATE app.trades SET status='canceled',revision=revision+1
          WHERE workspace_id=${context.workspaceId} AND id=${id} AND revision=${input.expectedRevision}`);
        return readTrade(tx, context.workspaceId, id);
      },
    );
    return normalizeTradeCommandResult(result);
  }

  async function confirmTradeClosure(
    context: AuthorizationContext,
    tradeId: string,
    value: ConfirmTradeClosureInput,
    commandId: string,
  ): Promise<TradeClosureDto> {
    const id = financialUuid.parse(tradeId);
    const input = confirmTradeClosureInputSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'trade.closure-confirmed', payload: { tradeId: id, ...input } },
      async (tx, state) => {
        const current = await readTrade(tx, context.workspaceId, id);
        if (current.revision !== input.expectedRevision) throw staleCatalogRevision();
        if (current.archivedAt || current.status === 'closed' || current.status === 'canceled')
          throw invalidFinancialReference(
            'An archived or completed campaign cannot receive another closure episode.',
          );
        const eligibility = await campaignClosureEligibility(tx, context.workspaceId, id);
        if (!eligibility.hasActivity)
          throw new ApplicationError(
            409,
            'CAMPAIGN_HAS_NO_ACTIVITY',
            'Campaign cannot close',
            'A planned campaign without effective assigned activity may be canceled, not classified as a completed trade.',
          );
        if (eligibility.quantities.some((leg) => leg.quantity !== '0'))
          throw new ApplicationError(
            409,
            'CAMPAIGN_HAS_OPEN_EXPOSURE',
            'Campaign cannot close',
            'Every assigned campaign leg must have exactly zero remaining quantity before closure.',
          );
        if (eligibility.obligations.length > 0)
          throw new ApplicationError(
            409,
            'CAMPAIGN_HAS_UNSETTLED_OBLIGATIONS',
            'Campaign cannot close',
            'Assigned executions still have actual unresolved cash settlement obligations.',
          );
        const closureId = randomUUID();
        const definitionVersion = 'campaign-closure/1' as const;
        await tx.execute(sql`INSERT INTO app.trade_closures
          (workspace_id,id,trade_id,command_id,source_revision,definition_version,confirmed_at,payload,actor_id)
          VALUES (${context.workspaceId},${closureId},${id},${state.eventId},${state.revision}::integer,
            ${definitionVersion},${state.recordedAt}::timestamptz,
            ${JSON.stringify({
              reason: input.reason,
              obligationEvidence: input.obligationEvidence,
              assignedQuantities: eligibility.quantities,
              actorId: context.actorId,
              tradeRevision: current.revision + 1,
            })}::jsonb,${context.actorId})`);
        await tx.execute(sql`UPDATE app.trades SET status='closed',revision=revision+1
          WHERE workspace_id=${context.workspaceId} AND id=${id} AND revision=${input.expectedRevision}`);
        return {
          id: closureId,
          tradeId: id,
          sourceRevision: state.revision,
          revision: current.revision + 1,
          confirmedAt: state.recordedAt,
          definitionVersion,
          status: 'closed',
        };
      },
    );
  }

  async function archiveCatalog(
    context: AuthorizationContext,
    entity: 'currency' | 'broker' | 'account' | 'instrument' | 'trade',
    entityId: string,
    value: ArchiveCatalogInput,
    commandId: string,
  ) {
    const id = financialUuid.parse(entityId);
    const input = archiveInputSchema.parse(value);
    const table = {
      currency: 'currencies',
      broker: 'brokers',
      account: 'accounts',
      instrument: 'instruments',
      trade: 'trades',
    }[entity];
    if (!table) throw invalidFinancialReference('Unknown catalog entity.');
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: `${entity}.archived`, payload: { id, ...input } },
      async (tx) => {
        const rows = await queryRows<{ revision: number; archived_at: string | null }>(
          tx,
          sql`SELECT revision,archived_at::text FROM ${sql.identifier('app')}.${sql.identifier(table)} WHERE workspace_id=${context.workspaceId} AND id=${id}`,
        );
        if (!rows[0]) throw inaccessible();
        if (rows[0].revision !== input.expectedRevision) throw staleCatalogRevision();
        if (rows[0].archived_at) throw invalidFinancialReference('The record is already archived.');
        const result = await queryRows<{ archived_at: string; revision: number }>(
          tx,
          sql`UPDATE ${sql.identifier('app')}.${sql.identifier(table)} SET archived_at=clock_timestamp(),revision=revision+1
          WHERE workspace_id=${context.workspaceId} AND id=${id} AND revision=${input.expectedRevision}
          RETURNING to_char(archived_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS archived_at,revision`,
        );
        return { id, revision: result[0]!.revision, archivedAt: result[0]!.archived_at };
      },
    );
  }

  async function listIds(
    tx: DbTransaction,
    workspaceId: string,
    table: string,
    filter: QueryFilter,
  ): Promise<string[]> {
    const rows = await queryRows<{ id: string }>(
      tx,
      sql`SELECT id FROM ${sql.identifier('app')}.${sql.identifier(table)}
      WHERE workspace_id=${workspaceId} AND (${filter.includeArchived ?? false} OR archived_at IS NULL)
      ORDER BY created_at,id LIMIT ${filter.limit ?? 100}`,
    );
    return rows.map((row) => row.id);
  }

  return {
    createCurrency,
    appendCurrencyConvention,
    createBroker,
    createAccount,
    appendAccountSettings,
    createInstrument,
    appendInstrumentVersion,
    createOrder,
    amendOrder,
    createTrade,
    addTradeLeg,
    cancelTrade,
    confirmTradeClosure,
    archiveCatalog,
    getCurrency: (context: AuthorizationContext, id: string) =>
      platform.withWorkspaceContext(context, (tx) =>
        readCurrency(tx, context.workspaceId, financialUuid.parse(id)),
      ),
    getAccount: (context: AuthorizationContext, id: string) =>
      platform.withWorkspaceContext(context, (tx) =>
        readAccount(tx, context.workspaceId, financialUuid.parse(id)),
      ),
    getInstrument: (context: AuthorizationContext, id: string) =>
      platform.withWorkspaceContext(context, (tx) =>
        readInstrument(tx, context.workspaceId, financialUuid.parse(id)),
      ),
    getOrder: (context: AuthorizationContext, id: string) =>
      platform.withWorkspaceContext(context, (tx) =>
        readOrder(tx, context.workspaceId, financialUuid.parse(id)),
      ),
    getTrade: (context: AuthorizationContext, id: string) =>
      platform.withWorkspaceContext(context, (tx) =>
        readTrade(tx, context.workspaceId, financialUuid.parse(id)),
      ),
    listOrders: (context: AuthorizationContext, limit = 100) =>
      platform.withWorkspaceContext(context, async (tx) => {
        const count = z.number().int().min(1).max(200).parse(limit);
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.orders WHERE workspace_id=${context.workspaceId} ORDER BY created_at,id LIMIT ${count}`,
        );
        const result = [];
        for (const row of rows) result.push(await readOrder(tx, context.workspaceId, row.id));
        return result;
      }),
    listTradeLegs: (context: AuthorizationContext, tradeId: string) =>
      platform.withWorkspaceContext(context, async (tx) => {
        const id = financialUuid.parse(tradeId);
        const exists = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.trades WHERE workspace_id=${context.workspaceId} AND id=${id}`,
        );
        if (!exists[0]) throw inaccessible();
        return (
          await queryRows<{ data: TradeLegDto }>(
            tx,
            sql`SELECT jsonb_build_object('id',id,'tradeId',trade_id,
        'accountId',account_id,'instrumentVersionId',instrument_version_id,'direction',direction,'label',label) AS data
        FROM app.trade_legs WHERE workspace_id=${context.workspaceId} AND trade_id=${id} ORDER BY created_at,id`,
          )
        ).map((row) => row.data);
      }),
    listCurrencies: (context: AuthorizationContext, filter: QueryFilter = {}) =>
      platform.withWorkspaceContext(context, async (tx) => {
        const ids = await listIds(
          tx,
          context.workspaceId,
          'currencies',
          queryFilterSchema.parse(filter),
        );
        const result = [];
        for (const id of ids) result.push(await readCurrency(tx, context.workspaceId, id));
        return result;
      }),
    listAccounts: (
      context: AuthorizationContext,
      filter: QueryFilter & { environment?: 'live' | 'paper' } = {},
    ) =>
      platform.withWorkspaceContext(context, async (tx) => {
        const { environment, ...rest } = z
          .strictObject({
            includeArchived: z.boolean().optional(),
            limit: z.number().int().min(1).max(200).optional(),
            environment: z.enum(['live', 'paper']).optional(),
          })
          .parse(filter);
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.accounts WHERE workspace_id=${context.workspaceId}
        AND (${rest.includeArchived ?? false} OR archived_at IS NULL)
        AND (${environment ?? null}::text IS NULL OR environment=${environment ?? null})
        ORDER BY created_at,id LIMIT ${rest.limit ?? 100}`,
        );
        const result = [];
        for (const row of rows) result.push(await readAccount(tx, context.workspaceId, row.id));
        return result;
      }),
    listInstruments: (context: AuthorizationContext, filter: QueryFilter = {}) =>
      platform.withWorkspaceContext(context, async (tx) => {
        const ids = await listIds(
          tx,
          context.workspaceId,
          'instruments',
          queryFilterSchema.parse(filter),
        );
        const result = [];
        for (const id of ids) result.push(await readInstrument(tx, context.workspaceId, id));
        return result;
      }),
    listBrokers: (context: AuthorizationContext, filter: QueryFilter = {}) =>
      platform.withWorkspaceContext(context, async (tx) => {
        const parsed = queryFilterSchema.parse(filter);
        return (
          await queryRows<{ data: BrokerDto }>(
            tx,
            sql`SELECT jsonb_build_object('id',id,'name',name,
        'sourceNamespace',source_namespace,'revision',revision,'archivedAt',archived_at) AS data
        FROM app.brokers WHERE workspace_id=${context.workspaceId} AND (${parsed.includeArchived ?? false} OR archived_at IS NULL)
        ORDER BY created_at,id LIMIT ${parsed.limit ?? 100}`,
          )
        ).map((row) => row.data);
      }),
    listTrades: (context: AuthorizationContext, filter: QueryFilter = {}) =>
      platform.withWorkspaceContext(context, async (tx) => {
        const parsed = queryFilterSchema.parse(filter);
        const ids = await listIds(tx, context.workspaceId, 'trades', parsed);
        const result = [];
        for (const id of ids) result.push(await readTrade(tx, context.workspaceId, id));
        return result;
      }),
  };
}
