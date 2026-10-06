import { z } from 'zod';

export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  service: z.enum(['web', 'worker']),
});
export const readyResponseSchema = z.strictObject({
  status: z.literal('ready'),
  database: z.literal('connected'),
  schema: z.literal('current'),
});
export const safeUserSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
});
export const sessionResponseSchema = z
  .strictObject({ user: safeUserSchema, expiresAt: z.iso.datetime({ offset: true }) })
  .nullable();
export const workspaceResponseSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  role: z.enum(['owner', 'editor', 'viewer']),
  isDemo: z.boolean(),
});
export const workspaceListResponseSchema = z.strictObject({
  workspaces: workspaceResponseSchema.array(),
});
export const signInSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export const authActionResponseSchema = z.strictObject({ ok: z.literal(true) });
export const problemResponseSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  code: z.string(),
  requestId: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
