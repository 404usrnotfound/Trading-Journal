import { authorizeWorkspace, createAnalyticsApi, withWorkspaceContext } from '@journal/server';
import { apiFailure } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handleAnalyticsRequest = createAnalyticsApi({ authorizeWorkspace, withWorkspaceContext });

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; path: string[] }> },
): Promise<Response> {
  try {
    const { workspaceId, path } = await context.params;
    return await handleAnalyticsRequest(request, workspaceId, path);
  } catch (error) {
    return apiFailure(error, 'analytics.report');
  }
}
