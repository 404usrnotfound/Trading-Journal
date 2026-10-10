import { workspaceListResponseSchema } from '@journal/contracts';
import { getWorkspaces } from '@journal/server';
import { apiFailure, validatedJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    return validatedJson(workspaceListResponseSchema, {
      workspaces: await getWorkspaces(request),
    });
  } catch (error) {
    return apiFailure(error, 'workspace.list');
  }
}
