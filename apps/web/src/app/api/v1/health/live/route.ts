import { healthResponseSchema } from '@journal/contracts';
import { validatedJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): Response {
  return validatedJson(healthResponseSchema, { status: 'ok', service: 'web' });
}
