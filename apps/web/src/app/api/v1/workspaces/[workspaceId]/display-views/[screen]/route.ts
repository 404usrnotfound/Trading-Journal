import {
  authorizeWorkspace,
  createDisplayViewApi,
  requireMutationSession,
  withWorkspaceContext,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const api = createDisplayViewApi({
  authorizeWorkspace,
  requireMutationSession,
  withWorkspaceContext,
});
async function handle(
  request: Request,
  context: { params: Promise<{ workspaceId: string; screen: string }> },
) {
  try {
    const { workspaceId, screen } = await context.params;
    return await api(request, workspaceId, screen);
  } catch (error) {
    return apiFailure(error, 'display-views.request');
  }
}
export const GET = handle;
export const POST = handle;
