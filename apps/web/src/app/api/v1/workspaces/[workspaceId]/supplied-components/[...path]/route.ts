import {
  authorizeWorkspace,
  createSuppliedApi,
  requireMutationSession,
  withWorkspaceContext,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const api = createSuppliedApi({ authorizeWorkspace, requireMutationSession, withWorkspaceContext });
async function handle(
  request: Request,
  context: { params: Promise<{ workspaceId: string; path: string[] }> },
) {
  try {
    const { workspaceId, path } = await context.params;
    return await api(request, workspaceId, path);
  } catch (error) {
    return apiFailure(error, 'supplied-components.request');
  }
}
export const GET = handle;
export const POST = handle;
