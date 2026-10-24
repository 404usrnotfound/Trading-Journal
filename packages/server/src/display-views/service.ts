import { isDeepStrictEqual } from 'node:util';
import { sql } from 'drizzle-orm';
import {
  defaultDisplayViewSettings,
  displayViewResponseSchema,
  displayViewScreenSchema,
  displayViewWriteSchema,
} from '../../../contracts/src/display-views.js';
import type { AuthorizationContext, ServerServices } from '../services.js';
import { ApplicationError } from '../errors.js';
type Platform = Pick<ServerServices, 'withWorkspaceContext'>;
export function createDisplayViewServices(platform: Platform) {
  async function read(context: AuthorizationContext, screenInput: unknown) {
    const screen = displayViewScreenSchema.parse(screenInput);
    return platform.withWorkspaceContext(context, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT view_revision,saved_views FROM app.user_preferences WHERE workspace_id=${context.workspaceId} AND user_id=${context.actorId}`,
      );
      const row = rows.rows[0] as
        { view_revision: number; saved_views: Record<string, unknown> } | undefined;
      return displayViewResponseSchema.parse({
        revision: row?.view_revision ?? 0,
        settings: row?.saved_views[screen] ?? defaultDisplayViewSettings(screen),
      });
    });
  }
  async function write(context: AuthorizationContext, screenInput: unknown, input: unknown) {
    const screen = displayViewScreenSchema.parse(screenInput),
      body = displayViewWriteSchema.parse(input);
    if (body.settings.screen !== screen)
      throw new ApplicationError(
        422,
        'INVALID_INPUT',
        'Invalid screen',
        'The saved view screen must match its route.',
      );
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${context.workspaceId}),hashtext(${context.actorId}))`,
        );
        const result = await tx.execute(
          sql`SELECT view_revision,saved_views FROM app.user_preferences WHERE workspace_id=${context.workspaceId} AND user_id=${context.actorId} FOR UPDATE`,
        );
        const row = result.rows[0] as
          { view_revision: number; saved_views: Record<string, unknown> } | undefined;
        const revision = row?.view_revision ?? 0,
          current = row?.saved_views ?? {};
        if (revision !== body.expectedRevision) {
          if (isDeepStrictEqual(current[screen], body.settings))
            return displayViewResponseSchema.parse({ revision, settings: body.settings });
          throw new ApplicationError(
            409,
            'REVISION_CONFLICT',
            'Preferences changed',
            'Your display preferences changed elsewhere. Reload before saving again.',
          );
        }
        const settings = { ...current, [screen]: body.settings },
          next = revision + 1;
        await tx.execute(
          sql`INSERT INTO app.user_preferences(workspace_id,user_id,saved_views,view_revision) VALUES(${context.workspaceId},${context.actorId},${JSON.stringify(settings)}::jsonb,${next}) ON CONFLICT(workspace_id,user_id) DO UPDATE SET saved_views=excluded.saved_views,view_revision=excluded.view_revision,updated_at=clock_timestamp()`,
        );
        await tx.execute(
          sql`INSERT INTO app.audit_events(workspace_id,actor_id,action) VALUES(${context.workspaceId},${context.actorId},'member.display-views-updated')`,
        );
        return displayViewResponseSchema.parse({ revision: next, settings: body.settings });
      },
      { isolationLevel: 'read committed' },
    );
  }
  return { read, write };
}
