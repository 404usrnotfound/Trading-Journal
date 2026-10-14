import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import {
  allocateDecimal,
  FINANCIAL_SCALE,
  decimal,
  decimalValue,
  divideDecimal,
  quantizeDecimal,
  prepareHoldingTransfer,
  replayCampaignInventory,
  reconcileCampaignInventory,
  replayInventory,
  valueInventory,
  INVENTORY_CALCULATION_MANIFEST,
  type InventoryReplayResult,
  type InventorySource,
  type InventoryValuationInput,
  type InventoryPolicy,
  type InventoryCostAttribution,
  type InventoryHoldingDeparture,
  type InventoryHoldingReceipt,
  type InventoryPolicyTransition,
  type InventoryCampaignAllocation,
} from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import type { AccountReference, InstrumentVersionReference } from './catalog-types.js';
import {
  requireAccount,
  requireCurrency,
  requireCurrencyConvention,
  requireInstrumentVersion,
  requireOrderLeg,
  assertNativeInstrumentMetadata,
  supportsNativeShortInventory,
  financialInstantMicros,
} from './reference-data.js';
import {
  assertEconomicInput,
  assertPositive,
  ensureCashBucket,
  financialUuid,
  postCashControl,
  postLedgerEvent,
  requireCashBucket,
} from './commands.js';
import {
  executeFinancialCommand,
  financialConflict,
  financialFingerprint,
  financialNoop,
  financialInvalid,
  queryRows,
  type CommandState,
  type FinancialPlatform,
} from './repository.js';
import type {
  AllocationInput,
  CampaignInventoryDto,
  HoldingTransferInput,
  FeeAttributionInput,
  BucketMovementInput,
  CashBalanceDto,
  CashMovementInput,
  CorrectExecutionInput,
  CreateCashBucketInput,
  ExecutionDto,
  ExecutionInput,
  FeeInput,
  FinancialMutationResult,
  FxConversionInput,
  OpeningLotInput,
  PositionDto,
  RecordFeeInput,
} from './ledger-types.js';

type ExecutionRow = {
  id: string;
  command_id: string;
  source_revision: number;
  account_id: string;
  instrument_version_id: string;
  side: 'buy' | 'sell';
  quantity_raw: string;
  price_raw: string | null;
  principal_raw: string | null;
  principal_currency_id: string | null;
  ordering_key: string;
  supersedes_id: string | null;
  payload: Omit<ExecutionInput, 'commandId'>;
};

/** Convert source offsets without discarding the final three fractional digits. */
function kernelInstant(instant: string): string {
  const micros = financialInstantMicros(instant);
  const seconds = micros / 1_000_000n;
  const fraction = micros % 1_000_000n;
  const wholeSeconds = fraction < 0n ? seconds - 1n : seconds;
  const positiveFraction = fraction < 0n ? fraction + 1_000_000n : fraction;
  return `${new Date(Number(wholeSeconds * 1_000n)).toISOString().slice(0, 19)}.${String(positiveFraction).padStart(6, '0')}Z`;
}

async function pinRate(
  tx: DbTransaction,
  workspaceId: string,
  input:
    | { observationId: string; rate: string; baseCurrencyId?: string; quoteCurrencyId?: string }
    | undefined,
  baseCurrencyId: string | null,
  economicAt: string,
  quoteCurrencyId?: string,
) {
  if (!input) return undefined;
  if (baseCurrencyId === null)
    throw financialInvalid('Historical FX requires a known native monetary unit.');
  financialUuid.parse(input.observationId);
  const [row] = await queryRows<{
    base_currency_id: string;
    quote_currency_id: string;
    rate_raw: string;
    eligible: boolean;
  }>(
    tx,
    sql`SELECT base_currency_id,quote_currency_id,rate_raw,observed_at<=${economicAt}::timestamptz AS eligible
      FROM app.fx_observations WHERE workspace_id=${workspaceId}::uuid AND id=${input.observationId}::uuid`,
  );
  if (
    !row ||
    !row.eligible ||
    row.base_currency_id !== baseCurrencyId ||
    (quoteCurrencyId !== undefined && row.quote_currency_id !== quoteCurrencyId) ||
    (input.baseCurrencyId !== undefined && input.baseCurrencyId !== row.base_currency_id) ||
    (input.quoteCurrencyId !== undefined && input.quoteCurrencyId !== row.quote_currency_id) ||
    !decimalValue(assertPositive(input.rate, 'Pinned FX rate')).eq(decimal(row.rate_raw))
  ) {
    throw financialInvalid(
      'Historical FX must reference a matching tenant observation in the direct pair, no later than the economic event.',
    );
  }
  return {
    observationId: input.observationId,
    rate: decimal(row.rate_raw),
    baseCurrencyId: row.base_currency_id,
    quoteCurrencyId: row.quote_currency_id,
  };
}

function economicPayload<Input extends { commandId: string }>(
  input: Input,
): Omit<Input, 'commandId'> {
  const { commandId: _, ...payload } = input;
  return payload;
}

function mutationResult(id: string, state: CommandState): FinancialMutationResult {
  return { id, commandId: state.eventId, sourceRevision: state.revision };
}

function executionDto(row: ExecutionRow): ExecutionDto {
  return {
    id: row.id,
    commandId: row.command_id,
    sourceRevision: String(row.source_revision),
    accountId: row.account_id,
    instrumentVersionId: row.instrument_version_id,
    side: row.side,
    quantity: decimal(row.quantity_raw),
    price: row.price_raw === null ? null : decimal(row.price_raw),
    bookedPrincipal: row.principal_raw === null ? null : decimal(row.principal_raw),
    principalCurrencyId: row.principal_currency_id,
    economicAt: kernelInstant(row.payload.economicAt),
    orderingKey: row.ordering_key,
    supersedesId: row.supersedes_id,
    payload: row.payload,
  };
}

async function getExecution(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<ExecutionRow> {
  financialUuid.parse(id);
  const [row] = await queryRows<ExecutionRow>(
    tx,
    sql`SELECT * FROM app.executions
    WHERE workspace_id=${workspaceId}::uuid AND id=${id}::uuid`,
  );
  if (!row) throw financialInvalid('The execution is unavailable in this workspace.');
  return row;
}

async function insertFee(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: FeeInput,
  accountId: string,
  economicAt: string,
  executionId?: string,
  nativeCurrencyId?: string | null,
): Promise<string> {
  const amount = decimal(input.amount);
  if (!input.kind.trim() || input.kind.length > 80)
    throw financialInvalid('A cost classification is required.');
  await requireCashBucket(tx, context.workspaceId, input.cashBucketId, accountId, input.currencyId);
  const id = randomUUID();
  const chargedAt = input.economicAt ?? economicAt;
  assertEconomicInput({ economicAt: chargedAt, orderingKey: '0' });
  if (input.nativeFx && nativeCurrencyId === null)
    throw financialInvalid(
      'A native cost translation requires a known instrument settlement unit.',
    );
  const nativeFx = await pinRate(
    tx,
    context.workspaceId,
    input.nativeFx,
    input.currencyId,
    chargedAt,
    nativeCurrencyId ?? undefined,
  );
  const reportingFx = await pinRate(
    tx,
    context.workspaceId,
    input.reportingFx,
    input.currencyId,
    chargedAt,
  );
  await tx.execute(sql`INSERT INTO app.fees
    (workspace_id,id,command_id,source_revision,account_id,execution_id,currency_id,amount_raw,kind,economic_at,payload)
    VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
      ${accountId}::uuid,${executionId ?? null}::uuid,${input.currencyId}::uuid,${amount},
      ${input.kind},${chargedAt}::timestamptz,${JSON.stringify({ ...input, economicAt: chargedAt, nativeFx, reportingFx, sourceInput: input })}::jsonb)`);
  await postCashControl(tx, context, state, {
    kind: 'fee',
    economicAt: chargedAt,
    currencyId: input.currencyId,
    cashBucketId: input.cashBucketId,
    amount: quantizeDecimal(decimalValue(amount).negated()),
    controlKey: `expense:${input.kind}`,
    effectKey: `fee:${id}`,
    payload: { feeId: id, ...(executionId ? { executionId } : {}) },
  });
  const attributionSetId = randomUUID();
  await tx.execute(sql`INSERT INTO app.cost_attribution_sets
    (workspace_id,id,command_id,source_revision,fee_id,axis,version,reason)
    VALUES (${context.workspaceId}::uuid,${attributionSetId}::uuid,${state.eventId}::uuid,
      ${state.revision}::integer,${id}::uuid,'campaign',1,'Initial unassigned cost')`);
  await tx.execute(sql`INSERT INTO app.cost_allocations
    (workspace_id,id,attribution_set_id,currency_id,amount_raw,payload)
    VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${attributionSetId}::uuid,
      ${input.currencyId}::uuid,${amount},'{"target":"unassigned"}'::jsonb)`);
  return id;
}

async function partitionCampaignCosts(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  executionId: string,
  allocationSetId: string,
) {
  const fees = await queryRows<{ id: string; currency_id: string; amount_raw: string }>(
    tx,
    sql`SELECT id,currency_id,amount_raw FROM app.fees WHERE workspace_id=${context.workspaceId}::uuid
      AND execution_id=${executionId}::uuid ORDER BY id`,
  );
  const items = await queryRows<{ id: string; trade_leg_id: string | null; quantity_raw: string }>(
    tx,
    sql`SELECT id,trade_leg_id,quantity_raw FROM app.allocation_items WHERE workspace_id=${context.workspaceId}::uuid
      AND allocation_set_id=${allocationSetId}::uuid ORDER BY id`,
  );
  for (const fee of fees) {
    const [previous] = await queryRows<{ version: number }>(
      tx,
      sql`SELECT version FROM app.cost_attribution_sets
      WHERE workspace_id=${context.workspaceId}::uuid AND fee_id=${fee.id}::uuid AND axis='campaign'
      ORDER BY version DESC LIMIT 1`,
    );
    const setId = randomUUID();
    const pieces = allocateDecimal(
      fee.amount_raw,
      items.map((item) => ({ id: item.trade_leg_id ?? 'unassigned', weight: item.quantity_raw })),
    );
    await tx.execute(sql`INSERT INTO app.cost_attribution_sets
      (workspace_id,id,command_id,source_revision,fee_id,axis,version,reason)
      VALUES (${context.workspaceId}::uuid,${setId}::uuid,${state.eventId}::uuid,${state.revision}::integer,
        ${fee.id}::uuid,'campaign',${(previous?.version ?? 0) + 1},'Conserved execution allocation')`);
    for (const item of items) {
      const amount = pieces.find(
        (piece) => piece.id === (item.trade_leg_id ?? 'unassigned'),
      )!.amount;
      await tx.execute(sql`INSERT INTO app.cost_allocations
        (workspace_id,id,attribution_set_id,trade_leg_id,currency_id,amount_raw,payload)
        VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${setId}::uuid,${item.trade_leg_id}::uuid,
          ${fee.currency_id}::uuid,${amount},${JSON.stringify({ target: item.trade_leg_id ? 'campaign' : 'unassigned', allocationItemId: item.id })}::jsonb)`);
    }
  }
}

async function initialAllocation(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  executionId: string,
  quantity: string,
) {
  const id = randomUUID();
  await tx.execute(sql`INSERT INTO app.allocation_sets
    (workspace_id,id,command_id,source_revision,execution_id,version,reason)
    VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
      ${executionId}::uuid,1,'Initial unassigned activity')`);
  await tx.execute(sql`INSERT INTO app.allocation_items
    (workspace_id,id,allocation_set_id,trade_leg_id,quantity_raw,payload)
    VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,NULL,${decimal(quantity)},'{}'::jsonb)`);
  await partitionCampaignCosts(tx, context, state, executionId, id);
}

type BookRow = {
  id: string;
  account_id: string;
  instrument_id: string;
  instrument_version_id: string;
  inventory_method: 'fifo' | 'average' | 'specific';
  source_revision: number;
  state: InventoryReplayResult;
};

async function rebuildBook(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  account: AccountReference,
  instrument: InstrumentVersionReference,
  options: { persist?: boolean; asOf?: string; orderingKey?: string; sourceRevision?: string } = {},
): Promise<InventoryReplayResult> {
  const [existing] = await queryRows<BookRow>(
    tx,
    sql`SELECT * FROM app.holding_books
    WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${account.id}::uuid
      AND instrument_id=${instrument.instrumentId}::uuid`,
  );
  const bookId = existing?.id ?? randomUUID();
  const policy = existing?.inventory_method ?? account.inventoryMethod;
  if (!existing && options.persist !== false) {
    await tx.execute(sql`INSERT INTO app.holding_books
      (workspace_id,id,account_id,instrument_id,instrument_version_id,inventory_method,source_revision,state)
      VALUES (${context.workspaceId}::uuid,${bookId}::uuid,${account.id}::uuid,${instrument.instrumentId}::uuid,
        ${instrument.id}::uuid,${policy},${state.revision}::integer,'{}'::jsonb)`);
  }
  const rows = await queryRows<
    ExecutionRow & {
      multiplier_raw: string | null;
      capability: string;
      instrument_metadata: InstrumentVersionReference['metadata'];
    }
  >(
    tx,
    sql`SELECT e.*,v.multiplier_raw,v.capability,v.payload AS instrument_metadata FROM app.executions e
      JOIN app.instrument_versions v ON v.workspace_id=e.workspace_id AND v.id=e.instrument_version_id
      WHERE e.workspace_id=${context.workspaceId}::uuid AND e.account_id=${account.id}::uuid
        AND v.instrument_id=${instrument.instrumentId}::uuid
        AND e.source_revision<=${options.sourceRevision ?? state.revision}::integer
        AND (${options.asOf ?? null}::timestamptz IS NULL OR e.economic_at<=${options.asOf ?? null}::timestamptz)
        AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions s
          WHERE s.workspace_id=e.workspace_id AND s.original_execution_id=e.id
            AND s.source_revision<=${options.sourceRevision ?? state.revision}::integer)`,
  );
  const openings = await queryRows<{
    id: string;
    source_revision: number;
    direction: 'long' | 'short';
    quantity_raw: string;
    price_raw: string | null;
    principal_raw: string | null;
    ordering_key: string;
    payload: Omit<OpeningLotInput, 'commandId'>;
    multiplier_raw: string | null;
    instrument_metadata: InstrumentVersionReference['metadata'];
  }>(
    tx,
    sql`SELECT o.*,v.multiplier_raw,v.payload AS instrument_metadata FROM app.opening_lots o
    JOIN app.instrument_versions v ON v.workspace_id=o.workspace_id AND v.id=o.instrument_version_id
    WHERE o.workspace_id=${context.workspaceId}::uuid AND o.account_id=${account.id}::uuid
      AND v.instrument_id=${instrument.instrumentId}::uuid
      AND o.source_revision<=${options.sourceRevision ?? state.revision}::integer
      AND (${options.asOf ?? null}::timestamptz IS NULL OR o.economic_at<=${options.asOf ?? null}::timestamptz)`,
  );
  const fees = await queryRows<{
    id: string;
    execution_id: string | null;
    currency_id: string;
    amount_raw: string;
    payload: FeeInput & { economicAt: string };
  }>(
    tx,
    sql`SELECT f.* FROM app.fees f WHERE f.workspace_id=${context.workspaceId}::uuid
    AND f.account_id=${account.id}::uuid AND f.source_revision<=${options.sourceRevision ?? state.revision}::integer
    AND (${options.asOf ?? null}::timestamptz IS NULL OR f.economic_at<=${options.asOf ?? null}::timestamptz)
    AND f.execution_id IN
      (SELECT e.id FROM app.executions e JOIN app.instrument_versions v
        ON v.workspace_id=e.workspace_id AND v.id=e.instrument_version_id
        WHERE e.workspace_id=${context.workspaceId}::uuid AND v.instrument_id=${instrument.instrumentId}::uuid)`,
  );
  const transfers = await queryRows<{
    id: string;
    source_account_id: string;
    destination_account_id: string;
    payload: { departure: InventoryHoldingDeparture; receipt: InventoryHoldingReceipt };
  }>(
    tx,
    sql`SELECT t.* FROM app.holding_transfers t JOIN app.instrument_versions v
      ON v.workspace_id=t.workspace_id AND v.id=t.instrument_version_id
      WHERE t.workspace_id=${context.workspaceId}::uuid AND v.instrument_id=${instrument.instrumentId}::uuid
        AND (t.source_account_id=${account.id}::uuid OR t.destination_account_id=${account.id}::uuid)
        AND t.source_revision<=${options.sourceRevision ?? state.revision}::integer
        AND (${options.asOf ?? null}::timestamptz IS NULL OR t.economic_at<=${options.asOf ?? null}::timestamptz)`,
  );
  const additional = await queryRows<{ payload: InventorySource }>(
    tx,
    sql`SELECT e.payload FROM app.inventory_events e JOIN app.instrument_versions v
      ON v.workspace_id=e.workspace_id AND v.id=e.instrument_version_id
      WHERE e.workspace_id=${context.workspaceId}::uuid AND e.account_id=${account.id}::uuid
        AND v.instrument_id=${instrument.instrumentId}::uuid
        AND e.source_revision<=${options.sourceRevision ?? state.revision}::integer
        AND (${options.asOf ?? null}::timestamptz IS NULL OR e.economic_at<=${options.asOf ?? null}::timestamptz)
        AND (e.kind<>'cost-attribution' OR NOT EXISTS (SELECT 1 FROM app.inventory_events newer
          WHERE newer.workspace_id=e.workspace_id AND newer.kind='cost-attribution'
            AND newer.payload->'cost'->>'id'=e.payload->'cost'->>'id'
            AND newer.source_revision>e.source_revision AND newer.source_revision<=${options.sourceRevision ?? state.revision}::integer
            AND (${options.asOf ?? null}::timestamptz IS NULL OR newer.economic_at<=${options.asOf ?? null}::timestamptz)))`,
  );
  const sources: InventorySource[] = [
    ...additional.map((row) => row.payload),
    ...transfers.map((row) =>
      row.source_account_id === account.id ? row.payload.departure : row.payload.receipt,
    ),
    ...openings.map((opening): InventorySource => ({
      kind: 'opening',
      id: opening.id,
      effectId: opening.id,
      sourceRevision: String(opening.source_revision),
      economicOrder: {
        instant: kernelInstant(opening.payload.economicAt),
        sequence: opening.ordering_key,
      },
      direction: opening.direction,
      quantity: opening.quantity_raw,
      multiplier: opening.multiplier_raw,
      entryPrice: opening.price_raw,
      bookedPrincipal: opening.principal_raw,
      costs: [],
      costsComplete: opening.payload.costsComplete ?? false,
      ...(opening.payload.basisReportingFx
        ? { basisReportingFx: opening.payload.basisReportingFx }
        : {}),
    })),
    ...rows.map((execution): InventorySource => ({
      kind: 'fill',
      id: execution.id,
      effectId: execution.id,
      sourceRevision: String(execution.source_revision),
      economicOrder: {
        instant: kernelInstant(execution.payload.economicAt),
        sequence: execution.ordering_key,
      },
      side: execution.side,
      quantity: execution.quantity_raw,
      price: execution.price_raw,
      multiplier: execution.multiplier_raw,
      bookedPrincipal: execution.principal_raw,
      costs: fees
        .filter((fee) => fee.execution_id === execution.id)
        .map((fee) => ({
          id: fee.id,
          currencyId: fee.currency_id,
          amount: fee.amount_raw,
          chargedAt: kernelInstant(fee.payload.economicAt),
          ...(fee.payload.nativeFx ? { nativeFx: fee.payload.nativeFx } : {}),
          ...(fee.payload.reportingFx ? { reportingFx: fee.payload.reportingFx } : {}),
        })),
      costsComplete: execution.payload.costsComplete ?? false,
      closeOnly: execution.payload.closeOnly ?? false,
      ...(execution.payload.specificLots ? { specificLots: execution.payload.specificLots } : {}),
      ...(execution.payload.basisReportingFx
        ? { basisReportingFx: execution.payload.basisReportingFx }
        : {}),
    })),
  ];
  const native =
    instrument.capability === 'native-linear' &&
    account.holdingMode === 'netted' &&
    rows.every((row) => row.capability === 'native-linear');
  const inventory = replayInventory({
    scope: {
      workspaceId: context.workspaceId,
      accountId: account.id,
      instrumentId: instrument.instrumentId,
      instrumentVersionId: instrument.id,
      unitVersionId: instrument.quantityUnit,
      settlementCurrencyId: instrument.settlementCurrencyId,
    },
    manifest: { ...INVENTORY_CALCULATION_MANIFEST, lotPolicyVersion: `${policy}-v1` },
    policy,
    capability: {
      subtype: instrument.subtype,
      nativeInventory: native,
      // Every accepted source keeps its version's declared short economics. A later
      // catalog tag cannot retrospectively enable an unreviewed historical short.
      shortSupported:
        supportsNativeShortInventory(instrument.family, instrument.metadata) &&
        rows.every((row) =>
          supportsNativeShortInventory(instrument.family, row.instrument_metadata),
        ) &&
        openings.every((row) =>
          supportsNativeShortInventory(instrument.family, row.instrument_metadata),
        ),
      averageCostSupported: native,
    },
    sources:
      options.asOf && options.orderingKey !== undefined
        ? sources.filter((source) => {
            if (source.economicOrder.instant === null) return true;
            const compared =
              financialInstantMicros(source.economicOrder.instant) -
              financialInstantMicros(options.asOf!);
            return (
              compared < 0n ||
              (compared === 0n &&
                (source.economicOrder.sequence === null ||
                  BigInt(source.economicOrder.sequence) <= BigInt(options.orderingKey!)))
            );
          })
        : sources,
    sourceRevision: state.revision,
  });
  if (options.persist === false) return inventory;
  // Projections are replaced while the source lock is held; facts remain immutable.
  await tx.execute(
    sql`DELETE FROM app.lot_matches WHERE workspace_id=${context.workspaceId}::uuid AND holding_book_id=${bookId}::uuid`,
  );
  await tx.execute(sql`UPDATE app.lots SET remaining_quantity_raw='0',source_revision=${state.revision}::integer,
    state=jsonb_set(state,'{remainingQuantity}','"0"'::jsonb)
    WHERE workspace_id=${context.workspaceId}::uuid AND holding_book_id=${bookId}::uuid`);
  const openingIds = new Set(openings.map((opening) => opening.id));
  for (const lot of inventory.lots) {
    await tx.execute(sql`INSERT INTO app.lots
      (workspace_id,id,holding_book_id,execution_id,opening_lot_id,holding_transfer_id,direction,remaining_quantity_raw,source_revision,state)
      VALUES (${context.workspaceId}::uuid,${lot.id}::uuid,${bookId}::uuid,
        ${lot.transferId || openingIds.has(lot.sourceId) ? null : lot.sourceId}::uuid,${openingIds.has(lot.sourceId) ? lot.sourceId : null}::uuid,
        ${lot.transferId ?? null}::uuid,
        ${lot.direction},${lot.remainingQuantity},${state.revision}::integer,${JSON.stringify(lot)}::jsonb)
      ON CONFLICT (workspace_id,id) DO UPDATE SET direction=EXCLUDED.direction,
        remaining_quantity_raw=EXCLUDED.remaining_quantity_raw,source_revision=EXCLUDED.source_revision,state=EXCLUDED.state`);
  }
  for (const match of inventory.matches) {
    await tx.execute(sql`INSERT INTO app.lot_matches
      (workspace_id,id,holding_book_id,opening_lot_id,closing_execution_id,quantity_raw,source_revision,payload)
      VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${bookId}::uuid,${match.lotId}::uuid,
        ${match.closingSourceId}::uuid,${match.quantity},${state.revision}::integer,${JSON.stringify(match)}::jsonb)`);
  }
  await tx.execute(sql`UPDATE app.holding_books SET state=${JSON.stringify(inventory)}::jsonb,
    source_revision=${state.revision}::integer WHERE workspace_id=${context.workspaceId}::uuid AND id=${bookId}::uuid`);
  await tx.execute(sql`INSERT INTO app.positions
    (workspace_id,id,holding_book_id,quantity_raw,basis_raw,source_revision,state)
    VALUES (${context.workspaceId}::uuid,${bookId}::uuid,${bookId}::uuid,${inventory.openQuantity.value},
      ${inventory.grossBasis.value},${state.revision}::integer,${JSON.stringify(inventory)}::jsonb)
    ON CONFLICT (workspace_id,holding_book_id) DO UPDATE SET
      quantity_raw=EXCLUDED.quantity_raw,basis_raw=EXCLUDED.basis_raw,
      source_revision=EXCLUDED.source_revision,state=EXCLUDED.state`);
  return inventory;
}

/** The caller pins a revision under financial_state FOR SHARE before loading facts. */
export async function replayBookAt(
  tx: DbTransaction,
  context: AuthorizationContext,
  book: { accountId: string; instrumentVersionId: string },
  asOf: string,
  sourceRevision: string,
): Promise<InventoryReplayResult> {
  assertEconomicInput({ economicAt: asOf, orderingKey: '0' });
  const account = await requireAccount(tx, context.workspaceId, book.accountId, false, asOf);
  const instrument = await requireInstrumentVersion(
    tx,
    context.workspaceId,
    book.instrumentVersionId,
    false,
  );
  return rebuildBook(
    tx,
    context,
    { revision: sourceRevision, eventId: '', recordedAt: asOf },
    account,
    instrument,
    { persist: false, asOf, sourceRevision },
  );
}

export async function applyInventoryPolicyTransition(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: { accountId: string; economicAt: string; toPolicy: InventoryPolicy; reason: string },
): Promise<void> {
  if (input.toPolicy !== 'average' || !input.reason.trim())
    throw financialInvalid(
      'Only reviewed prospective FIFO to eligible average transitions are supported.',
    );
  const account = await requireAccount(
    tx,
    context.workspaceId,
    input.accountId,
    false,
    input.economicAt,
  );
  const books = await queryRows<BookRow>(
    tx,
    sql`SELECT * FROM app.holding_books
    WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${input.accountId}::uuid ORDER BY id`,
  );
  for (const book of books) {
    const instrument = await requireInstrumentVersion(
      tx,
      context.workspaceId,
      book.instrument_version_id,
      false,
    );
    if (instrument.capability !== 'native-linear' || account.holdingMode !== 'netted')
      throw financialInvalid('Every existing book must support eligible average inventory.');
    const current = await rebuildBook(tx, context, state, account, instrument, {
      persist: false,
      asOf: input.economicAt,
    });
    if (current.policy !== 'fifo' || current.status !== 'available')
      throw financialConflict(
        'POLICY_TRANSITION_REVIEW_REQUIRED',
        'A complete FIFO snapshot is required.',
      );
    const [sameInstant] = await queryRows<{ id: string }>(
      tx,
      sql`SELECT id FROM app.executions
      WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${account.id}::uuid AND economic_at=${input.economicAt}::timestamptz LIMIT 1`,
    );
    if (sameInstant)
      throw financialInvalid(
        'A transition boundary must follow existing economic facts unambiguously.',
      );
    const id = randomUUID();
    const transition: InventoryPolicyTransition = {
      kind: 'policy-transition',
      id,
      effectId: id,
      sourceRevision: state.revision,
      economicOrder: { instant: kernelInstant(input.economicAt), sequence: '1' },
      fromPolicy: 'fifo',
      toPolicy: 'average',
      fromPolicyVersion: current.policyVersion,
      toPolicyVersion: `average-v1:${id}`,
      reviewed: true,
      contributions: current.lots
        .filter((lot) => !decimalValue(lot.remainingQuantity).isZero())
        .map((lot) => ({
          lotId: lot.id,
          quantity: lot.remainingQuantity,
          bookedPrincipal: lot.remainingPrincipal,
          quoteNotional: lot.remainingQuoteNotional,
          costs: lot.costs.map((cost) => ({
            costId: cost.id,
            currencyId: cost.currencyId,
            amount: cost.amount,
          })),
          ...(lot.basisReportingFx ? { basisReportingFx: lot.basisReportingFx } : {}),
        })),
    };
    await tx.execute(sql`INSERT INTO app.inventory_events
      (workspace_id,id,command_id,source_revision,account_id,instrument_version_id,economic_at,ordering_key,kind,payload)
      VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
        ${account.id}::uuid,${instrument.id}::uuid,${input.economicAt}::timestamptz,'1','policy-transition',${JSON.stringify(transition)}::jsonb)`);
    await rebuildBook(tx, context, state, account, instrument);
  }
}

/** All populations are analytical partitions. Only account inventory represents owned assets. */
export async function campaignInventoryAt(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: {
    accountId?: string;
    instrumentId?: string;
    tradeId?: string;
    valuation?: InventoryValuationInput;
  },
  sourceRevision: string,
) {
  const books = await queryRows<BookRow>(
    tx,
    sql`SELECT * FROM app.holding_books
    WHERE workspace_id=${context.workspaceId}::uuid
      AND (${input.accountId ?? null}::uuid IS NULL OR account_id=${input.accountId ?? null}::uuid)
      AND (${input.instrumentId ?? null}::uuid IS NULL OR instrument_id=${input.instrumentId ?? null}::uuid)
    ORDER BY account_id,instrument_id LIMIT 500`,
  );
  const populations: CampaignInventoryDto[] = [];
  const bridges: ReturnType<typeof reconcileCampaignInventory>[] = [];
  for (const book of books) {
    const account = await requireAccount(tx, context.workspaceId, book.account_id, false);
    const instrument = await requireInstrumentVersion(
      tx,
      context.workspaceId,
      book.instrument_version_id,
      false,
    );
    const accountInventory = await rebuildBook(
      tx,
      context,
      { revision: sourceRevision, eventId: '', recordedAt: '' },
      account,
      instrument,
      { persist: false },
    );
    const rows = await queryRows<
      ExecutionRow & {
        allocation_id: string;
        trade_leg_id: string | null;
        allocated_quantity: string;
        allocated_principal: string | null;
        trade_id: string | null;
        direction: 'long' | 'short' | null;
      }
    >(
      tx,
      sql`SELECT e.*,i.id AS allocation_id,i.trade_leg_id,i.quantity_raw AS allocated_quantity,
        i.payload->>'principal' AS allocated_principal,l.trade_id,l.direction
        FROM app.executions e JOIN app.instrument_versions v ON v.workspace_id=e.workspace_id AND v.id=e.instrument_version_id
        JOIN LATERAL (SELECT id FROM app.allocation_sets WHERE workspace_id=e.workspace_id AND execution_id=e.id
          AND source_revision<=${sourceRevision}::integer ORDER BY version DESC LIMIT 1) s ON true
        JOIN app.allocation_items i ON i.workspace_id=e.workspace_id AND i.allocation_set_id=s.id
        LEFT JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
        WHERE e.workspace_id=${context.workspaceId}::uuid AND e.account_id=${account.id}::uuid
          AND v.instrument_id=${instrument.instrumentId}::uuid AND e.source_revision<=${sourceRevision}::integer
          AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions x WHERE x.workspace_id=e.workspace_id
            AND x.original_execution_id=e.id AND x.source_revision<=${sourceRevision}::integer)
        ORDER BY e.economic_at,e.ordering_key::numeric,e.id,i.id`,
    );
    const costRows = await queryRows<{
      execution_id: string;
      id: string;
      currency_id: string;
      amount_raw: string;
      trade_leg_id: string | null;
      payload: FeeInput & { economicAt: string };
    }>(
      tx,
      sql`SELECT f.execution_id,f.id,f.currency_id,c.amount_raw,c.trade_leg_id,f.payload FROM app.fees f
        JOIN LATERAL (SELECT id FROM app.cost_attribution_sets WHERE workspace_id=f.workspace_id AND fee_id=f.id
          AND axis='campaign' AND source_revision<=${sourceRevision}::integer ORDER BY version DESC LIMIT 1) s ON true
        JOIN app.cost_allocations c ON c.workspace_id=f.workspace_id AND c.attribution_set_id=s.id
        WHERE f.workspace_id=${context.workspaceId}::uuid AND f.account_id=${account.id}::uuid AND f.source_revision<=${sourceRevision}::integer`,
    );
    const groups = new Map<
      string | null,
      {
        tradeId: string | null;
        allocations: InventoryCampaignAllocation[];
        sources: InventorySource[];
      }
    >();
    for (const row of rows) {
      if (decimalValue(row.allocated_quantity).isZero()) continue;
      const related = rows.filter((candidate) => candidate.id === row.id);
      const principal =
        row.allocated_principal ??
        (row.principal_raw === null
          ? null
          : allocateDecimal(
              row.principal_raw,
              related.map((candidate) => ({
                id: candidate.trade_leg_id ?? 'unassigned',
                weight: candidate.allocated_quantity,
              })),
            ).find((piece) => piece.id === (row.trade_leg_id ?? 'unassigned'))!.amount);
      const costs = costRows
        .filter((cost) => cost.execution_id === row.id && cost.trade_leg_id === row.trade_leg_id)
        .map((cost) => ({
          id: cost.id,
          currencyId: cost.currency_id,
          amount: decimal(cost.amount_raw),
          chargedAt: kernelInstant(cost.payload.economicAt),
          ...(cost.payload.nativeFx ? { nativeFx: cost.payload.nativeFx } : {}),
          ...(cost.payload.reportingFx ? { reportingFx: cost.payload.reportingFx } : {}),
        }));
      let group = groups.get(row.trade_leg_id);
      if (!group) {
        group = { tradeId: row.trade_id, allocations: [], sources: [] };
        groups.set(row.trade_leg_id, group);
      }
      const direction = row.direction ?? (row.side === 'buy' ? 'long' : 'short');
      const role = row.direction
        ? (row.direction === 'long') === (row.side === 'buy')
          ? 'open'
          : 'close'
        : 'open';
      const allocation: InventoryCampaignAllocation = {
        id: row.allocation_id,
        legId: row.trade_leg_id,
        direction,
        role,
        quantity: row.allocated_quantity,
        sourceId: row.id,
        effectId: row.id,
        sourceRevision: String(row.source_revision),
        economicOrder: {
          instant: kernelInstant(row.payload.economicAt),
          sequence: row.ordering_key,
        },
        multiplier: instrument.multiplier,
        price: row.price_raw,
        bookedPrincipal: principal,
        costs,
        costsComplete: row.payload.costsComplete ?? false,
        ...(row.payload.basisReportingFx ? { basisReportingFx: row.payload.basisReportingFx } : {}),
      };
      group.allocations.push(allocation);
      group.sources.push({
        kind: 'fill',
        id: row.allocation_id,
        effectId: row.id,
        sourceRevision: String(row.source_revision),
        economicOrder: allocation.economicOrder,
        side: row.side,
        quantity: row.allocated_quantity,
        price: row.price_raw,
        multiplier: instrument.multiplier,
        bookedPrincipal: principal,
        costs,
        costsComplete: allocation.costsComplete,
        closeOnly: row.payload.closeOnly ?? false,
        ...(allocation.basisReportingFx ? { basisReportingFx: allocation.basisReportingFx } : {}),
      });
    }
    const replayed: InventoryReplayResult[] = [];
    for (const [legId, group] of groups) {
      const replayInput = {
        scope: accountInventory.scope,
        manifest: accountInventory.manifest,
        capability: {
          subtype: instrument.subtype,
          nativeInventory:
            instrument.capability === 'native-linear' && account.holdingMode === 'netted',
          // Share campaign claims are analytical attribution, not another broker
          // borrowing position. Spot-crypto short wrappers remain unsupported.
          shortSupported: instrument.family !== 'crypto_spot',
          averageCostSupported: true,
        },
        sourceRevision,
      };
      const inventory =
        legId === null
          ? {
              ...replayInventory({ ...replayInput, policy: 'fifo', sources: group.sources }),
              population: 'campaign-attribution' as const,
            }
          : replayCampaignInventory({ ...replayInput, allocations: group.allocations });
      replayed.push(inventory);
      if (!input.tradeId || input.tradeId === group.tradeId)
        populations.push({
          tradeLegId: legId,
          accountId: account.id,
          instrumentId: instrument.instrumentId,
          inventory,
          ...(input.valuation ? { valuation: valueInventory(inventory, input.valuation) } : {}),
        });
    }
    bridges.push(reconcileCampaignInventory(accountInventory, replayed));
  }
  return { populations, bridges, sourceRevision };
}

async function insertExecution(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: Omit<ExecutionInput, 'commandId'>,
  supersedesId?: string,
): Promise<ExecutionDto> {
  assertEconomicInput(input);
  assertPositive(input.quantity, 'Quantity');
  const account = await requireAccount(
    tx,
    context.workspaceId,
    input.accountId,
    false,
    input.economicAt,
  );
  const instrument = await requireInstrumentVersion(
    tx,
    context.workspaceId,
    input.instrumentVersionId,
    false,
  );
  if (input.price !== null && decimalValue(input.price).isNegative())
    throw financialInvalid('A price cannot be negative.');
  if (input.orderLegId) {
    const leg = await requireOrderLeg(tx, context.workspaceId, input.orderLegId);
    if (
      leg.accountId !== input.accountId ||
      leg.instrumentVersionId !== input.instrumentVersionId ||
      leg.side !== input.side
    ) {
      throw financialInvalid(
        'Execution account, instrument version and side must match the referenced order leg.',
      );
    }
  }
  let principal: string | null = input.bookedPrincipal ?? null;
  let currencyId: string | null = input.principalCurrencyId ?? null;
  const native = instrument.capability === 'native-linear' && account.holdingMode === 'netted';
  let booking: Record<string, unknown> = {};
  if (native) {
    assertNativeInstrumentMetadata(instrument.family, instrument.subtype, instrument);
    if (input.price === null)
      throw financialInvalid('A native fill requires its actual positive quote price.');
    if (
      !decimalValue(input.quantity).mod(decimalValue(instrument.quantityIncrement)).isZero() ||
      !decimalValue(input.price).mod(decimalValue(instrument.priceIncrement)).isZero()
    )
      throw financialInvalid(
        'Native fill quantity and quote must respect the pinned instrument increments.',
      );
    assertPositive(input.price, 'Native price');
    const convention = await requireCurrencyConvention(
      tx,
      context.workspaceId,
      instrument.settlementCurrencyId,
      input.economicAt,
    );
    const theoretical = decimalValue(input.quantity)
      .times(decimalValue(input.price))
      .times(decimalValue(instrument.multiplier));
    const derived = quantizeDecimal(
      theoretical.toNearest(decimalValue(convention.settlementIncrement), 6),
    );
    principal ??= derived;
    currencyId ??= instrument.settlementCurrencyId;
    if (currencyId !== instrument.settlementCurrencyId)
      throw financialInvalid('Native principal must use the instrument settlement currency.');
    if (
      !decimalValue(principal).equals(derived) &&
      (!input.principalReview?.reason.trim() || !input.principalReview.source.trim())
    ) {
      throw financialInvalid(
        'Actual principal differing from the verified booking rule requires explicit reviewed source evidence.',
      );
    }
    booking = {
      conventionId: convention.id,
      theoreticalNotional: quantizeDecimal(theoretical),
      derivedPrincipal: derived,
      principalVariance: quantizeDecimal(decimalValue(principal).minus(decimalValue(derived))),
    };
  } else if ((principal === null) !== (currencyId === null)) {
    throw financialInvalid('Manual actual principal needs its explicit monetary unit.');
  }
  if (principal !== null) principal = assertPositive(principal, 'Booked principal');
  if (currencyId) await requireCurrency(tx, context.workspaceId, currencyId, false);
  const id = randomUUID();
  const basisReportingFx = await pinRate(
    tx,
    context.workspaceId,
    input.basisReportingFx,
    currencyId ?? instrument.settlementCurrencyId,
    input.economicAt,
  );
  if (input.closeOnly) {
    if (!native)
      throw financialInvalid('Close-only execution requires a supported native inventory book.');
    const inventory = await rebuildBook(tx, context, state, account, instrument, {
      persist: false,
      asOf: input.economicAt,
      orderingKey: input.orderingKey,
    });
    const eligible = inventory.lots
      .filter((lot) => lot.direction === (input.side === 'buy' ? 'short' : 'long'))
      .reduce((total, lot) => total.plus(lot.remainingQuantity), decimalValue('0'));
    if (inventory.reasons.includes('ambiguous_chronology') || eligible.lt(input.quantity))
      throw financialConflict(
        'INVENTORY_CONFLICT',
        'Close-only quantity exceeds available opposite inventory at its economic boundary.',
      );
  }
  const payload = {
    ...input,
    sourceInput: input,
    ...(input.manualCashEffects
      ? {
          manualCashEffects: input.manualCashEffects.map((effect) => ({
            ...effect,
            amount: decimal(effect.amount),
          })),
        }
      : {}),
    basisReportingFx,
    sourceFingerprint: financialFingerprint(input),
    ...(principal !== null ? { bookedPrincipal: principal } : {}),
    ...(currencyId ? { principalCurrencyId: currencyId } : {}),
    booking,
    accountSettingsId: account.settingsId,
  };
  await tx.execute(sql`INSERT INTO app.executions
    (workspace_id,id,command_id,source_revision,account_id,instrument_version_id,order_leg_id,side,
      quantity_raw,price_raw,principal_raw,principal_currency_id,economic_at,ordering_key,payload,supersedes_id,source_namespace,source_id)
    VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
      ${input.accountId}::uuid,${input.instrumentVersionId}::uuid,${input.orderLegId ?? null}::uuid,${input.side},
      ${decimal(input.quantity)},${input.price === null ? null : decimal(input.price)},${principal},${currencyId}::uuid,${input.economicAt}::timestamptz,
      ${input.orderingKey},${JSON.stringify(payload)}::jsonb,${supersedesId ?? null}::uuid,
      ${supersedesId ? null : (input.sourceIdentity?.namespace ?? null)},${supersedesId ? null : (input.sourceIdentity?.id ?? null)})`);
  if (native && principal !== null && currencyId !== null) {
    const bucket = input.cashBucketId
      ? await requireCashBucket(
          tx,
          context.workspaceId,
          input.cashBucketId,
          input.accountId,
          currencyId,
        )
      : await ensureCashBucket(tx, context.workspaceId, input.accountId, currencyId, 'unsettled');
    await postCashControl(tx, context, state, {
      kind: 'execution-principal',
      economicAt: input.economicAt,
      currencyId,
      cashBucketId: bucket.id,
      amount: input.side === 'buy' ? quantizeDecimal(decimalValue(principal).negated()) : principal,
      controlKey: 'trade-principal',
      effectKey: `execution:${id}:principal`,
      payload: { executionId: id, booking },
    });
  }
  if (!native) {
    for (const [index, effect] of (input.manualCashEffects ?? []).entries()) {
      await requireCashBucket(
        tx,
        context.workspaceId,
        effect.cashBucketId,
        input.accountId,
        effect.currencyId,
      );
      await postCashControl(tx, context, state, {
        kind: 'manual-settlement',
        economicAt: input.economicAt,
        currencyId: effect.currencyId,
        cashBucketId: effect.cashBucketId,
        amount: effect.amount,
        controlKey: 'manual-instrument-settlement',
        effectKey: `execution:${id}:manual:${index}`,
        payload: { executionId: id },
      });
    }
  } else if (input.manualCashEffects?.length) {
    throw financialInvalid(
      'Native principal cannot also be supplied as an extra manual cash effect.',
    );
  }
  for (const fee of input.fees ?? [])
    await insertFee(
      tx,
      context,
      state,
      fee,
      input.accountId,
      input.economicAt,
      id,
      instrument.settlementCurrencyId,
    );
  await initialAllocation(tx, context, state, id, input.quantity);
  return executionDto(await getExecution(tx, context.workspaceId, id));
}

export function createFinancialLedger(platform: FinancialPlatform) {
  async function recordHoldingTransfer(context: AuthorizationContext, input: HoldingTransferInput) {
    assertEconomicInput(input);
    if (
      !input.reason.trim() ||
      !input.selections.length ||
      input.sourceAccountId === input.destinationAccountId
    )
      throw financialInvalid(
        'A reviewed holding transfer needs distinct accounts and explicit lot quantities.',
      );
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'holdings-transferred', payload: economicPayload(input) },
      async (tx, state) => {
        const instrument = await requireInstrumentVersion(
          tx,
          context.workspaceId,
          input.instrumentVersionId,
          false,
        );
        const sourceAccount = await requireAccount(
          tx,
          context.workspaceId,
          input.sourceAccountId,
          false,
          input.economicAt,
        );
        const destinationAccount = await requireAccount(
          tx,
          context.workspaceId,
          input.destinationAccountId,
          false,
          input.economicAt,
        );
        if (sourceAccount.environment !== destinationAccount.environment)
          throw financialInvalid(
            'Live and paper ownership cannot be transferred into one another.',
          );
        if (
          instrument.capability !== 'native-linear' ||
          sourceAccount.holdingMode !== 'netted' ||
          destinationAccount.holdingMode !== 'netted'
        )
          throw financialInvalid(
            'Holding transfers require compatible supported netted inventory books.',
          );
        await rebuildBook(tx, context, state, sourceAccount, instrument);
        await rebuildBook(tx, context, state, destinationAccount, instrument);
        const source = await rebuildBook(tx, context, state, sourceAccount, instrument, {
          persist: false,
          asOf: input.economicAt,
          orderingKey: input.orderingKey,
        });
        const destination = await rebuildBook(tx, context, state, destinationAccount, instrument, {
          persist: false,
          asOf: input.economicAt,
          orderingKey: input.orderingKey,
        });
        const id = randomUUID();
        const transfer = prepareHoldingTransfer(source, {
          transferId: id,
          departureId: randomUUID(),
          receiptId: randomUUID(),
          destinationScope: destination.scope,
          sourceRevision: state.revision,
          destinationSourceRevision: state.revision,
          economicOrder: { instant: kernelInstant(input.economicAt), sequence: input.orderingKey },
          selections: input.selections.map((selection) => ({
            ...selection,
            destinationLotId: randomUUID(),
          })),
        });
        const books = await queryRows<{ id: string; account_id: string }>(
          tx,
          sql`SELECT id,account_id FROM app.holding_books
        WHERE workspace_id=${context.workspaceId}::uuid AND instrument_id=${instrument.instrumentId}::uuid
          AND account_id=ANY(${`{${sourceAccount.id},${destinationAccount.id}}`}::uuid[])`,
        );
        const quantity = quantizeDecimal(
          input.selections.reduce(
            (sum, selection) =>
              sum.plus(assertPositive(selection.quantity, 'Transferred quantity')),
            decimalValue('0'),
          ),
        );
        await tx.execute(sql`INSERT INTO app.holding_transfers
        (workspace_id,id,command_id,source_revision,source_account_id,destination_account_id,
          source_holding_book_id,destination_holding_book_id,instrument_version_id,quantity_raw,economic_at,ordering_key,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${sourceAccount.id}::uuid,${destinationAccount.id}::uuid,${books.find((book) => book.account_id === sourceAccount.id)!.id}::uuid,
          ${books.find((book) => book.account_id === destinationAccount.id)!.id}::uuid,${instrument.id}::uuid,${quantity},
          ${input.economicAt}::timestamptz,${input.orderingKey},${JSON.stringify({ ...transfer, reason: input.reason })}::jsonb)`);
        await rebuildBook(tx, context, state, sourceAccount, instrument);
        await rebuildBook(tx, context, state, destinationAccount, instrument);
        return mutationResult(id, state);
      },
    );
  }

  async function attributeFee(context: AuthorizationContext, input: FeeAttributionInput) {
    assertEconomicInput(input);
    if (!input.reason.trim())
      throw financialInvalid('Cost attribution requires a reviewed reason.');
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'cost-attributed', payload: economicPayload(input) },
      async (tx, state) => {
        const [fee] = await queryRows<{
          id: string;
          account_id: string;
          execution_id: string | null;
          currency_id: string;
          amount_raw: string;
          payload: FeeInput & { economicAt: string };
        }>(
          tx,
          sql`SELECT * FROM app.fees WHERE workspace_id=${context.workspaceId}::uuid AND id=${input.feeId}::uuid`,
        );
        if (!fee) throw financialInvalid('The source cost is unavailable in this workspace.');
        if (fee.execution_id)
          throw financialInvalid(
            'Execution-linked costs already follow their consumed and remaining inventory partitions.',
          );
        const [previous] = await queryRows<{ version: number }>(
          tx,
          sql`SELECT version FROM app.cost_attribution_sets
        WHERE workspace_id=${context.workspaceId}::uuid AND fee_id=${fee.id}::uuid AND axis='inventory' ORDER BY version DESC LIMIT 1`,
        );
        if ((previous?.version ?? 0) !== input.expectedVersion)
          throw financialConflict(
            'STALE_COST_ATTRIBUTION',
            'Reload the latest cost-attribution version.',
          );
        const account = await requireAccount(
          tx,
          context.workspaceId,
          fee.account_id,
          false,
          input.economicAt,
        );
        const instrument = await requireInstrumentVersion(
          tx,
          context.workspaceId,
          input.instrumentVersionId,
          false,
        );
        const [otherScope] = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.inventory_events
        WHERE workspace_id=${context.workspaceId}::uuid AND kind='cost-attribution' AND payload->'cost'->>'id'=${fee.id}
          AND (account_id<>${account.id}::uuid OR instrument_version_id<>${instrument.id}::uuid) LIMIT 1`,
        );
        if (otherScope)
          throw financialInvalid('A source cost cannot be assigned to a second inventory book.');
        if (
          financialInstantMicros(fee.payload.economicAt) > financialInstantMicros(input.economicAt)
        )
          throw financialInvalid('Attribution cannot precede the actual cost.');
        const inventory = await rebuildBook(tx, context, state, account, instrument, {
          persist: false,
        });
        const total = input.allocations.reduce(
          (sum, part) => sum.plus(decimal(part.amount)),
          decimalValue('0'),
        );
        if (
          !total.eq(decimal(fee.amount_raw)) ||
          input.allocations.filter((part) => part.target === 'unassigned').length !== 1
        )
          throw financialInvalid(
            'Cost portions must exactly conserve the source amount and include one explicit unassigned residual.',
          );
        const id = randomUUID();
        const source: InventoryCostAttribution = {
          kind: 'cost-attribution',
          id,
          effectId: id,
          sourceRevision: state.revision,
          economicOrder: { instant: kernelInstant(input.economicAt), sequence: input.orderingKey },
          cost: {
            id: fee.id,
            currencyId: fee.currency_id,
            amount: fee.amount_raw,
            chargedAt: kernelInstant(fee.payload.economicAt),
            ...(fee.payload.nativeFx ? { nativeFx: fee.payload.nativeFx } : {}),
            ...(fee.payload.reportingFx ? { reportingFx: fee.payload.reportingFx } : {}),
          },
          allocations: input.allocations,
        };
        for (const allocation of input.allocations) {
          if (
            allocation.target === 'lot' &&
            !inventory.lots.some(
              (lot) =>
                lot.id === allocation.targetId && !decimalValue(lot.remainingQuantity).isZero(),
            )
          )
            throw financialInvalid('Cost allocation must name an available lot in this book.');
          if (
            allocation.target === 'match' &&
            !inventory.matches.some((match) => match.id === allocation.targetId)
          )
            throw financialInvalid('Cost allocation must name a realized match in this book.');
        }
        await tx.execute(sql`INSERT INTO app.cost_attribution_sets
        (workspace_id,id,command_id,source_revision,fee_id,axis,version,reason)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${fee.id}::uuid,'inventory',${input.expectedVersion + 1},${input.reason})`);
        for (const part of input.allocations)
          await tx.execute(sql`INSERT INTO app.cost_allocations
        (workspace_id,id,attribution_set_id,lot_id,currency_id,amount_raw,payload)
        VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${part.target === 'lot' ? part.targetId : null}::uuid,
          ${fee.currency_id}::uuid,${decimal(part.amount)},${JSON.stringify(part)}::jsonb)`);
        await tx.execute(sql`INSERT INTO app.inventory_events
        (workspace_id,id,command_id,source_revision,account_id,instrument_version_id,economic_at,ordering_key,kind,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${account.id}::uuid,${instrument.id}::uuid,${input.economicAt}::timestamptz,${input.orderingKey},'cost-attribution',${JSON.stringify(source)}::jsonb)`);
        await rebuildBook(tx, context, state, account, instrument);
        return { ...mutationResult(id, state), version: input.expectedVersion + 1 };
      },
    );
  }
  async function createCashBucket(context: AuthorizationContext, input: CreateCashBucketInput) {
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'cash-bucket-created', payload: economicPayload(input) },
      async (tx, state) => {
        await requireAccount(tx, context.workspaceId, input.accountId);
        await requireCurrency(tx, context.workspaceId, input.currencyId);
        if (!['settled', 'unsettled', 'restricted', 'collateral_cash'].includes(input.kind))
          throw financialInvalid('Unsupported cash bucket.');
        const bucket = await ensureCashBucket(
          tx,
          context.workspaceId,
          input.accountId,
          input.currencyId,
          input.kind,
          input.custodyKey ?? 'default',
        );
        return {
          ...mutationResult(bucket.id, state),
          accountId: input.accountId,
          currencyId: input.currencyId,
          kind: input.kind,
        };
      },
    );
  }

  async function recordCashMovement(context: AuthorizationContext, input: CashMovementInput) {
    assertEconomicInput(input);
    const amount = decimal(input.amount);
    if (decimalValue(amount).isZero()) throw financialInvalid('A cash movement cannot be zero.');
    if (
      (input.kind === 'deposit' && decimalValue(amount).isNegative()) ||
      (input.kind === 'withdrawal' && decimalValue(amount).isPositive())
    ) {
      throw financialInvalid(
        'Deposits are positive receipts and withdrawals are negative payments.',
      );
    }
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'cash-recorded', payload: economicPayload(input) },
      async (tx, state) => {
        await requireAccount(tx, context.workspaceId, input.accountId, false, input.economicAt);
        await requireCashBucket(
          tx,
          context.workspaceId,
          input.cashBucketId,
          input.accountId,
          input.currencyId,
        );
        if (input.sourceIdentity) {
          const [previous] = await queryRows<{
            id: string;
            command_id: string;
            source_revision: number;
            payload: unknown;
          }>(
            tx,
            sql`SELECT id,command_id,source_revision,payload FROM app.cash_movements
            WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${input.accountId}::uuid
              AND payload->'sourceIdentity'->>'namespace'=${input.sourceIdentity.namespace}
              AND payload->'sourceIdentity'->>'id'=${input.sourceIdentity.id} LIMIT 1`,
          );
          if (previous) {
            if (
              financialFingerprint(previous.payload) ===
              financialFingerprint(economicPayload(input))
            )
              financialNoop({
                id: previous.id,
                commandId: previous.command_id,
                sourceRevision: String(previous.source_revision),
              });
            throw financialConflict(
              'SOURCE_ALREADY_RECORDED',
              'This cash source identity has different economics; review a correction.',
            );
          }
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.cash_movements
        (workspace_id,id,command_id,source_revision,account_id,cash_bucket_id,currency_id,amount_raw,kind,economic_at,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${input.accountId}::uuid,${input.cashBucketId}::uuid,${input.currencyId}::uuid,${amount},
          ${input.kind},${input.economicAt}::timestamptz,${JSON.stringify(economicPayload(input))}::jsonb)`);
        await postCashControl(tx, context, state, {
          kind: input.kind,
          economicAt: input.economicAt,
          currencyId: input.currencyId,
          cashBucketId: input.cashBucketId,
          amount: input.amount,
          controlKey: input.kind === 'unresolved' ? 'unresolved-source' : `cash:${input.kind}`,
          effectKey: `cash:${id}`,
          payload: { cashMovementId: id },
        });
        return mutationResult(id, state);
      },
    );
  }

  async function recordFee(context: AuthorizationContext, input: RecordFeeInput) {
    assertEconomicInput(input);
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'fee-recorded', payload: economicPayload(input) },
      async (tx, state) => {
        const account = await requireAccount(
          tx,
          context.workspaceId,
          input.accountId,
          false,
          input.economicAt,
        );
        let instrument: InstrumentVersionReference | undefined;
        if (input.executionId) {
          const execution = await getExecution(tx, context.workspaceId, input.executionId);
          if (execution.account_id !== input.accountId)
            throw financialInvalid('A cost cannot be charged to a different execution account.');
          const [superseded] = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM app.execution_supersessions
          WHERE workspace_id=${context.workspaceId}::uuid AND original_execution_id=${input.executionId}::uuid`,
          );
          if (superseded)
            throw financialConflict(
              'SUPERSEDED_EXECUTION',
              'Attach the cost to the current execution version.',
            );
          instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            execution.instrument_version_id,
            false,
          );
        }
        const id = await insertFee(
          tx,
          context,
          state,
          input,
          input.accountId,
          input.economicAt,
          input.executionId,
          instrument?.settlementCurrencyId,
        );
        if (instrument && input.executionId) {
          const [current] = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM app.allocation_sets
          WHERE workspace_id=${context.workspaceId}::uuid AND execution_id=${input.executionId}::uuid ORDER BY version DESC LIMIT 1`,
          );
          if (current)
            await partitionCampaignCosts(tx, context, state, input.executionId, current.id);
          await rebuildBook(tx, context, state, account, instrument);
        }
        return mutationResult(id, state);
      },
    );
  }

  async function recordFxConversion(context: AuthorizationContext, input: FxConversionInput) {
    assertEconomicInput(input);
    const sourceAmount = assertPositive(input.sourceAmount, 'FX source amount');
    const destinationAmount = assertPositive(input.destinationAmount, 'FX destination amount');
    if (input.rate) {
      assertPositive(input.rate, 'FX rate');
      const sourceScale = Math.min(input.rate.split('.')[1]?.length ?? 0, FINANCIAL_SCALE);
      const roundedImpliedRate = quantizeDecimal(
        decimalValue(destinationAmount).div(sourceAmount),
        sourceScale,
      );
      if (
        !decimalValue(input.rate).equals(roundedImpliedRate) &&
        (!input.rateReview?.reason.trim() || !input.rateReview.source.trim())
      ) {
        throw financialInvalid(
          'A supplied rate that differs from the actual amounts at its source precision requires reviewed source evidence.',
        );
      }
    }
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'fx-recorded', payload: economicPayload(input) },
      async (tx, state) => {
        const source = await requireCashBucket(tx, context.workspaceId, input.sourceBucketId);
        const destination = await requireCashBucket(
          tx,
          context.workspaceId,
          input.destinationBucketId,
        );
        if (source.currency_id === destination.currency_id)
          throw financialInvalid('FX conversion needs two different monetary units.');
        if (source.account_id !== destination.account_id)
          throw financialInvalid(
            'A conversion is within one account; record cross-account transfer separately.',
          );
        await requireAccount(tx, context.workspaceId, source.account_id, false, input.economicAt);
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.fx_conversions
        (workspace_id,id,command_id,source_revision,source_bucket_id,destination_bucket_id,source_amount_raw,destination_amount_raw,rate_raw,economic_at,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${source.id}::uuid,${destination.id}::uuid,${sourceAmount},${destinationAmount},
          ${input.rate === undefined ? null : decimal(input.rate)},${input.economicAt}::timestamptz,${JSON.stringify(economicPayload(input))}::jsonb)`);
        await postCashControl(tx, context, state, {
          kind: 'fx-source',
          economicAt: input.economicAt,
          currencyId: source.currency_id,
          cashBucketId: source.id,
          amount: quantizeDecimal(decimalValue(sourceAmount).negated()),
          controlKey: 'fx-conversion',
          effectKey: `fx:${id}:source`,
          payload: { conversionId: id },
        });
        await postCashControl(tx, context, state, {
          kind: 'fx-destination',
          economicAt: input.economicAt,
          currencyId: destination.currency_id,
          cashBucketId: destination.id,
          amount: destinationAmount,
          controlKey: 'fx-conversion',
          effectKey: `fx:${id}:destination`,
          payload: { conversionId: id },
        });
        for (const fee of input.fees ?? [])
          await insertFee(tx, context, state, fee, source.account_id, input.economicAt);
        return {
          ...mutationResult(id, state),
          actualRate: divideDecimal(destinationAmount, sourceAmount),
        };
      },
    );
  }

  async function moveCashBuckets(context: AuthorizationContext, input: BucketMovementInput) {
    assertEconomicInput(input);
    const amount = assertPositive(input.amount, 'Moved amount');
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'cash-buckets-moved', payload: economicPayload(input) },
      async (tx, state) => {
        const source = await requireCashBucket(tx, context.workspaceId, input.sourceBucketId);
        const destination = await requireCashBucket(
          tx,
          context.workspaceId,
          input.destinationBucketId,
        );
        if (source.id === destination.id || source.currency_id !== destination.currency_id)
          throw financialInvalid('A bucket move needs distinct buckets in the same monetary unit.');
        if (input.kind !== 'internal-transfer' && source.account_id !== destination.account_id)
          throw financialInvalid('A settlement/reclassification stays within its account.');
        const sourceAccount = await requireAccount(
          tx,
          context.workspaceId,
          source.account_id,
          false,
          input.economicAt,
        );
        const destinationAccount = await requireAccount(
          tx,
          context.workspaceId,
          destination.account_id,
          false,
          input.economicAt,
        );
        if (sourceAccount.environment !== destinationAccount.environment)
          throw financialInvalid('Live and paper cash ownership cannot transfer into one another.');
        if (input.kind === 'settlement') {
          if (!input.executionId)
            throw financialInvalid('Settlement must identify its actual principal obligation.');
          const execution = await getExecution(tx, context.workspaceId, input.executionId);
          if (
            financialInstantMicros(execution.payload.economicAt) >
            financialInstantMicros(input.economicAt)
          )
            throw financialInvalid(
              'Confirmed settlement cannot precede its actual execution obligation.',
            );
          if (
            execution.account_id !== source.account_id ||
            execution.principal_currency_id !== source.currency_id ||
            execution.principal_raw === null
          )
            throw financialInvalid('Settlement does not match the execution monetary obligation.');
          const [superseded] = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM app.execution_supersessions
            WHERE workspace_id=${context.workspaceId}::uuid AND original_execution_id=${execution.id}::uuid LIMIT 1`,
          );
          if (superseded)
            throw financialConflict(
              'SUPERSEDED_EXECUTION',
              'Settle the current effective execution version.',
            );
          // Validate the candidate and every already accepted later settlement.
          // Economic time and command revision order each established obligation.
          const effects = await queryRows<{
            economic_at: string;
            source_revision: number;
            settlement: boolean;
            amount: string;
          }>(
            tx,
            sql`SELECT to_char(e.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at,
              e.source_revision,bool_or(e.kind='settlement') AS settlement,sum(p.amount)::text AS amount
          FROM app.postings p JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
          WHERE p.workspace_id=${context.workspaceId}::uuid AND p.cash_bucket_id=${source.id}::uuid
            AND e.payload->>'executionId'=${input.executionId}
          GROUP BY e.economic_at,e.source_revision ORDER BY e.economic_at,e.source_revision`,
          );
          let outstanding = decimalValue('0');
          let moved: string | undefined;
          const rejectExcess = () =>
            financialConflict(
              'SETTLEMENT_EXCESS',
              'Settlement exceeds the outstanding execution obligation.',
            );
          const insertCandidate = () => {
            if (outstanding.abs().lt(amount)) throw rejectExcess();
            moved = quantizeDecimal(
              decimalValue(amount).times(outstanding.isNegative() ? '-1' : '1'),
            );
            outstanding = outstanding.minus(moved);
          };
          for (const effect of effects) {
            if (
              moved === undefined &&
              financialInstantMicros(effect.economic_at) > financialInstantMicros(input.economicAt)
            )
              insertCandidate();
            const change = decimalValue(effect.amount);
            if (
              effect.settlement &&
              (outstanding.isZero() ||
                change.isNegative() === outstanding.isNegative() ||
                change.abs().gt(outstanding.abs()))
            )
              throw rejectExcess();
            outstanding = outstanding.plus(change);
          }
          if (moved === undefined) insertCandidate();
          if (source.kind !== 'unsettled' || destination.kind !== 'settled')
            throw financialInvalid(
              'Settlement moves an actual unsettled obligation to settled cash.',
            );
          const id = await postLedgerEvent(tx, context, state, {
            kind: 'settlement',
            economicAt: input.economicAt,
            currencyId: source.currency_id,
            effectKey: `settlement:${state.eventId}`,
            payload: { executionId: input.executionId },
            postings: [
              {
                currencyId: source.currency_id,
                cashBucketId: source.id,
                amount: quantizeDecimal(decimalValue(moved!).negated()),
              },
              { currencyId: source.currency_id, cashBucketId: destination.id, amount: moved! },
            ],
          });
          return mutationResult(id, state);
        }
        const id = await postLedgerEvent(tx, context, state, {
          kind: input.kind,
          economicAt: input.economicAt,
          currencyId: source.currency_id,
          effectKey: `bucket-move:${state.eventId}`,
          payload: {
            sourceAccountId: source.account_id,
            destinationAccountId: destination.account_id,
            simultaneousReceipt: true,
          },
          postings: [
            {
              currencyId: source.currency_id,
              cashBucketId: source.id,
              amount: quantizeDecimal(decimalValue(amount).negated()),
            },
            { currencyId: source.currency_id, cashBucketId: destination.id, amount },
          ],
        });
        return mutationResult(id, state);
      },
    );
  }

  async function recordExecution(context: AuthorizationContext, input: ExecutionInput) {
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'execution-recorded', payload: economicPayload(input) },
      async (tx, state) => {
        if (input.sourceIdentity) {
          const [previous] = await queryRows<ExecutionRow>(
            tx,
            sql`SELECT * FROM app.executions
          WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${input.accountId}::uuid
            AND source_namespace=${input.sourceIdentity.namespace} AND source_id=${input.sourceIdentity.id}`,
          );
          if (previous) {
            const fingerprint = (previous.payload as unknown as { sourceFingerprint?: string })
              .sourceFingerprint;
            if (fingerprint === financialFingerprint(economicPayload(input)))
              financialNoop(executionDto(previous));
            throw financialConflict(
              'SOURCE_ALREADY_RECORDED',
              'This source identity has different economics; review a correction.',
            );
          }
        }
        const result = await insertExecution(tx, context, state, economicPayload(input));
        await rebuildBook(
          tx,
          context,
          state,
          await requireAccount(tx, context.workspaceId, input.accountId, false, input.economicAt),
          await requireInstrumentVersion(tx, context.workspaceId, input.instrumentVersionId, false),
        );
        return result;
      },
    );
  }

  async function recordOpeningLot(context: AuthorizationContext, input: OpeningLotInput) {
    assertEconomicInput(input);
    assertPositive(input.quantity, 'Opening quantity');
    if (!input.reason.trim())
      throw financialInvalid('Opening holdings require reviewed coverage provenance.');
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'opening-lot-recorded', payload: economicPayload(input) },
      async (tx, state) => {
        const account = await requireAccount(
          tx,
          context.workspaceId,
          input.accountId,
          false,
          input.economicAt,
        );
        const instrument = await requireInstrumentVersion(
          tx,
          context.workspaceId,
          input.instrumentVersionId,
          false,
        );
        if (input.entryPrice !== undefined) assertPositive(input.entryPrice, 'Opening price');
        if (input.bookedPrincipal !== undefined)
          assertPositive(input.bookedPrincipal, 'Opening basis');
        const id = randomUUID();
        const basisReportingFx = await pinRate(
          tx,
          context.workspaceId,
          input.basisReportingFx,
          instrument.settlementCurrencyId,
          input.economicAt,
        );
        await tx.execute(sql`INSERT INTO app.opening_lots
        (workspace_id,id,command_id,source_revision,account_id,instrument_version_id,quantity_raw,direction,price_raw,principal_raw,economic_at,ordering_key,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${input.accountId}::uuid,${input.instrumentVersionId}::uuid,${decimal(input.quantity)},${input.direction},
          ${input.entryPrice === undefined ? null : decimal(input.entryPrice)},${input.bookedPrincipal === undefined ? null : decimal(input.bookedPrincipal)},${input.economicAt}::timestamptz,
          ${input.orderingKey},${JSON.stringify({ ...economicPayload(input), basisReportingFx })}::jsonb)`);
        await rebuildBook(tx, context, state, account, instrument);
        return mutationResult(id, state);
      },
    );
  }

  async function correctExecution(context: AuthorizationContext, input: CorrectExecutionInput) {
    if (!input.reason.trim()) throw financialInvalid('A correction reason is required.');
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'execution-corrected', payload: economicPayload(input) },
      async (tx, state) => {
        const original = await getExecution(tx, context.workspaceId, input.originalExecutionId);
        const [settlement] = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.ledger_events
        WHERE workspace_id=${context.workspaceId}::uuid AND kind='settlement' AND payload->>'executionId'=${original.id} LIMIT 1`,
        );
        if (settlement)
          throw financialConflict(
            'DEPENDENT_SETTLEMENT_REVIEW_REQUIRED',
            'Review the confirmed settlement together with the source correction before restating this execution.',
          );
        const originalInstrument = await requireInstrumentVersion(
          tx,
          context.workspaceId,
          original.instrument_version_id,
          false,
        );
        const replacementInstrument = await requireInstrumentVersion(
          tx,
          context.workspaceId,
          input.replacement.instrumentVersionId,
          false,
        );
        const previousAllocations = await queryRows<{ trade_leg_id: string; quantity_raw: string }>(
          tx,
          sql`SELECT i.trade_leg_id,i.quantity_raw FROM app.allocation_items i JOIN LATERAL
          (SELECT id FROM app.allocation_sets WHERE workspace_id=${context.workspaceId}::uuid
            AND execution_id=${original.id}::uuid ORDER BY version DESC LIMIT 1) s ON i.allocation_set_id=s.id
          WHERE i.workspace_id=${context.workspaceId}::uuid AND i.trade_leg_id IS NOT NULL AND i.quantity>0`,
        );
        if (
          previousAllocations.length &&
          !decimalValue(original.quantity_raw).eq(decimal(input.replacement.quantity)) &&
          !input.replacementAllocations
        )
          throw financialConflict(
            'ALLOCATION_REVIEW_REQUIRED',
            'A quantity correction must explicitly review replacement campaign allocations.',
          );
        const [descendant] = await queryRows<{ id: string }>(
          tx,
          sql`SELECT t.id FROM app.holding_transfers t
        JOIN app.instrument_versions v ON v.workspace_id=t.workspace_id AND v.id=t.instrument_version_id
        WHERE t.workspace_id=${context.workspaceId}::uuid AND
          (t.payload::text LIKE ${`%${original.id}%`} OR
           (t.source_account_id=${original.account_id}::uuid AND v.instrument_id=${originalInstrument.instrumentId}::uuid
            AND t.economic_at>=${original.payload.economicAt}::timestamptz) OR
           (t.source_account_id=${input.replacement.accountId}::uuid AND v.instrument_id=${replacementInstrument.instrumentId}::uuid
            AND t.economic_at>=${input.replacement.economicAt}::timestamptz)) LIMIT 1`,
        );
        if (descendant)
          throw financialConflict(
            'DEPENDENT_LINEAGE_REVIEW_REQUIRED',
            'This inventory has holding-transfer descendants. Review a multi-account lineage restatement before correcting the acquisition.',
          );
        const [previous] = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.execution_supersessions
        WHERE workspace_id=${context.workspaceId}::uuid AND original_execution_id=${original.id}::uuid`,
        );
        if (previous)
          throw financialConflict(
            'SUPERSEDED_EXECUTION',
            'Correct the current effective execution version.',
          );
        const events = await queryRows<{
          id: string;
          currency_id: string;
          payload: Record<string, unknown>;
          economic_at: string;
        }>(
          tx,
          sql`SELECT id,currency_id,payload,to_char(economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at
          FROM app.ledger_events WHERE workspace_id=${context.workspaceId}::uuid AND payload->>'executionId'=${original.id}
            AND reversal_of_id IS NULL`,
        );
        for (const event of events) {
          const postings = await queryRows<{
            currency_id: string;
            cash_bucket_id: string | null;
            control_key: string | null;
            amount_raw: string;
          }>(
            tx,
            sql`SELECT currency_id,cash_bucket_id,control_key,amount_raw FROM app.postings
            WHERE workspace_id=${context.workspaceId}::uuid AND ledger_event_id=${event.id}::uuid`,
          );
          await postLedgerEvent(tx, context, state, {
            kind: 'correction-reversal',
            economicAt: event.economic_at,
            currencyId: event.currency_id,
            effectKey: `reversal:${event.id}`,
            reversalOfId: event.id,
            payload: { reversesExecutionId: original.id, reason: input.reason },
            postings: postings.map((posting) => ({
              currencyId: posting.currency_id,
              amount: quantizeDecimal(decimalValue(posting.amount_raw).negated()),
              ...(posting.cash_bucket_id
                ? { cashBucketId: posting.cash_bucket_id }
                : { controlKey: posting.control_key! }),
            })),
          });
        }
        const replacement = await insertExecution(
          tx,
          context,
          state,
          input.replacement,
          original.id,
        );
        await tx.execute(sql`INSERT INTO app.execution_supersessions
        (workspace_id,id,command_id,source_revision,original_execution_id,replacement_execution_id,reason)
        VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${original.id}::uuid,${replacement.id}::uuid,${input.reason})`);
        const correctedAllocations =
          input.replacementAllocations ??
          previousAllocations.map((item) => ({
            tradeLegId: item.trade_leg_id,
            quantity: item.quantity_raw,
          }));
        if (correctedAllocations.length) {
          const setId = randomUUID();
          const seen = new Set<string>();
          let assigned = decimalValue('0');
          const items: { tradeLegId: string | null; quantity: string }[] = [];
          for (const item of correctedAllocations) {
            const quantity = assertPositive(item.quantity, 'Corrected attributed quantity');
            if (seen.has(item.tradeLegId))
              throw financialInvalid('Corrected campaign legs must be unique.');
            seen.add(item.tradeLegId);
            const [leg] = await queryRows<{
              account_id: string;
              instrument_id: string;
              quantity_unit: string;
              status: string;
              archived: boolean;
            }>(
              tx,
              sql`SELECT l.account_id,v.instrument_id,v.quantity_unit,t.status,t.archived_at IS NOT NULL AS archived FROM app.trade_legs l JOIN app.instrument_versions v
              ON v.workspace_id=l.workspace_id AND v.id=l.instrument_version_id
              JOIN app.trades t ON t.workspace_id=l.workspace_id AND t.id=l.trade_id
              WHERE l.workspace_id=${context.workspaceId}::uuid AND l.id=${item.tradeLegId}::uuid`,
            );
            if (
              !leg ||
              leg.account_id !== replacement.accountId ||
              leg.instrument_id !== replacementInstrument.instrumentId ||
              leg.quantity_unit !== replacementInstrument.quantityUnit
            )
              throw financialInvalid(
                'Corrected attribution must retain the replacement account and compatible instrument unit.',
              );
            if (leg.status === 'canceled' || leg.archived)
              throw financialConflict(
                'INACTIVE_CAMPAIGN',
                'Canceled or archived campaigns cannot receive corrected execution attribution.',
              );
            if (
              leg.status === 'closed' &&
              !previousAllocations.some((previous) => previous.trade_leg_id === item.tradeLegId)
            )
              throw financialConflict(
                'CLOSED_CAMPAIGN_REVIEW_REQUIRED',
                'A correction can preserve prior closed-campaign attribution, but cannot assign an unrelated execution to it.',
              );
            assigned = assigned.plus(quantity);
            items.push({ tradeLegId: item.tradeLegId, quantity });
          }
          if (assigned.gt(replacement.quantity))
            throw financialInvalid('Corrected attribution exceeds replacement quantity.');
          items.push({
            tradeLegId: null,
            quantity: quantizeDecimal(decimalValue(replacement.quantity).minus(assigned)),
          });
          const principalParts =
            replacement.bookedPrincipal === null
              ? undefined
              : allocateDecimal(
                  replacement.bookedPrincipal,
                  items.map((item) => ({
                    id: item.tradeLegId ?? 'unassigned',
                    weight: item.quantity,
                  })),
                );
          await tx.execute(sql`INSERT INTO app.allocation_sets (workspace_id,id,command_id,source_revision,execution_id,version,reason)
          VALUES (${context.workspaceId}::uuid,${setId}::uuid,${state.eventId}::uuid,${state.revision}::integer,
            ${replacement.id}::uuid,2,${input.reason})`);
          for (const item of items)
            await tx.execute(sql`INSERT INTO app.allocation_items
          (workspace_id,id,allocation_set_id,trade_leg_id,quantity_raw,payload)
          VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${setId}::uuid,${item.tradeLegId}::uuid,${item.quantity},
            ${JSON.stringify({ principal: principalParts?.find((part) => part.id === (item.tradeLegId ?? 'unassigned'))?.amount ?? null })}::jsonb)`);
          await partitionCampaignCosts(tx, context, state, replacement.id, setId);
        }
        await rebuildBook(
          tx,
          context,
          state,
          await requireAccount(
            tx,
            context.workspaceId,
            original.account_id,
            false,
            original.payload.economicAt,
          ),
          originalInstrument,
        );
        if (
          original.account_id !== replacement.accountId ||
          originalInstrument.instrumentId !== replacementInstrument.instrumentId
        ) {
          await rebuildBook(
            tx,
            context,
            state,
            await requireAccount(
              tx,
              context.workspaceId,
              replacement.accountId,
              false,
              replacement.economicAt,
            ),
            replacementInstrument,
          );
        }
        return replacement;
      },
    );
  }

  async function allocateExecution(context: AuthorizationContext, input: AllocationInput) {
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'execution-allocated', payload: economicPayload(input) },
      async (tx, state) => {
        const execution = await getExecution(tx, context.workspaceId, input.executionId);
        if (!input.reason.trim()) throw financialInvalid('Allocation revisions require a reason.');
        const [superseded] = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.execution_supersessions
        WHERE workspace_id=${context.workspaceId}::uuid AND original_execution_id=${execution.id}::uuid`,
        );
        if (superseded)
          throw financialConflict(
            'SUPERSEDED_EXECUTION',
            'Allocate the current effective execution version.',
          );
        const [current] = await queryRows<{ version: number }>(
          tx,
          sql`SELECT version FROM app.allocation_sets
        WHERE workspace_id=${context.workspaceId}::uuid AND execution_id=${execution.id}::uuid ORDER BY version DESC LIMIT 1`,
        );
        if (!current || current.version !== input.expectedVersion)
          throw financialConflict('STALE_ALLOCATION', 'Reload the effective allocation version.');
        let assigned = decimalValue('0');
        const items: { id: string; tradeLegId: string | null; quantity: string }[] = [];
        const seen = new Set<string>();
        for (const allocation of input.allocations) {
          assertPositive(allocation.quantity, 'Allocated quantity');
          if (seen.has(allocation.tradeLegId))
            throw financialInvalid('A campaign leg appears once in an allocation set.');
          seen.add(allocation.tradeLegId);
          const [leg] = await queryRows<{
            account_id: string;
            instrument_id: string;
            quantity_unit: string;
            status: string;
            archived: boolean;
          }>(
            tx,
            sql`SELECT l.account_id,v.instrument_id,v.quantity_unit,t.status,t.archived_at IS NOT NULL AS archived FROM app.trade_legs l
            JOIN app.instrument_versions v ON v.workspace_id=l.workspace_id AND v.id=l.instrument_version_id
            JOIN app.trades t ON t.workspace_id=l.workspace_id AND t.id=l.trade_id
            WHERE l.workspace_id=${context.workspaceId}::uuid AND l.id=${allocation.tradeLegId}::uuid`,
          );
          const instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            execution.instrument_version_id,
            false,
          );
          if (
            !leg ||
            leg.account_id !== execution.account_id ||
            leg.instrument_id !== instrument.instrumentId ||
            leg.quantity_unit !== instrument.quantityUnit
          )
            throw financialInvalid(
              'Campaign attribution must retain the execution account and compatible instrument unit.',
            );
          if (leg.status === 'closed')
            throw financialConflict(
              'CLOSED_CAMPAIGN_REVIEW_REQUIRED',
              'Record a reviewed correction or create a new campaign before assigning new activity.',
            );
          if (leg.status === 'canceled' || leg.archived)
            throw financialConflict(
              'INACTIVE_CAMPAIGN',
              'Canceled or archived campaigns cannot receive new execution attribution.',
            );
          assigned = assigned.plus(decimalValue(allocation.quantity));
          items.push({
            id: randomUUID(),
            tradeLegId: allocation.tradeLegId,
            quantity: decimal(allocation.quantity),
          });
        }
        if (assigned.gt(execution.quantity_raw))
          throw financialConflict(
            'ALLOCATION_EXCESS',
            'Assigned quantity exceeds the actual fill.',
          );
        items.push({
          id: randomUUID(),
          tradeLegId: null,
          quantity: quantizeDecimal(decimalValue(execution.quantity_raw).minus(assigned)),
        });
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.allocation_sets
        (workspace_id,id,command_id,source_revision,execution_id,version,reason)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
          ${execution.id}::uuid,${current.version + 1},${input.reason})`);
        const principalPieces =
          execution.principal_raw === null
            ? undefined
            : allocateDecimal(
                execution.principal_raw,
                items.map((item) => ({
                  id: item.tradeLegId ?? 'unassigned',
                  weight: item.quantity,
                })),
              );
        for (const item of items) {
          await tx.execute(sql`INSERT INTO app.allocation_items
          (workspace_id,id,allocation_set_id,trade_leg_id,quantity_raw,payload)
          VALUES (${context.workspaceId}::uuid,${item.id}::uuid,${id}::uuid,${item.tradeLegId}::uuid,${item.quantity},
            ${JSON.stringify({ principal: principalPieces?.find((piece) => piece.id === (item.tradeLegId ?? 'unassigned'))?.amount ?? null })}::jsonb)`);
        }
        await partitionCampaignCosts(tx, context, state, execution.id, id);
        // Attribution changes do not book cash or replay account inventory.
        return { ...mutationResult(id, state), version: current.version + 1 };
      },
    );
  }

  async function cashBalances(
    context: AuthorizationContext,
    input: { accountIds?: string[]; asOf?: string; sourceRevision?: string } = {},
  ): Promise<CashBalanceDto[]> {
    return platform.withWorkspaceContext(context, async (tx) => {
      const selectedAccounts = input.accountIds
        ? `{${input.accountIds.map((id) => financialUuid.parse(id)).join(',')}}`
        : null;
      const rows = await queryRows<{
        account_id: string;
        currency_id: string;
        cash_bucket_id: string;
        category: string;
        amount: string;
      }>(
        tx,
        sql`SELECT b.account_id,b.currency_id,b.id AS cash_bucket_id,b.category,
          COALESCE(sum(p.amount) FILTER (WHERE
            (${input.asOf ?? null}::timestamptz IS NULL OR e.economic_at<=${input.asOf ?? null}::timestamptz)
            AND (${input.sourceRevision ?? null}::integer IS NULL OR e.source_revision<=${input.sourceRevision ?? null}::integer)),0)::text AS amount
          FROM app.cash_buckets b LEFT JOIN app.postings p ON p.workspace_id=b.workspace_id AND p.cash_bucket_id=b.id
          LEFT JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
          WHERE b.workspace_id=${context.workspaceId}::uuid
            AND (${selectedAccounts}::uuid[] IS NULL OR b.account_id=ANY(${selectedAccounts}::uuid[]))
          GROUP BY b.account_id,b.currency_id,b.id,b.category ORDER BY b.account_id,b.currency_id,b.id`,
      );
      return rows.map((row) => ({
        accountId: row.account_id,
        currencyId: row.currency_id,
        cashBucketId: row.cash_bucket_id,
        kind: row.category,
        amount: decimal(row.amount),
      }));
    });
  }

  async function executionAllocations(context: AuthorizationContext, executionId: string) {
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const id = financialUuid.parse(executionId);
        const [execution] = await queryRows<ExecutionRow>(
          tx,
          sql`SELECT * FROM app.executions
        WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
        );
        if (!execution) throw inaccessible();
        const [superseded] = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.execution_supersessions
        WHERE workspace_id=${context.workspaceId}::uuid AND original_execution_id=${execution.id}::uuid LIMIT 1`,
        );
        if (superseded)
          throw financialConflict(
            'SOURCE_NOT_EFFECTIVE',
            'This execution was corrected. Select its effective replacement.',
          );
        const [set] = await queryRows<{ id: string; version: number }>(
          tx,
          sql`SELECT id,version FROM app.allocation_sets
        WHERE workspace_id=${context.workspaceId}::uuid AND execution_id=${execution.id}::uuid ORDER BY version DESC LIMIT 1`,
        );
        if (!set)
          throw financialConflict(
            'MISSING_ALLOCATION',
            'The execution has no effective allocation record.',
          );
        const rows = await queryRows<{ trade_leg_id: string | null; quantity_raw: string }>(
          tx,
          sql`SELECT trade_leg_id,quantity_raw
        FROM app.allocation_items WHERE workspace_id=${context.workspaceId}::uuid AND allocation_set_id=${set.id}::uuid ORDER BY id LIMIT 1002`,
        );
        return {
          executionId: execution.id,
          version: set.version,
          allocations: rows.map((row) => ({
            tradeLegId: row.trade_leg_id,
            quantity: decimal(row.quantity_raw),
          })),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async function executions(
    context: AuthorizationContext,
    input: {
      accountId?: string;
      includeSuperseded?: boolean;
      limit?: number;
      afterId?: string;
    } = {},
  ): Promise<ExecutionDto[]> {
    return platform.withWorkspaceContext(context, async (tx) => {
      const after = input.afterId
        ? await getExecution(tx, context.workspaceId, input.afterId)
        : undefined;
      if (after && input.accountId && after.account_id !== input.accountId)
        throw financialInvalid('The pagination cursor is outside the selected account.');
      const rows = await queryRows<ExecutionRow>(
        tx,
        sql`SELECT e.* FROM app.executions e
        WHERE workspace_id=${context.workspaceId}::uuid
          AND (${input.accountId ?? null}::uuid IS NULL OR account_id=${input.accountId ?? null}::uuid)
          AND (${input.includeSuperseded ?? false} OR NOT EXISTS (SELECT 1 FROM app.execution_supersessions s
            WHERE s.workspace_id=e.workspace_id AND s.original_execution_id=e.id))
          AND (${after?.id ?? null}::uuid IS NULL OR
            (e.economic_at,e.ordering_key::numeric,e.id)>
            (${after?.payload.economicAt ?? null}::timestamptz,${after?.ordering_key ?? null}::numeric,${after?.id ?? null}::uuid))
        ORDER BY economic_at,ordering_key::numeric,id LIMIT ${Math.min(Math.max(input.limit ?? 100, 1), 500)}`,
      );
      return rows.map(executionDto);
    });
  }

  async function positions(
    context: AuthorizationContext,
    input: { accountId?: string; instrumentId?: string; valuation?: InventoryValuationInput } = {},
  ): Promise<PositionDto[]> {
    return platform.withWorkspaceContext(context, async (tx) => {
      const rows = await queryRows<BookRow>(
        tx,
        sql`SELECT * FROM app.holding_books
        WHERE workspace_id=${context.workspaceId}::uuid
          AND (${input.accountId ?? null}::uuid IS NULL OR account_id=${input.accountId ?? null}::uuid)
          AND (${input.instrumentId ?? null}::uuid IS NULL OR instrument_id=${input.instrumentId ?? null}::uuid)
        ORDER BY account_id,instrument_id LIMIT 500`,
      );
      return rows.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        instrumentId: row.instrument_id,
        instrumentVersionId: row.instrument_version_id,
        sourceRevision: String(row.source_revision),
        inventory: row.state,
        ...(input.valuation ? { valuation: valueInventory(row.state, input.valuation) } : {}),
      }));
    });
  }

  async function fees(context: AuthorizationContext, input: { accountId?: string } = {}) {
    return platform.withWorkspaceContext(context, async (tx) => {
      const rows = await queryRows<{ currency_id: string; total: string }>(
        tx,
        sql`SELECT f.currency_id,sum(f.amount)::text AS total
        FROM app.fees f WHERE f.workspace_id=${context.workspaceId}::uuid
          AND (${input.accountId ?? null}::uuid IS NULL OR f.account_id=${input.accountId ?? null}::uuid)
          AND (f.execution_id IS NULL OR NOT EXISTS (SELECT 1 FROM app.execution_supersessions s
            WHERE s.workspace_id=f.workspace_id AND s.original_execution_id=f.execution_id)) GROUP BY f.currency_id ORDER BY f.currency_id`,
      );
      return rows.map((row) => ({ currencyId: row.currency_id, amount: decimal(row.total) }));
    });
  }

  async function campaignInventory(
    context: AuthorizationContext,
    input: {
      accountId?: string;
      instrumentId?: string;
      tradeId?: string;
      valuation?: InventoryValuationInput;
    } = {},
  ) {
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const [state] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT revision FROM app.financial_state
        WHERE workspace_id=${context.workspaceId}::uuid`,
        );
        return campaignInventoryAt(tx, context, input, String(state?.revision ?? 0));
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  return {
    createCashBucket,
    recordCashMovement,
    recordFee,
    recordFxConversion,
    moveCashBuckets,
    recordHoldingTransfer,
    attributeFee,
    recordExecution,
    recordOpeningLot,
    correctExecution,
    allocateExecution,
    cashBalances,
    executions,
    executionAllocations,
    positions,
    fees,
    campaignInventory,
  };
}

export type FinancialLedger = ReturnType<typeof createFinancialLedger>;
