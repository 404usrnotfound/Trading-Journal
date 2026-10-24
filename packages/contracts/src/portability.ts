import { z } from 'zod';
import { analyticsReportRequestSchema } from './analytics.js';
import { financialIdSchema, financialInstantSchema, financialJsonSchema } from './financial.js';

export const PORTABLE_FORMAT = 'journal-workspace/1' as const;
export const PORTABLE_MAXIMUM_BYTES = 64 * 1024 * 1024;
export const PORTABLE_MAXIMUM_ROWS = 100_000;
export const portableChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const portableRowSchema = z.record(z.string(), financialJsonSchema);
export const portableArchiveSchema = z.strictObject({
  format: z.literal(PORTABLE_FORMAT),
  schemaVersion: z.number().int().positive(),
  calculationManifest: z.record(z.string(), z.string()),
  sourceWorkspace: z.strictObject({
    id: financialIdSchema,
    name: z.string().min(1).max(120),
    timezone: z.string().min(1).max(128),
    reportingCurrency: z.string().nullable(),
    createdAt: z.string(),
  }),
  exportedAt: financialInstantSchema,
  tables: z
    .array(
      z.strictObject({
        name: z
          .string()
          .regex(/^[a-z][a-z0-9_]*$/u)
          .max(80),
        rows: portableRowSchema.array().max(PORTABLE_MAXIMUM_ROWS),
        sha256: portableChecksumSchema,
      }),
    )
    .max(100),
  media: z
    .array(
      z.strictObject({
        objectId: financialIdSchema,
        size: z
          .number()
          .int()
          .min(1)
          .max(10 * 1024 * 1024),
        sha256: portableChecksumSchema,
        contentBase64: z.string().max(14 * 1024 * 1024),
      }),
    )
    .max(4096),
  verification: financialJsonSchema,
  sha256: portableChecksumSchema,
});
export const portableRestoreRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  archive: portableArchiveSchema,
});
export const portableRestoreResponseSchema = z.strictObject({
  workspaceId: financialIdSchema,
  name: z.string(),
  sourceWorkspaceId: financialIdSchema,
  archiveSha256: portableChecksumSchema,
  verified: z.literal(true),
});
export const portableExportRequestSchema = z
  .strictObject({
    kind: z.enum(['trades', 'executions', 'cash', 'strategies', 'reviews', 'analytics']),
    format: z.enum(['json', 'csv']),
    accountIds: financialIdSchema.array().max(100).optional(),
    ids: financialIdSchema.array().max(1000).optional(),
    from: financialInstantSchema.optional(),
    to: financialInstantSchema.optional(),
    analytics: analyticsReportRequestSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'analytics' && !value.analytics)
      context.addIssue({
        code: 'custom',
        path: ['analytics'],
        message: 'Select the complete analytics calculation context.',
      });
    if (value.kind !== 'analytics' && value.analytics)
      context.addIssue({
        code: 'custom',
        path: ['analytics'],
        message: 'Analytics context applies to analytics exports only.',
      });
    if (value.from && value.to && Date.parse(value.from) >= Date.parse(value.to))
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Choose an end after the opening boundary.',
      });
  });
export type PortableArchive = z.infer<typeof portableArchiveSchema>;
export type PortableExportRequest = z.infer<typeof portableExportRequestSchema>;
