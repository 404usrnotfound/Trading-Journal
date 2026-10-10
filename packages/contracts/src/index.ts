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
const timezoneSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/u, 'Use an IANA timezone.')
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Use an IANA timezone.');
const reportingCurrencyPreferenceSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,15}$/u)
  .nullable();
export const workspaceResponseSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  role: z.enum(['owner', 'editor', 'viewer']),
  isDemo: z.boolean(),
  timezone: timezoneSchema,
  reportingCurrency: reportingCurrencyPreferenceSchema,
  revision: z.number().int().min(1),
});
export const workspaceListResponseSchema = z.strictObject({
  workspaces: workspaceResponseSchema.array(),
});
export const workspacePreferencesUpdateSchema = z
  .strictObject({
    timezone: timezoneSchema.optional(),
    reportingCurrency: reportingCurrencyPreferenceSchema.optional(),
    expectedRevision: z.number().int().min(1),
  })
  .refine(
    (value) => value.timezone !== undefined || value.reportingCurrency !== undefined,
    'Provide at least one workspace preference.',
  );
export const signInSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});
export const revokeSessionSchema = z.strictObject({
  sessionId: z.string().min(1).max(128),
});
export const safeSessionListResponseSchema = z.strictObject({
  sessions: z
    .strictObject({
      id: z.string().min(1).max(128),
      createdAt: z.iso.datetime({ offset: true }),
      expiresAt: z.iso.datetime({ offset: true }),
      current: z.boolean(),
    })
    .array(),
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
export type WorkspacePreferencesUpdateInput = z.infer<typeof workspacePreferencesUpdateSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RevokeSessionInput = z.infer<typeof revokeSessionSchema>;
export type SafeSessionListResponse = z.infer<typeof safeSessionListResponseSchema>;
