import {
  authorizeWorkspace,
  createFinancialApi,
  requireMutationSession,
  withWorkspaceContext,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handleFinancialRequest = createFinancialApi({
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
    return await handleFinancialRequest(request, workspaceId, path);
  } catch (error) {
    return apiFailure(error, request.method === 'GET' ? 'financial.read' : 'financial.command');
  }
}

export const GET = handle;
export const POST = handle;
