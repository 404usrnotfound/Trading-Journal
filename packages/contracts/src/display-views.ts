import { z } from 'zod';
import { financialIdSchema } from './financial.js';
const search = z.string().max(160);
const idOrEmpty = z.union([financialIdSchema, z.literal('')]);
const date = z.union([z.iso.date(), z.literal('')]);
export const displayViewScreenSchema = z.enum(['dashboard', 'journal', 'strategies']);
export const displayViewColumns = {
  dashboard: ['title', 'status', 'netPnl', 'originalR', 'coverage'],
  journal: ['title', 'status', 'classification', 'strategy', 'archived'],
  strategies: ['name', 'status', 'description', 'version', 'assetClasses'],
} as const;
export const displayViewFilters = {
  dashboard: z
    .strictObject({
      from: z.iso.date(),
      to: z.iso.date(),
      currency: idOrEmpty,
      environment: z.enum(['live', 'paper']),
      age: z.string().regex(/^\d{1,12}$/),
      portfolioVersionId: idOrEmpty,
      accountIds: z.string().max(3700),
      suppliedCampaignResultIds: z
        .string()
        .max(3700)
        .refine(
          (value) =>
            !value ||
            (value.split(',').length <= 100 &&
              value.split(',').every((id) => financialIdSchema.safeParse(id.trim()).success)),
          'Supplied result selections must be UUIDs.',
        )
        .optional(),
      brokerIds: idOrEmpty,
      strategyIds: idOrEmpty,
      strategyVersionIds: idOrEmpty,
      assetIds: idOrEmpty,
      assetClasses: search,
      tags: search,
      search,
      view: z.enum(['performance', 'distributions', 'breakdowns']),
      curve: z.enum(['equity', 'performance']),
    })
    .superRefine((v, c) => {
      if (v.from > v.to)
        c.addIssue({ code: 'custom', path: ['to'], message: 'From must be on or before Through.' });
      if (
        v.accountIds &&
        (v.accountIds.split(',').length > 100 ||
          !v.accountIds.split(',').every((id) => financialIdSchema.safeParse(id.trim()).success))
      )
        c.addIssue({
          code: 'custom',
          path: ['accountIds'],
          message: 'Account selections must be UUIDs.',
        });
    }),
  journal: z
    .strictObject({
      search,
      status: z.enum(['', 'planned', 'open', 'partially_closed', 'closed', 'canceled']),
      includeArchived: z.enum(['true', 'false']),
      period: z.enum(['all', 'today', 'week', 'custom']),
      from: date,
      to: date,
      accountId: idOrEmpty,
    })
    .superRefine((v, c) => {
      if (v.period === 'custom' && (!v.from || !v.to || v.from > v.to))
        c.addIssue({
          code: 'custom',
          path: ['to'],
          message: 'Choose an increasing custom date range.',
        });
    }),
  strategies: z.strictObject({
    search,
    status: z.enum(['', 'draft', 'active', 'paused', 'retired']),
    includeArchived: z.enum(['true', 'false']),
  }),
};
const commonView = { id: financialIdSchema, name: z.string().trim().min(1).max(80) };
function unique<T extends { columns: string[]; views: { id: string; name: string }[] }>(
  v: T,
  c: z.RefinementCtx,
) {
  if (new Set(v.columns).size !== v.columns.length)
    c.addIssue({ code: 'custom', path: ['columns'], message: 'Columns must be unique.' });
  if (
    new Set(v.views.map((x) => x.id)).size !== v.views.length ||
    new Set(v.views.map((x) => x.name.toLocaleLowerCase('en-US'))).size !== v.views.length
  )
    c.addIssue({
      code: 'custom',
      path: ['views'],
      message: 'View identities and names must be unique.',
    });
}
export const displayViewSettingsSchema = z.discriminatedUnion('screen', [
  z
    .strictObject({
      screen: z.literal('dashboard'),
      columns: z
        .enum(displayViewColumns.dashboard)
        .array()
        .min(1)
        .max(5)
        .refine((v) => v.includes('title'), 'The trade identity must stay visible.'),
      views: z
        .strictObject({ ...commonView, filters: displayViewFilters.dashboard })
        .array()
        .max(20),
    })
    .superRefine(unique),
  z
    .strictObject({
      screen: z.literal('journal'),
      columns: z
        .enum(displayViewColumns.journal)
        .array()
        .min(1)
        .max(5)
        .refine((v) => v.includes('title'), 'The trade identity must stay visible.'),
      views: z
        .strictObject({ ...commonView, filters: displayViewFilters.journal })
        .array()
        .max(20),
    })
    .superRefine(unique),
  z
    .strictObject({
      screen: z.literal('strategies'),
      columns: z
        .enum(displayViewColumns.strategies)
        .array()
        .min(1)
        .max(5)
        .refine((v) => v.includes('name'), 'The strategy identity must stay visible.'),
      views: z
        .strictObject({ ...commonView, filters: displayViewFilters.strategies })
        .array()
        .max(20),
    })
    .superRefine(unique),
]);
export const displayViewResponseSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  settings: displayViewSettingsSchema,
});
export const displayViewWriteSchema = z
  .strictObject({
    expectedRevision: z.number().int().min(0).max(2147483646),
    settings: displayViewSettingsSchema,
  })
  .superRefine((v, c) => {
    if (new TextEncoder().encode(JSON.stringify(v)).length > 65536)
      c.addIssue({ code: 'custom', message: 'Display preferences must not exceed 65536 bytes.' });
  });
export type DisplayViewScreen = z.infer<typeof displayViewScreenSchema>;
export type DisplayViewSettings = z.infer<typeof displayViewSettingsSchema>;
export type DisplayViewResponse = z.infer<typeof displayViewResponseSchema>;
export function defaultDisplayViewSettings(screen: DisplayViewScreen): DisplayViewSettings {
  return displayViewSettingsSchema.parse({
    screen,
    columns: [...displayViewColumns[screen]],
    views: [],
  });
}
