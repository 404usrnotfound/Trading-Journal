import type { DbTransaction } from '@journal/database';

export type CurrencyKind = 'fiat' | 'digital' | 'custom';
export type AccountEnvironment = 'live' | 'paper';
export type InventoryMethod = 'fifo' | 'specific' | 'average';
export type HoldingMode = 'netted' | 'segregated';
export type InstrumentCapability = 'native-linear' | 'manual';
export type OrderStatus =
  'recorded' | 'working' | 'partially_filled' | 'filled' | 'canceled' | 'rejected' | 'expired';
export type JsonObject = Record<string, unknown>;

export type CreateCurrencyInput = {
  namespace: string;
  code: string;
  kind: CurrencyKind;
  unitIdentity: string;
  name: string;
  displayScale: number;
  settlementIncrement: string;
  effectiveAt: string;
};

export type CurrencyDto = CreateCurrencyInput & {
  id: string;
  conventionId: string;
  version: number;
  revision: number;
  archivedAt: string | null;
};
export type CurrencyConventionInput = Pick<
  CreateCurrencyInput,
  'displayScale' | 'settlementIncrement' | 'effectiveAt'
> & {
  expectedRevision: number;
  reason: string;
};

export type CreateBrokerInput = { name: string; sourceNamespace: string };
export type BrokerDto = CreateBrokerInput & {
  id: string;
  revision: number;
  archivedAt: string | null;
};

export type CreateAccountInput = {
  name: string;
  brokerId?: string | undefined;
  environment: AccountEnvironment;
  accountType: 'cash' | 'margin' | 'other';
  baseCurrencyId: string;
  inventoryMethod: InventoryMethod;
  allowShort: boolean;
  holdingMode: HoldingMode;
  effectiveAt: string;
};
export type AccountSettingsInput = Pick<
  CreateAccountInput,
  'baseCurrencyId' | 'inventoryMethod' | 'allowShort' | 'holdingMode' | 'effectiveAt'
> & { expectedRevision: number; reason: string };
export type AccountDto = Omit<CreateAccountInput, 'brokerId'> & {
  id: string;
  brokerId: string | null;
  settingsId: string;
  settingsVersion: number;
  status: 'active' | 'closed' | 'historical';
  revision: number;
  archivedAt: string | null;
};

export type InstrumentMetadataInput = {
  quantityUnit: string;
  quoteCurrencyId: string | null;
  settlementCurrencyId: string | null;
  multiplier: string | null;
  quantityIncrement: string | null;
  priceIncrement: string | null;
  capability: InstrumentCapability;
  effectiveAt: string;
  metadata?: JsonObject | undefined;
};
export type KnownNativeInstrumentMetadata = InstrumentMetadataInput & {
  capability: 'native-linear';
  quoteCurrencyId: string;
  settlementCurrencyId: string;
  multiplier: string;
  quantityIncrement: string;
  priceIncrement: string;
};
export type CreateInstrumentInput = InstrumentMetadataInput & {
  name: string;
  family: string;
  subtype: string;
  economicIdentity: string;
};
export type InstrumentVersionInput = InstrumentMetadataInput & {
  expectedRevision: number;
  reason: string;
};
export type InstrumentDto = CreateInstrumentInput & {
  id: string;
  versionId: string;
  version: number;
  revision: number;
  archivedAt: string | null;
};

export type OrderInstruction = {
  status: OrderStatus;
  quantity: string;
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  limitPrice?: string | undefined;
  stopPrice?: string | undefined;
  timeInForce: string;
};
export type CreateOrderInput = {
  accountId: string;
  kind: 'single' | 'package';
  sourceNamespace?: string | undefined;
  sourceId?: string | undefined;
  legs: { instrumentVersionId: string; side: 'buy' | 'sell'; ratio: string }[];
  instruction: OrderInstruction;
  economicAt: string;
};
export type AmendOrderInput = {
  expectedRevision: number;
  instruction: OrderInstruction;
  economicAt: string;
  reason: string;
};
export type OrderDto = Omit<CreateOrderInput, 'legs' | 'sourceNamespace' | 'sourceId'> & {
  id: string;
  sourceNamespace: string | null;
  sourceId: string | null;
  revision: number;
  /** Effective fill facts are separate from the latest broker instruction/status evidence. */
  fillStatus: 'unfilled' | 'partially_filled' | 'filled' | 'overfilled';
  discrepancies: ('source-overfill' | 'fill-after-terminal-intent')[];
  legs: {
    id: string;
    instrumentVersionId: string;
    side: 'buy' | 'sell';
    ratio: string;
    intendedQuantity: string;
    filledQuantity: string;
    remainingQuantity: string;
    overfillQuantity: string;
    executionCount: number;
    lateFillCount: number;
  }[];
};

export type CreateTradeInput = {
  title: string;
  classification: 'active-trading' | 'investing';
  strategyVersionId?: string | undefined;
};
export type TradeDto = Omit<CreateTradeInput, 'strategyVersionId'> & {
  id: string;
  status: 'planned' | 'open' | 'partially_closed' | 'closed' | 'canceled';
  revision: number;
  archivedAt: string | null;
  /** Historical closure is retained; changed quantity/obligations require review. */
  closureReviewRequired: boolean;
  strategyId: string | null;
  strategyVersionId: string | null;
  strategyLinkTiming: 'recorded-with-trade' | 'retrospective' | null;
};
export type AddTradeLegInput = {
  tradeId: string;
  expectedRevision: number;
  accountId: string;
  instrumentVersionId: string;
  direction: 'long' | 'short';
  label: string;
};
export type TradeLegDto = Omit<AddTradeLegInput, 'expectedRevision'> & { id: string };

export type ArchiveCatalogInput = { expectedRevision: number; reason: string };
export type ConfirmTradeClosureInput = {
  expectedRevision: number;
  reason: string;
  /** Explicit reviewed evidence that capability-specific obligations are discharged. */
  obligationEvidence: string;
};
export type TradeClosureDto = {
  id: string;
  tradeId: string;
  sourceRevision: string;
  revision: number;
  confirmedAt: string;
  definitionVersion: 'campaign-closure/1';
  status: 'closed';
};
export type QueryFilter = { includeArchived?: boolean | undefined; limit?: number | undefined };

export type AccountReference = {
  id: string;
  environment: AccountEnvironment;
  accountType: 'cash' | 'margin' | 'other';
  status: string;
  archivedAt: string | null;
  settingsId: string;
  settingsVersion: number;
  baseCurrencyId: string;
  inventoryMethod: InventoryMethod;
  allowShort: boolean;
  holdingMode: HoldingMode;
};
export type InstrumentVersionReference = InstrumentMetadataInput & {
  id: string;
  instrumentId: string;
  version: number;
  family: string;
  subtype: string;
  economicIdentity: string;
  archivedAt: string | null;
};
export type OrderLegReference = {
  id: string;
  orderId: string;
  accountId: string;
  instrumentVersionId: string;
  side: 'buy' | 'sell';
  ratio: string;
  status: OrderStatus;
  quantity: string;
};

export type CatalogTransaction = DbTransaction;
