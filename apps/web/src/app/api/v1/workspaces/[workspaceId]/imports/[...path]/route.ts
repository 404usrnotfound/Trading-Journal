import {
  authorizeWorkspace,
  requireMutationSession,
  withWorkspaceContext,
  createImportApi,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handler = createImportApi({
  authorizeWorkspace,
  requireMutationSession,
  withWorkspaceContext,
});
async function handle(
  request: Request,
  context: { params: Promise<{ workspaceId: string; path: string[] }> },
) {
  try {
    const { workspaceId, path } = await context.params;
    return await handler(request, workspaceId, path);
  } catch (error) {
    return apiFailure(error, 'imports.command');
  }
}
export const GET = handle;
export const POST = handle;
