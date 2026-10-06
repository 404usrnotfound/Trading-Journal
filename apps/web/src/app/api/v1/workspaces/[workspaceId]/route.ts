import { workspaceResponseSchema } from '@journal/contracts';
import { getWorkspace } from '@journal/server';
import { apiFailure, validatedJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  try {
    const { workspaceId } = await context.params;
    return validatedJson(workspaceResponseSchema, await getWorkspace(request, workspaceId));
  } catch (error) {
    return apiFailure(error, 'workspace.read');
  }
}
