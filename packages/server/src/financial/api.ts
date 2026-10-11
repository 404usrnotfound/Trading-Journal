import * as contract from '@journal/contracts';
import { z } from 'zod';
import type { AuthorizationContext, ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createCatalogServices } from './catalog.js';
import { createFinancialLedger } from './ledger.js';
import { createFinancialObservations } from './observations.js';

type Defined<
  Value,
  Depth extends readonly unknown[] = [unknown, unknown, unknown, unknown, unknown, unknown],
> = Depth extends readonly [unknown, ...infer Rest]
  ? Value extends readonly unknown[]
    ? { [Key in keyof Value]: Defined<Value[Key], Rest> }
    : Value extends object
      ? { [Key in keyof Value]: Defined<Exclude<Value[Key], undefined>, Rest> }
      : Value
  : Value;

/** JSON cannot contain undefined. Remove Zod's optional undefined before exact-optional service DTOs. */
function defined<Value>(value: Value): Defined<Value> {
  if (Array.isArray(value)) return value.map((item: unknown) => defined(item)) as Defined<Value>;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, defined(child)]),
    ) as Defined<Value>;
  return value as Defined<Value>;
}

export function createFinancialServices(platform: Pick<ServerServices, 'withWorkspaceContext'>) {
  return {
    catalog: createCatalogServices(platform),
    ledger: createFinancialLedger(platform),
    observations: createFinancialObservations(platform),
  };
}

/** Explicit resource commands; the URL never becomes a table name or accounting formula. */
export function createFinancialApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const { catalog, ledger, observations } = createFinancialServices(platform);
  const command =
    <Input>(
      schema: z.ZodType<Input>,
      response: z.ZodType,
      operation: (
        context: AuthorizationContext,
        body: Defined<Input>,
        id: string,
      ) => Promise<unknown>,
    ) =>
    async (context: AuthorizationContext, request: Request, id: string) => {
      const body = defined(schema.parse(await readBoundedJson(request, 65_536)));
      return response.parse(await operation(context, body, id));
    };
  const writes = {
    currencies: command(
      contract.currencyCreateSchema,
      contract.currencyResponseSchema,
      catalog.createCurrency,
    ),
    brokers: command(
      contract.brokerCreateSchema,
      contract.brokerResponseSchema,
      catalog.createBroker,
    ),
    accounts: command(
      contract.accountCreateSchema,
      contract.accountResponseSchema,
      catalog.createAccount,
    ),
    instruments: command(
      contract.instrumentCreateSchema,
      contract.instrumentResponseSchema,
      catalog.createInstrument,
    ),
    orders: command(contract.orderCreateSchema, contract.orderResponseSchema, catalog.createOrder),
    trades: command(contract.tradeCreateSchema, contract.tradeResponseSchema, catalog.createTrade),
    'trade-legs': command(
      contract.tradeLegCreateSchema,
      contract.tradeLegResponseSchema,
      catalog.addTradeLeg,
    ),
    'cash-buckets': command(
      contract.cashBucketCreateSchema,
      contract.cashBucketResponseSchema,
      (context, body, commandId) => ledger.createCashBucket(context, { ...body, commandId }),
    ),
    'cash-movements': command(
      contract.cashMovementCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) => ledger.recordCashMovement(context, { ...body, commandId }),
    ),
    fees: command(
      contract.feeCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) => ledger.recordFee(context, { ...body, commandId }),
    ),
    'fx-conversions': command(
      contract.fxConversionCreateSchema,
      contract.fxConversionResponseSchema,
      (context, body, commandId) => ledger.recordFxConversion(context, { ...body, commandId }),
    ),
    'bucket-movements': command(
      contract.bucketMovementCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) => ledger.moveCashBuckets(context, { ...body, commandId }),
    ),
    executions: command(
      contract.executionCreateSchema,
      contract.executionResponseSchema,
      (context, body, commandId) => ledger.recordExecution(context, { ...body, commandId }),
    ),
    'opening-lots': command(
      contract.openingLotCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) => ledger.recordOpeningLot(context, { ...body, commandId }),
    ),
    'execution-corrections': command(
      contract.executionCorrectionSchema,
      contract.executionResponseSchema,
      (context, body, commandId) => ledger.correctExecution(context, { ...body, commandId }),
    ),
    'execution-allocations': command(
      contract.executionAllocationSchema,
      contract.allocationMutationResponseSchema,
      (context, body, commandId) => ledger.allocateExecution(context, { ...body, commandId }),
    ),
    'fx-observations': command(
      contract.fxObservationCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) =>
        observations.recordFxObservation(context, { ...body, commandId }),
    ),
    'price-observations': command(
      contract.priceObservationCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) =>
        observations.recordPriceObservation(context, { ...body, commandId }),
    ),
    'account-valuations': command(
      contract.accountValuationObservationCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) =>
        observations.recordAccountValuationObservation(context, { ...body, commandId }),
    ),
    'holding-transfers': command(
      contract.holdingTransferCreateSchema,
      contract.financialMutationResponseSchema,
      (context, body, commandId) => ledger.recordHoldingTransfer(context, { ...body, commandId }),
    ),
    'fee-attributions': command(
      contract.feeAttributionCreateSchema,
      contract.allocationMutationResponseSchema,
      (context, body, commandId) => ledger.attributeFee(context, { ...body, commandId }),
    ),
  };
  const catalogFilter = (request: Request) =>
    contract.financialCatalogQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
  const reads = {
    currencies: async (context: AuthorizationContext, request: Request) =>
      contract.currencyResponseSchema
        .array()
        .parse(await catalog.listCurrencies(context, catalogFilter(request))),
    brokers: async (context: AuthorizationContext, request: Request) =>
      contract.brokerResponseSchema
        .array()
        .parse(await catalog.listBrokers(context, catalogFilter(request))),
    accounts: async (context: AuthorizationContext, request: Request) => {
      const filter = contract.financialAccountQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.accountResponseSchema
        .array()
        .parse(await catalog.listAccounts(context, defined(filter)));
    },
    instruments: async (context: AuthorizationContext, request: Request) =>
      contract.instrumentResponseSchema
        .array()
        .parse(await catalog.listInstruments(context, catalogFilter(request))),
    orders: async (context: AuthorizationContext, request: Request) =>
      contract.orderResponseSchema
        .array()
        .parse(await catalog.listOrders(context, catalogFilter(request).limit)),
    trades: async (context: AuthorizationContext, request: Request) =>
      contract.tradeResponseSchema
        .array()
        .parse(await catalog.listTrades(context, catalogFilter(request))),
    executions: async (context: AuthorizationContext, request: Request) => {
      const filter = contract.financialExecutionsQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.executionResponseSchema
        .array()
        .parse(await ledger.executions(context, defined(filter)));
    },
    positions: async (context: AuthorizationContext, request: Request) => {
      const filter = contract.financialPositionsQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.positionResponseSchema
        .array()
        .parse(await ledger.positions(context, defined(filter)));
    },
    'cash-balances': async (context: AuthorizationContext, request: Request) => {
      const filter = contract.financialCashBalancesQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.cashBalanceResponseSchema.array().parse(
        await ledger.cashBalances(context, {
          ...(filter.accountId ? { accountIds: [filter.accountId] } : {}),
          ...(filter.asOf ? { asOf: filter.asOf } : {}),
          ...(filter.sourceRevision ? { sourceRevision: filter.sourceRevision } : {}),
        }),
      );
    },
    fees: async (context: AuthorizationContext, request: Request) => {
      const filter = contract.financialFeesQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.currencyAmountResponseSchema
        .array()
        .parse(await ledger.fees(context, defined(filter)));
    },
    valuation: async (context: AuthorizationContext, request: Request) => {
      const query = contract.financialValuationQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.financialValuationResponseSchema.parse(
        await observations.valuation(context, {
          accountIds: query.accountIds,
          reportingCurrencyId: query.reportingCurrencyId,
          asOf: query.asOf,
          fxPolicy: {
            id: query.fxPolicyId,
            maxAgeMilliseconds: query.fxMaxAgeMilliseconds,
            sourcePriority: query.fxSourcePriority,
          },
          priceMaxAgeMilliseconds: query.priceMaxAgeMilliseconds,
          priceSourcePriority: query.priceSourcePriority,
        }),
      );
    },
    'campaign-inventory': async (context: AuthorizationContext, request: Request) => {
      const filter = contract.financialCampaignInventoryQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.campaignInventoryResponseSchema.parse(
        await ledger.campaignInventory(context, defined(filter)),
      );
    },
    'account-valuations': async (context: AuthorizationContext, request: Request) => {
      const filter = contract.financialAccountValuationsQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return contract.accountValuationObservationResponseSchema
        .array()
        .parse(await observations.accountValuationObservations(context, defined(filter)));
    },
  };
  return async function handleFinancialRequest(
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> {
    const writing = request.method !== 'GET';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      workspaceId,
      writing ? 'editor' : 'viewer',
    );
    if (request.method !== 'GET' && request.method !== 'POST')
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET for financial reads and POST for explicit commands.',
      );
    let value: unknown;
    const resource = path[0];
    if (!resource) throw inaccessible();
    if (path.length === 1 && request.method === 'GET' && Object.hasOwn(reads, resource)) {
      value = await reads[resource as keyof typeof reads](context, request);
    } else if (path.length === 1 && writing && Object.hasOwn(writes, resource)) {
      value = await writes[resource as keyof typeof writes](
        context,
        request,
        contract.financialIdSchema.parse(request.headers.get('idempotency-key')),
      );
    } else if (path.length === 2 && request.method === 'GET') {
      const id = contract.financialIdSchema.parse(path[1]);
      switch (resource) {
        case 'currencies':
          value = contract.currencyResponseSchema.parse(await catalog.getCurrency(context, id));
          break;
        case 'accounts':
          value = contract.accountResponseSchema.parse(await catalog.getAccount(context, id));
          break;
        case 'instruments':
          value = contract.instrumentResponseSchema.parse(await catalog.getInstrument(context, id));
          break;
        case 'orders':
          value = contract.orderResponseSchema.parse(await catalog.getOrder(context, id));
          break;
        case 'trades':
          value = contract.tradeResponseSchema.parse(await catalog.getTrade(context, id));
          break;
        default:
          throw inaccessible();
      }
    } else if (path.length === 3) {
      const id = contract.financialIdSchema.parse(path[1]);
      if (resource === 'trades' && path[2] === 'legs' && request.method === 'GET') {
        value = contract.tradeLegResponseSchema
          .array()
          .parse(await catalog.listTradeLegs(context, id));
      } else if (writing) {
        const commandId = contract.financialIdSchema.parse(request.headers.get('idempotency-key'));
        const body = await readBoundedJson(request, 65_536);
        if (resource === 'currencies' && path[2] === 'conventions')
          value = contract.currencyResponseSchema.parse(
            await catalog.appendCurrencyConvention(
              context,
              id,
              contract.currencyConventionCreateSchema.parse(body),
              commandId,
            ),
          );
        else if (resource === 'accounts' && path[2] === 'settings')
          value = contract.accountResponseSchema.parse(
            await catalog.appendAccountSettings(
              context,
              id,
              contract.accountSettingsCreateSchema.parse(body),
              commandId,
            ),
          );
        else if (resource === 'instruments' && path[2] === 'versions')
          value = contract.instrumentResponseSchema.parse(
            await catalog.appendInstrumentVersion(
              context,
              id,
              contract.instrumentVersionCreateSchema.parse(body),
              commandId,
            ),
          );
        else if (resource === 'orders' && path[2] === 'amendments')
          value = contract.orderResponseSchema.parse(
            await catalog.amendOrder(context, id, contract.orderAmendSchema.parse(body), commandId),
          );
        else if (resource === 'trades' && path[2] === 'closures')
          value = contract.tradeClosureResponseSchema.parse(
            await catalog.confirmTradeClosure(
              context,
              id,
              contract.tradeClosureCreateSchema.parse(body),
              commandId,
            ),
          );
        else if (resource === 'trades' && path[2] === 'cancellations')
          value = contract.tradeResponseSchema.parse(
            await catalog.cancelTrade(
              context,
              id,
              contract.archiveFinancialSchema.parse(body),
              commandId,
            ),
          );
        else if (path[2] === 'archive') {
          const entities = {
            currencies: 'currency',
            brokers: 'broker',
            accounts: 'account',
            instruments: 'instrument',
            trades: 'trade',
          } as const;
          if (!Object.hasOwn(entities, resource)) throw inaccessible();
          value = contract.catalogArchiveResponseSchema.parse(
            await catalog.archiveCatalog(
              context,
              entities[resource as keyof typeof entities],
              id,
              contract.archiveFinancialSchema.parse(body),
              commandId,
            ),
          );
        } else throw inaccessible();
      } else throw inaccessible();
    } else throw inaccessible();
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}
