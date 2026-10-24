import {
  authorizeWorkspace,
  createReconciliationApi,
  requireMutationSession,
  withWorkspaceContext,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handleReconciliationRequest = createReconciliationApi({
  authorizeWorkspace,
  requireMutationSession,
  withWorkspaceContext,
});

async function handle(
  request: Request,
  context: { params: Promise<{ workspaceId: string; path: string[] }> },
): Promise<Response> {
  try {
    const { workspaceId, path } = await context.params;
    return await handleReconciliationRequest(request, workspaceId, path);
  } catch (error) {
    return apiFailure(error, 'reconciliation.command');
  }
}
export const GET = handle;
export const POST = handle;
