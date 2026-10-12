import { sql, type DbTransaction } from '@journal/database';
import {
  financialSchemaComponents,
  journalFinancialSnapshotSchema,
  type JournalCalculatedMetric,
  type JournalCommitmentResponse,
  type JournalFinancialLeg,
  type JournalFinancialSnapshot,
  type JournalPlanVersionResponse,
  type JournalTimelineEvent,
} from '@journal/contracts';
import {
  allocateDecimal,
  availableJournalMetric,
  decimal,
  decimalValue,
  FinancialArithmeticError,
  INVENTORY_CALCULATION_MANIFEST,
  InventoryError,
  journalWeightedPrice,
  originalRiskR,
  sumDecimals,
  unavailableJournalMetric,
  valueInventory,
  type InventoryMetric,
  type InventoryReplayResult,
} from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import type { TradeDto } from '../financial/catalog-types.js';
import { campaignInventoryAt } from '../financial/ledger.js';
import { queryRows } from '../financial/repository.js';
import { financialInstantMicros } from '../financial/reference-data.js';

type LegRow = {
  id: string;
  account_id: string;
  account_name: string;
  instrument_id: string;
  instrument_version_id: string;
  instrument_name: string;
  quantity_unit: string;
  quote_currency_id: string | null;
  settlement_currency_id: string | null;
  multiplier_raw: string;
  direction: 'long' | 'short';
};
type FillRow = {
  leg_id: string;
  execution_id: string;
  allocation_id: string;
  source_revision: number;
  economic_at: string;
  side: 'buy' | 'sell';
  quantity_raw: string;
  price_raw: string | null;
  principal_raw: string | null;
  principal_currency_id: string | null;
  allocated_principal: string | null;
  quantity_unit: string;
  quote_currency_id: string | null;
  multiplier_raw: string;
  all_allocations: { id: string; weight: string }[];
};
type FeeRow = {
  id: string;
  leg_id: string;
  execution_id: string;
  currency_id: string;
  amount_raw: string;
  economic_at: string;
};

function inventoryMetric(
  metric: InventoryMetric | undefined,
  unit: string,
  currencyId: string | null,
  coverageReasons: readonly string[] = [],
): JournalCalculatedMetric {
  if (!metric)
    return unavailableJournalMetric(
      ['missing_campaign_population', ...coverageReasons],
      unit,
      currencyId,
    );
  if (metric.status !== 'available' || metric.value === null || coverageReasons.length)
    return unavailableJournalMetric(
      [
        ...metric.reasons,
        ...coverageReasons,
        ...(metric.status === 'unsupported' ? ['unsupported_inventory'] : []),
        ...(metric.reasons.length === 0 && coverageReasons.length === 0
          ? ['incomplete_campaign_result']
          : []),
      ],
      unit,
      currencyId,
    );
  return availableJournalMetric(metric.value, unit, currencyId);
}

/** Existing source pins are the only permitted cross-currency translation evidence. */
export function journalRiskCurrencyResult(
  inventory: InventoryReplayResult | undefined,
  currencyId: string,
  coverageReasons: readonly string[] = [],
): JournalCalculatedMetric {
  if (!inventory) return inventoryMetric(undefined, 'money', currencyId, coverageReasons);
  if (inventory.scope.settlementCurrencyId === currencyId)
    return inventoryMetric(inventory.realizedNet, 'money', currencyId, coverageReasons);
  try {
    const valuation = valueInventory(inventory, { mark: null, reportingCurrencyId: currencyId });
    return inventoryMetric(valuation.realizedReportingNet, 'money', currencyId, coverageReasons);
  } catch (error) {
    if (error instanceof FinancialArithmeticError || error instanceof InventoryError)
      return unavailableJournalMetric(
        [
          error.code === 'numeric_overflow' ? error.code : 'incompatible_pinned_historical_fx',
          ...coverageReasons,
        ],
        'money',
        currencyId,
      );
    throw error;
  }
}

/**
 * Read only, inside the caller's coherent tenant transaction. Latest effective source facts
 * determine actual fills; a manual price observation never enters this calculation.
 */
export async function readJournalFinancialSnapshot(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: {
    trade: TradeDto;
    originalPlan: JournalPlanVersionResponse | null;
    commitment: JournalCommitmentResponse | null;
    sourceRevision: string;
  },
): Promise<JournalFinancialSnapshot> {
  const { trade, sourceRevision } = input;
  const legRows = await queryRows<LegRow>(
    tx,
    sql`
    SELECT l.id,l.account_id,a.name AS account_name,l.instrument_version_id,
      v.instrument_id,i.name AS instrument_name,v.quantity_unit,v.quote_currency_id,
      v.settlement_currency_id,v.multiplier_raw,l.direction
    FROM app.trade_legs l JOIN app.accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
    JOIN app.instrument_versions v ON v.workspace_id=l.workspace_id AND v.id=l.instrument_version_id
    JOIN app.instruments i ON i.workspace_id=v.workspace_id AND i.id=v.instrument_id
    WHERE l.workspace_id=${context.workspaceId}::uuid AND l.trade_id=${trade.id}::uuid ORDER BY l.id`,
  );
  const fills = await queryRows<FillRow>(
    tx,
    sql`
    SELECT l.id AS leg_id,e.id AS execution_id,i.id AS allocation_id,e.source_revision,
      to_char(e.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at,
      e.side,i.quantity_raw,e.price_raw,e.principal_raw,e.principal_currency_id,
      i.payload->>'principal' AS allocated_principal,v.quantity_unit,v.quote_currency_id,v.multiplier_raw,
      (SELECT jsonb_agg(jsonb_build_object('id',coalesce(p.trade_leg_id::text,'unassigned'),'weight',p.quantity_raw))
        FROM app.allocation_items p WHERE p.workspace_id=s.workspace_id AND p.allocation_set_id=s.id) AS all_allocations
    FROM app.executions e
    JOIN app.instrument_versions v ON v.workspace_id=e.workspace_id AND v.id=e.instrument_version_id
    JOIN LATERAL (SELECT workspace_id,id FROM app.allocation_sets WHERE workspace_id=e.workspace_id
      AND execution_id=e.id AND source_revision<=${sourceRevision}::integer ORDER BY version DESC LIMIT 1) s ON true
    JOIN app.allocation_items i ON i.workspace_id=s.workspace_id AND i.allocation_set_id=s.id
    JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
    WHERE e.workspace_id=${context.workspaceId}::uuid AND l.trade_id=${trade.id}::uuid
      AND e.source_revision<=${sourceRevision}::integer AND i.quantity_raw::numeric>0
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions x WHERE x.workspace_id=e.workspace_id
        AND x.original_execution_id=e.id AND x.source_revision<=${sourceRevision}::integer)
    ORDER BY e.economic_at,e.ordering_key::numeric,e.id,i.id`,
  );
  const feeRows = await queryRows<FeeRow>(
    tx,
    sql`
    SELECT f.id,c.trade_leg_id AS leg_id,f.execution_id,f.currency_id,c.amount_raw,
      to_char(f.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at
    FROM app.fees f JOIN app.executions e ON e.workspace_id=f.workspace_id AND e.id=f.execution_id
    JOIN LATERAL (SELECT id FROM app.cost_attribution_sets WHERE workspace_id=f.workspace_id AND fee_id=f.id
      AND axis='campaign' AND source_revision<=${sourceRevision}::integer ORDER BY version DESC LIMIT 1) s ON true
    JOIN app.cost_allocations c ON c.workspace_id=f.workspace_id AND c.attribution_set_id=s.id
    JOIN app.trade_legs l ON l.workspace_id=c.workspace_id AND l.id=c.trade_leg_id
    WHERE f.workspace_id=${context.workspaceId}::uuid AND l.trade_id=${trade.id}::uuid
      AND f.source_revision<=${sourceRevision}::integer AND e.source_revision<=${sourceRevision}::integer
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions x WHERE x.workspace_id=e.workspace_id
        AND x.original_execution_id=e.id AND x.source_revision<=${sourceRevision}::integer)
    ORDER BY f.economic_at,f.id,c.id`,
  );
  // Standalone charges currently have inventory attribution, not campaign attribution. Surface
  // that uncertainty instead of silently omitting them or charging another campaign twice.
  const standalone = await queryRows<{ leg_id: string }>(
    tx,
    sql`
    SELECT DISTINCT l.id AS leg_id FROM app.trade_legs l
    JOIN app.fees f ON f.workspace_id=l.workspace_id AND f.account_id=l.account_id
    WHERE l.workspace_id=${context.workspaceId}::uuid AND l.trade_id=${trade.id}::uuid
      AND f.execution_id IS NULL AND f.source_revision<=${sourceRevision}::integer
      AND (EXISTS (SELECT 1 FROM app.inventory_events ev
        JOIN app.instrument_versions v ON v.workspace_id=ev.workspace_id AND v.id=ev.instrument_version_id
        JOIN app.instrument_versions lv ON lv.workspace_id=l.workspace_id AND lv.id=l.instrument_version_id
        WHERE ev.workspace_id=f.workspace_id AND ev.account_id=l.account_id AND v.instrument_id=lv.instrument_id
          AND ev.kind='cost-attribution' AND ev.payload->'cost'->>'id'=f.id::text
          AND ev.source_revision<=${sourceRevision}::integer)
      OR (NOT EXISTS (SELECT 1 FROM app.inventory_events scoped
        WHERE scoped.workspace_id=f.workspace_id AND scoped.kind='cost-attribution'
          AND scoped.payload->'cost'->>'id'=f.id::text AND scoped.source_revision<=${sourceRevision}::integer)
      AND f.economic_at BETWEEN (SELECT min(e.economic_at) FROM app.executions e
        JOIN LATERAL (SELECT id FROM app.allocation_sets WHERE workspace_id=e.workspace_id AND execution_id=e.id
          AND source_revision<=${sourceRevision}::integer ORDER BY version DESC LIMIT 1) s ON true
        JOIN app.allocation_items i ON i.workspace_id=e.workspace_id AND i.allocation_set_id=s.id
        WHERE e.workspace_id=l.workspace_id AND i.trade_leg_id=l.id AND i.quantity_raw::numeric>0
          AND e.source_revision<=${sourceRevision}::integer AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions x
            WHERE x.workspace_id=e.workspace_id AND x.original_execution_id=e.id AND x.source_revision<=${sourceRevision}::integer))
      AND (SELECT max(e.economic_at) FROM app.executions e
        JOIN LATERAL (SELECT id FROM app.allocation_sets WHERE workspace_id=e.workspace_id AND execution_id=e.id
          AND source_revision<=${sourceRevision}::integer ORDER BY version DESC LIMIT 1) s ON true
        JOIN app.allocation_items i ON i.workspace_id=e.workspace_id AND i.allocation_set_id=s.id
        WHERE e.workspace_id=l.workspace_id AND i.trade_leg_id=l.id AND i.quantity_raw::numeric>0
          AND e.source_revision<=${sourceRevision}::integer AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions x
            WHERE x.workspace_id=e.workspace_id AND x.original_execution_id=e.id AND x.source_revision<=${sourceRevision}::integer))))`,
  );
  const cashRows = await queryRows<{
    id: string;
    execution_id: string;
    economic_at: string;
    currency_id: string;
    amount_raw: string;
  }>(
    tx,
    sql`
    SELECT p.id,e.payload->>'executionId' AS execution_id,p.currency_id,p.amount_raw,
      to_char(e.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at
    FROM app.postings p JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
    JOIN app.executions x ON x.workspace_id=e.workspace_id AND x.id::text=e.payload->>'executionId'
    WHERE p.workspace_id=${context.workspaceId}::uuid AND p.cash_bucket_id IS NOT NULL
      AND e.source_revision<=${sourceRevision}::integer AND e.payload->>'feeId' IS NULL
      AND x.source_revision<=${sourceRevision}::integer
      AND EXISTS (SELECT 1 FROM LATERAL (SELECT id FROM app.allocation_sets
        WHERE workspace_id=x.workspace_id AND execution_id=x.id AND source_revision<=${sourceRevision}::integer
        ORDER BY version DESC LIMIT 1) a
        JOIN app.allocation_items i ON i.workspace_id=x.workspace_id AND i.allocation_set_id=a.id
        JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
        WHERE l.trade_id=${trade.id}::uuid AND i.quantity_raw::numeric>0)
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions s WHERE s.workspace_id=x.workspace_id
        AND s.original_execution_id=x.id AND s.source_revision<=${sourceRevision}::integer)
    ORDER BY e.economic_at,p.id`,
  );
  // The ledger's book query is bounded. Scope each replay to a unique relevant book so
  // unrelated workspace books cannot exhaust that bound and hide this trade's inventory.
  const books = new Map<string, { accountId: string; instrumentId: string }>();
  for (const leg of legRows)
    books.set(`${leg.account_id}:${leg.instrument_id}`, {
      accountId: leg.account_id,
      instrumentId: leg.instrument_id,
    });
  const populations: Awaited<ReturnType<typeof campaignInventoryAt>>['populations'] = [];
  for (const book of books.values()) {
    const replay = await campaignInventoryAt(
      tx,
      context,
      { ...book, tradeId: trade.id },
      sourceRevision,
    );
    populations.push(...replay.populations);
  }
  const timeline: JournalTimelineEvent[] = [];
  const risk = input.originalPlan?.definition.initialRisk ?? null;
  const riskResults: JournalCalculatedMetric[] = [];
  const coverageReasons: string[] = [];
  const legs: JournalFinancialLeg[] = legRows.map((leg) => {
    const related = fills.filter((fill) => fill.leg_id === leg.id);
    const population = populations.find((candidate) => candidate.tradeLegId === leg.id);
    const inventory = population?.inventory;
    if (
      related.some(
        (fill) =>
          fill.quantity_unit !== leg.quantity_unit ||
          fill.quote_currency_id !== leg.quote_currency_id ||
          !decimalValue(fill.multiplier_raw).eq(leg.multiplier_raw),
      )
    )
      coverageReasons.push('incompatible_execution_units');
    const standaloneReasons = standalone.some((fee) => fee.leg_id === leg.id)
      ? ['standalone_costs_require_campaign_attribution']
      : [];
    const entry = (fill: FillRow) => (leg.direction === 'long') === (fill.side === 'buy');
    const weightedPrice = (selected: FillRow[]) =>
      journalWeightedPrice(
        selected.map((fill) => ({
          quantity: fill.quantity_raw,
          price: fill.price_raw,
          compatible:
            fill.quantity_unit === leg.quantity_unit &&
            fill.quote_currency_id === leg.quote_currency_id &&
            decimalValue(fill.multiplier_raw).eq(leg.multiplier_raw),
        })),
        `price/${leg.quantity_unit}`,
        leg.quote_currency_id,
      );
    const quantity = (selected: FillRow[]) => {
      if (!related.length)
        return unavailableJournalMetric(['no_effective_fills'], leg.quantity_unit, null);
      if (selected.some((fill) => fill.quantity_unit !== leg.quantity_unit))
        return unavailableJournalMetric(['incompatible_quantity_units'], leg.quantity_unit, null);
      try {
        return availableJournalMetric(
          sumDecimals(selected.map((fill) => fill.quantity_raw)),
          leg.quantity_unit,
          null,
        );
      } catch (error) {
        if (error instanceof FinancialArithmeticError)
          return unavailableJournalMetric([error.code], leg.quantity_unit, null);
        throw error;
      }
    };
    const executions = related.map((fill) => ({
      executionId: fill.execution_id,
      allocationId: fill.allocation_id,
      sourceRevision: String(fill.source_revision),
      economicAt: fill.economic_at,
      side: fill.side,
      role: entry(fill) ? ('entry' as const) : ('exit' as const),
      quantity: decimal(fill.quantity_raw),
      price: fill.price_raw === null ? null : decimal(fill.price_raw),
      bookedPrincipal:
        fill.allocated_principal ??
        (fill.principal_raw === null
          ? null
          : allocateDecimal(fill.principal_raw, fill.all_allocations).find(
              (part) => part.id === leg.id,
            )!.amount),
      principalCurrencyId: fill.principal_currency_id,
    }));
    const fees = feeRows
      .filter((fee) => fee.leg_id === leg.id)
      .map((fee) => ({
        feeId: fee.id,
        currencyId: fee.currency_id,
        amount: decimal(fee.amount_raw),
        chargedAt: fee.economic_at,
        executionId: fee.execution_id,
      }));
    for (const execution of executions)
      timeline.push({
        id: `execution:${execution.allocationId}`,
        kind: 'execution',
        economicAt: execution.economicAt,
        accountId: leg.account_id,
        legId: leg.id,
        executionId: execution.executionId,
        feeId: null,
        currencyId: leg.quote_currency_id,
        amount: null,
        quantity: execution.quantity,
        price: execution.price,
        allocationId: execution.allocationId,
      });
    for (const fee of fees)
      timeline.push({
        id: `fee:${fee.feeId}:${leg.id}`,
        kind: 'fee',
        economicAt: fee.chargedAt,
        accountId: leg.account_id,
        legId: leg.id,
        executionId: fee.executionId,
        feeId: fee.feeId,
        currencyId: fee.currencyId,
        amount: fee.amount,
        quantity: null,
        price: null,
        allocationId: null,
      });
    for (const fill of related)
      for (const cash of cashRows.filter((row) => row.execution_id === fill.execution_id)) {
        const amount = allocateDecimal(cash.amount_raw, fill.all_allocations).find(
          (part) => part.id === leg.id,
        )!.amount;
        timeline.push({
          id: `cash:${cash.id}:${fill.allocation_id}`,
          kind: 'cash',
          economicAt: cash.economic_at,
          accountId: leg.account_id,
          legId: leg.id,
          executionId: fill.execution_id,
          feeId: null,
          currencyId: cash.currency_id,
          amount,
          quantity: null,
          price: null,
          allocationId: fill.allocation_id,
        });
      }
    if (
      !inventory ||
      inventory.openQuantity.status !== 'available' ||
      inventory.openQuantity.value === null
    )
      coverageReasons.push('incomplete_campaign_inventory');
    else if (!decimalValue(inventory.openQuantity.value).isZero())
      coverageReasons.push('campaign_has_open_quantity');
    if (inventory?.unassignedCosts.some((cost) => !decimalValue(cost.amount).isZero()))
      coverageReasons.push('unassigned_campaign_costs');
    if (risk)
      riskResults.push(journalRiskCurrencyResult(inventory, risk.currencyId, standaloneReasons));
    return {
      legId: leg.id,
      accountId: leg.account_id,
      accountName: leg.account_name,
      instrumentId: leg.instrument_id,
      instrumentVersionId: leg.instrument_version_id,
      instrumentName: leg.instrument_name,
      quantityUnit: leg.quantity_unit,
      quoteCurrencyId: leg.quote_currency_id,
      settlementCurrencyId: leg.settlement_currency_id,
      direction: leg.direction,
      actualEntry: weightedPrice(related.filter(entry)),
      actualExit: weightedPrice(related.filter((fill) => !entry(fill))),
      enteredQuantity: quantity(related.filter(entry)),
      exitedQuantity: quantity(related.filter((fill) => !entry(fill))),
      openQuantity: inventoryMetric(inventory?.openQuantity, leg.quantity_unit, null),
      realizedGross: inventoryMetric(inventory?.realizedGross, 'money', leg.settlement_currency_id),
      realizedNet: inventoryMetric(
        inventory?.realizedNet,
        'money',
        leg.settlement_currency_id,
        standaloneReasons,
      ),
      costBasis: inventoryMetric(
        inventory?.netBasis,
        'money',
        leg.settlement_currency_id,
        standaloneReasons,
      ),
      fees,
      executions,
      lots: financialSchemaComponents.InventoryLot.array().parse(inventory?.lots ?? []),
      matches: financialSchemaComponents.InventoryMatch.array().parse(inventory?.matches ?? []),
    };
  });
  timeline.sort((a, b) => {
    const left = financialInstantMicros(a.economicAt);
    const right = financialInstantMicros(b.economicAt);
    return left === right ? a.id.localeCompare(b.id, 'en') : left < right ? -1 : 1;
  });
  return journalFinancialSnapshotSchema.parse({
    sourceRevision,
    definitionVersion: 'trade-journal-financial/1',
    manifest: INVENTORY_CALCULATION_MANIFEST,
    legs,
    timeline,
    rMultiple: {
      ...originalRiskR({
        originalRisk:
          risk && input.originalPlan
            ? {
                originalPlanId: input.originalPlan.id,
                amount: risk.amount,
                currencyId: risk.currencyId,
              }
            : null,
        commitment: input.commitment
          ? {
              timing: input.commitment.timing,
              committedAtMicros: String(financialInstantMicros(input.commitment.committedAt)),
            }
          : null,
        earliestExecutionMicros: fills[0]
          ? String(financialInstantMicros(fills[0].economic_at))
          : null,
        completed: trade.status === 'closed',
        closureReviewRequired: trade.closureReviewRequired,
        legResults: riskResults,
        coverageReasons,
        financialSourceRevision: sourceRevision,
      }),
      originalPlanId: input.originalPlan?.id ?? null,
    },
  });
}
