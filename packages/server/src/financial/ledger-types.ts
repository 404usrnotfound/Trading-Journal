import type { InventoryReplayResult, InventoryValuationResult } from '@journal/domain';

export type EconomicInput = { economicAt: string; orderingKey: string };
export type CommandInput = { commandId: string };
export type SourceIdentity = { namespace: string; id: string };
export type FeeInput = {
  cashBucketId: string;
  currencyId: string;
  amount: string;
  kind: string;
  economicAt?: string;
  nativeFx?: {
    observationId: string;
    rate: string;
    baseCurrencyId?: string;
    quoteCurrencyId?: string;
  };
  reportingFx?: {
    observationId: string;
    rate: string;
    baseCurrencyId?: string;
    quoteCurrencyId?: string;
  };
};
export type CashMovementInput = CommandInput &
  EconomicInput & {
    accountId: string;
    cashBucketId: string;
    currencyId: string;
    amount: string;
    kind: 'deposit' | 'withdrawal' | 'opening' | 'income' | 'unresolved';
    sourceIdentity?: SourceIdentity;
  };
export type CreateCashBucketInput = CommandInput & {
  accountId: string;
  currencyId: string;
  kind: 'settled' | 'unsettled' | 'restricted' | 'collateral_cash';
  custodyKey?: string;
};
export type RecordFeeInput = CommandInput &
  EconomicInput &
  FeeInput & {
    accountId: string;
    executionId?: string;
  };
export type FxConversionInput = CommandInput &
  EconomicInput & {
    sourceBucketId: string;
    destinationBucketId: string;
    sourceAmount: string;
    destinationAmount: string;
    rate?: string;
    rateReview?: { reason: string; source: string };
    fees?: FeeInput[];
  };
export type BucketMovementInput = CommandInput &
  EconomicInput & {
    sourceBucketId: string;
    destinationBucketId: string;
    amount: string;
    kind: 'settlement' | 'reclassification' | 'internal-transfer';
    executionId?: string;
  };
export type ExecutionInput = CommandInput &
  EconomicInput & {
    accountId: string;
    instrumentVersionId: string;
    orderLegId?: string;
    side: 'buy' | 'sell';
    quantity: string;
    price: string | null;
    bookedPrincipal?: string;
    principalReview?: { reason: string; source: string };
    principalCurrencyId?: string;
    cashBucketId?: string;
    sourceIdentity?: SourceIdentity;
    fees?: FeeInput[];
    closeOnly?: boolean;
    costsComplete?: boolean;
    specificLots?: { lotId: string; quantity: string }[];
    basisReportingFx?: { observationId: string; rate: string };
    /** Manual cash effects are actual evidence, never notional-derived derivative cash. */
    manualCashEffects?: { cashBucketId: string; currencyId: string; amount: string }[];
  };
export type OpeningLotInput = CommandInput &
  EconomicInput & {
    accountId: string;
    instrumentVersionId: string;
    direction: 'long' | 'short';
    quantity: string;
    entryPrice?: string;
    bookedPrincipal?: string;
    reason: string;
    costsComplete?: boolean;
    basisReportingFx?: { observationId: string; rate: string };
  };
export type CorrectExecutionInput = CommandInput & {
  originalExecutionId: string;
  reason: string;
  replacement: Omit<ExecutionInput, 'commandId'>;
  replacementAllocations?: { tradeLegId: string; quantity: string }[];
};
export type AllocationInput = CommandInput & {
  executionId: string;
  reason: string;
  expectedVersion: number;
  allocations: { tradeLegId: string; quantity: string }[];
};
export type HoldingTransferInput = CommandInput &
  EconomicInput & {
    sourceAccountId: string;
    destinationAccountId: string;
    instrumentVersionId: string;
    reason: string;
    selections: { lotId: string; quantity: string }[];
  };
export type FeeAttributionInput = CommandInput &
  EconomicInput & {
    feeId: string;
    instrumentVersionId: string;
    reason: string;
    expectedVersion: number;
    allocations: { target: 'lot' | 'match' | 'unassigned'; targetId?: string; amount: string }[];
  };
export type CampaignInventoryDto = {
  tradeLegId: string | null;
  accountId: string;
  instrumentId: string;
  inventory: InventoryReplayResult;
  valuation?: InventoryValuationResult;
};
export type FinancialMutationResult = {
  id: string;
  commandId: string;
  sourceRevision: string;
};
export type ExecutionDto = FinancialMutationResult & {
  accountId: string;
  instrumentVersionId: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string | null;
  bookedPrincipal: string | null;
  principalCurrencyId: string | null;
  economicAt: string;
  orderingKey: string;
  supersedesId: string | null;
  payload: Omit<ExecutionInput, 'commandId'>;
};
export type CashBalanceDto = {
  accountId: string;
  currencyId: string;
  cashBucketId: string;
  kind: string;
  amount: string;
};
export type PositionDto = {
  id: string;
  accountId: string;
  instrumentId: string;
  instrumentVersionId: string;
  sourceRevision: string;
  inventory: InventoryReplayResult;
  valuation?: InventoryValuationResult;
};
