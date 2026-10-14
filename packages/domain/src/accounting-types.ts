import type { DecimalString } from './index.js';
import type {
  InventoryReplayResult,
  InventoryTransferredSlice,
  PinnedInventoryRate,
} from './inventory-types.js';
import type { FxObservation, FxRateSelection, FxSelectionPolicy } from './valuation.js';
import type { FINANCIAL_CALCULATION_MANIFEST } from './decimal.js';

/** A missing value never becomes zero; the known subtotal retains independent evidence. */
export type AccountingMetric = Readonly<{
  state: 'available' | 'partial' | 'unavailable';
  value: DecimalString | null;
  knownSubtotal: DecimalString;
  currencyId: string;
  reasons: readonly string[];
  missingReferences: readonly string[];
}>;

export type AccountingCashBalance = Readonly<{
  accountId: string;
  cashBucketId: string;
  currencyId: string;
  amount: string;
  kind: string;
}>;
export type AccountingCashPosting = Readonly<{
  id: string;
  eventId: string;
  accountId: string;
  cashBucketId: string;
  currencyId: string;
  amount: string;
  economicAt: string;
  classification:
    | 'deposit'
    | 'withdrawal'
    | 'opening'
    | 'income'
    | 'fee'
    | 'tax'
    | 'expense'
    | 'trade-principal'
    | 'fx-conversion'
    | 'transfer'
    | 'settlement'
    | 'reclassification'
    | 'unresolved';
  sourceAccountId?: string;
  destinationAccountId?: string;
  /** Source-pinned execution/charge context also governs its actual cash movement. */
  reportingFx?: PinnedInventoryRate;
}>;
export type AccountingMark = Readonly<{ id: string; price: string; observedAt: string }>;
export type AccountingBook = Readonly<{
  id: string;
  accountId: string;
  instrumentId: string;
  instrumentVersionId: string;
  currencyId: string | null;
  multiplier: string | null;
  openingInventory: InventoryReplayResult;
  closingInventory: InventoryReplayResult;
  openingMark: AccountingMark | null;
  closingMark: AccountingMark | null;
}>;
export type AccountingHoldingTransfer = Readonly<{
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  instrumentId: string;
  currencyId: string | null;
  economicAt: string;
  slices: readonly InventoryTransferredSlice[];
  mark: AccountingMark | null;
}>;
export type AccountingHoldingOpening = Readonly<{
  id: string;
  accountId: string;
  instrumentId: string;
  currencyId: string | null;
  economicAt: string;
  direction: 'long' | 'short';
  quantity: string;
  multiplier: string | null;
  /** Only a validated delivered holding may be valued with quantity × multiplier × price. */
  nativeValuation: boolean;
  bookedPrincipal: string | null;
  basisReportingFx?: PinnedInventoryRate;
  mark: AccountingMark | null;
}>;
export type AccountingCashTransfer = Readonly<{
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  currencyId: string;
  amount: string;
  departedAt: string;
  receivedAt: string | null;
}>;
export type AccountingConversion = Readonly<{
  id: string;
  sourceCurrencyId: string;
  destinationCurrencyId: string;
  sourceAmount: string;
  destinationAmount: string;
  economicAt: string;
}>;
export type AccountingInput = Readonly<{
  accountIds: readonly string[];
  portfolioVersionId?: string;
  reportingCurrencyId: string;
  sourceRevision: string;
  from: string;
  to: string;
  fxPolicy: FxSelectionPolicy;
  pricePolicy: Readonly<{ maxAgeMilliseconds: number; sourcePriority: readonly string[] }>;
  fxObservations: readonly FxObservation[];
  /** Includes acquisition sources outside selected accounts so transferred basis remains traceable. */
  sourceInstants: Readonly<Record<string, string>>;
  openingCash: readonly AccountingCashBalance[];
  closingCash: readonly AccountingCashBalance[];
  cashPostings: readonly AccountingCashPosting[];
  books: readonly AccountingBook[];
  cashTransfers: readonly AccountingCashTransfer[];
  holdingTransfers: readonly AccountingHoldingTransfer[];
  holdingOpenings: readonly AccountingHoldingOpening[];
  conversions: readonly AccountingConversion[];
  coverage?: Readonly<{ reasons: readonly string[]; missingReferences: readonly string[] }>;
}>;
export type AccountingCurrencyMetric = Readonly<{
  currencyId: string;
  metric: AccountingMetric;
}>;
export type AccountingSnapshot = Readonly<{
  asOf: string;
  cashByCurrency: readonly Readonly<{
    currencyId: string;
    amount: DecimalString | null;
    reasons: readonly string[];
  }>[];
  cash: AccountingMetric;
  holdings: AccountingMetric;
  transit: AccountingMetric;
  equity: AccountingMetric;
  netLiquidationValue: AccountingMetric;
  unrealizedGrossByCurrency: readonly AccountingCurrencyMetric[];
}>;
export type AccountingReport = Readonly<{
  context: Readonly<{
    accountIds: readonly string[];
    portfolioVersionId?: string;
    reportingCurrencyId: string;
    sourceRevision: string;
    from: string;
    to: string;
    fxPolicy: FxSelectionPolicy;
    pricePolicy: AccountingInput['pricePolicy'];
    manifest: typeof FINANCIAL_CALCULATION_MANIFEST;
    accountingVersion: 'portfolio-accounting-v1';
  }>;
  opening: AccountingSnapshot;
  closing: AccountingSnapshot;
  breakdown: Readonly<{
    realizedTradingPnl: AccountingMetric;
    unrealizedTradingPnlChange: AccountingMetric;
    tradingPnl: AccountingMetric;
    holdingFx: AccountingMetric;
    cashFx: AccountingMetric;
    transitFx: AccountingMetric;
    conversionEffects: AccountingMetric;
    income: AccountingMetric;
    fees: AccountingMetric;
    expenses: AccountingMetric;
    taxes: AccountingMetric;
    externalCashFlows: AccountingMetric;
    boundaryTransfers: AccountingMetric;
    openingAdjustments: AccountingMetric;
  }>;
  native: Readonly<{
    realizedGross: readonly AccountingCurrencyMetric[];
    unrealizedGross: readonly AccountingCurrencyMetric[];
  }>;
  reconciliation: Readonly<{
    navChange: AccountingMetric;
    netCapitalFlows: AccountingMetric;
    performance: AccountingMetric;
    explainedChange: AccountingMetric;
    variance: AccountingMetric;
    roundingResidual: AccountingMetric;
  }>;
  dependencies: Readonly<{
    fx: readonly Readonly<{ componentId: string; selection: FxRateSelection }>[];
    prices: readonly Readonly<{
      componentId: string;
      observationId: string;
      observedAt: string;
    }>[];
    sourceIds: readonly string[];
  }>;
}>;
