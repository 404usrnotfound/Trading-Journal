import { sql } from '@journal/database';
import { z } from 'zod';
import { financialIdSchema } from '@journal/contracts';
import {
  riskAssessmentRequestSchema,
  riskCatalogQuerySchema,
  riskCatalogResponseSchema,
  riskSizingRequestSchema,
} from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { queryRows } from '../financial/repository.js';
import { createRiskServices } from './service.js';

export function createRiskApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const risk = createRiskServices(platform);
  return async (request: Request, workspaceId: string, path: readonly string[]) => {
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET or POST for risk resources.',
      );
    const writing = request.method === 'POST' && path[0] !== 'sizing';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      financialIdSchema.parse(workspaceId),
      writing ? 'editor' : 'viewer',
    );
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const command = () => financialIdSchema.parse(request.headers.get('idempotency-key'));
    let result: unknown;
    if (path.length === 1 && path[0] === 'policies')
      result =
        request.method === 'POST'
          ? await risk.savePolicy(context, await readBoundedJson(request, 131072), command())
          : await risk.policies(
              context,
              Object.fromEntries(
                Object.entries(
                  z
                    .strictObject({
                      after: financialIdSchema.optional(),
                      accountId: financialIdSchema.optional(),
                      strategyId: financialIdSchema.optional(),
                    })
                    .parse(query),
                ).filter(([, value]) => value !== undefined),
              ),
            );
    else if (path.length === 1 && path[0] === 'assessments' && request.method === 'POST')
      result = await risk.assess(
        context,
        riskAssessmentRequestSchema.parse(await readBoundedJson(request, 16384)),
        command(),
      );
    else if (path.length === 2 && path[0] === 'assessments' && request.method === 'GET')
      result = await risk.assessment(context, financialIdSchema.parse(path[1]));
    else if (path.length === 1 && path[0] === 'sizing' && request.method === 'POST')
      result = await risk.size(
        context,
        riskSizingRequestSchema.parse(await readBoundedJson(request, 16384)),
      );
    else if (path.length === 1 && path[0] === 'catalog' && request.method === 'GET') {
      const filter = riskCatalogQuerySchema.parse(query);
      result = await platform.withWorkspaceContext(context, async (tx) => {
        const after = filter.after ?? null,
          search = `%${(filter.search ?? '').replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
        let rows: { id: string; label: string }[];
        if (filter.collection === 'fx-observations')
          rows = await queryRows(
            tx,
            sql`SELECT o.id,b.code||'/'||q.code||' · '||o.rate_raw||' · '||o.source||' · '||o.observed_at::text AS label FROM app.fx_observations o JOIN app.currencies b ON b.workspace_id=o.workspace_id AND b.id=o.base_currency_id JOIN app.currencies q ON q.workspace_id=o.workspace_id AND q.id=o.quote_currency_id WHERE o.workspace_id=${context.workspaceId} AND (${after}::uuid IS NULL OR o.id>${after}::uuid) AND (b.code||'/'||q.code||' '||o.source) ILIKE ${search} AND NOT EXISTS(SELECT 1 FROM app.fx_observations n WHERE n.workspace_id=o.workspace_id AND n.supersedes_id=o.id) ORDER BY o.id LIMIT 51`,
          );
        else if (filter.collection === 'instruments')
          rows = await queryRows(
            tx,
            sql`SELECT v.id,i.name||' · v'||v.version||' · '||v.capability AS label FROM app.instrument_versions v JOIN app.instruments i ON i.workspace_id=v.workspace_id AND i.id=v.instrument_id WHERE v.workspace_id=${context.workspaceId} AND (${after}::uuid IS NULL OR v.id>${after}::uuid) AND i.name ILIKE ${search} ORDER BY v.id LIMIT 51`,
          );
        else if (filter.collection === 'strategy-versions')
          rows = await queryRows(
            tx,
            sql`SELECT id,definition->>'name'||' · v'||version AS label FROM app.strategy_versions WHERE workspace_id=${context.workspaceId} AND (${after}::uuid IS NULL OR id>${after}::uuid) AND definition->>'name' ILIKE ${search} ORDER BY id LIMIT 51`,
          );
        else {
          const collection = filter.collection;
          const label =
            collection === 'strategies'
              ? sql.raw(
                  "(SELECT definition->>'name' FROM app.strategy_versions v WHERE v.workspace_id=t.workspace_id AND v.strategy_id=t.id ORDER BY version DESC LIMIT 1)",
                )
              : collection === 'currencies'
                ? sql.raw("t.code||' · '||t.name")
                : sql.raw('t.name');
          rows = await queryRows(
            tx,
            sql`SELECT t.id,${label} AS label FROM ${sql.identifier('app')}.${sql.identifier(collection)} t WHERE t.workspace_id=${context.workspaceId} AND (${after}::uuid IS NULL OR t.id>${after}::uuid) AND ${label} ILIKE ${search} ORDER BY t.id LIMIT 51`,
          );
        }
        return riskCatalogResponseSchema.parse({
          items: rows.slice(0, 50),
          nextCursor: rows.length > 50 ? rows[49]!.id : null,
        });
      });
    } else throw inaccessible();
    return Response.json(result, { headers: { 'cache-control': 'private, no-store' } });
  };
}
