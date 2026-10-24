import { z } from 'zod';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialSourceRevisionSchema,
} from './financial.js';
const id = financialIdSchema.transform((value) => value.toLowerCase());
const label = z.string().trim().min(1).max(160);
const textList = z.string().trim().min(1).max(2000).array().max(100);
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
const micros = (value: string) =>
  BigInt(Date.parse(value.replace(/\.\d+/u, ''))) * 1000n +
  BigInt((value.match(/\.(\d+)/u)?.[1] ?? '').padEnd(6, '0'));
export const periodReviewKindSchema = z.enum([
  'daily',
  'session-preparation',
  'session-review',
  'weekly',
  'monthly',
  'custom',
]);
export const periodReviewFieldSchema = z.strictObject({
  id,
  label,
  type: z.enum(['text', 'boolean', 'decimal']),
  required: z.boolean(),
  help: z.string().max(2000),
});
export const periodReviewTemplateDefinitionSchema = z
  .strictObject({
    name: label,
    instructions: z.string().max(20000),
    status: z.enum(['active', 'archived']),
    fields: periodReviewFieldSchema.array().max(50),
  })
  .refine(
    (value) => new Set(value.fields.map((field) => field.id)).size === value.fields.length,
    'Template field identities must be unique.',
  );
export const periodReviewDefinitionSchema = z
  .strictObject({
    title: label,
    kind: periodReviewKindSchema,
    from: financialInstantSchema,
    to: financialInstantSchema,
    timezone,
    status: z.enum(['draft', 'final']),
    notes: z.string().max(20000),
    goals: textList,
    recurringMistakes: textList,
    emotions: textList,
    improvementActions: z
      .strictObject({
        id,
        text: z.string().trim().min(1).max(2000),
        status: z.enum(['open', 'done']),
      })
      .array()
      .max(100),
    templateVersionId: id.nullable(),
    answers: z
      .strictObject({ fieldId: id, value: z.union([z.string().max(20000), z.boolean()]) })
      .array()
      .max(50),
    tradeIds: id.array().max(100),
    strategyVersionIds: id.array().max(100),
  })
  .superRefine((value, context) => {
    if (
      financialInstantSchema.safeParse(value.from).success &&
      financialInstantSchema.safeParse(value.to).success &&
      micros(value.from) >= micros(value.to)
    )
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The period end must follow its start.',
      });
    for (const [path, values] of [
      ['tradeIds', value.tradeIds],
      ['strategyVersionIds', value.strategyVersionIds],
      ['answers', value.answers.map((answer) => answer.fieldId)],
      ['improvementActions', value.improvementActions.map((action) => action.id)],
    ] as const)
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', path: [path], message: 'Use each identity once.' });
    if (value.templateVersionId === null && value.answers.length)
      context.addIssue({
        code: 'custom',
        path: ['answers'],
        message: 'Custom answers require their explicit template version.',
      });
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 131072)
      context.addIssue({
        code: 'custom',
        message: 'A review snapshot must fit 131072 UTF-8 bytes.',
      });
  });
export const periodReviewWriteSchema = z.strictObject({
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  reason: z.string().trim().min(1).max(2000),
  definition: periodReviewDefinitionSchema,
});
export const periodReviewTemplateWriteSchema = z
  .strictObject({
    expectedVersion: z.number().int().min(0).max(2_147_483_646),
    reason: z.string().trim().min(1).max(2000),
    definition: periodReviewTemplateDefinitionSchema,
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 131072,
    'A template snapshot must fit 131072 UTF-8 bytes.',
  );
export const periodReviewTemplateVersionSchema = z.strictObject({
  id,
  templateId: id,
  version: z.number().int().positive(),
  actorId: z.string(),
  createdAt: financialInstantSchema,
  reason: z.string(),
  definition: periodReviewTemplateDefinitionSchema,
});
export const periodReviewVersionSchema = z.strictObject({
  id,
  entryId: id,
  version: z.number().int().positive(),
  actorId: z.string(),
  createdAt: financialInstantSchema,
  reason: z.string(),
  definition: periodReviewDefinitionSchema,
  template: periodReviewTemplateVersionSchema.nullable(),
});
export const periodReviewListSchema = z.strictObject({
  entries: periodReviewVersionSchema.array(),
  nextCursor: id.nullable(),
});
export const periodReviewTemplateListSchema = z.strictObject({
  templates: periodReviewTemplateVersionSchema.array(),
  nextCursor: id.nullable(),
});
export const periodReviewHistorySchema = z.strictObject({
  versions: periodReviewVersionSchema.array(),
  nextCursor: id.nullable(),
});
export const periodReviewListQuerySchema = z.strictObject({
  after: id.optional(),
  kind: periodReviewKindSchema.optional(),
  search: z.string().trim().max(160).optional(),
  status: z.enum(['draft', 'final']).optional(),
});
export const periodReviewCatalogQuerySchema = z.strictObject({
  collection: z.enum(['trades', 'strategy-versions']),
  after: id.optional(),
  search: z.string().trim().max(160).optional(),
});
export const periodReviewCatalogSchema = z.strictObject({
  items: z.strictObject({ id, label: z.string().min(1).max(2000) }).array(),
  nextCursor: id.nullable(),
});
export const periodReviewSummarySchema = z.strictObject({
  entryVersionId: id,
  sourceRevision: financialSourceRevisionSchema,
  generatedAt: financialInstantSchema,
  linkedTradeCount: z.number().int().nonnegative(),
  reviewedTradeCount: z.number().int().nonnegative(),
  statusCounts: z.record(z.string(), z.number().int().nonnegative()),
  missingTradeReviewIds: id.array(),
  recurringMistakes: z
    .strictObject({ label: z.string(), count: z.number().int().positive() })
    .array(),
  openActionCount: z.number().int().nonnegative(),
  goalCount: z.number().int().nonnegative(),
  sourceRecords: z
    .strictObject({ tradeId: id, journalRevisionId: id.nullable(), status: z.string() })
    .array(),
  explanation: z.string(),
});
export function validatePeriodReviewAnswers(
  definition: z.infer<typeof periodReviewDefinitionSchema>,
  template: z.infer<typeof periodReviewTemplateDefinitionSchema> | null,
): void {
  if (!template) {
    if (definition.templateVersionId !== null) throw new Error('The pinned template is missing.');
    return;
  }
  for (const answer of definition.answers) {
    const field = template.fields.find((item) => item.id === answer.fieldId);
    if (!field) throw new Error('An answer does not belong to the pinned template.');
    if (
      field.type === 'boolean'
        ? typeof answer.value !== 'boolean'
        : typeof answer.value !== 'string'
    )
      throw new Error(`The ${field.label} answer has the wrong type.`);
    if (
      field.type === 'decimal' &&
      answer.value !== '' &&
      !financialDecimalSchema.safeParse(answer.value).success
    )
      throw new Error(`The ${field.label} answer requires exact decimal text.`);
  }
  if (definition.status === 'final')
    for (const field of template.fields.filter((item) => item.required)) {
      const answer = definition.answers.find((item) => item.fieldId === field.id);
      if (!answer || (typeof answer.value === 'string' && !answer.value.trim()))
        throw new Error(`Complete the required ${field.label} field before finalizing.`);
    }
}
export type PeriodReviewDefinition = z.infer<typeof periodReviewDefinitionSchema>;
export type PeriodReviewVersion = z.infer<typeof periodReviewVersionSchema>;
export type PeriodReviewTemplateVersion = z.infer<typeof periodReviewTemplateVersionSchema>;
