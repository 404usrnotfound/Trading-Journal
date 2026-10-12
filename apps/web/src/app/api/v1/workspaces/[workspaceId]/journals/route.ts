import {
  authorizeWorkspace,
  createJournalApi,
  requireMutationSession,
  withWorkspaceContext,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handleJournalRequest = createJournalApi({
  authorizeWorkspace,
  requireMutationSession,
  withWorkspaceContext,
});

async function handle(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  try {
    const { workspaceId } = await context.params;
    return await handleJournalRequest(request, workspaceId, []);
  } catch (error) {
    return apiFailure(error, request.method === 'GET' ? 'journal.read' : 'journal.command');
  }
}

export const GET = handle;
export const POST = handle;
