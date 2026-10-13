import { authorizeWorkspace, withWorkspaceContext, createDashboardApi } from '@journal/server';
import { apiFailure } from '@/lib/api-response';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handler = createDashboardApi({ authorizeWorkspace, withWorkspaceContext });
async function handle(
  request: Request,
  context: { params: Promise<{ workspaceId: string; path: string[] }> },
) {
  try {
    const { workspaceId, path } = await context.params;
    return await handler(request, workspaceId, path);
  } catch (error) {
    return apiFailure(error, 'dashboard.query');
  }
}
export const GET = handle;
export const POST = handle;
