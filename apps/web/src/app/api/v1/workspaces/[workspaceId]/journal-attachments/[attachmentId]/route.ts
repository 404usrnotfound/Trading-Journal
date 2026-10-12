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
  context: { params: Promise<{ workspaceId: string; attachmentId: string }> },
): Promise<Response> {
  try {
    const { workspaceId, attachmentId } = await context.params;
    return await handleAttachments(request, workspaceId, attachmentId);
  } catch (error) {
    return apiFailure(
      error,
      request.method === 'GET' ? 'journal.attachment.read' : 'journal.attachment.command',
    );
  }
}

export const GET = handle;
export const DELETE = handle;
