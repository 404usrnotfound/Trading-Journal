import { z } from 'zod';
import {
  financialIdSchema,
  periodReviewCatalogQuerySchema,
  periodReviewCatalogSchema,
} from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createPeriodReviewServices } from './service.js';
export function createPeriodReviewApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const reviews = createPeriodReviewServices(platform);
  return async (request: Request, workspaceId: string, path: readonly string[]) => {
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET or POST for period reviews.',
      );
    const writing = request.method === 'POST';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      financialIdSchema.parse(workspaceId),
      writing ? 'editor' : 'viewer',
    );
    const query = Object.fromEntries(new URL(request.url).searchParams),
      after = () => z.strictObject({ after: financialIdSchema.optional() }).parse(query).after;
    const command = () => financialIdSchema.parse(request.headers.get('idempotency-key'));
    const body = () => readBoundedJson(request, 262144);
    let result: unknown;
    if (path.length === 1 && path[0] === 'entries')
      result = writing
        ? await reviews.saveEntry(context, null, await body(), command())
        : await reviews.entries(context, query);
    else if (path.length === 2 && path[0] === 'entries')
      result = writing
        ? await reviews.saveEntry(
            context,
            financialIdSchema.parse(path[1]),
            await body(),
            command(),
          )
        : await reviews.entry(context, financialIdSchema.parse(path[1]));
    else if (path.length === 3 && path[0] === 'entries' && path[2] === 'history' && !writing)
      result = await reviews.history(context, financialIdSchema.parse(path[1]), after());
    else if (path.length === 3 && path[0] === 'entries' && path[2] === 'summary' && !writing)
      result = await reviews.summary(context, financialIdSchema.parse(path[1]));
    else if (path.length === 1 && path[0] === 'templates')
      result = writing
        ? await reviews.saveTemplate(context, null, await body(), command())
        : await reviews.templates(context, after());
    else if (path.length === 2 && path[0] === 'templates' && writing)
      result = await reviews.saveTemplate(
        context,
        financialIdSchema.parse(path[1]),
        await body(),
        command(),
      );
    else if (path.length === 1 && path[0] === 'catalog' && !writing) {
      const q = periodReviewCatalogQuerySchema.parse(query);
      result = periodReviewCatalogSchema.parse(
        await reviews.catalog(context, q.collection, q.after, q.search),
      );
    } else throw inaccessible();
    return Response.json(result, { headers: { 'cache-control': 'private, no-store' } });
  };
}
