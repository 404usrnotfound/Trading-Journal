import type { DecimalString } from './index.js';

/** References are opaque: currencies, units and instruments are never inferred from labels. */
export type InventoryScope = Readonly<{
  workspaceId: string;
  accountId: string;
  instrumentId: string;
  instrumentVersionId: string;
  unitVersionId: string;
  settlementCurrencyId: string | null;
}>;

export type InventoryManifest = Readonly<{
  kernelVersion: string;
  instrumentModuleVersion: string;
  lotPolicyVersion: string;
  allocationPolicyVersion: string;
  fxPolicyVersion: string;
  roundingPolicyVersion: string;
}>;

export type InventoryPolicy = 'fifo' | 'average' | 'specific';
export type InventoryDirection = 'long' | 'short';
export type InventoryMetric = Readonly<{
  status: 'available' | 'unavailable' | 'unsupported';
  value: DecimalString | null;
  currencyId?: string;
  reasons: readonly string[];
}>;

/** An already selected observation, not permission to look up a latest rate. */
export type PinnedInventoryRate = Readonly<{
  observationId: string;
  rate: string;
  baseCurrencyId?: string;
  quoteCurrencyId?: string;
}>;

export type InventoryCost = Readonly<{
  id: string;
  currencyId: string;
  /** Positive actual charge; a negative value is an explicitly recorded rebate. */
  amount: string;
  chargedAt: string;
  nativeFx?: PinnedInventoryRate;
  reportingFx?: PinnedInventoryRate;
}>;

export type InventoryCostPiece = Omit<InventoryCost, 'amount'> &
  Readonly<{ amount: DecimalString }>;

export type InventoryEconomicOrder = Readonly<{
  /** Canonical UTC instant, retaining fractional precision; null means unresolved chronology. */
  instant: string | null;
  /** Verified source/reviewed economic sequence; never a random UUID tie break. */
  sequence: string | null;
}>;

type InventorySourceHeader = Readonly<{
  id: string;
  effectId: string;
  sourceRevision: string;
  supersedesId?: string;
  economicOrder: InventoryEconomicOrder;
}>;

export type InventoryOpening = InventorySourceHeader &
  Readonly<{
    kind: 'opening';
    direction: InventoryDirection;
    quantity: string;
    multiplier: string | null;
    entryPrice: string | null;
    bookedPrincipal: string | null;
    costs: readonly InventoryCost[];
    costsComplete?: boolean;
    basisReportingFx?: PinnedInventoryRate;
  }>;

export type InventoryFill = InventorySourceHeader &
  Readonly<{
    kind: 'fill';
    side: 'buy' | 'sell';
    quantity: string;
    price: string | null;
    multiplier: string | null;
    /** Actual positive gross booked principal, excluding all separately identified costs. */
    bookedPrincipal: string | null;
    costs: readonly InventoryCost[];
    costsComplete?: boolean;
    basisReportingFx?: PinnedInventoryRate;
    specificLots?: readonly Readonly<{ lotId: string; quantity: string }>[];
    /** An instruction guard; actual crossing fills can be recorded with this set to false. */
    closeOnly?: boolean;
  }>;

export type InventoryContributionSnapshot = Readonly<{
  lotId: string;
  quantity: string;
  bookedPrincipal: string | null;
  quoteNotional: string | null;
  costs: readonly Readonly<{ costId: string; currencyId: string; amount: string }>[];
  basisReportingFx?: PinnedInventoryRate;
}>;

export type InventoryPolicyTransition = InventorySourceHeader &
  Readonly<{
    kind: 'policy-transition';
    fromPolicy: InventoryPolicy;
    toPolicy: InventoryPolicy;
    fromPolicyVersion: string;
    toPolicyVersion: string;
    reviewed: boolean;
    /** An explicit snapshot, including every remaining source contribution and rate. */
    contributions: readonly InventoryContributionSnapshot[];
  }>;

export type InventoryCostAttribution = InventorySourceHeader &
  Readonly<{
    kind: 'cost-attribution';
    cost: InventoryCost;
    allocations: readonly Readonly<{
      target: 'lot' | 'match' | 'unassigned';
      targetId?: string;
      amount: string;
    }>[];
  }>;

/** Kept only as bookkeeping provenance. It never participates in inventory matching. */
export type InventoryBookkeepingReversal = InventorySourceHeader &
  Readonly<{ kind: 'bookkeeping-reversal'; reversesId: string }>;

export type InventoryTransferredSlice = Readonly<{
  id: string;
  parentLotId: string;
  sourceId: string;
  effectId: string;
  direction: InventoryDirection;
  /** Original acquisition chronology, not the transfer's receipt timestamp. */
  economicOrder: InventoryEconomicOrder;
  quantity: string;
  multiplier: string;
  entryPrice: string | null;
  bookedPrincipal: string | null;
  quoteNotional: string | null;
  costs: readonly InventoryCostPiece[];
  costsComplete: boolean;
  basisReportingFx?: PinnedInventoryRate;
}>;

export type InventoryHoldingDeparture = InventorySourceHeader &
  Readonly<{
    kind: 'holding-departure';
    transferId: string;
    direction: InventoryDirection;
    selections: readonly Readonly<{ lotId: string; quantity: string }>[];
    slices: readonly InventoryTransferredSlice[];
  }>;

export type InventoryHoldingReceipt = InventorySourceHeader &
  Readonly<{
    kind: 'holding-receipt';
    transferId: string;
    slices: readonly InventoryTransferredSlice[];
  }>;

export type InventoryHoldingTransferInput = Readonly<{
  transferId: string;
  departureId: string;
  receiptId: string;
  destinationScope: InventoryScope;
  sourceRevision: string;
  destinationSourceRevision: string;
  economicOrder: InventoryEconomicOrder;
  selections: readonly Readonly<{ lotId: string; quantity: string; destinationLotId: string }>[];
}>;

export type InventoryCampaignSelection = Readonly<{
  id: string;
  legId: string | null;
  role: 'open' | 'close';
  direction: InventoryDirection;
  quantity: string;
}>;

/** An analytical partition of an actual fill, never another execution or holding asset. */
export type InventoryCampaignAllocation = InventoryCampaignSelection &
  Readonly<{
    sourceId: string;
    effectId: string;
    sourceRevision: string;
    economicOrder: InventoryEconomicOrder;
    multiplier: string | null;
    price: string | null;
    bookedPrincipal: string | null;
    costs: readonly InventoryCostPiece[];
    costsComplete: boolean;
    basisReportingFx?: PinnedInventoryRate;
  }>;

export type InventoryCampaignReplayInput = Omit<InventoryReplayInput, 'sources' | 'policy'> &
  Readonly<{
    allocations: readonly InventoryCampaignAllocation[];
  }>;

export type InventoryCampaignBridge = Readonly<{
  population: 'account-versus-campaign-attribution';
  ownership: 'attribution-only';
  sourceRevision: string;
  accountSourceIds: readonly string[];
  attributedSourceIds: readonly string[];
  quantityDifference: InventoryMetric;
  grossBasisDifference: InventoryMetric;
  realizedGrossDifference: InventoryMetric;
  /** Difference in realization caused by selecting different attributed opening basis. */
  basisAttributionDifference: InventoryMetric;
  /** The opposite timing difference retained in the attributed open population. */
  remainingCounterpart: InventoryMetric;
  reconciliationResidual: InventoryMetric;
  attributedLongQuantity: InventoryMetric;
  attributedShortQuantity: InventoryMetric;
  opposingClaims: boolean;
}>;

export type InventorySource =
  | InventoryOpening
  | InventoryFill
  | InventoryPolicyTransition
  | InventoryCostAttribution
  | InventoryBookkeepingReversal
  | InventoryHoldingDeparture
  | InventoryHoldingReceipt;

export type InventoryReplayInput = Readonly<{
  scope: InventoryScope;
  manifest: InventoryManifest;
  policy: InventoryPolicy;
  capability: Readonly<{
    subtype: string;
    nativeInventory: boolean;
    shortSupported: boolean;
    averageCostSupported: boolean;
  }>;
  sources: readonly InventorySource[];
  sourceRevision: string;
}>;

export type InventoryLot = Readonly<{
  /** Stable source identity; this analytical reference is not a database-generated lot UUID. */
  id: string;
  sourceId: string;
  effectId: string;
  direction: InventoryDirection;
  economicOrder: InventoryEconomicOrder;
  originalQuantity: DecimalString;
  remainingQuantity: DecimalString;
  multiplier: DecimalString;
  entryPrice: DecimalString | null;
  remainingQuoteNotional: DecimalString | null;
  remainingPrincipal: DecimalString | null;
  signedGrossBasis: InventoryMetric;
  costs: readonly InventoryCostPiece[];
  costsComplete: boolean;
  basisReportingFx?: PinnedInventoryRate;
  transferId?: string;
  parentLotId?: string;
}>;

export type InventoryMatch = Readonly<{
  id: string;
  lotId: string;
  openingSourceId: string;
  closingSourceId: string;
  direction: InventoryDirection;
  economicOrder: InventoryEconomicOrder;
  policy: InventoryPolicy;
  policyVersion: string;
  quantity: DecimalString;
  multiplier: DecimalString;
  entryPrice: DecimalString | null;
  exitPrice: DecimalString;
  consumedPrincipal: DecimalString | null;
  exitPrincipal: DecimalString;
  consumedQuoteNotional: DecimalString | null;
  exitQuoteNotional: DecimalString;
  entryCosts: readonly InventoryCostPiece[];
  exitCosts: readonly InventoryCostPiece[];
  carryingCosts: readonly InventoryCostPiece[];
  costsComplete: boolean;
  basisReportingFx?: PinnedInventoryRate;
  exitReportingFx?: PinnedInventoryRate;
  grossPnl: InventoryMetric;
  netPnl: InventoryMetric;
  quotePricePnl: InventoryMetric;
  settlementRoundingPnl: InventoryMetric;
}>;

export type InventoryReplayResult = Readonly<{
  population: 'account-inventory' | 'campaign-attribution';
  status: 'available' | 'unavailable' | 'unsupported';
  reasons: readonly string[];
  scope: InventoryScope;
  manifest: InventoryManifest;
  sourceRevision: string;
  policy: InventoryPolicy;
  policyVersion: string;
  effectiveSourceIds: readonly string[];
  lots: readonly InventoryLot[];
  matches: readonly InventoryMatch[];
  originalCosts: readonly InventoryCostPiece[];
  unassignedCosts: readonly InventoryCostPiece[];
  /** An attribution partition of existing charges, never another cash expense. */
  transferredCosts: readonly InventoryCostPiece[];
  openQuantity: InventoryMetric;
  longQuantity: InventoryMetric;
  shortQuantity: InventoryMetric;
  averageEntryPrice: InventoryMetric;
  grossBasis: InventoryMetric;
  netBasis: InventoryMetric;
  realizedGross: InventoryMetric;
  realizedNet: InventoryMetric;
}>;

export type InventoryValuationInput = Readonly<{
  mark: Readonly<{
    id: string;
    price: string;
    multiplier: string;
    instant: string;
    /** Eligibility is selected by the caller's versioned mark policy, not the wall clock. */
    eligible?: boolean;
  }> | null;
  reportingCurrencyId?: string;
  markReportingFx?: PinnedInventoryRate;
}>;

export type InventoryValuationResult = Readonly<{
  scope: InventoryScope;
  manifest: InventoryManifest;
  sourceRevision: string;
  markId: string | null;
  observationIds: readonly string[];
  markedValue: InventoryMetric;
  unrealizedGross: InventoryMetric;
  unrealizedNet: InventoryMetric;
  reportingMarkedValue: InventoryMetric;
  realizedReportingTradingGross: InventoryMetric;
  realizedHoldingFx: InventoryMetric;
  realizedReportingTradingNet: InventoryMetric;
  realizedReportingNet: InventoryMetric;
  unrealizedReportingTradingGross: InventoryMetric;
  unrealizedHoldingFx: InventoryMetric;
  unrealizedReportingTradingNet: InventoryMetric;
  unrealizedReportingNet: InventoryMetric;
}>;
