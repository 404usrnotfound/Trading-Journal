import {
  authorizeWorkspace,
  createAccountingApi,
  requireMutationSession,
  withWorkspaceContext,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handleAccountingRequest = createAccountingApi({
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
    return await handleAccountingRequest(request, workspaceId, path);
  } catch (error) {
    return apiFailure(error, 'accounting.request');
  }
}

export const GET = handle;
export const POST = handle;
