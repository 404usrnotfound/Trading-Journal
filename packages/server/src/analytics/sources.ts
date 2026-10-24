import { createHash } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import type {
  AnalyticsReportRequest,
  JournalPlanDefinition,
  JournalDocument,
  SuppliedReference,
} from '@journal/contracts';
import {
  allocateDecimal,
  decimal,
  decimalValue,
  FinancialArithmeticError,
  INVENTORY_CALCULATION_MANIFEST,
  InventoryError,
  originalRiskR,
  quantizeDecimal,
  translateAmount,
  replayCampaignInventory,
  sumDecimals,
  valueInventory,
  type AnalyticsCampaign,
  type AnalyticsDimensionValue,
  type AnalyticsSourceMetric,
  type InventoryCampaignAllocation,
  type InventoryCost,
  type InventoryMetric,
  type InventoryReplayResult,
  type PinnedInventoryRate,
} from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import { financialConflict, financialInvalid, queryRows } from '../financial/repository.js';
import { componentReference, selectComponents } from '../supplied/selection.js';
import { canonicalFinancialInstant } from '../financial/observations.js';
import { financialInstantMicros } from '../financial/reference-data.js';
import { journalRiskCurrencyResult } from '../journal/financial.js';
import { createAnalyticsFxSelector } from './fx.js';
import { analyticsCohort } from './cohort.js';
import { readReportFxEvidence } from '../financial/fx-evidence.js';

type LegRow = {
  id: string;
  trade_id: string;
  title: string;
  account_id: string;
  account_name: string;
  broker_id: string | null;
  broker_name: string | null;
  environment: 'live' | 'paper';
  holding_mode: string | null;
  instrument_id: string;
  instrument_name: string;
  family: string;
  subtype: string;
  instrument_version_id: string;
  quantity_unit: string;
  quote_currency_id: string | null;
  settlement_currency_id: string | null;
  currency_code: string | null;
  multiplier_raw: string | null;
  capability: string;
  version_metadata: Record<string, unknown>;
  direction: 'long' | 'short';
  closure_id: string | null;
  strategy_id: string | null;
  strategy_version_id: string | null;
  strategy_name: string | null;
  strategy_version: number | null;
  strategy_hash: string | null;
  strategy_definition: { setups: { id: string; name: string }[] } | null;
  strategy_link_timing: 'recorded-with-trade' | 'retrospective' | null;
  journal_revision_id: string | null;
  journal_hash: string | null;
  journal_document: JournalDocument | null;
  original_plan_id: string | null;
  original_plan_hash: string | null;
  original_plan: JournalPlanDefinition | null;
  committed_at: string | null;
  commitment_timing: 'pre-trade' | 'retrospective' | null;
  latest_plan_id: string | null;
  latest_plan_hash: string | null;
  latest_plan: JournalPlanDefinition | null;
};
type FillRow = {
  leg_id: string;
  id: string;
  allocation_id: string;
  allocation_set_id: string;
  instrument_version_id: string;
  source_revision: number;
  side: 'buy' | 'sell';
  allocated_quantity: string;
  principal_raw: string | null;
  allocated_principal: string | null;
  price_raw: string | null;
  economic_at: string;
  ordering_key: string;
  multiplier_raw: string | null;
  quantity_unit: string;
  settlement_currency_id: string | null;
  quote_currency_id: string | null;
  capability: string;
  version_metadata: Record<string, unknown>;
  payload: { costsComplete?: boolean; basisReportingFx?: PinnedInventoryRate };
};
type FeeRow = {
  id: string;
  leg_id: string;
  execution_id: string;
  currency_id: string;
  amount_raw: string;
  economic_at: string;
  payload: { nativeFx?: PinnedInventoryRate; reportingFx?: PinnedInventoryRate };
};
type PriceRow = {
  id: string;
  instrument_version_id: string;
  price_raw: string;
  observed_at: string;
  source: string;
  instrument_id: string;
  quantity_unit: string;
  quote_currency_id: string | null;
  settlement_currency_id: string | null;
  currency_id: string;
  multiplier_raw: string | null;
  capability: string;
  version_metadata: Record<string, unknown>;
};
export type AnalyticsProvenance = {
  suppliedResult?: SuppliedReference;
  originalPlanId: string | null;
  originalPlanHash: string | null;
  metadataPlanId: string | null;
  metadataPlanHash: string | null;
  metadataPlanSource: 'original-commitment' | 'latest-published' | null;
  journalRevisionId: string | null;
  journalRevisionHash: string | null;
  strategyId: string | null;
  strategyVersionId: string | null;
  strategyVersionHash: string | null;
  strategyLinkTiming: 'recorded-with-trade' | 'retrospective' | null;
  closureId: string | null;
  legIds: string[];
  effectiveExecutionIds: string[];
  allocationSetIds: string[];
  feeIds: string[];
  instrumentVersionIds: string[];
  markIds: string[];
  fxObservationIds: string[];
};
export type AnalyticsSourceRecord = AnalyticsCampaign & {
  title: string;
  provenance: AnalyticsProvenance;
};

const idsBinding = (ids: readonly string[]) => `{${ids.join(',')}}`;
const instantSql = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);
const unique = (values: readonly string[]) => [...new Set(values)].sort();
function bounded<Row>(rows: Row[], maximum: number): Row[] {
  if (rows.length > maximum)
    throw financialConflict(
      'ANALYTICS_SCOPE_TOO_LARGE',
      'Select fewer accounts before calculating this analytics report.',
    );
  return rows;
}
function indexed<Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, Row[]> {
  const result = new Map<string, Row[]>();
  for (const row of rows) {
    const id = key(row);
    const group = result.get(id);
    if (group) group.push(row);
    else result.set(id, [row]);
  }
  return result;
}
function exposureWindows(fills: readonly FillRow[], direction: 'long' | 'short', to: string) {
  const windows: { from: bigint; to: bigint }[] = [];
  let quantity = decimalValue('0');
  let start: bigint | null = null;
  for (const fill of fills) {
    const at = financialInstantMicros(fill.economic_at);
    const opening = (direction === 'long') === (fill.side === 'buy');
    if (quantity.isZero()) start = at;
    quantity = opening
      ? quantity.plus(fill.allocated_quantity)
      : quantity.minus(fill.allocated_quantity);
    if (quantity.isZero() && start !== null) {
      windows.push({ from: start, to: at });
      start = null;
    }
  }
  if (start !== null) windows.push({ from: start, to: financialInstantMicros(to) });
  return windows;
}
function compatibleVersion(
  source: Pick<
    LegRow,
    | 'quantity_unit'
    | 'quote_currency_id'
    | 'settlement_currency_id'
    | 'multiplier_raw'
    | 'capability'
    | 'version_metadata'
  >,
  leg: LegRow,
) {
  return (
    source.quantity_unit === leg.quantity_unit &&
    source.quote_currency_id === leg.quote_currency_id &&
    source.settlement_currency_id === leg.settlement_currency_id &&
    source.multiplier_raw === leg.multiplier_raw &&
    source.capability === leg.capability &&
    ['priceConvention', 'settlementStyle', 'shortConvention', 'carryCostPolicy'].every(
      (key) => source.version_metadata[key] === leg.version_metadata[key],
    )
  );
}
function unavailable(
  reasons: readonly string[],
  references: readonly string[] = [],
): AnalyticsSourceMetric {
  return {
    state: 'unavailable',
    value: null,
    reasons: unique(reasons),
    missingReferences: unique(references),
  };
}
function available(value: string): AnalyticsSourceMetric {
  return { state: 'available', value: decimal(value), reasons: [], missingReferences: [] };
}
function fromInventory(
  metric: InventoryMetric,
  references: readonly string[] = [],
  extra: readonly string[] = [],
): AnalyticsSourceMetric {
  if (metric.status !== 'available' || metric.value === null || extra.length)
    return unavailable(
      [
        ...metric.reasons,
        ...extra,
        ...(metric.status === 'unsupported' ? ['unsupported_inventory'] : []),
      ],
      references,
    );
  return available(metric.value);
}
function total(metrics: readonly AnalyticsSourceMetric[]): AnalyticsSourceMetric {
  const missing = metrics.filter((metric) => metric.state !== 'available' || metric.value === null);
  if (missing.length)
    return unavailable(
      missing.flatMap((metric) => metric.reasons),
      missing.flatMap((metric) => metric.missingReferences),
    );
  try {
    return available(sumDecimals(metrics.map((metric) => metric.value!)));
  } catch (error) {
    if (error instanceof FinancialArithmeticError) return unavailable([error.code]);
    throw error;
  }
}
function sourceRate(
  rate: PinnedInventoryRate | undefined,
  base: string,
  quote: string,
): string | null {
  if (base === quote) return '1';
  if (
    !rate ||
    (rate.baseCurrencyId !== undefined && rate.baseCurrencyId !== base) ||
    (rate.quoteCurrencyId !== undefined && rate.quoteCurrencyId !== quote)
  )
    return null;
  return decimalValue(rate.rate).gt('0') ? rate.rate : null;
}

/** Display translation is separate from the immutable, source-pinned original-risk numerator. */
function historicalDisplayRate(input: {
  base: string;
  quote: string;
  at: string;
  pins: readonly (PinnedInventoryRate | undefined)[];
  query: AnalyticsReportRequest;
  selectRate: ReturnType<typeof createAnalyticsFxSelector>;
  selectedIds: string[];
  missingReferences: string[];
}): PinnedInventoryRate | undefined {
  if (input.base === input.quote) return undefined;
  for (const pin of input.pins) {
    if (
      pin?.baseCurrencyId === input.base &&
      pin.quoteCurrencyId === input.quote &&
      sourceRate(pin, input.base, input.quote) !== null
    ) {
      input.selectedIds.push(pin.observationId);
      return pin;
    }
  }
  const selected = input.selectRate(input.base, input.quote, canonicalFinancialInstant(input.at));
  if (selected.state === 'unavailable') {
    input.missingReferences.push(...selected.missingReferences);
    return undefined;
  }
  input.selectedIds.push(...selected.value.observationIds);
  return {
    observationId: selected.value.observationIds[0]!,
    rate: selected.value.rate,
    baseCurrencyId: input.base,
    quoteCurrencyId: input.quote,
  };
}
function feeMetric(
  costs: readonly InventoryCost[],
  currency: string,
  complete: boolean,
  reasons: readonly string[],
): AnalyticsSourceMetric {
  if (!complete || reasons.length)
    return unavailable(
      [...reasons, ...(!complete ? ['incomplete_costs'] : [])],
      costs.map((cost) => cost.id),
    );
  const translated = costs.map((cost) => {
    if (decimalValue(cost.amount).isZero()) return available('0');
    const rate = sourceRate(cost.reportingFx, cost.currencyId, currency);
    return rate === null
      ? unavailable(['missing_fee_fx'], [cost.id])
      : available(quantizeDecimal(decimalValue(cost.amount).times(rate)));
  });
  return total(translated);
}
function groupValues(
  values: readonly (AnalyticsDimensionValue | null)[],
): AnalyticsDimensionValue[] {
  return [
    ...new Map(
      values
        .filter((value): value is AnalyticsDimensionValue => value !== null)
        .map((value) => [value.key, value]),
    ).values(),
  ].sort((a, b) => a.key.localeCompare(b.key, 'en'));
}
function label(value: string | null | undefined): AnalyticsDimensionValue[] {
  return value?.trim() ? [{ key: value.trim(), label: value.trim() }] : [];
}
function marketConditionDimension(value: string | null | undefined): AnalyticsDimensionValue[] {
  const text = value?.trim();
  if (!text) return [];
  const characters = [...text];
  return [
    {
      key: `sha256:${createHash('sha256').update(text).digest('hex')}`,
      label: characters.length > 160 ? `${characters.slice(0, 160).join('')}…` : text,
    },
  ];
}
function calendarDimensions(entryAt: string | null, timezone: string) {
  if (!entryAt) return { weekday: [], hour: [] };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(entryAt));
  const weekday = parts.find((part) => part.type === 'weekday')!.value;
  const hour = parts.find((part) => part.type === 'hour')!.value;
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return {
    weekday: [{ key: String(weekdays.indexOf(weekday) + 1), label: weekday }],
    hour: [{ key: String(Number(hour)), label: `${hour}:00` }],
  };
}

/** Source facts, closure evidence and journal/version metadata share the caller's read snapshot. */
export async function readAnalyticsSources(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: {
    query: AnalyticsReportRequest;
    sourceRevision: string;
    metadataAsOf: string;
    timezone: string;
  },
): Promise<AnalyticsSourceRecord[]> {
  const { query, sourceRevision: revision, metadataAsOf, timezone } = input;
  let legs = bounded(
    await queryRows<LegRow>(
      tx,
      sql`
    SELECT l.id,l.trade_id,t.title,l.account_id,a.name AS account_name,a.broker_id,b.name AS broker_name,
      a.environment,settings.holding_mode,v.instrument_id,i.name AS instrument_name,i.family,i.subtype,
      l.instrument_version_id,v.quantity_unit,v.quote_currency_id,v.settlement_currency_id,
      c.code AS currency_code,v.multiplier_raw,v.capability,v.payload AS version_metadata,l.direction,closure.id AS closure_id,
      link.strategy_id,link.strategy_version_id,sv.definition->>'name' AS strategy_name,
      sv.version AS strategy_version,sv.definition_hash AS strategy_hash,sv.definition AS strategy_definition,
      link.timing AS strategy_link_timing,jr.id AS journal_revision_id,jr.document_hash AS journal_hash,jr.document AS journal_document,
      commitment.original_plan_id,original.definition_hash AS original_plan_hash,original.definition AS original_plan,
      ${instantSql('commitment.committed_at')} AS committed_at,commitment.timing AS commitment_timing,
      published.id AS latest_plan_id,published.definition_hash AS latest_plan_hash,published.definition AS latest_plan
    FROM app.trade_legs l JOIN app.trades t ON t.workspace_id=l.workspace_id AND t.id=l.trade_id
    JOIN app.accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
    LEFT JOIN app.brokers b ON b.workspace_id=a.workspace_id AND b.id=a.broker_id
    JOIN app.instrument_versions v ON v.workspace_id=l.workspace_id AND v.id=l.instrument_version_id
    JOIN app.instruments i ON i.workspace_id=v.workspace_id AND i.id=v.instrument_id
    LEFT JOIN app.currencies c ON c.workspace_id=v.workspace_id AND c.id=v.settlement_currency_id
    LEFT JOIN LATERAL (SELECT holding_mode FROM app.account_settings_versions s
      WHERE s.workspace_id=a.workspace_id AND s.account_id=a.id AND s.effective_at<=${query.to}::timestamptz
      ORDER BY s.effective_at DESC,s.version DESC LIMIT 1) settings ON true
    LEFT JOIN LATERAL (SELECT id FROM app.trade_closures x WHERE x.workspace_id=t.workspace_id AND x.trade_id=t.id
      AND x.source_revision<=${revision}::integer ORDER BY x.source_revision DESC LIMIT 1) closure ON true
    LEFT JOIN app.trade_strategy_links link ON link.workspace_id=t.workspace_id AND link.trade_id=t.id AND link.created_at<=${metadataAsOf}::timestamptz
    LEFT JOIN app.strategy_versions sv ON sv.workspace_id=link.workspace_id AND sv.id=link.strategy_version_id
    LEFT JOIN LATERAL (SELECT id,document_hash,document FROM app.journal_revisions r
      WHERE r.workspace_id=t.workspace_id AND r.trade_id=t.id AND r.created_at<=${metadataAsOf}::timestamptz ORDER BY revision DESC LIMIT 1) jr ON true
    LEFT JOIN app.journal_plan_commitments commitment ON commitment.workspace_id=t.workspace_id AND commitment.trade_id=t.id
      AND commitment.committed_at<=${metadataAsOf}::timestamptz
    LEFT JOIN app.journal_plan_versions original ON original.workspace_id=commitment.workspace_id AND original.id=commitment.original_plan_id
    LEFT JOIN LATERAL (SELECT id,definition_hash,definition FROM app.journal_plan_versions p
      WHERE p.workspace_id=t.workspace_id AND p.trade_id=t.id AND p.created_at<=${metadataAsOf}::timestamptz ORDER BY version DESC LIMIT 1) published ON true
    WHERE l.workspace_id=${context.workspaceId}::uuid
      AND NOT EXISTS (SELECT 1 FROM app.financial_commands added WHERE added.workspace_id=l.workspace_id
        AND added.kind='trade.leg-added' AND added.result->>'id'=l.id::text AND added.source_revision>${revision}::integer)
      AND EXISTS (SELECT 1 FROM app.trade_legs selected WHERE selected.workspace_id=t.workspace_id
        AND selected.trade_id=t.id AND selected.account_id=ANY(${idsBinding(query.accountIds)}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM app.financial_commands added WHERE added.workspace_id=selected.workspace_id
          AND added.kind='trade.leg-added' AND added.result->>'id'=selected.id::text AND added.source_revision>${revision}::integer))
      AND EXISTS (SELECT 1 FROM app.allocation_items allocated JOIN app.allocation_sets aset
        ON aset.workspace_id=allocated.workspace_id AND aset.id=allocated.allocation_set_id
        JOIN app.executions e ON e.workspace_id=aset.workspace_id AND e.id=aset.execution_id
        JOIN app.trade_legs effective_leg ON effective_leg.workspace_id=allocated.workspace_id AND effective_leg.id=allocated.trade_leg_id
        WHERE effective_leg.workspace_id=t.workspace_id AND effective_leg.trade_id=t.id
          AND e.source_revision<=${revision}::integer AND aset.source_revision<=${revision}::integer
          AND e.economic_at<=${query.to}::timestamptz AND allocated.quantity>0
          AND NOT EXISTS (SELECT 1 FROM app.allocation_sets newer WHERE newer.workspace_id=aset.workspace_id
            AND newer.execution_id=aset.execution_id AND newer.version>aset.version AND newer.source_revision<=${revision}::integer)
          AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions s WHERE s.workspace_id=e.workspace_id
            AND s.original_execution_id=e.id AND s.source_revision<=${revision}::integer))
    ORDER BY t.id,l.id LIMIT 20001`,
    ),
    20000,
  );
  let campaignIds = unique(legs.map((leg) => leg.trade_id));
  if (!campaignIds.length) return [];
  let legIds = idsBinding(legs.map((leg) => leg.id));
  let fills = bounded(
    await queryRows<FillRow>(
      tx,
      sql`
    SELECT e.id,l.id AS leg_id,e.instrument_version_id,e.source_revision,e.side,
      i.id AS allocation_id,s.id AS allocation_set_id,i.quantity_raw AS allocated_quantity,
      e.principal_raw,i.payload->>'principal' AS allocated_principal,e.price_raw,
      ${instantSql('e.economic_at')} AS economic_at,e.ordering_key,e.payload,v.multiplier_raw,v.quantity_unit,
      v.quote_currency_id,v.settlement_currency_id,v.capability,v.payload AS version_metadata
    FROM app.executions e JOIN app.instrument_versions v ON v.workspace_id=e.workspace_id AND v.id=e.instrument_version_id
    JOIN LATERAL (SELECT workspace_id,id FROM app.allocation_sets WHERE workspace_id=e.workspace_id AND execution_id=e.id
      AND source_revision<=${revision}::integer ORDER BY version DESC LIMIT 1) s ON true
    JOIN app.allocation_items i ON i.workspace_id=e.workspace_id AND i.allocation_set_id=s.id
    JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
    WHERE e.workspace_id=${context.workspaceId}::uuid AND l.id=ANY(${legIds}::uuid[]) AND i.quantity>0
      AND e.source_revision<=${revision}::integer AND e.economic_at<=${query.to}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions supersession
        WHERE supersession.workspace_id=e.workspace_id AND supersession.original_execution_id=e.id AND supersession.source_revision<=${revision}::integer)
    ORDER BY e.economic_at,e.ordering_key::numeric,e.id,i.id LIMIT 50001`,
    ),
    50000,
  );
  const cohort = analyticsCohort(
    legs,
    fills,
    query.from,
    (leg, fill) =>
      leg.capability === 'native-linear' &&
      leg.holding_mode === 'netted' &&
      (leg.direction === 'long' || leg.family !== 'crypto_spot') &&
      (!fill ||
        (fill.capability === 'native-linear' &&
          fill.price_raw !== null &&
          fill.multiplier_raw !== null &&
          compatibleVersion(fill, leg))),
  );
  legs = legs.filter((leg) => cohort.has(leg.trade_id));
  campaignIds = unique(legs.map((leg) => leg.trade_id));
  bounded(campaignIds, 1000);
  if (!campaignIds.length) return [];
  const selectedLegs = new Set(legs.map((leg) => leg.id));
  fills = fills.filter((fill) => selectedLegs.has(fill.leg_id));
  legIds = idsBinding([...selectedLegs]);
  const fallbackSetIds = unique(
    fills
      .filter((fill) => fill.allocated_principal === null && fill.principal_raw !== null)
      .map((fill) => fill.allocation_set_id),
  );
  const fallbackWeights = fallbackSetIds.length
    ? bounded(
        await queryRows<{
          allocation_set_id: string;
          id: string;
          weight: string;
        }>(
          tx,
          sql`SELECT allocation_set_id,coalesce(trade_leg_id::text,'unassigned') AS id,quantity_raw AS weight
    FROM app.allocation_items WHERE workspace_id=${context.workspaceId}::uuid
      AND allocation_set_id=ANY(${idsBinding(fallbackSetIds)}::uuid[]) ORDER BY allocation_set_id,id LIMIT 50001`,
        ),
        50000,
      )
    : [];
  const weightsBySet = indexed(fallbackWeights, (weight) => weight.allocation_set_id);
  const fallbackPrincipalBySet = new Map<string, Map<string, string>>();
  for (const fill of fills) {
    if (
      fill.allocated_principal !== null ||
      fill.principal_raw === null ||
      fallbackPrincipalBySet.has(fill.allocation_set_id)
    )
      continue;
    fallbackPrincipalBySet.set(
      fill.allocation_set_id,
      new Map(
        allocateDecimal(fill.principal_raw, weightsBySet.get(fill.allocation_set_id) ?? []).map(
          (part) => [part.id, part.amount],
        ),
      ),
    );
  }
  const fees = bounded(
    await queryRows<FeeRow>(
      tx,
      sql`
    SELECT f.id,c.trade_leg_id AS leg_id,f.execution_id,f.currency_id,c.amount_raw,
      ${instantSql('f.economic_at')} AS economic_at,f.payload
    FROM app.fees f JOIN LATERAL (SELECT id FROM app.cost_attribution_sets WHERE workspace_id=f.workspace_id
      AND fee_id=f.id AND axis='campaign' AND source_revision<=${revision}::integer ORDER BY version DESC LIMIT 1) s ON true
    JOIN app.cost_allocations c ON c.workspace_id=f.workspace_id AND c.attribution_set_id=s.id
    JOIN app.executions e ON e.workspace_id=f.workspace_id AND e.id=f.execution_id
    WHERE f.workspace_id=${context.workspaceId}::uuid AND c.trade_leg_id=ANY(${legIds}::uuid[])
      AND f.source_revision<=${revision}::integer AND f.economic_at<=${query.to}::timestamptz
      AND e.source_revision<=${revision}::integer AND e.economic_at<=${query.to}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions x WHERE x.workspace_id=e.workspace_id
        AND x.original_execution_id=e.id AND x.source_revision<=${revision}::integer)
    ORDER BY f.economic_at,f.id,c.id LIMIT 50001`,
    ),
    50000,
  );
  const remainingFactBudget = 50000 - fills.length - fallbackWeights.length - fees.length;
  if (remainingFactBudget < 0)
    throw financialConflict(
      'ANALYTICS_SCOPE_TOO_LARGE',
      'Select fewer accounts before calculating this analytics report.',
    );
  const chargesWithoutAttribution = bounded(
    await queryRows<{
      id: string;
      account_id: string;
      economic_at: string;
      instrument_ids: string[] | null;
      allocations:
        { target: 'lot' | 'match' | 'unassigned'; targetId?: string; amount: string }[] | null;
      nested_allocation_count: string;
    }>(
      tx,
      sql`
    WITH charges AS (
      SELECT f.id,f.account_id,f.economic_at,
        CASE WHEN attributed.instrument_id IS NULL THEN NULL ELSE ARRAY[attributed.instrument_id] END AS instrument_ids,
        attributed.allocations
      FROM app.fees f LEFT JOIN LATERAL (SELECT v.instrument_id,ev.payload->'allocations' AS allocations
        FROM app.inventory_events ev JOIN app.instrument_versions v ON v.workspace_id=ev.workspace_id AND v.id=ev.instrument_version_id
        WHERE ev.workspace_id=f.workspace_id AND ev.kind='cost-attribution' AND ev.payload->'cost'->>'id'=f.id::text
          AND ev.source_revision<=${revision}::integer AND ev.economic_at<=${query.to}::timestamptz
        ORDER BY ev.source_revision DESC LIMIT 1) attributed ON true
      WHERE f.workspace_id=${context.workspaceId}::uuid AND f.execution_id IS NULL
        AND f.account_id=ANY(${idsBinding(unique(legs.map((leg) => leg.account_id)))}::uuid[])
        AND f.source_revision<=${revision}::integer AND f.economic_at<=${query.to}::timestamptz AND f.amount<>0
      UNION ALL
      SELECT c.id,c.account_id,c.economic_at,NULL::uuid[],NULL::jsonb
      FROM app.account_cash_events c
      WHERE c.workspace_id=${context.workspaceId}::uuid
        AND c.account_id=ANY(${idsBinding(unique(legs.map((leg) => leg.account_id)))}::uuid[])
        AND c.source_revision<=${revision}::integer AND c.economic_at<=${query.to}::timestamptz
        AND c.kind IN ('financing','interest-expense') AND c.amount<>0
        AND NOT EXISTS (SELECT 1 FROM app.ledger_events e JOIN app.ledger_events r
          ON r.workspace_id=e.workspace_id AND r.reversal_of_id=e.id
          WHERE e.workspace_id=c.workspace_id AND e.account_cash_event_id=c.id
            AND r.source_revision<=${revision}::integer)
    )
    SELECT id,account_id,${instantSql('economic_at')} AS economic_at,instrument_ids,
      (sum(coalesce(jsonb_array_length(allocations),0)) OVER ())::text AS nested_allocation_count,
      CASE WHEN sum(coalesce(jsonb_array_length(allocations),0)) OVER ()<=${remainingFactBudget}
        THEN allocations ELSE NULL END AS allocations
    FROM charges ORDER BY id LIMIT 10001`,
    ),
    10000,
  );
  const nestedAllocationCount = BigInt(
    chargesWithoutAttribution[0]?.nested_allocation_count ?? '0',
  );
  if (nestedAllocationCount > BigInt(remainingFactBudget))
    throw financialConflict(
      'ANALYTICS_SCOPE_TOO_LARGE',
      'Select fewer accounts before calculating this analytics report.',
    );
  const standaloneAllocationFacts = Number(nestedAllocationCount);
  const obligations = await queryRows<{ execution_id: string }>(
    tx,
    sql`
    SELECT DISTINCT assigned.id AS execution_id FROM app.executions assigned
    JOIN app.ledger_events e ON e.workspace_id=assigned.workspace_id
    LEFT JOIN app.fees fee ON fee.workspace_id=e.workspace_id AND fee.id=e.fee_id
    JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id
    JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id AND b.category='unsettled'
    WHERE assigned.workspace_id=${context.workspaceId}::uuid AND assigned.id=ANY(${idsBinding(unique(fills.map((fill) => fill.id)))}::uuid[])
      AND e.source_revision<=${revision}::integer AND e.economic_at<=${query.to}::timestamptz
      AND (e.execution_id=assigned.id OR fee.execution_id=assigned.id OR e.payload->>'executionId'=assigned.id::text)
    GROUP BY assigned.id,p.cash_bucket_id HAVING sum(p.amount)<>0`,
  );
  if (
    fills.length +
      fallbackWeights.length +
      fees.length +
      chargesWithoutAttribution.length +
      standaloneAllocationFacts +
      obligations.length >
    50000
  )
    throw financialConflict(
      'ANALYTICS_SCOPE_TOO_LARGE',
      'Select fewer accounts before calculating this analytics report.',
    );
  const prices = bounded(
    await queryRows<PriceRow>(
      tx,
      sql`
    SELECT o.id,o.instrument_version_id,o.price_raw,${instantSql('o.observed_at')} AS observed_at,o.source,
      o.currency_id,v.instrument_id,v.quantity_unit,v.quote_currency_id,v.settlement_currency_id,v.multiplier_raw,v.capability,v.payload AS version_metadata
    FROM app.price_observations o JOIN app.instrument_versions v ON v.workspace_id=o.workspace_id AND v.id=o.instrument_version_id
    WHERE o.workspace_id=${context.workspaceId}::uuid
      AND v.instrument_id=ANY(${idsBinding(unique(legs.map((leg) => leg.instrument_id)))}::uuid[])
      AND o.observed_at<=${query.to}::timestamptz AND COALESCE((o.payload->>'sourceRevision')::numeric,0)<=${revision}::integer
      AND NOT EXISTS (SELECT 1 FROM app.price_observations newer WHERE newer.workspace_id=o.workspace_id
        AND newer.supersedes_id=o.id AND COALESCE((newer.payload->>'sourceRevision')::numeric,0)<=${revision}::integer)
    ORDER BY o.observed_at,o.id LIMIT 10001`,
    ),
    10000,
  );
  const legCurrencies = new Map(legs.map((leg) => [leg.id, leg.settlement_currency_id]));
  const suppliedResults = await selectComponents(
    tx,
    context,
    query.suppliedCampaignResultIds,
    revision,
    'campaign-net-result',
  );
  const fxObservations = await readReportFxEvidence(tx, context, {
    pairs: [
      ...suppliedResults.map((value) => [value.currencyId, query.reportingCurrencyId] as const),
      ...legs.map((leg) => [leg.settlement_currency_id, query.reportingCurrencyId] as const),
      ...fees.flatMap(
        (fee) =>
          [
            [fee.currency_id, query.reportingCurrencyId],
            [fee.currency_id, legCurrencies.get(fee.leg_id) ?? null],
          ] as const,
      ),
    ],
    asOf: query.to,
    sourceRevision: revision,
    sourcePriority: query.fxPolicy.sourcePriority,
    scopeError: 'ANALYTICS_SCOPE_TOO_LARGE',
  });
  if (
    fills.length +
      fallbackWeights.length +
      fees.length +
      chargesWithoutAttribution.length +
      standaloneAllocationFacts +
      obligations.length +
      prices.length +
      fxObservations.length >
    50000
  )
    throw financialConflict(
      'ANALYTICS_SCOPE_TOO_LARGE',
      'Select fewer accounts before calculating this analytics report.',
    );
  const records: AnalyticsSourceRecord[] = [];
  const selectDisplayFx = createAnalyticsFxSelector(fxObservations, query.fxPolicy);
  const legById = new Map(legs.map((leg) => [leg.id, leg]));
  const legsByCampaign = indexed(legs, (leg) => leg.trade_id);
  const fillsByLeg = indexed(fills, (fill) => fill.leg_id);
  const fillsByCampaign = indexed(fills, (fill) => legById.get(fill.leg_id)!.trade_id);
  const feesByCampaign = indexed(fees, (fee) => legById.get(fee.leg_id)!.trade_id);
  const feesByLegExecution = indexed(fees, (fee) => `${fee.leg_id}:${fee.execution_id}`);
  const standaloneByAccount = indexed(chargesWithoutAttribution, (fee) => fee.account_id);
  const pricesByInstrument = indexed(prices, (price) => price.instrument_id);
  const unsettledExecutions = new Set(obligations.map((obligation) => obligation.execution_id));
  for (const campaignId of campaignIds) {
    const campaignLegs = legsByCampaign.get(campaignId)!;
    const first = campaignLegs[0]!;
    const relatedFills = fillsByCampaign.get(campaignId) ?? [];
    if (!relatedFills.length) continue;
    const relatedFees = feesByCampaign.get(campaignId) ?? [];
    const entryFills = relatedFills.filter(
      (fill) => (legById.get(fill.leg_id)!.direction === 'long') === (fill.side === 'buy'),
    );
    const entryAt = entryFills[0]?.economic_at ?? null;
    const lastAt = relatedFills.at(-1)!.economic_at;
    const closureReasons: string[] = [];
    const pnl = {
      gross: [] as AnalyticsSourceMetric[],
      net: [] as AnalyticsSourceMetric[],
      realized: [] as AnalyticsSourceMetric[],
      unrealized: [] as AnalyticsSourceMetric[],
      fees: [] as AnalyticsSourceMetric[],
    };
    const riskResults = [];
    const markIds: string[] = [],
      markVersionIds: string[] = [],
      fxIds: string[] = [];
    let nonflat = false;
    let reliableQuantity = true;
    for (const leg of campaignLegs) {
      const legFills = fillsByLeg.get(leg.id) ?? [];
      const windows = exposureWindows(legFills, leg.direction, query.to);
      const executionIds = new Set(legFills.map((fill) => fill.id));
      const standalone = (standaloneByAccount.get(leg.account_id) ?? []).filter((fee) => {
        if (fee.instrument_ids?.length && !fee.instrument_ids.includes(leg.instrument_id))
          return false;
        const targets =
          fee.allocations?.filter(
            (allocation) => allocation.targetId && !decimalValue(allocation.amount).isZero(),
          ) ?? [];
        if (
          targets.some((allocation) =>
            allocation.targetId!.split(':').some((id) => executionIds.has(id)),
          )
        )
          return true;
        const unresolved =
          !fee.allocations ||
          fee.allocations.some(
            (allocation) =>
              allocation.target === 'unassigned' && !decimalValue(allocation.amount).isZero(),
          );
        if (!unresolved) return false;
        const at = financialInstantMicros(fee.economic_at);
        return windows.some((window) => at >= window.from && at <= window.to);
      });
      const costsReasons = standalone.length
        ? ['standalone_costs_require_campaign_attribution']
        : [];
      const incompatible = legFills.some((fill) => !compatibleVersion(fill, leg));
      const allocations: InventoryCampaignAllocation[] = legFills.map((fill) => ({
        id: fill.allocation_id,
        legId: leg.id,
        sourceId: fill.id,
        effectId: fill.id,
        sourceRevision: String(fill.source_revision),
        direction: leg.direction,
        role: (leg.direction === 'long') === (fill.side === 'buy') ? 'open' : 'close',
        economicOrder: { instant: fill.economic_at, sequence: fill.ordering_key },
        quantity: fill.allocated_quantity,
        multiplier: fill.multiplier_raw,
        price: fill.price_raw,
        bookedPrincipal:
          fill.allocated_principal ??
          (fill.principal_raw === null
            ? null
            : fallbackPrincipalBySet.get(fill.allocation_set_id)!.get(leg.id)!),
        costs: (feesByLegExecution.get(`${leg.id}:${fill.id}`) ?? []).map((fee) => ({
          id: fee.id,
          currencyId: fee.currency_id,
          amount: decimal(fee.amount_raw),
          chargedAt: fee.economic_at,
          ...fee.payload,
        })),
        costsComplete: fill.payload.costsComplete ?? false,
        ...(fill.payload.basisReportingFx
          ? { basisReportingFx: fill.payload.basisReportingFx }
          : {}),
      }));
      const legReferences = [leg.id];
      const native = leg.settlement_currency_id;
      let inventory: InventoryReplayResult;
      const replayInput = {
        scope: {
          workspaceId: context.workspaceId,
          accountId: leg.account_id,
          instrumentId: leg.instrument_id,
          instrumentVersionId: leg.instrument_version_id,
          unitVersionId: leg.instrument_version_id,
          settlementCurrencyId: native,
        },
        manifest: INVENTORY_CALCULATION_MANIFEST,
        sourceRevision: revision,
        capability: {
          subtype: leg.subtype,
          nativeInventory:
            !incompatible &&
            leg.capability === 'native-linear' &&
            legFills.every((fill) => fill.capability === 'native-linear') &&
            leg.holding_mode === 'netted',
          shortSupported: leg.family !== 'crypto_spot',
          averageCostSupported: true,
        },
      };
      try {
        inventory = replayCampaignInventory({ ...replayInput, allocations });
      } catch (error) {
        if (!(error instanceof InventoryError || error instanceof FinancialArithmeticError))
          throw error;
        const blocked = unavailable([error.code], legReferences);
        pnl.gross.push(blocked);
        pnl.net.push(blocked);
        pnl.realized.push(blocked);
        pnl.unrealized.push(blocked);
        pnl.fees.push(blocked);
        riskResults.push({
          status: 'unavailable' as const,
          value: null,
          reasons: [error.code],
          currencyId: first.original_plan?.initialRisk?.currencyId ?? null,
          unit: 'money',
          source: 'calculated-ledger' as const,
        });
        reliableQuantity = false;
        closureReasons.push('incomplete_campaign_inventory', error.code);
        continue;
      }
      if (inventory.openQuantity.status !== 'available' || inventory.openQuantity.value === null) {
        reliableQuantity = false;
        closureReasons.push('incomplete_campaign_inventory', ...inventory.openQuantity.reasons);
      } else if (!decimalValue(inventory.openQuantity.value).isZero()) nonflat = true;
      const risk = first.original_plan?.initialRisk;
      if (risk) {
        riskResults.push(journalRiskCurrencyResult(inventory, risk.currencyId, costsReasons));
        for (const allocation of allocations) {
          if (allocation.basisReportingFx) fxIds.push(allocation.basisReportingFx.observationId);
          for (const cost of allocation.costs) {
            if (cost.nativeFx) fxIds.push(cost.nativeFx.observationId);
            if (cost.reportingFx) fxIds.push(cost.reportingFx.observationId);
          }
        }
      }
      // Only the display replay may select policy rates. Original R above remains source-pinned.
      if (native !== null) {
        const displayAllocations = allocations.map((allocation) => {
          const {
            basisReportingFx: originalBasisRate,
            costs: originalCosts,
            ...header
          } = allocation;
          const basisReportingFx = historicalDisplayRate({
            base: native,
            quote: query.reportingCurrencyId,
            at: allocation.economicOrder.instant!,
            pins: [originalBasisRate],
            query,
            selectRate: selectDisplayFx,
            selectedIds: fxIds,
            missingReferences: legReferences,
          });
          const costs = originalCosts.map((cost) => {
            const {
              nativeFx: originalNativeRate,
              reportingFx: originalReportingRate,
              ...original
            } = cost;
            const nativeFx = historicalDisplayRate({
              base: cost.currencyId,
              quote: native,
              at: cost.chargedAt,
              pins: [originalNativeRate, originalReportingRate],
              query,
              selectRate: selectDisplayFx,
              selectedIds: fxIds,
              missingReferences: legReferences,
            });
            const reportingFx = historicalDisplayRate({
              base: cost.currencyId,
              quote: query.reportingCurrencyId,
              at: cost.chargedAt,
              pins: [originalReportingRate, originalNativeRate],
              query,
              selectRate: selectDisplayFx,
              selectedIds: fxIds,
              missingReferences: legReferences,
            });
            return {
              ...original,
              ...(nativeFx ? { nativeFx } : {}),
              ...(reportingFx ? { reportingFx } : {}),
            };
          });
          return { ...header, costs, ...(basisReportingFx ? { basisReportingFx } : {}) };
        });
        inventory = replayCampaignInventory({ ...replayInput, allocations: displayAllocations });
      }
      const remainingLots = inventory.lots.filter(
        (lot) => !decimalValue(lot.remainingQuantity).isZero(),
      );
      const latestAcquisition = remainingLots.reduce<bigint | null>((latest, lot) => {
        if (lot.economicOrder.instant === null) return latest;
        const instant = financialInstantMicros(lot.economicOrder.instant);
        return latest === null || instant > latest ? instant : latest;
      }, null);
      const eligiblePrices = (pricesByInstrument.get(leg.instrument_id) ?? []).filter(
        (price) =>
          compatibleVersion(price, leg) &&
          price.currency_id === leg.quote_currency_id &&
          (latestAcquisition === null ||
            financialInstantMicros(price.observed_at) >= latestAcquisition) &&
          query.priceSourcePriority.includes(price.source) &&
          financialInstantMicros(query.to) - financialInstantMicros(price.observed_at) <=
            BigInt(query.priceMaxAgeMilliseconds) * 1000n,
      );
      eligiblePrices.sort(
        (a, b) =>
          query.priceSourcePriority.indexOf(a.source) -
            query.priceSourcePriority.indexOf(b.source) ||
          (financialInstantMicros(a.observed_at) === financialInstantMicros(b.observed_at)
            ? a.id.localeCompare(b.id, 'en')
            : financialInstantMicros(a.observed_at) > financialInstantMicros(b.observed_at)
              ? -1
              : 1),
      );
      const selected = remainingLots.length ? eligiblePrices[0] : undefined;
      const markFx =
        native && remainingLots.length
          ? selectDisplayFx(native, query.reportingCurrencyId, canonicalFinancialInstant(query.to))
          : null;
      if (selected) {
        markIds.push(selected.id);
        markVersionIds.push(selected.instrument_version_id);
      }
      if (markFx?.state === 'available') fxIds.push(...markFx.value.observationIds);
      try {
        const valuation = valueInventory(inventory, {
          mark:
            selected && leg.multiplier_raw !== null
              ? {
                  id: selected.id,
                  price: selected.price_raw,
                  multiplier: leg.multiplier_raw,
                  instant: selected.observed_at,
                }
              : null,
          reportingCurrencyId: query.reportingCurrencyId,
          ...(markFx?.state === 'available' && native !== query.reportingCurrencyId
            ? {
                markReportingFx: {
                  observationId: markFx.value.observationIds[0]!,
                  rate: markFx.value.rate,
                  baseCurrencyId: native!,
                  quoteCurrencyId: query.reportingCurrencyId,
                },
              }
            : {}),
        });
        fxIds.push(...valuation.observationIds.filter((id) => id !== selected?.id));
        const sameCurrency = native === query.reportingCurrencyId;
        const realizedGross = fromInventory(
          sameCurrency
            ? inventory.realizedGross
            : {
                ...valuation.realizedReportingTradingGross,
                value:
                  valuation.realizedReportingTradingGross.value !== null &&
                  valuation.realizedHoldingFx.value !== null
                    ? sumDecimals([
                        valuation.realizedReportingTradingGross.value,
                        valuation.realizedHoldingFx.value,
                      ])
                    : null,
                status:
                  valuation.realizedReportingTradingGross.status === 'available' &&
                  valuation.realizedHoldingFx.status === 'available'
                    ? 'available'
                    : 'unavailable',
                reasons: [
                  ...valuation.realizedReportingTradingGross.reasons,
                  ...valuation.realizedHoldingFx.reasons,
                ],
              },
          legReferences,
          incompatible ? ['incompatible_execution_units'] : [],
        );
        const unrealizedGross = fromInventory(
          sameCurrency
            ? valuation.unrealizedGross
            : {
                ...valuation.unrealizedReportingTradingGross,
                value:
                  valuation.unrealizedReportingTradingGross.value !== null &&
                  valuation.unrealizedHoldingFx.value !== null
                    ? sumDecimals([
                        valuation.unrealizedReportingTradingGross.value,
                        valuation.unrealizedHoldingFx.value,
                      ])
                    : null,
                status:
                  valuation.unrealizedReportingTradingGross.status === 'available' &&
                  valuation.unrealizedHoldingFx.status === 'available'
                    ? 'available'
                    : 'unavailable',
                reasons: [
                  ...valuation.unrealizedReportingTradingGross.reasons,
                  ...valuation.unrealizedHoldingFx.reasons,
                ],
              },
          legReferences,
          incompatible ? ['incompatible_execution_units'] : [],
        );
        const realized = fromInventory(
          sameCurrency ? inventory.realizedNet : valuation.realizedReportingNet,
          legReferences,
          [...costsReasons, ...(incompatible ? ['incompatible_execution_units'] : [])],
        );
        const unrealized = fromInventory(
          sameCurrency ? valuation.unrealizedNet : valuation.unrealizedReportingNet,
          legReferences,
          [...costsReasons, ...(incompatible ? ['incompatible_execution_units'] : [])],
        );
        pnl.gross.push(total([realizedGross, unrealizedGross]));
        pnl.net.push(total([realized, unrealized]));
        pnl.realized.push(realized);
        pnl.unrealized.push(unrealized);
        pnl.fees.push(
          feeMetric(
            inventory.originalCosts,
            query.reportingCurrencyId,
            legFills.every((fill) => fill.payload.costsComplete === true),
            costsReasons,
          ),
        );
      } catch (error) {
        if (!(error instanceof InventoryError || error instanceof FinancialArithmeticError))
          throw error;
        const blocked = unavailable([error.code], legReferences);
        pnl.gross.push(blocked);
        pnl.net.push(blocked);
        pnl.realized.push(blocked);
        pnl.unrealized.push(blocked);
        pnl.fees.push(blocked);
      }
    }
    const settled = !relatedFills.some((fill) => unsettledExecutions.has(fill.id));
    const hasClosure = first.closure_id !== null;
    if (!reliableQuantity) closureReasons.push('incomplete_campaign_inventory');
    if (!settled) closureReasons.push('unsettled_campaign_obligations');
    if (hasClosure && nonflat) closureReasons.push('closure_review_required');
    const completed = hasClosure && reliableQuantity && !nonflat && settled;
    const closeInPeriod = financialInstantMicros(lastAt) > financialInstantMicros(query.from);
    // A closed campaign outside the requested cohort is not silently treated as a period result.
    if (!nonflat && reliableQuantity && !closeInPeriod) continue;
    const partialScope = campaignLegs.some((leg) => !query.accountIds.includes(leg.account_id));
    let status: AnalyticsCampaign['status'] = completed
      ? 'completed'
      : reliableQuantity
        ? 'open'
        : 'excluded';
    if (partialScope) {
      status = 'excluded';
      closureReasons.push('partial_campaign_scope');
    }
    if (!hasClosure && !nonflat) closureReasons.push('unconfirmed_completion');
    const risk = first.original_plan?.initialRisk;
    const rResult = originalRiskR({
      originalRisk:
        risk && first.original_plan_id
          ? {
              originalPlanId: first.original_plan_id,
              amount: risk.amount,
              currencyId: risk.currencyId,
            }
          : null,
      commitment:
        first.commitment_timing && first.committed_at
          ? {
              timing: first.commitment_timing,
              committedAtMicros: String(financialInstantMicros(first.committed_at)),
            }
          : null,
      earliestExecutionMicros: String(financialInstantMicros(relatedFills[0]!.economic_at)),
      completed: status === 'completed',
      closureReviewRequired: hasClosure && (!reliableQuantity || nonflat || !settled),
      legResults: riskResults,
      coverageReasons: closureReasons,
      financialSourceRevision: revision,
    });
    const plan = first.original_plan ?? first.latest_plan;
    const setup = first.strategy_definition?.setups.find(
      (candidate) => candidate.id === plan?.setupId,
    );
    const dimensions: AnalyticsCampaign['dimensions'] = {
      strategy: first.strategy_id
        ? [{ key: first.strategy_id, label: first.strategy_name ?? first.strategy_id }]
        : [],
      strategyVersion: first.strategy_version_id
        ? [
            {
              key: first.strategy_version_id,
              label: `${first.strategy_name ?? first.strategy_id} v${first.strategy_version}`,
            },
          ]
        : [],
      asset: groupValues(
        campaignLegs.map((leg) => ({ key: leg.instrument_id, label: leg.instrument_name })),
      ),
      assetClass: groupValues(campaignLegs.map((leg) => ({ key: leg.family, label: leg.family }))),
      broker: groupValues(
        campaignLegs.map((leg) =>
          leg.broker_id
            ? { key: leg.broker_id, label: leg.broker_name ?? leg.broker_id }
            : campaignLegs.some((candidate) => candidate.broker_id !== null)
              ? { key: 'unknown:broker', label: 'Unspecified broker' }
              : null,
        ),
      ),
      account: groupValues(
        campaignLegs.map((leg) => ({ key: leg.account_id, label: leg.account_name })),
      ),
      currency: groupValues(
        campaignLegs.map((leg) =>
          leg.settlement_currency_id
            ? {
                key: leg.settlement_currency_id,
                label: leg.currency_code ?? leg.settlement_currency_id,
              }
            : campaignLegs.some((candidate) => candidate.settlement_currency_id !== null)
              ? { key: 'unknown:currency', label: 'Unspecified currency' }
              : null,
        ),
      ),
      direction: groupValues(
        campaignLegs.map((leg) => ({ key: leg.direction, label: leg.direction })),
      ),
      ...calendarDimensions(entryAt, timezone),
      timeframe: label(plan?.timeframe),
      setup:
        plan?.setupId && setup && first.strategy_version_id
          ? [{ key: `${first.strategy_version_id}:${setup.id}`, label: setup.name }]
          : [],
      tag: (first.journal_document?.review.customTags ?? []).map((tag) => ({
        key: tag,
        label: tag,
      })),
      marketCondition: marketConditionDimension(
        plan?.marketConditions || first.journal_document?.review.marketConditions,
      ),
    };
    records.push({
      id: campaignId,
      title: first.title,
      status,
      entryAt,
      closedAt: !nonflat && reliableQuantity ? lastAt : null,
      grossPnl: total(pnl.gross),
      netPnl: total(pnl.net),
      realizedPnl: total(pnl.realized),
      unrealizedPnl: total(pnl.unrealized),
      fees: total(pnl.fees),
      rMultiple:
        rResult.status === 'available' && rResult.value !== null
          ? available(rResult.value)
          : unavailable(
              rResult.reasons,
              first.original_plan_id ? [first.original_plan_id] : [campaignId],
            ),
      dimensions,
      exclusionReasons: unique(closureReasons),
      originalPlanId: first.original_plan_id,
      provenance: {
        originalPlanId: first.original_plan_id,
        originalPlanHash: first.original_plan_hash,
        metadataPlanId: first.original_plan_id ?? first.latest_plan_id,
        metadataPlanHash: first.original_plan_hash ?? first.latest_plan_hash,
        metadataPlanSource: first.original_plan_id
          ? 'original-commitment'
          : first.latest_plan_id
            ? 'latest-published'
            : null,
        journalRevisionId: first.journal_revision_id,
        journalRevisionHash: first.journal_hash,
        strategyId: first.strategy_id,
        strategyVersionId: first.strategy_version_id,
        strategyVersionHash: first.strategy_hash,
        strategyLinkTiming: first.strategy_link_timing,
        closureId: first.closure_id,
        legIds: campaignLegs.map((leg) => leg.id),
        effectiveExecutionIds: unique(relatedFills.map((fill) => fill.id)),
        allocationSetIds: unique(relatedFills.map((fill) => fill.allocation_set_id)),
        feeIds: unique(relatedFees.map((fee) => fee.id)),
        instrumentVersionIds: unique([
          ...campaignLegs.map((leg) => leg.instrument_version_id),
          ...relatedFills.map((fill) => fill.instrument_version_id),
          ...markVersionIds,
        ]),
        markIds: unique(markIds),
        fxObservationIds: unique(fxIds),
      },
    });
  }
  const suppliedTradeIds = new Set<string>();
  for (const source of suppliedResults) {
    if (suppliedTradeIds.has(source.tradeId!))
      throw financialInvalid('Select one supplied net result per campaign.');
    suppliedTradeIds.add(source.tradeId!);
    const index = records.findIndex((record) => record.id === source.tradeId);
    if (index < 0)
      throw financialInvalid(
        'The selected supplied campaign must belong to this analytics cohort.',
      );
    const record = records[index]!;
    if (record.exclusionReasons.includes('partial_campaign_scope'))
      throw financialInvalid(
        'A supplied lifetime result requires the complete campaign account scope.',
      );
    if (
      financialInstantMicros(source.observedAt) > financialInstantMicros(query.to) ||
      financialInstantMicros(query.to) - financialInstantMicros(source.observedAt) >
        BigInt(query.priceMaxAgeMilliseconds) * 1000n
    )
      throw financialConflict(
        'STALE_SUPPLIED_COMPONENT',
        'The supplied campaign result must be current at the analytics boundary.',
      );
    const rate = selectDisplayFx(source.currencyId, query.reportingCurrencyId, source.observedAt);
    const translated = translateAmount(
      { amount: source.amount, currencyId: source.currencyId },
      query.reportingCurrencyId,
      rate,
    );
    const net =
      translated.state === 'available'
        ? available(translated.value.amount)
        : unavailable(translated.reasons, translated.missingReferences);
    const complete =
      source.sourceInput.kind === 'campaign-net-result' &&
      source.sourceInput.resultDefinition === 'completed-realized-net';
    const status = complete ? 'completed' : record.status;
    const unknown = unavailable(['supplied_result_decomposition_unavailable'], [source.id]);
    records[index] = {
      ...record,
      status,
      closedAt: complete
        ? (fillsByCampaign.get(record.id)?.at(-1)?.economic_at ?? record.closedAt)
        : record.closedAt,
      netPnl: net,
      realizedPnl: complete ? net : unknown,
      unrealizedPnl: complete ? available('0') : unknown,
      grossPnl: unknown,
      fees: unknown,
      rMultiple: unavailable(['supplied_result_original_risk_not_recomputed'], [source.id]),
      provenance: {
        ...record.provenance,
        fxObservationIds: unique([
          ...record.provenance.fxObservationIds,
          ...(rate.state === 'available' ? rate.value.observationIds : []),
        ]),
        suppliedResult: componentReference(source),
      },
    };
  }
  return records;
}
