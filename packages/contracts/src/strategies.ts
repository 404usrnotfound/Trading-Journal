import { z } from 'zod';
import {
  financialDecimalSchema,
  financialIdSchema,
  financialInstantSchema,
  financialRevisionSchema,
  tradeResponseSchema,
} from './financial.js';

const label = z.string().trim().min(1).max(160);
const narrative = z.string().max(20_000);
const reason = z.string().trim().min(1).max(2_000);
const labels = label.array().max(100);
const snapshotId = financialIdSchema.transform((value) => value.toLowerCase());
const idList = snapshotId.array().max(100);
// Explicit unions preserve null in OpenAPI references as well as in runtime validation.
const nullableId = z.union([financialIdSchema, z.null()]);
const nullableInstant = z.union([financialInstantSchema, z.null()]);
export const strategyStatusSchema = z.enum(['draft', 'active', 'paused', 'retired']);
export const strategyDirectionSchema = z.enum(['long', 'short', 'both']);

/** Compare accepted decimal text exactly; parameter validation never rounds through Number. */
function compareDecimals(left: string, right: string): number {
  const [leftWhole = '', leftFraction = ''] = left.split('.');
  const [rightWhole = '', rightFraction = ''] = right.split('.');
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const coefficient = (whole: string, fraction: string): bigint => {
    const negative = whole.startsWith('-');
    const digits = whole.replace(/^-/, '') + fraction.padEnd(scale, '0');
    return BigInt(digits) * (negative ? -1n : 1n);
  };
  const a = coefficient(leftWhole, leftFraction);
  const b = coefficient(rightWhole, rightFraction);
  return a < b ? -1 : a > b ? 1 : 0;
}

const parameterIdentity = {
  id: snapshotId,
  name: label,
  description: narrative.default(''),
};
export const strategyDecimalParameterSchema = z
  .strictObject({
    ...parameterIdentity,
    type: z.literal('decimal'),
    value: financialDecimalSchema,
    unit: z.union([label, z.null()]).default(null),
    minimum: z.union([financialDecimalSchema, z.null()]).default(null),
    maximum: z.union([financialDecimalSchema, z.null()]).default(null),
  })
  .superRefine((value, context) => {
    // Decimal's own validation reports malformed text; do not attempt BigInt on invalid input.
    if (
      !financialDecimalSchema.safeParse(value.value).success ||
      (value.minimum !== null && !financialDecimalSchema.safeParse(value.minimum).success) ||
      (value.maximum !== null && !financialDecimalSchema.safeParse(value.maximum).success)
    )
      return;
    if (
      value.minimum !== null &&
      value.maximum !== null &&
      compareDecimals(value.minimum, value.maximum) > 0
    )
      context.addIssue({ code: 'custom', path: ['maximum'], message: 'Maximum is below minimum.' });
    if (value.minimum !== null && compareDecimals(value.value, value.minimum) < 0)
      context.addIssue({ code: 'custom', path: ['value'], message: 'Value is below minimum.' });
    if (value.maximum !== null && compareDecimals(value.value, value.maximum) > 0)
      context.addIssue({ code: 'custom', path: ['value'], message: 'Value is above maximum.' });
  });
export const strategyBooleanParameterSchema = z.strictObject({
  ...parameterIdentity,
  type: z.literal('boolean'),
  value: z.boolean(),
});
export const strategyTextParameterSchema = z.strictObject({
  ...parameterIdentity,
  type: z.literal('text'),
  value: z.string().max(2_000),
});
export const strategyEnumParameterSchema = z
  .strictObject({
    ...parameterIdentity,
    type: z.literal('enum'),
    value: label,
    options: label.array().min(1).max(100),
  })
  .superRefine((value, context) => {
    if (!value.options.includes(value.value))
      context.addIssue({ code: 'custom', path: ['value'], message: 'Choose a declared option.' });
    if (new Set(value.options).size !== value.options.length)
      context.addIssue({ code: 'custom', path: ['options'], message: 'Options must be unique.' });
  });
export const strategyParameterSchema = z.discriminatedUnion('type', [
  strategyDecimalParameterSchema,
  strategyBooleanParameterSchema,
  strategyTextParameterSchema,
  strategyEnumParameterSchema,
]);
export const strategyChecklistItemSchema = z.strictObject({
  id: snapshotId,
  label,
  required: z.boolean().default(false),
});
export const strategySetupSchema = z.strictObject({
  id: snapshotId,
  name: label,
  description: narrative.default(''),
  conditions: narrative.default(''),
  checklistItemIds: idList.default([]),
});

/** Complete immutable playbook snapshot. Empty fields mean unconfigured, never invented rules. */
export const strategyDefinitionSchema = z
  .strictObject({
    name: label,
    description: narrative.default(''),
    status: strategyStatusSchema.default('draft'),
    assetClasses: labels.default([]),
    markets: labels.default([]),
    timeframes: labels.default([]),
    direction: strategyDirectionSchema.default('both'),
    setupConditions: narrative.default(''),
    entryRules: narrative.default(''),
    confirmationRules: narrative.default(''),
    invalidationRules: narrative.default(''),
    stopLossMethodology: narrative.default(''),
    takeProfitMethodology: narrative.default(''),
    riskRules: narrative.default(''),
    positionSizingRules: narrative.default(''),
    exitRules: narrative.default(''),
    indicators: labels.default([]),
    attachmentIds: idList.default([]),
    notes: narrative.default(''),
    tags: labels.default([]),
    checklist: strategyChecklistItemSchema.array().max(100).default([]),
    setups: strategySetupSchema.array().max(100).default([]),
    parameters: strategyParameterSchema.array().max(100).default([]),
    hypothesis: narrative.default(''),
    style: z.string().trim().max(160).default(''),
    sessions: labels.default([]),
    marketRegimeFilters: narrative.default(''),
    scalingRules: narrative.default(''),
    managementRules: narrative.default(''),
    reviewSchedule: narrative.default(''),
    eligibleInstruments: idList.default([]),
  })
  .superRefine((value, context) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 196_608)
      context.addIssue({
        code: 'custom',
        message: 'The complete strategy definition must not exceed 196608 UTF-8 bytes.',
      });
    for (const key of [
      'assetClasses',
      'markets',
      'timeframes',
      'indicators',
      'attachmentIds',
      'tags',
      'sessions',
      'eligibleInstruments',
    ] as const)
      if (new Set(value[key]).size !== value[key].length)
        context.addIssue({ code: 'custom', path: [key], message: 'Entries must be unique.' });
    for (const key of ['checklist', 'setups', 'parameters'] as const)
      if (new Set(value[key].map((item) => item.id)).size !== value[key].length)
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Item identities must be unique.',
        });
    const checklistIds = new Set(value.checklist.map((item) => item.id));
    value.setups.forEach((setup, index) => {
      if (new Set(setup.checklistItemIds).size !== setup.checklistItemIds.length)
        context.addIssue({
          code: 'custom',
          path: ['setups', index, 'checklistItemIds'],
          message: 'Checklist references must be unique.',
        });
      if (setup.checklistItemIds.some((id) => !checklistIds.has(id)))
        context.addIssue({
          code: 'custom',
          path: ['setups', index, 'checklistItemIds'],
          message: 'A setup can reference only this version’s checklist items.',
        });
    });
  })
  .describe(
    'Complete immutable playbook snapshot, at most 196608 UTF-8 bytes after default normalization. Numeric parameters are lossless decimal strings; narrative rules remain manually assessed.',
  );
export const strategyCreateSchema = z.strictObject({
  definition: strategyDefinitionSchema,
  effectiveAt: financialInstantSchema,
  changeReason: reason.default('Initial version'),
});
export const strategyUpdateSchema = z.strictObject({
  definition: strategyDefinitionSchema,
  effectiveAt: financialInstantSchema,
  expectedRevision: financialRevisionSchema,
  changeReason: reason,
});
export const strategyArchiveSchema = z.strictObject({
  expectedRevision: financialRevisionSchema,
  reason,
});
export const strategyTradeLinkCreateSchema = z.strictObject({
  tradeId: financialIdSchema,
  versionId: financialIdSchema,
  expectedTradeRevision: financialRevisionSchema,
  reason,
});
export const strategyVersionResponseSchema = z.strictObject({
  id: financialIdSchema,
  workspaceId: financialIdSchema,
  strategyId: financialIdSchema,
  version: financialRevisionSchema,
  effectiveAt: financialInstantSchema,
  definition: strategyDefinitionSchema,
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  changeReason: reason,
  actorId: z.string().min(1).max(128),
  createdAt: financialInstantSchema,
});
export const strategyResponseSchema = z.strictObject({
  id: financialIdSchema,
  workspaceId: financialIdSchema,
  revision: financialRevisionSchema,
  currentVersionId: financialIdSchema,
  currentVersion: strategyVersionResponseSchema,
  archivedAt: nullableInstant,
  archiveReason: z.union([reason, z.null()]),
  createdAt: financialInstantSchema,
  updatedAt: financialInstantSchema,
});
export const strategyListResponseSchema = z.strictObject({
  strategies: strategyResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const strategyVersionListResponseSchema = z.strictObject({
  versions: strategyVersionResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const strategyTradesResponseSchema = z.strictObject({
  trades: tradeResponseSchema.array().max(100),
  nextCursor: nullableId,
});
export const strategyTradeLinkResponseSchema = tradeResponseSchema;
const pageQuery = {
  cursor: financialIdSchema.optional(),
  limit: z
    .string()
    .regex(/^(?:[1-9]\d?|100)$/u)
    .default('25')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(100)),
};
export const strategyListQuerySchema = z.strictObject({
  ...pageQuery,
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  status: strategyStatusSchema.optional(),
  search: z.string().trim().min(1).max(160).optional(),
});
export const strategyVersionsQuerySchema = z.strictObject(pageQuery);
export const strategyTradesQuerySchema = z.strictObject(pageQuery);

export type StrategyDefinition = z.infer<typeof strategyDefinitionSchema>;
export type StrategyParameter = z.infer<typeof strategyParameterSchema>;
export type StrategyCreateInput = z.infer<typeof strategyCreateSchema>;
export type StrategyUpdateInput = z.infer<typeof strategyUpdateSchema>;
export type StrategyArchiveInput = z.infer<typeof strategyArchiveSchema>;
export type StrategyTradeLinkCreateInput = z.infer<typeof strategyTradeLinkCreateSchema>;
export type StrategyResponse = z.infer<typeof strategyResponseSchema>;
export type StrategyVersionResponse = z.infer<typeof strategyVersionResponseSchema>;
export type StrategyListResponse = z.infer<typeof strategyListResponseSchema>;
export type StrategyVersionListResponse = z.infer<typeof strategyVersionListResponseSchema>;
export type StrategyTradesResponse = z.infer<typeof strategyTradesResponseSchema>;
export type StrategyListQuery = z.infer<typeof strategyListQuerySchema>;
export type StrategyVersionsQuery = z.infer<typeof strategyVersionsQuerySchema>;
export type StrategyTradesQuery = z.infer<typeof strategyTradesQuerySchema>;

export const strategySchemaComponents = {
  StrategyLabel: label,
  StrategyNarrative: narrative,
  StrategyChangeReason: reason,
};
