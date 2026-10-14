import { z } from 'zod';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialRevisionSchema,
  financialSchemaComponents,
  financialSourceRevisionSchema,
  nonnegativeFinancialDecimalSchema,
  positiveFinancialDecimalSchema,
  tradeResponseSchema,
} from './financial.js';
import { strategyVersionResponseSchema } from './strategies.js';

export const JOURNAL_DOCUMENT_MAXIMUM_BYTES = 131_072;
const id = financialIdSchema.transform((value) => value.toLowerCase());
const nullableId = z.union([id, z.null()]);
const nullableInstant = z.union([financialInstantSchema, z.null()]);
const label = z.string().trim().min(1).max(160);
const narrative = z.string().max(20_000);
const reason = z.string().trim().min(1).max(2_000);
const actor = z.string().min(1).max(128);
// Calculated units may prefix a full 160-character instrument quantity unit.
const metricUnit = z.string().trim().min(1).max(200);
const labels = label.array().max(100);
const nullablePrice = z.union([positiveFinancialDecimalSchema, z.null()]);
const expectedRevision = z.number().int().min(0).max(2_147_483_646);

function boundSnapshot(value: unknown, context: z.RefinementCtx): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > JOURNAL_DOCUMENT_MAXIMUM_BYTES)
    context.addIssue({
      code: 'custom',
      message: 'The complete journal snapshot must not exceed 131072 UTF-8 bytes.',
    });
}
function unique(values: string[], context: z.RefinementCtx, path: string[]): void {
  if (new Set(values).size !== values.length)
    context.addIssue({ code: 'custom', path, message: 'Entries must be unique.' });
}

export const journalInitialRiskSchema = z.strictObject({
  amount: positiveFinancialDecimalSchema,
  currencyId: id,
  method: label,
  methodNotes: narrative.default(''),
});
export const journalPlanLegSchema = z.strictObject({
  legId: id,
  plannedEntry: nullablePrice.default(null),
  plannedStop: nullablePrice.default(null),
  plannedTargets: positiveFinancialDecimalSchema.array().max(100).default([]),
  plannedQuantity: z.union([positiveFinancialDecimalSchema, z.null()]).default(null),
  estimatedCosts: z.union([nonnegativeFinancialDecimalSchema, z.null()]).default(null),
});
/** Draft plans can be incomplete. Only a server publication records a factual commitment. */
export const journalPlanDefinitionSchema = z
  .strictObject({
    strategyVersionId: nullableId.default(null),
    setupId: nullableId.default(null),
    thesis: narrative.default(''),
    marketConditions: narrative.default(''),
    timeframe: z.string().trim().max(160).default(''),
    legs: journalPlanLegSchema.array().max(20).default([]),
    initialRisk: z.union([journalInitialRiskSchema, z.null()]).default(null),
    attachmentIds: id.array().max(100).default([]),
  })
  .superRefine((value, context) => {
    boundSnapshot(value, context);
    unique(
      value.legs.map((leg) => leg.legId),
      context,
      ['legs'],
    );
    unique(value.attachmentIds, context, ['attachmentIds']);
    if (value.setupId !== null && value.strategyVersionId === null)
      context.addIssue({
        code: 'custom',
        path: ['setupId'],
        message: 'A setup requires its explicit strategy version.',
      });
  });
export const journalActualObservationSchema = z.strictObject({
  legId: id,
  actualStop: nullablePrice.default(null),
  reportedEntry: nullablePrice.default(null),
  reportedExit: nullablePrice.default(null),
  notes: narrative.default(''),
});
export const journalRuleAssessmentSchema = z.strictObject({
  checklistItemId: id,
  outcome: z.enum(['passed', 'failed', 'unknown']),
  evidence: narrative.default(''),
  source: z.literal('manual'),
});
export const journalAttachmentPhaseSchema = z.enum(['before', 'during', 'after']);
export const journalReviewAttachmentSchema = z.strictObject({
  attachmentId: id,
  phase: journalAttachmentPhaseSchema,
});
/** Subjective observations are never accepted as ledger facts or automatic rule assessments. */
export const journalReviewDefinitionSchema = z
  .strictObject({
    marketConditions: narrative.default(''),
    mistakes: labels.default([]),
    emotions: labels.default([]),
    confidence: z.union([z.number().int().min(1).max(5), z.null()]).default(null),
    executionQuality: z
      .union([z.enum(['excellent', 'good', 'mixed', 'poor']), z.null()])
      .default(null),
    lessonsLearned: narrative.default(''),
    postTradeReview: narrative.default(''),
    customNotes: narrative.default(''),
    exitReason: narrative.default(''),
    customTags: labels.default([]),
    actualObservations: journalActualObservationSchema.array().max(20).default([]),
    ruleAssessments: journalRuleAssessmentSchema.array().max(100).default([]),
    attachments: journalReviewAttachmentSchema.array().max(100).default([]),
  })
  .superRefine((value, context) => {
    boundSnapshot(value, context);
    for (const field of ['mistakes', 'emotions', 'customTags'] as const)
      unique(value[field], context, [field]);
    unique(
      value.actualObservations.map((observation) => observation.legId),
      context,
      ['actualObservations'],
    );
    unique(
      value.ruleAssessments.map((assessment) => assessment.checklistItemId),
      context,
      ['ruleAssessments'],
    );
    unique(
      value.attachments.map((attachment) => attachment.attachmentId),
      context,
      ['attachments'],
    );
  });
export const journalDocumentSchema = z
  .strictObject({
    plan: journalPlanDefinitionSchema.default(() => journalPlanDefinitionSchema.parse({})),
    review: journalReviewDefinitionSchema.default(() => journalReviewDefinitionSchema.parse({})),
  })
  .superRefine(boundSnapshot);

export const journalCreateLegSchema = z.strictObject({
  accountId: id,
  instrumentVersionId: id,
  direction: z.enum(['long', 'short']),
  label,
});
export const journalCreateSchema = z.strictObject({
  title: label,
  classification: z.enum(['active-trading', 'investing']),
  strategyVersionId: id.optional(),
  legs: journalCreateLegSchema.array().max(20).default([]),
});
export const journalSaveSchema = z.strictObject({
  expectedRevision,
  document: journalDocumentSchema,
});
export const journalPublishPlanSchema = z.strictObject({
  expectedRevision,
  expectedTradeRevision: financialRevisionSchema,
  reason,
});
export const journalRiskAdditionSchema = z.strictObject({
  expectedRevision,
  amount: positiveFinancialDecimalSchema,
  currencyId: id,
  method: label,
  methodNotes: narrative.default(''),
  reason,
});
export const journalEntryResponseSchema = z.strictObject({
  tradeId: id,
  revision: z.number().int().min(0).max(2_147_483_647),
  document: journalDocumentSchema,
  updatedAt: nullableInstant,
  updatedBy: z.union([actor, z.null()]),
});
export const journalPlanVersionResponseSchema = z.strictObject({
  id,
  tradeId: id,
  version: financialRevisionSchema,
  definition: journalPlanDefinitionSchema,
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: financialInstantSchema,
  createdBy: actor,
  changeReason: reason,
});
export const journalCommitmentResponseSchema = z.strictObject({
  originalPlanId: id,
  committedAt: financialInstantSchema,
  financialSourceRevision: financialSourceRevisionSchema,
  timing: z.enum(['pre-trade', 'retrospective']),
  createdBy: actor,
});
export const journalRiskAdditionResponseSchema = z.strictObject({
  id,
  tradeId: id,
  amount: positiveFinancialDecimalSchema,
  currencyId: id,
  method: label,
  methodNotes: narrative,
  reason,
  createdAt: financialInstantSchema,
  createdBy: actor,
});
export const journalRevisionSummarySchema = z.strictObject({
  id,
  revision: financialRevisionSchema,
  createdAt: financialInstantSchema,
  createdBy: actor,
  changeReason: reason,
});
export const journalRevisionResponseSchema = journalRevisionSummarySchema.extend({
  tradeId: id,
  document: journalDocumentSchema,
  documentHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

const calculatedMetricShape = {
  status: z.enum(['available', 'unavailable']),
  value: z.union([financialDecimalSchema, z.null()]),
  reasons: reason.array(),
  unit: metricUnit,
  currencyId: nullableId,
  source: z.literal('calculated-ledger'),
};
function validateMetric(
  value: { status: 'available' | 'unavailable'; value: string | null; reasons: string[] },
  context: z.RefinementCtx,
): void {
  if (value.status === 'available' && value.value === null)
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'An available metric requires a calculated value.',
    });
  if (value.status === 'unavailable' && (value.value !== null || value.reasons.length === 0))
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'An unavailable metric requires null and an explanation.',
    });
}
export const journalCalculatedMetricSchema = z
  .strictObject(calculatedMetricShape)
  .superRefine(validateMetric);
export const journalExecutionSummarySchema = z.strictObject({
  executionId: id,
  allocationId: id,
  sourceRevision: financialSourceRevisionSchema,
  economicAt: financialInstantSchema,
  side: z.enum(['buy', 'sell']),
  role: z.enum(['entry', 'exit']),
  quantity: positiveFinancialDecimalSchema,
  price: z.union([financialDecimalSchema, z.null()]),
  bookedPrincipal: z.union([financialDecimalSchema, z.null()]),
  principalCurrencyId: nullableId,
});
export const journalFeeSummarySchema = z.strictObject({
  feeId: id,
  currencyId: id,
  amount: financialDecimalSchema,
  chargedAt: financialInstantSchema,
  executionId: nullableId,
});
export const journalFinancialLegSchema = z.strictObject({
  legId: id,
  accountId: id,
  accountName: label,
  instrumentId: id,
  instrumentVersionId: id,
  instrumentName: label,
  quantityUnit: label,
  quoteCurrencyId: nullableId,
  settlementCurrencyId: nullableId,
  direction: z.enum(['long', 'short']),
  actualEntry: journalCalculatedMetricSchema,
  actualExit: journalCalculatedMetricSchema,
  enteredQuantity: journalCalculatedMetricSchema,
  exitedQuantity: journalCalculatedMetricSchema,
  openQuantity: journalCalculatedMetricSchema,
  realizedGross: journalCalculatedMetricSchema,
  realizedNet: journalCalculatedMetricSchema,
  costBasis: journalCalculatedMetricSchema,
  fees: journalFeeSummarySchema.array(),
  executions: journalExecutionSummarySchema.array(),
  lots: financialSchemaComponents.InventoryLot.array(),
  matches: financialSchemaComponents.InventoryMatch.array(),
});
export const journalTimelineEventSchema = z.strictObject({
  id: z.string().min(1).max(240),
  kind: z.enum(['execution', 'cash', 'fee']),
  economicAt: financialInstantSchema,
  accountId: id,
  legId: id,
  executionId: nullableId,
  feeId: nullableId,
  currencyId: nullableId,
  amount: z.union([financialDecimalSchema, z.null()]),
  quantity: z.union([financialDecimalSchema, z.null()]),
  price: z.union([financialDecimalSchema, z.null()]),
  allocationId: nullableId,
});
export const journalRMultipleSchema = z
  .strictObject({
    ...calculatedMetricShape,
    unit: z.literal('R'),
    originalPlanId: nullableId,
    definitionVersion: z.literal('original-risk-r/1'),
    financialSourceRevision: financialSourceRevisionSchema,
  })
  .superRefine((value, context) => {
    validateMetric(value, context);
    if (
      value.status === 'available' &&
      (value.originalPlanId === null || value.currencyId === null)
    )
      context.addIssue({
        code: 'custom',
        path: ['originalPlanId'],
        message: 'An available R multiple requires its original plan and risk currency.',
      });
  });
export const journalFinancialSnapshotSchema = z.strictObject({
  sourceRevision: financialSourceRevisionSchema,
  definitionVersion: z.literal('trade-journal-financial/1'),
  manifest: financialSchemaComponents.InventoryManifest,
  legs: journalFinancialLegSchema.array(),
  timeline: journalTimelineEventSchema.array(),
  rMultiple: journalRMultipleSchema,
});
export const journalDetailResponseSchema = z.strictObject({
  trade: tradeResponseSchema,
  journal: journalEntryResponseSchema,
  strategy: z.union([strategyVersionResponseSchema, z.null()]),
  originalPlan: z.union([journalPlanVersionResponseSchema, z.null()]),
  currentPlan: z.union([journalPlanVersionResponseSchema, z.null()]),
  commitment: z.union([journalCommitmentResponseSchema, z.null()]),
  financial: journalFinancialSnapshotSchema,
  recentHistory: journalRevisionSummarySchema.array().max(100),
});
export const journalListResponseSchema = z.strictObject({
  trades: tradeResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const journalPlansResponseSchema = z.strictObject({
  plans: journalPlanVersionResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const journalRevisionsResponseSchema = z.strictObject({
  revisions: journalRevisionResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const journalRiskAdditionsResponseSchema = z.strictObject({
  riskAdditions: journalRiskAdditionResponseSchema.array().max(100),
  nextCursor: nullableId,
});
const pageQuery = {
  cursor: id.optional(),
  limit: z
    .string()
    .regex(/^(?:[1-9]\d?|100)$/u)
    .default('25')
    .transform(Number),
};
export const journalActivityInstantSchema = financialInstantSchema.refine(
  (value) => !value.startsWith('0000-'),
  'Choose an activity date in year 1 or later.',
);
export const journalListQuerySchema = z
  .strictObject({
    ...pageQuery,
    includeArchived: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    status: tradeResponseSchema.shape.status.optional(),
    search: z.string().trim().min(1).max(160).optional(),
    accountId: id.optional(),
    from: journalActivityInstantSchema.optional(),
    to: journalActivityInstantSchema.optional(),
  })
  .superRefine((value, context) => {
    if ((value.from === undefined) !== (value.to === undefined))
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'Choose both activity date boundaries.',
      });
    if (
      value.from &&
      value.to &&
      journalActivityInstantSchema.safeParse(value.from).success &&
      journalActivityInstantSchema.safeParse(value.to).success &&
      journalQueryInstant(value.from) >= journalQueryInstant(value.to)
    )
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The activity end must follow its start.',
      });
  });

function journalQueryInstant(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  const offset = value.match(/(?:Z|[+-]\d{2}:\d{2})$/u)?.[0] ?? 'Z';
  const seconds = fraction ? `${whole}${offset}` : value;
  return (
    BigInt(Date.parse(seconds)) * 1000n +
    BigInt((fraction.replace(/(?:Z|[+-]\d{2}:\d{2})$/u, '') || '0').padEnd(6, '0'))
  );
}
export const journalPlansQuerySchema = z.strictObject(pageQuery);
export const journalRevisionsQuerySchema = z.strictObject(pageQuery);
export const journalRiskAdditionsQuerySchema = z.strictObject(pageQuery);

export type JournalPlanDefinition = z.infer<typeof journalPlanDefinitionSchema>;
export type JournalReviewDefinition = z.infer<typeof journalReviewDefinitionSchema>;
export type JournalDocument = z.infer<typeof journalDocumentSchema>;
export type JournalCreateInput = z.infer<typeof journalCreateSchema>;
export type JournalSaveInput = z.infer<typeof journalSaveSchema>;
export type JournalPublishPlanInput = z.infer<typeof journalPublishPlanSchema>;
export type JournalRiskAdditionInput = z.infer<typeof journalRiskAdditionSchema>;
export type JournalEntryResponse = z.infer<typeof journalEntryResponseSchema>;
export type JournalPlanVersionResponse = z.infer<typeof journalPlanVersionResponseSchema>;
export type JournalCommitmentResponse = z.infer<typeof journalCommitmentResponseSchema>;
export type JournalRiskAdditionResponse = z.infer<typeof journalRiskAdditionResponseSchema>;
export type JournalRevisionSummary = z.infer<typeof journalRevisionSummarySchema>;
export type JournalRevisionResponse = z.infer<typeof journalRevisionResponseSchema>;
export type JournalCalculatedMetric = z.infer<typeof journalCalculatedMetricSchema>;
export type JournalExecutionSummary = z.infer<typeof journalExecutionSummarySchema>;
export type JournalFeeSummary = z.infer<typeof journalFeeSummarySchema>;
export type JournalFinancialLeg = z.infer<typeof journalFinancialLegSchema>;
export type JournalTimelineEvent = z.infer<typeof journalTimelineEventSchema>;
export type JournalRMultiple = z.infer<typeof journalRMultipleSchema>;
export type JournalFinancialSnapshot = z.infer<typeof journalFinancialSnapshotSchema>;
export type JournalDetailResponse = z.infer<typeof journalDetailResponseSchema>;
export type JournalListResponse = z.infer<typeof journalListResponseSchema>;
export type JournalPlansResponse = z.infer<typeof journalPlansResponseSchema>;
export type JournalRevisionsResponse = z.infer<typeof journalRevisionsResponseSchema>;
export type JournalRiskAdditionsResponse = z.infer<typeof journalRiskAdditionsResponseSchema>;
export type JournalListQuery = z.infer<typeof journalListQuerySchema>;
export type JournalPlansQuery = z.infer<typeof journalPlansQuerySchema>;
export type JournalRevisionsQuery = z.infer<typeof journalRevisionsQuerySchema>;
export type JournalRiskAdditionsQuery = z.infer<typeof journalRiskAdditionsQuerySchema>;
export const journalSchemaComponents = {
  JournalLabel: label,
  JournalNarrative: narrative,
  JournalReason: reason,
  JournalActor: actor,
  JournalMetricUnit: metricUnit,
};
