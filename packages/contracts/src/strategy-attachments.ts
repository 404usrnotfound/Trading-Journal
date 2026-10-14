import { z } from 'zod';

export const STRATEGY_ATTACHMENT_MAXIMUM_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_IMAGE_MAXIMUM_DIMENSION = 8192;
export const ATTACHMENT_IMAGE_MAXIMUM_PIXELS = 16 * 1024 * 1024;
export const strategyAttachmentMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);
export const strategyAttachmentNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (name) => !/[\u0000-\u001f\u007f/\\]/u.test(name) && name !== '.' && name !== '..',
    'Use a display filename without paths or control characters.',
  );
export const strategyAttachmentResponseSchema = z.strictObject({
  id: z.uuidv4(),
  workspaceId: z.uuidv4(),
  name: strategyAttachmentNameSchema,
  mediaType: strategyAttachmentMediaTypeSchema,
  size: z.number().int().min(1).max(STRATEGY_ATTACHMENT_MAXIMUM_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.iso.datetime({ offset: true }),
});
export const strategyAttachmentListResponseSchema = strategyAttachmentResponseSchema.array();
export const strategyAttachmentListQuerySchema = z.strictObject({
  limit: z
    .string()
    .regex(/^(?:[1-9][0-9]?|100)$/u)
    .default('100')
    .transform(Number),
});
export type StrategyAttachment = z.infer<typeof strategyAttachmentResponseSchema>;
export type StrategyAttachmentMediaType = z.infer<typeof strategyAttachmentMediaTypeSchema>;
