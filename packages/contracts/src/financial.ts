import { z } from 'zod';
export const financialJsonSchema = z.json();

/** Source validation only: financial arithmetic belongs to the isolated domain kernel. */
export const financialIdSchema = z.uuid({ version: 'v4' });
export const financialDecimalSchema = z
  .string()
  .max(512)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u)
  .refine((value) => {
    const [whole = '', fraction = ''] = value.replace(/^-/u, '').split('.');
    return whole.length <= 42 && fraction.replace(/0+$/u, '').length <= 36;
  }, 'The value must fit NUMERIC(78,36) without rounding.');
export const positiveFinancialDecimalSchema = financialDecimalSchema.refine(
  (value) => !value.startsWith('-') && /[1-9]/u.test(value),
  'Use a positive decimal string.',
);
export const nonnegativeFinancialDecimalSchema = financialDecimalSchema.refine(
  (value) => !value.startsWith('-') || !/[1-9]/u.test(value),
  'Use a nonnegative decimal string.',
);
export const financialInstantSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => (value.match(/\.(\d+)/u)?.[1]?.length ?? 0) <= 6,
    'Retain at most six fractional second digits supported by PostgreSQL.',
  );
export const financialRevisionSchema = z.number().int().positive().max(2_147_483_647);
export const financialSourceRevisionSchema = z
  .string()
  .max(10)
  .regex(/^(?:0|[1-9]\d*)$/u)
  .refine(
    (value) => /^(?:0|[1-9]\d*)$/u.test(value) && BigInt(value) <= 2_147_483_647n,
    'The revision must fit PostgreSQL INTEGER.',
  );
export const financialOrderingKeySchema = z
  .string()
  .max(80)
  .regex(/^(?:0|[1-9]\d*)$/u);
const label = z.string().trim().min(1).max(160);
const economic = { economicAt: financialInstantSchema, orderingKey: financialOrderingKeySchema };
const sourceIdentity = z.strictObject({ namespace: label, id: label });
const pinnedRate = z.strictObject({
  observationId: financialIdSchema,
  rate: positiveFinancialDecimalSchema,
  baseCurrencyId: financialIdSchema.optional(),
  quoteCurrencyId: financialIdSchema.optional(),
});
const settings = {
  baseCurrencyId: financialIdSchema,
  inventoryMethod: z.enum(['fifo', 'specific', 'average']),
  allowShort: z.boolean(),
  holdingMode: z.enum(['netted', 'segregated']),
  effectiveAt: financialInstantSchema,
};
const instrumentMetadata = {
  quantityUnit: label,
  quoteCurrencyId: financialIdSchema.nullable(),
  settlementCurrencyId: financialIdSchema.nullable(),
  multiplier: positiveFinancialDecimalSchema.nullable(),
  quantityIncrement: positiveFinancialDecimalSchema.nullable(),
  priceIncrement: positiveFinancialDecimalSchema.nullable(),
  capability: z.enum(['native-linear', 'manual']),
  effectiveAt: financialInstantSchema,
  metadata: z.record(z.string().max(160), financialJsonSchema).optional(),
};
export const currencyCreateSchema = z.strictObject({
  namespace: label,
  code: label,
  kind: z.enum(['fiat', 'digital', 'custom']),
  unitIdentity: label,
  name: label,
  displayScale: z.number().int().min(0).max(36),
  settlementIncrement: positiveFinancialDecimalSchema,
  effectiveAt: financialInstantSchema,
});
export const brokerCreateSchema = z.strictObject({ name: label, sourceNamespace: label });
export const accountCreateSchema = z.strictObject({
  name: label,
  brokerId: financialIdSchema.optional(),
  environment: z.enum(['live', 'paper']),
  accountType: z.enum(['cash', 'margin', 'other']),
  ...settings,
});
export const accountSettingsCreateSchema = z.strictObject({
  ...settings,
  expectedRevision: financialRevisionSchema,
  reason: label,
});
export const instrumentCreateSchema = z.strictObject({
  name: label,
  family: label,
  subtype: label,
  economicIdentity: label,
  ...instrumentMetadata,
});
export const instrumentVersionCreateSchema = z.strictObject({
  ...instrumentMetadata,
  expectedRevision: financialRevisionSchema,
  reason: label,
});
export const currencyConventionCreateSchema = z.strictObject({
  displayScale: z.number().int().min(0).max(36),
  settlementIncrement: positiveFinancialDecimalSchema,
  effectiveAt: financialInstantSchema,
  expectedRevision: financialRevisionSchema,
  reason: label,
});
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
    quantity: positiveFinancialDecimalSchema,
    orderType: z.enum(['market', 'limit', 'stop', 'stop_limit']),
    limitPrice: positiveFinancialDecimalSchema.optional(),
    stopPrice: positiveFinancialDecimalSchema.optional(),
    timeInForce: label,
  })
  .superRefine((value, context) => {
    if (['limit', 'stop_limit'].includes(value.orderType) && !value.limitPrice)
      context.addIssue({ code: 'custom', message: 'A limit price is required.' });
    if (['stop', 'stop_limit'].includes(value.orderType) && !value.stopPrice)
      context.addIssue({ code: 'custom', message: 'A stop price is required.' });
  });
const orderLeg = z.strictObject({
  instrumentVersionId: financialIdSchema,
  side: z.enum(['buy', 'sell']),
  ratio: positiveFinancialDecimalSchema,
});
export const orderCreateSchema = z
  .strictObject({
    accountId: financialIdSchema,
    kind: z.enum(['single', 'package']),
    sourceNamespace: label.optional(),
    sourceId: label.optional(),
    legs: orderLeg.array().min(1).max(32),
    instruction: orderInstructionSchema,
    economicAt: financialInstantSchema,
  })
  .superRefine((value, context) => {
    if (value.kind === 'single' && value.legs.length !== 1)
      context.addIssue({ code: 'custom', message: 'A single order has exactly one leg.' });
    if ((value.sourceNamespace === undefined) !== (value.sourceId === undefined))
      context.addIssue({ code: 'custom', message: 'Provide both source namespace and source ID.' });
  });
export const orderAmendSchema = z.strictObject({
  expectedRevision: financialRevisionSchema,
  instruction: orderInstructionSchema,
  economicAt: financialInstantSchema,
  reason: label,
});
export const archiveFinancialSchema = z.strictObject({
  expectedRevision: financialRevisionSchema,
  reason: label,
});
export const tradeCreateSchema = z.strictObject({
  title: label,
  classification: z.enum(['active-trading', 'investing']),
});
export const tradeLegCreateSchema = z.strictObject({
  tradeId: financialIdSchema,
  expectedRevision: financialRevisionSchema,
  accountId: financialIdSchema,
  instrumentVersionId: financialIdSchema,
  direction: z.enum(['long', 'short']),
  label,
});
export const cashBucketCreateSchema = z.strictObject({
  accountId: financialIdSchema,
  currencyId: financialIdSchema,
  kind: z.enum(['settled', 'unsettled', 'restricted', 'collateral_cash']),
  custodyKey: label.optional(),
});
export const cashMovementCreateSchema = z.strictObject({
  ...economic,
  accountId: financialIdSchema,
  cashBucketId: financialIdSchema,
  currencyId: financialIdSchema,
  amount: financialDecimalSchema,
  kind: z.enum(['deposit', 'withdrawal', 'opening', 'income', 'unresolved']),
  sourceIdentity: sourceIdentity.optional(),
});
export const feeComponentSchema = z.strictObject({
  cashBucketId: financialIdSchema,
  currencyId: financialIdSchema,
  amount: financialDecimalSchema,
  kind: label,
  economicAt: financialInstantSchema.optional(),
  nativeFx: pinnedRate.optional(),
  reportingFx: pinnedRate.optional(),
});
export const feeCreateSchema = feeComponentSchema.extend({
  ...economic,
  accountId: financialIdSchema,
  executionId: financialIdSchema.optional(),
});
export const fxConversionCreateSchema = z.strictObject({
  ...economic,
  sourceBucketId: financialIdSchema,
  destinationBucketId: financialIdSchema,
  sourceAmount: positiveFinancialDecimalSchema,
  destinationAmount: positiveFinancialDecimalSchema,
  rate: positiveFinancialDecimalSchema.optional(),
  rateReview: z.strictObject({ reason: label, source: label }).optional(),
  fees: feeComponentSchema.array().max(64).optional(),
});
const reviewedSource = z.strictObject({ reason: label, source: label });
export const bucketMovementCreateSchema = z.strictObject({
  ...economic,
  sourceBucketId: financialIdSchema,
  destinationBucketId: financialIdSchema,
  amount: positiveFinancialDecimalSchema,
  kind: z.enum(['settlement', 'reclassification', 'internal-transfer']),
  executionId: financialIdSchema.optional(),
});
export const executionCreateSchema = z.strictObject({
  ...economic,
  accountId: financialIdSchema,
  instrumentVersionId: financialIdSchema,
  orderLegId: financialIdSchema.optional(),
  side: z.enum(['buy', 'sell']),
  quantity: positiveFinancialDecimalSchema,
  price: nonnegativeFinancialDecimalSchema.nullable(),
  bookedPrincipal: positiveFinancialDecimalSchema.optional(),
  principalCurrencyId: financialIdSchema.optional(),
  cashBucketId: financialIdSchema.optional(),
  sourceIdentity: sourceIdentity.optional(),
  fees: feeComponentSchema.array().max(64).optional(),
  closeOnly: z.boolean().optional(),
  costsComplete: z.boolean().optional(),
  specificLots: z
    .strictObject({ lotId: z.string().min(1).max(200), quantity: positiveFinancialDecimalSchema })
    .array()
    .max(1000)
    .optional(),
  basisReportingFx: pinnedRate.optional(),
  principalReview: reviewedSource.optional(),
  manualCashEffects: z
    .strictObject({
      cashBucketId: financialIdSchema,
      currencyId: financialIdSchema,
      amount: financialDecimalSchema,
    })
    .array()
    .max(64)
    .optional(),
});
export const openingLotCreateSchema = z.strictObject({
  ...economic,
  accountId: financialIdSchema,
  instrumentVersionId: financialIdSchema,
  direction: z.enum(['long', 'short']),
  quantity: positiveFinancialDecimalSchema,
  entryPrice: positiveFinancialDecimalSchema.optional(),
  bookedPrincipal: positiveFinancialDecimalSchema.optional(),
  reason: label,
  costsComplete: z.boolean().optional(),
  basisReportingFx: pinnedRate.optional(),
});
export const executionCorrectionSchema = z.strictObject({
  originalExecutionId: financialIdSchema,
  reason: label,
  replacement: executionCreateSchema,
  replacementAllocations: z
    .strictObject({ tradeLegId: financialIdSchema, quantity: positiveFinancialDecimalSchema })
    .array()
    .max(1000)
    .optional(),
});
export const executionAllocationSchema = z.strictObject({
  executionId: financialIdSchema,
  reason: label,
  expectedVersion: financialRevisionSchema,
  allocations: z
    .strictObject({ tradeLegId: financialIdSchema, quantity: positiveFinancialDecimalSchema })
    .array()
    .max(1000),
});

const archiveFields = {
  id: financialIdSchema,
  revision: financialRevisionSchema,
  archivedAt: financialInstantSchema.nullable(),
};
export const currencyResponseSchema = currencyCreateSchema.extend({
  ...archiveFields,
  conventionId: financialIdSchema,
  version: financialRevisionSchema,
});
export const brokerResponseSchema = brokerCreateSchema.extend(archiveFields);
export const accountResponseSchema = accountCreateSchema.extend({
  ...archiveFields,
  brokerId: financialIdSchema.nullable(),
  settingsId: financialIdSchema,
  settingsVersion: financialRevisionSchema,
  status: z.enum(['active', 'closed', 'historical']),
});
export const instrumentResponseSchema = instrumentCreateSchema.extend({
  ...archiveFields,
  versionId: financialIdSchema,
  version: financialRevisionSchema,
});
export const orderResponseSchema = z.strictObject({
  accountId: financialIdSchema,
  kind: z.enum(['single', 'package']),
  instruction: orderInstructionSchema,
  economicAt: financialInstantSchema,
  id: financialIdSchema,
  revision: financialRevisionSchema,
  sourceNamespace: label.nullable(),
  sourceId: label.nullable(),
  fillStatus: z.enum(['unfilled', 'partially_filled', 'filled', 'overfilled']),
  discrepancies: z.enum(['source-overfill', 'fill-after-terminal-intent']).array(),
  legs: orderLeg
    .extend({
      id: financialIdSchema,
      intendedQuantity: financialDecimalSchema,
      filledQuantity: financialDecimalSchema,
      remainingQuantity: financialDecimalSchema,
      overfillQuantity: financialDecimalSchema,
      executionCount: z.number().int().nonnegative(),
      lateFillCount: z.number().int().nonnegative(),
    })
    .array(),
});
export const tradeResponseSchema = tradeCreateSchema.extend({
  ...archiveFields,
  status: z.enum(['planned', 'open', 'partially_closed', 'closed', 'canceled']),
  closureReviewRequired: z.boolean(),
});
export const tradeLegResponseSchema = tradeLegCreateSchema
  .omit({ expectedRevision: true })
  .extend({ id: financialIdSchema });
export const financialMutationResponseSchema = z.strictObject({
  id: financialIdSchema,
  commandId: financialIdSchema,
  sourceRevision: financialSourceRevisionSchema,
});
export const cashBucketResponseSchema = financialMutationResponseSchema.extend({
  accountId: financialIdSchema,
  currencyId: financialIdSchema,
  kind: z.enum(['settled', 'unsettled', 'restricted', 'collateral_cash']),
});
export const fxConversionResponseSchema = financialMutationResponseSchema.extend({
  actualRate: financialDecimalSchema,
});
export const allocationMutationResponseSchema = financialMutationResponseSchema.extend({
  version: financialRevisionSchema,
});
export const catalogArchiveResponseSchema = z.strictObject({
  id: financialIdSchema,
  revision: financialRevisionSchema,
  archivedAt: financialInstantSchema,
});
export const currencyAmountResponseSchema = z.strictObject({
  currencyId: financialIdSchema,
  amount: financialDecimalSchema,
});
export const fxObservationCreateSchema = z.strictObject({
  baseCurrencyId: financialIdSchema,
  quoteCurrencyId: financialIdSchema,
  rate: positiveFinancialDecimalSchema,
  observedAt: financialInstantSchema,
  source: label,
  supersedesId: financialIdSchema.optional(),
  reason: label.optional(),
});
export const priceObservationCreateSchema = z.strictObject({
  instrumentVersionId: financialIdSchema,
  currencyId: financialIdSchema,
  price: nonnegativeFinancialDecimalSchema,
  observedAt: financialInstantSchema,
  source: label,
  supersedesId: financialIdSchema.optional(),
  reason: label.optional(),
});
export const cashBalanceResponseSchema = z.strictObject({
  accountId: financialIdSchema,
  currencyId: financialIdSchema,
  cashBucketId: financialIdSchema,
  kind: label,
  amount: financialDecimalSchema,
});
export const executionResponseSchema = financialMutationResponseSchema.extend({
  accountId: financialIdSchema,
  instrumentVersionId: financialIdSchema,
  side: z.enum(['buy', 'sell']),
  quantity: financialDecimalSchema,
  price: financialDecimalSchema.nullable(),
  bookedPrincipal: financialDecimalSchema.nullable(),
  principalCurrencyId: financialIdSchema.nullable(),
  ...economic,
  supersedesId: financialIdSchema.nullable(),
  payload: executionCreateSchema.extend({
    sourceInput: executionCreateSchema,
    booking: z.record(z.string(), financialJsonSchema).optional(),
    accountSettingsId: financialIdSchema.optional(),
    sourceFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  }),
});

const opaqueId = z.string().min(1).max(240);
const inventoryMetric = z.strictObject({
  status: z.enum(['available', 'unavailable', 'unsupported']),
  value: financialDecimalSchema.nullable(),
  currencyId: opaqueId.optional(),
  reasons: z.string().array(),
});
const inventoryScope = z.strictObject({
  workspaceId: opaqueId,
  accountId: opaqueId,
  instrumentId: opaqueId,
  instrumentVersionId: opaqueId,
  unitVersionId: opaqueId,
  settlementCurrencyId: opaqueId.nullable(),
});
const inventoryManifest = z.strictObject({
  kernelVersion: label,
  instrumentModuleVersion: label,
  lotPolicyVersion: label,
  allocationPolicyVersion: label,
  fxPolicyVersion: label,
  roundingPolicyVersion: label,
});
const inventoryRate = z.strictObject({
  observationId: opaqueId,
  rate: financialDecimalSchema,
  baseCurrencyId: opaqueId.optional(),
  quoteCurrencyId: opaqueId.optional(),
});
const inventoryCost = z.strictObject({
  id: opaqueId,
  currencyId: opaqueId,
  amount: financialDecimalSchema,
  chargedAt: z.string(),
  nativeFx: inventoryRate.optional(),
  reportingFx: inventoryRate.optional(),
});
const inventoryOrder = z.strictObject({
  instant: z.string().nullable(),
  sequence: financialOrderingKeySchema.nullable(),
});
const inventoryLot = z.strictObject({
  id: opaqueId,
  sourceId: opaqueId,
  effectId: opaqueId,
  direction: z.enum(['long', 'short']),
  economicOrder: inventoryOrder,
  originalQuantity: financialDecimalSchema,
  remainingQuantity: financialDecimalSchema,
  multiplier: financialDecimalSchema,
  entryPrice: financialDecimalSchema.nullable(),
  remainingQuoteNotional: financialDecimalSchema.nullable(),
  remainingPrincipal: financialDecimalSchema.nullable(),
  signedGrossBasis: inventoryMetric,
  costs: inventoryCost.array(),
  costsComplete: z.boolean(),
  basisReportingFx: inventoryRate.optional(),
  transferId: opaqueId.optional(),
  parentLotId: opaqueId.optional(),
});
const inventoryMatch = z.strictObject({
  id: opaqueId,
  lotId: opaqueId,
  openingSourceId: opaqueId,
  closingSourceId: opaqueId,
  direction: z.enum(['long', 'short']),
  economicOrder: inventoryOrder,
  policy: z.enum(['fifo', 'specific', 'average']),
  policyVersion: label,
  quantity: financialDecimalSchema,
  multiplier: financialDecimalSchema,
  entryPrice: financialDecimalSchema.nullable(),
  exitPrice: financialDecimalSchema,
  consumedPrincipal: financialDecimalSchema.nullable(),
  exitPrincipal: financialDecimalSchema,
  consumedQuoteNotional: financialDecimalSchema.nullable(),
  exitQuoteNotional: financialDecimalSchema,
  entryCosts: inventoryCost.array(),
  exitCosts: inventoryCost.array(),
  carryingCosts: inventoryCost.array(),
  costsComplete: z.boolean(),
  basisReportingFx: inventoryRate.optional(),
  exitReportingFx: inventoryRate.optional(),
  grossPnl: inventoryMetric,
  netPnl: inventoryMetric,
  quotePricePnl: inventoryMetric,
  settlementRoundingPnl: inventoryMetric,
});
export const inventoryResponseSchema = z.strictObject({
  population: z.enum(['account-inventory', 'campaign-attribution']),
  status: z.enum(['available', 'unavailable', 'unsupported']),
  reasons: z.string().array(),
  scope: inventoryScope,
  manifest: inventoryManifest,
  sourceRevision: financialSourceRevisionSchema,
  policy: z.enum(['fifo', 'average', 'specific']),
  policyVersion: label,
  effectiveSourceIds: opaqueId.array(),
  lots: inventoryLot.array(),
  matches: inventoryMatch.array(),
  originalCosts: inventoryCost.array(),
  unassignedCosts: inventoryCost.array(),
  transferredCosts: inventoryCost.array(),
  openQuantity: inventoryMetric,
  longQuantity: inventoryMetric,
  shortQuantity: inventoryMetric,
  averageEntryPrice: inventoryMetric,
  grossBasis: inventoryMetric,
  netBasis: inventoryMetric,
  realizedGross: inventoryMetric,
  realizedNet: inventoryMetric,
});
export const inventoryValuationResponseSchema = z.strictObject({
  scope: inventoryScope,
  manifest: inventoryManifest,
  sourceRevision: financialSourceRevisionSchema,
  markId: opaqueId.nullable(),
  observationIds: opaqueId.array(),
  markedValue: inventoryMetric,
  unrealizedGross: inventoryMetric,
  unrealizedNet: inventoryMetric,
  reportingMarkedValue: inventoryMetric,
  realizedReportingTradingGross: inventoryMetric,
  realizedHoldingFx: inventoryMetric,
  realizedReportingTradingNet: inventoryMetric,
  realizedReportingNet: inventoryMetric,
  unrealizedReportingTradingGross: inventoryMetric,
  unrealizedHoldingFx: inventoryMetric,
  unrealizedReportingTradingNet: inventoryMetric,
  unrealizedReportingNet: inventoryMetric,
});
export const positionResponseSchema = z.strictObject({
  id: financialIdSchema,
  accountId: financialIdSchema,
  instrumentId: financialIdSchema,
  instrumentVersionId: financialIdSchema,
  sourceRevision: financialSourceRevisionSchema,
  inventory: inventoryResponseSchema,
  valuation: inventoryValuationResponseSchema.optional(),
});

export const financialCatalogQuerySchema = z.strictObject({
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const financialAccountQuerySchema = financialCatalogQuerySchema.extend({
  environment: z.enum(['live', 'paper']).optional(),
});
const includeSupersededQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
export const financialExecutionsQuerySchema = z.strictObject({
  accountId: financialIdSchema.optional(),
  afterId: financialIdSchema.optional(),
  includeSuperseded: includeSupersededQuery,
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const financialPositionsQuerySchema = z.strictObject({
  accountId: financialIdSchema.optional(),
  instrumentId: financialIdSchema.optional(),
});
export const financialCashBalancesQuerySchema = z.strictObject({
  accountId: financialIdSchema.optional(),
  asOf: financialInstantSchema.optional(),
  sourceRevision: financialSourceRevisionSchema.optional(),
});
export const financialFeesQuerySchema = z.strictObject({
  accountId: financialIdSchema.optional(),
});
export const financialCampaignInventoryQuerySchema = financialPositionsQuerySchema.extend({
  tradeId: financialIdSchema.optional(),
});
export const financialAccountValuationsQuerySchema = z.strictObject({
  accountId: financialIdSchema.optional(),
  asOf: financialInstantSchema.optional(),
  includeSuperseded: includeSupersededQuery,
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const fxPolicySchema = z.strictObject({
  id: label,
  maxAgeMilliseconds: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  sourcePriority: label.array().min(1).max(64),
});
const selectedFxSchema = z.strictObject({
  baseCurrencyId: financialIdSchema,
  quoteCurrencyId: financialIdSchema,
  rate: financialDecimalSchema,
  requestedAt: financialInstantSchema,
  observationIds: financialIdSchema.array(),
  route: z.enum(['identity', 'direct', 'inverse']),
  policyId: label,
});
const unavailableFxSchema = z.strictObject({
  state: z.literal('unavailable'),
  reasons: z.string().array(),
  missingReferences: z.string().array(),
});
const fxSelectionSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('available'), value: selectedFxSchema }),
  unavailableFxSchema,
]);
const navManifest = z.strictObject({
  kernel: label,
  ordinaryLinear: label,
  lotMatching: label,
  allocation: label,
  fxSelection: label,
  precision: label,
  schema: label,
});
const navMetadata = {
  asOf: financialInstantSchema,
  sourceRevision: financialSourceRevisionSchema,
  manifest: navManifest,
};
const navComponent = currencyAmountResponseSchema.extend({ id: financialIdSchema });
const navSchema = z.discriminatedUnion('state', [
  z.strictObject({
    ...navMetadata,
    state: z.literal('available'),
    value: currencyAmountResponseSchema,
    components: navComponent.array(),
    roundingResidual: financialDecimalSchema,
  }),
  z.strictObject({
    ...navMetadata,
    state: z.literal('partial'),
    availableSubtotal: currencyAmountResponseSchema,
    availableComponents: navComponent.array(),
    missingReferences: z.string().array(),
    reasons: z.string().array(),
  }),
  z.strictObject({
    ...navMetadata,
    state: z.literal('unavailable'),
    missingReferences: z.string().array(),
    reasons: z.string().array(),
  }),
]);
export const financialValuationResponseSchema = z.strictObject({
  accountIds: financialIdSchema.array(),
  environment: z.enum(['live', 'paper']),
  reportingCurrencyId: financialIdSchema,
  asOf: financialInstantSchema,
  sourceRevision: financialSourceRevisionSchema,
  fxPolicy: fxPolicySchema,
  pricePolicy: fxPolicySchema.omit({ id: true }),
  positions: positionResponseSchema.array(),
  nav: navSchema,
  priceDependencies: z
    .strictObject({
      id: financialIdSchema,
      price_raw: financialDecimalSchema,
      observed_at: financialInstantSchema,
      source: label,
      instrumentVersionId: financialIdSchema,
    })
    .array(),
  fxDependencies: z
    .strictObject({ componentId: financialIdSchema, selection: fxSelectionSchema })
    .array(),
});
export const financialValuationQuerySchema = z.strictObject({
  accountIds: z
    .string()
    .transform((value) => value.split(','))
    .pipe(financialIdSchema.array().min(1).max(100)),
  reportingCurrencyId: financialIdSchema,
  asOf: financialInstantSchema,
  fxPolicyId: label,
  fxMaxAgeMilliseconds: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  fxSourcePriority: z
    .string()
    .transform((value) => value.split(','))
    .pipe(label.array().min(1).max(64)),
  priceMaxAgeMilliseconds: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  priceSourcePriority: z
    .string()
    .transform((value) => value.split(','))
    .pipe(label.array().min(1).max(64)),
});

export type FinancialExecutionInput = z.infer<typeof executionCreateSchema>;
export type FinancialPositionResponse = z.infer<typeof positionResponseSchema>;

export const holdingTransferCreateSchema = z.strictObject({
  ...economic,
  sourceAccountId: financialIdSchema,
  destinationAccountId: financialIdSchema,
  instrumentVersionId: financialIdSchema,
  reason: label,
  selections: z
    .strictObject({ lotId: opaqueId, quantity: positiveFinancialDecimalSchema })
    .array()
    .min(1)
    .max(1000),
});
export const feeAttributionCreateSchema = z.strictObject({
  ...economic,
  feeId: financialIdSchema,
  instrumentVersionId: financialIdSchema,
  reason: label,
  expectedVersion: z.number().int().nonnegative(),
  allocations: z
    .strictObject({
      target: z.enum(['lot', 'match', 'unassigned']),
      targetId: opaqueId.optional(),
      amount: financialDecimalSchema,
    })
    .array()
    .min(1)
    .max(1000),
});
export const tradeClosureCreateSchema = z.strictObject({
  expectedRevision: financialRevisionSchema,
  reason: label,
  obligationEvidence: label,
});
export const tradeClosureResponseSchema = z.strictObject({
  id: financialIdSchema,
  tradeId: financialIdSchema,
  sourceRevision: financialSourceRevisionSchema,
  revision: financialRevisionSchema,
  confirmedAt: financialInstantSchema,
  definitionVersion: z.literal('campaign-closure/1'),
  status: z.literal('closed'),
});
export const accountValuationObservationCreateSchema = z.strictObject({
  accountId: financialIdSchema,
  currencyId: financialIdSchema,
  amount: financialDecimalSchema,
  observedAt: financialInstantSchema,
  definition: label,
  source: label,
  supersedesId: financialIdSchema.optional(),
  reason: label.optional(),
});
export const accountValuationObservationResponseSchema = z.strictObject({
  id: financialIdSchema,
  accountId: financialIdSchema,
  currencyId: financialIdSchema,
  amount: financialDecimalSchema,
  observedAt: financialInstantSchema,
  definition: label,
  source: label,
  supersedesId: financialIdSchema.nullable(),
  payload: z.record(z.string(), financialJsonSchema),
  actorId: z.string().min(1),
  origin: label,
  recordedAt: financialInstantSchema,
});
const campaignBridge = z.strictObject({
  population: z.literal('account-versus-campaign-attribution'),
  ownership: z.literal('attribution-only'),
  sourceRevision: financialSourceRevisionSchema,
  accountSourceIds: opaqueId.array(),
  attributedSourceIds: opaqueId.array(),
  quantityDifference: inventoryMetric,
  grossBasisDifference: inventoryMetric,
  realizedGrossDifference: inventoryMetric,
  basisAttributionDifference: inventoryMetric,
  remainingCounterpart: inventoryMetric,
  reconciliationResidual: inventoryMetric,
  attributedLongQuantity: inventoryMetric,
  attributedShortQuantity: inventoryMetric,
  opposingClaims: z.boolean(),
});
export const campaignInventoryResponseSchema = z.strictObject({
  sourceRevision: financialSourceRevisionSchema,
  populations: z
    .strictObject({
      tradeLegId: financialIdSchema.nullable(),
      accountId: financialIdSchema,
      instrumentId: financialIdSchema,
      inventory: inventoryResponseSchema,
      valuation: inventoryValuationResponseSchema.optional(),
    })
    .array(),
  bridges: campaignBridge.array(),
});

/** Named repeated structures keep the generated contract compact and reviewable. */
export const financialSchemaComponents = {
  FinancialLabel: label,
  FinancialPinnedRate: pinnedRate,
  FinancialSourceIdentity: sourceIdentity,
  FinancialInstrumentMetadata: z.strictObject(instrumentMetadata),
  FinancialOrderLeg: orderLeg,
  InventoryScope: inventoryScope,
  InventoryManifest: inventoryManifest,
  InventoryMetric: inventoryMetric,
  InventoryPinnedRate: inventoryRate,
  InventoryCost: inventoryCost,
  InventoryEconomicOrder: inventoryOrder,
  InventoryLot: inventoryLot,
  InventoryMatch: inventoryMatch,
  FxSelectionPolicy: fxPolicySchema,
  SelectedFxRate: selectedFxSchema,
  FxRateSelection: fxSelectionSchema,
  FinancialNavManifest: navManifest,
  FinancialNavComponent: navComponent,
  FinancialNav: navSchema,
  CampaignInventoryBridge: campaignBridge,
};
