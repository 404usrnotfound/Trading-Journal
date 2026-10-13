import { z } from 'zod';
import * as financial from './financial.js';
import * as accounting from './accounting.js';

export const IMPORT_LIMITS = {
  fileBytes: 2_097_152,
  rows: 1000,
  columns: 64,
  fieldBytes: 16_384,
  commitRows: 100,
} as const;
const label = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\u0000-\u001f]/u.test(value));
const path = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z][a-zA-Z0-9]*(?:\.(?:[a-zA-Z][a-zA-Z0-9]*|\d+))*$/u)
  .refine(
    (value) =>
      !value.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part)),
  );
export const importKinds = [
  'cash_movement',
  'execution',
  'fee',
  'fx_conversion',
  'opening_lot',
  'instrument',
  'order',
  'price',
  'fx_rate',
  'account_valuation',
  'income',
  'tax',
  'expense',
  'execution_cash',
] as const;
export const importKindSchema = z.enum(importKinds);
export type ImportKind = z.infer<typeof importKindSchema>;
// Broker parsers produce this neutral envelope. Ledger DTO validation follows reference resolution.
export const canonicalImportDraftSchema = z.strictObject({
  sourceKey: label,
  sourceId: label.optional(),
  groupKey: label,
  kind: importKindSchema,
  payload: z.record(z.string(), financial.financialJsonSchema),
  warnings: z.string().max(500).array().max(64).default([]),
});
export type CanonicalImportDraft = z.infer<typeof canonicalImportDraftSchema>;
export const canonicalImportPayloadSchemas = {
  cash_movement: financial.cashMovementCreateSchema.extend({
    cashBucketId: financial.financialIdSchema.optional(),
  }),
  execution: financial.executionCreateSchema,
  fee: financial.feeCreateSchema.extend({ cashBucketId: financial.financialIdSchema.optional() }),
  fx_conversion: financial.fxConversionCreateSchema,
  opening_lot: financial.openingLotCreateSchema,
  instrument: financial.instrumentCreateSchema,
  order: financial.orderCreateSchema,
  price: financial.priceObservationCreateSchema,
  fx_rate: financial.fxObservationCreateSchema,
  account_valuation: financial.accountValuationObservationCreateSchema,
  income: accounting.recordIncomeRequestSchema.extend({
    cashBucketId: financial.financialIdSchema.optional(),
  }),
  tax: accounting.recordTaxRequestSchema.extend({
    cashBucketId: financial.financialIdSchema.optional(),
  }),
  expense: accounting.recordExpenseRequestSchema.extend({
    cashBucketId: financial.financialIdSchema.optional(),
  }),
  execution_cash: z.strictObject({
    executionSourceId: label,
    currencyId: financial.financialIdSchema,
    amount: financial.financialDecimalSchema,
    scope: z.enum(['principal', 'fees', 'net']),
    economicAt: financial.financialInstantSchema,
  }),
} as const;
export const csvConventionsSchema = z
  .strictObject({
    delimiter: z.enum([',', ';', '\t', '|']).default(','),
    decimalSeparator: z.enum(['.', ',']).default('.'),
    thousandsSeparator: z.enum(['none', '.', ',', ' ']).default('none'),
    dateFormat: z.enum(['iso', 'ymd', 'dmy', 'mdy']).default('iso'),
    timezone: z
      .string()
      .max(100)
      .default('UTC')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Choose an IANA timezone.'),
  })
  .refine(
    (value) => value.thousandsSeparator !== value.decimalSeparator,
    'Decimal and grouping separators must differ.',
  );
export const importFieldMappingSchema = z
  .strictObject({
    kinds: importKindSchema.array().max(14).optional(),
    target: path,
    column: label.optional(),
    constant: financial.financialJsonSchema.optional(),
    transform: z
      .enum(['text', 'decimal', 'negate_decimal', 'instant', 'boolean', 'json', 'reference'])
      .default('text'),
    values: z.record(z.string(), z.string().max(160)).optional(),
    empty: z.enum(['omit', 'null', 'error']).default('omit'),
  })
  .refine(
    (value) => (value.column !== undefined) !== (value.constant !== undefined),
    'Choose a column or a constant.',
  );
export const importMappingSchema = z
  .strictObject({
    version: z.literal('canonical-import/1').default('canonical-import/1'),
    adapterId: label.default('generic-csv'),
    adapterVersion: label.default('1'),
    conventions: csvConventionsSchema.default({
      delimiter: ',',
      decimalSeparator: '.',
      thousandsSeparator: 'none',
      dateFormat: 'iso',
      timezone: 'UTC',
    }),
    kind: importKindSchema,
    kindColumn: label.optional(),
    kindValues: z.record(z.string(), importKindSchema).optional(),
    sourceIdColumn: label.optional(),
    groupColumn: label.optional(),
    sourceKeyColumn: label.optional(),
    fields: importFieldMappingSchema
      .array()
      .max(64)
      .refine(
        (fields) => new Set(fields.map((field) => field.target)).size === fields.length,
        'Targets must be unique.',
      ),
  })
  .refine(
    (value) => value.adapterId !== 'generic-csv' || value.fields.length > 0,
    'Universal CSV mappings need at least one field.',
  );
export type ImportMapping = z.infer<typeof importMappingSchema>;
export const importTemplateCreateSchema = z.strictObject({
  name: label,
  mapping: importMappingSchema,
  archived: z.boolean().default(false),
  expectedVersion: z.number().int().nonnegative().optional(),
});
export const importStageSchema = z
  .strictObject({
    accountId: financial.financialIdSchema,
    namespace: label,
    filename: label,
    content: z.string().min(1).max(IMPORT_LIMITS.fileBytes),
    templateVersionId: financial.financialIdSchema.optional(),
    mapping: importMappingSchema.optional(),
  })
  .refine(
    (value) => (value.mapping !== undefined) !== (value.templateVersionId !== undefined),
    'Choose a saved template or a mapping.',
  );
const groupKeys = label
  .array()
  .min(1)
  .max(100)
  .refine((value) => new Set(value).size === value.length);
export const importPreviewRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  groups: groupKeys,
  corrections: z.record(financial.financialIdSchema, label).default({}),
});
export const importCommitRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  previewId: financial.financialIdSchema,
  acceptWarnings: z.boolean().default(false),
});
export const importReverseRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  reason: label,
});
export const importIssueSchema = z.strictObject({
  code: label,
  message: z.string().max(2000),
  field: z.string().max(160).optional(),
});
export const importRowResponseSchema = z.strictObject({
  id: financial.financialIdSchema,
  rowNumber: z.number().int().positive(),
  groupKey: label,
  sourceKey: label,
  sourceId: label.nullable(),
  kind: importKindSchema.nullable(),
  raw: z.record(z.string(), z.string()),
  payload: z.record(z.string(), financial.financialJsonSchema).nullable(),
  errors: importIssueSchema.array(),
  warnings: z.string().array(),
  status: z.enum([
    'ready',
    'invalid',
    'ambiguous',
    'new',
    'duplicate',
    'correction',
    'reconciled',
    'committed',
    'reversed',
  ]),
  result: financial.financialJsonSchema.nullable(),
});
export const importPreviewResponseSchema = z.strictObject({
  id: financial.financialIdSchema,
  batchRevision: z.number().int().positive(),
  sourceRevision: financial.financialSourceRevisionSchema,
  groups: groupKeys,
  committable: z.boolean(),
  rows: importRowResponseSchema.array().max(100),
  corrections: z.record(financial.financialIdSchema, label),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;
export type ImportRowResponse = z.infer<typeof importRowResponseSchema>;
export const importBatchResponseSchema = z.strictObject({
  id: financial.financialIdSchema,
  accountId: financial.financialIdSchema,
  namespace: label,
  filename: label,
  fileHash: z.string().length(64),
  adapterId: label,
  adapterVersion: label,
  revision: z.number().int().positive(),
  state: z.enum(['staged', 'partial', 'committed', 'reversed']),
  rowCount: z.number().int().nonnegative().max(1000),
  createdAt: financial.financialInstantSchema,
  preview: importPreviewResponseSchema.nullable(),
});
export const importBatchDetailSchema = z.strictObject({
  batch: importBatchResponseSchema,
  rows: importRowResponseSchema.array().max(50),
  nextCursor: z.number().int().positive().nullable(),
  groups: z
    .strictObject({
      key: label,
      rows: z.number().int().positive(),
      invalid: z.number().int().nonnegative(),
      committed: z.number().int().nonnegative(),
    })
    .array()
    .max(1000),
  history: z
    .strictObject({
      id: financial.financialIdSchema,
      action: label,
      createdAt: financial.financialInstantSchema,
      actorId: z.string(),
      details: financial.financialJsonSchema,
    })
    .array()
    .max(100),
});
export const importHistoryResponseSchema = z.strictObject({
  items: importBatchResponseSchema.array().max(50),
  nextCursor: financial.financialIdSchema.nullable(),
});
export const importTemplateResponseSchema = z.strictObject({
  id: financial.financialIdSchema,
  templateId: financial.financialIdSchema,
  name: label,
  version: z.number().int().positive(),
  mapping: importMappingSchema,
  archived: z.boolean(),
});
export const importTemplatesResponseSchema = z.strictObject({
  items: importTemplateResponseSchema.array().max(100),
});
export const importCatalogResponseSchema = z.strictObject({
  accounts: z
    .strictObject({
      id: financial.financialIdSchema,
      name: z.string(),
      namespace: z.string().nullable(),
    })
    .array()
    .max(500),
  currencies: z
    .strictObject({ id: financial.financialIdSchema, name: z.string(), code: z.string() })
    .array()
    .max(500),
  instruments: z
    .strictObject({
      id: financial.financialIdSchema,
      name: z.string(),
      versionId: financial.financialIdSchema,
    })
    .array()
    .max(500),
  adapters: z.strictObject({ id: label, version: label, name: label }).array().max(100),
});

export type ImportBatchResponse = z.infer<typeof importBatchResponseSchema>;
export type ImportTemplateResponse = z.infer<typeof importTemplateResponseSchema>;
export type ImportCatalogResponse = z.infer<typeof importCatalogResponseSchema>;
export type ImportBatchDetail = z.infer<typeof importBatchDetailSchema>;
