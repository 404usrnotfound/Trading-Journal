import * as c from '@journal/contracts';

type Parser = { parse(value: unknown): unknown };
export type AdvancedField = {
  key: string;
  label: string;
  catalog?:
    | 'accounts'
    | 'instruments'
    | 'currencies'
    | 'buckets'
    | 'executions'
    | 'lots'
    | 'trades'
    | 'campaign-legs';
  options?: readonly string[];
  optional?: boolean;
  checked?: boolean;
};
const account: AdvancedField = { key: 'accountId', label: 'Account', catalog: 'accounts' };
const currency: AdvancedField = { key: 'currencyId', label: 'Currency', catalog: 'currencies' };
const bucket: AdvancedField = { key: 'cashBucketId', label: 'Cash bucket', catalog: 'buckets' };
const instrument: AdvancedField = {
  key: 'instrumentVersionId',
  label: 'Instrument version',
  catalog: 'instruments',
};
const economic: AdvancedField[] = [
  { key: 'economicAt', label: 'Economic time (ISO 8601 with offset)' },
  { key: 'orderingKey', label: 'Source ordering sequence' },
];
const amount: AdvancedField = { key: 'amount', label: 'Actual amount' };
const reason: AdvancedField = { key: 'reason', label: 'Reason / source evidence' };
const side: AdvancedField = { key: 'side', label: 'Side', options: ['buy', 'sell'] };
const quantity: AdvancedField = { key: 'quantity', label: 'Quantity' };
const sourceBucket: AdvancedField = {
  key: 'sourceBucketId',
  label: 'Source cash bucket',
  catalog: 'buckets',
};
const destinationBucket: AdvancedField = {
  key: 'destinationBucketId',
  label: 'Destination cash bucket',
  catalog: 'buckets',
};
export const advancedOperations: Record<
  string,
  {
    label: string;
    fields: AdvancedField[];
    request: Parser;
    response: Parser;
    rows?: readonly ('fees' | 'lots' | 'allocations' | 'legs' | 'effects')[];
  }
> = {
  brokers: {
    label: 'Broker setup',
    fields: [
      { key: 'name', label: 'Broker name' },
      { key: 'sourceNamespace', label: 'Source namespace' },
    ],
    request: c.brokerCreateSchema,
    response: c.brokerResponseSchema,
  },
  'cash-buckets': {
    label: 'Cash bucket setup',
    fields: [
      account,
      currency,
      {
        key: 'kind',
        label: 'Cash category',
        options: ['settled', 'unsettled', 'restricted', 'collateral_cash'],
      },
      { key: 'custodyKey', label: 'Custody reference', optional: true },
    ],
    request: c.cashBucketCreateSchema,
    response: c.cashBucketResponseSchema,
  },
  'cash-movements': {
    label: 'Deposit, withdrawal or opening cash',
    fields: [
      account,
      bucket,
      currency,
      {
        key: 'kind',
        label: 'Movement type',
        options: ['deposit', 'withdrawal', 'opening', 'income', 'unresolved'],
      },
      amount,
      ...economic,
    ],
    request: c.cashMovementCreateSchema,
    response: c.financialMutationResponseSchema,
  },
  'fx-conversions': {
    label: 'Actual currency conversion',
    fields: [
      sourceBucket,
      destinationBucket,
      { key: 'sourceAmount', label: 'Actual source amount' },
      { key: 'destinationAmount', label: 'Actual destination amount' },
      { key: 'rate', label: 'Source quoted rate (optional)', optional: true },
      ...economic,
    ],
    rows: ['fees'],
    request: c.fxConversionCreateSchema,
    response: c.fxConversionResponseSchema,
  },
  'opening-lots': {
    label: 'Opening holding / historical lot',
    fields: [
      account,
      instrument,
      { key: 'direction', label: 'Direction', options: ['long', 'short'] },
      quantity,
      { key: 'entryPrice', label: 'Known original entry price', optional: true },
      { key: 'bookedPrincipal', label: 'Known original booked basis', optional: true },
      { key: 'costsComplete', label: 'Original actual costs are complete', checked: true },
      reason,
      ...economic,
    ],
    request: c.openingLotCreateSchema,
    response: c.financialMutationResponseSchema,
  },
  executions: {
    label: 'Advanced source fill',
    fields: [
      account,
      instrument,
      side,
      quantity,
      { key: 'price', label: 'Actual source fill price', optional: true },
      { ...bucket, optional: true },
      { key: 'orderLegId', label: 'Source order leg reference', optional: true },
      { key: 'costsComplete', label: 'All actual source costs are included', checked: true },
      { key: 'closeOnly', label: 'Close only', checked: true },
      {
        key: 'manualCash',
        label: 'Use explicit supplied cash effects (manual instruments)',
        checked: true,
      },
      ...economic,
    ],
    rows: ['fees', 'lots', 'effects'],
    request: c.executionCreateSchema,
    response: c.executionResponseSchema,
  },
  'execution-allocations': {
    label: 'Split or reassign an existing fill',
    fields: [
      { key: 'executionId', label: 'Recorded execution', catalog: 'executions' },
      { key: 'expectedVersion', label: 'Current allocation version' },
      reason,
    ],
    rows: ['allocations'],
    request: c.executionAllocationSchema,
    response: c.allocationMutationResponseSchema,
  },
  orders: {
    label: 'Single or package order instruction',
    fields: [
      account,
      { key: 'kind', label: 'Order structure', options: ['single', 'package'] },
      { key: 'economicAt', label: 'Instruction time (ISO 8601 with offset)' },
      {
        key: 'status',
        label: 'Instruction status',
        options: [
          'recorded',
          'working',
          'partially_filled',
          'filled',
          'canceled',
          'rejected',
          'expired',
        ],
      },
      quantity,
      { key: 'orderType', label: 'Order type', options: ['market', 'limit', 'stop', 'stop_limit'] },
      { key: 'limitPrice', label: 'Limit price', optional: true },
      { key: 'stopPrice', label: 'Stop price', optional: true },
      { key: 'timeInForce', label: 'Time in force' },
    ],
    rows: ['legs'],
    request: c.orderCreateSchema,
    response: c.orderResponseSchema,
  },
  fees: {
    label: 'Actual fee or carrying charge',
    fields: [
      account,
      bucket,
      currency,
      amount,
      {
        key: 'kind',
        label: 'Charge kind',
        options: ['commission', 'exchange', 'regulatory', 'carrying', 'funding', 'borrow', 'other'],
      },
      { key: 'executionId', label: 'Related execution', optional: true },
      ...economic,
    ],
    request: c.feeCreateSchema,
    response: c.financialMutationResponseSchema,
  },
  'bucket-movements': {
    label: 'Settlement or internal cash movement',
    fields: [
      sourceBucket,
      destinationBucket,
      amount,
      {
        key: 'kind',
        label: 'Movement kind',
        options: ['settlement', 'reclassification', 'internal-transfer'],
      },
      { key: 'executionId', label: 'Related execution', optional: true },
      ...economic,
    ],
    request: c.bucketMovementCreateSchema,
    response: c.financialMutationResponseSchema,
  },
  'price-observations': {
    label: 'Manual instrument mark',
    fields: [
      instrument,
      currency,
      { key: 'price', label: 'Observed source price' },
      { key: 'observedAt', label: 'Observed time (ISO 8601 with offset)' },
      { key: 'source', label: 'Price source' },
    ],
    request: c.priceObservationCreateSchema,
    response: c.financialMutationResponseSchema,
  },
  'fx-observations': {
    label: 'Historical reporting FX observation',
    fields: [
      { key: 'baseCurrencyId', label: 'Base currency', catalog: 'currencies' },
      { key: 'quoteCurrencyId', label: 'Quote currency', catalog: 'currencies' },
      { key: 'rate', label: 'Quote units per one base unit' },
      { key: 'observedAt', label: 'Observed time (ISO 8601 with offset)' },
      { key: 'source', label: 'Rate source' },
    ],
    request: c.fxObservationCreateSchema,
    response: c.financialMutationResponseSchema,
  },
  'account-valuations': {
    label: 'Broker / manual account observation',
    fields: [
      account,
      currency,
      amount,
      { key: 'observedAt', label: 'Observed time (ISO 8601 with offset)' },
      { key: 'definition', label: 'Valuation definition and included components' },
      { key: 'source', label: 'Valuation source' },
    ],
    request: c.accountValuationObservationCreateSchema,
    response: c.financialMutationResponseSchema,
  },
};
export type AdvancedRows = Record<
  'fees' | 'lots' | 'allocations' | 'legs' | 'effects',
  Record<string, string>[]
>;
export const advancedRowFields: Record<keyof AdvancedRows, AdvancedField[]> = {
  fees: [currency, bucket, amount, { key: 'kind', label: 'Charge kind' }],
  lots: [{ key: 'lotId', label: 'Source lot reference', catalog: 'lots' }, quantity],
  allocations: [
    { key: 'tradeLegId', label: 'Campaign leg reference', catalog: 'campaign-legs' },
    quantity,
  ],
  legs: [instrument, side, { key: 'ratio', label: 'Leg ratio' }],
  effects: [bucket, currency, amount],
};
export function buildAdvancedRecord(
  operation: string,
  values: Record<string, string>,
  rows: AdvancedRows,
): unknown {
  const definition = advancedOperations[operation];
  if (!definition) throw new Error('Choose a supported record type.');
  const body: Record<string, unknown> = {};
  for (const field of definition.fields) {
    const value = values[field.key] ?? '';
    if (field.checked) body[field.key] = value === 'true';
    else if (!field.optional || value !== '') body[field.key] = value;
  }
  if (operation === 'executions') {
    body.price = values.price || null;
    delete body.manualCash;
    if (rows.fees.length) body.fees = rows.fees;
    if (rows.lots.length) body.specificLots = rows.lots;
    if (values.manualCash === 'true') body.manualCashEffects = rows.effects;
    else if (rows.effects.length)
      throw new Error('Confirm explicit supplied cash effects before entering manual cash.');
  }
  if (operation === 'fx-conversions' && rows.fees.length) body.fees = rows.fees;
  if (operation === 'execution-allocations') {
    body.expectedVersion = Number(values.expectedVersion);
    body.allocations = rows.allocations;
  }
  if (operation === 'orders') {
    body.instruction = Object.fromEntries(
      ['status', 'quantity', 'orderType', 'limitPrice', 'stopPrice', 'timeInForce']
        .filter((key) => values[key] !== '')
        .map((key) => [key, values[key]]),
    );
    for (const key of ['status', 'quantity', 'orderType', 'limitPrice', 'stopPrice', 'timeInForce'])
      delete body[key];
    body.legs = rows.legs;
  }
  return definition.request.parse(body);
}
