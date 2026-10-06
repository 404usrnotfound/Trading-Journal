import { sessionResponseSchema } from '@journal/contracts';
import { getSafeSession } from '@journal/server';
import { apiFailure, validatedJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    return validatedJson(sessionResponseSchema, await getSafeSession(request));
  } catch (error) {
    return apiFailure(error, 'session.read');
  }
}
