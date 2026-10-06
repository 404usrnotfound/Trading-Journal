import { readyResponseSchema } from '@journal/contracts';
import { getSafeSession, unauthenticated, verifyReadiness } from '@journal/server';
import { apiFailure, validatedJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    if (!(await getSafeSession(request))) throw unauthenticated();
    return validatedJson(readyResponseSchema, await verifyReadiness());
  } catch (error) {
    return apiFailure(error, 'health.ready', requestId);
  }
}
