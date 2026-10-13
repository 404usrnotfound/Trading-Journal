import {
  analyticsReportRequestSchema,
  analyticsReportResponseSchema,
  financialIdSchema,
} from '@journal/contracts';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import type { ServerServices } from '../services.js';
import { createAnalyticsServices } from './service.js';

/** Read-only analytics: current viewers can query; no command, audit or revision is written. */
export function createAnalyticsApi(
  platform: Pick<ServerServices, 'authorizeWorkspace' | 'withWorkspaceContext'>,
) {
  const analytics = createAnalyticsServices(platform);
  return async function handleAnalyticsRequest(
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> {
    if (request.method !== 'POST')
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use POST for a bounded analytics query.',
      );
    const context = await platform.authorizeWorkspace(
      request,
      financialIdSchema.parse(workspaceId).toLowerCase(),
      'viewer',
    );
    if (path.length !== 1 || path[0] !== 'reports') throw inaccessible();
    const input = analyticsReportRequestSchema.parse(await readBoundedJson(request, 262_144));
    const output = analyticsReportResponseSchema.parse(await analytics.report(context, input));
    return new Response(JSON.stringify(output), {
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}
