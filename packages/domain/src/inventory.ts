import {
  allocateDecimal,
  FINANCIAL_CALCULATION_MANIFEST,
  decimal,
  decimalValue,
  quantizeDecimal,
  sumDecimals,
} from './decimal.js';
import type { DecimalString } from './index.js';
import type {
  InventoryContributionSnapshot,
  InventoryCampaignAllocation,
  InventoryCampaignBridge,
  InventoryCampaignReplayInput,
  InventoryCampaignSelection,
  InventoryCost,
  InventoryCostAttribution,
  InventoryCostPiece,
  InventoryDirection,
  InventoryEconomicOrder,
  InventoryFill,
  InventoryHoldingDeparture,
  InventoryHoldingReceipt,
  InventoryHoldingTransferInput,
  InventoryLot,
  InventoryMatch,
  InventoryManifest,
  InventoryMetric,
  InventoryOpening,
  InventoryPolicy,
  InventoryPolicyTransition,
  InventoryReplayInput,
  InventoryReplayResult,
  InventorySource,
  InventoryTransferredSlice,
  InventoryValuationInput,
  InventoryValuationResult,
  PinnedInventoryRate,
} from './inventory-types.js';

export class InventoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'InventoryError';
  }
}

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };
type WorkingLot = Omit<Mutable<InventoryLot>, 'costs'> & { costs: InventoryCostPiece[] };
type WorkingMatch = Mutable<InventoryMatch>;
const zero = () => decimal('0');
const sign = (direction: InventoryDirection) => (direction === 'long' ? '1' : '-1');
const q = quantizeDecimal;
const dv = decimalValue;

export const INVENTORY_CALCULATION_MANIFEST: InventoryManifest = Object.freeze({
  kernelVersion: FINANCIAL_CALCULATION_MANIFEST.kernel,
  instrumentModuleVersion: FINANCIAL_CALCULATION_MANIFEST.ordinaryLinear,
  lotPolicyVersion: FINANCIAL_CALCULATION_MANIFEST.lotMatching,
  allocationPolicyVersion: FINANCIAL_CALCULATION_MANIFEST.allocation,
  fxPolicyVersion: FINANCIAL_CALCULATION_MANIFEST.fxSelection,
  roundingPolicyVersion: FINANCIAL_CALCULATION_MANIFEST.precision,
});

function fail(code: string): never {
  throw new InventoryError(code);
}

function identifier(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024)
    fail('invalid_inventory_reference');
}

function integer(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || value.length > 78)
    fail('invalid_inventory_sequence');
  return BigInt(value);
}

function positive(value: string | null): DecimalString {
  const parsed = decimal(value);
  if (!dv(parsed).greaterThan('0')) fail('nonpositive_inventory_value');
  return parsed;
}

function nonnegative(value: string): DecimalString {
  const parsed = decimal(value);
  if (dv(parsed).isNegative()) fail('negative_inventory_value');
  return parsed;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current !== null && typeof current === 'object' && !Array.isArray(current))
      return Object.fromEntries(
        Object.entries(current).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
    return current;
  });
}

/** Preserve sub-millisecond ordering. Date is used only to normalize calendar seconds/offsets. */
function instantKey(value: string): string {
  const parsed = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,36}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  );
  if (!parsed) fail('invalid_inventory_instant');
  const calendar = parsed[1]!;
  const fraction = parsed[2] ?? '';
  const offset = parsed[3]!;
  const local = new Date(`${calendar}Z`);
  if (!Number.isFinite(local.getTime()) || local.toISOString().slice(0, 19) !== calendar)
    fail('invalid_inventory_instant');
  if (offset !== 'Z') {
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.slice(4, 6));
    if (hours > 23 || minutes > 59) fail('invalid_inventory_instant');
  }
  const normalized = new Date(`${calendar}${offset}`);
  if (!Number.isFinite(normalized.getTime())) fail('invalid_inventory_instant');
  return `${normalized.toISOString().slice(0, 19)}.${fraction.padEnd(36, '0')}`;
}

function compareOrder(left: InventoryEconomicOrder, right: InventoryEconomicOrder): number {
  if (left.instant === null || right.instant === null) fail('ambiguous_chronology');
  const leftInstant = instantKey(left.instant);
  const rightInstant = instantKey(right.instant);
  if (leftInstant < rightInstant) return -1;
  if (leftInstant > rightInstant) return 1;
  if (left.sequence === null || right.sequence === null) fail('ambiguous_chronology');
  const leftSequence = integer(left.sequence);
  const rightSequence = integer(right.sequence);
  return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0;
}

function available(value: string, currencyId?: string): InventoryMetric {
  return {
    status: 'available',
    value: decimal(value),
    ...(currencyId === undefined ? {} : { currencyId }),
    reasons: [],
  };
}

function unavailable(
  reasons: readonly string[],
  currencyId?: string,
  unsupported = false,
): InventoryMetric {
  return {
    status: unsupported ? 'unsupported' : 'unavailable',
    value: null,
    ...(currencyId === undefined ? {} : { currencyId }),
    reasons: [...new Set(reasons)].sort(),
  };
}

function aggregate(metrics: readonly InventoryMetric[], currencyId?: string): InventoryMetric {
  const missing = metrics.filter((metric) => metric.status !== 'available');
  if (missing.length)
    return unavailable(
      missing.flatMap((metric) => metric.reasons),
      currencyId,
      missing.some((metric) => metric.status === 'unsupported'),
    );
  return available(
    q(metrics.reduce((total, metric) => total.plus(metric.value!), dv('0'))),
    currencyId,
  );
}

function validateRate(rate: PinnedInventoryRate | undefined, base: string, quote?: string): void {
  if (rate === undefined) return;
  identifier(rate.observationId);
  positive(rate.rate);
  if (rate.baseCurrencyId !== undefined && rate.baseCurrencyId !== base)
    fail('incompatible_inventory_fx');
  if (quote !== undefined && rate.quoteCurrencyId !== undefined && rate.quoteCurrencyId !== quote)
    fail('incompatible_inventory_fx');
  if (quote === base && !dv(rate.rate).equals('1')) fail('invalid_identity_fx');
}

function costPiece(cost: InventoryCost, nativeCurrency: string | undefined): InventoryCostPiece {
  identifier(cost.id);
  identifier(cost.currencyId);
  instantKey(cost.chargedAt);
  validateRate(cost.nativeFx, cost.currencyId, nativeCurrency);
  validateRate(cost.reportingFx, cost.currencyId);
  return {
    ...cost,
    amount: decimal(cost.amount),
    ...(cost.nativeFx ? { nativeFx: { ...cost.nativeFx } } : {}),
    ...(cost.reportingFx ? { reportingFx: { ...cost.reportingFx } } : {}),
  };
}

function costsTotal(
  costs: readonly InventoryCostPiece[],
  currencyId: string,
  useReportingRates = false,
): InventoryMetric {
  let total = dv('0');
  for (const cost of costs) {
    if (cost.currencyId === currencyId || dv(cost.amount).isZero()) {
      total = total.plus(cost.amount);
      continue;
    }
    const rate = useReportingRates ? cost.reportingFx : cost.nativeFx;
    if (!rate)
      return unavailable(
        [useReportingRates ? 'missing_reporting_cost_fx' : 'missing_charged_currency_fx'],
        currencyId,
      );
    validateRate(rate, cost.currencyId, currencyId);
    total = total.plus(dv(cost.amount).times(rate.rate));
  }
  return available(q(total), currencyId);
}

function netMetric(
  gross: InventoryMetric,
  costs: readonly InventoryCostPiece[],
  currencyId: string,
  complete: boolean,
  reporting = false,
): InventoryMetric {
  if (gross.status !== 'available') return gross;
  if (!complete) return unavailable(['incomplete_costs'], currencyId);
  const expense = costsTotal(costs, currencyId, reporting);
  if (expense.status !== 'available') return expense;
  return available(q(dv(gross.value!).minus(expense.value!)), currencyId);
}

function partition(
  amount: string,
  take: string,
  remaining: string,
  id: string,
): [DecimalString, DecimalString] {
  if (dv(remaining).isZero()) return [decimal(amount), zero()];
  const pieces = allocateDecimal(amount, [
    { id: `consume:${id}`, weight: take },
    { id: `remain:${id}`, weight: remaining },
  ]);
  return [pieces[0]!.amount, pieces[1]!.amount];
}

function partitionCosts(
  costs: readonly InventoryCostPiece[],
  take: string,
  remaining: string,
  id: string,
): [InventoryCostPiece[], InventoryCostPiece[]] {
  const consumed: InventoryCostPiece[] = [];
  const carried: InventoryCostPiece[] = [];
  for (const cost of costs) {
    const [part, rest] = partition(cost.amount, take, remaining, `${id}:${cost.id}`);
    consumed.push({ ...cost, amount: part });
    carried.push({ ...cost, amount: rest });
  }
  return [consumed, carried];
}

/** Resolve effective source versions before matching. Cash reversal history is a different view. */
export function selectEffectiveInventorySources(
  sources: readonly InventorySource[],
  sourceRevision: string,
): readonly InventorySource[] {
  const revision = integer(sourceRevision);
  const byId = new Map<string, InventorySource>();
  for (const source of sources) {
    identifier(source.id);
    identifier(source.effectId);
    const sourceVersion = integer(source.sourceRevision);
    if (byId.has(source.id)) fail('duplicate_inventory_source');
    if (sourceVersion <= revision) byId.set(source.id, source);
  }
  const superseded = new Set<string>();
  const successor = new Map<string, string>();
  for (const source of byId.values()) {
    if (source.kind === 'bookkeeping-reversal') {
      const original = byId.get(source.reversesId);
      if (!original || original.kind === 'bookkeeping-reversal')
        fail('invalid_bookkeeping_reversal');
      continue;
    }
    if (source.supersedesId !== undefined) {
      const original = byId.get(source.supersedesId);
      if (!original || original.kind !== source.kind || original.effectId !== source.effectId)
        fail('invalid_inventory_correction');
      if (integer(original.sourceRevision) >= integer(source.sourceRevision))
        fail('invalid_inventory_correction');
      if (successor.has(original.id)) fail('conflicting_inventory_correction');
      successor.set(original.id, source.id);
      superseded.add(original.id);
    }
  }
  const effective = [...byId.values()].filter(
    (source) => source.kind !== 'bookkeeping-reversal' && !superseded.has(source.id),
  );
  const effects = new Set<string>();
  for (const source of effective) {
    if (effects.has(source.effectId)) fail('duplicate_inventory_effect');
    effects.add(source.effectId);
  }
  return effective;
}

function quantities(sources: readonly InventorySource[]): {
  long: DecimalString;
  short: DecimalString;
  signed: DecimalString;
} {
  let total = dv('0');
  for (const source of sources) {
    if (source.kind === 'holding-receipt' || source.kind === 'holding-departure') {
      for (const slice of source.slices)
        total = total.plus(
          dv(positive(slice.quantity))
            .times(sign(slice.direction))
            .times(source.kind === 'holding-receipt' ? '1' : '-1'),
        );
      continue;
    }
    if (source.kind !== 'opening' && source.kind !== 'fill') continue;
    const quantity = positive(source.quantity);
    total = total.plus(
      dv(quantity).times(
        source.kind === 'opening' ? sign(source.direction) : source.side === 'buy' ? '1' : '-1',
      ),
    );
  }
  return {
    signed: q(total),
    long: q(total.isPositive() ? total : '0'),
    short: q(total.isNegative() ? total.negated() : '0'),
  };
}

function blocked(
  input: InventoryReplayInput,
  sources: readonly InventorySource[],
  originals: readonly InventoryCostPiece[],
  reason: string,
  unsupported: boolean,
): InventoryReplayResult {
  const native = input.scope.settlementCurrencyId ?? undefined;
  const quantity = quantities(sources);
  return {
    population: 'account-inventory',
    status: unsupported ? 'unsupported' : 'unavailable',
    reasons: [reason],
    scope: { ...input.scope },
    manifest: { ...input.manifest },
    sourceRevision: input.sourceRevision,
    policy: input.policy,
    policyVersion: input.manifest.lotPolicyVersion,
    effectiveSourceIds: sources.map((source) => source.id),
    lots: [],
    matches: [],
    originalCosts: originals,
    unassignedCosts: originals,
    transferredCosts: [],
    openQuantity: available(quantity.signed),
    longQuantity: available(quantity.long),
    shortQuantity: available(quantity.short),
    averageEntryPrice: unavailable([reason], undefined, unsupported),
    grossBasis: unavailable([reason], native, unsupported),
    netBasis: unavailable([reason], native, unsupported),
    realizedGross: unavailable([reason], native, unsupported),
    realizedNet: unavailable([reason], native, unsupported),
  };
}

function makeLot(
  source: InventoryOpening | InventoryFill,
  direction: InventoryDirection,
  quantity: string,
  principal: string | null,
  quoteNotional: string | null,
  costs: InventoryCostPiece[],
  native: string,
): WorkingLot {
  const entryPrice = source.kind === 'opening' ? source.entryPrice : source.price;
  return {
    id: source.id,
    sourceId: source.id,
    effectId: source.effectId,
    direction,
    economicOrder: { ...source.economicOrder },
    originalQuantity: decimal(quantity),
    remainingQuantity: decimal(quantity),
    multiplier: positive(source.multiplier),
    entryPrice: entryPrice === null ? null : positive(entryPrice),
    remainingQuoteNotional: quoteNotional === null ? null : decimal(quoteNotional),
    remainingPrincipal: principal === null ? null : decimal(principal),
    signedGrossBasis:
      principal === null
        ? unavailable(['unknown_basis'], native)
        : available(q(dv(principal).times(sign(direction))), native),
    costs,
    costsComplete: source.costsComplete !== false,
    ...(source.basisReportingFx ? { basisReportingFx: { ...source.basisReportingFx } } : {}),
  };
}

function planConsumption(
  fill: InventoryFill,
  eligible: readonly WorkingLot[],
  closeQuantity: string,
  policy: InventoryPolicy,
): readonly Readonly<{ lot: WorkingLot; quantity: DecimalString }>[] {
  if (dv(closeQuantity).isZero()) return [];
  if (policy === 'average') {
    if (fill.specificLots !== undefined) fail('specific_selection_in_average_pool');
    return allocateDecimal(
      closeQuantity,
      eligible.map((lot) => ({ id: lot.id, weight: lot.remainingQuantity })),
    )
      .filter((piece) => !dv(piece.amount).isZero())
      .map((piece) => ({
        lot: eligible.find((lot) => lot.id === piece.id)!,
        quantity: piece.amount,
      }));
  }
  if (policy === 'specific') {
    if (!fill.specificLots?.length) fail('specific_lot_selection_required');
    const seen = new Set<string>();
    const selected = fill.specificLots.map((selection) => {
      if (seen.has(selection.lotId)) fail('duplicate_specific_lot');
      seen.add(selection.lotId);
      const lot = eligible.find((candidate) => candidate.id === selection.lotId);
      const quantity = positive(selection.quantity);
      if (!lot || dv(quantity).greaterThan(lot.remainingQuantity)) fail('inventory_conflict');
      return { lot, quantity };
    });
    if (!dv(sumDecimals(selected.map((selection) => selection.quantity))).equals(closeQuantity))
      fail('specific_lot_quantity_mismatch');
    return selected.sort((left, right) =>
      compareOrder(left.lot.economicOrder, right.lot.economicOrder),
    );
  }
  if (fill.specificLots !== undefined) fail('specific_selection_in_fifo_pool');
  let needed = dv(closeQuantity);
  const selected: { lot: WorkingLot; quantity: DecimalString }[] = [];
  for (const lot of eligible) {
    if (needed.isZero()) break;
    const take = needed.lessThan(lot.remainingQuantity) ? q(needed) : lot.remainingQuantity;
    selected.push({ lot, quantity: take });
    needed = needed.minus(take);
  }
  if (!needed.isZero()) fail('inventory_conflict');
  return selected;
}

function recomputeMatch(match: WorkingMatch, native: string): void {
  const direction = sign(match.direction);
  match.grossPnl =
    match.consumedPrincipal === null
      ? unavailable(['unknown_basis'], native)
      : available(
          q(dv(match.exitPrincipal).minus(match.consumedPrincipal).times(direction)),
          native,
        );
  match.quotePricePnl =
    match.consumedQuoteNotional === null
      ? unavailable(['unknown_entry_price'], native)
      : available(
          q(dv(match.exitQuoteNotional).minus(match.consumedQuoteNotional).times(direction)),
          native,
        );
  match.settlementRoundingPnl =
    match.grossPnl.status === 'available' && match.quotePricePnl.status === 'available'
      ? available(q(dv(match.grossPnl.value!).minus(match.quotePricePnl.value!)), native)
      : unavailable([...match.grossPnl.reasons, ...match.quotePricePnl.reasons], native);
  match.netPnl = netMetric(
    match.grossPnl,
    [...match.entryCosts, ...match.exitCosts, ...match.carryingCosts],
    native,
    match.costsComplete,
  );
}

function processFill(
  fill: InventoryFill,
  lots: WorkingLot[],
  activeLots: Set<WorkingLot>,
  matches: WorkingMatch[],
  costs: InventoryCostPiece[],
  policy: InventoryPolicy,
  policyVersion: string,
  native: string,
): void {
  const quantity = positive(fill.quantity);
  const price = positive(fill.price);
  const multiplier = positive(fill.multiplier);
  const principal = positive(fill.bookedPrincipal);
  const direction = fill.side === 'buy' ? 'long' : 'short';
  const eligible = [...activeLots]
    .filter((lot) => lot.direction !== direction)
    .sort(
      (left, right) =>
        compareOrder(left.economicOrder, right.economicOrder) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  const availableQuantity = sumDecimals(eligible.map((lot) => lot.remainingQuantity));
  if (fill.closeOnly && dv(quantity).greaterThan(availableQuantity)) fail('inventory_conflict');
  const closeQuantity = dv(quantity).lessThan(availableQuantity) ? quantity : availableQuantity;
  const openQuantity = q(dv(quantity).minus(closeQuantity));
  const quoteNotional = q(dv(quantity).times(multiplier).times(price));
  let closePrincipal = zero();
  let openPrincipal = principal;
  let closeQuote = zero();
  let openQuote = quoteNotional;
  let closeCosts: InventoryCostPiece[] = [];
  let openCosts = costs;
  if (!dv(closeQuantity).isZero()) {
    [closePrincipal, openPrincipal] = partition(
      principal,
      closeQuantity,
      openQuantity,
      `${fill.id}:principal`,
    );
    [closeQuote, openQuote] = partition(
      quoteNotional,
      closeQuantity,
      openQuantity,
      `${fill.id}:quote`,
    );
    [closeCosts, openCosts] = partitionCosts(
      costs,
      closeQuantity,
      openQuantity,
      `${fill.id}:crossing`,
    );
  }
  const consumed = planConsumption(fill, eligible, closeQuantity, policy);
  if (consumed.length) {
    const weights = consumed.map((selection) => ({
      id: selection.lot.id,
      weight: selection.quantity,
    }));
    const exitPrincipals = allocateDecimal(closePrincipal, weights);
    const exitQuotes = allocateDecimal(closeQuote, weights);
    const exitFees = closeCosts.map((cost) => ({
      cost,
      pieces: allocateDecimal(cost.amount, weights),
    }));
    for (const [index, selection] of consumed.entries()) {
      const lot = selection.lot;
      const remainder = q(dv(lot.remainingQuantity).minus(selection.quantity));
      const [entryPrincipal, principalRest] =
        lot.remainingPrincipal === null
          ? [null, null]
          : partition(
              lot.remainingPrincipal,
              selection.quantity,
              remainder,
              `${fill.id}:${lot.id}:basis`,
            );
      const [entryQuote, quoteRest] =
        lot.remainingQuoteNotional === null
          ? [null, null]
          : partition(
              lot.remainingQuoteNotional,
              selection.quantity,
              remainder,
              `${fill.id}:${lot.id}:price`,
            );
      const [entryCosts, retainedCosts] = partitionCosts(
        lot.costs,
        selection.quantity,
        remainder,
        `${fill.id}:${lot.id}`,
      );
      const match: WorkingMatch = {
        id: `${fill.id}:${lot.id}`,
        lotId: lot.id,
        openingSourceId: lot.sourceId,
        closingSourceId: fill.id,
        direction: lot.direction,
        economicOrder: { ...fill.economicOrder },
        policy,
        policyVersion,
        quantity: selection.quantity,
        multiplier,
        entryPrice: lot.entryPrice,
        exitPrice: price,
        consumedPrincipal: entryPrincipal,
        exitPrincipal: exitPrincipals[index]!.amount,
        consumedQuoteNotional: entryQuote,
        exitQuoteNotional: exitQuotes[index]!.amount,
        entryCosts,
        exitCosts: exitFees.map((fee) => ({ ...fee.cost, amount: fee.pieces[index]!.amount })),
        carryingCosts: [],
        costsComplete: lot.costsComplete && fill.costsComplete !== false,
        ...(lot.basisReportingFx ? { basisReportingFx: { ...lot.basisReportingFx } } : {}),
        ...(fill.basisReportingFx ? { exitReportingFx: { ...fill.basisReportingFx } } : {}),
        grossPnl: available('0', native),
        netPnl: available('0', native),
        quotePricePnl: available('0', native),
        settlementRoundingPnl: available('0', native),
      };
      recomputeMatch(match, native);
      matches.push(match);
      lot.remainingQuantity = remainder;
      if (dv(remainder).isZero()) activeLots.delete(lot);
      lot.remainingPrincipal = principalRest;
      lot.remainingQuoteNotional = quoteRest;
      lot.costs = retainedCosts;
      lot.signedGrossBasis =
        principalRest === null
          ? unavailable(['unknown_basis'], native)
          : available(q(dv(principalRest).times(sign(lot.direction))), native);
    }
  }
  if (!dv(openQuantity).isZero()) {
    const lot = makeLot(fill, direction, openQuantity, openPrincipal, openQuote, openCosts, native);
    lots.push(lot);
    activeLots.add(lot);
  }
}

function snapshotMatches(snapshot: InventoryContributionSnapshot, lot: WorkingLot): boolean {
  if (!dv(snapshot.quantity).equals(lot.remainingQuantity)) return false;
  for (const [expected, actual] of [
    [snapshot.bookedPrincipal, lot.remainingPrincipal],
    [snapshot.quoteNotional, lot.remainingQuoteNotional],
  ]) {
    if (expected === null || actual === null) {
      if (expected !== actual) return false;
    } else if (
      expected === undefined ||
      actual === undefined ||
      !dv(decimal(expected)).equals(actual)
    )
      return false;
  }
  if (
    canonicalJson(snapshot.basisReportingFx ?? null) !== canonicalJson(lot.basisReportingFx ?? null)
  )
    return false;
  if (snapshot.costs.length !== lot.costs.length) return false;
  const seen = new Set<string>();
  for (const cost of snapshot.costs) {
    if (seen.has(cost.costId)) return false;
    seen.add(cost.costId);
    const actual = lot.costs.find((candidate) => candidate.id === cost.costId);
    if (
      !actual ||
      actual.currencyId !== cost.currencyId ||
      !dv(decimal(cost.amount)).equals(actual.amount)
    )
      return false;
  }
  return true;
}

function transitionPolicy(
  transition: InventoryPolicyTransition,
  lots: readonly WorkingLot[],
  policy: InventoryPolicy,
  policyVersion: string,
): void {
  if (!transition.reviewed) fail('policy_transition_review_required');
  if (transition.fromPolicy !== policy || transition.fromPolicyVersion !== policyVersion)
    fail('policy_transition_version_conflict');
  identifier(transition.toPolicyVersion);
  const remaining = lots.filter((lot) => !dv(lot.remainingQuantity).isZero());
  if (transition.contributions.length !== remaining.length) fail('policy_transition_conservation');
  const seen = new Set<string>();
  for (const snapshot of transition.contributions) {
    const lot = remaining.find((candidate) => candidate.id === snapshot.lotId);
    if (seen.has(snapshot.lotId) || !lot || !snapshotMatches(snapshot, lot))
      fail('policy_transition_conservation');
    seen.add(snapshot.lotId);
  }
}

function attributeCost(
  source: InventoryCostAttribution,
  cost: InventoryCostPiece,
  lots: readonly WorkingLot[],
  matches: readonly WorkingMatch[],
  unassigned: InventoryCostPiece[],
  native: string,
): void {
  if (!source.allocations.length) fail('cost_attribution_required');
  const parts = source.allocations.map((part) => decimal(part.amount));
  if (!dv(sumDecimals(parts)).equals(cost.amount)) fail('cost_attribution_conservation');
  const seen = new Set<string>();
  for (const [index, allocation] of source.allocations.entries()) {
    const amount = parts[index]!;
    if (!dv(amount).isZero() && dv(amount).isNegative() !== dv(cost.amount).isNegative())
      fail('cost_attribution_sign');
    const key = `${allocation.target}:${allocation.targetId ?? ''}`;
    if (seen.has(key)) fail('duplicate_cost_attribution');
    seen.add(key);
    const piece = { ...cost, amount };
    if (allocation.target === 'unassigned') {
      if (allocation.targetId !== undefined) fail('invalid_cost_attribution');
      unassigned.push(piece);
    } else if (allocation.target === 'lot') {
      const lot = lots.find(
        (candidate) =>
          candidate.id === allocation.targetId && !dv(candidate.remainingQuantity).isZero(),
      );
      if (!lot) fail('inventory_conflict');
      lot.costs.push(piece);
    } else {
      const match = matches.find((candidate) => candidate.id === allocation.targetId);
      if (!match) fail('inventory_conflict');
      match.carryingCosts = [...match.carryingCosts, piece];
      recomputeMatch(match, native);
    }
  }
}

function transferredSlice(
  lot: InventoryLot,
  quantity: string,
  destinationLotId: string,
  transferId: string,
): InventoryTransferredSlice {
  const take = positive(quantity);
  if (dv(take).greaterThan(lot.remainingQuantity)) fail('inventory_conflict');
  const remainder = q(dv(lot.remainingQuantity).minus(take));
  const partitionId = `${transferId}:${lot.id}`;
  const principal =
    lot.remainingPrincipal === null
      ? null
      : partition(lot.remainingPrincipal, take, remainder, `${partitionId}:basis`)[0];
  const quote =
    lot.remainingQuoteNotional === null
      ? null
      : partition(lot.remainingQuoteNotional, take, remainder, `${partitionId}:price`)[0];
  const costs = partitionCosts(lot.costs, take, remainder, partitionId)[0];
  return {
    id: destinationLotId,
    parentLotId: lot.id,
    sourceId: lot.sourceId,
    effectId: lot.effectId,
    direction: lot.direction,
    economicOrder: { ...lot.economicOrder },
    quantity: take,
    multiplier: lot.multiplier,
    entryPrice: lot.entryPrice,
    bookedPrincipal: principal,
    quoteNotional: quote,
    costs,
    costsComplete: lot.costsComplete,
    ...(lot.basisReportingFx ? { basisReportingFx: { ...lot.basisReportingFx } } : {}),
  };
}

/** Create one conserved transfer pair; carried costs are references, never new charges. */
export function prepareHoldingTransfer(
  source: InventoryReplayResult,
  input: InventoryHoldingTransferInput,
): Readonly<{ departure: InventoryHoldingDeparture; receipt: InventoryHoldingReceipt }> {
  if (
    source.status === 'unsupported' ||
    source.reasons.includes('ambiguous_chronology') ||
    source.scope.settlementCurrencyId === null
  )
    fail('holding_transfer_inventory_unavailable');
  for (const key of [
    'workspaceId',
    'instrumentId',
    'instrumentVersionId',
    'unitVersionId',
    'settlementCurrencyId',
  ] as const)
    if (source.scope[key] !== input.destinationScope[key]) fail('incompatible_holding_transfer');
  if (source.scope.accountId === input.destinationScope.accountId)
    fail('same_account_holding_transfer');
  for (const reference of [
    input.transferId,
    input.departureId,
    input.receiptId,
    ...Object.values(input.destinationScope),
  ])
    if (reference === null) fail('incompatible_holding_transfer');
    else identifier(reference);
  if (input.departureId === input.receiptId) fail('duplicate_holding_transfer_source');
  integer(input.sourceRevision);
  integer(input.destinationSourceRevision);
  if (input.economicOrder.instant === null) fail('ambiguous_chronology');
  instantKey(input.economicOrder.instant);
  if (input.economicOrder.sequence !== null) integer(input.economicOrder.sequence);
  if (!input.selections.length) fail('holding_transfer_selection_required');
  const selected = new Set<string>();
  const destinations = new Set<string>();
  const slices = input.selections.map((selection) => {
    identifier(selection.destinationLotId);
    if (selected.has(selection.lotId) || destinations.has(selection.destinationLotId))
      fail('duplicate_holding_transfer_selection');
    selected.add(selection.lotId);
    destinations.add(selection.destinationLotId);
    const lot = source.lots.find(
      (candidate) => candidate.id === selection.lotId && !dv(candidate.remainingQuantity).isZero(),
    );
    if (!lot) fail('inventory_conflict');
    if (compareOrder(lot.economicOrder, input.economicOrder) > 0)
      fail('holding_transfer_precedes_acquisition');
    return transferredSlice(lot, selection.quantity, selection.destinationLotId, input.transferId);
  });
  const direction = slices[0]!.direction;
  if (slices.some((slice) => slice.direction !== direction))
    fail('holding_transfer_direction_conflict');
  return {
    departure: {
      kind: 'holding-departure',
      id: input.departureId,
      effectId: `holding-departure:${input.transferId}`,
      sourceRevision: input.sourceRevision,
      economicOrder: { ...input.economicOrder },
      transferId: input.transferId,
      direction,
      selections: input.selections.map(({ lotId, quantity }) => ({
        lotId,
        quantity: positive(quantity),
      })),
      slices,
    },
    receipt: {
      kind: 'holding-receipt',
      id: input.receiptId,
      effectId: `holding-receipt:${input.transferId}`,
      sourceRevision: input.destinationSourceRevision,
      economicOrder: { ...input.economicOrder },
      transferId: input.transferId,
      slices,
    },
  };
}

function departHolding(
  source: InventoryHoldingDeparture,
  lots: readonly WorkingLot[],
  transferredCosts: InventoryCostPiece[],
  native: string,
): void {
  identifier(source.transferId);
  if (!source.selections.length || source.slices.length !== source.selections.length)
    fail('holding_transfer_conservation');
  const seen = new Set<string>();
  for (const selection of source.selections) {
    if (seen.has(selection.lotId)) fail('duplicate_holding_transfer_selection');
    seen.add(selection.lotId);
    const lot = lots.find(
      (candidate) => candidate.id === selection.lotId && candidate.direction === source.direction,
    );
    const slice = source.slices.find((candidate) => candidate.parentLotId === selection.lotId);
    if (!lot || !slice) fail('inventory_conflict');
    const expected = transferredSlice(lot, selection.quantity, slice.id, source.transferId);
    if (canonicalJson(slice) !== canonicalJson(expected)) fail('holding_transfer_lineage_conflict');
    const remainder = q(dv(lot.remainingQuantity).minus(expected.quantity));
    lot.remainingQuantity = remainder;
    if (lot.remainingPrincipal !== null)
      lot.remainingPrincipal = q(dv(lot.remainingPrincipal).minus(expected.bookedPrincipal!));
    if (lot.remainingQuoteNotional !== null)
      lot.remainingQuoteNotional = q(dv(lot.remainingQuoteNotional).minus(expected.quoteNotional!));
    lot.costs = lot.costs.map((cost, index) => ({
      ...cost,
      amount: q(dv(cost.amount).minus(expected.costs[index]!.amount)),
    }));
    lot.signedGrossBasis =
      lot.remainingPrincipal === null
        ? unavailable(['unknown_basis'], native)
        : available(q(dv(lot.remainingPrincipal).times(sign(lot.direction))), native);
    transferredCosts.push(...expected.costs);
  }
}

function receiveHolding(source: InventoryHoldingReceipt, lots: WorkingLot[], native: string): void {
  identifier(source.transferId);
  if (!source.slices.length) fail('holding_transfer_selection_required');
  for (const slice of source.slices) {
    for (const reference of [slice.id, slice.parentLotId, slice.sourceId, slice.effectId])
      identifier(reference);
    if (lots.some((lot) => lot.id === slice.id)) fail('duplicate_holding_transfer_lot');
    if (!['long', 'short'].includes(slice.direction)) fail('invalid_inventory_direction');
    if (
      lots.some((lot) => !dv(lot.remainingQuantity).isZero() && lot.direction !== slice.direction)
    )
      fail('holding_transfer_direction_conflict');
    if (compareOrder(slice.economicOrder, source.economicOrder) > 0)
      fail('holding_transfer_precedes_acquisition');
    const quantity = positive(slice.quantity);
    const principal = slice.bookedPrincipal === null ? null : positive(slice.bookedPrincipal);
    const quote = slice.quoteNotional === null ? null : positive(slice.quoteNotional);
    validateRate(slice.basisReportingFx, native);
    lots.push({
      id: slice.id,
      sourceId: slice.sourceId,
      effectId: slice.effectId,
      direction: slice.direction,
      economicOrder: { ...slice.economicOrder },
      originalQuantity: quantity,
      remainingQuantity: quantity,
      multiplier: positive(slice.multiplier),
      entryPrice: slice.entryPrice === null ? null : positive(slice.entryPrice),
      remainingQuoteNotional: quote,
      remainingPrincipal: principal,
      signedGrossBasis:
        principal === null
          ? unavailable(['unknown_basis'], native)
          : available(q(dv(principal).times(sign(slice.direction))), native),
      costs: slice.costs.map((cost) => costPiece(cost, native)),
      costsComplete: slice.costsComplete,
      ...(slice.basisReportingFx ? { basisReportingFx: { ...slice.basisReportingFx } } : {}),
      transferId: source.transferId,
      parentLotId: slice.parentLotId,
    });
  }
}

/** Pure deterministic replay. Matching partitions sources; it does not post cash or complete trades. */
export function replayInventory(input: InventoryReplayInput): InventoryReplayResult {
  for (const [key, reference] of Object.entries(input.scope))
    if (key !== 'settlementCurrencyId' || reference !== null) identifier(reference!);
  for (const reference of Object.values(input.manifest)) identifier(reference);
  if (!['fifo', 'average', 'specific'].includes(input.policy)) fail('invalid_inventory_policy');
  const sources = selectEffectiveInventorySources(input.sources, input.sourceRevision);
  const native = input.scope.settlementCurrencyId;
  const originals: InventoryCostPiece[] = [];
  const costBySource = new Map<string, InventoryCostPiece[]>();
  const costIds = new Set<string>();
  let multiplier: DecimalString | undefined;
  const nativeModule =
    input.capability.nativeInventory &&
    ['ordinary-share', 'ordinary-etf', 'non-rebasing-spot'].includes(input.capability.subtype);
  let missingOperand: string | undefined;
  for (const source of sources) {
    const costs =
      source.kind === 'opening' || source.kind === 'fill'
        ? source.costs
        : source.kind === 'cost-attribution'
          ? [source.cost]
          : [];
    const normalized = costs.map((cost) => costPiece(cost, native ?? undefined));
    for (const cost of normalized) {
      if (costIds.has(cost.id)) fail('duplicate_inventory_cost');
      costIds.add(cost.id);
      originals.push(cost);
    }
    costBySource.set(source.id, normalized);
    if (source.kind === 'holding-receipt') {
      for (const slice of source.slices) {
        positive(slice.quantity);
        const sourceMultiplier = positive(slice.multiplier);
        if (multiplier !== undefined && !dv(multiplier).equals(sourceMultiplier))
          fail('incompatible_inventory_multiplier');
        multiplier = sourceMultiplier;
        originals.push(...slice.costs.map((cost) => costPiece(cost, native ?? undefined)));
      }
    }
    if (source.kind === 'opening' || source.kind === 'fill') {
      positive(source.quantity);
      if (!nativeModule) continue;
      if (source.multiplier === null) {
        missingOperand ??= 'missing_inventory_multiplier';
        continue;
      }
      const sourceMultiplier = positive(source.multiplier);
      if (multiplier !== undefined && !dv(multiplier).equals(sourceMultiplier))
        fail('incompatible_inventory_multiplier');
      multiplier = sourceMultiplier;
      if (source.kind === 'fill') {
        if (source.price === null) missingOperand ??= 'missing_inventory_price';
        else positive(source.price);
        if (source.bookedPrincipal === null) missingOperand ??= 'missing_booked_principal';
        else positive(source.bookedPrincipal);
      } else {
        if (!['long', 'short'].includes(source.direction)) fail('invalid_inventory_direction');
        if (source.entryPrice !== null) positive(source.entryPrice);
        if (source.bookedPrincipal !== null) positive(source.bookedPrincipal);
      }
      if (native !== null) validateRate(source.basisReportingFx, native);
    }
  }
  for (const key of [
    'kernelVersion',
    'instrumentModuleVersion',
    'allocationPolicyVersion',
    'fxPolicyVersion',
    'roundingPolicyVersion',
  ] as const) {
    if (input.manifest[key] !== INVENTORY_CALCULATION_MANIFEST[key])
      return blocked(input, sources, originals, 'unsupported_calculation_manifest', true);
  }
  if (!nativeModule)
    return blocked(input, sources, originals, 'unsupported_inventory_module', true);
  if (native === null)
    return blocked(input, sources, originals, 'missing_settlement_currency', false);
  if (missingOperand !== undefined)
    return blocked(input, sources, originals, missingOperand, false);
  if (input.policy === 'average' && !input.capability.averageCostSupported)
    return blocked(input, sources, originals, 'unsupported_average_cost', true);
  for (const source of sources) {
    if (source.economicOrder.instant === null)
      return blocked(input, sources, originals, 'ambiguous_chronology', false);
    instantKey(source.economicOrder.instant);
    if (source.economicOrder.sequence !== null) integer(source.economicOrder.sequence);
  }
  let ordered: InventorySource[];
  try {
    ordered = [...sources].sort((left, right) =>
      compareOrder(left.economicOrder, right.economicOrder),
    );
  } catch (error) {
    if (error instanceof InventoryError && error.code === 'ambiguous_chronology')
      return blocked(input, sources, originals, 'ambiguous_chronology', false);
    throw error;
  }
  for (let index = 1; index < ordered.length; index++) {
    if (compareOrder(ordered[index - 1]!.economicOrder, ordered[index]!.economicOrder) === 0)
      return blocked(input, ordered, originals, 'ambiguous_chronology', false);
  }
  let policy = input.policy;
  let policyVersion = input.manifest.lotPolicyVersion;
  const lots: WorkingLot[] = [];
  // Matching needs only nonzero lots. Retain every historical lot in `lots` for provenance,
  // late costs, transfers, and the unchanged full replay result. Object identity also keeps
  // the index faithful if distinct source paths happen to share a lot-reference string.
  const activeLots = new Set<WorkingLot>();
  const matches: WorkingMatch[] = [];
  const unassigned: InventoryCostPiece[] = [];
  const transferredCosts: InventoryCostPiece[] = [];
  for (const source of ordered) {
    if (source.kind === 'opening') {
      if ([...activeLots].some((lot) => lot.direction !== source.direction))
        fail('opening_inventory_direction_conflict');
      const quantity = positive(source.quantity);
      const quote =
        source.entryPrice === null
          ? null
          : q(dv(quantity).times(positive(source.multiplier)).times(source.entryPrice));
      const lot = makeLot(
        source,
        source.direction,
        quantity,
        source.bookedPrincipal,
        quote,
        costBySource.get(source.id)!,
        native,
      );
      lots.push(lot);
      activeLots.add(lot);
    } else if (source.kind === 'fill') {
      if (!['buy', 'sell'].includes(source.side)) fail('invalid_inventory_side');
      processFill(
        source,
        lots,
        activeLots,
        matches,
        costBySource.get(source.id)!,
        policy,
        policyVersion,
        native,
      );
    } else if (source.kind === 'policy-transition') {
      transitionPolicy(source, lots, policy, policyVersion);
      if (source.toPolicy === 'average' && !input.capability.averageCostSupported)
        return blocked(input, ordered, originals, 'unsupported_average_cost', true);
      if (!['fifo', 'average', 'specific'].includes(source.toPolicy))
        fail('invalid_inventory_policy');
      policy = source.toPolicy;
      policyVersion = source.toPolicyVersion;
    } else if (source.kind === 'cost-attribution') {
      attributeCost(source, costBySource.get(source.id)![0]!, lots, matches, unassigned, native);
    } else if (source.kind === 'holding-departure') {
      departHolding(source, lots, transferredCosts, native);
      for (const lot of activeLots) if (dv(lot.remainingQuantity).isZero()) activeLots.delete(lot);
    } else if (source.kind === 'holding-receipt') {
      const firstReceivedLot = lots.length;
      receiveHolding(source, lots, native);
      for (let index = firstReceivedLot; index < lots.length; index++) activeLots.add(lots[index]!);
    }
    if (
      !input.capability.shortSupported &&
      [...activeLots].some((lot) => lot.direction === 'short')
    )
      return blocked(input, ordered, originals, 'unsupported_short_inventory', true);
  }
  const remaining = [...activeLots];
  const signedQuantity = q(
    remaining.reduce(
      (total, lot) => total.plus(dv(lot.remainingQuantity).times(sign(lot.direction))),
      dv('0'),
    ),
  );
  const grossBasis = aggregate(
    remaining.map((lot) => lot.signedGrossBasis),
    native,
  );
  let averageEntryPrice: InventoryMetric;
  if (!remaining.length) averageEntryPrice = unavailable(['closed_position']);
  else if (remaining.some((lot) => lot.remainingQuoteNotional === null))
    averageEntryPrice = unavailable(['unknown_entry_price']);
  else {
    const numerator = remaining.reduce(
      (total, lot) => total.plus(lot.remainingQuoteNotional!),
      dv('0'),
    );
    const denominator = remaining.reduce(
      (total, lot) => total.plus(dv(lot.remainingQuantity).times(lot.multiplier)),
      dv('0'),
    );
    averageEntryPrice = available(q(numerator.dividedBy(denominator)));
  }
  const entryCosts = remaining.flatMap((lot) => lot.costs);
  const expense = costsTotal(entryCosts, native);
  const netBasis =
    grossBasis.status !== 'available'
      ? grossBasis
      : remaining.some((lot) => !lot.costsComplete)
        ? unavailable(['incomplete_costs'], native)
        : expense.status !== 'available'
          ? expense
          : available(q(dv(grossBasis.value!).plus(expense.value!)), native);
  const realizedGross = aggregate(
    matches.map((match) => match.grossPnl),
    native,
  );
  const realizedNet = aggregate(
    matches.map((match) => match.netPnl),
    native,
  );
  const reasons = [
    ...new Set(
      [grossBasis, netBasis, realizedGross, realizedNet].flatMap((metric) => metric.reasons),
    ),
  ].sort();
  return {
    population: 'account-inventory',
    status: reasons.length ? 'unavailable' : 'available',
    reasons,
    scope: { ...input.scope },
    manifest: { ...input.manifest },
    sourceRevision: input.sourceRevision,
    policy,
    policyVersion,
    effectiveSourceIds: ordered.map((source) => source.id),
    lots,
    matches,
    originalCosts: [...originals].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
    unassignedCosts: unassigned,
    transferredCosts,
    openQuantity: available(signedQuantity),
    longQuantity: available(
      sumDecimals(
        remaining.filter((lot) => lot.direction === 'long').map((lot) => lot.remainingQuantity),
      ),
    ),
    shortQuantity: available(
      sumDecimals(
        remaining.filter((lot) => lot.direction === 'short').map((lot) => lot.remainingQuantity),
      ),
    ),
    averageEntryPrice,
    grossBasis,
    netBasis,
    realizedGross,
    realizedNet,
  };
}

/** Partition an actual fill once across campaign legs and an explicit unassigned remainder. */
export function allocateCampaignExecution(
  fill: InventoryFill,
  selections: readonly InventoryCampaignSelection[],
): readonly InventoryCampaignAllocation[] {
  const quantity = positive(fill.quantity);
  if (fill.price !== null) positive(fill.price);
  if (fill.multiplier !== null) positive(fill.multiplier);
  if (fill.bookedPrincipal !== null) positive(fill.bookedPrincipal);
  if (!selections.length) fail('campaign_allocation_required');
  const ids = new Set<string>();
  const normalized = selections.map((selection) => {
    identifier(selection.id);
    if (selection.legId !== null) identifier(selection.legId);
    if (ids.has(selection.id)) fail('duplicate_campaign_allocation');
    ids.add(selection.id);
    if (
      !['long', 'short'].includes(selection.direction) ||
      !['open', 'close'].includes(selection.role)
    )
      fail('invalid_campaign_allocation');
    const side =
      selection.direction === 'long'
        ? selection.role === 'open'
          ? 'buy'
          : 'sell'
        : selection.role === 'open'
          ? 'sell'
          : 'buy';
    if (side !== fill.side) fail('campaign_direction_review_required');
    return { ...selection, quantity: nonnegative(selection.quantity) };
  });
  if (!dv(sumDecimals(normalized.map((selection) => selection.quantity))).equals(quantity))
    fail('campaign_quantity_conservation');
  const weights = normalized.map((selection) => ({ id: selection.id, weight: selection.quantity }));
  const principal =
    fill.bookedPrincipal === null ? null : allocateDecimal(fill.bookedPrincipal, weights);
  const costs = fill.costs.map((cost) => ({ cost, pieces: allocateDecimal(cost.amount, weights) }));
  return normalized.map((selection, index) => ({
    ...selection,
    sourceId: fill.id,
    effectId: fill.effectId,
    sourceRevision: fill.sourceRevision,
    economicOrder: { ...fill.economicOrder },
    multiplier: fill.multiplier === null ? null : decimal(fill.multiplier),
    price: fill.price === null ? null : decimal(fill.price),
    bookedPrincipal: principal === null ? null : principal[index]!.amount,
    costs: costs.map(({ cost, pieces }) => ({ ...cost, amount: pieces[index]!.amount })),
    costsComplete: fill.costsComplete !== false,
    ...(fill.basisReportingFx ? { basisReportingFx: { ...fill.basisReportingFx } } : {}),
  }));
}

/** Replay one leg/unassigned analytical FIFO population without consuming account inventory. */
export function replayCampaignInventory(
  input: InventoryCampaignReplayInput,
): InventoryReplayResult {
  const legIds = new Set(input.allocations.map((allocation) => allocation.legId));
  if (legIds.size > 1) fail('incompatible_campaign_population');
  const allocations = input.allocations.filter((allocation) => {
    identifier(allocation.id);
    identifier(allocation.sourceId);
    identifier(allocation.effectId);
    if (allocation.legId !== null) identifier(allocation.legId);
    if (
      !['long', 'short'].includes(allocation.direction) ||
      !['open', 'close'].includes(allocation.role)
    )
      fail('invalid_campaign_allocation');
    return (
      integer(allocation.sourceRevision) <= integer(input.sourceRevision) &&
      !dv(nonnegative(allocation.quantity)).isZero()
    );
  });
  const sources: InventoryFill[] = allocations.map((allocation) => {
    const side =
      allocation.direction === 'long'
        ? allocation.role === 'open'
          ? 'buy'
          : 'sell'
        : allocation.role === 'open'
          ? 'sell'
          : 'buy';
    return {
      kind: 'fill',
      id: allocation.id,
      effectId: `${allocation.effectId}:${allocation.id}`,
      sourceRevision: allocation.sourceRevision,
      economicOrder: allocation.economicOrder,
      side,
      quantity: allocation.quantity,
      price: allocation.price,
      multiplier: allocation.multiplier,
      bookedPrincipal: allocation.bookedPrincipal,
      costs: allocation.costs,
      costsComplete: allocation.costsComplete,
      closeOnly: allocation.role === 'close',
      ...(allocation.basisReportingFx ? { basisReportingFx: allocation.basisReportingFx } : {}),
    };
  });
  const replayInput: InventoryReplayInput = {
    scope: input.scope,
    manifest: { ...input.manifest, lotPolicyVersion: 'campaign-attributed-fifo/1' },
    capability: input.capability,
    sourceRevision: input.sourceRevision,
    policy: 'fifo',
    sources,
  };
  let result: InventoryReplayResult;
  try {
    result = replayInventory(replayInput);
  } catch (error) {
    if (!(error instanceof InventoryError) || error.code !== 'inventory_conflict') throw error;
    result = blocked(
      replayInput,
      sources,
      sources.flatMap((source) =>
        source.costs.map((cost) => costPiece(cost, input.scope.settlementCurrencyId ?? undefined)),
      ),
      'missing_campaign_opening',
      false,
    );
    result = {
      ...result,
      openQuantity: unavailable(['missing_campaign_opening']),
      longQuantity: unavailable(['missing_campaign_opening']),
      shortQuantity: unavailable(['missing_campaign_opening']),
    };
  }
  return {
    ...result,
    population: 'campaign-attribution',
    effectiveSourceIds: [...new Set(allocations.map((allocation) => allocation.sourceId))],
  };
}

/** Account-minus-attribution differences reconcile realized and remaining basis timing. */
export function reconcileCampaignInventory(
  account: InventoryReplayResult,
  campaigns: readonly InventoryReplayResult[],
): InventoryCampaignBridge {
  if (account.population !== 'account-inventory') fail('invalid_account_inventory_population');
  for (const campaign of campaigns) {
    if (campaign.population !== 'campaign-attribution')
      fail('invalid_campaign_inventory_population');
    for (const key of [
      'workspaceId',
      'accountId',
      'instrumentId',
      'instrumentVersionId',
      'unitVersionId',
      'settlementCurrencyId',
    ] as const)
      if (campaign.scope[key] !== account.scope[key]) fail('incompatible_campaign_population');
    if (campaign.sourceRevision !== account.sourceRevision) fail('incompatible_campaign_revision');
  }
  const native = account.scope.settlementCurrencyId ?? undefined;
  const difference = (
    actual: InventoryMetric,
    attributed: readonly InventoryMetric[],
    currency?: string,
  ): InventoryMetric => {
    const total = aggregate(attributed, currency);
    return actual.status !== 'available' || total.status !== 'available'
      ? unavailable(
          [...actual.reasons, ...total.reasons],
          currency,
          actual.status === 'unsupported' || total.status === 'unsupported',
        )
      : available(q(dv(actual.value!).minus(total.value!)), currency);
  };
  const quantityDifference = difference(
    account.openQuantity,
    campaigns.map((campaign) => campaign.openQuantity),
  );
  const grossBasisDifference = difference(
    account.grossBasis,
    campaigns.map((campaign) => campaign.grossBasis),
    native,
  );
  const realizedGrossDifference = difference(
    account.realizedGross,
    campaigns.map((campaign) => campaign.realizedGross),
    native,
  );
  const remainingCounterpart =
    grossBasisDifference.status === 'available'
      ? available(q(dv(grossBasisDifference.value!).negated()), native)
      : grossBasisDifference;
  const attributedLongQuantity = aggregate(campaigns.map((campaign) => campaign.longQuantity));
  const attributedShortQuantity = aggregate(campaigns.map((campaign) => campaign.shortQuantity));
  return {
    population: 'account-versus-campaign-attribution',
    ownership: 'attribution-only',
    sourceRevision: account.sourceRevision,
    accountSourceIds: account.effectiveSourceIds,
    attributedSourceIds: [
      ...new Set(campaigns.flatMap((campaign) => campaign.effectiveSourceIds)),
    ].sort(),
    quantityDifference,
    grossBasisDifference,
    realizedGrossDifference,
    basisAttributionDifference: realizedGrossDifference,
    remainingCounterpart,
    reconciliationResidual: aggregate([realizedGrossDifference, remainingCounterpart], native),
    attributedLongQuantity,
    attributedShortQuantity,
    opposingClaims:
      attributedLongQuantity.status === 'available' &&
      attributedShortQuantity.status === 'available' &&
      dv(attributedLongQuantity.value!).greaterThan('0') &&
      dv(attributedShortQuantity.value!).greaterThan('0'),
  };
}

function reportingRate(
  rate: PinnedInventoryRate | undefined,
  native: string,
  reporting: string,
): string | null {
  if (native === reporting) {
    validateRate(rate, native, reporting);
    return '1';
  }
  if (!rate) return null;
  validateRate(rate, native, reporting);
  return rate.rate;
}

/** Valuation adds observations only. It never mutates original basis, quantity, costs or cash. */
export function valueInventory(
  result: InventoryReplayResult,
  input: InventoryValuationInput,
): InventoryValuationResult {
  const native = result.scope.settlementCurrencyId;
  const reporting = input.reportingCurrencyId;
  if (native === null) {
    const reasons = result.reasons.length ? result.reasons : ['missing_settlement_currency'];
    const nativeUnavailable = unavailable(reasons, undefined, result.status === 'unsupported');
    const reportingUnavailable =
      reporting === undefined
        ? unavailable(['reporting_currency_not_requested'])
        : unavailable(reasons, reporting, result.status === 'unsupported');
    return {
      scope: { ...result.scope },
      manifest: { ...result.manifest },
      sourceRevision: result.sourceRevision,
      markId: input.mark?.id ?? null,
      observationIds: [],
      markedValue: nativeUnavailable,
      unrealizedGross: nativeUnavailable,
      unrealizedNet: nativeUnavailable,
      reportingMarkedValue: reportingUnavailable,
      realizedReportingTradingGross: reportingUnavailable,
      realizedHoldingFx: reportingUnavailable,
      realizedReportingTradingNet: reportingUnavailable,
      realizedReportingNet: reportingUnavailable,
      unrealizedReportingTradingGross: reportingUnavailable,
      unrealizedHoldingFx: reportingUnavailable,
      unrealizedReportingTradingNet: reportingUnavailable,
      unrealizedReportingNet: reportingUnavailable,
    };
  }
  const remaining = result.lots.filter((lot) => !dv(lot.remainingQuantity).isZero());
  const open = result.openQuantity.value !== null && !dv(result.openQuantity.value).isZero();
  const hasReplay =
    result.grossBasis.status !== 'unsupported' &&
    result.openQuantity.status === 'available' &&
    (result.status === 'available' || result.lots.length > 0 || result.matches.length > 0) &&
    !result.reasons.includes('ambiguous_chronology');
  const noMark = open && (!input.mark || input.mark.eligible === false);
  let markedValue: InventoryMetric;
  if (!hasReplay)
    markedValue = unavailable(result.reasons, native, result.status === 'unsupported');
  else if (noMark) markedValue = unavailable([input.mark ? 'stale_price' : 'missing_mark'], native);
  else if (!open) markedValue = available('0', native);
  else {
    const mark = input.mark!;
    identifier(mark.id);
    instantKey(mark.instant);
    const price = nonnegative(mark.price);
    const multiplier = positive(mark.multiplier);
    if (remaining.some((lot) => !dv(lot.multiplier).equals(multiplier)))
      fail('incompatible_mark_multiplier');
    if (
      remaining.some(
        (lot) =>
          lot.economicOrder.instant !== null &&
          instantKey(lot.economicOrder.instant) > instantKey(mark.instant),
      )
    )
      fail('mark_precedes_inventory');
    markedValue = available(
      q(dv(result.openQuantity.value!).times(multiplier).times(price)),
      native,
    );
  }
  const unrealizedGross =
    markedValue.status !== 'available'
      ? markedValue
      : result.grossBasis.status !== 'available'
        ? result.grossBasis
        : available(q(dv(markedValue.value!).minus(result.grossBasis.value!)), native);
  const unrealizedNet = netMetric(
    unrealizedGross,
    remaining.flatMap((lot) => lot.costs),
    native,
    remaining.every((lot) => lot.costsComplete),
  );
  const notRequested = unavailable(['reporting_currency_not_requested'], reporting);
  const markRate =
    reporting === undefined ? null : reportingRate(input.markReportingFx, native, reporting);
  const reportingMarkedValue =
    reporting === undefined
      ? notRequested
      : markedValue.status !== 'available'
        ? { ...markedValue, currencyId: reporting }
        : !open
          ? available('0', reporting)
          : markRate === null
            ? unavailable(['missing_mark_fx'], reporting)
            : available(q(dv(markedValue.value!).times(markRate)), reporting);
  const realizedTrading: InventoryMetric[] = [];
  const realizedFx: InventoryMetric[] = [];
  const realizedTradingNet: InventoryMetric[] = [];
  const realizedNet: InventoryMetric[] = [];
  if (reporting !== undefined && hasReplay) {
    for (const match of result.matches) {
      const exitRate = reportingRate(match.exitReportingFx, native, reporting);
      const basisRate = reportingRate(match.basisReportingFx, native, reporting);
      const trading =
        match.grossPnl.status !== 'available'
          ? { ...match.grossPnl, currencyId: reporting }
          : exitRate === null
            ? unavailable(['missing_exit_fx'], reporting)
            : available(q(dv(match.grossPnl.value!).times(exitRate)), reporting);
      const fx =
        match.consumedPrincipal === null
          ? unavailable(['unknown_basis'], reporting)
          : exitRate === null || basisRate === null
            ? unavailable(['missing_basis_fx'], reporting)
            : available(
                q(
                  dv(match.consumedPrincipal)
                    .times(sign(match.direction))
                    .times(dv(exitRate).minus(basisRate)),
                ),
                reporting,
              );
      const costs = [...match.entryCosts, ...match.exitCosts, ...match.carryingCosts];
      realizedTrading.push(trading);
      realizedFx.push(fx);
      realizedTradingNet.push(netMetric(trading, costs, reporting, match.costsComplete, true));
      realizedNet.push(
        netMetric(aggregate([trading, fx], reporting), costs, reporting, match.costsComplete, true),
      );
    }
  }
  const unrealizedTrading: InventoryMetric[] = [];
  const unrealizedFx: InventoryMetric[] = [];
  if (reporting !== undefined && hasReplay) {
    for (const lot of remaining) {
      const basisRate = reportingRate(lot.basisReportingFx, native, reporting);
      const mark = input.mark;
      const gross =
        lot.remainingPrincipal === null
          ? unavailable(['unknown_basis'], reporting)
          : markedValue.status !== 'available'
            ? { ...markedValue, currencyId: reporting }
            : markRate === null
              ? unavailable(['missing_mark_fx'], reporting)
              : available(
                  q(
                    dv(lot.remainingQuantity)
                      .times(lot.multiplier)
                      .times(mark!.price)
                      .minus(lot.remainingPrincipal)
                      .times(sign(lot.direction))
                      .times(markRate),
                  ),
                  reporting,
                );
      const fx =
        lot.remainingPrincipal === null
          ? unavailable(['unknown_basis'], reporting)
          : markRate === null || basisRate === null
            ? unavailable(['missing_basis_fx'], reporting)
            : available(
                q(
                  dv(lot.remainingPrincipal)
                    .times(sign(lot.direction))
                    .times(dv(markRate).minus(basisRate)),
                ),
                reporting,
              );
      unrealizedTrading.push(gross);
      unrealizedFx.push(fx);
    }
  }
  const reportUnavailable =
    reporting === undefined
      ? notRequested
      : unavailable(result.reasons, reporting, result.status === 'unsupported');
  const reported = (components: readonly InventoryMetric[]) =>
    reporting === undefined || !hasReplay ? reportUnavailable : aggregate(components, reporting);
  const realizedReportingTradingGross = reported(realizedTrading);
  const realizedHoldingFx = reported(realizedFx);
  const unrealizedReportingTradingGross = reported(unrealizedTrading);
  const unrealizedHoldingFx = reported(unrealizedFx);
  const unrealizedReportingTradingNet =
    reporting === undefined || !hasReplay
      ? reportUnavailable
      : netMetric(
          unrealizedReportingTradingGross,
          remaining.flatMap((lot) => lot.costs),
          reporting,
          remaining.every((lot) => lot.costsComplete),
          true,
        );
  const unrealizedReportingNet =
    reporting === undefined || !hasReplay
      ? reportUnavailable
      : netMetric(
          aggregate([unrealizedReportingTradingGross, unrealizedHoldingFx], reporting),
          remaining.flatMap((lot) => lot.costs),
          reporting,
          remaining.every((lot) => lot.costsComplete),
          true,
        );
  const observationIds = new Set<string>();
  if (input.markReportingFx) observationIds.add(input.markReportingFx.observationId);
  for (const lot of result.lots) {
    if (lot.basisReportingFx) observationIds.add(lot.basisReportingFx.observationId);
    for (const cost of lot.costs) {
      if (cost.nativeFx) observationIds.add(cost.nativeFx.observationId);
      if (cost.reportingFx) observationIds.add(cost.reportingFx.observationId);
    }
  }
  for (const match of result.matches) {
    if (match.basisReportingFx) observationIds.add(match.basisReportingFx.observationId);
    if (match.exitReportingFx) observationIds.add(match.exitReportingFx.observationId);
    for (const cost of [...match.entryCosts, ...match.exitCosts, ...match.carryingCosts]) {
      if (cost.nativeFx) observationIds.add(cost.nativeFx.observationId);
      if (cost.reportingFx) observationIds.add(cost.reportingFx.observationId);
    }
  }
  return {
    scope: { ...result.scope },
    manifest: { ...result.manifest },
    sourceRevision: result.sourceRevision,
    markId: input.mark?.id ?? null,
    observationIds: [...observationIds].sort(),
    markedValue,
    unrealizedGross,
    unrealizedNet,
    reportingMarkedValue,
    realizedReportingTradingGross,
    realizedHoldingFx,
    realizedReportingTradingNet: reported(realizedTradingNet),
    realizedReportingNet: reported(realizedNet),
    unrealizedReportingTradingGross,
    unrealizedHoldingFx,
    unrealizedReportingTradingNet,
    unrealizedReportingNet,
  };
}
