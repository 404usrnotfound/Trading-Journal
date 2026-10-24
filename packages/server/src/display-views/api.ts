import { financialIdSchema } from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createDisplayViewServices } from './service.js';
export function createDisplayViewApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const views = createDisplayViewServices(platform);
  return async (request: Request, workspaceId: string, screen: string) => {
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET or POST for display preferences.',
      );
    const writing = request.method === 'POST';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      financialIdSchema.parse(workspaceId),
      'viewer',
    );
    const result = writing
      ? await views.write(context, screen, await readBoundedJson(request, 65536))
      : await views.read(context, screen);
    return Response.json(result, { headers: { 'cache-control': 'private, no-store' } });
  };
}
