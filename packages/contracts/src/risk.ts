import { z } from 'zod';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialSourceRevisionSchema,
  positiveFinancialDecimalSchema,
  nonnegativeFinancialDecimalSchema,
} from './financial.js';
const id = financialIdSchema.transform((value) => value.toLowerCase());
const label = z.string().trim().min(1).max(160);
const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose an IANA timezone.');
const common = { id };
const monetary = { maximum: nonnegativeFinancialDecimalSchema, currencyId: id };
export const riskLimitSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('trade-risk'),
    ...monetary,
    measure: z.enum(['amount', 'equity-ratio']),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('daily-loss'),
    ...monetary,
    basis: z.enum(['realized-activity', 'account-change']),
    includeIncome: z.boolean(),
    timezone,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('weekly-loss'),
    ...monetary,
    basis: z.enum(['realized-activity', 'account-change']),
    includeIncome: z.boolean(),
    timezone,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('positions'),
    maximum: z.number().int().min(0).max(1_000_000),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('concentration'),
    ...monetary,
    instrumentId: id.nullable(),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('exposure'),
    ...monetary,
    measure: z.enum(['gross', 'net']),
    denominator: z.enum(['amount', 'equity']),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('overnight'),
    timezone,
    boundaryHour: z.number().int().min(0).max(23),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('prohibited'),
    instrumentIds: id.array().max(100),
    families: label.array().max(100),
    subtypes: label.array().max(100),
  }),
]);
const sources = label
  .array()
  .min(1)
  .max(32)
  .refine((value) => new Set(value).size === value.length, 'Choose each source once.');
export const riskDefinitionSchema = z
  .strictObject({
    name: label,
    limits: riskLimitSchema.array().max(32),
    maxAgeMilliseconds: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    priceSources: sources,
    fxSources: sources,
  })
  .refine(
    (value) => new Set(value.limits.map((limit) => limit.id)).size === value.limits.length,
    'Limit identities must be unique.',
  )
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 65536,
    'A risk policy definition must fit 65536 UTF-8 bytes.',
  );
export const riskPolicyWriteSchema = z
  .strictObject({
    policyId: id.optional(),
    expectedVersion: z.number().int().min(0).max(2_147_483_646),
    accountId: id.nullable(),
    strategyId: id.nullable(),
    effectiveAt: financialInstantSchema,
    reason: z.string().trim().min(1).max(2000),
    definition: riskDefinitionSchema,
  })
  .refine(
    (value) => (value.accountId === null) !== (value.strategyId === null),
    'Choose exactly one account or strategy scope.',
  );
export const riskPolicyVersionSchema = z.strictObject({
  id,
  policyId: id,
  workspaceId: id,
  accountId: id.nullable(),
  strategyId: id.nullable(),
  version: z.number().int().positive(),
  effectiveAt: financialInstantSchema,
  createdAt: financialInstantSchema,
  actorId: z.string(),
  reason: z.string(),
  definition: riskDefinitionSchema,
});
export const riskPolicyListSchema = z.strictObject({
  versions: riskPolicyVersionSchema.array(),
  nextCursor: id.nullable(),
});
export const riskProposalSchema = z
  .strictObject({
    instrumentVersionId: id,
    side: z.enum(['long', 'short']),
    quantity: positiveFinancialDecimalSchema,
    riskAmount: positiveFinancialDecimalSchema.nullable(),
    riskCurrencyId: id.nullable(),
    riskMethod: z.string().trim().max(2000),
    entry: positiveFinancialDecimalSchema.nullable(),
    intendedExitAt: financialInstantSchema.nullable(),
  })
  .refine(
    (value) =>
      (value.riskAmount === null) === (value.riskCurrencyId === null) &&
      (value.riskAmount === null || value.riskMethod.length > 0),
    'Risk needs an amount, currency and method together.',
  );
export const riskAssessmentRequestSchema = z.strictObject({
  accountId: id,
  strategyVersionId: id.nullable(),
  asOf: financialInstantSchema,
  proposal: riskProposalSchema.nullable(),
});
export const riskFactSchema = z.strictObject({
  value: financialDecimalSchema.nullable(),
  unit: z.enum(['money', 'ratio', 'count', 'boolean']),
  currencyId: id.nullable(),
  reasons: z.string().array(),
  references: z.string().array(),
});
export const riskLimitAssessmentSchema = z.strictObject({
  policyVersionId: id,
  limit: riskLimitSchema,
  fact: riskFactSchema,
  state: z.enum(['passed', 'breached', 'unknown']),
  explanation: z.string(),
});
export const riskAssessmentResponseSchema = z.strictObject({
  id,
  accountId: id,
  strategyVersionId: id.nullable(),
  asOf: financialInstantSchema,
  createdAt: financialInstantSchema,
  actorId: z.string(),
  sourceRevision: financialSourceRevisionSchema,
  definitionVersion: z.literal('risk-assessment/1'),
  state: z.enum(['passed', 'breached', 'unknown', 'unconfigured']),
  policies: riskPolicyVersionSchema.array(),
  results: riskLimitAssessmentSchema.array(),
  proposal: riskProposalSchema.nullable(),
});
export const riskSizingRequestSchema = z.strictObject({
  accountId: id,
  instrumentVersionId: id,
  asOf: financialInstantSchema,
  side: z.enum(['long', 'short']),
  mode: z.enum(['linear', 'manual']),
  currencyId: id,
  budget: positiveFinancialDecimalSchema,
  entry: positiveFinancialDecimalSchema.nullable(),
  stop: positiveFinancialDecimalSchema.nullable(),
  fixedCosts: nonnegativeFinancialDecimalSchema,
  perUnitCosts: nonnegativeFinancialDecimalSchema,
  fxObservationId: id.nullable(),
  maxAgeMilliseconds: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  manualRisk: positiveFinancialDecimalSchema.nullable(),
  manualQuantity: positiveFinancialDecimalSchema.nullable(),
  method: z.string().trim().max(2000),
});
export const riskSizingResponseSchema = z.strictObject({
  state: z.enum(['available', 'unknown']),
  quantity: nonnegativeFinancialDecimalSchema.nullable(),
  plannedRisk: nonnegativeFinancialDecimalSchema.nullable(),
  riskPerUnit: positiveFinancialDecimalSchema.nullable(),
  budget: positiveFinancialDecimalSchema,
  currencyId: id,
  reasons: z.string().array(),
  mode: z.enum(['linear', 'manual']),
  definitionVersion: z.literal('planned-stop-risk/1'),
  references: z.string().array(),
  warning: z.string(),
});
export type RiskPolicyWrite = z.infer<typeof riskPolicyWriteSchema>;
export type RiskPolicyVersion = z.infer<typeof riskPolicyVersionSchema>;
export type RiskAssessmentRequest = z.infer<typeof riskAssessmentRequestSchema>;
export type RiskAssessmentResponse = z.infer<typeof riskAssessmentResponseSchema>;
export type RiskSizingRequest = z.infer<typeof riskSizingRequestSchema>;
export const riskCatalogQuerySchema = z.strictObject({
  collection: z.enum([
    'accounts',
    'strategies',
    'instruments',
    'currencies',
    'strategy-versions',
    'fx-observations',
  ]),
  after: id.optional(),
  search: z.string().trim().max(160).optional(),
});
export const riskCatalogResponseSchema = z.strictObject({
  items: z.strictObject({ id, label: z.string().min(1).max(2000) }).array(),
  nextCursor: id.nullable(),
});
