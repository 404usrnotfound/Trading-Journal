import { randomUUID } from 'node:crypto';
import { ApplicationError, getLogger, toProblemResponse } from '@journal/server';
import { NextResponse } from 'next/server';

type ApiOperation =
  | 'auth.request'
  | 'session.read'
  | 'workspace.list'
  | 'workspace.read'
  | 'workspace.update'
  | 'health.ready';

export function apiFailure(
  error: unknown,
  operation: ApiOperation,
  requestId: string = randomUUID(),
): Response {
  const response = toProblemResponse(error, requestId);
  const fields = {
    event: 'web.request.failed',
    operation,
    requestId,
    status: response.status,
    code:
      error instanceof ApplicationError
        ? error.code
        : response.status < 500
          ? 'INVALID_REQUEST'
          : 'INTERNAL_ERROR',
  };
  try {
    const logger = getLogger();
    if (response.status >= 500) logger.error(fields, 'API request failed');
    else logger.warn(fields, 'API request rejected');
  } catch {
    // Invalid startup configuration must still produce a safe problem response.
    // Never fall back to printing the raw error, input, headers or credentials.
  }
  return response;
}

export function validatedJson<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
): NextResponse<T> {
  return NextResponse.json(schema.parse(value), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
