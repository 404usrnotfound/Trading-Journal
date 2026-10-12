import {
  authorizeWorkspace,
  createJournalAttachmentApi,
  requireMutationSession,
  withWorkspaceContext,
} from '@journal/server';
import { apiFailure } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handleAttachments = createJournalAttachmentApi({
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
    return await handleAttachments(request, workspaceId);
  } catch (error) {
    return apiFailure(
      error,
      request.method === 'GET' ? 'journal.attachment.read' : 'journal.attachment.command',
    );
  }
}

export const GET = handle;
export const POST = handle;
