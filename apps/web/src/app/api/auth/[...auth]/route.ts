import { handleAuthRequest } from '@journal/server';
import { apiFailure } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(request: Request): Promise<Response> {
  try {
    return await handleAuthRequest(request);
  } catch (error) {
    return apiFailure(error, 'auth.request');
  }
}

export { handle as GET, handle as POST };
