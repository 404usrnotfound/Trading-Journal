import { z } from 'zod';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialSourceRevisionSchema,
  nonnegativeFinancialDecimalSchema,
} from './financial.js';
import { accountingFxPolicySchema, accountingPricePolicySchema } from './accounting.js';

const id = financialIdSchema.transform((value) => value.toLowerCase());
const tolerance = nonnegativeFinancialDecimalSchema.default('0');
const cashLine = z.strictObject({ currencyId: id, amount: financialDecimalSchema, tolerance });
const holdingLine = z.strictObject({
  instrumentVersionId: id,
  quantity: financialDecimalSchema,
  tolerance,
});
const equityLine = cashLine.extend({ definition: z.literal('owned-cash-plus-signed-holdings/1') });
export const createStatementRequestSchema = z
  .strictObject({
    accountId: id,
    asOf: financialInstantSchema,
    sourceName: z.string().trim().min(1).max(160),
    sourceReference: z.string().trim().min(1).max(500),
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    cashDefinition: z.literal('all-owned-cash/1'),
    holdingsDefinition: z.literal('netted-account-inventory/1'),
    completeCash: z.boolean(),
    completeHoldings: z.boolean(),
    cash: cashLine.array().max(100),
    holdings: holdingLine.array().max(100),
    equity: equityLine.optional(),
    notes: z.string().max(4000).default(''),
  })
  .superRefine((value, context) => {
    if (new Set(value.cash.map((line) => line.currencyId)).size !== value.cash.length)
      context.addIssue({ code: 'custom', path: ['cash'], message: 'List each currency once.' });
    if (
      new Set(value.holdings.map((line) => line.instrumentVersionId)).size !== value.holdings.length
    )
      context.addIssue({
        code: 'custom',
        path: ['holdings'],
        message: 'List each instrument version once.',
      });
    if (
      !value.completeCash &&
      !value.completeHoldings &&
      !value.cash.length &&
      !value.holdings.length &&
      !value.equity
    )
      context.addIssue({
        code: 'custom',
        message: 'Supply at least one comparison or an explicit complete zero scope.',
      });
  });
export const statementResponseSchema = z.strictObject({
  id,
  accountId: id,
  asOf: financialInstantSchema,
  createdAt: financialInstantSchema,
  sourceRevision: financialSourceRevisionSchema,
  document: createStatementRequestSchema,
});
export const reconciliationPolicySchema = z.strictObject({
  fxPolicy: accountingFxPolicySchema,
  pricePolicy: accountingPricePolicySchema,
});
export const evaluateStatementRequestSchema = z.strictObject({
  sourceRevision: financialSourceRevisionSchema.optional(),
  valuationPolicy: reconciliationPolicySchema.optional(),
  accept: z.boolean().default(false),
  reviewNote: z.string().trim().min(1).max(2000),
});
export const statementVarianceSchema = z.strictObject({
  kind: z.enum(['cash', 'holding', 'equity']),
  referenceId: id,
  expected: financialDecimalSchema,
  actual: financialDecimalSchema.nullable(),
  variance: financialDecimalSchema.nullable(),
  tolerance: nonnegativeFinancialDecimalSchema,
  state: z.enum(['matched', 'variance', 'unavailable']),
  reasons: z.string().max(160).array().max(100),
});
export const statementReconciliationResponseSchema = z.strictObject({
  id,
  statementId: id,
  accountId: id,
  asOf: financialInstantSchema,
  createdAt: financialInstantSchema,
  sourceRevision: financialSourceRevisionSchema,
  comparedRevision: financialSourceRevisionSchema,
  currentRevision: financialSourceRevisionSchema,
  stale: z.boolean(),
  status: z.enum(['matched', 'variance', 'unavailable']),
  accepted: z.boolean(),
  reviewNote: z.string().max(2000),
  valuationPolicy: reconciliationPolicySchema.optional(),
  rows: statementVarianceSchema.array().max(401),
});
export const statementListQuerySchema = z.strictObject({
  accountId: id.optional(),
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const statementListResponseSchema = z.strictObject({
  items: statementResponseSchema.array().max(100),
  nextCursor: id.nullable(),
});
export const statementEvaluationListResponseSchema = z.strictObject({
  items: statementReconciliationResponseSchema.array().max(100),
  nextCursor: id.nullable(),
});
export type StatementDocument = z.infer<typeof createStatementRequestSchema>;
export type StatementResponse = z.infer<typeof statementResponseSchema>;
export type StatementReconciliation = z.infer<typeof statementReconciliationResponseSchema>;
export type StatementVariance = z.infer<typeof statementVarianceSchema>;
