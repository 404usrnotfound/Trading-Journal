import { dashboardRequestSchema, financialIdSchema } from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createDashboardServices } from './service.js';
export function createDashboardApi(
  platform: Pick<ServerServices, 'authorizeWorkspace' | 'withWorkspaceContext'>,
) {
  const service = createDashboardServices(platform);
  return async (request: Request, workspaceId: string, path: readonly string[]) => {
    const context = await platform.authorizeWorkspace(
      request,
      financialIdSchema.parse(workspaceId).toLowerCase(),
      'viewer',
    );
    let result: unknown;
    if (path.length !== 1) throw inaccessible();
    if (path[0] === 'catalog' && request.method === 'GET') result = await service.catalog(context);
    else if (path[0] === 'reports' && request.method === 'POST')
      result = await service.report(
        context,
        dashboardRequestSchema.parse(await readBoundedJson(request, 262_144)),
      );
    else if (['catalog', 'reports'].includes(path[0]!))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use the documented dashboard query method.',
      );
    else throw inaccessible();
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}
