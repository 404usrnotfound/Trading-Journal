import { z } from 'zod';
import {
  financialIdSchema,
  financialInstantSchema,
  financialSourceRevisionSchema,
} from './financial.js';

const derivedDecimal = z
  .string()
  .max(512)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u);
const quantity = z.strictObject({
  status: z.enum(['available', 'unavailable', 'unsupported']),
  value: derivedDecimal.nullable(),
  currencyId: z.string().optional(),
  reasons: z.string().array(),
});
export const nativeFinancialSnapshotSchema = z.strictObject({
  version: z.literal('native-financial-snapshot/1'),
  sourceRevision: financialSourceRevisionSchema,
  economicScope: z.literal('all-recorded-events'),
  capturedAt: financialInstantSchema,
  cash: z
    .strictObject({
      cashBucketId: financialIdSchema,
      accountId: financialIdSchema,
      currencyId: financialIdSchema,
      category: z.enum(['settled', 'unsettled', 'restricted', 'collateral_cash']),
      amount: derivedDecimal,
    })
    .array()
    .max(2000),
  holdings: z
    .strictObject({
      holdingBookId: financialIdSchema,
      accountId: financialIdSchema,
      instrumentId: financialIdSchema,
      instrumentVersionId: financialIdSchema.nullable(),
      quantityUnit: z.string().nullable(),
      settlementCurrencyId: financialIdSchema.nullable(),
      quantity: quantity.nullable(),
      inventoryStatus: z.enum(['available', 'unavailable', 'unsupported']).nullable(),
      inventorySourceRevision: financialSourceRevisionSchema,
    })
    .array()
    .max(2000),
});
export const nativeSnapshotStatusSchema = z.strictObject({
  state: z.enum(['current', 'stale', 'pending', 'empty', 'unavailable']),
  latestSourceRevision: financialSourceRevisionSchema,
  processedSourceRevision: financialSourceRevisionSchema,
  jobStatus: z.enum(['idle', 'leased', 'retry', 'failed', 'blocked']).nullable(),
  attempts: z.number().int().min(0).max(5),
  lastErrorCode: z
    .enum(['scope-too-large', 'processing-failed', 'stale-source', 'owner-unavailable'])
    .nullable(),
  snapshot: nativeFinancialSnapshotSchema.nullable(),
});
export const nativeSnapshotRefreshRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});
export type NativeFinancialSnapshot = z.infer<typeof nativeFinancialSnapshotSchema>;
