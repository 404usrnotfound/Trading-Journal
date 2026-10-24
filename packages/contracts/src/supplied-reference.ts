import { z } from 'zod';
/** Deliberately independent of financial.ts so it can be embedded in financial DTOs. */
export const suppliedReferenceSchema = z.strictObject({
  id: z.uuidv4(),
  kind: z.enum(['position-equity', 'campaign-net-result']),
  amount: z.string(),
  currencyId: z.uuidv4(),
  observedAt: z.string(),
  source: z.string(),
  sourceReference: z.string(),
  quality: z.enum(['broker-reported', 'manually-verified']),
  definitionVersion: z.enum(['residual-position-equity/1', 'lifetime-campaign-net-result/1']),
  basisRevision: z.string(),
  sourceRevision: z.string(),
});
export type SuppliedReference = z.infer<typeof suppliedReferenceSchema>;
