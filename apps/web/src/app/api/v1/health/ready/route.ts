import { readyResponseSchema } from '@journal/contracts';
import {
  ApplicationError,
  getSafeSession,
  unauthenticated,
  verifyReadiness,
} from '@journal/server';
import { apiFailure, validatedJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    let session;
    try {
      session = await getSafeSession(request);
    } catch (error) {
      if (error instanceof ApplicationError && (error.status === 401 || error.status === 403)) {
        throw error;
      }
      // Authentication is itself a database dependency. Do not expose diagnostics
      // or report an auth outage as a healthy process/internal application error.
      throw new ApplicationError(
        503,
        'NOT_READY',
        'Service unavailable',
        'The service is not ready.',
      );
    }
    if (!session) throw unauthenticated();
    return validatedJson(readyResponseSchema, await verifyReadiness());
  } catch (error) {
    return apiFailure(error, 'health.ready', requestId);
  }
}
