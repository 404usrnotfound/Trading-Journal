import {
  financialIdSchema,
  financialMutationResponseSchema,
  suppliedComponentListResponseSchema,
} from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createSuppliedComponents } from './service.js';

export function createSuppliedApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const service = createSuppliedComponents(platform);
  return async (request: Request, workspaceId: string, path: readonly string[]) => {
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET or POST for supplied observations.',
      );
    const writing = request.method === 'POST';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      financialIdSchema.parse(workspaceId),
      writing ? 'editor' : 'viewer',
    );
    if (path.length !== 1 || path[0] !== 'observations') throw inaccessible();
    const result = writing
      ? financialMutationResponseSchema.parse(
          await service.record(
            context,
            await readBoundedJson(request, 32768),
            financialIdSchema.parse(request.headers.get('idempotency-key')),
          ),
        )
      : suppliedComponentListResponseSchema.parse(
          await service.list(context, Object.fromEntries(new URL(request.url).searchParams)),
        );
    return Response.json(result, { headers: { 'cache-control': 'private, no-store' } });
  };
}
