import { z } from 'zod';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialSourceRevisionSchema,
} from './financial.js';
import { suppliedReferenceSchema } from './supplied-reference.js';
const id = financialIdSchema.transform((value) => value.toLowerCase());
const source = {
  amount: financialDecimalSchema,
  currencyId: id,
  observedAt: financialInstantSchema,
  source: z.string().trim().min(1).max(160),
  sourceReference: z.string().trim().min(1).max(4000),
  quality: z.enum(['broker-reported', 'manually-verified']),
  expectedSourceRevision: financialSourceRevisionSchema,
  supersedesId: id.optional(),
};
export const suppliedComponentCreateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...source,
    kind: z.literal('position-equity'),
    accountId: id,
    instrumentVersionId: id,
    signedQuantity: financialDecimalSchema,
    valueDefinition: z.enum(['delivered-market-value', 'residual-contract-equity']),
    cashExcluded: z.literal(true),
    collateralExcluded: z.literal(true),
    settledPnlExcluded: z.literal(true),
    unsettledCashExcluded: z.literal(true),
    accrualTreatment: z.enum(['included-residual-only', 'not-applicable']),
  }),
  z.strictObject({
    ...source,
    kind: z.literal('campaign-net-result'),
    tradeId: id,
    resultDefinition: z.enum(['completed-realized-net', 'lifetime-total-net']),
    costsComplete: z.literal(true),
  }),
]);
export const suppliedComponentResponseSchema = suppliedReferenceSchema.extend({
  scopeLabel: z.string().max(500).optional(),
  currencyCode: z.string().max(160).optional(),
  accountId: id.nullable(),
  instrumentVersionId: id.nullable(),
  instrumentId: id.nullable(),
  tradeId: id.nullable(),
  signedQuantity: financialDecimalSchema.nullable(),
  supersedesId: id.nullable(),
  sourceInput: suppliedComponentCreateSchema,
});
export const suppliedComponentListQuerySchema = z.strictObject({
  accountId: id.optional(),
  tradeId: id.optional(),
  afterId: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const suppliedComponentListResponseSchema = z.strictObject({
  sourceRevision: financialSourceRevisionSchema,
  items: suppliedComponentResponseSchema.array().max(100),
  nextCursor: id.nullable(),
});
export type SuppliedComponentInput = z.infer<typeof suppliedComponentCreateSchema>;
export type SuppliedComponent = z.infer<typeof suppliedComponentResponseSchema>;
